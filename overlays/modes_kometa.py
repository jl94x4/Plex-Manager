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


def _find_font(size: int, *, weight: str = "medium", paths: dict | None = None):
    try:
        from kometa_images import ensure_font
        return ensure_font(paths=paths, size=size, weight=weight)
    except Exception:
        pass
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


def render_pill(
    lines: list[str],
    *,
    accent: tuple[int, int, int, int] | None = None,
    width: int = 305,
    height: int = 105,
    font_size: int = 50,
    paths: dict | None = None,
) -> Image.Image:
    """Kometa-style translucent rounded pill (305×105 defaults for status/network text)."""
    lines = [str(x).strip() for x in lines if str(x).strip()]
    if not lines:
        lines = ["—"]
    # Multi-line: grow height; single-line: fixed Kometa box.
    if len(lines) == 1:
        w, h = width, height
    else:
        h_line = max(48, font_size + 16)
        pad_y = 18
        gap = 6
        w = width
        h = pad_y * 2 + h_line * len(lines) + gap * max(0, len(lines) - 1)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    bg = accent or (0, 0, 0, 153)  # #00000099
    draw.rounded_rectangle([0, 0, w - 1, h - 1], radius=30, fill=bg)
    font = _find_font(font_size, weight="medium", paths=paths)
    if len(lines) == 1:
        line = lines[0]
        bb = draw.textbbox((0, 0), line, font=font)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        draw.text(((w - tw) / 2 - bb[0], (h - th) / 2 - bb[1]), line, font=font, fill=(255, 255, 255, 255))
        return img
    h_line = max(48, font_size + 16)
    pad_y = 18
    gap = 6
    y = pad_y
    for line in lines:
        bb = draw.textbbox((0, 0), line, font=font)
        tw = bb[2] - bb[0]
        th = bb[3] - bb[1]
        draw.text(((w - tw) / 2 - bb[0], y + (h_line - th) / 2 - bb[1]), line, font=font, fill=(255, 255, 255, 255))
        y += h_line + gap
    return img


def render_media_badge(meta: dict, *, paths: dict | None = None) -> Image.Image | None:
    """Composite official Kometa resolution (+ optional Atmos) PNGs."""
    from kometa_images import atmos_rel, load_image, resolution_rel, stack_images

    res = meta.get("resolution")
    hdr = bool(meta.get("hdr"))
    dv = bool(meta.get("dolbyVision") or meta.get("dolby_vision"))
    hlg = bool(meta.get("hlg"))
    atmos = bool(meta.get("atmos"))
    truehd = bool(meta.get("truehdAtmos") or meta.get("truehd_atmos"))

    rel = resolution_rel(res, hdr=hdr, dolby_vision=dv, hlg=hlg)
    parts: list[Image.Image] = []
    if rel:
        img = load_image(rel, paths=paths)
        if img is not None:
            parts.append(img)
    if atmos:
        aimg = load_image(atmos_rel(truehd=truehd), paths=paths)
        if aimg is not None:
            parts.append(aimg)
    stacked = stack_images(parts, gap=12, align="left")
    if stacked is not None:
        return stacked
    # Offline / download failure → text fallback matching prior behavior
    lines = meta.get("lines") or []
    if not lines:
        return None
    return render_pill(lines, paths=paths)


def render_status_badge(label: str, *, paths: dict | None = None) -> Image.Image:
    """Kometa status is text-only (AIRING / RETURNING / …) on a 305×105 backdrop."""
    return render_pill([str(label or "STATUS").upper()], font_size=50, paths=paths)


def render_rating_badge(score: float, *, paths: dict | None = None, source: str = "tmdb") -> Image.Image:
    """Score text + official Kometa rating logo (TMDb / Audience / …)."""
    from kometa_images import load_image, rating_logo_rel

    text = f"{score:.1f}".rstrip("0").rstrip(".") if score < 10 else f"{score:.0f}"
    logo = load_image(rating_logo_rel(source), paths=paths)
    font = _find_font(63, weight="bold", paths=paths)
    pad = 15
    radius = 30
    gap = 12

    dummy = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    bb = dummy.textbbox((0, 0), text, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]

    logo_w = logo.width if logo is not None else 0
    logo_h = logo.height if logo is not None else 0
    content_w = logo_w + (gap if logo is not None else 0) + tw
    content_h = max(logo_h, th)
    w = content_w + pad * 2
    h = max(105, content_h + pad * 2)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=(0, 0, 0, 153))
    x = pad
    if logo is not None:
        ly = (h - logo_h) // 2
        img.alpha_composite(logo, (x, ly))
        x += logo_w + gap
    draw.text((x - bb[0], (h - th) / 2 - bb[1]), text, font=font, fill=(255, 255, 255, 255))
    return img


def render_network_badge(label: str, *, paths: dict | None = None) -> Image.Image:
    """Official Kometa network/color/{Name}.png, with text fallback."""
    from kometa_images import load_image, resolve_network_key

    key = resolve_network_key(label, paths=paths)
    if key:
        img = load_image(f"network/color/{key}.png", paths=paths)
        if img is not None:
            # Wrap in Kometa-sized translucent plate when logo is smaller than back_width
            plate_w, plate_h = 305, 105
            if img.width <= plate_w and img.height <= plate_h:
                plate = Image.new("RGBA", (plate_w, plate_h), (0, 0, 0, 0))
                draw = ImageDraw.Draw(plate)
                draw.rounded_rectangle([0, 0, plate_w - 1, plate_h - 1], radius=30, fill=(0, 0, 0, 153))
                ox = (plate_w - img.width) // 2
                oy = (plate_h - img.height) // 2
                plate.alpha_composite(img, (ox, oy))
                return plate
            return img
    return render_pill([str(label or "NETWORK")[:24]], paths=paths)


