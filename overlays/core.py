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
    preview.mkdir(parents=True, exist_ok=True)
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
        "log": log_path,
        "overlay": overlay_path,
        "assets": assets_dir,
    }


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


def _iter_shows(plex: PlexServer, config: dict):
    wanted = _section_filter(config)
    for section in plex.library.sections():
        if section.type != "show":
            continue
        section_id = str(getattr(section, "key", "") or "").rstrip("/").split("/")[-1]
        section_key = str(getattr(section, "key", "") or "")
        if wanted is not None:
            titles = {str(section.title)}
            ids = {section_id, section_key}
            if not (wanted & titles) and not (wanted & ids):
                continue
        for show in section.all():
            yield section, show


def scan_library(config: dict, progress: ProgressFn | None = None) -> dict:
    plex = _connect(config)
    days = int(config.get("newSeasonDays") or config.get("new_season_days") or 21)
    cutoff = datetime.now() - timedelta(days=max(1, days))
    skip_kometa = _as_bool(config.get("skipIfKometaOverlayLabel", config.get("skip_if_kometa_overlay_label")), True)
    paths = _resolve_paths(config)
    log = _load_log(paths["log"])

    eligible = []
    skipped = []
    _progress(progress, "Scanning TV libraries…")
    for section, show in _iter_shows(plex, config):
        ok, meta = should_have_overlay(show, cutoff, skip_kometa)
        row = {
            "ratingKey": str(show.ratingKey),
            "title": show.title,
            "library": section.title,
            "libraryKey": str(getattr(section, "key", "") or ""),
            **meta,
            "inLog": str(show.ratingKey) in log,
            "previewOnly": bool((log.get(str(show.ratingKey)) or {}).get("preview_only")),
        }
        if ok:
            eligible.append(row)
        else:
            skipped.append(row)

    return {
        "ok": True,
        "cutoff": cutoff.isoformat(),
        "newSeasonDays": days,
        "eligibleCount": len(eligible),
        "eligible": eligible,
        "logCount": len(log),
        "logKeys": list(log.keys()),
        "toRemove": [k for k in log.keys() if k not in {e["ratingKey"] for e in eligible}],
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

    result = _apply_overlay(show_poster, overlay_img)
    season_result = None
    if getattr(latest, "thumb", None):
        season_poster = _download_poster(plex, latest.thumb)
        if season_poster is not None:
            season_result = _apply_overlay(season_poster, overlay_img)

    safe_title = _sanitize_filename(show.title)
    now = datetime.now()
    entry = {
        "title": show.title,
        "timestamp": now.isoformat(),
        "preview_only": bool(preview_mode),
        "seasonIndex": latest.index,
        "presetId": str(config.get("overlayPresetId") or "new-season"),
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


def remove_show_overlay(show, preview_mode: bool, progress: ProgressFn | None = None) -> bool:
    latest = _latest_season(show)
    if preview_mode:
        _progress(progress, f"[Preview] Would remove overlay: {show.title}")
        return True
    _progress(progress, f"Removing overlay: {show.title}")
    ok = _reset_poster(show)
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
    should_have: set[str] = set()
    meta_by_key: dict[str, dict] = {}
    show_by_key: dict[str, Any] = {}

    _progress(progress, "Scanning for eligible new seasons…")
    for _section, show in _iter_shows(plex, config):
        ok, meta = should_have_overlay(show, cutoff, skip_kometa)
        key = str(show.ratingKey)
        show_by_key[key] = show
        meta_by_key[key] = meta
        if ok:
            should_have.add(key)

    added = 0
    converted = 0
    removed = 0
    errors: list[str] = []

    for key in sorted(should_have):
        show = show_by_key[key]
        existing = log.get(key)
        needs = existing is None or (existing.get("preview_only") and not preview_mode)
        if not needs:
            continue
        try:
            entry = process_show_overlay(plex, show, config, paths, preview_mode, progress)
            if existing and existing.get("preview_only") and not preview_mode:
                converted += 1
            else:
                added += 1
            # preserve unknown fields from previous entry
            if isinstance(existing, dict):
                merged = {**existing, **entry}
                log[key] = merged
            else:
                log[key] = entry
        except Exception as exc:
            errors.append(f"{show.title}: {exc}")
            _progress(progress, f"Error on {show.title}: {exc}")

    for key in list(log.keys()):
        if key in should_have:
            continue
        try:
            show = show_by_key.get(key)
            if show is None:
                try:
                    show = plex.fetchItem(f"/library/metadata/{key}")
                except Exception:
                    _progress(progress, f"Dropping inaccessible log entry {key}")
                    del log[key]
                    removed += 1
                    continue
            if remove_show_overlay(show, preview_mode, progress):
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
        "removed": removed,
        "totalWithOverlays": len(log),
        "eligible": len(should_have),
        "errors": errors,
        "logPath": str(paths["log"]),
        "overlayPath": str(paths["overlay"]),
        "finishedAt": datetime.now().isoformat(),
    }
    _progress(progress, f"Done — added {added}, removed {removed}, total {len(log)}")
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
    preview_mode = _as_bool(config.get("previewMode"), False)
    remove_show_overlay(show, preview_mode, progress)
    if key in log:
        del log[key]
        _save_log(paths["log"], log)
    return {"ok": True, "ratingKey": key, "title": getattr(show, "title", key)}


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
