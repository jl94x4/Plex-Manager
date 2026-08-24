# Spotify Sync

**Spotify Sync** embeds [spotify-to-plex](https://github.com/jjdenhertog/spotify-to-plex) (`jjdenhertog/spotify-to-plex` image) in the portal so admins can sync Spotify playlists to Plex.

## Enable

1. Open **Settings → Spotify Sync** (Automation group in the settings sidebar).
2. Turn **Enable Spotify Sync** on.
3. Enter your **Spotify API Client ID**, **Client Secret**, and **Encryption Key** (`openssl rand -hex 32`).
4. Set **Internal URL** to the Compose service on your Docker network (default: `http://spotify-to-plex:9030`).
5. Set **Public Base URL** under Settings → Portal UI if the redirect URI is empty.
6. Click **Save Settings** — credentials are written to `config/spotify-to-plex.env` (Compose `env_file`).
7. Register the shown **Spotify redirect URI** in your Spotify Developer app.
8. Restart the `spotify-to-plex` container after credential or schedule changes.
9. Open **Spotify Sync** in the admin nav to use the UI.

You do **not** need Spotify variables in the host `.env` when using Settings — the portal generates the container `env_file`.

## Onboarding

- **Apply Plex/Lidarr from portal** — pushes portal Plex URL/token and the first enabled Lidarr instance into the container (`POST /api/spotify-to-plex/apply-portal-defaults`).
- **Sync now** — triggers sync jobs in the container (`POST /api/spotify-to-plex/sync` with `type: all`).
- **Container logs** — opens the embedded `advanced/logs` view (or use Status monitor when service URLs are configured).

## Home widget

Enable **Home dashboard widget** on the Spotify Sync settings tab. Reorder the **Spotify Sync** section under Home → Edit layout.

## Ops & notifications

- **Status monitor** — when enabled, Spotify Sync appears under External Services (admin-only).
- **Admin notifications** — recent sync failures from the container logs API can trigger `spotify_sync_failed` in-app alerts (Settings → Notifications).

## Requirements

- Plex media server mode
- Portal admin access
- `ALLOW_PRIVATE_INTEGRATION_URLS=true` when using Docker Compose service hostnames on a private network

## Scheduling (single scheduler)

Pick **one** schedule in **Settings → Spotify Sync → Sync schedule**:

| Mode | Behavior |
|------|----------|
| **Container cron** (default) | The `spotify-to-plex` container runs supervisor `sync-scheduler` (daily ~02:00 UTC main sync, plus Lidarr/SLSKD/MQTT offsets). The portal does not schedule syncs. |
| **Portal Background Tasks interval** | The portal calls `POST /api/sync/all` on your interval (1–168 hours, checked every 30 minutes). The portal writes `config/spotify-to-plex/supervisord.conf` (bind-mounted into the container) with **sync-scheduler** disabled so the container cron does not double-sync. |

After changing schedule mode, **restart the `spotify-to-plex` container** so supervisor reloads the generated config.

Use **Sync now** (settings or Spotify Sync page) or **Background Tasks → Run** for immediate runs without waiting for either schedule.

## Related

- [ColleXions](/features/collexions)
- [Docker Deployment](/guide/docker)
