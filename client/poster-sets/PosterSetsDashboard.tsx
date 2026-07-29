import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    CheckCircle2,
    ChevronLeft,
    Clock,
    Download,
    ExternalLink,
    History,
    Image as ImageIcon,
    Loader2,
    RefreshCw,
    RotateCcw,
    Save,
    Search,
    Settings2,
    Sparkles,
    User,
    X,
} from 'lucide-react';
import { ToastContainer, pushToast, type ToastMessage } from '../shared/toast';
import { CustomSelect, SettingsToggleRow } from '../shared/ui';
import { askConfirm } from '../shared/confirm';
import {
    normalizeUpgraderGridSize,
    UPGRADER_GRID_SIZE_OPTIONS,
    upgraderPosterGridClass,
    upgraderPosterGridStyle,
    type UpgraderGridSize,
} from '../shared/portalLayout';
import { posterSetsApi } from './api';
import {
    DEFAULT_POSTER_SETS_CONFIG,
    MEDIUX_FILTER_OPTIONS,
    type PosterSetsConfig,
    type PosterSetsJob,
    type PosterSetsPreview,
    type PosterSetsPreviewAsset,
    type PosterSetsSearchSet,
    type PosterSetsSearchTitle,
    type PosterSetsSetMeta,
    type PosterSetsStatus,
} from './types';

const POSTER_SETS_GRID_STORAGE_KEY = 'posterSetsGridSize';
const POSTER_SETS_GRID_OPTIONS = UPGRADER_GRID_SIZE_OPTIONS.filter((option) => option.value !== 'list');

const cardClass = 'glass-card shadow-xl';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-text transition hover:border-plex/40 hover:bg-white/5 disabled:pointer-events-none disabled:opacity-40';
const primaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-plex px-3 py-2 text-sm font-bold text-background transition hover:bg-plex-hover active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40';
const fieldClass = 'w-full rounded-lg border border-white/10 bg-background/70 px-3 py-2.5 text-sm text-text placeholder:text-muted/60 outline-none transition focus:border-plex focus:ring-1 focus:ring-plex';

type TabId = 'apply' | 'recent' | 'history' | 'settings';
type HistoryFilter = 'all' | 'running' | 'succeeded' | 'failed';
type SetProvider = 'mediux' | 'posterdb';
type SearchProvider = 'both' | SetProvider;

const providerLabel = (provider?: string | null) => {
    const value = String(provider || '').toLowerCase();
    if (value === 'mediux') return 'MediUX';
    if (value === 'posterdb' || value === 'tpdb' || value === 'theposterdb') return 'ThePosterDB';
    if (value === 'both') return 'Both';
    return provider || 'Provider';
};

const RECENT_SETS_KEY = 'poster-sets-recent-v1';
const MAX_RECENT_SETS = 10;

type RecentSetChip = {
    url: string;
    title: string;
    provider: string | null;
    setId: string | null;
    thumbUrl: string;
    assetCount: number | null;
    at: string;
};

const listToText = (value: string[] | undefined) => (Array.isArray(value) ? value.join('\n') : '');
const textToList = (value: string) => value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);

