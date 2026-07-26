import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    CheckCircle2,
    ChevronDown,
    CirclePause,
    CirclePlay,
    Copy,
    Cpu,
    FolderCog,
    FolderSearch,
    Gauge,
    Layers3,
    Link2,
    ListRestart,
    Loader2,
    Pencil,
    Play,
    Plus,
    Radar,
    RefreshCw,
    RotateCcw,
    Save,
    ServerCog,
    SkipForward,
    Square,
    Trash2,
    X,
} from 'lucide-react';
import { CustomSelect, SettingsSwitch } from '../shared/ui';
import { ModalPortal } from '../shared/ModalPortal';
import { ToastContainer, pushToast, type ToastMessage } from '../shared/toast';
import { portalUrl } from '../shared/basePath';
import { mediaAutomationApi } from './api';
import { PathBrowserField } from './PathBrowserField';
import { PipelineTemplatePicker } from './PipelineTemplatePicker';
import { MediaAutomationSetupChecklist } from './MediaAutomationSetupChecklist';
import { PipelineEditorForm } from './PipelineEditorForm';
import {
    countJobsForLibrary,
    libraryPipelineLabel,
    normalizePipelineRules,
    summarizeLibraryOutcome,
    summarizeMatchRules,
    summarizePipelineOutcome,
} from './pipelineUi';
import {
    PIPELINE_PRESETS,
    PIPELINE_STARTER_IDS,
    emptyLibrary,
    emptyPipeline,
    type HardwareMode,
    type MediaAutomationActivity,
    type MediaAutomationCapabilities,
    type MediaAutomationJob,
    type MediaAutomationLibrary,
    type MediaAutomationPendingTest,
    type MediaAutomationPipeline,
    type MediaAutomationPipelinePreview,
    type MediaAutomationRuleCondition,
    type MediaAutomationPlan,
    type MediaAutomationStatus,
    type MediaAutomationTab,
    type OutputMode,
} from './types';

const jobProgressPercent = (job: MediaAutomationJob) => {
    if (typeof job.progress === 'number') return job.progress;
    if (job.progress && typeof job.progress === 'object' && Number.isFinite(Number(job.progress.percent))) {
        return Number(job.progress.percent);
    }
    return null;
};

