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
    Library,
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
import { usePoll } from '../shared/usePoll';
import { CustomSelect, SettingsToggleRow } from '../shared/ui';
import { askConfirm } from '../shared/confirm';
import {
    parsePosterSetsUrl,
    writePosterSetsUrl,
    type PosterSetsUrlState,
} from './urlState';
import {
    normalizeUpgraderGridSize,
    UPGRADER_GRID_SIZE_OPTIONS,
    upgraderLandscapeGridStyle,
    upgraderPosterGridClass,
    upgraderPosterGridStyle,
    type UpgraderGridSize,
} from '../shared/portalLayout';
import { posterSetsApi } from './api';
import { classifyPreviewAsset } from './previewGroups';
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
import { pickAutoMatchedTitle } from './autoMatchTitle';
import {
    clearLibraryRecentCache,
    readLibraryRecentCache,
    readLibrarySearchCache,
    writeLibraryRecentCache,
    writeLibrarySearchCache,
} from './libraryCache';
import {
    libraryItemPosterSrc,
    normalizeLibraryItems,
    type LibraryRecentItem,
} from './libraryRecent';

const POSTER_SETS_GRID_STORAGE_KEY = 'posterSetsGridSize';
const POSTER_SETS_GRID_OPTIONS = UPGRADER_GRID_SIZE_OPTIONS.filter((option) => option.value !== 'list');
const SEARCH_SETS_PAGE_SIZE = 24;
const WATCHES_PAGE_SIZE_OPTIONS = [
    { value: '12', label: '12 per page' },
    { value: '24', label: '24 per page' },
    { value: '36', label: '36 per page' },
    { value: '48', label: '48 per page' },
] as const;
const ALL_MEDIUX_FILTER_IDS = MEDIUX_FILTER_OPTIONS.map((option) => option.id);
const TITLE_CARD_ONLY_FILTERS = ['title_card'];

/** Survive Poster Sets remounts so Browse doesn't flash empty while the server cache answers. */
let browseRailsCache: PosterSetsBrowseRail[] = [];

const cardClass = 'glass-card shadow-xl';
const buttonClass = 'inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs font-semibold text-text transition hover:border-plex/40 hover:bg-white/5 disabled:pointer-events-none disabled:opacity-40 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm';
const primaryButtonClass = 'inline-flex items-center justify-center gap-1.5 rounded-xl bg-plex px-2.5 py-1.5 text-xs font-bold text-background transition hover:bg-plex-hover active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm';
const fieldClass = 'w-full rounded-lg border border-white/10 bg-background/70 px-3 py-2 text-xs text-text placeholder:text-muted/60 outline-none transition focus:border-plex focus:ring-1 focus:ring-plex sm:py-2.5 sm:text-sm';
const sectionTitleClass = 'text-base font-bold text-text sm:text-lg';
const sectionBodyClass = 'mt-1 text-xs text-muted sm:text-sm';
const posterMediaRadiusClass = 'rounded-md';
const previewStripClass = 'flex w-full min-w-0 gap-3 overflow-x-auto overscroll-x-contain scroll-smooth pb-1 touch-pan-x [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden';

type TabId = 'apply' | 'browse' | 'library' | 'queue' | 'watches' | 'recent' | 'history' | 'settings';
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
            className={`group shrink-0 overflow-hidden ${posterMediaRadiusClass} border text-left transition ${
                layout === 'landscape' ? 'w-64 sm:w-72' : 'w-[7.25rem] sm:w-36'
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

function PreviewAssetStrip({
    title,
    count,
    children,
}: {
    title: React.ReactNode;
    count: number;
    children: React.ReactNode;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [atStart, setAtStart] = useState(true);
    const [atEnd, setAtEnd] = useState(true);

    const updateScrollState = useCallback(() => {
        const node = scrollRef.current;
        if (!node) return;
        const { scrollLeft, scrollWidth, clientWidth } = node;
        const margin = 8;
        const canScroll = scrollWidth > clientWidth + margin;
        if (!canScroll) {
            setAtStart(true);
            setAtEnd(true);
            return;
        }
        setAtStart(scrollLeft <= margin);
        setAtEnd(scrollLeft >= scrollWidth - clientWidth - margin);
    }, []);

    useEffect(() => {
        updateScrollState();
        const node = scrollRef.current;
        if (!node) return undefined;
        const resizeObserver = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(() => updateScrollState())
            : null;
        resizeObserver?.observe(node);
        const timer = window.setTimeout(updateScrollState, 120);
        window.addEventListener('resize', updateScrollState);
        return () => {
            resizeObserver?.disconnect();
            window.clearTimeout(timer);
            window.removeEventListener('resize', updateScrollState);
        };
    }, [children, updateScrollState]);

    const scrollByPage = (direction: 'left' | 'right') => {
        const node = scrollRef.current;
        if (!node) return;
        const amount = Math.max(240, Math.floor(node.clientWidth * 0.85));
        node.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
    };

    const showArrows = !(atStart && atEnd);

    return (
        <section className="min-w-0 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-baseline gap-2">
                    <h4 className="min-w-0 text-xs font-bold uppercase tracking-wide text-muted">{title}</h4>
                    <span className="shrink-0 text-[11px] text-muted/80">{count}</span>
                </div>
                {showArrows ? (
                    <div className="flex shrink-0 items-center gap-0.5">
                        <button
                            type="button"
                            onClick={() => scrollByPage('left')}
                            disabled={atStart}
                            className={`rounded-md border border-white/10 p-1 transition ${
                                atStart ? 'cursor-default text-muted/30' : 'text-muted hover:border-plex/40 hover:bg-white/5 hover:text-text'
                            }`}
                            aria-label="Scroll left"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => scrollByPage('right')}
                            disabled={atEnd}
                            className={`rounded-md border border-white/10 p-1 transition ${
                                atEnd ? 'cursor-default text-muted/30' : 'text-muted hover:border-plex/40 hover:bg-white/5 hover:text-text'
                            }`}
                            aria-label="Scroll right"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                ) : null}
            </div>
            <div
                ref={scrollRef}
                onScroll={updateScrollState}
                className={previewStripClass}
            >
                {children}
            </div>
        </section>
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
            <PreviewAssetStrip title={title} count={assets.length}>
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
            </PreviewAssetStrip>
        );
    };

    return (
        <div className="min-w-0 space-y-5">
            {renderStrip('Show & season covers', sections.covers, 'poster', (asset) => asset.label || asset.title)}
            {renderStrip('Posters', sections.posters, 'poster')}
            {renderStrip('Backgrounds', sections.backgrounds, 'landscape', (asset) => asset.label || 'Background')}
            {sections.titleCardSeasons.map((season) => (
                <PreviewAssetStrip
                    key={season.key}
                    count={season.assets.length}
                    title={(
                        <>
                            {season.label}
                            <span className="ml-2 font-semibold normal-case tracking-normal text-muted/70">title cards</span>
                        </>
                    )}
                >
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
                </PreviewAssetStrip>
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
    setKind?: string | null;
};

const bulkEntryFromSet = (set: PosterSetsSearchSet): BulkSetSelection => ({
    url: set.url,
    title: set.title,
    user: set.user,
    thumbUrl: set.thumbUrl,
    provider: set.provider,
    setId: set.setId,
    setKind: set.setKind || (isTitleCardSet(set) ? 'title_cards' : null),
});

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

const MetaPill: React.FC<{
    children: React.ReactNode;
    className?: string;
    title?: string;
    truncate?: boolean;
    compact?: boolean;
}> = ({
    children,
    className = '',
    title,
    truncate = true,
    compact = false,
}) => (
    <span
        title={title}
        className={`inline-flex items-center rounded-full border font-bold tracking-wide ${
            compact
                ? 'px-1.5 py-px text-[8px] sm:text-[9px]'
                : 'px-1.5 py-0.5 text-[9px] sm:px-2.5 sm:py-1 sm:text-[11px]'
        } ${
            truncate ? 'max-w-full shrink truncate' : 'max-w-full shrink-0 whitespace-normal break-all'
        } ${className}`}
    >
        {children}
    </span>
);

const ProviderPill: React.FC<{ provider?: string | null; compact?: boolean }> = ({ provider, compact }) => {
    const key = normalizeProviderKey(provider);
    if (!key) return null;
    return (
        <MetaPill
            compact={compact}
            className={`uppercase !max-w-none !shrink-0 ${providerPillClass(provider)}`}
            title={providerLabel(provider)}
        >
            {key === 'posterdb' ? 'TPDB' : 'MediUX'}
        </MetaPill>
    );
};

/** Proxied poster thumb with retry + graceful fallback when TPDB rate-limits. */
const PosterThumb: React.FC<{
    src?: string | null;
    alt?: string;
    className?: string;
    imgClassName?: string;
    loading?: 'lazy' | 'eager';
    onLoad?: (event: React.SyntheticEvent<HTMLImageElement>) => void;
}> = ({ src, alt = '', className = '', imgClassName = '', loading = 'lazy', onLoad }) => {
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const resolved = String(src || '').trim();
    useEffect(() => {
        setFailed(false);
        setAttempt(0);
    }, [resolved]);
    if (!resolved || failed) {
        return (
            <div className={`flex items-center justify-center bg-black text-muted ${className}`}>
                <ImageIcon className="h-8 w-8 opacity-40 sm:h-10 sm:w-10" />
            </div>
        );
    }
    return (
        <div className={`overflow-hidden bg-black ${className}`}>
            <img
                key={`${resolved}::${attempt}`}
                src={resolved}
                alt={alt}
                loading={loading}
                decoding="async"
                className={imgClassName || 'h-full w-full object-contain object-center'}
                onLoad={onLoad}
                onError={() => {
                    if (attempt < 2) {
                        window.setTimeout(() => setAttempt((value) => value + 1), 900 + attempt * 700);
                        return;
                    }
                    setFailed(true);
                }}
            />
        </div>
    );
};

const CreatorPill: React.FC<{
    user?: string | null;
    onOpen?: (user: string) => void;
    compact?: boolean;
}> = ({ user, onOpen, compact }) => {
    const handle = String(user || '').trim().replace(/^@+/, '');
    if (!handle) return null;
    const label = `@${handle}`;
    if (!onOpen) {
        return (
            <MetaPill
                compact={compact}
                truncate={false}
                className="border-white/15 bg-white/10 text-text/90 normal-case"
                title={label}
            >
                {label}
            </MetaPill>
        );
    }
    return (
        <button
            type="button"
            title={`View all posters by ${label}`}
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpen(handle);
            }}
            className={`inline-flex max-w-full shrink-0 items-center whitespace-normal break-all rounded-full border border-white/15 bg-white/10 font-bold tracking-wide text-text/90 normal-case transition hover:border-plex/50 hover:bg-plex/15 hover:text-plex ${
                compact
                    ? 'px-1.5 py-px text-[8px] sm:text-[9px]'
                    : 'px-1.5 py-0.5 text-[9px] sm:px-2.5 sm:py-1 sm:text-[11px]'
            }`}
        >
            {label}
        </button>
    );
};

const isTitleCardSet = (set?: { title?: string | null; setKind?: string | null } | null) => {
    const kind = String(set?.setKind || '').trim().toLowerCase();
    if (kind === 'title_cards' || kind === 'title-cards' || kind === 'titlecard') return true;
    return /(title\s*cards?|episode\s*cards?|cover\s*style)/i.test(String(set?.title || ''));
};

const isTitleCardRail = (rail?: PosterSetsBrowseRail | null) => {
    if (!rail) return false;
    if (rail.id === 'mediux_title_cards') return true;
    const sample = rail.sets.slice(0, 8);
    return sample.length > 0 && sample.every((set) => isTitleCardSet(set));
};

const SetKindPill: React.FC<{
    set?: { title?: string | null; setKind?: string | null } | null;
    compact?: boolean;
}> = ({ set, compact }) => {
    const kind = String(set?.setKind || '').trim().toLowerCase();
    if (kind === 'boxset') {
        return (
            <MetaPill compact={compact} className="border-emerald-400/35 bg-emerald-500/15 text-emerald-100" title="Full boxset">
                Boxset
            </MetaPill>
        );
    }
    if (isTitleCardSet(set)) {
        return (
            <MetaPill compact={compact} className="border-violet-400/35 bg-violet-500/15 text-violet-100" title="Title card pack">
                Title cards
            </MetaPill>
        );
    }
    return null;
};

function BrowseSetCard({
    set,
    onOpen,
    onOpenCreator,
    disabled,
    bulkSelected = false,
    onToggleBulk,
}: {
    set: PosterSetsSearchSet;
    onOpen: (set: PosterSetsSearchSet) => void;
    onOpenCreator?: (user: string) => void;
    disabled?: boolean;
    bulkSelected?: boolean;
    onToggleBulk?: () => void;
}) {
    const setTitle = String(set.title || '').trim() || `Set #${set.setId}`;
    const landscape = isTitleCardSet(set);
    return (
        <div className={`group relative flex w-full min-w-0 flex-col overflow-hidden ${posterMediaRadiusClass} border bg-black/20 text-center transition hover:border-plex/40 ${
            bulkSelected ? 'border-plex/40 ring-1 ring-plex/20' : 'border-white/10'
        }`}>
            {onToggleBulk ? (
                <label
                    className="absolute left-2 top-2 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-white/20 bg-black/60"
                    onClick={(event) => event.stopPropagation()}
                >
                    <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-[var(--plex,#e5a00d)]"
                        checked={bulkSelected}
                        onChange={onToggleBulk}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`Select ${setTitle}`}
                    />
                </label>
            ) : null}
            <button
                type="button"
                disabled={disabled}
                onClick={() => onOpen(set)}
                className="flex w-full min-w-0 flex-col text-center disabled:opacity-50"
            >
                <div className={`relative w-full shrink-0 overflow-hidden bg-black ${landscape ? 'aspect-[16/9]' : 'aspect-[2/3]'}`}>
                    <PosterThumb
                        src={set.thumbUrl ? posterSetsApi.imageUrl(set.thumbUrl) : ''}
                        alt={setTitle}
                        className="absolute inset-0 h-full w-full"
                        imgClassName="absolute inset-0 h-full w-full object-contain object-center"
                    />
                </div>
                <div className="min-w-0 px-1.5 pt-1.5 sm:px-2 sm:pt-1.5">
                    <p className="line-clamp-2 text-center text-[10px] font-medium leading-snug text-text/90 sm:text-[11px]" title={setTitle}>{setTitle}</p>
                </div>
            </button>
            <div className="flex flex-wrap items-center justify-center gap-0.5 px-1.5 pb-1.5 pt-1 sm:px-2 sm:pb-2">
                <CreatorPill user={set.user} onOpen={onOpenCreator} compact />
                <SetKindPill set={set} compact />
                <ProviderPill provider={set.provider} compact />
            </div>
        </div>
    );
}

function LibraryMediaCard({
    item,
    disabled,
    onOpen,
}: {
    item: LibraryRecentItem;
    disabled?: boolean;
    onOpen: (item: LibraryRecentItem) => void;
}) {
    const label = item.year ? `${item.title} (${item.year})` : item.title;
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={() => onOpen(item)}
            className="group flex w-full min-w-0 flex-col overflow-hidden rounded-md border border-white/10 bg-black/20 text-left transition hover:border-plex/40 disabled:opacity-50"
        >
            <div className="relative aspect-[2/3] w-full shrink-0 overflow-hidden bg-black">
                <PosterThumb
                    src={libraryItemPosterSrc(item)}
                    alt={item.title}
                    className="absolute inset-0 h-full w-full"
                    imgClassName="absolute inset-0 h-full w-full object-cover"
                />
                <span className="absolute left-2 top-2 rounded-full border border-white/15 bg-black/55 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                    {item.mediaType === 'movie' ? 'Movie' : 'TV'}
                </span>
            </div>
            <div className="min-w-0 px-2 py-2">
                <p className="line-clamp-2 text-center text-[11px] font-semibold leading-snug text-text sm:text-xs" title={label}>
                    {item.title}
                </p>
                {item.year ? (
                    <p className="mt-0.5 text-center text-[10px] text-muted">{item.year}</p>
                ) : null}
            </div>
        </button>
    );
}

