export const createMediaScheduler = ({
    processor,
    getConfig,
    logger = console,
    workerPollMs = 2_000,
} = {}) => {
    if (!processor || typeof getConfig !== 'function') throw new Error('processor and getConfig are required');
    let workerTimer = null;
    const active = { cpu: 0, gpu: 0 };
    let scanning = false;
    let stopped = true;

    const runWorkers = async () => {
        if (stopped) return;
        const settings = await getConfig();
        if (!settings.enabled) return;
        for (const lane of ['cpu', 'gpu']) {
            const concurrency = Math.max(1, Number(settings[`${lane}Concurrency`]) || 1);
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
        if (scanning) return null;
        const settings = await getConfig();
        if (!settings.enabled) return null;
        scanning = true;
        try {
            return await processor.scan();
        } finally {
            scanning = false;
        }
    };

    const start = async () => {
        if (!stopped) return;
        stopped = false;
        workerTimer = setInterval(() => void runWorkers(), workerPollMs);
        workerTimer.unref?.();
        await runWorkers();
    };

    const stop = () => {
        stopped = true;
        clearInterval(workerTimer);
        workerTimer = null;
    };

    const status = () => ({
        running: !stopped,
        lanes: {
            cpu: { active: active.cpu },
            gpu: { active: active.gpu },
        },
        scanning,
        periodicScanning: false,
    });
    return { start, stop, scanNow: runScan, processNow: runWorkers, status };
};

export default createMediaScheduler;
