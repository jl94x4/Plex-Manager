import {
    loadPosterSetsConfig,
    maskPosterSetsConfig,
    savePosterSetsConfig,
    resolveBulkFilePath,
    POSTER_SETS_DIR,
    ensurePosterSetsDir,
} from './config.js';
import { loadPosterSetsHistory, upsertPosterSetsHistory } from './history.js';
import { posterSetsWorkerReady, runPosterSetsCli, POSTER_SETS_APP_DIR } from './runner.js';
import {
    mergePosterSearchSets,
    mergePosterSearchTitles,
    normalizeDupePreference,
} from './searchMerge.js';
import { getBrowseRailsSnapshot } from './browse.js';
import {
    cancelPosterSetsQueueJob,
    claimNextPosterSetsJob,
    clearPosterSetsFinishedQueue,
    enqueuePosterSetsJob,
    getPosterSetsQueueJob,
    loadPosterSetsQueue,
    patchPosterSetsQueueJob,
    queueStats,
    recoverPosterSetsQueue,
    setPosterSetsQueuePaused,
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
    listPosterSetsAudit,
} from './audit.js';
import {
    autoWatchFromApply,
    checkPosterSetsWatch,
    markWatchAssetsApplied,
    runPosterSetsWatcherPass,
    setPosterSetsEnqueueApply,
    setPosterSetsNotifyDigest,
    startPosterSetsWatcher,
} from './watcher.js';
import { runPosterSetsArrHookNow, schedulePosterSetsArrHook } from './arr-hook.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export { startPosterSetsWatcher, setPosterSetsNotifyDigest, schedulePosterSetsArrHook };

const jobs = new Map();
let queueWorkerBusy = false;
let queueTickTimer = null;

