export type MediaAutomationTab = 'overview' | 'queue' | 'pipelines' | 'libraries' | 'activity';
export type OutputMode = 'dry-run' | 'copy' | 'replace';
export type HardwareMode = 'auto' | 'cpu' | 'nvenc' | 'qsv' | 'intel-vaapi' | 'vaapi';

export type MediaAutomationStatus = {
    enabled?: boolean;
    state?: string;
    workerState?: string;
    activeJobs?: number;
    queuedJobs?: number;
    completedJobs?: number;
    failedJobs?: number;
    startedAt?: string;
    lastHeartbeat?: string;
    version?: string;
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
    progress?: number | MediaAutomationJobProgress;
    createdAt?: string;
    startedAt?: string;
    completedAt?: string;
    finishedAt?: string;
    error?: string | { code?: string; message?: string };
    outputPath?: string;
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
};

export const DEFAULT_MEDIA_AUTOMATION_SETTINGS: MediaAutomationSettingsConfig = {
    enabled: false,
    auth: { username: '', password: '' },
    concurrency: { cpu: 1, gpu: 1 },
    fallback: { hardware: 'cpu', outputMode: 'dry-run' },
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
