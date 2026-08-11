#!/usr/bin/env python3
"""New Season overlay worker — Plex scan, compose, upload, cleanup."""

from __future__ import annotations

import io
import json
import os
import re
import traceback
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable

import requests
from PIL import Image
from plexapi.server import PlexServer

ProgressFn = Callable[[str], None]


def _progress(progress: ProgressFn | None, message: str) -> None:
    if progress:
        progress(message)


def _sanitize_filename(filename: str) -> str:
    filename = re.sub(r'[<>:"/\\|?*]', "", filename)
    filename = re.sub(r"[^\w\s-]", "", filename)
    return filename.strip() or "show"


def _as_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _resolve_paths(config: dict) -> dict[str, Path]:
    root = Path(str(config.get("dataDir") or config.get("data_dir") or ".")).resolve()
    preview = root / "preview"
    backups = root / "backups"
    preview.mkdir(parents=True, exist_ok=True)
    backups.mkdir(parents=True, exist_ok=True)
    log_path = Path(str(config.get("logPath") or config.get("log_path") or (root / "overlaid_log.json")))
    assets_dir = Path(
        str(
            config.get("assetsDir")
            or config.get("assets_dir")
            or Path(__file__).resolve().parent / "assets" / "presets"
        )
    )
    preset_id = str(config.get("overlayPresetId") or config.get("overlay_preset_id") or "new-season").strip() or "new-season"
    overlay_path = Path(str(config.get("overlayPath") or config.get("overlay_path") or (assets_dir / f"{preset_id}.png")))
    return {
        "root": root,
        "preview": preview,
        "backups": backups,
        "log": log_path,
        "overlay": overlay_path,
        "assets": assets_dir,
    }


def _backup_dir(paths: dict, rating_key: str) -> Path:
    return paths["backups"] / str(rating_key)


def _save_original_backups(
    paths: dict,
    rating_key: str,
    show_img: Image.Image,
    season_img: Image.Image | None,
    meta: dict | None = None,
) -> dict:
    """
    Persist pre-overlay posters once. Never overwrite an existing backup —
    that would replace originals with already-overlaid art on a later run.
    """
    folder = _backup_dir(paths, rating_key)
    show_path = folder / "show.png"
    season_path = folder / "season.png"
    meta_path = folder / "meta.json"
    saved = {"show": False, "season": False, "dir": str(folder)}

    folder.mkdir(parents=True, exist_ok=True)
    if not show_path.exists():
        show_img.convert("RGBA").save(show_path)
        saved["show"] = True
    if season_img is not None and not season_path.exists():
        season_img.convert("RGBA").save(season_path)
        saved["season"] = True
    if meta and not meta_path.exists():
        meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return saved


def _clear_backup_dir(paths: dict, rating_key: str) -> None:
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


def _restore_from_backup(show, paths: dict, rating_key: str, progress: ProgressFn | None = None) -> bool:
    """Upload saved originals back to Plex. Returns True if any backup file was applied."""
    folder = _backup_dir(paths, rating_key)
    show_path = folder / "show.png"
    season_path = folder / "season.png"
    restored_any = False

    if show_path.exists():
        try:
            show.uploadPoster(filepath=str(show_path))
            restored_any = True
            _progress(progress, f"Restored show poster from backup: {show.title}")
        except Exception as exc:
            _progress(progress, f"Backup show restore failed for {show.title}: {exc}")

    latest = _latest_season(show)
    # Prefer the season index recorded when we backed up (latest may have changed).
    season_index = None
    meta_path = folder / "meta.json"
    if meta_path.exists():
        try:
            season_index = json.loads(meta_path.read_text(encoding="utf-8")).get("seasonIndex")
        except Exception:
            season_index = None
    season_item = latest
    if season_index is not None:
        try:
            for season in show.seasons():
                if season.index == season_index:
                    season_item = season
                    break
        except Exception:
            pass

    if season_path.exists() and season_item is not None:
        try:
            season_item.uploadPoster(filepath=str(season_path))
            restored_any = True
            _progress(progress, f"Restored season poster from backup: {show.title}")
        except Exception as exc:
            _progress(progress, f"Backup season restore failed for {show.title}: {exc}")

    if restored_any:
        _clear_backup_dir(paths, rating_key)
    return restored_any


