# Overlays (New Season + New Episode)

Phase 1–3 of SMP Overlays — New Season on **show posters**, New Episode on **season posters + episode thumbs**, presets/uploads, preview gallery, and binge grouping.

## Layout

- `cli.py` / `core.py` — Python worker (Pillow + plexapi)
- `assets/presets/new-season.png`, `new-season-compact.png`
- `assets/presets/new-episode.png`, `new-episode-compact.png`
- Extra styles: `corner-ribbon.png`, `corner-ribbon-episode.png`, `returning-soon.png`, `season-chip.png` (dynamic `S{n}`)
- Runtime data: `config/overlays/` (`config.json`, logs, `preview/`, `preview/samples/`, `presets/custom/`, `backups/`)
- Settings **Visual sample** composites banners onto chosen/random Plex art (no live mutations)
- **Promote preview → live** stamps tracked `preview_only` rows to Plex without a full library rescan

## Stamp rules (Phase 3)

- **Show poster:** New Season only
- **Season poster:** New Episode when the show has eligible new episodes (same window + binge skip)
- **Episode thumbs:** New Episode (default 6-day window)
- `skipNewEpisodeOnBinge` (default on): if 3+ episodes of the same season share an air date, skip episode + season New Episode stamps

## Badge modes (each has a Settings toggle)

- **New Season / New Episode** — existing air-date windows; optional **Watch Now** split style toggles
- **Live | {weekday}** — latest episode aired within Live window; highest-priority bottom badge
- **Recently Added** — Plex `addedAt` within window; skipped if Live or New Season already claimed the show
- **TOP 10** — top-rated shows (audience/rating); corner badge, can stack with bottom badges
- **TMDB air-date fallback** — when Plex lacks `originallyAvailableAt`, resolve dates via TMDB (portal API key) for recently-added undated episodes; applies to New Episode / New Season / Live
- **Media info (4K/HDR/Atmos)** — official Kometa `resolution/*.png` + Atmos audio logos (downloaded from [Kometa](https://github.com/Kometa-Team/Kometa) `defaults/overlays/images/`). Settings: badge-part toggles, include movies/shows, allow/deny ratingKeys
- **Show status** — AIRING / RETURNING / ENDED / CANCELED (Kometa text style; no stock PNGs); TV only; allow/deny keys
- **Ratings** — score + Kometa `rating/TMDb.png` (etc.); movies and/or shows; allow/deny keys
- **Network** — Kometa `network/color/{Name}.png` matched from Plex network/studio; TV only; allow/deny keys

Images are cached at runtime under `config/overlays/kometa-images/` (not vendored in git). Library picker includes movie + TV sections (TV-only modes ignore movies). Placement tab edits New Season/Episode targets **and** these Kometa-style slots (defaults match Kometa offsets on a 1000×1500 poster).

## Placement

- Overlays → **Placement** tab: drag/resize the banner on sample art (show / season / episode targets)
- Layout is stored in `config/overlays/config.json` under `placement` and honoured by Preview, Run, and visual samples
- Changing placement does not auto-restamp live Plex art — run Preview or Run again

## Runs (separate jobs)

Preview / Run now only runs the **core** bundle (Live, New Season, New Episode, Top 10).

- **Run Recently Added** — Recently Added banners only (system job `Overlays: Recently Added`)
- **Run Media / Kometa** — resolution / status / ratings / network only (system job `Overlays: Media / Kometa`)

Each has its own schedule hours in Settings (0 = off). They share one worker lock so two overlay runs never stamp posters at the same time.

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
