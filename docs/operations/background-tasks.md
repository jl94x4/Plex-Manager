# Background Tasks

The Background Tasks settings page shows the active scheduler and lets admins run jobs manually.

Task labels adapt to the selected media player:

| Task | Plex Mode | Jellyfin Mode |
| --- | --- | --- |
| User sync | Sync Plex users | Sync Jellyfin users |
| Expiry checks | Email users nearing expiry | Same |
| Revoke access | Remove expired Plex access | Revoke expired portal access |
| Inactive cleanup | Revoke inactive users | Revoke inactive Jellyfin portal users |
| Analytics cache | Plex and Tautulli data where configured | Jellyfin and Jellystat data where configured |
| Library stats | Plex stats builder | Hidden in Jellyfin mode |
| Discovery availability cache | Rebuilds Sonarr/Radarr badge cache for Discover browse | Same |
| Maintenance index | Build media/request index | Same |
| Rolling backup | Create config backups | Same |

Media Automation is managed from its own admin page and is not listed as a **Settings → Background Tasks** task in v1. Jobs arrive from manual enqueue or Sonarr/Radarr/Lidarr webhooks; the worker uses durable lease/heartbeat recovery inside the portal process. See [Native Media Automation](/features/media-automation). This task list does not imply a scheduled filesystem scan.

## Diagnostics

The Settings System diagnostics page uses the same media-aware task list. A Jellyfin portal is not expected to pass Plex-only checks, and Plex-only jobs are hidden where appropriate.

## Backups

Rolling backups are written to the backup directory. In Docker, mount `/app/backup` so snapshots survive container replacement.
