/**
 * Durable ThePosterDB title/set/image cache — a permanent local poster database for
 * library titles (until Clear or image disk-budget eviction). Open-title serves disk
 * first; live TPDB is only for cache miss or an optional quiet refresh for new sets.
 */
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { POSTER_SETS_DIR, ensurePosterSetsDir, loadPosterSetsConfig } from './config.js';
import { runPosterSetsCli } from './runner.js';
import { normalizeCreatorHandle, prioritizeSetsByFollowedCreators } from './searchMerge.js';

export const TPDB_TITLE_CACHE_DIR = path.join(POSTER_SETS_DIR, 'tpdb-title-cache');
export const TPDB_SET_CACHE_DIR = path.join(POSTER_SETS_DIR, 'tpdb-set-cache');
export const TPDB_IMAGE_CACHE_DIR = path.join(POSTER_SETS_DIR, 'tpdb-image-cache');
const TPDB_WARM_PROGRESS_PATH = path.join(POSTER_SETS_DIR, 'tpdb-warm-progress.json');

/**
 * Quiet background refresh for *new* sets — normally handled by the 3AM daily job.
 * Kept for explicit refresh paths; open-title does not age-out the local database.
 */
export const TPDB_REVALIDATE_MS = 24 * 60 * 60_000;
/** Reserved — cache entries are not expired by age. */
export const TPDB_SOFT_TTL_MS = Number.POSITIVE_INFINITY;
/** Default local hour for the first “new sets” refresh (overridden by config). */
export const TPDB_DAILY_REFRESH_HOUR = 3;
export const DEFAULT_TPDB_CACHE_MAX_BYTES = 2 * 1024 * 1024 * 1024;
/** One set HTML preview at a time — parallel HTML races TPDB's session/limiter. */
const HYDRATE_CONCURRENCY = 1;
/** CDN image downloads are safer to parallelize than HTML scrapes. */
const IMAGE_DOWNLOAD_CONCURRENCY = 6;
/**
 * ThePosterDB enforces spacing between HTML/API scrapes.
 * Image CDN fetches use a concurrency pool (no 7s HTML gate).
 */
export const TPDB_REQUEST_GAP_MS = 1_500;
/** @deprecated kept for status/docs; image pool no longer uses a fixed gap. */
export const TPDB_IMAGE_GAP_MS = 0;
/** Extra pause after finishing a hydrated set before the next set starts. */
const BETWEEN_SETS_GAP_MS = 1_500;
/** Titles per warm CLI process (one login, then serial resolves). */
const WARM_BATCH_SIZE = 50;
/** Max library titles accepted into a Warm queue pass. */
const WARM_QUEUE_MAX = 1000;
/** Parallel Warm CLI workers when settings toggle is on. */
const WARM_PARALLEL_WORKERS = 5;
const MAX_IMAGE_ITEM_BYTES = 8 * 1024 * 1024;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const nowMs = () => Date.now();

let lastTpdbRequestAt = 0;
let tpdbGate = Promise.resolve();
let rateLimitCooldownUntil = 0;
let imageInFlight = 0;
/** @type {Array<() => void>} */
const imageWaiters = [];

const acquireTpdbImageSlot = () => new Promise((resolve) => {
    if (imageInFlight < IMAGE_DOWNLOAD_CONCURRENCY) {
        imageInFlight += 1;
        resolve();
        return;
    }
    imageWaiters.push(resolve);
});

const releaseTpdbImageSlot = () => {
    const next = imageWaiters.shift();
    if (next) {
        next();
        return;
    }
    imageInFlight = Math.max(0, imageInFlight - 1);
};

const ACTIVITY_LOG_MAX = 100;
/** @type {Array<{ at: number, level: string, kind: string, message: string, detail?: string | null }>} */
const activityLog = [];
/** Short “what’s happening now” line for Settings. */
let hydrateCurrent = null;

/** @type {{ total: number, completed: number, skippedCached: number, failed: number, startedAt: number | null, finishedAt: number | null, sampleMs: number[] }} */
let warmProgress = {
    total: 0,
    completed: 0,
    skippedCached: 0,
    failed: 0,
    startedAt: null,
    finishedAt: null,
    sampleMs: [],
};
/** @type {{ total: number, completed: number, startedAt: number | null, finishedAt: number | null, sampleMs: number[] }} */
let hydrateProgress = {
    total: 0,
    completed: 0,
    startedAt: null,
    finishedAt: null,
    sampleMs: [],
};
let cacheWorkPaused = false;
/** When true, this warm session forces followed-creator sets to the front of Prefetch (not exclusive). */
let hydrateFollowedOnlySession = false;
let warmChunkStartedAt = 0;
let hydrateItemStartedAt = 0;

const resetWarmProgress = () => {
    warmProgress = {
        total: 0,
        completed: 0,
        skippedCached: 0,
        failed: 0,
        startedAt: null,
        finishedAt: null,
        sampleMs: [],
    };
};

const resetHydrateProgress = () => {
    hydrateProgress = {
        total: 0,
        completed: 0,
        startedAt: null,
        finishedAt: null,
        sampleMs: [],
    };
};

const pushSample = (samples, value, max = 40) => {
    if (!Number.isFinite(value) || value < 0) return;
    samples.push(value);
    while (samples.length > max) samples.shift();
};

const progressEtaMs = (progress) => {
    const remaining = Math.max(0, Number(progress.total || 0) - Number(progress.completed || 0));
    if (!remaining || !progress.sampleMs?.length) return null;
    const avg = progress.sampleMs.reduce((sum, ms) => sum + ms, 0) / progress.sampleMs.length;
    if (!Number.isFinite(avg) || avg <= 0) return null;
    return Math.round(avg * remaining);
};

const progressPercent = (progress) => {
    const total = Number(progress.total || 0);
    if (total <= 0) return null;
    return Math.min(100, Math.round((100 * Number(progress.completed || 0)) / total));
};

const summarizeProgress = (progress) => ({
    total: Number(progress.total || 0),
    completed: Number(progress.completed || 0),
    skippedCached: Number(progress.skippedCached || 0),
    failed: Number(progress.failed || 0),
    startedAt: progress.startedAt || null,
    finishedAt: progress.finishedAt || null,
    percent: progressPercent(progress),
    etaMs: progressEtaMs(progress),
    elapsedMs: progress.startedAt ? Math.max(0, nowMs() - progress.startedAt) : null,
});

const inferActivityKind = (message, level) => {
    const text = String(message || '').toLowerCase();
    if (level === 'error' || text.includes('error') || text.includes('failed')) return 'error';
    if (text.includes('followed') || text.includes('creators you follow')) return 'followed';
    if (
        text.includes('prefetch')
        || text.includes('hydrat')
        || text.includes('asset ')
        || text.includes('image cache')
        || text.includes('downloading image')
        || text.includes('cached image')
    ) return 'prefetch';
    return 'cache';
};

const shortUrl = (url, max = 72) => {
    const value = String(url || '').trim();
    if (!value) return '';
    if (value.length <= max) return value;
    return `${value.slice(0, max - 1)}…`;
};

/**
 * Ring-buffer activity for Settings UI (+ console). Safe to call from search routes.
 * @param {string} message
 * @param {{ level?: 'info'|'warn'|'error', kind?: string, detail?: string|null, current?: boolean|string }} [options]
 */
export const logTpdbCacheActivity = (message, options = {}) => {
    const level = options.level || 'info';
    const detail = options.detail != null ? String(options.detail) : null;
    const text = String(message || '').trim();
    if (!text) return;
    const kind = options.kind || inferActivityKind(text, level);
    const entry = { at: nowMs(), level, kind, message: text, detail };
    activityLog.push(entry);
    while (activityLog.length > ACTIVITY_LOG_MAX) activityLog.shift();
    if (options.current === true) hydrateCurrent = text;
    else if (typeof options.current === 'string') hydrateCurrent = options.current;
    else if (options.current === false) hydrateCurrent = null;
    const suffix = detail ? ` — ${detail}` : '';
    console.log(`[poster-sets/tpdb] ${text}${suffix}`);
};

/**
 * Global polite gate for ThePosterDB HTML hydrate scrapes.
 * Enforces spacing and any cooldown after HTTP 429.
 */
export const waitForTpdbRequestSlot = async () => {
    const run = tpdbGate.then(async () => {
        let announcedWait = false;
        for (;;) {
            const now = nowMs();
            if (rateLimitCooldownUntil > now) {
                const waitMs = rateLimitCooldownUntil - now;
                if (!announcedWait && waitMs > 400) {
                    announcedWait = true;
                    logTpdbCacheActivity(
                        `Waiting ${Math.ceil(waitMs / 1000)}s (TPDB 429 cooldown)…`,
                        { level: 'warn', current: true },
                    );
                }
                await sleep(waitMs);
                continue;
            }
            const sinceLast = now - lastTpdbRequestAt;
            if (lastTpdbRequestAt && sinceLast < TPDB_REQUEST_GAP_MS) {
                const waitMs = TPDB_REQUEST_GAP_MS - sinceLast;
                if (!announcedWait && waitMs > 400) {
                    announcedWait = true;
                    logTpdbCacheActivity(
                        `Waiting ${Math.ceil(waitMs / 1000)}s for ThePosterDB HTML spacing…`,
                        { current: true },
                    );
                }
                await sleep(waitMs);
                continue;
            }
            lastTpdbRequestAt = nowMs();
            return;
        }
    });
    tpdbGate = run.catch(() => {});
    await run;
};

