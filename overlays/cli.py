#!/usr/bin/env python3
"""JSON CLI for Overlays (New Season). Reads one JSON request from stdin or --payload."""

from __future__ import annotations

import argparse
import json
import sys
import traceback

from core import (
    list_status,
    list_tv_sections,
    reconcile,
    reset_one,
    run_overlays,
    scan_library,
)


def write_event(event_type: str, **payload) -> None:
    sys.stdout.write(json.dumps({"type": event_type, **payload}, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def progress(message: str) -> None:
    write_event("progress", message=message)


def main() -> int:
    parser = argparse.ArgumentParser(description="Overlays New Season CLI")
    parser.add_argument(
        "command",
        choices=["status", "scan", "run", "preview", "cleanup", "reconcile", "reset-one", "sections"],
    )
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
        if args.command == "status":
            write_event("result", **list_status(config))
            return 0

        if args.command == "sections":
            write_event("result", **list_tv_sections(config))
            return 0

        if args.command == "scan":
            write_event("result", **scan_library(config, progress=progress))
            return 0

        if args.command == "reconcile":
            write_event("result", **reconcile(config, progress=progress))
            return 0

        if args.command == "reset-one":
            key = str(request.get("ratingKey") or request.get("rating_key") or "").strip()
            write_event("result", **reset_one(config, key, progress=progress))
            return 0

        if args.command in {"run", "preview", "cleanup"}:
            preview_override = True if args.command == "preview" else None
            if args.command == "cleanup":
                # cleanup uses same runner; removals happen when not eligible
                preview_override = False if config.get("previewMode") is not True else True
            write_event("result", **run_overlays(config, progress=progress, preview_override=preview_override))
            return 0

        write_event("error", message=f"Unknown command: {args.command}")
        return 1
    except Exception as exc:
        write_event("error", message=str(exc), detail=traceback.format_exc())
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
