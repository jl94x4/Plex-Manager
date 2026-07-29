import crypto from 'crypto';
import {
    loadPosterSetsConfig,
    maskPosterSetsConfig,
    savePosterSetsConfig,
    resolveBulkFilePath,
} from './config.js';
import { posterSetsWorkerReady, runPosterSetsCli, POSTER_SETS_APP_DIR } from './runner.js';
import fs from 'fs/promises';

const jobs = new Map();

const getJob = (id) => jobs.get(String(id)) || null;

const createJob = (type) => {
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
    };
    jobs.set(id, job);
    // Keep a small ring of jobs
    if (jobs.size > 40) {
        const oldest = [...jobs.keys()].slice(0, jobs.size - 40);
        oldest.forEach((key) => jobs.delete(key));
    }
    return job;
};

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
            const recent = [...jobs.values()]
                .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
                .slice(0, 5)
                .map((job) => ({
                    id: job.id,
                    type: job.type,
                    state: job.state,
                    createdAt: job.createdAt,
                    finishedAt: job.finishedAt,
                    error: job.error,
                    uploaded: job.result?.uploaded ?? null,
                }));
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
            const run = await runPosterSetsCli('preview', { config, url }, { timeoutMs: 120_000 });
            if (!run.ok) {
                return res.status(400).json({ ok: false, error: run.error || 'Preview failed', logs: run.logs });
            }
            res.json({ ok: true, ...(run.result || {}), logs: run.logs });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Preview failed' });
        }
    });

    const startApplyJob = async (type, payloadBuilder) => {
        const config = await loadPosterSetsConfig();
        if (!config.base_url || !config.token) {
            const error = new Error('Save Poster Sets settings (base URL + token) first.');
            error.status = 400;
            throw error;
        }
        const job = createJob(type);
        const payload = await payloadBuilder(config);
        setImmediate(async () => {
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
        });
        return job;
    };

    router.post('/apply', async (req, res) => {
        try {
            const url = String(req.body?.url || '').trim();
            if (!url) return res.status(400).json({ error: 'url is required' });
            const job = await startApplyJob('apply', async (config) => ({ config, url }));
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
            const job = await startApplyJob('bulk', async (config) => {
                if (useFile) {
                    const filePath = resolveBulkFilePath(config);
                    try {
                        const fileText = await fs.readFile(filePath, 'utf8');
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
                if (urls?.length) return { config, urls };
                if (text.trim()) return { config, text };
                const err = new Error('Provide urls, text, or fromFile for bulk apply');
                err.status = 400;
                throw err;
            });
            res.status(202).json({ ok: true, jobId: job.id, job });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.message || 'Bulk apply failed' });
        }
    });

    router.get('/jobs/:id', async (req, res) => {
        const job = getJob(req.params.id);
        if (!job) return res.status(404).json({ error: 'Job not found' });
        res.json({ job });
    });

    // loadPortalConfig reserved for future helpers
    void loadPortalConfig;

    return router;
};