/** @deprecated use waitForTpdbRequestSlot */
export const waitForTpdbAssetSlot = waitForTpdbRequestSlot;

/** Wait out a 429 cooldown before starting another CDN image download. */
export const waitForTpdbImageSlot = async () => {
    while (rateLimitCooldownUntil > nowMs()) {
        await sleep(rateLimitCooldownUntil - nowMs());
    }
};

const noteTpdbRateLimit = (retryAfterHeader = null) => {
    const retryAfterSec = Number(retryAfterHeader);
    // At least one full 7s gap; prefer Retry-After when TPDB sends it.
    const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? Math.min(180_000, Math.max(TPDB_REQUEST_GAP_MS, retryAfterSec * 1000))
        : Math.max(TPDB_REQUEST_GAP_MS * 2, 15_000);
    rateLimitCooldownUntil = Math.max(rateLimitCooldownUntil, nowMs() + waitMs);
    logTpdbCacheActivity(
        `ThePosterDB rate limited (429); cooling down ${Math.round(waitMs / 1000)}s`,
        { level: 'warn', current: true },
    );
};

const safeKeyPart = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .slice(0, 120);

export const tpdbImageCacheKey = (url) => crypto.createHash('sha1').update(String(url || '')).digest('hex');

export const buildTpdbTitleCacheKey = ({
    tmdbId = null,
    mediaType = 'movie',
    titleUrl = '',
    titleHint = '',
    yearHint = null,
} = {}) => {
    const tmdb = String(tmdbId || '').trim();
    const media = String(mediaType || 'movie').toLowerCase() === 'show' ? 'show' : 'movie';
    if (tmdb) return `tmdb_${media}_${safeKeyPart(tmdb)}`;

    const url = String(titleUrl || '').trim();
    const postersMatch = url.match(/theposterdb\.com\/posters\/(\d+)/i);
    if (postersMatch) return `url_posters_${postersMatch[1]}`;

    const hint = String(titleHint || '').trim();
    if (hint) {
        const year = yearHint != null && Number.isFinite(Number(yearHint)) ? String(Number(yearHint)) : 'x';
        return `hint_${media}_${safeKeyPart(hint)}_${year}`;
    }
    return null;
};

/** Library-scoped = TMDB pin (library open) or warm job — never Browse/creator crawls. */
export const isLibraryScopedTpdbSearch = ({ tmdbId = null, libraryScoped = false } = {}) => (
    Boolean(libraryScoped) || Boolean(String(tmdbId || '').trim())
);

const ensureDirs = async () => {
    await ensurePosterSetsDir();
    await Promise.all([
        fs.mkdir(TPDB_TITLE_CACHE_DIR, { recursive: true }),
        fs.mkdir(TPDB_SET_CACHE_DIR, { recursive: true }),
        fs.mkdir(TPDB_IMAGE_CACHE_DIR, { recursive: true }),
    ]);
};

