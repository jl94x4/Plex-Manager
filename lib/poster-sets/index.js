import {
    loadPosterSetsConfig,
    maskPosterSetsConfig,
    savePosterSetsConfig,
    resolveBulkFilePath,
    POSTER_SETS_DIR,
    ensurePosterSetsDir,
} from './config.js';
import { loadPosterSetsHistory, upsertPosterSetsHistory } from './history.js';
import { posterSetsWorkerReady, runPosterSetsCli, killActivePosterSetsWorker, POSTER_SETS_APP_DIR } from './runner.js';
import {
    mergePosterSearchSets,
    mergePosterSearchTitles,
    normalizeDupePreference,
    pickMediuxTmdbForHint,
    resolvePosterSetsMediaType,
} from './searchMerge.js';
import { getBrowseRailsSnapshot } from './browse.js';
import {
    cancelPosterSetsQueueJob,
    claimNextPosterSetsJob,
    clearPosterSetsFinishedQueue,
    clearPosterSetsQueuedJobs,
    enqueuePosterSetsJob,
    getPosterSetsQueueJob,
    loadPosterSetsQueue,
    patchPosterSetsQueueJob,
    queueStats,
    recoverPosterSetsQueue,
    retryPosterSetsQueueJob,
    setPosterSetsQueuePaused,
    stopPosterSetsRunningJob,
} from './queue.js';
import {
    deletePosterSetsWatch,
    getPosterSetsWatch,
    listPosterSetsWatches,
    patchPosterSetsWatch,
    upsertPosterSetsWatch,
    watchStats,
} from './watches.js';
import {
    appendPosterSetsAudit,
    auditEntryFromJob,
    finalizeRunningWatchCheckAudits,
    listPosterSetsAudit,
    patchPosterSetsAudit,
} from './audit.js';
import { resolvePosterSetsTitleStatus } from './title-status.js';
import { togglePosterSetsTitleWatch } from './title-watch.js';
import { applyPosterSetToJellyfinLike } from './jellyfin-apply.js';
import {
    autoWatchFromApply,
    autoWatchFromMissingLibrary,
    checkPosterSetsWatch,
    clearStalePosterSetsWatcherIfNeeded,
    getPosterSetsWatcherPassStatus,
    isMissingLibraryApplyResult,
    isPosterSetsWatcherBusy,
    markWatchAssetsApplied,
    reapplyPosterSetsWatch,
    resetPosterSetsWatcherBusy,
    resolveAppliedAssetIdsFromResult,
    runPosterSetsWatcherPass,
    setPosterSetsEnqueueApply,
    setPosterSetsNotifyDigest,
    startPosterSetsWatcher,
} from './watcher.js';
import { runPosterSetsArrHookNow, schedulePosterSetsArrHook } from './arr-hook.js';
import {
    TPDB_IMAGE_CACHE_DIR,
    buildCachedSearchResponse,
    buildTpdbTitleCacheKey,
    clearTpdbLocalCache,
    enqueueTpdbLibraryTitleHydrate,
    enqueueTpdbLibraryWarm,
    getTpdbCacheStatus,
    isLibraryScopedTpdbSearch,
    isTpdbUrl,
    loadTpdbCachedImage,
    loadTpdbTitleCache,
    logTpdbCacheActivity,
    previewFromTpdbSetCache,
    rememberPosterdbSearchResult,
    resumeTpdbWarmQueueFromDisk,
    saveTpdbSetCache,
    setTpdbWarmBatchRunner,
    setTpdbWarmFetchTitleSets,
    storeTpdbCachedImage,
    titleCacheNeedsRevalidate,
    touchTpdbTitleRevalidated,
    waitForTpdbRequestSlot,
} from './tpdbCache.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export { startPosterSetsWatcher, setPosterSetsNotifyDigest, schedulePosterSetsArrHook };

const jobs = new Map();
let queueWorkerBusy = false;
let queueTickTimer = null;
/** Job id currently executing in runQueuedJob (for stop / stale kill). */
let activeQueueJobId = null;
/** Prevents overlapping Check-all HTTP kicks before the watcher busy flag is set. */
let watchPassKickInFlight = false;

const STALE_PROGRESS_MS = 15 * 60 * 1000;
const MAX_RUNNING_MS = 50 * 60 * 1000;
const QUEUE_PROGRESS_DEBOUNCE_MS = 2000;

const applyTimeoutMs = (payload = {}) => {
    const count = Array.isArray(payload.selectedIds) && payload.selectedIds.length
        ? payload.selectedIds.length
        : (Array.isArray(payload.selectedAssets) && payload.selectedAssets.length
            ? payload.selectedAssets.length
            : 0);
    if (!count) return 45 * 60_000;
    return Math.min(45 * 60_000, Math.max(5 * 60_000, 90_000 + count * 30_000));
};

/**
 * TPDB rate-limits requests (~7s between calls, especially /api/assets).
 * Cache thumbs so grids don't re-hit upstream.
 * Keep concurrency low to avoid burning the remaining quota on cold loads.
 */
const IMAGE_PROXY_CONCURRENCY = 4;
let imageProxyActive = 0;
/** @type {Array<() => void>} */
const imageProxyWaiters = [];
const IMAGE_CACHE_DIR = path.join(POSTER_SETS_DIR, 'image-cache');
const IMAGE_CACHE_MAX_ENTRIES = 240;
const IMAGE_CACHE_MAX_BYTES = 120 * 1024 * 1024;
const IMAGE_CACHE_MAX_ITEM_BYTES = 6 * 1024 * 1024;
/** @type {Map<string, { buf: Buffer, contentType: string }>} */
const imageMemoryCache = new Map();
let imageMemoryBytes = 0;

const withImageProxySlot = async (fn) => {
    if (imageProxyActive >= IMAGE_PROXY_CONCURRENCY) {
        await new Promise((resolve) => {
            imageProxyWaiters.push(resolve);
        });
    }
    imageProxyActive += 1;
    try {
        return await fn();
    } finally {
        imageProxyActive -= 1;
        const next = imageProxyWaiters.shift();
        if (next) next();
    }
};

const imageCacheKey = (url) => crypto.createHash('sha1').update(String(url)).digest('hex');

const touchMemoryCache = (key, entry) => {
    imageMemoryCache.delete(key);
    imageMemoryCache.set(key, entry);
};

const putMemoryCache = (key, buf, contentType) => {
    if (!buf?.length || buf.length > IMAGE_CACHE_MAX_ITEM_BYTES) return;
    const existing = imageMemoryCache.get(key);
    if (existing) {
        imageMemoryBytes -= existing.buf.length;
        imageMemoryCache.delete(key);
    }
    while (
        imageMemoryCache.size
        && (
            imageMemoryCache.size >= IMAGE_CACHE_MAX_ENTRIES
            || imageMemoryBytes + buf.length > IMAGE_CACHE_MAX_BYTES
        )
    ) {
        const oldestKey = imageMemoryCache.keys().next().value;
        const oldest = imageMemoryCache.get(oldestKey);
        imageMemoryCache.delete(oldestKey);
        if (oldest) imageMemoryBytes -= oldest.buf.length;
    }
    const entry = { buf, contentType };
    imageMemoryCache.set(key, entry);
    imageMemoryBytes += buf.length;
};

const readDiskCache = async (key) => {
    const binPath = path.join(IMAGE_CACHE_DIR, `${key}.bin`);
    const metaPath = path.join(IMAGE_CACHE_DIR, `${key}.json`);
    try {
        const [buf, metaRaw] = await Promise.all([
            fs.readFile(binPath),
            fs.readFile(metaPath, 'utf8'),
        ]);
        const meta = JSON.parse(metaRaw);
        const contentType = String(meta?.contentType || 'image/jpeg');
        if (!buf.length) return null;
        return { buf, contentType };
    } catch {
        return null;
    }
};

const writeDiskCache = async (key, buf, contentType, sourceUrl) => {
    if (!buf?.length || buf.length > IMAGE_CACHE_MAX_ITEM_BYTES) return;
    try {
        await ensurePosterSetsDir();
        await fs.mkdir(IMAGE_CACHE_DIR, { recursive: true });
        await Promise.all([
            fs.writeFile(path.join(IMAGE_CACHE_DIR, `${key}.bin`), buf),
            fs.writeFile(
                path.join(IMAGE_CACHE_DIR, `${key}.json`),
                JSON.stringify({
                    contentType,
                    url: sourceUrl,
                    at: new Date().toISOString(),
                    bytes: buf.length,
                }),
            ),
        ]);
    } catch {
        // cache is best-effort
    }
};

const loadCachedImage = async (url) => {
    const key = imageCacheKey(url);
    const mem = imageMemoryCache.get(key);
    if (mem) {
        touchMemoryCache(key, mem);
        return mem;
    }
    if (isTpdbUrl(url)) {
        const tpdb = await loadTpdbCachedImage(url);
        if (tpdb) {
            putMemoryCache(key, tpdb.buf, tpdb.contentType);
            return { buf: tpdb.buf, contentType: tpdb.contentType };
        }
    }
    const disk = await readDiskCache(key);
    if (disk) {
        putMemoryCache(key, disk.buf, disk.contentType);
        return disk;
    }
    return null;
};

