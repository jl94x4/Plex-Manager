const DEFAULTS = Object.freeze({
    enabled: false,
    dryRun: true,
    libraryRoots: [],
    extensions: ['.mkv', '.mp4', '.m4v', '.avi', '.mov', '.ts', '.m2ts', '.webm'],
    cpuConcurrency: 1,
    gpuConcurrency: 1,
    leaseMs: 120_000,
    heartbeatMs: 30_000,
    jobTimeoutMs: 6 * 60 * 60 * 1000,
    maxAttempts: 3,
    retryDelayMs: 60_000,
    ffmpegPath: 'ffmpeg',
    ffprobePath: 'ffprobe',
    hardwareAcceleration: 'auto',
    allowCpuFallback: true,
    outputMode: 'dry-run',
    outputExtension: '.mkv',
    quarantineDir: '',
    verifyOutput: true,
    minimumOutputBytes: 1024,
    vaapiDevice: '/dev/dri/renderD128',
    libraryScanEnabled: true,
    libraryScanIntervalMinutes: 360,
    // Off by default: recursive watches on large Unraid/remote mounts can stall or OOM the portal.
    libraryWatchEnabled: false,
    libraryWatchDebounceMs: 5000,
    libraryWatchUsePolling: true,
    libraryWatchPollIntervalMs: 15_000,
    customCommandAllowlist: ['ffmpeg', 'ffprobe'],
    /** Send Gotify when a job fails (requires portal Gotify settings). */
    notifyOnJobFailed: false,
    /** Pause new encodes during this local-time window (scans/webhooks still enqueue). */
    quietHoursEnabled: false,
    quietHoursStart: '23:00',
    quietHoursEnd: '07:00',
    /** Empty = every day. 0=Sun … 6=Sat. */
    quietHoursDays: [],
    /** Hold encode lanes while Plex/Jellyfin sessions are active (host provides the stream count). */
    pauseWhenStreamingEnabled: false,
    /** 'gpu' pauses only GPU-lane encodes; 'all' also pauses CPU-lane work. */
    pauseWhenStreamingLanes: 'gpu',
    /** Ask Sonarr/Radarr to rescan the affected series/movie after replace or delivery. */
    arrRescanEnabled: false,
    /** 0 disables. Transcodes whose output saves less than this percent are discarded and the original kept. */
    minSavingsPercent: 0,
    /** Dolby Vision re-encodes drop the RPU — skip by default. Remux/copy still allowed. */
    dolbyVisionHandling: 'skip',
    /** HDR10/HLG: preserve metadata + force 10-bit on HEVC/AV1, or strip / skip. */
    hdr10Handling: 'preserve',
    /**
     * When true, scan/enqueue still work but the worker does not claim encode jobs.
     * Default paused so enabling Media Automation cannot surprise-start encodes.
     */
    workerPaused: true,
    workerGroups: [],
    deliveryTargets: [],
    rules: [],
});

const asInt = (value, fallback, min, max) => {
    const number = Number(value);
    return Number.isFinite(number)
        ? Math.min(max, Math.max(min, Math.round(number)))
        : fallback;
};

const normalizeExtension = (value) => {
    const extension = String(value || '').trim().toLowerCase();
    if (!extension || /[\\/\0]/.test(extension)) return '';
    return extension.startsWith('.') ? extension : `.${extension}`;
};

const normalizeTagList = (value, { max = 24 } = {}) => [...new Set(
    (Array.isArray(value) ? value : String(value || '').split(/[,\s]+/))
        .map((entry) => String(entry || '').trim().toLowerCase())
        .filter((entry) => entry && entry.length <= 40)
        .slice(0, max),
)];

const normalizeWorkerGroup = (value = {}, index = 0) => {
    const source = value && typeof value === 'object' ? value : {};
    const id = String(source.id || `group-${index + 1}`).trim().slice(0, 64) || `group-${index + 1}`;
    return {
        id,
        name: String(source.name || id).trim().slice(0, 80) || id,
        tags: normalizeTagList(source.tags),
        cpuConcurrency: asInt(source.cpuConcurrency, DEFAULTS.cpuConcurrency, 0, 32),
        gpuConcurrency: asInt(source.gpuConcurrency, DEFAULTS.gpuConcurrency, 0, 16),
        priorityBias: asInt(source.priorityBias, 0, -100, 100),
        enabled: source.enabled !== false,
    };
};

