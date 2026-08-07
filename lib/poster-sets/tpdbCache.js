/**
 * Durable ThePosterDB title/set/image cache with stale-while-revalidate.
 * Only hydrates titles tied to the user's library (TMDB-scoped / explicit warm).
 */
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { POSTER_SETS_DIR, ensurePosterSetsDir, loadPosterSetsConfig } from './config.js';
import { runPosterSetsCli } from './runner.js';

export const TPDB_TITLE_CACHE_DIR = path.join(POSTER_SETS_DIR, 'tpdb-title-cache');
export const TPDB_SET_CACHE_DIR = path.join(POSTER_SETS_DIR, 'tpdb-set-cache');
export const TPDB_IMAGE_CACHE_DIR = path.join(POSTER_SETS_DIR, 'tpdb-image-cache');

/** Soft: serve immediately, revalidate in background after this age. */
export const TPDB_REVALIDATE_MS = 10 * 60_000;
/** Bookkeeping TTL — still serve after this if offline. */
export const TPDB_SOFT_TTL_MS = 24 * 60 * 60_000;
export const DEFAULT_TPDB_CACHE_MAX_BYTES = 2 * 1024 * 1024 * 1024;
/** One set preview + image hydrate at a time — never parallel scrape workers. */
const HYDRATE_CONCURRENCY = 1;
/**
 * ThePosterDB enforces ~7s between requests (asset API and HTML).
 * All hydrate HTTP goes through the shared gate below.
 */
export const TPDB_REQUEST_GAP_MS = 7_000;
/** Extra pause after finishing a hydrated set before the next set starts. */
const BETWEEN_SETS_GAP_MS = 7_000;
const MAX_IMAGE_ITEM_BYTES = 8 * 1024 * 1024;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const nowMs = () => Date.now();

let lastTpdbRequestAt = 0;
let tpdbGate = Promise.resolve();
let rateLimitCooldownUntil = 0;

const ACTIVITY_LOG_MAX = 100;
/** @type {Array<{ at: number, level: string, message: string, detail?: string | null }>} */
const activityLog = [];
/** Short “what’s happening now” line for Settings. */
let hydrateCurrent = null;

const shortUrl = (url, max = 72) => {
    const value = String(url || '').trim();
    if (!value) return '';
    if (value.length <= max) return value;
    return `${value.slice(0, max - 1)}…`;
};

/**
 * Ring-buffer activity for Settings UI (+ console). Safe to call from search routes.
 * @param {string} message
 * @param {{ level?: 'info'|'warn'|'error', detail?: string|null, current?: boolean|string }} [options]
 */
export const logTpdbCacheActivity = (message, options = {}) => {
    const level = options.level || 'info';
    const detail = options.detail != null ? String(options.detail) : null;
    const text = String(message || '').trim();
    if (!text) return;
    const entry = { at: nowMs(), level, message: text, detail };
    activityLog.push(entry);
    while (activityLog.length > ACTIVITY_LOG_MAX) activityLog.shift();
    if (options.current === true) hydrateCurrent = text;
    else if (typeof options.current === 'string') hydrateCurrent = options.current;
    else if (options.current === false) hydrateCurrent = null;
    const suffix = detail ? ` — ${detail}` : '';
    console.log(`[poster-sets/tpdb] ${text}${suffix}`);
};

