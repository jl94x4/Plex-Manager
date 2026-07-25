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

export const getDefaultMediaAutomationConfig = () => structuredClone(DEFAULTS);

export const normalizeMediaAutomationConfig = (incoming = {}, existing = {}) => {
    const source = incoming && typeof incoming === 'object' ? incoming : {};
    const previous = existing && typeof existing === 'object' ? existing : {};
    const merged = { ...getDefaultMediaAutomationConfig(), ...previous, ...source };
    const roots = Array.isArray(merged.libraryRoots) ? merged.libraryRoots : [];
    const extensions = Array.isArray(merged.extensions) ? merged.extensions : DEFAULTS.extensions;
    const hardware = String(merged.hardwareAcceleration || 'auto').toLowerCase();
    const outputMode = String(merged.outputMode || 'dry-run').toLowerCase();

    return {
        enabled: !!merged.enabled,
        dryRun: merged.dryRun !== false,
        libraryRoots: [...new Set(roots.map((entry) => String(entry || '').trim()).filter(Boolean))],
        extensions: [...new Set(extensions.map(normalizeExtension).filter(Boolean))],
        cpuConcurrency: asInt(merged.cpuConcurrency ?? merged.concurrency, DEFAULTS.cpuConcurrency, 1, 32),
        gpuConcurrency: asInt(merged.gpuConcurrency, DEFAULTS.gpuConcurrency, 1, 16),
        leaseMs: asInt(merged.leaseMs, DEFAULTS.leaseMs, 10_000, 86_400_000),
        heartbeatMs: asInt(merged.heartbeatMs, DEFAULTS.heartbeatMs, 1_000, 3_600_000),
        jobTimeoutMs: asInt(merged.jobTimeoutMs, DEFAULTS.jobTimeoutMs, 10_000, 7 * 86_400_000),
        maxAttempts: asInt(merged.maxAttempts, DEFAULTS.maxAttempts, 1, 100),
        retryDelayMs: asInt(merged.retryDelayMs, DEFAULTS.retryDelayMs, 0, 86_400_000),
        ffmpegPath: String(merged.ffmpegPath || DEFAULTS.ffmpegPath).trim(),
        ffprobePath: String(merged.ffprobePath || DEFAULTS.ffprobePath).trim(),
        hardwareAcceleration: ['auto', 'cpu', 'nvenc', 'qsv', 'intel-vaapi', 'vaapi'].includes(hardware) ? hardware : 'auto',
        allowCpuFallback: merged.allowCpuFallback !== false,
        outputMode: ['replace', 'copy', 'dry-run'].includes(outputMode) ? outputMode : DEFAULTS.outputMode,
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
        rules: Array.isArray(merged.rules) ? merged.rules.filter((rule) => rule && typeof rule === 'object') : [],
    };
};

export default normalizeMediaAutomationConfig;
