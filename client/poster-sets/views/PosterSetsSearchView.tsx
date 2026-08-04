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
    ProviderCornerBadge,
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

export const PosterSetsSearchView: React.FC = () => {
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
    if (tab !== 'apply') return null;
    return (



        <div className="min-w-0 space-y-4">
                    <section className={`${cardClass} min-w-0 space-y-4 overflow-hidden p-5`}>
                        <div>
                            <label className="text-xs font-bold uppercase tracking-wide text-muted">Find poster sets</label>
                            <p className="mt-1 text-sm text-muted">
                                Search â†’ expand inline â†’ queue matched
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
                                            setPreview(null);
                                            setShowInspectorAssets(false);
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
                                            setPreview(null);
                                            setShowInspectorAssets(false);
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
        
                            <div ref={searchSetsSectionRef}>
                                {searchResultsLoading && !searchHasResults ? (
                                    <div className="mt-4 flex flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-10 text-sm text-muted">
                                        <Loader2 className="h-5 w-5 animate-spin text-plex" />
                                        Searching MediUX and ThePosterDB…
                                    </div>
                                ) : null}
        
                                {showSearchEmpty ? (
                                    <div className="mt-4 rounded-xl border border-dashed border-amber-400/25 bg-amber-500/5 px-4 py-8 text-center">
                                        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-black/25 text-muted">
                                            <ImageIcon className="h-5 w-5 opacity-60" />
                                        </div>
                                        <p className="text-sm font-semibold text-text">
                                            No poster sets found
                                            {searchEmptyLabel ? ` for "${searchEmptyLabel}"` : ''}
                                        </p>
                                        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted">
                                            This title matched on your library, but MediUX and ThePosterDB returned no sets.
                                            Try editing the search above, pick a different title match, or browse the sites directly.
                                        </p>
                                    </div>
                                ) : null}
                            </div>
        
                            {searchTitles.length ? (
                                <div className="mt-4 space-y-2">
                                    <p className="text-xs font-bold uppercase tracking-wide text-muted">Choose a title</p>
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
        
                            {searchSets.length ? (
                                <div className="mt-4 space-y-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-xs font-bold uppercase tracking-wide text-muted">
                                            Poster sets{searchContext ? ` · ${searchContext}` : ''}
                                            {searchSets.length > SEARCH_SETS_PAGE_SIZE
                                                ? ` · ${searchSets.length} sets`
                                                : ''}
                                            {searchLoadingMore ? ' · loading more…' : ''}
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
                                            const expanded = Boolean(selectedSearchSet && relatedSetKey(selectedSearchSet) === relatedSetKey(set));
                                            return (
                                            <div
                                                key={`${set.provider || findProvider}-${set.setId}`}
                                                className={`relative overflow-hidden ${posterMediaRadiusClass} border text-left transition ${
                                                    expanded
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
                                                <button
                                                    type="button"
                                                    className="block w-full text-left"
                                                    disabled={busy !== null && busy !== 'preview'}
                                                    onClick={() => void pickSearchSet(set)}
                                                >
                                                <div className={`relative overflow-hidden bg-black text-center ${landscape ? 'aspect-[16/9]' : 'aspect-[2/3]'}`}>
                                                    {set.thumbUrl ? (
                                                        <img
                                                            src={posterSetsApi.imageUrl(set.thumbUrl)}
                                                            alt={setLabel}
                                                            className="absolute inset-0 h-full w-full object-contain object-center"
                                                            loading="lazy"
                                                        />
                                                    ) : (
                                                        <div className="absolute inset-0 flex items-center justify-center text-muted">
                                                            <ImageIcon className="h-8 w-8 opacity-40" />
                                                        </div>
                                                    )}
                                                    {busy === 'preview' && expanded ? (
                                                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                                                            <Loader2 className="h-6 w-6 animate-spin text-plex" />
                                                        </div>
                                                    ) : null}
                                                    <ProviderCornerBadge provider={set.provider} />
                                                </div>
                                                <div className="px-3 pt-3">
                                                    <p className="truncate text-sm font-semibold text-text" title={setTitle}>{setTitle}</p>
                                                </div>
                                                </button>
                                                <div className="flex flex-wrap items-center gap-1.5 px-3 pb-3 pt-1.5">
                                                    {watching ? (
                                                        <MetaPill className="border-plex/35 bg-plex/15 text-plex" truncate={false}>
                                                            Watching
                                                        </MetaPill>
                                                    ) : null}
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
        
                            {inspectorOpen ? (
                                <div className="mt-4">
                                    <SetInspector
                                        panelRef={previewPanelRef}
                                        set={selectedSearchSet}
                                        headerLabel={previewHeaderLabel}
                                        loading={busy === 'preview'}
                                        ready={readyToApply}
                                        matchedCount={matchedAssetCount}
                                        unmatchedCount={preview?.unmatched ?? 0}
                                        totalCount={preview?.total || 0}
                                        selectedCount={selectedAssetIds.length}
                                        titleCardsOnly={titleCardsOnly}
                                        showAssets={showInspectorAssets}
                                        busy={busy}
                                        onToggleShowAssets={() => setShowInspectorAssets((value) => !value)}
                                        onQueueMatched={() => void applyMatched()}
                                        onQueueSelected={() => void runApply(true)}
                                        onQueueEntire={() => void queueEntireWithConfirm()}
                                        onQueueUnmatched={() => void applyUnmatched()}
                                        onQueueNewSinceWatch={() => void applyNewSinceWatch()}
                                        onSelectMatched={() => selectPreviewAssets('matched')}
                                        onSelectAll={() => selectPreviewAssets('all')}
                                        onClearSelection={() => selectPreviewAssets('none')}
                                        onClose={() => collapseSetInspector({ scrollToSets: false })}
                                        thumbStrip={<SetInspectorThumbStrip thumbs={matchedThumbStrip} />}
                                        gallery={(
                                            <PreviewAssetGallery
                                                sections={previewSections}
                                                selectedAssetIds={selectedAssetIds}
                                                onToggle={toggleAsset}
                                            />
                                        )}
                                        relatedRail={(
                                            <RelatedSetsRail
                                                sets={relatedSets}
                                                loading={relatedSetsLoading}
                                                mediaLabel={inferPreviewMediaType(preview) === 'show' ? 'show' : 'movie'}
                                                disabled={busy !== null}
                                                onOpen={(item) => void expandSetInline(item, { stayOnTab: true, toggle: false })}
                                                onOpenCreator={openCreatorCatalog}
                                            />
                                        )}
                                    />
                                </div>
                            ) : null}
        
                            <div className="mt-5 border-t border-white/10 pt-4">
                                <button
                                    type="button"
                                    className="flex w-full items-center justify-between gap-3 text-left"
                                    onClick={() => setAdvancedOpen((value) => !value)}
                                >
                                    <div>
                                        <h2 className="text-sm font-bold text-text">Advanced</h2>
                                        <p className="mt-1 text-xs text-muted">Manual URL / set ID and bulk import.</p>
                                    </div>
                                    {advancedOpen ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
                                </button>
                                {advancedOpen ? (
                                    <div className="mt-4 space-y-5">
                                        <div className="space-y-3">
                                            <p className="text-xs font-bold uppercase tracking-wide text-muted">Manual URL / set ID</p>
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
                                                    placeholder={findProvider === 'mediux' ? 'Set ID e.g. 24522' : 'Set/poster ID e.g. 362735 or username'}
                                                />
                                                <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => void useFindId(true)}>
                                                    Load set
                                                </button>
                                            </div>
                                            <input
                                                className={fieldClass}
                                                placeholder="https://mediux.pro/sets/… or https://theposterdb.com/set/… or /poster/…"
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
                                                        if (!target) {
                                                            toast('Paste a set URL first.', 'error');
                                                            return;
                                                        }
                                                        setSelectedSearchSet({
                                                            setId: '',
                                                            title: target,
                                                            url: target,
                                                        });
                                                        setShowInspectorAssets(false);
                                                        pushPosterLocation({
                                                            tab: 'apply',
                                                            rail: null,
                                                            setUrl: target,
                                                            creator: null,
                                                            titleCardsOnly: false,
                                                        }, 'push');
                                                        void runPreview(target, { titleCardsOnly: false, keepSearch: true });
                                                    }}
                                                >
                                                    {busy === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                                                    Load URL
                                                </button>
                                            </div>
                                        </div>
        
                                        <div className="space-y-3 border-t border-white/10 pt-4">
                                            <div>
                                                <h3 className="text-sm font-bold text-text">Bulk import</h3>
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
                </div>
    
    
    
    );
};
