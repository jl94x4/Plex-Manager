import path from 'path';
import { normalizeMediaAutomationConfig } from './config.js';
import { createAtomicJsonStore } from './store.js';
import { createDurableJobQueue } from './queue.js';
import { createMediaProcessor } from './processor.js';
import { createMediaScheduler } from './scheduler.js';
import { createCatalogStore } from './catalog.js';
import { createActivityStore } from './activity.js';
import { createHistoryStore } from './history.js';
import { createScanHistoryStore } from './scan-history.js';
import { createMediaPluginRegistry } from './plugins.js';
import { createMediaLibraryWatcher } from './watcher.js';

export const createMediaAutomation = ({
    dataDir,
    queuePath,
    getConfig = async () => ({}),
    logger = console,
    clock,
    probe,
    detectCapabilities,
    runner,
    workerId,
    registry = createMediaPluginRegistry(),
    onActivity,
    resolveDeliveryNaming,
    onMediaCommitted,
    getActiveStreamCount,
} = {}) => {
    const filePath = queuePath || (dataDir ? path.join(path.resolve(dataDir), 'queue.json') : '');
    if (!filePath) throw new Error('[media-automation] dataDir or queuePath is required');
    const rootDir = dataDir ? path.resolve(dataDir) : path.dirname(path.resolve(filePath));
    const normalizedConfig = async () => normalizeMediaAutomationConfig(await getConfig());
    const history = createHistoryStore({
        clock,
        store: createAtomicJsonStore({
            filePath: path.join(rootDir, 'history.json'),
            defaultValue: { version: 1, entries: [] },
        }),
    });
    const scanHistory = createScanHistoryStore({
        clock,
        store: createAtomicJsonStore({
            filePath: path.join(rootDir, 'scan-history.json'),
            defaultValue: { version: 1, entries: [], progress: null },
        }),
    });
    const store = createAtomicJsonStore({
        filePath,
        defaultValue: { version: 1, jobs: [] },
    });
    const queue = createDurableJobQueue({
        store,
        clock,
        onTerminal: (job) => history.record(job),
    });
    const libraries = createCatalogStore({
        kind: 'library',
        clock,
        store: createAtomicJsonStore({
            filePath: path.join(rootDir, 'libraries.json'),
            defaultValue: { version: 1, items: [] },
        }),
    });
    const pipelines = createCatalogStore({
        kind: 'pipeline',
        clock,
        store: createAtomicJsonStore({
            filePath: path.join(rootDir, 'pipelines.json'),
            defaultValue: { version: 1, items: [] },
        }),
    });
    const activity = createActivityStore({
        clock,
        onActivity,
        store: createAtomicJsonStore({
            filePath: path.join(rootDir, 'activity.json'),
            defaultValue: { version: 1, entries: [] },
        }),
    });
    const processor = createMediaProcessor({
        queue,
        getConfig: normalizedConfig,
        logger,
        probe,
        detectCapabilities,
        runner,
        workerId,
        libraries,
        pipelines,
        registry,
        activity,
        scanHistory,
        resolveDeliveryNaming,
        onMediaCommitted,
    });
    const scheduler = createMediaScheduler({
        processor,
        getConfig: normalizedConfig,
        logger,
        scanHistory,
        getActiveStreamCount,
    });
    const watcher = createMediaLibraryWatcher({
        getConfig: normalizedConfig,
        listLibraries: () => libraries.list(),
        enqueuePath: (filePathValue, options) => processor.enqueuePath(filePathValue, options),
        onActivity: (entry) => activity.append(entry),
        logger,
    });

    const scanNow = async () => {
        const result = await scheduler.scanNow();
        if (result) {
            await activity.append({
                type: result.cancelled ? 'library.scan.cancelled' : 'library.scan.completed',
                message: result.cancelled
                    ? `Library scan cancelled: ${result.enqueued || 0} queued, ${result.skipped || 0} skipped before stop`
                    : `Library scan finished: ${result.enqueued || 0} queued, ${result.skipped || 0} skipped`,
                data: result,
            });
        }
        return result;
    };

    const cancelScan = async () => {
        const cancelled = scheduler.cancelScan();
        if (cancelled) {
            await activity.append({
                type: 'library.scan.cancel-requested',
                message: 'Library scan cancel requested',
            });
        }
        return { cancelled };
    };

    const start = async () => {
        await queue.recoverExpired();
        await scheduler.start();
        // Watcher setup on large remote mounts must not block portal startup.
        void watcher.start().catch((error) => {
            logger.warn?.(`[media-automation] watcher start failed: ${error.message}`);
        });
        return api;
    };
    const stop = async () => {
        scheduler.stop();
        await watcher.stop();
    };
    const status = async () => {
        const jobs = await queue.list();
        const settings = await normalizedConfig();
        const schedulerStatus = scheduler.status();
        const watcherStatus = watcher.status();
        const scanProgress = await scanHistory.getProgress();
        const recentScans = await scanHistory.list({ limit: 10 });
        const savings7d = await history.aggregates({ days: 7 });
        const savings30d = await history.aggregates({ days: 30 });
        const deliveryTargets = (settings.deliveryTargets || []).filter((target) => target.enabled !== false);
        return {
            ...schedulerStatus,
            watch: watcherStatus,
            libraryScanEnabled: settings.libraryScanEnabled !== false,
            libraryWatchEnabled: settings.libraryWatchEnabled !== false,
            libraryScanIntervalMinutes: settings.libraryScanIntervalMinutes,
            outputMode: settings.outputMode,
            dryRun: !!settings.dryRun || settings.outputMode === 'dry-run',
            hardwareAcceleration: settings.hardwareAcceleration,
            fallbackHardware: settings.fallback?.hardware || 'cpu',
            quietHoursEnabled: settings.quietHoursEnabled === true,
            quietHoursStart: settings.quietHoursStart,
            quietHoursEnd: settings.quietHoursEnd,
            quietHoursDays: settings.quietHoursDays || [],
            pauseWhenStreamingEnabled: settings.pauseWhenStreamingEnabled === true,
            pauseWhenStreamingLanes: settings.pauseWhenStreamingLanes || 'gpu',
            arrRescanEnabled: settings.arrRescanEnabled === true,
            minSavingsPercent: settings.minSavingsPercent || 0,
            dolbyVisionHandling: settings.dolbyVisionHandling || 'skip',
            hdr10Handling: settings.hdr10Handling || 'preserve',
            workerPaused: settings.workerPaused !== false,
            workerGroups: settings.workerGroups || [],
            deliveryTargets,
            scanProgress,
            recentScans,
            savings: {
                '7d': savings7d,
                '30d': savings30d,
            },
            lanes: {
                cpu: {
                    ...schedulerStatus.lanes.cpu,
                    queued: jobs.filter((job) => job.state === 'queued' && job.lane === 'cpu').length,
                    running: jobs.filter((job) => job.state === 'running' && job.lane === 'cpu').length,
                },
                gpu: {
                    ...schedulerStatus.lanes.gpu,
                    queued: jobs.filter((job) => job.state === 'queued' && job.lane === 'gpu').length,
                    running: jobs.filter((job) => job.state === 'running' && job.lane === 'gpu').length,
                },
            },
            jobs,
        };
    };
    const reloadLibraries = async () => {
        await scheduler.refreshScanSchedule().catch((error) => {
            logger.warn?.(`[media-automation] scan schedule refresh failed: ${error.message}`);
        });
        // Never let watcher setup (large remote mounts) fail library CRUD.
        return watcher.reload().catch((error) => {
            logger.warn?.(`[media-automation] watcher reload failed: ${error.message}`);
            return { watching: false, roots: [], error: error.message };
        });
    };

    const api = {
        start,
        stop,
        status,
        scanNow,
        cancelScan,
        processNow: processor.processOne,
        enqueuePath: processor.enqueuePath,
        cancelJob: processor.cancel,
        estimate: processor.estimate,
        analyze: processor.analyze,
        cancelJobs: queue.cancelMany,
        removeJobs: queue.removeMany,
        retryJobs: queue.retryMany,
        retryJob: queue.retry,
        setJobPriority: queue.setPriority,
        skipJob: queue.skip,
        listJobs: queue.list,
        getJob: queue.get,
        pruneJobs: queue.prune,
        queue,
        libraries,
        pipelines,
        activity,
        history,
        scanHistory,
        plugins: registry,
        listActivity: activity.list,
        listHistory: history.list,
        historyAggregates: history.aggregates,
        listScanHistory: scanHistory.list,
        recordActivity: activity.append,
        processor,
        scheduler,
        watcher,
        reloadLibraries,
        store,
    };
    return api;
};

export default createMediaAutomation;
