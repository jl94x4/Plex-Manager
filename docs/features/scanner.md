# Scanner

**Scanner** is an admin-only, Autoscan-inspired library refresh built into the portal. It does **not** require a separate Autoscan container.

## What it does

1. Receives Sonarr / Radarr / Lidarr webhooks (and manual paths).
2. Rewrites paths as configured.
3. Queues folder scans with a configurable **minimum age**.
4. Sends partial library refreshes to **Plex**, **Jellyfin**, and/or **Emby**.

## Enable

1. Open **Settings → Scanner**.
2. (Optional) Use **Import from Autoscan** — upload or paste your Autoscan `config.yml` to fill auth, triggers, and rewrites. Plex URL/token still come from Settings → Plex.
3. Turn **Enable Scanner** on (if not already).
4. Optionally turn on **Show Home Widget** for a queue/activity card on Home (admins).
5. Optionally turn off **Show ARR Webhooks on Scanner Page** if you don’t want the webhook URL helper block on the Scanner page.
6. Optionally turn off **Show Manual Path on Scanner Page** if you only use ARR webhooks (when shown, it can still be collapsed on the page).
7. Review webhook username/password and rewrites, then Save Settings.
8. Open **Scanner** in the nav.

## Manual scan

On the Scanner page, enter a filesystem path and click **Submit**. The path is added to the queue and processed after the minimum age (and after path existence checks if that toggle is on).

## ARR Connect

For each *arr app:

1. Settings → Connect → Webhook
2. On Import + On Upgrade
3. URL examples (same host as the portal):
   - `/triggers/sonarr`
   - `/triggers/radarr`
   - `/triggers/lidarr`
4. Username / password = Scanner webhook credentials

## Notes

- Webhooks use **HTTP Basic Auth**, not portal login cookies.
- Plex scans use the **token and server URL from Settings → Plex** (no separate Scanner token).
- The **direct Plex server URL** is required (e.g. `http://192.168.x.x:32400`). plex.tv login alone is not enough — without it you will see “no enabled scanner targets”.
- Queue and activity logs live under `config/scanner/`.
- Recent activity shows **why** a refresh ran (import, upgrade, file delete, rename, manual) when the ARR webhook includes that event type.

## Related

- [Calendar](/features/calendar)
- [Integrations](/guide/integrations)
- [Configuration](/guide/configuration)