const readJsonFile = async (filePath) => {
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

const writeJsonFile = async (filePath, data) => {
    await ensureDirs();
    await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

const titleCachePath = (key) => path.join(TPDB_TITLE_CACHE_DIR, `${safeKeyPart(key)}.json`);
const setCachePath = (setId) => path.join(TPDB_SET_CACHE_DIR, `${safeKeyPart(setId)}.json`);

export const loadTpdbTitleCache = async (key) => {
    if (!key) return null;
    const entry = await readJsonFile(titleCachePath(key));
    if (!entry || !Array.isArray(entry.sets) || !entry.sets.length) return null;
    return entry;
};

export const saveTpdbTitleCache = async (key, payload = {}) => {
    if (!key) return null;
    const sets = Array.isArray(payload.sets) ? payload.sets : [];
    if (!sets.length) return null;
    logTpdbCacheActivity(
        `Saved title cache “${payload.title || key}” (${sets.length} sets)`,
        { detail: key, current: `Cached title · ${payload.title || key}` },
    );
    const entry = {
        key,
        savedAt: payload.savedAt || new Date().toISOString(),
        lastRevalidatedAt: payload.lastRevalidatedAt || new Date().toISOString(),
        titleUrl: payload.titleUrl || null,
        title: payload.title || null,
        tmdbId: payload.tmdbId != null ? String(payload.tmdbId) : null,
        mediaType: payload.mediaType || null,
        sets,
        libraryScoped: true,
    };
    await writeJsonFile(titleCachePath(key), entry);
    return entry;
};

export const touchTpdbTitleRevalidated = async (key) => {
    const entry = await loadTpdbTitleCache(key);
    if (!entry) return null;
    entry.lastRevalidatedAt = new Date().toISOString();
    await writeJsonFile(titleCachePath(key), entry);
    return entry;
};

export const titleCacheNeedsRevalidate = (entry) => {
    // Age gate for optional quiet refresh only — never means "cache is invalid".
    if (!entry) return true;
    const last = Date.parse(entry.lastRevalidatedAt || entry.savedAt || '') || 0;
    return !last || (nowMs() - last) >= TPDB_REVALIDATE_MS;
};

export const loadTpdbSetCache = async (setIdOrUrl) => {
    const setId = extractTpdbSetId(setIdOrUrl);
    if (!setId) return null;
    const entry = await readJsonFile(setCachePath(setId));
    if (!entry || !Array.isArray(entry.assets) || !entry.assets.length) return null;
    return entry;
};

export const saveTpdbSetCache = async (payload = {}) => {
    const setId = extractTpdbSetId(payload.setId || payload.url || payload.setMeta?.setId);
    if (!setId) return null;
    const assets = Array.isArray(payload.assets) ? payload.assets : [];
    if (!assets.length) return null;
    const entry = {
        setId: String(setId),
        url: payload.url || payload.setMeta?.url || null,
        savedAt: new Date().toISOString(),
        setMeta: payload.setMeta || null,
        assets,
        matched: payload.matched ?? null,
        unmatched: payload.unmatched ?? null,
        total: payload.total ?? assets.length,
        title: payload.title || payload.setMeta?.title || null,
    };
    await writeJsonFile(setCachePath(setId), entry);
    return entry;
};

export const extractTpdbSetId = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (/^\d+$/.test(raw)) return raw;
    const setMatch = raw.match(/theposterdb\.com\/set\/(\d+)/i);
    if (setMatch) return setMatch[1];
    const posterMatch = raw.match(/theposterdb\.com\/poster\/(\d+)/i);
    if (posterMatch) return posterMatch[1];
    return safeKeyPart(raw).slice(0, 64) || null;
};

export const isTpdbUrl = (url) => /theposterdb\.com/i.test(String(url || ''));

export const loadTpdbCachedImage = async (url) => {
    const key = tpdbImageCacheKey(url);
    const binPath = path.join(TPDB_IMAGE_CACHE_DIR, `${key}.bin`);
    const metaPath = path.join(TPDB_IMAGE_CACHE_DIR, `${key}.json`);
    try {
        const [buf, metaRaw] = await Promise.all([
            fs.readFile(binPath),
            fs.readFile(metaPath, 'utf8'),
        ]);
        const meta = JSON.parse(metaRaw);
        if (!buf.length) return null;
        // Touch access time for LRU (best-effort).
        try {
            await fs.writeFile(metaPath, `${JSON.stringify({
                ...meta,
                at: meta.at || new Date().toISOString(),
                accessedAt: new Date().toISOString(),
                bytes: meta.bytes || buf.length,
            }, null, 2)}\n`, 'utf8');
        } catch { /* ignore */ }
        return {
            buf,
            contentType: String(meta?.contentType || 'image/jpeg'),
            path: binPath,
            key,
        };
    } catch {
        return null;
    }
};

export const storeTpdbCachedImage = async (url, buf, contentType) => {
    if (!buf?.length || buf.length > MAX_IMAGE_ITEM_BYTES) return null;
    await ensureDirs();
    const key = tpdbImageCacheKey(url);
    const binPath = path.join(TPDB_IMAGE_CACHE_DIR, `${key}.bin`);
    const metaPath = path.join(TPDB_IMAGE_CACHE_DIR, `${key}.json`);
    await Promise.all([
        fs.writeFile(binPath, buf),
        fs.writeFile(metaPath, `${JSON.stringify({
            contentType: contentType || 'image/jpeg',
            url: String(url || ''),
            at: new Date().toISOString(),
            accessedAt: new Date().toISOString(),
            bytes: buf.length,
        }, null, 2)}\n`, 'utf8'),
    ]);
    return { key, path: binPath };
};

export const resolveTpdbImageLocalPath = async (url) => {
    const cached = await loadTpdbCachedImage(url);
    return cached?.path || null;
};

const listImageMetaEntries = async () => {
    await ensureDirs();
    let names = [];
    try {
        names = await fs.readdir(TPDB_IMAGE_CACHE_DIR);
    } catch {
        return [];
    }
    const metas = [];
    for (const name of names) {
        if (!name.endsWith('.json')) continue;
        const key = name.slice(0, -5);
        const meta = await readJsonFile(path.join(TPDB_IMAGE_CACHE_DIR, name));
        if (!meta) continue;
        const at = Date.parse(meta.accessedAt || meta.at || '') || 0;
        const bytes = Number(meta.bytes) || 0;
        metas.push({ key, at, bytes });
    }
    return metas;
};

export const getTpdbImageCacheStats = async () => {
    const metas = await listImageMetaEntries();
    const bytes = metas.reduce((sum, item) => sum + (item.bytes || 0), 0);
    return { entries: metas.length, bytes };
};

export const evictTpdbImageCacheIfNeeded = async (maxBytes = DEFAULT_TPDB_CACHE_MAX_BYTES) => {
    const limit = Number.isFinite(Number(maxBytes)) && Number(maxBytes) > 0
        ? Number(maxBytes)
        : DEFAULT_TPDB_CACHE_MAX_BYTES;
    let metas = await listImageMetaEntries();
    let total = metas.reduce((sum, item) => sum + (item.bytes || 0), 0);
    if (total <= limit) return { evicted: 0, bytes: total };

    metas.sort((a, b) => a.at - b.at);
    let evicted = 0;
    for (const item of metas) {
        if (total <= limit) break;
        try {
            await Promise.all([
                fs.unlink(path.join(TPDB_IMAGE_CACHE_DIR, `${item.key}.bin`)).catch(() => {}),
                fs.unlink(path.join(TPDB_IMAGE_CACHE_DIR, `${item.key}.json`)).catch(() => {}),
            ]);
            total -= item.bytes || 0;
            evicted += 1;
        } catch {
            /* ignore */
        }
    }
    return { evicted, bytes: Math.max(0, total) };
};

const removeDirContents = async (dir) => {
    let names = [];
    try {
        names = await fs.readdir(dir);
    } catch (error) {
        if (error?.code === 'ENOENT') return 0;
        throw error;
    }
    let removed = 0;
    for (const name of names) {
        try {
            await fs.unlink(path.join(dir, name));
            removed += 1;
        } catch {
            /* ignore */
        }
    }
    return removed;
};

export const clearTpdbLocalCache = async () => {
    await ensureDirs();
    logTpdbCacheActivity('Clearing TPDB local cache (titles, sets, images)…', { current: true });
    warmTitleQueue.length = 0;
    warmTitleActive = 0;
    hydrateQueue.length = 0;
    hydrateQueued.clear();
    hydrateActive = 0;
    cacheWorkPaused = false;
    hydrateFollowedOnlySession = false;
    resetWarmProgress();
    resetHydrateProgress();
    const [titles, sets, images] = await Promise.all([
        removeDirContents(TPDB_TITLE_CACHE_DIR),
        removeDirContents(TPDB_SET_CACHE_DIR),
        removeDirContents(TPDB_IMAGE_CACHE_DIR),
    ]);
    try {
        await fs.unlink(TPDB_WARM_PROGRESS_PATH);
    } catch {
        /* ignore */
    }
    hydrateCurrent = null;
    logTpdbCacheActivity(
        `Cleared cache — ${titles} titles, ${sets} sets, ${images} images`,
        { current: false },
    );
    return { titles, sets, images };
};

export const pauseTpdbCacheWork = () => {
    cacheWorkPaused = true;
    logTpdbCacheActivity('Cache paused — finish current title/set, then wait', {
        kind: 'cache',
        current: 'Paused',
    });
    return { paused: true };
};

export const resumeTpdbCacheWork = () => {
    cacheWorkPaused = false;
    logTpdbCacheActivity('Cache resumed', { kind: 'cache', current: true });
    void pumpWarmTitleQueue();
    void pumpHydrateQueue();
    return { paused: false };
};

export const stopTpdbCacheWork = async () => {
    const droppedTitles = warmTitleQueue.length;
    const droppedSets = hydrateQueue.length;
    warmTitleQueue.length = 0;
    hydrateQueue.length = 0;
    hydrateQueued.clear();
    cacheWorkPaused = false;
    hydrateFollowedOnlySession = false;
    warmProgress.finishedAt = nowMs();
    hydrateProgress.finishedAt = nowMs();
    await persistWarmQueueSnapshot({
        pending: [],
        pendingCount: 0,
        active: false,
        activeItem: null,
        stoppedAt: new Date().toISOString(),
    });
    hydrateCurrent = null;
    logTpdbCacheActivity(
        `Cache stopped — dropped ${droppedTitles} title(s) and ${droppedSets} set(s) from the queue`,
        { kind: 'cache', current: false },
    );
    return { stopped: true, droppedTitles, droppedSets };
};

/**
 * Fast per-title coverage for library badges.
 * levels: none | title | sets | images
 */
export const resolveTpdbTitleCoverage = async (items = []) => {
    const list = Array.isArray(items) ? items.slice(0, 240) : [];
    /** @type {Record<string, { level: string, setCount: number }>} */
    const coverage = {};

    const resolveOne = async (item) => {
        const tmdbId = String(item?.tmdbId || item?.id || '').trim();
        if (!/^\d+$/.test(tmdbId)) return;
        const mediaType = String(item?.mediaType || 'movie').toLowerCase() === 'show' ? 'show' : 'movie';
        const covKey = `${mediaType}:${tmdbId}`;
        const titleKey = buildTpdbTitleCacheKey({
            tmdbId,
            mediaType,
            titleHint: item?.title,
            yearHint: item?.year,
        });
        const title = titleKey ? await loadTpdbTitleCache(titleKey) : null;
        if (!title?.sets?.length) {
            coverage[covKey] = { level: 'none', setCount: 0 };
            return;
        }
        let hasSet = false;
        let hasImage = false;
        for (const set of title.sets.slice(0, 4)) {
            const setId = extractTpdbSetId(set?.setId || set?.url);
            if (!setId) continue;
            try {
                await fs.access(setCachePath(setId));
                hasSet = true;
            } catch {
                continue;
            }
            const setEntry = await loadTpdbSetCache(setId);
            const assetUrl = String(
                setEntry?.assets?.[0]?.url
                || setEntry?.assets?.[0]?.thumbUrl
                || set?.thumbUrl
                || set?.url
                || '',
            ).trim();
            if (assetUrl) {
                const cachedImage = await loadTpdbCachedImage(assetUrl);
                if (cachedImage?.buf?.length) {
                    hasImage = true;
                    break;
                }
            }
        }
        coverage[covKey] = {
            level: hasImage ? 'images' : hasSet ? 'sets' : 'title',
            setCount: title.sets.length,
        };
    };

    const concurrency = 16;
    for (let i = 0; i < list.length; i += concurrency) {
        await Promise.all(list.slice(i, i + concurrency).map((item) => resolveOne(item)));
    }
    return coverage;
};

export const getTpdbCacheStatus = async () => {
    await ensureDirs();
    const config = await loadPosterSetsConfig();
    const countJson = async (dir) => {
        try {
            const names = await fs.readdir(dir);
            return names.filter((name) => name.endsWith('.json')).length;
        } catch {
            return 0;
        }
    };
    const imageStats = await getTpdbImageCacheStats();
    const relativeRoot = path.relative(process.cwd(), POSTER_SETS_DIR) || 'config/poster-sets';
    const warmBusy = warmTitleActive > 0 || warmTitleQueue.length > 0;
    const hydrateBusy = hydrateActive > 0 || hydrateQueue.length > 0;
    return {
        cacheEnabled: config.tpdbLocalCacheEnabled === true,
        prefetchEnabled: config.tpdbAggressivePrefetch === true,
        prioritizeFollowedCreators: config.tpdbPrioritizeFollowedCreators !== false,
        paused: cacheWorkPaused,
        followedPrefetchOnly: hydrateFollowedOnlySession,
        titles: await countJson(TPDB_TITLE_CACHE_DIR),
        sets: await countJson(TPDB_SET_CACHE_DIR),
        images: imageStats.entries,
        imageBytes: imageStats.bytes,
        rootDir: POSTER_SETS_DIR,
        relativeRoot: relativeRoot.replace(/\\/g, '/'),
        folders: {
            titles: 'tpdb-title-cache/',
            sets: 'tpdb-set-cache/',
            images: 'tpdb-image-cache/',
        },
        current: hydrateCurrent,
        activity: activityLog.slice(-60).reverse(),
        progress: {
            warm: summarizeProgress(warmProgress),
            hydrate: summarizeProgress(hydrateProgress),
            busy: warmBusy || hydrateBusy || cacheWorkPaused,
        },
        hydrate: {
            queue: hydrateQueue.length,
            active: hydrateActive,
            lastError: hydrateLastError,
            rateLimit: {
                gapMs: TPDB_REQUEST_GAP_MS,
                msSinceLastRequest: lastTpdbRequestAt ? Math.max(0, nowMs() - lastTpdbRequestAt) : null,
                cooldownMs: Math.max(0, rateLimitCooldownUntil - nowMs()),
            },
            warmQueue: warmTitleQueue.length,
            warmActive: warmTitleActive,
        },
        dailyRefresh: getTpdbDailyRefreshStatus(),
    };
};

/** @type {Array<{ setUrl: string, setId?: string, titleKey?: string }>} */
const hydrateQueue = [];
const hydrateQueued = new Set();
let hydrateActive = 0;
let hydrateLastError = null;

/** Serial library warm (title resolves) — one at a time with spacing. */
/** @type {Array<object>} */
const warmTitleQueue = [];
let warmTitleActive = 0;
const BETWEEN_WARM_TITLES_MS = 2_000;
/** @type {null | ((item: object) => Promise<object>)} */
let warmFetchTitleSetsFn = null;
/** @type {null | ((items: object[], options?: object) => Promise<object[]>)} */
let warmBatchRunnerFn = null;
/**
 * Dedicated new-sets refresh worker (isolated TPDB session).
 * Only rechecks titles already on disk — independent of library warm/build.
 */
/** @type {null | ((item: object) => Promise<object>)} */
let refreshFetchTitleSetsFn = null;
const BETWEEN_REFRESH_TITLES_MS = 2_500;

export const setTpdbWarmFetchTitleSets = (fn) => {
    warmFetchTitleSetsFn = typeof fn === 'function' ? fn : null;
};

/** Prefer batch warm (one Python process / one login) over per-title CLI spawns. */
export const setTpdbWarmBatchRunner = (fn) => {
    warmBatchRunnerFn = typeof fn === 'function' ? fn : null;
};

export const setTpdbRefreshFetchTitleSets = (fn) => {
    refreshFetchTitleSetsFn = typeof fn === 'function' ? fn : null;
};

const loadWarmProgress = async () => {
    const data = await readJsonFile(TPDB_WARM_PROGRESS_PATH);
    if (!data || typeof data !== 'object') return null;
    return data;
};

const saveWarmProgress = async (patch = {}) => {
    await ensureDirs();
    const prev = (await loadWarmProgress()) || {};
    const next = {
        ...prev,
        ...patch,
        updatedAt: new Date().toISOString(),
    };
    await writeJsonFile(TPDB_WARM_PROGRESS_PATH, next);
    return next;
};

const persistWarmQueueSnapshot = async (extra = {}) => {
    let pending = warmTitleQueue.map((entry) => entry.item).filter(Boolean);
    // Keep the in-flight title in the snapshot so a restart retries it instead of skipping it.
    const activeItem = Object.prototype.hasOwnProperty.call(extra, 'activeItem')
        ? (extra.activeItem || null)
        : null;
    if (activeItem) {
        pending = [activeItem, ...pending];
    }
    const { activeItem: _activeItem, pending: _pending, ...rest } = extra;
    await saveWarmProgress({
        pending,
        pendingCount: pending.length,
        active: Boolean(warmTitleActive || rest.active),
        activeItem,
        ...rest,
    });
};

/** @type {(url: string, buf: Buffer, contentType: string) => Promise<unknown>} */
let storeImageFn = storeTpdbCachedImage;

export const setTpdbCacheImageStore = (fn) => {
    if (typeof fn === 'function') storeImageFn = fn;
};

const downloadImageToCache = async (url) => {
    const target = String(url || '').trim();
    if (!target || !isTpdbUrl(target)) return false;
    const existing = await loadTpdbCachedImage(target);
    if (existing) return 'cached';

    logTpdbCacheActivity(`Downloading image ${shortUrl(target)}`, {
        current: `Downloading image · ${shortUrl(target, 48)}`,
    });
    const referer = 'https://theposterdb.com/';
    let response = null;
    await acquireTpdbImageSlot();
    try {
        for (let attempt = 0; attempt < 4; attempt += 1) {
            await waitForTpdbImageSlot();
            try {
                response = await fetch(target, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                        Accept: 'image/jpeg,image/png,image/webp;q=0.9,image/*;q=0.8,*/*;q=0.7',
                        Referer: referer,
                    },
                    redirect: 'follow',
                    signal: AbortSignal.timeout(30_000),
                });
                if (response.ok) break;
                if (response.status === 429) {
                    noteTpdbRateLimit(response.headers.get('retry-after'));
                    hydrateLastError = `ThePosterDB rate limited (429); cooling down ${Math.round(Math.max(0, rateLimitCooldownUntil - nowMs()) / 1000)}s`;
                    continue;
                }
                if (response.status >= 500) {
                    await sleep(800 + attempt * 600);
                    continue;
                }
                break;
            } catch {
                response = null;
                await sleep(800 + attempt * 600);
            }
        }
        if (!response?.ok) {
            logTpdbCacheActivity(`Image download failed ${shortUrl(target)}`, {
                level: 'warn',
                detail: response ? `HTTP ${response.status}` : 'network error',
            });
            return false;
        }
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        if (!String(contentType).toLowerCase().startsWith('image/')) return false;
        const buf = Buffer.from(await response.arrayBuffer());
        if (!buf.length || buf.length > MAX_IMAGE_ITEM_BYTES) return false;
        await storeImageFn(target, buf, contentType);
        logTpdbCacheActivity(`Cached image (${Math.round(buf.length / 1024)} KB)`, {
            detail: shortUrl(target),
        });
        return true;
    } finally {
        releaseTpdbImageSlot();
    }
};

