#!/usr/bin/env python3
"""Regression probe: resolve a library TMDB id to a TPDB /posters/ page and scrape sets.

Usage (from repo root, with Poster Sets config that has TPDB credentials):

  python scripts/debug-tpdb-title-resolve.py
  python scripts/debug-tpdb-title-resolve.py --tmdb 124394 --title "Power Book III: Raising Kanan" --year 2021
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "poster-sets"))

from core import (  # noqa: E402
    _posterdb_count_set_links,
    _posterdb_has_credentials,
    _posterdb_probe_title_page,
    cook_soup,
    list_posterdb_sets,
    resolve_posterdb_title_page,
)


def load_config() -> dict:
    candidates = [
        ROOT / "data" / "poster-sets" / "config.json",
        ROOT / "poster-sets" / "config.json",
    ]
    for path in candidates:
        if path.is_file():
            return json.loads(path.read_text(encoding="utf-8"))
    return {}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tmdb", default="124394")
    parser.add_argument("--title", default="Power Book III: Raising Kanan")
    parser.add_argument("--year", type=int, default=2021)
    parser.add_argument("--media", default="show")
    args = parser.parse_args()

    config = load_config()
    has_creds = _posterdb_has_credentials(config)
    print(f"tpdb_credentials={has_creds} tmdb={args.tmdb} title={args.title!r}")

    resolved = resolve_posterdb_title_page(
        query=args.title,
        title=args.title,
        year=args.year,
        tmdb_id=args.tmdb,
        media_type=args.media,
        config=config,
        limit=500,
    )
    print("resolved:", resolved)
    if not resolved or not resolved.get("url"):
        print("FAIL: no /posters/ page resolved")
        return 1

    url = str(resolved["url"])
    probe = _posterdb_probe_title_page(url, config=config)
    print("probe mediaId=", probe.get("mediaId"), "setCount=", probe.get("setCount"))
    if str(probe.get("mediaId") or "") != str(args.tmdb):
        print(f"FAIL: page TMDB {probe.get('mediaId')} != {args.tmdb}")
        return 2

    loaded = list_posterdb_sets(
        url,
        limit=500,
        config=config,
        tmdb_id=args.tmdb,
        title_hint=args.title,
        year_hint=args.year,
        media_type=args.media,
        explicit_title_url=False,
    )
    sets = loaded.get("sets") or []
    soup = cook_soup(url, config=config)
    link_count = _posterdb_count_set_links(soup)
    print(f"scraped_sets={len(sets)} page_set_links~={link_count}")
    if not sets:
        print("FAIL: zero sets scraped from confirmed title page")
        return 3
    if link_count and len(sets) < min(link_count, 500) * 0.5:
        print("WARN: scraped far fewer cards than page set links")
    print("OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
