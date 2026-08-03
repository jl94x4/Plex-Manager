import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    CheckCircle2,
    ChevronLeft,
    Eye,
    Image as ImageIcon,
    Loader2,
    X,
} from 'lucide-react';
import { posterSetsApi } from './api';
import { pickAutoMatchedTitle } from './autoMatchTitle';
import { previewAssetEpisodeLabel } from './previewGroups';
import { libraryItemPosterSrc, type LibraryRecentItem } from './libraryRecent';
import { SetInspector, SetInspectorThumbStrip } from './SetInspector';
import type {
    PosterSetsPreview,
    PosterSetsPreviewAsset,
    PosterSetsSearchSet,
    PosterSetsSearchTitle,
    PosterSetsSetMeta,
    PosterSetsWatch,
} from './types';
import { mediuxFiltersFromAssets } from './types';

const TITLE_CARD_ONLY_FILTERS = ['title_card'];
const SETS_PAGE_SIZE = 12;

const buttonClass = 'inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs font-semibold text-text transition hover:border-plex/40 hover:bg-white/5 disabled:pointer-events-none disabled:opacity-40 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm';
const primaryButtonClass = 'inline-flex items-center justify-center gap-1.5 rounded-xl bg-plex px-2.5 py-1.5 text-xs font-bold text-background transition hover:bg-plex-hover active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm';
const fieldClass = 'w-full rounded-lg border border-white/10 bg-background/70 px-3 py-2 text-xs text-text placeholder:text-muted/60 outline-none transition focus:border-plex focus:ring-1 focus:ring-plex sm:py-2.5 sm:text-sm';

const isTitleCardSet = (set?: { title?: string | null; setKind?: string | null } | null) => {
    const kind = String(set?.setKind || '').trim().toLowerCase();
    if (kind === 'title_cards' || kind === 'title-cards' || kind === 'titlecard') return true;
    return /(title\s*cards?|episode\s*cards?|cover\s*style)/i.test(String(set?.title || ''));
};

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
            </div>
            <div className="space-y-0.5 p-2">
                <p className="line-clamp-2 text-[10px] font-medium leading-snug text-text/90">{title}</p>
            </div>
        </button>
    );
}