/**
 * Ensure TPDB asset URLs are on disk before apply.
 * Title/set metadata cache can be hot while image bins are still cold — apply needs bytes.
 */
export const ensureTpdbImagesCached = async (urls = [], { onProgress = null } = {}) => {
    const unique = [];
    const seen = new Set();
    for (const raw of urls || []) {
        const url = String(raw || '').trim();
        if (!url || !isTpdbUrl(url) || seen.has(url)) continue;
        seen.add(url);
        unique.push(url);
    }
    if (!unique.length) {
        return { total: 0, cached: 0, downloaded: 0, failed: 0, failedUrls: [] };
    }

    let cached = 0;
    let downloaded = 0;
    const failedUrls = [];
    const report = (message) => {
        if (typeof onProgress === 'function') onProgress(message);
    };

    report(`Ensuring ${unique.length} ThePosterDB image(s) are cached for apply…`);
    for (let i = 0; i < unique.length; i += IMAGE_DOWNLOAD_CONCURRENCY) {
        const chunk = unique.slice(i, i + IMAGE_DOWNLOAD_CONCURRENCY);
        const results = await Promise.all(chunk.map(async (url) => {
            const result = await downloadImageToCache(url);
            return { url, result };
        }));
        for (const item of results) {
            if (item.result === 'cached') cached += 1;
            else if (item.result === true) downloaded += 1;
            else failedUrls.push(item.url);
        }
        if (unique.length > 1) {
            report(
                `Image cache ${Math.min(i + chunk.length, unique.length)}/${unique.length}`
                + ` (cached ${cached}, downloaded ${downloaded}`
                + `${failedUrls.length ? `, failed ${failedUrls.length}` : ''})`,
            );
        }
    }

    if (failedUrls.length) {
        report(`Warning: ${failedUrls.length}/${unique.length} ThePosterDB image(s) could not be cached before apply.`);
    } else if (downloaded) {
        report(`Cached ${downloaded} fresh ThePosterDB image(s) for apply (${cached} already local).`);
    } else {
        report(`All ${cached} ThePosterDB image(s) already local — applying from cache.`);
    }

    return {
        total: unique.length,
        cached,
        downloaded,
        failed: failedUrls.length,
        failedUrls,
    };
};

