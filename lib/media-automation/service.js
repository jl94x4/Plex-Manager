import path from 'path';
import { normalizeMediaAutomationConfig } from './config.js';
import { createAtomicJsonStore } from './store.js';
import { createDurableJobQueue } from './queue.js';
import { createMediaProcessor } from './processor.js';
import { createMediaScheduler } from './scheduler.js';
import { createCatalogStore } from './catalog.js';
import { createActivityStore } from './activity.js';
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
    executorFactory,
    workerId,
    registry = createMediaPluginRegistry(),
    onActivity,
} = {}) => {
    const filePath = queuePath || (dataDir ? path.join(path.resolve(dataDir), 'queue.json') : '');
    if (!filePath) throw new Error('[media-automation] dataDir or queuePath is required');
    const rootDir = dataDir ? path.resolve(dataDir) : path.dirname(path.resolve(filePath));
    const normalizedConfig = async () => normalizeMediaAutomationConfig(await getConfig());
    const store = createAtomicJsonStore({
        filePath,
        defaultValue: { version: 1, jobs: [] },
    });
    const queue = createDurableJobQueue({ store, clock });
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
        executorFactory,
        workerId,
        libraries,
        pipelines,
        registry,
        activity,
    });
    const scheduler = createMediaScheduler({
        processor,
        getConfig: normalizedConfig,
        logger,
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
                type: 'library.scan.completed',
                message: `Library scan finished: ${result.enqueued || 0} queued, ${result.skipped || 0} skipped`,
                data: result,
            });
        }
        return result;
    };

    const start = async () => {
        await queue.recoverExpired();
        await scheduler.start();
        await watcher.start();
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
        return {
            ...schedulerStatus,
            watch: watcherStatus,
            libraryScanEnabled: settings.libraryScanEnabled !== false,
            libraryWatchEnabled: settings.libraryWatchEnabled !== false,
            libraryScanIntervalMinutes: settings.libraryScanIntervalMinutes,
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
        await scheduler.refreshScanSchedule();
        return watcher.reload();
    };

    const api = {
        start,
        stop,
        status,
        scanNow,
        processNow: processor.processOne,
        enqueuePath: processor.enqueuePath,
        cancelJob: processor.cancel,
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
        plugins: registry,
        listActivity: activity.list,
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
