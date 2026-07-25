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
    step?: number;
    stepCount?: number;
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
    plan?: {
        mode?: string;
        adapter?: string | null;
        adapterLabel?: string | null;
        args?: string[];
        [key: string]: unknown;
    } | null;
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

export type MediaAutomationStep = {
    type: 'transcode' | 'remux';
    container?: string;
    videoCodec?: string;
    audioCodec?: string;
    subtitleCodec?: string;
    audioBitrateKbps?: number;
    maxWidth?: number;
    preset?: string;
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
    libraryScanEnabled: boolean;
    libraryScanIntervalMinutes: number;
    libraryWatchEnabled: boolean;
    libraryWatchDebounceMs: number;
};

export const DEFAULT_MEDIA_AUTOMATION_SETTINGS: MediaAutomationSettingsConfig = {
    enabled: false,
    auth: { username: '', password: '' },
    concurrency: { cpu: 1, gpu: 1 },
    fallback: { hardware: 'cpu', outputMode: 'dry-run' },
    libraryScanEnabled: true,
    libraryScanIntervalMinutes: 360,
    libraryWatchEnabled: true,
    libraryWatchDebounceMs: 5000,
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

export const PIPELINE_PRESETS: Array<{ id: string; label: string; detail: string; pipeline: MediaAutomationPipeline }> = [
    {
        id: 'hevc-mkv',
        label: 'HEVC MKV',
        detail: 'Transcode to HEVC/MKV when the source is not already HEVC.',
        pipeline: {
            name: 'HEVC MKV',
            enabled: true,
            priority: 50,
            outputMode: 'dry-run',
            hardware: 'auto',
            rules: {
                operator: 'AND',
                conditions: [{
                    id: 'condition-hevc',
                    field: 'videoCodec',
                    operator: 'notEquals',
                    value: 'hevc',
                }],
            },
            steps: [{ type: 'transcode', container: 'mkv', videoCodec: 'hevc', audioCodec: 'copy', subtitleCodec: 'copy', preset: 'medium' }],
        },
    },
    {
        id: 'remux-mkv',
        label: 'Remux to MKV',
        detail: 'Copy streams into an MKV container without re-encoding.',
        pipeline: {
            name: 'Remux to MKV',
            enabled: true,
            priority: 40,
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
        id: 'dry-run-probe',
        label: 'Dry-run probe',
        detail: 'Match everything and plan a dry-run so you can validate rules safely.',
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
];
