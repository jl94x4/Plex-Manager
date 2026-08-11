# Overlays (New Season + New Episode)

Phase 1–3 of SMP Overlays — New Season on **show posters**, New Episode on **season posters + episode thumbs**, presets/uploads, preview gallery, and binge grouping.

## Layout

- `cli.py` / `core.py` — Python worker (Pillow + plexapi)
- `assets/presets/new-season.png`, `new-season-compact.png`
- `assets/presets/new-episode.png`, `new-episode-compact.png`
- Runtime data: `config/overlays/` (`config.json`, logs, `preview/`, `preview/samples/`, `presets/custom/`, `backups/`)
- Settings **Visual sample** composites banners onto chosen/random Plex art (no live mutations)

## Stamp rules (Phase 3)

- **Show poster:** New Season only
- **Season poster:** New Episode when the show has eligible new episodes (same window + binge skip)
- **Episode thumbs:** New Episode (default 6-day window)
- `skipNewEpisodeOnBinge` (default on): if 3+ episodes of the same season share an air date, skip episode + season New Episode stamps

## Placement

- Overlays → **Placement** tab: drag/resize the banner on sample art (show / season / episode targets)
- Layout is stored in `config/overlays/config.json` under `placement` and honoured by Preview, Run, and visual samples
- Changing placement does not auto-restamp live Plex art — run Preview or Run again

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
- Custom PNG uploads go to `config/overlays/presets/custom/` (`season-*` / `episode-*`)
- Prefer off-hours if Poster Sets / Kometa also rewrite posters on the same libraries
