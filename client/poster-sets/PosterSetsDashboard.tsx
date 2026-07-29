import React, { useCallback, useEffect, useState } from 'react';
import {
    CheckCircle2,
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

type TabId = 'apply' | 'settings';

const listToText = (value: string[] | undefined) => (Array.isArray(value) ? value.join('\n') : '');
const textToList = (value: string) => value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);

export const PosterSetsDashboard: React.FC = () => {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const toast = useCallback((message: string, type: ToastMessage['type'] = 'success') => {
        pushToast(setToasts, message, type);
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
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to load Poster Sets', 'error');
        }
    }, [toast]);

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
            setTestResult(
                response.ok
                    ? `Connected${response.server ? ` to ${response.server}` : ''}. ${libraries.join(' · ') || 'No matched libraries.'}`
                    : (response.error || 'Connection failed'),
            );
            toast(response.ok ? 'Plex connection OK.' : (response.error || 'Connection failed'), response.ok ? 'success' : 'error');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Connection failed';
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

    const jobLogs = (activeJob?.logs || []).map((entry) => (
        typeof entry === 'string' ? entry : String(entry.message || '')
    )).filter(Boolean);

    return (
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
            <ToastContainer toasts={toasts} setToasts={setToasts} />

            <header className={`${cardClass} overflow-hidden p-6`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-plex">Poster Sets</p>
                        <h1 className="mt-2 text-3xl font-bold tracking-tight text-text">Artwork from MediUX & ThePosterDB</h1>
                        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                            Paste a set URL, preview matched assets, then apply posters to your Plex libraries.
                            Connection settings live in this section — separate from ColleXions and portal Plex settings.
                        </p>
                    </div>
                    <button type="button" className={buttonClass} onClick={() => void load()} disabled={busy !== null}>
                        <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> Refresh
                    </button>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Worker</p>
                        <p className="mt-1 text-sm font-semibold text-text">{status?.workerReady ? 'Ready' : 'Missing'}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Config</p>
                        <p className="mt-1 text-sm font-semibold text-text">{status?.configured ? 'Connected fields set' : 'Needs settings'}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Last job</p>
                        <p className="mt-1 text-sm font-semibold text-text">
                            {status?.recentJobs?.[0]
                                ? `${status.recentJobs[0].type} · ${status.recentJobs[0].state}`
                                : 'None yet'}
                        </p>
                    </div>
                </div>
            </header>

            <div className="flex flex-wrap gap-2">
                {([
                    ['apply', 'Apply', Sparkles],
                    ['settings', 'Settings', Settings2],
                ] as const).map(([id, label, Icon]) => (
                    <button
                        key={id}
                        type="button"
                        className={`${tab === id ? primaryButtonClass : buttonClass}`}
                        onClick={() => setTab(id)}
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

                    {activeJob ? (
                        <section className={`${cardClass} space-y-3 p-5`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h2 className="text-lg font-bold text-text">Job #{activeJob.id.slice(0, 8)}</h2>
                                <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-muted">
                                    {activeJob.state || 'unknown'}
                                </span>
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
                </div>
            ) : (
                <section className={`${cardClass} space-y-5 p-5`}>
                    <div>
                        <h2 className="text-lg font-bold text-text">Poster Sets config</h2>
                        <p className="mt-1 text-sm text-muted">
                            Same layout as the original helper config.json — used only by this feature.
                        </p>
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
            )}
        </div>
    );
};

export default PosterSetsDashboard;