/**
 * TPDB rate-limits /api/assets (~30/window). Cache thumbs so grids don't re-hit upstream.
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
}) => {
    const router = Router();

    router.use(requireAdmin, requirePosterSets);

    router.get('/status', async (_req, res) => {
        try {
            const config = await loadPosterSetsConfig();
            const masked = maskPosterSetsConfig(config);
            const recent = (await listJobsSorted()).slice(0, 5).map(summarizeJob);
            res.json({
                ok: true,
                workerReady: posterSetsWorkerReady(),
                appDir: POSTER_SETS_APP_DIR,
                configured: masked.configured,
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
                config = { ...config, ...draft, token: draft.token || config.token };
            }
            const run = await runPosterSetsCli('test', { config }, { timeoutMs: 60_000 });
            if (!run.ok) {
                return res.status(400).json({ ok: false, error: run.error || 'Connection test failed', logs: run.logs });
            }
            res.json({ ok: true, ...(run.result || {}), logs: run.logs });
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
            if (!run.ok) {
                return res.status(400).json({ ok: false, error: run.error || 'Preview failed', logs: run.logs });
            }
            res.json({ ok: true, ...(run.result || {}), logs: run.logs });
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
            const mediaType = String(req.body?.mediaType || req.body?.media_type || 'movie').trim().toLowerCase();
            const modeRaw = String(req.body?.mode || 'title').trim().toLowerCase();
            const mode = ['creator', 'user', 'author', 'uploader'].includes(modeRaw) ? 'creator' : 'title';
            // Creator catalogs paginate at the source; 0 = pull a large catalog (server-capped).
            const rawLimit = Number(req.body?.limit);
            const limit = mode === 'creator'
                ? (Number.isFinite(rawLimit) && rawLimit >= 0 ? Math.min(rawLimit || 10_000, 10_000) : 10_000)
                : Math.min(40, Math.max(1, rawLimit || 24));
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
                const payload = {
                    provider: providerId,
                    query,
                    titleUrl: extra.titleUrl || titleUrl,
                    mediaType: mediaType === 'tv' || mediaType === 'show' ? 'show' : 'movie',
                    tmdbId: extra.tmdbId ?? tmdbId,
                    mode,
                    limit,
                    batchPages,
                    streamBatches: Boolean(onBatch),
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
                return { ok: true, ...(run.result || {}), logs: run.logs || [] };
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
                    const merged = mergePosterSearchSets(allSets, dupePreference, { preserveOrder: true });
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
                const settled = await Promise.allSettled(titleSources.map((source) => {
                    const sourceProvider = String(source?.provider || '').toLowerCase() === 'mediux' ? 'mediux' : 'posterdb';
                    if (sourceProvider === 'mediux') {
                        return runCliSearch('mediux', {
                            tmdbId: source?.id || source?.tmdbId || null,
                            titleUrl: '',
                        });
                    }
                    return runCliSearch('posterdb', {
                        titleUrl: String(source?.url || '').trim(),
                        tmdbId: null,
                    });
                }));
                const sets = [];
                const logs = [];
                const errors = [];
                for (const result of settled) {
                    if (result.status === 'fulfilled') {
                        sets.push(...(result.value.sets || []));
                        logs.push(...(result.value.logs || []));
                    } else {
                        errors.push(result.reason?.message || 'Source search failed');
                        if (Array.isArray(result.reason?.logs)) logs.push(...result.reason.logs);
                    }
                }
                if (!sets.length && errors.length) {
                    return res.status(400).json({ ok: false, error: errors[0], logs });
                }
                const merged = mergePosterSearchSets(sets, dupePreference);
                return res.json({
                    ok: true,
                    provider: 'both',
                    phase: 'sets',
                    query,
                    title: req.body?.title || query || null,
                    titles: [],
                    sets: merged.sets,
                    dupesCollapsed: merged.dupesCollapsed,
                    dupePreference,
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
                const settled = await Promise.allSettled([
                    searchMediuxTitles(),
                    runCliSearch('posterdb'),
                ]);
                const titles = [];
                const logs = [];
                const errors = [];
                for (const result of settled) {
                    if (result.status === 'fulfilled') {
                        titles.push(...(result.value.titles || []));
                        logs.push(...(result.value.logs || []));
                    } else {
                        errors.push(result.reason?.message || 'Provider search failed');
                        if (Array.isArray(result.reason?.logs)) logs.push(...result.reason.logs);
                        if (result.reason?.code === 'TMDB_API_KEY_MISSING' && settled.every((entry) => entry.status === 'rejected')) {
                            return res.status(400).json({
                                ok: false,
                                error: result.reason.message,
                                code: result.reason.code,
                                logs,
                            });
                        }
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

    const runQueuedJob = async (job) => {
        mirrorJob(job);
        const config = await loadPosterSetsConfig();
        if (!config.base_url || !config.token) {
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
                    payload = { config, text: fileText };
                } else if (Array.isArray(input.urls) && input.urls.length) {
                    payload = { config, urls: input.urls };
                } else if (input.text) {
                    payload = { config, text: String(input.text) };
                } else {
                    throw new Error('Bulk queue item is missing urls/text/file');
                }
            } else {
                const url = String(input.url || '').trim();
                if (!url) throw new Error('Queue item is missing set URL');
                const selectedIds = Array.isArray(input.selectedIds)
                    ? input.selectedIds.map((item) => String(item || '').trim()).filter(Boolean)
                    : null;
                payload = {
                    config: Array.isArray(input.mediuxFilters) && input.mediuxFilters.length
                        ? { ...config, mediux_filters: input.mediuxFilters }
                        : config,
                    url,
                    ...(selectedIds?.length ? { selectedIds } : {}),
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

        try {
            const run = await runPosterSetsCli(job.type === 'bulk' ? 'bulk' : 'apply', payload, {
                timeoutMs: 45 * 60_000,
                onProgress: async (message) => {
                    const current = await getPosterSetsQueueJob(job.id);
                    const logs = [
                        ...(Array.isArray(current?.logs) ? current.logs : []),
                        { at: new Date().toISOString(), message },
                    ].slice(-500);
                    const patched = await patchPosterSetsQueueJob(job.id, { logs });
                    mirrorJob(patched);
                },
            });
            const finishedAt = new Date().toISOString();
            let nextInput = input;
            const setMeta = pickSetMeta({ input, result: run.result });
            if (setMeta) nextInput = { ...input, setMeta };
            const patched = await patchPosterSetsQueueJob(job.id, {
                state: run.ok ? 'succeeded' : 'failed',
                finishedAt,
                error: run.ok ? null : (run.error || 'Apply failed'),
                result: run.result || null,
                input: nextInput,
            });
            mirrorJob(patched);
            try { await upsertPosterSetsHistory(patched); } catch { /* ignore */ }
            try { await appendPosterSetsAudit(auditEntryFromJob(patched)); } catch { /* ignore */ }
            if (run.ok && job.type === 'apply') {
                const selectedIds = Array.isArray(nextInput.selectedIds)
                    ? nextInput.selectedIds.map(String)
                    : [];
                if (nextInput.watchId && selectedIds.length) {
                    try { await markWatchAssetsApplied(nextInput.watchId, selectedIds); } catch { /* ignore */ }
                }
                try {
                    await autoWatchFromApply({
                        url: nextInput.url,
                        setMeta: nextInput.setMeta || setMeta,
                        selectedIds: selectedIds.length ? selectedIds : undefined,
                        mediuxFilters: nextInput.mediuxFilters,
                    });
                } catch { /* ignore */ }
            }
        } catch (error) {
            const failed = await patchPosterSetsQueueJob(job.id, {
                state: 'failed',
                finishedAt: new Date().toISOString(),
                error: error?.message || 'Apply failed',
            });
            mirrorJob(failed);
            try { await upsertPosterSetsHistory(failed); } catch { /* ignore */ }
            try { await appendPosterSetsAudit(auditEntryFromJob(failed)); } catch { /* ignore */ }
        }
    };

    const tickPosterSetsQueue = async () => {
        if (queueWorkerBusy) return;
        queueWorkerBusy = true;
        try {
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
        if (!config.base_url || !config.token) {
            const error = new Error('Save Poster Sets settings (base URL + token) first.');
            error.status = 400;
            throw error;
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
            const job = await enqueueApplyJob('apply', {
                url,
                selectedIds: selectedIds?.length ? selectedIds : null,
                selectedCount: selectedIds?.length || null,
                setMeta,
                source,
                ...(mediuxFilters?.length ? { mediuxFilters } : {}),
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

    router.post('/queue/clear-finished', async (_req, res) => {
        try {
            const state = await clearPosterSetsFinishedQueue();
            res.json({ ok: true, stats: queueStats(state), jobs: state.jobs.map(summarizeJob) });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to clear finished queue items' });
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

    router.post('/watches/run', async (_req, res) => {
        try {
            const result = await runPosterSetsWatcherPass({ forceAll: true });
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message || 'Watcher pass failed' });
        }
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