const formatDurationSeconds = (value?: number | null) => {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    const total = Math.round(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
};

const jobProgressMeta = (job: MediaAutomationJob | null | undefined) => {
    if (!job?.progress || typeof job.progress !== 'object') {
        return { etaLabel: null as string | null, speedLabel: null as string | null, elapsedLabel: null as string | null, fpsLabel: null as string | null };
    }
    const progress = job.progress;
    const etaLabel = formatDurationSeconds(progress.etaSeconds);
    const speed = Number(progress.speed);
    const speedLabel = Number.isFinite(speed) && speed > 0 ? `${speed.toFixed(2)}x` : null;
    const elapsed = Number(progress.outTimeUs) >= 0 ? Number(progress.outTimeUs) / 1_000_000 : null;
    const duration = Number(progress.durationSeconds);
    const elapsedLabel = elapsed != null && Number.isFinite(elapsed)
        ? (Number.isFinite(duration) && duration > 0
            ? `${formatDurationSeconds(elapsed)} / ${formatDurationSeconds(duration)}`
            : formatDurationSeconds(elapsed))
        : null;
    const fps = Number(progress.fps);
    const fpsLabel = Number.isFinite(fps) && fps > 0 ? `${Math.round(fps)} fps` : null;
    return { etaLabel, speedLabel, elapsedLabel, fpsLabel };
};

const jobPlans = (job: MediaAutomationJob | null | undefined): MediaAutomationPlan[] => {
    if (!job?.plan) return [];
    return Array.isArray(job.plan) ? job.plan : [job.plan];
};

const jobLiveCommand = (job: MediaAutomationJob | null | undefined) => {
    if (!job) return '';
    if (job.progress && typeof job.progress === 'object') {
        return String(job.progress.currentCommand || job.progress.command || '');
    }
    const plans = jobPlans(job);
    const first = plans[0];
    if (!first) return '';
    if (Array.isArray(first.args) && first.args.length) {
        return [first.executable || 'ffmpeg', ...first.args].join(' ');
    }
    return '';
};

const jobIsDryRun = (job: MediaAutomationJob | null | undefined) => {
    if (!job) return false;
    if (job.result && typeof job.result === 'object' && job.result.dryRun === true) return true;
    const pipeline = job.metadata?.pipeline;
    if (pipeline && typeof pipeline === 'object' && (pipeline as { outputMode?: string }).outputMode === 'dry-run') {
        return true;
    }
    return false;
};

const jobDryRunReason = (job: MediaAutomationJob | null | undefined) => {
    if (!jobIsDryRun(job) || !job?.result || typeof job.result !== 'object') return '';
    const reason = String(job.result.dryRunReason || '');
    if (reason === 'global-safe-fallback') {
        return 'Blocked by Settings → Media Automation → Safe fallback (Dry run). Change that to Copy or Replace, save, then re-queue.';
    }
    if (reason === 'pipeline-output-mode') {
        return 'Pipeline output mode is still Dry run. Edit the pipeline, set Copy or Replace, save, then re-queue.';
    }
    return 'Planned only - FFmpeg was not run and no files were written.';
};

const jobErrorText = (error: MediaAutomationJob['error']) => {
    if (!error) return '';
    if (typeof error === 'string') return error;
    return error.message || error.code || '';
};

const jobFinalPath = (job: MediaAutomationJob | null | undefined) => {
    if (!job) return '';
    const result = job.result;
    if (result && typeof result === 'object') {
        const output = (result as { output?: { finalPath?: string } }).output;
        if (output?.finalPath) return String(output.finalPath);
        if ((result as { finalPath?: string }).finalPath) return String((result as { finalPath?: string }).finalPath);
    }
    return String(job.outputPath || '');
};

const MA_WEBHOOK_PATHS = [
    { label: 'Sonarr', path: '/triggers/media-automation/sonarr', tone: 'text-sky-300' },
    { label: 'Radarr', path: '/triggers/media-automation/radarr', tone: 'text-amber-300' },
    { label: 'Lidarr', path: '/triggers/media-automation/lidarr', tone: 'text-violet-300' },
    { label: 'Manual', path: '/triggers/media-automation/manual', tone: 'text-emerald-300' },
] as const;

const jobStateValue = (job: MediaAutomationJob) => String(job.state || job.status || '').toLowerCase();
const isTerminalJob = (job: MediaAutomationJob) => (
    ['completed', 'succeeded', 'failed', 'cancelled', 'canceled', 'success'].includes(jobStateValue(job))
);
const isCancellableJob = (job: MediaAutomationJob) => !isTerminalJob(job);
const pathBasename = (value: string) => {
    const parts = value.replace(/\\/g, '/').split('/').filter(Boolean);
    return parts[parts.length - 1] || value;
};

const fieldClass = 'w-full rounded-lg border border-white/10 bg-background/70 px-3 py-2.5 text-sm text-text placeholder:text-muted/60 outline-none transition focus:border-plex focus:ring-1 focus:ring-plex';
const cardClass = 'glass-card shadow-xl';
const listCardClass = 'rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent shadow-xl transition hover:border-plex/40';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-text transition hover:border-plex/40 hover:bg-white/5 disabled:pointer-events-none disabled:opacity-40';
const primaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-plex px-3 py-2 text-sm font-bold text-background transition hover:bg-plex-hover active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40';

const asText = (value: unknown, fallback = '-') => value === undefined || value === null || value === '' ? fallback : String(value);
const formatTime = (value?: string) => {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};
const createRuleCondition = (): MediaAutomationRuleCondition => ({
    id: `condition-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    field: 'videoCodec',
    operator: 'equals',
    value: '',
});
const normalizeRules = normalizePipelineRules;
const MEDIA_AUTOMATION_TABS: MediaAutomationTab[] = ['overview', 'queue', 'pipelines', 'libraries', 'activity'];
const ACTIVITY_PAGE_SIZE_OPTIONS = [20, 50, 75, 100] as const;
const ACTIVITY_PAGE_SIZE_KEY = 'media-automation-activity-page-size';

const readActivityPageSize = (): typeof ACTIVITY_PAGE_SIZE_OPTIONS[number] => {
    try {
        const raw = Number(localStorage.getItem(ACTIVITY_PAGE_SIZE_KEY));
        return ACTIVITY_PAGE_SIZE_OPTIONS.includes(raw as typeof ACTIVITY_PAGE_SIZE_OPTIONS[number])
            ? (raw as typeof ACTIVITY_PAGE_SIZE_OPTIONS[number])
            : 20;
    } catch {
        return 20;
    }
};

const parseMediaAutomationTab = (hash = typeof window !== 'undefined' ? window.location.hash : ''): MediaAutomationTab => {
    const raw = String(hash || '').replace(/^#/, '').split(/[/?&]/)[0].trim().toLowerCase();
    return MEDIA_AUTOMATION_TABS.includes(raw as MediaAutomationTab)
        ? (raw as MediaAutomationTab)
        : 'overview';
};

const mediaAutomationTabHash = (tab: MediaAutomationTab) => (tab === 'overview' ? '' : `#${tab}`);

const writeMediaAutomationTabHash = (tab: MediaAutomationTab) => {
    if (typeof window === 'undefined') return;
    const desired = mediaAutomationTabHash(tab);
    if ((window.location.hash || '') === desired) return;
    const next = `${window.location.pathname}${window.location.search}${desired}`;
    window.history.replaceState(null, '', next);
};
const statusTone = (status?: string) => {
    const value = String(status || '').toLowerCase();
    if (['dry-run', 'dry run', 'planned'].some((key) => value.includes(key))) {
        return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    }
    if (['completed', 'succeeded', 'ready', 'running', 'online', 'healthy', 'success', 'processing', 'committing', 'verifying', 'enabled'].some((key) => value.includes(key))) {
        return 'border-green-500/30 bg-green-500/10 text-green-300';
    }
    if (['failed', 'error', 'offline', 'stopped', 'cancelled', 'canceled', 'disabled'].some((key) => value.includes(key))) {
        return 'border-red-500/30 bg-red-500/10 text-red-300';
    }
    if (['paused', 'queued', 'pending', 'probing', 'planning'].some((key) => value.includes(key))) {
        return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    }
    return 'border-white/10 bg-white/5 text-muted';
};

const StatusPill: React.FC<{ value?: string }> = ({ value }) => (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${statusTone(value)}`}>
        {value || 'unknown'}
    </span>
);

const StatCard: React.FC<{
    label: string;
    value: React.ReactNode;
    hint?: string;
    icon: React.ReactNode;
    tone: string;
}> = ({ label, value, hint, icon, tone }) => (
    <div className={`relative overflow-hidden rounded-2xl border px-4 py-4 ${tone}`}>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent" />
        <div className="relative flex items-start justify-between gap-3">
            <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-80">{label}</p>
                <p className="mt-1.5 text-2xl font-black tracking-tight md:text-3xl">{value}</p>
                {hint ? <p className="mt-1.5 text-[11px] opacity-70">{hint}</p> : null}
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/20">
                {icon}
            </div>
        </div>
    </div>
);

const GPU_ADAPTER_IDS = ['nvenc', 'qsv', 'intel-vaapi', 'vaapi'] as const;

/** Hardware modes actually configured in settings / pipelines (not every probe result). */
const collectConfiguredHardware = (
    status: MediaAutomationStatus,
    pipelines: MediaAutomationPipeline[],
): Set<string> => {
    const modes = new Set<string>();
    const add = (value: unknown) => {
        const mode = String(value || '').toLowerCase();
        if (['auto', 'cpu', 'nvenc', 'qsv', 'intel-vaapi', 'vaapi'].includes(mode)) modes.add(mode);
    };
    add(status.hardwareAcceleration);
    add(status.fallbackHardware);
    for (const pipeline of pipelines) {
        add(pipeline.hardware);
        add((pipeline as { hardwareAcceleration?: string }).hardwareAcceleration);
    }
    if (modes.size === 0) modes.add('auto');
    return modes;
};

const adapterRelevantToConfig = (adapterId: string, configured: Set<string>) => {
    if (configured.has(adapterId)) return true;
    // "auto" prefers any working GPU - only treat adapters as relevant when none are up yet
    // (handled separately). Explicit cpu-only configs never care about GPU probe failures.
    return false;
};

const jobHardwareInfo = (job: MediaAutomationJob | null | undefined) => {
    if (!job) return null;
    const plans = jobPlans(job);
    const planAdapter = plans.map((plan) => plan.adapter).find(Boolean) || null;
    const planLabel = plans.map((plan) => plan.adapterLabel).find(Boolean) || null;
    const progress = job.progress && typeof job.progress === 'object' ? job.progress : null;
    const result = job.result && typeof job.result === 'object' ? job.result : null;
    const adapter = String(progress?.adapter || result?.adapter || planAdapter || '').toLowerCase() || null;
    const fallbackMeta = result?.hardwareFallback && typeof result.hardwareFallback === 'object'
        ? result.hardwareFallback as { requested?: string }
        : null;
    const fallback = !!(progress?.hardwareFallback || fallbackMeta);
    const requested = String(progress?.requestedHardware || fallbackMeta?.requested || '').toLowerCase();
    if (adapter) {
        const labels: Record<string, string> = {
            cpu: fallback ? 'CPU fallback' : 'CPU',
            nvenc: 'NVENC',
            qsv: 'Intel QSV',
            'intel-vaapi': 'Intel VAAPI',
            vaapi: 'AMD VAAPI',
        };
        return {
            adapter,
            label: String(progress?.adapterLabel || result?.adapterLabel || planLabel || labels[adapter] || adapter.toUpperCase()),
            fallback,
            requested: requested || null,
            pending: false,
            isGpu: adapter !== 'cpu',
        };
    }
    const lane = String(job.lane || '').toLowerCase();
    if (lane === 'gpu') {
        return { adapter: null, label: 'GPU lane', fallback: false, requested: null, pending: true, isGpu: true };
    }
    if (lane === 'cpu') {
        return { adapter: 'cpu', label: 'CPU', fallback: false, requested: null, pending: true, isGpu: false };
    }
    return null;
};

const HardwareBadge: React.FC<{ job: MediaAutomationJob }> = ({ job }) => {
    const info = jobHardwareInfo(job);
    if (!info) return null;
    const tone = info.fallback
        ? 'border-amber-500/40 bg-amber-500/15 text-amber-200'
        : info.isGpu
            ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
            : 'border-sky-500/40 bg-sky-500/15 text-sky-200';
    const title = info.fallback
        ? `Requested ${info.requested || 'GPU'} but fell back to CPU`
        : info.pending
            ? `${info.label} - encoder chosen when the job starts`
            : `Using ${info.label}`;
    return (
        <span
            title={title}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${tone}`}
        >
            <Cpu className="h-3 w-3" />
            {info.label}
        </span>
    );
};

const EmptyState: React.FC<{
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    detail: string;
    actionLabel?: string;
    onAction?: () => void;
}> = ({ icon: Icon, title, detail, actionLabel, onAction }) => (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/20 px-6 py-10 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-plex/30 bg-plex/10">
            <Icon className="h-6 w-6 text-plex" />
        </div>
        <h3 className="text-lg font-bold tracking-tight text-text">{title}</h3>
        <p className="mt-1 max-w-md text-sm leading-relaxed text-muted">{detail}</p>
        {actionLabel && onAction ? (
            <button type="button" className={`${primaryButtonClass} mt-5`} onClick={onAction}>
                {actionLabel}
            </button>
        ) : null}
    </div>
);

const EditorShell: React.FC<{ title: string; onClose: () => void; onSave: () => void; saving: boolean; children: React.ReactNode }> = ({
    title,
    onClose,
    onSave,
    saving,
    children,
}) => (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
        <div className="max-h-[94dvh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card shadow-2xl custom-scrollbar sm:max-w-3xl sm:rounded-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-5 py-4 backdrop-blur-md">
                <h2 className="text-lg font-bold text-text">{title}</h2>
                <button type="button" className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-text" onClick={onClose}><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-5 p-5">{children}</div>
            <div className="sticky bottom-0 flex justify-end gap-3 border-t border-border bg-card/95 px-5 py-4 backdrop-blur-md">
                <button type="button" className={buttonClass} onClick={onClose}>Cancel</button>
                <button type="button" className={primaryButtonClass} onClick={onSave} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                </button>
            </div>
        </div>
    </div>
);

export const MediaAutomationDashboard: React.FC = () => {
    const [tab, setTab] = useState<MediaAutomationTab>(() => parseMediaAutomationTab());
    const [status, setStatus] = useState<MediaAutomationStatus>({});
    const [capabilities, setCapabilities] = useState<MediaAutomationCapabilities>({});
    const [jobs, setJobs] = useState<MediaAutomationJob[]>([]);
    const [activity, setActivity] = useState<MediaAutomationActivity[]>([]);
    const [libraries, setLibraries] = useState<MediaAutomationLibrary[]>([]);
    const [pipelines, setPipelines] = useState<MediaAutomationPipeline[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [unavailable, setUnavailable] = useState<string[]>([]);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [enqueuePath, setEnqueuePath] = useState('');
    const [enqueuePipelineId, setEnqueuePipelineId] = useState('');
    const [libraryDraft, setLibraryDraft] = useState<MediaAutomationLibrary | null>(null);
    const [pipelineDraft, setPipelineDraft] = useState<MediaAutomationPipeline | null>(null);
    const [previewResult, setPreviewResult] = useState<MediaAutomationPipelinePreview | null>(null);
    const [previewBusy, setPreviewBusy] = useState(false);
    const [savingEditor, setSavingEditor] = useState(false);
    const [selectedJobId, setSelectedJobId] = useState<string | number | null>(null);
    const [selectedJob, setSelectedJob] = useState<MediaAutomationJob | null>(null);
    const [jobLogs, setJobLogs] = useState<MediaAutomationActivity[]>([]);
    const [jobDetailBusy, setJobDetailBusy] = useState(false);
    const [pendingPath, setPendingPath] = useState('');
    const [pendingResult, setPendingResult] = useState<MediaAutomationPendingTest | null>(null);
    const [activityFilter, setActivityFilter] = useState<'all' | 'job' | 'scan' | 'watch' | 'trigger'>('all');
    const [activityPageSize, setActivityPageSize] = useState<typeof ACTIVITY_PAGE_SIZE_OPTIONS[number]>(() => readActivityPageSize());
    const [activityPage, setActivityPage] = useState(1);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [queueFilter, setQueueFilter] = useState<'all' | 'queued' | 'active' | 'failed' | 'dry-run' | 'completed'>('all');
    const [queueSearch, setQueueSearch] = useState('');
    const [workerTestResult, setWorkerTestResult] = useState<MediaAutomationCapabilities | null>(null);
    const [workerTestError, setWorkerTestError] = useState('');
    const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
    const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
    const [postSavePipeline, setPostSavePipeline] = useState<MediaAutomationPipeline | null>(null);
    const [editorAdvancedOpen, setEditorAdvancedOpen] = useState(false);
    const [editorMatchAdvancedOpen, setEditorMatchAdvancedOpen] = useState(false);
    const [forceSampleSection, setForceSampleSection] = useState(false);
    const [libraryPathHealth, setLibraryPathHealth] = useState<Record<string, { ok: boolean; message: string }>>({});

    const toast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToasts((current) => pushToast(current, message, type));
    }, []);

    const load = useCallback(async (quiet = false) => {
        quiet ? setRefreshing(true) : setLoading(true);
        const requests = [
            ['status', mediaAutomationApi.status()],
            ['capabilities', mediaAutomationApi.capabilities()],
            ['jobs', mediaAutomationApi.jobs()],
            ['activity', mediaAutomationApi.activity(500)],
            ['libraries', mediaAutomationApi.libraries()],
            ['pipelines', mediaAutomationApi.pipelines()],
        ] as const;
        const results = await Promise.allSettled(requests.map((entry) => entry[1]));
        const failed: string[] = [];
        results.forEach((result, index) => {
            const key = requests[index][0];
            if (result.status === 'rejected') {
                failed.push(key);
                return;
            }
            if (key === 'status') setStatus(result.value as MediaAutomationStatus);
            if (key === 'capabilities') setCapabilities(result.value as MediaAutomationCapabilities);
            if (key === 'jobs') setJobs(result.value as MediaAutomationJob[]);
            if (key === 'activity') setActivity(result.value as MediaAutomationActivity[]);
            if (key === 'libraries') setLibraries(result.value as MediaAutomationLibrary[]);
            if (key === 'pipelines') setPipelines(result.value as MediaAutomationPipeline[]);
        });
        setUnavailable(failed);
        setLoading(false);
        setRefreshing(false);
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        writeMediaAutomationTabHash(tab);
    }, [tab]);
    useEffect(() => {
        const onHashChange = () => setTab(parseMediaAutomationTab());
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, []);
    useEffect(() => {
        const hasActive = jobs.some((job) => {
            const state = jobStateValue(job);
            return ['running', 'processing', 'active', 'probing', 'planning', 'planned', 'verifying', 'committing'].includes(state)
                || ['running', 'processing', 'active'].includes(String(job.phase || '').toLowerCase());
        });
        const timer = window.setInterval(() => { load(true); }, hasActive ? 2000 : 15000);
        return () => window.clearInterval(timer);
    }, [load, jobs]);
    useEffect(() => {
        if (selectedJobId == null) return;
        const latest = jobs.find((job) => String(job.id) === String(selectedJobId));
        if (latest) setSelectedJob(latest);
    }, [jobs, selectedJobId]);

    const runAction = async (key: string, task: () => Promise<unknown>, success: string) => {
        setBusy(key);
        try {
            await task();
            toast(success);
            await load(true);
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Media automation request failed', 'error');
        } finally {
            setBusy(null);
        }
    };

    const saveLibrary = async () => {
        if (!libraryDraft?.name.trim() || !libraryDraft.rootPath.trim()) {
            toast('Library name and root path are required.', 'error');
            return;
        }
        setSavingEditor(true);
        try {
            if (libraryDraft.id !== undefined) await mediaAutomationApi.updateLibrary(libraryDraft.id, libraryDraft);
            else await mediaAutomationApi.createLibrary(libraryDraft);
            setLibraryDraft(null);
            toast('Library saved.');
            await load(true);
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to save library', 'error');
        } finally {
            setSavingEditor(false);
        }
    };

    const savePipeline = async () => {
        if (!pipelineDraft?.name.trim()) {
            toast('Pipeline name is required.', 'error');
            return;
        }
        setSavingEditor(true);
        try {
            const payload = { ...pipelineDraft };
            if (pipelineDraft.id !== undefined) await mediaAutomationApi.updatePipeline(pipelineDraft.id, payload);
            else await mediaAutomationApi.createPipeline(payload);
            setPipelineDraft(null);
            setPostSavePipeline(payload);
            toast('Pipeline saved.');
            await load(true);
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to save pipeline', 'error');
        } finally {
            setSavingEditor(false);
        }
    };

    const openPipelineFromPreset = (presetPipeline: MediaAutomationPipeline) => {
        setTemplatePickerOpen(false);
        setEditorAdvancedOpen(false);
        setEditorMatchAdvancedOpen(false);
        setForceSampleSection(true);
        setPipelineDraft({
            ...emptyPipeline(),
            ...presetPipeline,
            samplePath: String(presetPipeline.samplePath || ''),
            rules: normalizeRules(presetPipeline.rules),
            steps: Array.isArray(presetPipeline.steps) ? [...presetPipeline.steps] : [],
        });
    };

    const configuredHardware = useMemo(
        () => collectConfiguredHardware(status, pipelines),
        [status, pipelines],
    );
    const availableHardware = useMemo(
        () => (Array.isArray(capabilities.hardware) ? capabilities.hardware.map(String) : ['cpu']),
        [capabilities.hardware],
    );
    const anyGpuAvailable = useMemo(
        () => GPU_ADAPTER_IDS.some((id) => availableHardware.includes(id)),
        [availableHardware],
    );
    const caresAboutIntel = useMemo(() => (
        configuredHardware.has('qsv')
        || configuredHardware.has('intel-vaapi')
        || configuredHardware.has('vaapi')
        || (configuredHardware.has('auto') && !anyGpuAvailable)
    ), [configuredHardware, anyGpuAvailable]);
    const caresAboutNvenc = useMemo(() => (
        configuredHardware.has('nvenc')
        || (configuredHardware.has('auto') && !anyGpuAvailable)
    ), [configuredHardware, anyGpuAvailable]);
    const relevantAdapterErrors = useMemo(() => (
        (['qsv', 'intel-vaapi', 'vaapi', 'nvenc'] as const).filter((id) => {
            if (availableHardware.includes(id)) return false;
            if (!capabilities.details?.[id]?.error) return false;
            return adapterRelevantToConfig(id, configuredHardware);
        })
    ), [availableHardware, capabilities.details, configuredHardware]);

    const queueCounts = useMemo(() => {
        const counts = { queued: 0, active: 0, completed: 0, failed: 0 };
        jobs.forEach((job) => {
            const value = jobStateValue(job);
            if (['running', 'processing', 'active'].includes(value)) counts.active += 1;
            else if (['completed', 'succeeded', 'success', 'done'].includes(value)) counts.completed += 1;
            else if (['failed', 'error', 'cancelled', 'canceled'].includes(value)) counts.failed += 1;
            else counts.queued += 1;
        });
        return counts;
    }, [jobs]);

    const cancellableJobs = useMemo(() => jobs.filter(isCancellableJob), [jobs]);
    const finishedJobs = useMemo(() => jobs.filter(isTerminalJob), [jobs]);
    const allJobIds = useMemo(() => jobs.map((job) => String(job.id)), [jobs]);
    const allSelected = allJobIds.length > 0 && allJobIds.every((id) => selectedJobIds.has(id));
    const selectedCancellableIds = useMemo(
        () => cancellableJobs.map((job) => String(job.id)).filter((id) => selectedJobIds.has(id)),
        [cancellableJobs, selectedJobIds],
    );
    const selectedFinishedIds = useMemo(
        () => finishedJobs.map((job) => String(job.id)).filter((id) => selectedJobIds.has(id)),
        [finishedJobs, selectedJobIds],
    );

    useEffect(() => {
        const alive = new Set(allJobIds);
        setSelectedJobIds((current) => {
            const next = new Set([...current].filter((id) => alive.has(id)));
            return next.size === current.size ? current : next;
        });
    }, [allJobIds]);

    const toggleJobSelected = (jobId: string | number) => {
        const id = String(jobId);
        setSelectedJobIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAllJobs = () => {
        setSelectedJobIds(allSelected ? new Set() : new Set(allJobIds));
    };

    const filteredActivity = useMemo(() => {
        if (activityFilter === 'all') return activity;
        return activity.filter((entry) => {
            const type = String(entry.type || entry.action || '').toLowerCase();
            if (activityFilter === 'job') return type.startsWith('job.') || type.includes('worker.');
            if (activityFilter === 'scan') return type.includes('library.scan') || type.includes('scan');
            if (activityFilter === 'watch') return type.includes('library.watch') || type.includes('watch');
            if (activityFilter === 'trigger') return type.includes('trigger') || type.includes('webhook') || type.includes('sonarr') || type.includes('radarr') || type.includes('lidarr');
            return true;
        });
    }, [activity, activityFilter]);

    const filteredJobs = useMemo(() => {
        const query = queueSearch.trim().toLowerCase();
        return jobs.filter((job) => {
            const state = jobStateValue(job);
            const dryRunJob = jobIsDryRun(job);
            if (queueFilter === 'queued' && state !== 'queued') return false;
            if (queueFilter === 'active' && !['running', 'processing', 'active', 'probing', 'planning', 'planned', 'verifying', 'committing'].includes(state)) return false;
            if (queueFilter === 'failed' && !['failed', 'error'].includes(state)) return false;
            if (queueFilter === 'completed' && !['completed', 'succeeded', 'success', 'done'].includes(state)) return false;
            if (queueFilter === 'dry-run' && !dryRunJob) return false;
            if (!query) return true;
            const haystack = `${job.path || ''} ${job.sourcePath || ''} ${job.pipelineName || ''} ${job.id}`.toLowerCase();
            return haystack.includes(query);
        });
    }, [jobs, queueFilter, queueSearch]);

    const copyText = async (text: string, success = 'Copied to clipboard.') => {
        try {
            await navigator.clipboard.writeText(text);
            toast(success);
        } catch {
            toast(text, 'error');
        }
    };

    const activityPageCount = Math.max(1, Math.ceil(filteredActivity.length / activityPageSize));
    const pagedActivity = useMemo(() => {
        const start = (activityPage - 1) * activityPageSize;
        return filteredActivity.slice(start, start + activityPageSize);
    }, [filteredActivity, activityPage, activityPageSize]);

    useEffect(() => {
        setActivityPage(1);
    }, [activityFilter, activityPageSize]);

    useEffect(() => {
        if (activityPage > activityPageCount) setActivityPage(activityPageCount);
    }, [activityPage, activityPageCount]);

    const openJobDetail = async (jobId: string | number) => {
        setSelectedJobId(jobId);
        setJobDetailBusy(true);
        try {
            const [job, logs] = await Promise.all([
                mediaAutomationApi.getJob(jobId),
                mediaAutomationApi.jobLogs(jobId),
            ]);
            setSelectedJob(job || jobs.find((entry) => String(entry.id) === String(jobId)) || null);
            setJobLogs(logs);
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to load job details', 'error');
            setSelectedJob(jobs.find((entry) => String(entry.id) === String(jobId)) || null);
            setJobLogs([]);
        } finally {
            setJobDetailBusy(false);
        }
    };

    const formatBytes = (value?: number) => {
        const bytes = Number(value || 0);
        if (!Number.isFinite(bytes) || bytes <= 0) return '-';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 ** 3) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
        return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
    };

    const openPipelineEditor = (pipeline?: MediaAutomationPipeline) => {
        setPreviewResult(null);
        setEditorAdvancedOpen(false);
        setEditorMatchAdvancedOpen(false);
        setForceSampleSection(!pipeline || !String(pipeline.samplePath || '').trim());
        if (!pipeline) {
            setPipelineDraft(emptyPipeline());
            return;
        }
        setPipelineDraft({
            ...emptyPipeline(),
            ...pipeline,
            samplePath: String(pipeline.samplePath || ''),
            rules: normalizeRules(pipeline.rules),
            steps: Array.isArray(pipeline.steps) ? pipeline.steps : [],
        });
    };

    const selectTab = useCallback((next: MediaAutomationTab) => {
        setTab(next);
        writeMediaAutomationTabHash(next);
    }, []);

    const handleSetupAction = (action: 'settings' | 'libraries' | 'pipelines' | 'start-worker' | 'scan') => {
        if (action === 'settings') {
            window.location.assign(portalUrl('/settings#media-automation'));
            return;
        }
        if (action === 'libraries') {
            selectTab('libraries');
            return;
        }
        if (action === 'pipelines') {
            selectTab('pipelines');
            return;
        }
        if (action === 'start-worker') {
            void runAction('start', () => mediaAutomationApi.control('start'), 'Worker started.');
            return;
        }
        if (action === 'scan') {
            void runAction('scan-now', () => mediaAutomationApi.scanNow(), 'Library scan started.');
        }
    };

    const runPipelinePreview = async () => {
        const samplePath = String(pipelineDraft?.samplePath || '').trim();
        if (!pipelineDraft?.id || !samplePath) {
            toast('Save the pipeline with a sample file path first.', 'error');
            return;
        }
        setPreviewBusy(true);
        setPreviewResult(null);
        try {
            const result = await mediaAutomationApi.previewPipeline(pipelineDraft.id, samplePath);
            setPreviewResult(result);
            toast(result.matched ? 'Pipeline matched the sample file.' : 'Pipeline did not match the sample file.');
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Pipeline preview failed', 'error');
        } finally {
            setPreviewBusy(false);
        }
    };

    const queuePipelineSample = async (
        pipeline: MediaAutomationPipeline,
        { dryRun = false }: { dryRun?: boolean } = {},
    ) => {
        const samplePath = String(pipeline.samplePath || '').trim();
        if (!pipeline.id || !samplePath) {
            toast('Save a sample file on this pipeline first.', 'error');
            return;
        }
        if (dryRun) {
            await runAction(
                `test-pipeline-${pipeline.id}`,
                () => mediaAutomationApi.testPipeline(pipeline.id!, samplePath),
                'Dry-run job queued.',
            );
            return;
        }
        await runAction(
            `queue-sample-${pipeline.id}`,
            () => mediaAutomationApi.enqueue(samplePath, pipeline.id),
            `Queued ${pathBasename(samplePath)} with ${pipeline.name}.`,
        );
    };

    const tabs: Array<{ id: MediaAutomationTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
        { id: 'overview', label: 'Overview', icon: Gauge },
        { id: 'queue', label: 'Queue', icon: ListRestart },
        { id: 'pipelines', label: 'Pipelines', icon: Layers3 },
        { id: 'libraries', label: 'Libraries', icon: FolderCog },
        { id: 'activity', label: 'Activity', icon: Activity },
    ];

    if (loading) {
        return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-plex" /></div>;
    }

    return (
        <div className="flex w-full animate-fade-in flex-col gap-6 pb-10">
            <ToastContainer toasts={toasts} setToasts={setToasts} />
            <header className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-plex/15 via-background/40 to-sky-500/10 p-5 md:p-6">
                <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-plex/20 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-20 left-10 h-40 w-40 rounded-full bg-sky-400/10 blur-3xl" />
                <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0">
                        <div className="mb-3 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-plex">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-plex/30 bg-plex/15">
                                <ServerCog className="h-3.5 w-3.5" />
                            </span>
                            Media Automation
                        </div>
                        <h1 className="text-3xl font-black tracking-tight text-text md:text-4xl">Transcode with control</h1>
                        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted md:text-[15px]">
                            Native FFmpeg pipelines for remux, HEVC, and cleanup - with a durable queue, hardware lanes, and safe dry-run until you are ready to write.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 self-start lg:self-auto">
                        <StatusPill value={asText(status.workerState || status.state, 'unknown')} />
                        <button type="button" className={buttonClass} onClick={() => load(true)} disabled={refreshing}>
                            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
                        </button>
                    </div>
                </div>
            </header>

            {unavailable.length > 0 && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                    <div>
                        <p className="font-bold">Some automation endpoints are unavailable</p>
                        <p className="mt-0.5 text-amber-100/75">Unavailable: {unavailable.join(', ')}. Existing sections remain usable and will recover on refresh.</p>
                    </div>
                </div>
            )}

            <nav className="space-y-2">
                <div className="relative sm:hidden">
                    {(() => {
                        const active = tabs.find((entry) => entry.id === tab) || tabs[0];
                        const ActiveIcon = active.icon;
                        return (
                            <>
                                <button
                                    type="button"
                                    className={`${buttonClass} w-full justify-between border-plex/40 bg-plex/15 text-plex`}
                                    onClick={() => setMobileNavOpen((open) => !open)}
                                    aria-expanded={mobileNavOpen}
                                >
                                    <span className="inline-flex items-center gap-2">
                                        <ActiveIcon className="h-4 w-4" /> {active.label}
                                    </span>
                                    <ChevronDown className={`h-4 w-4 transition-transform ${mobileNavOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {mobileNavOpen && (
                                    <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
                                        {tabs.map(({ id, label, icon: Icon }) => (
                                            <button
                                                key={id}
                                                type="button"
                                                className={`flex w-full items-center gap-2 px-3.5 py-3 text-left text-sm font-bold transition ${
                                                    tab === id ? 'bg-plex/15 text-plex' : 'text-text hover:bg-white/5'
                                                }`}
                                                onClick={() => {
                                                    selectTab(id);
                                                    setMobileNavOpen(false);
                                                }}
                                            >
                                                <Icon className="h-4 w-4" /> {label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        );
                    })()}
                </div>
                <div className="hidden gap-1.5 sm:flex">
                    {tabs.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => selectTab(id)}
                            className={`inline-flex min-w-max items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-bold transition ${
                                tab === id
                                    ? 'border-plex/40 bg-plex/15 text-plex'
                                    : 'border-white/10 bg-black/20 text-muted hover:border-white/20 hover:text-text'
                            }`}
                        >
                            <Icon className="h-4 w-4" /> {label}
                        </button>
                    ))}
                </div>
            </nav>

            {tab === 'overview' && (
                <div className="space-y-5">
                    <MediaAutomationSetupChecklist
                        status={status}
                        libraries={libraries}
                        pipelines={pipelines}
                        onAction={handleSetupAction}
                    />
                    {(status.dryRun || status.outputMode === 'dry-run') && (
                        <div className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                            <div>
                                <p className="font-bold text-amber-50">Global dry-run is forcing every job</p>
                                <p className="mt-1 text-xs text-amber-100/90">
                                    Settings → Media Automation → Safe fallback is set to Dry run. Pipeline output modes (copy/replace) are overridden until you change that fallback and save.
                                </p>
                                <button type="button" className={`${buttonClass} mt-3`} onClick={() => handleSetupAction('settings')}>
                                    Open Safe fallback settings
                                </button>
                            </div>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <StatCard
                            label="Queued"
                            value={asText(status.queuedJobs ?? queueCounts.queued, '0')}
                            hint="Waiting in lane"
                            icon={<ListRestart className="h-4 w-4 text-amber-200" />}
                            tone="border-amber-400/30 bg-amber-500/10 text-amber-100"
                        />
                        <StatCard
                            label="Processing"
                            value={asText(status.activeJobs ?? queueCounts.active, '0')}
                            hint="Active encodes"
                            icon={<Loader2 className="h-4 w-4 text-sky-200" />}
                            tone="border-sky-400/30 bg-sky-500/10 text-sky-100"
                        />
                        <StatCard
                            label="Completed"
                            value={asText(status.completedJobs ?? queueCounts.completed, '0')}
                            hint="Succeeded jobs"
                            icon={<CheckCircle2 className="h-4 w-4 text-emerald-200" />}
                            tone="border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                        />
                        <StatCard
                            label="Failed"
                            value={asText(status.failedJobs ?? queueCounts.failed, '0')}
                            hint="Needs attention"
                            icon={<AlertTriangle className="h-4 w-4 text-red-200" />}
                            tone="border-red-400/30 bg-red-500/10 text-red-100"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <StatCard
                            label="Processed 24h"
                            value={asText(status.metrics?.processed24h ?? 0, '0')}
                            hint="Last day"
                            icon={<Gauge className="h-4 w-4 text-emerald-200" />}
                            tone="border-white/10 bg-white/[0.03] text-text"
                        />
                        <StatCard
                            label="Failed 24h"
                            value={asText(status.metrics?.failed24h ?? 0, '0')}
                            hint="Last day"
                            icon={<AlertTriangle className="h-4 w-4 text-red-200" />}
                            tone="border-white/10 bg-white/[0.03] text-text"
                        />
                        <StatCard
                            label="Success rate"
                            value={status.metrics?.successRate24h == null ? '-' : `${status.metrics.successRate24h}%`}
                            hint="Last 24h"
                            icon={<CheckCircle2 className="h-4 w-4 text-plex" />}
                            tone="border-plex/30 bg-plex/10 text-text"
                        />
                        <StatCard
                            label="Bytes out"
                            value={formatBytes(status.metrics?.bytesOut24h)}
                            hint="Last 24h"
                            icon={<ServerCog className="h-4 w-4 text-sky-200" />}
                            tone="border-white/10 bg-white/[0.03] text-text"
                        />
                    </div>
                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
                        <section className={`${cardClass} space-y-4 p-5`}>
                            <div className="mb-1 flex items-center justify-between">
                                <div>
                                    <h2 className="text-lg font-bold tracking-tight text-text">Worker</h2>
                                    <p className="mt-0.5 text-xs text-muted">Start the native FFmpeg worker, then scan or enqueue.</p>
                                </div>
                                <Cpu className="h-5 w-5 text-plex" />
                            </div>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                {[
                                    ['start', 'Start', CirclePlay, true],
                                    ['pause', 'Pause', CirclePause, false],
                                    ['resume', 'Resume', Play, false],
                                    ['stop', 'Stop', Square, false],
                                ].map(([action, label, Icon, primary]) => (
                                    <button
                                        key={String(action)}
                                        type="button"
                                        className={primary ? primaryButtonClass : buttonClass}
                                        disabled={busy !== null}
                                        onClick={() => runAction(`control-${action}`, () => mediaAutomationApi.control(String(action)), `Worker ${action} requested.`)}
                                    >
                                        {busy === `control-${action}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />} {label}
                                    </button>
                                ))}
                            </div>
                            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => runAction('scan-now', mediaAutomationApi.scanNow, 'Library scan completed.')}>
                                    {busy === 'scan-now' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSearch className="h-4 w-4" />} Scan now
                                </button>
                                <button
                                    type="button"
                                    className={buttonClass}
                                    disabled={busy !== null}
                                    onClick={async () => {
                                        setBusy('worker-test');
                                        setWorkerTestError('');
                                        try {
                                            const result = await mediaAutomationApi.testWorker() as MediaAutomationCapabilities & { ok?: boolean; error?: string };
                                            if (result?.ok === false || result?.available === false) {
                                                setWorkerTestError(result.error || 'Worker test failed');
                                                setWorkerTestResult(result);
                                                toast(result.error || 'Worker test failed', 'error');
                                            } else {
                                                setWorkerTestResult(result);
                                                setCapabilities(result);
                                                toast('Worker test completed.');
                                            }
                                            await load(true);
                                        } catch (error) {
                                            const message = error instanceof Error ? error.message : 'Worker test failed';
                                            setWorkerTestError(message);
                                            setWorkerTestResult(null);
                                            toast(message, 'error');
                                        } finally {
                                            setBusy(null);
                                        }
                                    }}
                                >
                                    {busy === 'worker-test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Test worker
                                </button>
                            </div>
                            {(workerTestResult || workerTestError) && (
                                <div className={`mt-3 rounded-xl border p-4 text-sm ${workerTestError ? 'border-red-500/30 bg-red-500/10 text-red-100' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-50'}`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-bold">{workerTestError ? 'Worker test failed' : 'Worker test passed'}</p>
                                            {workerTestError && <p className="mt-1 text-xs opacity-90">{workerTestError}</p>}
                                            {workerTestResult && (
                                                <div className="mt-2 space-y-1 text-xs opacity-90">
                                                    <p>FFmpeg: {typeof workerTestResult.ffmpeg === 'object' ? (workerTestResult.ffmpeg.version || (workerTestResult.ffmpeg.available === false ? 'unavailable' : 'available')) : (workerTestResult.ffmpeg ? 'available' : 'unknown')}</p>
                                                    <p>Hardware: {(Array.isArray(workerTestResult.hardware) ? workerTestResult.hardware : []).join(', ') || 'cpu only'}</p>
                                                    {workerTestResult.devices?.dri && (
                                                        <p>/dev/dri: {workerTestResult.devices.dri.present === false ? 'not mapped' : (workerTestResult.devices.dri.readable === false ? 'present but not readable' : (workerTestResult.devices.dri.device || 'present'))}</p>
                                                    )}
                                                    {(['qsv', 'nvenc', 'intel-vaapi', 'vaapi'] as const).map((id) => {
                                                        const detail = workerTestResult.details?.[id];
                                                        if (!detail?.error) return null;
                                                        return <p key={id} className="text-amber-200">{detail.label || id}: {detail.error}</p>;
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                        <button type="button" className="rounded-lg p-1 text-current/70 hover:bg-white/10" onClick={() => { setWorkerTestResult(null); setWorkerTestError(''); }} aria-label="Dismiss">
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            )}
                            <dl className="mt-5 grid grid-cols-1 gap-3 border-t border-border/60 pt-5 text-sm sm:grid-cols-2">
                                <div><dt className="text-muted">Last scan</dt><dd className="mt-1 font-semibold text-text">{formatTime(status.lastScanAt)}{status.lastScanResult ? ` · ${status.lastScanResult.enqueued || 0} queued` : ''}</dd></div>
                                <div><dt className="text-muted">Periodic scan</dt><dd className="mt-1 font-semibold text-text">{status.libraryScanEnabled === false ? 'Disabled' : status.periodicScanning ? `Every ${status.libraryScanIntervalMinutes || 360}m` : 'Idle'}</dd></div>
                                <div>
                                    <dt className="text-muted">Watcher</dt>
                                    <dd className="mt-1 flex items-center gap-2 font-semibold text-text">
                                        <Radar className="h-3.5 w-3.5 text-plex" />
                                        {status.libraryWatchConfigured && status.watchEnvEnabled === false
                                            ? 'Blocked: set MEDIA_AUTOMATION_ENABLE_WATCH=1'
                                            : status.libraryWatchEnabled === false
                                                ? 'Disabled'
                                                : status.watch?.watching
                                                    ? `Watching ${status.watch.roots?.length || 0} root(s)`
                                                    : 'Not watching'}
                                    </dd>
                                </div>
                                <div><dt className="text-muted">Lanes</dt><dd className="mt-1 font-semibold text-text">CPU {status.lanes?.cpu?.running || 0}/{status.lanes?.cpu?.queued || 0} · GPU {status.lanes?.gpu?.running || 0}/{status.lanes?.gpu?.queued || 0}</dd></div>
                            </dl>
                            {status.libraryWatchConfigured && status.watchEnvEnabled === false && (
                                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                                    Watcher is enabled in Settings, but the container env gate is off. Add <code className="font-mono text-plex">MEDIA_AUTOMATION_ENABLE_WATCH=1</code> and recreate the container.
                                </div>
                            )}
                        </section>
                        <section className={`${cardClass} space-y-3 p-5`}>
                            <h2 className="text-lg font-bold tracking-tight text-text">Capabilities</h2>
                            <div className="space-y-3 text-sm">
                                <div className="rounded-lg bg-background/40 p-3"><p className="text-muted">FFmpeg</p><p className="mt-2 break-words font-semibold text-text">{typeof capabilities.ffmpeg === 'object' ? (capabilities.ffmpeg.available === false ? 'Unavailable' : capabilities.ffmpeg.version || 'Available') : capabilities.ffmpeg ? 'Available' : 'Unknown'}</p></div>
                                <div className="rounded-lg bg-background/40 p-3"><p className="text-muted">FFprobe</p><p className="mt-2 break-words font-semibold text-text">{typeof capabilities.ffprobe === 'object' ? (capabilities.ffprobe.available === false ? 'Unavailable' : capabilities.ffprobe.version || 'Available') : capabilities.ffprobe ? 'Available' : 'Unknown'}</p></div>
                                <div className="rounded-lg bg-background/40 p-3">
                                    <p className="text-muted">Hardware adapters</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {[
                                            ['cpu', 'CPU'],
                                            ['qsv', 'Intel QSV'],
                                            ['intel-vaapi', 'Intel VAAPI'],
                                            ['nvenc', 'NVENC'],
                                            ['vaapi', 'AMD VAAPI'],
                                        ].map(([id, label]) => {
                                            const available = Array.isArray(capabilities.hardware)
                                                ? capabilities.hardware.map(String).includes(id)
                                                : id === 'cpu';
                                            return (
                                                <span
                                                    key={id}
                                                    className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                                                        available
                                                            ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                                                            : 'border-border bg-white/5 text-muted'
                                                    }`}
                                                >
                                                    {label}{available ? '' : ' · off'}
                                                </span>
                                            );
                                        })}
                                    </div>
                                    {caresAboutIntel && !availableHardware.includes('qsv') && !availableHardware.includes('intel-vaapi') && (
                                        <p className="mt-2 text-xs text-amber-200/90">
                                            {capabilities.devices?.dri?.present === false
                                                ? <>Intel QSV needs <span className="font-mono text-plex">/dev/dri</span> mapped in the Unraid template (GPU Devices Intel/AMD).</>
                                                : capabilities.devices?.dri?.readable === false
                                                    ? <>Intel render node is present but not readable by PUID - recreate the container on the latest image so the entrypoint can attach DRI groups.</>
                                                    : <>Intel QSV/VAAPI is selected but unavailable - map <span className="font-mono text-plex">/dev/dri</span>, pull latest nightly, then Test worker.</>}
                                        </p>
                                    )}
                                    {caresAboutNvenc && !availableHardware.includes('nvenc') && (
                                        <p className="mt-2 text-xs text-amber-200/90">
                                            {capabilities.devices?.nvidia?.cudaLib
                                                ? 'NVENC is selected but the encoder test failed - check NVIDIA_DRIVER_CAPABILITIES=all and GPU UUID.'
                                                : <>NVENC is selected but not ready - set <span className="font-mono text-plex">NVIDIA_VISIBLE_DEVICES</span>, <span className="font-mono text-plex">NVIDIA_DRIVER_CAPABILITIES=all</span>, and Extra Parameters <span className="font-mono text-plex">--runtime=nvidia</span>.</>}
                                        </p>
                                    )}
                                    {configuredHardware.has('auto') && !anyGpuAvailable && !configuredHardware.has('cpu') && (
                                        <p className="mt-2 text-xs text-amber-200/90">
                                            Hardware is set to Auto but no GPU adapter passed the worker test. Use CPU, or map Intel <span className="font-mono text-plex">/dev/dri</span> / NVIDIA runtime and Test worker again.
                                        </p>
                                    )}
                                    {caresAboutIntel && capabilities.devices?.dri?.present && (
                                        <p className="mt-2 font-mono text-[11px] text-muted">
                                            DRI: {(capabilities.devices.dri.renderNodes || []).join(', ') || 'no render nodes'}
                                            {capabilities.devices.dri.readable ? ' · readable' : ' · not readable'}
                                        </p>
                                    )}
                                    {relevantAdapterErrors.map((id) => {
                                        const detailError = capabilities.details?.[id]?.error;
                                        if (!detailError) return null;
                                        return (
                                            <p key={`${id}-error`} className="mt-2 break-words text-xs text-red-300/90">
                                                <span className="font-semibold uppercase">{id}</span>: {detailError}
                                            </p>
                                        );
                                    })}
                                </div>
                                <div className="rounded-lg bg-background/40 p-3"><p className="text-muted">Encoders</p><p className="mt-2 line-clamp-3 font-semibold text-text">{capabilities.encoders?.length ? capabilities.encoders.join(', ') : 'No encoder data reported'}</p></div>
                            </div>
                        </section>
                    </div>
                    <section className={`${cardClass} p-5`}>
                        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="text-lg font-bold tracking-tight text-text">ARR webhooks</h2>
                                <p className="mt-0.5 text-xs text-muted">
                                    Point Sonarr / Radarr / Lidarr Connect webhooks here (HTTP Basic Auth from Settings). Path rewrites are shared with{' '}
                                    <a className="text-plex hover:underline" href={portalUrl('/settings#scanner')}>Settings → Scanner</a>.
                                </p>
                            </div>
                            <Link2 className="hidden h-5 w-5 text-plex sm:block" />
                        </div>
                        <div className="space-y-2">
                            {MA_WEBHOOK_PATHS.map((row) => {
                                const full = `${typeof window !== 'undefined' ? window.location.origin : ''}${portalUrl(row.path)}`;
                                return (
                                    <div key={row.path} className="flex flex-col gap-2 rounded-xl border border-border/70 bg-background/30 p-3 sm:flex-row sm:items-center">
                                        <span className={`shrink-0 text-xs font-bold uppercase tracking-wide ${row.tone}`}>{row.label}</span>
                                        <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted" title={full}>{full}</code>
                                        <button type="button" className={buttonClass} onClick={() => void copyText(full, `${row.label} webhook URL copied.`)}>
                                            <Copy className="h-4 w-4" /> Copy
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                </div>
            )}

            {tab === 'queue' && (
                <div className="space-y-5">
                    {(status.dryRun || status.outputMode === 'dry-run') && (
                        <div className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                            <div>
                                <p className="font-bold text-amber-50">Global dry-run is still ON - jobs will not rewrite media</p>
                                <p className="mt-1 text-xs text-amber-100/90">
                                    Settings → Media Automation → Safe fallback must be Copy or Replace (then Save). Changing only the pipeline is not enough while this override is active.
                                </p>
                            </div>
                        </div>
                    )}
                    <section className={`${cardClass} p-5`}>
                        <h2 className="mb-4 font-bold text-text">Enqueue a path</h2>
                        <div className="space-y-3">
                            <PathBrowserField
                                label="Media file"
                                mode="file"
                                value={enqueuePath}
                                onChange={setEnqueuePath}
                                placeholder="/media/Movies/example.mkv"
                                hint="Use container paths under your library root (e.g. /media/...), not Unraid /mnt/remotes/… paths."
                            />
                            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
                                <CustomSelect
                                    value={enqueuePipelineId}
                                    onChange={(value) => {
                                        setEnqueuePipelineId(value);
                                        const match = pipelines.find((pipeline) => String(pipeline.id ?? '') === value);
                                        const sample = String(match?.samplePath || '').trim();
                                        if (sample) setEnqueuePath(sample);
                                    }}
                                    options={[{ value: '', label: 'Automatic pipeline' }, ...pipelines.map((pipeline) => ({ value: String(pipeline.id ?? ''), label: pipeline.name }))]}
                                />
                                <button
                                    type="button"
                                    className={buttonClass}
                                    disabled={busy !== null || !enqueuePipelineId || !pipelines.some((pipeline) => String(pipeline.id ?? '') === enqueuePipelineId && String(pipeline.samplePath || '').trim())}
                                    onClick={() => {
                                        const match = pipelines.find((pipeline) => String(pipeline.id ?? '') === enqueuePipelineId);
                                        if (match) void queuePipelineSample(match);
                                    }}
                                >
                                    {busy?.startsWith('queue-sample-') ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                                    Queue sample
                                </button>
                                <button type="button" className={primaryButtonClass} disabled={!enqueuePath.trim() || busy !== null} onClick={() => runAction('enqueue', () => mediaAutomationApi.enqueue(enqueuePath.trim(), enqueuePipelineId || undefined), 'Path added to queue.').then(() => setEnqueuePath(''))}>
                                    {busy === 'enqueue' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Enqueue
                                </button>
                            </div>
                            <p className="text-xs text-muted">Pick a pipeline with a saved sample file to auto-fill the path, or use Queue sample for one click.</p>
                        </div>
                    </section>
                    <section className={`${cardClass} p-5`}>
                        <h2 className="mb-4 font-bold text-text">Test candidate (no enqueue)</h2>
                        <div className="space-y-3">
                            <PathBrowserField
                                label="Media file"
                                mode="file"
                                value={pendingPath}
                                onChange={setPendingPath}
                                placeholder="/media/Movies/example.mkv"
                            />
                            <button
                                type="button"
                                className={buttonClass}
                                disabled={!pendingPath.trim() || busy !== null}
                                onClick={async () => {
                                    setBusy('pending-test');
                                    try {
                                        const result = await mediaAutomationApi.testPending(pendingPath.trim());
                                        setPendingResult(result);
                                        toast(result.matched ? `Matched ${result.pipelineName || 'pipeline'}` : 'No matching pipeline rule');
                                    } catch (error) {
                                        toast(error instanceof Error ? error.message : 'Pending test failed', 'error');
                                    } finally {
                                        setBusy(null);
                                    }
                                }}
                            >
                                {busy === 'pending-test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Test file
                            </button>
                        </div>
                        {pendingResult && (
                            <div className="mt-3 rounded-lg bg-background/40 p-3 text-xs text-muted">
                                <p className="font-semibold text-text">{pendingResult.matched ? 'Would queue' : 'Would skip'} · {pendingResult.reason}</p>
                                {pendingResult.pipelineName && <p className="mt-1">Pipeline: {pendingResult.pipelineName}</p>}
                                {pendingResult.probe && <p className="mt-1">{asText(pendingResult.probe.format)} · {asText(pendingResult.probe.videoCodec)} / {asText(pendingResult.probe.audioCodec)}</p>}
                            </div>
                        )}
                    </section>
                    {jobs.length === 0 ? (
                        <EmptyState
                            icon={ListRestart}
                            title="Queue is empty"
                            detail="Enqueue a path, run Scan now, or wait for the library watcher to discover matching media."
                            actionLabel="Scan now"
                            onAction={() => runAction('scan-now', () => mediaAutomationApi.scanNow(), 'Library scan started.')}
                        />
                    ) : (
                        <div className="space-y-3">
                            <section className={`${cardClass} p-4`}>
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div className="flex flex-wrap gap-2">
                                        {([
                                            ['all', 'All'],
                                            ['queued', 'Queued'],
                                            ['active', 'Active'],
                                            ['dry-run', 'Dry-run'],
                                            ['failed', 'Failed'],
                                            ['completed', 'Completed'],
                                        ] as const).map(([id, label]) => (
                                            <button
                                                key={id}
                                                type="button"
                                                className={`${buttonClass} ${queueFilter === id ? 'border-plex/50 bg-plex/15 text-plex' : ''}`}
                                                onClick={() => setQueueFilter(id)}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                    <label className="relative block w-full lg:max-w-xs">
                                        <span className="sr-only">Search queue</span>
                                        <input
                                            className={`${fieldClass} pl-3`}
                                            value={queueSearch}
                                            onChange={(event) => setQueueSearch(event.target.value)}
                                            placeholder="Search path or pipeline…"
                                        />
                                    </label>
                                </div>
                            </section>
                            <section className={`${cardClass} p-4`}>
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-text">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 rounded border-border bg-background text-plex focus:ring-plex"
                                            checked={allSelected}
                                            onChange={toggleSelectAllJobs}
                                        />
                                        Select all ({filteredJobs.length}{filteredJobs.length !== jobs.length ? ` of ${jobs.length}` : ''})
                                        {selectedJobIds.size > 0 && (
                                            <span className="font-normal text-muted">· {selectedJobIds.size} selected</span>
                                        )}
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            className={buttonClass}
                                            disabled={busy !== null || selectedCancellableIds.length === 0}
                                            onClick={() => runAction(
                                                'cancel-selected',
                                                () => mediaAutomationApi.bulkCancelJobs(selectedCancellableIds),
                                                `Cancelled ${selectedCancellableIds.length} job${selectedCancellableIds.length === 1 ? '' : 's'}.`,
                                            ).then(() => setSelectedJobIds(new Set()))}
                                        >
                                            {busy === 'cancel-selected' ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                                            Cancel selected
                                        </button>
                                        <button
                                            type="button"
                                            className={buttonClass}
                                            disabled={busy !== null || cancellableJobs.length === 0}
                                            onClick={() => runAction(
                                                'cancel-all',
                                                () => mediaAutomationApi.bulkCancelJobs(),
                                                `Cancelled ${cancellableJobs.length} active job${cancellableJobs.length === 1 ? '' : 's'}.`,
                                            ).then(() => setSelectedJobIds(new Set()))}
                                        >
                                            {busy === 'cancel-all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                                            Cancel all active
                                        </button>
                                        <button
                                            type="button"
                                            className={buttonClass}
                                            disabled={busy !== null || (selectedFinishedIds.length === 0 && finishedJobs.length === 0)}
                                            onClick={() => {
                                                const ids = selectedFinishedIds.length > 0 ? selectedFinishedIds : undefined;
                                                const count = ids ? ids.length : finishedJobs.length;
                                                return runAction(
                                                    'clear-finished',
                                                    () => mediaAutomationApi.bulkRemoveJobs(ids),
                                                    `Cleared ${count} finished job${count === 1 ? '' : 's'}.`,
                                                ).then(() => setSelectedJobIds(new Set()));
                                            }}
                                        >
                                            {busy === 'clear-finished' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                            {selectedFinishedIds.length > 0 ? `Clear selected (${selectedFinishedIds.length})` : `Clear finished (${finishedJobs.length})`}
                                        </button>
                                    </div>
                                </div>
                                <p className="mt-2 text-xs text-muted">
                                    Dry-run / completed jobs cannot be cancelled - use Clear finished to remove them. Cancel all active stops queued and running work.
                                </p>
                            </section>
                            {filteredJobs.length === 0 ? (
                                <div className={`${cardClass} p-6 text-center text-sm text-muted`}>
                                    No jobs match this filter{queueSearch.trim() ? ' / search' : ''}.
                                </div>
                            ) : filteredJobs.map((job) => {
                                const jobId = job.id;
                                const state = jobStateValue(job);
                                const dryRunJob = jobIsDryRun(job);
                                const jobState = dryRunJob && ['completed', 'succeeded', 'success'].includes(state)
                                    ? 'dry-run'
                                    : (job.phase || job.state || job.status);
                                const percent = jobProgressPercent(job);
                                const progressMeta = jobProgressMeta(job);
                                const errorText = jobErrorText(job.error);
                                const canCancel = isCancellableJob(job);
                                const isActive = canCancel && ['running', 'processing', 'active', 'probing', 'planning', 'planned', 'verifying', 'committing'].includes(String(job.phase || state).toLowerCase());
                                const canRetry = ['failed', 'cancelled', 'canceled', 'error'].includes(state);
                                const canSkip = state === 'queued';
                                const selected = selectedJobIds.has(String(jobId));
                                return (
                                    <article key={String(jobId)} className={`${listCardClass} cursor-pointer p-4 ${selected ? 'border-plex/50' : ''}`} onClick={() => openJobDetail(jobId)}>
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                            <div className="flex min-w-0 gap-3">
                                                <input
                                                    type="checkbox"
                                                    className="mt-1 h-4 w-4 shrink-0 rounded border-border bg-background text-plex focus:ring-plex"
                                                    checked={selected}
                                                    onClick={(event) => event.stopPropagation()}
                                                    onChange={() => toggleJobSelected(jobId)}
                                                    aria-label={`Select job ${jobId}`}
                                                />
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <StatusPill value={jobState} />
                                                        <HardwareBadge job={job} />
                                                        <span className="text-xs text-muted">#{jobId}</span>
                                                        {job.priority != null && <span className="text-xs text-muted">P{job.priority}</span>}
                                                        {percent != null && <span className="text-xs font-semibold text-plex">{Math.round(percent)}%</span>}
                                                        {progressMeta.etaLabel && <span className="text-xs text-amber-300">ETA {progressMeta.etaLabel}</span>}
                                                        {progressMeta.speedLabel && <span className="text-xs text-muted">{progressMeta.speedLabel}</span>}
                                                        {progressMeta.fpsLabel && <span className="text-xs text-muted">{progressMeta.fpsLabel}</span>}
                                                    </div>
                                                    {jobHardwareInfo(job)?.fallback && (
                                                        <p className="mt-1 text-xs text-amber-300">
                                                            Hardware fell back to CPU{jobHardwareInfo(job)?.requested ? ` (wanted ${jobHardwareInfo(job)?.requested})` : ''}. Check /dev/dri and Capabilities after Test worker.
                                                        </p>
                                                    )}
                                                    <p className="mt-2 truncate font-semibold text-text">{job.path || job.sourcePath || 'Path not reported'}</p>
                                                    <p className="mt-1 text-xs text-muted">{job.pipelineName || (job.pipelineId ? `Pipeline ${job.pipelineId}` : 'Automatic pipeline')} · {formatTime(job.createdAt)}</p>
                                                    {progressMeta.elapsedLabel && (
                                                        <p className="mt-1 text-xs text-muted">Encoded {progressMeta.elapsedLabel}</p>
                                                    )}
                                                    {isActive && percent == null && (
                                                        <p className="mt-1 text-xs text-amber-300">Encoding started - waiting for first FFmpeg progress update…</p>
                                                    )}
                                                    {dryRunJob && ['completed', 'succeeded', 'success'].includes(state) && (
                                                        <p className="mt-1 text-xs text-amber-300">{jobDryRunReason(job)}</p>
                                                    )}
                                                    {jobLiveCommand(job) && (
                                                        <p className="mt-1 truncate font-mono text-[11px] text-muted" title={jobLiveCommand(job)}>{jobLiveCommand(job)}</p>
                                                    )}
                                                    {errorText && <p className="mt-2 text-xs text-red-300">{errorText}</p>}
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 gap-2" onClick={(event) => event.stopPropagation()}>
                                                {canSkip && <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => runAction(`skip-${jobId}`, () => mediaAutomationApi.skipJob(jobId), 'Job skipped.')}><SkipForward className="h-4 w-4" /> Skip</button>}
                                                {canRetry && <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => runAction(`retry-${jobId}`, () => mediaAutomationApi.retryJob(jobId), 'Job queued for retry.')}><RotateCcw className="h-4 w-4" /> Retry</button>}
                                                {canCancel && <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => runAction(`cancel-${jobId}`, () => mediaAutomationApi.cancelJob(jobId), 'Job cancelled.')}><X className="h-4 w-4" /> Cancel</button>}
                                            </div>
                                        </div>
                                        {(percent != null || isActive) && (
                                            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background">
                                                <div
                                                    className={`h-full rounded-full bg-plex transition-all ${percent == null ? 'animate-pulse w-1/5' : ''}`}
                                                    style={percent == null ? undefined : { width: `${Math.max(2, Math.min(100, percent))}%` }}
                                                />
                                            </div>
                                        )}
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {tab === 'pipelines' && (
                <div className="space-y-4">
                    <MediaAutomationSetupChecklist
                        status={status}
                        libraries={libraries}
                        pipelines={pipelines}
                        compact
                        onAction={handleSetupAction}
                    />
                    {postSavePipeline && (
                        <section className={`${cardClass} border-plex/30 p-5`}>
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h2 className="font-bold text-text">Pipeline saved - next steps</h2>
                                    <p className="mt-1 text-sm text-muted">
                                        {postSavePipeline.name} is ready to validate. Work through these before expecting files to change.
                                    </p>
                                </div>
                                <button type="button" className="rounded-lg p-2 text-muted hover:bg-white/5" onClick={() => setPostSavePipeline(null)} aria-label="Dismiss">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                            <ol className="mt-4 space-y-2 text-sm text-text">
                                <li className="rounded-lg bg-background/40 px-3 py-2">1. {String(postSavePipeline.samplePath || '').trim() ? 'Sample file is set - run Dry-run on the card below.' : 'Edit the pipeline and save a sample file.'}</li>
                                <li className="rounded-lg bg-background/40 px-3 py-2">
                                    2. {postSavePipeline.outputMode === 'dry-run'
                                        ? 'Still plan-only - switch to Copy or Replace when you want real writes.'
                                        : 'Output can write - confirm Settings → Safe fallback is not Dry run.'}
                                </li>
                                <li className="rounded-lg bg-background/40 px-3 py-2">3. Start the worker, then Queue sample or Scan now.</li>
                            </ol>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    className={buttonClass}
                                    onClick={() => {
                                        const match = pipelines.find((pipeline) => pipeline.name === postSavePipeline.name)
                                            || postSavePipeline;
                                        openPipelineEditor(match);
                                        setEditorAdvancedOpen(true);
                                        setForceSampleSection(true);
                                        setPostSavePipeline(null);
                                    }}
                                >
                                    <Pencil className="h-4 w-4" /> Edit pipeline
                                </button>
                                {postSavePipeline.outputMode === 'dry-run' && (
                                    <button
                                        type="button"
                                        className={primaryButtonClass}
                                        onClick={() => {
                                            const match = pipelines.find((pipeline) => pipeline.name === postSavePipeline.name) || postSavePipeline;
                                            openPipelineEditor({ ...match, outputMode: 'copy' });
                                            setPostSavePipeline(null);
                                        }}
                                    >
                                        I want real writes
                                    </button>
                                )}
                                <button type="button" className={buttonClass} onClick={() => handleSetupAction('start-worker')}>
                                    <CirclePlay className="h-4 w-4" /> Start worker
                                </button>
                            </div>
                        </section>
                    )}
                    <section className={`${cardClass} p-5`}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="text-lg font-bold tracking-tight text-text">Your pipelines</h2>
                                <p className="mt-1 text-sm leading-relaxed text-muted">Pipelines decide which files match and what FFmpeg does. Start from a template if you are unsure.</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" className={buttonClass} onClick={() => setTemplatePickerOpen(true)}>
                                    <Layers3 className="h-4 w-4" /> Use template
                                </button>
                                <button type="button" className={primaryButtonClass} onClick={() => openPipelineEditor()}>
                                    <Plus className="h-4 w-4" /> Add pipeline
                                </button>
                            </div>
                        </div>
                    </section>
                    {pipelines.length === 0 ? (
                        <section className={`${cardClass} p-6`}>
                            <div className="mx-auto max-w-2xl text-center">
                                <Layers3 className="mx-auto h-10 w-10 text-plex" />
                                <h3 className="mt-3 text-lg font-bold text-text">Create your first pipeline</h3>
                                <p className="mt-2 text-sm text-muted">Pick a common goal - you can change hardware, matching, and output before anything writes.</p>
                            </div>
                            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                                {PIPELINE_STARTER_IDS.map((id) => {
                                    const preset = PIPELINE_PRESETS.find((entry) => entry.id === id);
                                    if (!preset) return null;
                                    return (
                                        <button
                                            key={preset.id}
                                            type="button"
                                            className="rounded-xl border border-border bg-background/30 p-4 text-left transition hover:border-plex/50 hover:bg-plex/10"
                                            onClick={() => openPipelineFromPreset(preset.pipeline)}
                                        >
                                            <p className="font-bold text-text">{preset.label}</p>
                                            <p className="mt-1 text-xs text-muted">{preset.detail}</p>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="mt-4 flex flex-wrap justify-center gap-2">
                                <button type="button" className={buttonClass} onClick={() => setTemplatePickerOpen(true)}>Browse all templates…</button>
                                <button type="button" className={buttonClass} onClick={() => openPipelineEditor()}>Blank pipeline</button>
                            </div>
                        </section>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            {pipelines.map((pipeline) => {
                                const samplePath = String(pipeline.samplePath || '').trim();
                                return (
                                <article key={String(pipeline.id ?? pipeline.name)} className={`${listCardClass} p-5`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-bold text-text">{pipeline.name}</h3>
                                                <StatusPill value={pipeline.enabled ? 'enabled' : 'disabled'} />
                                            </div>
                                            <p className="mt-2 text-sm text-text">{summarizePipelineOutcome(pipeline)}</p>
                                            <p className="mt-2 text-xs text-muted">{summarizeMatchRules(pipeline.rules)}</p>
                                        </div>
                                        <div className="flex gap-1">
                                            <button type="button" className={buttonClass} onClick={() => openPipelineEditor(pipeline)}><Pencil className="h-4 w-4" /></button>
                                            <button type="button" className={buttonClass} disabled={pipeline.id === undefined || busy !== null} onClick={() => { if (pipeline.id !== undefined && window.confirm(`Delete pipeline "${pipeline.name}"?`)) runAction(`delete-pipeline-${pipeline.id}`, () => mediaAutomationApi.deletePipeline(pipeline.id!), 'Pipeline deleted.'); }}><Trash2 className="h-4 w-4 text-red-300" /></button>
                                        </div>
                                    </div>
                                    {samplePath ? (
                                        <div className="mt-3 space-y-2 rounded-lg border border-border/70 bg-background/30 p-3">
                                            <p className="truncate font-mono text-[11px] text-plex" title={samplePath}>{samplePath}</p>
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    className={primaryButtonClass}
                                                    disabled={busy !== null || pipeline.id === undefined}
                                                    onClick={() => void queuePipelineSample(pipeline)}
                                                >
                                                    {busy === `queue-sample-${pipeline.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                                                    Queue sample
                                                </button>
                                                <button
                                                    type="button"
                                                    className={buttonClass}
                                                    disabled={busy !== null || pipeline.id === undefined}
                                                    onClick={() => void queuePipelineSample(pipeline, { dryRun: true })}
                                                >
                                                    {busy === `test-pipeline-${pipeline.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                                    Dry-run
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="mt-3 text-xs text-muted">No sample file saved yet - edit the pipeline and set one for one-click queueing.</p>
                                    )}
                                </article>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {tab === 'libraries' && (
                <div className="space-y-4">
                    <section className={`${cardClass} p-5`}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="text-lg font-bold tracking-tight text-text">Your libraries</h2>
                                <p className="mt-1 text-sm leading-relaxed text-muted">
                                    Libraries are scan roots the container can see. Pipelines decide which files match and what FFmpeg does.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    className={buttonClass}
                                    disabled={busy !== null}
                                    onClick={() => runAction('scan-now', mediaAutomationApi.scanNow, 'Library scan completed.')}
                                >
                                    {busy === 'scan-now' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSearch className="h-4 w-4" />}
                                    Scan now
                                </button>
                                <button type="button" className={primaryButtonClass} onClick={() => setLibraryDraft(emptyLibrary())}>
                                    <Plus className="h-4 w-4" /> New library
                                </button>
                            </div>
                        </div>
                        <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-border/60 pt-4 text-sm sm:grid-cols-3">
                            <div className="rounded-xl border border-border/60 bg-background/30 px-3 py-2.5">
                                <dt className="text-xs font-bold uppercase tracking-wide text-muted">Last scan</dt>
                                <dd className="mt-1 font-semibold text-text">
                                    {formatTime(status.lastScanAt)}
                                    {status.lastScanResult ? ` · ${status.lastScanResult.enqueued || 0} queued` : ''}
                                </dd>
                            </div>
                            <div className="rounded-xl border border-border/60 bg-background/30 px-3 py-2.5">
                                <dt className="text-xs font-bold uppercase tracking-wide text-muted">Periodic scan</dt>
                                <dd className="mt-1 font-semibold text-text">
                                    {status.libraryScanEnabled === false
                                        ? 'Disabled'
                                        : status.periodicScanning
                                            ? `Every ${status.libraryScanIntervalMinutes || 360}m`
                                            : 'Idle'}
                                </dd>
                            </div>
                            <div className="rounded-xl border border-border/60 bg-background/30 px-3 py-2.5">
                                <dt className="text-xs font-bold uppercase tracking-wide text-muted">Watcher</dt>
                                <dd className="mt-1 flex items-center gap-2 font-semibold text-text">
                                    <Radar className="h-3.5 w-3.5 text-plex" />
                                    {status.libraryWatchConfigured && status.watchEnvEnabled === false
                                        ? 'Blocked: set MEDIA_AUTOMATION_ENABLE_WATCH=1'
                                        : status.libraryWatchEnabled === false
                                            ? 'Disabled'
                                            : status.watch?.watching
                                                ? `Watching ${status.watch.roots?.length || 0} root(s)`
                                                : 'Not watching'}
                                </dd>
                            </div>
                        </dl>
                    </section>
                    {libraries.length === 0 ? (
                        <section className={`${cardClass} p-6`}>
                            <div className="mx-auto max-w-2xl text-center">
                                <FolderCog className="mx-auto h-10 w-10 text-plex" />
                                <h3 className="mt-3 text-lg font-bold text-text">Map your first library</h3>
                                <p className="mt-2 text-sm text-muted">
                                    Use a container path under your media mount (e.g. <span className="font-mono text-plex">/media/movies</span>), not a host Unraid path.
                                </p>
                            </div>
                            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {[
                                    { name: 'Movies', rootPath: '/media/movies' },
                                    { name: 'TV', rootPath: '/media/tv' },
                                ].map((starter) => (
                                    <button
                                        key={starter.name}
                                        type="button"
                                        className="rounded-xl border border-border bg-background/30 p-4 text-left transition hover:border-plex/50 hover:bg-plex/10"
                                        onClick={() => setLibraryDraft({ ...emptyLibrary(), name: starter.name, rootPath: starter.rootPath })}
                                    >
                                        <p className="font-bold text-text">{starter.name}</p>
                                        <p className="mt-1 font-mono text-xs text-plex">{starter.rootPath}</p>
                                    </button>
                                ))}
                            </div>
                            <div className="mt-4 flex justify-center">
                                <button type="button" className={buttonClass} onClick={() => setLibraryDraft(emptyLibrary())}>
                                    Blank library
                                </button>
                            </div>
                        </section>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            {libraries.map((library) => {
                                const libraryKey = String(library.id ?? library.name);
                                const health = libraryPathHealth[libraryKey];
                                const queueCount = countJobsForLibrary(jobs, library);
                                const pipelineName = libraryPipelineLabel(library, pipelines);
                                return (
                                    <article key={libraryKey} className={`${listCardClass} p-5`}>
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="font-bold text-text">{library.name}</h3>
                                                    <StatusPill value={library.enabled === false ? 'disabled' : 'enabled'} />
                                                    {queueCount > 0 && (
                                                        <span className="rounded-full border border-plex/30 bg-plex/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-plex">
                                                            {queueCount} in queue
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="mt-2 text-sm text-text">{summarizeLibraryOutcome(library, pipelines)}</p>
                                            </div>
                                            <div className="flex gap-1">
                                                <button type="button" className={buttonClass} onClick={() => setLibraryDraft({ ...emptyLibrary(), ...library })}>
                                                    <Pencil className="h-4 w-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    className={buttonClass}
                                                    disabled={library.id === undefined || busy !== null}
                                                    onClick={() => {
                                                        if (library.id !== undefined && window.confirm(`Delete library "${library.name}"?`)) {
                                                            runAction(`delete-library-${library.id}`, () => mediaAutomationApi.deleteLibrary(library.id!), 'Library deleted.');
                                                        }
                                                    }}
                                                >
                                                    <Trash2 className="h-4 w-4 text-red-300" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="mt-3 space-y-2 rounded-lg border border-border/70 bg-background/30 p-3 text-xs">
                                            <div>
                                                <p className="text-muted">Root</p>
                                                <p className="mt-0.5 truncate font-mono text-plex" title={library.rootPath}>{library.rootPath || '-'}</p>
                                            </div>
                                            <div className="grid gap-2 sm:grid-cols-2">
                                                <div>
                                                    <p className="text-muted">Pipeline</p>
                                                    <p className="mt-0.5 break-all text-text">
                                                        {pipelineName === 'Automatic' ? 'Automatic - first matching' : pipelineName}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-muted">Output</p>
                                                    <p className="mt-0.5 break-all text-text">{library.outputPath || 'Pipeline default'}</p>
                                                </div>
                                                <div className="sm:col-span-2">
                                                    <p className="text-muted">Quarantine</p>
                                                    <p className="mt-0.5 break-all text-text">{library.quarantinePath || 'Not set'}</p>
                                                </div>
                                            </div>
                                        </div>
                                        {library.id !== undefined && (
                                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                                <button
                                                    type="button"
                                                    className={buttonClass}
                                                    disabled={busy !== null}
                                                    onClick={async () => {
                                                        const key = `test-library-${library.id}`;
                                                        setBusy(key);
                                                        try {
                                                            const result = await mediaAutomationApi.testLibrary(library.id!) as { ok?: boolean; rootPath?: string; error?: string };
                                                            const ok = result?.ok !== false;
                                                            setLibraryPathHealth((current) => ({
                                                                ...current,
                                                                [libraryKey]: {
                                                                    ok,
                                                                    message: ok
                                                                        ? `Readable${result?.rootPath ? ` · ${result.rootPath}` : ''}`
                                                                        : (result?.error || 'Path check failed'),
                                                                },
                                                            }));
                                                            toast(ok ? 'Library path is readable.' : (result?.error || 'Library path check failed'), ok ? 'success' : 'error');
                                                        } catch (error) {
                                                            const message = error instanceof Error ? error.message : 'Library path check failed';
                                                            setLibraryPathHealth((current) => ({
                                                                ...current,
                                                                [libraryKey]: { ok: false, message },
                                                            }));
                                                            toast(message, 'error');
                                                        } finally {
                                                            setBusy(null);
                                                        }
                                                    }}
                                                >
                                                    {busy === `test-library-${library.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                                    Test path
                                                </button>
                                                {health && (
                                                    <p className={`text-xs ${health.ok ? 'text-emerald-300' : 'text-red-300'}`}>{health.message}</p>
                                                )}
                                            </div>
                                        )}
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {tab === 'activity' && (
                <div className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap gap-2">
                            {([
                                ['all', 'All'],
                                ['job', 'Jobs'],
                                ['scan', 'Scans'],
                                ['watch', 'Watcher'],
                                ['trigger', 'ARR'],
                            ] as const).map(([id, label]) => (
                                <button
                                    key={id}
                                    type="button"
                                    className={`${buttonClass} ${activityFilter === id ? 'border-plex/50 bg-plex/15 text-plex' : ''}`}
                                    onClick={() => setActivityFilter(id)}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <label className="flex items-center gap-2 text-xs font-semibold text-muted">
                            <span className="whitespace-nowrap">Per page</span>
                            <select
                                className="rounded-lg border border-white/10 bg-background/70 px-2.5 py-2 text-sm font-semibold text-text outline-none transition focus:border-plex"
                                value={activityPageSize}
                                onChange={(event) => {
                                    const next = Number(event.target.value) as typeof ACTIVITY_PAGE_SIZE_OPTIONS[number];
                                    setActivityPageSize(next);
                                    try {
                                        localStorage.setItem(ACTIVITY_PAGE_SIZE_KEY, String(next));
                                    } catch {
                                        // ignore
                                    }
                                }}
                            >
                                {ACTIVITY_PAGE_SIZE_OPTIONS.map((size) => (
                                    <option key={size} value={size}>{size}</option>
                                ))}
                            </select>
                        </label>
                    </div>
                    {filteredActivity.length === 0 ? (
                        <EmptyState
                            icon={Activity}
                            title="No activity recorded"
                            detail="Worker, scan, watcher, and queue events will appear here once the worker is running."
                            actionLabel="Start worker"
                            onAction={() => runAction('start', () => mediaAutomationApi.control('start'), 'Worker started.')}
                        />
                    ) : (
                        <>
                            <div className={`${cardClass} divide-y divide-border/60 overflow-hidden`}>
                                {pagedActivity.map((entry, index) => (
                                    <div
                                        key={String(entry.id ?? `${activityPage}-${index}`)}
                                        className={`flex gap-3 p-4 ${entry.jobId != null ? 'cursor-pointer transition hover:bg-white/[0.03]' : ''}`}
                                        onClick={() => {
                                            if (entry.jobId != null) void openJobDetail(entry.jobId);
                                        }}
                                        onKeyDown={(event) => {
                                            if (entry.jobId == null) return;
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                void openJobDetail(entry.jobId);
                                            }
                                        }}
                                        role={entry.jobId != null ? 'button' : undefined}
                                        tabIndex={entry.jobId != null ? 0 : undefined}
                                    >
                                        <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${statusTone(entry.status).includes('red') ? 'bg-red-400' : statusTone(entry.status).includes('green') ? 'bg-green-400' : 'bg-plex'}`} />
                                        <div className="min-w-0 flex-1"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><p className="font-semibold text-text">{entry.message || entry.action || entry.type || 'Automation event'}</p><time className="text-xs text-muted">{formatTime(entry.createdAt || entry.timestamp || entry.at)}</time></div><p className="mt-1 text-xs text-muted">{entry.type || entry.action || 'activity'}{entry.jobId !== undefined ? ` · Job #${entry.jobId}` : ''}{entry.jobId != null ? ' · Open' : ''}</p></div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-xs text-muted">
                                    Showing {Math.min(filteredActivity.length, (activityPage - 1) * activityPageSize + 1)}
                                    -
                                    {Math.min(filteredActivity.length, activityPage * activityPageSize)}
                                    {' '}of {filteredActivity.length}
                                </p>
                                {activityPageCount > 1 && (
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            className={buttonClass}
                                            disabled={activityPage <= 1}
                                            onClick={() => setActivityPage((page) => Math.max(1, page - 1))}
                                        >
                                            Previous
                                        </button>
                                        <span className="text-sm text-muted">
                                            Page {activityPage} of {activityPageCount}
                                        </span>
                                        <button
                                            type="button"
                                            className={buttonClass}
                                            disabled={activityPage >= activityPageCount}
                                            onClick={() => setActivityPage((page) => Math.min(activityPageCount, page + 1))}
                                        >
                                            Next
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}

            <ModalPortal open={selectedJobId !== null}>
                {selectedJobId !== null && (
                    <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={() => { setSelectedJobId(null); setSelectedJob(null); setJobLogs([]); }}>
                        <div className="max-h-[94dvh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card shadow-2xl custom-scrollbar sm:max-w-5xl sm:rounded-2xl" onMouseDown={(event) => event.stopPropagation()}>
                            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-5 py-4 backdrop-blur-md">
                                <div>
                                    <h2 className="text-lg font-bold text-text">Job detail</h2>
                                    <p className="text-xs text-muted">#{selectedJobId}</p>
                                </div>
                                <button type="button" className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-text" onClick={() => { setSelectedJobId(null); setSelectedJob(null); setJobLogs([]); }}><X className="h-5 w-5" /></button>
                            </div>
                            <div className="space-y-5 p-5">
                                {jobDetailBusy && !selectedJob ? (
                                    <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-plex" /></div>
                                ) : (
                                    <>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <StatusPill
                                                value={
                                                    jobIsDryRun(selectedJob)
                                                    && ['completed', 'succeeded', 'success'].includes(String(selectedJob?.state || selectedJob?.status || '').toLowerCase())
                                                        ? 'dry-run'
                                                        : (selectedJob?.phase || selectedJob?.state || selectedJob?.status)
                                                }
                                            />
                                            {selectedJob && <HardwareBadge job={selectedJob} />}
                                            {selectedJob?.priority != null && (
                                                <label className="flex items-center gap-2 text-xs text-muted">
                                                    Priority
                                                    {['queued', 'running'].includes(String(selectedJob.state || selectedJob.status || '').toLowerCase()) ? (
                                                        <input
                                                            className="w-20 rounded border border-border bg-background px-2 py-1 text-text"
                                                            type="number"
                                                            min={0}
                                                            max={999}
                                                            defaultValue={selectedJob.priority}
                                                            onBlur={(event) => {
                                                                const priority = Math.max(0, Math.min(999, Number(event.target.value) || 0));
                                                                if (selectedJobId == null) return;
                                                                void runAction(`priority-${selectedJobId}`, () => mediaAutomationApi.setPriority(selectedJobId, priority), 'Priority updated.')
                                                                    .then(() => openJobDetail(selectedJobId));
                                                            }}
                                                        />
                                                    ) : (
                                                        <span className="text-text">P{selectedJob.priority}</span>
                                                    )}
                                                </label>
                                            )}
                                        </div>
                                        {selectedJob && (
                                            <div className="flex flex-wrap gap-2">
                                                {isCancellableJob(selectedJob) && (
                                                    <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => runAction(`cancel-${selectedJobId}`, () => mediaAutomationApi.cancelJob(selectedJobId!), 'Job cancelled.').then(() => openJobDetail(selectedJobId!))}>
                                                        {busy === `cancel-${selectedJobId}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Cancel
                                                    </button>
                                                )}
                                                {jobStateValue(selectedJob) === 'queued' && (
                                                    <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => runAction(`skip-${selectedJobId}`, () => mediaAutomationApi.skipJob(selectedJobId!), 'Job skipped.').then(() => openJobDetail(selectedJobId!))}>
                                                        <SkipForward className="h-4 w-4" /> Skip
                                                    </button>
                                                )}
                                                {['failed', 'cancelled', 'canceled', 'error'].includes(jobStateValue(selectedJob)) && (
                                                    <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => runAction(`retry-${selectedJobId}`, () => mediaAutomationApi.retryJob(selectedJobId!), 'Job queued for retry.').then(() => openJobDetail(selectedJobId!))}>
                                                        <RotateCcw className="h-4 w-4" /> Retry
                                                    </button>
                                                )}
                                                {jobIsDryRun(selectedJob) && String(selectedJob.path || selectedJob.sourcePath || '').trim() && (
                                                    <button
                                                        type="button"
                                                        className={primaryButtonClass}
                                                        disabled={busy !== null}
                                                        onClick={() => runAction(
                                                            `requeue-write-${selectedJobId}`,
                                                            () => mediaAutomationApi.enqueue(String(selectedJob.path || selectedJob.sourcePath), selectedJob.pipelineId),
                                                            'Queued again for a real write (still subject to Safe fallback / pipeline output mode).',
                                                        )}
                                                    >
                                                        <Play className="h-4 w-4" /> Queue for real write
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                        <p className="break-all font-semibold text-text">{selectedJob?.path || selectedJob?.sourcePath || 'Path not reported'}</p>
                                        {jobFinalPath(selectedJob) && (
                                            <div className="rounded-lg border border-border/70 bg-background/30 p-3 text-sm">
                                                <p className="text-xs text-muted">{jobIsDryRun(selectedJob) ? 'Planned output path' : 'Output path'}</p>
                                                <p className="mt-1 break-all font-mono text-xs text-plex">{jobFinalPath(selectedJob)}</p>
                                            </div>
                                        )}
                                        {jobIsDryRun(selectedJob) && (
                                            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                                                {jobDryRunReason(selectedJob) || 'Dry-run completed: the worker only planned FFmpeg steps. No media was rewritten.'}
                                            </p>
                                        )}
                                        {selectedJob && (jobProgressPercent(selectedJob) != null || jobProgressMeta(selectedJob).etaLabel || jobProgressMeta(selectedJob).elapsedLabel) && (
                                            <div className="rounded-xl border border-plex/30 bg-plex/10 p-4 space-y-3">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <h3 className="font-bold text-text">Progress</h3>
                                                    <div className="flex flex-wrap gap-3 text-xs text-muted">
                                                        {jobProgressPercent(selectedJob) != null && (
                                                            <span className="font-semibold text-plex">{Math.round(jobProgressPercent(selectedJob)!)}%</span>
                                                        )}
                                                        {jobProgressMeta(selectedJob).etaLabel && (
                                                            <span className="text-amber-300">ETA {jobProgressMeta(selectedJob).etaLabel}</span>
                                                        )}
                                                        {jobProgressMeta(selectedJob).speedLabel && <span>{jobProgressMeta(selectedJob).speedLabel}</span>}
                                                        {jobProgressMeta(selectedJob).fpsLabel && <span>{jobProgressMeta(selectedJob).fpsLabel}</span>}
                                                    </div>
                                                </div>
                                                {jobProgressMeta(selectedJob).elapsedLabel && (
                                                    <p className="text-xs text-muted">Encoded {jobProgressMeta(selectedJob).elapsedLabel}</p>
                                                )}
                                                {jobProgressPercent(selectedJob) != null && (
                                                    <div className="h-2 overflow-hidden rounded-full bg-background">
                                                        <div className="h-full rounded-full bg-plex transition-all" style={{ width: `${Math.max(2, Math.min(100, jobProgressPercent(selectedJob)!))}%` }} />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                                            <div><dt className="text-muted">Pipeline</dt><dd className="mt-1 text-text">{selectedJob?.pipelineName || selectedJob?.pipelineId || 'Automatic'}</dd></div>
                                            <div><dt className="text-muted">Attempts</dt><dd className="mt-1 text-text">{asText(selectedJob?.attempts)} / {asText(selectedJob?.maxAttempts)}</dd></div>
                                            <div><dt className="text-muted">Created</dt><dd className="mt-1 text-text">{formatTime(selectedJob?.createdAt)}</dd></div>
                                            <div><dt className="text-muted">Finished</dt><dd className="mt-1 text-text">{formatTime(selectedJob?.finishedAt || selectedJob?.completedAt)}</dd></div>
                                        </dl>
                                        {jobErrorText(selectedJob?.error) && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{jobErrorText(selectedJob?.error)}</p>}
                                        {jobLiveCommand(selectedJob) && (
                                            <div className="rounded-xl border border-plex/30 bg-plex/10 p-4">
                                                <h3 className="font-bold text-text">{jobIsDryRun(selectedJob) ? 'Planned command (not executed)' : 'Live command'}</h3>
                                                <p className="mt-2 break-all font-mono text-[11px] text-muted">{jobLiveCommand(selectedJob)}</p>
                                            </div>
                                        )}
                                        {jobPlans(selectedJob).length > 0 && (
                                            <div className="rounded-xl border border-border bg-background/30 p-4 space-y-3">
                                                <h3 className="font-bold text-text">Planned steps</h3>
                                                {jobPlans(selectedJob).map((plan, index) => (
                                                    <div key={index} className="rounded-lg border border-border/60 bg-card/40 p-3">
                                                        <p className="text-xs text-muted">Step {index + 1}: {plan.mode || plan.stepType || plan.kind || 'plan'}{plan.adapterLabel ? ` · ${plan.adapterLabel}` : ''}</p>
                                                        <p className="mt-2 break-all font-mono text-[11px] text-muted">
                                                            {Array.isArray(plan.args) && plan.args.length
                                                                ? [plan.executable || (plan.kind === 'ffmpeg' ? 'ffmpeg' : ''), ...plan.args].filter(Boolean).join(' ')
                                                                : 'No args recorded yet'}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <div className="rounded-xl border border-border bg-background/30 p-4">
                                            <h3 className="mb-3 font-bold text-text">Activity / logs</h3>
                                            {jobLogs.length === 0 ? <p className="text-sm text-muted">No log entries for this job yet.</p> : (
                                                <div className="max-h-64 space-y-2 overflow-y-auto custom-scrollbar">
                                                    {jobLogs.map((entry, index) => (
                                                        <div key={String(entry.id ?? index)} className="rounded-lg bg-card/60 p-2 text-xs">
                                                            <div className="flex justify-between gap-2"><span className="font-semibold text-text">{entry.type || 'event'}</span><span className="text-muted">{formatTime(entry.createdAt || entry.timestamp || entry.at)}</span></div>
                                                            <p className="mt-1 text-muted">{entry.message || '-'}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </ModalPortal>

            <ModalPortal open={libraryDraft !== null}>
                {libraryDraft && (
                    <EditorShell title={libraryDraft.id === undefined ? 'New library' : 'Edit library'} onClose={() => setLibraryDraft(null)} onSave={saveLibrary} saving={savingEditor}>
                        <section className="space-y-4">
                            <div>
                                <h3 className="text-sm font-bold text-text">Source</h3>
                                <p className="mt-1 text-xs text-muted">Name and root path the container can read for discovery.</p>
                            </div>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <label className="space-y-2 text-sm font-semibold text-text">Name<input className={fieldClass} value={libraryDraft.name} onChange={(event) => setLibraryDraft({ ...libraryDraft, name: event.target.value })} placeholder="Movies" /></label>
                                <div className="flex items-end pb-2"><label className="flex items-center gap-3 text-sm font-semibold text-text"><SettingsSwitch checked={libraryDraft.enabled !== false} onChange={(enabled) => setLibraryDraft({ ...libraryDraft, enabled })} /> Enabled</label></div>
                            </div>
                            <PathBrowserField
                                label="Root path"
                                value={libraryDraft.rootPath}
                                onChange={(rootPath) => setLibraryDraft({ ...libraryDraft, rootPath })}
                                placeholder="/media/movies"
                            />
                        </section>
                        <section className="space-y-4 border-t border-border/60 pt-4">
                            <div>
                                <h3 className="text-sm font-bold text-text">Routing</h3>
                                <p className="mt-1 text-xs text-muted">Automatic uses the first matching enabled pipeline.</p>
                            </div>
                            <label className="block space-y-2 text-sm font-semibold text-text">Assigned pipeline
                                <CustomSelect
                                    value={String(libraryDraft.pipelineId ?? '')}
                                    onChange={(pipelineId) => setLibraryDraft({ ...libraryDraft, pipelineId })}
                                    options={[{ value: '', label: 'Automatic / first matching pipeline' }, ...pipelines.map((pipeline) => ({ value: String(pipeline.id ?? ''), label: pipeline.name }))]}
                                />
                            </label>
                        </section>
                        <section className="space-y-4 border-t border-border/60 pt-4">
                            <div>
                                <h3 className="text-sm font-bold text-text">Destinations</h3>
                                <p className="mt-1 text-xs text-muted">Leave blank to use pipeline defaults.</p>
                            </div>
                            <PathBrowserField
                                label="Output path"
                                value={libraryDraft.outputPath || ''}
                                onChange={(outputPath) => setLibraryDraft({ ...libraryDraft, outputPath })}
                                placeholder="/media/processed"
                                optional
                            />
                            <PathBrowserField
                                label="Quarantine path"
                                value={libraryDraft.quarantinePath || ''}
                                onChange={(quarantinePath) => setLibraryDraft({ ...libraryDraft, quarantinePath })}
                                placeholder="/media/quarantine"
                                optional
                            />
                        </section>
                    </EditorShell>
                )}
            </ModalPortal>

            <ModalPortal open={pipelineDraft !== null}>
                {pipelineDraft && (
                    <EditorShell title={pipelineDraft.id === undefined ? 'New pipeline' : 'Edit pipeline'} onClose={() => setPipelineDraft(null)} onSave={savePipeline} saving={savingEditor}>
                        <PipelineEditorForm
                            pipelineDraft={pipelineDraft}
                            setPipelineDraft={setPipelineDraft}
                            createRuleCondition={createRuleCondition}
                            editorMatchAdvancedOpen={editorMatchAdvancedOpen}
                            setEditorMatchAdvancedOpen={setEditorMatchAdvancedOpen}
                            editorAdvancedOpen={editorAdvancedOpen}
                            setEditorAdvancedOpen={setEditorAdvancedOpen}
                            forceSampleSection={forceSampleSection}
                            previewBusy={previewBusy}
                            busy={busy}
                            previewResult={previewResult}
                            runPipelinePreview={runPipelinePreview}
                            queuePipelineSample={queuePipelineSample}
                            globalDryRun={!!(status.dryRun || status.outputMode === 'dry-run')}
                        />
                    </EditorShell>
                )}
            </ModalPortal>
            <PipelineTemplatePicker
                open={templatePickerOpen}
                onClose={() => setTemplatePickerOpen(false)}
                onSelect={openPipelineFromPreset}
            />
        </div>
    );
};