export type LibraryTitleDetailPanelProps = {
    item: LibraryRecentItem | null;
    onClose: () => void;
    dupePreference: 'mediux' | 'posterdb';
    queuePaused: boolean;
    watches: PosterSetsWatch[];
    toast: (message: string, type?: 'success' | 'error') => void;
    onApplied?: () => void;
    onWatchAdded?: () => void;
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
}: LibraryTitleDetailPanelProps) {
    const [busy, setBusy] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
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
    }, []);

    const loadSetsForTitle = useCallback(async (title: PosterSetsSearchTitle) => {
        setBusy('search');
        setSearchSets([]);
        setSelectedTitle(title);
        setSelectedSet(null);
        setPreview(null);
        try {
            const sources = (title.sources?.length
                ? title.sources
                : [{
                    provider: title.provider || 'mediux',
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
            setSearchSets(response.sets || []);
            setSetsPage(1);
            setSearchContext(response.title || title.title);
            setSearchTitles([]);
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to load sets', 'error');
        } finally {
            setBusy(null);
        }
    }, [dupePreference, toast]);

    const runSearch = useCallback(async (libraryItem: LibraryRecentItem) => {
        const generation = ++loadGenRef.current;
        setLoading(true);
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
            let response: Awaited<ReturnType<typeof posterSetsApi.search>> | null = null;
            let titles: PosterSetsSearchTitle[] = [];
            let autoMatch: PosterSetsSearchTitle | null = null;

            for (const query of queries) {
                if (generation !== loadGenRef.current) return;
                response = await posterSetsApi.search({
                    provider: 'both',
                    query,
                    mode: 'title',
                    dupePreference,
                    limit: 24,
                });
                titles = response.titles || [];
                autoMatch = pickAutoMatchedTitle(libraryItem, titles);
                if (autoMatch) break;
            }

            if (generation !== loadGenRef.current) return;

            if (autoMatch) {
                await loadSetsForTitle(autoMatch);
                return;
            }

            setSearchTitles(titles);
            setSearchSets(response?.sets || []);
            setSearchContext(response?.title || libraryItem.title);
            if (response?.partialErrors?.length) toast(response.partialErrors[0], 'error');
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

    useEffect(() => {
        if (!item) return undefined;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [item, onClose]);

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
            );
            toast(queuePaused
                ? `Queued ${ids.length} poster${ids.length === 1 ? '' : 's'} (queue paused).`
                : `Queued ${ids.length} poster${ids.length === 1 ? '' : 's'}.`);
            onApplied?.();
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

    const setsPageCount = Math.max(1, Math.ceil(searchSets.length / SETS_PAGE_SIZE));
    const pagedSets = useMemo(() => {
        const page = Math.min(Math.max(1, setsPage), setsPageCount);
        const start = (page - 1) * SETS_PAGE_SIZE;
        return searchSets.slice(start, start + SETS_PAGE_SIZE);
    }, [searchSets, setsPage, setsPageCount]);

    const readyToApply = Boolean(preview && !busy);
    const headerLabel = item
        ? (item.year ? `${item.title} (${item.year})` : item.title)
        : '';

    if (!item) return null;

    return (
        <>
            <button
                type="button"
                aria-label="Close title detail"
                className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm"
                onClick={onClose}
            />
            <div
                ref={panelRef}
                className="fixed top-0 right-0 z-[101] flex h-full w-full max-w-[min(100%,520px)] flex-col border-l border-white/10 bg-card shadow-2xl"
            >
                <div className="flex shrink-0 items-start gap-3 border-b border-white/10 bg-black/20 p-4 sm:p-5">
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
                    <button type="button" className={buttonClass} onClick={onClose} aria-label="Close">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-muted">
                            <Loader2 className="h-6 w-6 animate-spin text-plex" />
                            Searching MediUX and ThePosterDB…
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
                                        onClick={() => void loadSetsForTitle(title)}
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

                    {!loading && !searchTitles.length && !searchSets.length && !preview ? (
                        <div className="rounded-xl border border-dashed border-white/10 px-4 py-12 text-center">
                            <ImageIcon className="mx-auto h-10 w-10 text-muted opacity-40" />
                            <p className="mt-3 text-sm font-semibold text-text">No poster sets found</p>
                            <p className="mt-1 text-xs text-muted">
                                Nothing matched “{item.title}” on MediUX or ThePosterDB. Try Discover to search manually.
                            </p>
                        </div>
                    ) : null}

                    {!loading && searchSets.length > 0 && !preview ? (
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <h3 className="text-sm font-bold text-text">
                                    Available sets
                                    {searchContext ? ` · ${searchContext}` : ''}
                                </h3>
                                <span className="text-[11px] text-muted">{searchSets.length} found</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                {pagedSets.map((set) => {
                                    const watching = isSetWatched(set);
                                    const landscape = isTitleCardSet(set);
                                    const setTitle = String(set.title || '').trim() || `Set #${set.setId}`;
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
                                                <div className={`relative bg-black ${landscape ? 'aspect-[16/9]' : 'aspect-[2/3]'}`}>
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
                                                    {watching ? (
                                                        <span className="absolute right-2 top-2 rounded-full border border-plex/40 bg-plex/20 px-2 py-0.5 text-[9px] font-bold uppercase text-plex">
                                                            Watching
                                                        </span>
                                                    ) : null}
                                                </div>
                                                <p className="line-clamp-2 px-2 py-2 text-center text-[11px] font-semibold text-text">
                                                    {setTitle}
                                                </p>
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

                    {preview && selectedSet ? (
                        <div className="mt-4">
                            <SetInspector
                                set={selectedSet}
                                headerLabel={String(preview.setMeta?.title || selectedSet.title || selectedSet.url || '')}
                                loading={busy === 'preview'}
                                ready={readyToApply}
                                matchedCount={matchedAssetCount}
                                unmatchedCount={preview.unmatched ?? 0}
                                totalCount={preview.total || 0}
                                selectedCount={selectedAssetIds.length}
                                titleCardsOnly={titleCardsOnly}
                                showAssets={showAssets}
                                busy={busy}
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
                                onClose={() => {
                                    setPreview(null);
                                    setSelectedSet(null);
                                }}
                                thumbStrip={<SetInspectorThumbStrip thumbs={matchedThumbStrip} />}
                                gallery={showAssets ? (
                                    <div className="flex w-full min-w-0 gap-3 overflow-x-auto pb-1">
                                        {(preview.assets || []).map((asset) => (
                                            <PreviewAssetTile
                                                key={asset.id}
                                                asset={asset}
                                                selected={selectedAssetIds.includes(asset.id)}
                                                layout={isTitleCardSet(selectedSet) ? 'landscape' : 'poster'}
                                                onToggle={(id) => setSelectedAssetIds((current) => (
                                                    current.includes(id)
                                                        ? current.filter((entry) => entry !== id)
                                                        : [...current, id]
                                                ))}
                                            />
                                        ))}
                                    </div>
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
    );
}
