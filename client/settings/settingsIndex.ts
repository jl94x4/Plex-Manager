export const SETTINGS_TABS = [
    'plex', 'notifications', 'newsletter', 'cleanup', 'mediastack', 'request', 'branding', 'layout',
    'achievements', 'status', 'invites', 'tasks', 'upgrader', 'collexions', 'media-automation', 'poster-sets', 'overlays', 'editions', 'system', 'contact', 'broadcast', 'stream-rules', 'logs',
] as const;

export type SettingsTabId = typeof SETTINGS_TABS[number];

export type SettingsIndexEntry = {
    id: string;
    tabId: SettingsTabId;
    sectionId?: string;
    label: string;
    group: string;
    keywords: string[];
};

export const SETTINGS_INDEX: SettingsIndexEntry[] = [
    { id: 'branding', tabId: 'branding', label: 'Portal UI', group: 'Portal', keywords: ['theme', 'logo', 'color', 'branding', 'ui', 'public url', 'public base url', 'invite link'] },
    { id: 'branding/public-base-url', tabId: 'branding', sectionId: 'public-base-url', label: 'Public Base URL', group: 'Portal', keywords: ['public', 'url', 'domain', 'invite', 'email', 'newsletter', 'base url', 'https', 'reverse proxy'] },
    { id: 'branding/logo', tabId: 'branding', sectionId: 'logo', label: 'Custom Logo', group: 'Portal', keywords: ['logo', 'icon', 'favicon', 'upload'] },
    { id: 'branding/theme', tabId: 'branding', sectionId: 'theme', label: 'Portal Theme', group: 'Portal', keywords: ['theme', 'light', 'plex dark', 'slate', 'jellyfin purple', 'ocean', 'rose', 'royal', 'graphite', 'cyber lime', 'aurora'] },
    { id: 'branding/announcement', tabId: 'branding', sectionId: 'announcement', label: 'Portal Announcement', group: 'Portal', keywords: ['announcement', 'banner', 'notice'] },
    { id: 'branding/poster-badges', tabId: 'branding', sectionId: 'poster-badges', label: 'Poster Quality Badges', group: 'Portal', keywords: ['poster', 'quality', 'badges', 'hdr', '4k', 'codec'] },
    { id: 'branding/dashboard-watching-badge', tabId: 'branding', sectionId: 'dashboard-watching-badge', label: 'Dashboard Watching Badge', group: 'Portal', keywords: ['dashboard', 'watching', 'streams', 'sidebar', 'badge', 'nav', 'poll', 'interval', 'seconds'] },
    { id: 'branding/slideshow', tabId: 'branding', sectionId: 'slideshow', label: 'TMDB Trending Slideshow', group: 'Portal', keywords: ['slideshow', 'tmdb', 'trending', 'background', 'splash'] },

    { id: 'contact', tabId: 'contact', label: 'Contact Details', group: 'Portal', keywords: ['contact', 'support', 'help'] },
    { id: 'contact/whatsapp', tabId: 'contact', sectionId: 'whatsapp', label: 'WhatsApp Number', group: 'Portal', keywords: ['whatsapp', 'phone', 'number'] },
    { id: 'contact/email', tabId: 'contact', sectionId: 'email', label: 'Contact Email', group: 'Portal', keywords: ['email', 'mail', 'support'] },

    { id: 'layout', tabId: 'layout', label: 'Layout', group: 'Portal', keywords: ['layout', 'navigation', 'menu', 'order', 'sidebar', 'home', 'dashboard', 'widgets', 'sections', 'reorder', 'hide', 'downloads', 'members'] },
    { id: 'layout/navigation', tabId: 'layout', sectionId: 'navigation', label: 'Navigation', group: 'Portal', keywords: ['menu', 'order', 'sidebar', 'nav', 'downloads', 'members'] },
    { id: 'layout/home-layout', tabId: 'layout', sectionId: 'home-layout', label: 'Home Layout', group: 'Portal', keywords: ['dashboard', 'widgets', 'sections', 'home', 'layout', 'reorder', 'hide'] },
    { id: 'achievements', tabId: 'achievements', label: 'Achievements', group: 'Portal', keywords: ['xp', 'badges', 'leaderboard', 'gamification', 'achievements', 'level'] },

    { id: 'plex', tabId: 'plex', label: 'Media Player', group: 'Media Stack', keywords: ['plex', 'jellyfin', 'media', 'player', 'server'] },
    { id: 'plex/connection', tabId: 'plex', sectionId: 'connection', label: 'Media Server Connection', group: 'Media Stack', keywords: ['token', 'server', 'docker', 'url', 'jellyfin', 'plex'] },
    { id: 'plex/privacy', tabId: 'plex', sectionId: 'privacy', label: 'Stream User Privacy', group: 'Media Stack', keywords: ['privacy', 'anonymous', 'hide', 'stream', 'users'] },
    { id: 'plex/analytics-usernames', tabId: 'plex', sectionId: 'analytics-usernames', label: 'Show Usernames in Analytics', group: 'Media Stack', keywords: ['analytics', 'usernames', 'viewer', 'privacy'] },
    { id: 'plex/libraries', tabId: 'plex', sectionId: 'libraries', label: 'Default Libraries', group: 'Media Stack', keywords: ['libraries', 'share', 'temporary', 'access'] },

    { id: 'mediastack', tabId: 'mediastack', label: 'Integrations', group: 'Media Stack', keywords: ['integrations', 'arr', 'sonarr', 'radarr', 'lidarr', 'bazarr', 'downloads', 'qbittorrent', 'transmission', 'deluge', 'sabnzbd', 'nzbget', 'nzb'] },
    { id: 'mediastack/arr', tabId: 'mediastack', sectionId: 'arr', label: 'Sonarr & Radarr Instances', group: 'Media Stack', keywords: ['sonarr', 'radarr', 'arr', 'instances'] },
    { id: 'mediastack/lidarr', tabId: 'mediastack', sectionId: 'lidarr', label: 'Lidarr Instances', group: 'Media Stack', keywords: ['lidarr', 'music', 'artists', 'albums', 'instances'] },
    { id: 'mediastack/bazarr', tabId: 'mediastack', sectionId: 'bazarr', label: 'Bazarr Instances', group: 'Media Stack', keywords: ['bazarr', 'subtitles', 'subtitle', 'instances'] },
    { id: 'mediastack/download-clients', tabId: 'mediastack', sectionId: 'download-clients', label: 'Download Clients', group: 'Media Stack', keywords: ['downloads', 'qbittorrent', 'transmission', 'bittorrent', 'deluge', 'sabnzbd', 'nzbget', 'nzb', 'torrents'] },
    { id: 'mediastack/tautulli', tabId: 'mediastack', sectionId: 'tautulli', label: 'Tautulli Integration', group: 'Media Stack', keywords: ['tautulli', 'analytics', 'plex'] },
    { id: 'mediastack/jellystat', tabId: 'mediastack', sectionId: 'jellystat', label: 'Jellyfin Analytics', group: 'Media Stack', keywords: ['jellystat', 'jellyglance', 'jellyfin', 'analytics'] },
    { id: 'mediastack/seerr', tabId: 'mediastack', sectionId: 'seerr', label: 'Request App (Seerr/Ombi)', group: 'Media Stack', keywords: ['seerr', 'overseerr', 'jellyseerr', 'ombi', 'request'] },
    { id: 'mediastack/tmdb', tabId: 'mediastack', sectionId: 'tmdb', label: 'TMDB API Key', group: 'Media Stack', keywords: ['tmdb', 'api', 'trending', 'metadata'] },

    { id: 'request', tabId: 'request', label: 'Request Discovery', group: 'Media Stack', keywords: ['request', 'discover', 'discovery', 'region', 'language', 'hide available', 'quota', 'permissions', 'seerr', 'overseerr', 'tmdb'] },
    { id: 'request/discovery-source', tabId: 'request', sectionId: 'discovery-source', label: 'Discover Metadata Source', group: 'Media Stack', keywords: ['discovery source', 'tmdb', 'seerr', 'metadata', 'proxy'] },
    { id: 'request/request-engine', tabId: 'request', sectionId: 'request-engine', label: 'Request Engine', group: 'Media Stack', keywords: ['request engine', 'portal', 'json', 'seerr', 'my requests'] },
    { id: 'request/metadata-providers', tabId: 'request', sectionId: 'metadata-providers', label: 'Metadata Providers', group: 'Media Stack', keywords: ['tmdb', 'tvdb', 'series', 'anime', 'provider'] },
    { id: 'request/request-permissions', tabId: 'request', sectionId: 'request-permissions', label: 'Request Permissions', group: 'Media Stack', keywords: ['permissions', '4k', 'advanced', 'watchlist', 'recently added'] },
    { id: 'request/auto-approve', tabId: 'request', sectionId: 'auto-approve', label: 'Auto-Approve', group: 'Media Stack', keywords: ['auto approve', '4k', 'movies', 'series'] },
    { id: 'request/auto-request', tabId: 'request', sectionId: 'auto-request', label: 'Watchlist Auto-Request', group: 'Media Stack', keywords: ['auto request', 'watchlist', 'plex'] },
    { id: 'request/portal-quotas', tabId: 'request', sectionId: 'portal-quotas', label: 'Request Quotas', group: 'Media Stack', keywords: ['quota', 'limit', 'unlimited', '4k'] },
    { id: 'request/region', tabId: 'request', sectionId: 'region', label: 'Discover Region', group: 'Media Stack', keywords: ['discover region', 'country', 'region', 'availability'] },
    { id: 'request/language', tabId: 'request', sectionId: 'language', label: 'Discover Language', group: 'Media Stack', keywords: ['discover language', 'original language', 'filter language'] },
    { id: 'request/hide-available', tabId: 'request', sectionId: 'hide-available', label: 'Hide Available Media', group: 'Media Stack', keywords: ['hide available', 'library', 'discover filter'] },

    { id: 'status', tabId: 'status', label: 'Status Monitor', group: 'Media Stack', keywords: ['uptime', 'health', 'services', 'monitor'] },

    { id: 'notifications', tabId: 'notifications', label: 'Notifications', group: 'Comms', keywords: ['notifications', 'bell', 'web push', 'discord', 'request available', 'vapid', 'in-app', 'test', 'smtp', 'mail', 'email', 'gotify', 'alerts'] },
    { id: 'notifications/smtp', tabId: 'notifications', sectionId: 'smtp', label: 'SMTP Alerts', group: 'Comms', keywords: ['mail', 'smtp', 'email', 'alerts', 'test'] },
    { id: 'notifications/status', tabId: 'notifications', sectionId: 'notifications-status', label: 'Notification Health', group: 'Comms', keywords: ['health', 'status', 'vapid', 'smtp', 'discord', 'job'] },
    { id: 'notifications/request-available', tabId: 'notifications', sectionId: 'notifications-request-available', label: 'Request Available Alerts', group: 'Comms', keywords: ['request available', 'email', 'in-app', 'push', 'discord'] },
    { id: 'notifications/not-released', tabId: 'notifications', sectionId: 'notifications-not-released', label: 'Not Released Yet', group: 'Comms', keywords: ['release', 'digital', 'theatrical', 'calendar', 'unreleased'] },
    { id: 'notifications/templates', tabId: 'notifications', sectionId: 'notifications-templates', label: 'Notification Templates', group: 'Comms', keywords: ['template', 'email subject', 'push title', 'discord', 'copy', 'message'] },
    { id: 'notifications/ntfy', tabId: 'notifications', sectionId: 'notifications-ntfy', label: 'ntfy', group: 'Comms', keywords: ['ntfy', 'push', 'topic', 'self hosted'] },
    { id: 'notifications/webhook', tabId: 'notifications', sectionId: 'notifications-webhook', label: 'Generic Webhook', group: 'Comms', keywords: ['webhook', 'json', 'http', 'integration'] },
    { id: 'notifications/test', tabId: 'notifications', sectionId: 'notifications-test', label: 'Send Test Notification', group: 'Comms', keywords: ['test', 'send', 'bell'] },
    { id: 'notifications/recent', tabId: 'notifications', sectionId: 'notifications-recent', label: 'Recent Notifications', group: 'Comms', keywords: ['history', 'log', 'recent', 'bell'] },
    { id: 'notifications/gotify', tabId: 'notifications', sectionId: 'gotify', label: 'Gotify Alerts', group: 'Comms', keywords: ['gotify', 'push', 'alerts', 'notifications', 'rules', 'self hosted'] },
    { id: 'newsletter', tabId: 'newsletter', label: 'Newsletter', group: 'Comms', keywords: ['digest', 'send', 'frequency', 'weekly', 'monthly'] },
    { id: 'broadcast', tabId: 'broadcast', label: 'Broadcast Email', group: 'Comms', keywords: ['announcement', 'bulk', 'users', 'broadcast'] },
    { id: 'invites', tabId: 'invites', label: 'Invites', group: 'Comms', keywords: ['invite', 'link', 'code'] },
    { id: 'invites/referral', tabId: 'invites', sectionId: 'referral', label: 'Referral System', group: 'Comms', keywords: ['referral', 'reward', 'trial', 'invite friends'] },
    { id: 'invites/links', tabId: 'invites', sectionId: 'invite-links', label: 'Automated Invite Links', group: 'Comms', keywords: ['invite link', 'generate', 'email invite'] },

    { id: 'cleanup', tabId: 'cleanup', label: 'Cleanup', group: 'Automation', keywords: ['inactive', 'revoke', 'expiry', 'cleanup'] },
    { id: 'stream-rules', tabId: 'stream-rules', label: 'Stream Rules', group: 'Automation', keywords: ['kill', 'transcode', 'rule', 'stream'] },
    { id: 'tasks', tabId: 'tasks', label: 'Background Tasks', group: 'Automation', keywords: ['jobs', 'scheduler', 'run now', 'tasks'] },
    { id: 'upgrader', tabId: 'upgrader', label: 'Library Upgrader', group: 'Automation', keywords: ['upgrader', 'hevc', 'h264', 'codec', 'upgrade', 'sonarr', 'radarr'] },
    { id: 'collexions', tabId: 'collexions', label: 'Collexions', group: 'Automation', keywords: ['collexions', 'collections', 'plex', 'trakt', 'sidecar', 'pinning', 'autostart', 'auto start'] },
    { id: 'scanner', tabId: 'scanner', label: 'Scanner', group: 'Automation', keywords: ['scanner', 'autoscan', 'plex scan', 'webhook', 'sonarr', 'radarr', 'lidarr', 'triggers', 'library refresh'] },
    { id: 'media-automation', tabId: 'media-automation', label: 'Media Automation', group: 'Automation', keywords: ['media', 'automation', 'ffmpeg', 'worker', 'transcode', 'remux', 'pipeline', 'hardware', 'nvenc', 'qsv', 'vaapi', 'quiet hours', 'schedule', 'overnight', 'gotify'] },
    { id: 'poster-sets', tabId: 'poster-sets', label: 'Poster Sets', group: 'Automation', keywords: ['poster', 'sets', 'mediux', 'theposterdb', 'artwork', 'plex posters', 'title cards'] },
    { id: 'overlays', tabId: 'overlays', label: 'Overlays', group: 'Automation', keywords: ['overlays', 'new season', 'banner', 'kometa', 'poster overlay', 'season overlay'] },
    { id: 'editions', tabId: 'editions', label: 'Editions', group: 'Automation', keywords: ['editions', 'edition manager', 'plex edition', 'cut', 'remux', 'hdr', 'audio codec', 'webhook'] },
    { id: 'system', tabId: 'system', label: 'System', group: 'Automation', keywords: ['system', 'diagnostics', 'backup'] },
    { id: 'system/health', tabId: 'system', sectionId: 'health', label: 'Health Dashboard', group: 'Automation', keywords: ['health', 'score', 'alerts', 'integrations'] },
    { id: 'system/maintenance', tabId: 'system', sectionId: 'maintenance', label: 'Cleaner Experimental Mode', group: 'Automation', keywords: ['cleaner', 'maintenance', 'experimental'] },
    { id: 'system/backup', tabId: 'system', sectionId: 'backup', label: 'Backup & Restore', group: 'Automation', keywords: ['backup', 'restore', 'export', 'import'] },
    { id: 'system/diagnostics', tabId: 'system', sectionId: 'diagnostics', label: 'Diagnostics', group: 'Automation', keywords: ['diagnostics', 'version', 'node', 'debug'] },
    { id: 'logs', tabId: 'logs', label: 'Logs & Audit', group: 'Automation', keywords: ['audit', 'emails', 'deleted users', 'history', 'logs'] },
];