/**
 * Global polite gate for all ThePosterDB hydrate HTTP (assets + scrapes).
 * Enforces the site's ~7s spacing and any cooldown after HTTP 429.
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
                        `Waiting ${Math.ceil(waitMs / 1000)}s for ThePosterDB 7s spacing…`,
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
    const [titles, sets, images] = await Promise.all([
        removeDirContents(TPDB_TITLE_CACHE_DIR),
        removeDirContents(TPDB_SET_CACHE_DIR),
        removeDirContents(TPDB_IMAGE_CACHE_DIR),
    ]);
    hydrateCurrent = null;
    logTpdbCacheActivity(
        `Cleared cache — ${titles} titles, ${sets} sets, ${images} images`,
        { current: false },
    );
    return { titles, sets, images };
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
    return {
        cacheEnabled: config.tpdbLocalCacheEnabled === true,
        prefetchEnabled: config.tpdbAggressivePrefetch === true,
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
const BETWEEN_WARM_TITLES_MS = 7_000;

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
    for (let attempt = 0; attempt < 4; attempt += 1) {
        await waitForTpdbRequestSlot();
        try {
            response = await fetch(target, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
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
};

const hydrateOneSet = async (item) => {
    const setUrl = String(item?.setUrl || '').trim();
    if (!setUrl || !isTpdbUrl(setUrl)) return;

    const config = await loadPosterSetsConfig();
    if (config.tpdbLocalCacheEnabled !== true) return;

    const label = item.setId ? `set ${item.setId}` : shortUrl(setUrl, 56);
    logTpdbCacheActivity(`Hydrating ${label}`, {
        detail: setUrl,
        current: `Hydrating · ${label}`,
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
    for (let i = 0; i < assets.length; i += 1) {
        const asset = assets[i];
        const imageUrl = String(asset?.url || asset?.thumbUrl || '').trim();
        if (!imageUrl) continue;
        logTpdbCacheActivity(
            `Asset ${i + 1}/${assets.length} for ${label}`,
            { current: `Asset ${i + 1}/${assets.length} · ${label}` },
        );
        const result = await downloadImageToCache(imageUrl);
        if (result === true) downloaded += 1;
        else if (result === 'cached') alreadyCached += 1;
        const after = await getTpdbImageCacheStats();
        if (after.bytes >= maxBytes) {
            await evictTpdbImageCacheIfNeeded(maxBytes);
            break;
        }
    }

    // Also cache set card thumbs from the title listing when present.
    if (item.thumbUrl) {
        await downloadImageToCache(String(item.thumbUrl));
    }

    logTpdbCacheActivity(
        `Finished ${label} — downloaded ${downloaded}, already cached ${alreadyCached}`,
        { current: hydrateQueue.length ? `Queued sets remaining: ${hydrateQueue.length}` : false },
    );

    await sleep(BETWEEN_SETS_GAP_MS);
};

const pumpHydrateQueue = async () => {
    if (hydrateActive >= HYDRATE_CONCURRENCY) return;
    const next = hydrateQueue.shift();
    if (!next) {
        if (hydrateActive === 0 && warmTitleActive === 0) {
            hydrateCurrent = null;
        }
        return;
    }
    hydrateActive += 1;
    const queueKey = next.queueKey;
    try {
        await hydrateOneSet(next);
    } catch (error) {
        hydrateLastError = error?.message || String(error);
        logTpdbCacheActivity(`Hydrate error: ${hydrateLastError}`, { level: 'error', current: false });
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

    const list = Array.isArray(sets) ? sets : [];
    let queued = 0;
    for (const set of list) {
        const provider = String(set?.provider || '').toLowerCase();
        if (provider && provider !== 'posterdb') continue;
        const setUrl = String(set?.url || '').trim();
        if (!setUrl || !isTpdbUrl(setUrl)) continue;
        const setId = extractTpdbSetId(set.setId || setUrl);
        const queueKey = setId || setUrl;
        if (hydrateQueued.has(queueKey)) continue;
        hydrateQueued.add(queueKey);
        hydrateQueue.push({
            queueKey,
            setUrl,
            setId,
            thumbUrl: set.thumbUrl || '',
            titleKey: options.titleKey || null,
        });
        queued += 1;
    }
    if (queued > 0) {
        logTpdbCacheActivity(
            `Queued ${queued} set(s) for image/prefetch hydrate`,
            {
                detail: options.tmdbId ? `tmdb ${options.tmdbId}` : options.titleKey || null,
                current: `Prefetch queue · ${hydrateQueue.length} set(s)`,
            },
        );
    }
    void pumpHydrateQueue();
    return { queued };
};

/**
 * Queue library titles for serial TPDB resolve + hydrate (never fires titles in parallel).
 * `fetchTitleSets(item)` should return `{ sets, title, titleUrl? }` for that library row.
 */
