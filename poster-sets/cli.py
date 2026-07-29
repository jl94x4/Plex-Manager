#!/usr/bin/env python3
"""JSON CLI for Poster Sets. Reads one JSON request from stdin or --payload."""

from __future__ import annotations

import argparse
import json
import sys
import traceback

from core import apply_bulk, apply_url, parse_bulk_urls, preview_url, search_catalog, test_connection


def write_event(event_type: str, **payload) -> None:
    sys.stdout.write(json.dumps({"type": event_type, **payload}, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def progress(message: str) -> None:
    write_event("progress", message=message)


def main() -> int:
    parser = argparse.ArgumentParser(description="Poster Sets headless CLI")
    parser.add_argument("command", choices=["test", "preview", "apply", "bulk", "search"])
    parser.add_argument("--payload", default="", help="JSON payload string (otherwise read stdin)")
    args = parser.parse_args()

    try:
        raw = args.payload.strip() if args.payload else sys.stdin.read()
        request = json.loads(raw or "{}")
    except Exception as exc:
        write_event("error", message=f"Invalid JSON payload: {exc}")
        return 1

    config = request.get("config") if isinstance(request.get("config"), dict) else {}
    try:
        if args.command == "test":
            result = test_connection(config)
            write_event("result", **result)
            return 0

        if args.command == "preview":
            url = str(request.get("url") or "").strip()
            if not url:
                raise ValueError("url is required")
            result = preview_url(url, config, progress=progress)
            write_event(
                "result",
                ok=True,
                url=result.get("url"),
                movies=result.get("movies"),
                shows=result.get("shows"),
                collections=result.get("collections"),
                total=result.get("total"),
                matched=result.get("matched"),
                unmatched=result.get("unmatched"),
                matchError=result.get("matchError"),
                samples=result.get("samples"),
                assets=result.get("assets") or [],
                setMeta=result.get("setMeta"),
            )
            return 0

        if args.command == "search":
            result = search_catalog(
                str(request.get("provider") or ""),
                query=str(request.get("query") or request.get("q") or ""),
                title_url=str(request.get("titleUrl") or request.get("title_url") or ""),
                media_type=str(request.get("mediaType") or request.get("media_type") or "movie"),
                tmdb_id=request.get("tmdbId") or request.get("tmdb_id"),
                limit=int(request.get("limit") or 24),
                progress=progress,
            )
            write_event("result", **result)
            return 0

        if args.command == "apply":
            url = str(request.get("url") or "").strip()
            if not url:
                raise ValueError("url is required")
            selected_ids = request.get("selectedIds")
            if not isinstance(selected_ids, list):
                selected_ids = None
            result = apply_url(url, config, progress=progress, selected_ids=selected_ids)
            write_event("result", **result)
            return 0

        if args.command == "bulk":
            urls = request.get("urls")
            if isinstance(urls, list) and urls:
                parsed = [str(item).strip() for item in urls if str(item).strip()]
            else:
                text = str(request.get("text") or "")
                parsed = parse_bulk_urls(text.splitlines())
            if not parsed:
                raise ValueError("No URLs provided for bulk apply")
            result = apply_bulk(parsed, config, progress=progress)
            write_event("result", **result)
            return 0

        write_event("error", message=f"Unknown command: {args.command}")
        return 1
    except Exception as exc:
        write_event("error", message=str(exc), detail=traceback.format_exc()[-2000:])
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
