import { isSpotifyToPlexEnabled, sanitizeSpotifyToPlexProxyBase } from './spotify-to-plex-proxy.js';

const SYNC_TYPES = ['albums', 'playlists', 'users', 'lidarr', 'mqtt', 'slskd', 'all'];

export const SPOTIFY_TO_PLEX_SYNC_TYPES = SYNC_TYPES;

export const resolveSpotifyToPlexBase = (config, { allowPrivate = false } = {}) => {
    if (!isSpotifyToPlexEnabled(config)) return '';
    return sanitizeSpotifyToPlexProxyBase(config.spotifyToPlexInternalUrl, { allowPrivate });
};

export const fetchSpotifyToPlexJson = async ({
    config,
    path,
    method = 'GET',
    body,
    fetchWithTimeout,
    allowPrivate = false,
    timeoutMs = 15000,
} = {}) => {
    const base = resolveSpotifyToPlexBase(config, { allowPrivate });
    if (!base) throw new Error('Spotify Sync is not configured.');
    const normalizedPath = String(path || '').startsWith('/') ? path : `/${path}`;
    const url = `${base}${normalizedPath}`;
    const headers = { Accept: 'application/json' };
    const init = { method: String(method || 'GET').toUpperCase(), headers };
    if (body != null && init.method !== 'GET' && init.method !== 'HEAD') {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
    }
    const upstream = await fetchWithTimeout(url, init, timeoutMs);
    const text = await upstream.text();
    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = { raw: text };
        }
    }
    if (!upstream.ok) {
        const message = data?.error || data?.message || `Spotify Sync worker HTTP ${upstream.status}`;
        const err = new Error(message);
        err.status = upstream.status;
        err.data = data;
        throw err;
    }
    return data;
};

const lastSyncLogEntry = (entries) => {
    if (!Array.isArray(entries) || !entries.length) return null;
    return entries[entries.length - 1];
};

const entryTimestamp = (entry) => {
    if (!entry || typeof entry !== 'object') return null;
    const raw = entry.finishedAt || entry.finished_at || entry.timestamp || entry.date || entry.startedAt;
    const parsed = Date.parse(String(raw || ''));
    return Number.isFinite(parsed) ? parsed : null;
};

const entryFailed = (entry) => {
    if (!entry || typeof entry !== 'object') return false;
    if (entry.success === false || entry.ok === false) return true;
    if (entry.error) return true;
    const status = String(entry.status || '').toLowerCase();
    return status.includes('fail') || status.includes('error');
};

export const summarizeSpotifyToPlexLogs = (logs = {}) => {
    const syncTypeLog = logs.sync_type_log || {};
    const syncLog = logs.sync_log || {};
    const types = ['playlists', 'albums', 'users', 'lidarr', 'mqtt', 'slskd'];
    const lastSync = {};
    for (const type of types) {
        const fromTypeLog = syncTypeLog[type];
        const fromEntry = entryTimestamp(lastSyncLogEntry(syncLog[type]));
        lastSync[type] = fromTypeLog || (fromEntry ? new Date(fromEntry).toISOString() : null);
    }
    const playlistRuns = Array.isArray(syncLog.playlists) ? syncLog.playlists.length : 0;
    return {
        lastSync,
        playlistRunCount: playlistRuns,
    };
};

export const detectSpotifyToPlexSyncFailure = (logs = {}, { now = Date.now(), maxAgeMs = 48 * 3600 * 1000 } = {}) => {
    const syncLog = logs.sync_log || {};
    const failures = [];
    for (const [type, entries] of Object.entries(syncLog)) {
        const last = lastSyncLogEntry(entries);
        if (!last || !entryFailed(last)) continue;
        const at = entryTimestamp(last);
        if (at && (now - at) > maxAgeMs) continue;
        failures.push({
            type,
            message: String(last.error || last.message || last.status || 'Sync failed'),
            at: last.finishedAt || last.finished_at || last.timestamp || last.date || null,
        });
    }
    if (!failures.length) return null;
    return {
        failures,
        signature: failures.map((f) => `${f.type}:${f.message}:${f.at || ''}`).join('|'),
    };
};

export const buildSpotifyToPlexPortalApplyPlan = (config, {
    resolveConfiguredPlexServerUrl,
    getArrInstances,
    isArrInstanceReady,
} = {}) => {
    const plexUrl = String(resolveConfiguredPlexServerUrl?.(config) || '').trim().replace(/\/+$/, '');
    const plexToken = String(config.plexToken || '').trim();
    const serverId = String(config.serverIdentifier || '').trim();
    const lidarr = getArrInstances?.(config, { type: 'lidarr', enabledOnly: true }).find(isArrInstanceReady);
    return {
        plex: plexUrl && plexToken
            ? { uri: plexUrl, serverToken: plexToken, id: serverId || undefined }
            : null,
        lidarr: lidarr?.url && lidarr?.apiKey
            ? { url: String(lidarr.url).trim().replace(/\/+$/, ''), apiKey: String(lidarr.apiKey).trim() }
            : null,
    };
};
