import React, { useCallback, useEffect, useState } from 'react';
import {
    CheckCircle2,
    Download,
    History,
    Image as ImageIcon,
    Loader2,
    RefreshCw,
    Save,
    Settings2,
    Sparkles,
} from 'lucide-react';
import { ToastContainer, pushToast, type ToastMessage } from '../shared/toast';
import { posterSetsApi } from './api';
import {
    DEFAULT_POSTER_SETS_CONFIG,
    MEDIUX_FILTER_OPTIONS,
    type PosterSetsConfig,
    type PosterSetsJob,
    type PosterSetsPreview,
    type PosterSetsStatus,
} from './types';

const cardClass = 'glass-card shadow-xl';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-text transition hover:border-plex/40 hover:bg-white/5 disabled:pointer-events-none disabled:opacity-40';
const primaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-plex px-3 py-2 text-sm font-bold text-background transition hover:bg-plex-hover active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40';
const fieldClass = 'w-full rounded-lg border border-white/10 bg-background/70 px-3 py-2.5 text-sm text-text placeholder:text-muted/60 outline-none transition focus:border-plex focus:ring-1 focus:ring-plex';

type TabId = 'apply' | 'history' | 'settings';
type HistoryFilter = 'all' | 'running' | 'succeeded' | 'failed';

const listToText = (value: string[] | undefined) => (Array.isArray(value) ? value.join('\n') : '');
const textToList = (value: string) => value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);

const formatTime = (value?: string | null) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const statusTone = (value?: string | null) => {
    const state = String(value || '').toLowerCase();
    if (['succeeded', 'completed', 'success', 'ready', 'connected'].includes(state)) {
        return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200';
    }
    if (['failed', 'error', 'missing'].includes(state)) {
        return 'border-red-500/40 bg-red-500/15 text-red-200';
    }
    if (['running', 'queued', 'setup'].includes(state)) {
        return 'border-plex/40 bg-plex/15 text-plex';
    }
    return 'border-white/10 bg-white/5 text-muted';
};

const jobCardTone = (job: PosterSetsJob) => {
    const state = String(job.state || '').toLowerCase();
    if (['failed', 'error'].includes(state)) return 'border-l-2 border-l-red-400/70 bg-red-500/[0.05]';
    if (['succeeded', 'completed', 'success'].includes(state)) return 'border-l-2 border-l-emerald-400/80 bg-emerald-500/[0.06]';
    if (['running', 'queued'].includes(state)) return 'border-l-2 border-l-plex/70 bg-plex/[0.06]';
    return '';
};

const jobTitle = (job: PosterSetsJob) => {
    const input = job.input;
    if (input?.url) return input.url;
    if (input?.fromFile) {
        return `Bulk file · ${input.file || 'bulk_import.txt'}${typeof input.lineCount === 'number' ? ` (${input.lineCount})` : ''}`;
    }
    if (typeof input?.count === 'number') return `Bulk list · ${input.count} URL${input.count === 1 ? '' : 's'}`;
    if (input?.urls?.length) return input.urls[0];
    return `${job.type || 'job'} · #${job.id.slice(0, 8)}`;
};

const jobLogLines = (job: PosterSetsJob | null) => (
    (job?.logs || []).map((entry) => (typeof entry === 'string' ? entry : String(entry.message || ''))).filter(Boolean)
);

const StatusPill: React.FC<{ value?: string | null; className?: string }> = ({ value, className = '' }) => {
    const label = value || 'unknown';
    const done = ['succeeded', 'completed', 'success', 'ready', 'connected'].includes(String(label).toLowerCase());
    return (
        <span className={`inline-flex max-w-full items-center gap-1 truncate rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide sm:px-2.5 sm:py-1 sm:text-[11px] ${statusTone(value)} ${className}`}>
            {done ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : null}
            <span className="truncate">{label}</span>
        </span>
    );
};