const normalizeDeliveryTarget = (value = {}, index = 0) => {
    const source = value && typeof value === 'object' ? value : {};
    const id = String(source.id || `delivery-${index + 1}`).trim().slice(0, 64) || `delivery-${index + 1}`;
    const mode = String(source.mode || 'copy').toLowerCase() === 'move' ? 'move' : 'copy';
    const namingMode = String(source.namingMode || 'as-is').toLowerCase() === 'sonarr-pattern'
        ? 'sonarr-pattern'
        : 'as-is';
    return {
        id,
        name: String(source.name || id).trim().slice(0, 80) || id,
        path: String(source.path || '').trim(),
        mode,
        namingMode,
        enabled: source.enabled !== false,
        sonarrInstanceId: source.sonarrInstanceId == null || source.sonarrInstanceId === ''
            ? null
            : String(source.sonarrInstanceId),
    };
};

const normalizeQuietHoursDays = (value) => {
    if (!Array.isArray(value) || value.length === 0) return [];
    return [...new Set(
        value
            .map((entry) => Number(entry))
            .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
    )].sort((a, b) => a - b);
};

export const getDefaultMediaAutomationConfig = () => structuredClone(DEFAULTS);

export const normalizeMediaAutomationConfig = (incoming = {}, existing = {}) => {
    const source = incoming && typeof incoming === 'object' ? incoming : {};
    const previous = existing && typeof existing === 'object' ? existing : {};
    const merged = { ...getDefaultMediaAutomationConfig(), ...previous, ...source };
    const roots = Array.isArray(merged.libraryRoots) ? merged.libraryRoots : [];
    const extensions = Array.isArray(merged.extensions) ? merged.extensions : DEFAULTS.extensions;
    const hardware = String(merged.hardwareAcceleration || 'auto').toLowerCase();
    const outputMode = String(merged.outputMode || 'dry-run').toLowerCase();

    const normalizedOutputMode = ['replace', 'copy', 'dry-run'].includes(outputMode)
        ? outputMode
        : DEFAULTS.outputMode;

    const workerGroups = Array.isArray(merged.workerGroups)
        ? merged.workerGroups.map(normalizeWorkerGroup).slice(0, 16)
        : [];
    const deliveryTargets = Array.isArray(merged.deliveryTargets)
        ? merged.deliveryTargets.map(normalizeDeliveryTarget).slice(0, 16)
        : [];

    return {
        enabled: !!merged.enabled,
        // Keep dryRun aligned with outputMode so Copy/Replace are not silently forced back to plan-only.
        dryRun: normalizedOutputMode === 'dry-run',
        libraryRoots: [...new Set(roots.map((entry) => String(entry || '').trim()).filter(Boolean))],
        extensions: [...new Set(extensions.map(normalizeExtension).filter(Boolean))],
        // 0 pauses that lane (no new claims); defaults remain 1.
        cpuConcurrency: asInt(merged.cpuConcurrency ?? merged.concurrency, DEFAULTS.cpuConcurrency, 0, 32),
        gpuConcurrency: asInt(merged.gpuConcurrency, DEFAULTS.gpuConcurrency, 0, 16),
        leaseMs: asInt(merged.leaseMs, DEFAULTS.leaseMs, 10_000, 86_400_000),
        heartbeatMs: asInt(merged.heartbeatMs, DEFAULTS.heartbeatMs, 1_000, 3_600_000),
        jobTimeoutMs: asInt(merged.jobTimeoutMs, DEFAULTS.jobTimeoutMs, 10_000, 7 * 86_400_000),
        maxAttempts: asInt(merged.maxAttempts, DEFAULTS.maxAttempts, 1, 100),
        retryDelayMs: asInt(merged.retryDelayMs, DEFAULTS.retryDelayMs, 0, 86_400_000),
        ffmpegPath: String(merged.ffmpegPath || DEFAULTS.ffmpegPath).trim(),
        ffprobePath: String(merged.ffprobePath || DEFAULTS.ffprobePath).trim(),
        hardwareAcceleration: ['auto', 'cpu', 'nvenc', 'qsv', 'intel-vaapi', 'vaapi'].includes(hardware) ? hardware : 'auto',
        allowCpuFallback: merged.allowCpuFallback !== false,
        outputMode: normalizedOutputMode,
        outputExtension: normalizeExtension(merged.outputExtension) || DEFAULTS.outputExtension,
        quarantineDir: String(merged.quarantineDir || '').trim(),
        verifyOutput: merged.verifyOutput !== false,
        minimumOutputBytes: asInt(merged.minimumOutputBytes, DEFAULTS.minimumOutputBytes, 1, Number.MAX_SAFE_INTEGER),
        vaapiDevice: String(merged.vaapiDevice || DEFAULTS.vaapiDevice).trim(),
        libraryScanEnabled: merged.libraryScanEnabled !== false,
        libraryScanIntervalMinutes: asInt(
            merged.libraryScanIntervalMinutes,
            DEFAULTS.libraryScanIntervalMinutes,
            15,
            10080,
        ),
        libraryWatchEnabled: merged.libraryWatchEnabled === true,
        libraryWatchDebounceMs: asInt(
            merged.libraryWatchDebounceMs,
            DEFAULTS.libraryWatchDebounceMs,
            500,
            120_000,
        ),
        libraryWatchUsePolling: merged.libraryWatchUsePolling !== false,
        libraryWatchPollIntervalMs: asInt(
            merged.libraryWatchPollIntervalMs,
            DEFAULTS.libraryWatchPollIntervalMs,
            2_000,
            300_000,
        ),
        customCommandAllowlist: [...new Set(
            (Array.isArray(merged.customCommandAllowlist)
                ? merged.customCommandAllowlist
                : DEFAULTS.customCommandAllowlist)
                .map((entry) => String(entry || '').trim())
                .filter(Boolean)
                .slice(0, 32),
        )],
        notifyOnJobFailed: merged.notifyOnJobFailed === true,
        quietHoursEnabled: merged.quietHoursEnabled === true,
        quietHoursStart: /^\d{1,2}:\d{2}$/.test(String(merged.quietHoursStart || '').trim())
            ? String(merged.quietHoursStart).trim()
            : DEFAULTS.quietHoursStart,
        quietHoursEnd: /^\d{1,2}:\d{2}$/.test(String(merged.quietHoursEnd || '').trim())
            ? String(merged.quietHoursEnd).trim()
            : DEFAULTS.quietHoursEnd,
        quietHoursDays: normalizeQuietHoursDays(merged.quietHoursDays),
        pauseWhenStreamingEnabled: merged.pauseWhenStreamingEnabled === true,
        pauseWhenStreamingLanes: String(merged.pauseWhenStreamingLanes || '').toLowerCase() === 'all' ? 'all' : 'gpu',
        arrRescanEnabled: merged.arrRescanEnabled === true,
        minSavingsPercent: asInt(merged.minSavingsPercent, DEFAULTS.minSavingsPercent, 0, 95),
        dolbyVisionHandling: ['skip', 'preserve', 'strip'].includes(String(merged.dolbyVisionHandling || '').toLowerCase())
            ? String(merged.dolbyVisionHandling).toLowerCase()
            : DEFAULTS.dolbyVisionHandling,
        hdr10Handling: ['preserve', 'strip', 'skip'].includes(String(merged.hdr10Handling || '').toLowerCase())
            ? String(merged.hdr10Handling).toLowerCase()
            : DEFAULTS.hdr10Handling,
        // Absent / undefined → paused (safe default). Explicit false allows encoding.
        workerPaused: merged.workerPaused !== false,
        workerGroups,
        deliveryTargets,
        rules: Array.isArray(merged.rules) ? merged.rules.filter((rule) => rule && typeof rule === 'object') : [],
    };
};

export {
    normalizeTagList,
    normalizeWorkerGroup,
    normalizeDeliveryTarget,
    normalizeQuietHoursDays,
};

export default normalizeMediaAutomationConfig;
