# Spotify Sync

**Spotify Sync** embeds [spotify-to-plex](https://github.com/jjdenhertog/spotify-to-plex) in the portal so admins can sync Spotify playlists to Plex.

## Enable

1. Open **Settings → Spotify Sync** (Automation group in the settings sidebar).
2. Turn **Enable Spotify Sync** on.
3. Enter your **Spotify API Client ID**, **Client Secret**, and **Encryption Key** (`openssl rand -hex 32`).
4. Set **Internal URL** to your sidecar (default with Docker Compose: `http://spotify-to-plex:9030`).
5. Set **Public Base URL** under Settings → Portal UI if the redirect URI is empty.
6. Click **Save Settings** — credentials are written to `config/spotify-to-plex.env`.
7. Register the shown **Spotify redirect URI** in your Spotify Developer app.
8. Restart the `spotify-to-plex` container once after saving credentials.
9. Open **Spotify Sync** in the admin nav to use the UI.

You do **not** need Spotify variables in the host `.env` when using Settings — the portal generates the sidecar env file.

## Onboarding (Phase 2)

- **Apply Plex/Lidarr from portal** — pushes portal Plex URL/token and the first enabled Lidarr instance into the sidecar (`POST /api/spotify-to-plex/apply-portal-defaults`).
- **Sync now** — triggers the sidecar scheduler jobs immediately (`POST /api/spotify-to-plex/sync` with `type: all`).
- **Sidecar logs** — opens the embedded `advanced/logs` view (or use Status monitor when ColleXions/Spotify Sync URLs are configured).

## Home widget

Enable **Home dashboard widget** on the Spotify Sync settings tab. Reorder the **Spotify Sync** section under Home → Edit layout.

## Ops & notifications

- **Status monitor** — when enabled, Spotify Sync appears under External Services (admin-only).
- **Admin notifications** — recent sync failures from the sidecar logs API can trigger `spotify_sync_failed` in-app alerts (Settings → Notifications).

## Requirements

- Plex media server mode
- Portal admin access
- `ALLOW_PRIVATE_INTEGRATION_URLS=true` when using Docker service hostnames on a private network

## Scheduling

Automatic sync runs inside the spotify-to-plex container (daily by default). Use **Sync now** for manual runs without waiting for cron.

## Related

- [ColleXions](/features/collexions)
- [Docker Deployment](/guide/docker)
