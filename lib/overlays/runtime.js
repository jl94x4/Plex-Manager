import fs from 'fs/promises';
import path from 'path';
import {
    loadOverlaysConfig,
    saveOverlaysConfig,
    loadOverlaysLog,
    loadOverlaysEpisodeLog,
    listOverlayPresets,
    OVERLAYS_DIR,
    OVERLAYS_LOG_PATH,
    OVERLAYS_EPISODE_LOG_PATH,
    OVERLAYS_RECENTLY_ADDED_LOG_PATH,
    OVERLAYS_LIVE_LOG_PATH,
    OVERLAYS_TOP10_LOG_PATH,
    OVERLAYS_KOMETA_LOG_PATH,
    OVERLAYS_PREVIEW_DIR,
    OVERLAYS_BACKUPS_DIR,
    OVERLAYS_CUSTOM_PRESETS_DIR,
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
    cancelled: false,
    /** @type {'ok' | 'error' | 'cancelled' | null} */
    lastOutcome: null,
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
    const episodeLog = await loadOverlaysEpisodeLog();
    const presets = await listOverlayPresets(OVERLAYS_ASSETS_DIR, OVERLAYS_CUSTOM_PRESETS_DIR);
    const episodeEntries = Object.keys(episodeLog).filter((k) => !String(k).startsWith('season:'));
    const previewOnlyShows = Object.values(log).filter((e) => e && typeof e === 'object' && e.preview_only).length;
    const previewOnlyEpisodes = Object.entries(episodeLog)
        .filter(([k, e]) => !String(k).startsWith('season:') && e && typeof e === 'object' && e.preview_only)
        .length;
    const previewOnlySeasons = Object.entries(episodeLog)
        .filter(([k, e]) => String(k).startsWith('season:') && e && typeof e === 'object' && e.preview_only)
        .length;
    return {
        ok: true,
        workerReady: overlaysWorkerReady(),
        config,
        logCount: Object.keys(log).length,
        episodeLogCount: episodeEntries.length,
        previewOnlyShows,
        previewOnlyEpisodes,
        previewOnlySeasons,
        running: runState.running,
        command: runState.command,
        startedAt: runState.startedAt,
        lastError: runState.lastError,
        lastOutcome: runState.lastOutcome,
        lastRunAt: config.lastRunAt,
        lastRunSummary: config.lastRunSummary,
        paths: {
            dir: OVERLAYS_DIR,
            log: OVERLAYS_LOG_PATH,
            episodeLog: OVERLAYS_EPISODE_LOG_PATH,
            preview: OVERLAYS_PREVIEW_DIR,
            backups: OVERLAYS_BACKUPS_DIR,
            assets: OVERLAYS_ASSETS_DIR,
            customPresets: OVERLAYS_CUSTOM_PRESETS_DIR,
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
        library: entry?.library || '',
        timestamp: entry?.timestamp || null,
        previewOnly: Boolean(entry?.preview_only),
        seasonIndex: entry?.seasonIndex ?? null,
        presetId: entry?.presetId || null,
        overlayMode: 'new-season',
    }));

    const extraLogs = [
        { path: OVERLAYS_RECENTLY_ADDED_LOG_PATH, overlayMode: 'recently' },
        { path: OVERLAYS_LIVE_LOG_PATH, overlayMode: 'live' },
        { path: OVERLAYS_TOP10_LOG_PATH, overlayMode: 'top10' },
    ];
    for (const { path: logPath, overlayMode } of extraLogs) {
        let extra = {};
        try {
            const raw = await fs.readFile(logPath, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) extra = parsed;
        } catch {
            extra = {};
        }
        for (const [ratingKey, entry] of Object.entries(extra)) {
            shows.push({
                ratingKey,
                title: entry?.title || ratingKey,
                library: entry?.library || '',
                timestamp: entry?.timestamp || null,
                previewOnly: Boolean(entry?.preview_only),
                seasonIndex: entry?.seasonIndex ?? null,
                presetId: entry?.presetId || null,
                overlayMode,
            });
        }
    }

    shows.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
    return { ok: true, shows, total: shows.length };
};