export const PosterSetsDashboard: React.FC = () => {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const toast = useCallback((message: string, type: ToastMessage['type'] = 'success') => {
        setToasts((current) => pushToast(current, message, type));
    }, []);

    const [tab, setTab] = useState<TabId>('apply');
    const [busy, setBusy] = useState<string | null>(null);
    const [status, setStatus] = useState<PosterSetsStatus | null>(null);
    const [configDraft, setConfigDraft] = useState<PosterSetsConfig>(DEFAULT_POSTER_SETS_CONFIG);
    const [tvText, setTvText] = useState(listToText(DEFAULT_POSTER_SETS_CONFIG.tv_library));
    const [movieText, setMovieText] = useState(listToText(DEFAULT_POSTER_SETS_CONFIG.movie_library));
    const [url, setUrl] = useState('');
    const [bulkText, setBulkText] = useState('');
    const [preview, setPreview] = useState<PosterSetsPreview | null>(null);
    const [activeJob, setActiveJob] = useState<PosterSetsJob | null>(null);
    const [testResult, setTestResult] = useState<string | null>(null);
    const [historyJobs, setHistoryJobs] = useState<PosterSetsJob[]>([]);
    const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
    const [historySearch, setHistorySearch] = useState('');
    const [selectedHistoryJob, setSelectedHistoryJob] = useState<PosterSetsJob | null>(null);

    const loadHistory = useCallback(async () => {
        try {
            const response = await posterSetsApi.jobs();
            setHistoryJobs(response.jobs || []);
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to load job history', 'error');
        }
    }, [toast]);

    const load = useCallback(async () => {
        try {
            const [nextStatus, configResponse] = await Promise.all([
                posterSetsApi.status(),
                posterSetsApi.getConfig(),
            ]);
            setStatus(nextStatus);
            const cfg = configResponse.config || DEFAULT_POSTER_SETS_CONFIG;
            setConfigDraft({
                ...DEFAULT_POSTER_SETS_CONFIG,
                ...cfg,
                token: cfg.hasToken ? '********' : '',
            });
            setTvText(listToText(cfg.tv_library));
            setMovieText(listToText(cfg.movie_library));
            await loadHistory();
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to load Poster Sets', 'error');
        }
    }, [loadHistory, toast]);

    useEffect(() => { void load(); }, [load]);

    useEffect(() => {
        if (!activeJob?.id || !['running', 'queued'].includes(String(activeJob.state || ''))) return undefined;
        const timer = window.setInterval(async () => {
            try {
                const response = await posterSetsApi.job(activeJob.id);
                setActiveJob(response.job);
                if (response.job.state && response.job.state !== 'running') {
                    await load();
                }
            } catch {
                // keep polling until terminal or user leaves
            }
        }, 1500);
        return () => window.clearInterval(timer);
    }, [activeJob?.id, activeJob?.state, load]);

    useEffect(() => {
        if (tab !== 'history') return undefined;
        const hasRunning = historyJobs.some((job) => ['running', 'queued'].includes(String(job.state || '')))
            || ['running', 'queued'].includes(String(selectedHistoryJob?.state || ''));
        if (!hasRunning) return undefined;
        const timer = window.setInterval(async () => {
            try {
                await loadHistory();
                if (selectedHistoryJob?.id) {
                    const response = await posterSetsApi.job(selectedHistoryJob.id);
                    setSelectedHistoryJob(response.job);
                }
            } catch {
                // ignore transient poll errors
            }
        }, 2000);
        return () => window.clearInterval(timer);
    }, [tab, historyJobs, selectedHistoryJob?.id, selectedHistoryJob?.state, loadHistory]);

    const openHistoryJob = async (jobId: string) => {
        try {
            const response = await posterSetsApi.job(jobId);
            setSelectedHistoryJob(response.job);
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to open job', 'error');
        }
    };

    const saveSettings = async () => {
        setBusy('save');
        try {
            const payload = {
                ...configDraft,
                tv_library: textToList(tvText),
                movie_library: textToList(movieText),
            };
            const response = await posterSetsApi.saveConfig(payload);
            setConfigDraft({
                ...response.config,
                token: response.config.hasToken ? '********' : '',
            });
            setTvText(listToText(response.config.tv_library));
            setMovieText(listToText(response.config.movie_library));
            toast('Poster Sets settings saved.');
            await load();
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to save settings', 'error');
        } finally {
            setBusy(null);
        }
    };

    const importFromPortal = async () => {
        setBusy('import');
        setTestResult(null);
        try {
            const response = await posterSetsApi.importPortal();
            const cfg = response.config;
            setConfigDraft({
                ...DEFAULT_POSTER_SETS_CONFIG,
                ...cfg,
                token: cfg.hasToken ? '********' : '',
            });
            setTvText(listToText(cfg.tv_library));
            setMovieText(listToText(cfg.movie_library));
            const tvCount = response.imported?.tv_library?.length || 0;
            const movieCount = response.imported?.movie_library?.length || 0;
            toast(`Imported from Media Player (${tvCount} TV, ${movieCount} movie libraries).`);
            await load();
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Import failed', 'error');
        } finally {
            setBusy(null);
        }
    };

    const runTest = async () => {
        setBusy('test');
        setTestResult(null);
        try {
            const response = await posterSetsApi.test({
                ...configDraft,
                tv_library: textToList(tvText),
                movie_library: textToList(movieText),
                token: configDraft.token === '********' ? undefined : configDraft.token,
            });
            const libraries = [
                ...(response.tvLibraries || []).map((name) => `TV: ${name}`),
                ...(response.movieLibraries || []).map((name) => `Movie: ${name}`),
            ];
            const message = response.ok
                ? `Connected${response.server ? ` to ${response.server}` : ''}. ${libraries.join(' · ') || 'No matched libraries.'}`
                : (response.error || 'Connection test failed');
            setTestResult(message);
            toast(message, response.ok ? 'success' : 'error');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Connection test failed';
            setTestResult(message);
            toast(message, 'error');
        } finally {
            setBusy(null);
        }
    };

    const runPreview = async () => {
        const target = url.trim();
        if (!target) {
            toast('Paste a MediUX or ThePosterDB set URL first.', 'error');
            return;
        }
        setBusy('preview');
        setPreview(null);
        try {
            const response = await posterSetsApi.preview(target);
            setPreview(response);
            toast(`Preview ready: ${response.total || 0} assets.`);
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Preview failed', 'error');
        } finally {
            setBusy(null);
        }
    };

    const runApply = async () => {
        const target = url.trim();
        if (!target) {
            toast('Paste a MediUX or ThePosterDB set URL first.', 'error');
            return;
        }
        setBusy('apply');
        try {
            const response = await posterSetsApi.apply(target);
            setActiveJob(response.job);
            toast('Apply started.');
            await loadHistory();
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Apply failed', 'error');
        } finally {
            setBusy(null);
        }
    };

    const runBulk = async (fromFile = false) => {
        setBusy(fromFile ? 'bulk-file' : 'bulk');
        try {
            const response = fromFile
                ? await posterSetsApi.bulk({ fromFile: true })
                : await posterSetsApi.bulk({ text: bulkText });
            setActiveJob(response.job);
            toast(fromFile ? 'Bulk file apply started.' : 'Bulk apply started.');
            await loadHistory();
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Bulk apply failed', 'error');
        } finally {
            setBusy(null);
        }
    };

    const toggleFilter = (id: string) => {
        setConfigDraft((prev) => {
            const set = new Set(prev.mediux_filters || []);
            if (set.has(id)) set.delete(id);
            else set.add(id);
            return { ...prev, mediux_filters: [...set] };
        });
    };

    const jobLogs = jobLogLines(activeJob);
    const selectedLogs = jobLogLines(selectedHistoryJob);

    const filteredHistory = historyJobs.filter((job) => {
        const state = String(job.state || '').toLowerCase();
        if (historyFilter === 'running') return ['running', 'queued'].includes(state);
        if (historyFilter === 'succeeded') return ['succeeded', 'completed', 'success'].includes(state);
        if (historyFilter === 'failed') return ['failed', 'error'].includes(state);
        return true;
    }).filter((job) => {
        if (!historySearch.trim()) return true;
        const needle = historySearch.toLowerCase();
        const haystack = [
            job.id,
            job.type,
            job.state,
            job.error,
            jobTitle(job),
            ...(job.input?.urls || []),
        ].join(' ').toLowerCase();
        return haystack.includes(needle);
    });

    return (
        <div className="flex w-full animate-fade-in flex-col gap-6 pb-10">
            <ToastContainer toasts={toasts} setToasts={setToasts} />

            <header className={`${cardClass} overflow-hidden p-6`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-plex">Poster Sets</p>
                        <h1 className="mt-2 text-3xl font-bold tracking-tight text-text">Artwork from MediUX & ThePosterDB</h1>
                        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                            Paste a set URL, preview matched assets, then apply posters to your Plex libraries.
                            Connection settings live in this section.
                        </p>
                    </div>
                    <button type="button" className={buttonClass} onClick={() => void load()} disabled={busy !== null}>
                        <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> Refresh
                    </button>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                    {([
                        {
                            label: 'Worker',
                            value: status?.workerReady ? 'Ready' : 'Missing',
                        },
                        {
                            label: 'Config',
                            value: status?.configured ? 'Connected' : 'Setup',
                        },
                        {
                            label: 'Last job',
                            value: status?.recentJobs?.[0]?.state || 'None',
                            title: status?.recentJobs?.[0]
                                ? `${status.recentJobs[0].type || 'job'} · ${status.recentJobs[0].state}`
                                : 'No jobs yet',
                        },
                    ] as const).map((item) => (
                        <div
                            key={item.label}
                            className="flex min-w-0 flex-col items-start gap-1.5 rounded-xl border border-white/10 bg-black/20 px-2.5 py-2.5 sm:px-3"
                            title={'title' in item ? item.title : undefined}
                        >
                            <p className="text-[10px] font-bold uppercase tracking-wide text-muted sm:text-[11px]">{item.label}</p>
                            <StatusPill value={item.value} />
                        </div>
                    ))}
                </div>
            </header>

            <div className="flex flex-wrap gap-2">
                {([
                    ['apply', 'Apply', Sparkles],
                    ['history', 'History', History],
                    ['settings', 'Settings', Settings2],
                ] as const).map(([id, label, Icon]) => (
                    <button
                        key={id}
                        type="button"
                        className={`${tab === id ? primaryButtonClass : buttonClass}`}
                        onClick={() => {
                            setTab(id);
                            if (id === 'history') void loadHistory();
                        }}
                    >
                        <Icon className="h-4 w-4" /> {label}
                    </button>
                ))}
            </div>

            {tab === 'apply' ? (
                <div className="space-y-4">
                    <section className={`${cardClass} space-y-4 p-5`}>
                        <div>
                            <label className="text-xs font-bold uppercase tracking-wide text-muted">Set URL</label>
                            <input
                                className={`${fieldClass} mt-2`}
                                placeholder="https://mediux.pro/sets/… or https://theposterdb.com/set/…"
                                value={url}
                                onChange={(event) => setUrl(event.target.value)}
                            />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => void runPreview()}>
                                {busy === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                                Preview
                            </button>
                            <button type="button" className={primaryButtonClass} disabled={busy !== null} onClick={() => void runApply()}>
                                {busy === 'apply' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                Apply to Plex
                            </button>
                        </div>
                        {preview ? (
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-muted">
                                <p className="font-semibold text-text">
                                    {preview.total || 0} assets · {preview.movies || 0} movies · {preview.shows || 0} show items · {preview.collections || 0} collections
                                </p>
                                {preview.samples?.movies?.length ? (
                                    <p className="mt-2">Movies: {preview.samples.movies.join(', ')}</p>
                                ) : null}
                                {preview.samples?.shows?.length ? (
                                    <p className="mt-1">Shows: {[...new Set(preview.samples.shows)].join(', ')}</p>
                                ) : null}
                            </div>
                        ) : null}
                    </section>

                    {activeJob ? (
                        <section className={`${cardClass} space-y-3 p-5`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h2 className="text-lg font-bold text-text">Job #{activeJob.id.slice(0, 8)}</h2>
                                <StatusPill value={activeJob.state} />
                            </div>
                            {activeJob.error ? <p className="text-sm text-red-300">{activeJob.error}</p> : null}
                            {activeJob.result && typeof activeJob.result.uploaded === 'number' ? (
                                <p className="text-sm text-emerald-300">
                                    Uploaded {String(activeJob.result.uploaded)} / {String(activeJob.result.attempted ?? activeJob.result.uploaded)}
                                </p>
                            ) : null}
                            <div className="max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-[11px] text-muted custom-scrollbar">
                                {jobLogs.length ? jobLogs.map((line, index) => (
                                    <p key={`${index}-${line.slice(0, 24)}`}>{line}</p>
                                )) : (
                                    <p>Waiting for progress…</p>
                                )}
                            </div>
                        </section>
                    ) : null}

                    <section className={`${cardClass} space-y-4 p-5`}>
                        <div>
                            <h2 className="text-lg font-bold text-text">Bulk import</h2>
                            <p className="mt-1 text-sm text-muted">One URL per line. Lines starting with # or // are ignored.</p>
                        </div>
                        <textarea
                            className={`${fieldClass} min-h-36 font-mono text-xs`}
                            value={bulkText}
                            onChange={(event) => setBulkText(event.target.value)}
                            placeholder={'https://mediux.pro/sets/123\nhttps://theposterdb.com/set/456'}
                        />
                        <div className="flex flex-wrap gap-2">
                            <button type="button" className={primaryButtonClass} disabled={busy !== null || !bulkText.trim()} onClick={() => void runBulk(false)}>
                                {busy === 'bulk' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                Apply bulk list
                            </button>
                            <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => void runBulk(true)}>
                                {busy === 'bulk-file' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                Apply from {configDraft.bulk_txt || 'bulk_import.txt'}
                            </button>
                        </div>
                    </section>
                </div>
            ) : null}

            {tab === 'history' ? (
                <div className="space-y-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-text">Job history</h2>
                            <p className="mt-1 text-sm text-muted">
                                Apply and bulk runs with logs. Recent jobs survive restarts.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {([
                                ['all', 'All'],
                                ['running', 'Running'],
                                ['succeeded', 'Succeeded'],
                                ['failed', 'Failed'],
                            ] as const).map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    className={`${buttonClass} ${historyFilter === value ? 'border-plex/40 bg-plex/15 text-plex' : ''}`}
                                    onClick={() => setHistoryFilter(value)}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <input
                        className={fieldClass}
                        value={historySearch}
                        onChange={(event) => setHistorySearch(event.target.value)}
                        placeholder="Search URL, job id, type…"
                    />

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                        <div className="space-y-2">
                            {filteredHistory.map((job) => {
                                const selected = selectedHistoryJob?.id === job.id;
                                const uploaded = job.uploaded ?? (typeof job.result?.uploaded === 'number' ? job.result.uploaded : null);
                                const attempted = job.attempted ?? (typeof job.result?.attempted === 'number' ? job.result.attempted : null);
                                return (
                                    <article
                                        key={job.id}
                                        className={`${cardClass} cursor-pointer space-y-2 p-4 transition hover:border-plex/40 ${selected ? 'border-plex/50' : ''} ${jobCardTone(job)}`}
                                        onClick={() => void openHistoryJob(job.id)}
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate font-semibold text-text" title={jobTitle(job)}>
                                                    {jobTitle(job)}
                                                </p>
                                                <p className="mt-1 font-mono text-xs text-muted">
                                                    #{job.id.slice(0, 8)} · {job.type || 'job'}
                                                </p>
                                            </div>
                                            <div className="flex shrink-0 flex-col items-end gap-1">
                                                <StatusPill value={job.state} />
                                                <time className="text-xs text-muted" dateTime={job.finishedAt || job.createdAt || undefined}>
                                                    {formatTime(job.finishedAt || job.createdAt)}
                                                </time>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2 text-[11px] text-muted">
                                            {typeof uploaded === 'number' ? (
                                                <span className="text-emerald-300">
                                                    Uploaded {uploaded}{typeof attempted === 'number' ? ` / ${attempted}` : ''}
                                                </span>
                                            ) : null}
                                            {typeof job.logCount === 'number' ? <span>{job.logCount} log lines</span> : null}
                                            {job.error ? <span className="text-red-300">{job.error}</span> : null}
                                        </div>
                                    </article>
                                );
                            })}
                            {!filteredHistory.length ? (
                                <p className={`${cardClass} p-5 text-sm text-muted`}>
                                    No jobs yet. Apply a set and finished runs will show up here.
                                </p>
                            ) : null}
                        </div>

                        <section className={`${cardClass} space-y-3 p-5`}>
                            {selectedHistoryJob ? (
                                <>
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <h3 className="text-lg font-bold text-text">Job detail</h3>
                                            <p className="mt-1 truncate text-sm text-muted" title={jobTitle(selectedHistoryJob)}>
                                                {jobTitle(selectedHistoryJob)}
                                            </p>
                                        </div>
                                        <StatusPill value={selectedHistoryJob.state} />
                                    </div>
                                    <div className="flex flex-wrap gap-3 text-xs text-muted">
                                        <span>Started {formatTime(selectedHistoryJob.createdAt)}</span>
                                        <span>Finished {formatTime(selectedHistoryJob.finishedAt)}</span>
                                        {typeof selectedHistoryJob.result?.uploaded === 'number' ? (
                                            <span className="text-emerald-300">
                                                Uploaded {String(selectedHistoryJob.result.uploaded)}
                                                {typeof selectedHistoryJob.result.attempted === 'number'
                                                    ? ` / ${String(selectedHistoryJob.result.attempted)}`
                                                    : ''}
                                            </span>
                                        ) : null}
                                    </div>
                                    {selectedHistoryJob.error ? (
                                        <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                                            {selectedHistoryJob.error}
                                        </p>
                                    ) : null}
                                    <div className="max-h-[28rem] overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-[11px] text-muted custom-scrollbar">
                                        {selectedLogs.length ? selectedLogs.map((line, index) => (
                                            <p key={`${index}-${line.slice(0, 24)}`}>{line}</p>
                                        )) : (
                                            <p>No log lines for this job.</p>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center text-sm text-muted">
                                    <History className="h-8 w-8 opacity-30" />
                                    <p>Select a job to inspect its logs.</p>
                                </div>
                            )}
                        </section>
                    </div>
                </div>
            ) : null}

            {tab === 'settings' ? (
                <section className={`${cardClass} space-y-5 p-5`}>
                    <div>
                        <h2 className="text-lg font-bold text-text">Poster Sets config</h2>
                        <p className="mt-1 text-sm text-muted">
                            Same layout as the original helper config.json — used only by this feature.
                            You can pull URL, token, and libraries from Settings → Media Player.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => void importFromPortal()}>
                            {busy === 'import' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            Import from Media Player
                        </button>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block sm:col-span-2">
                            <span className="text-xs font-bold uppercase tracking-wide text-muted">base_url</span>
                            <input
                                className={`${fieldClass} mt-2`}
                                placeholder="http://192.168.1.10:32400/"
                                value={configDraft.base_url}
                                onChange={(event) => setConfigDraft((prev) => ({ ...prev, base_url: event.target.value }))}
                            />
                        </label>
                        <label className="block sm:col-span-2">
                            <span className="text-xs font-bold uppercase tracking-wide text-muted">token</span>
                            <input
                                className={`${fieldClass} mt-2`}
                                type="password"
                                autoComplete="off"
                                placeholder={configDraft.hasToken ? '•••••••• (unchanged)' : 'Plex token'}
                                value={configDraft.token === '********' ? '' : configDraft.token}
                                onChange={(event) => setConfigDraft((prev) => ({ ...prev, token: event.target.value }))}
                            />
                        </label>
                        <label className="block">
                            <span className="text-xs font-bold uppercase tracking-wide text-muted">tv_library</span>
                            <textarea
                                className={`${fieldClass} mt-2 min-h-24`}
                                placeholder={'TV Shows\nAnime'}
                                value={tvText}
                                onChange={(event) => setTvText(event.target.value)}
                            />
                            <span className="mt-1 block text-[11px] text-muted">One library name per line.</span>
                        </label>
                        <label className="block">
                            <span className="text-xs font-bold uppercase tracking-wide text-muted">movie_library</span>
                            <textarea
                                className={`${fieldClass} mt-2 min-h-24`}
                                placeholder="Movies"
                                value={movieText}
                                onChange={(event) => setMovieText(event.target.value)}
                            />
                        </label>
                        <label className="block sm:col-span-2">
                            <span className="text-xs font-bold uppercase tracking-wide text-muted">bulk_txt</span>
                            <input
                                className={`${fieldClass} mt-2`}
                                value={configDraft.bulk_txt}
                                onChange={(event) => setConfigDraft((prev) => ({ ...prev, bulk_txt: event.target.value }))}
                            />
                            <span className="mt-1 block text-[11px] text-muted">
                                Filename under config/poster-sets/ for “Apply from file”.
                            </span>
                        </label>
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-muted">mediux_filters</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {MEDIUX_FILTER_OPTIONS.map((option) => {
                                const active = (configDraft.mediux_filters || []).includes(option.id);
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        className={active ? primaryButtonClass : buttonClass}
                                        onClick={() => toggleFilter(option.id)}
                                    >
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className={primaryButtonClass} disabled={busy !== null} onClick={() => void saveSettings()}>
                            {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Save settings
                        </button>
                        <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => void runTest()}>
                            {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            Test connection
                        </button>
                    </div>
                    {testResult ? <p className="text-sm text-muted">{testResult}</p> : null}
                </section>
            ) : null}
        </div>
    );
};

export default PosterSetsDashboard;