function RelatedSetsRail({
    sets,
    loading,
    mediaLabel,
    disabled,
    onOpen,
    onOpenCreator,
}: {
    sets: PosterSetsSearchSet[];
    loading: boolean;
    mediaLabel: string;
    disabled?: boolean;
    onOpen: (set: PosterSetsSearchSet) => void;
    onOpenCreator?: (user: string) => void;
}) {
    if (!loading && !sets.length) return null;
    return (
        <div className="space-y-2.5 border-t border-white/10 pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted">
                    Other sets for this {mediaLabel}
                </h3>
                {loading ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Finding sets…
                    </span>
                ) : (
                    <span className="text-[11px] text-muted">{sets.length} available</span>
                )}
            </div>
            {sets.length ? (
                <div className={previewStripClass}>
                    {sets.map((set) => (
                        <div
                            key={`${set.provider || 'set'}-${set.setId}`}
                            className="w-[7.5rem] shrink-0 sm:w-36"
                        >
                            <BrowseSetCard
                                set={set}
                                disabled={disabled}
                                onOpen={onOpen}
                                onOpenCreator={onOpenCreator}
                            />
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-xs text-muted">Looking for more packs on MediUX and ThePosterDB…</p>
            )}
        </div>
    );
}

const normalizeRelatedTitle = (value?: string | null) => String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const inferPreviewMediaType = (
    preview: PosterSetsPreview | null | undefined,
): 'movie' | 'show' => {
    const metaType = String(preview?.setMeta?.mediaType || '').trim().toLowerCase();
    if (metaType === 'show' || metaType === 'tv' || metaType === 'series') return 'show';
    if (metaType === 'movie' || metaType === 'movies') return 'movie';
    const assets = preview?.assets || [];
    if (assets.some((asset) => asset.kind === 'show')) return 'show';
    if ((preview?.shows || 0) > 0) return 'show';
    return 'movie';
};

const relatedSetKey = (set: { provider?: string | null; setId?: string | null; url?: string | null }) => {
    const setId = set.setId != null ? String(set.setId).trim() : '';
    const provider = String(set.provider || '').trim().toLowerCase();
    if (provider && setId) return `${provider}:${setId}`;
    const url = String(set.url || '').trim().toLowerCase().replace(/\/+$/, '');
    return url || '';
};

const pickBestRelatedTitle = (
    titles: PosterSetsSearchTitle[],
    wantTitle: string,
    wantYear?: number | null,
) => {
    const want = normalizeRelatedTitle(wantTitle);
    if (!want || !titles.length) return null;
    let best: PosterSetsSearchTitle | null = null;
    let bestScore = 0;
    for (const title of titles) {
        const normalized = normalizeRelatedTitle(title.title);
        if (!normalized) continue;
        let score = 0;
        if (normalized === want) score += 100;
        else if (normalized.includes(want) || want.includes(normalized)) score += 45;
        else continue;
        if (wantYear && title.year && Number(title.year) === Number(wantYear)) score += 25;
        if (score > bestScore) {
            bestScore = score;
            best = title;
        }
    }
    return bestScore >= 45 ? best : null;
};

const RECENT_SETS_KEY = 'poster-sets-recent-v2';
const RECENT_SETS_KEY_LEGACY = 'poster-sets-recent-v1';
const MAX_RECENT_SETS = 36;

type RecentSetCategory = 'posters' | 'backgrounds' | 'title_cards';

type RecentSetChip = {
    url: string;
    title: string;
    user?: string | null;
    provider: string | null;
    setId: string | null;
    thumbUrl: string;
    assetCount: number | null;
    setKind?: string | null;
    at: string;
};

const isBackgroundSet = (set?: { title?: string | null; setKind?: string | null } | null) => {
    const kind = String(set?.setKind || '').trim().toLowerCase();
    if (kind === 'backgrounds' || kind === 'background' || kind === 'backdrop' || kind === 'backdrops') return true;
    return /\b(backgrounds?|backdrops?)\b/i.test(String(set?.title || ''));
};

const normalizeRecentSetKind = (value?: string | null): RecentSetCategory | null => {
    const kind = String(value || '').trim().toLowerCase().replace(/-/g, '_');
    if (!kind) return null;
    if (kind === 'title_cards' || kind === 'title_card' || kind === 'titlecards') return 'title_cards';
    if (kind === 'backgrounds' || kind === 'background' || kind === 'backdrop' || kind === 'backdrops') {
        return 'backgrounds';
    }
    if (kind === 'posters' || kind === 'poster' || kind === 'covers' || kind === 'boxset') return 'posters';
    return null;
};

const inferRecentSetKindFromAssets = (assets?: PosterSetsPreviewAsset[] | null): RecentSetCategory | null => {
    if (!assets?.length) return null;
    const kinds = new Set(assets.map((asset) => classifyPreviewAsset(asset)));
    if (kinds.size === 1 && kinds.has('title_card')) return 'title_cards';
    if (kinds.size === 1 && kinds.has('background')) return 'backgrounds';
    if ([...kinds].every((kind) => kind === 'title_card' || kind === 'background') && kinds.has('title_card') && !kinds.has('background')) {
        return 'title_cards';
    }
    if ([...kinds].every((kind) => kind === 'background')) return 'backgrounds';
    if ([...kinds].every((kind) => kind === 'show_cover' || kind === 'season_cover' || kind === 'poster')) {
        return 'posters';
    }
    return null;
};

const inferRecentSetKindFromFilters = (filters?: string[] | null): RecentSetCategory | null => {
    const list = (Array.isArray(filters) ? filters : [])
        .map((item) => String(item || '').trim().toLowerCase())
        .filter(Boolean);
    if (!list.length) return null;
    if (list.every((item) => item === 'title_card')) return 'title_cards';
    if (list.every((item) => item === 'background')) return 'backgrounds';
    if (list.every((item) => item === 'show_cover' || item === 'season_cover')) return 'posters';
    return null;
};

const classifyRecentSet = (item: {
    title?: string | null;
    setKind?: string | null;
    mediuxFilters?: string[] | null;
}): RecentSetCategory => {
    const fromKind = normalizeRecentSetKind(item.setKind);
    if (fromKind) return fromKind;
    const fromFilters = inferRecentSetKindFromFilters(item.mediuxFilters);
    if (fromFilters) return fromFilters;
    if (isTitleCardSet(item)) return 'title_cards';
    if (isBackgroundSet(item)) return 'backgrounds';
    return 'posters';
};

const RECENT_CATEGORY_ORDER: Array<{ id: RecentSetCategory; title: string; landscape: boolean }> = [
    { id: 'posters', title: 'Posters', landscape: false },
    { id: 'backgrounds', title: 'Backgrounds', landscape: true },
    { id: 'title_cards', title: 'Title cards', landscape: true },
];

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

const normalizeRecentChip = (raw: any): RecentSetChip | null => {
    if (!raw?.url) return null;
    const url = String(raw.url || '').trim();
    if (!url) return null;
    const ref = parseSetRef(url);
    return {
        url,
        title: String(raw.title || (ref.setId ? `Set ${ref.setId}` : 'Poster set')).trim() || 'Poster set',
        user: raw.user != null ? String(raw.user).trim().replace(/^@/, '') || null : null,
        provider: raw.provider || ref.provider,
        setId: raw.setId != null ? String(raw.setId) : ref.setId,
        thumbUrl: String(raw.thumbUrl || ''),
        assetCount: Number.isFinite(Number(raw.assetCount)) ? Number(raw.assetCount) : null,
        setKind: normalizeRecentSetKind(raw.setKind) || (isTitleCardSet(raw) ? 'title_cards' : isBackgroundSet(raw) ? 'backgrounds' : null),
        at: String(raw.at || new Date(0).toISOString()),
    };
};

const readRecentSets = (): RecentSetChip[] => {
    try {
        const raw = localStorage.getItem(RECENT_SETS_KEY) || localStorage.getItem(RECENT_SETS_KEY_LEGACY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [];
        return parsed.map(normalizeRecentChip).filter(Boolean) as RecentSetChip[];
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

const upsertRecentSet = (
    meta: PosterSetsSetMeta | null | undefined,
    fallbackUrl?: string,
    options?: {
        setKind?: string | null;
        assets?: PosterSetsPreviewAsset[] | null;
        mediuxFilters?: string[] | null;
    },
) => {
    const url = String(meta?.url || fallbackUrl || '').trim();
    if (!url) return;
    const ref = parseSetRef(url);
    const setKind = normalizeRecentSetKind(options?.setKind)
        || normalizeRecentSetKind(meta?.setKind)
        || inferRecentSetKindFromAssets(options?.assets)
        || inferRecentSetKindFromFilters(options?.mediuxFilters)
        || (isTitleCardSet({ title: meta?.title, setKind: meta?.setKind }) ? 'title_cards' : null)
        || (isBackgroundSet({ title: meta?.title, setKind: meta?.setKind }) ? 'backgrounds' : null)
        || 'posters';
    const next: RecentSetChip = {
        url,
        title: String(meta?.title || (ref.setId ? `Set ${ref.setId}` : 'Poster set')).trim() || 'Poster set',
        user: meta?.user != null ? String(meta.user).trim().replace(/^@/, '') || null : null,
        provider: meta?.provider || ref.provider,
        setId: meta?.setId != null ? String(meta.setId) : ref.setId,
        thumbUrl: String(meta?.thumbUrl || ''),
        assetCount: Number.isFinite(Number(meta?.assetCount)) ? Number(meta?.assetCount) : null,
        setKind,
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

    const initialLocation = useMemo(
        () => (typeof window !== 'undefined'
            ? parsePosterSetsUrl()
            : { tab: 'apply' as TabId, rail: null, setUrl: null, creator: null, titleCardsOnly: false }),
        [],
    );
    const [tab, setTab] = useState<TabId>(initialLocation.tab);
    const [busy, setBusy] = useState<string | null>(null);
    const [status, setStatus] = useState<PosterSetsStatus | null>(null);
    const [configDraft, setConfigDraft] = useState<PosterSetsConfig>(DEFAULT_POSTER_SETS_CONFIG);
    const [tvText, setTvText] = useState(listToText(DEFAULT_POSTER_SETS_CONFIG.tv_library));
    const [movieText, setMovieText] = useState(listToText(DEFAULT_POSTER_SETS_CONFIG.movie_library));
    const [whitelistText, setWhitelistText] = useState(listToText(DEFAULT_POSTER_SETS_CONFIG.creatorWhitelist));
    const [url, setUrl] = useState(initialLocation.setUrl || '');
    const [titleCardsOnly, setTitleCardsOnly] = useState(Boolean(initialLocation.titleCardsOnly));
    const [bulkText, setBulkText] = useState('');
    const [findProvider, setFindProvider] = useState<SetProvider>('mediux');
    const [findId, setFindId] = useState('');
    const [searchProvider, setSearchProvider] = useState<SearchProvider>('both');
    const [searchMode, setSearchMode] = useState<'title' | 'creator'>(initialLocation.creator ? 'creator' : 'title');
    const [searchQuery, setSearchQuery] = useState(initialLocation.creator || '');
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
    const [relatedSets, setRelatedSets] = useState<PosterSetsSearchSet[]>([]);
    const [relatedSetsLoading, setRelatedSetsLoading] = useState(false);
    const relatedSetsAbortRef = useRef<AbortController | null>(null);
    const relatedSetsGenRef = useRef(0);
    const browseLoadGenRef = useRef(0);
    const queueLoadGenRef = useRef(0);
    const watchesLoadGenRef = useRef(0);
    const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
    const [activeJob, setActiveJob] = useState<PosterSetsJob | null>(null);
    const [testResult, setTestResult] = useState<string | null>(null);
    const [historyJobs, setHistoryJobs] = useState<PosterSetsJob[]>([]);
    const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
    const [historySearch, setHistorySearch] = useState('');
    const [selectedHistoryJob, setSelectedHistoryJob] = useState<PosterSetsJob | null>(null);
    const [selectedQueueJob, setSelectedQueueJob] = useState<PosterSetsJob | null>(null);
    const [auditEntries, setAuditEntries] = useState<PosterSetsAuditEntry[]>([]);
    const [queueJobs, setQueueJobs] = useState<PosterSetsJob[]>([]);
    const [queuePaused, setQueuePaused] = useState(false);
    const [queueStats, setQueueStats] = useState<PosterSetsQueueStats>({});
    const [watches, setWatches] = useState<PosterSetsWatch[]>([]);
    const [watchStatsState, setWatchStatsState] = useState<PosterSetsWatchStats>({});
    const [watchUrlDraft, setWatchUrlDraft] = useState('');
    const [watchesPage, setWatchesPage] = useState(1);
    const [watchesPageSize, setWatchesPageSize] = useState(12);
    const [watchesFilter, setWatchesFilter] = useState('');
    const [selectedBulkSets, setSelectedBulkSets] = useState<Record<string, BulkSetSelection>>({});
    const [browseRails, setBrowseRails] = useState<PosterSetsBrowseRail[]>(() => browseRailsCache);
    const browseRailsRef = useRef<PosterSetsBrowseRail[]>(browseRailsCache);
    browseRailsRef.current = browseRails;
    const [browseLoading, setBrowseLoading] = useState(false);
    const [browseSeeAllId, setBrowseSeeAllId] = useState<string | null>(initialLocation.rail);
    const [libraryShows, setLibraryShows] = useState<LibraryRecentItem[]>([]);
    const [libraryMovies, setLibraryMovies] = useState<LibraryRecentItem[]>([]);
    const [libraryLoading, setLibraryLoading] = useState(false);
    const [libraryError, setLibraryError] = useState<string | null>(null);
    const [librarySearchQuery, setLibrarySearchQuery] = useState('');
    const [librarySearchResults, setLibrarySearchResults] = useState<LibraryRecentItem[]>([]);
    const [librarySearching, setLibrarySearching] = useState(false);
    const librarySearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const libraryLoadGenRef = useRef(0);
    const scrollPreviewAfterLoadRef = useRef(false);
    const syncedSetUrlRef = useRef<string | null>(initialLocation.setUrl);
    const titleCardsOnlyRef = useRef(Boolean(initialLocation.titleCardsOnly));
    const deepLinkHandledRef = useRef(false);
    const openCreatorCatalogRef = useRef<(username: string, options?: { skipUrl?: boolean }) => void>(() => {});

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
        const gen = ++queueLoadGenRef.current;
        try {
            const response = await posterSetsApi.queue();
            if (gen !== queueLoadGenRef.current) return;
            setQueueJobs(response.jobs || []);
            setQueuePaused(Boolean(response.paused));
            setQueueStats(response.stats || {});
        } catch (error) {
            if (gen !== queueLoadGenRef.current) return;
            toast(error instanceof Error ? error.message : 'Failed to load queue', 'error');
        }
    }, [toast]);

    const loadWatches = useCallback(async () => {
        const gen = ++watchesLoadGenRef.current;
        try {
            const response = await posterSetsApi.watches();
            if (gen !== watchesLoadGenRef.current) return;
            setWatches(response.watches || []);
            setWatchStatsState(response.stats || {});
        } catch (error) {
            if (gen !== watchesLoadGenRef.current) return;
            toast(error instanceof Error ? error.message : 'Failed to load watches', 'error');
        }
    }, [toast]);

    const loadLibraryRecent = useCallback(async (options?: { silent?: boolean; refresh?: boolean }) => {
        const requestId = ++libraryLoadGenRef.current;
        setLibraryError(null);

        if (options?.refresh) {
            clearLibraryRecentCache();
        }

        const cached = !options?.refresh ? readLibraryRecentCache() : null;
        if (cached) {
            setLibraryMovies(cached.movies);
            setLibraryShows(cached.shows);
        }

        const silent = options?.silent || !!cached;
        if (!silent) setLibraryLoading(true);

        try {
            const response = await posterSetsApi.libraryRecent(120, { refresh: options?.refresh });
            if (requestId !== libraryLoadGenRef.current) return;
            const movies = normalizeLibraryItems(response.movies || []);
            const shows = normalizeLibraryItems(response.shows || []);
            const merged = normalizeLibraryItems(response.items || []);
            const movieList = movies.length ? movies : merged.filter((item) => item.mediaType === 'movie');
            const showList = shows.length ? shows : merged.filter((item) => item.mediaType === 'show');
            setLibraryMovies(movieList);
            setLibraryShows(showList);
            writeLibraryRecentCache({ movies: movieList, shows: showList });
        } catch (error) {
            if (requestId !== libraryLoadGenRef.current) return;
            const message = error instanceof Error ? error.message : 'Failed to load recently added library items';
            setLibraryError(message);
            if (!silent) toast(message, 'error');
        } finally {
            if (requestId === libraryLoadGenRef.current) {
                setLibraryLoading(false);
            }
        }
    }, [toast]);

    const runLibrarySearch = useCallback(async (query: string, options?: { refresh?: boolean }) => {
        const q = String(query || '').trim();
        if (!q) {
            setLibrarySearchResults([]);
            setLibrarySearching(false);
            return;
        }

        const cached = !options?.refresh ? readLibrarySearchCache(q) : null;
        if (cached?.length) {
            setLibrarySearchResults(cached);
        }

        const silent = !!cached?.length;
        if (!silent) setLibrarySearching(true);
        setLibraryError(null);
        try {
            const response = await posterSetsApi.librarySearch(q, 48, { refresh: options?.refresh });
            const results = normalizeLibraryItems(response.results || []);
            setLibrarySearchResults(results);
            writeLibrarySearchCache(q, results);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Library search failed';
            setLibraryError(message);
            if (!silent) toast(message, 'error');
            if (!cached?.length) setLibrarySearchResults([]);
        } finally {
            setLibrarySearching(false);
        }
    }, [toast]);

    const loadBrowse = useCallback(async (options?: { refresh?: boolean; silent?: boolean }) => {
        const hasCachedRails = browseRailsRef.current.length > 0;
        const silent = Boolean(options?.silent || (hasCachedRails && !options?.refresh));
        const requestId = ++browseLoadGenRef.current;
        if (!silent) setBrowseLoading(true);
        try {
            const response: PosterSetsBrowseResponse = await posterSetsApi.browse({ refresh: options?.refresh });
            if (requestId !== browseLoadGenRef.current) return;
            const nextRails = response.rails || [];
            const prevRails = browseRailsRef.current;
            // Don't let an empty in-flight snapshot wipe cards we already have.
            const merged = nextRails.map((rail) => {
                const prev = prevRails.find((entry) => entry.id === rail.id);
                if (
                    prev?.sets?.length
                    && !(rail.sets?.length)
                    && (rail.loading || options?.refresh)
                ) {
                    return {
                        ...rail,
                        sets: prev.sets,
                        buffered: prev.sets.length,
                    };
                }
                return rail;
            });
            const applied = merged.length ? merged : (prevRails.length && !options?.refresh ? prevRails : nextRails);
            setBrowseRails(applied);
            browseRailsCache = applied;
        } catch (error) {
            if (requestId !== browseLoadGenRef.current) return;
            if (!silent) {
                toast(error instanceof Error ? error.message : 'Failed to load browse rails', 'error');
            }
        } finally {
            if (requestId === browseLoadGenRef.current && !silent) setBrowseLoading(false);
        }
    }, [toast]);

    const dismissPreviewToSearch = useCallback(() => {
        setPreview(null);
        setSelectedSearchSet(null);
        setSelectedAssetIds([]);
        setTitleCardsOnly(false);
        syncedSetUrlRef.current = null;
        const creator = searchMode === 'creator' ? String(searchQuery || '').trim().replace(/^@+/, '') || null : null;
        writePosterSetsUrl({
            tab: 'apply',
            rail: null,
            setUrl: null,
            creator,
            titleCardsOnly: false,
        }, 'replace');
        requestAnimationFrame(() => {
            searchSetsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }, [searchMode, searchQuery]);

    const pushPosterLocation = useCallback((next: PosterSetsUrlState, mode: 'push' | 'replace' = 'push') => {
        syncedSetUrlRef.current = next.tab === 'apply' ? next.setUrl : null;
        const nextTitleCards = Boolean(next.tab === 'apply' && next.titleCardsOnly && next.setUrl);
        titleCardsOnlyRef.current = nextTitleCards;
        setTitleCardsOnly(nextTitleCards);
        writePosterSetsUrl(next, mode);
    }, []);

    const goToTab = useCallback((id: TabId, options?: { rail?: string | null; mode?: 'push' | 'replace' }) => {
        setTab(id);
        const rail = id === 'browse' ? (options?.rail !== undefined ? options.rail : null) : null;
        if (id === 'browse') setBrowseSeeAllId(rail);
        else setBrowseSeeAllId(null);
        if (id !== 'apply') {
            syncedSetUrlRef.current = null;
            titleCardsOnlyRef.current = false;
            setTitleCardsOnly(false);
        }
        pushPosterLocation({
            tab: id,
            rail,
            setUrl: null,
            creator: null,
            titleCardsOnly: false,
        }, options?.mode || 'push');
        if (id === 'history') {
            void loadHistory();
            if (historyFilter === 'audit') void loadAudit();
        }
        if (id === 'queue') void loadQueue();
        if (id === 'watches') void loadWatches();
        if (id === 'browse') void loadBrowse({ silent: browseRailsRef.current.length > 0 });
        if (id === 'library') void loadLibraryRecent({ silent: libraryShows.length > 0 || libraryMovies.length > 0 });
    }, [historyFilter, loadAudit, loadBrowse, loadHistory, loadLibraryRecent, loadQueue, loadWatches, libraryMovies.length, libraryShows.length, pushPosterLocation]);

    const openBrowseRail = useCallback((railId: string | null) => {
        setTab('browse');
        setBrowseSeeAllId(railId);
        pushPosterLocation({
            tab: 'browse',
            rail: railId,
            setUrl: null,
            creator: null,
            titleCardsOnly: false,
        }, 'push');
    }, [pushPosterLocation]);

    const currentSetMeta = useCallback((): PosterSetsSetMeta | null => {
        if (selectedSearchSet || preview?.setMeta) {
            const previewMeta = preview?.setMeta as PosterSetsSetMeta | undefined;
            const setKind = normalizeRecentSetKind(selectedSearchSet?.setKind)
                || normalizeRecentSetKind(previewMeta?.setKind)
                || (titleCardsOnly || isTitleCardSet(selectedSearchSet) ? 'title_cards' : null)
                || inferRecentSetKindFromAssets(preview?.assets)
                || null;
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
                setKind,
            };
        }
        return url ? {
            url,
            title: null,
            user: null,
            thumbUrl: '',
            setKind: titleCardsOnly ? 'title_cards' : null,
        } : null;
    }, [preview, selectedSearchSet, titleCardsOnly, url]);

    const rememberRecentFromContext = useCallback((
        meta: PosterSetsSetMeta | null | undefined,
        fallbackUrl?: string,
        extra?: { mediuxFilters?: string[] | null },
    ) => {
        upsertRecentSet(meta, fallbackUrl, {
            setKind: meta?.setKind || (titleCardsOnly ? 'title_cards' : null),
            assets: preview?.assets,
            mediuxFilters: extra?.mediuxFilters
                || (titleCardsOnly ? TITLE_CARD_ONLY_FILTERS : undefined),
        });
        setRecentTick((value) => value + 1);
    }, [preview?.assets, titleCardsOnly]);

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
            setWhitelistText(listToText(cfg.creatorWhitelist));
            await loadHistory();
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to load Poster Sets', 'error');
        }
    }, [loadHistory, toast]);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => { void loadQueue(); }, [loadQueue]);
    useEffect(() => { void loadWatches(); }, [loadWatches]);

    usePoll(() => { void loadQueue(); }, (tab === 'queue' || queueStats.pending) ? 2000 : null, { immediate: false });

    usePoll(() => { void loadWatches(); }, tab === 'watches' ? 8000 : null, { immediate: false });

    useEffect(() => {
        if (tab !== 'browse') return undefined;
        void loadBrowse({ silent: browseRailsRef.current.length > 0 });
        return undefined;
    }, [tab, loadBrowse]);

    useEffect(() => {
        if (tab !== 'library' || !status) return undefined;
        void loadLibraryRecent({ silent: libraryShows.length > 0 || libraryMovies.length > 0 });
        return undefined;
    }, [tab, status, libraryMovies.length, libraryShows.length, loadLibraryRecent]);

    useEffect(() => {
        if (tab !== 'library') return undefined;
        if (librarySearchDebounceRef.current) {
            clearTimeout(librarySearchDebounceRef.current);
            librarySearchDebounceRef.current = null;
        }
        const q = librarySearchQuery.trim();
        if (q.length < 2) {
            setLibrarySearchResults([]);
            setLibrarySearching(false);
            return undefined;
        }
        librarySearchDebounceRef.current = setTimeout(() => {
            void runLibrarySearch(q);
        }, 350);
        return () => {
            if (librarySearchDebounceRef.current) {
                clearTimeout(librarySearchDebounceRef.current);
                librarySearchDebounceRef.current = null;
            }
        };
    }, [librarySearchQuery, runLibrarySearch, tab]);

    usePoll(() => { void loadBrowse({ silent: true }); }, (tab === 'browse' && browseRails.some((rail) => rail.loading)) ? 4000 : null, { immediate: false });

    usePoll(async () => {
        if (!activeJob?.id || !['running', 'queued'].includes(String(activeJob.state || ''))) return;
        try {
            const response = await posterSetsApi.job(activeJob.id);
            setActiveJob(response.job);
            const state = String(response.job.state || '').toLowerCase();
            if (state && state !== 'running' && state !== 'queued') {
                const meta = jobSetMeta(response.job);
                if (meta?.thumbUrl || meta?.title) {
                    rememberRecentFromContext(meta, response.job.input?.url, {
                        mediuxFilters: response.job.input?.mediuxFilters,
                    });
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
    }, (activeJob?.id && ['running', 'queued'].includes(String(activeJob.state || ''))) ? 1500 : null, { immediate: false });

    usePoll(async () => {
        if (tab !== 'history') return;
        const hasRunning = historyJobs.some((job) => ['running', 'queued'].includes(String(job.state || '')))
            || ['running', 'queued'].includes(String(selectedHistoryJob?.state || ''));
        if (!hasRunning) return;
        try {
            await loadHistory();
            if (selectedHistoryJob?.id) {
                const response = await posterSetsApi.job(selectedHistoryJob.id);
                setSelectedHistoryJob(response.job);
            }
        } catch {
            // ignore transient poll errors
        }
    }, (tab === 'history' && (historyJobs.some((job) => ['running', 'queued'].includes(String(job.state || '')))
        || ['running', 'queued'].includes(String(selectedHistoryJob?.state || '')))) ? 2000 : null, { immediate: false });

    usePoll(async () => {
        if (!selectedQueueJob?.id) return;
        const state = String(selectedQueueJob.state || '').toLowerCase();
        if (!['running', 'queued'].includes(state)) return;
        try {
            const response = await posterSetsApi.job(selectedQueueJob.id);
            setSelectedQueueJob(response.job);
            await loadQueue();
        } catch {
            // ignore transient poll errors
        }
    }, (selectedQueueJob?.id && ['running', 'queued'].includes(String(selectedQueueJob.state || ''))) ? 2000 : null, { immediate: false });

    const openHistoryJob = async (jobId: string) => {
        try {
            const response = await posterSetsApi.job(jobId);
            setSelectedHistoryJob(response.job);
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to open job', 'error');
        }
    };

    const openQueueJob = async (jobId: string) => {
        try {
            const response = await posterSetsApi.job(jobId);
            setSelectedQueueJob(response.job);
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to open job', 'error');
        }
    };

    const saveSettings = async () => {
        setBusy('save');
        try {
            const prevWhitelist = textToList(listToText(configDraft.creatorWhitelist || []))
                .map((item) => item.replace(/^@+/, '').toLowerCase())
                .sort()
                .join('|');
            const payload = {
                ...configDraft,
                tv_library: textToList(tvText),
                movie_library: textToList(movieText),
                creatorWhitelist: textToList(whitelistText).map((item) => item.replace(/^@+/, '')),
            };
            const nextWhitelist = (payload.creatorWhitelist || [])
                .map((item) => String(item).replace(/^@+/, '').toLowerCase())
                .sort()
                .join('|');
            const response = await posterSetsApi.saveConfig(payload);
            setConfigDraft({
                ...response.config,
                token: response.config.hasToken ? '********' : '',
            });
            setTvText(listToText(response.config.tv_library));
            setMovieText(listToText(response.config.movie_library));
            setWhitelistText(listToText(response.config.creatorWhitelist));
            toast('Poster Sets settings saved.');
            await load();
            // Only hard-refresh Browse when followed creators changed; otherwise keep durable cache.
            void loadBrowse({
                refresh: prevWhitelist !== nextWhitelist,
                silent: true,
            });
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
            setWhitelistText(listToText(cfg.creatorWhitelist));
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

    const runPreview = async (overrideUrl?: string, options?: {
        scroll?: boolean;
        keepSearch?: boolean;
        titleCardsOnly?: boolean;
    }) => {
        const target = String(overrideUrl ?? url).trim();
        if (!target) {
            toast('Paste a MediUX or ThePosterDB set URL first.', 'error');
            return null;
        }
        if (overrideUrl) setUrl(target);
        const restrictTitleCards = options?.titleCardsOnly ?? titleCardsOnly;
        titleCardsOnlyRef.current = Boolean(restrictTitleCards);
        setTitleCardsOnly(Boolean(restrictTitleCards));
        setBusy('preview');
        setPreview(null);
        setRelatedSets([]);
        setRelatedSetsLoading(false);
        relatedSetsAbortRef.current?.abort();
        setSelectedAssetIds([]);
        try {
            const response = await posterSetsApi.preview(target, {
                mediuxFilters: restrictTitleCards ? TITLE_CARD_ONLY_FILTERS : undefined,
            });
            setPreview(response);
            const assets = response.assets || [];
            const matchedIds = assets.filter((asset) => asset.matched === true).map((asset) => asset.id);
            const defaults = matchedIds.length ? matchedIds : assets.map((asset) => asset.id);
            setSelectedAssetIds(defaults);
            upsertRecentSet(response.setMeta, target, {
                setKind: restrictTitleCards ? 'title_cards' : undefined,
                assets,
                mediuxFilters: restrictTitleCards ? TITLE_CARD_ONLY_FILTERS : undefined,
            });
            setRecentTick((value) => value + 1);
            const matched = response.matched ?? matchedIds.length;
            const total = response.total || assets.length;
            if (!total) {
                toast(restrictTitleCards
                    ? 'This title-card pack previewed with 0 title cards. The set may only contain covers/backgrounds, or MediUX changed the listing.'
                    : 'This set previewed with 0 assets. Check MediUX filters in Poster Sets settings (title cards may be off).', 'error');
            } else {
                toast(restrictTitleCards
                    ? `Ready: ${matched} matched title cards · ${total} in pack.`
                    : `Ready: ${matched} matched in Plex · ${total} in set.`);
            }
            if (options?.scroll !== false) {
                window.setTimeout(() => {
                    previewPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 200);
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

    /** Open Apply with this set selected and kick off preview (Browse / Recent). */
    const openSetForApply = async (set: PosterSetsSearchSet, options?: { skipUrl?: boolean }) => {
        const target = String(set.url || '').trim();
        if (!target) {
            toast('This set is missing a URL.', 'error');
            return;
        }
        const restrictTitleCards = isTitleCardSet(set);
        setBrowseSeeAllId(null);
        creatorSearchAbortRef.current?.abort();
        creatorSearchAbortRef.current = null;
        setSearchQuery('');
        setSearchTitles([]);
        setSearchSets([]);
        setSearchSetsPage(1);
        setSearchLoadingMore(false);
        setSearchContext('');
        setSelectedSearchTitle(null);
        setSelectedSearchSet(set);
        setUrl(target);
        setTitleCardsOnly(restrictTitleCards);
        titleCardsOnlyRef.current = restrictTitleCards;
        setPreview(null);
        setSelectedAssetIds([]);
        scrollPreviewAfterLoadRef.current = true;
        setTab('apply');
        if (!options?.skipUrl) {
            pushPosterLocation({
                tab: 'apply',
                rail: null,
                setUrl: target,
                creator: null,
                titleCardsOnly: restrictTitleCards,
            }, 'push');
        } else {
            syncedSetUrlRef.current = target;
        }
        await runPreview(target, { scroll: false, keepSearch: false, titleCardsOnly: restrictTitleCards });
        // Scroll after React paints the preview panel at the top of Apply.
        window.setTimeout(() => {
            previewPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            scrollPreviewAfterLoadRef.current = false;
        }, 250);
    };
    const openSetForApplyRef = useRef(openSetForApply);
    openSetForApplyRef.current = openSetForApply;

    // After preview, load other packs for the same show/movie (MediUX + ThePosterDB).
    useEffect(() => {
        relatedSetsAbortRef.current?.abort();
        const generation = ++relatedSetsGenRef.current;
        if (!preview) {
            setRelatedSets([]);
            setRelatedSetsLoading(false);
            return;
        }

        const meta = preview.setMeta;
        const tmdbId = String(meta?.tmdbId || '').trim();
        const title = String(meta?.title || '').trim();
        if (!tmdbId && !title) {
            setRelatedSets([]);
            setRelatedSetsLoading(false);
            return;
        }

        const currentKeys = new Set(
            [
                relatedSetKey({
                    provider: meta?.provider,
                    setId: meta?.setId,
                    url: meta?.url || preview.url,
                }),
                relatedSetKey({ url: preview.url }),
            ].filter(Boolean),
        );
        const mediaType = inferPreviewMediaType(preview);
        const wantYear = (preview.assets || []).map((asset) => asset.year).find((year) => year != null) ?? null;
        const dupePreference = configDraft.dupePreference === 'mediux' ? 'mediux' : 'posterdb';
        const controller = new AbortController();
        relatedSetsAbortRef.current = controller;
        const stillCurrent = () => generation === relatedSetsGenRef.current && !controller.signal.aborted;

        const pushUnique = (bucket: PosterSetsSearchSet[], incoming: PosterSetsSearchSet[]) => {
            const seen = new Set(bucket.map((set) => relatedSetKey(set)).filter(Boolean));
            for (const set of incoming) {
                const key = relatedSetKey(set);
                if (!key || currentKeys.has(key) || seen.has(key)) continue;
                seen.add(key);
                bucket.push(set);
            }
        };

        const load = async () => {
            setRelatedSetsLoading(true);
            setRelatedSets([]);
            const collected: PosterSetsSearchSet[] = [];
            try {
                if (tmdbId) {
                    try {
                        let response = await posterSetsApi.search({
                            provider: 'mediux',
                            tmdbId,
                            mediaType,
                            limit: 40,
                        });
                        if (!stillCurrent()) return;
                        pushUnique(collected, response.sets || []);
                        if (!collected.length) {
                            response = await posterSetsApi.search({
                                provider: 'mediux',
                                tmdbId,
                                mediaType: mediaType === 'show' ? 'movie' : 'show',
                                limit: 40,
                            });
                            if (!stillCurrent()) return;
                            pushUnique(collected, response.sets || []);
                        }
                        if (stillCurrent()) setRelatedSets([...collected]);
                    } catch {
                        // Title search below may still find packs.
                    }
                }

                if (title && !/^set\s+\d+$/i.test(title) && title.toLowerCase() !== 'poster set') {
                    try {
                        const titleSearch = await posterSetsApi.search({
                            provider: 'both',
                            query: title,
                            mode: 'title',
                            limit: 12,
                            dupePreference,
                        });
                        if (!stillCurrent()) return;
                        const best = pickBestRelatedTitle(titleSearch.titles || [], title, wantYear);
                        if (best) {
                            const sources = (best.sources?.length
                                ? best.sources
                                : [{
                                    provider: best.provider || 'mediux',
                                    id: best.id,
                                    url: best.url,
                                    mediaType: best.mediaType,
                                }]).filter((source) => source?.id || source?.url);

                            const setsResponse = sources.length > 1
                                ? await posterSetsApi.search({
                                    provider: 'both',
                                    query: best.title,
                                    title: best.title,
                                    titleSources: sources,
                                    dupePreference,
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
                            if (!stillCurrent()) return;
                            pushUnique(collected, setsResponse.sets || []);
                        }
                    } catch {
                        // Soft-fail: related rail is optional QoL.
                    }
                }

                if (stillCurrent()) {
                    setRelatedSets(collected.slice(0, 36));
                }
            } finally {
                if (stillCurrent()) {
                    setRelatedSetsLoading(false);
                }
            }
        };

        void load();
        return () => {
            relatedSetsGenRef.current += 1;
            controller.abort();
        };
    }, [
        preview,
        configDraft.dupePreference,
    ]);

    // Keep /poster-sets#… in sync so refresh and browser Back stay inside Poster Sets.
    useEffect(() => {
        writePosterSetsUrl({
            tab: initialLocation.tab,
            rail: initialLocation.rail,
            setUrl: initialLocation.setUrl,
            creator: initialLocation.creator,
            titleCardsOnly: Boolean(initialLocation.titleCardsOnly),
        }, 'replace');
    }, [initialLocation]);

    useEffect(() => {
        if (deepLinkHandledRef.current) return;
        deepLinkHandledRef.current = true;
        if (initialLocation.tab !== 'apply') return;
        const target = initialLocation.setUrl;
        if (target) {
            void openSetForApplyRef.current({
                setId: '',
                title: '',
                url: target,
                setKind: initialLocation.titleCardsOnly ? 'title_cards' : null,
            }, { skipUrl: true });
            return;
        }
        if (initialLocation.creator) {
            void openCreatorCatalogRef.current(initialLocation.creator, { skipUrl: true });
        }
    }, [initialLocation]);

    useEffect(() => {
        const onPopState = () => {
            const parsed = parsePosterSetsUrl();
            setTab(parsed.tab);
            setBrowseSeeAllId(parsed.tab === 'browse' ? parsed.rail : null);
            const nextTitleCards = Boolean(parsed.titleCardsOnly);

            if (parsed.tab === 'apply' && parsed.setUrl) {
                const changed = syncedSetUrlRef.current !== parsed.setUrl
                    || titleCardsOnlyRef.current !== nextTitleCards;
                syncedSetUrlRef.current = parsed.setUrl;
                titleCardsOnlyRef.current = nextTitleCards;
                setTitleCardsOnly(nextTitleCards);
                if (changed) {
                    void openSetForApplyRef.current({
                        setId: '',
                        title: '',
                        url: parsed.setUrl,
                        setKind: nextTitleCards ? 'title_cards' : null,
                    }, { skipUrl: true });
                }
                return;
            }

            if (parsed.tab === 'apply' && parsed.creator) {
                syncedSetUrlRef.current = null;
                titleCardsOnlyRef.current = false;
                setTitleCardsOnly(false);
                setPreview(null);
                setSelectedSearchSet(null);
                setSelectedAssetIds([]);
                setUrl('');
                void openCreatorCatalogRef.current(parsed.creator, { skipUrl: true });
                return;
            }

            if (syncedSetUrlRef.current) {
                syncedSetUrlRef.current = null;
                titleCardsOnlyRef.current = false;
                setTitleCardsOnly(false);
                setPreview(null);
                setSelectedSearchSet(null);
                setSelectedAssetIds([]);
                setUrl('');
            } else {
                titleCardsOnlyRef.current = false;
                setTitleCardsOnly(false);
            }
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

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
                selected
                    ? filtersForSelectedIds(selected)
                    : (titleCardsOnly ? TITLE_CARD_ONLY_FILTERS : undefined),
            );
            setActiveJob(response.job);
            rememberRecentFromContext(jobSetMeta(response.job) || currentSetMeta(), target, {
                mediuxFilters: selected
                    ? filtersForSelectedIds(selected)
                    : (titleCardsOnly ? TITLE_CARD_ONLY_FILTERS : undefined),
            });
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
            rememberRecentFromContext(jobSetMeta(response.job) || currentSetMeta(), target, {
                mediuxFilters: filtersForSelectedIds(ids),
            });
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
            rememberRecentFromContext(jobSetMeta(response.job) || currentSetMeta(), target, {
                mediuxFilters: filtersForSelectedIds(unmatchedIds),
            });
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
            rememberRecentFromContext(jobSetMeta(response.job) || currentSetMeta(), target, {
                mediuxFilters: filtersForSelectedIds(newIds),
            });
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

    const selectBrowseSets = (sets: PosterSetsSearchSet[]) => {
        setSelectedBulkSets((prev) => {
            const next = { ...prev };
            for (const set of sets) {
                const key = String(set.url || '').trim();
                if (!key) continue;
                next[key] = bulkEntryFromSet(set);
            }
            return next;
        });
    };

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
                    setKind: entry.setKind || null,
                };
                const response = await posterSetsApi.apply(entry.url, undefined, setMeta, 'bulk');
                setActiveJob(response.job);
                rememberRecentFromContext(jobSetMeta(response.job) || setMeta, entry.url);
                queued += 1;
            }
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
        if (andPreview) {
            pushPosterLocation({ tab: 'apply', rail: null, setUrl: built, creator: null, titleCardsOnly: false }, 'push');
            await runPreview(built, { titleCardsOnly: false });
        } else toast('Set URL filled — preview or apply when ready.');
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
    const titleCardGridStyle = useMemo(
        () => upgraderLandscapeGridStyle(gridSize === 'list' ? 'medium' : gridSize),
        [gridSize],
    );
    const searchSetsUseTitleCardGrid = useMemo(
        () => searchSets.length > 0 && searchSets.every((set) => isTitleCardSet(set)),
        [searchSets],
    );

    const runCatalogSearch = async (options?: {
        mode?: 'title' | 'creator';
        query?: string;
        provider?: SearchProvider;
    }) => {
        const mode = options?.mode || searchMode;
        const q = String(options?.query ?? searchQuery).trim().replace(/^@+/, '');
        const provider = options?.provider || searchProvider;
        if (!q) {
            toast(mode === 'creator' ? 'Enter a creator username.' : 'Enter a title to search.', 'error');
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
            if (mode === 'creator') {
                toast("Loading first pages… more will fill in as they're found.");
                setSearchLoadingMore(true);
                let sawFirstBatch = false;
                const finalEvent = await posterSetsApi.searchCreatorStream({
                    provider,
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
                        setSearchContext(event.title || `@${q}`);
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
                provider,
                query: q,
                mode,
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

    const openCreatorCatalog = (username: string, options?: { skipUrl?: boolean }) => {
        const handle = String(username || '').trim().replace(/^@+/, '');
        if (!handle) return;
        setTab('apply');
        setBrowseSeeAllId(null);
        setSearchMode('creator');
        setSearchQuery(handle);
        setSearchProvider('both');
        setTitleCardsOnly(false);
        titleCardsOnlyRef.current = false;
        syncedSetUrlRef.current = null;
        setPreview(null);
        setSelectedSearchSet(null);
        setSelectedSearchTitle(null);
        setSelectedAssetIds([]);
        setUrl('');
        if (!options?.skipUrl) {
            pushPosterLocation({
                tab: 'apply',
                rail: null,
                setUrl: null,
                creator: handle,
                titleCardsOnly: false,
            }, 'push');
        } else {
            writePosterSetsUrl({
                tab: 'apply',
                rail: null,
                setUrl: null,
                creator: handle,
                titleCardsOnly: false,
            }, 'replace');
        }
        requestAnimationFrame(() => {
            searchSetsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        void runCatalogSearch({ mode: 'creator', query: handle, provider: 'both' });
    };
    openCreatorCatalogRef.current = openCreatorCatalog;

    const openLibraryItem = (item: LibraryRecentItem) => {
        setTab('apply');
        setBrowseSeeAllId(null);
        setSearchMode('title');
        setSearchProvider('both');
        setSearchQuery(item.title);
        setTitleCardsOnly(false);
        titleCardsOnlyRef.current = false;
        syncedSetUrlRef.current = null;
        setPreview(null);
        setSelectedSearchSet(null);
        setSelectedSearchTitle(null);
        setSelectedAssetIds([]);
        setUrl('');
        pushPosterLocation({
            tab: 'apply',
            rail: null,
            setUrl: null,
            creator: null,
            titleCardsOnly: false,
        }, 'push');
        requestAnimationFrame(() => {
            searchSetsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        void runLibraryItemSearch(item);
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

    const runLibraryItemSearch = async (item: LibraryRecentItem) => {
        setBusy('search');
        setSearchTitles([]);
        setSearchSets([]);
        setSearchSetsPage(1);
        setSearchLoadingMore(false);
        setSearchContext('');
        setSelectedSearchTitle(null);
        setSelectedSearchSet(null);
        setPreview(null);

        const dupePreference = configDraft.dupePreference === 'mediux' ? 'mediux' : 'posterdb';
        const queries = item.year != null
            ? [`${item.title} ${item.year}`, item.title]
            : [item.title];

        try {
            let response: Awaited<ReturnType<typeof posterSetsApi.search>> | null = null;
            let titles: PosterSetsSearchTitle[] = [];
            let autoMatch: PosterSetsSearchTitle | null = null;

            for (const query of queries) {
                response = await posterSetsApi.search({
                    provider: 'both',
                    query,
                    mode: 'title',
                    dupePreference,
                    limit: 24,
                });
                titles = response.titles || [];
                autoMatch = pickAutoMatchedTitle(item, titles);
                if (autoMatch) break;
            }

            if (autoMatch) {
                const yearLabel = autoMatch.year ? ` (${autoMatch.year})` : '';
                toast(`Auto-matched ${autoMatch.title}${yearLabel} — loading sets…`);
                await openSearchTitle(autoMatch);
                return;
            }

            setSearchTitles(titles);
            setSearchSets(response?.sets || []);
            setSearchSetsPage(1);
            setSearchContext(response?.title || item.title);
            const titleCount = titles.length;
            const setCount = response?.sets?.length || 0;
            const dupes = Number(response?.dupesCollapsed || 0);
            const dupeNote = dupes > 0 ? ` · ${dupes} duplicate${dupes === 1 ? '' : 's'} collapsed` : '';
            if (!titleCount && !setCount) {
                toast(`No poster sets found for ${item.title}.`, 'error');
            } else if (titleCount) {
                const yearHint = item.year ? ` (${item.year})` : '';
                toast(
                    `Could not auto-match ${item.title}${yearHint} — ${titleCount} possible title${titleCount === 1 ? '' : 's'}${dupeNote}. Pick one.`,
                );
            } else {
                toast(`Found ${setCount} set${setCount === 1 ? '' : 's'}${dupeNote}. Choose one to preview.`);
            }
            if (response?.partialErrors?.length) {
                toast(response.partialErrors[0], 'error');
            }
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Search failed', 'error');
        } finally {
            setBusy((current) => (current === 'search' ? null : current));
        }
    };

    const pickSearchSet = async (set: PosterSetsSearchSet) => {
        const restrictTitleCards = isTitleCardSet(set);
        setSelectedSearchSet(set);
        setUrl(set.url);
        pushPosterLocation({
            tab: 'apply',
            rail: null,
            setUrl: String(set.url || '').trim() || null,
            creator: null,
            titleCardsOnly: restrictTitleCards,
        }, 'push');
        await runPreview(set.url, { titleCardsOnly: restrictTitleCards });
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
        setTitleCardsOnly(false);
        titleCardsOnlyRef.current = false;
        pushPosterLocation({ tab: 'apply', rail: null, setUrl: null, creator: null, titleCardsOnly: false }, 'push');
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

    const readyToApply = Boolean(preview);
    const directPreviewMode = !searchSets.length && !searchTitles.length
        && (Boolean(preview) || (busy === 'preview' && Boolean(String(url || '').trim())));

    useEffect(() => {
        if (tab !== 'apply' || !preview || !scrollPreviewAfterLoadRef.current) return undefined;
        const timer = window.setTimeout(() => {
            previewPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            scrollPreviewAfterLoadRef.current = false;
        }, 150);
        return () => window.clearTimeout(timer);
    }, [tab, preview]);

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
    const selectedQueueLogs = jobLogLines(selectedQueueJob);

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
            const setKind = normalizeRecentSetKind(meta?.setKind)
                || inferRecentSetKindFromFilters(job.input?.mediuxFilters)
                || (isTitleCardSet({ title: meta?.title, setKind: meta?.setKind }) ? 'title_cards' : null)
                || (isBackgroundSet({ title: meta?.title, setKind: meta?.setKind }) ? 'backgrounds' : null);
            push({
                url: urlValue,
                title: String(meta?.title || (ref.setId ? `Set ${ref.setId}` : 'Poster set')),
                user: meta?.user != null ? String(meta.user).trim().replace(/^@/, '') || null : null,
                provider: meta?.provider || ref.provider,
                setId: meta?.setId != null ? String(meta.setId) : ref.setId,
                thumbUrl: String(meta?.thumbUrl || ''),
                assetCount: Number.isFinite(Number(meta?.assetCount)) ? Number(meta?.assetCount) : null,
                setKind,
                at: job.finishedAt || job.createdAt || new Date(0).toISOString(),
            });
        }
        return [...byUrl.values()]
            .sort((a, b) => String(b.at).localeCompare(String(a.at)))
            .slice(0, MAX_RECENT_SETS);
    }, [historyJobs, recentTick]);

    const recentSetsByCategory = useMemo(() => {
        const groups: Record<RecentSetCategory, RecentSetChip[]> = {
            posters: [],
            backgrounds: [],
            title_cards: [],
        };
        for (const item of recentSets) {
            groups[classifyRecentSet(item)].push(item);
        }
        return groups;
    }, [recentSets]);

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
        <div className={`flex w-full min-w-0 animate-fade-in flex-col gap-4 sm:gap-6 ${selectedBulkCount > 0 || (tab === 'apply' && readyToApply) ? 'pb-28' : 'pb-10'}`}>
            <ToastContainer toasts={toasts} setToasts={setToasts} />

            <header className={`${cardClass} overflow-hidden p-4 text-center sm:p-6`}>
                <div className="flex flex-col items-center gap-3">
                    <div className="min-w-0 max-w-3xl">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-plex sm:text-xs">Poster Sets</p>
                        <h1 className="mt-1.5 text-xl font-bold tracking-tight text-text sm:mt-2 sm:text-3xl">Artwork from MediUX & ThePosterDB</h1>
                        <p className="mt-1.5 text-xs leading-relaxed text-muted sm:mt-2 sm:text-sm">
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
                            className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-2.5 py-2.5 sm:px-3"
                            title={'title' in item ? item.title : undefined}
                        >
                            <p className="text-[10px] font-bold uppercase tracking-wide text-muted sm:text-[11px]">{item.label}</p>
                            <StatusPill value={item.value} />
                        </div>
                    ))}
                </div>
            </header>

            <div className="flex min-w-0 flex-wrap justify-center gap-1.5 sm:gap-2">
                {([
                    ['apply', 'Apply', Sparkles],
                    ['browse', 'Browse', Compass],
                    ['library', 'Library', Library],
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
                            if (id === tab) {
                                if (id === 'browse' && browseSeeAllId) openBrowseRail(null);
                                return;
                            }
                            goToTab(id);
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
                            <div className="flex flex-col items-center gap-3 text-center">
                                <div className="min-w-0 max-w-3xl">
                                    <button
                                        type="button"
                                        className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-plex hover:underline"
                                        onClick={() => openBrowseRail(null)}
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
                                <div className="flex flex-wrap items-center justify-center gap-2">
                                    <CustomSelect
                                        value={gridSize === 'list' ? 'medium' : gridSize}
                                        onChange={(value) => setGridSize(normalizeUpgraderGridSize(value))}
                                        options={POSTER_SETS_GRID_OPTIONS}
                                        className="w-full min-w-[140px] sm:w-auto"
                                        compact
                                    />
                                    <button
                                        type="button"
                                        className={buttonClass}
                                        disabled={browseLoading || busy !== null}
                                        onClick={() => void loadBrowse({ refresh: true })}
                                    >
                                        {browseLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                        Refresh
                                    </button>
                                    {browseSeeAllRail.sets.length ? (
                                        <button
                                            type="button"
                                            className={buttonClass}
                                            disabled={busy !== null}
                                            onClick={() => selectBrowseSets(browseSeeAllRail.sets)}
                                        >
                                            Select all
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                            <div className={posterGridClass} style={isTitleCardRail(browseSeeAllRail) ? titleCardGridStyle : posterGridStyle}>
                                {browseSeeAllRail.sets.map((set) => (
                                    <BrowseSetCard
                                        key={`${set.provider}-${set.setId}`}
                                        set={set}
                                        disabled={busy !== null}
                                        bulkSelected={Boolean(selectedBulkSets[set.url])}
                                        onToggleBulk={() => toggleBulkSet(bulkEntryFromSet(set))}
                                        onOpen={(item) => void openSetForApply(item)}
                                        onOpenCreator={openCreatorCatalog}
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
                            <div className="flex flex-col items-center gap-3 text-center">
                                <div className="min-w-0 max-w-3xl">
                                    <h2 className={sectionTitleClass}>Browse recently added</h2>
                                    <p className={sectionBodyClass}>
                                        First results appear immediately; more fill in the background (up to 600 per row). Tap a row title to see all.
                                        Check sets to queue many at once without opening each one. Add creators in Settings to get a “Creators you follow” row.
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center justify-center gap-2">
                                    <CustomSelect
                                        value={gridSize === 'list' ? 'medium' : gridSize}
                                        onChange={(value) => setGridSize(normalizeUpgraderGridSize(value))}
                                        options={POSTER_SETS_GRID_OPTIONS}
                                        className="w-full min-w-[140px] sm:w-auto"
                                        compact
                                    />
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
                                            onClick={() => openBrowseRail(rail.id)}
                                        >
                                            <h3 className="text-sm font-bold text-text group-hover:text-plex sm:text-base">
                                                {rail.title}
                                            </h3>
                                            <span className="text-[11px] font-semibold uppercase tracking-wide text-plex/80 group-hover:underline">
                                                See all
                                            </span>
                                        </button>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-[11px] text-muted">
                                                {rail.buffered || rail.sets.length}
                                                {rail.cap ? ` / ${rail.cap}` : ''}
                                                {rail.loading ? ' · loading…' : ''}
                                            </span>
                                            {rail.sets.length ? (
                                                <button
                                                    type="button"
                                                    className="text-[11px] font-semibold text-plex hover:underline"
                                                    disabled={busy !== null}
                                                    onClick={() => selectBrowseSets(rail.sets.slice(0, 24))}
                                                >
                                                    Select row
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                    {rail.error ? (
                                        <p className="text-xs text-amber-200">{rail.error}</p>
                                    ) : null}
                                    <div className={posterGridClass} style={isTitleCardRail(rail) ? titleCardGridStyle : posterGridStyle}>
                                        {rail.sets.slice(0, 24).map((set) => (
                                            <BrowseSetCard
                                                key={`${set.provider}-${set.setId}`}
                                                set={set}
                                                disabled={busy !== null}
                                                bulkSelected={Boolean(selectedBulkSets[set.url])}
                                                onToggleBulk={() => toggleBulkSet(bulkEntryFromSet(set))}
                                                onOpen={(item) => void openSetForApply(item)}
                                                onOpenCreator={openCreatorCatalog}
                                            />
                                        ))}
                                    </div>
                                    {!rail.sets.length && !rail.error ? (
                                        <p className="py-6 text-sm text-muted">No sets yet.</p>
                                    ) : null}
                                    {rail.sets.length > 24 ? (
                                        <button
                                            type="button"
                                            className="text-xs font-semibold text-plex hover:underline"
                                            onClick={() => openBrowseRail(rail.id)}
                                        >
                                            See all {rail.sets.length} sets
                                        </button>
                                    ) : null}
                                </div>
                            ))}
                        </>
                    )}
                </section>
            ) : null}

            {tab === 'library' ? (
                <section className={`${cardClass} space-y-6 p-4 sm:p-5`}>
                    <div className="flex flex-col items-center gap-3 text-center">
                        <div className="min-w-0 max-w-3xl">
                            <h2 className={sectionTitleClass}>Library</h2>
                            <p className={sectionBodyClass}>
                                Recently added movies and TV from every {status?.mediaServerLabel || 'media server'} library,
                                or search your server to find a title and browse poster sets for it.
                            </p>
                            {libraryError ? (
                                <p className="mt-2 text-xs text-amber-200">{libraryError}</p>
                            ) : null}
                        </div>
                        <div className="flex w-full max-w-2xl gap-2">
                            <div className="relative min-w-0 flex-1">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                                <input
                                    type="search"
                                    value={librarySearchQuery}
                                    onChange={(e) => setLibrarySearchQuery(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') void runLibrarySearch(librarySearchQuery);
                                    }}
                                    placeholder={`Search ${status?.mediaServerLabel || 'media server'} for a movie or show…`}
                                    className={`${fieldClass} pl-10`}
                                />
                            </div>
                            <button
                                type="button"
                                className={buttonClass}
                                disabled={librarySearching || librarySearchQuery.trim().length < 2}
                                onClick={() => void runLibrarySearch(librarySearchQuery)}
                            >
                                {librarySearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                Search
                            </button>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <CustomSelect
                                value={gridSize === 'list' ? 'medium' : gridSize}
                                onChange={(value) => setGridSize(normalizeUpgraderGridSize(value))}
                                options={POSTER_SETS_GRID_OPTIONS}
                                className="w-full min-w-[140px] sm:w-auto"
                                compact
                            />
                            <button
                                type="button"
                                className={buttonClass}
                                disabled={libraryLoading || busy !== null}
                                onClick={() => void loadLibraryRecent({ refresh: true })}
                            >
                                {libraryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                Refresh
                            </button>
                            {librarySearchQuery.trim() ? (
                                <button
                                    type="button"
                                    className={buttonClass}
                                    onClick={() => {
                                        setLibrarySearchQuery('');
                                        setLibrarySearchResults([]);
                                    }}
                                >
                                    <X className="h-4 w-4" />
                                    Clear search
                                </button>
                            ) : null}
                        </div>
                    </div>

                    {librarySearchQuery.trim().length >= 2 ? (
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
                                <h3 className="text-sm font-bold text-text sm:text-base">
                                    Search results
                                    {librarySearchQuery.trim() ? ` · “${librarySearchQuery.trim()}”` : ''}
                                </h3>
                                <span className="text-[11px] text-muted">
                                    {librarySearching ? 'Searching…' : `${librarySearchResults.length} found`}
                                </span>
                            </div>
                            {librarySearching && !librarySearchResults.length ? (
                                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Searching your library…
                                </div>
                            ) : null}
                            {!librarySearching && !librarySearchResults.length ? (
                                <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-muted">
                                    No movies or TV shows matched that search on your media server.
                                </p>
                            ) : null}
                            {librarySearchResults.length ? (
                                <div className={posterGridClass} style={posterGridStyle}>
                                    {librarySearchResults.map((item) => (
                                        <LibraryMediaCard
                                            key={`library-search-${item.mediaType}-${item.id}`}
                                            item={item}
                                            disabled={busy !== null}
                                            onOpen={openLibraryItem}
                                        />
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    {!librarySearchQuery.trim() && libraryLoading && !libraryShows.length && !libraryMovies.length ? (
                        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading recently added…
                        </div>
                    ) : null}

                    {!librarySearchQuery.trim() && !libraryLoading && !libraryShows.length && !libraryMovies.length && !libraryError ? (
                        <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-muted">
                            No recently added movies or TV found on your media server.
                        </p>
                    ) : null}

                    {!librarySearchQuery.trim() && libraryMovies.length ? (
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
                                <h3 className="text-sm font-bold text-text sm:text-base">Movies</h3>
                                <span className="text-[11px] text-muted">{libraryMovies.length}</span>
                            </div>
                            <div className={posterGridClass} style={posterGridStyle}>
                                {libraryMovies.map((item) => (
                                    <LibraryMediaCard
                                        key={`library-movie-${item.id}`}
                                        item={item}
                                        disabled={busy !== null}
                                        onOpen={openLibraryItem}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {!librarySearchQuery.trim() && libraryShows.length ? (
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
                                <h3 className="text-sm font-bold text-text sm:text-base">TV shows</h3>
                                <span className="text-[11px] text-muted">{libraryShows.length}</span>
                            </div>
                            <div className={posterGridClass} style={posterGridStyle}>
                                {libraryShows.map((item) => (
                                    <LibraryMediaCard
                                        key={`library-show-${item.id}`}
                                        item={item}
                                        disabled={busy !== null}
                                        onOpen={openLibraryItem}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : null}
                </section>
            ) : null}

            {tab === 'queue' ? (
                <section className={`${cardClass} space-y-4 overflow-hidden p-4 sm:p-5`}>
                    <div className="flex flex-col items-center gap-3 text-center">
                        <div className="min-w-0 max-w-3xl">
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
                        <div className="flex flex-wrap justify-center gap-2">
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
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => { void openQueueJob(job.id); }}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                void openQueueJob(job.id);
                                            }
                                        }}
                                        className={`min-w-0 overflow-hidden rounded-xl border px-3 py-3 sm:px-4 cursor-pointer transition-colors ${selectedQueueJob?.id === job.id ? 'border-plex/50 ring-1 ring-plex/30' : 'border-white/10'} ${jobCardTone(job)}`}
                                    >
                                        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                            <div className="min-w-0 flex-1 space-y-1.5 overflow-hidden">
                                                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                                    <StatusPill value={job.state} />
                                                    <ProviderPill provider={meta?.provider} />
                                                    <CreatorPill user={meta?.user} onOpen={openCreatorCatalog} />
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
                                                        onClick={async (event) => {
                                                            event.stopPropagation();
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
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            const target = String(job.input?.url || meta?.url || '').trim();
                                                            if (!target) return;
                                                            void openSetForApply({
                                                                setId: String(meta?.setId || ''),
                                                                title: String(meta?.title || ''),
                                                                url: target,
                                                                thumbUrl: meta?.thumbUrl,
                                                                user: meta?.user,
                                                                provider: meta?.provider || undefined,
                                                            });
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

                    {selectedQueueJob ? (
                        <section className={`${cardClass} space-y-3 p-5`}>
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <h3 className="text-lg font-bold text-text">Queue job detail</h3>
                                    <p className="mt-1 truncate text-sm text-muted" title={jobTitle(selectedQueueJob)}>
                                        {jobTitle(selectedQueueJob)}
                                    </p>
                                </div>
                                <StatusPill value={selectedQueueJob.state} />
                            </div>
                            <div className="flex flex-wrap gap-3 text-xs text-muted">
                                <span>Queued {formatTime(selectedQueueJob.createdAt)}</span>
                                {selectedQueueJob.finishedAt ? <span>Finished {formatTime(selectedQueueJob.finishedAt)}</span> : null}
                                {typeof selectedQueueJob.result?.uploaded === 'number' ? (
                                    <span className="text-emerald-300">
                                        Uploaded {String(selectedQueueJob.result.uploaded)}
                                        {typeof selectedQueueJob.result.attempted === 'number'
                                            ? ` / ${String(selectedQueueJob.result.attempted)}`
                                            : ''}
                                    </span>
                                ) : null}
                            </div>
                            {selectedQueueJob.error ? (
                                <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                                    {selectedQueueJob.error}
                                </p>
                            ) : null}
                            {selectedQueueLogs.length ? (
                                <pre className="max-h-48 overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 text-[11px] text-muted font-mono">
                                    {selectedQueueLogs.join('\n')}
                                </pre>
                            ) : null}
                        </section>
                    ) : null}
                </section>
            ) : null}

            {tab === 'watches' ? (
                <section className={`${cardClass} min-w-0 space-y-5 overflow-hidden p-4 sm:p-5`}>
                    <div className="flex flex-col items-center gap-4 text-center">
                        <div className="min-w-0 max-w-3xl">
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-plex">Pinned artwork</p>
                            <h2 className="mt-1 text-xl font-bold tracking-tight text-text sm:text-2xl">Watching</h2>
                            <p className={sectionBodyClass}>
                                Keep MediUX and ThePosterDB sets in view. New art — including title cards — queues automatically.
                            </p>
                            <div className="mt-3 flex flex-wrap justify-center gap-2">
                                <MetaPill className="border-plex/35 bg-plex/15 text-plex" truncate={false}>
                                    {watchStatsState.enabled || 0} live
                                </MetaPill>
                                <MetaPill className="border-white/15 bg-white/5 text-muted" truncate={false}>
                                    {watchStatsState.total || 0} pinned
                                </MetaPill>
                                {(watchStatsState.errored || 0) > 0 ? (
                                    <MetaPill className="border-red-400/35 bg-red-500/15 text-red-200" truncate={false}>
                                        {watchStatsState.errored} errors
                                    </MetaPill>
                                ) : null}
                                {configDraft.watchersEnabled === false ? (
                                    <MetaPill className="border-amber-400/35 bg-amber-500/15 text-amber-100" truncate={false}>
                                        Watchers paused in Settings
                                    </MetaPill>
                                ) : null}
                            </div>
                        </div>
                        <div className="flex flex-wrap justify-center gap-2">
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
                                className={primaryButtonClass}
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
                        className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-center sm:p-3.5"
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
                            className={`${fieldClass} border-white/10 bg-background/50`}
                            placeholder="Paste a MediUX or ThePosterDB set URL to pin…"
                            value={watchUrlDraft}
                            onChange={(event) => setWatchUrlDraft(event.target.value)}
                        />
                        <button type="submit" className={`${primaryButtonClass} shrink-0`} disabled={busy !== null}>
                            <Eye className="h-4 w-4" /> Pin set
                        </button>
                    </form>

                    {watches.length ? (
                        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                            <input
                                className={`${fieldClass} sm:max-w-sm`}
                                placeholder="Filter by title, creator, URL…"
                                value={watchesFilter}
                                onChange={(event) => {
                                    setWatchesFilter(event.target.value);
                                    setWatchesPage(1);
                                }}
                            />
                            <div className="flex flex-wrap items-center gap-2">
                                <CustomSelect
                                    value={gridSize === 'list' ? 'medium' : gridSize}
                                    onChange={(value) => setGridSize(normalizeUpgraderGridSize(value))}
                                    options={POSTER_SETS_GRID_OPTIONS}
                                    className="w-full min-w-[140px] sm:w-auto"
                                    compact
                                />
                                <CustomSelect
                                    value={String(watchesPageSize)}
                                    onChange={(value) => {
                                        const next = Number(value) || 12;
                                        setWatchesPageSize(next);
                                        setWatchesPage(1);
                                    }}
                                    options={[...WATCHES_PAGE_SIZE_OPTIONS]}
                                    className="w-full min-w-[140px] sm:w-auto"
                                    compact
                                />
                                <span className="text-xs text-muted">
                                    {watchGroups.length} title{watchGroups.length === 1 ? '' : 's'}
                                    {filteredWatches.length !== watchGroups.length
                                        ? ` · ${filteredWatches.length} sets`
                                        : ''}
                                    {watchesFilter.trim() ? ` (of ${watches.length})` : ''}
                                </span>
                            </div>
                        </div>
                    ) : null}

                    {!watches.length ? (
                        <div className="rounded-xl border border-dashed border-white/15 bg-black/20 px-5 py-14 text-center">
                            <Eye className="mx-auto h-8 w-8 text-plex/70" />
                            <p className="mt-3 text-sm font-semibold text-text">Nothing watching yet</p>
                            <p className="mx-auto mt-1.5 max-w-md text-xs text-muted sm:text-sm">
                                Apply a set and keep watching, or pin a MediUX / TPDB URL above.
                                Sonarr On Import also refreshes matching watches after a short debounce.
                            </p>
                        </div>
                    ) : !filteredWatches.length ? (
                        <div className="rounded-xl border border-dashed border-white/15 bg-black/20 px-5 py-10 text-center text-sm text-muted">
                            No sets match “{watchesFilter.trim()}”.
                        </div>
                    ) : (
                        <div className="min-w-0 space-y-4">
                            <div className={posterGridClass} style={posterGridStyle}>
                                {pagedWatchGroups.map((group) => {
                                    const multi = group.watches.length > 1;
                                    const anyPaused = group.watches.every((watch) => watch.enabled === false);
                                    const thumbSrc = group.thumbUrl
                                        ? (group.thumbUrl.startsWith('http')
                                            ? posterSetsApi.imageUrl(group.thumbUrl)
                                            : group.thumbUrl)
                                        : '';
                                    return (
                                        <article
                                            key={group.key}
                                            className={`group flex min-w-0 flex-col overflow-hidden ${posterMediaRadiusClass} border bg-black/25 transition ${
                                                group.errored
                                                    ? 'border-red-500/35 ring-1 ring-red-500/20'
                                                    : 'border-white/10 hover:border-plex/40'
                                            }`}
                                        >
                                            <div className={`relative aspect-[2/3] overflow-hidden bg-black ${anyPaused ? 'opacity-55' : ''}`}>
                                                <PosterThumb
                                                    src={thumbSrc}
                                                    alt={group.title}
                                                    className="absolute inset-0 h-full w-full"
                                                    imgClassName="absolute inset-0 h-full w-full object-contain object-center transition duration-300 group-hover:scale-[1.02]"
                                                />
                                                {group.errored ? (
                                                    <span className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full border border-red-400/40 bg-red-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                                                        Error
                                                    </span>
                                                ) : anyPaused ? (
                                                    <span className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full border border-white/20 bg-black/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                                                        Paused
                                                    </span>
                                                ) : (
                                                    <span className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full border border-plex/40 bg-plex/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-background">
                                                        Watching
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex w-full min-w-0 flex-col items-center gap-1 border-b border-white/10 px-1.5 py-1.5 text-center sm:px-2">
                                                <p className="w-full line-clamp-2 text-center text-[10px] font-medium leading-snug text-text/90 sm:text-[11px]" title={group.title}>
                                                    {group.title}
                                                </p>
                                                <p className="w-full text-center text-[9px] text-muted sm:text-[10px]">
                                                    {multi ? `${group.watches.length} sets` : '1 set'}
                                                    {group.lastCheckedAt ? ` · ${formatTime(group.lastCheckedAt)}` : ''}
                                                </p>
                                            </div>

                                            <div className="flex min-w-0 flex-1 flex-col items-center gap-2 p-1.5 sm:p-2">
                                                {group.watches.map((watch) => {
                                                    const creator = String(watch.user || '').trim().replace(/^@/, '');
                                                    const provider = String(watch.provider || '').toLowerCase();
                                                    const setLabel = creator
                                                        ? `@${creator}`
                                                        : (watch.setId ? `Set ${watch.setId}` : 'Set');
                                                    const watchThumb = String(watch.thumbUrl || '').trim();
                                                    const watchThumbSrc = watchThumb
                                                        ? (watchThumb.startsWith('http')
                                                            ? posterSetsApi.imageUrl(watchThumb)
                                                            : watchThumb)
                                                        : '';
                                                    const iconBtnClass = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-text transition hover:border-plex/40 hover:bg-white/5 disabled:pointer-events-none disabled:opacity-40';
                                                    return (
                                                        <div
                                                            key={watch.id}
                                                            className={`flex w-full min-w-0 flex-col items-center gap-1.5 text-center ${
                                                                watch.lastError
                                                                    ? 'rounded-lg border border-red-500/30 bg-red-500/10 p-1.5'
                                                                    : ''
                                                            }`}
                                                        >
                                                            {multi && watchThumbSrc ? (
                                                                <PosterThumb
                                                                    src={watchThumbSrc}
                                                                    className="h-12 w-8 shrink-0 rounded"
                                                                    imgClassName="h-full w-full object-contain"
                                                                />
                                                            ) : null}
                                                            <div className="flex w-full min-w-0 flex-wrap items-center justify-center gap-0.5">
                                                                <StatusPill
                                                                    value={watch.enabled === false ? 'Paused' : 'Watching'}
                                                                    className="!max-w-none !shrink-0 !px-1.5 !py-px !text-[8px] sm:!text-[9px]"
                                                                />
                                                                <ProviderPill provider={provider} compact />
                                                                <CreatorPill user={creator} onOpen={openCreatorCatalog} compact />
                                                            </div>
                                                            <p className="w-full text-center text-[9px] leading-relaxed text-muted sm:text-[10px]">
                                                                {(watch.knownAssetIds || []).length} known
                                                                {watch.lastCheckedAt ? ` · ${formatTime(watch.lastCheckedAt)}` : ' · not checked'}
                                                                {watch.lastNewCount ? ` · +${watch.lastNewCount} last` : ''}
                                                            </p>
                                                            {watch.lastError ? (
                                                                <p className="w-full break-words text-center text-[10px] text-red-300 [overflow-wrap:anywhere]">{watch.lastError}</p>
                                                            ) : null}
                                                            {provider === 'posterdb' ? (
                                                                <p className="w-full text-center text-[9px] text-muted">TPDB has no title cards</p>
                                                            ) : (
                                                                <div className="flex w-full flex-wrap justify-center gap-0.5">
                                                                    {MEDIUX_FILTER_OPTIONS.map((option) => {
                                                                        const current = (watch.mediuxFilters?.length
                                                                            ? watch.mediuxFilters
                                                                            : ALL_MEDIUX_FILTER_IDS);
                                                                        const active = current.includes(option.id);
                                                                        return (
                                                                            <button
                                                                                key={option.id}
                                                                                type="button"
                                                                                className={`rounded-full border px-1.5 py-px text-[8px] font-bold tracking-wide transition sm:text-[9px] ${
                                                                                    active
                                                                                        ? 'border-plex/50 bg-plex/20 text-plex'
                                                                                        : 'border-white/10 bg-white/5 text-muted hover:border-white/20'
                                                                                }`}
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
                                                            <div className="flex items-center justify-center gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    className={iconBtnClass}
                                                                    disabled={busy !== null}
                                                                    aria-label={watch.enabled === false ? 'Enable' : 'Pause'}
                                                                    title={watch.enabled === false ? 'Enable' : 'Pause'}
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
                                                                    {watch.enabled === false
                                                                        ? <Play className="h-3.5 w-3.5" />
                                                                        : <Pause className="h-3.5 w-3.5" />}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className={iconBtnClass}
                                                                    disabled={busy !== null}
                                                                    aria-label="Check for new art"
                                                                    title="Check for new art"
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
                                                                    <RefreshCw className="h-3.5 w-3.5" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className={`${iconBtnClass} text-red-200 hover:border-red-400/40`}
                                                                    disabled={busy !== null}
                                                                    aria-label="Remove watch"
                                                                    title="Remove watch"
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
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                            {watchesPageCount > 1 ? (
                                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
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
                <section className={`${cardClass} space-y-5 p-5`}>
                    <div className="flex flex-col items-center gap-3 text-center">
                        <div className="min-w-0 max-w-3xl">
                            <h2 className={sectionTitleClass}>Recent sets</h2>
                            <p className={sectionBodyClass}>
                                Re-preview or re-apply sets you&apos;ve already used, grouped by art type.
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
                        <div className="space-y-6">
                            {RECENT_CATEGORY_ORDER.map((category) => {
                                const items = recentSetsByCategory[category.id];
                                if (!items.length) return null;
                                const landscape = category.landscape;
                                return (
                                    <div key={category.id} className="space-y-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="text-sm font-bold text-text sm:text-base">{category.title}</h3>
                                            <span className="text-[11px] text-muted">{items.length}</span>
                                        </div>
                                        <div
                                            className={posterGridClass}
                                            style={landscape ? titleCardGridStyle : posterGridStyle}
                                        >
                                            {items.map((item) => {
                                                const label = formatSetLabel(item) || item.title;
                                                const bulkSelected = Boolean(selectedBulkSets[item.url]);
                                                const openRecent = () => {
                                                    void openSetForApply({
                                                        setId: item.setId || '',
                                                        title: item.title,
                                                        url: item.url,
                                                        thumbUrl: item.thumbUrl,
                                                        user: item.user,
                                                        provider: item.provider || undefined,
                                                        posterCount: item.assetCount,
                                                        setKind: item.setKind || category.id,
                                                    });
                                                };
                                                return (
                                                    <div
                                                        key={item.url}
                                                        className={`relative flex min-w-0 flex-col overflow-hidden ${posterMediaRadiusClass} border bg-black/20 ${
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
                                                                    setKind: item.setKind || category.id,
                                                                })}
                                                                onClick={(event) => event.stopPropagation()}
                                                                aria-label={`Select ${label}`}
                                                            />
                                                        </label>
                                                        <button
                                                            type="button"
                                                            className="block w-full min-w-0 flex-1 text-left"
                                                            disabled={busy !== null}
                                                            onClick={openRecent}
                                                            title={`Preview ${label}`}
                                                        >
                                                            <div className={`relative overflow-hidden bg-black ${landscape ? 'aspect-[16/9]' : 'aspect-[2/3]'}`}>
                                                                <PosterThumb
                                                                    src={item.thumbUrl ? posterSetsApi.imageUrl(item.thumbUrl) : ''}
                                                                    alt={label}
                                                                    className="absolute inset-0 h-full w-full"
                                                                    imgClassName="absolute inset-0 h-full w-full object-contain object-center"
                                                                    loading="lazy"
                                                                    onLoad={(event) => {
                                                                        const img = event.currentTarget;
                                                                        if (!img.naturalWidth || !img.naturalHeight) return;
                                                                        const ratio = img.naturalWidth / img.naturalHeight;
                                                                        if (ratio < 1.2 || category.id !== 'posters') return;
                                                                        upsertRecentSet({
                                                                            ...item,
                                                                            setKind: 'title_cards',
                                                                        }, item.url, { setKind: 'title_cards' });
                                                                        setRecentTick((value) => value + 1);
                                                                    }}
                                                                />
                                                                <span className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full border border-white/15 bg-black/55 px-1.5 py-px text-[8px] font-bold uppercase tracking-wide text-text sm:text-[9px]">
                                                                    {providerLabel(item.provider)}
                                                                </span>
                                                            </div>
                                                            <div className="min-w-0 space-y-0.5 px-1.5 py-1.5 text-center sm:px-2">
                                                                <p className="line-clamp-2 text-center text-[10px] font-medium leading-snug text-text/90 sm:text-[11px]" title={label}>{label}</p>
                                                                <p className="truncate text-center text-[9px] text-muted sm:text-[10px]">
                                                                    {item.setId ? `#${item.setId}` : 'Set'}
                                                                    {item.assetCount ? ` · ${item.assetCount} assets` : ''}
                                                                </p>
                                                            </div>
                                                        </button>
                                                        <div className="flex items-center justify-center gap-1.5 border-t border-white/10 p-1.5">
                                                            <button
                                                                type="button"
                                                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-text transition hover:border-plex/40 hover:bg-white/5 disabled:pointer-events-none disabled:opacity-40"
                                                                disabled={busy !== null}
                                                                aria-label="Preview"
                                                                title="Preview"
                                                                onClick={openRecent}
                                                            >
                                                                {busy === 'preview' && url === item.url
                                                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                    : <ImageIcon className="h-3.5 w-3.5" />}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-plex text-background transition hover:bg-plex-hover disabled:pointer-events-none disabled:opacity-40"
                                                                disabled={busy !== null}
                                                                aria-label="Apply"
                                                                title="Apply"
                                                                onClick={() => {
                                                                    goToTab('apply');
                                                                    void runApply(false, item.url);
                                                                }}
                                                            >
                                                                {busy === 'apply' && url === item.url
                                                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                    : <RotateCcw className="h-3.5 w-3.5" />}
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
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
                <div className="min-w-0 space-y-4">
                    <section className={`${cardClass} min-w-0 space-y-4 overflow-hidden p-5`}>
                        {directPreviewMode ? (
                            <>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wide text-plex">Preview & queue</p>
                                    <p className="mt-1 text-sm text-muted">
                                        Review this set, then queue matched or selected art to Plex.
                                    </p>
                                </div>
                                {busy === 'preview' && !preview ? (
                                    <div
                                        ref={previewPanelRef}
                                        className="flex items-center gap-3"
                                    >
                                        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-plex" />
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-text">Loading set preview…</p>
                                            <p className="truncate text-xs text-muted" title={formatSetLabel(selectedSearchSet) || url}>
                                                {formatSetLabel(selectedSearchSet) || url}
                                            </p>
                                        </div>
                                    </div>
                                ) : null}
                                {readyToApply ? (
                                    <div ref={previewPanelRef} className="min-w-0 space-y-4">
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                            <div className="min-w-0">
                                                <h3 className="truncate text-lg font-bold text-text" title={previewHeaderLabel}>
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
                                                    {titleCardsOnly
                                                        ? 'Title-card pack — only episode title cards from this set. Tap to select.'
                                                        : 'Covers are tall posters; title cards show as landscape galleries by season. Tap to select.'}
                                                </p>
                                                <div className="mt-2 flex flex-wrap gap-3">
                                                    <button
                                                        type="button"
                                                        className="text-xs font-semibold text-plex hover:underline"
                                                        onClick={clearSearch}
                                                    >
                                                        Search for another set
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="text-xs font-semibold text-muted hover:text-text"
                                                        onClick={() => goToTab('browse')}
                                                    >
                                                        Back to Browse
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
                                        {(preview?.assets || []).length ? (
                                            <div className="space-y-3 border-t border-white/10 pt-4">
                                                <div className="flex flex-wrap gap-2">
                                                    <button type="button" className={buttonClass} onClick={() => selectPreviewAssets('matched')}>Matched only</button>
                                                    <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => void applyUnmatched()}>Queue unmatched</button>
                                                    <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => void applyNewSinceWatch()}>Queue new since watch</button>
                                                    <button type="button" className={buttonClass} onClick={() => selectPreviewAssets('all')}>Select all</button>
                                                    <button type="button" className={buttonClass} onClick={() => selectPreviewAssets('none')}>Clear selection</button>
                                                    <button type="button" className={buttonClass} disabled={busy !== null || !selectedAssetIds.length} onClick={() => void runApply(true)}>
                                                        Queue selected ({selectedAssetIds.length})
                                                    </button>
                                                </div>
                                                <PreviewAssetGallery
                                                    sections={previewSections}
                                                    selectedAssetIds={selectedAssetIds}
                                                    onToggle={toggleAsset}
                                                />
                                                <RelatedSetsRail
                                                    sets={relatedSets}
                                                    loading={relatedSetsLoading}
                                                    mediaLabel={inferPreviewMediaType(preview) === 'show' ? 'show' : 'movie'}
                                                    disabled={busy !== null}
                                                    onOpen={(item) => void openSetForApply(item)}
                                                    onOpenCreator={openCreatorCatalog}
                                                />
                                            </div>
                                        ) : (
                                            <>
                                                <p className="border-t border-white/10 pt-4 text-sm text-amber-200">
                                                    This set previewed with no assets. Check MediUX filters in Settings, or try another set.
                                                </p>
                                                <RelatedSetsRail
                                                    sets={relatedSets}
                                                    loading={relatedSetsLoading}
                                                    mediaLabel={inferPreviewMediaType(preview) === 'show' ? 'show' : 'movie'}
                                                    disabled={busy !== null}
                                                    onOpen={(item) => void openSetForApply(item)}
                                                    onOpenCreator={openCreatorCatalog}
                                                />
                                            </>
                                        )}
                                        <div className="flex flex-wrap gap-2">
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
                            </>
                        ) : null}

                        {!directPreviewMode ? (
                        <>
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
                                    <div className={posterGridClass} style={searchSetsUseTitleCardGrid ? titleCardGridStyle : posterGridStyle}>
                                        {pagedSearchSets.map((set) => {
                                            const setTitle = String(set.title || '').trim() || `Set #${set.setId}`;
                                            const setLabel = formatSetLabel(set) || setTitle;
                                            const bulkSelected = Boolean(selectedBulkSets[set.url]);
                                            const watching = isSetWatched(set);
                                            const landscape = isTitleCardSet(set);
                                            return (
                                            <div
                                                key={`${set.provider || findProvider}-${set.setId}`}
                                                className={`relative overflow-hidden ${posterMediaRadiusClass} border text-left transition ${
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
                                                <div className={`relative overflow-hidden bg-black ${landscape ? 'aspect-[16/9]' : 'aspect-[2/3]'}`}>
                                                    {set.thumbUrl ? (
                                                        <img
                                                            src={posterSetsApi.imageUrl(set.thumbUrl)}
                                                            alt={setLabel}
                                                            className={`absolute inset-0 h-full w-full object-contain object-center ${watching ? 'opacity-80' : ''}`}
                                                            loading="lazy"
                                                        />
                                                    ) : (
                                                        <div className="absolute inset-0 flex items-center justify-center text-muted">
                                                            <ImageIcon className="h-8 w-8 opacity-40" />
                                                        </div>
                                                    )}
                                                    {busy === 'preview' && selectedSearchSet?.setId === set.setId ? (
                                                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                                                            <Loader2 className="h-6 w-6 animate-spin text-plex" />
                                                        </div>
                                                    ) : null}
                                                </div>
                                                <div className="px-3 pt-3">
                                                    <p className="truncate text-sm font-semibold text-text" title={setTitle}>{setTitle}</p>
                                                </div>
                                                </button>
                                                <div className="flex flex-wrap items-center gap-1.5 px-3 pb-3 pt-1.5">
                                                    <CreatorPill user={set.user} onOpen={openCreatorCatalog} />
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
                                <div ref={previewPanelRef} className="order-1 mt-4 min-w-0 space-y-4 border-t border-white/10 pt-4">
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
                                                {titleCardsOnly
                                                    ? 'Title-card pack — only episode title cards from this set. Tap to select.'
                                                    : 'Covers are tall posters; title cards show as landscape galleries by season. Tap to select.'}
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
                                        <RelatedSetsRail
                                            sets={relatedSets}
                                            loading={relatedSetsLoading}
                                            mediaLabel={inferPreviewMediaType(preview) === 'show' ? 'show' : 'movie'}
                                            disabled={busy !== null}
                                            onOpen={(item) => void openSetForApply(item)}
                                            onOpenCreator={openCreatorCatalog}
                                        />
                                    </div>

                                    <div className="flex flex-wrap gap-2">
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
                                            <button
                                                type="button"
                                                className={buttonClass}
                                                disabled={busy !== null}
                                                onClick={() => {
                                                    const target = String(url).trim();
                                                    if (target) {
                                                        pushPosterLocation({
                                                            tab: 'apply',
                                                            rail: null,
                                                            setUrl: target,
                                                            creator: null,
                                                            titleCardsOnly: false,
                                                        }, 'push');
                                                    }
                                                    void runPreview(undefined, { titleCardsOnly: false });
                                                }}
                                            >
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
                        </>
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
                    <div className="flex flex-col items-center gap-3 text-center">
                        <div className="min-w-0 max-w-3xl">
                            <h2 className="text-lg font-bold text-text">
                                {historyFilter === 'audit' ? 'Audit log' : 'Job history'}
                            </h2>
                            <p className="mt-1 text-sm text-muted">
                                {historyFilter === 'audit'
                                    ? 'Manual, watch, and bulk apply events with upload counts.'
                                    : 'Apply and bulk runs with logs. Recent jobs survive restarts.'}
                            </p>
                        </div>
                        <div className="flex flex-wrap justify-center gap-2">
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
                                                    void openSetForApply({
                                                        setId: '',
                                                        title: '',
                                                        url: target,
                                                    });
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
                                                    goToTab('apply');
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
                        <label className="block sm:col-span-2">
                            <span className="text-xs font-bold uppercase tracking-wide text-muted">Creators you follow</span>
                            <textarea
                                className={`${fieldClass} mt-2 min-h-24`}
                                placeholder={'kaster\nTheDoctor30'}
                                value={whitelistText}
                                onChange={(event) => setWhitelistText(event.target.value)}
                            />
                            <span className="mt-1 block text-[11px] text-muted">
                                One MediUX / ThePosterDB username per line (no @ needed). Browse adds a “Creators you follow” row with only their sets. Click any @username to open their full catalog.
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
                            description="Send a Gotify digest when set watchers enqueue new posters. Requires Gotify enabled under Settings → Notifications."
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
