export type MediaAutomationTab = 'overview' | 'queue' | 'pipelines' | 'libraries' | 'activity';
export type OutputMode = 'dry-run' | 'copy' | 'replace';
export type HardwareMode = 'auto' | 'cpu' | 'nvenc' | 'qsv' | 'intel-vaapi' | 'vaapi';

export type MediaAutomationMetrics = {
    processed24h?: number;
    failed24h?: number;
    cancelled24h?: number;
    successRate24h?: number | null;
    bytesIn24h?: number;
    bytesOut24h?: number;
};

export type MediaAutomationStatus = {
    enabled?: boolean;
    state?: string;
    workerState?: string;
    paused?: boolean;
    activeJobs?: number;
    queuedJobs?: number;
    completedJobs?: number;
    failedJobs?: number;
    startedAt?: string;
    lastHeartbeat?: string;
    version?: string;
    scanning?: boolean;
    periodicScanning?: boolean;
    lastScanAt?: string;
    lastScanResult?: {
        discovered?: number;
        enqueued?: number;
        skipped?: number;
        errors?: unknown[];
        at?: string;
    } | null;
    libraryScanEnabled?: boolean;
    libraryWatchEnabled?: boolean;
    libraryScanIntervalMinutes?: number;
    outputMode?: OutputMode;
    dryRun?: boolean;
    watch?: {
        watching?: boolean;
        pending?: number;
        roots?: string[];
    };
    metrics?: MediaAutomationMetrics;
    lanes?: {
        cpu?: { active?: number; queued?: number; running?: number };
        gpu?: { active?: number; queued?: number; running?: number };
    };
    [key: string]: unknown;
};

export type MediaAutomationCapabilities = {
    available?: boolean;
    ffmpeg?: boolean | { available?: boolean; version?: string };
    ffprobe?: boolean | { available?: boolean; version?: string };
    hardware?: string[];
    encoders?: string[];
    error?: string;
    [key: string]: unknown;
};

export type MediaAutomationJobProgress = {
    percent?: number;
    outTimeUs?: number;
    etaSeconds?: number | null;
    speed?: number | string | null;
    fps?: number | null;
    durationSeconds?: number | null;
    step?: number;
    stepCount?: number;
    command?: string;
    currentCommand?: string;
};

export type MediaAutomationPlan = {
    mode?: string;
    kind?: string;
    stepType?: string;
    adapter?: string | null;
    adapterLabel?: string | null;
    executable?: string;
    args?: string[];
    inputPath?: string;
    outputPath?: string;
    [key: string]: unknown;
};

export type MediaAutomationJob = {
    id: string | number;
    path?: string;
    sourcePath?: string;
    pipelineId?: string | number;
    pipelineName?: string;
    status?: string;
    state?: string;
    phase?: string;
    lane?: string;
    priority?: number;
    attempts?: number;
    maxAttempts?: number;
    progress?: number | MediaAutomationJobProgress;
    plan?: MediaAutomationPlan | MediaAutomationPlan[] | null;
    createdAt?: string;
    startedAt?: string;
    completedAt?: string;
    finishedAt?: string;
    error?: string | { code?: string; message?: string };
    outputPath?: string;
    result?: Record<string, unknown> | null;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
};

export type MediaAutomationActivity = {
    id?: string | number;
    type?: string;
    action?: string;
    message?: string;
    status?: string;
    createdAt?: string;
    timestamp?: string;
    at?: string;
    jobId?: string | number;
    [key: string]: unknown;
};

export type MediaAutomationLibrary = {
    id?: string | number;
    name: string;
    rootPath: string;
    outputPath: string;
    quarantinePath: string;
    pipelineId?: string | number | null;
    enabled?: boolean;
    [key: string]: unknown;
};

export type MediaAutomationPipelinePreview = {
    ok?: boolean;
    matched?: boolean;
    reason?: string;
    path?: string;
    probe?: {
        format?: string;
        duration?: string | number;
        videoCodec?: string;
        audioCodec?: string;
    };
    plans?: Array<{
        mode?: string;
        adapter?: string | null;
        adapterLabel?: string | null;
        args?: string[];
    }>;
    error?: string;
};

export type MediaAutomationPendingTest = {
    ok?: boolean;
    matched?: boolean;
    enqueued?: boolean;
    path?: string;
    libraryId?: string | number;
    pipelineId?: string | number | null;
    pipelineName?: string | null;
    ruleId?: string | null;
    reason?: string;
    probe?: MediaAutomationPipelinePreview['probe'];
    error?: string;
};

