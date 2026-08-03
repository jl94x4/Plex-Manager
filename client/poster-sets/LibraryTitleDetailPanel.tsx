import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    CheckCircle2,
    ChevronLeft,
    Eye,
    History,
    Image as ImageIcon,
    Loader2,
    PanelRight,
    RotateCcw,
    Square,
    X,
} from 'lucide-react';
import { askConfirm } from '../shared/confirm';
import { ModalPortal } from '../shared/ModalPortal';
import { SettingsToggleRow } from '../shared/ui';
import { posterSetsApi } from './api';
import { pickAutoMatchedTitle, rankSearchTitlesForLibraryItem } from './autoMatchTitle';
import { fetchPosterSetsForTitle } from './fetchPosterSetsForTitle';
import { previewAssetEpisodeLabel } from './previewGroups';
import { libraryItemPosterSrc, type LibraryRecentItem } from './libraryRecent';
import { SetInspector, SetInspectorThumbStrip } from './SetInspector';
import { PreviewAssetStrip } from './shared/posterSetsPreview';
import {
    mediuxFiltersFromAssets,
    type PosterSetsPreview,
    type PosterSetsPreviewAsset,
    type PosterSetsSearchSet,
    type PosterSetsSearchTitle,
    type PosterSetsSetMeta,
    type PosterSetsTitleStatus,
    type PosterSetsWatch,
} from './types';
import { ProviderCornerBadge } from './shared/posterSetsPills';
import {
    inferRecentSetKindFromAssets,
    isTitleCardSet,
    partitionSetsByCategory,
    SEARCH_SET_CATEGORY_ORDER,
} from './shared/posterSetsRecent';
import type { LibraryDetailLayout } from './shared/posterSetsUi';

const TITLE_CARD_ONLY_FILTERS = ['title_card'];
const SETS_PAGE_SIZE_DRAWER = 12;
const SETS_PAGE_SIZE_MODAL = 20;

const buttonClass = 'inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs font-semibold text-text transition hover:border-plex/40 hover:bg-white/5 disabled:pointer-events-none disabled:opacity-40 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm';
const primaryButtonClass = 'inline-flex items-center justify-center gap-1.5 rounded-xl bg-plex px-2.5 py-1.5 text-xs font-bold text-background transition hover:bg-plex-hover active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm';
const fieldClass = 'w-full rounded-lg border border-white/10 bg-background/70 px-3 py-2 text-xs text-text placeholder:text-muted/60 outline-none transition focus:border-plex focus:ring-1 focus:ring-plex sm:py-2.5 sm:text-sm';

function PosterThumb({
    src,
    alt,
    className = '',
    imgClassName = '',
}: {
    src: string;
    alt: string;
    className?: string;
    imgClassName?: string;
}) {
    if (!src) {
        return (
            <div className={`flex items-center justify-center bg-black/40 text-muted ${className}`}>
                <ImageIcon className="h-10 w-10 opacity-30" />
            </div>
        );
    }
    return (
        <div className={className}>
            <img src={src} alt={alt} className={imgClassName} loading="lazy" />
        </div>
    );
}

