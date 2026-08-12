import express from 'express';
import {
    ALL_EDITION_MODULES,
    loadEditionsConfig,
    saveEditionsConfig,
    normalizeEditionsConfig,
    listEditionsBackupFiles,
} from './config.js';
import { editionsWorkerReady } from './runner.js';
import {
    createEditionsRunHelpers,
    getEditionsRuntimeStatus,
    pushActivity,
    runState,
} from './runtime.js';

const recentWebhookKeys = new Map(); // ratingKey -> expiresAt
const WEBHOOK_TTL_MS = 60 * 60 * 1000;
const WEBHOOK_FRESH_MS = 10 * 60 * 1000;

const pruneWebhookKeys = () => {
    const now = Date.now();
    for (const [key, exp] of recentWebhookKeys) {
        if (exp <= now) recentWebhookKeys.delete(key);
    }
};

const parseAddedAt = (value) => {
    if (value == null) return null;
    if (typeof value === 'number') {
        const ts = value > 1e12 ? value : value * 1000;
        return new Date(ts);
    }
    const s = String(value).trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) {
        const n = Number(s);
        return new Date(n > 1e12 ? n : n * 1000);
    }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Express router factory for Editions.
 */
export const createEditionsRouter = ({
    Router,
    requireAdmin,
    requireEditions,
    loadPortalConfig,
    resolvePlex,
    markTaskStart,
    markTaskEnd,
    systemJob,
}) => {
    const router = Router();
    const { startCommand, runCommand, stopCommand } = createEditionsRunHelpers({
        loadPortalConfig,
        resolvePlex,
        markTaskStart,
        markTaskEnd,
        systemJob,
    });

    // Public webhook + health (no admin session — gated by editionsEnabled + webhookEnabled).
    router.get('/webhook/healthz', async (_req, res) => {
        try {
            const portal = await loadPortalConfig();
            const cfg = await loadEditionsConfig();
            if (!portal.editionsEnabled || !cfg.webhookEnabled) {
                return res.status(503).json({ ok: false, error: 'Editions webhook is disabled' });
            }
            return res.json({ ok: true });
        } catch (error) {
            return res.status(500).json({ ok: false, error: error.message });
        }
    });

    router.post('/webhook', express.urlencoded({ extended: true }), async (req, res) => {
        try {
            const portal = await loadPortalConfig();
            const cfg = await loadEditionsConfig();
            if (!portal.editionsEnabled || !cfg.webhookEnabled) {
                return res.status(503).json({ error: 'Editions webhook is disabled' });
            }

            const payloadText = req.body?.payload || (typeof req.body === 'string' ? req.body : null);
            if (!payloadText) return res.status(400).json({ error: 'missing payload' });

            let data;
            try {
                data = typeof payloadText === 'string' ? JSON.parse(payloadText) : payloadText;
            } catch {
                return res.status(400).json({ error: 'invalid json' });
            }

            const event = data?.event;
            const md = data?.Metadata || {};
            const itemType = md?.type;
            const ratingKey = md?.ratingKey != null ? String(md.ratingKey) : '';

            if (event !== 'library.new' || itemType !== 'movie' || !ratingKey) {
                return res.status(202).json({ ignored: true });
            }

            const addedAt = parseAddedAt(md.addedAt);
            if (addedAt && (Date.now() - addedAt.getTime()) > WEBHOOK_FRESH_MS) {
                return res.status(202).json({ ignored_stale: true, addedAt: addedAt.toISOString() });
            }

            pruneWebhookKeys();
            const now = Date.now();
            if (recentWebhookKeys.has(ratingKey) && recentWebhookKeys.get(ratingKey) > now) {
                return res.status(202).json({ duplicate: true });
            }
            recentWebhookKeys.set(ratingKey, now + WEBHOOK_TTL_MS);

            await pushActivity({
                action: 'webhook',
                ok: true,
                message: `Queued ${md.title || 'movie'} (${ratingKey}) from Plex webhook`,
                ratingKey,
            });

            // Queue process-one without blocking the webhook response.
            setImmediate(async () => {
                try {
                    if (runState.running) {
                        // Simple retry once the current job finishes (poll briefly).
                        for (let i = 0; i < 120 && runState.running; i += 1) {
                            await new Promise((r) => setTimeout(r, 1000));
                        }
                    }
                    if (!runState.running) {
                        await startCommand('process-one', { ratingKey });
                    }
                } catch (error) {
                    await pushActivity({
                        action: 'webhook',
                        ok: false,
                        message: error?.message || String(error),
                        ratingKey,
                    });
                }
            });

            return res.status(202).json({ queued: true, ratingKey });
        } catch (error) {
            return res.status(500).json({ error: error.message || 'Webhook failed' });
        }
    });

    router.use(requireAdmin, requireEditions);

    router.get('/status', async (_req, res) => {
        try {
            const portal = await loadPortalConfig();
            const status = await getEditionsRuntimeStatus();
            res.json({
                ...status,
                enabled: !!portal.editionsEnabled,
                mediaServerType: portal.mediaServerType || 'plex',
            });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to load Editions status' });
        }
    });

    router.get('/config', async (_req, res) => {
        try {
            res.json({
                config: await loadEditionsConfig(),
                modulesCatalog: ALL_EDITION_MODULES,
                workerReady: editionsWorkerReady(),
            });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to load Editions config' });
        }
    });

    router.put('/config', async (req, res) => {
        try {
            const saved = await saveEditionsConfig(req.body?.config || req.body || {});
            res.json({ config: saved, modulesCatalog: ALL_EDITION_MODULES });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to save Editions config' });
        }
    });

    router.post('/test', async (_req, res) => {
        try {
            const { result } = await runCommand('test');
            res.json(result || { ok: false });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Connection test failed' });
        }
    });

    router.get('/search', async (req, res) => {
        try {
            const query = String(req.query.q || req.query.query || '').trim();
            if (!query) return res.status(400).json({ error: 'query is required' });
            const { result } = await runCommand('search', { query });
            res.json(result || { ok: true, matches: [] });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Search failed' });
        }
    });

    router.get('/backups', async (_req, res) => {
        try {
            const backups = await listEditionsBackupFiles();
            res.json({ ok: true, backups });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to list backups' });
        }
    });

    const startAction = (action) => async (req, res) => {
        try {
            const extra = {};
            if (action === 'process-one') {
                const ratingKey = String(req.body?.ratingKey || '').trim();
                if (!ratingKey) return res.status(400).json({ error: 'ratingKey is required' });
                extra.ratingKey = ratingKey;
            }
            if (action === 'restore') {
                const backupFile = String(req.body?.backupFile || '').trim();
                if (backupFile) extra.backupFile = backupFile;
            }
            const status = await startCommand(action, extra);
            res.json(status);
        } catch (error) {
            res.status(409).json({ error: error.message || `Failed to start ${action}` });
        }
    };

    router.post('/process-all', startAction('process-all'));
    router.post('/process-one', startAction('process-one'));
    router.post('/reset', startAction('reset'));
    router.post('/backup', startAction('backup'));
    router.post('/restore', startAction('restore'));
    router.post('/undo', startAction('undo'));

    router.post('/cancel', async (_req, res) => {
        try {
            const killed = stopCommand();
            res.json({ ok: true, killed, ...(await getEditionsRuntimeStatus()) });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Cancel failed' });
        }
    });

    return router;
};

export {
    ALL_EDITION_MODULES,
    loadEditionsConfig,
    saveEditionsConfig,
    normalizeEditionsConfig,
    getEditionsRuntimeStatus,
};