export const listOverlaysKometa = async () => {
    let log = {};
    try {
        const raw = await fs.readFile(OVERLAYS_KOMETA_LOG_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) log = parsed;
    } catch {
        log = {};
    }
    const items = Object.entries(log).map(([ratingKey, entry]) => ({
        ratingKey,
        title: entry?.title || ratingKey,
        library: entry?.library || '',
        itemType: entry?.itemType || '',
        timestamp: entry?.timestamp || null,
        previewOnly: Boolean(entry?.preview_only),
        families: entry?.families && typeof entry.families === 'object' ? entry.families : {},
        hasBackup: Boolean(entry?.hasBackup),
        orphanBackup: false,
    }));
    const seen = new Set(items.map((row) => String(row.ratingKey)));
    // Mid-run timeout orphans: stamped + backed up, but log never flushed.
    const kometaBackupRoot = path.join(OVERLAYS_BACKUPS_DIR, 'kometa');
    try {
        const dirs = await fs.readdir(kometaBackupRoot, { withFileTypes: true });
        for (const dirent of dirs) {
            if (!dirent.isDirectory()) continue;
            const ratingKey = String(dirent.name || '').trim();
            if (!ratingKey || seen.has(ratingKey)) continue;
            try {
                await fs.access(path.join(kometaBackupRoot, ratingKey, 'poster.png'));
            } catch {
                continue;
            }
            items.push({
                ratingKey,
                title: ratingKey,
                library: '',
                itemType: '',
                timestamp: null,
                previewOnly: false,
                families: {},
                hasBackup: true,
                orphanBackup: true,
            });
        }
    } catch {
        /* no backup dir yet */
    }
    items.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
    return { ok: true, items, total: items.length };
};

export const listOverlaysEpisodes = async () => {
    const log = await loadOverlaysEpisodeLog();
    const rows = [];
    for (const [ratingKey, entry] of Object.entries(log)) {
        if (String(ratingKey).startsWith('season:')) continue;
        rows.push({
            ratingKey,
            title: entry?.title || ratingKey,
            showTitle: entry?.showTitle || '',
            showKey: entry?.showKey || '',
            library: entry?.library || '',
            timestamp: entry?.timestamp || null,
            airedAt: entry?.airedAt || null,
            seasonIndex: entry?.seasonIndex ?? null,
            episodeIndex: entry?.episodeIndex ?? null,
            previewOnly: Boolean(entry?.preview_only),
            presetId: entry?.presetId || 'new-episode',
            kind: 'episode',
        });
    }

    const groups = new Map();
    for (const row of rows) {
        const day = String(row.airedAt || '').slice(0, 10);
        const showKey = String(row.showKey || row.showTitle || '');
        const season = row.seasonIndex;
        if (!showKey || season == null || day.length < 10) continue;
        const gid = `${showKey}|${season}|${day}`;
        if (!groups.has(gid)) groups.set(gid, []);
        groups.get(gid).push(row.ratingKey);
    }
    const bingeIds = new Set();
    for (const [gid, keys] of groups.entries()) {
        if (keys.length >= 3) {
            for (const key of keys) bingeIds.add(key);
            for (const row of rows) {
                if (keys.includes(row.ratingKey)) row.bingeGroupId = gid;
            }
        }
    }
    for (const row of rows) {
        if (!row.bingeGroupId) row.bingeGroupId = null;
    }

    rows.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
    return {
        ok: true,
        episodes: rows,
        total: rows.length,
        bingeGroupCount: [...groups.values()].filter((keys) => keys.length >= 3).length,
    };
};

