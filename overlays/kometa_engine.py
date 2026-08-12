"""Kometa-parity overlay engine.

One pass per item: detect every enabled family's winning variant (exact Kometa
ladders in kometa_detect), composite ALL winners onto the original poster in a
single pass (kometa_render), stamp with Kometa's EXIF marker, and track
everything in one unified log (kometa_overlaid_log.json) with one true-original
backup per item — movies included — enabling per-item and bulk revert.
"""

from __future__ import annotations

import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

from PIL import Image

from kometa_detect import KometaDetector, Winner
from kometa_render import compose_poster, has_overlay_marker, save_with_marker

ProgressFn = Callable[[str], None]

LEGACY_MODES = ("media", "status", "ratings", "network")

# family -> config-scope mode (sections / allow / deny keys)
FAMILY_SCOPE = {
    "resolution": "media",
    "edition": "media",
    "audio_codec": "media",
    "video_format": "media",
    "aspect": "media",
    "versions": "media",
    "language_count": "media",
    "languages": "media",
    "runtimes": "media",
    "direct_play": "media",
    "episode_info": "media",
    "content_rating": "media",
    "status": "status",
    "ratings": "ratings",
    "network": "network",
    "streaming": "streaming",
    "ribbon": "ribbon",
    "mediastinger": "media",
    "custom_collection": "custom_collection",
}


def _progress(progress: ProgressFn | None, message: str) -> None:
    if progress:
        progress(message)


def _as_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _cfg(config: dict, camel: str, snake: str, default=None):
    if config.get(camel) is not None:
        return config.get(camel)
    if config.get(snake) is not None:
        return config.get(snake)
    return default


