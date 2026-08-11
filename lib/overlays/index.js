import {
    loadOverlaysConfig,
    saveOverlaysConfig,
    listOverlayPresets,
} from './config.js';
import { importOverlaysLog } from './import.js';
import {
    OVERLAYS_ASSETS_DIR,
    runOverlaysCli,
} from './runner.js';
import {
    createOverlaysRunHelpers,
    getOverlaysRuntimeStatus,
    getPortalPlex,
    listOverlaysShows,
    pushActivity,
    runState,
} from './runtime.js';

import { buildOverlaysCliConfig as buildCliConfig } from './runner.js';

export {
    getOverlaysRuntimeStatus,
    listOverlaysShows,
    createOverlaysRunHelpers,
    importOverlaysLog,
    pushActivity,
    runState,
};

/**
 * Express router factory.
 */
export const createOverlaysRouter = ({
    Router,
    requireAdmin,
    requireOverlays,
    loadPortalConfig,
    resolvePlex,
    markTaskStart,
    markTaskEnd,
    systemJob,
}) => {
    const router = Router();
    router.use(requireAdmin, requireOverlays);

    const { runCommand, startCommand, stopCommand } = createOverlaysRunHelpers({
        loadPortalConfig,
        resolvePlex,
        markTaskStart,
        markTaskEnd,
        systemJob,
    });

    router.get('/status', async (_req, res) => {
        try {
            res.json(await getOverlaysRuntimeStatus());
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to load overlays status' });
        }
    });

    router.get('/config', async (_req, res) => {
        try {
            res.json({ config: await loadOverlaysConfig() });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to load overlays config' });
        }
    });

    router.put('/config', async (req, res) => {
        try {
            const saved = await saveOverlaysConfig(req.body || {});
            res.json({ ok: true, config: saved });
        } catch (error) {
            res.status(400).json({ error: error.message || 'Failed to save overlays config' });
        }
    });

    router.get('/shows', async (_req, res) => {
        try {
            res.json(await listOverlaysShows());
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to list overlay shows' });
        }
    });

    router.get('/presets', async (_req, res) => {
        try {
            res.json({ presets: await listOverlayPresets(OVERLAYS_ASSETS_DIR) });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to list presets' });
        }
    });

    const withPlexCli = async (command, extra = {}) => {
        const overlaysConfig = await loadOverlaysConfig();
        const plex = await getPortalPlex(loadPortalConfig, resolvePlex);
        if (!plex?.base_url || !plex?.token) {
            const err = new Error('Configure Plex under Settings → Media Player first.');
            err.status = 400;
            throw err;
        }
        const cliConfig = await buildCliConfig(plex, overlaysConfig);
        const result = await runOverlaysCli(command, { config: cliConfig, ...extra }, {
            onProgress: (event) => pushActivity(event.message || ''),
        });
        if (result.cancelled) {
            const err = new Error('Overlays run cancelled');
            err.status = 499;
            err.cancelled = true;
            err.logs = result.logs;
            throw err;
        }
        if (!result.ok) {
            const err = new Error(result.error || `${command} failed`);
            err.status = 500;
            err.logs = result.logs;
            throw err;
        }
        return result;
    };

    router.post('/scan', async (_req, res) => {
        try {
            const result = await withPlexCli('scan');
            res.json({ ok: true, ...(result.result || {}), logs: result.logs });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.message || 'Scan failed', logs: error.logs || [] });
        }
    });

    router.post('/reconcile', async (_req, res) => {
        try {
            const result = await withPlexCli('reconcile');
            res.json({ ok: true, ...(result.result || {}), logs: result.logs });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.message || 'Reconcile failed', logs: error.logs || [] });
        }
    });

    router.post('/run', async (req, res) => {
        try {
            const preview = req.body?.preview === true || req.body?.previewMode === true;
            const command = preview ? 'preview' : 'run';
            // Background so the UI can poll / stop without waiting for the full library pass.
            const out = await startCommand(command, { previewMode: preview });
            res.json(out);
        } catch (error) {
            res.status(error.status || 500).json({
                error: error.message || 'Run failed',
                logs: error.logs || [],
            });
        }
    });

    router.post('/preview', async (_req, res) => {
        try {
            const out = await startCommand('preview', { previewMode: true });
            res.json(out);
        } catch (error) {
            res.status(error.status || 500).json({
                error: error.message || 'Preview failed',
                logs: error.logs || [],
            });
        }
    });

    router.post('/stop', async (_req, res) => {
        res.json(stopCommand());
    });

    router.post('/import-log', async (req, res) => {
        try {
            const mode = req.body?.mode === 'replace' ? 'replace' : 'merge';
            let source = req.body?.log;
            if (source == null) {
                const { mode: _ignore, ...rest } = req.body || {};
                source = rest;
            }
            if (!source || typeof source !== 'object' || Array.isArray(source) || !Object.keys(source).length) {
                return res.status(400).json({ error: 'Body must include a log object (overlaid_log.json contents).' });
            }
            const result = await importOverlaysLog(source, { mode });
            pushActivity(`Imported overlay log (${result.mode}) — ${result.imported} entries`);
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: error.message || 'Import failed' });
        }
    });

    router.get('/sections', async (_req, res) => {
        try {
            const result = await withPlexCli('sections');
            res.json({ ok: true, ...(result.result || {}) });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.message || 'Failed to list sections' });
        }
    });

    router.post('/reset-one', async (req, res) => {
        try {
            const ratingKey = String(req.body?.ratingKey || '').trim();
            if (!ratingKey) return res.status(400).json({ error: 'ratingKey is required' });
            const result = await withPlexCli('reset-one', { ratingKey });
            res.json({ ok: true, ...(result.result || {}) });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.message || 'Reset failed', logs: error.logs || [] });
        }
    });

    router.post('/reset-all', async (_req, res) => {
        try {
            if (runState.running) {
                return res.status(409).json({ error: 'An Overlays run is already in progress.' });
            }
            pushActivity('Resetting all logged overlays…', 'warn');
            const result = await withPlexCli('reset-all');
            pushActivity(
                `Reset all complete — cleared ${result.result?.removed ?? 0}/${result.result?.requested ?? 0}`,
                'warn',
            );
            res.json({ ok: true, ...(result.result || {}), logs: result.logs });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.message || 'Reset all failed', logs: error.logs || [] });
        }
    });

    return router;
};