const hydrateOneSet = async (item) => {
    const setUrl = String(item?.setUrl || '').trim();
    if (!setUrl || !isTpdbUrl(setUrl)) return;

    const config = await loadPosterSetsConfig();
    if (config.tpdbLocalCacheEnabled !== true) return;

    const label = item.setId ? `set ${item.setId}` : shortUrl(setUrl, 56);
    const creatorLabel = item.user ? `@${String(item.user).replace(/^@+/, '')}` : null;
    logTpdbCacheActivity(`Hydrating ${label}${creatorLabel ? ` · ${creatorLabel}` : ''}${item.preferred ? ' (followed)' : ''}`, {
        detail: setUrl,
        current: `Hydrating · ${label}${creatorLabel ? ` · ${creatorLabel}` : ''}`,
    });

    const maxBytes = Number(config.tpdbCacheMaxBytes) || DEFAULT_TPDB_CACHE_MAX_BYTES;
    const stats = await getTpdbImageCacheStats();
    if (stats.bytes >= maxBytes) {
        await evictTpdbImageCacheIfNeeded(maxBytes);
        const again = await getTpdbImageCacheStats();
        if (again.bytes >= maxBytes) {
            logTpdbCacheActivity('Disk budget full — skipping further image hydrate', {
                level: 'warn',
                current: false,
            });
            return;
        }
    }

    // Honor any outstanding 429 cooldown before scraping HTML/API again.
    if (rateLimitCooldownUntil > nowMs()) {
        const waitMs = rateLimitCooldownUntil - nowMs();
        logTpdbCacheActivity(`Waiting ${Math.ceil(waitMs / 1000)}s (429 cooldown) before set scrape…`, {
            level: 'warn',
            current: true,
        });
        await sleep(waitMs);
    }

    const existing = await loadTpdbSetCache(item.setId || setUrl);
    let assets = existing?.assets || [];
    let setMeta = existing?.setMeta || null;

    if (!assets.length) {
        logTpdbCacheActivity(`Scraping set HTML/preview ${label}`, {
            detail: setUrl,
            current: `Scraping set · ${label}`,
        });
        await waitForTpdbRequestSlot();
        const run = await runPosterSetsCli('preview', {
            config,
            url: setUrl,
        }, { timeoutMs: 180_000 });
        if (run.ok && Array.isArray(run.result?.assets) && run.result.assets.length) {
            assets = run.result.assets;
            setMeta = run.result.setMeta || setMeta;
            await saveTpdbSetCache({
                url: setUrl,
                setId: setMeta?.setId || item.setId,
                setMeta,
                assets,
                matched: run.result.matched,
                unmatched: run.result.unmatched,
                total: run.result.total,
                title: run.result.title || setMeta?.title,
            });
            logTpdbCacheActivity(
                `Set scrape OK — ${assets.length} asset(s)${run.result.title ? ` · ${run.result.title}` : ''}`,
                { detail: shortUrl(setUrl) },
            );
        } else {
            logTpdbCacheActivity(`Set scrape failed or empty for ${label}`, {
                level: 'warn',
                detail: run.error || shortUrl(setUrl),
            });
        }
        // Preview scrape counts as a TPDB request — wait a full gap before assets.
        await waitForTpdbRequestSlot();
    } else {
        logTpdbCacheActivity(`Using cached set metadata (${assets.length} assets) for ${label}`);
    }

    let downloaded = 0;
    let alreadyCached = 0;
    const imageUrls = [];
    for (const asset of assets) {
        const imageUrl = String(asset?.url || asset?.thumbUrl || '').trim();
        if (imageUrl) imageUrls.push(imageUrl);
    }
    if (item.thumbUrl) {
        const thumb = String(item.thumbUrl).trim();
        if (thumb) imageUrls.push(thumb);
    }

    let cursor = 0;
    const workers = Array.from(
        { length: Math.min(IMAGE_DOWNLOAD_CONCURRENCY, Math.max(1, imageUrls.length)) },
        async () => {
            for (;;) {
                const index = cursor;
                cursor += 1;
                if (index >= imageUrls.length) return;
                const imageUrl = imageUrls[index];
                logTpdbCacheActivity(
                    `Asset ${index + 1}/${imageUrls.length} for ${label}`,
                    { current: `Asset ${index + 1}/${imageUrls.length} · ${label}` },
                );
                const result = await downloadImageToCache(imageUrl);
                if (result === true) downloaded += 1;
                else if (result === 'cached') alreadyCached += 1;
                const after = await getTpdbImageCacheStats();
                if (after.bytes >= maxBytes) {
                    await evictTpdbImageCacheIfNeeded(maxBytes);
                    cursor = imageUrls.length;
                }
            }
        },
    );
    await Promise.all(workers);

    logTpdbCacheActivity(
        `Finished ${label} — downloaded ${downloaded}, already cached ${alreadyCached}`,
        { current: hydrateQueue.length ? `Queued sets remaining: ${hydrateQueue.length}` : false },
    );

    await sleep(BETWEEN_SETS_GAP_MS);
};

const pumpHydrateQueue = async () => {
    if (hydrateActive >= HYDRATE_CONCURRENCY) return;
    if (cacheWorkPaused) {
        if (hydrateCurrent == null || hydrateCurrent === 'Paused') {
            hydrateCurrent = 'Paused';
        }
        return;
    }
    const next = hydrateQueue.shift();
    if (!next) {
        if (hydrateActive === 0 && warmTitleActive === 0) {
            if (!cacheWorkPaused) hydrateCurrent = null;
            if (hydrateProgress.total > 0 && hydrateProgress.completed >= hydrateProgress.total) {
                hydrateProgress.finishedAt = nowMs();
            }
        }
        return;
    }
    hydrateActive += 1;
    const queueKey = next.queueKey;
    hydrateItemStartedAt = nowMs();
    try {
        await hydrateOneSet(next);
        hydrateProgress.completed += 1;
        pushSample(hydrateProgress.sampleMs, nowMs() - hydrateItemStartedAt);
    } catch (error) {
        hydrateProgress.completed += 1;
        hydrateLastError = error?.message || String(error);
        logTpdbCacheActivity(`Hydrate error: ${hydrateLastError}`, {
            level: 'error',
            kind: 'error',
            current: false,
        });
    } finally {
        hydrateActive -= 1;
        if (queueKey) hydrateQueued.delete(queueKey);
        void pumpHydrateQueue();
    }
};

/**
 * After a library title's set list is known, aggressively hydrate set previews + images.
 * Only call for library-scoped titles (TMDB / warm).
 */
export const enqueueTpdbLibraryTitleHydrate = async (sets = [], options = {}) => {
    const config = await loadPosterSetsConfig();
    if (config.tpdbLocalCacheEnabled !== true) return { queued: 0 };
    if (config.tpdbAggressivePrefetch !== true && !options.force) return { queued: 0 };
    if (!options.libraryScoped && !options.tmdbId) return { queued: 0 };

    const whitelist = Array.isArray(config.creatorWhitelist) ? config.creatorWhitelist : [];
    // Build-scope "followed first" forces prioritize for this warm even if the saved setting is off.
    const forcePrioritizeSession = options.followedOnly === true || hydrateFollowedOnlySession === true;
    const prioritizeFollowed = (
        (config.tpdbPrioritizeFollowedCreators !== false || forcePrioritizeSession)
        && whitelist.length > 0
    );
    let list = Array.isArray(sets) ? [...sets] : [];
    if (prioritizeFollowed) {
        list = prioritizeSetsByFollowedCreators(list, whitelist);
    }

    const followedKeys = new Set(
        whitelist.map((name) => normalizeCreatorHandle(name)).filter(Boolean),
    );
    const preferredItems = [];
    const otherItems = [];
    let queued = 0;
    let preferredQueued = 0;

    for (const set of list) {
        const provider = String(set?.provider || '').toLowerCase();
        if (provider && provider !== 'posterdb') continue;
        const setUrl = String(set?.url || '').trim();
        if (!setUrl || !isTpdbUrl(setUrl)) continue;
        const setId = extractTpdbSetId(set.setId || setUrl);
        const queueKey = setId || setUrl;
        if (hydrateQueued.has(queueKey)) continue;
        const user = String(set?.user || '').trim().replace(/^@+/, '') || null;
        const preferred = prioritizeFollowed && user
            ? followedKeys.has(normalizeCreatorHandle(user))
            : false;
        hydrateQueued.add(queueKey);
        const item = {
            queueKey,
            setUrl,
            setId,
            thumbUrl: set.thumbUrl || '',
            titleKey: options.titleKey || null,
            user,
            preferred,
        };
        if (item.preferred) {
            preferredItems.push(item);
            preferredQueued += 1;
        } else {
            otherItems.push(item);
        }
        queued += 1;
    }

    if (preferredItems.length) {
        for (let i = preferredItems.length - 1; i >= 0; i -= 1) {
            hydrateQueue.unshift(preferredItems[i]);
        }
    }
    if (otherItems.length) {
        hydrateQueue.push(...otherItems);
    }

    if (queued > 0) {
        if (!hydrateProgress.startedAt || hydrateProgress.finishedAt) {
            if (hydrateProgress.finishedAt || hydrateActive === 0 && hydrateQueue.length === queued) {
                // Keep cumulative totals across a warm run unless fully finished.
                if (hydrateProgress.finishedAt) resetHydrateProgress();
            }
            if (!hydrateProgress.startedAt) hydrateProgress.startedAt = nowMs();
            hydrateProgress.finishedAt = null;
        }
        hydrateProgress.total += queued;
        logTpdbCacheActivity(
            preferredQueued > 0
                ? `Queued ${queued} set(s) for prefetch (${preferredQueued} from Creators you follow first)`
                : `Queued ${queued} set(s) for image/prefetch hydrate`,
            {
                kind: preferredQueued ? 'followed' : 'prefetch',
                detail: options.tmdbId ? `tmdb ${options.tmdbId}` : options.titleKey || null,
                current: `Prefetch queue · ${hydrateQueue.length} set(s)`,
            },
        );
    }
    void pumpHydrateQueue();
    return { queued, preferredQueued };
};

/**
 * Queue library titles for TPDB resolve (metadata-only Warm).
 * Already-cached titles are skipped so Warm resumes after restart instead of redoing work.
 * `fetchTitleSets(item)` should return `{ sets, title, titleUrl? }` for that library row.
 */
