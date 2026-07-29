import crypto from 'crypto';
import {
    loadPosterSetsConfig,
    maskPosterSetsConfig,
    savePosterSetsConfig,
    resolveBulkFilePath,
} from './config.js';
import { loadPosterSetsHistory, upsertPosterSetsHistory } from './history.js';
import { posterSetsWorkerReady, runPosterSetsCli, POSTER_SETS_APP_DIR } from './runner.js';
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
                    : '';
            if (!provider) {
                return res.status(400).json({ error: 'provider must be mediux or posterdb' });
            }

            const query = String(req.body?.query || req.body?.q || '').trim();
            const titleUrl = String(req.body?.titleUrl || req.body?.title_url || '').trim();
            const tmdbId = req.body?.tmdbId ?? req.body?.tmdb_id ?? null;
            const mediaType = String(req.body?.mediaType || req.body?.media_type || 'movie').trim().toLowerCase();
            const modeRaw = String(req.body?.mode || 'title').trim().toLowerCase();
            const mode = ['creator', 'user', 'author', 'uploader'].includes(modeRaw) ? 'creator' : 'title';
            const limit = Math.min(40, Math.max(1, Number(req.body?.limit) || 24));

            // MediUX title search uses portal TMDB key, then scrapes the MediUX title page for sets.
            // Creator mode always goes through the Python scraper (MediUX /user/…/sets).
            if (provider === 'mediux' && mode === 'title' && !tmdbId && !titleUrl) {
                if (!query) return res.status(400).json({ error: 'query is required' });
                const portal = typeof loadPortalConfig === 'function' ? await loadPortalConfig() : {};
                const apiKey = String(portal?.tmdbApiKey || '').trim();
                if (!apiKey) {
                    return res.status(400).json({
                        error: 'Add a TMDB API key in Settings to search MediUX by title (or use Find by ID).',
                        code: 'TMDB_API_KEY_MISSING',
                    });
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
                return res.json({
                    ok: true,
                    provider: 'mediux',
                    phase: 'titles',
                    query,
                    titles,
                    sets: [],
                });
            }

            const payload = {
                provider,
                query,
                titleUrl,
                mediaType: mediaType === 'tv' || mediaType === 'show' ? 'show' : 'movie',
                tmdbId,
                mode,
                limit,
            };
            const run = await runPosterSetsCli('search', payload, { timeoutMs: 120_000 });
            if (!run.ok) {
                return res.status(400).json({ ok: false, error: run.error || 'Search failed', logs: run.logs });
            }
            res.json({ ok: true, ...(run.result || {}), logs: run.logs });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Search failed' });
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
