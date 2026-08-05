import React, { useState } from 'react';
import {
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Clock,
    Download,
    ExternalLink,
    Eye,
    History,
    Image as ImageIcon,
    Loader2,
    Pause,
    Play,
    RefreshCw,
    RotateCcw,
    Save,
    Search,
    Sparkles,
    Trash2,
    User,
    X,
} from 'lucide-react';
import { CustomSelect, SettingsToggleRow } from '../../shared/ui';
import { askConfirm } from '../../shared/confirm';
import { normalizeUpgraderGridSize } from '../../shared/portalLayout';
import { posterSetsApi } from '../api';
import { MEDIUX_FILTER_OPTIONS } from '../types';
import { PosterSetsSetupChecklist } from '../PosterSetsSetupChecklist';
import { PosterSetsLibraryBrowse } from '../PosterSetsLibraryBrowse';
import { PosterSetsCreatorsPanel } from '../PosterSetsCreatorsPanel';
import { SetInspector, SetInspectorThumbStrip } from '../SetInspector';
import { inferPreviewMediaType, relatedSetKey } from '../posterSetsDashboardUtils';
import {
    ALL_MEDIUX_FILTER_IDS,
    BrowseSetCard,
    CreatorPill,
    LibraryMediaCard,
    MetaPill,
    POSTER_SETS_GRID_OPTIONS,
    PosterImageLightbox,
    PosterThumb,
    PreviewAssetGallery,
    ProviderPill,
    RECENT_CATEGORY_ORDER,
    RelatedSetsRail,
    SEARCH_SETS_PAGE_SIZE,
    SetKindPill,
    StatusPill,
    WATCHES_PAGE_SIZE_OPTIONS,
    bulkEntryFromSet,
    buttonClass,
    cardClass,
    fieldClass,
    formatSetLabel,
    formatTime,
    isTitleCardRail,
    isTitleCardSet,
    jobCardTone,
    jobSetMeta,
    jobTitle,
    posterMediaRadiusClass,
    primaryButtonClass,
    providerLabel,
    sectionBodyClass,
    sectionTitleClass,
    textToList,
    upsertRecentSet,
} from '../shared';
import { usePosterSetsDashboard } from '../PosterSetsDashboardContext';

type WatchImagePreview = {
    src: string;
    title: string;
    setUrl: string;
    provider: string;
};

