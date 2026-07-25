export {
    getDefaultMediaAutomationConfig,
    normalizeMediaAutomationConfig,
} from './config.js';
export { createAtomicJsonStore } from './store.js';
export { createCatalogStore } from './catalog.js';
export { createActivityStore } from './activity.js';
export {
    JOB_STATES,
    JOB_PHASES,
    TERMINAL_JOB_STATES,
    canTransitionJob,
    transitionJob,
    createMediaJob,
    fingerprintSourceFile,
    buildJobDedupeKey,
} from './models.js';
export { createDurableJobQueue } from './queue.js';
export { matchMediaRule, findMatchingRule, buildRuleContext } from './rules.js';
export {
    isPathContained,
    resolveContainedPath,
    discoverMediaFiles,
    listMediaFiles,
} from './files.js';
export { spawnCommand } from './spawn.js';
export { probeMedia } from './ffprobe.js';
export {
    CPU_ADAPTER,
    NVENC_ADAPTER,
    QSV_ADAPTER,
    INTEL_VAAPI_ADAPTER,
    VAAPI_ADAPTER,
    MEDIA_ADAPTERS,
    detectFfmpegCapabilities,
    selectMediaAdapter,
    resolveAdapterEncoder,
    runSyntheticHardwareTest,
    createSyntheticAdapterTest,
} from './adapters.js';
export {
    BUILTIN_PLUGIN_IDS,
    createMediaPluginRegistry,
} from './plugins.js';
export { buildFfmpegPlan } from './ffmpeg-plan.js';
export { createLocalMediaExecutor } from './executor.js';
export {
    captureSourceFileMetadata,
    prepareMediaOutput,
    verifyMediaOutput,
    finalizeMediaOutput,
    discardMediaOutput,
} from './output.js';
export { createMediaProcessor } from './processor.js';
export { createMediaScheduler } from './scheduler.js';
export { createMediaAutomation } from './service.js';

export { default } from './service.js';