export const createOverlaysRunHelpers = (deps = {}) => {
    const {
        loadPortalConfig,
        resolvePlex,
        markTaskStart,
        markTaskEnd,
        systemJob,
    } = deps;

    const prepareRun = async (command, { previewMode, runBundle, lastRunKey } = {}) => {
        if (runState.running) {
            throw Object.assign(new Error('An Overlays run is already in progress.'), { status: 409 });
        }
        const overlaysConfig = await loadOverlaysConfig();
        if (overlaysConfig.enabled === false) {
            throw Object.assign(new Error('Overlays module is disabled in its settings.'), { status: 400 });
        }
        const portal = typeof loadPortalConfig === 'function' ? await loadPortalConfig() : {};
        const plex = await getPortalPlex(loadPortalConfig, resolvePlex);
        if (!plex?.base_url || !plex?.token) {
            throw Object.assign(new Error('Configure Plex under Settings → Media Player first.'), { status: 400 });
        }
        if (!overlaysWorkerReady()) {
            throw Object.assign(new Error('Overlays worker is not installed (overlays/cli.py missing).'), { status: 500 });
        }

        const cliConfig = await buildOverlaysCliConfig(plex, {
            ...overlaysConfig,
            ...(previewMode === true ? { previewMode: true } : {}),
            ...(previewMode === false ? { previewMode: false } : {}),
            ...(runBundle ? { runBundle } : {}),
        }, portal);

        runState = {
            running: true,
            paused: false,
            command,
            startedAt: new Date().toISOString(),
            lastError: null,
            cancelled: false,
            lastOutcome: null,
        };
        pushActivity(`Starting ${command}…`);
        if (systemJob && typeof markTaskStart === 'function') markTaskStart(systemJob);

        const execute = async () => {
            try {
                const isLayer = /kometa/i.test(String(command || ''));
                const result = await runOverlaysCli(command, { config: cliConfig }, {
                    // Layer passes can legitimately run for hours on large libraries.
                    timeoutMs: isLayer ? 6 * 60 * 60_000 : 30 * 60_000,
                    idleTimeoutMs: isLayer ? 45 * 60_000 : null,
                    onProgress: (event) => pushActivity(event.message || ''),
                });

                if (result.cancelled || runState.cancelled) {
                    runState.lastError = null;
                    runState.lastOutcome = 'cancelled';
                    pushActivity('Overlays run cancelled', 'warn');
                    if (systemJob && typeof markTaskEnd === 'function') {
                        markTaskEnd(systemJob, Object.assign(new Error('cancelled'), { cancelled: true }));
                    }
                    return { ok: false, cancelled: true, logs: result.logs || [] };
                }

                if (!result.ok) {
                    const err = new Error(result.error || 'Overlays run failed');
                    runState.lastError = err.message;
                    runState.lastOutcome = 'error';
                    pushActivity(err.message, 'error');
                    if (systemJob && typeof markTaskEnd === 'function') markTaskEnd(systemJob, err);
                    throw Object.assign(err, { status: 500, logs: result.logs });
                }

                const summary = result.result || {};
                const stampKey = lastRunKey
                    || (String(command).includes('kometa') ? 'kometaLastRunAt'
                        : String(command).includes('recently') ? 'recentlyAddedLastRunAt'
                            : 'lastRunAt');
                await saveOverlaysConfig({
                    [stampKey]: new Date().toISOString(),
                    lastRunSummary: {
                        command,
                        runBundle: summary.runBundle || runBundle || null,
                        added: summary.added ?? null,
                        removed: summary.removed ?? null,
                        converted: summary.converted ?? null,
                        refreshed: summary.refreshed ?? null,
                        skipped: summary.skipped ?? null,
                        totalWithOverlays: summary.totalWithOverlays ?? null,
                        eligible: summary.eligible ?? summary.eligibleCount ?? null,
                        episodesAdded: summary.episodesAdded ?? null,
                        episodesRemoved: summary.episodesRemoved ?? null,
                        episodesRefreshed: summary.episodesRefreshed ?? null,
                        episodesEligible: summary.episodesEligible ?? null,
                        episodesTotal: summary.episodesTotal ?? null,
                        showsPromoted: summary.showsPromoted ?? null,
                        episodesPromoted: summary.episodesPromoted ?? null,
                        seasonsPromoted: summary.seasonsPromoted ?? null,
                        wouldAddCount: summary.wouldAddCount ?? null,
                        wouldRemoveCount: summary.wouldRemoveCount ?? null,
                        wouldConvertCount: summary.wouldConvertCount ?? null,
                        mediaAdded: summary.mediaAdded ?? null,
                        statusAdded: summary.statusAdded ?? null,
                        ratingsAdded: summary.ratingsAdded ?? null,
                        networkAdded: summary.networkAdded ?? null,
                        kometaAdded: summary.kometaAdded ?? null,
                        kometaRemoved: summary.kometaRemoved ?? null,
                        kometaTotal: summary.kometaTotal ?? null,
                        kometaEligible: summary.kometaEligible ?? null,
                        kometaFamilyCounts: summary.kometaFamilyCounts ?? null,
                        recentlyAddedAdded: summary.recentlyAddedAdded ?? null,
                        recentlyAddedRemoved: summary.recentlyAddedRemoved ?? null,
                        previewMode: summary.previewMode ?? previewMode ?? overlaysConfig.previewMode,
                        previewDir: summary.previewDir ?? null,
                        errors: summary.errors || [],
                        finishedAt: summary.finishedAt || new Date().toISOString(),
                    },
                });
                runState.lastOutcome = 'ok';
                const eligibleLabel = summary.eligible ?? summary.eligibleCount;
                if (command === 'promote') {
                    pushActivity(
                        `Finished promote — shows ${summary.showsPromoted ?? 0}, `
                            + `episodes ${summary.episodesPromoted ?? 0}, `
                            + `season stamps ${summary.seasonsPromoted ?? 0}`,
                    );
                } else {
                    pushActivity(
                        command === 'scan' || command === 'reconcile'
                            ? `Finished ${command} — eligible ${eligibleLabel ?? 0}`
                            : `Finished ${command} — seasons +${summary.added ?? 0}/−${summary.removed ?? 0}, `
                                + `episodes +${summary.episodesAdded ?? 0}/−${summary.episodesRemoved ?? 0}`,
                    );
                }
                if (systemJob && typeof markTaskEnd === 'function') markTaskEnd(systemJob, null);
                return { ok: true, result: summary, logs: result.logs };
            } catch (error) {
                if (runState.cancelled || error?.cancelled) {
                    runState.lastError = null;
                    runState.lastOutcome = 'cancelled';
                    return { ok: false, cancelled: true };
                }
                if (!runState.lastError) {
                    runState.lastError = error.message || String(error);
                    runState.lastOutcome = 'error';
                    pushActivity(runState.lastError, 'error');
                    if (systemJob && typeof markTaskEnd === 'function') markTaskEnd(systemJob, error);
                }
                throw error;
            } finally {
                runState.running = false;
                runState.command = null;
                runState.cancelled = false;
            }
        };

        return { execute, command };
    };

    /** Await the full worker run (scheduler / maintenance). */
    const runCommand = async (command, options = {}) => {
        const { execute } = await prepareRun(command, options);
        return execute();
    };

    /** Kick off Preview/Run and return immediately so Stop + status polling work. */
    const startCommand = async (command, options = {}) => {
        const { execute, command: started } = await prepareRun(command, options);
        void execute().catch(() => {
            /* errors recorded on runState / activity */
        });
        return { ok: true, started: true, command: started };
    };

    const stopCommand = () => {
        runState.cancelled = true;
        const killed = killActiveOverlaysWorker();
        runState.running = false;
        runState.command = null;
        runState.lastError = null;
        runState.lastOutcome = killed ? 'cancelled' : runState.lastOutcome;
        pushActivity(
            killed ? 'Stopped active overlays worker' : 'No active worker to stop',
            killed ? 'warn' : 'info',
        );
        return { ok: true, killed };
    };

    return { runCommand, startCommand, stopCommand, killActiveOverlaysWorker };
};
