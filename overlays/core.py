#!/usr/bin/env python3
"""New Season overlay worker — Plex scan, compose, upload, cleanup."""

from __future__ import annotations

import io
import json
import os
import random
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
    preview_episodes = preview / "episodes"
    backups = root / "backups"
    backups_episodes = backups / "episodes"
    preview.mkdir(parents=True, exist_ok=True)
    preview_episodes.mkdir(parents=True, exist_ok=True)
    backups.mkdir(parents=True, exist_ok=True)
    backups_episodes.mkdir(parents=True, exist_ok=True)
    log_path = Path(str(config.get("logPath") or config.get("log_path") or (root / "overlaid_log.json")))
    episode_log_path = Path(
        str(
            config.get("episodeLogPath")
            or config.get("episode_log_path")
            or (root / "episode_overlaid_log.json")
        )
    )
    assets_dir = Path(
        str(
            config.get("assetsDir")
            or config.get("assets_dir")
            or Path(__file__).resolve().parent / "assets" / "presets"
        )
    )
    preset_id = str(config.get("overlayPresetId") or config.get("overlay_preset_id") or "new-season").strip() or "new-season"
    overlay_path = Path(str(config.get("overlayPath") or config.get("overlay_path") or (assets_dir / f"{preset_id}.png")))
    episode_overlay_path = Path(
        str(
            config.get("episodeOverlayPath")
            or config.get("episode_overlay_path")
            or (assets_dir / "new-episode.png")
        )
    )
    return {
        "root": root,
        "preview": preview,
        "previewEpisodes": preview_episodes,
        "backups": backups,
        "backupsEpisodes": backups_episodes,
        "log": log_path,
        "episodeLog": episode_log_path,
        "overlay": overlay_path,
        "episodeOverlay": episode_overlay_path,
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


def _apply_overlay(
    base_img: Image.Image,
    overlay_img: Image.Image,
    *,
    width_ratio: float = 0.85,
    max_height_ratio: float | None = None,
    # Only enough to shave the corner radius (~8–10% of banner height). Higher
    # values (e.g. 0.30) cut into the white text.
    bottom_clip_ratio: float = 0.10,
) -> Image.Image:
    """
    Composite banner onto art, Netflix-style: hang slightly off the bottom so
    rounded bottom corners are clipped into a straight flush edge.
    """
    base_img = base_img.convert("RGBA")
    overlay_img = overlay_img.convert("RGBA")
    width, height = base_img.size
    new_width = max(1, int(width * max(0.05, min(1.0, width_ratio))))
    new_height = max(1, int(overlay_img.height * (new_width / overlay_img.width)))
    if max_height_ratio is not None:
        max_h = max(1, int(height * max(0.05, min(1.0, max_height_ratio))))
        if new_height > max_h:
            scale = max_h / new_height
            new_width = max(1, int(new_width * scale))
            new_height = max_h
    resized = overlay_img.resize((new_width, new_height), Image.LANCZOS)

    # Crop only the corner radius — keep full glyph descenders visible.
    clip = max(0, min(new_height - 1, int(new_height * max(0.0, min(0.2, bottom_clip_ratio)))))
    keep_h = max(1, new_height - clip)
    cropped = resized.crop((0, 0, new_width, keep_h))
    x = int((width - new_width) / 2)
    y = height - keep_h
    base_img.paste(cropped, (x, y), cropped)
    return base_img


def _apply_episode_overlay(base_img: Image.Image, overlay_img: Image.Image) -> Image.Image:
    """Netflix-sized badge on landscape episode thumbs (not the show-poster 85% banner)."""
    return _apply_overlay(
        base_img,
        overlay_img,
        width_ratio=0.38,
        max_height_ratio=0.14,
        bottom_clip_ratio=0.10,
    )


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


def _as_datetime(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    try:
        # plexapi sometimes returns datetime.date
        return datetime.combine(value, datetime.min.time())
    except Exception:
        return None


def _search_recent_premiere_episodes(section, cutoff: datetime):
    """
    Fast path: only E01 episodes aired on/after cutoff.
    Avoids walking every show with seasons()/episodes() (that hangs large libraries / 502s).
    """
    cutoff_str = cutoff.strftime("%Y-%m-%d")
    plex = getattr(section, "_server", None)
    section_id = str(getattr(section, "key", "") or "").rstrip("/").split("/")[-1]

    def _client_filter(items: list) -> list:
        out = []
        for ep in items or []:
            idx = getattr(ep, "index", None)
            if idx is not None and idx not in (1, "1"):
                continue
            aired = _as_datetime(getattr(ep, "originallyAvailableAt", None))
            if aired is None or aired < cutoff:
                continue
            out.append(ep)
        return out

    candidates: list = []

    # 1) plexapi filter syntax uses >>= for >=
    try:
        candidates = list(section.search(
            libtype="episode",
            filters={
                "episode.index": 1,
                "originallyAvailableAt>>=": cutoff_str,
            },
        ))
    except Exception:
        candidates = []

    # Server ignored the date filter if we still got thousands of historic E01s.
    if len(candidates) > 1000:
        filtered = _client_filter(candidates)
        if len(filtered) <= 500:
            return filtered
        candidates = []

    # 2) Raw query string — keeps `>=` intact (params dict keys can get mangled).
    if not candidates and plex is not None and section_id:
        try:
            key = (
                f"/library/sections/{section_id}/all"
                f"?type=4&index=1&originallyAvailableAt>={cutoff_str}"
            )
            candidates = list(plex.fetchItems(key) or [])
        except Exception:
            candidates = []
        if len(candidates) > 1000:
            filtered = _client_filter(candidates)
            if len(filtered) <= 500:
                return filtered
            # Filter clearly broken — force slow path instead of 8k show() lookups.
            raise RuntimeError(
                f"Plex returned {len(candidates)} E01 rows without honouring the air-date filter"
            )

    return _client_filter(candidates)


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
    window_days = max(1, (datetime.now() - cutoff).days)

    for section in _iter_tv_sections(plex, config):
        _progress(progress, f"Scanning {section.title} for recent season premieres…")
        episodes = []
        used_fast = False
        try:
            episodes = _search_recent_premiere_episodes(section, cutoff)
            used_fast = True
            _progress(
                progress,
                f"{section.title}: {len(episodes)} E01 premiere(s) in the last {window_days} day(s)",
            )
        except Exception as exc:
            _progress(progress, f"{section.title}: fast search failed ({exc}); falling back to full scan")

        if used_fast:
            for idx, ep in enumerate(episodes, start=1):
                if idx == 1 or idx % 10 == 0 or idx == len(episodes):
                    _progress(progress, f"{section.title}: checking premiere {idx}/{len(episodes)}…")
                try:
                    show = ep.show()
                    season = ep.season()
                except Exception:
                    continue
                key = str(getattr(show, "ratingKey", "") or "")
                if not key or key in should_have:
                    continue
                aired = _as_datetime(getattr(ep, "originallyAvailableAt", None))
                if skip_kometa and _has_kometa_overlay_label(show):
                    meta_by_key[key] = {
                        "seasonIndex": getattr(season, "index", None),
                        "airedAt": aired.isoformat() if aired else None,
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

        # Slow fallback (broken date filters / older plexapi).
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


def _episode_backup_dir(paths: dict, rating_key: str) -> Path:
    return paths["backupsEpisodes"] / str(rating_key)


def _save_episode_backup(paths: dict, rating_key: str, thumb_img: Image.Image, meta: dict | None = None) -> bool:
    folder = _episode_backup_dir(paths, rating_key)
    thumb_path = folder / "episode.png"
    meta_path = folder / "meta.json"
    folder.mkdir(parents=True, exist_ok=True)
    saved = False
    if not thumb_path.exists():
        thumb_img.convert("RGBA").save(thumb_path)
        saved = True
    if meta and not meta_path.exists():
        meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return saved


def _clear_episode_backup(paths: dict, rating_key: str) -> None:
    folder = _episode_backup_dir(paths, rating_key)
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


def _restore_episode_from_backup(episode, paths: dict, rating_key: str, progress: ProgressFn | None = None) -> bool:
    thumb_path = _episode_backup_dir(paths, rating_key) / "episode.png"
    if not thumb_path.exists():
        return False
    try:
        episode.uploadPoster(filepath=str(thumb_path))
        _progress(progress, f"Restored episode thumb from backup: {getattr(episode, 'title', rating_key)}")
        _clear_episode_backup(paths, rating_key)
        return True
    except Exception as exc:
        _progress(progress, f"Episode backup restore failed for {rating_key}: {exc}")
        return False


def _search_recent_episodes(section, cutoff: datetime):
    """Any episode (not just E01) aired on/after cutoff — with client-side date enforcement."""
    cutoff_str = cutoff.strftime("%Y-%m-%d")
    plex = getattr(section, "_server", None)
    section_id = str(getattr(section, "key", "") or "").rstrip("/").split("/")[-1]

    def _client_filter(items: list) -> list:
        out = []
        for ep in items or []:
            aired = _as_datetime(getattr(ep, "originallyAvailableAt", None))
            if aired is None or aired < cutoff:
                continue
            out.append(ep)
        return out

    candidates: list = []
    try:
        candidates = list(section.search(
            libtype="episode",
            filters={"originallyAvailableAt>>=": cutoff_str},
        ))
    except Exception:
        candidates = []

    if len(candidates) > 2000:
        filtered = _client_filter(candidates)
        if len(filtered) <= 800:
            return filtered
        candidates = []

    if not candidates and plex is not None and section_id:
        try:
            key = (
                f"/library/sections/{section_id}/all"
                f"?type=4&originallyAvailableAt>={cutoff_str}"
            )
            candidates = list(plex.fetchItems(key) or [])
        except Exception:
            candidates = []
        if len(candidates) > 2000:
            filtered = _client_filter(candidates)
            if len(filtered) <= 800:
                return filtered
            raise RuntimeError(
                f"Plex returned {len(candidates)} episode rows without honouring the air-date filter"
            )

    return _client_filter(candidates)


def _filter_binge_drop_keys(
    meta_by_key: dict[str, dict],
    *,
    min_count: int = 3,
) -> set[str]:
    """
    Episodes that belong to a same-day season dump (binge release).
    Group by show + season + calendar air date; ≥ min_count → binge.
    """
    from collections import defaultdict

    groups: dict[tuple, list[str]] = defaultdict(list)
    for key, meta in meta_by_key.items():
        show_key = str(meta.get("showKey") or "").strip()
        season_raw = meta.get("seasonIndex")
        aired_raw = str(meta.get("airedAt") or "")
        day = aired_raw[:10]
        if not show_key or season_raw is None or len(day) < 10:
            continue
        try:
            season = int(season_raw)
        except (TypeError, ValueError):
            continue
        groups[(show_key, season, day)].append(key)

    binge: set[str] = set()
    for keys in groups.values():
        if len(keys) >= min_count:
            binge.update(keys)
    return binge


def discover_new_episodes(
    plex: PlexServer,
    config: dict,
    cutoff: datetime,
    skip_kometa: bool,
    progress: ProgressFn | None = None,
) -> tuple[set[str], dict[str, Any], dict[str, dict]]:
    """Return (keys, episode_by_key, meta_by_key) for episodes aired within the window."""
    should_have: set[str] = set()
    episode_by_key: dict[str, Any] = {}
    meta_by_key: dict[str, dict] = {}
    window_days = max(1, (datetime.now() - cutoff).days)
    skip_binge = _as_bool(
        config.get("skipNewEpisodeOnBinge", config.get("skip_new_episode_on_binge")),
        True,
    )

    for section in _iter_tv_sections(plex, config):
        _progress(progress, f"Scanning {section.title} for new episodes…")
        try:
            episodes = _search_recent_episodes(section, cutoff)
        except Exception as exc:
            _progress(progress, f"{section.title}: episode search failed ({exc})")
            continue
        _progress(
            progress,
            f"{section.title}: {len(episodes)} episode(s) in the last {window_days} day(s)",
        )
        for idx, ep in enumerate(episodes, start=1):
            if idx == 1 or idx % 25 == 0 or idx == len(episodes):
                _progress(progress, f"{section.title}: checking episode {idx}/{len(episodes)}…")
            key = str(getattr(ep, "ratingKey", "") or "")
            if not key or key in should_have:
                continue
            try:
                show = ep.show()
            except Exception:
                show = None
            if skip_kometa and show is not None and _has_kometa_overlay_label(show):
                continue
            if skip_kometa and _has_kometa_overlay_label(ep):
                continue
            aired = _as_datetime(getattr(ep, "originallyAvailableAt", None))
            if aired is None or aired < cutoff:
                continue
            show_title = getattr(show, "title", None) if show is not None else None
            show_key = str(
                getattr(show, "ratingKey", None)
                or getattr(ep, "grandparentRatingKey", None)
                or ""
            )
            should_have.add(key)
            episode_by_key[key] = ep
            meta_by_key[key] = {
                "title": getattr(ep, "title", None) or key,
                "showTitle": show_title or "",
                "showKey": show_key,
                "seasonIndex": getattr(ep, "parentIndex", None) or getattr(ep, "seasonNumber", None),
                "episodeIndex": getattr(ep, "index", None),
                "airedAt": aired.isoformat(),
                "library": section.title,
            }

    if skip_binge and should_have:
        binge_keys = _filter_binge_drop_keys(meta_by_key, min_count=3)
        if binge_keys:
            _progress(
                progress,
                f"Binge skip: dropping {len(binge_keys)} episode badge(s) "
                f"(same-day season dump — New Season covers these)",
            )
            should_have -= binge_keys
            for key in binge_keys:
                episode_by_key.pop(key, None)
                meta_by_key.pop(key, None)

    _progress(progress, f"Eligible new episodes: {len(should_have)}")
    return should_have, episode_by_key, meta_by_key


def process_episode_overlay(
    plex: PlexServer,
    episode,
    meta: dict,
    paths: dict,
    preview_mode: bool,
    progress: ProgressFn | None = None,
) -> dict:
    overlay_path: Path = paths["episodeOverlay"]
    if not overlay_path.exists():
        raise FileNotFoundError(f"Episode overlay asset not found: {overlay_path}")

    overlay_img = Image.open(overlay_path)
    thumb = _download_poster(plex, getattr(episode, "thumb", None) or "")
    if thumb is None:
        raise RuntimeError(f"Failed to download episode thumb for {meta.get('title') or episode}")

    rating_key = str(episode.ratingKey)
    if not preview_mode:
        saved = _save_episode_backup(
            paths,
            rating_key,
            thumb,
            meta={
                **meta,
                "ratingKey": rating_key,
                "savedAt": datetime.now().isoformat(),
            },
        )
        if saved:
            _progress(progress, f"Backed up episode thumb: {meta.get('showTitle') or ''} — {meta.get('title')}")

    result = _apply_episode_overlay(thumb.copy(), overlay_img)
    safe = _sanitize_filename(f"{meta.get('showTitle') or 'show'}_{meta.get('title') or rating_key}")
    now = datetime.now()
    entry = {
        "title": meta.get("title") or getattr(episode, "title", rating_key),
        "showTitle": meta.get("showTitle") or "",
        "timestamp": now.isoformat(),
        "airedAt": meta.get("airedAt"),
        "seasonIndex": meta.get("seasonIndex"),
        "episodeIndex": meta.get("episodeIndex"),
        "preview_only": bool(preview_mode),
        "presetId": "new-episode",
        "hasBackup": (_episode_backup_dir(paths, rating_key) / "episode.png").exists(),
    }

    label = f"{entry['showTitle']} — {entry['title']}".strip(" —")
    if preview_mode:
        out = paths["previewEpisodes"] / f"{safe}.png"
        result.save(out)
        entry["previewEpisode"] = str(out)
        _progress(progress, f"Preview episode saved: {label}")
    else:
        temp = paths["previewEpisodes"] / f"temp_{safe}.png"
        result.save(temp)
        try:
            episode.uploadPoster(filepath=str(temp))
            _progress(progress, f"Uploaded episode thumb: {label}")
        finally:
            if temp.exists():
                temp.unlink()

    return entry


def remove_episode_overlay(episode, preview_mode: bool, progress: ProgressFn | None = None, paths: dict | None = None) -> bool:
    rating_key = str(getattr(episode, "ratingKey", "") or "")
    title = getattr(episode, "title", rating_key)
    if preview_mode:
        _progress(progress, f"[Preview] Would remove episode overlay: {title}")
        return True
    _progress(progress, f"Removing episode overlay: {title}")
    if paths is not None and rating_key:
        if _restore_episode_from_backup(episode, paths, rating_key, progress):
            return True
    _progress(progress, f"No episode backup for {title} — falling back to Plex poster list")
    return _reset_poster(episode)


def run_new_episode_overlays(
    plex: PlexServer,
    config: dict,
    paths: dict,
    preview_mode: bool,
    progress: ProgressFn | None = None,
) -> dict:
    if not _as_bool(config.get("newEpisodeEnabled", config.get("new_episode_enabled")), True):
        _progress(progress, "New Episode overlays disabled — skipping")
        return {
            "episodesAdded": 0,
            "episodesRefreshed": 0,
            "episodesSkipped": 0,
            "episodesRemoved": 0,
            "episodesEligible": 0,
            "episodesTotal": 0,
            "episodeErrors": [],
        }

    days = int(config.get("newEpisodeDays") or config.get("new_episode_days") or 6)
    cutoff = datetime.now() - timedelta(days=max(1, min(30, days)))
    skip_kometa = _as_bool(config.get("skipIfKometaOverlayLabel", config.get("skip_if_kometa_overlay_label")), True)
    log = _load_log(paths["episodeLog"])

    _progress(progress, f"Scanning for new episodes (window {max(1, min(30, days))} days)…")
    should_have, episode_by_key, meta_by_key = discover_new_episodes(
        plex, config, cutoff, skip_kometa, progress
    )

    added = 0
    refreshed = 0
    skipped = 0
    removed = 0
    errors: list[str] = []

    for key in sorted(should_have):
        episode = episode_by_key[key]
        meta = meta_by_key.get(key) or {}
        existing = log.get(key)
        try:
            if preview_mode:
                entry = process_episode_overlay(plex, episode, meta, paths, True, progress)
                if existing is None:
                    log[key] = entry
                    added += 1
                else:
                    refreshed += 1
                continue

            needs = existing is None or bool(existing.get("preview_only"))
            if not needs:
                skipped += 1
                continue

            entry = process_episode_overlay(plex, episode, meta, paths, False, progress)
            added += 1
            if isinstance(existing, dict):
                log[key] = {**existing, **entry}
            else:
                log[key] = entry
        except Exception as exc:
            label = f"{meta.get('showTitle') or ''} {meta.get('title') or key}".strip()
            errors.append(f"{label}: {exc}")
            _progress(progress, f"Error on episode {label}: {exc}")

    for key in list(log.keys()):
        if key in should_have:
            continue
        try:
            if preview_mode:
                title = (log.get(key) or {}).get("title") or key
                _progress(progress, f"[Preview] Would remove episode overlay: {title}")
                removed += 1
                continue
            episode = episode_by_key.get(key)
            if episode is None:
                try:
                    episode = plex.fetchItem(f"/library/metadata/{key}")
                except Exception:
                    _progress(progress, f"Dropping inaccessible episode log entry {key}")
                    del log[key]
                    removed += 1
                    continue
            if remove_episode_overlay(episode, False, progress, paths=paths):
                del log[key]
                removed += 1
        except Exception as exc:
            errors.append(f"remove episode {key}: {exc}")

    _save_log(paths["episodeLog"], log)
    _progress(
        progress,
        f"New Episode done — eligible {len(should_have)}, added {added}, "
        f"refreshed {refreshed}, removed {removed}, total {len(log)}",
    )
    return {
        "episodesAdded": added,
        "episodesRefreshed": refreshed,
        "episodesSkipped": skipped,
        "episodesRemoved": removed,
        "episodesEligible": len(should_have),
        "episodesTotal": len(log),
        "episodeErrors": errors,
        "episodeLogPath": str(paths["episodeLog"]),
        "episodeOverlayPath": str(paths["episodeOverlay"]),
        "episodePreviewDir": str(paths["previewEpisodes"]),
    }


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

    episode_summary = run_new_episode_overlays(plex, config, paths, preview_mode, progress)
    summary.update(episode_summary)
    if episode_summary.get("episodeErrors"):
        summary["errors"] = [*errors, *episode_summary["episodeErrors"]]

    if preview_mode:
        _progress(
            progress,
            f"Done (preview) — seasons eligible {len(should_have)}, new {added}, refreshed {refreshed}; "
            f"episodes eligible {episode_summary.get('episodesEligible', 0)}, "
            f"new {episode_summary.get('episodesAdded', 0)}, refreshed {episode_summary.get('episodesRefreshed', 0)}",
        )
    else:
        _progress(
            progress,
            f"Done — seasons +{added}/−{removed}; episodes +{episode_summary.get('episodesAdded', 0)}/"
            f"−{episode_summary.get('episodesRemoved', 0)}",
        )
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
    episode_log = _load_log(paths["episodeLog"])
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
    episodes = []
    for key, entry in episode_log.items():
        if not isinstance(entry, dict):
            continue
        episodes.append({
            "ratingKey": key,
            "title": entry.get("title") or key,
            "showTitle": entry.get("showTitle") or "",
            "timestamp": entry.get("timestamp"),
            "airedAt": entry.get("airedAt"),
            "seasonIndex": entry.get("seasonIndex"),
            "episodeIndex": entry.get("episodeIndex"),
            "previewOnly": bool(entry.get("preview_only")),
            "presetId": entry.get("presetId") or "new-episode",
        })
    episodes.sort(key=lambda r: str(r.get("timestamp") or ""), reverse=True)
    return {
        "ok": True,
        "overlayExists": paths["overlay"].exists(),
        "overlayPath": str(paths["overlay"]),
        "episodeOverlayExists": paths["episodeOverlay"].exists(),
        "episodeOverlayPath": str(paths["episodeOverlay"]),
        "logPath": str(paths["log"]),
        "episodeLogPath": str(paths["episodeLog"]),
        "previewDir": str(paths["preview"]),
        "backupsDir": str(paths["backups"]),
        "logCount": len(log),
        "episodeLogCount": len(episode_log),
        "shows": shows,
        "episodes": episodes,
    }


def reset_one(config: dict, rating_key: str, progress: ProgressFn | None = None, kind: str | None = None) -> dict:
    paths = _resolve_paths(config)
    plex = _connect(config)
    key = str(rating_key).strip()
    if not key:
        raise ValueError("ratingKey is required")

    episode_log = _load_log(paths["episodeLog"])
    show_log = _load_log(paths["log"])
    prefer_episode = (kind or "").lower() in {"episode", "episodes", "ep"}
    prefer_show = (kind or "").lower() in {"show", "shows", "season"}

    if prefer_episode or (not prefer_show and key in episode_log):
        item = plex.fetchItem(f"/library/metadata/{key}")
        had_backup = (_episode_backup_dir(paths, key) / "episode.png").exists()
        remove_episode_overlay(item, False, progress, paths=paths)
        _clear_episode_backup(paths, key)
        if key in episode_log:
            del episode_log[key]
            _save_log(paths["episodeLog"], episode_log)
        return {
            "ok": True,
            "kind": "episode",
            "ratingKey": key,
            "title": getattr(item, "title", key),
            "restoredFromBackup": had_backup,
        }

    show = plex.fetchItem(f"/library/metadata/{key}")
    had_backup = (_backup_dir(paths, key) / "show.png").exists()
    remove_show_overlay(show, False, progress, paths=paths)
    _clear_backup_dir(paths, key)
    if key in show_log:
        del show_log[key]
        _save_log(paths["log"], show_log)
    return {
        "ok": True,
        "kind": "show",
        "ratingKey": key,
        "title": getattr(show, "title", key),
        "restoredFromBackup": had_backup,
    }


def reset_all(config: dict, progress: ProgressFn | None = None) -> dict:
    """Reset every show + episode currently logged and clear both logs."""
    paths = _resolve_paths(config)
    plex = _connect(config)
    log = _load_log(paths["log"])
    episode_log = _load_log(paths["episodeLog"])
    keys = list(log.keys())
    episode_keys = list(episode_log.keys())
    removed = 0
    episodes_removed = 0
    restored_from_backup = 0
    failed: list[str] = []
    _progress(progress, f"Resetting {len(keys)} show overlay(s) and {len(episode_keys)} episode overlay(s)…")

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

    for key in episode_keys:
        entry = episode_log.get(key) or {}
        title = entry.get("title") or key
        had_backup = (_episode_backup_dir(paths, key) / "episode.png").exists()
        try:
            episode = plex.fetchItem(f"/library/metadata/{key}")
            remove_episode_overlay(episode, False, progress, paths=paths)
            if had_backup:
                restored_from_backup += 1
            episodes_removed += 1
        except Exception as exc:
            failed.append(f"episode {title}: {exc}")
            _progress(progress, f"Failed to reset episode {title}: {exc}")
        _clear_episode_backup(paths, key)
        if key in episode_log:
            del episode_log[key]

    _save_log(paths["log"], log)
    _save_log(paths["episodeLog"], episode_log)
    summary = {
        "ok": True,
        "requested": len(keys) + len(episode_keys),
        "removed": removed,
        "episodesRemoved": episodes_removed,
        "restoredFromBackup": restored_from_backup,
        "failed": failed,
        "remaining": len(log),
        "episodesRemaining": len(episode_log),
        "backupsDir": str(paths["backups"]),
        "finishedAt": datetime.now().isoformat(),
    }
    _progress(
        progress,
        f"Reset complete — shows {removed}/{len(keys)}, episodes {episodes_removed}/{len(episode_keys)} "
        f"({restored_from_backup} from file backups)",
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


def _samples_dir(paths: dict) -> Path:
    folder = paths["preview"] / "samples"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _placeholder_poster(kind: str) -> Image.Image:
    if kind == "episode":
        return Image.new("RGB", (1280, 720), (28, 32, 48))
    return Image.new("RGB", (1000, 1500), (28, 32, 48))


def _pick_sample_items(plex: PlexServer, config: dict, progress: ProgressFn | None = None):
    """Return (show, episode) candidates with thumbs — small random pulls only."""
    show_candidates: list = []
    episode_candidates: list = []

    for section in _iter_tv_sections(plex, config):
        if len(show_candidates) < 40:
            batch: list = []
            try:
                batch = list(section.search(libtype="show", maxresults=40) or [])
            except Exception:
                batch = []
            if not batch:
                try:
                    batch = list(section.all(container_start=0, container_size=40) or [])
                except TypeError:
                    try:
                        batch = list(section.all()[:40])
                    except Exception as exc:
                        _progress(progress, f"{section.title}: show sample pull failed ({exc})")
                        batch = []
                except Exception as exc:
                    _progress(progress, f"{section.title}: show sample pull failed ({exc})")
                    batch = []
            for item in batch:
                if getattr(item, "thumb", None):
                    show_candidates.append(item)
                    if len(show_candidates) >= 40:
                        break

        if len(episode_candidates) < 40:
            batch = []
            try:
                batch = list(section.search(libtype="episode", maxresults=40) or [])
            except Exception:
                batch = []
            if not batch:
                try:
                    key = str(getattr(section, "key", "") or "").rstrip("/").split("/")[-1]
                    batch = list(
                        plex.fetchItems(
                            f"/library/sections/{key}/all?type=4"
                            f"&X-Plex-Container-Start=0&X-Plex-Container-Size=40"
                        )
                        or []
                    )
                except Exception as exc:
                    _progress(progress, f"{section.title}: episode sample pull failed ({exc})")
                    batch = []
            for item in batch:
                if getattr(item, "thumb", None):
                    episode_candidates.append(item)
                    if len(episode_candidates) >= 40:
                        break

        if len(show_candidates) >= 40 and len(episode_candidates) >= 40:
            break

    random.shuffle(show_candidates)
    random.shuffle(episode_candidates)
    show = show_candidates[0] if show_candidates else None
    episode = episode_candidates[0] if episode_candidates else None
    return show, episode


def generate_overlay_samples(config: dict, progress: ProgressFn | None = None) -> dict:
    """
    Composite New Season / New Episode banners onto random real Plex art
    (or solid placeholders). Writes preview/samples/{show,episode}.png + meta.json.
    Does not mutate live library art or overlay logs.
    """
    paths = _resolve_paths(config)
    samples = _samples_dir(paths)
    preset_id = str(config.get("overlayPresetId") or config.get("overlay_preset_id") or "new-season").strip() or "new-season"

    show_overlay = paths["overlay"]
    episode_overlay = paths["episodeOverlay"]
    if not show_overlay.exists():
        raise FileNotFoundError(f"New Season overlay asset not found: {show_overlay}")
    if not episode_overlay.exists():
        raise FileNotFoundError(f"New Episode overlay asset not found: {episode_overlay}")

    show_banner = Image.open(show_overlay)
    episode_banner = Image.open(episode_overlay)

    show = None
    episode = None
    show_title = "Sample show"
    episode_title = "Sample episode"
    episode_show_title = ""
    show_source = "placeholder"
    episode_source = "placeholder"

    try:
        plex = _connect(config)
        _progress(progress, "Picking random show poster and episode thumb…")
        show, episode = _pick_sample_items(plex, config, progress)
    except Exception as exc:
        plex = None
        _progress(progress, f"Plex unavailable for samples ({exc}) — using placeholders")

    show_img = None
    if show is not None and plex is not None:
        show_title = getattr(show, "title", None) or show_title
        show_img = _download_poster(plex, getattr(show, "thumb", None) or "")
        if show_img is not None:
            show_source = "plex"

    if show_img is None:
        show_img = _placeholder_poster("show")
        _progress(progress, "Using placeholder show poster")

    episode_img = None
    if episode is not None and plex is not None:
        episode_title = getattr(episode, "title", None) or episode_title
        try:
            parent = episode.show()
            episode_show_title = getattr(parent, "title", None) or ""
        except Exception:
            episode_show_title = getattr(episode, "grandparentTitle", None) or ""
        episode_img = _download_poster(plex, getattr(episode, "thumb", None) or "")
        if episode_img is not None:
            episode_source = "plex"

    if episode_img is None:
        episode_img = _placeholder_poster("episode")
        _progress(progress, "Using placeholder episode thumb")

    show_out = _apply_overlay(show_img.copy(), show_banner)
    episode_out = _apply_episode_overlay(episode_img.copy(), episode_banner)

    show_path = samples / "show.png"
    episode_path = samples / "episode.png"
    meta_path = samples / "meta.json"
    show_out.save(show_path)
    episode_out.save(episode_path)

    meta = {
        "showTitle": show_title,
        "episodeTitle": episode_title,
        "showTitleForEp": episode_show_title,
        "generatedAt": datetime.now().isoformat(),
        "presetId": preset_id,
        "showSource": show_source,
        "episodeSource": episode_source,
        "showRatingKey": str(getattr(show, "ratingKey", "") or "") or None,
        "episodeRatingKey": str(getattr(episode, "ratingKey", "") or "") or None,
    }
    meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    _progress(progress, f"Samples ready — show: {show_title}; episode: {episode_show_title or ''} {episode_title}".strip())

    return {
        "ok": True,
        "show": {
            "title": show_title,
            "source": show_source,
            "ratingKey": meta["showRatingKey"],
            "path": str(show_path),
        },
        "episode": {
            "title": episode_title,
            "showTitle": episode_show_title,
            "source": episode_source,
            "ratingKey": meta["episodeRatingKey"],
            "path": str(episode_path),
        },
        "presetId": preset_id,
        "generatedAt": meta["generatedAt"],
        "paths": {
            "show": str(show_path),
            "episode": str(episode_path),
            "meta": str(meta_path),
            "dir": str(samples),
        },
        "meta": meta,
    }
