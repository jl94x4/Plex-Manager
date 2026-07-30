import crypto from 'crypto';
import {
    loadPosterSetsConfig,
    maskPosterSetsConfig,
    savePosterSetsConfig,
    resolveBulkFilePath,
} from './config.js';
import { loadPosterSetsHistory, upsertPosterSetsHistory } from './history.js';
import { posterSetsWorkerReady, runPosterSetsCli, POSTER_SETS_APP_DIR } from './runner.js';
import {
    mergePosterSearchSets,
    mergePosterSearchTitles,
    normalizeDupePreference,
} from './searchMerge.js';
import fs from 'fs/promises';

const jobs = new Map();

const getJob = (id) => jobs.get(String(id)) || null;

const createJob = (type, input = null) => {
    const id = crypto.randomUUID();
    const job = {
        id,
        type,
        state: 'running',
        createdAt: new Date().toISOString(),
        finishedAt: null,
        logs: [],
        result: null,
        error: null,
        input: input || null,
    };
    jobs.set(id, job);
    // Keep a small ring of live jobs
    if (jobs.size > 40) {
        const oldest = [...jobs.keys()].slice(0, jobs.size - 40);
        oldest.forEach((key) => jobs.delete(key));
    }
    return job;
};

const listJobsSorted = async () => {
    const history = await loadPosterSetsHistory();
    const byId = new Map(history.map((entry) => [entry.id, entry]));
    for (const live of jobs.values()) {
        byId.set(live.id, live);
    }
    return [...byId.values()].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
};

const pickSetMeta = (job) => {
    const fromInput = job?.input?.setMeta && typeof job.input.setMeta === 'object'
        ? job.input.setMeta
        : null;
    const fromResult = job?.result?.setMeta && typeof job.result.setMeta === 'object'
        ? job.result.setMeta
        : null;
    const meta = fromInput || fromResult;
    if (!meta) return null;
    return {
        provider: meta.provider || null,
        setId: meta.setId != null ? String(meta.setId) : null,
        url: meta.url || job?.input?.url || null,
        title: meta.title || null,
        thumbUrl: meta.thumbUrl || '',
        assetCount: Number.isFinite(Number(meta.assetCount)) ? Number(meta.assetCount) : null,
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
            const run = await runPosterSetsCli('preview', { config, url }, { timeoutMs: 180_000 });
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
                    const allSets = [];
                    for (const sets of byProvider.values()) allSets.push(...sets);
                    const merged = mergePosterSearchSets(allSets, dupePreference);
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

    router.get('/image', async (req, res) => {
        try {
            const raw = String(req.query?.url || '').trim();
            if (!raw) return res.status(400).json({ error: 'url is required' });
            let parsed;
            try {
                parsed = new URL(raw);
            } catch {
                return res.status(400).json({ error: 'Invalid image URL' });
            }
            const host = parsed.hostname.toLowerCase();
            const allowed = (
                host === 'api.mediux.pro'
                || host === 'mediux.pro'
                || host === 'theposterdb.com'
                || host === 'www.theposterdb.com'
                || host === 'images.theposterdb.com'
                || host === 'image.tmdb.org'
            );
            if (!allowed) {
                return res.status(400).json({ error: 'Image host not allowed' });
            }
            const response = await fetch(raw, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                    Referer: host.includes('posterdb') ? 'https://theposterdb.com/' : 'https://mediux.pro/',
                },
                signal: AbortSignal.timeout(45_000),
            });
            if (!response.ok) {
                return res.status(502).json({ error: `Upstream image failed (${response.status})` });
            }
            const contentType = response.headers.get('content-type') || 'image/jpeg';
            if (!String(contentType).toLowerCase().startsWith('image/')) {
                return res.status(502).json({ error: 'Upstream did not return an image' });
            }
            const buffer = Buffer.from(await response.arrayBuffer());
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'private, max-age=3600');
            res.send(buffer);
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to proxy image' });
        }
    });

    const startApplyJob = async (type, input, payloadBuilder) => {
        const config = await loadPosterSetsConfig();
        if (!config.base_url || !config.token) {
            const error = new Error('Save Poster Sets settings (base URL + token) first.');
            error.status = 400;
            throw error;
        }
        const job = createJob(type, input);
        const payload = await payloadBuilder(config);
        setImmediate(async () => {
            try {
                const run = await runPosterSetsCli(type === 'bulk' ? 'bulk' : 'apply', payload, {
                    timeoutMs: 45 * 60_000,
                    onProgress: (message) => {
                        job.logs.push({ at: new Date().toISOString(), message });
                        if (job.logs.length > 500) job.logs.splice(0, job.logs.length - 500);
                    },
                });
                job.finishedAt = new Date().toISOString();
                if (run.ok) {
                    job.state = 'succeeded';
                    job.result = run.result;
                } else {
                    job.state = 'failed';
                    job.error = run.error || 'Apply failed';
                    job.result = run.result;
                }
                const setMeta = pickSetMeta(job);
                if (setMeta && job.input && typeof job.input === 'object') {
                    job.input = { ...job.input, setMeta };
                }
            } catch (error) {
                job.finishedAt = new Date().toISOString();
                job.state = 'failed';
                job.error = error?.message || 'Apply failed';
            }
            try {
                await upsertPosterSetsHistory(job);
            } catch {
                // History persistence should not fail the job itself.
            }
        });
        return job;
    };

    router.post('/apply', async (req, res) => {
        try {
            const url = String(req.body?.url || '').trim();
            if (!url) return res.status(400).json({ error: 'url is required' });
            const selectedIds = Array.isArray(req.body?.selectedIds)
                ? req.body.selectedIds.map((item) => String(item || '').trim()).filter(Boolean)
                : null;
            const job = await startApplyJob(
                'apply',
                { url, selectedCount: selectedIds?.length || null },
                async (config) => ({
                    config,
                    url,
                    ...(selectedIds?.length ? { selectedIds } : {}),
                }),
            );
            res.status(202).json({ ok: true, jobId: job.id, job });
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
            const job = await startApplyJob('bulk', input, async (config) => {
                if (useFile) {
                    const filePath = resolveBulkFilePath(config);
                    try {
                        const fileText = await fs.readFile(filePath, 'utf8');
                        input = {
                            fromFile: true,
                            file: config.bulk_txt,
                            lineCount: fileText.split(/\r?\n/).filter((line) => {
                                const trimmed = line.trim();
                                return trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('//');
                            }).length,
                        };
                        job.input = input;
                        return { config, text: fileText };
                    } catch (error) {
                        if (error?.code === 'ENOENT') {
                            const err = new Error(`Bulk file not found: ${config.bulk_txt}`);
                            err.status = 400;
                            throw err;
                        }
                        throw error;
                    }
                }
                if (urls?.length) {
                    input = { urls, count: urls.length };
                    job.input = input;
                    return { config, urls };
                }
                if (text.trim()) {
                    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => (
                        line && !line.startsWith('#') && !line.startsWith('//')
                    ));
                    input = { urls: lines.slice(0, 8), count: lines.length };
                    job.input = input;
                    return { config, text };
                }
                const err = new Error('Provide urls, text, or fromFile for bulk apply');
                err.status = 400;
                throw err;
            });
            res.status(202).json({ ok: true, jobId: job.id, job });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.message || 'Bulk apply failed' });
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
        let job = getJob(id);
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
