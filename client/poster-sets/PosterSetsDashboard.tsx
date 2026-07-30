import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock,
    Compass,
    Download,
    ExternalLink,
    Eye,
    History,
    Image as ImageIcon,
    ListOrdered,
    Loader2,
    Pause,
    Play,
    RefreshCw,
    RotateCcw,
    Save,
    Search,
    Settings2,
    Sparkles,
    Trash2,
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
    mediuxFiltersFromAssets,
    type PosterSetsAuditEntry,
    type PosterSetsBrowseRail,
    type PosterSetsBrowseResponse,
    type PosterSetsConfig,
    type PosterSetsJob,
    type PosterSetsPreview,
    type PosterSetsPreviewAsset,
    type PosterSetsQueueStats,
    type PosterSetsSearchSet,
    type PosterSetsSearchTitle,
    type PosterSetsSetMeta,
    type PosterSetsStatus,
    type PosterSetsWatch,
    type PosterSetsWatchStats,
} from './types';
import { groupPosterSetsWatches } from './watchGroups';
import {
    groupPreviewAssets,
    previewAssetEpisodeLabel,
    type PreviewAssetSections,
} from './previewGroups';

const POSTER_SETS_GRID_STORAGE_KEY = 'posterSetsGridSize';
const POSTER_SETS_GRID_OPTIONS = UPGRADER_GRID_SIZE_OPTIONS.filter((option) => option.value !== 'list');
const SEARCH_SETS_PAGE_SIZE = 24;
const WATCHES_PAGE_SIZE_OPTIONS = [
    { value: '25', label: '25 per page' },
    { value: '50', label: '50 per page' },
    { value: '75', label: '75 per page' },
    { value: '100', label: '100 per page' },
] as const;
const ALL_MEDIUX_FILTER_IDS = MEDIUX_FILTER_OPTIONS.map((option) => option.id);

const cardClass = 'glass-card shadow-xl';
const buttonClass = 'inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs font-semibold text-text transition hover:border-plex/40 hover:bg-white/5 disabled:pointer-events-none disabled:opacity-40 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm';
const primaryButtonClass = 'inline-flex items-center justify-center gap-1.5 rounded-xl bg-plex px-2.5 py-1.5 text-xs font-bold text-background transition hover:bg-plex-hover active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm';
const fieldClass = 'w-full rounded-lg border border-white/10 bg-background/70 px-3 py-2 text-xs text-text placeholder:text-muted/60 outline-none transition focus:border-plex focus:ring-1 focus:ring-plex sm:py-2.5 sm:text-sm';
const sectionTitleClass = 'text-base font-bold text-text sm:text-lg';
const sectionBodyClass = 'mt-1 text-xs text-muted sm:text-sm';
const previewStripClass = 'flex gap-3 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]';

type TabId = 'apply' | 'browse' | 'queue' | 'watches' | 'recent' | 'history' | 'settings';
type HistoryFilter = 'all' | 'running' | 'succeeded' | 'failed' | 'audit';
type SetProvider = 'mediux' | 'posterdb';
type SearchProvider = 'both' | SetProvider;

function PreviewAssetTile({
    asset,
    selected,
    layout,
    caption,
    onToggle,
}: {
    asset: PosterSetsPreviewAsset;
    selected: boolean;
    layout: 'poster' | 'landscape';
    caption?: string;
    onToggle: (id: string) => void;
}) {
    const matched = asset.matched === true;
    const unmatched = asset.matched === false;
    const title = caption
        || (layout === 'landscape' ? previewAssetEpisodeLabel(asset) : `${asset.title}${asset.year ? ` (${asset.year})` : ''}`);
    return (
        <button
            type="button"
            onClick={() => onToggle(asset.id)}
            className={`group shrink-0 overflow-hidden rounded-2xl border text-left transition ${
                layout === 'landscape' ? 'w-[min(100%,17rem)] sm:w-72' : 'w-[7.25rem] sm:w-36'
            } ${
                selected
                    ? 'border-plex/60 bg-plex/10 ring-1 ring-plex/40'
                    : unmatched
                        ? 'border-amber-500/45 bg-amber-500/[0.06] hover:border-amber-400/60'
                        : 'border-white/10 bg-black/20 hover:border-plex/35'
            }`}
        >
            <div className={`relative bg-black/40 ${layout === 'landscape' ? 'aspect-[16/9]' : 'aspect-[2/3]'}`}>
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
            <div className="space-y-0.5 p-2.5 sm:p-3">
                <p className="truncate text-xs font-semibold text-text sm:text-sm" title={title}>
                    {title}
                </p>
                {layout === 'poster' ? (
                    <p className="truncate text-[10px] font-bold uppercase tracking-wide text-plex/90 sm:text-[11px]">{asset.label}</p>
                ) : null}
                {asset.matchDetail ? (
                    <p className="truncate text-[10px] text-muted sm:text-[11px]" title={asset.matchDetail}>{asset.matchDetail}</p>
                ) : null}
            </div>
        </button>
    );
}

function PreviewAssetGallery({
    sections,
    selectedAssetIds,
    onToggle,
}: {
    sections: PreviewAssetSections;
    selectedAssetIds: string[];
    onToggle: (id: string) => void;
}) {
    const renderStrip = (
        title: string,
        assets: PosterSetsPreviewAsset[],
        layout: 'poster' | 'landscape',
        captionFor?: (asset: PosterSetsPreviewAsset) => string | undefined,
    ) => {
        if (!assets.length) return null;
        return (
            <section className="space-y-2.5">
                <div className="flex items-baseline justify-between gap-2">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-muted">{title}</h4>
                    <span className="text-[11px] text-muted/80">{assets.length}</span>
                </div>
                <div className={previewStripClass}>
                    {assets.map((asset) => (
                        <PreviewAssetTile
                            key={asset.id}
                            asset={asset}
                            selected={selectedAssetIds.includes(asset.id)}
                            layout={layout}
                            caption={captionFor?.(asset)}
                            onToggle={onToggle}
                        />
                    ))}
                </div>
            </section>
        );
    };

    return (
        <div className="space-y-5">
            {renderStrip('Show & season covers', sections.covers, 'poster', (asset) => asset.label || asset.title)}
            {renderStrip('Posters', sections.posters, 'poster')}
            {renderStrip('Backgrounds', sections.backgrounds, 'landscape', (asset) => asset.label || 'Background')}
            {sections.titleCardSeasons.map((season) => (
                <section key={season.key} className="space-y-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                        <h4 className="text-xs font-bold uppercase tracking-wide text-muted">
                            {season.label}
                            <span className="ml-2 font-semibold normal-case tracking-normal text-muted/70">title cards</span>
                        </h4>
                        <span className="text-[11px] text-muted/80">{season.assets.length}</span>
                    </div>
                    <div className={previewStripClass}>
                        {season.assets.map((asset) => (
                            <PreviewAssetTile
                                key={asset.id}
                                asset={asset}
                                selected={selectedAssetIds.includes(asset.id)}
                                layout="landscape"
                                caption={previewAssetEpisodeLabel(asset)}
                                onToggle={onToggle}
                            />
                        ))}
                    </div>
                </section>
            ))}
            {renderStrip('Other assets', sections.other, 'poster')}
        </div>
    );
}

type BulkSetSelection = {
    url: string;
    title?: string | null;
    user?: string | null;
    thumbUrl?: string;
    provider?: string | null;
    setId?: string | null;
};

const providerLabel = (provider?: string | null) => {
    const value = String(provider || '').toLowerCase();
    if (value === 'mediux') return 'MediUX';
    if (value === 'posterdb' || value === 'tpdb' || value === 'theposterdb') return 'ThePosterDB';
    if (value === 'both') return 'Both';
    return provider || 'Provider';
};

const normalizeProviderKey = (provider?: string | null) => {
    const value = String(provider || '').toLowerCase();
    if (value === 'mediux') return 'mediux';
    if (value === 'posterdb' || value === 'tpdb' || value === 'theposterdb') return 'posterdb';
    return value || '';
};

/** MediUX blue / ThePosterDB orange source pills. */
const providerPillClass = (provider?: string | null) => {
    const key = normalizeProviderKey(provider);
    if (key === 'mediux') return 'border-sky-400/40 bg-sky-500/20 text-sky-200';
    if (key === 'posterdb') return 'border-orange-400/40 bg-orange-500/20 text-orange-200';
    return 'border-white/10 bg-white/5 text-muted';
};

const MetaPill: React.FC<{ children: React.ReactNode; className?: string; title?: string }> = ({
    children,
    className = '',
    title,
}) => (
    <span
        title={title}
        className={`inline-flex max-w-[9rem] shrink-0 items-center truncate rounded-full border px-1.5 py-0.5 text-[9px] font-bold tracking-wide sm:max-w-full sm:px-2.5 sm:py-1 sm:text-[11px] ${className}`}
    >
        {children}
    </span>
);

const ProviderPill: React.FC<{ provider?: string | null }> = ({ provider }) => {
    const key = normalizeProviderKey(provider);
    if (!key) return null;
    return (
        <MetaPill className={`uppercase ${providerPillClass(provider)}`} title={providerLabel(provider)}>
            {key === 'posterdb' ? 'TPDB' : 'MediUX'}
        </MetaPill>
    );
};

const CreatorPill: React.FC<{ user?: string | null }> = ({ user }) => {
    const handle = String(user || '').trim().replace(/^@/, '');
    if (!handle) return null;
    return (
        <MetaPill className="border-white/15 bg-white/10 text-text/90 normal-case" title={`@${handle}`}>
            @{handle}
        </MetaPill>
    );
};

const isTitleCardSet = (set?: { title?: string | null; setKind?: string | null } | null) => {
    const kind = String(set?.setKind || '').trim().toLowerCase();
    if (kind === 'title_cards' || kind === 'title-cards' || kind === 'titlecard') return true;
    return /(title\s*cards?|episode\s*cards?|cover\s*style)/i.test(String(set?.title || ''));
};

const SetKindPill: React.FC<{ set?: { title?: string | null; setKind?: string | null } | null }> = ({ set }) => {
    const kind = String(set?.setKind || '').trim().toLowerCase();
    if (kind === 'boxset') {
        return (
            <MetaPill className="border-emerald-400/35 bg-emerald-500/15 text-emerald-100" title="Full boxset">
                Boxset
            </MetaPill>
        );
    }
    if (isTitleCardSet(set)) {
        return (
            <MetaPill className="border-violet-400/35 bg-violet-500/15 text-violet-100" title="Title card pack">
                Title cards
            </MetaPill>
        );
    }
    return null;
};

