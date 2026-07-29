"""
Headless core for Poster Sets (MediUX / ThePosterDB → Plex).
Adapted from plex-poster-set-helper; no GUI dependencies.
"""

from __future__ import annotations

import json
import math
import os
import re
import tempfile
import time
from typing import Any, Callable, Iterable, List, Optional, Sequence, Tuple

import plexapi.exceptions
import requests
from bs4 import BeautifulSoup
from plexapi.server import PlexServer

ProgressFn = Optional[Callable[[str], None]]

IMAGE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://mediux.pro/",
}


def emit(progress: ProgressFn, message: str) -> None:
    if progress:
        progress(message)


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
                upload_target = tv_show.season("Specials")
                msg = f"Uploaded art for {poster['title']} - Specials in {tv_show.librarySectionTitle}."
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
            try:
                upload_target.removeLabel("Overlay")
            except Exception:
                pass
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
            try:
                movie_item.removeLabel("Overlay")
            except Exception:
                pass
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
            try:
                collection.removeLabel("Overlay")
            except Exception:
                pass
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


def scrape_mediux(soup, mediux_filters: Optional[Sequence[str]] = None, progress: ProgressFn = None) -> Tuple[list, list, list]:
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

    return movieposters, showposters, collectionposters


def scrape(url: str, mediux_filters: Optional[Sequence[str]] = None, progress: ProgressFn = None) -> Tuple[list, list, list]:
    if "theposterdb.com" in url:
        if "/set/" in url or "/user/" in url:
            return scrape_posterdb(cook_soup(url))
        if "/poster/" in url:
            soup = cook_soup(url)
            set_url = scrape_posterdb_set_link(soup)
            if set_url is None:
                raise RuntimeError("Poster set not found. Check the link you are inputting.")
            return scrape_posterdb(cook_soup(set_url))
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


def preview_url(url: str, config: dict, progress: ProgressFn = None) -> dict:
    filters = normalize_library_list(config.get("mediux_filters")) or [
        "title_card",
        "background",
        "season_cover",
        "show_cover",
    ]
    emit(progress, f"Scraping {url}")
    movieposters, showposters, collectionposters = scrape(url, mediux_filters=filters, progress=progress)
    summary = summarize_posters(movieposters, showposters, collectionposters)
    # Drop full URL lists from samples response? Keep them for apply preview UI but trim urls in status.
    return {"ok": True, "url": url, **summary}


def apply_url(url: str, config: dict, progress: ProgressFn = None) -> dict:
    filters = normalize_library_list(config.get("mediux_filters")) or [
        "title_card",
        "background",
        "season_cover",
        "show_cover",
    ]
    tv, movies, _plex = connect_plex(config, progress=progress)
    emit(progress, f"Scraping {url}")
    movieposters, showposters, collectionposters = scrape(url, mediux_filters=filters, progress=progress)
    results = []
    for poster in collectionposters:
        results.append(upload_collection_poster(poster, movies, progress=progress))
    for poster in movieposters:
        results.append(upload_movie_poster(poster, movies, progress=progress))
    for poster in showposters:
        results.append(upload_tv_poster(poster, tv, progress=progress))
    uploaded = sum(1 for item in results if item.get("ok"))
    return {
        "ok": True,
        "url": url,
        "uploaded": uploaded,
        "attempted": len(results),
        "counts": {
            "movies": len(movieposters),
            "shows": len(showposters),
            "collections": len(collectionposters),
        },
        "results": results,
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