def _load_log(log_path: Path) -> dict:
    if not log_path.exists():
        return {}
    try:
        data = json.loads(log_path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save_log(log_path: Path, data: dict) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _connect(config: dict) -> PlexServer:
    base = str(config.get("plexUrl") or config.get("plex_url") or config.get("base_url") or "").rstrip("/")
    token = str(config.get("plexToken") or config.get("plex_token") or config.get("token") or "").strip()
    if not base or not token:
        raise ValueError("Plex URL and token are required (configure Media Player Plex settings).")
    return PlexServer(base, token)


def _has_kometa_overlay_label(item) -> bool:
    try:
        labels = getattr(item, "labels", None) or []
        for label in labels:
            tag = getattr(label, "tag", None) or str(label)
            if str(tag).strip().lower() == "overlay":
                return True
    except Exception:
        return False
    return False


def _apply_overlay(base_img: Image.Image, overlay_img: Image.Image) -> Image.Image:
    base_img = base_img.convert("RGBA")
    overlay_img = overlay_img.convert("RGBA")
    width, height = base_img.size
    new_width = int(width * 0.85)
    new_height = int(overlay_img.height * (new_width / overlay_img.width))
    resized = overlay_img.resize((new_width, new_height), Image.LANCZOS)
    x = int((width - new_width) / 2)
    y = height - new_height
    base_img.paste(resized, (x, y), resized)
    return base_img


def _download_poster(plex: PlexServer, thumb_path: str) -> Image.Image | None:
    if not thumb_path:
        return None
    url = f"{plex._baseurl}{thumb_path}?X-Plex-Token={plex._token}"
    response = requests.get(url, timeout=60)
    if response.status_code != 200:
        return None
    return Image.open(io.BytesIO(response.content))


def _reset_poster(item) -> bool:
    try:
        posters = item.posters()
        if posters:
            original = None
            for poster in posters:
                key = str(getattr(poster, "key", "") or "")
                if "metadata" in key and "thumb" in key:
                    original = poster
                    break
            if not original:
                original = posters[0]
            item.setPoster(original)
            return True
    except Exception:
        pass
    try:
        item.edit(**{"thumb.locked": 0})
        item.edit(**{"thumb": None})
        item.refresh()
        return True
    except Exception:
        return False


def _latest_season(show):
    seasons = show.seasons()
    valid = [s for s in seasons if s.index is not None]
    if not valid:
        return None
    return max(valid, key=lambda s: s.index)


def should_have_overlay(show, cutoff: datetime, skip_kometa: bool) -> tuple[bool, dict]:
    meta = {"seasonIndex": None, "airedAt": None, "reason": None}
    try:
        if skip_kometa and _has_kometa_overlay_label(show):
            meta["reason"] = "kometa_overlay_label"
            return False, meta
        seasons = show.seasons()
        if len(seasons) < 2:
            meta["reason"] = "single_season"
            return False, meta
        latest = _latest_season(show)
        if not latest:
            meta["reason"] = "no_season"
            return False, meta
        meta["seasonIndex"] = latest.index
        episodes = latest.episodes()
        episode1 = next((ep for ep in episodes if ep.index == 1), None)
        if not episode1 or episode1.originallyAvailableAt is None:
            meta["reason"] = "no_air_date"
            return False, meta
        meta["airedAt"] = episode1.originallyAvailableAt.isoformat()
        if episode1.originallyAvailableAt < cutoff:
            meta["reason"] = "aged_out"
            return False, meta
        return True, meta
    except Exception as exc:
        meta["reason"] = f"error:{exc}"
        return False, meta


def _section_filter(config: dict) -> set[str] | None:
    raw = config.get("librarySectionIds") or config.get("library_section_ids") or []
    if not isinstance(raw, list) or not raw:
        return None
    return {str(x).strip() for x in raw if str(x).strip()}


def _section_ids(section) -> set[str]:
    section_id = str(getattr(section, "key", "") or "").rstrip("/").split("/")[-1]
    section_key = str(getattr(section, "key", "") or "")
    titles = {str(section.title)}
    return {section_id, section_key, *titles}


def _iter_tv_sections(plex: PlexServer, config: dict):
    wanted = _section_filter(config)
    for section in plex.library.sections():
        if section.type != "show":
            continue
        ids = _section_ids(section)
        if wanted is not None and not (wanted & ids):
            continue
        yield section


def _iter_shows(plex: PlexServer, config: dict):
    for section in _iter_tv_sections(plex, config):
        for show in section.all():
            yield section, show


def _search_recent_premiere_episodes(section, cutoff: datetime):
    """
    Fast path: only E01 episodes aired on/after cutoff.
    Avoids walking every show with seasons()/episodes() (that hangs large libraries / 502s).
    """
    cutoff_str = cutoff.strftime("%Y-%m-%d")
    plex = getattr(section, "_server", None)
    section_id = str(getattr(section, "key", "") or "").rstrip("/").split("/")[-1]

    # Preferred: plexapi fetchItems against the section endpoint (stable filter params).
    if plex is not None and section_id:
        try:
            items = plex.fetchItems(
                f"/library/sections/{section_id}/all",
                params={
                    "type": 4,
                    "episode.index": 1,
                    "originallyAvailableAt>=": cutoff_str,
                },
            )
            return list(items or [])
        except Exception:
            pass

    attempts = [
        {"libtype": "episode", "filters": {"episode.index": 1, "originallyAvailableAt>>=": cutoff_str}},
        {"libtype": "episode", "filters": {"index": 1, "originallyAvailableAt>>=": cutoff_str}},
    ]
    last_error = None
    for kwargs in attempts:
        try:
            return list(section.search(**kwargs))
        except Exception as exc:
            last_error = exc
    if last_error:
        raise last_error
    return []


def discover_eligible_shows(
    plex: PlexServer,
    config: dict,
    cutoff: datetime,
    skip_kometa: bool,
    progress: ProgressFn | None = None,
) -> tuple[set[str], dict[str, dict], dict[str, Any]]:
    """
    Return (should_have_keys, meta_by_key, show_by_key) for shows whose *latest*
    season premiere (E01) falls inside the new-season window.
    """
    should_have: set[str] = set()
    meta_by_key: dict[str, dict] = {}
    show_by_key: dict[str, Any] = {}

    for section in _iter_tv_sections(plex, config):
        _progress(progress, f"Scanning {section.title} for recent season premieres…")
        episodes = []
        used_fast = False
        try:
            episodes = _search_recent_premiere_episodes(section, cutoff)
            used_fast = True
            _progress(progress, f"{section.title}: {len(episodes)} recent E01 episode(s)")
        except Exception as exc:
            _progress(progress, f"{section.title}: fast search failed ({exc}); falling back to full scan")

        if used_fast:
            for ep in episodes:
                try:
                    show = ep.show()
                    season = ep.season()
                except Exception:
                    continue
                key = str(getattr(show, "ratingKey", "") or "")
                if not key or key in should_have:
                    continue
                if skip_kometa and _has_kometa_overlay_label(show):
                    meta_by_key[key] = {
                        "seasonIndex": getattr(season, "index", None),
                        "airedAt": getattr(ep, "originallyAvailableAt", None).isoformat()
                        if getattr(ep, "originallyAvailableAt", None)
                        else None,
                        "reason": "kometa_overlay_label",
                    }
                    show_by_key[key] = show
                    continue
                try:
                    latest = _latest_season(show)
                except Exception:
                    continue
                if latest is None:
                    continue
                # Only the show's current latest season qualifies as "new season".
                if str(latest.ratingKey) != str(season.ratingKey):
                    continue
                aired = getattr(ep, "originallyAvailableAt", None)
                if aired is None or aired < cutoff:
                    continue
                should_have.add(key)
                show_by_key[key] = show
                meta_by_key[key] = {
                    "seasonIndex": latest.index,
                    "airedAt": aired.isoformat(),
                    "reason": None,
                    "library": section.title,
                }
            continue

        # Slow fallback (small libraries / older plexapi).
        count = 0
        for show in section.all():
            count += 1
            if count % 25 == 0:
                _progress(progress, f"{section.title}: checked {count} shows…")
            ok, meta = should_have_overlay(show, cutoff, skip_kometa)
            key = str(show.ratingKey)
            show_by_key[key] = show
            meta_by_key[key] = {**meta, "library": section.title}
            if ok:
                should_have.add(key)

    _progress(progress, f"Eligible shows: {len(should_have)}")
    return should_have, meta_by_key, show_by_key


def scan_library(config: dict, progress: ProgressFn | None = None) -> dict:
    plex = _connect(config)
    days = int(config.get("newSeasonDays") or config.get("new_season_days") or 21)
    cutoff = datetime.now() - timedelta(days=max(1, days))
    skip_kometa = _as_bool(config.get("skipIfKometaOverlayLabel", config.get("skip_if_kometa_overlay_label")), True)
    paths = _resolve_paths(config)
    log = _load_log(paths["log"])

    should_have, meta_by_key, show_by_key = discover_eligible_shows(
        plex, config, cutoff, skip_kometa, progress
    )

    eligible = []
    for key in sorted(should_have):
        show = show_by_key.get(key)
        meta = meta_by_key.get(key) or {}
        eligible.append({
            "ratingKey": key,
            "title": getattr(show, "title", None) or key,
            "library": meta.get("library") or "",
            "libraryKey": "",
            "seasonIndex": meta.get("seasonIndex"),
            "airedAt": meta.get("airedAt"),
            "reason": meta.get("reason"),
            "inLog": key in log,
            "previewOnly": bool((log.get(key) or {}).get("preview_only")),
        })

    return {
        "ok": True,
        "cutoff": cutoff.isoformat(),
        "newSeasonDays": days,
        "eligibleCount": len(eligible),
        "eligible": eligible,
        "logCount": len(log),
        "logKeys": list(log.keys()),
        "toRemove": [k for k in log.keys() if k not in should_have],
    }


def process_show_overlay(plex: PlexServer, show, config: dict, paths: dict, preview_mode: bool, progress: ProgressFn | None = None) -> dict:
    overlay_path: Path = paths["overlay"]
    if not overlay_path.exists():
        raise FileNotFoundError(f"Overlay asset not found: {overlay_path}")

    overlay_img = Image.open(overlay_path)
    latest = _latest_season(show)
    if not latest:
        raise ValueError(f"No seasons for {show.title}")

    show_poster = _download_poster(plex, getattr(show, "thumb", None) or "")
    if show_poster is None:
        raise RuntimeError(f"Failed to download show poster for {show.title}")

    season_poster = None
    if getattr(latest, "thumb", None):
        season_poster = _download_poster(plex, latest.thumb)

    # Capture originals before compositing (live runs only; never overwrite existing backups).
    if not preview_mode:
        saved = _save_original_backups(
            paths,
            str(show.ratingKey),
            show_poster,
            season_poster,
            meta={
                "title": show.title,
                "seasonIndex": latest.index,
                "ratingKey": str(show.ratingKey),
                "savedAt": datetime.now().isoformat(),
            },
        )
        if saved["show"] or saved["season"]:
            _progress(progress, f"Backed up original poster(s): {show.title}")

    result = _apply_overlay(show_poster.copy(), overlay_img)
    season_result = None
    if season_poster is not None:
        season_result = _apply_overlay(season_poster.copy(), overlay_img)

    safe_title = _sanitize_filename(show.title)
    now = datetime.now()
    entry = {
        "title": show.title,
        "timestamp": now.isoformat(),
        "preview_only": bool(preview_mode),
        "seasonIndex": latest.index,
        "presetId": str(config.get("overlayPresetId") or "new-season"),
        "hasBackup": (_backup_dir(paths, str(show.ratingKey)) / "show.png").exists(),
    }

    if preview_mode:
        show_path = paths["preview"] / f"{safe_title}_show.png"
        result.save(show_path)
        entry["previewShow"] = str(show_path)
        if season_result is not None:
            season_path = paths["preview"] / f"{safe_title}_season.png"
            season_result.save(season_path)
            entry["previewSeason"] = str(season_path)
        _progress(progress, f"Preview saved: {show.title}")
    else:
        temp_show = paths["preview"] / f"temp_{safe_title}_show.png"
        result.save(temp_show)
        try:
            show.uploadPoster(filepath=str(temp_show))
            _progress(progress, f"Uploaded show poster: {show.title}")
            if season_result is not None:
                temp_season = paths["preview"] / f"temp_{safe_title}_season.png"
                season_result.save(temp_season)
                try:
                    latest.uploadPoster(filepath=str(temp_season))
                    _progress(progress, f"Uploaded season poster: {show.title} S{latest.index}")
                finally:
                    if temp_season.exists():
                        temp_season.unlink()
        finally:
            if temp_show.exists():
                temp_show.unlink()

    return entry


def remove_show_overlay(show, preview_mode: bool, progress: ProgressFn | None = None, paths: dict | None = None) -> bool:
    rating_key = str(getattr(show, "ratingKey", "") or "")
    if preview_mode:
        _progress(progress, f"[Preview] Would remove overlay: {show.title}")
        return True
    _progress(progress, f"Removing overlay: {show.title}")

    restored = False
    if paths is not None and rating_key:
        restored = _restore_from_backup(show, paths, rating_key, progress)

    if restored:
        return True

    # Fallback when no on-disk backup (e.g. migrated logs from the standalone tool).
    _progress(progress, f"No backup for {show.title} — falling back to Plex poster list")
    ok = _reset_poster(show)
    latest = _latest_season(show)
    if latest:
        _reset_poster(latest)
    return ok


def run_overlays(config: dict, progress: ProgressFn | None = None, preview_override: bool | None = None) -> dict:
    paths = _resolve_paths(config)
    preview_mode = _as_bool(preview_override if preview_override is not None else config.get("previewMode", config.get("preview_mode")), False)
    days = int(config.get("newSeasonDays") or config.get("new_season_days") or 21)
    cutoff = datetime.now() - timedelta(days=max(1, days))
    skip_kometa = _as_bool(config.get("skipIfKometaOverlayLabel", config.get("skip_if_kometa_overlay_label")), True)

    plex = _connect(config)
    log = _load_log(paths["log"])

    _progress(progress, "Scanning for eligible new seasons…")
    should_have, _meta_by_key, show_by_key = discover_eligible_shows(
        plex, config, cutoff, skip_kometa, progress
    )

    added = 0
    converted = 0
    refreshed = 0
    skipped = 0
    removed = 0
    errors: list[str] = []
    preview_files: list[dict] = []

    for key in sorted(should_have):
        show = show_by_key[key]
        existing = log.get(key)
        try:
            if preview_mode:
                # Always regenerate preview art — previously we skipped already-logged
                # shows, which made Preview look broken when the log was non-empty.
                entry = process_show_overlay(plex, show, config, paths, True, progress)
                preview_files.append({
                    "ratingKey": key,
                    "title": show.title,
                    "previewShow": entry.get("previewShow"),
                    "previewSeason": entry.get("previewSeason"),
                })
                if existing is None:
                    log[key] = entry
                    added += 1
                else:
                    refreshed += 1
                continue

            needs = existing is None or bool(existing.get("preview_only"))
            if not needs:
                skipped += 1
                _progress(progress, f"Already overlaid, skipping: {show.title}")
                continue

            entry = process_show_overlay(plex, show, config, paths, False, progress)
            if existing and existing.get("preview_only"):
                converted += 1
            else:
                added += 1
            if isinstance(existing, dict):
                log[key] = {**existing, **entry}
            else:
                log[key] = entry
        except Exception as exc:
            errors.append(f"{show.title}: {exc}")
            _progress(progress, f"Error on {show.title}: {exc}")

    for key in list(log.keys()):
        if key in should_have:
            continue
        try:
            if preview_mode:
                # Preview must not wipe live log entries — only report what would drop.
                title = (log.get(key) or {}).get("title") or key
                _progress(progress, f"[Preview] Would remove overlay: {title}")
                removed += 1
                continue
            show = show_by_key.get(key)
            if show is None:
                try:
                    show = plex.fetchItem(f"/library/metadata/{key}")
                except Exception:
                    _progress(progress, f"Dropping inaccessible log entry {key}")
                    del log[key]
                    removed += 1
                    continue
            if remove_show_overlay(show, False, progress, paths=paths):
                del log[key]
                removed += 1
        except Exception as exc:
            errors.append(f"remove {key}: {exc}")

    _save_log(paths["log"], log)
    summary = {
        "ok": True,
        "previewMode": preview_mode,
        "added": added,
        "converted": converted,
        "refreshed": refreshed,
        "skipped": skipped,
        "removed": removed,
        "totalWithOverlays": len(log),
        "eligible": len(should_have),
        "errors": errors,
        "previewFiles": preview_files,
        "previewDir": str(paths["preview"]),
        "logPath": str(paths["log"]),
        "overlayPath": str(paths["overlay"]),
        "finishedAt": datetime.now().isoformat(),
    }
    if preview_mode:
        _progress(
            progress,
            f"Done (preview) — eligible {len(should_have)}, new {added}, refreshed {refreshed}, "
            f"would remove {removed}, files in {paths['preview']}",
        )
    else:
        _progress(progress, f"Done — added {added}, removed {removed}, skipped {skipped}, total {len(log)}")
    return summary


def reconcile(config: dict, progress: ProgressFn | None = None) -> dict:
    """Dry-run: what would add / remove without writing posters."""
    scan = scan_library(config, progress)
    log_keys = set(scan.get("logKeys") or [])
    eligible_keys = {row["ratingKey"] for row in scan.get("eligible") or []}
    to_add = [row for row in (scan.get("eligible") or []) if row["ratingKey"] not in log_keys]
    to_convert = [
        row for row in (scan.get("eligible") or [])
        if row["ratingKey"] in log_keys and row.get("previewOnly")
    ]
    to_remove = list(scan.get("toRemove") or [])
    return {
        "ok": True,
        "eligibleCount": scan.get("eligibleCount") or 0,
        "logCount": scan.get("logCount") or 0,
        "wouldAdd": to_add,
        "wouldConvert": to_convert,
        "wouldRemove": to_remove,
        "wouldAddCount": len(to_add),
        "wouldConvertCount": len(to_convert),
        "wouldRemoveCount": len(to_remove),
    }


def list_status(config: dict) -> dict:
    paths = _resolve_paths(config)
    log = _load_log(paths["log"])
    shows = []
    for key, entry in log.items():
        if not isinstance(entry, dict):
            continue
        shows.append({
            "ratingKey": key,
            "title": entry.get("title") or key,
            "timestamp": entry.get("timestamp"),
            "previewOnly": bool(entry.get("preview_only")),
            "seasonIndex": entry.get("seasonIndex"),
            "presetId": entry.get("presetId"),
        })
    shows.sort(key=lambda r: str(r.get("timestamp") or ""), reverse=True)
    return {
        "ok": True,
        "overlayExists": paths["overlay"].exists(),
        "overlayPath": str(paths["overlay"]),
        "logPath": str(paths["log"]),
        "previewDir": str(paths["preview"]),
        "backupsDir": str(paths["backups"]),
        "logCount": len(log),
        "shows": shows,
    }


def reset_one(config: dict, rating_key: str, progress: ProgressFn | None = None) -> dict:
    paths = _resolve_paths(config)
    plex = _connect(config)
    log = _load_log(paths["log"])
    key = str(rating_key).strip()
    if not key:
        raise ValueError("ratingKey is required")
    show = plex.fetchItem(f"/library/metadata/{key}")
    # Explicit resets always clear live Plex art (not preview-only).
    had_backup = (_backup_dir(paths, key) / "show.png").exists()
    remove_show_overlay(show, False, progress, paths=paths)
    _clear_backup_dir(paths, key)
    if key in log:
        del log[key]
        _save_log(paths["log"], log)
    return {
        "ok": True,
        "ratingKey": key,
        "title": getattr(show, "title", key),
        "restoredFromBackup": had_backup,
    }


def reset_all(config: dict, progress: ProgressFn | None = None) -> dict:
    """Reset every show currently in overlaid_log.json and clear the log."""
    paths = _resolve_paths(config)
    plex = _connect(config)
    log = _load_log(paths["log"])
    keys = list(log.keys())
    removed = 0
    restored_from_backup = 0
    failed: list[str] = []
    _progress(progress, f"Resetting {len(keys)} logged overlay(s)…")

    for key in keys:
        entry = log.get(key) or {}
        title = entry.get("title") or key
        had_backup = (_backup_dir(paths, key) / "show.png").exists()
        try:
            show = plex.fetchItem(f"/library/metadata/{key}")
            remove_show_overlay(show, False, progress, paths=paths)
            if had_backup:
                restored_from_backup += 1
            removed += 1
        except Exception as exc:
            failed.append(f"{title}: {exc}")
            _progress(progress, f"Failed to reset {title}: {exc}")
        _clear_backup_dir(paths, key)
        if key in log:
            del log[key]

    _save_log(paths["log"], log)
    summary = {
        "ok": True,
        "requested": len(keys),
        "removed": removed,
        "restoredFromBackup": restored_from_backup,
        "failed": failed,
        "remaining": len(log),
        "backupsDir": str(paths["backups"]),
        "finishedAt": datetime.now().isoformat(),
    }
    _progress(
        progress,
        f"Reset complete — cleared {removed}/{len(keys)} ({restored_from_backup} from file backups)",
    )
    return summary


def list_tv_sections(config: dict) -> dict:
    plex = _connect(config)
    sections = []
    for section in plex.library.sections():
        if section.type != "show":
            continue
        sections.append({
            "key": str(section.key),
            "id": str(section.key).rstrip("/").split("/")[-1],
            "title": section.title,
            "type": section.type,
        })
    return {"ok": True, "sections": sections}