export type MediaAutomationStepType =
    | 'transcode'
    | 'remux'
    | 'subtitle-strip'
    | 'subtitle-extract'
    | 'subtitle-keep-lang'
    | 'keep-first-audio'
    | 'drop-commentary'
    | 'audio-normalize'
    | 'audio-stereo'
    | 'commercial-strip'
    | 'move'
    | 'custom-command';

export type MediaAutomationStep = {
    type: MediaAutomationStepType;
    container?: string;
    videoCodec?: string;
    audioCodec?: string;
    subtitleCodec?: string;
    audioBitrateKbps?: number;
    /** Fixed video bitrate in kbps. When set (>0), overrides CRF/CQ for ABR-style sizing. */
    videoBitrateKbps?: number;
    maxWidth?: number;
    preset?: string;
    /** Quality: CRF/CQ/QP style 0–51 (lower = higher quality / larger files). Ignored when videoBitrateKbps is set. */
    crf?: number;
    /** Move destination template, e.g. `{dir}/archive/{basename}` */
    destination?: string;
    /** Allowlisted executable basename or absolute path for custom-command */
    executable?: string;
    /** Arg templates for custom-command (no shell). Placeholders: {input} {output} {dir} {name} {ext} {basename} {libraryRoot} */
    args?: string[];
    skipMediaFinalize?: boolean;
    /** Comma-separated ISO language codes for subtitle extract/keep */
    subtitleLanguages?: string;
    /** Keep subtitle streams when using keep-first-audio (default true) */
    keepSubtitles?: boolean;
    /** Regex matched against chapter titles for commercial-strip */
    commercialPattern?: string;
};

export type MediaAutomationRuleCondition = {
    id: string;
    field: 'path' | 'container' | 'videoCodec' | 'audioCodec' | 'width' | 'bitrate' | 'hdr';
    operator: 'equals' | 'notEquals' | 'contains' | 'matches' | 'greaterThan' | 'lessThan';
    value: string;
};

export type MediaAutomationRules = {
    operator: 'AND' | 'OR';
    conditions: MediaAutomationRuleCondition[];
};

export type MediaAutomationPipeline = {
    id?: string | number;
    name: string;
    enabled: boolean;
    priority: number;
    outputMode: OutputMode;
    hardware: HardwareMode;
    /** Saved sample media path for preview / one-click queue (container path). */
    samplePath?: string;
    rules: MediaAutomationRules;
    steps: MediaAutomationStep[];
    [key: string]: unknown;
};

export type MediaAutomationSettingsConfig = {
    enabled: boolean;
    auth: {
        username: string;
        password: string;
    };
    concurrency: {
        cpu: number;
        gpu: number;
    };
    fallback: {
        hardware: HardwareMode;
        outputMode: OutputMode;
    };
    /** Mirrored from Safe fallback so saves do not keep a stale top-level dry-run. */
    outputMode?: OutputMode;
    hardwareAcceleration?: HardwareMode;
    libraryScanEnabled: boolean;
    libraryScanIntervalMinutes: number;
    libraryWatchEnabled: boolean;
    libraryWatchDebounceMs: number;
    /** Basenames or absolute paths allowed for custom-command steps */
    customCommandAllowlist: string[];
};

export const DEFAULT_MEDIA_AUTOMATION_SETTINGS: MediaAutomationSettingsConfig = {
    enabled: false,
    auth: { username: '', password: '' },
    concurrency: { cpu: 1, gpu: 1 },
    fallback: { hardware: 'cpu', outputMode: 'dry-run' },
    libraryScanEnabled: true,
    libraryScanIntervalMinutes: 360,
    libraryWatchEnabled: false,
    libraryWatchDebounceMs: 5000,
    customCommandAllowlist: ['ffmpeg', 'ffprobe'],
};

export const emptyLibrary = (): MediaAutomationLibrary => ({
    name: '',
    rootPath: '',
    outputPath: '',
    quarantinePath: '',
    pipelineId: '',
    enabled: true,
});

