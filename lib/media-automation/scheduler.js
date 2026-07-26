import { isQuietHoursActive } from './quiet-hours.js';

const defaultGroups = (settings) => {
    const configured = Array.isArray(settings.workerGroups) ? settings.workerGroups.filter((group) => group?.enabled !== false) : [];
    if (configured.length) {
        return [...configured].sort((a, b) => (Number(b.priorityBias) || 0) - (Number(a.priorityBias) || 0));
    }
    return [{
        id: 'default',
        name: 'Default',
        tags: [],
        cpuConcurrency: Number.isFinite(Number(settings.cpuConcurrency)) ? Math.max(0, Math.round(Number(settings.cpuConcurrency))) : 1,
        gpuConcurrency: Number.isFinite(Number(settings.gpuConcurrency)) ? Math.max(0, Math.round(Number(settings.gpuConcurrency))) : 1,
        priorityBias: 0,
        enabled: true,
    }];
};

export const createMediaScheduler = ({
    processor,
    getConfig,
    logger = console,
    workerPollMs = 2_000,
    scanHistory,
    getActiveStreamCount,
    streamCheckTtlMs = 20_000,
} = {}) => {
    if (!processor || typeof getConfig !== 'function') throw new Error('processor and getConfig are required');
    let workerTimer = null;
    let scanTimer = null;
    const active = new Map();
    let scanning = false;
    let stopped = true;
    let lastScanAt = null;
    let lastScanResult = null;
    let periodicScanning = false;
    let quietHoursActive = false;
    let streamingPauseActive = false;
    let activeStreamCount = 0;
    let streamCheckAt = 0;

    const checkActiveStreams = async () => {
        if (typeof getActiveStreamCount !== 'function') return 0;
        const now = Date.now();
        if (now - streamCheckAt < streamCheckTtlMs) return activeStreamCount;
        streamCheckAt = now;
        try {
            const count = Number(await getActiveStreamCount());
            activeStreamCount = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
        } catch (error) {
            // Fail open: a session-poll error should never freeze the queue.
            logger.warn?.(`[media-automation] stream check failed: ${error.message}`);
            activeStreamCount = 0;
        }
        return activeStreamCount;
    };

    const slotKey = (groupId, lane) => `${groupId}:${lane}`;
    const getActive = (key) => active.get(key) || 0;
    const bumpActive = (key, delta) => {
        const next = Math.max(0, getActive(key) + delta);
        if (next === 0) active.delete(key);
        else active.set(key, next);
    };

    const runWorkers = async () => {
        if (stopped) return;
        const settings = await getConfig();
        if (!settings.enabled) return;
        // Queue can fill while paused; only Start (workerPaused=false) claims encodes.
        if (settings.workerPaused === true) return;
        quietHoursActive = isQuietHoursActive(settings);
        if (quietHoursActive) return;
        let pausedLanes = [];
        if (settings.pauseWhenStreamingEnabled) {
            const streams = await checkActiveStreams();
            streamingPauseActive = streams > 0;
            if (streamingPauseActive) {
                pausedLanes = settings.pauseWhenStreamingLanes === 'all' ? ['cpu', 'gpu'] : ['gpu'];
            }
        } else {
            streamingPauseActive = false;
        }
        for (const group of defaultGroups(settings)) {
            for (const lane of ['cpu', 'gpu']) {
                if (pausedLanes.includes(lane)) continue;
                const raw = Number(group[`${lane}Concurrency`]);
                const concurrency = Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 1;
                const key = slotKey(group.id, lane);
                while (!stopped && getActive(key) < concurrency) {
                    bumpActive(key, 1);
                    processor.processOne({
                        lane,
                        tags: group.tags,
                        priorityBias: group.priorityBias,
                        workerGroupId: group.id,
                    })
                        .then((result) => {
                            if (result?.error) logger.warn?.(`[media-automation] job failed: ${result.error.message}`);
                        })
                        .catch((error) => logger.error?.(`[media-automation] processor error: ${error.message}`))
                        .finally(() => { bumpActive(key, -1); });
                    if (getActive(key) >= concurrency) break;
                }
            }
        }
    };

    const runScan = async () => {
        if (scanning) return lastScanResult;
        const settings = await getConfig();
        if (!settings.enabled) return null;
        scanning = true;
        try {
            const result = await processor.scan();
            lastScanAt = new Date().toISOString();
            lastScanResult = {
                ...result,
                at: lastScanAt,
            };
            try {
                await scanHistory?.record?.(lastScanResult);
            } catch (error) {
                logger.warn?.(`[media-automation] scan history write failed: ${error.message}`);
            }
            return lastScanResult;
        } finally {
            scanning = false;
        }
    };

    const clearScanTimer = () => {
        if (scanTimer) {
            clearInterval(scanTimer);
            scanTimer = null;
        }
        periodicScanning = false;
    };

    const armPeriodicScan = async () => {
        clearScanTimer();
        if (stopped) return;
        const settings = await getConfig();
        if (!settings.enabled || settings.libraryScanEnabled === false) return;
        const intervalMs = Math.max(15, Number(settings.libraryScanIntervalMinutes) || 360) * 60_000;
        periodicScanning = true;
        scanTimer = setInterval(() => {
            void runScan().catch((error) => {
                logger.warn?.(`[media-automation] periodic scan failed: ${error.message}`);
            });
        }, intervalMs);
        scanTimer.unref?.();
    };

    const start = async () => {
        if (!stopped) return;
        stopped = false;
        workerTimer = setInterval(() => void runWorkers(), workerPollMs);
        workerTimer.unref?.();
        await armPeriodicScan();
        await runWorkers();
    };

    const stop = () => {
        stopped = true;
        clearInterval(workerTimer);
        workerTimer = null;
        clearScanTimer();
    };

    const laneTotals = () => {
        let cpu = 0;
        let gpu = 0;
        for (const [key, count] of active.entries()) {
            if (key.endsWith(':cpu')) cpu += count;
            if (key.endsWith(':gpu')) gpu += count;
        }
        return { cpu, gpu };
    };

    const status = () => {
        const totals = laneTotals();
        return {
            running: !stopped,
            quietHoursActive,
            streamingPauseActive,
            activeStreamCount,
            lanes: {
                cpu: { active: totals.cpu },
                gpu: { active: totals.gpu },
            },
            workerSlots: Object.fromEntries(active.entries()),
            scanning,
            periodicScanning,
            lastScanAt,
            lastScanResult,
        };
    };

    return {
        start,
        stop,
        scanNow: runScan,
        processNow: runWorkers,
        refreshScanSchedule: armPeriodicScan,
        status,
    };
};

export default createMediaScheduler;
