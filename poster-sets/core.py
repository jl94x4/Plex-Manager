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


def download_image(url: str, progress: ProgressFn = None) -> Optional[str]:
    """Download an image to a temp file. Returns path or None."""
    try:
        response = requests.get(url, headers=IMAGE_HEADERS, timeout=60)
        response.raise_for_status()
        if not _looks_like_image(response.content):
            emit(progress, f"Downloaded non-image payload from {url[:80]}… ({len(response.content)} bytes)")
            return None
        suffix = _image_suffix(response.headers.get("content-type", ""), url)
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
    Upload artwork to Plex.

    MediUX's Next.js image proxy now returns 403/blank HTML to scrapers and to Plex's
    URL fetch — download the direct api.mediux.pro asset ourselves and upload as a file.
    """
    url = poster.get("url") or ""
    source = poster.get("source")
    if source == "mediux" or "api.mediux.pro/assets/" in url:
        path = download_image(url, progress=progress)
        if not path:
            raise RuntimeError(f"Could not download MediUX image: {url}")
        try:
            if art:
                upload_target.uploadArt(filepath=path)
            else:
                upload_target.uploadPoster(filepath=path)
        finally:
            cleanup_temp_file(path)
        return

    if art:
        upload_target.uploadArt(url=url)
    else:
        upload_target.uploadPoster(url=url)


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


def cook_soup(url: str) -> BeautifulSoup:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
        ),
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": "Windows",
    }
    response = requests.get(url, headers=headers, timeout=60)
    if response.status_code == 200 or (response.status_code == 500 and "mediux.pro" in url):
        return BeautifulSoup(response.text, "html.parser")
    raise RuntimeError(f"Failed to retrieve the page. Status code: {response.status_code}")


def parse_string_to_dict(input_string: str) -> dict:
    input_string = input_string.replace("\\\\\\\"", "")
    input_string = input_string.replace("\\", "")
    input_string = input_string.replace("u0026", "&")
    json_start_index = input_string.find("{")
    json_end_index = input_string.rfind("}")
    json_data = input_string[json_start_index : json_end_index + 1]
    return json.loads(json_data)


def find_in_library(library, poster):
    items = []
    for lib in library:
        try:
            if poster.get("year") is not None:
                library_item = lib.get(poster["title"], year=poster["year"])
            else:
                library_item = lib.get(poster["title"])
            if library_item:
                items.append(library_item)
        except Exception:
            pass
    return items or None


def find_collection(library, poster):
    collections = []
    for lib in library:
        try:
            for plex_collection in lib.collections():
                if plex_collection.title == poster["title"]:
                    collections.append(plex_collection)
        except Exception:
            pass
    return collections or None


def upload_tv_poster(poster, tv, progress: ProgressFn = None) -> dict:
    result = {"title": poster.get("title"), "kind": "show", "ok": False, "message": ""}
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
            if poster.get("source") == "posterdb":
                time.sleep(6)
            elif poster.get("source") == "mediux":
                time.sleep(1)
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
    result = {"title": poster.get("title"), "kind": "movie", "ok": False, "message": ""}
    movie_items = find_in_library(movies, poster)
    if not movie_items:
        result["message"] = f"{poster['title']} not found in any library."
        emit(progress, result["message"])
        return result
    for movie_item in movie_items:
        try:
            apply_poster_or_art(movie_item, poster, progress=progress)
            clear_kometa_overlay(movie_item, config=poster.get("_config"), progress=progress)
            if poster.get("source") == "posterdb":
                time.sleep(6)
            elif poster.get("source") == "mediux":
                time.sleep(1)
            msg = f'Uploaded art for {poster["title"]} in {movie_item.librarySectionTitle}.'
            result["ok"] = True
            result["message"] = msg
            emit(progress, msg)
        except Exception as exc:
            result["message"] = f'Unable to upload art for {poster["title"]}: {exc}'
            emit(progress, result["message"])
    return result


def upload_collection_poster(poster, movies, progress: ProgressFn = None) -> dict:
    result = {"title": poster.get("title"), "kind": "collection", "ok": False, "message": ""}
    collection_items = find_collection(movies, poster)
    if not collection_items:
        result["message"] = f'{poster["title"]} collection not found in any library.'
        emit(progress, result["message"])
        return result
    for collection in collection_items:
        try:
            apply_poster_or_art(collection, poster, progress=progress)
            clear_kometa_overlay(collection, config=poster.get("_config"), progress=progress)
            if poster.get("source") == "posterdb":
                time.sleep(6)
            elif poster.get("source") == "mediux":
                time.sleep(1)
            msg = f'Uploaded art for {poster["title"]} in {collection.librarySectionTitle}.'
            result["ok"] = True
            result["message"] = msg
            emit(progress, msg)
        except Exception as exc:
            result["message"] = f'Unable to upload art for {poster["title"]}: {exc}'
            emit(progress, result["message"])
    return result


def scrape_posterdb_set_link(soup) -> Optional[str]:
    try:
        return soup.find("a", class_="rounded view_all")["href"]
    except Exception:
        return None


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


def extract_creator_from_soup(soup) -> Optional[str]:
    if not soup:
        return None
    skip = {"login", "signup", "register", "settings", "logout", "home"}
    for anchor in soup.select("a[href*='/user/']"):
        href = str(anchor.get("href") or "")
        match = re.search(r"/user/([^/?#]+)", href, re.I)
        if match:
            user = unquote(match.group(1)).strip().lstrip("@")
            if user and user.lower() not in skip:
                return user
        text = (anchor.get_text(" ", strip=True) or "").strip().lstrip("@")
        if text and 1 < len(text) < 64 and text.lower() not in skip:
            return text
    return None


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
        show = (data_dict.get("set") or {}).get("show") or {}
        if isinstance(show, dict) and show.get("name"):
            page_meta["title"] = str(show.get("name") or "").strip() or None
        elif (data_dict.get("set") or {}).get("movie"):
            page_meta["title"] = str(((data_dict.get("set") or {}).get("movie") or {}).get("title") or "").strip() or None
        elif (data_dict.get("set") or {}).get("collection"):
            page_meta["title"] = str(
                ((data_dict.get("set") or {}).get("collection") or {}).get("collection_name") or ""
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
            return movieposters, showposters, collectionposters, {
                "user": extract_creator_from_soup(soup),
                "title": title,
            }
        if "/poster/" in url:
            soup = cook_soup(url)
            set_url = scrape_posterdb_set_link(soup)
            if set_url is None:
                raise RuntimeError("Poster set not found. Check the link you are inputting.")
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
            return movieposters, showposters, collectionposters, {
                "user": extract_creator_from_soup(set_soup),
                "title": title,
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
    if "mediux.pro" in lower:
        provider = "mediux"
        match = re.search(r"/sets?/(\d+)", value, re.I)
        if match:
            set_id = match.group(1)
    elif "theposterdb.com" in lower:
        provider = "posterdb"
        match = re.search(r"/(?:set|poster)/(\d+)", value, re.I)
        if match:
            set_id = match.group(1)
        elif "/user/" in lower:
            match = re.search(r"/user/([^/?#]+)", value, re.I)
            if match:
                set_id = match.group(1)
    return {"provider": provider, "setId": set_id, "url": value}


def build_set_meta(
    url: str,
    movieposters=None,
    showposters=None,
    collectionposters=None,
    page_meta: Optional[dict] = None,
) -> dict:
    """Compact set summary: show/movie name + creator (not season pack labels)."""
    ref = parse_set_ref(url)
    meta = page_meta if isinstance(page_meta, dict) else {}
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
    return {
        "provider": ref.get("provider"),
        "setId": ref.get("setId"),
        "url": ref.get("url") or str(url or "").strip(),
        "title": title,
        "user": user,
        "thumbUrl": thumb,
        "assetCount": total or None,
    }


def match_show_target(tv_show, poster: dict) -> Tuple[bool, str]:
    season = poster.get("season")
    episode = poster.get("episode")
    try:
        if season == "Cover" or season == "Backdrop":
            return True, tv_show.librarySectionTitle
        if season == 0:
            season_obj = tv_show.season("Specials")
            if episode == "Cover" or episode is None:
                return True, f"{tv_show.librarySectionTitle} · Specials"
            season_obj.episode(episode)
            return True, f"{tv_show.librarySectionTitle} · Specials E{episode}"
        if isinstance(season, int) and season >= 1:
            season_obj = tv_show.season(season)
            if episode == "Cover" or episode is None:
                return True, f"{tv_show.librarySectionTitle} · Season {season}"
            season_obj.episode(episode)
            return True, f"{tv_show.librarySectionTitle} · S{season}E{episode}"
        return False, "Unhandled season target"
    except Exception:
        if isinstance(episode, int):
            return False, f"S{season}E{episode} not in library"
        if isinstance(season, int):
            return False, f"Season {season} not in library"
        return False, "Target not in library"


def match_poster(kind: str, poster: dict, tv, movies) -> Tuple[bool, str]:
    if kind == "movie":
        items = find_in_library(movies, poster)
        if not items:
            return False, "Not found in movie libraries"
        return True, items[0].librarySectionTitle
    if kind == "collection":
        items = find_collection(movies, poster)
        if not items:
            return False, "Collection not found"
        return True, items[0].librarySectionTitle
    items = find_in_library(tv, poster)
    if not items:
        return False, "Not found in TV libraries"
    matched_any = False
    detail = ""
    for show in items:
        ok, detail = match_show_target(show, poster)
        if ok:
            matched_any = True
            break
    return matched_any, detail or "Show found, target missing"


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
    movies = [p for p in movieposters if asset_id("movie", p) in wanted]
    shows = [p for p in showposters if asset_id("show", p) in wanted]
    collections = [p for p in collectionposters if asset_id("collection", p) in wanted]
    return movies, shows, collections


def list_assets(url: str, config: dict | None = None, progress: ProgressFn = None) -> dict:
    """Scrape a set URL and return asset fingerprints without connecting to Plex."""
    cfg = config if isinstance(config, dict) else {}
    filters = normalize_library_list(cfg.get("mediux_filters")) or [
        "title_card",
        "background",
        "season_cover",
        "show_cover",
    ]
    emit(progress, f"Listing assets from {url}")
    movieposters, showposters, collectionposters, page_meta = scrape(url, mediux_filters=filters, progress=progress)
    assets = build_preview_assets(movieposters, showposters, collectionposters, tv=None, movies=None)
    set_meta = build_set_meta(url, movieposters, showposters, collectionposters, page_meta=page_meta)
    return {
        "ok": True,
        "url": url,
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
            }
            for asset in assets
            if asset.get("id")
        ],
        "total": len(assets),
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
    return {
        "ok": True,
        "url": url,
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
) -> dict:
    filters = normalize_library_list(config.get("mediux_filters")) or [
        "title_card",
        "background",
        "season_cover",
        "show_cover",
    ]
    tv, movies, _plex = connect_plex(config, progress=progress)
    emit(progress, f"Scraping {url}")
    movieposters, showposters, collectionposters, page_meta = scrape(url, mediux_filters=filters, progress=progress)
    movieposters, showposters, collectionposters = filter_posters_by_ids(
        movieposters, showposters, collectionposters, selected_ids
    )
    if selected_ids:
        emit(
            progress,
            f"Applying {len(movieposters) + len(showposters) + len(collectionposters)} selected asset(s)",
        )

    results = []
    for poster in collectionposters:
        poster = {**poster, "_config": config}
        results.append(upload_collection_poster(poster, movies, progress=progress))
    for poster in movieposters:
        poster = {**poster, "_config": config}
        results.append(upload_movie_poster(poster, movies, progress=progress))
    for poster in showposters:
        poster = {**poster, "_config": config}
        results.append(upload_tv_poster(poster, tv, progress=progress))
    uploaded = sum(1 for item in results if item.get("ok"))
    set_meta = build_set_meta(url, movieposters, showposters, collectionposters, page_meta=page_meta)
    return {
        "ok": True,
        "url": url,
        "uploaded": uploaded,
        "attempted": len(results),
        "selected": len(selected_ids) if selected_ids else None,
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


def search_posterdb_titles(query: str, progress: ProgressFn = None, limit: int = 24) -> dict:
    term = str(query or "").strip()
    if not term:
        raise ValueError("query is required")
    search_url = f"https://theposterdb.com/search?term={quote(term)}"
    emit(progress, f"Searching ThePosterDB for “{term}”…")
    soup = cook_soup(search_url)
    titles = []
    seen = set()
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
        titles.append(
            {
                "id": posters_id,
                "title": title,
                "year": year,
                "url": _absolute_url("https://theposterdb.com", href.split("?")[0]),
                "mediaType": None,
                "provider": "posterdb",
            }
        )
        if len(titles) >= max(1, int(limit or 24)):
            break
    return {"ok": True, "provider": "posterdb", "phase": "titles", "query": term, "titles": titles, "sets": []}


def list_posterdb_sets(title_url: str, progress: ProgressFn = None, limit: int = 40) -> dict:
    url = str(title_url or "").strip()
    if not url or "theposterdb.com" not in url.lower() or "/posters/" not in url.lower():
        raise ValueError("A ThePosterDB /posters/… title URL is required")
    emit(progress, f"Loading sets from {url}")
    soup = cook_soup(url)
    page_title = ""
    heading = soup.find(["h1", "h2", "title"])
    if heading:
        page_title = heading.get_text(" ", strip=True)
    sets: dict = {}
    for badge in soup.select("a.set_poster_count[href*='/set/']"):
        href = str(badge.get("href") or "")
        match = re.search(r"/set/(\d+)", href)
        if not match:
            continue
        set_id = match.group(1)
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
        user = None
        thumb = ""
        title_node = card.select_one(".poster-title-correction p") if hasattr(card, "select_one") else None
        if title_node:
            title = title_node.get_text(" ", strip=True)
        user_node = card.select_one("a[href*='/user/']") if hasattr(card, "select_one") else None
        if user_node:
            user = user_node.get_text(" ", strip=True) or None
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
        entry = sets.get(set_id) or {
            "setId": set_id,
            "url": _absolute_url("https://theposterdb.com", f"/set/{set_id}"),
            "title": "",
            "thumbUrl": "",
            "user": None,
            "posterCount": None,
            "provider": "posterdb",
        }
        if title and not entry["title"]:
            entry["title"] = title
        if user and not entry["user"]:
            entry["user"] = user
        if thumb and not entry["thumbUrl"]:
            entry["thumbUrl"] = thumb
        if poster_count is not None:
            entry["posterCount"] = poster_count
        sets[set_id] = entry
        if len(sets) >= max(1, int(limit or 40)):
            break
    results = list(sets.values())
    for item in results:
        if not item.get("title"):
            item["title"] = page_title or f"Set {item['setId']}"
    return {
        "ok": True,
        "provider": "posterdb",
        "phase": "sets",
        "titleUrl": url,
        "title": page_title or None,
        "titles": [],
        "sets": results,
    }


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
        title = anchor.get_text(" ", strip=True)
        thumb = ""
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
        }
        if title and not entry["title"]:
            entry["title"] = title[:160]
        if thumb and not entry["thumbUrl"]:
            entry["thumbUrl"] = thumb
        sets[set_id] = entry
        if len(sets) >= max(1, int(limit or 40)):
            break
    results = list(sets.values())
    for item in results:
        if not item.get("title"):
            item["title"] = page_title or f"Set {item['setId']}"
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


def _collect_mediux_set_cards(soup, *, sets: dict, default_user: str | None = None) -> int:
    """Collect MediUX set cards from one page. Returns newly discovered count."""
    added = 0
    for anchor in soup.find_all("a", href=True):
        href = str(anchor.get("href") or "")
        match = re.search(r"/sets/(\d+)", href)
        if not match:
            continue
        set_id = match.group(1)
        title = anchor.get_text(" ", strip=True)
        if title.lower() in {"peek", "yaml", "download", "sets", "posters", "previous slide", "next slide"}:
            title = ""
        thumb = _mediux_thumb_from_img(anchor.find("img"))
        if not thumb:
            parent = anchor.parent
            for _ in range(6):
                if parent is None:
                    break
                for img in parent.find_all("img") if hasattr(parent, "find_all") else []:
                    thumb = _mediux_thumb_from_img(img)
                    if thumb:
                        break
                if thumb:
                    break
                if not title:
                    heading_node = parent.find(["h2", "h3", "h4"]) if hasattr(parent, "find") else None
                    if heading_node:
                        title = heading_node.get_text(" ", strip=True) or title
                parent = parent.parent

        existing = sets.get(set_id)
        if existing:
            if title and (not existing.get("title") or existing["title"].startswith("Set ")):
                existing["title"] = title[:160]
            if thumb and not existing.get("thumbUrl"):
                existing["thumbUrl"] = thumb
            continue

        sets[set_id] = {
            "setId": set_id,
            "url": f"https://mediux.pro/sets/{set_id}",
            "title": (title or f"Set {set_id}")[:160],
            "thumbUrl": thumb,
            "user": default_user,
            "posterCount": None,
            "provider": "mediux",
        }
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


def search_catalog(
    provider: str,
    *,
    query: str = "",
    title_url: str = "",
    media_type: str = "movie",
    tmdb_id: str | int | None = None,
    mode: str = "title",
    limit: int = 24,
    progress: ProgressFn = None,
    on_batch: BatchFn = None,
    batch_pages: int = 3,
) -> dict:
    """Scrape MediUX / ThePosterDB discovery pages (user-initiated only)."""
    source = str(provider or "").strip().lower()
    if source in {"tpdb", "posterdb", "theposterdb"}:
        source = "posterdb"
    elif source in {"mediux", "mediaux"}:
        source = "mediux"
    else:
        raise ValueError("provider must be mediux or posterdb")

    search_mode = str(mode or "title").strip().lower()
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
        if title_url:
            return list_posterdb_sets(title_url, progress=progress, limit=limit)
        return search_posterdb_titles(query, progress=progress, limit=limit)

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
        "ok": True,
        "urls": len(urls),
        "jobs": len(outcomes),
        "uploaded": sum(int(item.get("uploaded") or 0) for item in outcomes),
        "outcomes": outcomes,
    }