export const enqueueTpdbLibraryWarm = async (items = [], fetchTitleSets, options = {}) => {
    if (typeof fetchTitleSets !== 'function') return { queued: 0, skippedCached: 0 };
    const config = await loadPosterSetsConfig();
    if (config.tpdbLocalCacheEnabled !== true) return { queued: 0, skippedCached: 0 };

    warmFetchTitleSetsFn = fetchTitleSets;
    if (options.followedPrefetchOnly === true) hydrateFollowedOnlySession = true;
    else if (options.followedPrefetchOnly === false) hydrateFollowedOnlySession = false;

    let queued = 0;
    let skippedCached = 0;
    const force = options.force === true;
    const alreadyQueued = new Set(
        warmTitleQueue.map((entry) => {
            const row = entry?.item || {};
            const tmdbId = String(row?.tmdbId || row?.id || '').trim();
            const mediaType = String(row?.mediaType || 'movie').toLowerCase() === 'show' ? 'show' : 'movie';
            return buildTpdbTitleCacheKey({
                tmdbId,
                mediaType,
                titleHint: row?.title,
                yearHint: row?.year,
            });
        }).filter(Boolean),
    );

    const startingFresh = warmTitleActive === 0 && warmTitleQueue.length === 0;
    if (startingFresh && (warmProgress.finishedAt || warmProgress.completed >= warmProgress.total)) {
        resetWarmProgress();
    }

    for (const item of (Array.isArray(items) ? items : []).slice(0, WARM_QUEUE_MAX)) {
        const tmdbId = String(item?.tmdbId || item?.id || '').trim();
        if (!tmdbId) continue;
        const mediaType = String(item?.mediaType || 'movie').toLowerCase() === 'show' ? 'show' : 'movie';
        const titleKey = buildTpdbTitleCacheKey({
            tmdbId,
            mediaType,
            titleHint: item?.title,
            yearHint: item?.year,
        });
        if (titleKey && alreadyQueued.has(titleKey)) continue;
        if (!force && titleKey) {
            const cached = await loadTpdbTitleCache(titleKey);
            if (cached?.sets?.length) {
                skippedCached += 1;
                if (config.tpdbAggressivePrefetch === true) {
                    void enqueueTpdbLibraryTitleHydrate(cached.sets, {
                        libraryScoped: true,
                        tmdbId,
                        titleKey,
                        followedOnly: hydrateFollowedOnlySession,
                    });
                }
                continue;
            }
        }
        warmTitleQueue.push({ item, fetchTitleSets });
        if (titleKey) alreadyQueued.add(titleKey);
        queued += 1;
    }

    if (queued > 0 || skippedCached > 0) {
        if (!warmProgress.startedAt) warmProgress.startedAt = nowMs();
        warmProgress.finishedAt = null;
        warmProgress.total += queued;
        warmProgress.skippedCached += skippedCached;
        logTpdbCacheActivity(
            `Cache queued ${queued} library title(s)`
            + (skippedCached ? ` (skipped ${skippedCached} already cached)` : ''),
            {
                kind: 'cache',
                current: queued
                    ? `Cache queue · ${warmTitleQueue.length} title(s)`
                    : (skippedCached ? 'Cache · all selected titles already cached' : false),
            },
        );
    }
    await persistWarmQueueSnapshot({
        lastEnqueueAt: new Date().toISOString(),
        lastSkippedCached: skippedCached,
        lastQueued: queued,
    });
    void pumpWarmTitleQueue();
    return { queued, skippedCached };
};

/**
 * After a process restart, continue any pending Warm titles saved to disk.
 */
export const resumeTpdbWarmQueueFromDisk = async () => {
    const config = await loadPosterSetsConfig();
    if (config.tpdbLocalCacheEnabled !== true) return { resumed: 0 };
    if (typeof warmBatchRunnerFn !== 'function' && typeof warmFetchTitleSetsFn !== 'function') {
        return { resumed: 0 };
    }
    if (warmTitleActive > 0 || warmTitleQueue.length > 0) return { resumed: 0 };

    const progress = await loadWarmProgress();
    const pending = Array.isArray(progress?.pending) ? progress.pending : [];
    if (!pending.length) return { resumed: 0 };

    logTpdbCacheActivity(
        `Cache: resuming ${pending.length} title(s) left from before restart`,
        { current: `Cache resume · ${pending.length} title(s)` },
    );
    const result = await enqueueTpdbLibraryWarm(pending, warmFetchTitleSetsFn || (async () => ({ sets: [] })), {
        force: false,
    });
    return { resumed: result.queued || 0, skippedCached: result.skippedCached || 0 };
};

/** Persist one Warm title as soon as the CLI finishes it (so disk counts move live). */
export const applyTpdbWarmTitleResult = async (item, result) => {
    const titleLabel = item?.title
        ? `${item.title}${item?.year ? ` (${item.year})` : ''}`
        : `tmdb ${item?.tmdbId || item?.id}`;
    const sets = result?.sets || [];
    if (result?.softSkip) {
        logTpdbCacheActivity(
            `Cache: skipped ${titleLabel} — ${result.softError || 'no TPDB title page'}`,
            { level: 'warn', detail: `tmdb ${item?.tmdbId || item?.id}` },
        );
        return;
    }
    if (sets.length) {
        logTpdbCacheActivity(`Cache: ${titleLabel} → ${sets.length} set(s)`, {
            detail: result?.titleUrl || null,
        });
        const tmdbId = item?.tmdbId || item?.id;
        const mediaType = item?.mediaType;
        const titleKey = buildTpdbTitleCacheKey({
            tmdbId,
            mediaType,
            titleHint: item?.title,
            yearHint: item?.year,
            titleUrl: result?.titleUrl,
        });
        await rememberPosterdbSearchResult(result, {
            libraryScoped: true,
            tmdbId,
            mediaType,
            titleHint: item?.title,
            yearHint: item?.year,
            titleUrl: result?.titleUrl,
        });
        // When Prefetch is on, hydrate set pages + images as titles resolve so disk
        // counts (sets / images) move live alongside title pages.
        const config = await loadPosterSetsConfig();
        if (config.tpdbAggressivePrefetch === true) {
            void enqueueTpdbLibraryTitleHydrate(sets, {
                libraryScoped: true,
                tmdbId,
                titleKey,
                followedOnly: hydrateFollowedOnlySession,
            });
        }
        return;
    }
    logTpdbCacheActivity(`Cache: no TPDB sets for ${titleLabel}`, { level: 'warn' });
};

