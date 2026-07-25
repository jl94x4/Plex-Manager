import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    CirclePause,
    CirclePlay,
    Cpu,
    FolderCog,
    FolderSearch,
    Gauge,
    Layers3,
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
import { mediaAutomationApi } from './api';
import { PathBrowserField } from './PathBrowserField';
import {
    PIPELINE_PRESETS,
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
    type MediaAutomationRules,
    type MediaAutomationPlan,
    type MediaAutomationStatus,
    type MediaAutomationStep,
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
    return 'Planned only — FFmpeg was not run and no files were written.';
};

const jobErrorText = (error: MediaAutomationJob['error']) => {
    if (!error) return '';
    if (typeof error === 'string') return error;
    return error.message || error.code || '';
};

const jobStateValue = (job: MediaAutomationJob) => String(job.state || job.status || '').toLowerCase();
const isTerminalJob = (job: MediaAutomationJob) => (
    ['completed', 'succeeded', 'failed', 'cancelled', 'canceled', 'success'].includes(jobStateValue(job))
);
const isCancellableJob = (job: MediaAutomationJob) => !isTerminalJob(job);
const pathBasename = (value: string) => {
    const parts = value.replace(/\\/g, '/').split('/').filter(Boolean);
    return parts[parts.length - 1] || value;
};

const fieldClass = 'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-text placeholder:text-muted/60 outline-none transition focus:border-plex focus:ring-1 focus:ring-plex';
const cardClass = 'rounded-2xl border border-border/70 bg-card/70 shadow-xl backdrop-blur-md';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-white/[0.04] px-3 py-2 text-sm font-semibold text-text transition hover:border-plex/50 hover:bg-plex/10 disabled:pointer-events-none disabled:opacity-40';
const primaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-plex px-3 py-2 text-sm font-bold text-background transition hover:bg-plex-hover disabled:pointer-events-none disabled:opacity-40';

const asText = (value: unknown, fallback = '—') => value === undefined || value === null || value === '' ? fallback : String(value);
const formatTime = (value?: string) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};
const createRuleCondition = (): MediaAutomationRuleCondition => ({
    id: `condition-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    field: 'videoCodec',
    operator: 'equals',
    value: '',
});
const normalizeRules = (value: unknown): MediaAutomationRules => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { operator: 'AND', conditions: [] };
    }
    const record = value as Partial<MediaAutomationRules>;
    return {
        operator: record.operator === 'OR' ? 'OR' : 'AND',
        conditions: Array.isArray(record.conditions)
            ? record.conditions.map((condition, index) => ({
                ...createRuleCondition(),
                ...(condition && typeof condition === 'object' ? condition : {}),
                id: String((condition as MediaAutomationRuleCondition | undefined)?.id || `condition-${index + 1}`),
            }))
            : [],
    };
};
const statusTone = (status?: string) => {
    const value = String(status || '').toLowerCase();
    if (['dry-run', 'dry run', 'planned'].some((key) => value.includes(key))) {
        return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    }
    if (['completed', 'succeeded', 'ready', 'running', 'online', 'healthy', 'success', 'processing', 'committing', 'verifying'].some((key) => value.includes(key))) {
        return 'border-green-500/30 bg-green-500/10 text-green-300';
    }
    if (['failed', 'error', 'offline', 'stopped', 'cancelled', 'canceled'].some((key) => value.includes(key))) {
        return 'border-red-500/30 bg-red-500/10 text-red-300';
    }
    if (['paused', 'queued', 'pending', 'probing', 'planning'].some((key) => value.includes(key))) {
        return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    }
    return 'border-border bg-white/5 text-muted';
};

const StatusPill: React.FC<{ value?: string }> = ({ value }) => (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${statusTone(value)}`}>
        {value || 'unknown'}
    </span>
);