export const enqueueTpdbLibraryWarm = async (items = [], fetchTitleSets) => {
    if (typeof fetchTitleSets !== 'function') return { queued: 0 };
    const config = await loadPosterSetsConfig();
    if (config.tpdbLocalCacheEnabled !== true) return { queued: 0 };

    let queued = 0;
    for (const item of (Array.isArray(items) ? items : []).slice(0, 200)) {
        const tmdbId = String(item?.tmdbId || item?.id || '').trim();
        if (!tmdbId) continue;
        warmTitleQueue.push({ item, fetchTitleSets });
        queued += 1;
    }
    if (queued > 0) {
        logTpdbCacheActivity(`Warm queued ${queued} library title(s)`, {
            current: `Warm queue · ${warmTitleQueue.length} title(s)`,
        });
    }
    void pumpWarmTitleQueue();
    return { queued };
};

const pumpWarmTitleQueue = async () => {
    if (warmTitleActive > 0) return;
    const next = warmTitleQueue.shift();
    if (!next) return;
    warmTitleActive = 1;
    try {
        if (rateLimitCooldownUntil > nowMs()) {
            await sleep(rateLimitCooldownUntil - nowMs());
        }
        const { item, fetchTitleSets } = next;
        const titleLabel = item?.title
            ? `${item.title}${item?.year ? ` (${item.year})` : ''}`
            : `tmdb ${item?.tmdbId || item?.id}`;
        logTpdbCacheActivity(`Warm: resolving TPDB sets for ${titleLabel}`, {
            detail: `tmdb ${item?.tmdbId || item?.id}`,
            current: `Warm · ${titleLabel}`,
        });
        const result = await fetchTitleSets(item);
        const sets = result?.sets || [];
        if (result?.softSkip) {
            logTpdbCacheActivity(
                `Warm: skipped ${titleLabel} — ${result.softError || 'no TPDB title page'}`,
                { level: 'warn', detail: `tmdb ${item?.tmdbId || item?.id}` },
            );
        } else if (sets.length) {
            logTpdbCacheActivity(`Warm: ${titleLabel} → ${sets.length} set(s)`, {
                detail: result?.titleUrl || null,
            });
            await rememberPosterdbSearchResult(result, {
                libraryScoped: true,
                tmdbId: item?.tmdbId || item?.id,
                mediaType: item?.mediaType,
                titleHint: item?.title,
                yearHint: item?.year,
                titleUrl: result?.titleUrl,
            });
            await enqueueTpdbLibraryTitleHydrate(sets, {
                libraryScoped: true,
                tmdbId: item?.tmdbId || item?.id,
                force: true,
            });
        } else {
            logTpdbCacheActivity(`Warm: no TPDB sets for ${titleLabel}`, { level: 'warn' });
        }
        await sleep(BETWEEN_WARM_TITLES_MS);
    } catch (error) {
        const message = error?.message || String(error);
        // Resolve misses are expected for some library titles — keep the queue moving.
        if (/title url is required|could not resolve|found no \/posters/i.test(message)) {
            logTpdbCacheActivity(`Warm: skipped — ${message}`, { level: 'warn' });
        } else {
            hydrateLastError = message;
            logTpdbCacheActivity(`Warm error: ${hydrateLastError}`, { level: 'error', current: false });
        }
    } finally {
        warmTitleActive = 0;
        void pumpWarmTitleQueue();
    }
};

/**
 * Search helpers: try cache first, optionally kick SWR refresh via caller.
 */
export const buildCachedSearchResponse = (entry, { stale = false, partialErrors = [] } = {}) => {
    if (!entry) return null;
    const errors = [...(partialErrors || [])];
    if (stale) {
        errors.push('Serving cached ThePosterDB sets (live fetch failed or still refreshing).');
    }
    return {
        ok: true,
        provider: 'posterdb',
        phase: 'sets',
        fromCache: true,
        stale: Boolean(stale),
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
    return saveTpdbTitleCache(key, {
        sets,
        titleUrl: meta.titleUrl || result?.titleUrl || null,
        title: result?.title || meta.titleHint || null,
        tmdbId: meta.tmdbId || null,
        mediaType: meta.mediaType || null,
    });
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
