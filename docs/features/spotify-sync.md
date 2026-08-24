# Spotify Sync

**Spotify Sync** embeds [spotify-to-plex](https://github.com/jjdenhertog/spotify-to-plex) in the portal so admins can sync Spotify playlists to Plex without exposing the sidecar UI on a public port.

## Enable

1. Run the `spotify-to-plex` service (`docker compose up -d` includes it) or point Settings at an external sidecar URL.
2. Set **Public Base URL** in Settings → Portal UI.
3. Open **Settings → Spotify Sync**, enable the feature, confirm internal URL (`http://spotify-to-plex:9030` in compose), and save.
4. Copy the **Spotify redirect URI** from Settings into your Spotify Developer app.
5. Set the same redirect URI on the sidecar as `SPOTIFY_API_REDIRECT_URI` (see `.env.example`).
6. Open **Spotify Sync** in the admin nav.

## Requirements

- Plex media server mode (hidden for Jellyfin/Emby)
- Portal admin access
- Spotify Developer app (Premium account for the app owner — see upstream docs)
- `ALLOW_PRIVATE_INTEGRATION_URLS=true` when using Docker service hostnames on a private network

## Scheduling

Automatic sync runs inside the spotify-to-plex container (daily by default). The portal does not duplicate that schedule.

## Related

- [ColleXions](/features/collexions)
- [Docker Deployment](/guide/docker)
- [Configuration](/guide/configuration)
