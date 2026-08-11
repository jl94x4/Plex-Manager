# Overlays (New Season + New Episode)

Phase 1–2 of SMP Overlays — New Season show/season banners plus Netflix-style **New Episode** episode thumbs.

## Layout

- `cli.py` / `core.py` — Python worker (Pillow + plexapi)
- `assets/presets/new-season.png` — New Season banner
- `assets/presets/new-episode.png` — New Episode banner (default 6-day window)
- Runtime data: `config/overlays/` (`config.json`, `overlaid_log.json`, `episode_overlaid_log.json`, `preview/`, `preview/samples/`, `backups/`)
- Settings **Visual sample** (`POST /api/overlays/sample`) composites banners onto a random show poster + episode thumb for QA (does not change live art)

## Setup

```bash
pip install -r overlays/requirements.txt
# or reuse Poster Sets venv (auto-detected by the Node runner)
```

1. Settings → Overlays → enable
2. Confirm Media Player Plex URL/token
3. Open **Overlays** → Import your existing `overlaid_log.json` if migrating
4. Preview, then Run now

## Notes

- Skips items with a Kometa `Overlay` label by default (`skipIfKometaOverlayLabel`)
- New Episode stamps **episode thumbnails only** for episodes aired within `newEpisodeDays` (default 6)
- `skipNewEpisodeOnBinge` (default on): if 3+ episodes of the same season share an air date, skip episode badges and rely on New Season
- Prefer off-hours if Poster Sets / Kometa also rewrite posters on the same libraries