const EmptyState: React.FC<{ icon: React.ComponentType<{ className?: string }>; title: string; detail: string }> = ({ icon: Icon, title, detail }) => (
    <div className={`${cardClass} flex min-h-48 flex-col items-center justify-center px-6 py-10 text-center`}>
        <Icon className="mb-3 h-9 w-9 text-plex/70" />
        <h3 className="font-bold text-text">{title}</h3>
        <p className="mt-1 max-w-md text-sm text-muted">{detail}</p>
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
    const [tab, setTab] = useState<MediaAutomationTab>('overview');
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
    const [activityFilter, setActivityFilter] = useState<'all' | 'job' | 'scan' | 'watch'>('all');
    const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());

    const toast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToasts((current) => pushToast(current, message, type));
    }, []);

    const load = useCallback(async (quiet = false) => {
        quiet ? setRefreshing(true) : setLoading(true);
        const requests = [
            ['status', mediaAutomationApi.status()],
            ['capabilities', mediaAutomationApi.capabilities()],
            ['jobs', mediaAutomationApi.jobs()],
            ['activity', mediaAutomationApi.activity()],
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
        const timer = window.setInterval(() => { load(true); }, 15000);
        return () => window.clearInterval(timer);
    }, [load]);

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
            if (pipelineDraft.id !== undefined) await mediaAutomationApi.updatePipeline(pipelineDraft.id, pipelineDraft);
            else await mediaAutomationApi.createPipeline(pipelineDraft);
            setPipelineDraft(null);
            toast('Pipeline saved.');
            await load(true);
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to save pipeline', 'error');
        } finally {
            setSavingEditor(false);
        }
    };

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
            return true;
        });
    }, [activity, activityFilter]);

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
        if (!Number.isFinite(bytes) || bytes <= 0) return '—';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 ** 3) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
        return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
    };

    const openPipelineEditor = (pipeline?: MediaAutomationPipeline) => {
        setPreviewResult(null);
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
        <div className="w-full space-y-6 pb-8">
            <ToastContainer toasts={toasts} setToasts={setToasts} />
            <header className={`${cardClass} relative overflow-hidden p-5 sm:p-7`}>
                <div className="absolute inset-y-0 right-0 w-64 bg-gradient-to-l from-plex/10 to-transparent" />
                <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-plex">
                            <ServerCog className="h-4 w-4" /> Native worker
                        </div>
                        <h1 className="text-2xl font-black text-text sm:text-3xl">Media Automation</h1>
                        <p className="mt-1 text-sm text-muted">Manage native transcode, remux, and file automation workflows.</p>
                    </div>
                    <div className="flex items-center gap-3">
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

            <nav className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card/70 p-1.5 custom-scrollbar">
                {tabs.map(({ id, label, icon: Icon }) => (
                    <button key={id} type="button" onClick={() => setTab(id)} className={`flex min-w-max flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition ${tab === id ? 'bg-plex text-background shadow-lg' : 'text-muted hover:bg-white/5 hover:text-text'}`}>
                        <Icon className="h-4 w-4" /> {label}
                    </button>
                ))}
            </nav>

            {tab === 'overview' && (
                <div className="space-y-5">
                    {(status.dryRun || status.outputMode === 'dry-run') && (
                        <div className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                            <div>
                                <p className="font-bold text-amber-50">Global dry-run is forcing every job</p>
                                <p className="mt-1 text-xs text-amber-100/90">
                                    Settings → Media Automation → Safe fallback is set to Dry run. Pipeline output modes (copy/replace) are overridden until you change that fallback and save.
                                </p>
                            </div>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {[
                            ['Queued', status.queuedJobs ?? queueCounts.queued, 'text-amber-300'],
                            ['Processing', status.activeJobs ?? queueCounts.active, 'text-blue-300'],
                            ['Completed', status.completedJobs ?? queueCounts.completed, 'text-green-300'],
                            ['Failed', status.failedJobs ?? queueCounts.failed, 'text-red-300'],
                        ].map(([label, value, color]) => (
                            <div key={String(label)} className={`${cardClass} p-4 sm:p-5`}>
                                <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
                                <p className={`mt-2 text-3xl font-black ${color}`}>{asText(value, '0')}</p>
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {[
                            ['Processed 24h', status.metrics?.processed24h ?? 0, 'text-green-300'],
                            ['Failed 24h', status.metrics?.failed24h ?? 0, 'text-red-300'],
                            ['Success rate 24h', status.metrics?.successRate24h == null ? '—' : `${status.metrics.successRate24h}%`, 'text-plex'],
                            ['Bytes out 24h', formatBytes(status.metrics?.bytesOut24h), 'text-blue-300'],
                        ].map(([label, value, color]) => (
                            <div key={String(label)} className={`${cardClass} p-4 sm:p-5`}>
                                <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
                                <p className={`mt-2 text-2xl font-black ${color}`}>{asText(value, '0')}</p>
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
                        <section className={`${cardClass} p-5`}>
                            <div className="mb-5 flex items-center justify-between">
                                <h2 className="font-bold text-text">Worker controls</h2>
                                <Cpu className="h-5 w-5 text-plex" />
                            </div>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                {[
                                    ['start', 'Start', CirclePlay],
                                    ['pause', 'Pause', CirclePause],
                                    ['resume', 'Resume', Play],
                                    ['stop', 'Stop', Square],
                                ].map(([action, label, Icon]) => (
                                    <button key={String(action)} type="button" className={buttonClass} disabled={busy !== null} onClick={() => runAction(`control-${action}`, () => mediaAutomationApi.control(String(action)), `Worker ${action} requested.`)}>
                                        {busy === `control-${action}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />} {label}
                                    </button>
                                ))}
                            </div>
                            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => runAction('scan-now', mediaAutomationApi.scanNow, 'Library scan completed.')}>
                                    {busy === 'scan-now' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSearch className="h-4 w-4" />} Scan now
                                </button>
                                <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => runAction('worker-test', mediaAutomationApi.testWorker, 'Worker test completed.')}>
                                    {busy === 'worker-test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Test worker
                                </button>
                            </div>
                            <dl className="mt-5 grid grid-cols-1 gap-3 border-t border-border/60 pt-5 text-sm sm:grid-cols-2">
                                <div><dt className="text-muted">Last scan</dt><dd className="mt-1 font-semibold text-text">{formatTime(status.lastScanAt)}{status.lastScanResult ? ` · ${status.lastScanResult.enqueued || 0} queued` : ''}</dd></div>
                                <div><dt className="text-muted">Periodic scan</dt><dd className="mt-1 font-semibold text-text">{status.libraryScanEnabled === false ? 'Disabled' : status.periodicScanning ? `Every ${status.libraryScanIntervalMinutes || 360}m` : 'Idle'}</dd></div>
                                <div><dt className="text-muted">Watcher</dt><dd className="mt-1 flex items-center gap-2 font-semibold text-text"><Radar className="h-3.5 w-3.5 text-plex" />{status.libraryWatchEnabled === false ? 'Disabled' : status.watch?.watching ? `Watching ${status.watch.roots?.length || 0} root(s)` : 'Not watching'}</dd></div>
                                <div><dt className="text-muted">Lanes</dt><dd className="mt-1 font-semibold text-text">CPU {status.lanes?.cpu?.running || 0}/{status.lanes?.cpu?.queued || 0} · GPU {status.lanes?.gpu?.running || 0}/{status.lanes?.gpu?.queued || 0}</dd></div>
                            </dl>
                        </section>
                        <section className={`${cardClass} p-5`}>
                            <h2 className="mb-5 font-bold text-text">Capabilities</h2>
                            <div className="space-y-3 text-sm">
                                <div className="rounded-lg bg-background/40 p-3"><p className="text-muted">FFmpeg</p><p className="mt-2 break-words font-semibold text-text">{typeof capabilities.ffmpeg === 'object' ? (capabilities.ffmpeg.available === false ? 'Unavailable' : capabilities.ffmpeg.version || 'Available') : capabilities.ffmpeg ? 'Available' : 'Unknown'}</p></div>
                                <div className="rounded-lg bg-background/40 p-3"><p className="text-muted">FFprobe</p><p className="mt-2 break-words font-semibold text-text">{typeof capabilities.ffprobe === 'object' ? (capabilities.ffprobe.available === false ? 'Unavailable' : capabilities.ffprobe.version || 'Available') : capabilities.ffprobe ? 'Available' : 'Unknown'}</p></div>
                                <div className="rounded-lg bg-background/40 p-3"><p className="text-muted">Hardware</p><p className="mt-2 font-semibold text-text">{capabilities.hardware?.length ? capabilities.hardware.join(', ') : 'No hardware data reported'}</p></div>
                                <div className="rounded-lg bg-background/40 p-3"><p className="text-muted">Encoders</p><p className="mt-2 line-clamp-3 font-semibold text-text">{capabilities.encoders?.length ? capabilities.encoders.join(', ') : 'No encoder data reported'}</p></div>
                            </div>
                        </section>
                    </div>
                </div>
            )}

            {tab === 'queue' && (
                <div className="space-y-5">
                    {(status.dryRun || status.outputMode === 'dry-run') && (
                        <div className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                            <div>
                                <p className="font-bold text-amber-50">Global dry-run is still ON — jobs will not rewrite media</p>
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
                    {jobs.length === 0 ? <EmptyState icon={ListRestart} title="Queue is empty" detail="Enqueue a path, run Scan now, or wait for the library watcher to discover matching media." /> : (
                        <div className="space-y-3">
                            <section className={`${cardClass} p-4`}>
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-text">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 rounded border-border bg-background text-plex focus:ring-plex"
                                            checked={allSelected}
                                            onChange={toggleSelectAllJobs}
                                        />
                                        Select all ({jobs.length})
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
                                    Dry-run / completed jobs cannot be cancelled — use Clear finished to remove them. Cancel all active stops queued and running work.
                                </p>
                            </section>
                            {jobs.map((job) => {
                                const jobId = job.id;
                                const state = jobStateValue(job);
                                const dryRunJob = jobIsDryRun(job);
                                const jobState = dryRunJob && ['completed', 'succeeded', 'success'].includes(state)
                                    ? 'dry-run'
                                    : (job.phase || job.state || job.status);
                                const percent = jobProgressPercent(job);
                                const errorText = jobErrorText(job.error);
                                const canCancel = isCancellableJob(job);
                                const canRetry = ['failed', 'cancelled', 'canceled', 'error'].includes(state);
                                const canSkip = state === 'queued';
                                const selected = selectedJobIds.has(String(jobId));
                                return (
                                    <article key={String(jobId)} className={`${cardClass} cursor-pointer p-4 transition hover:border-plex/40 ${selected ? 'border-plex/50' : ''}`} onClick={() => openJobDetail(jobId)}>
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
                                                        <span className="text-xs text-muted">#{jobId}</span>
                                                        {job.lane && <span className="text-xs uppercase text-muted">{job.lane}</span>}
                                                        {job.priority != null && <span className="text-xs text-muted">P{job.priority}</span>}
                                                        {percent != null && <span className="text-xs text-muted">{Math.round(percent)}%</span>}
                                                    </div>
                                                    <p className="mt-2 truncate font-semibold text-text">{job.path || job.sourcePath || 'Path not reported'}</p>
                                                    <p className="mt-1 text-xs text-muted">{job.pipelineName || (job.pipelineId ? `Pipeline ${job.pipelineId}` : 'Automatic pipeline')} · {formatTime(job.createdAt)}</p>
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
                                        {percent != null && (
                                            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-plex transition-all" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} /></div>
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
                    <section className={`${cardClass} p-5`}>
                        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="font-bold text-text">Presets</h2>
                                <p className="mt-1 text-xs text-muted">Seed from Unmanic-style quality profiles (high / balanced / space saver / archive), remux, and compatibility templates — then tweak rules and hardware.</p>
                            </div>
                            <button type="button" className={primaryButtonClass} onClick={() => openPipelineEditor()}><Plus className="h-4 w-4" /> New pipeline</button>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {PIPELINE_PRESETS.map((preset) => (
                                <button
                                    key={preset.id}
                                    type="button"
                                    className="rounded-xl border border-border bg-background/30 p-4 text-left transition hover:border-plex/50 hover:bg-plex/10"
                                    onClick={() => openPipelineEditor({
                                        ...emptyPipeline(),
                                        ...preset.pipeline,
                                        rules: normalizeRules(preset.pipeline.rules),
                                        steps: [...preset.pipeline.steps],
                                    })}
                                >
                                    <p className="font-bold text-text">{preset.label}</p>
                                    <p className="mt-1 text-xs text-muted">{preset.detail}</p>
                                </button>
                            ))}
                        </div>
                    </section>
                    <div className="flex justify-end md:hidden"><button type="button" className={primaryButtonClass} onClick={() => openPipelineEditor()}><Plus className="h-4 w-4" /> New pipeline</button></div>
                    {pipelines.length === 0 ? <EmptyState icon={Layers3} title="No pipelines configured" detail="Create a pipeline to define matching rules and transcode or remux behavior." /> : (
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            {pipelines.map((pipeline) => {
                                const samplePath = String(pipeline.samplePath || '').trim();
                                return (
                                <article key={String(pipeline.id ?? pipeline.name)} className={`${cardClass} p-5`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div><div className="flex items-center gap-2"><h3 className="font-bold text-text">{pipeline.name}</h3><StatusPill value={pipeline.enabled ? 'enabled' : 'disabled'} /></div><p className="mt-2 text-xs text-muted">Priority {pipeline.priority ?? 50} · {pipeline.outputMode || 'dry-run'} · {pipeline.hardware || 'auto'}</p></div>
                                        <div className="flex gap-1">
                                            <button type="button" className={buttonClass} onClick={() => openPipelineEditor(pipeline)}><Pencil className="h-4 w-4" /></button>
                                            <button type="button" className={buttonClass} disabled={pipeline.id === undefined || busy !== null} onClick={() => { if (pipeline.id !== undefined && window.confirm(`Delete pipeline "${pipeline.name}"?`)) runAction(`delete-pipeline-${pipeline.id}`, () => mediaAutomationApi.deletePipeline(pipeline.id!), 'Pipeline deleted.'); }}><Trash2 className="h-4 w-4 text-red-300" /></button>
                                        </div>
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-2">{(pipeline.steps || []).map((step, index) => <span key={`${step.type}-${index}`} className="rounded-md border border-border bg-background/40 px-2 py-1 text-xs font-semibold text-muted">{index + 1}. {step.type}{step.videoCodec ? ` · ${step.videoCodec}` : ''}</span>)}</div>
                                    <p className="mt-4 rounded-lg bg-background/40 p-3 text-xs text-muted">
                                        {normalizeRules(pipeline.rules).conditions.length} rule condition{normalizeRules(pipeline.rules).conditions.length === 1 ? '' : 's'} joined with {normalizeRules(pipeline.rules).operator}
                                    </p>
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
                                        <p className="mt-3 text-xs text-muted">No sample file saved yet — edit the pipeline and set one for one-click queueing.</p>
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
                    <div className="flex justify-end"><button type="button" className={primaryButtonClass} onClick={() => setLibraryDraft(emptyLibrary())}><Plus className="h-4 w-4" /> New library</button></div>
                    {libraries.length === 0 ? <EmptyState icon={FolderCog} title="No libraries configured" detail="Add a source root, optional output path, and quarantine path." /> : (
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            {libraries.map((library) => (
                                <article key={String(library.id ?? library.name)} className={`${cardClass} p-5`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0"><h3 className="font-bold text-text">{library.name}</h3><p className="mt-2 truncate font-mono text-xs text-plex">{library.rootPath}</p></div>
                                        <div className="flex gap-1">
                                            <button type="button" className={buttonClass} onClick={() => setLibraryDraft({ ...emptyLibrary(), ...library })}><Pencil className="h-4 w-4" /></button>
                                            <button type="button" className={buttonClass} disabled={library.id === undefined || busy !== null} onClick={() => { if (library.id !== undefined && window.confirm(`Delete library "${library.name}"?`)) runAction(`delete-library-${library.id}`, () => mediaAutomationApi.deleteLibrary(library.id!), 'Library deleted.'); }}><Trash2 className="h-4 w-4 text-red-300" /></button>
                                        </div>
                                    </div>
                                    <dl className="mt-4 grid gap-2 text-xs">
                                        <div><dt className="text-muted">Pipeline</dt><dd className="mt-0.5 break-all text-text">{pipelines.find((pipeline) => String(pipeline.id) === String(library.pipelineId || ''))?.name || (library.pipelineId ? `Pipeline ${library.pipelineId}` : 'Automatic')}</dd></div>
                                        <div><dt className="text-muted">Output</dt><dd className="mt-0.5 break-all text-text">{library.outputPath || 'Pipeline default'}</dd></div>
                                        <div><dt className="text-muted">Quarantine</dt><dd className="mt-0.5 break-all text-text">{library.quarantinePath || 'Not configured'}</dd></div>
                                    </dl>
                                    {library.id !== undefined && (
                                        <button type="button" className={`${buttonClass} mt-4 w-full`} disabled={busy !== null} onClick={() => runAction(`test-library-${library.id}`, () => mediaAutomationApi.testLibrary(library.id!), 'Library path is readable.')}>
                                            {busy === `test-library-${library.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Test library path
                                        </button>
                                    )}
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {tab === 'activity' && (
                <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                        {([
                            ['all', 'All'],
                            ['job', 'Jobs'],
                            ['scan', 'Scans'],
                            ['watch', 'Watcher'],
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
                    {filteredActivity.length === 0 ? <EmptyState icon={Activity} title="No activity recorded" detail="Worker, scan, watcher, and queue events will appear here." /> : (
                        <div className={`${cardClass} divide-y divide-border/60 overflow-hidden`}>
                            {filteredActivity.map((entry, index) => (
                                <div key={String(entry.id ?? index)} className="flex gap-3 p-4">
                                    <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${statusTone(entry.status).includes('red') ? 'bg-red-400' : statusTone(entry.status).includes('green') ? 'bg-green-400' : 'bg-plex'}`} />
                                    <div className="min-w-0 flex-1"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><p className="font-semibold text-text">{entry.message || entry.action || entry.type || 'Automation event'}</p><time className="text-xs text-muted">{formatTime(entry.createdAt || entry.timestamp || entry.at)}</time></div><p className="mt-1 text-xs text-muted">{entry.type || entry.action || 'activity'}{entry.jobId !== undefined ? ` · Job #${entry.jobId}` : ''}</p></div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <ModalPortal open={selectedJobId !== null}>
                {selectedJobId !== null && (
                    <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={() => { setSelectedJobId(null); setSelectedJob(null); setJobLogs([]); }}>
                        <div className="max-h-[94dvh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card shadow-2xl custom-scrollbar sm:max-w-3xl sm:rounded-2xl" onMouseDown={(event) => event.stopPropagation()}>
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
                                            {selectedJob?.lane && <span className="text-xs uppercase text-muted">{selectedJob.lane}</span>}
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
                                        <p className="break-all font-semibold text-text">{selectedJob?.path || selectedJob?.sourcePath || 'Path not reported'}</p>
                                        {jobIsDryRun(selectedJob) && (
                                            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                                                {jobDryRunReason(selectedJob) || 'Dry-run completed: the worker only planned FFmpeg steps. No media was rewritten.'}
                                            </p>
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
                                                            <p className="mt-1 text-muted">{entry.message || '—'}</p>
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
                        <label className="block space-y-2 text-sm font-semibold text-text">Assigned pipeline
                            <CustomSelect
                                value={String(libraryDraft.pipelineId ?? '')}
                                onChange={(pipelineId) => setLibraryDraft({ ...libraryDraft, pipelineId })}
                                options={[{ value: '', label: 'Automatic / first matching pipeline' }, ...pipelines.map((pipeline) => ({ value: String(pipeline.id ?? ''), label: pipeline.name }))]}
                            />
                        </label>
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
                    </EditorShell>
                )}
            </ModalPortal>

            <ModalPortal open={pipelineDraft !== null}>
                {pipelineDraft && (
                    <EditorShell title={pipelineDraft.id === undefined ? 'New pipeline' : 'Edit pipeline'} onClose={() => setPipelineDraft(null)} onSave={savePipeline} saving={savingEditor}>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
                            <label className="space-y-2 text-sm font-semibold text-text">Name<input className={fieldClass} value={pipelineDraft.name} onChange={(event) => setPipelineDraft({ ...pipelineDraft, name: event.target.value })} placeholder="HEVC conversion" /></label>
                            <label className="space-y-2 text-sm font-semibold text-text">Priority<input className={fieldClass} type="number" min={0} max={999} value={pipelineDraft.priority} onChange={(event) => setPipelineDraft({ ...pipelineDraft, priority: Math.max(0, Number(event.target.value) || 0) })} /></label>
                        </div>
                        <label className="flex items-center gap-3 text-sm font-semibold text-text"><SettingsSwitch checked={pipelineDraft.enabled} onChange={(enabled) => setPipelineDraft({ ...pipelineDraft, enabled })} /> Pipeline enabled</label>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <label className="space-y-2 text-sm font-semibold text-text">Output mode<CustomSelect value={pipelineDraft.outputMode} onChange={(outputMode) => setPipelineDraft({ ...pipelineDraft, outputMode: outputMode as OutputMode })} options={[{ value: 'dry-run', label: 'Dry run' }, { value: 'copy', label: 'Copy' }, { value: 'replace', label: 'Replace' }]} /></label>
                            <label className="space-y-2 text-sm font-semibold text-text">Hardware<CustomSelect value={pipelineDraft.hardware} onChange={(hardware) => setPipelineDraft({ ...pipelineDraft, hardware: hardware as HardwareMode })} options={[{ value: 'auto', label: 'Auto' }, { value: 'cpu', label: 'CPU' }, { value: 'nvenc', label: 'NVIDIA NVENC' }, { value: 'qsv', label: 'Intel Quick Sync' }, { value: 'intel-vaapi', label: 'Intel VAAPI' }, { value: 'vaapi', label: 'AMD VAAPI' }]} /></label>
                        </div>
                        {(pipelineDraft.outputMode === 'replace' || pipelineDraft.outputMode === 'copy') && (
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                                {pipelineDraft.outputMode === 'replace'
                                    ? 'Replace mode atomically promotes verified output over the source. Keep dry-run or copy until path mounts, PUID/PGID, and GPU adapters are validated.'
                                    : 'Copy mode writes beside the source and leaves the original untouched.'}
                                {' '}If Settings → Media Automation Safe fallback is still Dry run, this pipeline will not write until that global override is changed.
                            </div>
                        )}
                        <div>
                            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <h3 className="font-bold text-text">Match rules</h3>
                                    <p className="mt-1 text-xs text-muted">A file must satisfy the structured conditions before this pipeline runs.</p>
                                </div>
                                <div className="flex gap-2">
                                    <CustomSelect
                                        className="min-w-32"
                                        compact
                                        value={pipelineDraft.rules.operator}
                                        onChange={(operator) => setPipelineDraft({ ...pipelineDraft, rules: { ...pipelineDraft.rules, operator: operator as 'AND' | 'OR' } })}
                                        options={[{ value: 'AND', label: 'Match ALL (AND)' }, { value: 'OR', label: 'Match ANY (OR)' }]}
                                    />
                                    <button type="button" className={buttonClass} onClick={() => setPipelineDraft({ ...pipelineDraft, rules: { ...pipelineDraft.rules, conditions: [...pipelineDraft.rules.conditions, createRuleCondition()] } })}><Plus className="h-4 w-4" /> Condition</button>
                                </div>
                            </div>
                            <div className="space-y-3">
                                {pipelineDraft.rules.conditions.length === 0 && (
                                    <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">No conditions — this pipeline matches every file.</div>
                                )}
                                {pipelineDraft.rules.conditions.map((condition, index) => {
                                    const updateCondition = (patch: Partial<MediaAutomationRuleCondition>) => setPipelineDraft({
                                        ...pipelineDraft,
                                        rules: {
                                            ...pipelineDraft.rules,
                                            conditions: pipelineDraft.rules.conditions.map((current) => current.id === condition.id ? { ...current, ...patch } : current),
                                        },
                                    });
                                    return (
                                        <div key={condition.id} className="rounded-xl border border-border bg-background/30 p-4">
                                            <div className="mb-3 flex items-center justify-between">
                                                <span className="text-xs font-bold uppercase tracking-wide text-plex">Condition {index + 1}</span>
                                                <button type="button" className="p-1.5 text-muted hover:text-red-300" onClick={() => setPipelineDraft({ ...pipelineDraft, rules: { ...pipelineDraft.rules, conditions: pipelineDraft.rules.conditions.filter((current) => current.id !== condition.id) } })}><Trash2 className="h-4 w-4" /></button>
                                            </div>
                                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                                <CustomSelect value={condition.field} onChange={(field) => updateCondition({ field: field as MediaAutomationRuleCondition['field'] })} options={[
                                                    { value: 'path', label: 'Path' },
                                                    { value: 'container', label: 'Container' },
                                                    { value: 'videoCodec', label: 'Video codec' },
                                                    { value: 'audioCodec', label: 'Audio codec' },
                                                    { value: 'width', label: 'Video width' },
                                                    { value: 'bitrate', label: 'Bitrate' },
                                                    { value: 'hdr', label: 'HDR' },
                                                ]} />
                                                <CustomSelect value={condition.operator} onChange={(operator) => updateCondition({ operator: operator as MediaAutomationRuleCondition['operator'] })} options={[
                                                    { value: 'equals', label: 'Equals' },
                                                    { value: 'notEquals', label: 'Does not equal' },
                                                    { value: 'contains', label: 'Contains' },
                                                    { value: 'matches', label: 'Matches pattern' },
                                                    { value: 'greaterThan', label: 'Greater than' },
                                                    { value: 'lessThan', label: 'Less than' },
                                                ]} />
                                                {condition.field === 'hdr' ? (
                                                    <CustomSelect value={condition.value || 'true'} onChange={(value) => updateCondition({ value })} options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]} />
                                                ) : (
                                                    <input className={fieldClass} value={condition.value} onChange={(event) => updateCondition({ value: event.target.value })} placeholder={condition.field === 'path' ? '*.mkv' : condition.field === 'width' ? '1920' : 'Value'} />
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <div>
                            <div className="mb-3 flex items-center justify-between"><div><h3 className="font-bold text-text">Ordered steps</h3><p className="mt-1 text-xs text-muted">Steps execute from top to bottom.</p></div><button type="button" className={buttonClass} onClick={() => setPipelineDraft({ ...pipelineDraft, steps: [...pipelineDraft.steps, { type: 'transcode', container: 'mkv', videoCodec: 'hevc', audioCodec: 'copy', subtitleCodec: 'copy' }] })}><Plus className="h-4 w-4" /> Add step</button></div>
                            <div className="space-y-3">
                                {pipelineDraft.steps.map((step, index) => {
                                    const updateStep = (patch: Partial<MediaAutomationStep>) => setPipelineDraft({ ...pipelineDraft, steps: pipelineDraft.steps.map((current, currentIndex) => currentIndex === index ? { ...current, ...patch } : current) });
                                    const moveStep = (offset: number) => {
                                        const target = index + offset;
                                        if (target < 0 || target >= pipelineDraft.steps.length) return;
                                        const next = [...pipelineDraft.steps];
                                        [next[index], next[target]] = [next[target], next[index]];
                                        setPipelineDraft({ ...pipelineDraft, steps: next });
                                    };
                                    return (
                                        <div key={index} className="rounded-xl border border-border bg-background/30 p-4">
                                            <div className="mb-3 flex items-center justify-between">
                                                <span className="text-xs font-bold uppercase tracking-wide text-plex">Step {index + 1}</span>
                                                <div className="flex items-center gap-1">
                                                    <button type="button" aria-label="Move step up" disabled={index === 0} className="p-1.5 text-muted hover:text-text disabled:opacity-30" onClick={() => moveStep(-1)}><ChevronUp className="h-4 w-4" /></button>
                                                    <button type="button" aria-label="Move step down" disabled={index === pipelineDraft.steps.length - 1} className="p-1.5 text-muted hover:text-text disabled:opacity-30" onClick={() => moveStep(1)}><ChevronDown className="h-4 w-4" /></button>
                                                    <button type="button" aria-label="Delete step" className="p-1.5 text-muted hover:text-red-300" onClick={() => setPipelineDraft({ ...pipelineDraft, steps: pipelineDraft.steps.filter((_, currentIndex) => currentIndex !== index) })}><Trash2 className="h-4 w-4" /></button>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                <CustomSelect
                                                    value={step.type}
                                                    onChange={(type) => updateStep({ type: type as MediaAutomationStep['type'] })}
                                                    options={[
                                                        { value: 'transcode', label: 'Transcode' },
                                                        { value: 'remux', label: 'Remux' },
                                                        { value: 'subtitle-strip', label: 'Strip subtitles' },
                                                        { value: 'subtitle-extract', label: 'Extract subtitle (SRT)' },
                                                        { value: 'subtitle-keep-lang', label: 'Keep subtitle languages' },
                                                        { value: 'keep-first-audio', label: 'Keep first audio' },
                                                        { value: 'drop-commentary', label: 'Drop commentary audio' },
                                                        { value: 'audio-normalize', label: 'Audio loudnorm' },
                                                        { value: 'audio-stereo', label: 'Audio stereo downmix' },
                                                        { value: 'commercial-strip', label: 'Strip commercial chapters' },
                                                        { value: 'move', label: 'Move / rename' },
                                                        { value: 'custom-command', label: 'Custom command' },
                                                    ]}
                                                />
                                                {['transcode', 'remux', 'subtitle-strip', 'subtitle-keep-lang', 'keep-first-audio', 'drop-commentary', 'audio-normalize', 'audio-stereo', 'commercial-strip'].includes(step.type) && (
                                                    <input className={fieldClass} value={step.container || ''} onChange={(event) => updateStep({ container: event.target.value })} placeholder="Container (mkv)" />
                                                )}
                                                {step.type === 'transcode' && <>
                                                    <input className={fieldClass} value={step.videoCodec || ''} onChange={(event) => updateStep({ videoCodec: event.target.value })} placeholder="Video codec (hevc)" />
                                                    <input className={fieldClass} value={step.audioCodec || ''} onChange={(event) => updateStep({ audioCodec: event.target.value })} placeholder="Audio codec (copy)" />
                                                    <input className={fieldClass} value={step.subtitleCodec || ''} onChange={(event) => updateStep({ subtitleCodec: event.target.value })} placeholder="Subtitle codec (copy/drop)" />
                                                    <input className={fieldClass} value={step.preset || ''} onChange={(event) => updateStep({ preset: event.target.value })} placeholder="Speed preset (medium/slow/fast)" />
                                                    <input className={fieldClass} type="number" min={0} max={51} value={step.crf ?? ''} onChange={(event) => updateStep({ crf: event.target.value === '' ? undefined : Number(event.target.value) })} placeholder="Quality CRF/CQ (18 high · 23 bal · 28 saver)" />
                                                    <input className={fieldClass} type="number" min={32} max={1536} value={step.audioBitrateKbps || ''} onChange={(event) => updateStep({ audioBitrateKbps: event.target.value ? Number(event.target.value) : undefined })} placeholder="Audio bitrate kbps" />
                                                    <input className={fieldClass} type="number" min={2} value={step.maxWidth || ''} onChange={(event) => updateStep({ maxWidth: event.target.value ? Number(event.target.value) : undefined })} placeholder="Maximum width" />
                                                </>}
                                                {(step.type === 'audio-normalize' || step.type === 'audio-stereo') && (
                                                    <input className={fieldClass} type="number" min={32} max={1536} value={step.audioBitrateKbps || ''} onChange={(event) => updateStep({ audioBitrateKbps: event.target.value ? Number(event.target.value) : undefined })} placeholder="Audio bitrate kbps (AAC)" />
                                                )}
                                                {(step.type === 'subtitle-extract' || step.type === 'subtitle-keep-lang') && (
                                                    <input
                                                        className={`${fieldClass} sm:col-span-2`}
                                                        value={step.subtitleLanguages || ''}
                                                        onChange={(event) => updateStep({ subtitleLanguages: event.target.value })}
                                                        placeholder={step.type === 'subtitle-keep-lang' ? 'Languages to keep — eng,en' : 'Preferred languages (optional) — eng,en'}
                                                    />
                                                )}
                                                {step.type === 'keep-first-audio' && (
                                                    <label className="sm:col-span-2 flex items-center gap-2 text-sm text-text">
                                                        <input
                                                            type="checkbox"
                                                            checked={step.keepSubtitles !== false}
                                                            onChange={(event) => updateStep({ keepSubtitles: event.target.checked })}
                                                        />
                                                        Keep subtitle streams
                                                    </label>
                                                )}
                                                {step.type === 'commercial-strip' && (
                                                    <input
                                                        className={`${fieldClass} sm:col-span-2`}
                                                        value={step.commercialPattern || ''}
                                                        onChange={(event) => updateStep({ commercialPattern: event.target.value })}
                                                        placeholder="Chapter title regex — commercial|advert|ad\\s*break|promo"
                                                    />
                                                )}
                                                {step.type === 'move' && (
                                                    <input
                                                        className={`${fieldClass} sm:col-span-2`}
                                                        value={step.destination || ''}
                                                        onChange={(event) => updateStep({ destination: event.target.value })}
                                                        placeholder="Destination template — {dir}/archive/{basename}"
                                                    />
                                                )}
                                                {step.type === 'custom-command' && <>
                                                    <input className={fieldClass} value={step.executable || ''} onChange={(event) => updateStep({ executable: event.target.value })} placeholder="Executable (ffmpeg / ffprobe)" />
                                                    <input
                                                        className={`${fieldClass} sm:col-span-2`}
                                                        value={(step.args || []).join(' ')}
                                                        onChange={(event) => updateStep({
                                                            args: event.target.value.trim()
                                                                ? event.target.value.trim().split(/\s+/).slice(0, 64)
                                                                : [],
                                                        })}
                                                        placeholder="Args (space-separated) — -i {input} -c copy {output}"
                                                    />
                                                    <p className="sm:col-span-2 text-xs text-muted">No shell. Allowlist is under Settings → Media Automation. Placeholders: {'{input} {output} {dir} {name} {ext} {basename} {libraryRoot}'}</p>
                                                </>}
                                                {(step.type === 'move' || step.type === 'subtitle-extract' || step.type === 'commercial-strip') && (
                                                    <p className="sm:col-span-2 text-xs text-muted">
                                                        {step.type === 'move'
                                                            ? 'Move stays inside configured library roots (cross-device copy+delete if needed).'
                                                            : step.type === 'commercial-strip'
                                                                ? 'Requires chapter markers. Matching chapters are cut out with stream copy; files without matches are remuxed unchanged.'
                                                                : 'Extract writes an .srt beside the source and leaves the media file unchanged.'}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="rounded-xl border border-border bg-background/30 p-4 space-y-3">
                            <div>
                                <h3 className="font-bold text-text">Sample file</h3>
                                <p className="mt-1 text-xs text-muted">
                                    Saved with this pipeline for preview and one-click queueing. Browse uses container paths under your library mount.
                                </p>
                            </div>
                            <PathBrowserField
                                label="Sample file (saved)"
                                mode="file"
                                value={String(pipelineDraft.samplePath || '')}
                                onChange={(samplePath) => setPipelineDraft({ ...pipelineDraft, samplePath })}
                                placeholder="/media/Movies/example.mkv"
                                hint="Saved when you click Save above. Example: /media/Movies/Her Private Hell (2026)/….mkv — not /mnt/remotes/…"
                            />
                            <div className="flex flex-wrap gap-3">
                                <button type="button" className={buttonClass} disabled={previewBusy || !pipelineDraft.id || !String(pipelineDraft.samplePath || '').trim()} onClick={runPipelinePreview}>
                                    {previewBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Preview
                                </button>
                                <button
                                    type="button"
                                    className={buttonClass}
                                    disabled={previewBusy || busy !== null || !pipelineDraft.id || !String(pipelineDraft.samplePath || '').trim()}
                                    onClick={() => void queuePipelineSample(pipelineDraft, { dryRun: true })}
                                >
                                    {busy === `test-pipeline-${pipelineDraft.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Queue dry-run
                                </button>
                                <button
                                    type="button"
                                    className={primaryButtonClass}
                                    disabled={previewBusy || busy !== null || !pipelineDraft.id || !String(pipelineDraft.samplePath || '').trim()}
                                    onClick={() => void queuePipelineSample(pipelineDraft)}
                                >
                                    {busy === `queue-sample-${pipelineDraft.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Queue sample
                                </button>
                            </div>
                            {previewResult && (
                                <div className="rounded-lg bg-card/70 p-3 text-xs text-muted space-y-2">
                                    <p className="font-semibold text-text">{previewResult.matched ? 'Matched' : 'No match'}{previewResult.reason ? ` · ${previewResult.reason}` : ''}</p>
                                    {previewResult.probe && (
                                        <p>
                                            {asText(previewResult.probe.format)} · {asText(previewResult.probe.videoCodec)} / {asText(previewResult.probe.audioCodec)}
                                            {previewResult.probe.duration ? ` · ${previewResult.probe.duration}s` : ''}
                                        </p>
                                    )}
                                    {(previewResult.plans || []).map((plan, index) => (
                                        <div key={index} className="rounded-md border border-border/60 bg-background/40 p-2">
                                            <p className="font-semibold text-text">Step {index + 1}: {plan.mode || 'plan'}{plan.adapterLabel ? ` · ${plan.adapterLabel}` : ''}</p>
                                            <p className="mt-1 break-all font-mono text-[11px] text-muted">{(plan.args || []).join(' ')}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </EditorShell>
                )}
            </ModalPortal>
        </div>
    );
};