function PreviewAssetTile({
    asset,
    selected,
    layout,
    onToggle,
}: {
    asset: PosterSetsPreviewAsset;
    selected: boolean;
    layout: 'poster' | 'landscape';
    onToggle: (id: string) => void;
}) {
    const matched = asset.matched === true;
    const unmatched = asset.matched === false;
    const title = layout === 'landscape'
        ? previewAssetEpisodeLabel(asset)
        : `${asset.title}${asset.year ? ` (${asset.year})` : ''}`;
    return (
        <button
            type="button"
            onClick={() => onToggle(asset.id)}
            className={`group shrink-0 overflow-hidden rounded-md border text-left transition ${
                layout === 'landscape' ? 'w-72 sm:w-80' : 'w-[5.75rem] sm:w-32'
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
            </div>
            <div className="space-y-0.5 p-2">
                <p className="line-clamp-2 text-[10px] font-medium leading-snug text-text/90">{title}</p>
            </div>
        </button>
    );
}

const formatWhen = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

export type LibraryTitleDetailPanelProps = {
    item: LibraryRecentItem | null;
    onClose: () => void;
    dupePreference: 'mediux' | 'posterdb';
    queuePaused: boolean;
    watches: PosterSetsWatch[];
    serverType?: string;
    layoutMode?: LibraryDetailLayout;
    onLayoutModeChange?: (layout: LibraryDetailLayout) => void;
    toast: (message: string, type?: 'success' | 'error') => void;
    onApplied?: () => void;
    onWatchAdded?: () => void;
    onArtReset?: () => void;
};

export function LibraryTitleDetailPanel({
    item,
    onClose,
    dupePreference,
    queuePaused,
    watches,
    toast,
    onApplied,
    onWatchAdded,
    onArtReset,
    serverType = 'plex',
    layoutMode = 'drawer',
    onLayoutModeChange,
}: LibraryTitleDetailPanelProps) {
    const [busy, setBusy] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingMoreSets, setLoadingMoreSets] = useState(false);
    const [titleStatus, setTitleStatus] = useState<PosterSetsTitleStatus | null>(null);
    const [statusLoading, setStatusLoading] = useState(false);
    const [resetScope, setResetScope] = useState<'poster' | 'seasons' | 'episodes' | 'all'>('poster');
    const [searchTitles, setSearchTitles] = useState<PosterSetsSearchTitle[]>([]);
    const [searchSets, setSearchSets] = useState<PosterSetsSearchSet[]>([]);
    const [searchContext, setSearchContext] = useState('');
    const [selectedTitle, setSelectedTitle] = useState<PosterSetsSearchTitle | null>(null);
    const [selectedSet, setSelectedSet] = useState<PosterSetsSearchSet | null>(null);
    const [preview, setPreview] = useState<PosterSetsPreview | null>(null);
    const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
    const [showAssets, setShowAssets] = useState(false);
    const [titleCardsOnly, setTitleCardsOnly] = useState(false);
    const [setsPage, setSetsPage] = useState(1);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const loadGenRef = useRef(0);

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

    const resetState = useCallback(() => {
        setBusy(null);
        setLoading(false);
        setLoadingMoreSets(false);
        setSearchTitles([]);
        setSearchSets([]);
        setSearchContext('');
        setSelectedTitle(null);
        setSelectedSet(null);
        setPreview(null);
        setSelectedAssetIds([]);
        setShowAssets(false);
        setTitleCardsOnly(false);
        setSetsPage(1);
        setTitleStatus(null);
    }, []);

    const backToSets = useCallback(() => {
        setPreview(null);
        setSelectedSet(null);
        setSelectedAssetIds([]);
        setShowAssets(false);
        setTitleCardsOnly(false);
    }, []);

    const loadSetsForTitle = useCallback(async (
        title: PosterSetsSearchTitle,
        libraryItem?: LibraryRecentItem | null,
    ) => {
        setBusy('search');
        setSearchSets([]);
        setSelectedTitle(title);
        setSelectedSet(null);
        setPreview(null);
        const hasLinkedTmdb = String(title.provider || '').toLowerCase() === 'mediux' && Boolean(title.id);
        if (hasLinkedTmdb) setLoadingMoreSets(true);
        try {
            const response = await fetchPosterSetsForTitle(title, {
                dupePreference,
                mediaType: libraryItem?.mediaType,
                libraryItem: libraryItem || undefined,
                onPartial: (partial) => {
                    if ((partial.sets?.length || 0) > 0) {
                        setSearchSets(partial.sets || []);
                        setSearchContext(partial.title || title.title);
                        setLoading(false);
                        setLoadingMoreSets(true);
                    }
                },
            });
            setSearchSets(response.sets || []);
            setSetsPage(1);
            setSearchContext(response.title || title.title);
            setSearchTitles([]);
            if (response.partialErrors?.length) {
                const msg = response.partialErrors[0];
                const soft = msg.includes('ThePosterDB returned no sets');
                toast(msg, soft ? undefined : 'error');
            }
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to load sets', 'error');
        } finally {
            setBusy(null);
            setLoadingMoreSets(false);
        }
    }, [dupePreference, toast]);

    const runSearch = useCallback(async (libraryItem: LibraryRecentItem) => {
        const generation = ++loadGenRef.current;
        setLoading(true);
        setLoadingMoreSets(false);
        setSearchTitles([]);
        setSearchSets([]);
        setSearchContext('');
        setSelectedTitle(null);
        setSelectedSet(null);
        setPreview(null);
        setSetsPage(1);

        const queries = libraryItem.year != null
            ? [`${libraryItem.title} ${libraryItem.year}`, libraryItem.title]
            : [libraryItem.title];

        try {
            const responses = await Promise.all(queries.map((query) => posterSetsApi.search({
                provider: 'mediux',
                query,
                mode: 'title',
                dupePreference,
                limit: 24,
                mediaType: libraryItem.mediaType,
                titleHint: libraryItem.title,
                yearHint: libraryItem.year ?? undefined,
            })));

            if (generation !== loadGenRef.current) return;

            let autoMatch: PosterSetsSearchTitle | null = null;
            let titles: PosterSetsSearchTitle[] = [];
            let response: (typeof responses)[number] | null = null;

            for (const result of responses) {
                titles = [...titles, ...(result.titles || [])];
                response = result;
                const match = pickAutoMatchedTitle(libraryItem, result.titles || []);
                if (match) {
                    autoMatch = match;
                    break;
                }
            }

            if (generation !== loadGenRef.current) return;

            if (autoMatch) {
                setLoading(false);
                setLoadingMoreSets(true);
                await loadSetsForTitle(autoMatch, libraryItem);
                return;
            }

            setSearchTitles(rankSearchTitlesForLibraryItem(libraryItem, titles));
            setSearchSets(response?.sets || []);
            setSearchContext(response?.title || libraryItem.title);
            if (response?.partialErrors?.length) {
                const msg = response.partialErrors[0];
                const soft = msg.includes('ThePosterDB returned no sets');
                toast(msg, soft ? undefined : 'error');
            }
        } catch (error) {
            if (generation === loadGenRef.current) {
                toast(error instanceof Error ? error.message : 'Search failed', 'error');
            }
        } finally {
            if (generation === loadGenRef.current) setLoading(false);
        }
    }, [dupePreference, loadSetsForTitle, toast]);

    useEffect(() => {
        if (!item) {
            resetState();
            return;
        }
        void runSearch(item);
    }, [item, resetState, runSearch]);

    const refreshTitleStatus = useCallback(async () => {
        if (!item) return;
        setStatusLoading(true);
        try {
            const response = await posterSetsApi.titleStatus({
                title: item.title,
                mediaType: item.mediaType,
                ratingKey: item.id,
            });
            setTitleStatus(response);
        } catch {
            setTitleStatus(null);
        } finally {
            setStatusLoading(false);
        }
    }, [item]);

    useEffect(() => {
        if (!item) {
            setTitleStatus(null);
            return;
        }
        void refreshTitleStatus();
    }, [item, refreshTitleStatus]);

    const titleWatchEnabled = titleStatus?.titleWatch?.enabled === true;
    const titleWatchSetUrl = String(
        selectedSet?.url
        || preview?.url
        || titleStatus?.titleWatch?.url
        || titleStatus?.lastApply?.url
        || '',
    ).trim();

    const runResetArt = async () => {
        if (!item) return;
        const scopeLabel = item.mediaType === 'movie'
            ? 'poster'
            : resetScope === 'all'
                ? 'show poster, all season posters, and all episode thumbs'
                : resetScope === 'seasons'
                    ? 'show and season posters'
                    : resetScope === 'episodes'
                        ? 'all episode thumbs'
                        : 'show poster only';
        const ok = await askConfirm(
            `Reset ${scopeLabel} for “${item.title}” to Plex defaults? Custom art from poster sets will be cleared.`,
            {
                title: 'Reset artwork?',
                confirmLabel: 'Reset',
                cancelLabel: 'Cancel',
            },
        );
        if (!ok) return;
        setBusy('reset');
        try {
            await posterSetsApi.resetArt({
                ratingKey: item.id,
                mediaType: item.mediaType,
                scope: item.mediaType === 'movie' ? 'poster' : resetScope,
            });
            toast('Artwork reset to Plex defaults.');
            onArtReset?.();
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to reset artwork', 'error');
        } finally {
            setBusy(null);
        }
    };

    useEffect(() => {
        if (!item) return undefined;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (preview || selectedSet) {
                backToSets();
                return;
            }
            onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [item, onClose, preview, selectedSet, backToSets]);

    const currentSetMeta = (): PosterSetsSetMeta | null => {
        if (!selectedSet && !preview?.setMeta) return null;
        const previewMeta = preview?.setMeta;
        return {
            provider: selectedSet?.provider || previewMeta?.provider || null,
            setId: selectedSet?.setId || previewMeta?.setId || null,
            url: selectedSet?.url || previewMeta?.url || null,
            title: previewMeta?.title || selectedSet?.title || null,
            user: previewMeta?.user || selectedSet?.user || null,
            thumbUrl: selectedSet?.thumbUrl || previewMeta?.thumbUrl || '',
            assetCount: selectedSet?.posterCount ?? preview?.total ?? previewMeta?.assetCount ?? null,
            setKind: isTitleCardSet(selectedSet) ? 'title_cards' : null,
        };
    };

    const toggleTitleWatch = async (enabled?: boolean) => {
        if (!item) return;
        const nextEnabled = enabled ?? !titleWatchEnabled;
        if (nextEnabled && !titleWatchSetUrl) {
            toast('Apply a poster set first, or select a set to watch.', 'error');
            return;
        }
        setBusy('title-watch');
        try {
            await posterSetsApi.titleWatch({
                title: item.title,
                mediaType: item.mediaType,
                ratingKey: item.id,
                setUrl: titleWatchSetUrl || undefined,
                enabled: nextEnabled,
                setMeta: nextEnabled ? currentSetMeta() : undefined,
            });
            toast(nextEnabled ? 'Watching this title for poster updates.' : 'Stopped watching this title.');
            await refreshTitleStatus();
            onWatchAdded?.();
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to update title watch', 'error');
        } finally {
            setBusy(null);
        }
    };

    const filtersForSelectedIds = (ids: string[]) => {
        if (!ids.length) return undefined;
        const byId = new Map((preview?.assets || []).map((asset) => [asset.id, asset]));
        const selected = ids.map((id) => byId.get(id)).filter(Boolean) as PosterSetsPreviewAsset[];
        const filters = mediuxFiltersFromAssets(selected);
        return filters.length ? filters : undefined;
    };

    const runPreview = async (set: PosterSetsSearchSet) => {
        const target = String(set.url || '').trim();
        if (!target) {
            toast('This set is missing a URL.', 'error');
            return;
        }
        const restrictTitleCards = isTitleCardSet(set);
        setSelectedSet(set);
        setTitleCardsOnly(restrictTitleCards);
        setShowAssets(false);
        setBusy('preview');
        try {
            const response = await posterSetsApi.preview(
                target,
                restrictTitleCards ? TITLE_CARD_ONLY_FILTERS : undefined,
            );
            setPreview(response);
            if (!restrictTitleCards && inferRecentSetKindFromAssets(response.assets) === 'title_cards') {
                setTitleCardsOnly(true);
            }
            setSelectedAssetIds([]);
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Preview failed', 'error');
            setPreview(null);
        } finally {
            setBusy(null);
        }
    };

    const applyMatched = async () => {
        const target = String(selectedSet?.url || preview?.url || '').trim();
        if (!target || !preview) return;
        const matchedIds = (preview.assets || []).filter((asset) => asset.matched === true).map((asset) => asset.id);
        const ids = matchedIds.length ? matchedIds : selectedAssetIds;
        if (!ids.length) {
            toast('No matched posters to apply.', 'error');
            return;
        }
        setBusy('apply');
        try {
            await posterSetsApi.apply(
                target,
                ids,
                currentSetMeta(),
                undefined,
                filtersForSelectedIds(ids),
                {
                    ratingKey: item.id,
                    title: item.title,
                    mediaType: item.mediaType,
                },
            );
            toast(queuePaused
                ? `Queued ${ids.length} poster${ids.length === 1 ? '' : 's'} (queue paused).`
                : `Queued ${ids.length} poster${ids.length === 1 ? '' : 's'}.`);
            onApplied?.();
            await refreshTitleStatus();
            setPreview(null);
            setSelectedSet(null);
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to queue apply', 'error');
        } finally {
            setBusy(null);
        }
    };

    const addWatch = async (set: PosterSetsSearchSet) => {
        const target = String(set.url || '').trim();
        if (!target) return;
        if (isSetWatched(set)) {
            toast('Already watching this set.', 'error');
            return;
        }
        setBusy('watch');
        try {
            await posterSetsApi.addWatch({ url: target });
            toast('Watching set for updates.');
            onWatchAdded?.();
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to add watch', 'error');
        } finally {
            setBusy(null);
        }
    };

    const matchedAssetCount = useMemo(
        () => (preview?.assets || []).filter((asset) => asset.matched === true).length,
        [preview],
    );

    const matchedThumbStrip = useMemo(() => {
        const assets = (preview?.assets || []).filter((asset) => asset.matched === true);
        return assets.map((asset) => ({
            id: asset.id,
            title: asset.title,
            thumbUrl: asset.thumbUrl ? posterSetsApi.imageUrl(asset.thumbUrl) : '',
        }));
    }, [preview]);

    const setsByCategory = useMemo(() => partitionSetsByCategory(searchSets), [searchSets]);
    const setsPageSize = layoutMode === 'modal' ? SETS_PAGE_SIZE_MODAL : SETS_PAGE_SIZE_DRAWER;
    const setsPageCount = Math.max(1, Math.ceil(setsByCategory.posters.length / setsPageSize));
    const paginatedPosters = useMemo(() => {
        const page = Math.min(Math.max(1, setsPage), setsPageCount);
        const start = (page - 1) * setsPageSize;
        return setsByCategory.posters.slice(start, start + setsPageSize);
    }, [setsByCategory.posters, setsPage, setsPageCount, setsPageSize]);

    const selectedSetUsesLandscape = useMemo(() => {
        if (titleCardsOnly || isTitleCardSet(selectedSet)) return true;
        return inferRecentSetKindFromAssets(preview?.assets) === 'title_cards';
    }, [preview?.assets, selectedSet, titleCardsOnly]);

    const readyToApply = Boolean(preview && !busy);
    const headerLabel = item
        ? (item.year ? `${item.title} (${item.year})` : item.title)
        : '';

    if (!item) return null;

    const isModalLayout = layoutMode === 'modal';
    const setsGridClass = isModalLayout
        ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
        : 'grid grid-cols-2 gap-3 sm:grid-cols-3';
    const setsGridClassLandscape = isModalLayout
        ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'
        : 'grid grid-cols-1 gap-3 sm:grid-cols-2';
    const panelShellClass = isModalLayout
        ? [
            'fixed z-[101] flex max-h-[100dvh] flex-col bg-card shadow-2xl',
            'inset-y-0 right-0 h-[100dvh] w-full max-w-[min(100%,520px)] border-l border-white/10 pt-[env(safe-area-inset-top,0px)]',
            'md:inset-auto md:left-1/2 md:top-1/2 md:h-auto md:w-[min(96vw,960px)] md:max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border md:border-white/10 md:pt-0',
        ].join(' ')
        : 'fixed inset-y-0 right-0 z-[101] flex h-[100dvh] max-h-[100dvh] w-full max-w-[min(100%,520px)] flex-col border-l border-white/10 bg-card pt-[env(safe-area-inset-top,0px)] shadow-2xl';

    return (
        <ModalPortal open>
            <>
            <button
                type="button"
                aria-label="Close title detail"
                className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm"
                onClick={onClose}
            />
            <div
                ref={panelRef}
                className={panelShellClass}
            >
                <div className="flex shrink-0 items-start gap-3 border-b border-white/10 bg-black/20 p-4 sm:p-5 md:rounded-t-2xl">
                    <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-md border border-white/10 bg-black">
                        <PosterThumb
                            src={libraryItemPosterSrc(item)}
                            alt={item.title}
                            className="absolute inset-0 h-full w-full"
                            imgClassName="absolute inset-0 h-full w-full object-cover"
                        />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-plex">
                            {item.mediaType === 'movie' ? 'Movie' : 'TV show'}
                        </p>
                        <h2 className="mt-0.5 truncate text-lg font-bold text-text" title={headerLabel}>
                            {item.title}
                        </h2>
                        {item.year ? <p className="text-sm text-muted">{item.year}</p> : null}
                        {searchContext && searchContext !== item.title ? (
                            <p className="mt-1 truncate text-xs text-muted">Matched as “{searchContext}”</p>
                        ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                        {onLayoutModeChange ? (
                            <button
                                type="button"
                                className={`${buttonClass} hidden md:inline-flex`}
                                onClick={() => onLayoutModeChange(isModalLayout ? 'drawer' : 'modal')}
                                title={isModalLayout ? 'Switch to side drawer' : 'Switch to centered modal'}
                                aria-label={isModalLayout ? 'Switch to side drawer' : 'Switch to centered modal'}
                            >
                                {isModalLayout ? <PanelRight className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                            </button>
                        ) : null}
                        <button type="button" className={buttonClass} onClick={onClose} aria-label="Close">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:p-5 custom-scrollbar">
                    {statusLoading ? (
                        <div className="mb-4 flex items-center gap-2 text-xs text-muted">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Loading title status…
                        </div>
                    ) : null}
                    {(titleStatus || String(serverType).toLowerCase() === 'plex') && !statusLoading ? (
                        <div className="mb-4 space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
                                <History className="h-3.5 w-3.5" />
                                Title status
                            </div>
                            {titleStatus?.lastApply ? (
                                <div className="text-sm">
                                    <p className="font-semibold text-text">
                                        Last applied
                                        {titleStatus.lastApply.uploaded != null
                                            ? ` · ${titleStatus.lastApply.uploaded} uploaded`
                                            : ''}
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted">
                                        {titleStatus.lastApply.title || titleStatus.lastApply.url || 'Poster set'}
                                        {titleStatus.lastApply.user ? ` · @${titleStatus.lastApply.user}` : ''}
                                    </p>
                                    {titleStatus.lastApply.at ? (
                                        <p className="mt-0.5 text-[11px] text-muted">{formatWhen(titleStatus.lastApply.at)}</p>
                                    ) : null}
                                </div>
                            ) : (
                                <p className="text-sm text-muted">No successful apply recorded for this title yet.</p>
                            )}
                            <div className="rounded-lg border border-white/10 bg-black/30 px-3">
                                <SettingsToggleRow
                                    title="Watch this title"
                                    description={
                                        titleWatchSetUrl
                                            ? `Pin updates for ${titleStatus?.titleWatch?.setTitle || titleStatus?.lastApply?.title || 'the active poster set'}.`
                                            : 'Apply a poster set first, then auto-queue new art for this title.'
                                    }
                                    checked={titleWatchEnabled}
                                    disabled={busy !== null || ( !titleWatchEnabled && !titleWatchSetUrl )}
                                    onChange={(next) => { void toggleTitleWatch(next); }}
                                    border={false}
                                />
                            </div>
                            {(titleStatus?.watchingCount || 0) > 0 ? (
                                <p className="flex items-center gap-1.5 text-xs text-plex">
                                    <Eye className="h-3.5 w-3.5" />
                                    Watching {titleStatus?.watchingCount} set{(titleStatus?.watchingCount || 0) === 1 ? '' : 's'} for updates
                                </p>
                            ) : null}
                            {String(serverType).toLowerCase() === 'plex' ? (
                                <div className="space-y-2 border-t border-white/10 pt-3">
                                    {item.mediaType === 'show' ? (
                                        <div className="flex flex-wrap gap-1.5">
                                            {([
                                                ['poster', 'Show poster'],
                                                ['seasons', '+ seasons'],
                                                ['episodes', 'Episodes'],
                                                ['all', 'All'],
                                            ] as const).map(([id, label]) => (
                                                <button
                                                    key={id}
                                                    type="button"
                                                    className={`rounded-lg border px-2 py-1 text-[10px] font-semibold ${
                                                        resetScope === id
                                                            ? 'border-plex/40 bg-plex/15 text-plex'
                                                            : 'border-white/10 text-muted hover:text-text'
                                                    }`}
                                                    onClick={() => setResetScope(id)}
                                                >
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}
                                    <button
                                        type="button"
                                        className={`${buttonClass} w-full`}
                                        disabled={busy !== null}
                                        onClick={() => void runResetArt()}
                                    >
                                        {busy === 'reset' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                                        Reset to default art
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    {loading ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-muted">
                            <Loader2 className="h-6 w-6 animate-spin text-plex" />
                            Finding title on MediUX…
                        </div>
                    ) : null}

                    {loadingMoreSets && searchSets.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-muted">
                            <Loader2 className="h-6 w-6 animate-spin text-plex" />
                            Loading poster sets…
                        </div>
                    ) : null}

                    {loadingMoreSets && searchSets.length > 0 ? (
                        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-surface/40 px-3 py-2 text-xs text-muted">
                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-plex" />
                            Loading more sets from ThePosterDB…
                        </div>
                    ) : null}

                    {!loading && searchTitles.length > 0 ? (
                        <div className="space-y-3">
                            <p className="text-sm text-muted">
                                Pick the correct title match, then choose a poster set.
                            </p>
                            <div className="space-y-2">
                                {searchTitles.map((title) => (
                                    <button
                                        key={`${title.provider}-${title.id}-${title.title}`}
                                        type="button"
                                        className={`${fieldClass} text-left transition hover:border-plex/40`}
                                        disabled={busy !== null}
                                        onClick={() => void loadSetsForTitle(title, item)}
                                    >
                                        <span className="font-semibold text-text">{title.title}</span>
                                        {title.year ? <span className="text-muted"> ({title.year})</span> : null}
                                        {title.provider ? (
                                            <span className="ml-2 text-[10px] uppercase text-muted">{title.provider}</span>
                                        ) : null}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {!loading && !loadingMoreSets && !searchTitles.length && !searchSets.length && !selectedSet ? (
                        <div className="rounded-xl border border-dashed border-white/10 px-4 py-12 text-center">
                            <ImageIcon className="mx-auto h-10 w-10 text-muted opacity-40" />
                            <p className="mt-3 text-sm font-semibold text-text">No poster sets found</p>
                            <p className="mt-1 text-xs text-muted">
                                Nothing matched “{item.title}” on MediUX or ThePosterDB yet. Try Discover to search manually, or pick a title match if shown above.
                            </p>
                        </div>
                    ) : null}

                    {!loading && searchSets.length > 0 && !selectedSet ? (
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <h3 className="text-sm font-bold text-text">
                                    Available sets
                                    {searchContext ? ` · ${searchContext}` : ''}
                                </h3>
                                <span className="text-[11px] text-muted">{searchSets.length} found</span>
                            </div>
                            <div className="space-y-5">
                                {SEARCH_SET_CATEGORY_ORDER.map((category) => {
                                    const items = category.id === 'title_cards'
                                        ? setsByCategory.titleCards
                                        : category.id === 'backgrounds'
                                            ? setsByCategory.backgrounds
                                            : paginatedPosters;
                                    if (!items.length) return null;
                                    const landscape = category.landscape;
                                    return (
                                        <div key={category.id} className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-xs font-bold uppercase tracking-wide text-muted">
                                                    {category.title}
                                                </h4>
                                                <span className="text-[11px] text-muted">{items.length}</span>
                                            </div>
                                            <div className={landscape ? setsGridClassLandscape : setsGridClass}>
                                                {items.map((set) => {
                                                    const watching = isSetWatched(set);
                                                    const setTitle = String(set.title || '').trim() || `Set #${set.setId}`;
                                                    const creator = String(set.user || '').trim().replace(/^@+/, '');
                                                    const expanded = selectedSet?.url === set.url;
                                                    return (
                                                        <div
                                                            key={`${set.provider}-${set.setId}-${set.url}`}
                                                            className={`flex flex-col overflow-hidden rounded-md border bg-black/20 transition ${
                                                                expanded ? 'border-plex/60 ring-1 ring-plex/30' : 'border-white/10 hover:border-plex/40'
                                                            }`}
                                                        >
                                                            <button
                                                                type="button"
                                                                className="text-left"
                                                                disabled={busy !== null}
                                                                onClick={() => void runPreview(set)}
                                                            >
                                                                <div className={`relative bg-black text-center ${landscape ? 'aspect-[16/9]' : 'aspect-[2/3]'}`}>
                                                                    {set.thumbUrl ? (
                                                                        <img
                                                                            src={posterSetsApi.imageUrl(set.thumbUrl)}
                                                                            alt={setTitle}
                                                                            className="absolute inset-0 h-full w-full object-contain object-center"
                                                                            loading="lazy"
                                                                        />
                                                                    ) : (
                                                                        <div className="absolute inset-0 flex items-center justify-center text-muted">
                                                                            <ImageIcon className="h-8 w-8 opacity-40" />
                                                                        </div>
                                                                    )}
                                                                    <ProviderCornerBadge provider={set.provider} />
                                                                </div>
                                                                {watching ? (
                                                                    <div className="px-2 pt-2">
                                                                        <span className="inline-flex rounded-full border border-plex/35 bg-plex/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-plex">
                                                                            Watching
                                                                        </span>
                                                                    </div>
                                                                ) : null}
                                                                <div className="px-2 py-2 text-center">
                                                                    <p className="line-clamp-2 text-[11px] font-semibold text-text">
                                                                        {setTitle}
                                                                    </p>
                                                                    {creator ? (
                                                                        <p className="mt-0.5 truncate text-[10px] text-muted" title={`@${creator}`}>
                                                                            @{creator}
                                                                        </p>
                                                                    ) : null}
                                                                </div>
                                                            </button>
                                                            <div className="flex justify-center gap-1 px-2 pb-2">
                                                                <button
                                                                    type="button"
                                                                    className={buttonClass}
                                                                    disabled={busy !== null || watching}
                                                                    title="Watch for updates"
                                                                    onClick={() => void addWatch(set)}
                                                                >
                                                                    <Eye className="h-3.5 w-3.5" />
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
                            {setsPageCount > 1 ? (
                                <div className="flex items-center justify-center gap-2 pt-1">
                                    <button
                                        type="button"
                                        className={buttonClass}
                                        disabled={setsPage <= 1 || busy !== null}
                                        onClick={() => setSetsPage((page) => Math.max(1, page - 1))}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                    <span className="text-xs text-muted">
                                        Page {Math.min(setsPage, setsPageCount)} / {setsPageCount}
                                    </span>
                                    <button
                                        type="button"
                                        className={buttonClass}
                                        disabled={setsPage >= setsPageCount || busy !== null}
                                        onClick={() => setSetsPage((page) => Math.min(setsPageCount, page + 1))}
                                    >
                                        <ChevronLeft className="h-4 w-4 rotate-180" />
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    {selectedSet ? (
                        <div className="sticky top-0 z-10 -mt-1 mb-4 border-b border-white/10 bg-card/95 pb-3 backdrop-blur-sm">
                            <button
                                type="button"
                                className={`${buttonClass} w-full justify-between`}
                                disabled={busy === 'preview'}
                                onClick={backToSets}
                            >
                                <span className="inline-flex items-center gap-1.5">
                                    <ChevronLeft className="h-4 w-4" />
                                    Back to all sets
                                </span>
                                <span className="text-muted">{searchSets.length}</span>
                            </button>
                        </div>
                    ) : null}

                    {selectedSet ? (
                        <div className="mt-0">
                            <SetInspector
                                set={selectedSet}
                                headerLabel={String(preview?.setMeta?.title || selectedSet.title || selectedSet.url || '')}
                                loading={busy === 'preview'}
                                ready={readyToApply}
                                matchedCount={matchedAssetCount}
                                unmatchedCount={preview?.unmatched ?? 0}
                                totalCount={preview?.total || 0}
                                selectedCount={selectedAssetIds.length}
                                titleCardsOnly={titleCardsOnly}
                                showAssets={showAssets}
                                busy={busy}
                                closeLabel="Back to sets"
                                onToggleShowAssets={() => setShowAssets((value) => !value)}
                                onQueueMatched={() => void applyMatched()}
                                onQueueSelected={() => void applyMatched()}
                                onQueueEntire={() => void applyMatched()}
                                onQueueUnmatched={() => {}}
                                onQueueNewSinceWatch={() => {}}
                                onSelectMatched={() => {
                                    const ids = (preview.assets || []).filter((a) => a.matched === true).map((a) => a.id);
                                    setSelectedAssetIds(ids);
                                }}
                                onSelectAll={() => setSelectedAssetIds((preview.assets || []).map((a) => a.id))}
                                onClearSelection={() => setSelectedAssetIds([])}
                                onClose={backToSets}
                                thumbStrip={(
                                    <SetInspectorThumbStrip
                                        thumbs={matchedThumbStrip}
                                        layout={selectedSetUsesLandscape ? 'landscape' : 'poster'}
                                    />
                                )}
                                gallery={showAssets && preview ? (
                                    <PreviewAssetStrip
                                        title="All assets"
                                        count={(preview.assets || []).length}
                                    >
                                        {(preview.assets || []).map((asset) => (
                                            <PreviewAssetTile
                                                key={asset.id}
                                                asset={asset}
                                                selected={selectedAssetIds.includes(asset.id)}
                                                layout={selectedSetUsesLandscape ? 'landscape' : 'poster'}
                                                onToggle={(id) => setSelectedAssetIds((current) => (
                                                    current.includes(id)
                                                        ? current.filter((entry) => entry !== id)
                                                        : [...current, id]
                                                ))}
                                            />
                                        ))}
                                    </PreviewAssetStrip>
                                ) : undefined}
                            />
                            {!isSetWatched(selectedSet) ? (
                                <button
                                    type="button"
                                    className={`${buttonClass} mt-3 w-full`}
                                    disabled={busy !== null}
                                    onClick={() => void addWatch(selectedSet)}
                                >
                                    <Eye className="h-4 w-4" />
                                    Watch for updates
                                </button>
                            ) : (
                                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-plex">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Watching this set for new art
                                </p>
                            )}
                        </div>
                    ) : null}
                </div>
            </div>
            </>
        </ModalPortal>
    );
}
