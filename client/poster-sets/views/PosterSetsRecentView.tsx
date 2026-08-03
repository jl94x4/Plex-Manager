import React from 'react';
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

export const PosterSetsRecentView: React.FC = () => {
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
        watchesPageCount,
        pagedWatchGroups,
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
    if (tab !== 'recent') return null;
    return (



        <section className={`${cardClass} space-y-5 p-5`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
                                                            <div className={`relative overflow-hidden bg-black text-center ${landscape ? 'aspect-[16/9]' : 'aspect-[2/3]'}`}>
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
                                                            </div>
                                                            <div className="min-w-0 space-y-0.5 px-1.5 py-1.5 text-center sm:px-2">
                                                                <p className="line-clamp-2 text-[10px] font-medium leading-snug text-text/90 sm:text-[11px]" title={label}>{label}</p>
                                                            </div>
                                                        </button>
                                                        <div className="flex flex-wrap items-center gap-1 px-1.5 pb-1 sm:px-2">
                                                            <ProviderPill provider={item.provider} compact />
                                                            <span className="truncate text-[9px] text-muted sm:text-[10px]">
                                                                {item.setId ? `#${item.setId}` : 'Set'}
                                                                {item.assetCount ? ` · ${item.assetCount} assets` : ''}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 border-t border-white/10 p-1.5">
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
                                                                    goToDiscoverView('search');
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
    
    
    
    );
};