const parseSetRef = (rawUrl: string): { provider: SetProvider | null; setId: string | null; url: string } => {
    const url = String(rawUrl || '').trim();
    const lower = url.toLowerCase();
    if (lower.includes('mediux.pro')) {
        const match = url.match(/\/sets?\/(\d+)/i);
        return { provider: 'mediux', setId: match?.[1] || null, url };
    }
    if (lower.includes('theposterdb.com')) {
        const match = url.match(/\/(?:set|poster)\/(\d+)/i) || url.match(/\/user\/([^/?#]+)/i);
        return { provider: 'posterdb', setId: match?.[1] || null, url };
    }
    return { provider: null, setId: null, url };
};

const buildSetUrl = (provider: SetProvider, rawId: string) => {
    const id = String(rawId || '').trim().replace(/^#/, '');
    if (!id) return '';
    if (provider === 'mediux') return `https://mediux.pro/sets/${encodeURIComponent(id)}`;
    if (/^\d+$/.test(id)) return `https://theposterdb.com/set/${id}`;
    return `https://theposterdb.com/user/${encodeURIComponent(id)}`;
};

const readRecentSets = (): RecentSetChip[] => {
    try {
        const raw = localStorage.getItem(RECENT_SETS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((item) => item && item.url) : [];
    } catch {
        return [];
    }
};

const writeRecentSets = (entries: RecentSetChip[]) => {
    try {
        localStorage.setItem(RECENT_SETS_KEY, JSON.stringify(entries.slice(0, MAX_RECENT_SETS)));
    } catch {
        // ignore quota / private mode
    }
};

const upsertRecentSet = (meta: PosterSetsSetMeta | null | undefined, fallbackUrl?: string) => {
    const url = String(meta?.url || fallbackUrl || '').trim();
    if (!url) return;
    const ref = parseSetRef(url);
    const next: RecentSetChip = {
        url,
        title: String(meta?.title || (ref.setId ? `Set ${ref.setId}` : 'Poster set')).trim() || 'Poster set',
        provider: meta?.provider || ref.provider,
        setId: meta?.setId != null ? String(meta.setId) : ref.setId,
        thumbUrl: String(meta?.thumbUrl || ''),
        assetCount: Number.isFinite(Number(meta?.assetCount)) ? Number(meta?.assetCount) : null,
        at: new Date().toISOString(),
    };
    const existing = readRecentSets().filter((item) => item.url !== url);
    writeRecentSets([next, ...existing]);
};

const jobSetMeta = (job: PosterSetsJob | null | undefined): PosterSetsSetMeta | null => {
    if (!job) return null;
    if (job.setMeta) return job.setMeta;
    if (job.input?.setMeta) return job.input.setMeta;
    const resultMeta = job.result?.setMeta;
    if (resultMeta && typeof resultMeta === 'object') return resultMeta as PosterSetsSetMeta;
    return null;
};

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
    const meta = jobSetMeta(job);
    if (meta?.title) {
        const provider = providerLabel(meta.provider);
        return meta.setId ? `${meta.title} · ${provider} #${meta.setId}` : meta.title;
    }
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
    const [findProvider, setFindProvider] = useState<SetProvider>('mediux');
    const [findId, setFindId] = useState('');
    const [searchProvider, setSearchProvider] = useState<SearchProvider>('both');
    const [searchMode, setSearchMode] = useState<'title' | 'creator'>('title');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchTitles, setSearchTitles] = useState<PosterSetsSearchTitle[]>([]);
    const [searchSets, setSearchSets] = useState<PosterSetsSearchSet[]>([]);
    const [searchContext, setSearchContext] = useState('');
    const [selectedSearchTitle, setSelectedSearchTitle] = useState<PosterSetsSearchTitle | null>(null);
    const [selectedSearchSet, setSelectedSearchSet] = useState<PosterSetsSearchSet | null>(null);
    const [manualUrlOpen, setManualUrlOpen] = useState(false);
    const previewPanelRef = useRef<HTMLDivElement | null>(null);
    const [recentTick, setRecentTick] = useState(0);
    const [gridSize, setGridSize] = useState<UpgraderGridSize>(() => {
        if (typeof window === 'undefined') return 'medium';
        return normalizeUpgraderGridSize(window.localStorage.getItem(POSTER_SETS_GRID_STORAGE_KEY));
    });
    const [preview, setPreview] = useState<PosterSetsPreview | null>(null);
    const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
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
                    const meta = jobSetMeta(response.job);
                    if (meta?.thumbUrl || meta?.title) {
                        upsertRecentSet(meta, response.job.input?.url);
                        setRecentTick((value) => value + 1);
                    }
                    await load();
                    await loadHistory();
                }
            } catch {
                // keep polling until terminal or user leaves
            }
        }, 1500);
        return () => window.clearInterval(timer);
    }, [activeJob?.id, activeJob?.state, load, loadHistory]);

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

    const runPreview = async (overrideUrl?: string, options?: { scroll?: boolean; keepSearch?: boolean }) => {
        const target = String(overrideUrl ?? url).trim();
        if (!target) {
            toast('Paste a MediUX or ThePosterDB set URL first.', 'error');
            return null;
        }
        if (overrideUrl) setUrl(target);
        setBusy('preview');
        setPreview(null);
        setSelectedAssetIds([]);
        try {
            const response = await posterSetsApi.preview(target);
            setPreview(response);
            const assets = response.assets || [];
            const matchedIds = assets.filter((asset) => asset.matched === true).map((asset) => asset.id);
            const defaults = matchedIds.length ? matchedIds : assets.map((asset) => asset.id);
            setSelectedAssetIds(defaults);
            upsertRecentSet(response.setMeta, target);
            setRecentTick((value) => value + 1);
            const matched = response.matched ?? matchedIds.length;
            toast(`Ready: ${matched} matched in Plex · ${response.total || 0} in set.`);
            if (options?.scroll !== false) {
                window.setTimeout(() => {
                    previewPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 50);
            }
            if (!options?.keepSearch) {
                // Keep context for the ready card, but get titles out of the way.
                setSearchTitles([]);
            }
            return response;
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Preview failed', 'error');
            return null;
        } finally {
            setBusy(null);
        }
    };

    const runApply = async (selectedOnly = false, overrideUrl?: string) => {
        const target = String(overrideUrl ?? url).trim();
        if (!target) {
            toast('Paste a MediUX or ThePosterDB set URL first.', 'error');
            return;
        }
        if (overrideUrl) setUrl(target);
        if (selectedOnly && !selectedAssetIds.length) {
            toast('Select at least one asset to apply.', 'error');
            return;
        }
        setBusy('apply');
        try {
            const response = await posterSetsApi.apply(
                target,
                selectedOnly ? selectedAssetIds : undefined,
            );
            setActiveJob(response.job);
            upsertRecentSet(jobSetMeta(response.job), target);
            setRecentTick((value) => value + 1);
            toast(selectedOnly
                ? `Apply started for ${selectedAssetIds.length} selected asset(s).`
                : 'Apply started for the full set.');
            await loadHistory();
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Apply failed', 'error');
        } finally {
            setBusy(null);
        }
    };

    const applyMatched = async () => {
        const assets = preview?.assets || [];
        const matchedIds = assets.filter((asset) => asset.matched === true).map((asset) => asset.id);
        const ids = matchedIds.length ? matchedIds : selectedAssetIds;
        if (!ids.length) {
            toast('No matched posters to apply.', 'error');
            return;
        }
        setSelectedAssetIds(ids);
        const label = matchedIds.length
            ? `Apply ${matchedIds.length} matched poster${matchedIds.length === 1 ? '' : 's'} to Plex?`
            : `Apply ${ids.length} poster${ids.length === 1 ? '' : 's'} to Plex?`;
        const ok = await askConfirm(label, {
            title: 'Apply poster set?',
            confirmLabel: 'Apply',
            cancelLabel: 'Cancel',
        });
        if (!ok) return;
        // Ensure apply uses the matched selection even if state hasn't flushed.
        setBusy('apply');
        try {
            const target = url.trim();
            const response = await posterSetsApi.apply(target, ids);
            setActiveJob(response.job);
            upsertRecentSet(jobSetMeta(response.job), target);
            setRecentTick((value) => value + 1);
            toast(`Apply started for ${ids.length} poster${ids.length === 1 ? '' : 's'}.`);
            await loadHistory();
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Apply failed', 'error');
        } finally {
            setBusy(null);
        }
    };

    const useFindId = async (andPreview: boolean) => {
        const built = buildSetUrl(findProvider, findId);
        if (!built) {
            toast(findProvider === 'mediux'
                ? 'Enter a MediUX set ID (numbers only).'
                : 'Enter a ThePosterDB set ID or username.', 'error');
            return;
        }
        setSelectedSearchSet({
            setId: findId.trim(),
            title: `Set ${findId.trim()}`,
            url: built,
            provider: findProvider,
        });
        setUrl(built);
        if (andPreview) await runPreview(built);
        else toast('Set URL filled — preview or apply when ready.');
    };

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(POSTER_SETS_GRID_STORAGE_KEY, gridSize === 'list' ? 'medium' : gridSize);
    }, [gridSize]);

    const posterGridClass = useMemo(
        () => upgraderPosterGridClass(gridSize === 'list' ? 'medium' : gridSize),
        [gridSize],
    );
    const posterGridStyle = useMemo(
        () => upgraderPosterGridStyle(gridSize === 'list' ? 'medium' : gridSize),
        [gridSize],
    );

    const runCatalogSearch = async () => {
        const q = searchQuery.trim();
        if (!q) {
            toast(searchMode === 'creator' ? 'Enter a creator username.' : 'Enter a title to search.', 'error');
            return;
        }
        setBusy('search');
        setSearchTitles([]);
        setSearchSets([]);
        setSearchContext('');
        setSelectedSearchTitle(null);
        setSelectedSearchSet(null);
        setPreview(null);
        try {
            const response = await posterSetsApi.search({
                provider: searchProvider,
                query: q,
                mode: searchMode,
                dupePreference: configDraft.dupePreference === 'mediux' ? 'mediux' : 'posterdb',
                limit: searchMode === 'creator' ? 40 : 24,
            });
            setSearchTitles(response.titles || []);
            setSearchSets(response.sets || []);
            setSearchContext(response.title || (searchMode === 'creator' ? `@${q.replace(/^@/, '')}` : q));
            const titleCount = response.titles?.length || 0;
            const setCount = response.sets?.length || 0;
            const dupes = Number(response.dupesCollapsed || 0);
            const dupeNote = dupes > 0 ? ` · ${dupes} duplicate${dupes === 1 ? '' : 's'} collapsed` : '';
            if (!titleCount && !setCount) {
                toast('No matches found.', 'error');
            } else if (titleCount) {
                toast(`Found ${titleCount} title${titleCount === 1 ? '' : 's'}${dupeNote}. Choose one.`);
            } else if (searchMode === 'creator') {
                toast(`Found ${setCount} set${setCount === 1 ? '' : 's'} from ${response.title || q}${dupeNote}. Choose one to preview.`);
            } else {
                toast(`Found ${setCount} set${setCount === 1 ? '' : 's'}${dupeNote}. Choose one to preview.`);
            }
            if (response.partialErrors?.length) {
                toast(response.partialErrors[0], 'error');
            }
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Search failed', 'error');
        } finally {
            setBusy(null);
        }
    };

    const openSearchTitle = async (title: PosterSetsSearchTitle) => {
        setBusy('search');
        setSearchSets([]);
        setSelectedSearchTitle(title);
        setSelectedSearchSet(null);
        setPreview(null);
        try {
            const sources = (title.sources?.length
                ? title.sources
                : [{
                    provider: title.provider || findProvider,
                    id: title.id,
                    url: title.url,
                    mediaType: title.mediaType,
                }]).filter((source) => source?.id || source?.url);

            const response = sources.length > 1
                ? await posterSetsApi.search({
                    provider: 'both',
                    query: title.title,
                    title: title.title,
                    titleSources: sources,
                    dupePreference: configDraft.dupePreference === 'mediux' ? 'mediux' : 'posterdb',
                    limit: 40,
                })
                : (String(sources[0]?.provider || '').toLowerCase() === 'mediux'
                    ? await posterSetsApi.search({
                        provider: 'mediux',
                        tmdbId: sources[0].id,
                        mediaType: sources[0].mediaType === 'show' ? 'show' : 'movie',
                        limit: 40,
                    })
                    : await posterSetsApi.search({
                        provider: 'posterdb',
                        titleUrl: sources[0].url,
                        limit: 40,
                    }));
            setSearchSets(response.sets || []);
            setSearchContext(response.title || title.title);
            // Focus on sets: titles list becomes a back action only.
            setSearchTitles([]);
            const dupes = Number(response.dupesCollapsed || 0);
            toast(`Choose a set for ${title.title}${dupes > 0 ? ` · ${dupes} duplicate${dupes === 1 ? '' : 's'} collapsed` : ''}.`);
            if (response.partialErrors?.length) toast(response.partialErrors[0], 'error');
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to load sets', 'error');
        } finally {
            setBusy(null);
        }
    };

    const pickSearchSet = async (set: PosterSetsSearchSet) => {
        setSelectedSearchSet(set);
        setUrl(set.url);
        await runPreview(set.url);
    };

    const backToTitles = () => {
        setSearchSets([]);
        setSelectedSearchTitle(null);
        setSelectedSearchSet(null);
        setPreview(null);
        if (searchQuery.trim()) void runCatalogSearch();
    };

    const clearSearch = () => {
        setSearchQuery('');
        setSearchTitles([]);
        setSearchSets([]);
        setSearchContext('');
        setSelectedSearchTitle(null);
        setSelectedSearchSet(null);
        setPreview(null);
        setSelectedAssetIds([]);
        setUrl('');
    };

    const matchedAssetCount = useMemo(() => {
        const assets = preview?.assets || [];
        return assets.filter((asset) => asset.matched === true).length;
    }, [preview]);

    const readyToApply = Boolean(preview?.assets?.length);

    const toggleAsset = (id: string) => {
        setSelectedAssetIds((prev) => (
            prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
        ));
    };

    const selectPreviewAssets = (mode: 'all' | 'matched' | 'none') => {
        const assets = preview?.assets || [];
        if (mode === 'none') {
            setSelectedAssetIds([]);
            return;
        }
        if (mode === 'matched') {
            setSelectedAssetIds(assets.filter((asset) => asset.matched).map((asset) => asset.id));
            return;
        }
        setSelectedAssetIds(assets.map((asset) => asset.id));
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

    const recentSets = useMemo(() => {
        void recentTick;
        const byUrl = new Map<string, RecentSetChip>();
        const push = (chip: RecentSetChip | null) => {
            if (!chip?.url || byUrl.has(chip.url)) return;
            byUrl.set(chip.url, chip);
        };

        for (const stored of readRecentSets()) {
            push(stored);
        }
        for (const job of historyJobs) {
            const urlValue = String(job.input?.url || jobSetMeta(job)?.url || '').trim();
            if (!urlValue) continue;
            const meta = jobSetMeta(job);
            const ref = parseSetRef(urlValue);
            push({
                url: urlValue,
                title: String(meta?.title || (ref.setId ? `Set ${ref.setId}` : 'Poster set')),
                provider: meta?.provider || ref.provider,
                setId: meta?.setId != null ? String(meta.setId) : ref.setId,
                thumbUrl: String(meta?.thumbUrl || ''),
                assetCount: Number.isFinite(Number(meta?.assetCount)) ? Number(meta?.assetCount) : null,
                at: job.finishedAt || job.createdAt || new Date(0).toISOString(),
            });
        }
        return [...byUrl.values()]
            .sort((a, b) => String(b.at).localeCompare(String(a.at)))
            .slice(0, MAX_RECENT_SETS);
    }, [historyJobs, recentTick]);

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
                            Find a title, choose a poster set, preview the art, then apply.
                            Re-run past sets from the Recent tab. Connection settings live in this section.
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
                    ['recent', 'Recent', Clock],
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

            {tab === 'recent' ? (
                <section className={`${cardClass} space-y-3 p-5`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-bold text-text">Recent sets</h2>
                            <p className="mt-1 text-sm text-muted">
                                Re-preview or re-apply sets you&apos;ve already used.
                            </p>
                        </div>
                        <CustomSelect
                            value={gridSize === 'list' ? 'medium' : gridSize}
                            onChange={(value) => setGridSize(normalizeUpgraderGridSize(value))}
                            options={POSTER_SETS_GRID_OPTIONS}
                            className="w-full min-w-[140px] sm:w-auto"
                            compact
                        />
                    </div>
                    {recentSets.length ? (
                        <div className={posterGridClass} style={posterGridStyle}>
                            {recentSets.map((item) => (
                                <div
                                    key={item.url}
                                    className="overflow-hidden rounded-2xl border border-white/10 bg-black/20"
                                >
                                    <button
                                        type="button"
                                        className="block w-full text-left"
                                        disabled={busy !== null}
                                        onClick={() => {
                                            setSelectedSearchSet({
                                                setId: item.setId || '',
                                                title: item.title,
                                                url: item.url,
                                                thumbUrl: item.thumbUrl,
                                                provider: item.provider || undefined,
                                                posterCount: item.assetCount,
                                            });
                                            setTab('apply');
                                            void runPreview(item.url);
                                        }}
                                        title={`Preview ${item.title}`}
                                    >
                                        <div className="relative aspect-[2/3] bg-black/40">
                                            {item.thumbUrl ? (
                                                <img
                                                    src={posterSetsApi.imageUrl(item.thumbUrl)}
                                                    alt={item.title}
                                                    loading="lazy"
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                <div className="flex h-full items-center justify-center text-muted">
                                                    <ImageIcon className="h-8 w-8 opacity-40" />
                                                </div>
                                            )}
                                            <span className="absolute left-2 top-2 rounded-full border border-white/15 bg-black/55 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text">
                                                {providerLabel(item.provider)}
                                            </span>
                                        </div>
                                        <div className="space-y-1 p-3">
                                            <p className="truncate text-sm font-semibold text-text" title={item.title}>{item.title}</p>
                                            <p className="truncate text-[11px] text-muted">
                                                {item.setId ? `#${item.setId}` : 'Set'}
                                                {item.assetCount ? ` · ${item.assetCount} assets` : ''}
                                            </p>
                                        </div>
                                    </button>
                                    <div className="flex gap-2 border-t border-white/10 p-2">
                                        <button
                                            type="button"
                                            className={`${buttonClass} flex-1 !px-2 !py-1.5 text-xs`}
                                            disabled={busy !== null}
                                            onClick={() => {
                                                setSelectedSearchSet({
                                                    setId: item.setId || '',
                                                    title: item.title,
                                                    url: item.url,
                                                    thumbUrl: item.thumbUrl,
                                                    provider: item.provider || undefined,
                                                    posterCount: item.assetCount,
                                                });
                                                setTab('apply');
                                                void runPreview(item.url);
                                            }}
                                        >
                                            {busy === 'preview' && url === item.url ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                                            Preview
                                        </button>
                                        <button
                                            type="button"
                                            className={`${primaryButtonClass} flex-1 !px-2 !py-1.5 text-xs`}
                                            disabled={busy !== null}
                                            onClick={() => {
                                                setTab('apply');
                                                void runApply(false, item.url);
                                            }}
                                        >
                                            {busy === 'apply' && url === item.url ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                                            Apply
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="rounded-xl border border-white/10 bg-black/20 p-5 text-sm text-muted">
                            No recent sets yet. Search and apply a set on the Apply tab and it will show up here.
                        </p>
                    )}
                </section>
            ) : null}

            {tab === 'apply' ? (
                <div className="space-y-4">
                    <section className={`${cardClass} space-y-4 p-5`}>
                        <div>
                            <label className="text-xs font-bold uppercase tracking-wide text-muted">Search → choose set → preview → apply</label>
                            <p className="mt-1 text-sm text-muted">
                                Find a title, pick a poster set, review the art, then apply matched posters to Plex.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {([
                                    ['both', 'Both'],
                                    ['mediux', 'MediUX'],
                                    ['posterdb', 'ThePosterDB'],
                                ] as const).map(([id, label]) => (
                                    <button
                                        key={id}
                                        type="button"
                                        className={`${buttonClass} ${searchProvider === id ? 'border-plex/40 bg-plex/15 text-plex' : ''}`}
                                        onClick={() => {
                                            setSearchProvider(id);
                                            if (id !== 'both') setFindProvider(id);
                                            setSearchTitles([]);
                                            setSearchSets([]);
                                            setSearchContext('');
                                            setSelectedSearchTitle(null);
                                            setSelectedSearchSet(null);
                                        }}
                                    >
                                        {label}
                                    </button>
                                ))}
                                {([
                                    ['title', 'Title', Search],
                                    ['creator', 'Creator', User],
                                ] as const).map(([id, label, Icon]) => (
                                    <button
                                        key={id}
                                        type="button"
                                        className={`${buttonClass} ${searchMode === id ? 'border-plex/40 bg-plex/15 text-plex' : ''}`}
                                        onClick={() => {
                                            setSearchMode(id);
                                            setSearchTitles([]);
                                            setSearchSets([]);
                                            setSearchContext('');
                                            setSelectedSearchTitle(null);
                                            setSelectedSearchSet(null);
                                        }}
                                    >
                                        <Icon className="h-4 w-4" />
                                        {label}
                                    </button>
                                ))}
                                <a
                                    href={searchProvider === 'posterdb' ? 'https://theposterdb.com/' : 'https://mediux.pro/'}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={`${buttonClass} no-underline`}
                                >
                                    <ExternalLink className="h-4 w-4" />
                                    Browse site
                                </a>
                                <CustomSelect
                                    value={gridSize === 'list' ? 'medium' : gridSize}
                                    onChange={(value) => setGridSize(normalizeUpgraderGridSize(value))}
                                    options={POSTER_SETS_GRID_OPTIONS}
                                    className="ml-auto w-full min-w-[140px] sm:w-auto"
                                    compact
                                />
                            </div>
                            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                <div className="relative min-w-0 flex-1">
                                    {searchMode === 'creator'
                                        ? <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                                        : <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />}
                                    <input
                                        className={`${fieldClass} pl-9`}
                                        value={searchQuery}
                                        onChange={(event) => setSearchQuery(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') {
                                                event.preventDefault();
                                                void runCatalogSearch();
                                            }
                                        }}
                                        placeholder={searchMode === 'creator'
                                            ? 'Creator username e.g. kaster / TheDoctor30'
                                            : 'Search titles e.g. The Matrix'}
                                    />
                                </div>
                                <button type="button" className={primaryButtonClass} disabled={busy !== null} onClick={() => void runCatalogSearch()}>
                                    {busy === 'search' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                    Search
                                </button>
                                {(searchQuery || searchTitles.length || searchSets.length || selectedSearchTitle || selectedSearchSet || preview) ? (
                                    <button
                                        type="button"
                                        className={buttonClass}
                                        disabled={busy !== null}
                                        onClick={clearSearch}
                                        title="Clear search and selection"
                                    >
                                        <X className="h-4 w-4" />
                                        Clear
                                    </button>
                                ) : null}
                            </div>

                            {(selectedSearchTitle || selectedSearchSet) ? (
                                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                                    {selectedSearchTitle ? (
                                        <button type="button" className={`${buttonClass} !py-1.5 text-xs`} onClick={() => void backToTitles()} disabled={busy !== null}>
                                            <ChevronLeft className="h-3.5 w-3.5" /> Titles
                                        </button>
                                    ) : null}
                                    {selectedSearchTitle ? (
                                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-text">
                                            {selectedSearchTitle.title}
                                        </span>
                                    ) : null}
                                    {selectedSearchSet ? (
                                        <span className="inline-flex items-center gap-1.5 rounded-full border border-plex/30 bg-plex/10 px-2.5 py-1 text-plex">
                                            {selectedSearchSet.title || `Set #${selectedSearchSet.setId}`}
                                            <button
                                                type="button"
                                                className="rounded-full p-0.5 text-plex/80 hover:bg-plex/20 hover:text-plex"
                                                onClick={clearSearch}
                                                title="Clear selection"
                                                aria-label="Clear selection"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </span>
                                    ) : null}
                                    <button
                                        type="button"
                                        className="text-xs font-semibold text-muted hover:text-text"
                                        onClick={clearSearch}
                                    >
                                        Clear search
                                    </button>
                                </div>
                            ) : null}

                            {searchTitles.length ? (
                                <div className="mt-4 space-y-2">
                                    <p className="text-xs font-bold uppercase tracking-wide text-muted">1. Choose a title</p>
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                        {searchTitles.map((title) => (
                                            <button
                                                key={`${title.provider || findProvider}-${title.id}`}
                                                type="button"
                                                className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-2 text-left transition hover:border-plex/40"
                                                disabled={busy !== null}
                                                onClick={() => void openSearchTitle(title)}
                                            >
                                                <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-black/40">
                                                    {title.thumbUrl ? (
                                                        <img
                                                            src={title.thumbUrl.startsWith('https://image.tmdb.org/')
                                                                ? title.thumbUrl
                                                                : posterSetsApi.imageUrl(title.thumbUrl)}
                                                            alt=""
                                                            className="h-full w-full object-cover"
                                                            loading="lazy"
                                                        />
                                                    ) : (
                                                        <div className="flex h-full items-center justify-center text-muted">
                                                            <ImageIcon className="h-4 w-4 opacity-40" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-text">{title.title}</p>
                                                    <p className="text-[11px] text-muted">
                                                        {providerLabel(title.provider)}
                                                        {title.alsoOn?.length
                                                            ? ` · also ${title.alsoOn.map((entry) => providerLabel(entry.provider)).join(', ')}`
                                                            : ''}
                                                        {' · '}
                                                        {title.year || '—'}
                                                        {title.mediaType ? ` · ${title.mediaType}` : ''}
                                                    </p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {searchSets.length && !readyToApply ? (
                                <div className="mt-4 space-y-2">
                                    <p className="text-xs font-bold uppercase tracking-wide text-muted">
                                        2. Choose a poster set{searchContext ? ` · ${searchContext}` : ''}
                                    </p>
                                    <div className={posterGridClass} style={posterGridStyle}>
                                        {searchSets.map((set) => (
                                            <button
                                                key={`${set.provider || findProvider}-${set.setId}`}
                                                type="button"
                                                className={`overflow-hidden rounded-2xl border text-left transition ${
                                                    selectedSearchSet?.setId === set.setId
                                                        ? 'border-plex/60 bg-plex/10 ring-1 ring-plex/30'
                                                        : 'border-white/10 bg-black/20 hover:border-plex/40'
                                                }`}
                                                disabled={busy !== null}
                                                onClick={() => void pickSearchSet(set)}
                                            >
                                                <div className="relative aspect-[2/3] bg-black/40">
                                                    {set.thumbUrl ? (
                                                        <img
                                                            src={posterSetsApi.imageUrl(set.thumbUrl)}
                                                            alt={set.title}
                                                            className="h-full w-full object-cover"
                                                            loading="lazy"
                                                        />
                                                    ) : (
                                                        <div className="flex h-full items-center justify-center text-muted">
                                                            <ImageIcon className="h-8 w-8 opacity-40" />
                                                        </div>
                                                    )}
                                                    {busy === 'preview' && selectedSearchSet?.setId === set.setId ? (
                                                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                                                            <Loader2 className="h-6 w-6 animate-spin text-plex" />
                                                        </div>
                                                    ) : null}
                                                </div>
                                                <div className="space-y-1 p-3">
                                                    <p className="truncate text-sm font-semibold text-text" title={set.title}>{set.title}</p>
                                                    <p className="truncate text-[11px] text-muted">
                                                        {providerLabel(set.provider)}
                                                        {set.alsoOn?.length
                                                            ? ` · also ${set.alsoOn.map((entry) => providerLabel(entry.provider)).join(', ')}`
                                                            : ''}
                                                        {' · '}
                                                        #{set.setId}
                                                        {set.user ? ` · ${set.user}` : ''}
                                                        {set.posterCount ? ` · ${set.posterCount}` : ''}
                                                    </p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {readyToApply ? (
                                <div ref={previewPanelRef} className="mt-4 space-y-4 rounded-2xl border border-plex/30 bg-plex/10 p-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold uppercase tracking-wide text-plex">3. Preview</p>
                                            <h3 className="mt-1 truncate text-lg font-bold text-text">
                                                {selectedSearchSet?.title || preview?.setMeta?.title || 'Poster set'}
                                            </h3>
                                            <p className="mt-1 text-sm text-muted">
                                                <span className="text-emerald-300">{matchedAssetCount} matched</span>
                                                {' · '}
                                                <span className="text-amber-200">{preview?.unmatched ?? 0} missing</span>
                                                {' · '}
                                                {preview?.total || 0} in set
                                                {' · '}
                                                {selectedAssetIds.length} selected
                                            </p>
                                            <div className="mt-2 flex flex-wrap gap-3">
                                                {searchSets.length ? (
                                                    <button
                                                        type="button"
                                                        className="text-xs font-semibold text-plex hover:underline"
                                                        onClick={() => {
                                                            setPreview(null);
                                                            setSelectedSearchSet(null);
                                                            setSelectedAssetIds([]);
                                                        }}
                                                    >
                                                        Choose a different set
                                                    </button>
                                                ) : null}
                                                <button
                                                    type="button"
                                                    className="text-xs font-semibold text-muted hover:text-text"
                                                    onClick={clearSearch}
                                                >
                                                    Clear search
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                                            <button
                                                type="button"
                                                className={`${primaryButtonClass} sm:min-w-[220px]`}
                                                disabled={busy !== null || (matchedAssetCount < 1 && !selectedAssetIds.length)}
                                                onClick={() => void applyMatched()}
                                            >
                                                {busy === 'apply' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                                Apply matched{matchedAssetCount ? ` (${matchedAssetCount})` : selectedAssetIds.length ? ` (${selectedAssetIds.length})` : ''}
                                            </button>
                                            <button
                                                type="button"
                                                className={buttonClass}
                                                disabled={busy !== null}
                                                onClick={async () => {
                                                    const ok = await askConfirm('Apply the entire set, including posters not matched in your libraries?', {
                                                        title: 'Apply full set?',
                                                        confirmLabel: 'Apply all',
                                                        cancelLabel: 'Cancel',
                                                    });
                                                    if (!ok) return;
                                                    void runApply(false);
                                                }}
                                            >
                                                Apply entire set
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-3 border-t border-white/10 pt-4">
                                        <div className="flex flex-wrap gap-2">
                                            <button type="button" className={buttonClass} onClick={() => selectPreviewAssets('matched')}>Matched only</button>
                                            <button type="button" className={buttonClass} onClick={() => selectPreviewAssets('all')}>Select all</button>
                                            <button type="button" className={buttonClass} onClick={() => selectPreviewAssets('none')}>Clear selection</button>
                                            <button
                                                type="button"
                                                className={buttonClass}
                                                disabled={busy !== null || !selectedAssetIds.length}
                                                onClick={() => void runApply(true)}
                                            >
                                                Apply selected ({selectedAssetIds.length})
                                            </button>
                                        </div>
                                        <div className={posterGridClass} style={posterGridStyle}>
                                            {(preview?.assets || []).map((asset: PosterSetsPreviewAsset) => {
                                                const selected = selectedAssetIds.includes(asset.id);
                                                const matched = asset.matched === true;
                                                const unmatched = asset.matched === false;
                                                return (
                                                    <button
                                                        key={asset.id}
                                                        type="button"
                                                        onClick={() => toggleAsset(asset.id)}
                                                        className={`group overflow-hidden rounded-2xl border text-left transition ${
                                                            selected
                                                                ? 'border-plex/60 bg-plex/10 ring-1 ring-plex/40'
                                                                : 'border-white/10 bg-black/20 hover:border-plex/35'
                                                        }`}
                                                    >
                                                        <div className="relative aspect-[2/3] bg-black/40">
                                                            {asset.thumbUrl ? (
                                                                <img
                                                                    src={posterSetsApi.imageUrl(asset.thumbUrl)}
                                                                    alt={asset.title}
                                                                    loading="lazy"
                                                                    className="h-full w-full object-cover"
                                                                />
                                                            ) : (
                                                                <div className="flex h-full items-center justify-center text-muted">
                                                                    <ImageIcon className="h-8 w-8 opacity-40" />
                                                                </div>
                                                            )}
                                                            <span className={`absolute left-2 top-2 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                                                matched
                                                                    ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-100'
                                                                    : unmatched
                                                                        ? 'border-amber-500/40 bg-amber-500/20 text-amber-100'
                                                                        : 'border-white/15 bg-black/50 text-muted'
                                                            }`}>
                                                                {matched ? 'In library' : unmatched ? 'Missing' : 'Unknown'}
                                                            </span>
                                                            <span className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md border text-xs font-bold ${
                                                                selected
                                                                    ? 'border-plex bg-plex text-background'
                                                                    : 'border-white/20 bg-black/50 text-muted'
                                                            }`}>
                                                                {selected ? '✓' : ''}
                                                            </span>
                                                        </div>
                                                        <div className="space-y-1 p-3">
                                                            <p className="truncate text-sm font-semibold text-text" title={asset.title}>
                                                                {asset.title}{asset.year ? ` (${asset.year})` : ''}
                                                            </p>
                                                            <p className="text-[11px] font-bold uppercase tracking-wide text-plex/90">{asset.label}</p>
                                                            {asset.matchDetail ? (
                                                                <p className="truncate text-[11px] text-muted" title={asset.matchDetail}>{asset.matchDetail}</p>
                                                            ) : null}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="sticky bottom-3 z-10 flex flex-wrap gap-2 rounded-xl border border-plex/40 bg-card/95 p-3 shadow-lg backdrop-blur">
                                        <button
                                            type="button"
                                            className={`${primaryButtonClass} flex-1 sm:flex-none sm:min-w-[220px]`}
                                            disabled={busy !== null || (matchedAssetCount < 1 && !selectedAssetIds.length)}
                                            onClick={() => void applyMatched()}
                                        >
                                            {busy === 'apply' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                            Apply matched{matchedAssetCount ? ` (${matchedAssetCount})` : selectedAssetIds.length ? ` (${selectedAssetIds.length})` : ''}
                                        </button>
                                        <button
                                            type="button"
                                            className={buttonClass}
                                            disabled={busy !== null || !selectedAssetIds.length}
                                            onClick={() => void runApply(true)}
                                        >
                                            Apply selected ({selectedAssetIds.length})
                                        </button>
                                    </div>
                                </div>
                            ) : null}

                            <div className="mt-5 border-t border-white/10 pt-4">
                                <button
                                    type="button"
                                    className="text-xs font-bold uppercase tracking-wide text-muted hover:text-text"
                                    onClick={() => setManualUrlOpen((value) => !value)}
                                >
                                    {manualUrlOpen ? 'Hide manual URL / set ID' : 'Manual URL / set ID'}
                                </button>
                                {manualUrlOpen ? (
                                    <div className="mt-3 space-y-3">
                                        <div className="flex flex-wrap gap-2">
                                            {([
                                                ['mediux', 'MediUX'],
                                                ['posterdb', 'ThePosterDB'],
                                            ] as const).map(([id, label]) => (
                                                <button
                                                    key={id}
                                                    type="button"
                                                    className={`${buttonClass} !py-1.5 text-xs ${findProvider === id ? 'border-plex/40 bg-plex/15 text-plex' : ''}`}
                                                    onClick={() => setFindProvider(id)}
                                                >
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="flex flex-col gap-2 sm:flex-row">
                                            <input
                                                className={fieldClass}
                                                value={findId}
                                                onChange={(event) => setFindId(event.target.value)}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter') {
                                                        event.preventDefault();
                                                        void useFindId(true);
                                                    }
                                                }}
                                                placeholder={findProvider === 'mediux' ? 'Set ID e.g. 24522' : 'Set ID e.g. 11318 or username'}
                                            />
                                            <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => void useFindId(true)}>
                                                Preview set
                                            </button>
                                        </div>
                                        <input
                                            className={fieldClass}
                                            placeholder="https://mediux.pro/sets/… or https://theposterdb.com/set/…"
                                            value={url}
                                            onChange={(event) => setUrl(event.target.value)}
                                        />
                                        <div className="flex flex-wrap gap-2">
                                            <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => void runPreview()}>
                                                {busy === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                                                Preview
                                            </button>
                                            <button
                                                type="button"
                                                className={primaryButtonClass}
                                                disabled={busy !== null || !url.trim()}
                                                onClick={() => void (readyToApply ? applyMatched() : runApply(false))}
                                            >
                                                {busy === 'apply' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                                {readyToApply ? `Apply matched (${matchedAssetCount || selectedAssetIds.length})` : 'Apply to Plex'}
                                            </button>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        </div>
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
                                const meta = jobSetMeta(job);
                                return (
                                    <article
                                        key={job.id}
                                        className={`${cardClass} cursor-pointer space-y-2 p-4 transition hover:border-plex/40 ${selected ? 'border-plex/50' : ''} ${jobCardTone(job)}`}
                                        onClick={() => void openHistoryJob(job.id)}
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="flex min-w-0 items-start gap-3">
                                                {meta?.thumbUrl ? (
                                                    <img
                                                        src={posterSetsApi.imageUrl(meta.thumbUrl)}
                                                        alt=""
                                                        className="h-14 w-10 shrink-0 rounded-md object-cover"
                                                        loading="lazy"
                                                    />
                                                ) : null}
                                                <div className="min-w-0">
                                                    <p className="truncate font-semibold text-text" title={jobTitle(job)}>
                                                        {jobTitle(job)}
                                                    </p>
                                                    <p className="mt-1 font-mono text-xs text-muted">
                                                        #{job.id.slice(0, 8)} · {job.type || 'job'}
                                                    </p>
                                                </div>
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
                                    {selectedHistoryJob.input?.url ? (
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                className={buttonClass}
                                                disabled={busy !== null}
                                                onClick={() => {
                                                    const target = String(selectedHistoryJob.input?.url || '').trim();
                                                    if (!target) return;
                                                    setTab('apply');
                                                    void runPreview(target);
                                                }}
                                            >
                                                <ImageIcon className="h-4 w-4" /> Re-preview
                                            </button>
                                            <button
                                                type="button"
                                                className={primaryButtonClass}
                                                disabled={busy !== null}
                                                onClick={() => {
                                                    const target = String(selectedHistoryJob.input?.url || '').trim();
                                                    if (!target) return;
                                                    setTab('apply');
                                                    void runApply(false, target);
                                                }}
                                            >
                                                <RotateCcw className="h-4 w-4" /> Re-apply
                                            </button>
                                        </div>
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
                    <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                        <p className="text-sm font-semibold text-text">Fallback for duplicates</p>
                        <p className="mt-1 text-xs text-muted">
                            When Both finds the same title/set on MediUX and ThePosterDB, keep this source as the primary card.
                        </p>
                        <div className="mt-3">
                            <CustomSelect
                                value={configDraft.dupePreference === 'mediux' ? 'mediux' : 'posterdb'}
                                onChange={(value) => setConfigDraft((prev) => ({
                                    ...prev,
                                    dupePreference: value === 'mediux' ? 'mediux' : 'posterdb',
                                }))}
                                options={[
                                    { value: 'posterdb', label: 'Prefer ThePosterDB' },
                                    { value: 'mediux', label: 'Prefer MediUX' },
                                ]}
                                className="w-full min-w-[180px] sm:w-auto"
                            />
                        </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 px-4">
                        <SettingsToggleRow
                            title="Clear Kometa Overlay label after upload"
                            description="Default on. Removes Kometa’s Overlay label so the next Kometa run reapplies overlays on the new artwork."
                            checked={configDraft.reset_overlay !== false}
                            onChange={(next) => setConfigDraft((prev) => ({ ...prev, reset_overlay: next }))}
                            border={false}
                        />
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
