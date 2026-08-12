<div align="center">

<img src="static/logo.png" alt="Server Portal Logo" width="240" height="240" />

# Server Portal

**A premium, fully-automated management and analytics portal for Plex and Jellyfin media servers.**

Built with Node.js · Express · React · Tailwind CSS

[![View Documentation](https://img.shields.io/badge/View_Documentation-e5a00d?style=for-the-badge)](https://jl94x4.github.io/Server-Manager-Portal/)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)
[![Plex](https://img.shields.io/badge/Plex-Media%20Server-orange.svg)](https://www.plex.tv/)
[![Jellyfin](https://img.shields.io/badge/Jellyfin-Media%20Server-00A4DC.svg)](https://jellyfin.org/)
[![Docker Image Size](https://ghcr-badge.egpl.dev/jl94x4/server-manager-portal/size?label=docker%20image%20size&color=blue)](https://github.com/jl94x4/Server-Manager-Portal/pkgs/container/server-manager-portal)
[![GitHub Stars](https://img.shields.io/github/stars/jl94x4/Server-Manager-Portal.svg?style=flat&logo=github&color=gold)](https://github.com/jl94x4/Server-Manager-Portal/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/jl94x4/Server-Manager-Portal.svg?style=flat&logo=github)](https://github.com/jl94x4/Server-Manager-Portal/network/members)
[![GitHub Issues](https://img.shields.io/github/issues/jl94x4/Server-Manager-Portal.svg?style=flat&logo=github&color=red)](https://github.com/jl94x4/Server-Manager-Portal/issues)

</div>

---

Server Portal is a self-hosted web application that turns your Plex or Jellyfin server into a fully managed streaming service. It handles everything from user onboarding and automated access management, to real-time analytics, live session monitoring, trending content discovery, Seerr-style media request review, and personalized wrap-ups for every user, all from one polished, mobile-first dashboard with a premium glass UI.

Once set up, users can sign in with Plex OAuth or Jellyfin authentication/Quick Connect to see their own portal, activity, and stats.

---
<img width="2294" height="1218" alt="image" src="https://github.com/user-attachments/assets/16d548fb-c07c-4967-bd39-12ffdfac45c0" />
<img width="1956" height="972" alt="image" src="https://github.com/user-attachments/assets/c15bb979-b759-4fa1-ae88-772f6a04e34b" />


## Feature Overview

### Integration List

Server Portal can connect to the apps that usually surround a Plex, Jellyfin, or Emby-style media stack.

| Category | Integrations | What they power |
|---|---|---|
| **Media servers** | Plex, Jellyfin, Emby | Login, profiles, library stats, live sessions, Discover, maintenance, and upgrader workflows |
| **Analytics** | Tautulli, Jellystat | Plex/Jellyfin analytics, personal wrap-ups, leaderboard data, watch history, Jellyfin yearly activity heatmap, and status checks |
| **Requests** | Built-in portal (default) or Seerr | Discover, request queue, approvals — Seerr optional as engine or history import |
| **ARR apps** | Sonarr, Radarr, Lidarr | Calendars, queues, history, download matching, and upgrader actions where supported |
| **Subtitles** | Bazarr | Multi-instance subtitle widgets, tools, version display, and connection tests |
| **Download clients** | qBittorrent, Real-Debrid Client, Transmission, BitTorrent, Deluge, SABnzbd, NZBGet | Unified Download Status page with progress, speed, source filters, client health, and ARR matching |
| **Notifications** | Gotify, SMTP email | Alert rules, access notifications, expiry warnings, inactivity notices, welcome emails, and newsletters |
| **Metadata and artwork** | TMDB | Trending slideshow, posters, backdrops, and Discover enrichment |

ARR, Bazarr, and download clients support multiple named instances where needed. The Download Status page merges all enabled clients and filters active downloads by Sonarr, Radarr, Lidarr, or Other.

---

### Personal Analytics & Wrap-Up

Every user gets a rich, personalized dashboard packed with insights about their own streaming habits. A **time-period filter** (7 / 30 / 60 / 90 / 180 / 365 days / All Time) updates every card simultaneously. Metadata is cached server-side and refreshed by a background job every **30 minutes** for near-instant filter switching.

| Card | What it shows |
|---|---|
| **Server Rank** | Your current rank on the server leaderboard, a progress bar showing your percentile, a mini-leaderboard showing the 2 users above/below you, and a "plays to climb" target to beat the person above you |
| **Total Streams** | Total play count with a visual breakdown by Movies / Episodes / Tracks (with %), daily average, unique titles, and a recent watch history list |
| **Top Binge** | Your most-watched TV show with its backdrop art, synopsis, and runner-up shows with posters |
| **Top Movie** | Your most-watched movie with its backdrop art, tagline, synopsis, release year, and runner-up movies |
| **Media Profile** | Your viewer personality type (Movie Buff, TV Show Binger, Music Lover, Mixed Bag) with colour-coded breakdown bars, percentage splits, and top 3 movies + top 3 shows |
| **Watch Style** | Discovery vs Rewatch analysis with a split progress bar and your top 5 most-rewatched titles |
| **Streaming Habit** | Weekday vs Weekend split bar chart, average plays per day, and habit label (Weekend Warrior, Weekday Streamer, Balanced) |
| **Top Library** | Your most-used media library with a full ranked breakdown of all libraries |
| **Top Day** | An animated bar chart showing your plays across all 7 days of the week, highlighting your peak day |
| **Peak Hours** | An animated hourly distribution chart showing what time of day you stream the most |
| **Time of Day** | Your streaming persona (Night Owl, Early Bird, Evening Streamer, Afternoon Watcher) with a contextual description |

All cards open into detailed modals loaded with contextual data, media artwork, and dynamic charts.

**Shareable wrap-up** - Export your personal wrap-up as a PNG image from the home dashboard. The share modal previews the real card grid and supports native share on supported devices, with download as a fallback.

**Paginated watch history** - Recently Watched and Your Most Watched use responsive pagination (18 items per page on desktop, 12 on mobile) so large libraries stay fast and readable.

---

### Admin Dashboard

A comprehensive control panel for the server owner:

- **Live Session Monitor** - Real-time view of all active streams with user avatar, media title, progress bar, stream type badge (Direct Play / Transcode), and a click-through technical modal showing video codec, audio codec, bitrate, channels, resolution, and transcode reason
- **User Management Table** - View all users with their Plex or Jellyfin avatar, username, email, access expiry date, last seen timestamp, and quick-action buttons (+1 Month, +1 Year, Unlimited, Revoke)
- **Server Leaderboard** - Server-wide play count rankings across all time periods, updated automatically in the background
- **Audit Log** - Timestamped record of all system actions (access granted, revoked, extended, expired)
- **Settings UI** - Configure every aspect of the portal from the browser without touching config files
- **Customizable Home Layout** - Reorder home page sections and show or hide whole blocks (Personal Wrap-Up, Main grid, Pending Requests, Recently / Most Watched, Recently Added) from **Settings → Layout**, with a live preview before saving. The main dashboard grid keeps a fixed balanced two-column layout so card heights stay aligned
- **Pending Requests Widget** - Surface open portal requests on the home dashboard with quick review actions, fanart-backed cards, and a count badge in the sidebar
- **Library Maintenance** - Scan libraries for missing or empty media, manage exclusions, and run cleanup tasks from the Maintenance page
- **Library Upgrader (Plex / Jellyfin)** — Find non-HEVC titles, browse a poster grid with codec/HDR badges, drill into show episodes, open Plex/Jellyfin or Sonarr/Radarr deep links, snooze titles, and optionally switch ARR quality profiles with search triggers (dry-run preview, bulk select, history tab, rate limits). Enable in **Settings → Library Upgrader**.
- **Native Media Automation** — Run opt-in FFmpeg/FFprobe jobs from manual, Sonarr, Radarr, or Lidarr selections. CPU, NVENC, QSV, Intel VAAPI, and AMD VAAPI adapters are included; dry-run, copy, atomic replace, and quarantine workflows protect source media. See the [feature guide](docs/features/media-automation.md).
- **Collexions (admin)** — Automated Plex collection pinning. UI lives in the portal; the Python worker is **bundled in the portal image**. Enable in **Settings → Collexions** (no second container).

---

### Customizable Home Layout

Admins can tailor the home page for their community without editing code:

| Control | What it does |
|---|---|
| **Section order** | Drag and drop the major home sections into any order, including the Pending Requests block |
| **Section visibility** | Toggle each section Shown or Hidden with one click |
| **Live preview** | See exactly how the layout will look before you save |
| **Locked main grid** | Left and right dashboard columns stay balanced; individual widget order inside the grid is fixed to prevent uneven card heights |

Layout settings are saved server-wide, validated on the backend, and applied to every user on the next page load. Admin-only widgets (Quick Actions, Server Admin badge) cannot be hidden through layout tampering.

---

### Discover Page

A curated content discovery experience for all users, powered by server-wide watch history and live media activity:

**Live activity**
- Real-time stream summary cards (total streams, direct play, transcoding, bandwidth)
- Now playing cards with poster art, quality badges, player info, progress bar, and ETA
- Responsive layout: 3 stretched cards by default, up to 4 across on ultra-wide displays when 4 or more streams are active
- Activity refreshes every second while the page is open

**Recently added**
- Movies, TV shows, and music grids with poster quality badges
- 20 items per section on desktop and 12 on mobile by default
- 10-column poster grid on large screens
- Configurable limit dropdown (12, 20, 50, 100, 150, 200, 250 items) with preference saved in the browser

**Trending and community picks**
- **Trending This Week** - What the whole server has been watching in the last 7 days
- **Top Movies / Top Shows** - The most-played movies and shows over the past month
- **Weekend Warriors** - Content that spikes on Fridays, Saturdays, and Sundays
- **Night Owl Club** - Content most watched between midnight and 5am
- **All-Time Greats** - The highest play-count content ever on the server
- **Cult Classics** - Niche content with extremely high plays relative to its tiny viewer count
- **Blast from the Past** - Pre-2000 titles getting recent love

All discover items display server artwork, play counts, and quality badges (4K, HDR, AV1/HEVC, Atmos, and more). Trending and analytics caches are reused on startup when still fresh, so the portal loads quickly after restarts.

---

### Media Stack

Browse your Sonarr, Radarr, Lidarr, Bazarr, and download-client activity directly inside the portal:

- **Release Calendar** - Upcoming TV episodes and movie releases with poster art, air dates, and grabbed/missing status
- **Active Queue** - Live download queue from Sonarr, Radarr, and Lidarr-aware matching with progress and status
- **Recent History** - Import and grab history across configured ARR services
- **Month Navigation** - Browse releases by month with auto-advance to the next month that has content
- **Smart ID Matching** - Uses IMDb, TMDB, and TVDB IDs to accurately map and display metadata
- **Bazarr Tools** - Multi-instance subtitle widgets and quick subtitle tooling
- **Download Status** - Unified view of qBittorrent, Real-Debrid Client, Transmission, BitTorrent, Deluge, SABnzbd, and NZBGet downloads with Sonarr/Radarr/Lidarr filters

Configure ARR apps, Bazarr, request apps, and download clients in **Settings → Media Stack**.

---

### Request Management

Built-in Discover & Request (default) — members browse TMDB and submit requests; admins approve into Sonarr/Radarr. Seerr/Overseerr/Jellyseerr remains an optional request engine, or a one-shot history import source.

**Requests page (admin)**
- **Status tabs** - Pending, Failed, Approved, and Declined with live counts
- **Request cards** - Poster, requester, quality, folder, tags, seasons, and overview with faded fanart backdrops
- **Review & Approve** - Full-screen modal with season picker, quality profile, root folder, tags, and request-as user override
- **Quick actions** - Approve, edit, decline, retry failed requests, and delete from the list
- **Rich metadata** - TMDB titles, posters, and backdrops (TVDB poster fallback when needed)

**Home dashboard widget**
- **Pending Requests section** - Movable and hideable from **Settings → Layout**
- **Inline review** - Open the same approval modal directly from the dashboard widget
- **Wide layout support** - Two-column request cards on ultra-wide home layouts

---

### Library Upgrader

A powerful, built-in tool for server admins to identify and upgrade sub-optimal media in your library, fully integrated with your Sonarr and Radarr instances. Enable it in **Settings → Library Upgrader**.

**Core Capabilities:**
- **Advanced Media Filtering** - Index your entire library to easily filter and browse your media by codec, resolution, and size. Instantly locate H.264 files or check HDR availability per show, so you can easily upgrade to a different codec when you need to.
- **Deep ARR Integration** - Directly connects to your Sonarr and Radarr instances. Automatically matches Plex/Jellyfin items to their exact Radarr/Sonarr equivalents.
- **Multi-Instance Support** - Supports multiple Radarr/Sonarr instances simultaneously (e.g., separate 1080p and 4K instances) mapped to different libraries.
- **Smart Quality Profile Mapping** - Map your preferred Sonarr and Radarr quality profiles to your libraries, allowing you to easily switch profiles and trigger searches with a single click.

**Dashboard & Navigation:**
- **Rich Visual Grid** - Browse flagged movies and TV shows through a premium, responsive poster grid overlaid with real-time codec, resolution, size, and HDR badges.
- **Advanced Filtering & Sorting** - Filter by Codec (H.264, HEVC, AV1, VP9), Resolution (SD, 720p, 1080p, 4K), Quality (WebDL, Remux, Bluray), or special features (Missing HDR, Zero-byte files). Sort by size, watch count, or age.
- **Deep Episode Inspection** - Click into any TV show to open a detailed, season-by-season episode drawer showing exact file sizes, codecs, and current Sonarr custom formats/qualities for every individual episode.
- **Missing Episode Detection** - Instantly surfaces episodes that are in Plex but missing from Sonarr, or vice versa.

**Upgrade Actions:**
- **One-Click Upgrades** - Switch Sonarr/Radarr quality profiles directly from the portal and automatically trigger a search for the new quality.
- **Bulk Operations** - Select multiple movies or shows at once to upgrade their quality profiles and trigger searches in bulk.
- **Granular Search Triggers** - Trigger a search for an entire series, a specific season, or drill down to search for a single episode right from the UI.
- **Background Processing Queue** - Upgrades are sent to a background task queue with configurable rate limits (e.g., max 50 actions per hour) to prevent overwhelming your indexers or ARR instances.
- **Dry-Run Preview** - Preview exactly which items will be upgraded, skipped (if already on the target profile), or fail, before committing to any bulk changes.

**Management & Tracking:**
- **Action History** - A dedicated audit log tracking all your manual and automated upgrade actions, profile changes, and search triggers.
- **Snooze & Ignore** - Snooze specific titles to hide them from the upgrader view for a set duration, or permanently exclude specific libraries, shows, or movies.
- **Reclaimable Space Estimation** - View live statistics on how many gigabytes of storage could be reclaimed by upgrading your media to more efficient formats.

---

### Collexions

Admin-only Plex collection automation. The portal ships the React UI (`client/collexions/`) and **bundles** the Flask/`ColleXions.py` worker from `collexions/` inside the same Docker image. Enable under **Settings → Collexions** and save — the portal starts the worker on localhost automatically (service key and internal URL are generated for you).

Onboarding (and Config → Import from portal) auto-fills Plex URL/token and TMDB from portal Settings when available; Trakt/MDBList are still entered in Collexions if you use them. Migrating from standalone Collexions: use **Config → Import config.json** with your existing file, review, then **Save Config**. Worker state lives under `config/collexions/` on the portal volume.

---

### User Onboarding & Access Management

- **Invite Link System** - Generate shareable invite links with a configurable max-use limit and custom duration. Users claim access via a branded landing page
- **Plex OAuth** - Secure login via official Plex.tv authentication. No Plex passwords stored
- **Jellyfin Auth + Quick Connect** - Jellyfin portals support username/password auth and one-click Quick Connect, with admin detection from Jellyfin policy
- **Automated Temporary Access** - Auto-grant configurable temporary access periods (e.g., 3 days) to all new users
- **Access Expiry** - Set hard expiry dates per user. The system automatically revokes portal access when time is up
- **Inactivity Cleanup** - Automatically remove users who haven't streamed in a configurable number of days, with per-user exemptions available
- **Grace Period Notifications** - Warn users via email before their access expires

---

### Automated Communications

Beautiful, responsive HTML emails sent automatically:

| Email Type | Trigger |
|---|---|
| **Welcome** | Immediately when a user joins |
| **Temporary Access Warning** | When a temporary access user is approaching expiry |
| **Access Expired** | When a user's access is automatically removed |
| **Inactivity Warning** | Before an inactive user is purged |
| **Weekly/Monthly Newsletter** | Scheduled email featuring newly added Movies, TV Shows, and Music |

---

### Public-Facing Pages

- **Landing Page** - A sleek login page showing live library stats (total movies, shows, music) and your configured server branding
- **Status Page** - A public `/status` dashboard showing the live uptime of your media server, analytics companion, and download clients
- **Invite Claim Page** - A dedicated, shareable page for invited users to claim their account

---

### Custom UI Themes

- **Multiple Dark Themes** - Users can select between **Plex Dark** (classic orange), **Sleek Slate** (modern blue), **Nordic Frost** (cool indigo), **Jellyfin Purple**, **Emerald Green**, **Neon Midnight**, **Crimson Red**, **Deep Amethyst**, or **Sunset Orange** directly from the navigation panel.
- **Admin Configuration** - Admins can set the default theme for new users and visitors from **Settings ➔ Portal UI**.
- **Dynamic Accent Colors** - Interface elements, charts, active navigation states, and borders dynamically update to match the selected theme's brand palette.

---

### Mobile-First Design

- Full bottom navigation bar on mobile with smooth tab switching
- Clean top header on mobile showing only the server logo and essential actions
- All modals, cards, and charts are fully responsive and touch-friendly
- Safe area inset support for modern iOS and Android browsers

---

## Technology Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js, Express.js |
| **Frontend** | React 18 (bundled via esbuild), TypeScript |
| **Styling** | Tailwind CSS v3 |
| **Auth** | JWT (httpOnly cookies) + Plex.tv OAuth or Jellyfin authentication |
| **Data** | Local JSON flat-files (no database required) |
| **Email** | Nodemailer (compatible with any SMTP provider) |
| **Icons** | Lucide React |
| **Compression** | GZIP via `compression` middleware |

---

## Security

- **No Plex Passwords** - Plex authentication is handled by Plex.tv OAuth. Jellyfin password login is exchanged directly with your Jellyfin server and is not stored by the portal
- **JWT Session Security** - Cookies use `httpOnly`, `secure`, and `sameSite: lax` flags to reduce XSS and CSRF risk while keeping auth redirects reliable
- **Rate Limiting** - Authentication endpoints have strict rate limiting to prevent brute-force attacks
- **HTTP Security Headers** - HSTS, X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, and Permissions-Policy enforced on every response
- **Admin Protection** - Admin routes require an authenticated admin session. Plex admins are verified from server ownership; Jellyfin admins are verified from Jellyfin user policy
- **Reverse Proxy Ready** - Supports Nginx, Caddy, and Cloudflare via `X-Forwarded-Proto` / `X-Forwarded-For` header trust, including optional subpath hosting (e.g. `https://media.example.com/portal`)
- **Injection Proof** - Uses a flat-file JSON system, making SQL injection structurally impossible

---

## Getting Started

### Prerequisites

- **Node.js** v20.6 or newer (for native `.env` support)
- A **Plex Media Server** with an admin Plex token, or a **Jellyfin Server** with an admin API key
- *(Optional)* An SMTP provider for email notifications

### Installation

**1. Clone the repository**
```bash
git clone https://github.com/jl94x4/Server-Manager-Portal.git
cd Server-Manager-Portal
```

**2. Install dependencies**
```bash
npm install
```

**3. Generate your JWT secret**
```bash
printf 'JWT_SECRET=%s\n' "$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")" > .env
```

**4. Start the application**
```bash
npm start
```

> `npm start` automatically builds the React frontend and Tailwind CSS, then starts the server on port **2121**.

**5. First-time admin setup**

- Navigate to `http://localhost:2121`
- Choose **Plex**, **Jellyfin**, or **Emby** in the first-time setup wizard
- Plex setup uses Plex OAuth/token and server selection
- Jellyfin setup uses Jellyfin URL + API key, then supports Jellyfin login and Quick Connect
- Go to **Settings** in the sidebar to configure **Media Server**, integrations, SMTP, temporary access settings, branding, and scheduled tasks

### Media server modes

| Mode | Authentication | Analytics companion | Branding |
|---|---|---|---|
| **Plex** | Plex.tv OAuth, Plex token, selected owned server | Tautulli | Plex or custom theme |
| **Jellyfin** | Jellyfin username/password or Quick Connect | Jellystat | Jellyfin server icon and splash screen proxy, or custom theme |
| **Emby** | Emby-compatible server connection | Optional external analytics/status tools | Emby or custom theme |

Plex mode keeps the original Plex OAuth and Tautulli flow. Jellyfin mode uses your Jellyfin URL/API key for user sync, session activity, Quick Connect, and server branding assets. Jellystat provides rich analytics on par with Tautulli where configured.

---

## Docker Deployment

The recommended way to run Server Portal in production is Docker with a persistent volume for `config/`.

### Pre-built images (GHCR)

Official images are published automatically on every push to `main`, `beta`, and `testing`:

| Tag | When updated | Image |
|---|---|---|
| `latest` | Every push to `main` and every release tag `v*` | `ghcr.io/jl94x4/server-manager-portal:latest` |
| `beta` | Every push to `beta` | `ghcr.io/jl94x4/server-manager-portal:beta` |
| `testing` | Every push to `testing` | `ghcr.io/jl94x4/server-manager-portal:testing` |
| `1.5.0` / `v1.5.0` | Matching GitHub release | `ghcr.io/jl94x4/server-manager-portal:1.5.0` |

Pull and run without building locally:

```bash
docker pull ghcr.io/jl94x4/server-manager-portal:latest
docker run -d \
  --name server-manager-portal \
  -p 2121:2121 \
  -e JWT_SECRET="your-secret-at-least-32-chars" \
  -e FORCE_SECURE_COOKIES=true \
  -e PUBLIC_BASE_URL=https://portal.example.com \
  -v "$(pwd)/config:/app/config" \
  -v "$(pwd)/backup:/app/backup" \
  ghcr.io/jl94x4/server-manager-portal:latest
```

Use the `beta` tag to test upcoming features before they land on `latest`. Use `testing` for experimental branch builds (e.g. Library Upgrader work in progress).

### Quick start (Docker Compose)

**1. Clone and configure**

```bash
git clone https://github.com/jl94x4/Server-Manager-Portal.git
cd Server-Manager-Portal
cp .env.example .env
```

Edit `.env` and set `JWT_SECRET` (at least 32 characters). If the portal is served over HTTPS behind a reverse proxy, also set:

```env
FORCE_SECURE_COOKIES=true
PUBLIC_BASE_URL=https://portal.example.com
```

**2. Build and run**

```bash
docker compose up -d --build
```

The portal listens on port **2121** by default. Open `http://localhost:2121` and complete the first-time setup for Plex or Jellyfin.

**3. Persisted data**

| Host path | Container path | Purpose |
|---|---|---|
| `./config` | `/app/config` | All JSON settings, users, caches, logs |
| `./backup` | `/app/backup` | Rolling backup snapshots |

On first startup, any legacy JSON files still in the project root are automatically migrated into `config/`.

### Docker Compose tips

- Change the published port: set `PORT=8080` in `.env` (maps host `8080` → container `2121`).
- Integrations on your LAN (Sonarr, Radarr, Lidarr, Bazarr, Tautulli, Jellystat, request apps, and download clients): set `ALLOW_PRIVATE_INTEGRATION_URLS=true` and use reachable URLs from inside the container (e.g. `http://host.docker.internal:8989` on Docker Desktop, or your host IP on Linux).
- View logs: `docker compose logs -f portal`
- Update: `git pull && docker compose up -d --build`

### Native Media Automation (optional)

The image includes FFmpeg/FFprobe and Debian Bookworm Intel/AMD VAAPI userspace packages. CPU mode requires no GPU. The default Compose service remains unprivileged and does not mount media or GPU devices, so it starts normally on hosts without them.

Mount only the required media roots (read/write for copy, replace, or quarantine). For Intel QSV/VAAPI or AMD VAAPI, pass `/dev/dri` and add the host `video`/`render` group IDs. For NVIDIA NVENC, install NVIDIA Container Toolkit and uncomment the runtime/environment example in `docker-compose.yml`. Keep `privileged: false`.

Worker Test runs a short synthetic encode for each non-CPU adapter when matching encoders are present. Still validate real NVENC/QSV/VAAPI jobs with a controlled copy after changing drivers or mappings. An explicitly selected unavailable mode fails instead of silently falling back unless CPU fallback is enabled. Begin with dry-run, then copy mode. Atomic replace requires the final temporary output to share a filesystem with its destination, and quarantine requires writable space for the original.

Version 1 accepts manual plus Sonarr/Radarr/Lidarr webhook jobs, uses only the built-in native executor, and does not expose a plugin API or promise scheduled filesystem discovery. Full setup and safety notes: [Native Media Automation](docs/features/media-automation.md).

### Collexions (bundled)

Collexions is built into the portal image. No second container is required.

1. Rebuild/redeploy the portal image so it includes the Python worker.
2. In **Settings → Collexions**, turn **Enable** ON and click **Save Settings**.
3. Open **Collexions** in the nav — import your old `config.json` if migrating, or complete onboarding.

Worker data persists under `./config/collexions/` (config + logs). Advanced: set `COLLEXIONS_EMBEDDED_PORT` if you need a different localhost port (default `15755`).

### Build the image manually

```bash
docker build -t server-manager-portal .
docker run -d \
  --name server-manager-portal \
  -p 2121:2121 \
  -e JWT_SECRET="your-secret-at-least-32-chars" \
  -e FORCE_SECURE_COOKIES=true \
  -e PUBLIC_BASE_URL=https://portal.example.com \
  -v "$(pwd)/config:/app/config" \
  -v "$(pwd)/backup:/app/backup" \
  server-manager-portal
```

### Reverse proxy (Nginx / Caddy / Traefik)

Run the container on an internal port and proxy HTTPS to it.

#### Root hosting (recommended)

Example Caddy:

```caddy
portal.example.com {
    reverse_proxy localhost:2121
}
```

Set `FORCE_SECURE_COOKIES=true` and `PUBLIC_BASE_URL=https://portal.example.com` so session cookies and email links use the public URL.

#### Subpath hosting

You can also host the portal under a path on an existing domain, for example `https://media.example.com/portal` alongside Plex, Jellyfin, or other services.

Example Caddy:

```caddy
media.example.com {
    handle /portal/* {
        reverse_proxy localhost:2121
    }
}
```

Set these environment variables:

```env
BASE_PATH=/portal
PUBLIC_BASE_URL=https://media.example.com/portal
FORCE_SECURE_COOKIES=true
```

`BASE_PATH` can be omitted if `PUBLIC_BASE_URL` already includes the path — the app derives it automatically. Leave both unset for root hosting; existing deployments are unchanged.

The proxy must forward requests **with** the `/portal` prefix intact (do not strip the path before the app). The portal rewrites asset and API URLs internally.

### Unraid

Server Manager Portal is available in the **Unraid Community Applications (CA) store**!

#### Install via Community Applications (Recommended)

1. Open the **Apps** tab in your Unraid dashboard
2. Search for **"Server Manager Portal"**
3. Click **Install**
4. Set your **JWT Secret** and adjust appdata paths if needed (default: `/mnt/user/appdata/server-manager-portal/`)
5. Click **Apply** and open the WebUI — you're done! 🎉

#### Manual Template Installation (Alternative)

If you prefer to install the template manually on Unraid 6+:

1. Download the template file: [`unraid/server-manager-portal.xml`](unraid/server-manager-portal.xml)
2. Rename the file with a `my-` prefix, e.g. `my-server-manager-portal.xml`
3. Upload it to your Unraid server at: `/boot/config/plugins/dockerMan/templates-user/`
4. Go to **Docker** → **Add Container** and select **Server-Manager-Portal** from the **User Templates** dropdown
5. Set **JWT Secret** and adjust appdata paths (defaults: `/mnt/user/appdata/server-manager-portal/`)
6. Apply and open the WebUI

The template uses `ghcr.io/jl94x4/server-manager-portal:latest` by default. Other tags: `:beta`, `:nightly`, or a pinned version such as `:1.8.0`.

#### Media Automation paths and GPU (Unraid)

The Unraid template includes optional fields for Native Media Automation media mounts and GPU passthrough. **New installs** see these fields in the template. **Existing containers do not pick them up automatically** when you update the image — Unraid keeps your saved Docker config, and image updates only refresh the image.

To enable Media Automation on an existing install:

1. Edit the container in Unraid (**Docker** → container → **Edit**).
2. Add media mounts (or fill the template path fields if present):

   | Template / mapping | Container path | Example host path |
   | --- | --- | --- |
   | Media Root | `/media` | `/mnt/user/media` |
   | TV Shows | `/tv` | `/mnt/user/media/tv` |
   | Movies | `/movies` | `/mnt/user/media/movies` |
   | Music | `/music` | `/mnt/user/media/music` |

   Container paths must match Sonarr / Radarr / Lidarr (or use Scanner / Media Automation path rewrites). Leave unused paths empty. Use **Add another Path, Port, Variable, Label or Device** if your saved template does not show the new fields yet.
3. **Intel / AMD GPU:** add a Device with Host and Container both set to `/dev/dri`.
4. **NVIDIA GPU:**
   - Install the Unraid **Nvidia Driver** plugin and note your GPU UUID.
   - Add variable `NVIDIA_VISIBLE_DEVICES` = your GPU UUID (or `all`).
   - Keep / set `NVIDIA_DRIVER_CAPABILITIES` = `all`.
   - Enable **Advanced View** and append `--runtime=nvidia` to **Extra Parameters**, for example:

     ```text
     --restart=unless-stopped --hostname=server-manager-portal --runtime=nvidia
     ```
5. Apply the container, enable Media Automation in **Settings**, and run **Test worker** before using copy/replace modes.

CPU-only Media Automation needs media path mounts only — no GPU device or NVIDIA runtime. Full safety notes: [Native Media Automation](docs/features/media-automation.md).

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | Yes | Session signing secret (min 32 characters) |
| `PUID` | No | User ID to run the app as (default `1000`; `99` on Unraid) |
| `PGID` | No | Group ID to run the app as (default `1000`; `100` on Unraid) |
| `PORT` | No | Listen port inside the container (default `2121`) |
| `BIND_HOST` | No | Bind address (default `0.0.0.0`) |
| `CONFIG_DIR` | No | Runtime data directory (default `/app/config` in Docker) |
| `MEDIA_AUTOMATION_CONFIG_DIR` | No | Media Automation state (default `<CONFIG_DIR>/media-automation`) |
| `MEDIA_AUTOMATION_WORK_DIR` | No | Media Automation work metadata (default `<MEDIA_AUTOMATION_CONFIG_DIR>/work`) |
| `PUBLIC_BASE_URL` | Optional | Bootstrap public HTTPS URL for reverse-proxy / subpath hosting. After first login, set **Settings → Portal UI → Public Base URL** — invite emails and shareable links prefer that UI value. Include a subpath when needed, e.g. `https://media.example.com/portal` |
| `BASE_PATH` | No | URL prefix when hosted under a subpath (e.g. `/portal`). Leave empty for root hosting |
| `FORCE_SECURE_COOKIES` | Recommended | Set `true` when behind HTTPS |
| `ALLOW_PRIVATE_INTEGRATION_URLS` | No | Allow LAN/private URLs for Arr stack integrations |
| `SETUP_TOKEN` | No | Token for remote first-time setup |
| `CLIENT_ID` | No | Fixed Plex OAuth client id (auto-generated if unset; Plex mode only) |

See `.env.example` for a full template.

---

## Configuration

All configuration is managed through the **Settings UI** in the browser. Key options include:

| Setting | Description |
|---|---|
| Media Server | Choose Plex, Jellyfin, or Emby |
| Plex Token / Server | Plex admin token, selected server, and optional direct Plex URL |
| Jellyfin / Emby URL and API Key | Media server URL and API key for users, sessions, Quick Connect where supported, and branding proxy |
| Branding & UI | Portal accent colour, server logo, Jellyfin/Plex preset, and splash background |
| Temporary Access Duration | Number of days new users get for free |
| Inactivity Threshold | Days of inactivity before auto-removal |
| SMTP Settings | Host, port, username, password, from address |
| Newsletter Schedule | Weekly or monthly, with day/time selection |
| Home Layout | Section order and visibility for the user home page, including Pending Requests |
| ARR Instances | Sonarr, Radarr, and Lidarr URLs/API keys for calendars, queues, history, and download matching |
| Bazarr Instances | Subtitle widgets, tools, version display, and connection tests |
| Download Clients | qBittorrent, Real-Debrid Client, Transmission, BitTorrent, Deluge, SABnzbd, and NZBGet for the Download Status page |
| Request App (optional) | Seerr / Jellyseerr URL and API key — use as request engine, Discover metadata source, or history import |
| Tautulli / Jellystat | Tautulli for Plex analytics, Jellystat for Jellyfin analytics |
| Alerts | Gotify connection and alert rules |
| Status Page Services | Define services and their health check URLs |

---

## Background Tasks

The **Settings → Background Tasks** page shows the active scheduler and lets admins run jobs manually. Task labels follow the selected media player:

| Task | Plex mode | Jellyfin mode |
|---|---|---|
| User sync | Sync Plex Users | Sync Jellyfin Users |
| Expiry checks | Email users nearing expiry | Same |
| Revoke access | Removes expired Plex access | Revokes expired portal access |
| Inactive cleanup | Revokes inactive users | Revokes inactive Jellyfin portal users |
| Analytics cache | Uses Plex/Tautulli data where configured | Uses Jellyfin/Jellystat data where configured |
| Library stats | Plex Stats Builder | Hidden in Jellyfin mode |
| Maintenance index | Builds media/request index for cleanup rules | Same |
| Media quality index | Also powers Library Upgrader when enabled (Plex or Jellyfin codec scan) | Episode stats for shows when Upgrader enabled |
| Auto rolling backup | Creates rolling config backups | Same |

The **Settings → System** diagnostics page uses the same media-aware task list so Jellyfin portals are not penalized for Plex-only jobs.

---

## Project Structure

```
Server-Manager-Portal/
├── index.js            # Backend: Express API, Plex/Jellyfin integrations, auth, email, background jobs
├── index.tsx           # Frontend entry point
├── client/             # React application source
│   ├── App.tsx         # App shell, routing, responsive layout
│   ├── screens.tsx     # Dashboards, Discover, login, and shared screens
│   ├── home/           # User dashboard layout and widget renderers
│   ├── requests/       # Portal request review UI (admin panel, approval modal, home widget)
│   ├── upgrader/       # Library Upgrader poster browse (non-HEVC scan)
│   ├── collexions/     # Collexions admin UI (proxied to bundled worker)
│   ├── settings/       # Settings UI (Media Server, Home Layout, System, Background Tasks)
│   ├── shared/         # API helpers, types, theme, skeletons, wrap-up cards
│   ├── setup/          # First-time setup wizard
│   └── maintenance/    # Library maintenance panel
├── collexions/         # Bundled Collexions worker (Flask + ColleXions.py)
├── input.css           # Tailwind CSS source
├── static/
│   ├── bundle.js       # Built React frontend
│   ├── tailwind.css    # Built Tailwind styles
│   └── logo.png        # Server logo
├── lib/
│   └── data-paths.js   # Data file locations + legacy migration
├── config/             # Runtime JSON data (gitignored, created on first run)
├── Dockerfile          # Multi-stage production image
├── docker-compose.yml  # One-command Docker deployment
├── .github/workflows/
│   └── docker-publish.yml  # Publishes :latest, :beta, and :testing to GHCR
├── ca_profile.xml      # Unraid Community Applications maintainer profile
├── unraid/
│   └── server-manager-portal.xml  # Unraid Docker template
├── .env.example        # Environment variable template
├── build-version.js    # Stamps version.txt and cache-bust query strings on build
├── package.json
└── .env                # JWT_SECRET (not committed to git)
```

Runtime-generated files (stored in `config/`, not committed to git):
- `config/config.json` - Server configuration
- `config/users.json` - User records
- `config/audit-log.json` - System action log
- `config/trending-cache.json` - Cached leaderboard and trending data

On first startup after an upgrade, any legacy JSON files still in the project root are automatically moved into `config/`.

---

## Release History

Please see the [CHANGELOG.md](CHANGELOG.md) for a detailed history of changes, new features, and bug fixes.

---

## Contributors

*   [Nerdy-Technician](https://github.com/Nerdy-Technician) - Added Jellyfin Support 🚀

---

## License

This project is open-source and available under the [MIT License](LICENSE).

---

<div align="center">
Made with care for the self-hosting community.
</div>