def _load_log(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save_log(path: Path, log: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(log, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def kometa_log_path(paths: dict) -> Path:
    explicit = paths.get("kometaLog")
    if explicit:
        return Path(explicit)
    return Path(paths["root"]) / "kometa_overlaid_log.json"


def _backup_dir(paths: dict, rating_key: str) -> Path:
    return Path(paths["backups"]) / "kometa" / str(rating_key)


def _backup_file(paths: dict, rating_key: str) -> Path:
    return _backup_dir(paths, rating_key) / "poster.png"


def _clear_backup(paths: dict, rating_key: str) -> None:
    folder = _backup_dir(paths, rating_key)
    if not folder.exists():
        return
    for child in folder.iterdir():
        try:
            child.unlink()
        except Exception:
            pass
    try:
        folder.rmdir()
    except Exception:
        pass


def enabled_families(config: dict) -> list[str]:
    families: list[str] = []
    if _as_bool(_cfg(config, "mediaInfoEnabled", "media_info_enabled"), False):
        families.append("resolution")
    if _as_bool(_cfg(config, "editionOverlayEnabled", "edition_overlay_enabled"), False):
        families.append("edition")
    if _as_bool(_cfg(config, "audioCodecEnabled", "audio_codec_enabled"), False):
        families.append("audio_codec")
    if _as_bool(_cfg(config, "videoFormatEnabled", "video_format_enabled"), False):
        families.append("video_format")
    if _as_bool(_cfg(config, "aspectOverlayEnabled", "aspect_overlay_enabled"), False):
        families.append("aspect")
    if _as_bool(_cfg(config, "versionsOverlayEnabled", "versions_overlay_enabled"), False):
        families.append("versions")
    if _as_bool(_cfg(config, "languageCountEnabled", "language_count_enabled"), False):
        families.append("language_count")
    if _as_bool(_cfg(config, "languagesOverlayEnabled", "languages_overlay_enabled"), False):
        families.append("languages")
    if _as_bool(_cfg(config, "runtimesOverlayEnabled", "runtimes_overlay_enabled"), False):
        families.append("runtimes")
    if _as_bool(_cfg(config, "directPlayOverlayEnabled", "direct_play_overlay_enabled"), False):
        families.append("direct_play")
    if _as_bool(_cfg(config, "episodeInfoOverlayEnabled", "episode_info_overlay_enabled"), False):
        families.append("episode_info")
    if _as_bool(_cfg(config, "contentRatingEnabled", "content_rating_enabled"), False):
        families.append("content_rating")
    if _as_bool(_cfg(config, "statusOverlayEnabled", "status_overlay_enabled"), False):
        families.append("status")
    if _as_bool(_cfg(config, "ratingsOverlayEnabled", "ratings_overlay_enabled"), False):
        families.append("ratings")
    if _as_bool(_cfg(config, "networkOverlayEnabled", "network_overlay_enabled"), False):
        families.append("network")
    if _as_bool(_cfg(config, "streamingOverlayEnabled", "streaming_overlay_enabled"), False):
        families.append("streaming")
    if _as_bool(_cfg(config, "ribbonOverlayEnabled", "ribbon_overlay_enabled"), False):
        families.append("ribbon")
    if _as_bool(_cfg(config, "mediastingerOverlayEnabled", "mediastinger_overlay_enabled"), False):
        families.append("mediastinger")
    if _as_bool(_cfg(config, "customCollectionOverlaysEnabled", "custom_collection_overlays_enabled"), False):
        rules = _cfg(config, "customCollectionOverlays", "custom_collection_overlays", []) or []
        if isinstance(rules, list) and any(
            str((r or {}).get("collectionRatingKey") or (r or {}).get("collection_rating_key") or "").strip()
            and str((r or {}).get("image") or "").strip()
            for r in rules
            if isinstance(r, dict)
        ):
            families.append("custom_collection")
    return families


def _custom_collection_rules(config: dict) -> list[dict]:
    raw = _cfg(config, "customCollectionOverlays", "custom_collection_overlays", []) or []
    if not isinstance(raw, list):
        return []
    out: list[dict] = []
    seen: set[str] = set()
    for row in raw:
        if not isinstance(row, dict):
            continue
        collection_key = str(row.get("collectionRatingKey") or row.get("collection_rating_key") or "").strip()
        image = str(row.get("image") or row.get("presetId") or row.get("preset_id") or "").strip()
        if not collection_key or not image:
            continue
        rule_id = str(row.get("id") or "").strip() or f"rule-{collection_key}"
        if rule_id in seen:
            continue
        seen.add(rule_id)
        out.append({
            "id": rule_id,
            "name": str(row.get("name") or row.get("title") or "").strip() or rule_id,
            "collectionRatingKey": collection_key,
            "collectionTitle": str(row.get("collectionTitle") or row.get("collection_title") or "").strip(),
            "library": str(row.get("library") or "").strip(),
            "image": image,
        })
    return out


def _resolve_collection_member_keys(plex, collection_rating_key: str, progress: ProgressFn | None = None) -> set[str]:
    key = str(collection_rating_key or "").strip()
    if not key:
        return set()
    try:
        coll = plex.fetchItem(int(key))
    except Exception as exc:
        _progress(progress, f"Collection {key}: fetch failed ({exc})")
        return set()
    members: set[str] = set()
    try:
        for item in (coll.items() or []):
            rk = str(getattr(item, "ratingKey", "") or "").strip()
            if rk:
                members.add(rk)
    except Exception as exc:
        _progress(progress, f"Collection {key}: items() failed ({exc})")
        return set()
    return members


def _resolve_custom_preset_path(paths: dict, image_id: str) -> Path | None:
    name = str(image_id or "").strip()
    if not name:
        return None
    if name.lower().endswith(".png"):
        candidate = Path(name)
        if candidate.is_file():
            return candidate
        name = name[:-4]
    custom_dir = Path(paths.get("customPresets") or "")
    hit = custom_dir / f"{name}.png"
    if hit.is_file():
        return hit
    assets = Path(paths.get("assets") or "")
    bundled = assets / f"{name}.png"
    if bundled.is_file():
        return bundled
    return None


def _apply_custom_collection_winners(
    plex,
    config: dict,
    paths: dict,
    should: dict[str, dict],
    *,
    progress: ProgressFn | None = None,
    errors: list[str] | None = None,
) -> None:
    """Inject custom_collection winners from live Plex membership (first matching rule wins)."""
    rules = _custom_collection_rules(config)
    if not rules:
        return
    # ratingKey -> first matching rule + resolved image path
    member_rule: dict[str, tuple[dict, Path]] = {}
    for rule in rules:
        members = _resolve_collection_member_keys(plex, rule["collectionRatingKey"], progress)
        _progress(
            progress,
            f"Collection badge '{rule.get('name') or rule['id']}': {len(members)} member(s)",
        )
        image_path = _resolve_custom_preset_path(paths, rule["image"])
        if image_path is None:
            msg = f"custom_collection {rule['id']}: image not found ({rule['image']})"
            if errors is not None:
                errors.append(msg)
            _progress(progress, msg)
            continue
        for rk in members:
            if rk not in member_rule:
                member_rule[rk] = (rule, image_path)

    for rk, (rule, image_path) in member_rule.items():
        winner = Winner(
            family="custom_collection",
            name=str(rule["id"]),
            key=str(rule["image"]),
            text=str(rule.get("name") or rule["id"]),
            image_rel=str(image_path),
            extra={
                "ruleId": rule["id"],
                "collectionRatingKey": rule["collectionRatingKey"],
                "collectionTitle": rule.get("collectionTitle") or "",
            },
        )
        row = should.get(rk)
        if row is None:
            try:
                item = plex.fetchItem(int(rk))
            except Exception as exc:
                if errors is not None:
                    errors.append(f"custom_collection fetch {rk}: {exc}")
                continue
            item_type = str(getattr(item, "type", "") or "").lower()
            if item_type == "episode":
                continue  # collection badges are for show/movie posters
            library = ""
            try:
                library = str(getattr(item, "librarySectionTitle", "") or "")
            except Exception:
                library = ""
            row = {
                "item": item,
                "library": library,
                "itemType": item_type,
                "winners": {},
            }
            should[rk] = row
        if "custom_collection" not in row["winners"]:
            row["winners"]["custom_collection"] = winner


# ---------------------------------------------------------------------------
# Legacy per-mode log migration (media/status/ratings/network → unified)
# ---------------------------------------------------------------------------


def migrate_legacy_logs(paths: dict, progress: ProgressFn | None = None) -> int:
    """Merge the four per-mode logs + backups into the unified kometa log.

    The media pass ran first historically, so its backup is the true original;
    later mode backups contain already-badged art and are discarded.
    """
    log_path = kometa_log_path(paths)
    unified = _load_log(log_path)
    migrated = 0
    for mode in LEGACY_MODES:
        legacy_path = Path(paths["root"]) / f"{mode}_log.json"
        legacy = _load_log(legacy_path)
        if not legacy:
            continue
        for key, entry in legacy.items():
            if not isinstance(entry, dict):
                continue
            row = unified.get(key) or {
                "title": entry.get("title") or key,
                "library": entry.get("library") or "",
                "itemType": entry.get("itemType") or "",
                "families": {},
                "signature": "",
            }
            modes = set(row.get("legacyModes") or [])
            modes.add(mode)
            row["legacyModes"] = sorted(modes)
            row["needsRestamp"] = True
            row["preview_only"] = bool(entry.get("preview_only")) and bool(row.get("preview_only", True))
            unified[key] = row
            migrated += 1

            legacy_backup = Path(paths["backups"]) / mode / str(key) / "show.png"
            new_backup = _backup_file(paths, key)
            if legacy_backup.exists():
                if not new_backup.exists():
                    new_backup.parent.mkdir(parents=True, exist_ok=True)
                    try:
                        shutil.move(str(legacy_backup), str(new_backup))
                    except Exception:
                        pass
                else:
                    try:
                        legacy_backup.unlink()
                    except Exception:
                        pass
                try:
                    legacy_backup.parent.rmdir()
                except Exception:
                    pass
        try:
            legacy_path.rename(legacy_path.with_suffix(".json.migrated"))
        except Exception:
            try:
                legacy_path.unlink()
            except Exception:
                pass
    if migrated:
        _save_log(log_path, unified)
        _progress(progress, f"Migrated {migrated} legacy Kometa-mode log entries into the unified log")
    return migrated


# ---------------------------------------------------------------------------
# Detection helpers for the Plex-data families (status/ratings/network)
# ---------------------------------------------------------------------------


def _rating_slot(score: float | None, source: str, *, minimum: float) -> dict | None:
    from kometa_detect import RATING_SOURCE_IMAGES

    if score is None or score < minimum:
        return None
    images = RATING_SOURCE_IMAGES.get(source) or ("TMDb", "TMDb")
    fresh, rotten = images
    image = fresh if score >= 6.0 else rotten
    return {"source": source, "image": image, "label": f"{score:.1f}", "score": score}


def _detect_ratings(item, config: dict, *, tmdb=None) -> Winner | None:
    """Build up to three rating badges (audience / critic / configured source)."""
    minimum = float(_cfg(config, "ratingsMinimum", "ratings_minimum", 0) or 0)
    source = str(_cfg(config, "ratingsSource", "ratings_source", "tmdb") or "tmdb").strip().lower()
    slots: list[dict] = []

    audience = None
    critic = None
    try:
        audience = float(getattr(item, "audienceRating", None)) if getattr(item, "audienceRating", None) is not None else None
    except (TypeError, ValueError):
        audience = None
    try:
        critic = float(getattr(item, "rating", None)) if getattr(item, "rating", None) is not None else None
    except (TypeError, ValueError):
        critic = None

    for score, key in ((audience, "audience"), (critic, "critic")):
        slot = _rating_slot(score, key, minimum=minimum)
        if slot:
            slots.append(slot)

    if source == "tmdb" and tmdb is not None and getattr(tmdb, "enabled", False):
        is_movie = str(getattr(item, "type", "") or "").lower() == "movie"
        tmdb_score = tmdb.vote_average(item, is_movie=is_movie)
        slot = _rating_slot(tmdb_score, "tmdb", minimum=minimum)
        if slot:
            slots.append(slot)
    elif source not in {"audience", "critic", "tmdb"}:
        # Prefer the explicitly configured source when it maps to a Plex field we already have.
        if source in {"user"}:
            try:
                user = float(getattr(item, "userRating", None)) if getattr(item, "userRating", None) is not None else None
            except (TypeError, ValueError):
                user = None
            slot = _rating_slot(user, "user", minimum=minimum)
            if slot:
                slots.append(slot)

    if not slots:
        # Fallback: single best Plex score (legacy behavior)
        from modes_kometa import _rating_value

        score = _rating_value(item)
        slot = _rating_slot(score, source if source in {"audience", "critic", "user", "tmdb", "imdb", "rt"} else "tmdb", minimum=minimum)
        if slot:
            slots.append(slot)
    if not slots:
        return None
    primary = slots[0]
    return Winner(
        family="ratings",
        name=primary["label"],
        key=primary["source"],
        text=primary["label"],
        weight=int(primary["score"] * 10),
        extra={"slots": slots[:3]},
    )


def _detect_network(item, config: dict) -> Winner | None:
    from modes_kometa import _network_label

    if str(getattr(item, "type", "") or "").lower() != "show":
        return None
    label = _network_label(item)
    if not label:
        return None
    return Winner(family="network", name=label, key=label.lower(), text=label)


def _resolution_variant_allowed(config: dict) -> Callable[[str, str], bool]:
    """Map the existing mediaInfoParts toggles onto Kometa's use_<key> switches."""
    from modes_kometa import _media_parts_config

    parts = _media_parts_config(config)

    def allowed(res_key: str, alt: str) -> bool:
        if res_key == "4k" and not parts.get("res4k", True):
            return False
        if res_key == "1080p" and not parts.get("res1080p", True):
            return False
        if res_key == "720p" and not parts.get("res720p", True):
            return False
        if res_key in {"576p", "480p", ""} and not parts.get("resOther", False):
            return False
        if alt in {"dv", "dvhdr", "dvhdrplus"} and not parts.get("dolbyVision", True):
            return False
        if alt in {"hdr", "hlg", "plus"} and not parts.get("hdr", True):
            return False
        return True

    return allowed


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------


def _signature(winners: dict[str, Winner], config: dict) -> str:
    parts = []
    for family, winner in sorted(winners.items()):
        part = f"{family}:{winner.name}"
        if family == "custom_collection" and winner.key:
            part = f"{part}:{winner.key}"
        parts.append(part)
    style = [
        f"audiostyle={_cfg(config, 'audioCodecStyle', 'audio_codec_style', 'compact')}",
        f"ratingsrc={_cfg(config, 'ratingsSource', 'ratings_source', 'tmdb')}",
        f"region={str(_cfg(config, 'streamingRegion', 'streaming_region', 'US') or 'US').upper()}",
        f"ribbon={_cfg(config, 'ribbonStyle', 'ribbon_style', 'yellow')}",
        f"cr={_cfg(config, 'contentRatingScheme', 'content_rating_scheme', 'us')}",
        f"flags={_cfg(config, 'kometaFlagStyle', 'kometa_flag_style', 'round')}",
    ]
    return "|".join(parts + style)


def _sanitize(name: str) -> str:
    from core import _sanitize_filename

    return _sanitize_filename(name)


def _download_original(plex, item) -> Image.Image | None:
    from core import _download_poster

    return _download_poster(plex, getattr(item, "thumb", None) or "")


def _add_overlay_label(item) -> None:
    try:
        item.addLabel("Overlay")
    except Exception:
        pass


def _remove_overlay_label(item) -> None:
    try:
        item.removeLabel("Overlay")
    except Exception:
        pass


def _normalize_label_name(value: object) -> str:
    return str(value or "").strip()


def _winner_label_names(winners: dict) -> list[str]:
    """Plex Labels for stamped overlays — e.g. 4K-HDR, TrueHD-Atmos."""
    names: list[str] = []
    seen: set[str] = set()
    for winner in winners.values():
        label = _normalize_label_name(getattr(winner, "name", None) or getattr(winner, "text", None))
        if not label:
            continue
        key = label.casefold()
        if key in seen:
            continue
        seen.add(key)
        names.append(label)
    return names


def _sync_plex_labels(item, wanted: list[str], previous: list[str] | None = None) -> list[str]:
    """Add/remove Plex Labels so the item matches the current overlay set."""
    want = [_normalize_label_name(name) for name in wanted]
    want = [name for name in want if name]
    prev = [_normalize_label_name(name) for name in (previous or [])]
    prev = [name for name in prev if name]

    want_keys = {name.casefold() for name in want}
    prev_keys = {name.casefold() for name in prev}

    for name in prev:
        if name.casefold() in want_keys:
            continue
        try:
            item.removeLabel(name)
        except Exception:
            pass

    for name in want:
        if name.casefold() in prev_keys:
            continue
        try:
            item.addLabel(name)
        except Exception:
            pass

    return want


def _restore_item(plex, paths: dict, key: str, entry: dict, progress: ProgressFn | None) -> bool:
    """Kometa restore priority: disk backup, else fresh provider poster."""
    from core import _reset_poster

    try:
        item = plex.fetchItem(f"/library/metadata/{key}")
    except Exception:
        _clear_backup(paths, key)
        return False
    backup = _backup_file(paths, key)
    ok = False
    if backup.exists():
        try:
            item.uploadPoster(filepath=str(backup))
            ok = True
            _progress(progress, f"Restored original poster: {entry.get('title') or key}")
        except Exception as exc:
            _progress(progress, f"Backup restore failed for {key}: {exc}")
    if not ok:
        ok = _reset_poster(item)
        if ok:
            _progress(progress, f"Reset poster to provider art: {entry.get('title') or key}")
    overlay_labels = entry.get("overlayLabels") if isinstance(entry.get("overlayLabels"), list) else []
    if overlay_labels:
        _sync_plex_labels(item, [], previous=overlay_labels)
    if bool(entry.get("labeled")):
        _remove_overlay_label(item)
    _clear_backup(paths, key)
    return ok


def _collect_section_plans(plex, config: dict) -> dict[str, dict]:
    """section_id -> {section, families: set} across all enabled family scopes."""
    from modes_kometa import _sections_for_kometa_mode

    families = enabled_families(config)
    plans: dict[str, dict] = {}
    seen_modes: dict[str, list] = {}
    for family in families:
        if family == "custom_collection":
            # Membership is resolved via collection.items() — not a library section scan.
            continue
        mode = FAMILY_SCOPE[family]
        if mode not in seen_modes:
            seen_modes[mode] = list(_sections_for_kometa_mode(plex, config, mode))
        for section in seen_modes[mode]:
            sid = str(getattr(section, "key", "") or "").rstrip("/").split("/")[-1]
            plan = plans.setdefault(sid, {"section": section, "families": set()})
            stype = str(getattr(section, "type", "") or "").lower()
            if family == "edition" and stype != "movie":
                continue
            if family in {"status", "network"} and stype != "show":
                continue
            if family == "episode_info" and stype != "show":
                continue
            if family == "mediastinger" and stype != "movie":
                continue
            if family in {"aspect", "language_count", "languages"} and stype != "movie":
                continue
            plan["families"].add(family)
    return plans


def _iter_section_items(section, families: set[str]):
    """Yield items to stamp. Episode_info pulls episodes; everything else uses section.all()."""
    stype = str(getattr(section, "type", "") or "").lower()
    if "episode_info" in families and stype == "show" and families <= {"episode_info"}:
        try:
            yield from section.search(libtype="episode")
        except Exception:
            try:
                for show in section.all():
                    yield from (show.episodes() or [])
            except Exception:
                return
        return
    try:
        items = list(section.all())
    except Exception:
        items = []
    for item in items:
        yield item
    if "episode_info" in families and stype == "show":
        # Also stamp episode art when episode_info is enabled alongside show families.
        try:
            for ep in section.search(libtype="episode"):
                yield ep
        except Exception:
            pass


def _detect_family_winner(
    family: str,
    item,
    section,
    *,
    detector: KometaDetector,
    config: dict,
    res_allowed,
    tmdb,
    lists,
    airing_days: int,
    streaming_region: str,
) -> Winner | None:
    if family == "resolution":
        return detector.detect_resolution(item, section, variant_allowed=res_allowed)
    if family == "edition":
        return detector.detect_edition(item, section)
    if family == "audio_codec":
        return detector.detect_audio_codec(item, section)
    if family == "video_format":
        return detector.detect_video_format(item, section)
    if family == "aspect":
        return detector.detect_aspect(item, section)
    if family == "versions":
        return detector.detect_versions(item, section)
    if family == "language_count":
        return detector.detect_language_count(item, section)
    if family == "languages":
        wanted = _cfg(config, "languagesAllowCodes", "languages_allow_codes", []) or []
        if isinstance(wanted, str):
            wanted = [x.strip() for x in wanted.split(",") if x.strip()]
        return detector.detect_languages(item, section, wanted=list(wanted))
    if family == "runtimes":
        return detector.detect_runtimes(item, section)
    if family == "direct_play":
        return detector.detect_direct_play(item, section)
    if family == "episode_info":
        return detector.detect_episode_info(item, section)
    if family == "content_rating":
        scheme = str(_cfg(config, "contentRatingScheme", "content_rating_scheme", "us") or "us")
        return detector.detect_content_rating(item, section, scheme=scheme)
    if family == "status":
        return detector.detect_status(item, section, tmdb=tmdb, airing_days=airing_days)
    if family == "ratings":
        return _detect_ratings(item, config, tmdb=tmdb)
    if family == "network":
        return _detect_network(item, config)
    if family == "streaming":
        return detector.detect_streaming(item, section, tmdb=tmdb, region=streaming_region)
    if family == "ribbon":
        style = str(_cfg(config, "ribbonStyle", "ribbon_style", "yellow") or "yellow")
        return detector.detect_ribbon(item, section, lists=lists, tmdb=tmdb, style=style)
    if family == "mediastinger":
        return detector.detect_mediastinger(item, section, tmdb=tmdb)
    return None


def run_kometa_parity(plex, config: dict, paths: dict, preview_mode: bool, progress: ProgressFn | None = None) -> dict:
    from core import _has_kometa_overlay_label, _title_allowed
    from modes_kometa import _mode_allow_deny

    log_path = kometa_log_path(paths)
    migrate_legacy_logs(paths, progress)
    log = _load_log(log_path)

    families = enabled_families(config)
    skip_kometa = _as_bool(_cfg(config, "skipIfKometaOverlayLabel", "skip_if_kometa_overlay_label"), True)
    add_label = _as_bool(_cfg(config, "kometaAddOverlayLabel", "kometa_add_overlay_label"), False)

    added = removed = skipped = 0
    errors: list[str] = []
    family_counts: dict[str, int] = {}

    if not families:
        # Everything off — prune all tracked stamps.
        if log:
            _progress(progress, "Kometa overlays disabled — restoring tracked posters…")
        for key in list(log.keys()):
            entry = log.get(key) or {}
            try:
                if preview_mode:
                    if bool(entry.get("preview_only")):
                        del log[key]
                        removed += 1
                    continue
                _restore_item(plex, paths, key, entry, progress)
                del log[key]
                removed += 1
            except Exception as exc:
                errors.append(f"kometa remove {key}: {exc}")
        _save_log(log_path, log)
        return {
            "kometaEnabled": False,
            "kometaAdded": 0,
            "kometaRemoved": removed,
            "kometaTotal": len(log),
            "kometaErrors": errors,
        }

    _progress(progress, f"Kometa parity pass — families: {', '.join(families)}")
    detector = KometaDetector(plex, progress=progress)
    res_allowed = _resolution_variant_allowed(config)
    allow_deny = {
        mode: _mode_allow_deny(config, mode)
        for mode in ("media", "status", "ratings", "network", "streaming", "ribbon")
    }
    airing_days = int(_cfg(config, "statusAiringDays", "status_airing_days", 14) or 14)
    streaming_region = str(_cfg(config, "streamingRegion", "streaming_region", "US") or "US").strip().upper() or "US"

    tmdb = None
    need_tmdb = {"status", "streaming", "ratings", "ribbon", "mediastinger"} & set(families)
    if need_tmdb:
        from kometa_external import create_kometa_tmdb

        tmdb = create_kometa_tmdb(config, paths, progress)
        if not tmdb.enabled:
            if "streaming" in families:
                _progress(progress, "Streaming overlays need a TMDB API key — skipping that family")
                families = [f for f in families if f != "streaming"]
            if "mediastinger" in families:
                _progress(progress, "MediaStinger overlays need a TMDB API key — skipping that family")
                families = [f for f in families if f != "mediastinger"]
            if "status" in families:
                _progress(progress, "No TMDB API key — status falls back to Plex series status")

    lists = None
    if "ribbon" in families:
        from kometa_lists import KometaLists

        lists = KometaLists(Path(paths["root"]) / "cache", progress=progress)

    plans = _collect_section_plans(plex, config)
    should: dict[str, dict] = {}
    scanned = 0

    for sid, plan in plans.items():
        section = plan["section"]
        section_families = plan["families"]
        if not section_families:
            continue
        _progress(progress, f"Kometa scan: {getattr(section, 'title', sid)} ({', '.join(sorted(section_families))})…")
        for item in _iter_section_items(section, section_families):
            scanned += 1
            if scanned % 50 == 0:
                _progress(progress, f"Kometa scan: checked {scanned} titles, eligible {len(should)}…")
            key = str(getattr(item, "ratingKey", "") or "")
            if not key:
                continue
            if skip_kometa and key not in log and _has_kometa_overlay_label(item):
                continue  # managed by a real Kometa install — leave alone
            item_type = str(getattr(item, "type", "") or "").lower()
            row = should.get(key) or {
                "item": item,
                "library": getattr(section, "title", ""),
                "itemType": item_type,
                "winners": {},
            }
            for family in section_families:
                # Episode items only get episode_info (+ optional media families that work on episodes).
                if item_type == "episode" and family != "episode_info":
                    continue
                if item_type != "episode" and family == "episode_info":
                    continue
                allow, deny = allow_deny.get(FAMILY_SCOPE[family], ([], []))
                if not _title_allowed(key, allow, deny):
                    continue
                if family in row["winners"]:
                    continue
                try:
                    winner = _detect_family_winner(
                        family,
                        item,
                        section,
                        detector=detector,
                        config=config,
                        res_allowed=res_allowed,
                        tmdb=tmdb,
                        lists=lists,
                        airing_days=airing_days,
                        streaming_region=streaming_region,
                    )
                    if winner is not None:
                        row["winners"][family] = winner
                except Exception as exc:
                    errors.append(f"{family} {getattr(item, 'title', key)}: {exc}")
            if row["winners"]:
                should[key] = row

    if "custom_collection" in families:
        _progress(progress, "Resolving custom collection badge membership…")
        _apply_custom_collection_winners(
            plex,
            config,
            paths,
            should,
            progress=progress,
            errors=errors,
        )

    _progress(progress, f"Kometa eligible: {len(should)} of {scanned} scanned")

    # Stamp
    for key, row in sorted(should.items(), key=lambda kv: kv[0]):
        item = row["item"]
        winners: dict[str, Winner] = row["winners"]
        existing = log.get(key)
        sig = _signature(winners, config)
        try:
            wanted_labels = _winner_label_names(winners)
            if (
                existing
                and not preview_mode
                and not bool(existing.get("preview_only"))
                and not bool(existing.get("needsRestamp"))
                and existing.get("signature") == sig
            ):
                # Already stamped — still backfill / refresh Plex Labels when missing or drifted.
                prev_labels = existing.get("overlayLabels") if isinstance(existing.get("overlayLabels"), list) else None
                if prev_labels is None or sorted(prev_labels) != sorted(wanted_labels):
                    try:
                        synced = _sync_plex_labels(item, wanted_labels, previous=prev_labels or [])
                        existing = {**existing, "overlayLabels": synced}
                        log[key] = existing
                    except Exception as exc:
                        errors.append(f"kometa labels {getattr(item, 'title', key)}: {exc}")
                skipped += 1
                continue

            backup = _backup_file(paths, key)
            if backup.exists():
                original = Image.open(backup).convert("RGBA")
            else:
                poster = _download_original(plex, item)
                if poster is None:
                    raise RuntimeError("failed to download poster")
                original = poster.convert("RGBA")
                if has_overlay_marker(poster) and existing is None:
                    _progress(
                        progress,
                        f"Skipping {getattr(item, 'title', key)} — poster already carries an overlay marker and no backup exists",
                    )
                    continue
                if not preview_mode:
                    backup.parent.mkdir(parents=True, exist_ok=True)
                    original.save(backup)
                    _progress(progress, f"Backed up original: {getattr(item, 'title', key)}")

            result = compose_poster(original, winners, config=config, paths=paths)
            safe = _sanitize(f"{getattr(item, 'title', key)}_kometa")
            entry = {
                "title": getattr(item, "title", key),
                "library": row.get("library") or "",
                "itemType": row.get("itemType") or "",
                "timestamp": datetime.now().isoformat(),
                "preview_only": bool(preview_mode),
                "signature": sig,
                "families": {family: winner.as_log() for family, winner in winners.items()},
                "hasBackup": backup.exists(),
                "labeled": bool(existing.get("labeled")) if isinstance(existing, dict) else False,
                "overlayLabels": (
                    list(existing.get("overlayLabels") or [])
                    if isinstance(existing, dict) and isinstance(existing.get("overlayLabels"), list)
                    else []
                ),
            }
            if preview_mode:
                out = Path(paths["preview"]) / f"{safe}.png"
                result.save(out)
                entry["previewShow"] = str(out)
                _progress(progress, f"[Preview] kometa: {entry['title']} ({', '.join(w.name for w in winners.values())})")
            else:
                temp = Path(paths["preview"]) / f"temp_{safe}.png"
                save_with_marker(result, temp)
                try:
                    item.uploadPoster(filepath=str(temp))
                finally:
                    if temp.exists():
                        temp.unlink()
                prev_labels = (
                    list(existing.get("overlayLabels") or [])
                    if isinstance(existing, dict) and isinstance(existing.get("overlayLabels"), list)
                    else []
                )
                entry["overlayLabels"] = _sync_plex_labels(item, wanted_labels, previous=prev_labels)
                if add_label:
                    _add_overlay_label(item)
                    entry["labeled"] = True
                entry["preview_only"] = False
                _progress(progress, f"Stamped kometa: {entry['title']} ({', '.join(w.name for w in winners.values())})")
            merged = {**(existing or {}), **entry}
            merged.pop("needsRestamp", None)
            merged.pop("legacyModes", None)
            log[key] = merged
            added += 1
            for family in winners:
                family_counts[family] = family_counts.get(family, 0) + 1
        except Exception as exc:
            errors.append(f"kometa {getattr(item, 'title', key)}: {exc}")

    # Prune entries no longer eligible
    for key in list(log.keys()):
        if key in should:
            continue
        entry = log.get(key) or {}
        try:
            if preview_mode:
                if bool(entry.get("preview_only")):
                    del log[key]
                    removed += 1
                continue
            _restore_item(plex, paths, key, entry, progress)
            del log[key]
            removed += 1
        except Exception as exc:
            errors.append(f"kometa remove {key}: {exc}")

    if tmdb is not None:
        tmdb.save()

    _save_log(log_path, log)
    summary = {
        "kometaEnabled": True,
        "kometaFamilies": families,
        "kometaAdded": added,
        "kometaSkipped": skipped,
        "kometaRemoved": removed,
        "kometaTotal": len(log),
        "kometaEligible": len(should),
        "kometaFamilyCounts": family_counts,
        "kometaErrors": errors,
    }
    _progress(
        progress,
        f"Kometa parity done — +{added}/-{removed} (skipped {skipped}, tracked {len(log)})",
    )
    return summary


# ---------------------------------------------------------------------------
# Revert
# ---------------------------------------------------------------------------


def revert_kometa(config: dict, rating_key: str | None = None, progress: ProgressFn | None = None) -> dict:
    """Per-item or bulk revert of every Kometa-parity overlay."""
    from core import _connect, _resolve_paths

    paths = _resolve_paths(config)
    migrate_legacy_logs(paths, progress)
    plex = _connect(config)
    log_path = kometa_log_path(paths)
    log = _load_log(log_path)

    if rating_key:
        keys = [str(rating_key).strip()]
    else:
        keys = list(log.keys())

    _progress(progress, f"Reverting {len(keys)} Kometa overlay(s)…")
    reverted = 0
    failed: list[str] = []
    for key in keys:
        entry = log.get(key) or {}
        try:
            ok = _restore_item(plex, paths, key, entry, progress)
            if key in log:
                del log[key]
            if ok:
                reverted += 1
            else:
                failed.append(f"{entry.get('title') or key}: restore failed")
        except Exception as exc:
            failed.append(f"{entry.get('title') or key}: {exc}")
    _save_log(log_path, log)
    _progress(progress, f"Kometa revert complete — {reverted}/{len(keys)} restored")
    return {
        "ok": True,
        "requested": len(keys),
        "reverted": reverted,
        "failed": failed,
        "remaining": len(log),
        "finishedAt": datetime.now().isoformat(),
    }


def list_kometa_tracked(paths: dict) -> list[dict]:
    log = _load_log(kometa_log_path(paths))
    rows = []
    for key, entry in log.items():
        if not isinstance(entry, dict):
            continue
        rows.append({
            "ratingKey": key,
            "title": entry.get("title") or key,
            "library": entry.get("library") or "",
            "itemType": entry.get("itemType") or "",
            "timestamp": entry.get("timestamp"),
            "previewOnly": bool(entry.get("preview_only")),
            "families": entry.get("families") or {},
            "hasBackup": bool(entry.get("hasBackup")),
        })
    rows.sort(key=lambda r: str(r.get("timestamp") or ""), reverse=True)
    return rows