const pumpWarmTitleQueue = async () => {
    if (warmTitleActive > 0) return;
    if (cacheWorkPaused) {
        hydrateCurrent = 'Paused';
        return;
    }
    if (!warmTitleQueue.length) {
        await persistWarmQueueSnapshot({
            pending: [],
            pendingCount: 0,
            active: false,
            completedAt: new Date().toISOString(),
        });
        if (warmProgress.total > 0) {
            warmProgress.finishedAt = nowMs();
            const pct = progressPercent(warmProgress);
            logTpdbCacheActivity(
                `Cache build finished — ${warmProgress.completed}/${warmProgress.total} title(s)`
                + (pct != null ? ` (${pct}%)` : '')
                + (warmProgress.skippedCached ? `, skipped ${warmProgress.skippedCached} cached` : ''),
                { kind: 'cache', current: hydrateActive > 0 || hydrateQueue.length ? true : false },
            );
        }
        if (hydrateActive === 0 && !cacheWorkPaused) hydrateCurrent = null;
        return;
    }

    warmTitleActive = 1;
    warmChunkStartedAt = nowMs();
    const config = await loadPosterSetsConfig();
    const parallelOn = config.tpdbWarmParallelWorkers === true;
    const workerCount = parallelOn ? WARM_PARALLEL_WORKERS : 1;
    const useBatch = typeof warmBatchRunnerFn === 'function';
    const chunkEntries = useBatch
        ? warmTitleQueue.splice(0, WARM_BATCH_SIZE * workerCount)
        : [warmTitleQueue.shift()].filter(Boolean);
    const chunkItems = chunkEntries.map((entry) => entry.item).filter(Boolean);

    await persistWarmQueueSnapshot({
        activeItem: chunkItems[0] || null,
        active: true,
        batchSize: chunkItems.length,
        workers: workerCount,
    });

    try {
        if (rateLimitCooldownUntil > nowMs()) {
            await sleep(rateLimitCooldownUntil - nowMs());
        }

        if (useBatch && chunkItems.length) {
            let results = [];
            /** @type {Set<string>} */
            const appliedKeys = new Set();
            const onTitleResult = async (item, result) => {
                const key = String(item?.tmdbId || item?.id || '').trim();
                if (key && appliedKeys.has(key)) return;
                if (key) appliedKeys.add(key);
                await applyTpdbWarmTitleResult(item, result);
                warmProgress.completed += 1;
                if (result?.softSkip) warmProgress.failed += 1;
                await persistWarmQueueSnapshot({ activeItem: item });
            };
            if (workerCount <= 1) {
                logTpdbCacheActivity(
                    `Cache batch: resolving ${chunkItems.length} title(s) (metadata only)`,
                    { kind: 'cache', current: `Cache batch · ${chunkItems.length} title(s)` },
                );
                results = await warmBatchRunnerFn(chunkItems, { onTitleResult });
            } else {
                const shards = Array.from({ length: workerCount }, () => []);
                chunkItems.forEach((item, index) => {
                    shards[index % workerCount].push(item);
                });
                const activeShards = shards
                    .map((shard, workerId) => ({ shard, workerId }))
                    .filter((entry) => entry.shard.length > 0);
                logTpdbCacheActivity(
                    `Cache parallel: ${chunkItems.length} title(s) across ${activeShards.length} workers (metadata only)`,
                    { kind: 'cache', current: `Cache ×${activeShards.length} · ${chunkItems.length} title(s)` },
                );
                const nested = await Promise.all(
                    activeShards.map(({ shard, workerId }) => warmBatchRunnerFn(shard, {
                        workerId,
                        isolateSession: true,
                        onTitleResult,
                    })),
                );
                results = nested.flat();
            }
            const byTmdb = new Map(
                (Array.isArray(results) ? results : [])
                    .map((row) => [String(row?.tmdbId || row?.tmdb_id || '').trim(), row]),
            );
            for (const item of chunkItems) {
                const key = String(item?.tmdbId || item?.id || '').trim();
                if (key && appliedKeys.has(key)) continue;
                const result = byTmdb.get(key) || {
                    sets: [],
                    softSkip: true,
                    softError: 'No result from warm batch',
                };
                await onTitleResult(item, result);
            }
            pushSample(warmProgress.sampleMs, (nowMs() - warmChunkStartedAt) / Math.max(1, chunkItems.length));
        } else {
            for (const entry of chunkEntries) {
                const { item, fetchTitleSets } = entry;
                const titleLabel = item?.title
                    ? `${item.title}${item?.year ? ` (${item.year})` : ''}`
                    : `tmdb ${item?.tmdbId || item?.id}`;
                const titleStarted = nowMs();
                logTpdbCacheActivity(`Cache: resolving TPDB sets for ${titleLabel}`, {
                    kind: 'cache',
                    detail: `tmdb ${item?.tmdbId || item?.id}`,
                    current: `Cache · ${titleLabel}`,
                });
                const result = await fetchTitleSets(item);
                await applyTpdbWarmTitleResult(item, result);
                warmProgress.completed += 1;
                if (result?.softSkip) warmProgress.failed += 1;
                pushSample(warmProgress.sampleMs, nowMs() - titleStarted);
                await sleep(BETWEEN_WARM_TITLES_MS);
            }
        }
    } catch (error) {
        const message = error?.message || String(error);
        // Resolve misses are expected for some library titles — keep the queue moving.
        if (/title url is required|could not (resolve|find).*title page|found no \/posters|needs a \/posters|login failed/i.test(message)) {
            logTpdbCacheActivity(`Cache: skipped — ${message}`, { level: 'warn', kind: 'cache' });
            warmProgress.completed += chunkItems.length || 1;
            warmProgress.failed += chunkItems.length || 1;
        } else {
            hydrateLastError = message;
            logTpdbCacheActivity(`Cache error: ${hydrateLastError}`, {
                level: 'error',
                kind: 'error',
                current: false,
            });
            warmProgress.completed += chunkItems.length || 1;
            warmProgress.failed += chunkItems.length || 1;
        }
        // Leave remaining warmTitleQueue intact; this chunk is dropped so a bad login
        // cannot infinitely re-queue the same titles. User can re-Warm after fixing creds
        // (already-cached titles are skipped).
    } finally {
        warmTitleActive = 0;
        await persistWarmQueueSnapshot({ active: false, activeItem: null });
        void pumpWarmTitleQueue();
    }
};

/**
 * Search helpers: try cache first, optionally kick SWR refresh via caller.
 */
export const buildCachedSearchResponse = (entry, { partialErrors = [] } = {}) => {
    if (!entry) return null;
    const errors = [...(partialErrors || [])].filter(Boolean);
    return {
        ok: true,
        provider: 'posterdb',
        phase: 'sets',
        fromCache: true,
        // Local cache is the permanent store — never mark a successful disk hit as stale.
        stale: false,
        title: entry.title || null,
        titleUrl: entry.titleUrl || null,
        titles: [],
        sets: entry.sets || [],
        partialErrors: errors.length ? errors : undefined,
    };
};

export const rememberPosterdbSearchResult = async (result, meta = {}) => {
    if (meta.libraryScoped === false) return null;
    if (!meta.libraryScoped && !meta.tmdbId) return null;
    const sets = (result?.sets || []).filter((set) => {
        const provider = String(set?.provider || 'posterdb').toLowerCase();
        return provider === 'posterdb';
    });
    if (!sets.length) return null;
    const key = buildTpdbTitleCacheKey({
        tmdbId: meta.tmdbId || result?.tmdbId,
        mediaType: meta.mediaType,
        titleUrl: meta.titleUrl || result?.titleUrl,
        titleHint: meta.titleHint || result?.title,
        yearHint: meta.yearHint,
    });
    if (!key) return null;
    const existing = await loadTpdbTitleCache(key);
    const merged = mergeTpdbTitleSets(existing?.sets || [], sets);
    return saveTpdbTitleCache(key, {
        sets: merged,
        titleUrl: meta.titleUrl || result?.titleUrl || existing?.titleUrl || null,
        title: result?.title || meta.titleHint || existing?.title || null,
        tmdbId: meta.tmdbId || existing?.tmdbId || null,
        mediaType: meta.mediaType || existing?.mediaType || null,
    });
};

/** Union title-set lists by TPDB set id / URL (permanent local DB — never drop known sets). */
export const mergeTpdbTitleSets = (existing = [], incoming = []) => {
    const map = new Map();
    for (const set of [...(existing || []), ...(incoming || [])]) {
        const provider = String(set?.provider || 'posterdb').toLowerCase();
        if (provider && provider !== 'posterdb') continue;
        const key = extractTpdbSetId(set?.setId || set?.url) || String(set?.url || '').trim();
        if (!key) continue;
        if (!map.has(key)) map.set(key, set);
    }
    return [...map.values()];
};

export const listTpdbTitleCacheEntries = async () => {
    await ensureDirs();
    let names = [];
    try {
        names = await fs.readdir(TPDB_TITLE_CACHE_DIR);
    } catch {
        return [];
    }
    const entries = [];
    for (const name of names) {
        if (!name.endsWith('.json')) continue;
        const entry = await readJsonFile(path.join(TPDB_TITLE_CACHE_DIR, name));
        if (entry && Array.isArray(entry.sets) && entry.sets.length) entries.push(entry);
    }
    return entries;
};

const setKeyForSet = (set) => extractTpdbSetId(set?.setId || set?.url) || String(set?.url || '').trim();

const yearFromCachedTitle = (title) => {
    const match = String(title || '').match(/\((\d{4})\)\s*$/);
    return match ? Number(match[1]) : null;
};

const bareTitleFromCached = (title) => String(title || '').replace(/\s*\(\d{4}\)\s*$/, '').trim();

/** @type {ReturnType<typeof createDailyRefreshStatus>} */
let dailyRefreshStatus = createDailyRefreshStatus();
let dailyRefreshTimer = null;
let dailyRefreshBusy = false;

function createDailyRefreshStatus() {
    return {
        hourLocal: TPDB_DAILY_REFRESH_HOUR,
        intervalHours: 0,
        running: false,
        lastRunAt: null,
        nextRunAt: null,
        lastResult: null,
    };
}

export const getTpdbDailyRefreshStatus = () => ({
    ...dailyRefreshStatus,
    busy: dailyRefreshBusy,
});

const formatLocalHourLabel = (hour) => `${String(Math.max(0, Math.min(23, hour))).padStart(2, '0')}:00`;

/** Clock-aligned slots: start at `hour`, then every `intervalHours` (0/24 = once daily). */
export const listTpdbRefreshHours = (hour = TPDB_DAILY_REFRESH_HOUR, intervalHours = 0) => {
    const start = Math.max(0, Math.min(23, Math.round(Number(hour) || 0)));
    const interval = Math.max(0, Math.min(24, Math.round(Number(intervalHours) || 0)));
    if (!interval || interval >= 24) return [start];
    const slots = new Set();
    for (let t = start; t < start + 24; t += interval) {
        slots.add(((t % 24) + 24) % 24);
    }
    return [...slots].sort((a, b) => a - b);
};

const resolveRefreshSchedule = async () => {
    const config = await loadPosterSetsConfig().catch(() => null);
    const hour = Math.max(
        0,
        Math.min(23, Math.round(Number(config?.tpdbCacheRefreshHour ?? TPDB_DAILY_REFRESH_HOUR) || 0)),
    );
    const intervalHours = Math.max(
        0,
        Math.min(24, Math.round(Number(config?.tpdbCacheRefreshIntervalHours ?? 0) || 0)),
    );
    return { hour, intervalHours, hours: listTpdbRefreshHours(hour, intervalHours) };
};

const msUntilNextRefreshSlot = (hour, intervalHours) => {
    const now = new Date();
    const hours = listTpdbRefreshHours(hour, intervalHours);
    for (const h of hours) {
        const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 0, 0, 0);
        if (candidate.getTime() > now.getTime() + 4_000) {
            return Math.max(5_000, candidate.getTime() - now.getTime());
        }
    }
    const first = hours[0] ?? hour;
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, first, 0, 0, 0);
    return Math.max(5_000, tomorrow.getTime() - now.getTime());
};