function BrowseSetCard({
    set,
    onOpen,
    disabled,
}: {
    set: PosterSetsSearchSet;
    onOpen: (set: PosterSetsSearchSet) => void;
    disabled?: boolean;
}) {
    const setTitle = String(set.title || '').trim() || `Set #${set.setId}`;
    const landscape = isTitleCardSet(set);
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={() => onOpen(set)}
            className={`group shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20 text-left transition hover:border-plex/40 ${
                landscape ? 'w-[min(100%,16rem)] sm:w-64' : 'w-[7.25rem] sm:w-36'
            }`}
        >
            <div className={`relative bg-black/40 ${landscape ? 'aspect-[16/9]' : 'aspect-[2/3]'}`}>
                {set.thumbUrl ? (
                    <img
                        src={posterSetsApi.imageUrl(set.thumbUrl)}
                        alt={setTitle}
                        loading="lazy"
                        className={`h-full w-full ${landscape ? 'object-contain' : 'object-cover'}`}
                    />
                ) : (
                    <div className="flex h-full items-center justify-center text-muted">
                        <ImageIcon className="h-8 w-8 opacity-40" />
                    </div>
                )}
            </div>
            <div className="space-y-1.5 p-2.5 sm:p-3">
                <p className="truncate text-xs font-semibold text-text sm:text-sm" title={setTitle}>{setTitle}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                    <CreatorPill user={set.user} />
                    <SetKindPill set={set} />
                    <ProviderPill provider={set.provider} />
                </div>
            </div>
        </button>
    );
}

const RECENT_SETS_KEY = 'poster-sets-recent-v1';
const MAX_RECENT_SETS = 10;

type RecentSetChip = {
    url: string;
    title: string;
    user?: string | null;
    provider: string | null;
    setId: string | null;
    thumbUrl: string;
    assetCount: number | null;
    at: string;
};

const formatSetLabel = (meta?: { title?: string | null; user?: string | null } | null) => {
    const title = String(meta?.title || '').trim();
    const user = String(meta?.user || '').trim().replace(/^@/, '');
    if (!title) return user ? `@${user}` : '';
    return user ? `${title} · @${user}` : title;
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
        user: meta?.user != null ? String(meta.user).trim().replace(/^@/, '') || null : null,
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
    if (state === 'cancelled') return 'border-l-2 border-l-white/20 bg-white/[0.03]';
    return '';
};

