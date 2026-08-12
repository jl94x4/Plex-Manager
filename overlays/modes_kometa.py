"""Kometa-style overlay modes: media info, show status, ratings, network."""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable

from PIL import Image, ImageDraw

ProgressFn = Callable[[str], None]

# Kometa defaults assume 1000×1500 posters (offsets in px).
# Resolution: left/top 15,15 · Status: left/top 15,330 · Network: left/bottom 15,510
# Audio sits under resolution (~150 from top) — we stack into one media badge.
# Ratings: right/center (common TV config; wiki default is left/center).
DEFAULT_KOMETA_PLACEMENT = {
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


def _progress(progress: ProgressFn | None, message: str) -> None:
    if progress:
        progress(message)


def _as_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _load_log(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        import json
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save_log(path: Path, log: dict) -> None:
    import json
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(log, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _find_font(size: int):
    candidates = [
        Path(r"C:\Windows\Fonts\arialbd.ttf"),
        Path(r"C:\Windows\Fonts\segoeuib.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        Path("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
    ]
    from PIL import ImageFont
    for path in candidates:
        if path.exists():
            try:
                return ImageFont.truetype(str(path), size)
            except Exception:
                continue
    return ImageFont.load_default()


def placement_for(config: dict | None, kind: str) -> dict:
    """Resolve placement from config.placement.<kind>, falling back to Kometa defaults."""
    defaults = DEFAULT_KOMETA_PLACEMENT.get(kind) or DEFAULT_KOMETA_PLACEMENT["media"]
    raw_root = (config or {}).get("placement") if isinstance(config, dict) else None
    raw = {}
    if isinstance(raw_root, dict):
        raw = raw_root.get(kind) if isinstance(raw_root.get(kind), dict) else {}
    out = dict(defaults)
    for key in ("x", "y", "width", "maxHeight", "bottomClip"):
        if key in raw and raw[key] is not None:
            try:
                out[key] = float(raw[key])
            except (TypeError, ValueError):
                pass
    for key, alt in (("anchorX", "anchor_x"), ("anchorY", "anchor_y")):
        val = raw.get(key) or raw.get(alt)
        if val:
            out[key] = str(val).strip().lower()
    return out


def render_pill(lines: list[str], *, accent: tuple[int, int, int, int] | None = None) -> Image.Image:
    """Kometa-ish translucent rounded pill (stacked text lines)."""
    lines = [str(x).strip() for x in lines if str(x).strip()]
    if not lines:
        lines = ["—"]
    h_line = 78
    pad_x = 28
    pad_y = 18
    gap = 6
    font = _find_font(42)
    dummy = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    widths = []
    for line in lines:
        bb = dummy.textbbox((0, 0), line, font=font)
        widths.append(bb[2] - bb[0])
    w = max(widths) + pad_x * 2
    h = pad_y * 2 + h_line * len(lines) + gap * max(0, len(lines) - 1)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    bg = accent or (0, 0, 0, 153)  # #00000099
    draw.rounded_rectangle([0, 0, w, h], radius=30, fill=bg)
    y = pad_y
    for line in lines:
        bb = draw.textbbox((0, 0), line, font=font)
        tw = bb[2] - bb[0]
        th = bb[3] - bb[1]
        draw.text(((w - tw) / 2 - bb[0], y + (h_line - th) / 2 - bb[1]), line, font=font, fill=(255, 255, 255, 255))
        y += h_line + gap
    return img


def render_rating_badge(score: float) -> Image.Image:
    text = f"{score:.1f}".rstrip("0").rstrip(".") if score < 10 else f"{score:.0f}"
    # Compact square-ish Kometa ratings style
    size = 160
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([0, 0, size, size], radius=30, fill=(0, 0, 0, 153))
    font = _find_font(72)
    label = _find_font(28)
    bb = draw.textbbox((0, 0), text, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    draw.text(((size - tw) / 2 - bb[0], size * 0.28 - th / 2 - bb[1]), text, font=font, fill=(255, 255, 255, 255))
    tag = "TMDB"
    lb = draw.textbbox((0, 0), tag, font=label)
    lw, lh = lb[2] - lb[0], lb[3] - lb[1]
    draw.text(((size - lw) / 2 - lb[0], size * 0.72 - lh / 2 - lb[1]), tag, font=label, fill=(255, 200, 80, 255))
    return img


def _inspect_media(show) -> dict[str, Any]:
    """Best-effort resolution / HDR / Atmos from a show's episodes."""
    info = {"resolution": None, "hdr": False, "atmos": False, "label": None}
    try:
        episodes = list(show.episodes() or [])
    except Exception:
        return info
    # Prefer newer episodes (often better encodes); keep this shallow for large libraries.
    for ep in reversed(episodes[-8:]):
        try:
            medias = list(getattr(ep, "media", None) or [])
        except Exception:
            continue
        for media in medias:
            width = getattr(media, "width", None) or 0
            try:
                width = int(width)
            except (TypeError, ValueError):
                width = 0
            vres = str(getattr(media, "videoResolution", None) or "").lower()
            res = None
            if width >= 3800 or "4k" in vres or vres == "2160":
                res = "4K"
            elif width >= 1800 or "1080" in vres:
                res = "1080P"
            elif width >= 1200 or "720" in vres:
                res = "720P"
            elif width > 0 or vres:
                res = (vres or "SD").upper()
            hdr = False
            atmos = False
            try:
                parts = list(getattr(media, "parts", None) or [])
            except Exception:
                parts = []
            for part in parts:
                try:
                    streams = list(getattr(part, "streams", None) or [])
                except Exception:
                    streams = []
                for stream in streams:
                    stype = getattr(stream, "streamType", None) or getattr(stream, "type", None)
                    title = str(getattr(stream, "title", "") or "")
                    display = str(getattr(stream, "displayTitle", "") or "")
                    codec = str(getattr(stream, "codec", "") or "")
                    blob = f"{title} {display} {codec}".lower()
                    if stype in (1, "1", "video") or "video" in str(stype).lower():
                        if any(x in blob for x in ("hdr", "dolby vision", "dovi", "hlg", "pq")):
                            hdr = True
                        if str(getattr(stream, "DOVIPresent", "") or "").lower() in {"1", "true"}:
                            hdr = True
                        if str(getattr(stream, "colorTrc", "") or "").lower() in {"smpte2084", "arib-std-b67"}:
                            hdr = True
                    if stype in (2, "2", "audio") or "audio" in str(stype).lower():
                        if "atmos" in blob:
                            atmos = True
            if res and (
                info["resolution"] is None
                or (res == "4K")
                or (res == "1080P" and info["resolution"] not in {"4K"})
            ):
                info["resolution"] = res
            info["hdr"] = info["hdr"] or hdr
            info["atmos"] = info["atmos"] or atmos
            if info["resolution"] == "4K" and info["hdr"] and info["atmos"]:
                break
        if info["resolution"] == "4K" and info["hdr"] and info["atmos"]:
            break

    lines = []
    if info["resolution"]:
        line = info["resolution"]
        if info["hdr"]:
            line = f"{line} HDR"
        lines.append(line)
    elif info["hdr"]:
        lines.append("HDR")
    if info["atmos"]:
        lines.append("ATMOS")
    info["label"] = " · ".join(lines) if lines else None
    info["lines"] = lines
    return info


def _show_status_label(show, *, airing_days: int = 14) -> str | None:
    status = str(getattr(show, "status", "") or "").strip().lower()
    # Detect currently airing via recent episode
    try:
        eps = list(show.episodes() or [])
    except Exception:
        eps = []
    latest = None
    for ep in reversed(eps[-15:]):
        aired = getattr(ep, "originallyAvailableAt", None)
        if aired is None:
            continue
        if isinstance(aired, datetime):
            latest = aired
        else:
            try:
                latest = datetime.combine(aired, datetime.min.time())
            except Exception:
                continue
        break
    if latest and latest >= datetime.now() - timedelta(days=max(1, airing_days)):
        return "AIRING"
    if "cancel" in status:
        return "CANCELED"
    if status in {"ended", "canceled", "cancelled"}:
        return "ENDED" if "end" in status or status == "ended" else "CANCELED"
    if status in {"continuing", "returning series", "returning"}:
        return "RETURNING"
    if latest is None and not status:
        return None
    if status:
        return "RETURNING" if "continu" in status or "return" in status else status.upper()[:12]
    return "RETURNING"


def _network_label(show) -> str | None:
    for attr in ("network", "studio"):
        val = getattr(show, attr, None)
        if val:
            text = str(val).strip()
            if text:
                return text[:24]
    return None


def _rating_value(show) -> float | None:
    for attr in ("audienceRating", "rating", "userRating"):
        val = getattr(show, attr, None)
        try:
            if val is not None:
                n = float(val)
                if n > 0:
                    return n
        except (TypeError, ValueError):
            continue
    return None


def _stamp(
    *,
    plex,
    show,
    badge: Image.Image,
    paths: dict,
    preview_mode: bool,
    progress: ProgressFn | None,
    mode: str,
    placement: dict,
    library: str = "",
    extra_meta: dict | None = None,
) -> dict:
    from modes_extra import _stamp_show_badge, _apply_with_explicit_placement
    return _stamp_show_badge(
        plex=plex,
        show=show,
        badge=badge,
        paths=paths,
        preview_mode=preview_mode,
        progress=progress,
        mode=mode,
        placement=placement,
        apply_fn=_apply_with_explicit_placement,
        library=library,
        extra_meta=extra_meta,
    )


def _run_generic_mode(
    *,
    plex,
    config: dict,
    paths: dict,
    preview_mode: bool,
    progress: ProgressFn | None,
    mode: str,
    enabled_key: str,
    enabled_snake: str,
    log_key: str,
    discover_fn,
    render_fn,
    default_enabled: bool = False,
) -> dict:
    from modes_extra import _prune_mode_when_disabled, _restore_show_mode, _clear_mode_backup
    from core import _iter_tv_sections

    log_path = paths[log_key]
    enabled = _as_bool(config.get(enabled_key, config.get(enabled_snake)), default_enabled)
    prefix = mode
    if not enabled:
        removed, errors, total = _prune_mode_when_disabled(
            plex, paths, mode, log_path, preview_mode, progress
        )
        return {
            f"{prefix}Enabled": False,
            f"{prefix}Added": 0,
            f"{prefix}Removed": removed,
            f"{prefix}Total": total,
            f"{prefix}Errors": errors,
            f"{prefix}Keys": [],
        }

    log = _load_log(log_path)
    skip_kometa = _as_bool(config.get("skipIfKometaOverlayLabel", config.get("skip_if_kometa_overlay_label")), True)
    place_key = {"media": "media", "status": "status", "ratings": "ratings", "network": "network"}.get(mode, mode)
    placement = placement_for(config, place_key)

    sections = list(_iter_tv_sections(plex, config))
    should = discover_fn(plex, config, sections, progress, skip_kometa=skip_kometa)

    added = removed = 0
    errors: list[str] = []
    for key, meta in sorted(should.items(), key=lambda kv: kv[0]):
        existing = log.get(key)
        try:
            badge = render_fn(meta)
            if badge is None:
                continue
            sig = str(meta.get("signature") or "")
            if existing and not preview_mode and not bool(existing.get("preview_only")):
                if sig and existing.get("signature") == sig:
                    continue
                # Signature changed — restore prior art then restamp
                try:
                    _restore_show_mode(meta["show"], paths, mode, progress)
                except Exception:
                    pass
            elif existing is None or bool((existing or {}).get("preview_only")) or preview_mode:
                pass
            else:
                continue
            entry = _stamp(
                plex=plex,
                show=meta["show"],
                badge=badge,
                paths=paths,
                preview_mode=preview_mode,
                progress=progress,
                mode=mode,
                placement=placement,
                library=meta.get("library") or "",
                extra_meta={
                    **{k: v for k, v in meta.items() if k not in {"show"}},
                    "signature": sig,
                },
            )
            if existing is None:
                log[key] = entry
                added += 1
            else:
                log[key] = {**existing, **entry, "preview_only": bool(preview_mode)}
                added += 1
        except Exception as exc:
            errors.append(f"{mode} {meta['show'].title}: {exc}")

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
            try:
                show = plex.fetchItem(f"/library/metadata/{key}")
            except Exception:
                del log[key]
                _clear_mode_backup(paths, mode, key)
                removed += 1
                continue
            _restore_show_mode(show, paths, mode, progress)
            del log[key]
            removed += 1
        except Exception as exc:
            errors.append(f"{mode} remove {key}: {exc}")

    _save_log(log_path, log)
    return {
        f"{prefix}Enabled": True,
        f"{prefix}Added": added,
        f"{prefix}Removed": removed,
        f"{prefix}Total": len(log),
        f"{prefix}Eligible": len(should),
        f"{prefix}Errors": errors,
        f"{prefix}Keys": list(should.keys()),
    }


def discover_media(plex, config, sections, progress=None, skip_kometa=True):
    from core import _has_kometa_overlay_label
    should = {}
    for section in sections:
        try:
            for show in section.all():
                key = str(getattr(show, "ratingKey", "") or "")
                if not key:
                    continue
                if skip_kometa and _has_kometa_overlay_label(show):
                    continue
                info = _inspect_media(show)
                lines = info.get("lines") or []
                if not lines:
                    continue
                should[key] = {
                    "show": show,
                    "library": section.title,
                    "lines": lines,
                    "signature": "|".join(lines),
                }
        except Exception as exc:
            _progress(progress, f"Media scan failed for {getattr(section, 'title', '?')}: {exc}")
    _progress(progress, f"Media info eligible: {len(should)}")
    return should


def discover_status(plex, config, sections, progress=None, skip_kometa=True):
    from core import _has_kometa_overlay_label
    airing_days = int(config.get("statusAiringDays") or config.get("status_airing_days") or 14)
    should = {}
    for section in sections:
        try:
            for show in section.all():
                key = str(getattr(show, "ratingKey", "") or "")
                if not key:
                    continue
                if skip_kometa and _has_kometa_overlay_label(show):
                    continue
                label = _show_status_label(show, airing_days=airing_days)
                if not label:
                    continue
                should[key] = {
                    "show": show,
                    "library": section.title,
                    "statusLabel": label,
                    "signature": label,
                }
        except Exception as exc:
            _progress(progress, f"Status scan failed for {getattr(section, 'title', '?')}: {exc}")
    _progress(progress, f"Status eligible: {len(should)}")
    return should


def discover_ratings(plex, config, sections, progress=None, skip_kometa=True):
    from core import _has_kometa_overlay_label
    minimum = float(config.get("ratingsMinimum") or config.get("ratings_minimum") or 0)
    should = {}
    for section in sections:
        try:
            for show in section.all():
                key = str(getattr(show, "ratingKey", "") or "")
                if not key:
                    continue
                if skip_kometa and _has_kometa_overlay_label(show):
                    continue
                score = _rating_value(show)
                if score is None or score < minimum:
                    continue
                should[key] = {
                    "show": show,
                    "library": section.title,
                    "score": score,
                    "signature": f"{score:.2f}",
                }
        except Exception as exc:
            _progress(progress, f"Ratings scan failed for {getattr(section, 'title', '?')}: {exc}")
    _progress(progress, f"Ratings eligible: {len(should)}")
    return should


def discover_network(plex, config, sections, progress=None, skip_kometa=True):
    from core import _has_kometa_overlay_label
    should = {}
    for section in sections:
        try:
            for show in section.all():
                key = str(getattr(show, "ratingKey", "") or "")
                if not key:
                    continue
                if skip_kometa and _has_kometa_overlay_label(show):
                    continue
                label = _network_label(show)
                if not label:
                    continue
                should[key] = {
                    "show": show,
                    "library": section.title,
                    "network": label,
                    "signature": label.lower(),
                }
        except Exception as exc:
            _progress(progress, f"Network scan failed for {getattr(section, 'title', '?')}: {exc}")
    _progress(progress, f"Network eligible: {len(should)}")
    return should


def run_media_overlays(plex, config, paths, preview_mode, progress=None):
    paths.setdefault("mediaLog", paths["root"] / "media_log.json")
    return _run_generic_mode(
        plex=plex,
        config=config,
        paths=paths,
        preview_mode=preview_mode,
        progress=progress,
        mode="media",
        enabled_key="mediaInfoEnabled",
        enabled_snake="media_info_enabled",
        log_key="mediaLog",
        discover_fn=discover_media,
        render_fn=lambda meta: render_pill(meta.get("lines") or []),
    )


def run_status_overlays(plex, config, paths, preview_mode, progress=None):
    paths.setdefault("statusLog", paths["root"] / "status_log.json")
    return _run_generic_mode(
        plex=plex,
        config=config,
        paths=paths,
        preview_mode=preview_mode,
        progress=progress,
        mode="status",
        enabled_key="statusOverlayEnabled",
        enabled_snake="status_overlay_enabled",
        log_key="statusLog",
        discover_fn=discover_status,
        render_fn=lambda meta: render_pill([meta.get("statusLabel") or "STATUS"]),
    )


def run_ratings_overlays(plex, config, paths, preview_mode, progress=None):
    paths.setdefault("ratingsLog", paths["root"] / "ratings_log.json")
    return _run_generic_mode(
        plex=plex,
        config=config,
        paths=paths,
        preview_mode=preview_mode,
        progress=progress,
        mode="ratings",
        enabled_key="ratingsOverlayEnabled",
        enabled_snake="ratings_overlay_enabled",
        log_key="ratingsLog",
        discover_fn=discover_ratings,
        render_fn=lambda meta: render_rating_badge(float(meta.get("score") or 0)),
    )


def run_network_overlays(plex, config, paths, preview_mode, progress=None):
    paths.setdefault("networkLog", paths["root"] / "network_log.json")
    return _run_generic_mode(
        plex=plex,
        config=config,
        paths=paths,
        preview_mode=preview_mode,
        progress=progress,
        mode="network",
        enabled_key="networkOverlayEnabled",
        enabled_snake="network_overlay_enabled",
        log_key="networkLog",
        discover_fn=discover_network,
        render_fn=lambda meta: render_pill([meta.get("network") or "NETWORK"]),
    )


def ensure_placement_preview_badges(assets_dir: Path) -> None:
    """Write sample badges for the Placement editor (idempotent)."""
    assets_dir = Path(assets_dir)
    assets_dir.mkdir(parents=True, exist_ok=True)
    samples = {
        "placement-media.png": render_pill(["4K HDR", "ATMOS"]),
        "placement-status.png": render_pill(["RETURNING"]),
        "placement-ratings.png": render_rating_badge(8.4),
        "placement-network.png": render_pill(["HBO"]),
    }
    for name, img in samples.items():
        path = assets_dir / name
        if path.exists():
            continue
        img.save(path)


def run_all_kometa_style(plex, config, paths, preview_mode, progress=None) -> dict:
    """Run media → status → ratings → network (Kometa-ish stacking order)."""
    for key, filename in (
        ("mediaLog", "media_log.json"),
        ("statusLog", "status_log.json"),
        ("ratingsLog", "ratings_log.json"),
        ("networkLog", "network_log.json"),
    ):
        paths.setdefault(key, paths["root"] / filename)

    summary = {}
    summary.update(run_media_overlays(plex, config, paths, preview_mode, progress))
    summary.update(run_status_overlays(plex, config, paths, preview_mode, progress))
    summary.update(run_ratings_overlays(plex, config, paths, preview_mode, progress))
    summary.update(run_network_overlays(plex, config, paths, preview_mode, progress))
    errors = []
    for k in ("mediaErrors", "statusErrors", "ratingsErrors", "networkErrors"):
        errors.extend(summary.get(k) or [])
    if errors:
        summary["kometaStyleErrors"] = errors
    return summary
