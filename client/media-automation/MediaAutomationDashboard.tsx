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
    Gauge,
    Layers3,
    ListRestart,
    Loader2,
    Pencil,
    Play,
    Plus,
    RefreshCw,
    RotateCcw,
    Save,
    ServerCog,
    Square,
    Trash2,
    X,
} from 'lucide-react';
import { CustomSelect, SettingsSwitch } from '../shared/ui';
import { ModalPortal } from '../shared/ModalPortal';
import { ToastContainer, pushToast, type ToastMessage } from '../shared/toast';
import { mediaAutomationApi } from './api';
import {
    emptyLibrary,
    emptyPipeline,
    type HardwareMode,
    type MediaAutomationActivity,
    type MediaAutomationCapabilities,
    type MediaAutomationJob,
    type MediaAutomationLibrary,
    type MediaAutomationPipeline,
    type MediaAutomationPipelinePreview,
    type MediaAutomationRuleCondition,
    type MediaAutomationRules,
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

const jobErrorText = (error: MediaAutomationJob['error']) => {
    if (!error) return '';
    if (typeof error === 'string') return error;
    return error.message || error.code || '';
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
    const [previewPath, setPreviewPath] = useState('');
    const [previewResult, setPreviewResult] = useState<MediaAutomationPipelinePreview | null>(null);
    const [previewBusy, setPreviewBusy] = useState(false);
    const [savingEditor, setSavingEditor] = useState(false);

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
            const value = String(job.state || job.status || '').toLowerCase();
            if (['running', 'processing', 'active'].includes(value)) counts.active += 1;
            else if (['completed', 'succeeded', 'success', 'done'].includes(value)) counts.completed += 1;
            else if (['failed', 'error', 'cancelled', 'canceled'].includes(value)) counts.failed += 1;
            else counts.queued += 1;
        });
        return counts;
    }, [jobs]);

    const runPipelinePreview = async () => {
        if (!pipelineDraft?.id || !previewPath.trim()) {
            toast('Save the pipeline first, then provide a test file path.', 'error');
            return;
        }
        setPreviewBusy(true);
        setPreviewResult(null);
        try {
            const result = await mediaAutomationApi.previewPipeline(pipelineDraft.id, previewPath.trim());
            setPreviewResult(result);
            toast(result.matched ? 'Pipeline matched the test file.' : 'Pipeline did not match the test file.');
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Pipeline preview failed', 'error');
        } finally {
            setPreviewBusy(false);
        }
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
                            <button type="button" className={`${buttonClass} mt-3 w-full`} disabled={busy !== null} onClick={() => runAction('worker-test', mediaAutomationApi.testWorker, 'Worker test completed.')}>
                                {busy === 'worker-test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Test worker
                            </button>
                            <dl className="mt-5 grid grid-cols-1 gap-3 border-t border-border/60 pt-5 text-sm sm:grid-cols-2">
                                <div><dt className="text-muted">Last heartbeat</dt><dd className="mt-1 font-semibold text-text">{formatTime(status.lastHeartbeat)}</dd></div>
                                <div><dt className="text-muted">Started</dt><dd className="mt-1 font-semibold text-text">{formatTime(status.startedAt)}</dd></div>
                                <div><dt className="text-muted">Worker version</dt><dd className="mt-1 font-semibold text-text">{asText(status.version)}</dd></div>
                                <div><dt className="text-muted">Configured libraries</dt><dd className="mt-1 font-semibold text-text">{libraries.length}</dd></div>
                            </dl>
                        </section>
                        <section className={`${cardClass} p-5`}>
                            <h2 className="mb-5 font-bold text-text">Capabilities</h2>
                            <div className="space-y-3 text-sm">
                                <div className="flex items-center justify-between rounded-lg bg-background/40 p-3"><span className="text-muted">FFmpeg</span><span className="font-bold text-text">{typeof capabilities.ffmpeg === 'object' ? (capabilities.ffmpeg.available === false ? 'Unavailable' : capabilities.ffmpeg.version || 'Available') : capabilities.ffmpeg ? 'Available' : 'Unknown'}</span></div>
                                <div className="flex items-center justify-between rounded-lg bg-background/40 p-3"><span className="text-muted">FFprobe</span><span className="font-bold text-text">{typeof capabilities.ffprobe === 'object' ? (capabilities.ffprobe.available === false ? 'Unavailable' : capabilities.ffprobe.version || 'Available') : capabilities.ffprobe ? 'Available' : 'Unknown'}</span></div>
                                <div className="rounded-lg bg-background/40 p-3"><p className="text-muted">Hardware</p><p className="mt-2 font-semibold text-text">{capabilities.hardware?.length ? capabilities.hardware.join(', ') : 'No hardware data reported'}</p></div>
                                <div className="rounded-lg bg-background/40 p-3"><p className="text-muted">Encoders</p><p className="mt-2 line-clamp-3 font-semibold text-text">{capabilities.encoders?.length ? capabilities.encoders.join(', ') : 'No encoder data reported'}</p></div>
                            </div>
                        </section>
                    </div>
                </div>
            )}

            {tab === 'queue' && (
                <div className="space-y-5">
                    <section className={`${cardClass} p-5`}>
                        <h2 className="mb-4 font-bold text-text">Enqueue a path</h2>
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_18rem_auto]">
                            <input className={fieldClass} value={enqueuePath} onChange={(event) => setEnqueuePath(event.target.value)} placeholder="/media/movies/example.mkv" />
                            <CustomSelect value={enqueuePipelineId} onChange={setEnqueuePipelineId} options={[{ value: '', label: 'Automatic pipeline' }, ...pipelines.map((pipeline) => ({ value: String(pipeline.id ?? ''), label: pipeline.name }))]} />
                            <button type="button" className={primaryButtonClass} disabled={!enqueuePath.trim() || busy !== null} onClick={() => runAction('enqueue', () => mediaAutomationApi.enqueue(enqueuePath.trim(), enqueuePipelineId || undefined), 'Path added to queue.').then(() => setEnqueuePath(''))}>
                                {busy === 'enqueue' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Enqueue
                            </button>
                        </div>
                    </section>
                    {jobs.length === 0 ? <EmptyState icon={ListRestart} title="Queue is empty" detail="Enqueue a path above or wait for a configured library watcher to discover media." /> : (
                        <div className="space-y-3">
                            {jobs.map((job) => {
                                const jobId = job.id;
                                const state = String(job.state || job.status || '').toLowerCase();
                                const jobState = job.phase || job.state || job.status;
                                const percent = jobProgressPercent(job);
                                const errorText = jobErrorText(job.error);
                                const canCancel = !['completed', 'succeeded', 'failed', 'cancelled', 'canceled', 'success'].includes(state);
                                const canRetry = ['failed', 'cancelled', 'canceled', 'error'].includes(state);
                                return (
                                    <article key={String(jobId)} className={`${cardClass} p-4`}>
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2"><StatusPill value={jobState} /><span className="text-xs text-muted">#{jobId}</span>{percent != null && <span className="text-xs text-muted">{Math.round(percent)}%</span>}</div>
                                                <p className="mt-2 truncate font-semibold text-text">{job.path || job.sourcePath || 'Path not reported'}</p>
                                                <p className="mt-1 text-xs text-muted">{job.pipelineName || (job.pipelineId ? `Pipeline ${job.pipelineId}` : 'Automatic pipeline')} · {formatTime(job.createdAt)}</p>
                                                {errorText && <p className="mt-2 text-xs text-red-300">{errorText}</p>}
                                            </div>
                                            <div className="flex shrink-0 gap-2">
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
                    <div className="flex justify-end"><button type="button" className={primaryButtonClass} onClick={() => { setPreviewPath(''); setPreviewResult(null); setPipelineDraft(emptyPipeline()); }}><Plus className="h-4 w-4" /> New pipeline</button></div>
                    {pipelines.length === 0 ? <EmptyState icon={Layers3} title="No pipelines configured" detail="Create a pipeline to define matching rules and transcode or remux behavior." /> : (
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            {pipelines.map((pipeline) => (
                                <article key={String(pipeline.id ?? pipeline.name)} className={`${cardClass} p-5`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div><div className="flex items-center gap-2"><h3 className="font-bold text-text">{pipeline.name}</h3><StatusPill value={pipeline.enabled ? 'enabled' : 'disabled'} /></div><p className="mt-2 text-xs text-muted">Priority {pipeline.priority ?? 50} · {pipeline.outputMode || 'dry-run'} · {pipeline.hardware || 'auto'}</p></div>
                                        <div className="flex gap-1">
                                            <button type="button" className={buttonClass} onClick={() => { setPreviewPath(''); setPreviewResult(null); setPipelineDraft({ ...emptyPipeline(), ...pipeline, rules: normalizeRules(pipeline.rules), steps: Array.isArray(pipeline.steps) ? pipeline.steps : [] }); }}><Pencil className="h-4 w-4" /></button>
                                            <button type="button" className={buttonClass} disabled={pipeline.id === undefined || busy !== null} onClick={() => { if (pipeline.id !== undefined && window.confirm(`Delete pipeline "${pipeline.name}"?`)) runAction(`delete-pipeline-${pipeline.id}`, () => mediaAutomationApi.deletePipeline(pipeline.id!), 'Pipeline deleted.'); }}><Trash2 className="h-4 w-4 text-red-300" /></button>
                                        </div>
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-2">{(pipeline.steps || []).map((step, index) => <span key={`${step.type}-${index}`} className="rounded-md border border-border bg-background/40 px-2 py-1 text-xs font-semibold text-muted">{index + 1}. {step.type}{step.videoCodec ? ` · ${step.videoCodec}` : ''}</span>)}</div>
                                    <p className="mt-4 rounded-lg bg-background/40 p-3 text-xs text-muted">
                                        {normalizeRules(pipeline.rules).conditions.length} rule condition{normalizeRules(pipeline.rules).conditions.length === 1 ? '' : 's'} joined with {normalizeRules(pipeline.rules).operator}
                                    </p>
                                </article>
                            ))}
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
                activity.length === 0 ? <EmptyState icon={Activity} title="No activity recorded" detail="Worker, queue, and configuration events will appear here." /> : (
                    <div className={`${cardClass} divide-y divide-border/60 overflow-hidden`}>
                        {activity.map((entry, index) => (
                            <div key={String(entry.id ?? index)} className="flex gap-3 p-4">
                                <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${statusTone(entry.status).includes('red') ? 'bg-red-400' : statusTone(entry.status).includes('green') ? 'bg-green-400' : 'bg-plex'}`} />
                                <div className="min-w-0 flex-1"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><p className="font-semibold text-text">{entry.message || entry.action || entry.type || 'Automation event'}</p><time className="text-xs text-muted">{formatTime(entry.createdAt || entry.timestamp)}</time></div><p className="mt-1 text-xs text-muted">{entry.type || entry.action || 'activity'}{entry.jobId !== undefined ? ` · Job #${entry.jobId}` : ''}</p></div>
                            </div>
                        ))}
                    </div>
                )
            )}

            <ModalPortal open={libraryDraft !== null}>
                {libraryDraft && (
                    <EditorShell title={libraryDraft.id === undefined ? 'New library' : 'Edit library'} onClose={() => setLibraryDraft(null)} onSave={saveLibrary} saving={savingEditor}>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <label className="space-y-2 text-sm font-semibold text-text">Name<input className={fieldClass} value={libraryDraft.name} onChange={(event) => setLibraryDraft({ ...libraryDraft, name: event.target.value })} placeholder="Movies" /></label>
                            <div className="flex items-end pb-2"><label className="flex items-center gap-3 text-sm font-semibold text-text"><SettingsSwitch checked={libraryDraft.enabled !== false} onChange={(enabled) => setLibraryDraft({ ...libraryDraft, enabled })} /> Enabled</label></div>
                        </div>
                        <label className="block space-y-2 text-sm font-semibold text-text">Root path<input className={fieldClass} value={libraryDraft.rootPath} onChange={(event) => setLibraryDraft({ ...libraryDraft, rootPath: event.target.value })} placeholder="/media/movies" /></label>
                        <label className="block space-y-2 text-sm font-semibold text-text">Assigned pipeline
                            <CustomSelect
                                value={String(libraryDraft.pipelineId ?? '')}
                                onChange={(pipelineId) => setLibraryDraft({ ...libraryDraft, pipelineId })}
                                options={[{ value: '', label: 'Automatic / first matching pipeline' }, ...pipelines.map((pipeline) => ({ value: String(pipeline.id ?? ''), label: pipeline.name }))]}
                            />
                        </label>
                        <label className="block space-y-2 text-sm font-semibold text-text">Output path<input className={fieldClass} value={libraryDraft.outputPath} onChange={(event) => setLibraryDraft({ ...libraryDraft, outputPath: event.target.value })} placeholder="/media/processed (optional)" /></label>
                        <label className="block space-y-2 text-sm font-semibold text-text">Quarantine path<input className={fieldClass} value={libraryDraft.quarantinePath} onChange={(event) => setLibraryDraft({ ...libraryDraft, quarantinePath: event.target.value })} placeholder="/media/quarantine (optional)" /></label>
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
                        {pipelineDraft.outputMode === 'replace' && (
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                                Replace mode atomically promotes verified output over the source. Keep dry-run or copy until path mounts, PUID/PGID, and GPU adapters are validated.
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
                                                <CustomSelect value={step.type} onChange={(type) => updateStep({ type: type as MediaAutomationStep['type'] })} options={[{ value: 'transcode', label: 'Transcode' }, { value: 'remux', label: 'Remux' }]} />
                                                <input className={fieldClass} value={step.container || ''} onChange={(event) => updateStep({ container: event.target.value })} placeholder="Container (mkv)" />
                                                {step.type === 'transcode' && <>
                                                    <input className={fieldClass} value={step.videoCodec || ''} onChange={(event) => updateStep({ videoCodec: event.target.value })} placeholder="Video codec (hevc)" />
                                                    <input className={fieldClass} value={step.audioCodec || ''} onChange={(event) => updateStep({ audioCodec: event.target.value })} placeholder="Audio codec (copy)" />
                                                    <input className={fieldClass} value={step.subtitleCodec || ''} onChange={(event) => updateStep({ subtitleCodec: event.target.value })} placeholder="Subtitle codec (copy/drop)" />
                                                    <input className={fieldClass} value={step.preset || ''} onChange={(event) => updateStep({ preset: event.target.value })} placeholder="Preset (medium)" />
                                                    <input className={fieldClass} type="number" min={32} max={1536} value={step.audioBitrateKbps || ''} onChange={(event) => updateStep({ audioBitrateKbps: event.target.value ? Number(event.target.value) : undefined })} placeholder="Audio bitrate kbps" />
                                                    <input className={fieldClass} type="number" min={2} value={step.maxWidth || ''} onChange={(event) => updateStep({ maxWidth: event.target.value ? Number(event.target.value) : undefined })} placeholder="Maximum width" />
                                                </>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="rounded-xl border border-border bg-background/30 p-4 space-y-3">
                            <div>
                                <h3 className="font-bold text-text">Rule preview</h3>
                                <p className="mt-1 text-xs text-muted">Probe a file and preview the planned FFmpeg steps without replacing media. Save the pipeline before previewing.</p>
                            </div>
                            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
                                <input className={fieldClass} value={previewPath} onChange={(event) => setPreviewPath(event.target.value)} placeholder="/media/movies/example.mkv" />
                                <button type="button" className={buttonClass} disabled={previewBusy || !pipelineDraft.id} onClick={runPipelinePreview}>
                                    {previewBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Preview
                                </button>
                                <button
                                    type="button"
                                    className={buttonClass}
                                    disabled={previewBusy || busy !== null || !pipelineDraft.id || !previewPath.trim()}
                                    onClick={() => runAction(`test-pipeline-${pipelineDraft.id}`, () => mediaAutomationApi.testPipeline(pipelineDraft.id!, previewPath.trim()), 'Dry-run job queued.')}
                                >
                                    {busy === `test-pipeline-${pipelineDraft.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Queue dry-run
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
