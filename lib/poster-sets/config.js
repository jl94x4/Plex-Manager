import path from 'path';
import fs from 'fs/promises';
import { CONFIG_DIR } from '../data-paths.js';

export const POSTER_SETS_DIR = process.env.POSTER_SETS_CONFIG_DIR
    ? path.resolve(process.env.POSTER_SETS_CONFIG_DIR)
    : path.join(CONFIG_DIR, 'poster-sets');

export const POSTER_SETS_CONFIG_PATH = path.join(POSTER_SETS_DIR, 'config.json');

export const DEFAULT_POSTER_SETS_CONFIG = {
    base_url: '',
    token: '',
    bulk_txt: 'bulk_import.txt',
    tv_library: ['TV Shows'],
    movie_library: ['Movies'],
    mediux_filters: ['title_card', 'background', 'season_cover', 'show_cover'],
    /** Clear Kometa's Overlay label after upload so the next Kometa run reapplies overlays on new art. */
    reset_overlay: true,
    /** When the same set appears on MediUX and ThePosterDB, which one to keep as primary. */
    dupePreference: 'posterdb',
    /** Periodically re-check watched sets for new posters / title cards. */
    watchersEnabled: true,
    /** Hours between watcher passes (minimum 1). */
    watchIntervalHours: 6,
    /** After a successful apply, automatically pin the set for future updates. */
    autoWatchOnApply: true,
    /** Gotify summary when a watcher pass queues new art (uses portal Gotify settings). */
    notifyOnWatcherDigest: true,
    /** When Sonarr On Import fires, debounce-check matching Poster Sets watches. */
    arrWatchHookEnabled: true,
    /**
     * Creator usernames (MediUX / ThePosterDB) to surface on Browse → Following.
     * Clicking @user anywhere still opens their full catalog.
     */
    creatorWhitelist: [],
    /**
     * Where applied artwork is written: Plex server upload, Jellyfin/Emby API, local files, or Plex + local.
     * Jellyfin/Emby uses portal Media Player credentials.
     */
    applyDestination: 'plex',
    tpdb_username: '',
    tpdb_password: '',
    /** Persist TPDB scrapes for library titles (fast reopen + offline apply). Opt-in. */
    tpdbLocalCacheEnabled: false,
    /** After a library title's TPDB sets load, background-cache every set's assets + images. */
    tpdbAggressivePrefetch: false,
    /**
     * Experimental: run 3 Warm CLI workers in parallel (separate sessions).
     * Faster title resolve, higher 429 / Cloudflare risk — turn off if Warm gets flaky.
     */
    tpdbWarmParallelWorkers: false,
    /**
     * Attempt TPDB login for advanced TMDB/IMDB/TVDB search.
     * Turn off on Cloudflare-blocked hosts — public title search still scrapes posters.
     */
    tpdbUseLogin: true,
    /** Soft cap for tpdb-image-cache on disk (bytes). */
    tpdbCacheMaxBytes: 2 * 1024 * 1024 * 1024,
};

const asLibraryList = (value) => {
    if (Array.isArray(value)) {
        return value.map((item) => String(item || '').trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
    }
    return [];
};

const asCreatorWhitelist = (value) => {
    const seen = new Set();
    const out = [];
    for (const raw of asLibraryList(value)) {
        const user = String(raw || '').trim().replace(/^@+/, '');
        if (!user || !/^[A-Za-z0-9._-]{1,64}$/.test(user)) continue;
        const key = user.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(user);
        if (out.length >= 40) break;
    }
    return out;
};

const asFilterList = (value) => {
    const allowed = new Set(['title_card', 'background', 'season_cover', 'show_cover']);
    return asLibraryList(value).filter((item) => allowed.has(item));
};

const asDupePreference = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'mediux' || raw === 'mediaux') return 'mediux';
    return 'posterdb';
};

const APPLY_DESTINATIONS = new Set(['plex', 'local', 'plex_local', 'jellyfin', 'emby']);

const asApplyDestination = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (APPLY_DESTINATIONS.has(raw)) return raw;
    if (raw === 'both' || raw === 'plex+local' || raw === 'plex_and_local') return 'plex_local';
    return DEFAULT_POSTER_SETS_CONFIG.applyDestination;
};