export const SETTINGS_TAB_GROUPS = [
    { title: 'Portal', tabs: SETTINGS_INDEX.filter((entry) => entry.group === 'Portal' && !entry.sectionId) },
    { title: 'Media Stack', tabs: SETTINGS_INDEX.filter((entry) => entry.group === 'Media Stack' && !entry.sectionId) },
    { title: 'Comms', tabs: SETTINGS_INDEX.filter((entry) => entry.group === 'Comms' && !entry.sectionId) },
    { title: 'Automation', tabs: SETTINGS_INDEX.filter((entry) => entry.group === 'Automation' && !entry.sectionId) },
].map((group) => ({
    title: group.title,
    tabs: group.tabs.map((entry) => ({
        id: entry.tabId,
        label: entry.label,
        keywords: entry.keywords,
    })),
}));

const RECENT_KEY = 'portal-settings-recent';
const RECENT_LIMIT = 6;

export const parseSettingsHash = (hash: string): { tabId: SettingsTabId | null; sectionId: string | null } => {
    const raw = hash.replace(/^#/, '').trim();
    if (!raw) return { tabId: null, sectionId: null };
    if (raw === 'system/upgrader') return { tabId: 'upgrader', sectionId: null };

    // Legacy tab hashes → merged Layout / Notifications sections.
    const legacyTabRedirects: Record<string, { tabId: SettingsTabId; sectionId: string }> = {
        navigation: { tabId: 'layout', sectionId: 'navigation' },
        'home-layout': { tabId: 'layout', sectionId: 'home-layout' },
        smtp: { tabId: 'notifications', sectionId: 'smtp' },
        gotify: { tabId: 'notifications', sectionId: 'gotify' },
    };
    if (legacyTabRedirects[raw]) {
        return legacyTabRedirects[raw];
    }

    const [tabPart, ...sectionParts] = raw.split('/');
    const normalizedTabPart = tabPart === 'media-player' ? 'plex' : tabPart;
    if (!sectionParts.length && legacyTabRedirects[normalizedTabPart]) {
        return legacyTabRedirects[normalizedTabPart];
    }
    const tabId = SETTINGS_TABS.includes(normalizedTabPart as SettingsTabId) ? normalizedTabPart as SettingsTabId : null;
    const sectionId = sectionParts.length > 0 ? sectionParts.join('/') : null;
    return { tabId, sectionId };
};

export const buildSettingsHash = (tabId: SettingsTabId, sectionId?: string | null) => (
    sectionId ? `#${tabId === 'plex' ? 'media-player' : tabId}/${sectionId}` : `#${tabId === 'plex' ? 'media-player' : tabId}`
);

export const getSettingsSectionElementId = (sectionId: string) => `settings-section-${sectionId}`;

export const searchSettingsIndex = (term: string): SettingsIndexEntry[] => {
    const query = term.trim().toLowerCase();
    if (!query) return [];
    return SETTINGS_INDEX.filter((entry) => {
        const haystack = `${entry.group} ${entry.label} ${entry.keywords.join(' ')}`.toLowerCase();
        return haystack.includes(query);
    }).slice(0, 12);
};

export const getRecentSettingsIds = (): string[] => {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(RECENT_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
    } catch {
        return [];
    }
};

export const recordRecentSetting = (entryId: string) => {
    if (typeof window === 'undefined') return;
    const existing = getRecentSettingsIds().filter((id) => id !== entryId);
    const next = [entryId, ...existing].slice(0, RECENT_LIMIT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
};

export const resolveSettingsEntry = (entryId: string): SettingsIndexEntry | undefined => (
    SETTINGS_INDEX.find((entry) => entry.id === entryId)
);

export const getRecentSettingsEntries = (): SettingsIndexEntry[] => (
    getRecentSettingsIds()
        .map((id) => resolveSettingsEntry(id))
        .filter((entry): entry is SettingsIndexEntry => !!entry)
);
