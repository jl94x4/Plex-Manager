#!/usr/bin/env python3
"""New Season overlay worker — Plex scan, compose, upload, cleanup."""

from __future__ import annotations

import io
import json
import os
import random
import re
import sys
import traceback
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable

import requests
from PIL import Image
from plexapi.server import PlexServer

ProgressFn = Callable[[str], None]

# Sibling imports (tmdb_dates, modes_extra) must resolve even if cwd ≠ this file's dir.
_APP_DIR = str(Path(__file__).resolve().parent)
if _APP_DIR not in sys.path:
    sys.path.insert(0, _APP_DIR)


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
    backups_season_episode = backups / "seasons-episode"
    preview.mkdir(parents=True, exist_ok=True)
    preview_episodes.mkdir(parents=True, exist_ok=True)
    backups.mkdir(parents=True, exist_ok=True)
    backups_episodes.mkdir(parents=True, exist_ok=True)
    backups_season_episode.mkdir(parents=True, exist_ok=True)
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
    custom_dir = Path(
        str(
            config.get("customPresetsDir")
            or config.get("custom_presets_dir")
            or (root / "presets" / "custom")
        )
    )
    custom_dir.mkdir(parents=True, exist_ok=True)
    preset_id = str(config.get("overlayPresetId") or config.get("overlay_preset_id") or "new-season").strip() or "new-season"
    episode_preset_id = str(
        config.get("episodeOverlayPresetId") or config.get("episode_overlay_preset_id") or "new-episode"
    ).strip() or "new-episode"
    if _as_bool(config.get("newSeasonWatchNowStyle", config.get("new_season_watch_now_style")), False):
        preset_id = "new-season-watch-now"
    if _as_bool(config.get("newEpisodeWatchNowStyle", config.get("new_episode_watch_now_style")), False):
        episode_preset_id = "new-episode-watch-now"
    overlay_path = Path(str(config.get("overlayPath") or config.get("overlay_path") or (assets_dir / f"{preset_id}.png")))
    episode_overlay_path = Path(
        str(
            config.get("episodeOverlayPath")
            or config.get("episode_overlay_path")
            or (assets_dir / f"{episode_preset_id}.png")
        )
    )
    # Prefer custom file when path points at missing bundled id but custom exists.
    if not overlay_path.exists():
        custom_hit = custom_dir / f"{preset_id}.png"
        if custom_hit.exists():
            overlay_path = custom_hit
        elif not overlay_path.exists() and (assets_dir / "new-season.png").exists():
            overlay_path = assets_dir / "new-season.png"
    if not episode_overlay_path.exists():
        custom_hit = custom_dir / f"{episode_preset_id}.png"
        if custom_hit.exists():
            episode_overlay_path = custom_hit
        elif (assets_dir / "new-episode.png").exists():
            episode_overlay_path = assets_dir / "new-episode.png"
    return {
        "root": root,
        "preview": preview,
        "previewEpisodes": preview_episodes,
        "backups": backups,
        "backupsEpisodes": backups_episodes,
        "backupsSeasonEpisode": backups_season_episode,
        "log": log_path,
        "episodeLog": episode_log_path,
        "recentlyAddedLog": root / "recently_added_log.json",
        "liveLog": root / "live_log.json",
        "top10Log": root / "top10_log.json",
        "mediaLog": root / "media_log.json",
        "statusLog": root / "status_log.json",
        "ratingsLog": root / "ratings_log.json",
        "networkLog": root / "network_log.json",
        "kometaLog": root / "kometa_overlaid_log.json",
        "overlay": overlay_path,
        "episodeOverlay": episode_overlay_path,
        "assets": assets_dir,
        "customPresets": custom_dir,
        "kometaImages": root / "kometa-images",
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
    width_ratio: float = 0.92,
    max_height_ratio: float | None = None,
    # Only enough to shave the corner radius (~8–10% of banner height). Higher
    # values (e.g. 0.30) cut into the white text.
    bottom_clip_ratio: float = 0.10,
    x: float = 0.5,
    y: float = 1.0,
    anchor_x: str = "center",
    anchor_y: str = "bottom",
) -> Image.Image:
    """
    Composite banner onto art. Default is Netflix-style bottom-center flush
    (rounded bottom corners clipped). Position uses normalized x/y (0–1) with
    anchors matching the Placement editor.
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

    ax = str(anchor_x or "center").strip().lower()
    ay = str(anchor_y or "bottom").strip().lower()
    nx = max(0.0, min(1.0, float(x)))
    ny = max(0.0, min(1.0, float(y)))
    anchor_px = width * nx
    anchor_py = height * ny

    if ax == "left":
        px = int(anchor_px)
    elif ax == "right":
        px = int(anchor_px - new_width)
    else:
        px = int(anchor_px - new_width / 2)

    if ay == "top":
        py = int(anchor_py)
    elif ay == "center":
        py = int(anchor_py - keep_h / 2)
    else:
        py = int(anchor_py - keep_h)

    base_img.paste(cropped, (px, py), cropped)
    return base_img


DEFAULT_PLACEMENT: dict[str, dict[str, Any]] = {
    "show": {
        "x": 0.5,
        "y": 1.0,
        "width": 0.92,
        "anchorX": "center",
        "anchorY": "bottom",
        "bottomClip": 0.10,
    },
    "season": {
        "x": 0.5,
        "y": 1.0,
        "width": 0.70,
        "maxHeight": 0.14,
        "anchorX": "center",
        "anchorY": "bottom",
        "bottomClip": 0.10,
    },
    "episode": {
        "x": 0.5,
        "y": 1.0,
        "width": 0.55,
        "maxHeight": 0.20,
        "anchorX": "center",
        "anchorY": "bottom",
        "bottomClip": 0.10,
    },
    "media": {
        "x": 0.015,
        "y": 0.01,
        "width": 0.305,
        "maxHeight": 0.18,
        "anchorX": "left",
        "anchorY": "top",
        "bottomClip": 0.0,
    },
    "status": {
        "x": 0.015,
        "y": 0.22,
        "width": 0.305,
        "maxHeight": 0.09,
        "anchorX": "left",
        "anchorY": "top",
        "bottomClip": 0.0,
    },
    "ratings": {
        "x": 0.985,
        "y": 0.50,
        "width": 0.16,
        "maxHeight": 0.14,
        "anchorX": "right",
        "anchorY": "center",
        "bottomClip": 0.0,
    },
    "network": {
        "x": 0.015,
        "y": 0.66,
        "width": 0.305,
        "maxHeight": 0.09,
        "anchorX": "left",
        "anchorY": "bottom",
        "bottomClip": 0.0,
    },
}


def _placement_for(config: dict | None, kind: str) -> dict[str, Any]:
    defaults = DEFAULT_PLACEMENT.get(kind) or DEFAULT_PLACEMENT["show"]
    raw_root = (config or {}).get("placement") if isinstance(config, dict) else None
    raw = (raw_root or {}).get(kind) if isinstance(raw_root, dict) else None
    if not isinstance(raw, dict):
        return dict(defaults)
    out = dict(defaults)
    for key in ("x", "y", "width", "bottomClip", "maxHeight"):
        if key in raw and raw[key] is not None:
            try:
                out[key] = float(raw[key])
            except (TypeError, ValueError):
                pass
    for src, dst in (("bottom_clip", "bottomClip"), ("max_height", "maxHeight"), ("anchor_x", "anchorX"), ("anchor_y", "anchorY")):
        if src in raw and raw[src] is not None and dst not in raw:
            if dst in ("anchorX", "anchorY"):
                out[dst] = str(raw[src])
            else:
                try:
                    out[dst] = float(raw[src])
                except (TypeError, ValueError):
                    pass
    if raw.get("anchorX") is not None:
        out["anchorX"] = str(raw["anchorX"])
    if raw.get("anchorY") is not None:
        out["anchorY"] = str(raw["anchorY"])
    return out


# Corner ribbons are authored for the top-right; ignore bottom-banner placement.
CORNER_RIBBON_PLACEMENT: dict[str, dict[str, Any]] = {
    "show": {
        "x": 1.0,
        "y": 0.0,
        "width": 0.55,
        "anchorX": "right",
        "anchorY": "top",
        "bottomClip": 0.0,
    },
    "season": {
        "x": 1.0,
        "y": 0.0,
        "width": 0.55,
        "anchorX": "right",
        "anchorY": "top",
        "bottomClip": 0.0,
    },
    "episode": {
        "x": 1.0,
        "y": 0.0,
        "width": 0.42,
        "maxHeight": 0.42,
        "anchorX": "right",
        "anchorY": "top",
        "bottomClip": 0.0,
    },
}


def _is_corner_ribbon_preset(preset_id: str | None) -> bool:
    return "corner-ribbon" in str(preset_id or "").lower()


def _is_season_chip_preset(preset_id: str | None) -> bool:
    pid = str(preset_id or "").lower().replace("_", "-")
    return pid in {"season-chip", "seasonchip", "s-chip"} or pid.endswith("season-chip")


def _effective_placement(config: dict | None, kind: str, preset_id: str | None = None) -> dict[str, Any]:
    if _is_corner_ribbon_preset(preset_id):
        return dict(CORNER_RIBBON_PLACEMENT.get(kind) or CORNER_RIBBON_PLACEMENT["show"])
    if _is_season_chip_preset(preset_id) and kind == "show":
        return {
            "x": 0.5,
            "y": 1.0,
            "width": 0.34,
            "anchorX": "center",
            "anchorY": "bottom",
            "bottomClip": 0.0,
        }
    return _placement_for(config, kind)


def _find_font(size: int):
    candidates = [
        Path(r"C:\Windows\Fonts\arialbd.ttf"),
        Path(r"C:\Windows\Fonts\segoeuib.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        Path("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
    ]
    try:
        from PIL import ImageFont
    except Exception:
        return None
    for path in candidates:
        if path.exists():
            try:
                return ImageFont.truetype(str(path), size)
            except Exception:
                continue
    try:
        from PIL import ImageFont
        return ImageFont.load_default()
    except Exception:
        return None


def _render_season_chip(season_index: int | None) -> Image.Image:
    """Dynamic S{n} chip for the season-chip preset."""
    from PIL import ImageDraw

    label = f"S{int(season_index)}" if season_index is not None else "S#"
    w, h = 420, 140
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad_x, pad_y = 24, 18
    box = [pad_x, pad_y, w - pad_x, h - pad_y]
    radius = (box[3] - box[1]) // 2
    draw.rounded_rectangle(box, radius=radius, fill=(229, 9, 20, 255))
    font = _find_font(max(36, int((box[3] - box[1]) * 0.62)))
    if font is None:
        return img
    tb = draw.textbbox((0, 0), label, font=font)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    cx = (box[0] + box[2]) / 2
    cy = (box[1] + box[3]) / 2
    draw.text((cx - tw / 2 - tb[0], cy - th / 2 - tb[1]), label, font=font, fill=(255, 255, 255, 255))
    return img


def _load_show_overlay_image(config: dict | None, paths: dict, season_index: int | None = None) -> Image.Image:
    preset_id = str((config or {}).get("overlayPresetId") or (config or {}).get("overlay_preset_id") or "new-season")
    if _is_season_chip_preset(preset_id):
        return _render_season_chip(season_index)
    path = paths["overlay"]
    if not path.exists():
        raise FileNotFoundError(f"Overlay asset not found: {path}")
    return Image.open(path)


def _load_episode_overlay_image(config: dict | None, paths: dict) -> Image.Image:
    path = paths["episodeOverlay"]
    if not path.exists():
        raise FileNotFoundError(f"Episode overlay asset not found: {path}")
    return Image.open(path)


def _apply_with_placement(
    base_img: Image.Image,
    overlay_img: Image.Image,
    placement: dict[str, Any],
) -> Image.Image:
    max_h = placement.get("maxHeight")
    max_height_ratio = float(max_h) if max_h is not None else None
    return _apply_overlay(
        base_img,
        overlay_img,
        width_ratio=float(placement.get("width") or 0.92),
        max_height_ratio=max_height_ratio,
        bottom_clip_ratio=float(placement.get("bottomClip") or 0.10),
        x=float(placement.get("x") if placement.get("x") is not None else 0.5),
        y=float(placement.get("y") if placement.get("y") is not None else 1.0),
        anchor_x=str(placement.get("anchorX") or "center"),
        anchor_y=str(placement.get("anchorY") or "bottom"),
    )


def _apply_episode_overlay(
    base_img: Image.Image,
    overlay_img: Image.Image,
    config: dict | None = None,
) -> Image.Image:
    """Readable New Episode badge on landscape thumbs (sized for small Plex grids)."""
    preset = str((config or {}).get("episodeOverlayPresetId") or (config or {}).get("episode_overlay_preset_id") or "new-episode")
    return _apply_with_placement(
        base_img,
        overlay_img,
        _effective_placement(config, "episode", preset),
    )


def _apply_season_episode_overlay(
    base_img: Image.Image,
    overlay_img: Image.Image,
    config: dict | None = None,
) -> Image.Image:
    """New Episode banner on portrait season posters."""
    preset = str((config or {}).get("episodeOverlayPresetId") or (config or {}).get("episode_overlay_preset_id") or "new-episode")
    return _apply_with_placement(
        base_img,
        overlay_img,
        _effective_placement(config, "season", preset),
    )


def _apply_show_overlay(
    base_img: Image.Image,
    overlay_img: Image.Image,
    config: dict | None = None,
) -> Image.Image:
    """New Season banner on show posters."""
    preset = str((config or {}).get("overlayPresetId") or (config or {}).get("overlay_preset_id") or "new-season")
    return _apply_with_placement(
        base_img,
        overlay_img,
        _effective_placement(config, "show", preset),
    )


def _download_poster(plex: PlexServer, thumb_path: str) -> Image.Image | None:
    if not thumb_path:
        return None
    try:
        token = getattr(plex, "_token", None) or ""
        base = str(getattr(plex, "_baseurl", "") or "").rstrip("/")
        raw = str(thumb_path).strip()
        if raw.startswith("http://") or raw.startswith("https://"):
            url = raw
            if token and "X-Plex-Token=" not in url:
                url = f"{url}{'&' if '?' in url else '?'}X-Plex-Token={token}"
        else:
            if not raw.startswith("/"):
                raw = f"/{raw}"
            url = f"{base}{raw}"
            if token:
                url = f"{url}{'&' if '?' in url else '?'}X-Plex-Token={token}"
        response = requests.get(url, timeout=60)
        if response.status_code != 200 or not response.content:
            return None
        img = Image.open(io.BytesIO(response.content))
        img.load()
        return img.convert("RGBA")
    except Exception:
        return None


def _item_poster_image(plex: PlexServer, item) -> Image.Image | None:
    """Download show/episode art, trying thumb then provider posters."""
    if item is None or plex is None:
        return None
    thumb = getattr(item, "thumb", None) or ""
    img = _download_poster(plex, thumb)
    if img is not None:
        return img
    try:
        posters = list(item.posters() or [])
    except Exception:
        posters = []
    for poster in posters[:5]:
        key = getattr(poster, "key", None) or getattr(poster, "thumb", None) or ""
        img = _download_poster(plex, str(key))
        if img is not None:
            return img
    return None


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


def _library_title(item) -> str:
    """Best-effort library/section title for log/UI columns."""
    for attr in ("librarySectionTitle", "sectionTitle"):
        value = getattr(item, attr, None)
        if value:
            return str(value)
    try:
        section = getattr(item, "section", None)
        if callable(section):
            sec = section()
            title = getattr(sec, "title", None)
            if title:
                return str(title)
    except Exception:
        pass
    return ""


def should_have_overlay(
    show,
    cutoff: datetime,
    skip_kometa: bool,
    resolver=None,
) -> tuple[bool, dict]:
    meta = {"seasonIndex": None, "airedAt": None, "reason": None, "airDateSource": None}
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
        if not episode1:
            meta["reason"] = "no_air_date"
            return False, meta
        plex_aired = _as_datetime(getattr(episode1, "originallyAvailableAt", None))
        aired = plex_aired
        source = "plex" if aired is not None else None
        if aired is None and resolver is not None:
            aired = resolver.resolve_episode_aired(episode1, show)
            if aired is not None:
                source = "tmdb"
        if aired is None:
            meta["reason"] = "no_air_date"
            return False, meta
        meta["airedAt"] = aired.isoformat()
        meta["airDateSource"] = source
        if aired < cutoff:
            meta["reason"] = "aged_out"
            return False, meta
        return True, meta
    except Exception as exc:
        meta["reason"] = f"error:{exc}"
        return False, meta


def _section_filter(config: dict, override_ids: list | None = None) -> set[str] | None:
    raw = override_ids if override_ids is not None else (
        config.get("librarySectionIds") or config.get("library_section_ids") or []
    )
    if not isinstance(raw, list) or not raw:
        return None
    return {str(x).strip() for x in raw if str(x).strip()}


def _read_section_id_list(config: dict, *keys: str) -> list[str] | None:
    """Return the first non-empty id list among keys, or None (= unset / all)."""
    if not isinstance(config, dict):
        return None
    for key in keys:
        raw = config.get(key)
        if isinstance(raw, list) and raw:
            out = [str(x).strip() for x in raw if str(x).strip()]
            if out:
                return out
    return None


def _bundle_section_ids(config: dict, bundle: str | None) -> list[str] | None:
    """
    Resolve library scope for a run bundle.
    None means all libraries of the requested type(s).
    Order: per-run list → Advanced librarySectionIds → all.
    """
    name = str(bundle or "").strip().lower()
    if name in {"core", "banners"}:
        return _read_section_id_list(
            config,
            "coreLibrarySectionIds",
            "core_library_section_ids",
            "librarySectionIds",
            "library_section_ids",
        )
    if name in {"recently", "recently_added", "recently-added"}:
        return _read_section_id_list(
            config,
            "recentlyAddedLibrarySectionIds",
            "recently_added_library_section_ids",
            "librarySectionIds",
            "library_section_ids",
        )
    if name in {"kometa", "media"}:
        return _read_section_id_list(
            config,
            "kometaLibrarySectionIds",
            "kometa_library_section_ids",
            "librarySectionIds",
            "library_section_ids",
        )
    return _read_section_id_list(config, "librarySectionIds", "library_section_ids")


def _section_ids(section) -> set[str]:
    section_id = str(getattr(section, "key", "") or "").rstrip("/").split("/")[-1]
    section_key = str(getattr(section, "key", "") or "")
    titles = {str(section.title)}
    return {section_id, section_key, *titles}


def _iter_sections(
    plex: PlexServer,
    config: dict,
    *,
    types: tuple[str, ...] = ("show",),
    section_ids: list | None = None,
):
    """Yield library sections matching type(s) and optional section id filter."""
    wanted = _section_filter(config, override_ids=section_ids)
    allowed = {str(t).lower() for t in types}
    for section in plex.library.sections():
        stype = str(getattr(section, "type", "") or "").lower()
        if stype not in allowed:
            continue
        ids = _section_ids(section)
        if wanted is not None and not (wanted & ids):
            continue
        yield section


def _iter_tv_sections(plex: PlexServer, config: dict, *, bundle: str = "core"):
    """TV libraries for a run bundle. Empty per-run scope falls back to Advanced, then all."""
    ids = _bundle_section_ids(config, bundle)
    yield from _iter_sections(plex, config, types=("show",), section_ids=ids if ids is not None else [])


def _iter_movie_sections(plex: PlexServer, config: dict, *, bundle: str = "kometa"):
    ids = _bundle_section_ids(config, bundle)
    yield from _iter_sections(plex, config, types=("movie",), section_ids=ids if ids is not None else [])


def _title_allowed(rating_key: str, allow: list | None, deny: list | None) -> bool:
    key = str(rating_key or "").strip()
    if not key:
        return False
    deny_set = {str(x).strip() for x in (deny or []) if str(x).strip()}
    if key in deny_set:
        return False
    allow_list = [str(x).strip() for x in (allow or []) if str(x).strip()]
    if not allow_list:
        return True
    return key in set(allow_list)


def _mode_section_ids(config: dict, mode: str) -> list | None:
    """Per-family library override; falls back to kometa run scope (empty = all)."""
    key_map = {
        "media": ("mediaInfoLibrarySectionIds", "media_info_library_section_ids"),
        "status": ("statusLibrarySectionIds", "status_library_section_ids"),
        "ratings": ("ratingsLibrarySectionIds", "ratings_library_section_ids"),
        "network": ("networkLibrarySectionIds", "network_library_section_ids"),
        "streaming": ("streamingLibrarySectionIds", "streaming_library_section_ids"),
        "ribbon": ("ribbonLibrarySectionIds", "ribbon_library_section_ids"),
    }
    camel, snake = key_map.get(mode, (None, None))
    if camel:
        family = _read_section_id_list(config, camel, snake)
        if family is not None:
            return family
    return _bundle_section_ids(config, "kometa")


def _iter_shows(plex: PlexServer, config: dict):
    for section in _iter_tv_sections(plex, config, bundle="core"):
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


def _search_recently_added_episodes(section, cutoff: datetime, *, max_results: int = 250):
    """Episodes recently added to Plex — used to catch titles with missing air dates."""
    plex = getattr(section, "_server", None)
    section_id = str(getattr(section, "key", "") or "").rstrip("/").split("/")[-1]
    candidates: list = []

    try:
        candidates = list(section.recentlyAdded(maxresults=max_results, libtype="episode") or [])
    except TypeError:
        try:
            candidates = list(section.recentlyAdded(maxresults=max_results) or [])
            candidates = [
                item for item in candidates
                if str(getattr(item, "type", "") or getattr(item, "TYPE", "") or "").lower() == "episode"
            ]
        except Exception:
            candidates = []
    except Exception:
        candidates = []

    if not candidates and plex is not None and section_id:
        try:
            # Unix seconds — Plex addedAt filter
            ts = int(cutoff.timestamp())
            key = f"/library/sections/{section_id}/all?type=4&addedAt>={ts}&sort=addedAt:desc"
            candidates = list(plex.fetchItems(key) or [])
        except Exception:
            candidates = []

    out = []
    for ep in candidates or []:
        added = _as_datetime(getattr(ep, "addedAt", None))
        if added is not None and added < cutoff:
            continue
        out.append(ep)
    return out[:max_results]


def discover_eligible_shows(
    plex: PlexServer,
    config: dict,
    cutoff: datetime,
    skip_kometa: bool,
    progress: ProgressFn | None = None,
    resolver=None,
) -> tuple[set[str], dict[str, dict], dict[str, Any]]:
    """
    Return (should_have_keys, meta_by_key, show_by_key) for shows whose *latest*
    season premiere (E01) falls inside the new-season window.
    """
    should_have: set[str] = set()
    meta_by_key: dict[str, dict] = {}
    show_by_key: dict[str, Any] = {}
    window_days = max(1, (datetime.now() - cutoff).days)

    tv_sections = list(_iter_tv_sections(plex, config, bundle="core"))
    if not tv_sections:
        _progress(progress, "No TV libraries in Banners (core) scope (check the library selector on this card).")

    for section in tv_sections:
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
                source = "plex" if aired is not None else None
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
                    "airDateSource": source,
                    "reason": None,
                    "library": section.title,
                }

            # TMDB fallback: recently-added E01s missing Plex air dates.
            if resolver is not None and getattr(resolver, "active", False):
                try:
                    recent = _search_recently_added_episodes(section, cutoff, max_results=200)
                except Exception as exc:
                    _progress(progress, f"{section.title}: TMDB premiere fallback scan failed ({exc})")
                    recent = []
                e01s = [
                    ep for ep in recent
                    if getattr(ep, "index", None) in (1, "1")
                    and _as_datetime(getattr(ep, "originallyAvailableAt", None)) is None
                ]
                if e01s:
                    _progress(
                        progress,
                        f"{section.title}: TMDB fallback checking {len(e01s)} undated E01(s)…",
                    )
                for ep in e01s:
                    try:
                        show = ep.show()
                        season = ep.season()
                    except Exception:
                        continue
                    key = str(getattr(show, "ratingKey", "") or "")
                    if not key or key in should_have:
                        continue
                    if skip_kometa and _has_kometa_overlay_label(show):
                        continue
                    try:
                        latest = _latest_season(show)
                    except Exception:
                        continue
                    if latest is None or str(latest.ratingKey) != str(season.ratingKey):
                        continue
                    aired = resolver.resolve_episode_aired(ep, show)
                    if aired is None or aired < cutoff:
                        continue
                    should_have.add(key)
                    show_by_key[key] = show
                    meta_by_key[key] = {
                        "seasonIndex": latest.index,
                        "airedAt": aired.isoformat(),
                        "airDateSource": "tmdb",
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
            ok, meta = should_have_overlay(show, cutoff, skip_kometa, resolver=resolver)
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
    from tmdb_dates import create_resolver_from_config
    resolver = create_resolver_from_config(config, paths=paths, progress=progress)

    should_have, meta_by_key, show_by_key = discover_eligible_shows(
        plex, config, cutoff, skip_kometa, progress, resolver=resolver
    )
    resolver.save()

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


def _season_episode_log_key(show_key: str) -> str:
    return f"season:{show_key}"


def _is_season_episode_log_key(key: str) -> bool:
    return str(key or "").startswith("season:")


def process_show_overlay(
    plex: PlexServer,
    show,
    config: dict,
    paths: dict,
    preview_mode: bool,
    progress: ProgressFn | None = None,
    library: str | None = None,
) -> dict:
    """New Season — show poster only (Phase 3). Season art is handled by New Episode."""
    latest = _latest_season(show)
    if not latest:
        raise ValueError(f"No seasons for {show.title}")

    overlay_img = _load_show_overlay_image(config, paths, season_index=getattr(latest, "index", None))

    show_poster = _download_poster(plex, getattr(show, "thumb", None) or "")
    if show_poster is None:
        raise RuntimeError(f"Failed to download show poster for {show.title}")

    # Capture show original only (live runs). Keep any legacy season.png for migration reset.
    if not preview_mode:
        saved = _save_original_backups(
            paths,
            str(show.ratingKey),
            show_poster,
            None,
            meta={
                "title": show.title,
                "seasonIndex": latest.index,
                "ratingKey": str(show.ratingKey),
                "savedAt": datetime.now().isoformat(),
                "mode": "new-season-show-only",
            },
        )
        if saved["show"]:
            _progress(progress, f"Backed up original show poster: {show.title}")

    result = _apply_show_overlay(show_poster.copy(), overlay_img, config)

    safe_title = _sanitize_filename(show.title)
    now = datetime.now()
    entry = {
        "title": show.title,
        "timestamp": now.isoformat(),
        "preview_only": bool(preview_mode),
        "seasonIndex": latest.index,
        "presetId": str(config.get("overlayPresetId") or "new-season"),
        "hasBackup": (_backup_dir(paths, str(show.ratingKey)) / "show.png").exists(),
        "targets": ["show"],
        "library": (library or _library_title(show) or "").strip(),
    }

    if preview_mode:
        show_path = paths["preview"] / f"{safe_title}_show.png"
        result.save(show_path)
        entry["previewShow"] = str(show_path)
        _progress(progress, f"Preview saved: {show.title}")
    else:
        temp_show = paths["preview"] / f"temp_{safe_title}_show.png"
        result.save(temp_show)
        try:
            show.uploadPoster(filepath=str(temp_show))
            _progress(progress, f"Uploaded show poster: {show.title}")
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
    # Legacy New Season also stamped season posters — reset latest season if present.
    latest = _latest_season(show)
    if latest:
        _reset_poster(latest)
    return ok


def _season_episode_backup_dir(paths: dict, show_key: str) -> Path:
    return paths["backupsSeasonEpisode"] / str(show_key)


def _save_season_episode_backup(paths: dict, show_key: str, season_img: Image.Image, meta: dict | None = None) -> bool:
    folder = _season_episode_backup_dir(paths, show_key)
    season_path = folder / "season.png"
    meta_path = folder / "meta.json"
    folder.mkdir(parents=True, exist_ok=True)
    saved = False
    if not season_path.exists():
        season_img.convert("RGBA").save(season_path)
        saved = True
    if meta and not meta_path.exists():
        meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return saved


def _clear_season_episode_backup(paths: dict, show_key: str) -> None:
    folder = _season_episode_backup_dir(paths, show_key)
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


def _restore_season_episode_from_backup(show, paths: dict, show_key: str, progress: ProgressFn | None = None) -> bool:
    folder = _season_episode_backup_dir(paths, show_key)
    season_path = folder / "season.png"
    if not season_path.exists():
        return False
    season_index = None
    meta_path = folder / "meta.json"
    if meta_path.exists():
        try:
            season_index = json.loads(meta_path.read_text(encoding="utf-8")).get("seasonIndex")
        except Exception:
            season_index = None
    season_item = _latest_season(show)
    if season_index is not None:
        try:
            for season in show.seasons():
                if season.index == season_index:
                    season_item = season
                    break
        except Exception:
            pass
    if season_item is None:
        return False
    try:
        season_item.uploadPoster(filepath=str(season_path))
        _progress(progress, f"Restored season poster from New Episode backup: {getattr(show, 'title', show_key)}")
        _clear_season_episode_backup(paths, show_key)
        return True
    except Exception as exc:
        _progress(progress, f"Season New Episode restore failed for {show_key}: {exc}")
        return False


def process_season_new_episode_overlay(
    plex: PlexServer,
    show,
    paths: dict,
    preview_mode: bool,
    progress: ProgressFn | None = None,
    config: dict | None = None,
) -> dict:
    """Stamp latest season poster with New Episode banner when the show has eligible new eps."""
    overlay_img = _load_episode_overlay_image(config, paths)
    latest = _latest_season(show)
    if not latest:
        raise ValueError(f"No seasons for {getattr(show, 'title', '')}")
    season_poster = _download_poster(plex, getattr(latest, "thumb", None) or "")
    if season_poster is None:
        raise RuntimeError(f"Failed to download season poster for {show.title}")

    show_key = str(show.ratingKey)
    if not preview_mode:
        saved = _save_season_episode_backup(
            paths,
            show_key,
            season_poster,
            meta={
                "title": show.title,
                "seasonIndex": latest.index,
                "ratingKey": show_key,
                "savedAt": datetime.now().isoformat(),
                "mode": "new-episode-season",
            },
        )
        if saved:
            _progress(progress, f"Backed up season poster (New Episode): {show.title} S{latest.index}")

    result = _apply_season_episode_overlay(season_poster.copy(), overlay_img, config)
    safe = _sanitize_filename(f"{show.title}_S{latest.index}_ne")
    now = datetime.now()
    preset = "new-episode"
    if config:
        preset = str(config.get("episodeOverlayPresetId") or config.get("episode_overlay_preset_id") or preset)
    entry = {
        "kind": "seasonEpisode",
        "title": f"{show.title} — S{latest.index}",
        "showTitle": show.title,
        "showKey": show_key,
        "seasonIndex": latest.index,
        "timestamp": now.isoformat(),
        "preview_only": bool(preview_mode),
        "presetId": preset,
        "hasBackup": (_season_episode_backup_dir(paths, show_key) / "season.png").exists(),
        "library": _library_title(show),
    }

    if preview_mode:
        out = paths["preview"] / f"{safe}_season_ne.png"
        result.save(out)
        entry["previewSeason"] = str(out)
        _progress(progress, f"Preview season New Episode: {show.title} S{latest.index}")
    else:
        temp = paths["preview"] / f"temp_{safe}_season_ne.png"
        result.save(temp)
        try:
            latest.uploadPoster(filepath=str(temp))
            _progress(progress, f"Uploaded season New Episode: {show.title} S{latest.index}")
        finally:
            if temp.exists():
                temp.unlink()
    return entry


def remove_season_new_episode_overlay(show, preview_mode: bool, progress: ProgressFn | None = None, paths: dict | None = None) -> bool:
    show_key = str(getattr(show, "ratingKey", "") or "")
    title = getattr(show, "title", show_key)
    if preview_mode:
        _progress(progress, f"[Preview] Would remove season New Episode overlay: {title}")
        return True
    _progress(progress, f"Removing season New Episode overlay: {title}")
    if paths is not None and show_key:
        if _restore_season_episode_from_backup(show, paths, show_key, progress):
            return True
    latest = _latest_season(show)
    if latest:
        _progress(progress, f"No season-NE backup for {title} — falling back to Plex poster list")
        return _reset_poster(latest)
    return False


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
    resolver=None,
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

    def _add_episode(ep, section_title: str, aired: datetime, source: str) -> None:
        key = str(getattr(ep, "ratingKey", "") or "")
        if not key or key in should_have:
            return
        try:
            show = ep.show()
        except Exception:
            show = None
        if skip_kometa and show is not None and _has_kometa_overlay_label(show):
            return
        if skip_kometa and _has_kometa_overlay_label(ep):
            return
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
            "airDateSource": source,
            "library": section_title,
        }

    tv_sections = list(_iter_tv_sections(plex, config, bundle="core"))
    if not tv_sections:
        _progress(progress, "No TV libraries in Banners (core) scope (check the library selector on this card).")

    for section in tv_sections:
        _progress(progress, f"Scanning {section.title} for new episodes…")
        try:
            episodes = _search_recent_episodes(section, cutoff)
        except Exception as exc:
            _progress(progress, f"{section.title}: episode search failed ({exc})")
            episodes = []
        _progress(
            progress,
            f"{section.title}: {len(episodes)} episode(s) in the last {window_days} day(s)",
        )
        for idx, ep in enumerate(episodes, start=1):
            if idx == 1 or idx % 25 == 0 or idx == len(episodes):
                _progress(progress, f"{section.title}: checking episode {idx}/{len(episodes)}…")
            aired = _as_datetime(getattr(ep, "originallyAvailableAt", None))
            if aired is None or aired < cutoff:
                continue
            _add_episode(ep, section.title, aired, "plex")

        if resolver is not None and getattr(resolver, "active", False):
            try:
                recent = _search_recently_added_episodes(section, cutoff, max_results=250)
            except Exception as exc:
                _progress(progress, f"{section.title}: TMDB episode fallback scan failed ({exc})")
                recent = []
            undated = [
                ep for ep in recent
                if _as_datetime(getattr(ep, "originallyAvailableAt", None)) is None
                and str(getattr(ep, "ratingKey", "") or "") not in should_have
            ]
            if undated:
                _progress(
                    progress,
                    f"{section.title}: TMDB fallback checking {len(undated)} undated episode(s)…",
                )
            for ep in undated:
                try:
                    show = ep.show()
                except Exception:
                    show = None
                aired = resolver.resolve_episode_aired(ep, show)
                if aired is None or aired < cutoff:
                    continue
                _add_episode(ep, section.title, aired, "tmdb")

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
    config: dict | None = None,
) -> dict:
    overlay_img = _load_episode_overlay_image(config, paths)
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

    result = _apply_episode_overlay(thumb.copy(), overlay_img, config)
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
        "presetId": str(
            (meta.get("presetId") if meta else None)
            or "new-episode"
        ),
        "showKey": meta.get("showKey") or "",
        "library": (meta.get("library") or _library_title(episode) or "").strip(),
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
    resolver=None,
) -> dict:
    if not _as_bool(config.get("newEpisodeEnabled", config.get("new_episode_enabled")), True):
        _progress(progress, "New Episode overlays disabled — pruning tracked stamps…")
        log = _load_log(paths["episodeLog"])
        removed = 0
        season_removed = 0
        errors: list[str] = []
        for key in list(log.keys()):
            entry = log.get(key) or {}
            try:
                if preview_mode:
                    if bool(entry.get("preview_only")):
                        del log[key]
                        removed += 1
                    continue
                if _is_season_episode_log_key(key):
                    show_key = str(key).split(":", 1)[-1]
                    try:
                        show = plex.fetchItem(f"/library/metadata/{show_key}")
                    except Exception:
                        del log[key]
                        season_removed += 1
                        continue
                    remove_season_new_episode_overlay(show, False, progress, paths=paths)
                    del log[key]
                    season_removed += 1
                    continue
                try:
                    episode = plex.fetchItem(f"/library/metadata/{key}")
                except Exception:
                    del log[key]
                    removed += 1
                    continue
                remove_episode_overlay(episode, False, progress, paths=paths)
                del log[key]
                removed += 1
            except Exception as exc:
                errors.append(f"episode disable-remove {key}: {exc}")
        _save_log(paths["episodeLog"], log)
        return {
            "episodesAdded": 0,
            "episodesRefreshed": 0,
            "episodesSkipped": 0,
            "episodesRemoved": removed,
            "episodesEligible": 0,
            "episodesTotal": len(log),
            "seasonStampsAdded": 0,
            "seasonStampsRemoved": season_removed,
            "episodeErrors": errors,
            "newEpisodeEnabled": False,
        }

    days = int(config.get("newEpisodeDays") or config.get("new_episode_days") or 6)
    cutoff = datetime.now() - timedelta(days=max(1, min(30, days)))
    skip_kometa = _as_bool(config.get("skipIfKometaOverlayLabel", config.get("skip_if_kometa_overlay_label")), True)
    log = _load_log(paths["episodeLog"])
    episode_preset = str(
        config.get("episodeOverlayPresetId") or config.get("episode_overlay_preset_id") or "new-episode"
    )

    _progress(progress, f"Scanning for new episodes (window {max(1, min(30, days))} days)…")
    if resolver is None:
        from tmdb_dates import create_resolver_from_config
        resolver = create_resolver_from_config(config, paths=paths, progress=progress)
        owns_resolver = True
    else:
        owns_resolver = False
    should_have, episode_by_key, meta_by_key = discover_new_episodes(
        plex, config, cutoff, skip_kometa, progress, resolver=resolver
    )

    added = 0
    refreshed = 0
    skipped = 0
    removed = 0
    season_added = 0
    season_removed = 0
    errors: list[str] = []

    for key in sorted(should_have):
        episode = episode_by_key[key]
        meta = {**(meta_by_key.get(key) or {}), "presetId": episode_preset}
        existing = log.get(key)
        try:
            if preview_mode:
                entry = process_episode_overlay(plex, episode, meta, paths, True, progress, config=config)
                if existing is None:
                    log[key] = entry
                    added += 1
                else:
                    log[key] = {**existing, **entry} if isinstance(existing, dict) else entry
                    refreshed += 1
                continue

            needs = existing is None or bool(existing.get("preview_only"))
            if not needs:
                lib = str(meta.get("library") or "").strip()
                if lib and isinstance(existing, dict) and not existing.get("library"):
                    log[key] = {**existing, "library": lib}
                skipped += 1
                continue

            entry = process_episode_overlay(plex, episode, meta, paths, False, progress, config=config)
            added += 1
            if isinstance(existing, dict):
                log[key] = {**existing, **entry}
            else:
                log[key] = entry
        except Exception as exc:
            label = f"{meta.get('showTitle') or ''} {meta.get('title') or key}".strip()
            errors.append(f"{label}: {exc}")
            _progress(progress, f"Error on episode {label}: {exc}")

    # Season posters: one New Episode stamp per show that still has eligible episodes.
    shows_needing_season: dict[str, Any] = {}
    for key in should_have:
        meta = meta_by_key.get(key) or {}
        show_key = str(meta.get("showKey") or "")
        if not show_key or show_key in shows_needing_season:
            continue
        ep = episode_by_key.get(key)
        show = None
        if ep is not None:
            try:
                show = ep.show()
            except Exception:
                show = None
        if show is None:
            try:
                show = plex.fetchItem(f"/library/metadata/{show_key}")
            except Exception:
                continue
        shows_needing_season[show_key] = show

    for show_key, show in shows_needing_season.items():
        log_key = _season_episode_log_key(show_key)
        existing = log.get(log_key)
        try:
            if preview_mode:
                entry = process_season_new_episode_overlay(
                    plex, show, paths, True, progress, config=config
                )
                if existing is None:
                    log[log_key] = entry
                    season_added += 1
                continue
            needs = existing is None or bool(existing.get("preview_only"))
            if not needs:
                continue
            entry = process_season_new_episode_overlay(
                plex, show, paths, False, progress, config=config
            )
            season_added += 1
            log[log_key] = {**(existing or {}), **entry} if isinstance(existing, dict) else entry
        except Exception as exc:
            errors.append(f"season {getattr(show, 'title', show_key)}: {exc}")
            _progress(progress, f"Error on season New Episode {show_key}: {exc}")

    needed_season_keys = {_season_episode_log_key(k) for k in shows_needing_season}

    for key in list(log.keys()):
        if key in should_have or key in needed_season_keys:
            continue
        entry = log.get(key) or {}
        try:
            if _is_season_episode_log_key(key):
                show_key = key.split(":", 1)[-1]
                title = entry.get("title") or show_key
                if preview_mode:
                    if bool(entry.get("preview_only")):
                        del log[key]
                        season_removed += 1
                        _progress(progress, f"[Preview] Dropped tracked season New Episode: {title}")
                    else:
                        _progress(progress, f"[Preview] Would remove season New Episode: {title}")
                        season_removed += 1
                    continue
                try:
                    show = plex.fetchItem(f"/library/metadata/{show_key}")
                except Exception:
                    _progress(progress, f"Dropping inaccessible season-NE log entry {key}")
                    del log[key]
                    _clear_season_episode_backup(paths, show_key)
                    season_removed += 1
                    continue
                if remove_season_new_episode_overlay(show, False, progress, paths=paths):
                    del log[key]
                    season_removed += 1
                else:
                    _progress(progress, f"Season-NE remove may have failed for {title}; dropping log entry anyway")
                    del log[key]
                    _clear_season_episode_backup(paths, show_key)
                    season_removed += 1
                continue

            title = entry.get("title") or key
            if preview_mode:
                if bool(entry.get("preview_only")):
                    del log[key]
                    removed += 1
                    _progress(progress, f"[Preview] Dropped tracked episode (no longer eligible): {title}")
                else:
                    _progress(progress, f"[Preview] Would remove live episode overlay: {title}")
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
            else:
                _progress(progress, f"Episode remove may have failed for {title}; dropping log entry anyway")
                del log[key]
                _clear_episode_backup(paths, key)
                removed += 1
        except Exception as exc:
            errors.append(f"remove {key}: {exc}")

    _save_log(paths["episodeLog"], log)
    if owns_resolver and resolver is not None:
        resolver.save()
    real_eps = sum(1 for k in log if not _is_season_episode_log_key(k))
    _progress(
        progress,
        f"New Episode done — eligible {len(should_have)}, added {added}, "
        f"refreshed {refreshed}, removed {removed}, season stamps +{season_added}/−{season_removed}, "
        f"total eps {real_eps}",
    )
    out = {
        "episodesAdded": added,
        "episodesRefreshed": refreshed,
        "episodesSkipped": skipped,
        "episodesRemoved": removed,
        "episodesEligible": len(should_have),
        "episodesTotal": real_eps,
        "seasonStampsAdded": season_added,
        "seasonStampsRemoved": season_removed,
        "episodeErrors": errors,
        "episodeLogPath": str(paths["episodeLog"]),
        "episodeOverlayPath": str(paths["episodeOverlay"]),
        "episodePreviewDir": str(paths["previewEpisodes"]),
    }
    if resolver is not None and owns_resolver:
        out.update(resolver.summary())
    return out


def _normalize_run_bundle(value) -> str:
    raw = str(value or "core").strip().lower().replace("_", "-")
    if raw in {"all", "full"}:
        return "all"
    if raw in {"recently", "recent", "recently-added", "recentlyadded"}:
        return "recently"
    if raw in {"kometa", "kometa-style", "media", "media-info"}:
        return "kometa"
    return "core"


def _run_kometa_bundle(plex, config: dict, paths: dict, preview_mode: bool, progress: ProgressFn | None) -> dict:
    from modes_kometa import ensure_placement_preview_badges
    from kometa_engine import run_kometa_parity
    try:
        ensure_placement_preview_badges(paths["assets"], paths=paths)
    except Exception:
        pass
    summary = run_kometa_parity(plex, config, paths, preview_mode, progress)
    out = {
        "ok": True,
        "runBundle": "kometa",
        "previewMode": preview_mode,
        "finishedAt": datetime.now().isoformat(),
        "errors": list(summary.get("kometaErrors") or []),
    }
    out.update(summary)
    _progress(progress, "Done (kometa) — parity pass finished")
    return out


def _run_recently_bundle(plex, config: dict, paths: dict, preview_mode: bool, progress: ProgressFn | None) -> dict:
    from modes_extra import run_recently_added_overlays
    from tmdb_dates import create_resolver_from_config

    # Respect Live / New Season reservations without re-running those modes.
    live_log = _load_log(paths.get("liveLog") or (paths["root"] / "live_log.json"))
    season_log = _load_log(paths["log"])
    reserved = {str(k) for k in live_log.keys()} | {str(k) for k in season_log.keys()}
    resolver = create_resolver_from_config(config, paths=paths, progress=progress)
    recent_summary = run_recently_added_overlays(
        plex, config, paths, preview_mode, progress, reserved_keys=reserved
    )
    resolver.save()
    out = {
        "ok": True,
        "runBundle": "recently",
        "previewMode": preview_mode,
        "finishedAt": datetime.now().isoformat(),
        "errors": list(recent_summary.get("recentlyAddedErrors") or recent_summary.get("errors") or []),
    }
    out.update(recent_summary)
    out.update(resolver.summary())
    _progress(
        progress,
        f"Done (recently) — +{recent_summary.get('recentlyAddedAdded', recent_summary.get('recentlyAdded', 0))}/"
        f"-{recent_summary.get('recentlyAddedRemoved', recent_summary.get('recentlyRemoved', 0))}",
    )
    return out


def run_overlays(
    config: dict,
    progress: ProgressFn | None = None,
    preview_override: bool | None = None,
    bundle: str | None = None,
) -> dict:
    """Run overlay bundles separately so heavy passes do not block New Season.

    bundle:
      - core     — Live, New Season, New Episode, Top 10 (default Preview/Run + scheduler)
      - recently — Recently Added only
      - kometa   — Media / status / ratings / network only
      - all      — everything (legacy combined pass)
    """
    paths = _resolve_paths(config)
    preview_mode = _as_bool(
        preview_override if preview_override is not None else config.get("previewMode", config.get("preview_mode")),
        False,
    )
    run_bundle = _normalize_run_bundle(
        bundle if bundle is not None else config.get("runBundle", config.get("run_bundle", "core"))
    )
    plex = _connect(config)
    _progress(progress, f"Overlays bundle: {run_bundle}")

    if run_bundle == "kometa":
        return _run_kometa_bundle(plex, config, paths, preview_mode, progress)
    if run_bundle == "recently":
        return _run_recently_bundle(plex, config, paths, preview_mode, progress)

    days = int(config.get("newSeasonDays") or config.get("new_season_days") or 21)
    cutoff = datetime.now() - timedelta(days=max(1, days))
    skip_kometa = _as_bool(config.get("skipIfKometaOverlayLabel", config.get("skip_if_kometa_overlay_label")), True)
    new_season_on = _as_bool(config.get("newSeasonEnabled", config.get("new_season_enabled")), True)

    log = _load_log(paths["log"])

    from tmdb_dates import create_resolver_from_config
    from modes_extra import run_live_overlays, run_recently_added_overlays, run_top10_overlays
    from modes_kometa import ensure_placement_preview_badges
    from kometa_engine import run_kometa_parity

    try:
        ensure_placement_preview_badges(paths["assets"], paths=paths)
    except Exception:
        pass

    resolver = create_resolver_from_config(config, paths=paths, progress=progress)

    kometa_summary: dict = {}
    if run_bundle == "all":
        # Kometa-parity corner/side badges first when doing a full combined pass.
        kometa_summary = run_kometa_parity(plex, config, paths, preview_mode, progress)

    live_summary = run_live_overlays(plex, config, paths, preview_mode, progress, resolver=resolver)
    reserved: set[str] = set(live_summary.get("liveKeys") or [])

    added = 0
    converted = 0
    refreshed = 0
    skipped = 0
    removed = 0
    errors: list[str] = []
    preview_files: list[dict] = []
    should_have: set[str] = set()
    _meta_by_key: dict = {}
    show_by_key: dict = {}

    if new_season_on:
        _progress(progress, "Scanning for eligible new seasons…")
        should_have, _meta_by_key, show_by_key = discover_eligible_shows(
            plex, config, cutoff, skip_kometa, progress, resolver=resolver
        )
        should_have = {k for k in should_have if k not in reserved}

        for key in sorted(should_have):
            show = show_by_key[key]
            existing = log.get(key)
            library = str((_meta_by_key.get(key) or {}).get("library") or "").strip() or None
            try:
                if preview_mode:
                    entry = process_show_overlay(
                        plex, show, config, paths, True, progress, library=library
                    )
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
                        log[key] = {**existing, **entry} if isinstance(existing, dict) else entry
                        refreshed += 1
                    continue

                needs = existing is None or bool(existing.get("preview_only"))
                if not needs:
                    if library and isinstance(existing, dict) and not existing.get("library"):
                        log[key] = {**existing, "library": library}
                    skipped += 1
                    _progress(progress, f"Already overlaid, skipping: {show.title}")
                    continue

                entry = process_show_overlay(
                    plex, show, config, paths, False, progress, library=library
                )
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
                entry = log.get(key) or {}
                title = entry.get("title") or key
                if preview_mode:
                    if bool(entry.get("preview_only")):
                        del log[key]
                        removed += 1
                        _progress(progress, f"[Preview] Dropped tracked show (no longer eligible): {title}")
                    else:
                        _progress(progress, f"[Preview] Would remove live overlay: {title}")
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
                else:
                    _progress(progress, f"Remove may have failed for {title}; dropping log entry anyway")
                    del log[key]
                    if paths is not None:
                        _clear_backup_dir(paths, key)
                    removed += 1
            except Exception as exc:
                errors.append(f"remove {key}: {exc}")
    else:
        _progress(progress, "New Season overlays disabled — pruning tracked show stamps…")
        for key in list(log.keys()):
            entry = log.get(key) or {}
            title = entry.get("title") or key
            try:
                if preview_mode:
                    if bool(entry.get("preview_only")):
                        del log[key]
                        removed += 1
                    continue
                try:
                    show = plex.fetchItem(f"/library/metadata/{key}")
                except Exception:
                    del log[key]
                    removed += 1
                    continue
                remove_show_overlay(show, False, progress, paths=paths)
                del log[key]
                removed += 1
            except Exception as exc:
                errors.append(f"disable-remove {key}: {exc}")

    _save_log(paths["log"], log)

    recent_summary: dict = {}
    if run_bundle == "all":
        reserved_for_recent = set(reserved) | set(should_have) | set(log.keys())
        recent_summary = run_recently_added_overlays(
            plex, config, paths, preview_mode, progress, reserved_keys=reserved_for_recent
        )

    summary = {
        "ok": True,
        "runBundle": run_bundle,
        "previewMode": preview_mode,
        "newSeasonEnabled": new_season_on,
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
    summary.update(live_summary)
    if recent_summary:
        summary.update(recent_summary)
    if kometa_summary:
        summary.update(kometa_summary)
        if kometa_summary.get("kometaErrors"):
            summary["errors"] = [*(summary.get("errors") or []), *kometa_summary["kometaErrors"]]

    episode_summary = run_new_episode_overlays(
        plex, config, paths, preview_mode, progress, resolver=resolver
    )
    summary.update(episode_summary)
    if episode_summary.get("episodeErrors"):
        summary["errors"] = [*(summary.get("errors") or []), *episode_summary["episodeErrors"]]

    top10_summary = run_top10_overlays(plex, config, paths, preview_mode, progress)
    summary.update(top10_summary)
    if top10_summary.get("top10Errors"):
        summary["errors"] = [*(summary.get("errors") or []), *top10_summary["top10Errors"]]

    resolver.save()
    summary.update(resolver.summary())

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
            f"Done — seasons +{added}/-{removed}; episodes +{episode_summary.get('episodesAdded', 0)}/"
            f"-{episode_summary.get('episodesRemoved', 0)}",
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
            "library": entry.get("library") or "",
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
            "library": entry.get("library") or "",
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


def promote_preview_to_live(config: dict, progress: ProgressFn | None = None) -> dict:
    """
    Stamp every preview_only tracked show/episode/season-NE to live Plex art.
    Does not rescans libraries or prune ineligible items — tracked preview rows only.
    """
    paths = _resolve_paths(config)
    plex = _connect(config)
    show_log = _load_log(paths["log"])
    episode_log = _load_log(paths["episodeLog"])

    show_keys = [
        key for key, entry in show_log.items()
        if isinstance(entry, dict) and bool(entry.get("preview_only"))
    ]
    episode_keys = [
        key for key, entry in episode_log.items()
        if isinstance(entry, dict)
        and bool(entry.get("preview_only"))
        and not _is_season_episode_log_key(key)
    ]
    season_keys = [
        key for key, entry in episode_log.items()
        if isinstance(entry, dict)
        and bool(entry.get("preview_only"))
        and _is_season_episode_log_key(key)
    ]

    _progress(
        progress,
        f"Promoting preview → live — {len(show_keys)} show(s), "
        f"{len(episode_keys)} episode(s), {len(season_keys)} season stamp(s)…",
    )

    shows_promoted = 0
    episodes_promoted = 0
    seasons_promoted = 0
    errors: list[str] = []

    for key in sorted(show_keys):
        existing = show_log.get(key) or {}
        try:
            show = plex.fetchItem(f"/library/metadata/{key}")
            library = str(existing.get("library") or "").strip() or None
            entry = process_show_overlay(
                plex, show, config, paths, False, progress, library=library
            )
            show_log[key] = {**existing, **entry, "preview_only": False}
            shows_promoted += 1
        except Exception as exc:
            title = existing.get("title") or key
            errors.append(f"show {title}: {exc}")
            _progress(progress, f"Promote failed for show {title}: {exc}")

    for key in sorted(episode_keys):
        existing = episode_log.get(key) or {}
        try:
            episode = plex.fetchItem(f"/library/metadata/{key}")
            meta = {
                "title": existing.get("title"),
                "showTitle": existing.get("showTitle") or "",
                "showKey": existing.get("showKey") or "",
                "seasonIndex": existing.get("seasonIndex"),
                "episodeIndex": existing.get("episodeIndex"),
                "airedAt": existing.get("airedAt"),
                "library": existing.get("library") or "",
                "presetId": existing.get("presetId")
                or config.get("episodeOverlayPresetId")
                or "new-episode",
            }
            entry = process_episode_overlay(
                plex, episode, meta, paths, False, progress, config=config
            )
            episode_log[key] = {**existing, **entry, "preview_only": False}
            episodes_promoted += 1
        except Exception as exc:
            label = f"{existing.get('showTitle') or ''} {existing.get('title') or key}".strip()
            errors.append(f"episode {label}: {exc}")
            _progress(progress, f"Promote failed for episode {label}: {exc}")

    for key in sorted(season_keys):
        existing = episode_log.get(key) or {}
        show_key = key.split(":", 1)[-1]
        try:
            show = plex.fetchItem(f"/library/metadata/{show_key}")
            entry = process_season_new_episode_overlay(
                plex, show, paths, False, progress, config=config
            )
            episode_log[key] = {**existing, **entry, "preview_only": False}
            seasons_promoted += 1
        except Exception as exc:
            title = existing.get("title") or show_key
            errors.append(f"season {title}: {exc}")
            _progress(progress, f"Promote failed for season stamp {title}: {exc}")

    _save_log(paths["log"], show_log)
    _save_log(paths["episodeLog"], episode_log)
    _progress(
        progress,
        f"Promote complete — shows {shows_promoted}, episodes {episodes_promoted}, "
        f"season stamps {seasons_promoted}, errors {len(errors)}",
    )
    return {
        "ok": True,
        "showsPromoted": shows_promoted,
        "episodesPromoted": episodes_promoted,
        "seasonsPromoted": seasons_promoted,
        "showsCandidate": len(show_keys),
        "episodesCandidate": len(episode_keys),
        "seasonsCandidate": len(season_keys),
        "errors": errors,
        "finishedAt": datetime.now().isoformat(),
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
    prefer_season_ne = (kind or "").lower() in {"seasonepisode", "season-episode", "season_ne"}
    prefer_show = (kind or "").lower() in {"show", "shows", "season"}
    prefer_kometa = (kind or "").lower() in {"kometa", "kometa-style", "media"}

    from kometa_engine import kometa_log_path, revert_kometa
    kometa_log = _load_log(kometa_log_path(paths))
    if prefer_kometa or (not prefer_episode and not prefer_season_ne and not prefer_show and key in kometa_log):
        result = revert_kometa(config, rating_key=key, progress=progress)
        title = (kometa_log.get(key) or {}).get("title") or key
        return {
            "ok": True,
            "kind": "kometa",
            "ratingKey": key,
            "title": title,
            "restoredFromBackup": result.get("reverted", 0) > 0,
        }

    if prefer_season_ne or _is_season_episode_log_key(key):
        show_key = key.split(":", 1)[-1] if _is_season_episode_log_key(key) else key
        log_key = _season_episode_log_key(show_key)
        show = plex.fetchItem(f"/library/metadata/{show_key}")
        had_backup = (_season_episode_backup_dir(paths, show_key) / "season.png").exists()
        remove_season_new_episode_overlay(show, False, progress, paths=paths)
        _clear_season_episode_backup(paths, show_key)
        if log_key in episode_log:
            del episode_log[log_key]
            _save_log(paths["episodeLog"], episode_log)
        return {
            "ok": True,
            "kind": "seasonEpisode",
            "ratingKey": show_key,
            "title": getattr(show, "title", show_key),
            "restoredFromBackup": had_backup,
        }

    if prefer_episode or (not prefer_show and key in episode_log and not _is_season_episode_log_key(key)):
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
        if _is_season_episode_log_key(key):
            show_key = key.split(":", 1)[-1]
            had_backup = (_season_episode_backup_dir(paths, show_key) / "season.png").exists()
            try:
                show = plex.fetchItem(f"/library/metadata/{show_key}")
                remove_season_new_episode_overlay(show, False, progress, paths=paths)
                if had_backup:
                    restored_from_backup += 1
                episodes_removed += 1
            except Exception as exc:
                failed.append(f"season-NE {title}: {exc}")
                _progress(progress, f"Failed to reset season New Episode {title}: {exc}")
            _clear_season_episode_backup(paths, show_key)
            if key in episode_log:
                del episode_log[key]
            continue
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

    from modes_extra import _clear_mode_backup, _restore_show_mode, _load_log as _load_extra_log, _save_log as _save_extra_log

    # Unified Kometa-parity overlays (resolution/edition/audio/format/status/ratings/network)
    kometa_removed = 0
    try:
        from kometa_engine import revert_kometa
        kometa_result = revert_kometa(config, rating_key=None, progress=progress)
        kometa_removed = int(kometa_result.get("reverted") or 0)
        failed.extend(kometa_result.get("failed") or [])
    except Exception as exc:
        failed.append(f"kometa revert: {exc}")

    extras_removed = 0
    for mode, log_key in (
        ("live", "liveLog"),
        ("recently", "recentlyAddedLog"),
        ("top10", "top10Log"),
        ("media", "mediaLog"),
        ("status", "statusLog"),
        ("ratings", "ratingsLog"),
        ("network", "networkLog"),
    ):
        extra_log = _load_extra_log(paths[log_key])
        for key in list(extra_log.keys()):
            entry = extra_log.get(key) or {}
            title = entry.get("title") or key
            try:
                show = plex.fetchItem(f"/library/metadata/{key}")
                _restore_show_mode(show, paths, mode, progress)
                extras_removed += 1
            except Exception as exc:
                failed.append(f"{mode} {title}: {exc}")
            _clear_mode_backup(paths, mode, key)
            del extra_log[key]
        _save_extra_log(paths[log_key], extra_log)

    _save_log(paths["log"], log)
    _save_log(paths["episodeLog"], episode_log)
    summary = {
        "ok": True,
        "requested": len(keys) + len(episode_keys),
        "removed": removed,
        "episodesRemoved": episodes_removed,
        "extrasRemoved": extras_removed,
        "kometaRemoved": kometa_removed,
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
    """List show + movie libraries for Overlays Settings (TV modes ignore movies)."""
    plex = _connect(config)
    sections = []
    for section in plex.library.sections():
        stype = str(getattr(section, "type", "") or "").lower()
        if stype not in {"show", "movie"}:
            continue
        sections.append({
            "key": str(section.key),
            "id": str(section.key).rstrip("/").split("/")[-1],
            "title": section.title,
            "type": stype,
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

    sections = list(_iter_tv_sections(plex, config, bundle="core"))
    if not sections:
        # Last resort for visual samples: any TV library, ignoring filters.
        sections = list(_iter_sections(plex, config, types=("show",), section_ids=[]))
        if sections:
            _progress(progress, "Sample pick: no libraries in scope — using all TV libraries")

    for section in sections:
        if len(show_candidates) < 40:
            batch: list = []
            for pull in (
                lambda: list(section.recentlyAdded(maxresults=40) or []),
                lambda: list(section.search(libtype="show", maxresults=40) or []),
                lambda: list(section.all(container_start=0, container_size=40) or []),
            ):
                if batch:
                    break
                try:
                    batch = [
                        item for item in (pull() or [])
                        if str(getattr(item, "type", "") or getattr(item, "TYPE", "") or "").lower()
                        in {"", "show"}
                        or hasattr(item, "seasons")
                    ]
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
                show_candidates.append(item)
                if len(show_candidates) >= 40:
                    break

        if len(episode_candidates) < 40:
            batch = []
            for pull in (
                lambda: list(section.recentlyAdded(maxresults=40, libtype="episode") or []),
                lambda: list(section.search(libtype="episode", maxresults=40) or []),
            ):
                if batch:
                    break
                try:
                    batch = list(pull() or [])
                except TypeError:
                    try:
                        batch = list(section.recentlyAdded(maxresults=40) or [])
                        batch = [
                            item for item in batch
                            if str(getattr(item, "type", "") or "").lower() == "episode"
                        ]
                    except Exception:
                        batch = []
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
                episode_candidates.append(item)
                if len(episode_candidates) >= 40:
                    break

        if len(show_candidates) >= 40 and len(episode_candidates) >= 40:
            break

    if not show_candidates:
        _progress(progress, "Sample pick: no shows found in scoped TV libraries")
    if not episode_candidates:
        _progress(progress, "Sample pick: no episodes found in scoped TV libraries")

    random.shuffle(show_candidates)
    random.shuffle(episode_candidates)
    show = show_candidates[0] if show_candidates else None
    episode = episode_candidates[0] if episode_candidates else None
    return show, episode


def search_sample_candidates(config: dict, query: str = "", progress: ProgressFn | None = None) -> dict:
    """Title search for sample picker — max 25 shows with ratingKey + title."""
    plex = _connect(config)
    q = str(query or "").strip()
    results = []
    seen = set()
    for section in _iter_tv_sections(plex, config):
        try:
            if q:
                batch = list(section.search(q, libtype="show", maxresults=25) or [])
            else:
                try:
                    batch = list(section.all(container_start=0, container_size=25) or [])
                except TypeError:
                    batch = list(section.all()[:25])
        except Exception as exc:
            _progress(progress, f"{section.title}: sample search failed ({exc})")
            continue
        for show in batch:
            key = str(getattr(show, "ratingKey", "") or "")
            if not key or key in seen:
                continue
            if not getattr(show, "thumb", None):
                continue
            seen.add(key)
            results.append({
                "ratingKey": key,
                "title": getattr(show, "title", None) or key,
                "library": section.title,
            })
            if len(results) >= 25:
                break
        if len(results) >= 25:
            break
    results.sort(key=lambda r: str(r.get("title") or "").lower())
    return {"ok": True, "shows": results, "query": q}


def generate_overlay_samples(
    config: dict,
    progress: ProgressFn | None = None,
    show_rating_key: str | None = None,
    episode_rating_key: str | None = None,
) -> dict:
    """
    Composite New Season / New Episode banners onto Plex art (chosen or random)
    or solid placeholders. Writes preview/samples/{show,episode}.png + meta.json.
    """
    paths = _resolve_paths(config)
    samples = _samples_dir(paths)
    preset_id = str(config.get("overlayPresetId") or config.get("overlay_preset_id") or "new-season").strip() or "new-season"
    episode_preset = str(
        config.get("episodeOverlayPresetId") or config.get("episode_overlay_preset_id") or "new-episode"
    ).strip() or "new-episode"

    show_overlay = paths["overlay"]
    episode_overlay = paths["episodeOverlay"]
    if not _is_season_chip_preset(preset_id) and not show_overlay.exists():
        raise FileNotFoundError(f"New Season overlay asset not found: {show_overlay}")
    if not episode_overlay.exists():
        raise FileNotFoundError(f"New Episode overlay asset not found: {episode_overlay}")

    episode_banner = _load_episode_overlay_image(config, paths)

    show = None
    episode = None
    show_title = "Sample show"
    episode_title = "Sample episode"
    episode_show_title = ""
    show_source = "placeholder"
    episode_source = "placeholder"
    plex = None
    sample_season_index = 2

    try:
        plex = _connect(config)
        show_key = str(show_rating_key or "").strip()
        ep_key = str(episode_rating_key or "").strip()
        if show_key:
            _progress(progress, f"Loading chosen show {show_key}…")
            try:
                show = plex.fetchItem(f"/library/metadata/{show_key}")
            except Exception as exc:
                _progress(progress, f"Chosen show unavailable ({exc})")
                show = None
        if ep_key:
            try:
                episode = plex.fetchItem(f"/library/metadata/{ep_key}")
            except Exception as exc:
                _progress(progress, f"Chosen episode unavailable ({exc})")
                episode = None
        if show is None or episode is None:
            _progress(progress, "Picking random show poster and episode thumb…")
            rand_show, rand_ep = _pick_sample_items(plex, config, progress)
            if show is None:
                show = rand_show
            if episode is None:
                # Prefer an episode from the chosen show when possible.
                if show is not None and ep_key == "":
                    try:
                        eps = list(show.episodes()[:20] or [])
                        random.shuffle(eps)
                        for cand in eps:
                            if getattr(cand, "thumb", None):
                                episode = cand
                                break
                    except Exception:
                        pass
                if episode is None:
                    episode = rand_ep
    except Exception as exc:
        plex = None
        _progress(progress, f"Plex unavailable for samples ({exc}) — using placeholders")

    show_img = None
    if show is not None and plex is not None:
        show_title = getattr(show, "title", None) or show_title
        show_img = _item_poster_image(plex, show)
        if show_img is not None:
            show_source = "plex"

    if show_img is None:
        show_img = _placeholder_poster("show")
        _progress(progress, "Using placeholder show poster")

    if show is not None:
        try:
            latest = _latest_season(show)
            if latest is not None and getattr(latest, "index", None) is not None:
                sample_season_index = int(latest.index)
        except Exception:
            pass

    episode_img = None
    if episode is not None and plex is not None:
        episode_title = getattr(episode, "title", None) or episode_title
        try:
            parent = episode.show()
            episode_show_title = getattr(parent, "title", None) or ""
        except Exception:
            episode_show_title = getattr(episode, "grandparentTitle", None) or ""
        episode_img = _item_poster_image(plex, episode)
        if episode_img is not None:
            episode_source = "plex"

    if episode_img is None:
        episode_img = _placeholder_poster("episode")
        _progress(progress, "Using placeholder episode thumb")

    show_banner = _load_show_overlay_image(config, paths, season_index=sample_season_index)
    show_out = _apply_show_overlay(show_img.copy(), show_banner, config)
    episode_out = _apply_episode_overlay(episode_img.copy(), episode_banner, config)
    season_out = _apply_season_episode_overlay(show_img.copy(), episode_banner, config)

    show_path = samples / "show.png"
    episode_path = samples / "episode.png"
    season_path = samples / "season.png"
    show_base_path = samples / "show-base.png"
    episode_base_path = samples / "episode-base.png"
    meta_path = samples / "meta.json"
    show_img.save(show_base_path)
    episode_img.save(episode_base_path)
    show_out.save(show_path)
    episode_out.save(episode_path)
    season_out.save(season_path)

    meta = {
        "showTitle": show_title,
        "episodeTitle": episode_title,
        "showTitleForEp": episode_show_title,
        "generatedAt": datetime.now().isoformat(),
        "presetId": preset_id,
        "episodePresetId": episode_preset,
        "showSource": show_source,
        "episodeSource": episode_source,
        "showRatingKey": str(getattr(show, "ratingKey", "") or "") or None,
        "episodeRatingKey": str(getattr(episode, "ratingKey", "") or "") or None,
        "placement": {
            "show": _placement_for(config, "show"),
            "season": _placement_for(config, "season"),
            "episode": _placement_for(config, "episode"),
        },
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
        "episodePresetId": episode_preset,
        "generatedAt": meta["generatedAt"],
        "paths": {
            "show": str(show_path),
            "episode": str(episode_path),
            "meta": str(meta_path),
            "dir": str(samples),
        },
        "meta": meta,
    }