const storeCachedImage = async (url, buf, contentType) => {
    const key = imageCacheKey(url);
    putMemoryCache(key, buf, contentType);
    await writeDiskCache(key, buf, contentType, url);
    if (isTpdbUrl(url)) {
        await storeTpdbCachedImage(url, buf, contentType).catch(() => {});
    }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getJob = async (id) => {
    const live = jobs.get(String(id));
    if (live) return live;
    return getPosterSetsQueueJob(id);
};

const mirrorJob = (job) => {
    if (!job?.id) return;
    jobs.set(String(job.id), job);
    if (jobs.size > 80) {
        const oldest = [...jobs.keys()].slice(0, jobs.size - 80);
        oldest.forEach((key) => jobs.delete(key));
    }
};

const listJobsSorted = async () => {
    const history = await loadPosterSetsHistory();
    const queue = await loadPosterSetsQueue();
    const byId = new Map(history.map((entry) => [entry.id, entry]));
    for (const job of queue.jobs) byId.set(job.id, job);
    for (const live of jobs.values()) byId.set(live.id, live);
    return [...byId.values()].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
};

const pickSetMeta = (job) => {
    const fromInput = job?.input?.setMeta && typeof job.input.setMeta === 'object'
        ? job.input.setMeta
        : null;
    const fromResult = job?.result?.setMeta && typeof job.result.setMeta === 'object'
        ? job.result.setMeta
        : null;
    if (!fromInput && !fromResult) return null;
    // Prefer scraped show/movie name + creator from the apply/inspect result over search card labels
    // like "Season 3".
    return {
        provider: fromResult?.provider || fromInput?.provider || null,
        setId: (fromResult?.setId ?? fromInput?.setId) != null
            ? String(fromResult?.setId ?? fromInput?.setId)
            : null,
        url: fromResult?.url || fromInput?.url || job?.input?.url || null,
        title: fromResult?.title || fromInput?.title || null,
        user: fromResult?.user || fromInput?.user || null,
        tmdbId: fromResult?.tmdbId || fromInput?.tmdbId || null,
        tvdbId: fromResult?.tvdbId || fromInput?.tvdbId || null,
        thumbUrl: fromResult?.thumbUrl || fromInput?.thumbUrl || '',
        assetCount: Number.isFinite(Number(fromResult?.assetCount ?? fromInput?.assetCount))
            ? Number(fromResult?.assetCount ?? fromInput?.assetCount)
            : null,
    };
};

const missingLibraryWatchNote = (watch, input) => {
    const label = String(watch?.title || input?.setMeta?.title || input?.url || 'Set').trim();
    return `Pinned on Watching (“${label}”) — will auto-apply when this title is in your library.`;
};

const needsPlexPosterSetsConfig = (config, jobType = 'apply') => {
    const dest = String(config?.applyDestination || 'plex').toLowerCase();
    if (jobType === 'apply' && (dest === 'jellyfin' || dest === 'emby')) return false;
    return true;
};

const fetchTmdbExternalIds = async (tmdbId, mediaType, loadPortalConfig) => {
    const id = String(tmdbId || '').trim();
    if (!/^\d+$/.test(id)) return { imdbId: null, tvdbId: null };
    try {
        const portal = typeof loadPortalConfig === 'function' ? await loadPortalConfig() : {};
        const apiKey = String(portal?.tmdbApiKey || '').trim();
        if (!apiKey) return { imdbId: null, tvdbId: null };
        const { createTmdbClient } = await import('../portal-request/tmdbClient.js');
        const client = createTmdbClient({ tmdbApiKey: apiKey, language: 'en' });
        const kind = resolvePosterSetsMediaType(mediaType, 'movie');
        const details = kind === 'show'
            ? await client.tv(Number(id), { appendToResponse: 'external_ids' })
            : await client.movie(Number(id), { appendToResponse: 'external_ids' });
        const external = details?.externalIds || details?.external_ids || {};
        const imdbRaw = external.imdb_id || external.imdbId || null;
        const tvdbRaw = external.tvdb_id || external.tvdbId || null;
        return {
            imdbId: imdbRaw ? String(imdbRaw).trim() : null,
            tvdbId: tvdbRaw != null && Number.isFinite(Number(tvdbRaw)) ? String(Number(tvdbRaw)) : null,
        };
    } catch {
        return { imdbId: null, tvdbId: null };
    }
};

const cliConfigPayload = (config, mediuxFilters) => {
    const dest = String(config?.applyDestination || 'plex').toLowerCase();
    const next = Array.isArray(mediuxFilters) && mediuxFilters.length
        ? { ...config, mediux_filters: mediuxFilters }
        : { ...config };
    next.apply_destination = dest;
    next.tpdb_image_cache_dir = TPDB_IMAGE_CACHE_DIR;
    next.tpdb_session_path = path.join(POSTER_SETS_DIR, 'tpdb-session.json');
    next.image_cache_dir = path.join(POSTER_SETS_DIR, 'image-cache');
    return next;
};

const hasTpdbCredentials = (config) => {
    const user = String(config?.tpdb_username || config?.tpdb_login || '').trim();
    const password = String(config?.tpdb_password || '').trim();
    return Boolean(user && password && password !== '********');
};

const resolveTmdbIdForHint = async (tmdbId, titleHint, yearHint, mediaType, loadPortalConfig) => {
    const hint = String(titleHint || '').trim();
    const pinned = String(tmdbId || '').trim();
    // Library / MediUX pins are canonical — never overwrite a known TMDB id.
    if (pinned) return pinned;
    if (!hint) return null;
    try {
        const portal = typeof loadPortalConfig === 'function' ? await loadPortalConfig() : {};
        const apiKey = String(portal?.tmdbApiKey || '').trim();
        if (!apiKey) return null;
        const { createTmdbClient } = await import('../portal-request/tmdbClient.js');
        const client = createTmdbClient({ tmdbApiKey: apiKey, language: 'en' });
        const kind = resolvePosterSetsMediaType(mediaType, 'movie');
        const yearNum = yearHint != null && Number.isFinite(Number(yearHint)) ? Number(yearHint) : null;
        const queries = yearNum != null ? [`${hint} ${yearNum}`, hint] : [hint];
        for (const q of queries) {
            const page = await client.search(q, { page: 1 });
            const results = (page?.results || []).filter((item) => (
                kind === 'show' ? item.mediaType === 'tv' : item.mediaType === 'movie'
            ));
            if (!results.length) continue;
            const hintLower = hint.toLowerCase();
            const exact = results.find((item) => String(item.title || item.name || '').trim().toLowerCase() === hintLower);
            const pick = exact || results[0];
            const id = String(pick?.id || '').trim();
            if (id) return id;
        }
    } catch {
        // TMDB hint resolve is optional.
    }
    return null;
};

const summarizeJob = (job) => ({
    id: job.id,
    type: job.type,
    state: job.state,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
    error: job.error,
    uploaded: job.result?.uploaded ?? null,
    attempted: job.result?.attempted ?? null,
    input: job.input || null,
    setMeta: pickSetMeta(job),
});

export const createPosterSetsRouter = ({
    Router,
    requireAdmin,
    requirePosterSets,
    loadPortalConfig,
    importFromPortalPlex,
    mediaLibraryDeps = null,
    resetLibraryArtwork = null,
}) => {
    const router = Router();

    router.use(requireAdmin, requirePosterSets);

    /** When true, Warm CLI skips TPDB login and uses public text search only. */
    let warmForcePublicSearch = false;

    /** Shared Warm resolve — also used to resume a queue after process restart. */
    const warmFetchTitleSets = async (item) => {
        const config = await loadPosterSetsConfig();
        const cliConfig = cliConfigPayload(config);
        if (warmForcePublicSearch || config.tpdbUseLogin === false) {
            cliConfig.tpdbUseLogin = false;
        }
        await waitForTpdbRequestSlot();
        let imdbId = null;
        let tvdbId = null;
        if (!(warmForcePublicSearch || config.tpdbUseLogin === false)) {
            try {
                const ext = await fetchTmdbExternalIds(item.tmdbId, item.mediaType, loadPortalConfig);
                imdbId = ext.imdbId;
                tvdbId = ext.tvdbId;
            } catch {
                // Optional enrichment — title+year search may still resolve.
            }
        }

        const live = await runPosterSetsCli('search', {
            provider: 'posterdb',
            tmdbId: item.tmdbId,
            imdbId,
            tvdbId,
            mediaType: item.mediaType,
            titleHint: item.title || null,
            yearHint: item.year,
            mode: 'title',
            limit: 48,
            config: cliConfig,
        }, { timeoutMs: 120_000 });

        if (!live.ok) {
            const errMsg = String(live.error || 'ThePosterDB search failed');
            const logHint = (Array.isArray(live.logs) ? live.logs : [])
                .map((line) => String(line || '').trim())
                .filter((line) => (
                    /login failed|credentials|redirected to login|session expired|lack Pro|no \/posters|<id> hits|advanced search found no|set load failed|skipping slow public/i.test(line)
                    && !/^Searching ThePosterDB/i.test(line)
                ))
                .slice(-2)
                .join(' | ');
            if (/title url is required|could not (resolve|find).*title page|found no \/posters|needs a \/posters|worker timed out|login failed|skipping slow public/i.test(errMsg)) {
                return {
                    sets: [],
                    softSkip: true,
                    softError: logHint ? `${errMsg} ${logHint}` : errMsg,
                    title: item.title,
                    logs: live.logs,
                };
            }
            throw new Error(errMsg);
        }

        const result = live.result || { sets: [] };
        if (!(result.sets || []).length) {
            return {
                ...result,
                softSkip: true,
                softError: 'No ThePosterDB sets found for this title',
            };
        }
        return result;
    };

    /** One Python process for a chunk of library titles (login optional). */
    const warmBatchRunner = async (items = [], options = {}) => {
        const config = await loadPosterSetsConfig();
        const forcePublic = warmForcePublicSearch || config.tpdbUseLogin === false;
        const enriched = [];
        for (const item of items) {
            let imdbId = null;
            let tvdbId = null;
            if (!forcePublic) {
                try {
                    const ext = await fetchTmdbExternalIds(item.tmdbId, item.mediaType, loadPortalConfig);
                    imdbId = ext.imdbId;
                    tvdbId = ext.tvdbId;
                } catch {
                    // Optional.
                }
            }
            enriched.push({
                tmdbId: item.tmdbId,
                title: item.title || '',
                year: item.year ?? null,
                mediaType: item.mediaType || 'movie',
                imdbId,
                tvdbId,
            });
        }

        const workerId = Number.isFinite(Number(options.workerId)) ? Number(options.workerId) : 0;
        const isolateSession = options.isolateSession === true;
        const cliConfig = cliConfigPayload(config);
        if (forcePublic) {
            cliConfig.tpdbUseLogin = false;
        }
        if (isolateSession && !forcePublic) {
            cliConfig.tpdb_session_path = path.join(POSTER_SETS_DIR, `tpdb-session-w${workerId}.json`);
        }

        /** @type {Array<Promise<unknown>>} */
        const pendingTitleWrites = [];
        const onTitleResult = typeof options.onTitleResult === 'function'
            ? options.onTitleResult
            : null;

        const live = await runPosterSetsCli('warm', {
            items: enriched,
            config: cliConfig,
        }, {
            timeoutMs: Math.min(3_600_000, Math.max(180_000, enriched.length * 90_000)),
            onProgress: (message) => {
                const text = String(message || '').trim();
                if (!text) return;
                const prefix = isolateSession ? `W${workerId} ` : '';
                logTpdbCacheActivity(`${prefix}${text}`, {
                    current: text.length > 96 ? `${text.slice(0, 95)}…` : text,
                    level: /login failed|aborted|stopped early/i.test(text) ? 'warn' : 'info',
                });
            },
            onBatch: (event) => {
                if (!onTitleResult) return;
                if (String(event?.phase || '') !== 'warm-title') return;
                const tmdbId = String(event?.tmdbId || event?.tmdb_id || '').trim();
                if (!tmdbId) return;
                const item = enriched.find((row) => String(row?.tmdbId || '').trim() === tmdbId) || {
                    tmdbId,
                    title: event?.title || '',
                    year: event?.year ?? null,
                    mediaType: event?.mediaType || 'movie',
                };
                pendingTitleWrites.push(Promise.resolve(onTitleResult(item, {
                    ok: event?.ok === true,
                    tmdbId,
                    title: event?.title || item.title,
                    year: event?.year ?? item.year,
                    mediaType: event?.mediaType || item.mediaType,
                    sets: Array.isArray(event?.sets) ? event.sets : [],
                    titleUrl: event?.titleUrl || event?.title_url || null,
                    softSkip: event?.softSkip === true || event?.soft_skip === true,
                    softError: event?.softError || event?.soft_error || null,
                })).catch((error) => {
                    logTpdbCacheActivity(
                        `Warm: failed to save title cache — ${error?.message || error}`,
                        { level: 'warn', detail: `tmdb ${tmdbId}` },
                    );
                }));
            },
        });

        if (pendingTitleWrites.length) {
            await Promise.all(pendingTitleWrites);
        }

        if (!live.ok && !(live.result?.results || []).length) {
            const errMsg = String(live.error || 'Warm batch failed');
            logTpdbCacheActivity(`Warm batch failed: ${errMsg}`, { level: 'error', current: false });
            return enriched.map((item) => ({
                tmdbId: item.tmdbId,
                title: item.title,
                year: item.year,
                mediaType: item.mediaType,
                sets: [],
                softSkip: true,
                softError: errMsg,
            }));
        }

        return Array.isArray(live.result?.results) ? live.result.results : [];
    };

    setTpdbWarmFetchTitleSets(warmFetchTitleSets);
    setTpdbWarmBatchRunner(warmBatchRunner);
    void resumeTpdbWarmQueueFromDisk().catch((error) => {
        logTpdbCacheActivity(
            `Warm resume failed: ${error?.message || error}`,
            { level: 'warn' },
        );
    });

    router.get('/status', async (_req, res) => {
        try {
            const config = await loadPosterSetsConfig();
            const masked = maskPosterSetsConfig(config);
            const recent = (await listJobsSorted()).slice(0, 5).map(summarizeJob);
            const portalConfig = typeof loadPortalConfig === 'function'
                ? await loadPortalConfig().catch(() => ({}))
                : {};
            const mediaServerType = String(portalConfig?.mediaServerType || 'plex').toLowerCase();
            const mediaServerLabel = mediaServerType === 'jellyfin'
                ? 'Jellyfin'
                : mediaServerType === 'emby'
                    ? 'Emby'
                    : 'Plex';
            res.json({
                ok: true,
                workerReady: posterSetsWorkerReady(),
                appDir: POSTER_SETS_APP_DIR,
                configured: masked.configured,
                mediaServerType,
                mediaServerLabel,
                config: masked,
                recentJobs: recent,
                queue: queueStats(await loadPosterSetsQueue()),
                watches: watchStats(await listPosterSetsWatches()),
            });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to load Poster Sets status' });
        }
    });

    router.get('/config', async (_req, res) => {
        try {
            const config = await loadPosterSetsConfig();
            res.json({ config: maskPosterSetsConfig(config) });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to load config' });
        }
    });

    router.put('/config', async (req, res) => {
        try {
            const saved = await savePosterSetsConfig(req.body || {});
            res.json({ ok: true, config: maskPosterSetsConfig(saved) });
        } catch (error) {
            res.status(400).json({ error: error.message || 'Failed to save config' });
        }
    });

    router.post('/import-portal', async (_req, res) => {
        try {
            if (typeof importFromPortalPlex !== 'function') {
                return res.status(500).json({ error: 'Portal Plex import is not available.' });
            }
            const imported = await importFromPortalPlex();
            if (!imported?.base_url || !imported?.token) {
                return res.status(400).json({
                    error: 'Media Player Plex URL/token are not configured. Set them under Settings → Media Player first.',
                });
            }
            const existing = await loadPosterSetsConfig();
            const saved = await savePosterSetsConfig({
                ...existing,
                base_url: imported.base_url,
                token: imported.token,
                tv_library: imported.tv_library?.length ? imported.tv_library : existing.tv_library,
                movie_library: imported.movie_library?.length ? imported.movie_library : existing.movie_library,
            });
            res.json({
                ok: true,
                config: maskPosterSetsConfig(saved),
                imported: {
                    base_url: imported.base_url,
                    tv_library: imported.tv_library || [],
                    movie_library: imported.movie_library || [],
                    librarySource: imported.librarySource || 'all',
                },
            });
        } catch (error) {
            res.status(400).json({ error: error.message || 'Failed to import from Media Player settings' });
        }
    });

    router.post('/test', async (req, res) => {
        try {
            let config = await loadPosterSetsConfig();
            if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) {
                const draft = { ...req.body };
                if (!draft.token || draft.token === '********') draft.token = config.token;
                if (!draft.tpdb_password || draft.tpdb_password === '********') {
                    draft.tpdb_password = config.tpdb_password;
                }
                config = { ...config, ...draft, token: draft.token || config.token };
            }
            const run = await runPosterSetsCli('test', { config }, { timeoutMs: 60_000 });
            if (!run.ok) {
                return res.status(400).json({ ok: false, error: run.error || 'Connection test failed', logs: run.logs });
            }
            let tpdb = null;
            if (config.tpdb_username && config.tpdb_password && config.tpdb_password !== '********') {
                const tpdbRun = await runPosterSetsCli('test-tpdb', { config }, { timeoutMs: 60_000 });
                tpdb = tpdbRun.ok
                    ? (tpdbRun.result || {})
                    : {
                        ok: false,
                        error: tpdbRun.result?.error || tpdbRun.error || 'TPDB login failed',
                        ...(tpdbRun.result && typeof tpdbRun.result === 'object' ? tpdbRun.result : {}),
                    };
            }
            res.json({ ok: true, ...(run.result || {}), tpdb, logs: run.logs });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Connection test failed' });
        }
    });

    router.post('/preview', async (req, res) => {
        try {
            const url = String(req.body?.url || '').trim();
            if (!url) return res.status(400).json({ error: 'url is required' });
            const config = await loadPosterSetsConfig();
            const filtersRaw = req.body?.mediuxFilters ?? req.body?.mediux_filters;
            const mediuxFilters = Array.isArray(filtersRaw)
                ? filtersRaw.map((item) => String(item || '').trim()).filter(Boolean)
                : [];
            const run = await runPosterSetsCli('preview', {
                config,
                url,
                ...(mediuxFilters.length ? { mediuxFilters } : {}),
            }, { timeoutMs: 180_000 });
            if (run.ok) {
                if (isTpdbUrl(url) && config.tpdbLocalCacheEnabled === true) {
                    try {
                        await saveTpdbSetCache({
                            url,
                            setMeta: run.result?.setMeta,
                            assets: run.result?.assets,
                            matched: run.result?.matched,
                            unmatched: run.result?.unmatched,
                            total: run.result?.total,
                            title: run.result?.title,
                        });
                        if (config.tpdbAggressivePrefetch === true) {
                            void enqueueTpdbLibraryTitleHydrate([{
                                url,
                                provider: 'posterdb',
                                setId: run.result?.setMeta?.setId,
                                thumbUrl: run.result?.setMeta?.thumbUrl,
                            }], {
                                libraryScoped: true,
                                force: true,
                            });
                        }
                    } catch { /* cache best-effort */ }
                }
                return res.json({ ok: true, ...(run.result || {}), logs: run.logs });
            }

            if (isTpdbUrl(url) && config.tpdbLocalCacheEnabled === true) {
                const cached = await previewFromTpdbSetCache(url);
                if (cached) {
                    return res.json({
                        ...cached,
                        partialErrors: [
                            run.error || 'Live preview failed — serving cached ThePosterDB set.',
                        ],
                        logs: run.logs,
                    });
                }
            }
            return res.status(400).json({ ok: false, error: run.error || 'Preview failed', logs: run.logs });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Preview failed' });
        }
    });

    router.post('/search', async (req, res) => {
        try {
            const providerRaw = String(req.body?.provider || '').trim().toLowerCase();
            const provider = (
                providerRaw === 'posterdb'
                || providerRaw === 'tpdb'
                || providerRaw === 'theposterdb'
            )
                ? 'posterdb'
                : providerRaw === 'mediux'
                    ? 'mediux'
                    : providerRaw === 'both' || providerRaw === 'all'
                        ? 'both'
                        : '';
            if (!provider) {
                return res.status(400).json({ error: 'provider must be mediux, posterdb, or both' });
            }

            const query = String(req.body?.query || req.body?.q || '').trim();
            const titleUrl = String(req.body?.titleUrl || req.body?.title_url || '').trim();
            const tmdbId = req.body?.tmdbId ?? req.body?.tmdb_id ?? null;
            const imdbId = req.body?.imdbId ?? req.body?.imdb_id ?? null;
            const mediaType = resolvePosterSetsMediaType(req.body?.mediaType || req.body?.media_type, 'movie');
            const modeRaw = String(req.body?.mode || 'title').trim().toLowerCase();
            const mode = ['creator', 'user', 'author', 'uploader'].includes(modeRaw) ? 'creator' : 'title';
            const posterSetsConfig = await loadPosterSetsConfig();
            // Creator catalogs paginate at the source; 0 = pull a large catalog (server-capped).
            const rawLimit = Number(req.body?.limit);
            // Title-page set scrapes need headroom — popular shows often have 40+ TPDB sets.
            const limit = mode === 'creator'
                ? (Number.isFinite(rawLimit) && rawLimit >= 0 ? Math.min(rawLimit || 10_000, 10_000) : 10_000)
                : Math.min(500, Math.max(1, rawLimit || 24));
            const savedConfig = await loadPosterSetsConfig().catch(() => ({}));
            const dupePreference = normalizeDupePreference(
                req.body?.dupePreference
                ?? req.body?.dupe_preference
                ?? savedConfig?.dupePreference,
            );

            const batchPages = Math.min(10, Math.max(1, Number(req.body?.batchPages ?? req.body?.batch_pages) || 3));

            const searchMediuxTitles = async () => {
                if (!query) throw Object.assign(new Error('query is required'), { status: 400 });
                const portal = typeof loadPortalConfig === 'function' ? await loadPortalConfig() : {};
                const apiKey = String(portal?.tmdbApiKey || '').trim();
                if (!apiKey) {
                    const err = Object.assign(
                        new Error('Add a TMDB API key in Settings to search MediUX by title (or use Find by ID).'),
                        { status: 400, code: 'TMDB_API_KEY_MISSING' },
                    );
                    throw err;
                }
                const { createTmdbClient } = await import('../portal-request/tmdbClient.js');
                const client = createTmdbClient({ tmdbApiKey: apiKey, language: 'en' });
                const page = await client.search(query, { page: 1 });
                const titles = (page?.results || [])
                    .filter((item) => item && (item.mediaType === 'movie' || item.mediaType === 'tv'))
                    .slice(0, limit)
                    .map((item) => ({
                        id: String(item.id),
                        title: item.title || item.name || 'Untitled',
                        year: item.releaseDate || item.firstAirDate
                            ? Number(String(item.releaseDate || item.firstAirDate).slice(0, 4)) || null
                            : null,
                        url: item.mediaType === 'tv'
                            ? `https://mediux.pro/shows/${item.id}`
                            : `https://mediux.pro/movies/${item.id}`,
                        mediaType: item.mediaType === 'tv' ? 'show' : 'movie',
                        thumbUrl: item.posterPath
                            ? `https://image.tmdb.org/t/p/w185${item.posterPath}`
                            : '',
                        provider: 'mediux',
                    }));
                return {
                    ok: true,
                    provider: 'mediux',
                    phase: 'titles',
                    query,
                    titles,
                    sets: [],
                    logs: [],
                };
            };

            const runCliSearch = async (providerId, extra = {}, { onBatch } = {}) => {
                const resolvedMedia = resolvePosterSetsMediaType(extra.mediaType ?? mediaType, 'movie');
                let linkedTmdb = extra.tmdbId ?? tmdbId;
                if (providerId === 'posterdb' && linkedTmdb) {
                    const titleHintVal = extra.titleHint ?? req.body?.titleHint ?? req.body?.title ?? query ?? null;
                    const yearHintVal = extra.yearHint ?? req.body?.yearHint ?? req.body?.year ?? null;
                    linkedTmdb = await resolveTmdbIdForHint(
                        linkedTmdb,
                        titleHintVal,
                        yearHintVal,
                        resolvedMedia,
                        loadPortalConfig,
                    ) || linkedTmdb;
                }
                let enrichedImdb = extra.imdbId ?? imdbId;
                let enrichedTvdb = extra.tvdbId ?? req.body?.tvdbId ?? req.body?.tvdb_id ?? null;
                if (providerId === 'posterdb' && linkedTmdb && (!enrichedTvdb || !enrichedImdb)) {
                    try {
                        const ext = await fetchTmdbExternalIds(linkedTmdb, resolvedMedia, loadPortalConfig);
                        if (!enrichedTvdb && ext.tvdbId) enrichedTvdb = ext.tvdbId;
                        if (!enrichedImdb && ext.imdbId) enrichedImdb = ext.imdbId;
                    } catch {
                        // TMDB enrichment is optional — title search may still work.
                    }
                }
                const payload = {
                    provider: providerId,
                    query,
                    titleUrl: extra.titleUrl || titleUrl,
                    mediaType: resolvedMedia,
                    tmdbId: linkedTmdb,
                    imdbId: enrichedImdb,
                    tvdbId: enrichedTvdb,
                    titleHint: extra.titleHint ?? req.body?.titleHint ?? req.body?.title ?? query ?? null,
                    yearHint: extra.yearHint ?? req.body?.yearHint ?? req.body?.year ?? null,
                    mode,
                    limit,
                    batchPages,
                    streamBatches: Boolean(onBatch),
                    config: cliConfigPayload(posterSetsConfig),
                };
                const run = await runPosterSetsCli('search', payload, {
                    timeoutMs: mode === 'creator' ? 300_000 : 120_000,
                    onBatch,
                });
                if (!run.ok) {
                    const err = Object.assign(new Error(run.error || `${providerId} search failed`), {
                        status: 400,
                        logs: run.logs,
                    });
                    throw err;
                }
                const out = { ok: true, ...(run.result || {}), logs: run.logs || [] };
                if (Array.isArray(out.partial_errors)) {
                    out.partialErrors = out.partial_errors;
                    delete out.partial_errors;
                }
                if (providerId === 'posterdb' && !(out.sets?.length) && !(out.titles?.length)) {
                    const partial = Array.isArray(out.partialErrors) ? [...out.partialErrors] : [];
                    if (!partial.length && !hasTpdbCredentials(posterSetsConfig)) {
                        partial.push(
                            'ThePosterDB login not configured — many TV titles need TMDB/TVDB advanced search. '
                            + 'Add credentials in Poster Sets → Settings, or paste a set URL in Discover.',
                        );
                    }
                    if (partial.length) out.partialErrors = partial;
                }
                return out;
            };

            const streamCreatorSearch = async (providers) => {
                if (!query) {
                    res.status(400).json({ error: 'creator username is required' });
                    return;
                }

                res.status(200);
                res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
                res.setHeader('Cache-Control', 'no-cache, no-transform');
                res.setHeader('X-Accel-Buffering', 'no');
                if (typeof res.flushHeaders === 'function') res.flushHeaders();

                const byProvider = new Map();
                let contextTitle = `@${query.replace(/^@/, '')}`;
                let writeChain = Promise.resolve();
                const logs = [];
                const errors = [];

                const writeLine = (payload) => {
                    writeChain = writeChain.then(() => {
                        if (res.writableEnded) return;
                        try {
                            res.write(`${JSON.stringify(payload)}\n`);
                            if (typeof res.flush === 'function') res.flush();
                        } catch {
                            /* client disconnected */
                        }
                    });
                    return writeChain;
                };

                const publish = (loading, extra = {}) => {
                    // Preferred provider first so Both still surfaces that source's newest-first order.
                    const preferredFirst = dupePreference === 'mediux'
                        ? ['mediux', 'posterdb']
                        : ['posterdb', 'mediux'];
                    const allSets = [];
                    for (const providerId of preferredFirst) {
                        if (byProvider.has(providerId)) allSets.push(...(byProvider.get(providerId) || []));
                    }
                    for (const [providerId, sets] of byProvider.entries()) {
                        if (!preferredFirst.includes(providerId)) allSets.push(...(sets || []));
                    }
                    const merged = mergePosterSearchSets(allSets, dupePreference, {
                        preserveOrder: true,
                        preferredCreators: posterSetsConfig?.creatorWhitelist,
                    });
                    return writeLine({
                        type: loading ? 'batch' : 'result',
                        ok: true,
                        provider,
                        phase: 'sets',
                        mode: 'creator',
                        query,
                        title: contextTitle,
                        titles: [],
                        sets: merged.sets,
                        dupesCollapsed: merged.dupesCollapsed,
                        dupePreference,
                        loading,
                        partialErrors: errors.length ? errors : undefined,
                        ...extra,
                    });
                };

                const ingestProviderSnapshot = (providerId, sets, title) => {
                    byProvider.set(providerId, Array.isArray(sets) ? sets : []);
                    if (title) contextTitle = title;
                };

                await Promise.allSettled(providers.map(async (providerId) => {
                    try {
                        const result = await runCliSearch(providerId, {}, {
                            onBatch: (event) => {
                                const snapshot = Array.isArray(event?.allSets) && event.allSets.length
                                    ? event.allSets
                                    : [
                                        ...(byProvider.get(providerId) || []),
                                        ...(Array.isArray(event?.sets) ? event.sets : []),
                                    ];
                                ingestProviderSnapshot(providerId, snapshot, event?.title);
                                void publish(true);
                            },
                        });
                        logs.push(...(result.logs || []));
                        ingestProviderSnapshot(providerId, result.sets || [], result.title);
                    } catch (error) {
                        errors.push(error?.message || `${providerId} search failed`);
                        if (Array.isArray(error?.logs)) logs.push(...error.logs);
                    }
                }));

                await writeChain;
                const total = [...byProvider.values()].reduce((sum, sets) => sum + (sets?.length || 0), 0);
                if (!total) {
                    await writeLine({
                        type: 'error',
                        ok: false,
                        error: errors[0] || 'No sets found on MediUX or ThePosterDB for that creator.',
                        logs,
                    });
                    res.end();
                    return;
                }
                await publish(false, { logs });
                res.end();
            };

            // Optional multi-source set fetch when opening a merged title from "Both".
            const titleSources = Array.isArray(req.body?.titleSources) ? req.body.titleSources : null;
            if (titleSources?.length) {
                const titleHint = String(req.body?.titleHint || req.body?.title || query || '').trim();
                const yearHint = req.body?.yearHint ?? req.body?.year ?? null;
                const linkedTmdb = titleSources.find((source) => (
                    String(source?.provider || '').toLowerCase() === 'mediux' && (source?.id || source?.tmdbId)
                ))?.id || titleSources.find((source) => source?.tmdbId)?.tmdbId
                    || tmdbId
                    || null;
                const libraryScoped = isLibraryScopedTpdbSearch({ tmdbId: linkedTmdb });
                const cacheEnabled = posterSetsConfig.tpdbLocalCacheEnabled === true;
                const titleCacheKey = libraryScoped && cacheEnabled
                    ? buildTpdbTitleCacheKey({
                        tmdbId: linkedTmdb,
                        mediaType,
                        titleHint,
                        yearHint,
                    })
                    : null;
                const cachedTitle = titleCacheKey ? await loadTpdbTitleCache(titleCacheKey) : null;

                const externalIdsPromise = linkedTmdb
                    ? fetchTmdbExternalIds(linkedTmdb, mediaType, loadPortalConfig)
                    : Promise.resolve({ imdbId: null, tvdbId: null });
                const requestMedia = resolvePosterSetsMediaType(mediaType, 'movie');
                const settled = await Promise.allSettled(titleSources.map(async (source) => {
                    const sourceProvider = String(source?.provider || '').toLowerCase() === 'mediux' ? 'mediux' : 'posterdb';
                    const sourceMedia = resolvePosterSetsMediaType(source?.mediaType, requestMedia);
                    if (sourceProvider === 'mediux') {
                        return runCliSearch('mediux', {
                            tmdbId: source?.id || source?.tmdbId || linkedTmdb || null,
                            titleUrl: '',
                            mediaType: sourceMedia,
                        });
                    }
                    // Always serve TPDB disk cache immediately when present (true SWR).
                    if (cachedTitle) {
                        if (titleCacheNeedsRevalidate(cachedTitle) && libraryScoped && cacheEnabled) {
                            void (async () => {
                                try {
                                    const externalIds = await externalIdsPromise;
                                    const live = await runCliSearch('posterdb', {
                                        tmdbId: linkedTmdb,
                                        imdbId: externalIds.imdbId || imdbId || null,
                                        tvdbId: externalIds.tvdbId || null,
                                        titleHint: titleHint || null,
                                        yearHint: source?.year ?? yearHint ?? null,
                                        mediaType: sourceMedia,
                                    });
                                    await rememberPosterdbSearchResult(live, {
                                        libraryScoped: true,
                                        tmdbId: linkedTmdb,
                                        mediaType: sourceMedia,
                                        titleHint,
                                        yearHint,
                                        titleUrl: live.titleUrl || String(source?.url || '').trim(),
                                    });
                                    void enqueueTpdbLibraryTitleHydrate(live.sets || [], {
                                        libraryScoped: true,
                                        tmdbId: linkedTmdb,
                                        titleKey: titleCacheKey,
                                    });
                                } catch {
                                    await touchTpdbTitleRevalidated(titleCacheKey).catch(() => {});
                                }
                            })();
                        }
                        logTpdbCacheActivity(
                            `Library title: serving TPDB set list from cache (${cachedTitle.sets?.length || 0} sets)`,
                            { detail: titleCacheKey },
                        );
                        return {
                            ok: true,
                            sets: cachedTitle.sets,
                            title: cachedTitle.title,
                            titleUrl: cachedTitle.titleUrl,
                            fromCache: true,
                            stale: titleCacheNeedsRevalidate(cachedTitle),
                            logs: [],
                        };
                    }
                    const externalIds = await externalIdsPromise;
                    const staleTitleUrl = String(source?.url || '').trim();
                    try {
                        logTpdbCacheActivity(
                            `Library title: live scraping TPDB set list${titleHint ? ` for ${titleHint}` : ''}`,
                            {
                                detail: linkedTmdb ? `tmdb ${linkedTmdb}` : staleTitleUrl || null,
                                current: titleHint
                                    ? `Scraping title · ${titleHint}`
                                    : 'Scraping TPDB title sets…',
                            },
                        );
                        const live = await runCliSearch('posterdb', {
                            titleUrl: staleTitleUrl,
                            tmdbId: linkedTmdb,
                            imdbId: externalIds.imdbId || imdbId || null,
                            tvdbId: externalIds.tvdbId || null,
                            titleHint: titleHint || null,
                            yearHint: source?.year ?? yearHint ?? null,
                            mediaType: sourceMedia,
                        });
                        if (libraryScoped && cacheEnabled) {
                            await rememberPosterdbSearchResult(live, {
                                libraryScoped: true,
                                tmdbId: linkedTmdb,
                                mediaType: sourceMedia,
                                titleHint,
                                yearHint,
                                titleUrl: live.titleUrl || staleTitleUrl,
                            });
                            void enqueueTpdbLibraryTitleHydrate(live.sets || [], {
                                libraryScoped: true,
                                tmdbId: linkedTmdb,
                                titleKey: titleCacheKey,
                            });
                        }
                        return live;
                    } catch (error) {
                        throw error;
                    }
                }));
                const sets = [];
                const logs = [];
                const errors = [];
                for (const result of settled) {
                    if (result.status === 'fulfilled') {
                        sets.push(...(result.value.sets || []));
                        logs.push(...(result.value.logs || []));
                        if (result.value.partialErrors?.length) {
                            errors.push(...result.value.partialErrors);
                        }
                    } else {
                        errors.push(result.reason?.message || 'Source search failed');
                        if (Array.isArray(result.reason?.logs)) logs.push(...result.reason.logs);
                    }
                }
                if (!sets.length && cachedTitle?.sets?.length) {
                    sets.push(...cachedTitle.sets);
                    errors.push('Serving cached ThePosterDB sets (live fetch failed).');
                }
                if (!sets.length && errors.length) {
                    return res.status(400).json({ ok: false, error: errors[0], logs });
                }
                const merged = mergePosterSearchSets(sets, dupePreference, {
                    preferredCreators: posterSetsConfig?.creatorWhitelist,
                });
                if (libraryScoped && cacheEnabled && (merged.sets || []).some((s) => String(s.provider).toLowerCase() === 'posterdb')) {
                    void enqueueTpdbLibraryTitleHydrate(
                        (merged.sets || []).filter((s) => String(s.provider || '').toLowerCase() === 'posterdb'),
                        { libraryScoped: true, tmdbId: linkedTmdb, titleKey: titleCacheKey },
                    );
                }
                return res.json({
                    ok: true,
                    provider: 'both',
                    phase: 'sets',
                    query,
                    title: req.body?.title || query || cachedTitle?.title || null,
                    titles: [],
                    sets: merged.sets,
                    dupesCollapsed: merged.dupesCollapsed,
                    dupePreference,
                    fromCache: Boolean(cachedTitle) && !(settled.some((r) => r.status === 'fulfilled' && !r.value?.fromCache && (r.value?.sets || []).length)),
                    partialErrors: errors,
                    logs,
                });
            }

            // Creator searches stream NDJSON batches (first ~3 pages, then more).
            if (mode === 'creator') {
                const providers = provider === 'both' ? ['mediux', 'posterdb'] : [provider];
                await streamCreatorSearch(providers);
                return;
            }

            if (provider === 'both') {
                // Title browse: MediUX via TMDB + ThePosterDB scrape, then merge.
                if (tmdbId || titleUrl) {
                    return res.status(400).json({
                        error: 'Open a specific title source with provider mediux or posterdb (or pass titleSources).',
                    });
                }
                if (!query) return res.status(400).json({ error: 'query is required' });
                const titleHint = String(req.body?.titleHint || req.body?.title || query || '').trim();
                const yearHint = req.body?.yearHint ?? req.body?.year ?? null;
                const titles = [];
                const logs = [];
                const errors = [];

                let mediuxTitles = [];
                const tpdbConfigured = hasTpdbCredentials(posterSetsConfig);
                const mediuxPromise = searchMediuxTitles().catch((error) => {
                    errors.push(error?.message || 'MediUX title search failed');
                    if (Array.isArray(error?.logs)) logs.push(...error.logs);
                    if (error?.code === 'TMDB_API_KEY_MISSING') throw error;
                    return { titles: [], logs: [] };
                });
                const posterdbTextPromise = tpdbConfigured
                    ? runCliSearch('posterdb', {
                        query,
                        titleHint,
                        yearHint,
                        mediaType,
                    }).catch((error) => {
                        errors.push(error?.message || 'ThePosterDB title search failed');
                        if (Array.isArray(error?.logs)) logs.push(...error.logs);
                        return { titles: [], logs: [] };
                    })
                    : Promise.resolve({ titles: [], logs: [] });

                let mediuxResult;
                let posterdbTextResult;
                try {
                    [mediuxResult, posterdbTextResult] = await Promise.all([mediuxPromise, posterdbTextPromise]);
                } catch (error) {
                    if (error?.code === 'TMDB_API_KEY_MISSING') {
                        return res.status(400).json({
                            ok: false,
                            error: error.message,
                            code: error.code,
                            logs,
                        });
                    }
                    throw error;
                }

                mediuxTitles = mediuxResult?.titles || [];
                titles.push(...mediuxTitles);
                logs.push(...(mediuxResult?.logs || []));
                titles.push(...(posterdbTextResult?.titles || []));
                logs.push(...(posterdbTextResult?.logs || []));

                const linkedTmdb = tmdbId || pickMediuxTmdbForHint(mediuxTitles, {
                    titleHint,
                    yearHint,
                    mediaType,
                });

                // When TMDB matched on MediUX, upgrade TPDB hits via canonical page resolve (logged-in advanced search).
                if (tpdbConfigured && linkedTmdb) {
                    try {
                        const externalIds = await fetchTmdbExternalIds(linkedTmdb, mediaType, loadPortalConfig);
                        const posterdbResolved = await runCliSearch('posterdb', {
                            tmdbId: linkedTmdb,
                            imdbId: externalIds.imdbId || imdbId || null,
                            tvdbId: externalIds.tvdbId || null,
                            titleHint,
                            yearHint,
                            mediaType,
                        });
                        const resolved = posterdbResolved?.titles || [];
                        if (resolved.length) {
                            const seen = new Set(titles.map((t) => `${t.provider}:${t.id}`));
                            for (const item of resolved) {
                                const key = `${item.provider}:${item.id}`;
                                if (!seen.has(key)) titles.push(item);
                            }
                        }
                        logs.push(...(posterdbResolved?.logs || []));
                    } catch (error) {
                        errors.push(error?.message || 'ThePosterDB title resolve failed');
                        if (Array.isArray(error?.logs)) logs.push(...error.logs);
                    }
                }
                if (!titles.length) {
                    return res.status(400).json({
                        ok: false,
                        error: errors[0] || 'No matches found.',
                        logs,
                    });
                }
                const merged = mergePosterSearchTitles(titles, dupePreference);
                return res.json({
                    ok: true,
                    provider: 'both',
                    phase: 'titles',
                    query,
                    titles: merged.titles,
                    sets: [],
                    dupesCollapsed: merged.dupesCollapsed,
                    dupePreference,
                    partialErrors: errors,
                    logs,
                });
            }

            // MediUX title search uses portal TMDB key, then scrapes the MediUX title page for sets.
            if (provider === 'mediux' && !tmdbId && !titleUrl) {
                try {
                    const result = await searchMediuxTitles();
                    return res.json(result);
                } catch (error) {
                    return res.status(error.status || 500).json({
                        error: error.message || 'Search failed',
                        code: error.code,
                    });
                }
            }

            if (provider === 'posterdb') {
                const titleHint = String(req.body?.titleHint || req.body?.title || query || '').trim();
                const yearHint = req.body?.yearHint ?? req.body?.year ?? null;
                const libraryScoped = isLibraryScopedTpdbSearch({ tmdbId });
                const cacheEnabled = posterSetsConfig.tpdbLocalCacheEnabled === true;
                const titleCacheKey = libraryScoped && cacheEnabled
                    ? buildTpdbTitleCacheKey({
                        tmdbId,
                        mediaType,
                        titleUrl,
                        titleHint,
                        yearHint,
                    })
                    : null;
                const cachedTitle = titleCacheKey ? await loadTpdbTitleCache(titleCacheKey) : null;

                if (cachedTitle) {
                    logTpdbCacheActivity(
                        `Search: serving TPDB sets from cache (${cachedTitle.sets?.length || 0})${titleHint ? ` · ${titleHint}` : ''}`,
                        { detail: titleCacheKey },
                    );
                    void (async () => {
                        if (!titleCacheNeedsRevalidate(cachedTitle) && !req.body?.refresh) return;
                        try {
                            logTpdbCacheActivity(
                                `Search: background revalidate scrape${titleHint ? ` for ${titleHint}` : ''}`,
                                { current: titleHint ? `Revalidating · ${titleHint}` : 'Revalidating TPDB title…' },
                            );
                            const live = await runCliSearch('posterdb');
                            await rememberPosterdbSearchResult(live, {
                                libraryScoped: true,
                                tmdbId,
                                mediaType,
                                titleHint,
                                yearHint,
                                titleUrl: live.titleUrl || titleUrl,
                            });
                            void enqueueTpdbLibraryTitleHydrate(live.sets || [], {
                                libraryScoped: true,
                                tmdbId,
                                titleKey: titleCacheKey,
                            });
                        } catch {
                            await touchTpdbTitleRevalidated(titleCacheKey).catch(() => {});
                        }
                    })();
                    void enqueueTpdbLibraryTitleHydrate(cachedTitle.sets || [], {
                        libraryScoped: true,
                        tmdbId,
                        titleKey: titleCacheKey,
                    });
                    return res.json({
                        ...buildCachedSearchResponse(cachedTitle, {
                            stale: titleCacheNeedsRevalidate(cachedTitle),
                        }),
                        dupePreference,
                    });
                }

                try {
                    logTpdbCacheActivity(
                        `Search: live scraping TPDB${titleHint ? ` for ${titleHint}` : ''}`,
                        {
                            detail: tmdbId ? `tmdb ${tmdbId}` : titleUrl || null,
                            current: titleHint ? `Scraping title · ${titleHint}` : 'Scraping TPDB…',
                        },
                    );
                    const result = await runCliSearch('posterdb');
                    if (libraryScoped && cacheEnabled) {
                        await rememberPosterdbSearchResult(result, {
                            libraryScoped: true,
                            tmdbId,
                            mediaType,
                            titleHint,
                            yearHint,
                            titleUrl: result.titleUrl || titleUrl,
                        });
                        void enqueueTpdbLibraryTitleHydrate(result.sets || [], {
                            libraryScoped: true,
                            tmdbId,
                            titleKey: titleCacheKey,
                        });
                    }
                    return res.json({ ok: true, ...result, dupePreference });
                } catch (error) {
                    if (cachedTitle) {
                        return res.json({
                            ...buildCachedSearchResponse(cachedTitle, {
                                stale: true,
                                partialErrors: [error?.message || 'ThePosterDB search failed'],
                            }),
                            dupePreference,
                            logs: error.logs,
                        });
                    }
                    throw error;
                }
            }

            const result = await runCliSearch(provider);
            res.json({ ok: true, ...result, dupePreference });
        } catch (error) {
            res.status(error.status || 500).json({
                error: error.message || 'Search failed',
                logs: error.logs,
                code: error.code,
            });
        }
    });

    router.get('/tpdb-cache', async (_req, res) => {
        try {
            const status = await getTpdbCacheStatus();
            res.json({ ok: true, ...status });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to read TPDB cache status' });
        }
    });

    router.post('/tpdb-cache/clear', async (_req, res) => {
        try {
            const cleared = await clearTpdbLocalCache();
            res.json({ ok: true, cleared });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to clear TPDB cache' });
        }
    });

    /**
     * Warm TPDB cache for library titles only (pass items with tmdbId / title / year / mediaType).
     * Titles are resolved one-at-a-time with spacing; set image hydrate stays under the asset rate budget.
     */
    router.post('/tpdb-cache/warm-library', async (req, res) => {
        try {
            const config = await loadPosterSetsConfig();
            if (config.tpdbLocalCacheEnabled !== true) {
                return res.status(400).json({ error: 'TPDB local cache is disabled in settings.' });
            }
            const items = Array.isArray(req.body?.items) ? req.body.items : [];
            if (!items.length) {
                return res.status(400).json({ error: 'items[] of library titles (with tmdbId) is required' });
            }
            const normalized = items.slice(0, 1000).map((item) => ({
                tmdbId: String(item?.tmdbId || item?.id || '').trim(),
                title: String(item?.title || '').trim(),
                year: item?.year ?? null,
                mediaType: resolvePosterSetsMediaType(item?.mediaType, 'movie'),
            })).filter((item) => /^\d+$/.test(item.tmdbId));

            if (!normalized.length) {
                return res.status(400).json({ error: 'No library items with numeric TMDB ids to warm.' });
            }

            if (!hasTpdbCredentials(config) || config.tpdbUseLogin === false) {
                warmForcePublicSearch = true;
                logTpdbCacheActivity(
                    config.tpdbUseLogin === false
                        ? 'Warm: TPDB login disabled — using public text search (title pages/sets/images need no login).'
                        : 'Warm: TPDB username/password not configured — using public text search.',
                    { level: 'warn', current: true },
                );
            } else {
                warmForcePublicSearch = false;
                logTpdbCacheActivity('Warm: probing TPDB login for advanced TMDB resolve (optional)', {
                    current: true,
                });
                try {
                    const loginProbe = await runPosterSetsCli('test-tpdb', {
                        config: cliConfigPayload(config),
                    }, { timeoutMs: 90_000 });
                    if (!loginProbe.ok) {
                        const probeError = loginProbe.error || 'check username/password / Pro';
                        warmForcePublicSearch = true;
                        logTpdbCacheActivity(
                            `Warm: TPDB login probe failed — ${probeError}. Continuing with public text search.`,
                            { level: 'warn', current: true },
                        );
                    } else {
                        logTpdbCacheActivity('Warm: TPDB login probe OK', { current: true });
                    }
                } catch (probeError) {
                    warmForcePublicSearch = true;
                    logTpdbCacheActivity(
                        `Warm: TPDB login probe error — ${probeError?.message || probeError}. Continuing with public text search.`,
                        { level: 'warn', current: true },
                    );
                }
            }

            let warmSoftSkips = 0;
            let warmSuccesses = 0;

            const queued = await enqueueTpdbLibraryWarm(normalized, async (item) => {
                const result = await warmFetchTitleSets(item);
                if (result?.softSkip) {
                    warmSoftSkips += 1;
                    if (warmSoftSkips === 5 && warmSuccesses === 0) {
                        logTpdbCacheActivity(
                            'Warm: first 5 titles all skipped — check TPDB Pro/login (Settings → Test) and that nightly includes the serial-scrape fix.',
                            { level: 'error', current: true },
                        );
                    }
                    return result;
                }
                if (!(result?.sets || []).length) {
                    warmSoftSkips += 1;
                    if (warmSoftSkips === 5 && warmSuccesses === 0) {
                        logTpdbCacheActivity(
                            'Warm: first 5 titles returned 0 sets — TPDB resolve/login is likely broken on this host.',
                            { level: 'error', current: true },
                        );
                    }
                    return {
                        ...result,
                        softSkip: true,
                        softError: 'No ThePosterDB sets found for this title',
                    };
                }
                warmSuccesses += 1;
                return result;
            });

            const skipped = Number(queued.skippedCached) || 0;
            const queuedCount = Number(queued.queued) || 0;
            const skipNote = skipped
                ? ` Skipped ${skipped} already cached — continuing where Warm left off.`
                : '';
            res.json({
                ok: true,
                started: true,
                titles: queuedCount,
                skippedCached: skipped,
                message: warmForcePublicSearch
                    ? `Queued ${queuedCount} library title(s) for public-search Warm (no TPDB login).${skipNote}`
                    : hasTpdbCredentials(config)
                        ? `Queued ${queuedCount} library title(s) for metadata Warm${config.tpdbWarmParallelWorkers === true ? ' (3 parallel workers)' : ''} — set lists only; images hydrate on open.${skipNote}`
                        : `Queued ${queuedCount} title(s).${skipNote}`,
            });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Warm failed' });
        }
    });

    router.post('/browse', async (req, res) => {
        try {
            if (!posterSetsWorkerReady()) {
                return res.status(503).json({ error: 'Poster Sets worker is not available in this container.' });
            }
            const refresh = Boolean(req.body?.refresh);
            const snapshot = await getBrowseRailsSnapshot({ refresh });
            res.json(snapshot);
        } catch (error) {
            res.status(error.status || 500).json({
                error: error.message || 'Browse failed',
            });
        }
    });

    router.get('/image', async (req, res) => {
        const sendPlaceholder = (status = 404) => {
            if (res.headersSent) return;
            // Prefer 404/plain over 502/JSON so Cloudflare doesn't brand this as Bad Gateway,
            // and <img onError> can swap in a local placeholder.
            res.status(status);
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'private, max-age=15');
            res.send('image unavailable');
        };
        const sendImage = (buf, contentType, { cacheHit = false } = {}) => {
            if (res.headersSent || res.writableEnded) return;
            res.status(200);
            res.setHeader('Content-Type', contentType || 'image/jpeg');
            res.setHeader(
                'Cache-Control',
                cacheHit
                    ? 'private, max-age=604800, stale-while-revalidate=604800'
                    : 'private, max-age=86400, stale-while-revalidate=604800',
            );
            res.setHeader('Content-Length', String(buf.length));
            res.setHeader('X-Poster-Sets-Cache', cacheHit ? 'HIT' : 'MISS');
            res.send(buf);
        };
        try {
            const raw = String(req.query?.url || '').trim();
            if (!raw) return sendPlaceholder(400);
            let parsed;
            try {
                parsed = new URL(raw);
            } catch {
                return sendPlaceholder(400);
            }
            const host = parsed.hostname.toLowerCase();
            const allowed = (
                host === 'api.mediux.pro'
                || host === 'mediux.pro'
                || host.endsWith('.mediux.pro')
                || host === 'theposterdb.com'
                || host === 'www.theposterdb.com'
                || host === 'images.theposterdb.com'
                || host.endsWith('.theposterdb.com')
                || host === 'image.tmdb.org'
            );
            if (!allowed) return sendPlaceholder(400);

            const cached = await loadCachedImage(raw);
            if (cached) {
                return sendImage(cached.buf, cached.contentType, { cacheHit: true });
            }

            const referer = host.includes('posterdb')
                ? 'https://theposterdb.com/'
                : host.includes('tmdb')
                    ? 'https://www.themoviedb.org/'
                    : 'https://mediux.pro/';

            await withImageProxySlot(async () => {
                if (res.writableEnded) return;
                // Another request may have filled the cache while we waited for a slot.
                const cachedAfterWait = await loadCachedImage(raw);
                if (cachedAfterWait) {
                    return sendImage(cachedAfterWait.buf, cachedAfterWait.contentType, { cacheHit: true });
                }

                let response = null;
                let lastError = null;
                for (let attempt = 0; attempt < 4; attempt += 1) {
                    try {
                        response = await fetch(raw, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                                Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                                Referer: referer,
                                'Accept-Language': 'en-US,en;q=0.9',
                            },
                            redirect: 'follow',
                            signal: AbortSignal.timeout(20_000),
                        });
                        if (response.ok) break;
                        lastError = new Error(`Upstream image failed (${response.status})`);
                        if (response.status === 429) {
                            const retryAfterRaw = Number(response.headers.get('retry-after'));
                            const waitMs = Number.isFinite(retryAfterRaw)
                                ? Math.min(8_000, Math.max(1_000, retryAfterRaw * 1000))
                                : 1_500 + attempt * 1_000;
                            await sleep(waitMs);
                            continue;
                        }
                        if (response.status >= 500) {
                            await sleep(300 + attempt * 400);
                            continue;
                        }
                        break;
                    } catch (error) {
                        lastError = error;
                        response = null;
                        await sleep(300 + attempt * 400);
                    }
                }

                if (!response?.ok) {
                    void lastError;
                    return sendPlaceholder(404);
                }
                const contentType = response.headers.get('content-type') || 'image/jpeg';
                if (!String(contentType).toLowerCase().startsWith('image/')) {
                    return sendPlaceholder(404);
                }

                const buf = Buffer.from(await response.arrayBuffer());
                if (!buf.length) return sendPlaceholder(404);
                await storeCachedImage(raw, buf, contentType);
                sendImage(buf, contentType, { cacheHit: false });
            });
        } catch {
            sendPlaceholder(404);
        }
    });

    const recoverStaleRunningJobs = async () => {
        const state = await loadPosterSetsQueue();
        const now = Date.now();
        for (const job of state.jobs || []) {
            if (job.state !== 'running') continue;
            const started = Date.parse(job.startedAt || '') || 0;
            const last = Date.parse(job.lastProgressAt || job.startedAt || '') || started;
            const runningMs = started ? now - started : 0;
            const idleMs = last ? now - last : runningMs;
            const stale = (runningMs > 5 * 60 * 1000 && idleMs > STALE_PROGRESS_MS)
                || (started && runningMs > MAX_RUNNING_MS);
            if (!stale) continue;
            if (activeQueueJobId === job.id) {
                killActivePosterSetsWorker();
                activeQueueJobId = null;
            }
            const failed = await patchPosterSetsQueueJob(job.id, {
                state: 'failed',
                finishedAt: new Date().toISOString(),
                error: 'Job stalled (no progress). Use Retry to re-queue.',
            });
            mirrorJob(failed);
            try { await upsertPosterSetsHistory(failed); } catch { /* ignore */ }
            try { await appendPosterSetsAudit(auditEntryFromJob(failed)); } catch { /* ignore */ }
        }
    };

    const runQueuedJob = async (job) => {
        activeQueueJobId = job.id;
        try {
        mirrorJob(job);
        const config = await loadPosterSetsConfig();
        const applyDest = String(config.applyDestination || 'plex').toLowerCase();
        if (needsPlexPosterSetsConfig(config, job.type) && (!config.base_url || !config.token)) {
            const failed = await patchPosterSetsQueueJob(job.id, {
                state: 'failed',
                finishedAt: new Date().toISOString(),
                error: 'Save Poster Sets settings (base URL + token) first.',
            });
            mirrorJob(failed);
            try { await upsertPosterSetsHistory(failed); } catch { /* ignore */ }
            return;
        }

        const input = job.input || {};
        let payload;
        try {
            if (job.type === 'bulk') {
                if (input.fromFile) {
                    const filePath = resolveBulkFilePath(config);
                    const fileText = await fs.readFile(filePath, 'utf8');
                    payload = { config: cliConfigPayload(config), text: fileText };
                } else if (Array.isArray(input.urls) && input.urls.length) {
                    payload = { config: cliConfigPayload(config), urls: input.urls };
                } else if (input.text) {
                    payload = { config: cliConfigPayload(config), text: String(input.text) };
                } else {
                    throw new Error('Bulk queue item is missing urls/text/file');
                }
            } else {
                const url = String(input.url || '').trim();
                if (!url) throw new Error('Queue item is missing set URL');
                const selectedIds = Array.isArray(input.selectedIds)
                    ? input.selectedIds.map((item) => String(item || '').trim()).filter(Boolean)
                    : null;
                const selectedAssets = Array.isArray(input.selectedAssets)
                    ? input.selectedAssets.filter((item) => item && typeof item === 'object')
                    : null;
                payload = {
                    config: cliConfigPayload(config, input.mediuxFilters),
                    url,
                    ...(selectedIds?.length ? { selectedIds } : {}),
                    ...(selectedAssets?.length ? { selectedAssets } : {}),
                    ...(input.plexHint ? { plexHint: input.plexHint } : {}),
                };
            }
        } catch (error) {
            const failed = await patchPosterSetsQueueJob(job.id, {
                state: 'failed',
                finishedAt: new Date().toISOString(),
                error: error?.message || 'Invalid queue item',
            });
            mirrorJob(failed);
            try { await upsertPosterSetsHistory(failed); } catch { /* ignore */ }
            return;
        }

        let progressFlushTimer = null;
        /** @type {string[]} */
        let pendingLogMessages = [];

        const flushProgressLogs = async () => {
            progressFlushTimer = null;
            if (!pendingLogMessages.length) return;
            const batch = pendingLogMessages;
            pendingLogMessages = [];
            const current = await getPosterSetsQueueJob(job.id);
            const logs = [
                ...(Array.isArray(current?.logs) ? current.logs : []),
                ...batch.map((message) => ({ at: new Date().toISOString(), message })),
            ].slice(-500);
            const patched = await patchPosterSetsQueueJob(job.id, {
                logs,
                lastProgressAt: new Date().toISOString(),
            });
            mirrorJob(patched);
        };

        const onProgress = (message) => {
            pendingLogMessages.push(String(message || ''));
            if (!progressFlushTimer) {
                progressFlushTimer = setTimeout(() => { void flushProgressLogs(); }, QUEUE_PROGRESS_DEBOUNCE_MS);
            }
        };

        try {
            let run;
            if (job.type === 'apply' && (applyDest === 'jellyfin' || applyDest === 'emby')) {
                const portalConfig = typeof loadPortalConfig === 'function'
                    ? await loadPortalConfig().catch(() => ({}))
                    : {};
                const result = await applyPosterSetToJellyfinLike({
                    portalConfig,
                    config,
                    url: payload.url,
                    selectedIds: payload.selectedIds || null,
                    mediuxFilters: input.mediuxFilters || null,
                    destination: applyDest,
                    onProgress: (message) => { onProgress(message); },
                });
                run = { ok: !!result.ok, result, logs: [] };
            } else {
                run = await runPosterSetsCli(job.type === 'bulk' ? 'bulk' : 'apply', payload, {
                    timeoutMs: applyTimeoutMs(payload),
                    onProgress: (message) => { onProgress(message); },
                });
                // Offline apply: live TPDB scrape failed but we have a hydrated set cache + local images.
                if (
                    !run.ok
                    && job.type === 'apply'
                    && isTpdbUrl(payload.url)
                    && config.tpdbLocalCacheEnabled === true
                ) {
                    const cachedPreview = await previewFromTpdbSetCache(payload.url);
                    if (cachedPreview?.assets?.length) {
                        onProgress('Live ThePosterDB apply failed — retrying from local TPDB cache…');
                        let assets = cachedPreview.assets;
                        const wanted = Array.isArray(payload.selectedIds) && payload.selectedIds.length
                            ? new Set(payload.selectedIds.map(String))
                            : null;
                        if (wanted) {
                            assets = assets.filter((asset) => wanted.has(String(asset?.id || '')));
                        }
                        if (assets.length) {
                            const offlinePayload = {
                                ...payload,
                                selectedIds: assets.map((asset) => String(asset.id)).filter(Boolean),
                                selectedAssets: assets,
                            };
                            run = await runPosterSetsCli('apply', offlinePayload, {
                                timeoutMs: applyTimeoutMs(offlinePayload),
                                onProgress: (message) => { onProgress(message); },
                            });
                            if (run.ok) {
                                onProgress(`Applied ${assets.length} asset(s) from local ThePosterDB cache.`);
                            }
                        }
                    }
                }
            }
            if (progressFlushTimer) clearTimeout(progressFlushTimer);
            await flushProgressLogs();
            const currentJob = await getPosterSetsQueueJob(job.id);
            if (currentJob?.state === 'cancelled') return;
            const finishedAt = new Date().toISOString();
            let nextInput = input;
            const setMeta = pickSetMeta({ input, result: run.result });
            if (setMeta) nextInput = { ...input, setMeta };
            const uploadedCount = Number(run.result?.uploaded);
            const attemptedCount = Number(run.result?.attempted);
            const uploadedNothing = Number.isFinite(uploadedCount) && uploadedCount <= 0
                && (
                    job.type === 'apply'
                    || job.type === 'bulk'
                    || (Number.isFinite(attemptedCount) && attemptedCount >= 0)
                );
            const succeeded = !!run.ok && !uploadedNothing;
            const failError = !succeeded
                ? (
                    run.result?.error
                    || run.error
                    || (uploadedNothing
                        ? `Applied 0 poster(s)${Number.isFinite(attemptedCount) ? ` of ${attemptedCount}` : ''} — nothing changed on the media server.`
                        : 'Apply failed')
                )
                : null;
            const patched = await patchPosterSetsQueueJob(job.id, {
                state: succeeded ? 'succeeded' : 'failed',
                finishedAt,
                error: failError,
                result: run.result || null,
                input: nextInput,
            });
            mirrorJob(patched);
            try { await upsertPosterSetsHistory(patched); } catch { /* ignore */ }
            try { await appendPosterSetsAudit(auditEntryFromJob(patched)); } catch { /* ignore */ }
            if (job.type === 'apply') {
                const selectedIds = Array.isArray(nextInput.selectedIds)
                    ? nextInput.selectedIds.map(String)
                    : [];
                if (succeeded) {
                    if (nextInput.watchId && selectedIds.length) {
                        const appliedIds = resolveAppliedAssetIdsFromResult(selectedIds, run.result);
                        if (appliedIds.length) {
                            try { await markWatchAssetsApplied(nextInput.watchId, appliedIds); } catch { /* ignore */ }
                        }
                    }
                    try {
                        await autoWatchFromApply({
                            url: nextInput.url,
                            setMeta: nextInput.setMeta || setMeta,
                            selectedIds: selectedIds.length ? selectedIds : undefined,
                            mediuxFilters: nextInput.mediuxFilters,
                            plexHint: nextInput.plexHint || null,
                        });
                    } catch { /* ignore */ }
                } else if (isMissingLibraryApplyResult(run.result)) {
                    try {
                        const watch = await autoWatchFromMissingLibrary({
                            url: nextInput.url,
                            setMeta: nextInput.setMeta || setMeta,
                            selectedIds: selectedIds.length ? selectedIds : undefined,
                            mediuxFilters: nextInput.mediuxFilters,
                            plexHint: nextInput.plexHint || null,
                        });
                        if (watch) {
                            const note = missingLibraryWatchNote(watch, nextInput);
                            const logs = [
                                ...(Array.isArray(patched.logs) ? patched.logs : []),
                                { at: new Date().toISOString(), message: note },
                            ].slice(-500);
                            const withWatch = await patchPosterSetsQueueJob(job.id, {
                                logs,
                                input: { ...nextInput, watchId: watch.id },
                            });
                            mirrorJob(withWatch);
                        }
                    } catch { /* ignore */ }
                }
            }
        } catch (error) {
            if (progressFlushTimer) clearTimeout(progressFlushTimer);
            await flushProgressLogs().catch(() => undefined);
            const currentJob = await getPosterSetsQueueJob(job.id);
            if (currentJob?.state === 'cancelled') return;
            const failed = await patchPosterSetsQueueJob(job.id, {
                state: 'failed',
                finishedAt: new Date().toISOString(),
                error: error?.message || 'Apply failed',
            });
            mirrorJob(failed);
            try { await upsertPosterSetsHistory(failed); } catch { /* ignore */ }
            try { await appendPosterSetsAudit(auditEntryFromJob(failed)); } catch { /* ignore */ }
        }
        } finally {
            activeQueueJobId = null;
        }
    };

    const tickPosterSetsQueue = async () => {
        if (queueWorkerBusy) return;
        queueWorkerBusy = true;
        try {
            await recoverStaleRunningJobs();
            const claimed = await claimNextPosterSetsJob();
            if (claimed) await runQueuedJob(claimed);
        } catch (error) {
            console.error('[poster-sets] queue worker tick failed:', error?.message || error);
        } finally {
            queueWorkerBusy = false;
        }
    };

    const ensureQueueWorker = () => {
        if (queueTickTimer) return;
        void recoverPosterSetsQueue().then(() => tickPosterSetsQueue()).catch(() => undefined);
        queueTickTimer = setInterval(() => { void tickPosterSetsQueue(); }, 1500);
        if (typeof queueTickTimer.unref === 'function') queueTickTimer.unref();
    };

    const enqueueApplyJob = async (type, input) => {
        const config = await loadPosterSetsConfig();
        const dest = String(config.applyDestination || 'plex').toLowerCase();
        if (needsPlexPosterSetsConfig(config, type) && (!config.base_url || !config.token)) {
            const error = new Error('Save Poster Sets settings (base URL + token) first.');
            error.status = 400;
            throw error;
        }
        if (type === 'apply' && (dest === 'jellyfin' || dest === 'emby')) {
            const portalConfig = typeof loadPortalConfig === 'function'
                ? await loadPortalConfig().catch(() => ({}))
                : {};
            const url = dest === 'emby'
                ? String(portalConfig.embyUrl || portalConfig.jellyfinUrl || '').trim()
                : String(portalConfig.jellyfinUrl || '').trim();
            const apiKey = dest === 'emby'
                ? String(portalConfig.embyApiKey || portalConfig.jellyfinApiKey || '').trim()
                : String(portalConfig.jellyfinApiKey || '').trim();
            if (!url || !apiKey) {
                const label = dest === 'emby' ? 'Emby' : 'Jellyfin';
                const error = new Error(`${label} URL and API key are required under Settings → Media Player.`);
                error.status = 400;
                throw error;
            }
        }
        const job = await enqueuePosterSetsJob(type, input);
        mirrorJob(job);
        ensureQueueWorker();
        void tickPosterSetsQueue();
        return job;
    };

    setPosterSetsEnqueueApply(enqueueApplyJob);
    ensureQueueWorker();

    router.post('/apply', async (req, res) => {
        try {
            const url = String(req.body?.url || '').trim();
            if (!url) return res.status(400).json({ error: 'url is required' });
            const selectedIds = Array.isArray(req.body?.selectedIds)
                ? req.body.selectedIds.map((item) => String(item || '').trim()).filter(Boolean)
                : null;
            const setMeta = req.body?.setMeta && typeof req.body.setMeta === 'object'
                ? req.body.setMeta
                : null;
            const sourceRaw = String(req.body?.source || '').trim().toLowerCase();
            const source = sourceRaw === 'bulk' || sourceRaw === 'watch' ? sourceRaw : 'manual';
            const mediuxFilters = Array.isArray(req.body?.mediuxFilters)
                ? req.body.mediuxFilters.map((item) => String(item || '').trim()).filter(Boolean)
                : (Array.isArray(req.body?.mediux_filters)
                    ? req.body.mediux_filters.map((item) => String(item || '').trim()).filter(Boolean)
                    : null);
            const plexHint = req.body?.plexHint && typeof req.body.plexHint === 'object'
                ? req.body.plexHint
                : null;
            const selectedAssets = Array.isArray(req.body?.selectedAssets)
                ? req.body.selectedAssets.filter((item) => item && typeof item === 'object')
                : null;
            const job = await enqueueApplyJob('apply', {
                url,
                selectedIds: selectedIds?.length ? selectedIds : null,
                selectedCount: selectedIds?.length || null,
                setMeta,
                source,
                ...(mediuxFilters?.length ? { mediuxFilters } : {}),
                ...(plexHint ? { plexHint } : {}),
                ...(selectedAssets?.length ? { selectedAssets } : {}),
            });
            res.status(202).json({ ok: true, jobId: job.id, job, queued: true });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.message || 'Apply failed' });
        }
    });

    router.post('/bulk', async (req, res) => {
        try {
            const urls = Array.isArray(req.body?.urls) ? req.body.urls : null;
            const text = String(req.body?.text || '');
            const useFile = !!req.body?.fromFile;
            let input = { fromFile: useFile };

            if (useFile) {
                const config = await loadPosterSetsConfig();
                const filePath = resolveBulkFilePath(config);
                try {
                    const fileText = await fs.readFile(filePath, 'utf8');
                    input = {
                        fromFile: true,
                        file: config.bulk_txt,
                        text: fileText,
                        lineCount: fileText.split(/\r?\n/).filter((line) => {
                            const trimmed = line.trim();
                            return trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('//');
                        }).length,
                    };
                } catch (error) {
                    if (error?.code === 'ENOENT') {
                        return res.status(400).json({ error: `Bulk file not found: ${config.bulk_txt}` });
                    }
                    throw error;
                }
            } else if (urls?.length) {
                input = { urls, count: urls.length };
            } else if (text.trim()) {
                const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => (
                    line && !line.startsWith('#') && !line.startsWith('//')
                ));
                input = { urls: lines.slice(0, 8), text, count: lines.length };
            } else {
                return res.status(400).json({ error: 'Provide urls, text, or fromFile for bulk apply' });
            }

            const job = await enqueueApplyJob('bulk', input);
            res.status(202).json({ ok: true, jobId: job.id, job, queued: true });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.message || 'Bulk apply failed' });
        }
    });

    router.get('/queue', async (_req, res) => {
        try {
            const state = await loadPosterSetsQueue();
            res.json({
                ok: true,
                paused: state.paused,
                stats: queueStats(state),
                jobs: state.jobs.map((job) => ({
                    ...summarizeJob(job),
                    logCount: Array.isArray(job.logs) ? job.logs.length : 0,
                    startedAt: job.startedAt || null,
                })),
            });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to load queue' });
        }
    });

    router.post('/queue/pause', async (req, res) => {
        try {
            const paused = req.body?.paused !== undefined ? Boolean(req.body.paused) : true;
            const state = await setPosterSetsQueuePaused(paused);
            ensureQueueWorker();
            if (!paused) void tickPosterSetsQueue();
            res.json({ ok: true, paused: state.paused, stats: queueStats(state) });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to update queue pause' });
        }
    });

    router.post('/queue/cancel/:id', async (req, res) => {
        try {
            const cancelled = await cancelPosterSetsQueueJob(req.params.id);
            if (!cancelled) {
                return res.status(404).json({ error: 'Queued job not found (only pending items can be cancelled).' });
            }
            mirrorJob(cancelled);
            try { await upsertPosterSetsHistory(cancelled); } catch { /* ignore */ }
            res.json({ ok: true, job: summarizeJob(cancelled) });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to cancel queue item' });
        }
    });

    router.post('/queue/stop/:id', async (req, res) => {
        try {
            const job = await getPosterSetsQueueJob(req.params.id);
            if (!job || job.state !== 'running') {
                return res.status(404).json({ error: 'Running job not found.' });
            }
            if (activeQueueJobId === job.id) {
                killActivePosterSetsWorker();
                activeQueueJobId = null;
            }
            const stopped = await stopPosterSetsRunningJob(job.id);
            if (!stopped) {
                return res.status(404).json({ error: 'Running job not found.' });
            }
            mirrorJob(stopped);
            try { await upsertPosterSetsHistory(stopped); } catch { /* ignore */ }
            res.json({ ok: true, job: summarizeJob(stopped) });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to stop queue item' });
        }
    });

    router.post('/queue/retry/:id', async (req, res) => {
        try {
            const retried = await retryPosterSetsQueueJob(req.params.id);
            if (!retried) {
                return res.status(404).json({ error: 'Failed or cancelled job not found.' });
            }
            mirrorJob(retried);
            ensureQueueWorker();
            void tickPosterSetsQueue();
            res.status(202).json({ ok: true, job: summarizeJob(retried) });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to retry queue item' });
        }
    });

    router.post('/queue/clear-finished', async (_req, res) => {
        try {
            const state = await clearPosterSetsFinishedQueue();
            res.json({ ok: true, stats: queueStats(state), jobs: state.jobs.map(summarizeJob) });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to clear finished queue items' });
        }
    });

    router.post('/queue/clear-queued', async (_req, res) => {
        try {
            const { state, cancelled, cancelledJobs } = await clearPosterSetsQueuedJobs();
            for (const job of cancelledJobs || []) {
                mirrorJob(job);
                try { await upsertPosterSetsHistory(job); } catch { /* ignore */ }
            }
            res.json({ ok: true, cancelled, stats: queueStats(state), jobs: state.jobs.map(summarizeJob) });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to clear queued items' });
        }
    });

    router.get('/watches', async (req, res) => {
        try {
            const watches = await listPosterSetsWatches();
            const urlFilter = String(req.query?.url || '').trim();
            if (urlFilter) {
                const match = watches.find((watch) => watch.url === urlFilter) || null;
                return res.json({ ok: true, watch: match, watches: match ? [match] : [], stats: watchStats(watches) });
            }
            res.json({ ok: true, watches, stats: watchStats(watches) });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to load watches' });
        }
    });

    router.post('/watches', async (req, res) => {
        try {
            const watch = await upsertPosterSetsWatch(req.body || {});
            // Baseline fingerprints immediately so pinning an existing set doesn't re-apply everything.
            try {
                await checkPosterSetsWatch(watch, { enqueue: false });
            } catch {
                /* keep watch even if baseline scrape fails */
            }
            const refreshed = await getPosterSetsWatch(watch.id);
            res.status(201).json({ ok: true, watch: refreshed || watch });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.message || 'Failed to save watch' });
        }
    });

    router.patch('/watches/:id', async (req, res) => {
        try {
            const current = await getPosterSetsWatch(req.params.id);
            if (!current) return res.status(404).json({ error: 'Watch not found' });
            const body = req.body && typeof req.body === 'object' ? req.body : {};
            const patch = {};
            if (body.mediuxFilters !== undefined || body.mediux_filters !== undefined) {
                patch.mediuxFilters = body.mediuxFilters ?? body.mediux_filters;
            }
            if (body.enabled !== undefined) patch.enabled = Boolean(body.enabled);
            if (body.title !== undefined) patch.title = body.title;
            if (body.user !== undefined) patch.user = body.user;
            if (body.thumbUrl !== undefined) patch.thumbUrl = body.thumbUrl;
            if (body.setKind !== undefined || body.set_kind !== undefined) {
                patch.setKind = body.setKind ?? body.set_kind;
            }
            const watch = await patchPosterSetsWatch(current.id, patch);
            res.json({ ok: true, watch });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to update watch' });
        }
    });

    router.post('/watches/:id/toggle', async (req, res) => {
        try {
            const current = await getPosterSetsWatch(req.params.id);
            if (!current) return res.status(404).json({ error: 'Watch not found' });
            const enabled = req.body?.enabled !== undefined ? Boolean(req.body.enabled) : !current.enabled;
            const watch = await patchPosterSetsWatch(current.id, { enabled });
            res.json({ ok: true, watch });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to toggle watch' });
        }
    });

    router.post('/watches/:id/check', async (req, res) => {
        try {
            const current = await getPosterSetsWatch(req.params.id);
            if (!current) return res.status(404).json({ error: 'Watch not found' });
            const result = await checkPosterSetsWatch(current, { enqueue: req.body?.enqueue !== false });
            res.json({ ok: true, ...result });
        } catch (error) {
            try {
                await patchPosterSetsWatch(req.params.id, {
                    lastCheckedAt: new Date().toISOString(),
                    lastError: error?.message || String(error),
                });
            } catch { /* ignore */ }
            res.status(400).json({ error: error.message || 'Watch check failed' });
        }
    });

    router.post('/watches/:id/reapply', async (req, res) => {
        try {
            const current = await getPosterSetsWatch(req.params.id);
            if (!current) return res.status(404).json({ error: 'Watch not found' });
            const modeRaw = String(req.body?.mode || '').trim().toLowerCase();
            const mode = modeRaw === 'matched' ? 'matched' : (modeRaw === 'entire' ? 'entire' : '');
            if (!mode) {
                return res.status(400).json({ error: 'mode must be "entire" or "matched"' });
            }
            const result = await reapplyPosterSetsWatch(current, { mode });
            res.status(202).json({ ok: true, ...result });
        } catch (error) {
            try {
                await patchPosterSetsWatch(req.params.id, {
                    lastCheckedAt: new Date().toISOString(),
                    lastError: error?.message || String(error),
                });
            } catch { /* ignore */ }
            res.status(error.status || 400).json({ error: error.message || 'Reapply failed' });
        }
    });

    router.post('/watches/run', async (_req, res) => {
        // Checking dozens of watches can take many minutes (TPDB/MediUX scrape per pin).
        // Return immediately so reverse proxies don't 502 the long request.
        clearStalePosterSetsWatcherIfNeeded('stale-before-kick');
        if (watchPassKickInFlight && !isPosterSetsWatcherBusy()) {
            // Kick flag left behind without an active pass (crashed async).
            watchPassKickInFlight = false;
        }
        if (watchPassKickInFlight || isPosterSetsWatcherBusy()) {
            const status = getPosterSetsWatcherPassStatus();
            return res.status(409).json({
                ok: false,
                started: false,
                running: true,
                status,
                error: status.stale
                    ? 'A watcher pass looks stuck. Use Unlock check on Logs, then try again.'
                    : status.checked
                        ? `A check is already running (${status.checked}/${status.total || '?'}${status.currentTitle ? `: ${status.currentTitle}` : ''}). Open Logs → Audit log.`
                        : 'A watcher pass is already running. Open Logs → Audit log for progress.',
            });
        }
        watchPassKickInFlight = true;
        // If the background task never sets busy (crash before await), clear kick after 90s.
        const kickWatchdog = setTimeout(() => {
            if (watchPassKickInFlight && !isPosterSetsWatcherBusy()) {
                watchPassKickInFlight = false;
            }
        }, 90_000);
        if (typeof kickWatchdog.unref === 'function') kickWatchdog.unref();

        try {
            await finalizeRunningWatchCheckAudits('Superseded — a newer Check all started.');
        } catch { /* ignore */ }

        let checkAllAuditId = null;
        try {
            const started = await appendPosterSetsAudit({
                action: 'watch_check',
                source: 'watcher',
                title: 'Check all watches',
                state: 'running',
                detail: 'Check all started — scanning pinned sets in the background. Progress appears under Audit log (not Running jobs).',
                at: new Date().toISOString(),
            });
            checkAllAuditId = started?.id || null;
        } catch { /* ignore */ }

        res.json({
            ok: true,
            started: true,
            running: true,
            message: 'Watcher pass started in the background. Open Logs → Audit log for progress.',
        });

        void (async () => {
            const patchCheckAllAudit = async (fields) => {
                if (!checkAllAuditId) {
                    try {
                        const created = await appendPosterSetsAudit({
                            action: 'watch_check',
                            source: 'watcher',
                            title: 'Check all watches',
                            ...fields,
                            at: new Date().toISOString(),
                        });
                        checkAllAuditId = created?.id || null;
                    } catch { /* ignore */ }
                    return;
                }
                try {
                    await patchPosterSetsAudit(checkAllAuditId, {
                        ...fields,
                        at: new Date().toISOString(),
                    });
                } catch { /* ignore */ }
            };

            try {
                const result = await runPosterSetsWatcherPass({
                    forceAll: true,
                    notify: true,
                    onProgress: async (progress) => {
                        if (!progress?.checked) return;
                        await patchCheckAllAudit({
                            checked: progress.checked ?? null,
                            queued: progress.queued ?? null,
                            assetsQueued: progress.assetsQueued ?? null,
                            state: 'running',
                            detail: `Progress ${progress.checked}/${progress.total || '?'}`
                                + (progress.currentTitle ? ` — ${progress.currentTitle}` : '')
                                + `; queued ${progress.queued || 0} watch(es) / ${progress.assetsQueued || 0} asset(s).`,
                        });
                    },
                });
                const errorCount = Array.isArray(result.errors) ? result.errors.length : 0;
                await patchCheckAllAudit({
                    checked: result.checked ?? null,
                    queued: result.queued ?? null,
                    assetsQueued: result.assetsQueued ?? null,
                    state: result.skipped
                        ? 'idle'
                        : errorCount
                            ? 'partial'
                            : (result.queued ? 'queued' : 'idle'),
                    error: errorCount
                        ? `${errorCount} watch check error(s)`
                        : null,
                    detail: result.skipped
                        ? `Skipped: ${result.reason || 'disabled'} (another pass held the lock).`
                        : `Finished — checked ${result.checked || 0}; queued ${result.queued || 0} watch(es) / ${result.assetsQueued || 0} asset(s).`,
                });
            } catch (error) {
                await patchCheckAllAudit({
                    state: 'failed',
                    error: error?.message || 'Watcher pass failed',
                    detail: 'Check all failed in the background.',
                });
            } finally {
                clearTimeout(kickWatchdog);
                watchPassKickInFlight = false;
            }
        })();
    });

    router.get('/watches/run-status', async (_req, res) => {
        clearStalePosterSetsWatcherIfNeeded('stale-status-poll');
        res.json({
            ok: true,
            kickInFlight: watchPassKickInFlight,
            status: getPosterSetsWatcherPassStatus(),
        });
    });

    router.post('/watches/run-unlock', async (_req, res) => {
        watchPassKickInFlight = false;
        const result = resetPosterSetsWatcherBusy('manual-unlock');
        try {
            const finalized = await finalizeRunningWatchCheckAudits(
                result.wasBusy
                    ? 'Watcher lock cleared manually — you can run Check all again.'
                    : 'Unlock requested; no active watcher lock was held.',
            );
            if (!finalized) {
                await appendPosterSetsAudit({
                    action: 'watch_check',
                    source: 'watcher',
                    title: 'Check all watches',
                    state: 'idle',
                    detail: result.wasBusy
                        ? 'Watcher lock cleared manually — you can run Check all again.'
                        : 'Unlock requested; no active watcher lock was held.',
                    at: new Date().toISOString(),
                });
            }
        } catch { /* ignore */ }
        res.json({
            ok: true,
            ...result,
            kickInFlight: watchPassKickInFlight,
        });
    });

    router.post('/watches/hook', async (req, res) => {
        try {
            const result = await runPosterSetsArrHookNow(req.body || {});
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: error.message || 'ARR watch hook failed' });
        }
    });

    router.delete('/watches/:id', async (req, res) => {
        try {
            const removed = await deletePosterSetsWatch(req.params.id);
            if (!removed) return res.status(404).json({ error: 'Watch not found' });
            res.json({ ok: true, watch: removed });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to delete watch' });
        }
    });

    router.get('/audit', async (req, res) => {
        try {
            const limit = Number(req.query?.limit) || 100;
            const entries = await listPosterSetsAudit(limit);
            res.json({ ok: true, entries });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to load audit log' });
        }
    });

    router.get('/title-status', async (req, res) => {
        try {
            const title = String(req.query.title || '').trim();
            if (!title) return res.status(400).json({ error: 'title is required' });
            const status = await resolvePosterSetsTitleStatus({
                title,
                mediaType: String(req.query.mediaType || req.query.media_type || '').trim(),
                ratingKey: String(req.query.ratingKey || req.query.rating_key || '').trim(),
            });
            res.json({ ok: true, ...status });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to load title status' });
        }
    });

    router.post('/title-watch', async (req, res) => {
        try {
            const body = req.body && typeof req.body === 'object' ? req.body : {};
            const title = String(body.title || '').trim();
            if (!title) return res.status(400).json({ error: 'title is required' });
            const status = await resolvePosterSetsTitleStatus({
                title,
                mediaType: String(body.mediaType || body.media_type || '').trim(),
                ratingKey: String(body.ratingKey || body.rating_key || '').trim(),
            });
            const result = await togglePosterSetsTitleWatch({
                ratingKey: String(body.ratingKey || body.rating_key || '').trim(),
                title,
                mediaType: String(body.mediaType || body.media_type || '').trim(),
                setUrl: String(body.setUrl || body.set_url || body.url || '').trim() || null,
                enabled: body.enabled !== undefined ? Boolean(body.enabled) : undefined,
                setMeta: body.setMeta && typeof body.setMeta === 'object' ? body.setMeta : null,
                lastApplyUrl: status.lastApply?.url || null,
            });
            if (result.enabled) {
                try {
                    await checkPosterSetsWatch(result.watch, { enqueue: false });
                } catch {
                    /* baseline optional */
                }
            }
            const refreshed = result.watch?.id
                ? await getPosterSetsWatch(result.watch.id)
                : result.watch;
            res.json({
                ok: true,
                enabled: result.enabled,
                watch: refreshed || result.watch || null,
                titleWatch: result.titleWatch,
            });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.message || 'Failed to update title watch' });
        }
    });

    router.post('/reset-art', async (req, res) => {
        try {
            const ratingKey = String(req.body?.ratingKey || req.body?.rating_key || '').trim();
            const mediaType = String(req.body?.mediaType || req.body?.media_type || '').trim().toLowerCase();
            const scope = String(req.body?.scope || 'poster').trim().toLowerCase();
            if (!ratingKey) return res.status(400).json({ error: 'ratingKey is required' });
            if (!mediaType || !['movie', 'show'].includes(mediaType)) {
                return res.status(400).json({ error: 'mediaType must be movie or show' });
            }
            if (typeof resetLibraryArtwork !== 'function') {
                return res.status(503).json({ error: 'Artwork reset is not configured on this server.' });
            }
            const portalConfig = typeof loadPortalConfig === 'function'
                ? await loadPortalConfig().catch(() => ({}))
                : {};
            const serverType = String(portalConfig?.mediaServerType || 'plex').toLowerCase();
            if (serverType !== 'plex') {
                return res.status(501).json({ error: 'Artwork reset is supported for Plex libraries only.' });
            }
            const result = await resetLibraryArtwork(portalConfig, mediaLibraryDeps, {
                ratingKey,
                mediaType,
                scope,
            });
            res.json({ ok: true, ...result });
        } catch (error) {
            res.status(400).json({ error: error.message || 'Failed to reset artwork' });
        }
    });

    router.get('/jobs', async (_req, res) => {
        try {
            const all = await listJobsSorted();
            res.json({
                ok: true,
                jobs: all.map((job) => ({
                    ...summarizeJob(job),
                    logCount: Array.isArray(job.logs) ? job.logs.length : 0,
                })),
            });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to list jobs' });
        }
    });

    router.get('/jobs/:id', async (req, res) => {
        const id = String(req.params.id || '');
        let job = await getJob(id);
        if (!job) {
            const history = await loadPosterSetsHistory();
            job = history.find((entry) => entry.id === id) || null;
        }
        if (!job) return res.status(404).json({ error: 'Job not found' });
        res.json({ job });
    });

    // loadPortalConfig reserved for future helpers
    void loadPortalConfig;

    return router;
};