const jobTitle = (job: PosterSetsJob) => {
    const meta = jobSetMeta(job);
    const labeled = formatSetLabel(meta);
    if (labeled) return labeled;
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
    const [searchSetsPage, setSearchSetsPage] = useState(1);
    const [searchLoadingMore, setSearchLoadingMore] = useState(false);
    const [searchContext, setSearchContext] = useState('');
    const creatorSearchAbortRef = useRef<AbortController | null>(null);
    const [selectedSearchTitle, setSelectedSearchTitle] = useState<PosterSetsSearchTitle | null>(null);
    const [selectedSearchSet, setSelectedSearchSet] = useState<PosterSetsSearchSet | null>(null);
    const [manualUrlOpen, setManualUrlOpen] = useState(false);
    const previewPanelRef = useRef<HTMLDivElement | null>(null);
    const searchSetsSectionRef = useRef<HTMLDivElement | null>(null);
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
    const [auditEntries, setAuditEntries] = useState<PosterSetsAuditEntry[]>([]);
    const [queueJobs, setQueueJobs] = useState<PosterSetsJob[]>([]);
    const [queuePaused, setQueuePaused] = useState(false);
    const [queueStats, setQueueStats] = useState<PosterSetsQueueStats>({});
    const [watches, setWatches] = useState<PosterSetsWatch[]>([]);
    const [watchStatsState, setWatchStatsState] = useState<PosterSetsWatchStats>({});
    const [watchUrlDraft, setWatchUrlDraft] = useState('');
    const [watchesPage, setWatchesPage] = useState(1);
    const [watchesPageSize, setWatchesPageSize] = useState(25);
    const [watchesFilter, setWatchesFilter] = useState('');
    const [selectedBulkSets, setSelectedBulkSets] = useState<Record<string, BulkSetSelection>>({});
    const [browseRails, setBrowseRails] = useState<PosterSetsBrowseRail[]>([]);
    const [browseLoading, setBrowseLoading] = useState(false);
    const [browseSeeAllId, setBrowseSeeAllId] = useState<string | null>(null);

    const loadHistory = useCallback(async () => {
        try {
            const response = await posterSetsApi.jobs();
            setHistoryJobs(response.jobs || []);
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to load job history', 'error');
        }
    }, [toast]);

    const loadAudit = useCallback(async () => {
        try {
            const response = await posterSetsApi.audit();
            setAuditEntries(response.entries || []);
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to load audit log', 'error');
        }
    }, [toast]);

    const loadQueue = useCallback(async () => {
        try {
            const response = await posterSetsApi.queue();
            setQueueJobs(response.jobs || []);
            setQueuePaused(Boolean(response.paused));
            setQueueStats(response.stats || {});
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to load queue', 'error');
        }
    }, [toast]);

    const loadWatches = useCallback(async () => {
        try {
            const response = await posterSetsApi.watches();
            setWatches(response.watches || []);
            setWatchStatsState(response.stats || {});
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to load watches', 'error');
        }
    }, [toast]);

    const loadBrowse = useCallback(async (options?: { refresh?: boolean; silent?: boolean }) => {
        if (!options?.silent) setBrowseLoading(true);
        try {
            const response: PosterSetsBrowseResponse = await posterSetsApi.browse({ refresh: options?.refresh });
            setBrowseRails(response.rails || []);
        } catch (error) {
            if (!options?.silent) {
                toast(error instanceof Error ? error.message : 'Failed to load browse rails', 'error');
            }
        } finally {
            if (!options?.silent) setBrowseLoading(false);
        }
    }, [toast]);

    const dismissPreviewToSearch = useCallback(() => {
        setPreview(null);
        setSelectedSearchSet(null);
        setSelectedAssetIds([]);
        requestAnimationFrame(() => {
            searchSetsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }, []);

    const currentSetMeta = useCallback((): PosterSetsSetMeta | null => {
        if (selectedSearchSet || preview?.setMeta) {
            const previewMeta = preview?.setMeta as PosterSetsSetMeta | undefined;
            return {
                provider: selectedSearchSet?.provider || previewMeta?.provider || null,
                setId: selectedSearchSet?.setId || previewMeta?.setId || null,
                url: selectedSearchSet?.url || previewMeta?.url || url || null,
                // Prefer scraped show/movie name over search card labels like "Season 3".
                title: previewMeta?.title || selectedSearchSet?.title || null,
                user: previewMeta?.user || selectedSearchSet?.user || null,
                thumbUrl: selectedSearchSet?.thumbUrl || previewMeta?.thumbUrl || '',
                assetCount: selectedSearchSet?.posterCount
                    ?? preview?.total
                    ?? previewMeta?.assetCount
                    ?? null,
            };
        }
        return url ? { url, title: null, user: null, thumbUrl: '' } : null;
    }, [preview, selectedSearchSet, url]);

    const load = useCallback(async () => {
        try {
            const [nextStatus, configResponse] = await Promise.all([
                posterSetsApi.status(),
                posterSetsApi.getConfig(),
            ]);
            setStatus(nextStatus);
            if (nextStatus.queue) setQueueStats(nextStatus.queue);
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
    useEffect(() => { void loadQueue(); }, [loadQueue]);
    useEffect(() => { void loadWatches(); }, [loadWatches]);

    useEffect(() => {
        if (tab !== 'queue' && !queueStats.pending) return undefined;
        const timer = window.setInterval(() => { void loadQueue(); }, 2000);
        return () => window.clearInterval(timer);
    }, [tab, queueStats.pending, loadQueue]);

    useEffect(() => {
        if (tab !== 'watches') return undefined;
        const timer = window.setInterval(() => { void loadWatches(); }, 8000);
        return () => window.clearInterval(timer);
    }, [tab, loadWatches]);

    useEffect(() => {
        if (tab !== 'browse') return undefined;
        void loadBrowse();
        return undefined;
    }, [tab, loadBrowse]);

    useEffect(() => {
        if (tab !== 'browse') return undefined;
        const stillLoading = browseRails.some((rail) => rail.loading);
        if (!stillLoading) return undefined;
        const timer = window.setInterval(() => {
            void loadBrowse({ silent: true });
        }, 2500);
        return () => window.clearInterval(timer);
    }, [tab, browseRails, loadBrowse]);

    useEffect(() => {
        if (!activeJob?.id || !['running', 'queued'].includes(String(activeJob.state || ''))) return undefined;
        const timer = window.setInterval(async () => {
            try {
                const response = await posterSetsApi.job(activeJob.id);
                setActiveJob(response.job);
                const state = String(response.job.state || '').toLowerCase();
                if (state && state !== 'running' && state !== 'queued') {
                    const meta = jobSetMeta(response.job);
                    if (meta?.thumbUrl || meta?.title) {
                        upsertRecentSet(meta, response.job.input?.url);
                        setRecentTick((value) => value + 1);
                    }
                    await load();
                    await loadHistory();
                    await loadQueue();
                    await loadWatches();
                    if (state === 'succeeded' || state === 'completed' || state === 'success') {
                        if (
                            configDraft.autoWatchOnApply !== false
                            && response.job.input?.url
                            && !response.job.input?.watchId
                        ) {
                            toast('Watching for new posters on this set.');
                        }
                    }
                }
            } catch {
                // keep polling until terminal or user leaves
            }
        }, 1500);
        return () => window.clearInterval(timer);
    }, [activeJob?.id, activeJob?.state, configDraft.autoWatchOnApply, load, loadHistory, loadQueue, loadWatches, toast]);

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
            const total = response.total || assets.length;
            if (!total) {
                toast('This set previewed with 0 assets. Check MediUX filters in Poster Sets settings (title cards may be off).', 'error');
            } else {
                toast(`Ready: ${matched} matched in Plex · ${total} in set.`);
            }
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

    const openBrowseSet = async (set: PosterSetsSearchSet) => {
        setBrowseSeeAllId(null);
        setTab('apply');
        setSelectedSearchSet(set);
        setUrl(set.url);
        await runPreview(set.url);
    };

    const filtersForSelectedIds = (ids: string[]) => {
        if (!ids.length) return undefined;
        const byId = new Map((preview?.assets || []).map((asset) => [asset.id, asset]));
        const selected = ids.map((id) => byId.get(id)).filter(Boolean) as PosterSetsPreviewAsset[];
        const filters = mediuxFiltersFromAssets(selected);
        return filters.length ? filters : undefined;
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
            const selected = selectedOnly ? selectedAssetIds : undefined;
            const response = await posterSetsApi.apply(
                target,
                selected,
                currentSetMeta(),
                undefined,
                selected ? filtersForSelectedIds(selected) : undefined,
            );
            setActiveJob(response.job);
            upsertRecentSet(jobSetMeta(response.job) || currentSetMeta(), target);
            setRecentTick((value) => value + 1);
            await loadQueue();
            dismissPreviewToSearch();
            toast(queuePaused
                ? 'Added to queue (paused — resume in Queue tab).'
                : selectedOnly
                    ? `Queued ${selectedAssetIds.length} selected asset(s).`
                    : 'Queued full set apply.');
            await loadHistory();
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to queue apply', 'error');
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
            ? `Queue ${matchedIds.length} matched poster${matchedIds.length === 1 ? '' : 's'} for apply?`
            : `Queue ${ids.length} poster${ids.length === 1 ? '' : 's'} for apply?`;
        const ok = await askConfirm(label, {
            title: 'Add to apply queue?',
            confirmLabel: 'Add to queue',
            cancelLabel: 'Cancel',
        });
        if (!ok) return;
        setBusy('apply');
        try {
            const target = url.trim();
            const response = await posterSetsApi.apply(
                target,
                ids,
                currentSetMeta(),
                undefined,
                filtersForSelectedIds(ids),
            );
            setActiveJob(response.job);
            upsertRecentSet(jobSetMeta(response.job) || currentSetMeta(), target);
            setRecentTick((value) => value + 1);
            await loadQueue();
            dismissPreviewToSearch();
            toast(queuePaused
                ? `Queued ${ids.length} poster${ids.length === 1 ? '' : 's'} (queue paused).`
                : `Queued ${ids.length} poster${ids.length === 1 ? '' : 's'}.`);
            await loadHistory();
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to queue apply', 'error');
        } finally {
            setBusy(null);
        }
    };

    const applyUnmatched = async () => {
        const assets = preview?.assets || [];
        const unmatchedIds = assets.filter((asset) => asset.matched === false).map((asset) => asset.id);
        if (!unmatchedIds.length) {
            toast('No unmatched posters to queue.', 'error');
            return;
        }
        setSelectedAssetIds(unmatchedIds);
        const ok = await askConfirm(
            `Queue ${unmatchedIds.length} unmatched poster${unmatchedIds.length === 1 ? '' : 's'} for apply?`,
            {
                title: 'Queue unmatched?',
                confirmLabel: 'Add to queue',
                cancelLabel: 'Cancel',
            },
        );
        if (!ok) return;
        setBusy('apply');
        try {
            const target = url.trim();
            const response = await posterSetsApi.apply(
                target,
                unmatchedIds,
                currentSetMeta(),
                undefined,
                filtersForSelectedIds(unmatchedIds),
            );
            setActiveJob(response.job);
            upsertRecentSet(jobSetMeta(response.job) || currentSetMeta(), target);
            setRecentTick((value) => value + 1);
            await loadQueue();
            dismissPreviewToSearch();
            toast(queuePaused
                ? `Queued ${unmatchedIds.length} unmatched poster${unmatchedIds.length === 1 ? '' : 's'} (queue paused).`
                : `Queued ${unmatchedIds.length} unmatched poster${unmatchedIds.length === 1 ? '' : 's'}.`);
            await loadHistory();
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to queue apply', 'error');
        } finally {
            setBusy(null);
        }
    };

    const applyNewSinceWatch = async () => {
        const target = url.trim();
        if (!target) {
            toast('Preview a set URL first.', 'error');
            return;
        }
        const assets = preview?.assets || [];
        if (!assets.length) {
            toast('No preview assets available.', 'error');
            return;
        }
        setBusy('apply');
        let newIds: string[] = [];
        try {
            let watch = watches.find((entry) => String(entry.url || '').trim() === target) || null;
            if (!watch) {
                const response = await posterSetsApi.watchByUrl(target);
                watch = response.watch || null;
            }
            const known = watch?.knownAssetIds;
            if (!watch || !Array.isArray(known)) {
                toast('Pin a watch on this set first, then try again.', 'error');
                return;
            }
            const knownSet = new Set(known.map((id) => String(id)));
            newIds = assets
                .map((asset) => asset.id)
                .filter((id) => id && !knownSet.has(String(id)));
            if (!newIds.length) {
                toast('No new assets since this watch was last checked.', 'error');
                return;
            }
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to check watch', 'error');
            return;
        } finally {
            setBusy(null);
        }

        setSelectedAssetIds(newIds);
        const ok = await askConfirm(
            `Queue ${newIds.length} new poster${newIds.length === 1 ? '' : 's'} since watch?`,
            {
                title: 'Queue new since watch?',
                confirmLabel: 'Add to queue',
                cancelLabel: 'Cancel',
            },
        );
        if (!ok) return;
        setBusy('apply');
        try {
            const response = await posterSetsApi.apply(
                target,
                newIds,
                currentSetMeta(),
                undefined,
                filtersForSelectedIds(newIds),
            );
            setActiveJob(response.job);
            upsertRecentSet(jobSetMeta(response.job) || currentSetMeta(), target);
            setRecentTick((value) => value + 1);
            await loadQueue();
            dismissPreviewToSearch();
            toast(queuePaused
                ? `Queued ${newIds.length} new poster${newIds.length === 1 ? '' : 's'} (queue paused).`
                : `Queued ${newIds.length} new poster${newIds.length === 1 ? '' : 's'}.`);
            await loadHistory();
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to queue new assets', 'error');
        } finally {
            setBusy(null);
        }
    };

    const toggleBulkSet = (entry: BulkSetSelection) => {
        const key = String(entry.url || '').trim();
        if (!key) return;
        setSelectedBulkSets((prev) => {
            const next = { ...prev };
            if (next[key]) delete next[key];
            else {
                next[key] = {
                    url: key,
                    title: entry.title ?? null,
                    user: entry.user ?? null,
                    thumbUrl: entry.thumbUrl || '',
                    provider: entry.provider ?? null,
                    setId: entry.setId != null ? String(entry.setId) : null,
                };
            }
            return next;
        });
    };

    const clearBulkSelection = () => setSelectedBulkSets({});

    const queueBulkSelected = async () => {
        const entries = Object.values(selectedBulkSets);
        if (!entries.length) return;
        if (entries.length > 5) {
            const ok = await askConfirm(`Queue ${entries.length} selected sets for apply?`, {
                title: 'Queue selected sets?',
                confirmLabel: 'Add to queue',
                cancelLabel: 'Cancel',
            });
            if (!ok) return;
        }
        setBusy('bulk-select');
        let queued = 0;
        try {
            for (const entry of entries) {
                const setMeta: PosterSetsSetMeta = {
                    url: entry.url,
                    title: entry.title ?? null,
                    user: entry.user ?? null,
                    thumbUrl: entry.thumbUrl || '',
                    provider: entry.provider ?? null,
                    setId: entry.setId ?? null,
                };
                const response = await posterSetsApi.apply(entry.url, undefined, setMeta, 'bulk');
                setActiveJob(response.job);
                upsertRecentSet(jobSetMeta(response.job) || setMeta, entry.url);
                queued += 1;
            }
            setRecentTick((value) => value + 1);
            clearBulkSelection();
            await loadQueue();
            await loadHistory();
            toast(queuePaused
                ? `Queued ${queued} set${queued === 1 ? '' : 's'} (queue paused).`
                : `Queued ${queued} set${queued === 1 ? '' : 's'}.`);
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to queue selected sets', 'error');
        } finally {
            setBusy(null);
        }
    };

    const watchBulkSelected = async () => {
        const entries = Object.values(selectedBulkSets);
        if (!entries.length) return;
        setBusy('bulk-watch');
        let added = 0;
        try {
            for (const entry of entries) {
                await posterSetsApi.addWatch({
                    url: entry.url,
                    title: entry.title || undefined,
                    user: entry.user || undefined,
                    thumbUrl: entry.thumbUrl || undefined,
                    provider: entry.provider || undefined,
                    setId: entry.setId || undefined,
                });
                added += 1;
            }
            clearBulkSelection();
            await loadWatches();
            toast(`Watching ${added} set${added === 1 ? '' : 's'}.`);
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to watch selected sets', 'error');
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
        creatorSearchAbortRef.current?.abort();
        const abort = new AbortController();
        creatorSearchAbortRef.current = abort;

        setBusy('search');
        setSearchTitles([]);
        setSearchSets([]);
        setSearchSetsPage(1);
        setSearchLoadingMore(false);
        setSearchContext('');
        setSelectedSearchTitle(null);
        setSelectedSearchSet(null);
        setPreview(null);
        try {
            if (searchMode === 'creator') {
                toast("Loading first pages… more will fill in as they're found.");
                setSearchLoadingMore(true);
                let sawFirstBatch = false;
                const finalEvent = await posterSetsApi.searchCreatorStream({
                    provider: searchProvider,
                    query: q,
                    mode: 'creator',
                    dupePreference: configDraft.dupePreference === 'mediux' ? 'mediux' : 'posterdb',
                    limit: 0,
                    batchPages: 3,
                }, {
                    signal: abort.signal,
                    onBatch: (event) => {
                        if (abort.signal.aborted) return;
                        const sets = event.sets || [];
                        setSearchSets(sets);
                        setSearchContext(event.title || `@${q.replace(/^@/, '')}`);
                        if (!sawFirstBatch && sets.length) {
                            sawFirstBatch = true;
                            setBusy(null);
                            setSearchSetsPage(1);
                            toast(`Showing first results — loading more in the background…`);
                        }
                        if (event.loading === false || event.type === 'result') {
                            setSearchLoadingMore(false);
                        } else {
                            setSearchLoadingMore(true);
                        }
                    },
                });
                if (abort.signal.aborted) return;
                const setCount = finalEvent?.sets?.length || 0;
                const dupes = Number(finalEvent?.dupesCollapsed || 0);
                const dupeNote = dupes > 0 ? ` · ${dupes} duplicate${dupes === 1 ? '' : 's'} collapsed` : '';
                setSearchLoadingMore(false);
                if (!setCount && !sawFirstBatch) {
                    toast('No matches found.', 'error');
                } else {
                    toast(`Found ${setCount} set${setCount === 1 ? '' : 's'} from ${finalEvent?.title || q}${dupeNote}.`);
                }
                if (finalEvent?.partialErrors?.length) {
                    toast(finalEvent.partialErrors[0], 'error');
                }
                return;
            }

            const response = await posterSetsApi.search({
                provider: searchProvider,
                query: q,
                mode: searchMode,
                dupePreference: configDraft.dupePreference === 'mediux' ? 'mediux' : 'posterdb',
                limit: 24,
            });
            setSearchTitles(response.titles || []);
            setSearchSets(response.sets || []);
            setSearchSetsPage(1);
            setSearchContext(response.title || q);
            const titleCount = response.titles?.length || 0;
            const setCount = response.sets?.length || 0;
            const dupes = Number(response.dupesCollapsed || 0);
            const dupeNote = dupes > 0 ? ` · ${dupes} duplicate${dupes === 1 ? '' : 's'} collapsed` : '';
            if (!titleCount && !setCount) {
                toast('No matches found.', 'error');
            } else if (titleCount) {
                toast(`Found ${titleCount} title${titleCount === 1 ? '' : 's'}${dupeNote}. Choose one.`);
            } else {
                toast(`Found ${setCount} set${setCount === 1 ? '' : 's'}${dupeNote}. Choose one to preview.`);
            }
            if (response.partialErrors?.length) {
                toast(response.partialErrors[0], 'error');
            }
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return;
            toast(error instanceof Error ? error.message : 'Search failed', 'error');
            setSearchLoadingMore(false);
        } finally {
            if (creatorSearchAbortRef.current === abort) {
                creatorSearchAbortRef.current = null;
            }
            setBusy((current) => (current === 'search' ? null : current));
            if (!abort.signal.aborted) setSearchLoadingMore(false);
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
            setSearchSetsPage(1);
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
        creatorSearchAbortRef.current?.abort();
        creatorSearchAbortRef.current = null;
        setSearchQuery('');
        setSearchTitles([]);
        setSearchSets([]);
        setSearchSetsPage(1);
        setSearchLoadingMore(false);
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

    const previewSections = useMemo(
        () => groupPreviewAssets(preview?.assets || []),
        [preview],
    );

    const searchSetsPageCount = Math.max(1, Math.ceil(searchSets.length / SEARCH_SETS_PAGE_SIZE));
    const pagedSearchSets = useMemo(() => {
        const page = Math.min(Math.max(1, searchSetsPage), searchSetsPageCount);
        const start = (page - 1) * SEARCH_SETS_PAGE_SIZE;
        return searchSets.slice(start, start + SEARCH_SETS_PAGE_SIZE);
    }, [searchSets, searchSetsPage, searchSetsPageCount]);

    const watchedUrlSet = useMemo(() => {
        const urls = new Set<string>();
        const setKeys = new Set<string>();
        for (const watch of watches) {
            const url = String(watch.url || '').trim();
            if (url) urls.add(url);
            const setId = watch.setId != null ? String(watch.setId) : '';
            const provider = String(watch.provider || '').toLowerCase();
            if (setId) setKeys.add(`${provider}:${setId}`);
        }
        return { urls, setKeys };
    }, [watches]);

    const isSetWatched = useCallback((set: { url?: string | null; setId?: string | null; provider?: string | null }) => {
        const url = String(set.url || '').trim();
        if (url && watchedUrlSet.urls.has(url)) return true;
        const setId = set.setId != null ? String(set.setId) : '';
        if (!setId) return false;
        const provider = String(set.provider || '').toLowerCase();
        return watchedUrlSet.setKeys.has(`${provider}:${setId}`);
    }, [watchedUrlSet]);

    const filteredWatches = useMemo(() => {
        const needle = watchesFilter.trim().toLowerCase();
        if (!needle) return watches;
        return watches.filter((watch) => {
            const haystack = [
                watch.title,
                watch.user,
                watch.url,
                watch.setId,
                watch.provider,
                watch.lastError,
            ].map((value) => String(value || '').toLowerCase()).join(' ');
            return haystack.includes(needle);
        });
    }, [watches, watchesFilter]);

    const watchGroups = useMemo(() => groupPosterSetsWatches(filteredWatches), [filteredWatches]);

    const watchesPageCount = Math.max(1, Math.ceil(watchGroups.length / Math.max(1, watchesPageSize)));
    const pagedWatchGroups = useMemo(() => {
        const page = Math.min(Math.max(1, watchesPage), watchesPageCount);
        const start = (page - 1) * watchesPageSize;
        return watchGroups.slice(start, start + watchesPageSize);
    }, [watchGroups, watchesPage, watchesPageCount, watchesPageSize]);

    useEffect(() => {
        setWatchesPage((page) => Math.min(page, watchesPageCount));
    }, [watchesPageCount]);

    const readyToApply = Boolean(preview?.assets?.length);

    const browseSeeAllRail = useMemo(
        () => browseRails.find((rail) => rail.id === browseSeeAllId) || null,
        [browseRails, browseSeeAllId],
    );

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
            await loadQueue();
            toast(queuePaused
                ? (fromFile ? 'Bulk file queued (paused).' : 'Bulk list queued (paused).')
                : (fromFile ? 'Bulk file added to queue.' : 'Bulk list added to queue.'));
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
                user: meta?.user != null ? String(meta.user).trim().replace(/^@/, '') || null : null,
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

    const selectedBulkCount = Object.keys(selectedBulkSets).length;
    const previewHeaderLabel = formatSetLabel(preview?.setMeta)
        || formatSetLabel(selectedSearchSet)
        || selectedSearchSet?.title
        || preview?.setMeta?.title
        || 'Poster set';

    const filteredHistory = historyFilter === 'audit'
        ? []
        : historyJobs.filter((job) => {
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

    const filteredAudit = auditEntries.filter((entry) => {
        if (!historySearch.trim()) return true;
        const needle = historySearch.toLowerCase();
        const haystack = [
            entry.id,
            entry.action,
            entry.source,
            entry.state,
            entry.error,
            entry.jobId,
            entry.url,
            formatSetLabel(entry),
        ].join(' ').toLowerCase();
        return haystack.includes(needle);
    });

    return (
        <div className={`flex w-full min-w-0 animate-fade-in flex-col gap-4 sm:gap-6 ${selectedBulkCount > 0 ? 'pb-28' : 'pb-10'}`}>
            <ToastContainer toasts={toasts} setToasts={setToasts} />

            <header className={`${cardClass} overflow-hidden p-4 sm:p-6`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-plex sm:text-xs">Poster Sets</p>
                        <h1 className="mt-1.5 text-xl font-bold tracking-tight text-text sm:mt-2 sm:text-3xl">Artwork from MediUX & ThePosterDB</h1>
                        <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted sm:mt-2 sm:text-sm">
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

            <div className="flex min-w-0 flex-wrap justify-center gap-1.5 sm:justify-start sm:gap-2">
                {([
                    ['apply', 'Apply', Sparkles],
                    ['browse', 'Browse', Compass],
                    ['queue', 'Queue', ListOrdered],
                    ['watches', 'Watching', Eye],
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
                            if (id === 'history') {
                                void loadHistory();
                                if (historyFilter === 'audit') void loadAudit();
                            }
                            if (id === 'queue') void loadQueue();
                            if (id === 'watches') void loadWatches();
                            if (id === 'browse') {
                                setBrowseSeeAllId(null);
                                void loadBrowse();
                            }
                        }}
                    >
                        <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> {label}
                        {id === 'queue' && (queueStats.pending || 0) > 0 ? (
                            <span className="rounded-full bg-background/30 px-1.5 py-0.5 text-[10px] font-bold">
                                {queueStats.pending}
                            </span>
                        ) : null}
                        {id === 'watches' && (watchStatsState.errored || 0) > 0 ? (
                            <span className="rounded-full bg-red-500/30 px-1.5 py-0.5 text-[10px] font-bold text-red-200">
                                {watchStatsState.errored}
                            </span>
                        ) : id === 'watches' && (watchStatsState.enabled || 0) > 0 ? (
                            <span className="rounded-full bg-background/30 px-1.5 py-0.5 text-[10px] font-bold">
                                {watchStatsState.enabled}
                            </span>
                        ) : null}
                    </button>
                ))}
            </div>

            {tab === 'browse' ? (
                <section className={`${cardClass} space-y-5 p-4 sm:p-5`}>
                    {browseSeeAllRail ? (
                        <>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <button
                                        type="button"
                                        className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-plex hover:underline"
                                        onClick={() => setBrowseSeeAllId(null)}
                                    >
                                        <ChevronLeft className="h-3.5 w-3.5" />
                                        Back to Browse
                                    </button>
                                    <h2 className={sectionTitleClass}>{browseSeeAllRail.title}</h2>
                                    <p className={sectionBodyClass}>
                                        {browseSeeAllRail.buffered || browseSeeAllRail.sets.length}
                                        {browseSeeAllRail.cap ? ` / ${browseSeeAllRail.cap}` : ''} sets
                                        {browseSeeAllRail.loading ? ' · loading more in the background…' : ''}
                                    </p>
                                    {browseSeeAllRail.error ? (
                                        <p className="mt-1 text-xs text-amber-200">{browseSeeAllRail.error}</p>
                                    ) : null}
                                </div>
                                <button
                                    type="button"
                                    className={buttonClass}
                                    disabled={browseLoading || busy !== null}
                                    onClick={() => void loadBrowse({ refresh: true })}
                                >
                                    {browseLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                    Refresh
                                </button>
                            </div>
                            <div className={`flex flex-wrap gap-3 ${isTitleCardSet(browseSeeAllRail.sets[0]) ? '' : ''}`}>
                                {browseSeeAllRail.sets.map((set) => (
                                    <BrowseSetCard
                                        key={`${set.provider}-${set.setId}`}
                                        set={set}
                                        disabled={busy !== null}
                                        onOpen={(item) => void openBrowseSet(item)}
                                    />
                                ))}
                            </div>
                            {!browseSeeAllRail.sets.length && browseLoading ? (
                                <div className="flex items-center gap-2 text-sm text-muted">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading sets…
                                </div>
                            ) : null}
                        </>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <h2 className={sectionTitleClass}>Browse recently added</h2>
                                    <p className={sectionBodyClass}>
                                        First results appear immediately; more fill in the background (up to 600 per row). Tap a row title to see all.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className={buttonClass}
                                    disabled={browseLoading || busy !== null}
                                    onClick={() => void loadBrowse({ refresh: true })}
                                >
                                    {browseLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                    Refresh
                                </button>
                            </div>
                            {browseLoading && !browseRails.length ? (
                                <div className="flex items-center gap-2 text-sm text-muted">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading rails…
                                </div>
                            ) : null}
                            {browseRails.map((rail) => (
                                <div key={rail.id} className="space-y-2.5">
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <button
                                            type="button"
                                            className="group inline-flex min-w-0 items-center gap-2 text-left"
                                            onClick={() => setBrowseSeeAllId(rail.id)}
                                        >
                                            <h3 className="text-sm font-bold text-text group-hover:text-plex sm:text-base">
                                                {rail.title}
                                            </h3>
                                            <span className="text-[11px] font-semibold uppercase tracking-wide text-plex/80 group-hover:underline">
                                                See all
                                            </span>
                                        </button>
                                        <span className="text-[11px] text-muted">
                                            {rail.buffered || rail.sets.length}
                                            {rail.cap ? ` / ${rail.cap}` : ''}
                                            {rail.loading ? ' · loading…' : ''}
                                        </span>
                                    </div>
                                    {rail.error ? (
                                        <p className="text-xs text-amber-200">{rail.error}</p>
                                    ) : null}
                                    <div className={previewStripClass}>
                                        {rail.sets.map((set) => (
                                            <BrowseSetCard
                                                key={`${set.provider}-${set.setId}`}
                                                set={set}
                                                disabled={busy !== null}
                                                onOpen={(item) => void openBrowseSet(item)}
                                            />
                                        ))}
                                        {!rail.sets.length && !rail.error ? (
                                            <p className="py-6 text-sm text-muted">No sets yet.</p>
                                        ) : null}
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </section>
            ) : null}

            {tab === 'queue' ? (
                <section className={`${cardClass} space-y-4 overflow-hidden p-4 sm:p-5`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                            <h2 className={sectionTitleClass}>Apply queue</h2>
                            <p className={sectionBodyClass}>
                                Sets apply one at a time in the background. You can keep queueing while paused.
                            </p>
                            <p className="mt-2 text-[11px] text-muted sm:text-xs">
                                {queuePaused ? 'Paused' : 'Running'}
                                {' · '}
                                {queueStats.queued || 0} waiting
                                {' · '}
                                {queueStats.running || 0} active
                                {' · '}
                                {queueStats.succeeded || 0} succeeded
                                {' · '}
                                {queueStats.failed || 0} failed
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                className={buttonClass}
                                disabled={busy !== null}
                                onClick={() => void loadQueue()}
                            >
                                <RefreshCw className="h-4 w-4" /> Refresh
                            </button>
                            <button
                                type="button"
                                className={queuePaused ? primaryButtonClass : buttonClass}
                                disabled={busy !== null}
                                onClick={async () => {
                                    setBusy('queue');
                                    try {
                                        const response = await posterSetsApi.pauseQueue(!queuePaused);
                                        setQueuePaused(Boolean(response.paused));
                                        setQueueStats(response.stats || {});
                                        toast(response.paused ? 'Queue paused — new applies still stack up.' : 'Queue resumed.');
                                        await loadQueue();
                                    } catch (error) {
                                        toast(error instanceof Error ? error.message : 'Failed to update queue', 'error');
                                    } finally {
                                        setBusy(null);
                                    }
                                }}
                            >
                                {queuePaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                                {queuePaused ? 'Resume' : 'Pause'}
                            </button>
                            <button
                                type="button"
                                className={buttonClass}
                                disabled={busy !== null}
                                onClick={async () => {
                                    setBusy('queue');
                                    try {
                                        await posterSetsApi.clearFinishedQueue();
                                        await loadQueue();
                                        toast('Cleared finished queue items.');
                                    } catch (error) {
                                        toast(error instanceof Error ? error.message : 'Failed to clear queue', 'error');
                                    } finally {
                                        setBusy(null);
                                    }
                                }}
                            >
                                Clear finished
                            </button>
                        </div>
                    </div>

                    {!queueJobs.length ? (
                        <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-muted">
                            Queue is empty. Apply a poster set from the Apply tab to add one.
                        </p>
                    ) : (
                        <div className="min-w-0 space-y-2 overflow-hidden">
                            {queueJobs.map((job) => {
                                const meta = jobSetMeta(job);
                                const state = String(job.state || '').toLowerCase();
                                const showName = String(meta?.title || '').trim() || jobTitle(job);
                                return (
                                    <div
                                        key={job.id}
                                        className={`min-w-0 overflow-hidden rounded-xl border border-white/10 px-3 py-3 sm:px-4 ${jobCardTone(job)}`}
                                    >
                                        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                            <div className="min-w-0 flex-1 space-y-1.5 overflow-hidden">
                                                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                                    <StatusPill value={job.state} />
                                                    <ProviderPill provider={meta?.provider} />
                                                    <CreatorPill user={meta?.user} />
                                                </div>
                                                <p className="break-words text-sm font-semibold leading-snug text-text [overflow-wrap:anywhere]" title={showName}>
                                                    {showName}
                                                </p>
                                                <p className="break-words text-[11px] text-muted sm:text-xs">
                                                    {formatTime(job.createdAt)}
                                                    {job.finishedAt ? ` · finished ${formatTime(job.finishedAt)}` : ''}
                                                    {typeof job.uploaded === 'number' ? ` · uploaded ${job.uploaded}` : ''}
                                                    {job.uploaded == null && typeof job.result?.uploaded === 'number'
                                                        ? ` · uploaded ${job.result.uploaded as number}`
                                                        : ''}
                                                    {job.input?.selectedCount ? ` · ${job.input.selectedCount} selected` : ''}
                                                </p>
                                                {job.error ? (
                                                    <p className="break-words text-xs text-red-300 sm:text-sm [overflow-wrap:anywhere]">{job.error}</p>
                                                ) : null}
                                                {meta?.url ? (
                                                    <a
                                                        href={meta.url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex max-w-full items-center gap-1 text-xs font-semibold text-plex no-underline hover:underline"
                                                    >
                                                        <span className="truncate">Open set</span> <ExternalLink className="h-3 w-3 shrink-0" />
                                                    </a>
                                                ) : null}
                                            </div>
                                            <div className="flex shrink-0 flex-wrap gap-2">
                                                {state === 'queued' ? (
                                                    <button
                                                        type="button"
                                                        className={buttonClass}
                                                        disabled={busy !== null}
                                                        onClick={async () => {
                                                            setBusy('queue');
                                                            try {
                                                                await posterSetsApi.cancelQueueJob(job.id);
                                                                await loadQueue();
                                                                toast('Removed from queue.');
                                                            } catch (error) {
                                                                toast(error instanceof Error ? error.message : 'Cancel failed', 'error');
                                                            } finally {
                                                                setBusy(null);
                                                            }
                                                        }}
                                                    >
                                                        <X className="h-4 w-4" /> Cancel
                                                    </button>
                                                ) : null}
                                                {state === 'failed' && (job.input?.url || meta?.url) ? (
                                                    <button
                                                        type="button"
                                                        className={buttonClass}
                                                        disabled={busy !== null}
                                                        onClick={() => {
                                                            const target = String(job.input?.url || meta?.url || '').trim();
                                                            if (!target) return;
                                                            setTab('apply');
                                                            setUrl(target);
                                                            void runPreview(target);
                                                        }}
                                                    >
                                                        Re-open
                                                    </button>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            ) : null}

            {tab === 'watches' ? (
                <section className={`${cardClass} space-y-4 overflow-hidden p-4 sm:p-5`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                            <h2 className={sectionTitleClass}>Watching</h2>
                            <p className={sectionBodyClass}>
                                Pin MediUX / ThePosterDB sets. New art (including MediUX title cards) is queued automatically.
                            </p>
                            <p className="mt-2 text-[11px] text-muted sm:text-xs">
                                {watchStatsState.enabled || 0} enabled
                                {' · '}
                                {watchStatsState.total || 0} total
                                {(watchStatsState.errored || 0) > 0 ? ` · ${watchStatsState.errored} with errors` : ''}
                                {configDraft.watchersEnabled === false ? ' · watchers paused in Settings' : ''}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                className={buttonClass}
                                disabled={busy !== null}
                                onClick={() => void loadWatches()}
                            >
                                <RefreshCw className="h-4 w-4" /> Refresh
                            </button>
                            <button
                                type="button"
                                className={buttonClass}
                                disabled={busy !== null || !watches.length}
                                onClick={async () => {
                                    setBusy('watches');
                                    try {
                                        const result = await posterSetsApi.runWatches();
                                        await loadWatches();
                                        await loadQueue();
                                        toast(result.queued
                                            ? `Checked ${result.checked || 0} watch(es); queued ${result.queued}.`
                                            : `Checked ${result.checked || 0} watch(es); no new art.`);
                                    } catch (error) {
                                        toast(error instanceof Error ? error.message : 'Watcher run failed', 'error');
                                    } finally {
                                        setBusy(null);
                                    }
                                }}
                            >
                                {busy === 'watches' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                                Check all now
                            </button>
                        </div>
                    </div>

                    <form
                        className="flex flex-col gap-2 sm:flex-row"
                        onSubmit={async (event) => {
                            event.preventDefault();
                            const target = watchUrlDraft.trim();
                            if (!target) {
                                toast('Paste a MediUX or ThePosterDB set URL.', 'error');
                                return;
                            }
                            setBusy('watches');
                            try {
                                await posterSetsApi.addWatch({ url: target });
                                setWatchUrlDraft('');
                                setWatchesPage(1);
                                await loadWatches();
                                toast('Watch pinned. Current assets baselined — only future new art will queue.');
                            } catch (error) {
                                toast(error instanceof Error ? error.message : 'Failed to pin watch', 'error');
                            } finally {
                                setBusy(null);
                            }
                        }}
                    >
                        <input
                            className={fieldClass}
                            placeholder="https://mediux.pro/sets/... or theposterdb.com/posters/..."
                            value={watchUrlDraft}
                            onChange={(event) => setWatchUrlDraft(event.target.value)}
                        />
                        <button type="submit" className={primaryButtonClass} disabled={busy !== null}>
                            Pin URL
                        </button>
                    </form>

                    {watches.length ? (
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                            <input
                                className={`${fieldClass} sm:max-w-xs`}
                                placeholder="Filter by title, creator, URL…"
                                value={watchesFilter}
                                onChange={(event) => {
                                    setWatchesFilter(event.target.value);
                                    setWatchesPage(1);
                                }}
                            />
                            <div className="flex flex-wrap items-center gap-2">
                                <CustomSelect
                                    value={String(watchesPageSize)}
                                    onChange={(value) => {
                                        const next = Number(value) || 25;
                                        setWatchesPageSize(next);
                                        setWatchesPage(1);
                                    }}
                                    options={[...WATCHES_PAGE_SIZE_OPTIONS]}
                                    className="w-full min-w-[140px] sm:w-auto"
                                    compact
                                />
                                {watchesPageCount > 1 ? (
                                    <>
                                        <button
                                            type="button"
                                            className={buttonClass}
                                            disabled={busy !== null || watchesPage <= 1}
                                            onClick={() => setWatchesPage((page) => Math.max(1, page - 1))}
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                            Prev
                                        </button>
                                        <span className="text-xs text-muted">
                                            Page {Math.min(watchesPage, watchesPageCount)} / {watchesPageCount}
                                            {' · '}
                                            {watchGroups.length} shown
                                            {filteredWatches.length !== watchGroups.length
                                                ? ` · ${filteredWatches.length} sets`
                                                : ''}
                                        </span>
                                        <button
                                            type="button"
                                            className={buttonClass}
                                            disabled={busy !== null || watchesPage >= watchesPageCount}
                                            onClick={() => setWatchesPage((page) => Math.min(watchesPageCount, page + 1))}
                                        >
                                            Next
                                            <ChevronRight className="h-4 w-4" />
                                        </button>
                                    </>
                                ) : (
                                    <span className="text-xs text-muted">
                                        {watchGroups.length} title{watchGroups.length === 1 ? '' : 's'}
                                        {filteredWatches.length !== watchGroups.length
                                            ? ` · ${filteredWatches.length} sets`
                                            : ''}
                                        {watchesFilter.trim() ? ` (of ${watches.length})` : ''}
                                    </span>
                                )}
                            </div>
                        </div>
                    ) : null}

                    {!watches.length ? (
                        <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-muted">
                            Apply a set and keep watching, or pin a MediUX/TPDB URL.
                            Sonarr On Import (same Scanner webhook) also refreshes matching watches after a short debounce.
                        </p>
                    ) : !filteredWatches.length ? (
                        <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-muted">
                            No sets match “{watchesFilter.trim()}”.
                        </p>
                    ) : (
                        <div className="min-w-0 space-y-3 overflow-hidden">
                            {pagedWatchGroups.map((group) => {
                                const multi = group.watches.length > 1;
                                return (
                                    <div
                                        key={group.key}
                                        className={`min-w-0 overflow-hidden rounded-xl border px-3 py-3 sm:px-4 ${
                                            group.errored
                                                ? 'border-red-500/30 bg-red-500/5'
                                                : 'border-white/10 bg-black/10'
                                        }`}
                                    >
                                        <div className="flex min-w-0 gap-3 overflow-hidden">
                                            {group.thumbUrl ? (
                                                <img
                                                    src={group.thumbUrl}
                                                    alt=""
                                                    className="h-14 w-10 shrink-0 rounded-lg object-cover sm:h-16 sm:w-12"
                                                />
                                            ) : (
                                                <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/30 sm:h-16 sm:w-12">
                                                    <ImageIcon className="h-5 w-5 text-muted" />
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1 space-y-1 overflow-hidden">
                                                <p className="break-words text-sm font-semibold leading-snug text-text [overflow-wrap:anywhere]" title={group.title}>
                                                    {group.title}
                                                </p>
                                                <p className="break-words text-[11px] text-muted sm:text-xs">
                                                    {multi ? `${group.watches.length} sets` : '1 set'}
                                                    {group.lastCheckedAt ? ` · checked ${formatTime(group.lastCheckedAt)}` : ''}
                                                </p>
                                            </div>
                                        </div>

                                        <div className={`mt-3 space-y-2 ${multi ? 'border-t border-white/10 pt-3' : 'pt-2'}`}>
                                            {group.watches.map((watch) => {
                                                const creator = String(watch.user || '').trim().replace(/^@/, '');
                                                const provider = String(watch.provider || '').toLowerCase();
                                                const setLabel = creator
                                                    ? `@${creator}`
                                                    : (watch.setId ? `Set ${watch.setId}` : 'Set');
                                                return (
                                                    <div
                                                        key={watch.id}
                                                        className={`min-w-0 overflow-hidden rounded-lg border px-2.5 py-2.5 sm:px-3 ${
                                                            watch.lastError
                                                                ? 'border-red-500/25 bg-red-500/5'
                                                                : 'border-white/10 bg-black/20'
                                                        }`}
                                                    >
                                                        <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                                                            <div className="min-w-0 flex-1 space-y-1.5 overflow-hidden">
                                                                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                                                    <StatusPill value={watch.enabled === false ? 'Paused' : 'Watching'} />
                                                                    <ProviderPill provider={provider} />
                                                                    <CreatorPill user={creator} />
                                                                    {!creator && watch.setId ? (
                                                                        <span className="text-[11px] text-muted">#{watch.setId}</span>
                                                                    ) : null}
                                                                </div>
                                                                <p className="break-words text-[11px] text-muted sm:text-xs">
                                                                    {(watch.knownAssetIds || []).length} known
                                                                    {watch.lastCheckedAt ? ` · checked ${formatTime(watch.lastCheckedAt)}` : ' · not checked yet'}
                                                                    {watch.lastNewCount ? ` · last new ${watch.lastNewCount}` : ''}
                                                                    {watch.lastAppliedAt ? ` · applied ${formatTime(watch.lastAppliedAt)}` : ''}
                                                                </p>
                                                                {watch.lastError ? (
                                                                    <p className="break-words text-xs text-red-300 sm:text-sm [overflow-wrap:anywhere]">{watch.lastError}</p>
                                                                ) : null}
                                                                <div className="pt-0.5">
                                                                    {provider === 'posterdb' ? (
                                                                        <p className="text-[11px] text-muted">TPDB has no title cards</p>
                                                                    ) : (
                                                                        <div className="flex flex-wrap gap-1.5">
                                                                            {MEDIUX_FILTER_OPTIONS.map((option) => {
                                                                                const current = (watch.mediuxFilters?.length
                                                                                    ? watch.mediuxFilters
                                                                                    : ALL_MEDIUX_FILTER_IDS);
                                                                                const active = current.includes(option.id);
                                                                                return (
                                                                                    <button
                                                                                        key={option.id}
                                                                                        type="button"
                                                                                        className={`${active ? primaryButtonClass : buttonClass} !px-2 !py-1 text-[10px]`}
                                                                                        disabled={busy !== null}
                                                                                        onClick={async () => {
                                                                                            const base = watch.mediuxFilters?.length
                                                                                                ? [...watch.mediuxFilters]
                                                                                                : [...ALL_MEDIUX_FILTER_IDS];
                                                                                            const next = new Set(base);
                                                                                            if (next.has(option.id)) next.delete(option.id);
                                                                                            else next.add(option.id);
                                                                                            const mediuxFilters = ALL_MEDIUX_FILTER_IDS.filter((id) => next.has(id));
                                                                                            setBusy('watches');
                                                                                            try {
                                                                                                await posterSetsApi.patchWatch(watch.id, { mediuxFilters });
                                                                                                await loadWatches();
                                                                                            } catch (error) {
                                                                                                toast(error instanceof Error ? error.message : 'Failed to update filters', 'error');
                                                                                            } finally {
                                                                                                setBusy(null);
                                                                                            }
                                                                                        }}
                                                                                    >
                                                                                        {option.label}
                                                                                    </button>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                {watch.url ? (
                                                                    <a
                                                                        href={watch.url}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        className="inline-flex items-center gap-1 text-xs font-semibold text-plex no-underline hover:underline"
                                                                    >
                                                                        Open set <ExternalLink className="h-3 w-3" />
                                                                    </a>
                                                                ) : null}
                                                            </div>
                                                            <div className="flex shrink-0 flex-wrap gap-2">
                                                                <button
                                                                    type="button"
                                                                    className={buttonClass}
                                                                    disabled={busy !== null}
                                                                    onClick={async () => {
                                                                        setBusy('watches');
                                                                        try {
                                                                            await posterSetsApi.toggleWatch(watch.id);
                                                                            await loadWatches();
                                                                        } catch (error) {
                                                                            toast(error instanceof Error ? error.message : 'Toggle failed', 'error');
                                                                        } finally {
                                                                            setBusy(null);
                                                                        }
                                                                    }}
                                                                >
                                                                    {watch.enabled === false ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                                                                    {watch.enabled === false ? 'Enable' : 'Pause'}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className={buttonClass}
                                                                    disabled={busy !== null}
                                                                    onClick={async () => {
                                                                        setBusy('watches');
                                                                        try {
                                                                            const result = await posterSetsApi.checkWatch(watch.id);
                                                                            await loadWatches();
                                                                            await loadQueue();
                                                                            if (result.baseline) {
                                                                                toast('Baselined current assets.');
                                                                            } else if (result.queued) {
                                                                                toast(`Queued ${result.newIds?.length || 0} new asset(s).`);
                                                                            } else {
                                                                                toast('No new art on this set.');
                                                                            }
                                                                        } catch (error) {
                                                                            await loadWatches();
                                                                            toast(error instanceof Error ? error.message : 'Check failed', 'error');
                                                                        } finally {
                                                                            setBusy(null);
                                                                        }
                                                                    }}
                                                                >
                                                                    <RefreshCw className="h-4 w-4" /> Check now
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className={buttonClass}
                                                                    disabled={busy !== null}
                                                                    onClick={async () => {
                                                                        const ok = await askConfirm(`Remove ${setLabel} watch for “${group.title}”?`, {
                                                                            title: 'Remove watch?',
                                                                            confirmLabel: 'Remove',
                                                                            cancelLabel: 'Cancel',
                                                                        });
                                                                        if (!ok) return;
                                                                        setBusy('watches');
                                                                        try {
                                                                            await posterSetsApi.deleteWatch(watch.id);
                                                                            await loadWatches();
                                                                            toast('Watch removed.');
                                                                        } catch (error) {
                                                                            toast(error instanceof Error ? error.message : 'Delete failed', 'error');
                                                                        } finally {
                                                                            setBusy(null);
                                                                        }
                                                                    }}
                                                                >
                                                                    <Trash2 className="h-4 w-4" /> Remove
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                            {watchesPageCount > 1 ? (
                                <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                                    <button
                                        type="button"
                                        className={buttonClass}
                                        disabled={busy !== null || watchesPage <= 1}
                                        onClick={() => setWatchesPage((page) => Math.max(1, page - 1))}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                        Prev
                                    </button>
                                    <span className="text-xs text-muted">
                                        Page {Math.min(watchesPage, watchesPageCount)} / {watchesPageCount}
                                    </span>
                                    <button
                                        type="button"
                                        className={buttonClass}
                                        disabled={busy !== null || watchesPage >= watchesPageCount}
                                        onClick={() => setWatchesPage((page) => Math.min(watchesPageCount, page + 1))}
                                    >
                                        Next
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    )}
                </section>
            ) : null}

            {tab === 'recent' ? (
                <section className={`${cardClass} space-y-3 p-5`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h2 className={sectionTitleClass}>Recent sets</h2>
                            <p className={sectionBodyClass}>
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
                            {recentSets.map((item) => {
                                const label = formatSetLabel(item) || item.title;
                                const bulkSelected = Boolean(selectedBulkSets[item.url]);
                                return (
                                <div
                                    key={item.url}
                                    className={`relative overflow-hidden rounded-2xl border bg-black/20 ${
                                        bulkSelected ? 'border-plex/50 ring-1 ring-plex/30' : 'border-white/10'
                                    }`}
                                >
                                    <label
                                        className="absolute left-2 top-2 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-white/20 bg-black/60"
                                        onClick={(event) => event.stopPropagation()}
                                    >
                                        <input
                                            type="checkbox"
                                            className="h-3.5 w-3.5 accent-[var(--plex,#e5a00d)]"
                                            checked={bulkSelected}
                                            onChange={() => toggleBulkSet({
                                                url: item.url,
                                                title: item.title,
                                                user: item.user,
                                                thumbUrl: item.thumbUrl,
                                                provider: item.provider,
                                                setId: item.setId,
                                            })}
                                            onClick={(event) => event.stopPropagation()}
                                            aria-label={`Select ${label}`}
                                        />
                                    </label>
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
                                                user: item.user,
                                                provider: item.provider || undefined,
                                                posterCount: item.assetCount,
                                            });
                                            setTab('apply');
                                            void runPreview(item.url);
                                        }}
                                        title={`Preview ${label}`}
                                    >
                                        <div className="relative aspect-[2/3] bg-black/40">
                                            {item.thumbUrl ? (
                                                <img
                                                    src={posterSetsApi.imageUrl(item.thumbUrl)}
                                                    alt={label}
                                                    loading="lazy"
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                <div className="flex h-full items-center justify-center text-muted">
                                                    <ImageIcon className="h-8 w-8 opacity-40" />
                                                </div>
                                            )}
                                            <span className="absolute right-2 top-2 rounded-full border border-white/15 bg-black/55 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text">
                                                {providerLabel(item.provider)}
                                            </span>
                                        </div>
                                        <div className="space-y-1 p-3">
                                            <p className="truncate text-sm font-semibold text-text" title={label}>{label}</p>
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
                                                    user: item.user,
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
                                );
                            })}
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
                                            creatorSearchAbortRef.current?.abort();
                                            setSearchProvider(id);
                                            if (id !== 'both') setFindProvider(id);
                                            setSearchTitles([]);
                                            setSearchSets([]);
                                            setSearchSetsPage(1);
                                            setSearchLoadingMore(false);
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
                                            creatorSearchAbortRef.current?.abort();
                                            setSearchMode(id);
                                            setSearchTitles([]);
                                            setSearchSets([]);
                                            setSearchSetsPage(1);
                                            setSearchLoadingMore(false);
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
                                            {formatSetLabel(preview?.setMeta)
                                                || formatSetLabel(selectedSearchSet)
                                                || selectedSearchSet.title
                                                || `Set #${selectedSearchSet.setId}`}
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

                            <div className="flex flex-col">
                            {searchSets.length ? (
                                <div ref={searchSetsSectionRef} className="order-2 mt-4 space-y-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-xs font-bold uppercase tracking-wide text-muted">
                                            2. Choose a poster set{searchContext ? ` · ${searchContext}` : ''}
                                            {searchSets.length > SEARCH_SETS_PAGE_SIZE
                                                ? ` · ${searchSets.length} sets`
                                                : ''}
                                            {searchLoadingMore ? ' · loading more…' : ''}
                                            {readyToApply ? ' · pick another set anytime' : ''}
                                        </p>
                                        {searchSetsPageCount > 1 ? (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    className={buttonClass}
                                                    disabled={(busy !== null && busy !== 'preview') || searchSetsPage <= 1}
                                                    onClick={() => setSearchSetsPage((page) => Math.max(1, page - 1))}
                                                >
                                                    <ChevronLeft className="h-4 w-4" />
                                                    Prev
                                                </button>
                                                <span className="text-xs text-muted">
                                                    Page {Math.min(searchSetsPage, searchSetsPageCount)} / {searchSetsPageCount}
                                                </span>
                                                <button
                                                    type="button"
                                                    className={buttonClass}
                                                    disabled={(busy !== null && busy !== 'preview') || searchSetsPage >= searchSetsPageCount}
                                                    onClick={() => setSearchSetsPage((page) => Math.min(searchSetsPageCount, page + 1))}
                                                >
                                                    Next
                                                    <ChevronRight className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ) : null}
                                    </div>
                                    <div className={posterGridClass} style={posterGridStyle}>
                                        {pagedSearchSets.map((set) => {
                                            const setTitle = String(set.title || '').trim() || `Set #${set.setId}`;
                                            const setLabel = formatSetLabel(set) || setTitle;
                                            const bulkSelected = Boolean(selectedBulkSets[set.url]);
                                            const watching = isSetWatched(set);
                                            const landscape = isTitleCardSet(set);
                                            return (
                                            <div
                                                key={`${set.provider || findProvider}-${set.setId}`}
                                                className={`relative overflow-hidden rounded-2xl border text-left transition ${
                                                    selectedSearchSet?.setId === set.setId
                                                    && (selectedSearchSet?.provider || '') === (set.provider || '')
                                                        ? 'border-plex/60 bg-plex/10 ring-1 ring-plex/30'
                                                        : bulkSelected
                                                            ? 'border-plex/40 bg-black/20 ring-1 ring-plex/20'
                                                            : 'border-white/10 bg-black/20 hover:border-plex/40'
                                                }`}
                                            >
                                                <label
                                                    className="absolute left-2 top-2 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-white/20 bg-black/60"
                                                    onClick={(event) => event.stopPropagation()}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        className="h-3.5 w-3.5 accent-[var(--plex,#e5a00d)]"
                                                        checked={bulkSelected}
                                                        onChange={() => toggleBulkSet({
                                                            url: set.url,
                                                            title: set.title,
                                                            user: set.user,
                                                            thumbUrl: set.thumbUrl,
                                                            provider: set.provider,
                                                            setId: set.setId,
                                                        })}
                                                        onClick={(event) => event.stopPropagation()}
                                                        aria-label={`Select ${setLabel}`}
                                                    />
                                                </label>
                                                {watching ? (
                                                    <span
                                                        className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-lg"
                                                        title="Already watching"
                                                    >
                                                        <Eye className="h-3 w-3" /> Watching
                                                    </span>
                                                ) : null}
                                                <button
                                                    type="button"
                                                    className="block w-full text-left"
                                                    disabled={busy !== null && busy !== 'preview'}
                                                    onClick={() => void pickSearchSet(set)}
                                                >
                                                <div className={`relative bg-black/40 ${landscape ? 'aspect-[16/9]' : 'aspect-[2/3]'}`}>
                                                    {set.thumbUrl ? (
                                                        <img
                                                            src={posterSetsApi.imageUrl(set.thumbUrl)}
                                                            alt={setLabel}
                                                            className={`h-full w-full ${landscape ? 'object-contain' : 'object-cover'} ${watching ? 'opacity-80' : ''}`}
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
                                                <div className="space-y-1.5 p-3">
                                                    <p className="truncate text-sm font-semibold text-text" title={setTitle}>{setTitle}</p>
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <CreatorPill user={set.user} />
                                                        <SetKindPill set={set} />
                                                        <ProviderPill provider={set.provider} />
                                                        {set.alsoOn?.length ? (
                                                            <span className="truncate text-[11px] text-muted">
                                                                also {set.alsoOn.map((entry) => providerLabel(entry.provider)).join(', ')}
                                                            </span>
                                                        ) : null}
                                                        {set.posterCount ? (
                                                            <span className="truncate text-[11px] text-muted">{set.posterCount}</span>
                                                        ) : null}
                                                    </div>
                                                </div>
                                                </button>
                                            </div>
                                            );
                                        })}
                                    </div>
                                    {searchSetsPageCount > 1 ? (
                                        <div className="flex items-center justify-center gap-2 pt-1">
                                            <button
                                                type="button"
                                                className={buttonClass}
                                                disabled={(busy !== null && busy !== 'preview') || searchSetsPage <= 1}
                                                onClick={() => setSearchSetsPage((page) => Math.max(1, page - 1))}
                                            >
                                                <ChevronLeft className="h-4 w-4" />
                                                Prev
                                            </button>
                                            <span className="text-xs text-muted">
                                                Page {Math.min(searchSetsPage, searchSetsPageCount)} / {searchSetsPageCount}
                                            </span>
                                            <button
                                                type="button"
                                                className={buttonClass}
                                                disabled={(busy !== null && busy !== 'preview') || searchSetsPage >= searchSetsPageCount}
                                                onClick={() => setSearchSetsPage((page) => Math.min(searchSetsPageCount, page + 1))}
                                            >
                                                Next
                                                <ChevronRight className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}

                            {readyToApply ? (
                                <div ref={previewPanelRef} className="order-1 mt-4 space-y-4 rounded-2xl border border-plex/30 bg-plex/10 p-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold uppercase tracking-wide text-plex">3. Preview</p>
                                            <h3 className="mt-1 truncate text-lg font-bold text-text" title={previewHeaderLabel}>
                                                {previewHeaderLabel}
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
                                            <p className="mt-1 text-xs text-muted">
                                                Covers are tall posters; title cards show as landscape galleries by season. Tap to select.
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
                                                            setUrl('');
                                                            requestAnimationFrame(() => {
                                                                searchSetsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                                            });
                                                        }}
                                                    >
                                                        Back to search results
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
                                                Queue matched{matchedAssetCount ? ` (${matchedAssetCount})` : selectedAssetIds.length ? ` (${selectedAssetIds.length})` : ''}
                                            </button>
                                            <button
                                                type="button"
                                                className={buttonClass}
                                                disabled={busy !== null}
                                                onClick={async () => {
                                                    const ok = await askConfirm('Queue the entire set, including posters not matched in your libraries?', {
                                                        title: 'Queue full set?',
                                                        confirmLabel: 'Add to queue',
                                                        cancelLabel: 'Cancel',
                                                    });
                                                    if (!ok) return;
                                                    void runApply(false);
                                                }}
                                            >
                                                Queue entire set
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-3 border-t border-white/10 pt-4">
                                        <div className="flex flex-wrap gap-2">
                                            <button type="button" className={buttonClass} onClick={() => selectPreviewAssets('matched')}>Matched only</button>
                                            <button
                                                type="button"
                                                className={buttonClass}
                                                disabled={busy !== null}
                                                onClick={() => void applyUnmatched()}
                                            >
                                                Queue unmatched
                                            </button>
                                            <button
                                                type="button"
                                                className={buttonClass}
                                                disabled={busy !== null}
                                                onClick={() => void applyNewSinceWatch()}
                                            >
                                                Queue new since watch
                                            </button>
                                            <button type="button" className={buttonClass} onClick={() => selectPreviewAssets('all')}>Select all</button>
                                            <button type="button" className={buttonClass} onClick={() => selectPreviewAssets('none')}>Clear selection</button>
                                            <button
                                                type="button"
                                                className={buttonClass}
                                                disabled={busy !== null || !selectedAssetIds.length}
                                                onClick={() => void runApply(true)}
                                            >
                                                Queue selected ({selectedAssetIds.length})
                                            </button>
                                        </div>
                                        <PreviewAssetGallery
                                            sections={previewSections}
                                            selectedAssetIds={selectedAssetIds}
                                            onToggle={toggleAsset}
                                        />
                                    </div>

                                    <div className="sticky bottom-3 z-10 flex flex-wrap gap-2 rounded-xl border border-plex/40 bg-card/95 p-3 shadow-lg backdrop-blur">
                                        <button
                                            type="button"
                                            className={`${primaryButtonClass} flex-1 sm:flex-none sm:min-w-[220px]`}
                                            disabled={busy !== null || (matchedAssetCount < 1 && !selectedAssetIds.length)}
                                            onClick={() => void applyMatched()}
                                        >
                                            {busy === 'apply' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                            Queue matched{matchedAssetCount ? ` (${matchedAssetCount})` : selectedAssetIds.length ? ` (${selectedAssetIds.length})` : ''}
                                        </button>
                                        <button
                                            type="button"
                                            className={buttonClass}
                                            disabled={busy !== null || !selectedAssetIds.length}
                                            onClick={() => void runApply(true)}
                                        >
                                            Queue selected ({selectedAssetIds.length})
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                            </div>

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
                                                {readyToApply ? `Queue matched (${matchedAssetCount || selectedAssetIds.length})` : 'Queue apply'}
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
                            <h2 className="text-lg font-bold text-text">
                                {historyFilter === 'audit' ? 'Audit log' : 'Job history'}
                            </h2>
                            <p className="mt-1 text-sm text-muted">
                                {historyFilter === 'audit'
                                    ? 'Manual, watch, and bulk apply events with upload counts.'
                                    : 'Apply and bulk runs with logs. Recent jobs survive restarts.'}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {([
                                ['all', 'All'],
                                ['running', 'Running'],
                                ['succeeded', 'Succeeded'],
                                ['failed', 'Failed'],
                                ['audit', 'Audit log'],
                            ] as const).map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    className={`${buttonClass} ${historyFilter === value ? 'border-plex/40 bg-plex/15 text-plex' : ''}`}
                                    onClick={() => {
                                        setHistoryFilter(value);
                                        if (value === 'audit') void loadAudit();
                                    }}
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
                        placeholder={historyFilter === 'audit'
                            ? 'Search title, source, job id…'
                            : 'Search URL, job id, type…'}
                    />

                    {historyFilter === 'audit' ? (
                        <div className="space-y-2">
                            {filteredAudit.map((entry) => {
                                const label = formatSetLabel(entry) || entry.url || entry.action || 'Audit entry';
                                const source = String(entry.source || 'manual').toLowerCase();
                                return (
                                    <article
                                        key={entry.id}
                                        className={`${cardClass} min-w-0 space-y-2 overflow-hidden p-3 sm:p-4 ${entry.jobId ? 'cursor-pointer transition hover:border-plex/40' : ''}`}
                                        onClick={() => {
                                            if (!entry.jobId) return;
                                            void openHistoryJob(entry.jobId);
                                            setHistoryFilter('all');
                                        }}
                                    >
                                        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1 space-y-1 overflow-hidden">
                                                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                                        source === 'watch'
                                                            ? 'border-plex/40 bg-plex/15 text-plex'
                                                            : source === 'bulk'
                                                                ? 'border-sky-500/40 bg-sky-500/15 text-sky-200'
                                                                : 'border-white/10 bg-white/5 text-muted'
                                                    }`}>
                                                        {source}
                                                    </span>
                                                    {entry.state ? <StatusPill value={entry.state} /> : null}
                                                </div>
                                                <p className="break-words text-sm font-semibold text-text [overflow-wrap:anywhere]" title={label}>{label}</p>
                                                {entry.jobId ? (
                                                    <p className="font-mono text-xs text-muted">job #{entry.jobId.slice(0, 8)}</p>
                                                ) : null}
                                            </div>
                                            <time className="shrink-0 text-xs text-muted" dateTime={entry.at || undefined}>
                                                {formatTime(entry.at)}
                                            </time>
                                        </div>
                                        <div className="flex flex-wrap gap-2 text-[11px] text-muted">
                                            {typeof entry.uploaded === 'number' ? (
                                                <span className="text-emerald-300">
                                                    Uploaded {entry.uploaded}
                                                    {typeof entry.attempted === 'number' ? ` / ${entry.attempted}` : ''}
                                                </span>
                                            ) : null}
                                            {typeof entry.selectedCount === 'number' ? (
                                                <span>{entry.selectedCount} selected</span>
                                            ) : null}
                                            {entry.error ? <span className="text-red-300">{entry.error}</span> : null}
                                        </div>
                                    </article>
                                );
                            })}
                            {!filteredAudit.length ? (
                                <p className={`${cardClass} p-5 text-sm text-muted`}>
                                    No audit entries yet. Applies and watch checks will appear here.
                                </p>
                            ) : null}
                        </div>
                    ) : (
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
                                        className={`${cardClass} min-w-0 cursor-pointer space-y-2 overflow-hidden p-3 transition hover:border-plex/40 sm:p-4 ${selected ? 'border-plex/50' : ''} ${jobCardTone(job)}`}
                                        onClick={() => void openHistoryJob(job.id)}
                                    >
                                        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                                            <div className="flex min-w-0 flex-1 items-start gap-3 overflow-hidden">
                                                {meta?.thumbUrl ? (
                                                    <img
                                                        src={posterSetsApi.imageUrl(meta.thumbUrl)}
                                                        alt=""
                                                        className="h-14 w-10 shrink-0 rounded-md object-cover"
                                                        loading="lazy"
                                                    />
                                                ) : null}
                                                <div className="min-w-0 flex-1 overflow-hidden">
                                                    <p className="break-words text-sm font-semibold text-text [overflow-wrap:anywhere]" title={jobTitle(job)}>
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
                    )}
                </div>
            ) : null}

            {tab === 'settings' ? (
                <section className={`${cardClass} space-y-5 p-5`}>
                    <div>
                        <h2 className={sectionTitleClass}>Poster Sets config</h2>
                        <p className={sectionBodyClass}>
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
                    <div className="space-y-0 rounded-xl border border-white/10 bg-black/20 px-4">
                        <SettingsToggleRow
                            title="Enable set watchers"
                            description="Periodically re-scrape pinned sets and queue only new assets (respects Queue pause)."
                            checked={configDraft.watchersEnabled !== false}
                            onChange={(next) => setConfigDraft((prev) => ({ ...prev, watchersEnabled: next }))}
                        />
                        <SettingsToggleRow
                            title="Auto-watch on apply"
                            description="After a successful apply from a set URL, pin that set so future new art is queued automatically."
                            checked={configDraft.autoWatchOnApply !== false}
                            onChange={(next) => setConfigDraft((prev) => ({ ...prev, autoWatchOnApply: next }))}
                        />
                        <SettingsToggleRow
                            title="Gotify digest when watchers queue new art"
                            description="Send a digest notification when set watchers enqueue new posters."
                            checked={configDraft.notifyOnWatcherDigest !== false}
                            onChange={(next) => setConfigDraft((prev) => ({ ...prev, notifyOnWatcherDigest: next }))}
                        />
                        <SettingsToggleRow
                            title="Check watches when Sonarr imports episodes"
                            description="Uses the existing Scanner Sonarr On Import webhook. Debounces 3 minutes per show/season, then checks matching watches for new title cards."
                            checked={configDraft.arrWatchHookEnabled !== false}
                            onChange={(next) => setConfigDraft((prev) => ({ ...prev, arrWatchHookEnabled: next }))}
                            border={false}
                        />
                    </div>
                    <label className="block max-w-xs">
                        <span className="text-xs font-bold uppercase tracking-wide text-muted">watch interval (hours)</span>
                        <input
                            className={`${fieldClass} mt-2`}
                            type="number"
                            min={1}
                            step={1}
                            value={configDraft.watchIntervalHours ?? 6}
                            onChange={(event) => {
                                const hours = Math.max(1, Number(event.target.value) || 6);
                                setConfigDraft((prev) => ({ ...prev, watchIntervalHours: hours }));
                            }}
                        />
                        <span className="mt-1 block text-[11px] text-muted">Default 6. Minimum 1.</span>
                    </label>
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
            {selectedBulkCount > 0 ? (
                <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-50 flex justify-center px-4 md:bottom-6">
                    <div className="pointer-events-auto flex w-full max-w-3xl flex-wrap items-center gap-2 rounded-xl border border-plex/40 bg-card/95 p-3 shadow-lg backdrop-blur">
                        <span className="text-sm font-semibold text-text">
                            {selectedBulkCount} selected
                        </span>
                        <button
                            type="button"
                            className={primaryButtonClass}
                            disabled={busy !== null}
                            onClick={() => void queueBulkSelected()}
                        >
                            {busy === 'bulk-select' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListOrdered className="h-4 w-4" />}
                            Queue selected
                        </button>
                        <button
                            type="button"
                            className={buttonClass}
                            disabled={busy !== null}
                            onClick={() => void watchBulkSelected()}
                        >
                            {busy === 'bulk-watch' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                            Watch selected
                        </button>
                        <button
                            type="button"
                            className={buttonClass}
                            disabled={busy !== null}
                            onClick={clearBulkSelection}
                        >
                            Clear
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default PosterSetsDashboard;
