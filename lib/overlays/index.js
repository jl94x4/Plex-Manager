import {
    loadOverlaysConfig,
    saveOverlaysConfig,
    listOverlayPresets,
    listPreviewGallery,
    sanitizePresetUploadName,
    allocateUniqueCollectionPresetId,
    resolveOverlayPresetPath,
    OVERLAYS_PREVIEW_DIR,
    OVERLAYS_CUSTOM_PRESETS_DIR,
} from './config.js';
import { importOverlaysLog } from './import.js';
import {
    OVERLAYS_ASSETS_DIR,
    overlaysWorkerReady,
    runOverlaysCli,
} from './runner.js';
import {
    createOverlaysRunHelpers,
    getOverlaysRuntimeStatus,
    getPortalPlex,
    listOverlaysShows,
    listOverlaysEpisodes,
    listOverlaysKometa,
    pushActivity,
    runState,
} from './runtime.js';

import { buildOverlaysCliConfig as buildCliConfig } from './runner.js';
import fs from 'fs';
import path from 'path';
import express from 'express';

export {
    getOverlaysRuntimeStatus,
    listOverlaysShows,
    listOverlaysEpisodes,
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

    router.get('/episodes', async (_req, res) => {
        try {
            res.json(await listOverlaysEpisodes());
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to list overlay episodes' });
        }
    });

    router.get('/kometa', async (_req, res) => {
        try {
            res.json(await listOverlaysKometa());
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to list Layer overlays' });
        }
    });

    router.get('/presets', async (_req, res) => {
        try {
            res.json({
                presets: await listOverlayPresets(OVERLAYS_ASSETS_DIR, OVERLAYS_CUSTOM_PRESETS_DIR),
            });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to list presets' });
        }
    });

    router.get('/preset-file', async (req, res) => {
        try {
            const id = String(req.query.id || '').trim();
            const kind = String(req.query.kind || 'season').trim().toLowerCase() === 'episode'
                ? 'episode'
                : 'season';
            if (!id) return res.status(400).json({ error: 'id is required' });
            const filePath = resolveOverlayPresetPath(
                id,
                kind,
                OVERLAYS_ASSETS_DIR,
                OVERLAYS_CUSTOM_PRESETS_DIR,
            );
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'Preset file not found' });
            }
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('Content-Type', 'image/png');
            res.sendFile(path.resolve(filePath));
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to serve preset' });
        }
    });

    router.post(
        '/presets/upload',
        express.raw({ type: ['image/*', 'application/octet-stream'], limit: '2mb' }),
        async (req, res) => {
            try {
                const buf = req.body;
                if (!Buffer.isBuffer(buf) || buf.length < 8) {
                    return res.status(400).json({ error: 'Invalid image file.' });
                }
                // PNG magic bytes
                if (!(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)) {
                    return res.status(400).json({ error: 'Only PNG uploads are supported.' });
                }
                const kindRaw = String(req.query?.kind || req.headers['x-overlay-kind'] || 'season').toLowerCase();
                const kind = kindRaw === 'episode'
                    ? 'episode'
                    : kindRaw === 'collection'
                        ? 'collection'
                        : 'season';
                const original = String(req.query?.name || req.headers['x-overlay-name'] || 'banner');
                await fs.promises.mkdir(OVERLAYS_CUSTOM_PRESETS_DIR, { recursive: true });
                // Collection badges always get custom-collectionN so uploads of the same PNG
                // filename never overwrite each other or collide in the rules list.
                const id = kind === 'collection'
                    ? allocateUniqueCollectionPresetId(OVERLAYS_CUSTOM_PRESETS_DIR)
                    : sanitizePresetUploadName(kind, original);
                const dest = path.join(OVERLAYS_CUSTOM_PRESETS_DIR, `${id}.png`);
                await fs.promises.writeFile(dest, buf);
                pushActivity(`Uploaded custom ${kind} preset: ${id}`);
                res.json({
                    ok: true,
                    preset: { id, kind, source: 'custom', file: `${id}.png` },
                });
            } catch (error) {
                res.status(500).json({ error: error.message || 'Upload failed' });
            }
        },
    );

    router.delete('/presets/custom/:id', async (req, res) => {
        try {
            const id = String(req.params.id || '').trim();
            if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
                return res.status(400).json({ error: 'Invalid preset id' });
            }
            const filePath = path.join(OVERLAYS_CUSTOM_PRESETS_DIR, `${id}.png`);
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'Custom preset not found' });
            }
            await fs.promises.unlink(filePath);
            pushActivity(`Deleted custom preset: ${id}`, 'warn');
            res.json({ ok: true, id });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Delete failed' });
        }
    });

    router.get('/preview-gallery', async (_req, res) => {
        try {
            const items = await listPreviewGallery(OVERLAYS_PREVIEW_DIR, 100);
            res.json({ ok: true, items, total: items.length });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to list preview gallery' });
        }
    });

    router.get('/preview-file', async (req, res) => {
        try {
            const rel = String(req.query.path || '').replace(/\\/g, '/');
            if (!rel || rel.includes('..') || path.isAbsolute(rel)) {
                return res.status(400).json({ error: 'Invalid path' });
            }
            const full = path.resolve(OVERLAYS_PREVIEW_DIR, rel);
            const root = path.resolve(OVERLAYS_PREVIEW_DIR);
            if (!full.startsWith(root + path.sep) && full !== root) {
                return res.status(400).json({ error: 'Path escapes preview root' });
            }
            if (!fs.existsSync(full)) {
                return res.status(404).json({ error: 'File not found' });
            }
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('Content-Type', 'image/png');
            res.sendFile(full);
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to serve preview file' });
        }
    });

    const withPlexCli = async (command, extra = {}) => {
        const overlaysConfig = await loadOverlaysConfig();
        const portal = typeof loadPortalConfig === 'function' ? await loadPortalConfig() : {};
        const plex = await getPortalPlex(loadPortalConfig, resolvePlex);
        if (!plex?.base_url || !plex?.token) {
            const err = new Error('Configure Plex under Settings → Media Player first.');
            err.status = 400;
            throw err;
        }
        const cliConfig = await buildCliConfig(plex, overlaysConfig, portal);
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
            const out = await startCommand('scan');
            res.json(out);
        } catch (error) {
            res.status(error.status || 500).json({ error: error.message || 'Scan failed', logs: error.logs || [] });
        }
    });

    router.post('/reconcile', async (_req, res) => {
        try {
            const out = await startCommand('reconcile');
            res.json(out);
        } catch (error) {
            res.status(error.status || 500).json({ error: error.message || 'Reconcile failed', logs: error.logs || [] });
        }
    });

    router.post('/run', async (req, res) => {
        try {
            const preview = req.body?.preview === true || req.body?.previewMode === true;
            const bundleRaw = String(req.body?.bundle || req.body?.runBundle || 'core').trim().toLowerCase();
            const bundle = ['recently', 'kometa', 'all', 'core'].includes(bundleRaw) ? bundleRaw : 'core';
            let command = preview ? 'preview' : 'run';
            let lastRunKey = 'lastRunAt';
            if (bundle === 'recently') {
                command = preview ? 'preview-recently' : 'run-recently';
                lastRunKey = 'recentlyAddedLastRunAt';
            } else if (bundle === 'kometa') {
                command = preview ? 'preview-kometa' : 'run-kometa';
                lastRunKey = 'kometaLastRunAt';
            }
            // Background so the UI can poll / stop without waiting for the full library pass.
            const out = await startCommand(command, {
                previewMode: preview,
                runBundle: bundle,
                lastRunKey,
            });
            res.json(out);
        } catch (error) {
            res.status(error.status || 500).json({
                error: error.message || 'Run failed',
                logs: error.logs || [],
            });
        }
    });

    router.post('/preview', async (req, res) => {
        try {
            const bundleRaw = String(req.body?.bundle || req.body?.runBundle || 'core').trim().toLowerCase();
            const bundle = ['recently', 'kometa', 'all', 'core'].includes(bundleRaw) ? bundleRaw : 'core';
            let command = 'preview';
            let lastRunKey = 'lastRunAt';
            if (bundle === 'recently') {
                command = 'preview-recently';
                lastRunKey = 'recentlyAddedLastRunAt';
            } else if (bundle === 'kometa') {
                command = 'preview-kometa';
                lastRunKey = 'kometaLastRunAt';
            }
            const out = await startCommand(command, {
                previewMode: true,
                runBundle: bundle,
                lastRunKey,
            });
            res.json(out);
        } catch (error) {
            res.status(error.status || 500).json({
                error: error.message || 'Preview failed',
                logs: error.logs || [],
            });
        }
    });

    router.post('/promote', async (_req, res) => {
        try {
            const out = await startCommand('promote', { previewMode: false });
            res.json(out);
        } catch (error) {
            res.status(error.status || 500).json({
                error: error.message || 'Promote failed',
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
            const kind = String(req.body?.kind || '').trim() || undefined;
            const result = await withPlexCli('reset-one', { ratingKey, kind });
            res.json({ ok: true, ...(result.result || {}) });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.message || 'Reset failed', logs: error.logs || [] });
        }
    });

    router.post('/revert-kometa', async (req, res) => {
        try {
            if (runState.running) {
                return res.status(409).json({ error: 'An Overlays run is already in progress.' });
            }
            const ratingKey = String(req.body?.ratingKey || '').trim() || undefined;
            pushActivity(
                ratingKey
                    ? `Reverting Layer overlay for item ${ratingKey}…`
                    : 'Reverting ALL Layer overlays…',
                'warn',
            );
            const result = await withPlexCli('revert-kometa', ratingKey ? { ratingKey } : {});
            pushActivity(
                `Layer revert complete — ${result.result?.reverted ?? 0}/${result.result?.requested ?? 0} restored`,
                'warn',
            );
            res.json({ ok: true, ...(result.result || {}), logs: result.logs });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.message || 'Layer revert failed', logs: error.logs || [] });
        }
    });

    router.post('/reset-all', async (req, res) => {
        try {
            if (runState.running) {
                return res.status(409).json({ error: 'An Overlays run is already in progress.' });
            }
            const scopeRaw = String(req.body?.scope || req.body?.kind || 'all').trim().toLowerCase();
            const scope = scopeRaw === 'shows' || scopeRaw === 'show'
                ? 'shows'
                : scopeRaw === 'episodes' || scopeRaw === 'episode'
                    ? 'episodes'
                    : 'all';
            const label = scope === 'shows'
                ? 'New Season show overlays'
                : scope === 'episodes'
                    ? 'New Episode overlays'
                    : 'all logged overlays';
            pushActivity(`Resetting ${label}…`, 'warn');
            const result = await withPlexCli('reset-all', { scope });
            pushActivity(
                scope === 'shows'
                    ? `Reset shows complete — ${result.result?.removed ?? 0} removed`
                    : scope === 'episodes'
                        ? `Reset episodes complete — ${result.result?.episodesRemoved ?? 0} removed`
                        : `Reset all complete — shows ${result.result?.removed ?? 0}, episodes ${result.result?.episodesRemoved ?? 0}`,
                'warn',
            );
            res.json({ ok: true, ...(result.result || {}), logs: result.logs });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.message || 'Reset all failed', logs: error.logs || [] });
        }
    });

    const samplesDir = () => path.join(OVERLAYS_PREVIEW_DIR, 'samples');

    router.get('/sample/meta', async (_req, res) => {
        try {
            const metaPath = path.join(samplesDir(), 'meta.json');
            const showPath = path.join(samplesDir(), 'show.png');
            const episodePath = path.join(samplesDir(), 'episode.png');
            if (!fs.existsSync(metaPath) || !fs.existsSync(showPath) || !fs.existsSync(episodePath)) {
                return res.json({ ok: true, exists: false });
            }
            const meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf8'));
            res.json({
                ok: true,
                exists: true,
                ...meta,
                showTitle: meta.showTitle || null,
                episodeTitle: meta.episodeTitle || null,
                showTitleForEp: meta.showTitleForEp || null,
                generatedAt: meta.generatedAt || null,
                presetId: meta.presetId || null,
            });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to read sample meta' });
        }
    });

    router.get('/sample/:kind', async (req, res) => {
        try {
            const kind = String(req.params.kind || '').trim().toLowerCase();
            const allowed = new Set(['show', 'episode', 'season', 'show-base', 'episode-base']);
            if (!allowed.has(kind)) {
                return res.status(400).json({ error: 'kind must be show, episode, season, show-base, or episode-base' });
            }
            const filePath = path.join(samplesDir(), `${kind}.png`);
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'Sample not generated yet' });
            }
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('Content-Type', 'image/png');
            res.sendFile(filePath);
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to serve sample' });
        }
    });

    router.post('/sample', async (req, res) => {
        try {
            if (runState.running) {
                return res.status(409).json({
                    error: 'An Overlays run is already in progress. Wait for it to finish or stop it first.',
                });
            }
            if (!overlaysWorkerReady()) {
                return res.status(503).json({ error: 'Overlays worker is not installed.' });
            }
            pushActivity('Generating visual overlay samples…');
            const overlaysConfig = await loadOverlaysConfig();
            const portal = typeof loadPortalConfig === 'function' ? await loadPortalConfig() : {};
            const plex = await getPortalPlex(loadPortalConfig, resolvePlex);
            if (!plex?.base_url || !plex?.token) {
                return res.status(400).json({ error: 'Configure Plex under Settings → Media Player first.' });
            }
            const cliConfig = await buildCliConfig(plex, overlaysConfig, portal);
            const showRatingKey = String(req.body?.showRatingKey || '').trim() || undefined;
            const episodeRatingKey = String(req.body?.episodeRatingKey || '').trim() || undefined;
            const result = await runOverlaysCli(
                'sample',
                { config: cliConfig, showRatingKey, episodeRatingKey },
                {
                    timeoutMs: 60_000,
                    onProgress: (event) => pushActivity(event.message || ''),
                },
            );
            if (result.cancelled) {
                return res.status(499).json({ error: 'Overlays run cancelled', logs: result.logs || [] });
            }
            if (!result.ok) {
                return res.status(500).json({
                    error: result.error || 'Sample generation failed',
                    logs: result.logs || [],
                });
            }
            const payload = result.result || {};
            pushActivity(
                `Samples ready — ${payload.show?.title || 'show'} / ${payload.episode?.title || 'episode'}`,
            );
            res.json({ ok: true, ...payload, logs: result.logs });
        } catch (error) {
            res.status(error.status || 500).json({
                error: error.message || 'Sample generation failed',
                logs: error.logs || [],
            });
        }
    });

    router.get('/sample-candidates', async (req, res) => {
        try {
            const q = String(req.query?.q || req.query?.query || '');
            const result = await withPlexCli('sample-candidates', { query: q });
            res.json({ ok: true, ...(result.result || {}) });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.message || 'Sample search failed' });
        }
    });

    router.post('/reset-binge-group', async (req, res) => {
        try {
            if (runState.running) {
                return res.status(409).json({ error: 'An Overlays run is already in progress.' });
            }
            const keys = Array.isArray(req.body?.ratingKeys)
                ? req.body.ratingKeys.map((k) => String(k || '').trim()).filter(Boolean)
                : [];
            if (!keys.length) {
                return res.status(400).json({ error: 'ratingKeys required' });
            }
            pushActivity(`Resetting binge group (${keys.length} episodes)…`, 'warn');
            const results = [];
            for (const ratingKey of keys) {
                try {
                    const out = await withPlexCli('reset-one', { ratingKey, kind: 'episode' });
                    results.push({ ratingKey, ok: true, ...(out.result || {}) });
                } catch (error) {
                    results.push({ ratingKey, ok: false, error: error.message });
                }
            }
            const okCount = results.filter((r) => r.ok).length;
            pushActivity(`Binge group reset — ${okCount}/${keys.length}`, 'warn');
            res.json({ ok: true, results, removed: okCount });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.message || 'Binge group reset failed' });
        }
    });

    return router;
};