def _inspect_media(show) -> dict[str, Any]:
    """Best-effort resolution / HDR / DV / Atmos from a show's episodes."""
    info = {
        "resolution": None,
        "hdr": False,
        "dolbyVision": False,
        "hlg": False,
        "atmos": False,
        "truehdAtmos": False,
        "label": None,
        "lines": [],
    }
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
            dv = False
            hlg = False
            atmos = False
            truehd_atmos = False
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
                        if any(x in blob for x in ("dolby vision", "dovi", "dvhe", "dvh1")):
                            dv = True
                        if str(getattr(stream, "DOVIPresent", "") or "").lower() in {"1", "true"}:
                            dv = True
                        if "hlg" in blob or str(getattr(stream, "colorTrc", "") or "").lower() in {"arib-std-b67"}:
                            hlg = True
                        if any(x in blob for x in ("hdr", "pq")) or str(getattr(stream, "colorTrc", "") or "").lower() in {"smpte2084"}:
                            hdr = True
                    if stype in (2, "2", "audio") or "audio" in str(stype).lower():
                        if "atmos" in blob:
                            atmos = True
                            if "truehd" in blob:
                                truehd_atmos = True
            if res and (
                info["resolution"] is None
                or (res == "4K")
                or (res == "1080P" and info["resolution"] not in {"4K"})
            ):
                info["resolution"] = res
            info["hdr"] = info["hdr"] or hdr
            info["dolbyVision"] = info["dolbyVision"] or dv
            info["hlg"] = info["hlg"] or hlg
            info["atmos"] = info["atmos"] or atmos
            info["truehdAtmos"] = info["truehdAtmos"] or truehd_atmos
            if info["resolution"] == "4K" and (info["hdr"] or info["dolbyVision"]) and info["atmos"]:
                break
        if info["resolution"] == "4K" and (info["hdr"] or info["dolbyVision"]) and info["atmos"]:
            break

    lines = []
    if info["resolution"]:
        line = info["resolution"]
        if info["dolbyVision"]:
            line = f"{line} DV"
        elif info["hlg"]:
            line = f"{line} HLG"
        elif info["hdr"]:
            line = f"{line} HDR"
        lines.append(line)
    elif info["dolbyVision"]:
        lines.append("DV")
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
                    "resolution": info.get("resolution"),
                    "hdr": bool(info.get("hdr")),
                    "dolbyVision": bool(info.get("dolbyVision")),
                    "hlg": bool(info.get("hlg")),
                    "atmos": bool(info.get("atmos")),
                    "truehdAtmos": bool(info.get("truehdAtmos")),
                    "signature": "|".join(
                        [
                            str(info.get("resolution") or ""),
                            "dv" if info.get("dolbyVision") else ("hlg" if info.get("hlg") else ("hdr" if info.get("hdr") else "")),
                            "atmos" if info.get("atmos") else "",
                            "truehd" if info.get("truehdAtmos") else "",
                        ]
                    ),
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
        render_fn=lambda meta: render_media_badge(meta, paths=paths),
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
        render_fn=lambda meta: render_status_badge(meta.get("statusLabel") or "STATUS", paths=paths),
    )


def run_ratings_overlays(plex, config, paths, preview_mode, progress=None):
    paths.setdefault("ratingsLog", paths["root"] / "ratings_log.json")
    source = str(config.get("ratingsSource") or config.get("ratings_source") or "tmdb").strip() or "tmdb"
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
        render_fn=lambda meta: render_rating_badge(float(meta.get("score") or 0), paths=paths, source=source),
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
        render_fn=lambda meta: render_network_badge(meta.get("network") or "NETWORK", paths=paths),
    )


def ensure_placement_preview_badges(assets_dir: Path, paths: dict | None = None) -> None:
    """Write sample badges for the Placement editor using official Kometa images when available."""
    assets_dir = Path(assets_dir)
    assets_dir.mkdir(parents=True, exist_ok=True)
    cache_paths = paths
    if cache_paths is None:
        cache_paths = {"root": assets_dir.parent.parent if assets_dir.name == "presets" else assets_dir.parent}
        # Prefer config/overlays/kometa-images when assets live under overlays/assets/presets
        try:
            from kometa_images import default_cache_dir, prefetch_common
            cache_dir = default_cache_dir(cache_paths)
            cache_paths = {**cache_paths, "kometaImages": cache_dir}
            prefetch_common(paths=cache_paths)
        except Exception:
            pass

    samples = {
        "placement-media.png": render_media_badge(
            {"resolution": "4K", "hdr": True, "atmos": True, "lines": ["4K HDR", "ATMOS"]},
            paths=cache_paths,
        ),
        "placement-status.png": render_status_badge("RETURNING", paths=cache_paths),
        "placement-ratings.png": render_rating_badge(8.4, paths=cache_paths),
        "placement-network.png": render_network_badge("HBO", paths=cache_paths),
    }
    for name, img in samples.items():
        if img is None:
            continue
        path = assets_dir / name
        # Refresh when missing or still an old generated pill (force update once via mtime/size heuristic)
        try:
            if path.exists() and path.stat().st_size > 500:
                # Always refresh so Placement editor picks up real Kometa art after upgrade
                pass
        except Exception:
            pass
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

    try:
        from kometa_images import prefetch_common
        _progress(progress, "Caching Kometa overlay images…")
        prefetch_common(paths=paths)
    except Exception as exc:
        _progress(progress, f"Kometa image cache: {exc}")

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
