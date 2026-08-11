# Overlays (New Season)

Phase 1 of SMP Overlays — ports [plex-new-season-overlay](https://github.com/ButtaJones/plex-new-season-overlay) into the portal.

## Layout

- `cli.py` / `core.py` — Python worker (Pillow + plexapi)
- `assets/presets/new-season.png` — default banner
- Runtime data: `config/overlays/` (`config.json`, `overlaid_log.json`, `preview/`, `backups/<ratingKey>/`)

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
- Prefer off-hours if Poster Sets / Kometa also rewrite posters on the same libraries