export const PosterSetsWatchingView: React.FC = () => {
    const {
        toasts,
        setToasts,
        toast,
        tab,
        setTab,
        libraryDetailItem,
        setLibraryDetailItem,
        libraryViewMode,
        setLibraryViewMode,
        busy,
        setBusy,
        status,
        setStatus,
        configDraft,
        setConfigDraft,
        tvText,
        setTvText,
        movieText,
        setMovieText,
        whitelistText,
        setWhitelistText,
        url,
        setUrl,
        titleCardsOnly,
        setTitleCardsOnly,
        bulkText,
        setBulkText,
        findProvider,
        setFindProvider,
        findId,
        setFindId,
        searchProvider,
        setSearchProvider,
        searchMode,
        setSearchMode,
        searchQuery,
        setSearchQuery,
        searchTitles,
        setSearchTitles,
        searchSets,
        setSearchSets,
        searchSetsPage,
        setSearchSetsPage,
        searchLoadingMore,
        setSearchLoadingMore,
        searchContext,
        setSearchContext,
        creatorSearchAbortRef,
        selectedSearchTitle,
        setSelectedSearchTitle,
        selectedSearchSet,
        setSelectedSearchSet,
        advancedOpen,
        setAdvancedOpen,
        showInspectorAssets,
        setShowInspectorAssets,
        previewPanelRef,
        searchSetsSectionRef,
        recentTick,
        setRecentTick,
        gridSize,
        setGridSize,
        preview,
        setPreview,
        relatedSets,
        setRelatedSets,
        relatedSetsLoading,
        setRelatedSetsLoading,
        relatedSetsAbortRef,
        relatedSetsGenRef,
        browseLoadGenRef,
        queueLoadGenRef,
        watchesLoadGenRef,
        selectedAssetIds,
        setSelectedAssetIds,
        activeJob,
        setActiveJob,
        testResult,
        setTestResult,
        historyJobs,
        setHistoryJobs,
        historyFilter,
        setHistoryFilter,
        historySearch,
        setHistorySearch,
        selectedHistoryJob,
        setSelectedHistoryJob,
        selectedQueueJob,
        setSelectedQueueJob,
        auditEntries,
        setAuditEntries,
        queueJobs,
        setQueueJobs,
        queuePaused,
        setQueuePaused,
        queueStats,
        setQueueStats,
        watches,
        setWatches,
        watchStatsState,
        setWatchStatsState,
        watchUrlDraft,
        setWatchUrlDraft,
        watchesPage,
        setWatchesPage,
        watchesPageSize,
        setWatchesPageSize,
        watchesFilter,
        setWatchesFilter,
        selectedBulkSets,
        setSelectedBulkSets,
        browseRails,
        setBrowseRails,
        browseRailsRef,
        browseLoading,
        setBrowseLoading,
        browseSeeAllId,
        setBrowseSeeAllId,
        libraryShows,
        setLibraryShows,
        libraryMovies,
        setLibraryMovies,
        libraryLoading,
        setLibraryLoading,
        libraryError,
        setLibraryError,
        librarySearchQuery,
        setLibrarySearchQuery,
        librarySearchResults,
        setLibrarySearchResults,
        librarySearching,
        setLibrarySearching,
        librarySearchDebounceRef,
        libraryLoadGenRef,
        scrollPreviewAfterLoadRef,
        syncedSetUrlRef,
        titleCardsOnlyRef,
        deepLinkHandledRef,
        openCreatorCatalogRef,
        loadHistory,
        loadAudit,
        loadQueue,
        loadWatches,
        loadLibraryRecent,
        runLibrarySearch,
        loadBrowse,
        collapseSetInspector,
        dismissPreviewToSearch,
        pushPosterLocation,
        goToTab,
        goToPrimaryTab,
        goToDiscoverView,
        openBrowseRail,
        currentSetMeta,
        rememberRecentFromContext,
        load,
        openHistoryJob,
        openQueueJob,
        saveCreatorsConfig,
        saveSettings,
        importFromPortal,
        runTest,
        runPreview,
        expandSetInline,
        openSetForApply,
        openSetForApplyRef,
        filtersForSelectedIds,
        runApply,
        applyMatched,
        applyUnmatched,
        applyNewSinceWatch,
        toggleBulkSet,
        clearBulkSelection,
        selectBrowseSets,
        queueBulkSelected,
        watchBulkSelected,
        useFindId,
        posterGridClass,
        posterGridStyle,
        titleCardGridStyle,
        searchSetsUseTitleCardGrid,
        runCatalogSearch,
        openCreatorCatalog,
        openLibraryItem,
        openSearchTitle,
        runLibraryItemSearch,
        pickSearchSet,
        backToTitles,
        clearSearch,
        matchedAssetCount,
        previewSections,
        searchSetsPageCount,
        pagedSearchSets,
        searchResultsLoading,
        searchHasResults,
        searchEmptyLabel,
        showSearchEmpty,
        watchedUrlSet,
        isSetWatched,
        filteredWatches,
        watchGroups,
        watchGroupsByCategory,
        watchesCategoryFilter,
        setWatchesCategoryFilter,
        categoryFilteredWatchGroups,
        watchesPageCount,
        pagedWatchGroups,
        pagedWatchGroupsByCategory,
        promoteWatchArtKind,
        readyToApply,
        inspectorOpen,
        matchedThumbStrip,
        queueEntireWithConfirm,
        browseSeeAllRail,
        toggleAsset,
        selectPreviewAssets,
        runBulk,
        toggleFilter,
        jobLogs,
        selectedLogs,
        selectedQueueLogs,
        recentSets,
        recentSetsByCategory,
        selectedBulkCount,
        previewHeaderLabel,
        filteredHistory,
        filteredAudit,
        initialUrlState,
        initialLocation,
    } = usePosterSetsDashboard();
    const [imagePreview, setImagePreview] = useState<WatchImagePreview | null>(null);
    if (tab !== 'watches') return null;
    return (



        <section className={`${cardClass} min-w-0 space-y-5 overflow-hidden p-4 sm:p-5`}>
                    <PosterImageLightbox
                        open={Boolean(imagePreview)}
                        src={imagePreview?.src || ''}
                        title={imagePreview?.title}
                        setUrl={imagePreview?.setUrl}
                        provider={imagePreview?.provider}
                        onClose={() => setImagePreview(null)}
                    />
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 max-w-3xl">
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-plex">Pinned artwork</p>
                            <h2 className="mt-1 text-xl font-bold tracking-tight text-text sm:text-2xl">Watching</h2>
                            <p className={sectionBodyClass}>
                                Keep MediUX and ThePosterDB sets in view, grouped by posters and title cards. New art queues automatically.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
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
                        <div className="flex shrink-0 flex-wrap gap-2">
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
                                        void loadAudit();
                                        if (result.started || result.running) {
                                            toast(result.message
                                                || 'Check all started in the background — open Logs for progress.');
                                            goToPrimaryTab('logs');
                                            return;
                                        }
                                        const checked = result.checked || 0;
                                        const queued = result.queued || 0;
                                        const assets = result.assetsQueued || 0;
                                        const errors = Array.isArray(result.errors) ? result.errors.length : 0;
                                        toast(
                                            queued
                                                ? `Checked ${checked}; queued ${queued} watch(es) / ${assets} asset(s). See Logs.`
                                                : errors
                                                    ? `Checked ${checked}; ${errors} error(s). See Logs → Audit.`
                                                    : `Checked ${checked}; nothing to apply. See Logs → Audit for the run.`,
                                            errors && !queued ? 'error' : undefined,
                                        );
                                    } catch (error) {
                                        const message = error instanceof Error ? error.message : 'Watcher run failed';
                                        toast(/409|already running/i.test(message)
                                            ? 'A check is already running — open Logs shortly.'
                                            : message, 'error');
                                        void loadAudit();
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
                        <div className="space-y-3">
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
                                    {watchesCategoryFilter !== 'all' ? (
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
                                    ) : null}
                                    <span className="text-xs text-muted">
                                        {watchGroups.length} title{watchGroups.length === 1 ? '' : 's'}
                                        {filteredWatches.length !== watches.length
                                            ? ` · ${filteredWatches.length} sets`
                                            : ''}
                                        {watchesFilter.trim() ? ` (of ${watches.length})` : ''}
                                    </span>
                                </div>
                            </div>
                            <div className="flex min-w-0 flex-wrap gap-1 sm:gap-1.5">
                                <button
                                    type="button"
                                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition sm:px-3 sm:text-xs ${
                                        watchesCategoryFilter === 'all'
                                            ? 'border-plex/40 bg-plex/15 text-plex'
                                            : 'border-white/10 bg-black/20 text-muted hover:border-plex/30 hover:text-text'
                                    }`}
                                    onClick={() => {
                                        setWatchesCategoryFilter('all');
                                        setWatchesPage(1);
                                    }}
                                >
                                    All
                                    <span className="ml-1 opacity-70">{watchGroups.length}</span>
                                </button>
                                {RECENT_CATEGORY_ORDER.map((category) => {
                                    const count = watchGroupsByCategory[category.id].length;
                                    if (!count) return null;
                                    return (
                                        <button
                                            key={category.id}
                                            type="button"
                                            className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition sm:px-3 sm:text-xs ${
                                                watchesCategoryFilter === category.id
                                                    ? 'border-plex/40 bg-plex/15 text-plex'
                                                    : 'border-white/10 bg-black/20 text-muted hover:border-plex/30 hover:text-text'
                                            }`}
                                            onClick={() => {
                                                setWatchesCategoryFilter(category.id);
                                                setWatchesPage(1);
                                            }}
                                        >
                                            {category.title}
                                            <span className="ml-1 opacity-70">{count}</span>
                                        </button>
                                    );
                                })}
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
                            No sets match "{watchesFilter.trim()}".
                        </div>
                    ) : watchesCategoryFilter !== 'all' && !categoryFilteredWatchGroups.length ? (
                        <div className="rounded-xl border border-dashed border-white/15 bg-black/20 px-5 py-10 text-center text-sm text-muted">
                            No {RECENT_CATEGORY_ORDER.find((category) => category.id === watchesCategoryFilter)?.title.toLowerCase() || 'items'} match your filters.
                        </div>
                    ) : (
                        <div className="min-w-0 space-y-6">
                            {(watchesCategoryFilter === 'all'
                                ? RECENT_CATEGORY_ORDER
                                : RECENT_CATEGORY_ORDER.filter((category) => category.id === watchesCategoryFilter)
                            ).map((category) => {
                                const items = pagedWatchGroupsByCategory[category.id];
                                if (!items.length) return null;
                                const landscape = category.landscape;
                                return (
                                    <div key={category.id} className="space-y-3">
                                        {watchesCategoryFilter === 'all' ? (
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="text-sm font-bold text-text sm:text-base">{category.title}</h3>
                                                <span className="text-[11px] text-muted">
                                                    {watchGroupsByCategory[category.id].length}
                                                </span>
                                            </div>
                                        ) : null}
                                        <div
                                            className={posterGridClass}
                                            style={landscape ? titleCardGridStyle : posterGridStyle}
                                        >
                                            {items.map((group) => {
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
                                            <button
                                                type="button"
                                                className={`relative block w-full overflow-hidden bg-black text-center ${landscape ? 'aspect-[16/9]' : 'aspect-[2/3]'} ${anyPaused ? 'opacity-55' : ''} ${thumbSrc ? 'cursor-zoom-in' : 'cursor-default'}`}
                                                disabled={!thumbSrc}
                                                aria-label={`Preview ${group.title}`}
                                                title={thumbSrc ? 'Click to expand preview' : undefined}
                                                onClick={() => {
                                                    if (!thumbSrc) return;
                                                    const primary = group.watches.find((watch) => String(watch.url || '').trim())
                                                        || group.watches[0];
                                                    setImagePreview({
                                                        src: thumbSrc,
                                                        title: group.title,
                                                        setUrl: String(primary?.url || '').trim(),
                                                        provider: String(primary?.provider || ''),
                                                    });
                                                }}
                                            >
                                                <PosterThumb
                                                    src={thumbSrc}
                                                    alt={group.title}
                                                    className="absolute inset-0 h-full w-full pointer-events-none"
                                                    imgClassName="absolute inset-0 h-full w-full object-contain object-center transition duration-300 group-hover:scale-[1.02]"
                                                    onLoad={(event) => {
                                                        if (landscape || category.id !== 'posters') return;
                                                        const img = event.currentTarget;
                                                        if (!img.naturalWidth || !img.naturalHeight) return;
                                                        const ratio = img.naturalWidth / img.naturalHeight;
                                                        if (ratio < 1.2) return;
                                                        const kind = ratio < 1.6 ? 'backgrounds' : 'title_cards';
                                                        for (const watch of group.watches) {
                                                            promoteWatchArtKind(watch.id, kind);
                                                        }
                                                    }}
                                                />
                                            </button>
        
                                            <div className="flex min-w-0 flex-1 flex-col gap-2 p-2 text-left sm:p-2.5">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    {group.errored ? (
                                                        <MetaPill className="border-red-400/35 bg-red-500/15 text-red-200" truncate={false}>
                                                            Error
                                                        </MetaPill>
                                                    ) : anyPaused ? (
                                                        <MetaPill className="border-white/15 bg-white/5 text-muted" truncate={false}>
                                                            Paused
                                                        </MetaPill>
                                                    ) : (
                                                        <MetaPill className="border-plex/35 bg-plex/15 text-plex" truncate={false}>
                                                            Watching
                                                        </MetaPill>
                                                    )}
                                                    {multi ? (
                                                        <MetaPill className="border-white/15 bg-white/5 text-muted" truncate={false}>
                                                            {group.watches.length} sets
                                                        </MetaPill>
                                                    ) : null}
                                                </div>
        
                                                <div className="min-w-0">
                                                    <p className="line-clamp-2 text-[11px] font-semibold leading-snug text-text sm:text-xs" title={group.title}>
                                                        {group.title}
                                                    </p>
                                                    <p className="mt-0.5 text-[10px] text-muted">
                                                        {multi ? `${group.watches.length} pinned sets` : '1 pinned set'}
                                                        {group.lastCheckedAt ? ` · ${formatTime(group.lastCheckedAt)}` : ''}
                                                    </p>
                                                </div>
        
                                                {group.watches.map((watch, watchIndex) => {
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
                                                            className={`flex w-full min-w-0 flex-col gap-2 ${
                                                                watchIndex > 0 ? 'border-t border-white/10 pt-2' : ''
                                                            } ${
                                                                watch.lastError
                                                                    ? 'rounded-lg border border-red-500/30 bg-red-500/10 p-2'
                                                                    : ''
                                                            }`}
                                                        >
                                                            {multi ? (
                                                                <div className="flex min-w-0 items-start gap-2">
                                                                    {watchThumbSrc ? (
                                                                        <button
                                                                            type="button"
                                                                            className={`shrink-0 overflow-hidden rounded border border-white/10 bg-black cursor-zoom-in ${
                                                                                landscape ? 'h-10 w-16' : 'h-14 w-10'
                                                                            }`}
                                                                            aria-label={`Preview ${group.title}`}
                                                                            title="Click to expand preview"
                                                                            onClick={() => {
                                                                                setImagePreview({
                                                                                    src: watchThumbSrc,
                                                                                    title: group.title,
                                                                                    setUrl: String(watch.url || '').trim(),
                                                                                    provider,
                                                                                });
                                                                            }}
                                                                        >
                                                                            <PosterThumb
                                                                                src={watchThumbSrc}
                                                                                className="h-full w-full pointer-events-none"
                                                                                imgClassName="h-full w-full object-contain"
                                                                            />
                                                                        </button>
                                                                    ) : null}
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="flex flex-wrap items-center gap-1">
                                                                            <ProviderPill provider={provider} compact />
                                                                            <CreatorPill user={creator} onOpen={openCreatorCatalog} compact />
                                                                            {watch.enabled === false ? (
                                                                                <MetaPill className="border-white/15 bg-white/5 text-muted" compact>
                                                                                    Paused
                                                                                </MetaPill>
                                                                            ) : null}
                                                                        </div>
                                                                        <p className="mt-1 text-[10px] leading-relaxed text-muted">
                                                                            {(watch.knownAssetIds || []).length} known
                                                                            {watch.lastCheckedAt ? ` · ${formatTime(watch.lastCheckedAt)}` : ' · not checked'}
                                                                            {watch.lastNewCount ? ` · +${watch.lastNewCount} last` : ''}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <div className="flex flex-wrap items-center gap-1">
                                                                        <ProviderPill provider={provider} compact />
                                                                        <CreatorPill user={creator} onOpen={openCreatorCatalog} compact />
                                                                    </div>
                                                                    <p className="text-[10px] leading-relaxed text-muted">
                                                                        {(watch.knownAssetIds || []).length} known
                                                                        {watch.lastCheckedAt ? ` · ${formatTime(watch.lastCheckedAt)}` : ' · not checked'}
                                                                        {watch.lastNewCount ? ` · +${watch.lastNewCount} last` : ''}
                                                                    </p>
                                                                </>
                                                            )}
                                                            {watch.lastError ? (
                                                                <p className="break-words text-[10px] text-red-300 [overflow-wrap:anywhere]">{watch.lastError}</p>
                                                            ) : null}
                                                            {provider === 'posterdb' ? (
                                                                <p className="text-[10px] text-muted">TPDB has no title cards</p>
                                                            ) : (
                                                                <div className="flex flex-wrap gap-0.5">
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
                                                            <div className="flex items-center gap-1.5">
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
                                                                {String(watch.url || '').trim() ? (
                                                                    <a
                                                                        href={String(watch.url || '').trim()}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        className={iconBtnClass}
                                                                        aria-label={`Open on ${providerLabel(provider)}`}
                                                                        title={`Open on ${providerLabel(provider)}`}
                                                                    >
                                                                        <ExternalLink className="h-3.5 w-3.5" />
                                                                    </a>
                                                                ) : null}
                                                                <button
                                                                    type="button"
                                                                    className={`${iconBtnClass} text-red-200 hover:border-red-400/40`}
                                                                    disabled={busy !== null}
                                                                    aria-label="Remove watch"
                                                                    title="Remove watch"
                                                                    onClick={async () => {
                                                                        const ok = await askConfirm(`Remove ${setLabel} watch for "${group.title}"?`, {
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
                                    </div>
                                );
                            })}
                            {watchesCategoryFilter !== 'all' && watchesPageCount > 1 ? (
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
    
    
    
    );
};