export const emptyPipeline = (): MediaAutomationPipeline => ({
    name: '',
    enabled: true,
    priority: 50,
    outputMode: 'dry-run',
    hardware: 'auto',
    samplePath: '',
    rules: {
        operator: 'AND',
        conditions: [{
            id: 'condition-1',
            field: 'videoCodec',
            operator: 'notEquals',
            value: 'hevc',
        }],
    },
    steps: [{ type: 'transcode', container: 'mkv', videoCodec: 'hevc', audioCodec: 'copy', preset: 'medium' }],
});

const hevcSkipRule = (): MediaAutomationRules => ({
    operator: 'AND',
    conditions: [{
        id: 'condition-hevc',
        field: 'videoCodec',
        operator: 'notEquals',
        value: 'hevc',
    }],
});

const h264SkipRule = (): MediaAutomationRules => ({
    operator: 'AND',
    conditions: [{
        id: 'condition-h264',
        field: 'videoCodec',
        operator: 'notEquals',
        value: 'h264',
    }],
});

/** Unmanic-inspired pipeline seeds (quality profiles + common remux/compat flows). */
export const PIPELINE_PRESETS: Array<{ id: string; label: string; detail: string; pipeline: MediaAutomationPipeline }> = [
    {
        id: 'hevc-1500k-keep-streams',
        label: 'HEVC 1500kbps (keep A/V)',
        detail: 'Fixed 1500 kbps video bitrate — predictable file size. Copies audio and subtitles unchanged.',
        pipeline: {
            name: 'HEVC 1500kbps keep streams',
            enabled: true,
            priority: 58,
            outputMode: 'dry-run',
            hardware: 'auto',
            rules: hevcSkipRule(),
            steps: [{
                type: 'transcode',
                container: 'mkv',
                videoCodec: 'hevc',
                audioCodec: 'copy',
                subtitleCodec: 'copy',
                preset: 'medium',
                videoBitrateKbps: 1500,
            }],
        },
    },
    {
        id: 'high-quality-hevc',
        label: 'High quality HEVC',
        detail: 'HEVC CRF 18 / slow — near-transparent quality, larger files (Unmanic high-quality style).',
        pipeline: {
            name: 'High quality HEVC',
            enabled: true,
            priority: 60,
            outputMode: 'dry-run',
            hardware: 'auto',
            rules: hevcSkipRule(),
            steps: [{ type: 'transcode', container: 'mkv', videoCodec: 'hevc', audioCodec: 'copy', subtitleCodec: 'copy', preset: 'slow', crf: 18 }],
        },
    },
    {
        id: 'balanced-hevc',
        label: 'Balanced HEVC',
        detail: 'HEVC CRF 23 / medium — good quality-to-size default for most libraries.',
        pipeline: {
            name: 'Balanced HEVC',
            enabled: true,
            priority: 50,
            outputMode: 'dry-run',
            hardware: 'auto',
            rules: hevcSkipRule(),
            steps: [{ type: 'transcode', container: 'mkv', videoCodec: 'hevc', audioCodec: 'copy', subtitleCodec: 'copy', preset: 'medium', crf: 23 }],
        },
    },
    {
        id: 'space-saver-hevc',
        label: 'Space saver HEVC',
        detail: 'HEVC CRF 28 / fast, AAC 96k — shrink libraries while staying watchable.',
        pipeline: {
            name: 'Space saver HEVC',
            enabled: true,
            priority: 55,
            outputMode: 'dry-run',
            hardware: 'auto',
            rules: hevcSkipRule(),
            steps: [{
                type: 'transcode',
                container: 'mkv',
                videoCodec: 'hevc',
                audioCodec: 'aac',
                audioBitrateKbps: 96,
                subtitleCodec: 'copy',
                preset: 'fast',
                crf: 28,
            }],
        },
    },
    {
        id: 'low-quality-hevc',
        label: 'Low quality / archive',
        detail: 'HEVC CRF 32 / veryfast, capped 1280px — aggressive archive / storage reclaim.',
        pipeline: {
            name: 'Low quality archive',
            enabled: true,
            priority: 45,
            outputMode: 'dry-run',
            hardware: 'auto',
            rules: hevcSkipRule(),
            steps: [{
                type: 'transcode',
                container: 'mkv',
                videoCodec: 'hevc',
                audioCodec: 'aac',
                audioBitrateKbps: 96,
                subtitleCodec: 'copy',
                preset: 'veryfast',
                crf: 32,
                maxWidth: 1280,
            }],
        },
    },
    {
        id: 'hevc-1080p',
        label: 'HEVC 1080p',
        detail: 'Downscale above 1080p to 1920px wide, then HEVC CRF 23.',
        pipeline: {
            name: 'HEVC 1080p',
            enabled: true,
            priority: 52,
            outputMode: 'dry-run',
            hardware: 'auto',
            rules: {
                operator: 'OR',
                conditions: [
                    { id: 'c-codec', field: 'videoCodec', operator: 'notEquals', value: 'hevc' },
                    { id: 'c-width', field: 'width', operator: 'greaterThan', value: '1920' },
                ],
            },
            steps: [{
                type: 'transcode',
                container: 'mkv',
                videoCodec: 'hevc',
                audioCodec: 'copy',
                subtitleCodec: 'copy',
                preset: 'medium',
                crf: 23,
                maxWidth: 1920,
            }],
        },
    },
    {
        id: 'hevc-720p',
        label: 'HEVC 720p space saver',
        detail: 'Cap at 1280px + HEVC CRF 28 — common TV / mobile space-saver profile.',
        pipeline: {
            name: 'HEVC 720p space saver',
            enabled: true,
            priority: 48,
            outputMode: 'dry-run',
            hardware: 'auto',
            rules: {
                operator: 'OR',
                conditions: [
                    { id: 'c-codec', field: 'videoCodec', operator: 'notEquals', value: 'hevc' },
                    { id: 'c-width', field: 'width', operator: 'greaterThan', value: '1280' },
                ],
            },
            steps: [{
                type: 'transcode',
                container: 'mkv',
                videoCodec: 'hevc',
                audioCodec: 'aac',
                audioBitrateKbps: 128,
                subtitleCodec: 'copy',
                preset: 'fast',
                crf: 28,
                maxWidth: 1280,
            }],
        },
    },
    {
        id: 'h264-compat',
        label: 'H.264 compatibility',
        detail: 'H.264 CRF 20 / medium — broad device compatibility when HEVC is not wanted.',
        pipeline: {
            name: 'H.264 compatibility',
            enabled: true,
            priority: 40,
            outputMode: 'dry-run',
            hardware: 'auto',
            rules: h264SkipRule(),
            steps: [{ type: 'transcode', container: 'mkv', videoCodec: 'h264', audioCodec: 'aac', audioBitrateKbps: 192, subtitleCodec: 'copy', preset: 'medium', crf: 20 }],
        },
    },
    {
        id: 'remux-mkv',
        label: 'Remux to MKV',
        detail: 'Copy streams into MKV without re-encoding (container cleanup only).',
        pipeline: {
            name: 'Remux to MKV',
            enabled: true,
            priority: 35,
            outputMode: 'dry-run',
            hardware: 'cpu',
            rules: {
                operator: 'AND',
                conditions: [{
                    id: 'condition-container',
                    field: 'container',
                    operator: 'notEquals',
                    value: 'matroska,mkv',
                }],
            },
            steps: [{ type: 'remux', container: 'mkv' }],
        },
    },
    {
        id: 'remux-mp4',
        label: 'Remux to MP4',
        detail: 'Copy streams into MP4 when the source is not already MP4.',
        pipeline: {
            name: 'Remux to MP4',
            enabled: true,
            priority: 34,
            outputMode: 'dry-run',
            hardware: 'cpu',
            rules: {
                operator: 'AND',
                conditions: [{
                    id: 'condition-mp4',
                    field: 'container',
                    operator: 'notEquals',
                    value: 'mp4,mov,m4v',
                }],
            },
            steps: [{ type: 'remux', container: 'mp4' }],
        },
    },
    {
        id: 'aac-audio-normalize',
        label: 'AAC stereo normalize',
        detail: 'Keep video, re-encode audio to AAC 192k — useful after remux/transcode cleanup.',
        pipeline: {
            name: 'AAC stereo normalize',
            enabled: true,
            priority: 30,
            outputMode: 'dry-run',
            hardware: 'cpu',
            rules: {
                operator: 'AND',
                conditions: [{
                    id: 'condition-audio',
                    field: 'audioCodec',
                    operator: 'notEquals',
                    value: 'aac',
                }],
            },
            steps: [{ type: 'transcode', container: 'mkv', videoCodec: 'copy', audioCodec: 'aac', audioBitrateKbps: 192, subtitleCodec: 'copy', preset: 'medium', crf: 23 }],
        },
    },
    {
        id: 'loudnorm-first-audio',
        label: 'Loudnorm first audio',
        detail: 'EBU R128 loudnorm on the first audio track (AAC), video/subs copied.',
        pipeline: {
            name: 'Loudnorm first audio',
            enabled: true,
            priority: 28,
            outputMode: 'dry-run',
            hardware: 'cpu',
            rules: { operator: 'AND', conditions: [] },
            steps: [{ type: 'audio-normalize', container: 'mkv', audioBitrateKbps: 192 }],
        },
    },
    {
        id: 'stereo-downmix',
        label: 'Stereo downmix (AAC)',
        detail: 'Downmix first audio to 2.0 AAC; keep video and subtitles.',
        pipeline: {
            name: 'Stereo downmix',
            enabled: true,
            priority: 27,
            outputMode: 'dry-run',
            hardware: 'cpu',
            rules: { operator: 'AND', conditions: [] },
            steps: [{ type: 'audio-stereo', container: 'mkv', audioBitrateKbps: 192 }],
        },
    },
    {
        id: 'drop-commentary-audio',
        label: 'Drop commentary audio',
        detail: 'Remux and drop audio streams marked commentary/comment disposition.',
        pipeline: {
            name: 'Drop commentary audio',
            enabled: true,
            priority: 32,
            outputMode: 'dry-run',
            hardware: 'cpu',
            rules: { operator: 'AND', conditions: [] },
            steps: [{ type: 'drop-commentary', container: 'mkv' }],
        },
    },
    {
        id: 'keep-english-subs',
        label: 'Keep English subtitles only',
        detail: 'Keep video/audio and only eng/en subtitle streams.',
        pipeline: {
            name: 'Keep English subtitles',
            enabled: true,
            priority: 33,
            outputMode: 'dry-run',
            hardware: 'cpu',
            rules: { operator: 'AND', conditions: [] },
            steps: [{ type: 'subtitle-keep-lang', container: 'mkv', subtitleLanguages: 'eng,en' }],
        },
    },
    {
        id: 'strip-commercial-chapters',
        label: 'Strip commercial chapters',
        detail: 'Cut chapters whose titles match commercial/advert/promo (requires chapter markers).',
        pipeline: {
            name: 'Strip commercial chapters',
            enabled: true,
            priority: 22,
            outputMode: 'dry-run',
            hardware: 'cpu',
            rules: { operator: 'AND', conditions: [] },
            steps: [{ type: 'commercial-strip', container: 'mkv' }],
        },
    },
    {
        id: 'dry-run-probe',
        label: 'Dry-run probe',
        detail: 'Match everything and plan only — safest way to validate rules and hardware.',
        pipeline: {
            name: 'Dry-run probe',
            enabled: true,
            priority: 10,
            outputMode: 'dry-run',
            hardware: 'cpu',
            rules: { operator: 'AND', conditions: [] },
            steps: [{ type: 'remux', container: 'mkv' }],
        },
    },
    {
        id: 'strip-subtitles',
        label: 'Strip embedded subtitles',
        detail: 'Remux with stream copy and drop subtitle streams.',
        pipeline: {
            name: 'Strip embedded subtitles',
            enabled: true,
            priority: 35,
            outputMode: 'dry-run',
            hardware: 'cpu',
            rules: { operator: 'AND', conditions: [] },
            steps: [{ type: 'subtitle-strip', container: 'mkv' }],
        },
    },
    {
        id: 'extract-first-subtitle',
        label: 'Extract first subtitle (SRT)',
        detail: 'Write the first subtitle stream beside the source as .srt (source file unchanged).',
        pipeline: {
            name: 'Extract first subtitle',
            enabled: true,
            priority: 25,
            outputMode: 'dry-run',
            hardware: 'cpu',
            rules: { operator: 'AND', conditions: [] },
            steps: [{ type: 'subtitle-extract', container: 'mkv', skipMediaFinalize: true }],
        },
    },
    {
        id: 'move-to-archive',
        label: 'Move to archive folder',
        detail: 'Rename/move within library roots using `{dir}/archive/{basename}`.',
        pipeline: {
            name: 'Move to archive',
            enabled: true,
            priority: 20,
            outputMode: 'dry-run',
            hardware: 'cpu',
            rules: { operator: 'AND', conditions: [] },
            steps: [{ type: 'move', destination: '{dir}/archive/{basename}' }],
        },
    },
];