export const normalizePosterSetsConfig = (input = {}) => {
    const filters = asFilterList(input.mediux_filters);
    const resetOverlay = input.reset_overlay;
    const watchersEnabled = input.watchersEnabled ?? input.watchers_enabled;
    const autoWatchOnApply = input.autoWatchOnApply ?? input.auto_watch_on_apply;
    const notifyOnWatcherDigest = input.notifyOnWatcherDigest ?? input.notify_on_watcher_digest;
    const arrWatchHookEnabled = input.arrWatchHookEnabled ?? input.arr_watch_hook_enabled;
    const intervalRaw = Number(input.watchIntervalHours ?? input.watch_interval_hours);
    return {
        base_url: String(input.base_url || '').trim(),
        token: String(input.token || '').trim(),
        bulk_txt: String(input.bulk_txt || 'bulk_import.txt').trim() || 'bulk_import.txt',
        tv_library: asLibraryList(input.tv_library),
        movie_library: asLibraryList(input.movie_library),
        mediux_filters: filters.length
            ? filters
            : [...DEFAULT_POSTER_SETS_CONFIG.mediux_filters],
        reset_overlay: resetOverlay === undefined ? true : !!resetOverlay,
        dupePreference: asDupePreference(input.dupePreference ?? input.dupe_preference),
        watchersEnabled: watchersEnabled === undefined ? true : !!watchersEnabled,
        watchIntervalHours: Number.isFinite(intervalRaw)
            ? Math.max(1, Math.min(168, Math.round(intervalRaw)))
            : DEFAULT_POSTER_SETS_CONFIG.watchIntervalHours,
        autoWatchOnApply: autoWatchOnApply === undefined ? true : !!autoWatchOnApply,
        notifyOnWatcherDigest: notifyOnWatcherDigest === undefined ? true : !!notifyOnWatcherDigest,
        arrWatchHookEnabled: arrWatchHookEnabled === undefined ? true : !!arrWatchHookEnabled,
        creatorWhitelist: asCreatorWhitelist(input.creatorWhitelist ?? input.creator_whitelist),
        applyDestination: asApplyDestination(input.applyDestination ?? input.apply_destination),
        tpdb_username: String(input.tpdb_username || input.tpdb_login || '').trim(),
        tpdb_password: String(input.tpdb_password || '').trim(),
        tpdbLocalCacheEnabled: (input.tpdbLocalCacheEnabled ?? input.tpdb_local_cache_enabled) === undefined
            ? false
            : Boolean(input.tpdbLocalCacheEnabled ?? input.tpdb_local_cache_enabled),
        tpdbAggressivePrefetch: (input.tpdbAggressivePrefetch ?? input.tpdb_aggressive_prefetch) === undefined
            ? false
            : Boolean(input.tpdbAggressivePrefetch ?? input.tpdb_aggressive_prefetch),
        tpdbWarmParallelWorkers: (input.tpdbWarmParallelWorkers ?? input.tpdb_warm_parallel_workers) === undefined
            ? false
            : Boolean(input.tpdbWarmParallelWorkers ?? input.tpdb_warm_parallel_workers),
        tpdbUseLogin: (input.tpdbUseLogin ?? input.tpdb_use_login) === undefined
            ? true
            : Boolean(input.tpdbUseLogin ?? input.tpdb_use_login),
        tpdbCacheMaxBytes: (() => {
            const raw = Number(input.tpdbCacheMaxBytes ?? input.tpdb_cache_max_bytes);
            if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_POSTER_SETS_CONFIG.tpdbCacheMaxBytes;
            // 256 MB floor … 100 GB ceiling
            return Math.max(256 * 1024 * 1024, Math.min(100 * 1024 * 1024 * 1024, Math.round(raw)));
        })(),
    };
};

export const maskPosterSetsConfig = (config) => {
    const normalized = normalizePosterSetsConfig(config);
    const hasToken = Boolean(normalized.token);
    const hasTpdbPassword = Boolean(normalized.tpdb_password);
    return {
        ...normalized,
        token: hasToken ? '********' : '',
        tpdb_password: hasTpdbPassword ? '********' : '',
        hasToken,
        hasTpdbPassword,
        configured: Boolean(normalized.base_url && hasToken),
    };
};

export const ensurePosterSetsDir = async () => {
    await fs.mkdir(POSTER_SETS_DIR, { recursive: true });
};

export const loadPosterSetsConfig = async () => {
    await ensurePosterSetsDir();
    try {
        const raw = await fs.readFile(POSTER_SETS_CONFIG_PATH, 'utf8');
        return normalizePosterSetsConfig(JSON.parse(raw));
    } catch (error) {
        if (error?.code === 'ENOENT') return normalizePosterSetsConfig(DEFAULT_POSTER_SETS_CONFIG);
        throw error;
    }
};

export const savePosterSetsConfig = async (input = {}, { keepExistingToken = true } = {}) => {
    const existing = await loadPosterSetsConfig();
    const incoming = input && typeof input === 'object' ? input : {};
    let token = String(incoming.token || '').trim();
    if ((!token || token === '********') && keepExistingToken) {
        token = existing.token;
    }
    let tpdbPassword = String(incoming.tpdb_password || '').trim();
    if ((!tpdbPassword || tpdbPassword === '********') && keepExistingToken) {
        tpdbPassword = existing.tpdb_password;
    }
    if (tpdbPassword === '********') tpdbPassword = '';
    const next = normalizePosterSetsConfig({
        ...existing,
        ...incoming,
        token,
        tpdb_password: tpdbPassword,
    });
    await ensurePosterSetsDir();
    await fs.writeFile(POSTER_SETS_CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    return next;
};

export const resolveBulkFilePath = (config) => {
    const name = String(config?.bulk_txt || 'bulk_import.txt').trim() || 'bulk_import.txt';
    const safe = path.basename(name);
    return path.join(POSTER_SETS_DIR, safe);
};
