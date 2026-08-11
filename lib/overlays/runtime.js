import {
    loadOverlaysConfig,
    saveOverlaysConfig,
    loadOverlaysLog,
    listOverlayPresets,
    OVERLAYS_DIR,
    OVERLAYS_LOG_PATH,
    OVERLAYS_PREVIEW_DIR,
} from './config.js';
import {
    OVERLAYS_ASSETS_DIR,
    buildOverlaysCliConfig,
    killActiveOverlaysWorker,
    overlaysWorkerReady,
    runOverlaysCli,
} from './runner.js';

const MAX_ACTIVITY = 200;
/** @type {Array<{ at: number, level: string, message: string }>} */
export const activity = [];

export let runState = {
    running: false,
    paused: false,
    command: null,
    startedAt: null,
    lastError: null,
};

export const pushActivity = (message, level = 'info') => {
    activity.unshift({
        at: Date.now(),
        level,
        message: String(message || '').slice(0, 500),
    });
    if (activity.length > MAX_ACTIVITY) activity.length = MAX_ACTIVITY;
};

export const getPortalPlex = async (loadPortalConfig, resolvePlex) => {
    if (typeof resolvePlex === 'function') {
        return resolvePlex();
    }
    const portal = typeof loadPortalConfig === 'function' ? await loadPortalConfig() : {};
    return {
        base_url: portal.plexServerUrl || portal.plexUrl || '',
        token: portal.plexToken || '',
    };
};

export const getOverlaysRuntimeStatus = async () => {
    const config = await loadOverlaysConfig();
    const log = await loadOverlaysLog();
    const presets = await listOverlayPresets(OVERLAYS_ASSETS_DIR);
    return {
        ok: true,
        workerReady: overlaysWorkerReady(),
        config,
        logCount: Object.keys(log).length,
        running: runState.running,
        command: runState.command,
        startedAt: runState.startedAt,
        lastError: runState.lastError,
        lastRunAt: config.lastRunAt,
        lastRunSummary: config.lastRunSummary,
        paths: {
            dir: OVERLAYS_DIR,
            log: OVERLAYS_LOG_PATH,
            preview: OVERLAYS_PREVIEW_DIR,
            assets: OVERLAYS_ASSETS_DIR,
        },
        presets,
        activity: activity.slice(0, 80),
    };
};

export const listOverlaysShows = async () => {
    const log = await loadOverlaysLog();
    const shows = Object.entries(log).map(([ratingKey, entry]) => ({
        ratingKey,
        title: entry?.title || ratingKey,
        timestamp: entry?.timestamp || null,
        previewOnly: Boolean(entry?.preview_only),
        seasonIndex: entry?.seasonIndex ?? null,
        presetId: entry?.presetId || null,
    }));
    shows.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
    return { ok: true, shows, total: shows.length };
};

export const createOverlaysRunHelpers = (deps = {}) => {
    const {
        loadPortalConfig,
        resolvePlex,
        markTaskStart,
        markTaskEnd,
        systemJob,
    } = deps;

    const runCommand = async (command, { previewMode } = {}) => {
        if (runState.running) {
            throw Object.assign(new Error('An Overlays run is already in progress.'), { status: 409 });
        }
        const overlaysConfig = await loadOverlaysConfig();
        if (overlaysConfig.enabled === false) {
            throw Object.assign(new Error('Overlays module is disabled in its settings.'), { status: 400 });
        }
        const plex = await getPortalPlex(loadPortalConfig, resolvePlex);
        if (!plex?.base_url || !plex?.token) {
            throw Object.assign(new Error('Configure Plex under Settings → Media Player first.'), { status: 400 });
        }

        const cliConfig = await buildOverlaysCliConfig(plex, {
            ...overlaysConfig,
            ...(previewMode === true ? { previewMode: true } : {}),
            ...(previewMode === false ? { previewMode: false } : {}),
        });

        runState = {
            running: true,
            paused: false,
            command,
            startedAt: new Date().toISOString(),
            lastError: null,
        };
        pushActivity(`Starting ${command}…`);
        if (systemJob && typeof markTaskStart === 'function') markTaskStart(systemJob);

        try {
            const result = await runOverlaysCli(command, { config: cliConfig }, {
                onProgress: (event) => pushActivity(event.message || ''),
            });
            if (!result.ok) {
                const err = new Error(result.error || 'Overlays run failed');
                runState.lastError = err.message;
                pushActivity(err.message, 'error');
                if (systemJob && typeof markTaskEnd === 'function') markTaskEnd(systemJob, err);
                throw Object.assign(err, { status: 500, logs: result.logs });
            }

            const summary = result.result || {};
            await saveOverlaysConfig({
                lastRunAt: new Date().toISOString(),
                lastRunSummary: {
                    command,
                    added: summary.added ?? null,
                    removed: summary.removed ?? null,
                    converted: summary.converted ?? null,
                    totalWithOverlays: summary.totalWithOverlays ?? null,
                    eligible: summary.eligible ?? null,
                    previewMode: summary.previewMode ?? previewMode ?? overlaysConfig.previewMode,
                    errors: summary.errors || [],
                    finishedAt: summary.finishedAt || new Date().toISOString(),
                },
            });
            pushActivity(
                `Finished ${command} — added ${summary.added ?? 0}, removed ${summary.removed ?? 0}`,
            );
            if (systemJob && typeof markTaskEnd === 'function') markTaskEnd(systemJob, null);
            return { ok: true, result: summary, logs: result.logs };
        } catch (error) {
            if (!runState.lastError) {
                runState.lastError = error.message || String(error);
                pushActivity(runState.lastError, 'error');
                if (systemJob && typeof markTaskEnd === 'function') markTaskEnd(systemJob, error);
            }
            throw error;
        } finally {
            runState.running = false;
            runState.command = null;
        }
    };

    return { runCommand, killActiveOverlaysWorker };
};