const applyDailyRefreshTitleResult = async (item, result) => {
    const existingSets = Array.isArray(item.existingSets)
        ? item.existingSets
        : ((await loadTpdbTitleCache(item.cacheKey))?.sets || []);
    if (result?.softSkip || !(result?.sets || []).length) {
        if (item.cacheKey) await touchTpdbTitleRevalidated(item.cacheKey).catch(() => null);
        return { added: 0, refreshed: false };
    }
    const existingKeys = new Set(existingSets.map(setKeyForSet).filter(Boolean));
    const incoming = (result.sets || []).filter((set) => {
        const provider = String(set?.provider || 'posterdb').toLowerCase();
        return !provider || provider === 'posterdb';
    });
    const newSets = incoming.filter((set) => {
        const key = setKeyForSet(set);
        return key && !existingKeys.has(key);
    });
    const merged = mergeTpdbTitleSets(existingSets, incoming);
    const key = item.cacheKey || buildTpdbTitleCacheKey({
        tmdbId: item.tmdbId,
        mediaType: item.mediaType,
        titleHint: item.title,
        yearHint: item.year,
        titleUrl: result.titleUrl || item.titleUrl,
    });
    await saveTpdbTitleCache(key, {
        sets: merged,
        titleUrl: result.titleUrl || item.titleUrl || null,
        title: result.title || item.title || null,
        tmdbId: item.tmdbId,
        mediaType: item.mediaType,
    });
    if (newSets.length) {
        const config = await loadPosterSetsConfig();
        if (config.tpdbAggressivePrefetch === true) {
            void enqueueTpdbLibraryTitleHydrate(newSets, {
                libraryScoped: true,
                tmdbId: item.tmdbId,
                titleKey: key,
            });
        }
    }
    return { added: newSets.length, refreshed: true };
};

/**
 * Dedicated worker: re-check every *existing* title-cache file for new TPDB sets.
 * Runs independently of library warm/build (own session + busy flag).
 * Does not discover new library titles — only merges into on-disk cache entries.
 */
export const runTpdbCacheDailyRefreshPass = async () => {
    const config = await loadPosterSetsConfig();
    if (config.tpdbLocalCacheEnabled !== true) {
        return { skipped: true, reason: 'cache-disabled' };
    }
    if (dailyRefreshBusy) {
        return { skipped: true, reason: 'busy' };
    }
    if (typeof refreshFetchTitleSetsFn !== 'function' && typeof warmFetchTitleSetsFn !== 'function') {
        return { skipped: true, reason: 'not-ready' };
    }

    dailyRefreshBusy = true;
    dailyRefreshStatus.running = true;
    dailyRefreshStatus.lastRunAt = new Date().toISOString();
    const alongsideWarm = warmTitleActive > 0 || warmTitleQueue.length > 0;
    logTpdbCacheActivity(
        alongsideWarm
            ? 'New-sets refresh worker: checking existing cache files (library build still running — using separate session)…'
            : 'New-sets refresh worker: checking existing cache files for new poster sets…',
        {
            kind: 'cache',
            current: 'New-sets refresh worker…',
        },
    );

    let refreshed = 0;
    let addedSets = 0;
    let failed = 0;
    let titles = 0;
    const fetchTitle = refreshFetchTitleSetsFn || warmFetchTitleSetsFn;

    try {
        const entries = await listTpdbTitleCacheEntries();
        const items = [];
        for (const entry of entries) {
            const tmdbId = String(entry.tmdbId || '').trim();
            if (!/^\d+$/.test(tmdbId)) continue;
            const year = yearFromCachedTitle(entry.title);
            items.push({
                tmdbId,
                title: bareTitleFromCached(entry.title) || entry.title || `tmdb ${tmdbId}`,
                year,
                mediaType: entry.mediaType || 'movie',
                cacheKey: entry.key,
                existingSets: entry.sets || [],
                titleUrl: entry.titleUrl || null,
            });
        }
        titles = items.length;
        if (!titles) {
            const empty = { refreshed: 0, addedSets: 0, failed: 0, titles: 0 };
            dailyRefreshStatus.lastResult = empty;
            logTpdbCacheActivity('New-sets refresh worker: no cached titles on disk yet', {
                kind: 'cache',
                current: false,
            });
            return empty;
        }

        for (const item of items) {
            if (cacheWorkPaused) {
                logTpdbCacheActivity('New-sets refresh worker paused — remaining titles left for next run', {
                    level: 'warn',
                    kind: 'cache',
                });
                break;
            }
            try {
                await waitForTpdbRequestSlot();
                const result = await fetchTitle(item);
                const outcome = await applyDailyRefreshTitleResult(item, result);
                if (outcome.refreshed) refreshed += 1;
                addedSets += outcome.added;
                if (outcome.added > 0) {
                    logTpdbCacheActivity(
                        `New-sets refresh: ${item.title} +${outcome.added} new set(s)`,
                        { kind: 'cache', detail: `tmdb ${item.tmdbId}` },
                    );
                }
            } catch (error) {
                failed += 1;
                logTpdbCacheActivity(
                    `New-sets refresh failed for ${item.title}: ${error?.message || error}`,
                    { level: 'warn', kind: 'error', detail: `tmdb ${item.tmdbId}` },
                );
            }
            await sleep(BETWEEN_REFRESH_TITLES_MS);
        }

        const summary = { refreshed, addedSets, failed, titles, alongsideWarm };
        dailyRefreshStatus.lastResult = summary;
        logTpdbCacheActivity(
            `New-sets refresh done — ${refreshed}/${titles} cached titles checked, +${addedSets} new set(s)${failed ? `, ${failed} error(s)` : ''}`,
            { kind: 'cache', current: false },
        );
        return summary;
    } catch (error) {
        const message = error?.message || String(error);
        dailyRefreshStatus.lastResult = { error: message, refreshed, addedSets, failed, titles };
        logTpdbCacheActivity(`New-sets refresh aborted: ${message}`, {
            level: 'error',
            kind: 'error',
            current: false,
        });
        return dailyRefreshStatus.lastResult;
    } finally {
        dailyRefreshBusy = false;
        dailyRefreshStatus.running = false;
    }
};

const armTpdbDailyRefreshTimer = async () => {
    if (dailyRefreshTimer) {
        clearTimeout(dailyRefreshTimer);
        dailyRefreshTimer = null;
    }
    const schedule = await resolveRefreshSchedule();
    dailyRefreshStatus.hourLocal = schedule.hour;
    dailyRefreshStatus.intervalHours = schedule.intervalHours;
    const waitMs = msUntilNextRefreshSlot(schedule.hour, schedule.intervalHours);
    dailyRefreshStatus.nextRunAt = new Date(Date.now() + waitMs).toISOString();
    dailyRefreshTimer = setTimeout(() => {
        void (async () => {
            try {
                await runTpdbCacheDailyRefreshPass();
            } catch {
                /* keep schedule alive */
            }
            void armTpdbDailyRefreshTimer();
        })();
    }, waitMs);
    dailyRefreshTimer.unref?.();
};

export const startTpdbCacheDailyRefresh = () => {
    void armTpdbDailyRefreshTimer().then(() => {
        const hours = listTpdbRefreshHours(dailyRefreshStatus.hourLocal, dailyRefreshStatus.intervalHours);
        const slotLabel = hours.map(formatLocalHourLabel).join(', ');
        logTpdbCacheActivity(
            dailyRefreshStatus.intervalHours > 0 && dailyRefreshStatus.intervalHours < 24
                ? `Cache refresh scheduled at ${slotLabel} server local (every ${dailyRefreshStatus.intervalHours}h from ${formatLocalHourLabel(dailyRefreshStatus.hourLocal)}; next ${dailyRefreshStatus.nextRunAt})`
                : `Cache refresh scheduled daily at ${formatLocalHourLabel(dailyRefreshStatus.hourLocal)} server local (next ${dailyRefreshStatus.nextRunAt})`,
            { kind: 'cache' },
        );
    });
    return getTpdbDailyRefreshStatus();
};

/** Re-read config and re-arm the timer (call after Settings save). */
export const rescheduleTpdbCacheDailyRefresh = () => {
    void armTpdbDailyRefreshTimer().then(() => {
        logTpdbCacheActivity(
            `Cache refresh schedule updated — next ${dailyRefreshStatus.nextRunAt}`,
            { kind: 'cache' },
        );
    });
    return getTpdbDailyRefreshStatus();
};

export const stopTpdbCacheDailyRefresh = () => {
    if (dailyRefreshTimer) {
        clearTimeout(dailyRefreshTimer);
        dailyRefreshTimer = null;
    }
    dailyRefreshStatus.nextRunAt = null;
};

export const previewFromTpdbSetCache = async (url) => {
    if (!isTpdbUrl(url)) return null;
    const entry = await loadTpdbSetCache(url);
    if (!entry) return null;
    return {
        ok: true,
        fromCache: true,
        url: entry.url || url,
        assets: entry.assets,
        setMeta: entry.setMeta || {
            provider: 'posterdb',
            setId: entry.setId,
            url: entry.url || url,
            title: entry.title,
        },
        matched: entry.matched,
        unmatched: entry.unmatched,
        total: entry.total ?? entry.assets.length,
        title: entry.title,
    };
};
