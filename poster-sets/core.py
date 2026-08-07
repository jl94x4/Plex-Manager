"""
Headless core for Poster Sets (MediUX / ThePosterDB → Plex).
Adapted from plex-poster-set-helper; no GUI dependencies.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable, Iterable, List, Optional, Sequence, Set, Tuple

from urllib.parse import quote, unquote

import plexapi.exceptions
import requests
from bs4 import BeautifulSoup
from plexapi.server import PlexServer

try:
    from plex_identity import configure_plex_identity
except ImportError:  # pragma: no cover - Dockerfile must COPY plex_identity.py
    def configure_plex_identity(force: bool = False) -> str:
        return ""

ProgressFn = Optional[Callable[[str], None]]
BatchFn = Optional[Callable[[dict], None]]


IMAGE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://mediux.pro/",
}

# Kometa marks items with Overlay so it can re-apply overlay art on the next run.
KOMETA_OVERLAY_LABELS = ("Overlay", "overlay")


def emit(progress: ProgressFn, message: str) -> None:
    if progress:
        progress(message)


def should_reset_overlay(config: Optional[dict] = None) -> bool:
    if not config:
        return True
    value = config.get("reset_overlay")
    return True if value is None else bool(value)


def clear_kometa_overlay(upload_target, config: Optional[dict] = None, progress: ProgressFn = None) -> None:
    """
    Remove Kometa's Overlay label so the next Kometa run reapplies overlays on the new art.
    Enabled by default; disable via config.reset_overlay = false.
    """
    if not should_reset_overlay(config):
        return
    for label in KOMETA_OVERLAY_LABELS:
        try:
            upload_target.removeLabel(label)
            return
        except Exception:
            continue


def asset_id(kind: str, poster: dict) -> str:
    raw = "|".join(
        [
            kind,
            str(poster.get("title") or ""),
            str(poster.get("year") or ""),
            str(poster.get("season") if poster.get("season") is not None else ""),
            str(poster.get("episode") if poster.get("episode") is not None else ""),
            str(poster.get("url") or ""),
        ]
    )
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def asset_label(kind: str, poster: dict) -> str:
    if kind == "collection":
        return "Collection"
    if kind == "movie":
        return "Movie poster"
    season = poster.get("season")
    episode = poster.get("episode")
    if season == "Cover":
        return "Show cover"
    if season == "Backdrop":
        return "Background"
    if season == 0:
        return "Specials"
    if episode == "Cover" or episode is None:
        return f"Season {season}"
    return f"S{season}E{episode}"


def asset_file_type(kind: str, poster: dict) -> str | None:
    """Map a poster row to a mediux_filters id (show assets only)."""
    explicit = poster.get("file_type") or poster.get("fileType")
    if explicit in {"title_card", "background", "season_cover", "show_cover"}:
        return explicit
    if kind != "show":
        return None
    season = poster.get("season")
    episode = poster.get("episode")
    if season == "Cover":
        return "show_cover"
    if season == "Backdrop":
        return "background"
    if episode == "Cover" or episode is None or episode == "":
        return "season_cover"
    return "title_card"


def _image_suffix(content_type: str, url: str) -> str:
    ct = (content_type or "").lower()
    if "png" in ct or url.lower().endswith(".png"):
        return ".png"
    if "webp" in ct or url.lower().endswith(".webp"):
        return ".webp"
    return ".jpg"


def _looks_like_image(data: bytes) -> bool:
    if len(data) < 24:
        return False
    if data[:3] == b"\xff\xd8\xff":
        return True  # JPEG
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return True  # PNG
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return True  # WEBP
    return False


def download_image(url: str, progress: ProgressFn = None, *, config: dict | None = None) -> Optional[str]:
    """Download an image to a temp file. Returns path or None."""
    target = str(url or "").strip()
    if not target:
        return None
    headers = dict(IMAGE_HEADERS)
    lower = target.lower()
    if "theposterdb.com" in lower:
        headers["Referer"] = "https://theposterdb.com/"
    elif "mediux.pro" in lower:
        headers["Referer"] = "https://mediux.pro/"
    try:
        session = None
        if "theposterdb.com" in lower and config:
            try:
                session = _posterdb_http_client(config)
            except Exception:
                session = None
        if isinstance(session, requests.Session):
            response = session.get(target, headers=headers, timeout=60)
        else:
            response = requests.get(target, headers=headers, timeout=60)
        response.raise_for_status()
        if not _looks_like_image(response.content):
            emit(progress, f"Downloaded non-image payload from {target[:80]}… ({len(response.content)} bytes)")
            return None
        suffix = _image_suffix(response.headers.get("content-type", ""), target)
        handle = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        handle.write(response.content)
        handle.close()
        return handle.name
    except Exception as exc:
        emit(progress, f"Failed to download image: {exc}")
        return None


def cleanup_temp_file(path: Optional[str]) -> None:
    if not path:
        return
    try:
        if os.path.exists(path):
            time.sleep(0.5)
            os.remove(path)
    except Exception:
        pass


def apply_poster_or_art(upload_target, poster: dict, *, art: bool = False, progress: ProgressFn = None) -> None:
    """
    Upload artwork to Plex and/or write beside media on disk when local mode is enabled.
    Always download MediUX/TPDB bytes first so "ok" means we had a real image.
    """
    config = poster.get("_config") if isinstance(poster.get("_config"), dict) else {}
    url = poster.get("url") or ""
    source = str(poster.get("source") or "").strip().lower()
    path = None
    needs_download = (
        source in {"mediux", "posterdb"}
        or "api.mediux.pro/assets/" in url
        or "theposterdb.com" in url.lower()
    )
    if needs_download:
        path = download_image(url, progress=progress, config=config)
        if not path:
            raise RuntimeError(f"Could not download image: {url}")
    try:
        if should_write_local(config):
            try:
                write_local_art(upload_target, poster, path=path, art=art, progress=progress)
            except Exception as exc:
                if not should_upload_plex(config):
                    raise
                emit(progress, f"Local art failed (continuing with Plex): {exc}")
        if should_upload_plex(config):
            if path:
                if art:
                    upload_target.uploadArt(filepath=path)
                else:
                    upload_target.uploadPoster(filepath=path)
            elif art:
                upload_target.uploadArt(url=url)
            else:
                upload_target.uploadPoster(url=url)
        elif not should_write_local(config):
            raise RuntimeError("No apply destination configured (set applyDestination in Poster Sets settings)")
    finally:
        cleanup_temp_file(path)


def apply_destination_mode(config: dict | None) -> str:
    cfg = config if isinstance(config, dict) else {}
    raw = str(cfg.get("apply_destination") or cfg.get("applyDestination") or "plex").strip().lower()
    if raw in ("both", "plex+local", "plex_and_local"):
        return "plex_local"
    return raw or "plex"


def should_upload_plex(config: dict | None) -> bool:
    mode = apply_destination_mode(config)
    return mode in ("plex", "plex_local", "")


def should_write_local(config: dict | None) -> bool:
    return apply_destination_mode(config) in ("local", "plex_local")


def _item_media_dir(item) -> Optional[str]:
    try:
        media = getattr(item, "media", None) or []
        if media:
            parts = getattr(media[0], "parts", None) or []
            if parts:
                media_file = getattr(parts[0], "file", None) or getattr(parts[0], "file", "")
                if media_file:
                    return os.path.dirname(str(media_file))
    except Exception:
        pass
    try:
        locations = getattr(item, "locations", None) or []
        if locations:
            return str(locations[0]).rstrip("\\/")
    except Exception:
        pass
    return None


def local_art_path(upload_target, poster: dict, *, art: bool = False) -> Optional[str]:
    """Resolve on-disk path for local artwork beside Plex media."""
    base_dir = _item_media_dir(upload_target)
    if not base_dir:
        return None
    season = poster.get("season")
    episode = poster.get("episode")
    file_type = asset_file_type("show", poster) if poster.get("season") is not None else asset_file_type("movie", poster)
    if art or season == "Backdrop" or file_type == "background":
        return os.path.join(base_dir, "fanart.jpg")
    if episode not in (None, "", "Cover") and isinstance(episode, (int, float)) or (
        isinstance(episode, str) and str(episode).isdigit()
    ):
        ep_dir = base_dir if os.path.basename(base_dir).lower().startswith("s") else base_dir
        return os.path.join(ep_dir, "thumb.jpg")
    if season not in (None, "", "Cover", "Backdrop") and isinstance(season, (int, float)):
        season_dir = base_dir
        try:
            locs = getattr(upload_target, "locations", None) or []
            if locs:
                season_dir = str(locs[0]).rstrip("\\/")
        except Exception:
            pass
        if season_dir and season_dir != base_dir:
            return os.path.join(season_dir, f"season{int(season):02d}-poster.jpg")
        return os.path.join(base_dir, f"season{int(season):02d}-poster.jpg")
    return os.path.join(base_dir, "poster.jpg")


def write_local_art(upload_target, poster: dict, *, path: Optional[str] = None, art: bool = False, progress: ProgressFn = None) -> None:
    dest_path = local_art_path(upload_target, poster, art=art)
    if not dest_path:
        raise RuntimeError("Local art failed: could not resolve media folder")
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    temp_path = path
    owned_temp = False
    if not temp_path:
        url = poster.get("url") or ""
        config = poster.get("_config") if isinstance(poster.get("_config"), dict) else {}
        temp_path = download_image(url, progress=progress, config=config)
        owned_temp = True
        if not temp_path:
            raise RuntimeError(f"Could not download image for local art: {url}")
    try:
        with open(temp_path, "rb") as src, open(dest_path, "wb") as dst:
            dst.write(src.read())
        emit(progress, f"Wrote local art: {dest_path}")
    finally:
        if owned_temp:
            cleanup_temp_file(temp_path)


def normalize_library_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, str):
        text = value.strip()
        return [text] if text else []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return []


def connect_plex(config: dict, progress: ProgressFn = None) -> Tuple[list, list, PlexServer]:
    configure_plex_identity()
    base_url = str(config.get("base_url") or "").strip()
    token = str(config.get("token") or "").strip()
    if not base_url or not token:
        raise ValueError("Plex base_url and token are required")

    plex = PlexServer(base_url, token)
    tv_names = normalize_library_list(config.get("tv_library"))
    movie_names = normalize_library_list(config.get("movie_library"))

    tv = []
    for name in tv_names:
        try:
            tv.append(plex.library.section(name))
            emit(progress, f"TV library ready: {name}")
        except plexapi.exceptions.NotFound as exc:
            raise ValueError(f'TV library named "{name}" not found') from exc

    movies = []
    for name in movie_names:
        try:
            movies.append(plex.library.section(name))
            emit(progress, f"Movie library ready: {name}")
        except plexapi.exceptions.NotFound as exc:
            raise ValueError(f'Movie library named "{name}" not found') from exc

    return tv, movies, plex


def test_connection(config: dict) -> dict:
    tv, movies, plex = connect_plex(config)
    sections = []
    try:
        for section in plex.library.sections():
            sections.append({"title": section.title, "type": getattr(section, "type", None)})
    except Exception:
        sections = []
    return {
        "ok": True,
        "server": getattr(plex, "friendlyName", None) or base_url_safe(config),
        "tvLibraries": [lib.title for lib in tv],
        "movieLibraries": [lib.title for lib in movies],
        "sections": sections,
    }


def base_url_safe(config: dict) -> str:
    return str(config.get("base_url") or "").strip()


_POSTERDB_SESSIONS: dict[str, requests.Session] = {}
_POSTERDB_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)


def _posterdb_session_cache_key(user: str, password: str) -> str:
    digest = hashlib.sha256(f"{user}\0{password}".encode("utf-8")).hexdigest()[:20]
    return f"{user.lower()}:{digest}"


def _posterdb_invalidate_sessions(user: str = "") -> None:
    if not user:
        _POSTERDB_SESSIONS.clear()
        return
    prefix = f"{user.lower()}:"
    for key in list(_POSTERDB_SESSIONS.keys()):
        if key.startswith(prefix):
            del _POSTERDB_SESSIONS[key]


def _posterdb_http_client(config: dict | None = None) -> requests.Session | type(requests):
    """Return an authenticated TPDB session when credentials exist in config."""
    config = config if isinstance(config, dict) else {}
    user = str(config.get("tpdb_username") or config.get("tpdb_login") or "").strip()
    password = str(config.get("tpdb_password") or "").strip()
    if not user or not password or password == "********":
        return requests
    cache_key = _posterdb_session_cache_key(user, password)
    cached = _POSTERDB_SESSIONS.get(cache_key)
    if cached is not None:
        return cached

    session = requests.Session()
    session.headers.update({"User-Agent": _POSTERDB_UA})
    try:
        login_page = session.get("https://theposterdb.com/login", timeout=60)
        login_soup = BeautifulSoup(login_page.text, "html.parser")
        token_node = login_soup.find("input", {"name": "_token"})
        token = str(token_node.get("value") or "") if token_node else ""
        response = session.post(
            "https://theposterdb.com/login",
            data={
                "_token": token,
                "login": user,
                "password": password,
                "remember": "on",
            },
            timeout=60,
            allow_redirects=True,
        )
        if "theposterdb.com/login" in str(response.url or "").lower() and response.status_code == 200:
            emit(None, "ThePosterDB login failed — check TPDB username/password in Poster Sets settings.")
            return requests
        _POSTERDB_SESSIONS[cache_key] = session
        return session
    except Exception as exc:
        emit(None, f"ThePosterDB login error: {exc}")
        return requests


def test_posterdb_login(config: dict | None = None) -> dict:
    """Verify TPDB credentials (advanced search requires an authenticated session)."""
    config = config if isinstance(config, dict) else {}
    user = str(config.get("tpdb_username") or config.get("tpdb_login") or "").strip()
    password = str(config.get("tpdb_password") or "").strip()
    if not user or not password or password == "********":
        return {"ok": False, "configured": False, "error": "TPDB username and password are not configured."}
    _posterdb_invalidate_sessions(user)
    session = _posterdb_http_client(config)
    if not isinstance(session, requests.Session):
        return {"ok": False, "configured": True, "error": "ThePosterDB login failed — check TPDB username/password."}
    response = session.get(
        "https://theposterdb.com/search/advanced/results",
        params={"category": "Shows", "tmdb_id": "97546"},
        timeout=60,
        allow_redirects=True,
    )
    if "theposterdb.com/login" in str(response.url or "").lower():
        _posterdb_invalidate_sessions(user)
        return {"ok": False, "configured": True, "error": "ThePosterDB session expired or login was rejected."}
    soup = BeautifulSoup(response.text, "html.parser")
    titles = _parse_posterdb_title_links(soup, limit=8)
    matched = None
    for item in titles:
        url = str(item.get("url") or "")
        if not url:
            continue
        try:
            probe = _posterdb_probe_title_page(url, config=config)
        except Exception:
            continue
        if str(probe.get("mediaId") or "") == "97546":
            matched = item
            break
    if not matched:
        if titles:
            return {
                "ok": True,
                "configured": True,
                "username": user,
                "warning": (
                    "ThePosterDB login OK. Advanced search responded, but the Ted Lasso TMDB probe "
                    "did not match — canonical TMDB resolve may still need TPDB Pro."
                ),
                "resultCount": len(titles),
            }
        return {
            "ok": False,
            "configured": True,
            "error": (
                "ThePosterDB login may have succeeded, but advanced TMDB search returned no title pages. "
                "Check credentials and whether your TPDB account includes advanced search (Pro)."
            ),
            "resultCount": 0,
        }
    return {"ok": True, "configured": True, "username": user, "sampleTitle": matched.get("title")}


def cook_soup(
    url: str,
    *,
    config: dict | None = None,
    timeout: float | None = None,
    retries: int = 3,
) -> BeautifulSoup:
    headers = {
        "User-Agent": _POSTERDB_UA,
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": "Windows",
    }
    wait = 20 if timeout is None and "theposterdb.com/search" in str(url or "").lower() else timeout
    if wait is None:
        wait = 60
    is_tpdb = "theposterdb.com" in str(url or "").lower()
    client = _posterdb_http_client(config) if is_tpdb else requests
    attempts = max(1, int(retries or 1))
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            if isinstance(client, requests.Session):
                response = client.get(url, headers=headers, timeout=wait)
            else:
                response = requests.get(url, headers=headers, timeout=wait)
            if response.status_code == 200 or (response.status_code == 500 and "mediux.pro" in url):
                return BeautifulSoup(response.text, "html.parser")
            if response.status_code in {429, 502, 503, 504} and attempt + 1 < attempts:
                time.sleep(1.25 * (attempt + 1))
                continue
            raise RuntimeError(f"Failed to retrieve the page. Status code: {response.status_code}")
        except (requests.Timeout, requests.ConnectionError) as exc:
            last_error = exc
            if attempt + 1 < attempts:
                time.sleep(1.0 * (attempt + 1))
                continue
            break
    if last_error:
        raise RuntimeError(f"Failed to retrieve the page: {last_error}") from last_error
    raise RuntimeError("Failed to retrieve the page.")


_POSTERDB_RESOLVE_CACHE: dict[str, tuple[float, Optional[dict]]] = {}
_POSTERDB_RESOLVE_CACHE_TTL_S = 10 * 60
_POSTERDB_RESOLVE_NEGATIVE_TTL_S = 90


def _posterdb_resolve_cache_key(
    *,
    title: str,
    year: int | None,
    tmdb_id: str | None,
    imdb_id: str | None,
    tvdb_id: str | None,
    media_type: str,
    authenticated: bool = False,
) -> str:
    return "|".join([
        str(title or "").strip().lower(),
        str(year or ""),
        str(tmdb_id or ""),
        str(imdb_id or ""),
        str(tvdb_id or ""),
        str(media_type or "").strip().lower(),
        "auth" if authenticated else "public",
    ])


def _posterdb_resolve_cache_get(key: str) -> tuple[bool, Optional[dict]]:
    hit = _POSTERDB_RESOLVE_CACHE.get(key)
    if not hit:
        return False, None
    at, value = hit
    ttl = _POSTERDB_RESOLVE_NEGATIVE_TTL_S if value is None else _POSTERDB_RESOLVE_CACHE_TTL_S
    if (time.time() - at) > ttl:
        _POSTERDB_RESOLVE_CACHE.pop(key, None)
        return False, None
    return True, value


def _posterdb_resolve_cache_set(key: str, value: Optional[dict]) -> None:
    _POSTERDB_RESOLVE_CACHE[key] = (time.time(), value)
    # Bound memory — drop oldest entries when oversized.
    if len(_POSTERDB_RESOLVE_CACHE) > 128:
        oldest = sorted(_POSTERDB_RESOLVE_CACHE.items(), key=lambda item: item[1][0])[:32]
        for stale_key, _ in oldest:
            _POSTERDB_RESOLVE_CACHE.pop(stale_key, None)


def _posterdb_has_credentials(config: dict | None) -> bool:
    config = config if isinstance(config, dict) else {}
    user = str(config.get("tpdb_username") or config.get("tpdb_login") or "").strip()
    password = str(config.get("tpdb_password") or "").strip()
    return bool(user and password and password != "********")


def _posterdb_search_terms_from_hint(title: str) -> list[str]:
    """Build several TPDB text-search terms — franchise spin-offs rarely match one string."""
    bare = re.sub(r"\s*\(\s*(?:\d{4}|n/a)\s*\)\s*$", "", str(title or "").strip(), flags=re.I).strip()
    terms: list[str] = []

    def add(value: str) -> None:
        text = str(value or "").strip()
        if not text or len(text) < 3:
            return
        key = text.lower()
        if any(key == existing.lower() for existing in terms):
            return
        terms.append(text)

    add(bare)
    if ":" in bare:
        add(bare.rsplit(":", 1)[-1].strip())
    spinoff = re.match(r"^power book\s+(?:ii|iii|iv|v|\d+)\s*:\s*(.+)$", bare, re.I)
    if spinoff:
        add(spinoff.group(1).strip())
    generic = re.match(r"^power book[^:]*:\s*(.+)$", bare, re.I)
    if generic:
        add(generic.group(1).strip())
    return terms[:5]


def parse_string_to_dict(input_string: str) -> dict:
    input_string = input_string.replace("\\\\\\\"", "")
    input_string = input_string.replace("\\", "")
    input_string = input_string.replace("u0026", "&")
    json_start_index = input_string.find("{")
    json_end_index = input_string.rfind("}")
    json_data = input_string[json_start_index : json_end_index + 1]
    return json.loads(json_data)


def _library_titles(libraries) -> str:
    names = []
    for lib in libraries or []:
        title = getattr(lib, "title", None) or str(lib)
        if title:
            names.append(str(title))
    return ", ".join(names) if names else "configured libraries"


def _normalize_plex_title_key(title: str) -> str:
    text = str(title or "").strip().lower()
    text = re.sub(r"\(\s*(?:\d{4}|n/a)\s*\)\s*$", "", text, flags=re.I).strip()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _plex_titles_exactly_match(left: str, right: str) -> bool:
    """Require the same work — 'Sisters' must not match 'Barbie & Her Sisters…'."""
    left_key = _normalize_plex_title_key(left)
    right_key = _normalize_plex_title_key(right)
    if not left_key or not right_key:
        return False
    if left_key == right_key:
        return True
    articles = {"the", "a", "an"}
    left_tokens = left_key.split()
    right_tokens = right_key.split()
    if left_tokens and left_tokens[0] in articles:
        left_tokens = left_tokens[1:]
    if right_tokens and right_tokens[0] in articles:
        right_tokens = right_tokens[1:]
    return bool(left_tokens) and left_tokens == right_tokens


def _fetch_plex_item_by_rating_key(plex, rating_key: str):
    key = str(rating_key or "").strip()
    if not plex or not key:
        return None
    try:
        return plex.fetchItem(int(key))
    except Exception:
        pass
    try:
        return plex.fetchItem(f"/library/metadata/{key}")
    except Exception:
        return None


def find_in_library(library, poster, *, plex=None, rating_key: str | None = None):
    """Locate Plex library items for a poster.

    Plex Section.get()/search() are fuzzy — ``Sisters (2015)`` can return
    ``Barbie & Her Sisters in the Great Puppy Adventure``. Always require an
    exact normalized title match, and prefer an explicit ratingKey when given.
    """
    hint_key = str(rating_key or poster.get("_ratingKey") or "").strip() or None
    plex_server = plex or poster.get("_plex")
    want_title = str(poster.get("title") or "").strip()
    # Library applies stamp the Plex item title — prefer that over scraped set titles.
    hint_title = str(poster.get("_plexHintTitle") or "").strip()
    pin_title = hint_title or want_title
    if hint_key and plex_server is not None:
        hit = _fetch_plex_item_by_rating_key(plex_server, hint_key)
        if hit is not None:
            hit_title = str(getattr(hit, "title", None) or "").strip()
            # Trust the pinned library item when it matches the library title (or poster title).
            if not pin_title or _plex_titles_exactly_match(pin_title, hit_title):
                return [hit]
            # Still trust an explicit library pin when the hint title matches the Plex item,
            # even if the scraped poster title differs (common for TPDB set naming).
            if hint_title and _plex_titles_exactly_match(hint_title, hit_title):
                return [hit]

    if not want_title and not hint_title:
        return None
    search_title = want_title or hint_title
    want_year = poster.get("year")
    try:
        want_year_int = int(want_year) if want_year is not None else None
    except Exception:
        want_year_int = None

    items = []
    seen_keys: set[str] = set()
    for lib in library or []:
        try:
            candidates = []
            try:
                if want_year_int is not None:
                    candidates.extend(list(lib.search(title=search_title, year=want_year_int) or []))
                else:
                    candidates.extend(list(lib.search(title=search_title) or []))
            except Exception:
                pass
            try:
                got = lib.get(search_title, year=want_year_int) if want_year_int is not None else lib.get(search_title)
                if got is not None:
                    candidates.insert(0, got)
            except Exception:
                pass

            for item in candidates:
                item_key = str(getattr(item, "ratingKey", None) or id(item))
                if item_key in seen_keys:
                    continue
                item_title = str(getattr(item, "title", None) or "").strip()
                if not _plex_titles_exactly_match(search_title, item_title):
                    continue
                if want_year_int is not None:
                    item_year = getattr(item, "year", None)
                    try:
                        if item_year is not None and int(item_year) != want_year_int:
                            continue
                    except Exception:
                        pass
                seen_keys.add(item_key)
                items.append(item)
        except Exception:
            pass
    return items or None


def find_collection(library, poster):
    collections = []
    want_title = str(poster.get("title") or "").strip()
    for lib in library:
        try:
            for plex_collection in lib.collections():
                if _plex_titles_exactly_match(want_title, str(getattr(plex_collection, "title", "") or "")):
                    collections.append(plex_collection)
        except Exception:
            pass
    return collections or None


def upload_tv_poster(poster, tv, progress: ProgressFn = None) -> dict:
    result = {
        "title": poster.get("title"),
        "kind": "show",
        "ok": False,
        "message": "",
        "id": poster.get("_assetId") or asset_id("show", poster),
        "season": poster.get("season"),
        "episode": poster.get("episode"),
    }
    tv_show_items = find_in_library(tv, poster)
    if not tv_show_items:
        result["message"] = f"{poster['title']} not found in any library."
        emit(progress, result["message"])
        return result

    for tv_show in tv_show_items:
        try:
            if poster["season"] == "Cover":
                upload_target = tv_show
                msg = f"Uploaded cover art for {poster['title']} in {tv_show.librarySectionTitle}."
            elif poster["season"] == 0:
                if poster["episode"] == "Cover" or poster["episode"] is None:
                    upload_target = tv_show.season("Specials")
                    msg = f"Uploaded art for {poster['title']} - Specials in {tv_show.librarySectionTitle}."
                else:
                    try:
                        upload_target = tv_show.season("Specials").episode(poster["episode"])
                        msg = (
                            f"Uploaded art for {poster['title']} - Specials "
                            f"Episode {poster['episode']} in {tv_show.librarySectionTitle}."
                        )
                    except Exception:
                        result["message"] = (
                            f"{poster['title']} - Specials Episode {poster['episode']} not found, skipping."
                        )
                        emit(progress, result["message"])
                        continue
            elif poster["season"] == "Backdrop":
                upload_target = tv_show
                msg = f"Uploaded background art for {poster['title']} in {tv_show.librarySectionTitle}."
            elif poster["season"] >= 1:
                if poster["episode"] == "Cover" or poster["episode"] is None:
                    upload_target = tv_show.season(poster["season"])
                    msg = (
                        f"Uploaded art for {poster['title']} - Season {poster['season']} "
                        f"in {tv_show.librarySectionTitle}."
                    )
                else:
                    try:
                        upload_target = tv_show.season(poster["season"]).episode(poster["episode"])
                        msg = (
                            f"Uploaded art for {poster['title']} - Season {poster['season']} "
                            f"Episode {poster['episode']} in {tv_show.librarySectionTitle}."
                        )
                    except Exception:
                        result["message"] = (
                            f"{poster['title']} - Season {poster['season']} Episode "
                            f"{poster['episode']} not found, skipping."
                        )
                        emit(progress, result["message"])
                        continue
            else:
                result["message"] = f"Unhandled season value for {poster['title']}"
                emit(progress, result["message"])
                continue

            apply_poster_or_art(upload_target, poster, art=(poster["season"] == "Backdrop"), progress=progress)
            clear_kometa_overlay(upload_target, config=poster.get("_config"), progress=progress)
            result["ok"] = True
            result["message"] = msg
            emit(progress, msg)
        except Exception as exc:
            result["message"] = (
                f"{poster['title']} - Season {poster.get('season')} upload failed "
                f"in {tv_show.librarySectionTitle}: {exc}"
            )
            emit(progress, result["message"])
    return result


def upload_movie_poster(poster, movies, progress: ProgressFn = None) -> dict:
    result = {
        "title": poster.get("title"),
        "kind": "movie",
        "ok": False,
        "message": "",
        "id": poster.get("_assetId") or asset_id("movie", poster),
    }
    movie_items = find_in_library(movies, poster)
    if not movie_items:
        result["message"] = f"{poster['title']} not found in any library."
        emit(progress, result["message"])
        return result
    for movie_item in movie_items:
        try:
            apply_poster_or_art(movie_item, poster, progress=progress)
            clear_kometa_overlay(movie_item, config=poster.get("_config"), progress=progress)
            msg = f'Uploaded art for {poster["title"]} in {movie_item.librarySectionTitle}.'
            result["ok"] = True
            result["message"] = msg
            emit(progress, msg)
        except Exception as exc:
            result["message"] = f'Unable to upload art for {poster["title"]}: {exc}'
            emit(progress, result["message"])
    return result


def upload_collection_poster(poster, movies, progress: ProgressFn = None) -> dict:
    result = {
        "title": poster.get("title"),
        "kind": "collection",
        "ok": False,
        "message": "",
        "id": poster.get("_assetId") or asset_id("collection", poster),
    }
    collection_items = find_collection(movies, poster)
    if not collection_items:
        result["message"] = f'{poster["title"]} collection not found in any library.'
        emit(progress, result["message"])
        return result
    for collection in collection_items:
        try:
            apply_poster_or_art(collection, poster, progress=progress)
            clear_kometa_overlay(collection, config=poster.get("_config"), progress=progress)
            msg = f'Uploaded art for {poster["title"]} in {collection.librarySectionTitle}.'
            result["ok"] = True
            result["message"] = msg
            emit(progress, msg)
        except Exception as exc:
            result["message"] = f'Unable to upload art for {poster["title"]}: {exc}'
            emit(progress, result["message"])
    return result


def scrape_posterdb_set_link(soup) -> Optional[str]:
    """Resolve a TPDb /poster/{id} page to its parent /set/{id} URL.

    Live TPDb markup uses a “View Set” button (often btn-outline-info).
    Older pages used a.rounded.view_all — keep that as a fallback.
    """
    if not soup:
        return None

    def _set_href(href: str) -> Optional[str]:
        value = str(href or "").strip()
        if not re.search(r"/set/\d+", value, re.I):
            return None
        return _absolute_url("https://theposterdb.com", value.split("?")[0])

    for anchor in soup.find_all("a", href=True):
        text = anchor.get_text(" ", strip=True).lower()
        if "view set" not in text:
            continue
        resolved = _set_href(anchor.get("href"))
        if resolved:
            return resolved

    legacy = soup.find("a", class_=re.compile(r"\bview_all\b"), href=True)
    if legacy:
        resolved = _set_href(legacy.get("href"))
        if resolved:
            return resolved

    for anchor in soup.find_all("a", href=True):
        classes = " ".join(anchor.get("class") or []).lower()
        text = anchor.get_text(" ", strip=True).lower()
        if "btn-outline-info" not in classes and "view" not in text:
            continue
        resolved = _set_href(anchor.get("href"))
        if resolved:
            return resolved

    return None


def scrape_posterdb_single_poster(soup, poster_url: str = "") -> Tuple[list, list, list, dict]:
    """Fallback when a /poster/ page has no parent set link — treat as a 1-asset set."""
    movieposters: list = []
    showposters: list = []
    collectionposters: list = []
    page_meta: dict = {"user": extract_creator_from_soup(soup) if soup else None}

    poster_id = None
    match = re.search(r"/poster/(\d+)", str(poster_url or ""), re.I)
    if match:
        poster_id = match.group(1)
    if not poster_id and soup:
        node = soup.find(attrs={"data-poster-id": True})
        if node:
            poster_id = str(node.get("data-poster-id") or "").strip() or None
    if not poster_id:
        return movieposters, showposters, collectionposters, page_meta

    asset_url = f"https://theposterdb.com/api/assets/{poster_id}"
    title = None
    year = None
    media_type = "Movie"
    if soup:
        heading = soup.find(["h1", "h2", "h3"])
        if heading:
            title_text = heading.get_text(" ", strip=True)
            title_text = re.sub(r"\s+Poster\s*$", "", title_text, flags=re.I).strip()
            year_match = re.search(r"\((\d{4}|N/A)\)\s*$", title_text)
            if year_match and year_match.group(1).isdigit():
                year = int(year_match.group(1))
                title = re.sub(r"\s*\((?:\d{4}|N/A)\)\s*$", "", title_text).strip() or title_text
            else:
                title = title_text or None
        tip = soup.find("a", attrs={"data-toggle": "tooltip", "title": True})
        if tip:
            tip_title = str(tip.get("title") or "").strip()
            if tip_title in {"Movie", "Show", "Collection"}:
                media_type = tip_title
        og = soup.find("meta", attrs={"property": "og:title"})
        if not title and og and og.get("content"):
            title = re.sub(r"\s*\|\s*TPDb.*$", "", str(og.get("content")), flags=re.I).strip() or None

    entry = {
        "title": title or f"Poster {poster_id}",
        "url": asset_url,
        "year": year,
        "source": "posterdb",
    }
    if media_type == "Show":
        entry["season"] = "Cover"
        entry["episode"] = None
        showposters.append(entry)
    elif media_type == "Collection":
        collectionposters.append(entry)
    else:
        movieposters.append(entry)

    page_meta.update({
        "title": title,
        "mediaType": "show" if showposters else ("movie" if movieposters else None),
        "resolvedUrl": str(poster_url or "").strip() or None,
    })
    return movieposters, showposters, collectionposters, page_meta


def scrape_posterd_user_info(soup) -> Optional[int]:
    try:
        span_tag = soup.find("span", class_="numCount")
        upload_count = int(span_tag["data-count"])
        return math.ceil(upload_count / 24)
    except Exception:
        return None


def scrape_posterdb(soup) -> Tuple[list, list, list]:
    movieposters = []
    showposters = []
    collectionposters = []
    poster_div = soup.find("div", class_="row d-flex flex-wrap m-0 w-100 mx-n1 mt-n1")
    if not poster_div:
        return movieposters, showposters, collectionposters
    posters = poster_div.find_all("div", class_="col-6 col-lg-2 p-1")
    for poster in posters:
        media_type = poster.find(
            "a", class_="text-white", attrs={"data-toggle": "tooltip", "data-placement": "top"}
        )["title"]
        overlay_div = poster.find("div", class_="overlay")
        poster_id = overlay_div.get("data-poster-id")
        poster_url = "https://theposterdb.com/api/assets/" + poster_id
        title_p = poster.find("p", class_="p-0 mb-1 text-break").string

        if media_type == "Show":
            title = title_p.split(" (")[0]
            try:
                year = int(title_p.split(" (")[1].split(")")[0])
            except Exception:
                year = None
            if " - " in title_p:
                split_season = title_p.split(" - ")[-1]
                if split_season == "Specials":
                    season: Any = 0
                elif "Season" in split_season:
                    season = int(split_season.split(" ")[1])
                else:
                    season = "Cover"
            else:
                season = "Cover"
            showposters.append(
                {
                    "title": title,
                    "url": poster_url,
                    "season": season,
                    "episode": None,
                    "year": year,
                    "source": "posterdb",
                }
            )
        elif media_type == "Movie":
            title_split = title_p.split(" (")
            if len(title_split[1]) != 5:
                title = title_split[0] + " (" + title_split[1]
            else:
                title = title_split[0]
            year = title_split[-1].split(")")[0]
            movieposters.append(
                {
                    "title": title,
                    "url": poster_url,
                    "year": int(year),
                    "source": "posterdb",
                }
            )
        elif media_type == "Collection":
            collectionposters.append(
                {
                    "title": title_p,
                    "url": poster_url,
                    "source": "posterdb",
                }
            )
    return movieposters, showposters, collectionposters


def check_mediux_filter(mediux_filters: Optional[Sequence[str]], filter_name: str) -> bool:
    return filter_name in mediux_filters if mediux_filters else True


def _pick_creator_username(value) -> Optional[str]:
    if isinstance(value, str):
        text = value.strip().lstrip("@")
        return text or None
    if isinstance(value, dict):
        for key in ("username", "user_name", "name", "handle", "slug", "display_name"):
            picked = _pick_creator_username(value.get(key))
            if picked:
                return picked
    return None


_CREATOR_PATH_SKIP = {"login", "signup", "register", "settings", "logout", "home"}


def _creator_from_user_href(href: str) -> Optional[str]:
    match = re.search(r"/user/([^/?#]+)", str(href or ""), re.I)
    if not match:
        return None
    user = unquote(match.group(1)).strip().lstrip("@")
    if not user or user.lower() in _CREATOR_PATH_SKIP:
        return None
    return user


def extract_creator_from_soup(soup) -> Optional[str]:
    if not soup:
        return None
    for anchor in soup.select("a[href*='/user/']"):
        user = _creator_from_user_href(anchor.get("href") or "")
        if user:
            return user
        text = (anchor.get_text(" ", strip=True) or "").strip().lstrip("@")
        if text and 1 < len(text) < 64 and text.lower() not in _CREATOR_PATH_SKIP:
            return text
    return None


def _extract_user_near_node(node, *, max_depth: int = 10) -> Optional[str]:
    """Find the creator for a MediUX set card without picking up siblings from the list parent."""
    best: Optional[str] = None
    current = node
    for _ in range(max(0, int(max_depth)) + 1):
        if current is None:
            break
        users: list[str] = []
        seen: set[str] = set()
        if hasattr(current, "find_all"):
            for anchor in current.find_all("a", href=True):
                user = _creator_from_user_href(anchor.get("href") or "")
                if not user:
                    continue
                key = user.lower()
                if key in seen:
                    continue
                seen.add(key)
                users.append(user)
        if len(users) == 1:
            best = users[0]
            classes = " ".join(current.get("class") or []) if hasattr(current, "get") else ""
            # MediUX title/set rows use a bordered card container.
            if "border-b" in classes or "text-card-foreground" in classes:
                return best
        elif len(users) > 1:
            return best
        current = getattr(current, "parent", None)
    return best


def _pick_id(value) -> Optional[str]:
    if value is None or value is False:
        return None
    text = str(value).strip()
    if not text or text.lower() in {"none", "null", "0"}:
        return None
    if text.isdigit() or text.replace("-", "").isalnum():
        return text
    return text or None


def extract_mediux_creator(data_dict, soup=None) -> Optional[str]:
    aset = (data_dict or {}).get("set") if isinstance(data_dict, dict) else None
    if isinstance(aset, dict):
        for key in ("user", "author", "owner", "created_by", "uploader", "profile", "creator"):
            picked = _pick_creator_username(aset.get(key))
            if picked:
                return picked
    return extract_creator_from_soup(soup)


def scrape_mediux(soup, mediux_filters: Optional[Sequence[str]] = None, progress: ProgressFn = None) -> Tuple[list, list, list, dict]:
    # Direct API assets — MediUX's /_next/image proxy now 403s scrapers/Plex (blank posters).
    base_url = "https://api.mediux.pro/assets/"
    scripts = soup.find_all("script")
    showposters = []
    movieposters = []
    collectionposters = []
    year = 0
    title = "Untitled"
    poster_data = None
    data_dict = None
    page_meta: dict = {"user": None, "title": None}

    for script in scripts:
        if "files" in script.text and "set" in script.text and "Set Link\\" not in script.text:
            try:
                data_dict = parse_string_to_dict(script.text)
                if "set" in data_dict and "files" in data_dict["set"]:
                    poster_data = data_dict["set"]["files"]
                    break
            except Exception:
                continue

    if not poster_data or not data_dict:
        raise RuntimeError("Could not parse MediUX set data from page")

    page_meta["user"] = extract_mediux_creator(data_dict, soup)
    try:
        aset = data_dict.get("set") or {}
        show = aset.get("show") or {}
        movie = aset.get("movie") or {}
        if isinstance(show, dict) and show.get("name"):
            page_meta["title"] = str(show.get("name") or "").strip() or None
            page_meta["tmdbId"] = _pick_id(show.get("id") or show.get("tmdb_id") or show.get("tmdbId"))
            page_meta["tvdbId"] = _pick_id(show.get("tvdb_id") or show.get("tvdbId") or show.get("tvdb"))
            page_meta["mediaType"] = "show"
        elif isinstance(movie, dict) and movie.get("title"):
            page_meta["title"] = str(movie.get("title") or "").strip() or None
            page_meta["tmdbId"] = _pick_id(movie.get("id") or movie.get("tmdb_id") or movie.get("tmdbId"))
            page_meta["tvdbId"] = _pick_id(movie.get("tvdb_id") or movie.get("tvdbId"))
            page_meta["mediaType"] = "movie"
        elif (aset.get("collection") or {}).get("collection_name"):
            page_meta["title"] = str(
                (aset.get("collection") or {}).get("collection_name") or ""
            ).strip() or None
    except Exception:
        pass

    media_type = None
    for data in poster_data:
        if (
            data.get("show_id") is not None
            or data.get("show_id_backdrop") is not None
            or data.get("episode_id") is not None
            or data.get("season_id") is not None
        ):
            media_type = "Show"
        else:
            media_type = "Movie"
    if media_type == "Show":
        page_meta["mediaType"] = "show"
    elif media_type == "Movie" and not page_meta.get("mediaType"):
        page_meta["mediaType"] = "movie"

    for data in poster_data:
        file_type = None
        season = None
        episode = None
        show_name = title

        if media_type == "Show":
            episodes = data_dict["set"]["show"]["seasons"]
            show_name = data_dict["set"]["show"]["name"]
            try:
                year = int(data_dict["set"]["show"]["first_air_date"][:4])
            except Exception:
                year = None

            if data.get("fileType") == "title_card":
                season = data["episode_id"]["season_id"]["season_number"]
                title = data["title"]
                try:
                    episode = int(title.rsplit(" E", 1)[1])
                except Exception:
                    emit(progress, f"Error getting episode number for {title}.")
                    episode = None
                file_type = "title_card"
            elif data.get("fileType") == "backdrop":
                season = "Backdrop"
                episode = None
                file_type = "background"
            elif data.get("season_id") is not None:
                season_id = data["season_id"]["id"]
                season_data = [episode for episode in episodes if episode["id"] == season_id][0]
                episode = "Cover"
                season = season_data["season_number"]
                file_type = "season_cover"
            elif data.get("show_id") is not None:
                season = "Cover"
                episode = None
                file_type = "show_cover"
            else:
                continue

        elif media_type == "Movie":
            if data.get("movie_id"):
                if data_dict["set"].get("movie"):
                    title = data_dict["set"]["movie"]["title"]
                    year = int(data_dict["set"]["movie"]["release_date"][:4])
                elif data_dict["set"].get("collection"):
                    movie_id = data["movie_id"]["id"]
                    movies = data_dict["set"]["collection"]["movies"]
                    movie_data = [movie for movie in movies if movie["id"] == movie_id][0]
                    title = movie_data["title"]
                    year = int(movie_data["release_date"][:4])
            elif data.get("collection_id"):
                title = data_dict["set"]["collection"]["collection_name"]

        image_stub = data["id"]
        poster_url = f"{base_url}{image_stub}"

        if media_type == "Show":
            showposter = {
                "title": show_name,
                "season": season,
                "episode": episode,
                "url": poster_url,
                "source": "mediux",
                "year": year,
                "file_type": file_type,
            }
            if check_mediux_filter(mediux_filters, file_type or ""):
                showposters.append(showposter)
            else:
                emit(progress, f"{show_name} - skipping. '{file_type}' is not in mediux_filters")
        elif media_type == "Movie":
            if "Collection" in str(title):
                collectionposters.append(
                    {"title": title, "url": poster_url, "source": "mediux"}
                )
            else:
                movieposters.append(
                    {
                        "title": title,
                        "year": int(year) if year else None,
                        "url": poster_url,
                        "source": "mediux",
                    }
                )

    if not page_meta.get("title"):
        for group in (showposters, movieposters, collectionposters):
            for poster in group:
                if poster.get("title"):
                    page_meta["title"] = str(poster.get("title") or "").strip() or None
                    break
            if page_meta.get("title"):
                break

    return movieposters, showposters, collectionposters, page_meta


def scrape(url: str, mediux_filters: Optional[Sequence[str]] = None, progress: ProgressFn = None) -> Tuple[list, list, list, dict]:
    if "theposterdb.com" in url:
        if "/set/" in url or "/user/" in url:
            soup = cook_soup(url)
            movieposters, showposters, collectionposters = scrape_posterdb(soup)
            title = None
            for group in (showposters, movieposters, collectionposters):
                for poster in group:
                    if poster.get("title"):
                        title = str(poster.get("title") or "").strip() or None
                        break
                if title:
                    break
            media_type = "show" if showposters else ("movie" if movieposters else None)
            return movieposters, showposters, collectionposters, {
                "user": extract_creator_from_soup(soup),
                "title": title,
                "mediaType": media_type,
            }
        if "/poster/" in url:
            soup = cook_soup(url)
            set_url = scrape_posterdb_set_link(soup)
            if set_url is None:
                # Some uploads are standalone — still allow preview/apply of the single asset.
                return scrape_posterdb_single_poster(soup, poster_url=url)
            set_soup = cook_soup(set_url)
            movieposters, showposters, collectionposters = scrape_posterdb(set_soup)
            title = None
            for group in (showposters, movieposters, collectionposters):
                for poster in group:
                    if poster.get("title"):
                        title = str(poster.get("title") or "").strip() or None
                        break
                if title:
                    break
            media_type = "show" if showposters else ("movie" if movieposters else None)
            return movieposters, showposters, collectionposters, {
                "user": extract_creator_from_soup(set_soup),
                "title": title,
                "mediaType": media_type,
                # Store the parent set so Recents reopen /set/… not the poster page.
                "resolvedUrl": set_url,
            }
        raise RuntimeError("Poster set not found. Check the link you are inputting.")
    if "mediux.pro" in url and "sets" in url:
        return scrape_mediux(cook_soup(url), mediux_filters=mediux_filters, progress=progress)
    raise RuntimeError("Poster set not found. Check the link you are inputting.")


def summarize_posters(movieposters, showposters, collectionposters) -> dict:
    return {
        "movies": len(movieposters),
        "shows": len(showposters),
        "collections": len(collectionposters),
        "total": len(movieposters) + len(showposters) + len(collectionposters),
        "samples": {
            "movies": [p.get("title") for p in movieposters[:8]],
            "shows": [p.get("title") for p in showposters[:8]],
            "collections": [p.get("title") for p in collectionposters[:8]],
        },
        "movieposters": movieposters,
        "showposters": showposters,
        "collectionposters": collectionposters,
    }


def parse_set_ref(url: str) -> dict:
    """Extract provider + set/poster id from a MediUX or ThePosterDB URL."""
    value = str(url or "").strip()
    lower = value.lower()
    provider = None
    set_id = None
    kind = None
    if "mediux.pro" in lower:
        provider = "mediux"
        match = re.search(r"/sets?/(\d+)", value, re.I)
        if match:
            set_id = match.group(1)
            kind = "set"
    elif "theposterdb.com" in lower:
        provider = "posterdb"
        match = re.search(r"/poster/(\d+)", value, re.I)
        if match:
            set_id = match.group(1)
            kind = "poster"
        else:
            match = re.search(r"/set/(\d+)", value, re.I)
            if match:
                set_id = match.group(1)
                kind = "set"
            elif "/user/" in lower:
                match = re.search(r"/user/([^/?#]+)", value, re.I)
                if match:
                    set_id = match.group(1)
                    kind = "user"
    return {"provider": provider, "setId": set_id, "kind": kind, "url": value}


def build_set_meta(
    url: str,
    movieposters=None,
    showposters=None,
    collectionposters=None,
    page_meta: Optional[dict] = None,
) -> dict:
    """Compact set summary: show/movie name + creator (not season pack labels)."""
    meta = page_meta if isinstance(page_meta, dict) else {}
    resolved = str(meta.get("resolvedUrl") or meta.get("resolved_url") or "").strip()
    canonical_url = resolved or str(url or "").strip()
    ref = parse_set_ref(canonical_url)
    title = str(meta.get("title") or "").strip() or None
    user = _pick_creator_username(meta.get("user"))
    thumb = ""
    for group in (showposters, movieposters, collectionposters):
        for poster in group or []:
            if not title and poster.get("title"):
                title = str(poster.get("title") or "").strip() or None
            if not thumb and poster.get("url"):
                thumb = str(poster.get("url") or "").strip()
            if title and thumb:
                break
        if title and thumb:
            break
    total = len(movieposters or []) + len(showposters or []) + len(collectionposters or [])
    if not title:
        if ref.get("setId"):
            title = f"Set {ref['setId']}"
        else:
            title = "Poster set"
    media_type = str(meta.get("mediaType") or meta.get("media_type") or "").strip().lower()
    if media_type in {"tv", "series", "shows", "show"}:
        media_type = "show"
    elif media_type in {"movies", "movie"}:
        media_type = "movie"
    elif showposters and not movieposters:
        media_type = "show"
    elif movieposters and not showposters:
        media_type = "movie"
    else:
        media_type = media_type or None
    return {
        "provider": ref.get("provider"),
        "setId": ref.get("setId"),
        "url": canonical_url or ref.get("url") or str(url or "").strip(),
        "title": title,
        "user": user,
        "tmdbId": _pick_id(meta.get("tmdbId") or meta.get("tmdb_id")),
        "tvdbId": _pick_id(meta.get("tvdbId") or meta.get("tvdb_id")),
        "mediaType": media_type,
        "thumbUrl": thumb,
        "assetCount": total or None,
    }


def match_show_target(tv_show, poster: dict) -> Tuple[bool, str]:
    season = poster.get("season")
    episode = poster.get("episode")
    section = getattr(tv_show, "librarySectionTitle", None) or "library"
    try:
        if season == "Cover" or season == "Backdrop":
            return True, section
        if season == 0:
            try:
                season_obj = tv_show.season("Specials")
            except Exception:
                return False, f"Specials season not in library ({section})"
            if episode == "Cover" or episode is None:
                return True, f"{section} · Specials"
            try:
                season_obj.episode(episode)
                return True, f"{section} · Specials E{episode}"
            except Exception:
                return False, f"Specials E{episode} not in library ({section})"
        if isinstance(season, int) and season >= 1:
            try:
                season_obj = tv_show.season(season)
            except Exception:
                return False, f"Season {season} not in library ({section})"
            if episode == "Cover" or episode is None:
                return True, f"{section} · Season {season}"
            try:
                season_obj.episode(episode)
                return True, f"{section} · S{season}E{episode}"
            except Exception:
                return False, f"S{season}E{episode} not in library ({section})"
        return False, f"Unhandled season target ({season!r})"
    except Exception:
        if isinstance(episode, int) and isinstance(season, int):
            return False, f"S{season}E{episode} not in library ({section})"
        if isinstance(season, int):
            return False, f"Season {season} not in library ({section})"
        return False, f"Target not in library ({section})"


def match_poster(kind: str, poster: dict, tv, movies) -> Tuple[bool, str]:
    title = str(poster.get("title") or "Untitled").strip() or "Untitled"
    year = poster.get("year")
    title_year = f"{title} ({year})" if year is not None else title
    if kind == "movie":
        items = find_in_library(movies, poster)
        if not items:
            libs = _library_titles(movies)
            year_note = f"; tried year {year}" if year is not None else ""
            return False, f"{title_year} not found in movie libraries ({libs}){year_note}"
        return True, items[0].librarySectionTitle
    if kind == "collection":
        items = find_collection(movies, poster)
        if not items:
            libs = _library_titles(movies)
            return False, f"Collection “{title}” not found ({libs})"
        return True, items[0].librarySectionTitle
    items = find_in_library(tv, poster)
    if not items:
        libs = _library_titles(tv)
        return False, f"{title_year} not found in TV libraries ({libs})"
    matched_any = False
    detail = ""
    for show in items:
        ok, detail = match_show_target(show, poster)
        if ok:
            matched_any = True
            break
    return matched_any, detail or f"{title_year} found, season/episode target missing"


def build_preview_assets(movieposters, showposters, collectionposters, tv=None, movies=None) -> List[dict]:
    assets = []
    for poster in movieposters:
        kind = "movie"
        matched, detail = (True, "") if tv is None else match_poster(kind, poster, tv, movies)
        assets.append(
            {
                "id": asset_id(kind, poster),
                "kind": kind,
                "title": poster.get("title") or "Untitled",
                "year": poster.get("year"),
                "season": None,
                "episode": None,
                "label": asset_label(kind, poster),
                "thumbUrl": poster.get("url") or "",
                "matched": matched if tv is not None else None,
                "matchDetail": detail,
                "source": poster.get("source"),
                "fileType": asset_file_type(kind, poster),
            }
        )
    for poster in showposters:
        kind = "show"
        matched, detail = (True, "") if tv is None else match_poster(kind, poster, tv, movies)
        assets.append(
            {
                "id": asset_id(kind, poster),
                "kind": kind,
                "title": poster.get("title") or "Untitled",
                "year": poster.get("year"),
                "season": poster.get("season"),
                "episode": poster.get("episode"),
                "label": asset_label(kind, poster),
                "thumbUrl": poster.get("url") or "",
                "matched": matched if tv is not None else None,
                "matchDetail": detail,
                "source": poster.get("source"),
                "fileType": asset_file_type(kind, poster),
            }
        )
    for poster in collectionposters:
        kind = "collection"
        matched, detail = (True, "") if tv is None else match_poster(kind, poster, tv, movies)
        assets.append(
            {
                "id": asset_id(kind, poster),
                "kind": kind,
                "title": poster.get("title") or "Untitled",
                "year": None,
                "season": None,
                "episode": None,
                "label": asset_label(kind, poster),
                "thumbUrl": poster.get("url") or "",
                "matched": matched if tv is not None else None,
                "matchDetail": detail,
                "source": poster.get("source"),
                "fileType": asset_file_type(kind, poster),
            }
        )
    return assets


def filter_posters_by_ids(
    movieposters,
    showposters,
    collectionposters,
    selected_ids: Optional[Sequence[str]],
) -> Tuple[list, list, list]:
    if not selected_ids:
        return movieposters, showposters, collectionposters
    wanted: Set[str] = {str(item) for item in selected_ids if str(item).strip()}
    if not wanted:
        return movieposters, showposters, collectionposters
    movies = [p for p in movieposters if asset_id("movie", p) in wanted or str(p.get("_assetId") or "") in wanted]
    shows = [p for p in showposters if asset_id("show", p) in wanted or str(p.get("_assetId") or "") in wanted]
    collections = [p for p in collectionposters if asset_id("collection", p) in wanted or str(p.get("_assetId") or "") in wanted]
    return movies, shows, collections


def _infer_source_from_url(url: str) -> str:
    lower = str(url or "").lower()
    if "theposterdb.com" in lower:
        return "posterdb"
    if "mediux" in lower:
        return "mediux"
    return "mediux"


def _normalize_season_value(value: Any) -> Any:
    if value is None or value == "":
        return None
    if value in ("Cover", "Backdrop"):
        return value
    try:
        return int(value)
    except Exception:
        return value


def poster_row_from_selected_asset(asset: dict) -> Tuple[str, dict]:
    kind = str(asset.get("kind") or "show").strip().lower()
    if kind not in {"movie", "show", "collection"}:
        kind = "show"
    url = str(asset.get("url") or asset.get("thumbUrl") or "").strip()
    poster = {
        "title": asset.get("title") or "Untitled",
        "year": asset.get("year"),
        "season": _normalize_season_value(asset.get("season")),
        "episode": asset.get("episode") if asset.get("episode") not in ("", None) else None,
        "url": url,
        "source": str(asset.get("source") or _infer_source_from_url(url)).strip().lower() or "mediux",
        "file_type": asset.get("fileType") or asset.get("file_type"),
    }
    asset_id_value = str(asset.get("id") or "").strip()
    poster["_assetId"] = asset_id_value or asset_id(kind, poster)
    return kind, poster


def posters_from_selected_assets(selected_assets: Optional[Sequence[dict]]) -> Tuple[list, list, list]:
    """Build poster rows from preview/inspect metadata — avoids a full set scrape on apply."""
    movies: list = []
    shows: list = []
    collections: list = []
    for raw in selected_assets or []:
        if not isinstance(raw, dict):
            continue
        kind, poster = poster_row_from_selected_asset(raw)
        if not poster.get("url"):
            continue
        if kind == "movie":
            movies.append(poster)
        elif kind == "collection":
            collections.append(poster)
        else:
            shows.append(poster)
    return movies, shows, collections


def list_assets(url: str, config: dict | None = None, progress: ProgressFn = None) -> dict:
    """Scrape a set URL and return asset fingerprints.

    When Plex credentials exist, also mark each asset matched against the library
    so watchers can apply season covers that become available later.
    """
    cfg = config if isinstance(config, dict) else {}
    filters = normalize_library_list(cfg.get("mediux_filters")) or [
        "title_card",
        "background",
        "season_cover",
        "show_cover",
    ]
    emit(progress, f"Listing assets from {url}")
    movieposters, showposters, collectionposters, page_meta = scrape(url, mediux_filters=filters, progress=progress)

    tv = movies = None
    if cfg.get("base_url") and cfg.get("token"):
        try:
            emit(progress, "Checking library matches for watched assets…")
            tv, movies, _plex = connect_plex(cfg, progress=progress)
        except Exception as exc:
            emit(progress, f"Match check skipped: {exc}")
            tv = movies = None

    assets = build_preview_assets(movieposters, showposters, collectionposters, tv=tv, movies=movies)
    set_meta = build_set_meta(url, movieposters, showposters, collectionposters, page_meta=page_meta)
    canonical = str(set_meta.get("url") or url or "").strip() or url
    return {
        "ok": True,
        "url": canonical,
        "setMeta": set_meta,
        "assets": [
            {
                "id": asset.get("id"),
                "kind": asset.get("kind"),
                "title": asset.get("title"),
                "year": asset.get("year"),
                "season": asset.get("season"),
                "episode": asset.get("episode"),
                "label": asset.get("label"),
                "source": asset.get("source"),
                "fileType": asset.get("fileType") or asset.get("file_type"),
                "matched": asset.get("matched"),
                "matchDetail": asset.get("matchDetail"),
            }
            for asset in assets
            if asset.get("id")
        ],
        "total": len(assets),
        "matched": sum(1 for asset in assets if asset.get("matched") is True),
        "unmatched": sum(1 for asset in assets if asset.get("matched") is False),
    }


def preview_url(url: str, config: dict, progress: ProgressFn = None) -> dict:
    filters = normalize_library_list(config.get("mediux_filters")) or [
        "title_card",
        "background",
        "season_cover",
        "show_cover",
    ]
    emit(progress, f"Scraping {url}")
    movieposters, showposters, collectionposters, page_meta = scrape(url, mediux_filters=filters, progress=progress)
    summary = summarize_posters(movieposters, showposters, collectionposters)

    tv = movies = None
    match_error = None
    try:
        if config.get("base_url") and config.get("token"):
            emit(progress, "Checking library matches…")
            tv, movies, _plex = connect_plex(config, progress=progress)
    except Exception as exc:
        match_error = str(exc)
        emit(progress, f"Match check skipped: {exc}")

    assets = build_preview_assets(movieposters, showposters, collectionposters, tv=tv, movies=movies)
    matched = sum(1 for asset in assets if asset.get("matched") is True)
    unmatched = sum(1 for asset in assets if asset.get("matched") is False)
    set_meta = build_set_meta(url, movieposters, showposters, collectionposters, page_meta=page_meta)
    canonical = str(set_meta.get("url") or url or "").strip() or url
    return {
        "ok": True,
        "url": canonical,
        **summary,
        "assets": assets,
        "matched": matched,
        "unmatched": unmatched,
        "matchError": match_error,
        "setMeta": set_meta,
    }


def apply_url(
    url: str,
    config: dict,
    progress: ProgressFn = None,
    selected_ids: Optional[Sequence[str]] = None,
    plex_hint: Optional[dict] = None,
    selected_assets: Optional[Sequence[dict]] = None,
) -> dict:
    filters = normalize_library_list(config.get("mediux_filters")) or [
        "title_card",
        "background",
        "season_cover",
        "show_cover",
    ]
    tv, movies, plex = connect_plex(config, progress=progress)
    page_meta = None
    if selected_ids and selected_assets:
        emit(progress, f"Applying {len(selected_ids)} selected asset(s) from preview (skipping re-scrape)")
        movieposters, showposters, collectionposters = posters_from_selected_assets(selected_assets)
        movieposters, showposters, collectionposters = filter_posters_by_ids(
            movieposters, showposters, collectionposters, selected_ids
        )
    else:
        emit(progress, f"Scraping {url}")
        movieposters, showposters, collectionposters, page_meta = scrape(url, mediux_filters=filters, progress=progress)
        movieposters, showposters, collectionposters = filter_posters_by_ids(
            movieposters, showposters, collectionposters, selected_ids
        )
    selected_count = len(selected_ids) if selected_ids else None
    asset_count = len(movieposters) + len(showposters) + len(collectionposters)
    if selected_ids and asset_count == 0:
        set_meta = build_set_meta(url, [], [], [], page_meta=page_meta)
        return {
            "ok": False,
            "url": url,
            "uploaded": 0,
            "attempted": 0,
            "selected": selected_count,
            "error": "None of the selected assets were found when re-scraping the set — nothing was applied.",
            "resetOverlay": should_reset_overlay(config),
            "counts": {"movies": 0, "shows": 0, "collections": 0},
            "results": [],
            "setMeta": set_meta,
        }
    if selected_ids:
        emit(progress, f"Applying {asset_count} selected asset(s)")

    hint = plex_hint if isinstance(plex_hint, dict) else {}
    rating_key = str(hint.get("ratingKey") or hint.get("rating_key") or "").strip() or None
    hint_title = str(hint.get("title") or "").strip() or None
    if rating_key:
        emit(progress, f"Pinning apply to Plex ratingKey {rating_key}")

    def _stamp(poster: dict) -> dict:
        stamped = {**poster, "_config": config}
        if rating_key:
            stamped["_ratingKey"] = rating_key
        if hint_title:
            stamped["_plexHintTitle"] = hint_title
        if plex is not None:
            stamped["_plex"] = plex
        return stamped

    results = []
    for poster in collectionposters:
        results.append(upload_collection_poster(_stamp(poster), movies, progress=progress))
    for poster in movieposters:
        results.append(upload_movie_poster(_stamp(poster), movies, progress=progress))
    for poster in showposters:
        results.append(upload_tv_poster(_stamp(poster), tv, progress=progress))
    uploaded = sum(1 for item in results if item.get("ok"))
    attempted = len(results)
    set_meta = build_set_meta(url, movieposters, showposters, collectionposters, page_meta=page_meta)
    ok = uploaded > 0
    error = None
    if not ok:
        if attempted == 0:
            error = "No posters were found to apply from this set."
        else:
            failed_msgs = [
                str(item.get("message") or "").strip()
                for item in results
                if not item.get("ok") and str(item.get("message") or "").strip()
            ]
            error = failed_msgs[0] if failed_msgs else f"Applied 0 of {attempted} poster(s) — nothing changed on Plex."
        emit(progress, error)
    return {
        "ok": ok,
        "url": url,
        "uploaded": uploaded,
        "attempted": attempted,
        "selected": selected_count,
        "error": error,
        "resetOverlay": should_reset_overlay(config),
        "counts": {
            "movies": len(movieposters),
            "shows": len(showposters),
            "collections": len(collectionposters),
        },
        "results": results,
        "setMeta": set_meta,
    }


def is_not_comment(url: str) -> bool:
    return bool(re.match(r"^(?!\/\/|#|^$)", url.strip()))


def parse_bulk_urls(lines: Iterable[str]) -> List[str]:
    urls = []
    for line in lines:
        url = str(line or "").strip()
        if url and is_not_comment(url):
            urls.append(url)
    return urls


def _absolute_url(base: str, href: str) -> str:
    value = str(href or "").strip()
    if not value:
        return ""
    if value.startswith("http://") or value.startswith("https://"):
        return value
    if value.startswith("//"):
        return "https:" + value
    if value.startswith("/"):
        return base.rstrip("/") + value
    return base.rstrip("/") + "/" + value


def _decode_next_image_url(src: str) -> str:
    value = str(src or "").strip()
    if not value:
        return ""
    match = re.search(r"[?&]url=([^&]+)", value)
    if match:
        return unquote(match.group(1))
    if value.startswith("http://") or value.startswith("https://"):
        return value
    return ""


def _posterdb_page_media(soup) -> Tuple[Optional[str], Optional[str]]:
    node = soup.find(attrs={"data-media-id": True}) if soup else None
    if not node:
        return None, None
    media_id = str(node.get("data-media-id") or "").strip() or None
    media_source = str(node.get("data-media-source") or "").strip().lower() or None
    return media_id, media_source


def _posterdb_count_set_links(soup) -> int:
    return len(set(re.findall(r"/set/(\d+)", str(soup or ""))))


def _posterdb_title_match_key(title: str, year: int | None) -> str:
    text = str(title or "").strip().lower()
    text = re.sub(r"\(\s*(?:\d{4}|n/a)\s*\)\s*$", "", text, flags=re.I).strip()
    text = re.sub(r"[^a-z0-9]+", " ", text).strip()
    year_part = str(int(year)) if year is not None and str(year).isdigit() else ""
    return f"{text}|{year_part}"


def _posterdb_title_only_key(title: str) -> str:
    return _posterdb_title_match_key(title, None).split("|", 1)[0]


def _posterdb_year_tolerance(media_type: str = "show") -> int:
    raw = str(media_type or "show").strip().lower()
    if raw in {"movie", "movies", "film"}:
        return 1
    return 5


def _posterdb_years_compatible(
    left: int | None,
    right: int | None,
    *,
    media_type: str = "show",
) -> bool:
    if left is None or right is None:
        return True
    try:
        left_val = int(left)
        right_val = int(right)
    except Exception:
        return True
    return abs(left_val - right_val) <= _posterdb_year_tolerance(media_type)


def _posterdb_title_matches_hint(
    item_title: str,
    item_year: int | None,
    *,
    title_hint: str,
    year_hint: int | None,
    media_type: str = "show",
) -> bool:
    if _posterdb_title_only_key(item_title) != _posterdb_title_only_key(title_hint):
        return False
    if year_hint is None:
        return True
    if item_year is None:
        return True
    if _posterdb_title_match_key(item_title, item_year) == _posterdb_title_match_key(title_hint, year_hint):
        return True
    return _posterdb_years_compatible(year_hint, item_year, media_type=media_type)


def _pick_posterdb_title_candidate(
    titles: list[dict],
    *,
    title_hint: str = "",
    year_hint: int | None = None,
    media_type: str = "show",
) -> Optional[dict]:
    """Pick the best TPDB /posters/ title page from text-search hits.

    Title (+ year when known) must match — never fall through to titles[0]
    from a fuzzy TPDB search (e.g. "The Python Hunt" → "Monty Python").
    """
    if not titles:
        return None
    want_key = _posterdb_title_match_key(title_hint, year_hint)
    title_only = _posterdb_title_only_key(title_hint)
    year_part = want_key.split("|", 1)[1] if "|" in want_key else ""
    if year_part:
        for item in titles:
            if _posterdb_title_match_key(item.get("title") or "", item.get("year")) == want_key:
                return item
        for item in titles:
            if _posterdb_title_matches_hint(
                item.get("title") or "",
                item.get("year"),
                title_hint=title_hint,
                year_hint=year_hint,
                media_type=media_type,
            ):
                return item
        # Year was requested but page-1 search missed it (common for "Sisters").
        # Do not fall through to an unrelated same-name / fuzzy hit.
        return None
    if title_only:
        for item in titles:
            if _posterdb_title_only_key(item.get("title") or "") == title_only:
                return item
        # Have a real title hint but no exact title match — refuse fuzzy first hit.
        return None
    # No usable title hint: caller must not rely on an arbitrary first result.
    return None


def _parse_posterdb_title_links(soup, *, limit: int = 24, html: str = "") -> list[dict]:
    titles: list[dict] = []
    seen: set[str] = set()
    for anchor in soup.find_all("a", href=True):
        href = str(anchor.get("href") or "")
        match = re.search(r"/posters/(\d+)", href)
        if not match:
            continue
        posters_id = match.group(1)
        if posters_id in seen or posters_id == "requests":
            continue
        title = anchor.get_text(" ", strip=True)
        if not title or len(title) < 2:
            continue
        seen.add(posters_id)
        year = None
        year_match = re.search(r"\((\d{4}|N/A)\)\s*$", title)
        if year_match and year_match.group(1).isdigit():
            year = int(year_match.group(1))
        thumb = ""
        for candidate in (anchor, anchor.parent):
            if not candidate:
                continue
            img = candidate.find("img") if hasattr(candidate, "find") else None
            if not img:
                continue
            thumb = str(img.get("data-src") or img.get("src") or "").strip()
            if thumb.startswith("/"):
                thumb = _absolute_url("https://theposterdb.com", thumb)
            if thumb and "missing_poster" not in thumb:
                break
            thumb = ""
        titles.append(
            {
                "id": posters_id,
                "title": title,
                "year": year,
                "url": _absolute_url("https://theposterdb.com", href.split("?")[0]),
                "thumbUrl": thumb,
                "mediaType": None,
                "provider": "posterdb",
            }
        )
        if len(titles) >= max(1, int(limit or 24)):
            break

    if titles:
        return titles

    blob = html or str(soup or "")
    for match in re.finditer(r'href=["\']([^"\']*/posters/(\d+)[^"\']*)["\']', blob, re.I):
        posters_id = match.group(2)
        if posters_id in seen or posters_id == "requests":
            continue
        seen.add(posters_id)
        href = match.group(1)
        titles.append(
            {
                "id": posters_id,
                "title": f"Title page {posters_id}",
                "year": None,
                "url": _absolute_url("https://theposterdb.com", href.split("?")[0]),
                "mediaType": None,
                "provider": "posterdb",
            }
        )
        if len(titles) >= max(1, int(limit or 24)):
            break
    return titles


def _posterdb_pick_thumb_from_soup(soup) -> str:
    if not soup:
        return ""
    og = soup.find("meta", property="og:image")
    if og and og.get("content"):
        thumb = str(og.get("content") or "").strip()
        if thumb:
            if thumb.startswith("/"):
                thumb = _absolute_url("https://theposterdb.com", thumb)
            if "missing_poster" not in thumb:
                return thumb
    for img in soup.select("img[src], img[data-src]"):
        src = str(img.get("data-src") or img.get("src") or "").strip()
        if not src or "missing_poster" in src:
            continue
        if "logo" in src.lower() and "poster" not in src.lower():
            continue
        if src.startswith("/"):
            src = _absolute_url("https://theposterdb.com", src)
        return src
    return ""


def _posterdb_enrich_title_thumbs(
    titles: list[dict],
    *,
    config: dict | None = None,
    progress: ProgressFn = None,
    limit: int = 12,
) -> None:
    """Fill missing search-result thumbs by probing each /posters/ page."""
    take = max(1, int(limit or 12))
    for item in titles[:take]:
        if str(item.get("thumbUrl") or "").strip():
            continue
        url = str(item.get("url") or "").strip()
        if not url:
            continue
        try:
            soup = cook_soup(url, config=config, timeout=18)
            thumb = _posterdb_pick_thumb_from_soup(soup)
            if thumb:
                item["thumbUrl"] = thumb
        except Exception as exc:
            emit(progress, f"ThePosterDB thumb probe failed for {url}: {exc}")


def _posterdb_probe_title_page(url: str, *, config: dict | None = None) -> dict:
    soup = cook_soup(url, config=config)
    media_id, media_source = _posterdb_page_media(soup)
    return {
        "mediaId": media_id,
        "mediaSource": media_source,
        "setCount": _posterdb_count_set_links(soup),
        "soup": soup,
    }


def _posterdb_advanced_category(media_type: str = "show") -> str:
    """TPDB advanced search expects title-case category values (Shows, Movies, All)."""
    raw = str(media_type or "show").strip().lower()
    if raw in {"movie", "movies", "film"}:
        return "Movies"
    if raw in {"show", "shows", "tv", "series"}:
        return "Shows"
    return "All"


def _posterdb_is_show(media_type: str = "show") -> bool:
    raw = str(media_type or "show").strip().lower()
    return raw in {"show", "shows", "tv", "series"}


def _posterdb_resolve_probe_limit(
    media_type: str = "show",
    *,
    target_tmdb: str | None = None,
    default: int = 10,
) -> int:
    """Shows need more probes — same-name hits bury the correct /posters/ page."""
    limit = max(1, int(default or 10))
    if not target_tmdb:
        return min(limit, 8)
    if _posterdb_is_show(media_type):
        return min(limit, 12)
    return min(limit, 8)


def _posterdb_advanced_resolve_by_ids(
    config: dict | None,
    *,
    tmdb_id: str | int | None = None,
    imdb_id: str | None = None,
    tvdb_id: str | int | None = None,
    category: str = "Shows",
    media_type: str = "show",
    progress: ProgressFn = None,
    limit: int = 24,
    merge_candidates: dict[str, dict] | None = None,
) -> Optional[dict]:
    """Resolve a canonical /posters/ page via separate id-only advanced queries.

    TPDB advanced search is more reliable with one id per request than combined
    tmdb+tvdb+imdb params (especially for TV shows).
    """
    if not _posterdb_has_credentials(config):
        return None
    target_tmdb = str(tmdb_id or "").strip() or None
    target_tvdb = str(tvdb_id or "").strip() or None
    clean_imdb = str(imdb_id or "").strip() or None

    id_specs: list[tuple[str, dict[str, str]]] = []
    if _posterdb_is_show(media_type):
        if target_tmdb:
            id_specs.append(("tmdb", {"tmdb_id": target_tmdb}))
        if target_tvdb:
            id_specs.append(("tvdb", {"tvdb_id": target_tvdb}))
        if clean_imdb:
            id_specs.append(("imdb", {"imdb_id": clean_imdb}))
    else:
        if target_tmdb:
            id_specs.append(("tmdb", {"tmdb_id": target_tmdb}))
        if clean_imdb:
            id_specs.append(("imdb", {"imdb_id": clean_imdb}))
        if target_tvdb:
            id_specs.append(("tvdb", {"tvdb_id": target_tvdb}))

    categories = [category]
    if category != "All":
        categories.append("All")

    def _merge_batch(batch: list[dict]) -> None:
        if merge_candidates is None:
            return
        for item in batch:
            pid = str(item.get("id") or "")
            if pid and pid not in merge_candidates:
                merge_candidates[pid] = item

    def _accept_item(item: dict, *, trust_singleton: bool) -> Optional[dict]:
        url = str(item.get("url") or "").strip()
        if not url:
            return None
        try:
            probe = _posterdb_probe_title_page(url, config=config)
        except Exception:
            probe = {}
        page_tmdb = str(probe.get("mediaId") or "").strip() or None
        set_count = int(probe.get("setCount") or 0)
        if target_tmdb and page_tmdb and page_tmdb != target_tmdb:
            return None
        if target_tmdb and not page_tmdb and not trust_singleton:
            return None
        return {
            **item,
            "url": url,
            "tmdbId": page_tmdb or target_tmdb,
            "setCount": set_count,
        }

    for _kind, id_params in id_specs:
        for category_value in categories:
            batch = search_posterdb_advanced_titles(
                config,
                term="",
                category=category_value,
                progress=progress,
                limit=limit,
                **id_params,
            )
            if not batch:
                continue
            _merge_batch(batch)
            if len(batch) == 1:
                accepted = _accept_item(batch[0], trust_singleton=True)
                if accepted:
                    return accepted
            if target_tmdb:
                for item in batch:
                    accepted = _accept_item(item, trust_singleton=False)
                    if accepted and str(accepted.get("tmdbId") or "") == target_tmdb:
                        return accepted
    return None


def search_posterdb_advanced_titles(
    config: dict | None,
    *,
    tmdb_id: str | int | None = None,
    imdb_id: str | None = None,
    tvdb_id: str | int | None = None,
    term: str = "",
    category: str = "Shows",
    progress: ProgressFn = None,
    limit: int = 24,
) -> list[dict]:
    """Authenticated advanced search — required for canonical /posters/ pages on many titles."""
    session = _posterdb_http_client(config)
    if not isinstance(session, requests.Session):
        return []
    params: dict[str, str] = {}
    category_value = str(category or "").strip()
    if category_value:
        params["category"] = category_value
    if tmdb_id not in (None, ""):
        params["tmdb_id"] = str(tmdb_id).strip()
    if imdb_id:
        params["imdb_id"] = str(imdb_id).strip()
    if tvdb_id not in (None, ""):
        params["tvdb_id"] = str(tvdb_id).strip()
    if term:
        params["term"] = str(term).strip()
    if not params.get("tmdb_id") and not params.get("imdb_id") and not params.get("tvdb_id") and not params.get("term"):
        return []
    emit(progress, "Searching ThePosterDB advanced catalog…")

    def _fetch(active_session: requests.Session) -> requests.Response:
        return active_session.get(
            "https://theposterdb.com/search/advanced/results",
            params=params,
            timeout=60,
            allow_redirects=True,
        )

    response = _fetch(session)
    if "theposterdb.com/login" in str(response.url or "").lower():
        user = str((config or {}).get("tpdb_username") or (config or {}).get("tpdb_login") or "").strip()
        _posterdb_invalidate_sessions(user)
        retry_session = _posterdb_http_client(config)
        if isinstance(retry_session, requests.Session):
            response = _fetch(retry_session)
        if "theposterdb.com/login" in str(response.url or "").lower():
            emit(progress, "ThePosterDB advanced search requires login — add TPDB credentials in Poster Sets settings.")
            return []
    soup = BeautifulSoup(response.text, "html.parser")
    return _parse_posterdb_title_links(soup, limit=limit, html=response.text)


def resolve_posterdb_title_page(
    *,
    query: str = "",
    title: str = "",
    year: int | None = None,
    tmdb_id: str | int | None = None,
    imdb_id: str | None = None,
    tvdb_id: str | int | None = None,
    media_type: str = "show",
    config: dict | None = None,
    progress: ProgressFn = None,
    limit: int = 24,
    probe_limit: int = 10,
) -> Optional[dict]:
    """Pick the best TPDB /posters/ page — prefer TMDB match and the most sets."""
    target_tmdb = str(tmdb_id or "").strip() or None
    clean_title = str(title or "").strip()
    clean_query = str(query or "").strip()
    # Prefer bare title for search pagination (year is matched from result labels).
    bare_title = re.sub(r"\s*\(\s*(?:\d{4}|n/a)\s*\)\s*$", "", clean_title or clean_query, flags=re.I).strip()
    cache_key = _posterdb_resolve_cache_key(
        title=bare_title or clean_title or clean_query,
        year=year,
        tmdb_id=target_tmdb,
        imdb_id=str(imdb_id or "").strip() or None,
        tvdb_id=str(tvdb_id or "").strip() or None,
        media_type=media_type,
        authenticated=_posterdb_has_credentials(config),
    )
    cached_hit, cached_value = _posterdb_resolve_cache_get(cache_key)
    if cached_hit:
        return cached_value

    def _finish(value: Optional[dict]) -> Optional[dict]:
        _posterdb_resolve_cache_set(cache_key, value)
        return value

    candidates: dict[str, dict] = {}
    category = _posterdb_advanced_category(media_type)
    want_key = _posterdb_title_match_key(bare_title or clean_title or clean_query, year)
    has_creds = _posterdb_has_credentials(config)
    if target_tmdb and not has_creds:
        emit(
            progress,
            "ThePosterDB login not configured — show matching uses public text search only. "
            "Add TPDB credentials in Poster Sets settings for TMDB/TVDB id resolve.",
        )

    def _accept_year_hit(item: dict) -> Optional[dict]:
        url = str(item.get("url") or "").strip()
        if not url:
            return None
        if not target_tmdb:
            return {**item, "url": url, "setCount": int(item.get("setCount") or 0)}
        try:
            probe = _posterdb_probe_title_page(url, config=config)
        except Exception:
            return None
        if str(probe.get("mediaId") or "") == target_tmdb:
            return {
                **item,
                "url": url,
                "tmdbId": probe.get("mediaId"),
                "setCount": int(probe.get("setCount") or 0),
            }
        if not probe.get("mediaId"):
            return {
                **item,
                "url": url,
                "tmdbId": target_tmdb,
                "setCount": int(probe.get("setCount") or 0),
            }
        return None

    # When logged in, resolve by external ids before multi-page text search.
    if has_creds and (target_tmdb or imdb_id or tvdb_id):
        advanced_hit = _posterdb_advanced_resolve_by_ids(
            config,
            tmdb_id=target_tmdb,
            imdb_id=imdb_id,
            tvdb_id=tvdb_id,
            category=category,
            media_type=media_type,
            progress=progress,
            limit=limit,
            merge_candidates=candidates,
        )
        if advanced_hit:
            return _finish(advanced_hit)

    # Fast path: parallel paginated text search for exact title+year (no login required).
    if year is not None and bare_title:
        text = search_posterdb_titles(
            bare_title,
            progress=progress,
            limit=max(limit, 36),
            config=config,
            media_type=media_type,
            _skip_resolve=True,
            year_hint=year,
            max_pages=3,
        )
        for item in text.get("titles") or []:
            pid = str(item.get("id") or "")
            if pid and pid not in candidates:
                candidates[pid] = item
            if want_key and _posterdb_title_match_key(item.get("title") or "", item.get("year")) == want_key:
                accepted = _accept_year_hit(item)
                if accepted:
                    return _finish(accepted)
            if _posterdb_title_matches_hint(
                item.get("title") or "",
                item.get("year"),
                title_hint=bare_title or clean_title or clean_query,
                year_hint=year,
                media_type=media_type,
            ):
                accepted = _accept_year_hit(item)
                if accepted:
                    return _finish(accepted)

    # Bare title search — always merge when resolving by TMDB so a wrong Plex season-year
    # (Sugar library 2026 vs catalog 2024) cannot strand us on year-mismatched candidates only.
    search_terms = _posterdb_search_terms_from_hint(bare_title or clean_title or clean_query)
    if bare_title and (not candidates or target_tmdb):
        for term in search_terms:
            text = search_posterdb_titles(
                term,
                progress=progress,
                limit=limit,
                config=config,
                media_type=media_type,
                _skip_resolve=True,
                max_pages=5 if target_tmdb else 2,
                year_hint=year if term == (bare_title or search_terms[0]) else None,
            )
            for item in text.get("titles") or []:
                pid = str(item.get("id") or "")
                if pid and pid not in candidates:
                    candidates[pid] = item

    if not candidates:
        return _finish(None)

    best_item: Optional[dict] = None
    best_score: tuple[int, int, int, int] = (-1, -1, -1, -1)
    max_probes = _posterdb_resolve_probe_limit(
        media_type,
        target_tmdb=target_tmdb,
        default=int(probe_limit or 10),
    )

    ordered = list(candidates.values())
    if want_key and not want_key.startswith("|"):
        exact = [item for item in ordered if _posterdb_title_match_key(item.get("title") or "", item.get("year")) == want_key]
        if exact:
            ordered = exact + [item for item in ordered if item not in exact]
        elif year is not None:
            tolerant = [
                item for item in ordered
                if _posterdb_title_matches_hint(
                    item.get("title") or "",
                    item.get("year"),
                    title_hint=bare_title or clean_title or clean_query,
                    year_hint=year,
                    media_type=media_type,
                )
            ]
            if tolerant:
                ordered = tolerant + [item for item in ordered if item not in tolerant]

    for idx, item in enumerate(ordered[:max_probes]):
        url = str(item.get("url") or "").strip()
        if not url:
            continue
        try:
            probe = _posterdb_probe_title_page(url, config=config)
        except Exception:
            continue
        media_id = probe.get("mediaId")
        set_count = int(probe.get("setCount") or 0)
        tmdb_match = 1 if target_tmdb and str(media_id or "") == target_tmdb else 0
        title_key = _posterdb_title_match_key(item.get("title") or "", item.get("year"))
        title_match = 1 if want_key and title_key == want_key else 0
        title_compatible = _posterdb_title_matches_hint(
            item.get("title") or "",
            item.get("year"),
            title_hint=bare_title or clean_title or clean_query,
            year_hint=year,
            media_type=media_type,
        )
        if target_tmdb and not tmdb_match:
            if media_id and str(media_id) != target_tmdb:
                continue
            if not title_compatible:
                continue
        elif want_key and not want_key.startswith("|") and not title_match and not title_compatible:
            continue
        relaxed_title_match = 1 if title_compatible else 0
        score = (tmdb_match, title_match or relaxed_title_match, set_count, -idx)
        if score > best_score:
            best_score = score
            best_item = {
                **item,
                "url": url,
                "tmdbId": media_id,
                "setCount": set_count,
            }
            if (tmdb_match or title_match) and set_count > 0:
                break

    # Do NOT relax into a different TMDB id — that caused Sisters (2026) for Sisters (2015).
    if best_item is None and not target_tmdb and year is not None and want_key:
        for item in ordered:
            if _posterdb_title_match_key(item.get("title") or "", item.get("year")) == want_key:
                url = str(item.get("url") or "").strip()
                if url:
                    return _finish({**item, "url": url, "setCount": int(item.get("setCount") or 0)})
        for item in ordered:
            if _posterdb_title_matches_hint(
                item.get("title") or "",
                item.get("year"),
                title_hint=bare_title or clean_title or clean_query,
                year_hint=year,
                media_type=media_type,
            ):
                url = str(item.get("url") or "").strip()
                if url:
                    return _finish({**item, "url": url, "setCount": int(item.get("setCount") or 0)})

    # TMDB pin + strict year can miss the right page when catalog year differs (e.g. 2026 vs 2024).
    if best_item is None and target_tmdb and year is not None:
        title_hint_str = bare_title or clean_title or clean_query
        for item in ordered[:max_probes]:
            if not _posterdb_title_matches_hint(
                item.get("title") or "",
                item.get("year"),
                title_hint=title_hint_str,
                year_hint=None,
                media_type=media_type,
            ):
                continue
            url = str(item.get("url") or "").strip()
            if not url:
                continue
            try:
                probe = _posterdb_probe_title_page(url, config=config)
            except Exception:
                continue
            media_id = probe.get("mediaId")
            if media_id and str(media_id) != target_tmdb:
                continue
            best_item = {
                **item,
                "url": url,
                "tmdbId": media_id or target_tmdb,
                "setCount": int(probe.get("setCount") or 0),
            }
            break

    return _finish(best_item)


def _collect_posterdb_show_posters(soup, *, limit: int = 40, page_title: str = "") -> list[dict]:
    """Fallback: title pages that list individual posters instead of /set/ links."""
    results: dict[str, dict] = {}
    for node in soup.select("[data-poster-id]"):
        poster_id = str(node.get("data-poster-id") or "").strip()
        if not poster_id or not poster_id.isdigit() or poster_id in results:
            continue
        thumb = ""
        img = node.find("img")
        if img:
            thumb = str(img.get("data-src") or img.get("src") or "").strip()
            if thumb.startswith("/"):
                thumb = _absolute_url("https://theposterdb.com", thumb)
        user = None
        user_node = node.find("a", href=re.compile(r"/user/"))
        if user_node:
            user = user_node.get_text(" ", strip=True) or None
        label = page_title or "Poster"
        results[poster_id] = {
            "setId": poster_id,
            "url": _absolute_url("https://theposterdb.com", f"/poster/{poster_id}"),
            "title": label,
            "thumbUrl": thumb,
            "user": user,
            "posterCount": 1,
            "provider": "posterdb",
            "setKind": "posters",
        }
        if len(results) >= max(1, int(limit or 40)):
            break
    return list(results.values())


def search_posterdb_titles(
    query: str,
    progress: ProgressFn = None,
    limit: int = 24,
    *,
    config: dict | None = None,
    tmdb_id: str | int | None = None,
    imdb_id: str | None = None,
    tvdb_id: str | int | None = None,
    media_type: str = "show",
    _skip_resolve: bool = False,
    year_hint: int | None = None,
    max_pages: int = 1,
) -> dict:
    term = str(query or "").strip()
    if not term:
        raise ValueError("query is required")
    year_val = year_hint
    if year_val is None:
        year_match = re.search(r"(?:\(|^|\s)(19\d{2}|20\d{2})(?:\)|$|\s)", term)
        if year_match:
            year_val = int(year_match.group(1))
    # Ambiguous titles (Sisters, etc.) bury the matching year on later pages.
    # Cap at 3 and fetch in parallel — usually enough, much faster than serial page walks.
    pages = max(1, int(max_pages or 1))
    if year_val is not None or tmdb_id:
        pages = max(pages, 3)
    pages = min(pages, 3)

    titles: list[dict] = []
    seen: set[str] = set()
    title_only = _posterdb_title_only_key(term)
    want_key = _posterdb_title_match_key(term, year_val) if year_val is not None else ""

    def _page_url(page: int) -> str:
        base = f"https://theposterdb.com/search?term={quote(term)}"
        return f"{base}&page={page}" if page > 1 else base

    def _fetch_page(page: int):
        emit(
            progress,
            f"Searching ThePosterDB for “{term}” (page {page})…" if page > 1 else f"Searching ThePosterDB for “{term}”…",
        )
        soup = cook_soup(_page_url(page), config=config, timeout=20)
        return page, _parse_posterdb_title_links(soup, limit=max(limit, 36))

    def _batch_has_year_match(batch: list[dict]) -> bool:
        if want_key and any(
            _posterdb_title_match_key(item.get("title") or "", item.get("year")) == want_key
            for item in batch
        ):
            return True
        if year_val is not None and title_only and any(
            _posterdb_title_matches_hint(
                item.get("title") or "",
                item.get("year"),
                title_hint=term,
                year_hint=year_val,
                media_type=media_type,
            )
            for item in batch
        ):
            return True
        return False

    page_batches: dict[int, list[dict]] = {}
    if pages <= 1:
        page_num, batch = _fetch_page(1)
        page_batches[page_num] = batch
    else:
        # Parallel page fetch — Sisters (2015) lives on page 2; one round-trip beats serial walking.
        with ThreadPoolExecutor(max_workers=min(pages, 3)) as pool:
            futures = [pool.submit(_fetch_page, page) for page in range(1, pages + 1)]
            for future in as_completed(futures):
                try:
                    page_num, batch = future.result()
                except Exception as exc:
                    emit(progress, f"ThePosterDB search page failed: {exc}")
                    continue
                page_batches[page_num] = batch

    for page in sorted(page_batches):
        batch = page_batches.get(page) or []
        if not batch:
            continue
        for item in batch:
            pid = str(item.get("id") or "")
            if not pid or pid in seen:
                continue
            seen.add(pid)
            titles.append(item)
        if _batch_has_year_match(batch):
            # Keep any already-fetched later pages that finished in parallel, but stop preferring more work.
            break

    if not _skip_resolve and (tmdb_id or imdb_id or tvdb_id or len(titles) > 1):
        resolved = resolve_posterdb_title_page(
            query=term,
            title=term,
            year=year_val,
            tmdb_id=tmdb_id,
            imdb_id=imdb_id,
            tvdb_id=tvdb_id,
            media_type=media_type,
            config=config,
            progress=progress,
            limit=limit,
        )
        if resolved:
            rid = str(resolved.get("id") or "")
            if rid:
                titles = [t for t in titles if str(t.get("id") or "") != rid]
                titles.insert(0, resolved)

    # Keep year / exact matches even when they were found on later pages.
    if want_key:
        exact = [
            item for item in titles
            if _posterdb_title_match_key(item.get("title") or "", item.get("year")) == want_key
        ]
        rest = [item for item in titles if item not in exact]
        titles = exact + rest
    elif year_val is not None and title_only:
        exact = [
            item for item in titles
            if _posterdb_title_only_key(item.get("title") or "") == title_only
            and item.get("year") == year_val
        ]
        rest = [item for item in titles if item not in exact]
        titles = exact + rest

    take = max(1, int(limit or 24))
    trimmed = titles[:take]
    _posterdb_enrich_title_thumbs(trimmed, config=config, progress=progress, limit=min(take, 12))
    return {
        "ok": True,
        "provider": "posterdb",
        "phase": "titles",
        "query": term,
        "titles": trimmed,
        "sets": [],
    }


def list_posterdb_sets(
    title_url: str,
    progress: ProgressFn = None,
    limit: int = 40,
    *,
    config: dict | None = None,
    tmdb_id: str | int | None = None,
    imdb_id: str | None = None,
    tvdb_id: str | int | None = None,
    title_hint: str = "",
    year_hint: int | None = None,
    media_type: str = "show",
    _depth: int = 0,
    explicit_title_url: bool = False,
) -> dict:
    url = str(title_url or "").strip()
    explicit_url = explicit_title_url or bool(url)
    year_val = year_hint
    if year_val is not None and not isinstance(year_val, int):
        try:
            year_val = int(year_val)
        except Exception:
            year_val = None
    target_tmdb = str(tmdb_id or "").strip() or None
    fallback_url = url
    depth = max(0, int(_depth or 0))

    if url and target_tmdb and not explicit_url:
        try:
            probe = _posterdb_probe_title_page(url, config=config)
            page_tmdb = str(probe.get("mediaId") or "").strip()
            if page_tmdb and page_tmdb != target_tmdb:
                emit(
                    progress,
                    f"ThePosterDB title page uses TMDB {page_tmdb}, not {target_tmdb} — trying title search…",
                )
                fallback_url = url
                url = ""
        except Exception:
            pass

    if not url and (target_tmdb or imdb_id or tvdb_id or title_hint):
        resolved = resolve_posterdb_title_page(
            query=title_hint,
            title=title_hint,
            year=year_val,
            tmdb_id=target_tmdb,
            imdb_id=imdb_id,
            tvdb_id=tvdb_id,
            media_type=media_type,
            config=config,
            progress=progress,
            limit=limit,
            probe_limit=_posterdb_resolve_probe_limit(media_type, target_tmdb=target_tmdb),
        )
        resolved_url = str(resolved.get("url") or "").strip() if resolved else ""
        if resolved_url:
            url = resolved_url

    # Never fall back to a known-wrong TMDB title page when we have a target id.
    if not url and fallback_url and not target_tmdb:
        url = fallback_url

    if not url or "theposterdb.com" not in url.lower() or "/posters/" not in url.lower():
        raise ValueError("A ThePosterDB /posters/… title URL is required")
    emit(progress, f"Loading sets from {url}")
    soup = cook_soup(url, config=config)
    page_title = ""
    for node in soup.find_all(["h1", "h2"]):
        text = str(node.get_text(" ", strip=True) or "").strip()
        if not text:
            continue
        lower = text.lower()
        if "theposterdb" in lower and len(text) < 24:
            continue
        page_title = text
        break
    if not page_title:
        heading = soup.find("title")
        if heading:
            page_title = heading.get_text(" ", strip=True)
    page_media_id, _ = _posterdb_page_media(soup)
    sets: dict = {}
    _collect_posterdb_set_cards(soup, sets=sets, limit=limit)
    results = list(sets.values())

    if not results:
        page_media_id, _ = _posterdb_page_media(soup)
        if depth < 1:
            resolved = resolve_posterdb_title_page(
                query=title_hint or page_title,
                title=title_hint or page_title,
                year=year_val,
                tmdb_id=target_tmdb or page_media_id,
                imdb_id=imdb_id,
                tvdb_id=tvdb_id,
                media_type=media_type,
                config=config,
                progress=progress,
            )
            alt_url = str(resolved.get("url") or "").strip() if resolved else ""
            if alt_url and alt_url.rstrip("/") != url.rstrip("/"):
                emit(progress, f"Retrying ThePosterDB title page {alt_url}")
                return list_posterdb_sets(
                    alt_url,
                    progress=progress,
                    limit=limit,
                    config=config,
                    tmdb_id=target_tmdb or page_media_id,
                    imdb_id=imdb_id,
                    tvdb_id=tvdb_id,
                    title_hint=title_hint or page_title,
                    year_hint=year_val,
                    media_type=media_type,
                    _depth=depth + 1,
                    explicit_title_url=explicit_url,
                )

        poster_fallback = _collect_posterdb_show_posters(soup, limit=limit, page_title=page_title)
        if poster_fallback:
            emit(progress, f"Using {len(poster_fallback)} individual poster(s) from ThePosterDB title page.")
            results = poster_fallback

    for item in results:
        if not item.get("title"):
            item["title"] = page_title or f"Set {item['setId']}"

    # Last-line guard: if we somehow opened a fuzzy TPDB page, drop unrelated set cards.
    # Skip when the title page itself matches the work — set cards often label creator handles.
    hint = str(title_hint or "").strip()
    page_matches_hint = bool(
        hint
        and page_title
        and _posterdb_title_matches_hint(
            page_title,
            year_val,
            title_hint=hint,
            year_hint=year_val,
            media_type=media_type,
        )
    )
    tmdb_confirmed = bool(
        target_tmdb
        and page_media_id
        and str(page_media_id) == target_tmdb
    )
    if hint and results and not page_matches_hint and not explicit_url and not tmdb_confirmed:
        hint_tokens = [
            tok
            for tok in re.sub(r"[^a-z0-9]+", " ", hint.lower()).split()
            if tok and tok not in {"the", "a", "an"}
        ]
        if hint_tokens:
            filtered = []
            for item in results:
                blob = re.sub(
                    r"[^a-z0-9]+",
                    " ",
                    str(item.get("title") or page_title or "").lower(),
                )
                blob_tokens = [tok for tok in blob.split() if tok]
                if len(hint_tokens) == 1:
                    ok = blob_tokens == hint_tokens
                else:
                    ok = any(
                        blob_tokens[i : i + len(hint_tokens)] == hint_tokens
                        for i in range(0, max(0, len(blob_tokens) - len(hint_tokens) + 1))
                    )
                if ok:
                    filtered.append(item)
            if filtered and len(filtered) != len(results):
                emit(
                    progress,
                    f"Dropped {len(results) - len(filtered)} ThePosterDB set(s) that did not match “{hint}”.",
                )
                results = filtered

    return {
        "ok": True,
        "provider": "posterdb",
        "phase": "sets",
        "titleUrl": url,
        "title": page_title or None,
        "titles": [],
        "sets": results,
    }


def _infer_set_kind(*, title: str = "", card_text: str = "") -> Optional[str]:
    blob = f"{title} {card_text}".strip().lower()
    if not blob:
        return None
    if "boxset" in blob or "box set" in blob:
        return "boxset"
    if re.search(r"\b(backdrops?|backgrounds?)\b", blob, re.I):
        return "backgrounds"
    if re.search(r"(title\s*cards?|episode\s*cards?|cover\s*style|episode\s*titles?)", blob, re.I):
        return "title_cards"
    return None


def _infer_mediux_set_kind_from_card(card, *, media_type: str | None = None) -> Optional[str]:
    """Infer kind from MediUX card chrome.

    Show pages use aspect-video shells for episode title-card carousels, but the same
    shell is also used for boxset backdrop rails — prefer explicit card text, and never
    treat movie landscape rails as title cards (movies have no episode title cards).
    """
    if card is None or not hasattr(card, "find_all"):
        return None
    try:
        card_text = str(card.get_text(" ", strip=True) or "").lower()
    except Exception:
        card_text = ""
    if "boxset" in card_text or "box set" in card_text:
        return "boxset"
    if re.search(r"\b(backdrops?|backgrounds?)\b", card_text):
        return "backgrounds"
    video = 0
    poster = 0
    for node in card.find_all(True):
        classes = " ".join(node.get("class") or [])
        if "aspect-video" in classes:
            video += 1
        elif "aspect-2/3" in classes:
            poster += 1
    if video > poster:
        kind = str(media_type or "").strip().lower()
        if kind in {"movie", "movies"}:
            return "backgrounds"
        return "title_cards"
    return None


def _resolve_mediux_set_kind(
    *,
    title: str = "",
    card_text: str = "",
    card=None,
    media_type: str | None = None,
) -> Optional[str]:
    """Prefer explicit text labels over aspect-ratio heuristics."""
    text_kind = _infer_set_kind(title=title, card_text=card_text)
    if text_kind in {"boxset", "backgrounds", "title_cards"}:
        return text_kind
    section_kind = _infer_mediux_set_kind_from_card(card, media_type=media_type)
    return section_kind or text_kind


def _mediux_card_row(node):
    current = node
    for _ in range(12):
        if current is None:
            break
        classes = " ".join(current.get("class") or []) if hasattr(current, "get") else ""
        # Show-page rows use border-b; posters/title_cards grids use card shells.
        if "border-b" in classes or "text-card-foreground" in classes:
            return current
        current = getattr(current, "parent", None)
    return None


def _clean_mediux_set_title(value: str) -> str:
    title = str(value or "").strip()
    if not title:
        return ""
    if title.lower() in {
        "peek",
        "yaml",
        "download",
        "sets",
        "posters",
        "previous slide",
        "next slide",
        "boxset",
        "collection",
    }:
        return ""
    return title[:160]


def _title_from_mediux_card_text(card_text: str, user: str | None = None) -> str:
    text = " ".join(str(card_text or "").split()).strip()
    if not text:
        return ""
    # "2 The Shards (2026) by willtong93" / "Peek YAML Download …"
    text = re.sub(r"\b(Peek|YAML|Download|Previous slide|Next slide)\b", " ", text, flags=re.I)
    text = re.sub(r"^\d+\s+", "", text).strip()
    if user:
        text = re.sub(rf"\s+by\s+{re.escape(user)}\s*$", "", text, flags=re.I).strip()
        text = re.sub(rf"\s+{re.escape(user)}\s*$", "", text, flags=re.I).strip()
    text = re.sub(r"\s+by\s+[A-Za-z0-9._-]{1,64}\s*$", "", text, flags=re.I).strip()
    return _clean_mediux_set_title(text)


def _enrich_mediux_set_entry(anchor, entry: dict, *, media_type: str | None = None) -> None:
    """Fill creator / title / setKind from the surrounding MediUX card row."""
    card = _mediux_card_row(anchor)
    card_text = card.get_text(" ", strip=True) if card is not None else ""
    user = _extract_user_near_node(anchor)
    if user and not entry.get("user"):
        entry["user"] = user
    if (not entry.get("title") or str(entry.get("title") or "").startswith("Set ")) and card is not None:
        title = ""
        if hasattr(card, "find"):
            for tag in ("h2", "h3", "h4", "p"):
                node = card.find(tag)
                if not node:
                    continue
                title = _clean_mediux_set_title(node.get_text(" ", strip=True))
                if title:
                    break
        if not title:
            title = _title_from_mediux_card_text(card_text, entry.get("user") or user)
        if title:
            entry["title"] = title
    kind = _resolve_mediux_set_kind(
        title=str(entry.get("title") or ""),
        card_text=card_text,
        card=card,
        media_type=media_type or entry.get("mediaType"),
    )
    existing_kind = str(entry.get("setKind") or "").strip().lower()
    # Prefer definitive labels (boxset/backgrounds) over a prior aspect-video title_cards guess.
    if kind and (
        not existing_kind
        or kind == existing_kind
        or kind in {"boxset", "backgrounds"}
        or (kind == "title_cards" and existing_kind not in {"boxset", "backgrounds"})
    ):
        entry["setKind"] = kind
    elif not existing_kind:
        inferred = _infer_set_kind(title=str(entry.get("title") or ""))
        if inferred:
            entry["setKind"] = inferred


def _mediux_thumb_asset_key(url: str) -> str:
    raw = str(url or "").strip()
    if not raw:
        return ""
    try:
        decoded = unquote(raw)
        match = re.search(r"/assets/([^/?#]+)", decoded, re.I)
        if match:
            return match.group(1).lower()
    except Exception:
        pass
    return raw.lower()


def _collapse_mediux_near_duplicate_sets(results: list[dict]) -> list[dict]:
    """MediUX title pages repeat carousel slides as multiple /sets/ ids with the same thumb."""
    seen: set[str] = set()
    out: list[dict] = []
    for item in results:
        user = str(item.get("user") or "").strip().lower().lstrip("@")
        thumb = _mediux_thumb_asset_key(str(item.get("thumbUrl") or ""))
        if thumb and len(thumb) > 6:
            key = f"thumb:{user}:{thumb}"
        else:
            title = _posterdb_title_only_key(str(item.get("title") or ""))
            key = f"title:{user}:{title}" if title and user else f"id:{item.get('setId')}"
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def list_mediux_sets(media_type: str, tmdb_id: int | str, progress: ProgressFn = None, limit: int = 40) -> dict:
    kind = str(media_type or "movie").strip().lower()
    if kind in {"tv", "series", "show", "shows"}:
        kind = "show"
        path = "shows"
    else:
        kind = "movie"
        path = "movies"
    tmdb = str(tmdb_id or "").strip()
    if not tmdb.isdigit():
        raise ValueError("tmdbId is required for MediUX browse")
    page_url = f"https://mediux.pro/{path}/{tmdb}"
    emit(progress, f"Loading MediUX {kind} page {tmdb}…")
    soup = cook_soup(page_url)
    page_title = ""
    if soup.title:
        page_title = soup.title.get_text(" ", strip=True)
    sets: dict = {}
    for anchor in soup.find_all("a", href=True):
        href = str(anchor.get("href") or "")
        match = re.search(r"/sets/(\d+)", href)
        if not match:
            continue
        set_id = match.group(1)
        title = _clean_mediux_set_title(anchor.get_text(" ", strip=True))
        card = _mediux_card_row(anchor)
        thumb = _pick_mediux_set_thumb(card or anchor, fallback="")
        if not thumb:
            img = anchor.find("img")
            if img:
                thumb = _decode_next_image_url(img.get("src") or "")
                if not thumb:
                    thumb = img.get("src") or ""
                    if thumb.startswith("/"):
                        # Keep api.mediux asset URLs only when decoded; skip next/image paths.
                        thumb = ""
        entry = sets.get(set_id) or {
            "setId": set_id,
            "url": f"https://mediux.pro/sets/{set_id}",
            "title": "",
            "thumbUrl": "",
            "user": None,
            "posterCount": None,
            "provider": "mediux",
            "setKind": None,
        }
        if title and (not entry["title"] or entry["title"].startswith("Set ")):
            entry["title"] = title
        _enrich_mediux_set_entry(anchor, entry, media_type=kind)
        preferred = _pick_mediux_set_thumb(
            card or anchor,
            set_kind=entry.get("setKind"),
            fallback=entry.get("thumbUrl") or thumb,
        )
        if preferred:
            entry["thumbUrl"] = preferred
        elif thumb and not entry["thumbUrl"]:
            entry["thumbUrl"] = thumb
        sets[set_id] = entry
        if len(sets) >= max(1, int(limit or 40)):
            break
    results = _collapse_mediux_near_duplicate_sets(list(sets.values()))
    for item in results:
        if not item.get("title"):
            item["title"] = page_title or f"Set {item['setId']}"
        if not item.get("setKind"):
            item["setKind"] = _infer_set_kind(title=str(item.get("title") or ""))
        # Movies never ship episode title-card packs; demote aspect-video false positives.
        if kind == "movie" and str(item.get("setKind") or "").strip().lower() in {
            "title_cards",
            "title-cards",
            "titlecard",
        }:
            title_blob = str(item.get("title") or "")
            if not re.search(r"(title\s*cards?|episode\s*cards?)", title_blob, re.I):
                item["setKind"] = "backgrounds"
    return {
        "ok": True,
        "provider": "mediux",
        "phase": "sets",
        "mediaType": kind,
        "tmdbId": tmdb,
        "titleUrl": page_url,
        "title": page_title or None,
        "titles": [],
        "sets": results,
    }


def _normalize_creator_username(value: str) -> str:
    raw = str(value or "").strip()
    if raw.startswith("@"):
        raw = raw[1:].strip()
    # Accept pasted profile URLs.
    match = re.search(r"/(?:user)/([^/?#]+)", raw, re.I)
    if match:
        raw = unquote(match.group(1))
    raw = raw.strip().strip("/")
    if not raw or not re.fullmatch(r"[A-Za-z0-9._-]{1,64}", raw):
        raise ValueError("Enter a creator username (letters, numbers, . _ -).")
    return raw


def _collect_posterdb_set_cards(soup, *, sets: dict, limit: int, default_user: str | None = None) -> None:
    for badge in soup.select("a.set_poster_count[href*='/set/']"):
        href = str(badge.get("href") or "")
        match = re.search(r"/set/(\d+)", href)
        if not match:
            continue
        set_id = match.group(1)
        if set_id in sets:
            continue
        poster_count = None
        count_text = badge.get_text(" ", strip=True)
        if count_text.isdigit():
            poster_count = int(count_text)
        card = badge
        for _ in range(8):
            if card.parent is None:
                break
            card = card.parent
            classes = card.get("class") or []
            if "hovereffect" in classes:
                break
        title = ""
        user = default_user
        thumb = ""
        title_node = card.select_one(".poster-title-correction p") if hasattr(card, "select_one") else None
        if title_node:
            title = title_node.get_text(" ", strip=True)
        user_node = card.select_one("a[href*='/user/']") if hasattr(card, "select_one") else None
        if user_node:
            user = user_node.get_text(" ", strip=True) or user
        picture = card.find("picture") if hasattr(card, "find") else None
        if picture:
            for source in picture.find_all("source", srcset=True):
                candidate = str(source.get("srcset") or "").split()[0].strip()
                if candidate and "missing_poster" not in candidate:
                    thumb = candidate
                    break
        if not thumb:
            img = card.find("img") if hasattr(card, "find") else None
            if img:
                thumb = img.get("data-src") or img.get("src") or ""
        if thumb and thumb.startswith("/"):
            thumb = _absolute_url("https://theposterdb.com", thumb)
        if thumb and "missing_poster" in thumb:
            thumb = ""
        # Fallback: any /set/ links in the card row may not have set_poster_count styling.
        sets[set_id] = {
            "setId": set_id,
            "url": _absolute_url("https://theposterdb.com", f"/set/{set_id}"),
            "title": title or f"Set {set_id}",
            "thumbUrl": thumb,
            "user": user,
            "posterCount": poster_count,
            "provider": "posterdb",
        }
        if len(sets) >= max(1, int(limit or 40)):
            return

    if len(sets) >= max(1, int(limit or 40)):
        return

    # User upload pages sometimes only expose per-poster cards with set links.
    for anchor in soup.find_all("a", href=True):
        href = str(anchor.get("href") or "")
        match = re.search(r"/set/(\d+)", href)
        if not match:
            continue
        set_id = match.group(1)
        if set_id in sets:
            continue
        title = anchor.get_text(" ", strip=True)
        thumb = ""
        img = anchor.find("img")
        if img:
            thumb = img.get("data-src") or img.get("src") or ""
            if thumb.startswith("/"):
                thumb = _absolute_url("https://theposterdb.com", thumb)
            if "missing_poster" in thumb:
                thumb = ""
        sets[set_id] = {
            "setId": set_id,
            "url": _absolute_url("https://theposterdb.com", f"/set/{set_id}"),
            "title": title[:160] if title else f"Set {set_id}",
            "thumbUrl": thumb,
            "user": default_user,
            "posterCount": None,
            "provider": "posterdb",
        }
        if len(sets) >= max(1, int(limit or 40)):
            return


def _mediux_thumb_from_img(img) -> str:
    if not img:
        return ""
    for attr in ("src", "data-src"):
        candidate = _decode_next_image_url(img.get(attr) or "")
        if candidate:
            return candidate
        raw = str(img.get(attr) or "")
        if "api.mediux.pro" in raw:
            return raw if raw.startswith("http") else _absolute_url("https://mediux.pro", raw)
    srcset = str(img.get("srcset") or "")
    if srcset:
        first = srcset.split(",")[0].strip().split(" ")[0]
        candidate = _decode_next_image_url(first)
        if candidate:
            return candidate
    return ""


def _mediux_img_aspect_kind(img) -> str:
    """Return 'video' (16:9 title cards/backdrops) or 'poster' (2:3) from nearest shell."""
    node = img
    for _ in range(8):
        if node is None:
            break
        classes = " ".join(node.get("class") or [])
        if "aspect-video" in classes:
            return "video"
        if "aspect-2/3" in classes or "aspect-[2/3]" in classes:
            return "poster"
        node = getattr(node, "parent", None)
    return ""


def _mediux_thumbs_from_node(node) -> list[tuple[str, str]]:
    """Collect (aspect, url) pairs for images under a MediUX card/anchor."""
    if node is None or not hasattr(node, "find_all"):
        return []
    out: list[tuple[str, str]] = []
    seen: set[str] = set()
    for img in node.find_all("img"):
        url = _mediux_thumb_from_img(img)
        if not url or url in seen:
            continue
        seen.add(url)
        out.append((_mediux_img_aspect_kind(img), url))
    return out


def _pick_mediux_set_thumb(
    node,
    *,
    set_kind: str | None = None,
    fallback: str = "",
) -> str:
    """Prefer landscape thumbs for title-card / backdrop packs (posters often come first in HTML)."""
    thumbs = _mediux_thumbs_from_node(node)
    kind = str(set_kind or "").strip().lower().replace("-", "_")
    prefer_video = kind in {"title_cards", "titlecard", "backgrounds", "background", "backdrop", "backdrops"}
    if prefer_video:
        for aspect, url in thumbs:
            if aspect == "video" and url:
                return url
    for _aspect, url in thumbs:
        if url:
            return url
    return str(fallback or "").strip()


def _collect_mediux_set_cards(soup, *, sets: dict, default_user: str | None = None) -> int:
    """Collect MediUX set cards from one page. Returns newly discovered count."""
    added = 0
    for anchor in soup.find_all("a", href=True):
        href = str(anchor.get("href") or "")
        match = re.search(r"/sets/(\d+)", href)
        if not match:
            continue
        set_id = match.group(1)
        title = _clean_mediux_set_title(anchor.get_text(" ", strip=True))
        card = _mediux_card_row(anchor)
        thumb = _pick_mediux_set_thumb(card or anchor, fallback=_mediux_thumb_from_img(anchor.find("img")))
        if not thumb:
            parent = anchor.parent
            for _ in range(6):
                if parent is None:
                    break
                thumb = _pick_mediux_set_thumb(parent)
                if thumb:
                    break
                if not title:
                    heading_node = parent.find(["h2", "h3", "h4"]) if hasattr(parent, "find") else None
                    if heading_node:
                        title = _clean_mediux_set_title(heading_node.get_text(" ", strip=True)) or title
                parent = parent.parent

        existing = sets.get(set_id)
        if existing:
            if title and (not existing.get("title") or existing["title"].startswith("Set ")):
                existing["title"] = title
            _enrich_mediux_set_entry(anchor, existing)
            preferred = _pick_mediux_set_thumb(
                card or anchor,
                set_kind=existing.get("setKind"),
                fallback=existing.get("thumbUrl") or thumb,
            )
            if preferred:
                existing["thumbUrl"] = preferred
            if default_user and not existing.get("user"):
                existing["user"] = default_user
            continue

        entry = {
            "setId": set_id,
            "url": f"https://mediux.pro/sets/{set_id}",
            "title": title or f"Set {set_id}",
            "thumbUrl": thumb,
            "user": default_user,
            "posterCount": None,
            "provider": "mediux",
            "setKind": None,
        }
        _enrich_mediux_set_entry(anchor, entry)
        if not entry.get("setKind"):
            entry["setKind"] = _infer_set_kind(title=str(entry.get("title") or ""))
        preferred = _pick_mediux_set_thumb(
            card or anchor,
            set_kind=entry.get("setKind"),
            fallback=entry.get("thumbUrl") or thumb,
        )
        if preferred:
            entry["thumbUrl"] = preferred
        sets[set_id] = entry
        added += 1
    return added


def _mediux_max_page(soup) -> int:
    max_page = 1
    for anchor in soup.find_all("a", href=True):
        href = str(anchor.get("href") or "")
        match = re.search(r"[?&]page=(\d+)", href)
        if match:
            max_page = max(max_page, int(match.group(1)))
        text = anchor.get_text(" ", strip=True)
        if text.isdigit():
            max_page = max(max_page, int(text))
    return max_page


def list_posterdb_user_sets(
    username: str,
    progress: ProgressFn = None,
    limit: int = 0,
    max_pages: int = 0,
    *,
    on_batch: BatchFn = None,
    batch_pages: int = 3,
) -> dict:
    user = _normalize_creator_username(username)
    base = f"https://theposterdb.com/user/{quote(user)}"
    emit(progress, f"Loading ThePosterDB creator @{user}…")
    first_url = f"{base}?section=uploads&page=1"
    soup = cook_soup(first_url)
    page_count = scrape_posterd_user_info(soup) or 1
    # Cap runaway creators; UI paginates the returned set list.
    hard_cap = max(1, int(max_pages or 80))
    pages = min(max(1, int(page_count)), hard_cap)
    take = max(0, int(limit or 0)) or 10_000
    step = max(1, int(batch_pages or 3))
    sets: dict = {}
    last_emitted = 0
    pages_in_batch = 0
    last_page = 1

    def flush_batch(*, done: bool = False, force: bool = False) -> None:
        nonlocal last_emitted, pages_in_batch
        if not on_batch:
            return
        if not force and not done and pages_in_batch < step:
            return
        chunk = list(sets.values())[last_emitted:]
        if not chunk and not done:
            pages_in_batch = 0
            return
        last_emitted = len(sets)
        pages_in_batch = 0
        on_batch({
            "provider": "posterdb",
            "phase": "sets",
            "mode": "creator",
            "query": user,
            "title": f"@{user}",
            "titleUrl": base,
            "sets": chunk,
            "allSets": list(sets.values())[:take],
            "pagesFetched": last_page,
            "pagesAvailable": page_count,
            "done": done,
            "loading": not done,
        })

    _collect_posterdb_set_cards(soup, sets=sets, limit=take, default_user=user)
    pages_in_batch = 1
    flush_batch()
    stagnant = 0
    for page in range(2, pages + 1):
        before = len(sets)
        if before >= take:
            break
        emit(progress, f"Creator page {page}/{pages}…")
        soup = cook_soup(f"{base}?section=uploads&page={page}")
        _collect_posterdb_set_cards(soup, sets=sets, limit=take, default_user=user)
        last_page = page
        pages_in_batch += 1
        flush_batch()
        if len(sets) == before:
            stagnant += 1
            if stagnant >= 3:
                emit(progress, f"Stopping early after {page} pages — no new sets.")
                break
        else:
            stagnant = 0
    flush_batch(done=True, force=True)
    results = list(sets.values())[:take]
    if not results:
        raise ValueError(f"No sets found for ThePosterDB creator @{user}. Check the username.")
    return {
        "ok": True,
        "provider": "posterdb",
        "phase": "sets",
        "mode": "creator",
        "query": user,
        "title": f"@{user}",
        "titleUrl": base,
        "titles": [],
        "sets": results,
        "pagesFetched": last_page,
        "pagesAvailable": page_count,
    }


def list_mediux_user_sets(
    username: str,
    progress: ProgressFn = None,
    limit: int = 0,
    max_pages: int = 0,
    *,
    on_batch: BatchFn = None,
    batch_pages: int = 3,
) -> dict:
    user = _normalize_creator_username(username)
    page_url = f"https://mediux.pro/user/{quote(user)}/sets"
    emit(progress, f"Loading MediUX creator @{user}…")
    soup = cook_soup(page_url)
    page_title = ""
    heading = soup.find(["h1", "h2"])
    if heading:
        page_title = heading.get_text(" ", strip=True)
    elif soup.title:
        page_title = soup.title.get_text(" ", strip=True)
    hard_cap = max(1, int(max_pages or 60))
    pages = min(_mediux_max_page(soup), hard_cap)
    take = max(0, int(limit or 0)) or 10_000
    step = max(1, int(batch_pages or 3))
    sets: dict = {}
    last_emitted = 0
    pages_in_batch = 0
    last_page = 1

    def flush_batch(*, done: bool = False, force: bool = False) -> None:
        nonlocal last_emitted, pages_in_batch
        if not on_batch:
            return
        if not force and not done and pages_in_batch < step:
            return
        chunk = list(sets.values())[last_emitted:]
        if not chunk and not done:
            pages_in_batch = 0
            return
        last_emitted = len(sets)
        pages_in_batch = 0
        on_batch({
            "provider": "mediux",
            "phase": "sets",
            "mode": "creator",
            "query": user,
            "title": page_title or f"@{user}",
            "titleUrl": page_url,
            "sets": chunk,
            "allSets": list(sets.values())[:take],
            "pagesFetched": last_page,
            "pagesAvailable": pages,
            "done": done,
            "loading": not done,
        })

    _collect_mediux_set_cards(soup, sets=sets, default_user=user)
    pages_in_batch = 1
    flush_batch()
    for page in range(2, pages + 1):
        if len(sets) >= take:
            break
        emit(progress, f"MediUX creator page {page}/{pages}…")
        soup = cook_soup(f"{page_url}?page={page}")
        added = _collect_mediux_set_cards(soup, sets=sets, default_user=user)
        last_page = page
        pages_in_batch += 1
        # Pagination links may under-report; keep going while pages add sets.
        pages = max(pages, min(_mediux_max_page(soup), hard_cap))
        flush_batch()
        if added <= 0:
            break
    flush_batch(done=True, force=True)
    results = list(sets.values())[:take]
    if not results:
        raise ValueError(f"No sets found for MediUX creator @{user}. Check the username.")
    return {
        "ok": True,
        "provider": "mediux",
        "phase": "sets",
        "mode": "creator",
        "query": user,
        "title": page_title or f"@{user}",
        "titleUrl": page_url,
        "titles": [],
        "sets": results,
        "pagesFetched": last_page,
    }


def _posterdb_recent_max_page(soup) -> int:
    max_page = 1
    for anchor in soup.find_all("a", href=True):
        href = str(anchor.get("href") or "")
        if "/recent" not in href.lower() and "recent" not in href.lower():
            # still accept bare ?page= on recent pages
            if "page=" not in href:
                continue
        match = re.search(r"[?&]page=(\d+)", href)
        if match:
            max_page = max(max_page, int(match.group(1)))
        text = anchor.get_text(" ", strip=True)
        if text.isdigit():
            max_page = max(max_page, int(text))
    return max_page


def list_recent_sets(
    provider: str,
    *,
    kind: str = "posters",
    page: int = 1,
    limit: int = 24,
    progress: ProgressFn = None,
) -> dict:
    """One page of recently-added sets for Browse rails (creators included)."""
    source = str(provider or "").strip().lower()
    if source in {"tpdb", "posterdb", "theposterdb"}:
        source = "posterdb"
    elif source in {"mediux", "mediaux"}:
        source = "mediux"
    else:
        raise ValueError("provider must be mediux or posterdb")

    rail_kind = str(kind or "posters").strip().lower()
    if rail_kind in {"title_card", "title-cards", "titlecards", "title_cards"}:
        rail_kind = "title_cards"
    else:
        rail_kind = "posters"

    page_num = max(1, int(page or 1))
    take = max(1, min(int(limit or 24), 200))
    sets: dict = {}

    if source == "posterdb":
        if rail_kind == "title_cards":
            raise ValueError("ThePosterDB browse does not have a title-cards rail")
        url = f"https://theposterdb.com/recent?page={page_num}"
        emit(progress, f"Loading ThePosterDB recently added (page {page_num})…")
        soup = cook_soup(url)
        # Collect a full recent page (typically ~24), then trim only if caller asked for fewer.
        _collect_posterdb_set_cards(soup, sets=sets, limit=max(take, 48))
        max_page = _posterdb_recent_max_page(soup)
        results = list(sets.values())[:take]
        has_more = len(results) > 0 and (page_num < max_page or len(results) >= max(8, take // 2))
        return {
            "ok": True,
            "provider": "posterdb",
            "phase": "sets",
            "mode": "recent",
            "kind": "posters",
            "page": page_num,
            "maxPage": max_page,
            "hasMore": has_more,
            "nextPage": page_num + 1 if has_more else None,
            "titles": [],
            "sets": results,
        }

    path = "title_cards" if rail_kind == "title_cards" else "posters"
    url = f"https://mediux.pro/{path}?page={page_num}"
    emit(progress, f"Loading MediUX {path.replace('_', ' ')} (page {page_num})…")
    soup = cook_soup(url)
    _collect_mediux_set_cards(soup, sets=sets)
    max_page = _mediux_max_page(soup)
    results = list(sets.values())
    if rail_kind == "title_cards":
        for item in results:
            item["setKind"] = "title_cards"
    # Keep the full provider page so background fill does not skip cards.
    has_more = len(results) > 0 and (page_num < max_page or len(results) >= 8)
    return {
        "ok": True,
        "provider": "mediux",
        "phase": "sets",
        "mode": "recent",
        "kind": rail_kind,
        "page": page_num,
        "maxPage": max_page,
        "hasMore": has_more,
        "nextPage": page_num + 1 if has_more else None,
        "titles": [],
        "sets": results,
    }


def search_catalog(
    provider: str,
    *,
    query: str = "",
    title_url: str = "",
    media_type: str = "movie",
    tmdb_id: str | int | None = None,
    imdb_id: str | None = None,
    tvdb_id: str | int | None = None,
    title_hint: str = "",
    year_hint: int | None = None,
    mode: str = "title",
    kind: str = "posters",
    page: int = 1,
    limit: int = 24,
    progress: ProgressFn = None,
    on_batch: BatchFn = None,
    batch_pages: int = 3,
    config: dict | None = None,
) -> dict:
    """Scrape MediUX / ThePosterDB discovery pages (user-initiated only)."""
    config = config if isinstance(config, dict) else {}
    source = str(provider or "").strip().lower()
    if source in {"tpdb", "posterdb", "theposterdb"}:
        source = "posterdb"
    elif source in {"mediux", "mediaux"}:
        source = "mediux"
    else:
        raise ValueError("provider must be mediux or posterdb")

    search_mode = str(mode or "title").strip().lower()
    if search_mode in {"recent", "browse", "recently_added", "recently-added"}:
        return list_recent_sets(
            source,
            kind=kind or query or "posters",
            page=page,
            limit=limit if limit else 24,
            progress=progress,
        )
    if search_mode in {"creator", "user", "author", "uploader"}:
        if not str(query or "").strip():
            raise ValueError("creator username is required")
        # Creator mode: pull paginated set catalogs (limit 0 = practically unbounded).
        creator_limit = max(0, int(limit or 0))
        if source == "posterdb":
            return list_posterdb_user_sets(
                query,
                progress=progress,
                limit=creator_limit,
                on_batch=on_batch,
                batch_pages=batch_pages,
            )
        return list_mediux_user_sets(
            query,
            progress=progress,
            limit=creator_limit,
            on_batch=on_batch,
            batch_pages=batch_pages,
        )

    if source == "posterdb":
        year_val = year_hint
        if year_val is not None and not isinstance(year_val, int):
            try:
                year_val = int(year_val)
            except Exception:
                year_val = None
        title_url_value = str(title_url or "").strip()
        user_title_url = title_url_value
        resolved_page: Optional[dict] = None
        if not title_url_value and tmdb_id:
            resolved_page = resolve_posterdb_title_page(
                query=title_hint or query,
                title=title_hint or query,
                year=year_val,
                tmdb_id=tmdb_id,
                imdb_id=imdb_id,
                tvdb_id=tvdb_id,
                media_type=media_type,
                config=config,
                progress=progress,
                limit=limit,
            )
            title_url_value = str(resolved_page.get("url") or "").strip() if resolved_page else ""
        if title_url_value:
            loaded = list_posterdb_sets(
                title_url_value,
                progress=progress,
                limit=limit,
                config=config,
                tmdb_id=tmdb_id,
                imdb_id=imdb_id,
                tvdb_id=tvdb_id,
                title_hint=title_hint,
                year_hint=year_val,
                media_type=media_type,
                explicit_title_url=bool(user_title_url or resolved_page),
            )
            if loaded.get("sets"):
                return loaded
            if user_title_url:
                return loaded
            emit(progress, "ThePosterDB title page returned no sets — trying title search…")
        search_term = str(query or title_hint or "").strip()
        if not search_term:
            raise ValueError("query or title hint is required for ThePosterDB title search")
        titles: list[dict] = []
        seen_ids: set[str] = set()
        for term in _posterdb_search_terms_from_hint(search_term) or [search_term]:
            part = search_posterdb_titles(
                term,
                progress=progress,
                limit=limit,
                config=config,
                tmdb_id=None,
                imdb_id=imdb_id,
                tvdb_id=tvdb_id,
                media_type=media_type,
                _skip_resolve=True,
                max_pages=5,
                year_hint=year_val if term == search_term else None,
            )
            for item in part.get("titles") or []:
                pid = str(item.get("id") or "")
                if not pid or pid in seen_ids:
                    continue
                seen_ids.add(pid)
                titles.append(item)
        result = {
            "ok": True,
            "provider": "posterdb",
            "phase": "titles",
            "query": search_term,
            "titles": titles[:max(1, int(limit or 24))],
            "sets": [],
        }
        picked = _pick_posterdb_title_candidate(
            titles,
            title_hint=title_hint or search_term,
            year_hint=year_val,
            media_type=media_type,
        )
        picked_url = str(picked.get("url") or "").strip() if picked else ""
        if picked_url:
            try:
                return list_posterdb_sets(
                    picked_url,
                    progress=progress,
                    limit=limit,
                    config=config,
                    tmdb_id=None,
                    imdb_id=imdb_id,
                    tvdb_id=tvdb_id,
                    title_hint=title_hint or search_term,
                    year_hint=year_val,
                    media_type=media_type,
                    explicit_title_url=True,
                )
            except Exception as exc:
                emit(progress, f"ThePosterDB set load failed: {exc}")
        for item in titles:
            alt_url = str(item.get("url") or "").strip()
            if not alt_url or alt_url == picked_url:
                continue
            if not _posterdb_title_matches_hint(
                item.get("title") or "",
                item.get("year"),
                title_hint=title_hint or search_term,
                year_hint=year_val,
                media_type=media_type,
            ):
                continue
            try:
                return list_posterdb_sets(
                    alt_url,
                    progress=progress,
                    limit=limit,
                    config=config,
                    tmdb_id=None,
                    imdb_id=imdb_id,
                    tvdb_id=tvdb_id,
                    title_hint=title_hint or search_term,
                    year_hint=year_val,
                    media_type=media_type,
                    explicit_title_url=True,
                )
            except Exception as exc:
                emit(progress, f"ThePosterDB set load failed for {alt_url}: {exc}")
        partial_msg: list[str] = []
        if not _posterdb_has_credentials(config):
            emit(
                progress,
                "ThePosterDB login not configured — public search cannot match many TV titles. "
                "Add TPDB username/password in Poster Sets → Settings (advanced TMDB/TVDB search requires login).",
            )
            partial_msg.append(
                "ThePosterDB login not configured — add TPDB credentials in Poster Sets → Settings.",
            )
        elif tmdb_id:
            msg = f"ThePosterDB returned no sets for TMDB {tmdb_id}; showing MediUX sets instead."
            emit(progress, msg)
            partial_msg.append(msg)
        else:
            msg = "ThePosterDB returned no sets for this title; showing MediUX sets instead."
            emit(progress, msg)
            partial_msg.append(msg)
        result["partial_errors"] = partial_msg
        return result

    if tmdb_id:
        return list_mediux_sets(media_type, tmdb_id, progress=progress, limit=limit)
    raise ValueError("MediUX browse needs a TMDB title id (search titles in the portal first)")


def apply_bulk(urls: Sequence[str], config: dict, progress: ProgressFn = None) -> dict:
    outcomes = []
    for url in urls:
        if "/user/" in url and "theposterdb.com" in url:
            emit(progress, f"Scraping user uploads from {url}")
            soup = cook_soup(url)
            pages = scrape_posterd_user_info(soup) or 1
            cleaned = url.split("?")[0]
            for page in range(pages):
                page_url = f"{cleaned}?section=uploads&page={page + 1}"
                emit(progress, f"User page {page + 1}/{pages}")
                outcomes.append(apply_url(page_url, config, progress=progress))
        else:
            outcomes.append(apply_url(url, config, progress=progress))
    return {
        "ok": sum(int(item.get("uploaded") or 0) for item in outcomes) > 0,
        "urls": len(urls),
        "jobs": len(outcomes),
        "uploaded": sum(int(item.get("uploaded") or 0) for item in outcomes),
        "outcomes": outcomes,
        "error": None if sum(int(item.get("uploaded") or 0) for item in outcomes) > 0 else "Bulk apply uploaded 0 posters.",
    }
