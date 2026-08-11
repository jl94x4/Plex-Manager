import { loadOverlaysConfig } from './config.js';
import { createOverlaysRunHelpers, pushActivity } from './runtime.js';

let timer = null;
let started = false;

/**
 * Schedule periodic New Season overlay runs.
 */
export const startOverlaysScheduler = (deps = {}) => {
    if (started) return;
    started = true;

    const { runCommand } = createOverlaysRunHelpers(deps);

    const tick = async () => {
        try {
            if (typeof deps.isFeatureEnabled === 'function') {
                const enabled = await deps.isFeatureEnabled();
                if (!enabled) return;
            }
            const config = await loadOverlaysConfig();
            if (config.enabled === false) return;
            if (!config.scheduleHours || config.scheduleHours <= 0) return;

            const last = config.lastRunAt ? Date.parse(config.lastRunAt) : 0;
            const intervalMs = config.scheduleHours * 60 * 60 * 1000;
            if (last && Date.now() - last < intervalMs) {
                if (deps.systemJob) {
                    deps.systemJob.nextRun = new Date(last + intervalMs).toISOString();
                }
                return;
            }

            pushActivity('Scheduled New Season overlay run starting…');
            await runCommand(config.previewMode ? 'preview' : 'run', {
                previewMode: config.previewMode === true,
            });
            if (deps.systemJob) {
                deps.systemJob.nextRun = new Date(Date.now() + intervalMs).toISOString();
            }
        } catch (error) {
            pushActivity(`Scheduled run failed: ${error.message || error}`, 'error');
        }
    };

    timer = setInterval(() => { void tick(); }, 15 * 60 * 1000);
    setTimeout(() => { void tick(); }, 45_000);

    if (deps.systemJob) {
        deps.systemJob.nextRun = new Date(Date.now() + 45_000).toISOString();
    }
};

export const stopOverlaysScheduler = () => {
    if (timer) clearInterval(timer);
    timer = null;
    started = false;
};

export const runOverlaysScheduledJob = async (deps = {}) => {
    const { runCommand } = createOverlaysRunHelpers(deps);
    const config = await loadOverlaysConfig();
    return runCommand(config.previewMode ? 'preview' : 'run', {
        previewMode: config.previewMode === true,
    });
};
