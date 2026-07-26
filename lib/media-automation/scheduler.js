import { isQuietHoursActive } from './quiet-hours.js';

export const createMediaScheduler = ({
    processor,
    getConfig,
    logger = console,
    workerPollMs = 2_000,
} = {}) => {
    if (!processor || typeof getConfig !== 'function') throw new Error('processor and getConfig are required');
    let workerTimer = null;
    let scanTimer = null;
    const active = { cpu: 0, gpu: 0 };
    let scanning = false;
    let stopped = true;
    let lastScanAt = null;
    let lastScanResult = null;
    let periodicScanning = false;
    let quietHoursActive = false;

    const runWorkers = async () => {
        if (stopped) return;
        const settings = await getConfig();
        if (!settings.enabled) return;
        quietHoursActive = isQuietHoursActive(settings);
        if (quietHoursActive) return;
        for (const lane of ['cpu', 'gpu']) {
            const raw = Number(settings[`${lane}Concurrency`]);
            // Allow 0 to pause a lane. Avoid `|| 1` so an explicit 0 is not coerced.
            const concurrency = Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 1;
            while (!stopped && active[lane] < concurrency) {
                active[lane] += 1;
                processor.processOne({ lane })
                    .then((result) => {
                        if (result?.error) logger.warn?.(`[media-automation] job failed: ${result.error.message}`);
                    })
                    .catch((error) => logger.error?.(`[media-automation] processor error: ${error.message}`))
                    .finally(() => { active[lane] -= 1; });
                if (active[lane] >= concurrency) break;
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

    const status = () => ({
        running: !stopped,
        quietHoursActive,
        lanes: {
            cpu: { active: active.cpu },
            gpu: { active: active.gpu },
        },
        scanning,
        periodicScanning,
        lastScanAt,
        lastScanResult,
    });

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
