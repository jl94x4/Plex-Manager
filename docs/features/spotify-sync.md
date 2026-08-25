# Spotify Sync

**Spotify Sync** is a native portal page that drives the [spotify-to-plex](https://github.com/jjdenhertog/spotify-to-plex) worker. The worker stays in the portal image; the UI is Server Manager Portal chrome (not an iframe of the upstream app).

## Bundled vs external

| Deployment | What you need |
| --- | --- |
| **Portal Docker image** (default build) | The worker is **bundled** inside the portal container (like ColleXions). Enable in Settings — no separate `spotify-to-plex` Compose service. |
| **Dev / custom image without bundle** | Run the optional `spotify-to-plex` Compose service and set **Internal URL** to `http://spotify-to-plex:9030`. |

When bundled, the portal starts supervisord on loopback (`127.0.0.1:9030`) and stores data under `config/spotify-to-plex/` on the portal config volume. The admin page calls `/api/spotify-to-plex/worker/*` on the portal (never through a public 9030 port).

## Enable

1. Open **Settings → Spotify Sync** (Automation group in the settings sidebar).
2. Turn **Enable Spotify Sync** on.
3. Enter your **Spotify API Client ID**, **Client Secret**, and **Encryption Key** (`openssl rand -hex 32`).
4. If not bundled, set **Internal URL** to the Compose service on your Docker network (default: `http://spotify-to-plex:9030`).
5. Set **Public Base URL** under Settings → Portal UI if the redirect URI is empty.
6. Click **Save Settings** — credentials are written to `config/spotify-to-plex.env` (and `config/spotify-to-plex/` when bundled).
7. Register the shown **Spotify redirect URI** in your Spotify Developer app.
8. **External service:** restart the `spotify-to-plex` container after credential or schedule changes. **Bundled:** save settings (processes restart automatically).
9. Open **Spotify Sync** in the admin nav.

You do **not** need Spotify variables in the host `.env` when using Settings — the portal generates the env file.

## Native page

Tabs cover the worker feature set:

- **Playlists** — add Spotify URLs/URIs or `username:liked`, categories, auto-sync interval
- **Users** — connect Spotify accounts (OAuth via the portal callback)
- **Sync** — apply portal Plex settings; trigger playlists / albums / users / Lidarr / SLSKD / MQTT
- **Matching** — match filters, search approaches, text processing
- **Integrations** — Lidarr, SLSKD, Tidal status and settings
- **Logs** — sync history and missing-file dumps

## Onboarding

- **Plex from portal** — portal Plex URL/token (Settings → Plex) are written into the worker automatically on save, boot, and when you open Spotify Sync.
- **Apply Plex/Lidarr from portal** — manual re-push (`POST /api/spotify-to-plex/apply-portal-defaults`).
- **Sync now** — `POST /api/spotify-to-plex/sync` with `type: all`.

## Home widget

Enable **Home dashboard widget** on the Spotify Sync settings tab. Reorder the **Spotify Sync** section under Home → Edit layout.

## Ops & notifications

- **Status monitor** — when enabled, Spotify Sync appears under External Services (admin-only).
- **Admin notifications** — recent sync failures from the logs API can trigger `spotify_sync_failed` in-app alerts (Settings → Notifications).

## Requirements

- Plex media server mode
- Portal admin access
- `ALLOW_PRIVATE_INTEGRATION_URLS=true` when using Docker Compose service hostnames on a private network (external deployment)

## Scheduling (single scheduler)

Pick **one** schedule in **Settings → Spotify Sync → Sync schedule**:

| Mode | Behavior |
|------|----------|
| **Built-in / container cron** (default) | The worker runs supervisor `sync-scheduler` (daily ~02:00 UTC main sync, plus Lidarr/SLSKD/MQTT offsets). The portal does not schedule syncs. |
| **Portal Background Tasks interval** | The portal calls `POST /api/sync/all` on your interval (1–168 hours, checked every 30 minutes). In portal schedule mode, **sync-scheduler** is disabled so cron does not double-sync. |

After changing schedule mode on an **external** `spotify-to-plex` container, restart that container so supervisor reloads the generated `supervisord.conf` bind mount. **Bundled** deployments apply schedule changes on save.

Use **Sync now** (settings or Spotify Sync page) or **Background Tasks → Run** for immediate runs without waiting for either schedule.

## Related

- [ColleXions](/features/collexions)
- [Docker Deployment](/guide/docker)
