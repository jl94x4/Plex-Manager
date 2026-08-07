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
import { MEDIUX_FILTER_OPTIONS, type PosterSetsConfig } from '../types';
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
    LIBRARY_DETAIL_LAYOUT_OPTIONS,
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

export const PosterSetsSettingsView: React.FC = () => {
    const {
        toasts,
        setToasts,
        toast,
        tab,
        setTab,
        libraryDetailItem,
        setLibraryDetailItem,
        libraryDetailLayout,
        setLibraryDetailLayout,
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
    if (tab !== 'settings') return null;
    return (



        <section className={`${cardClass} space-y-5 p-5`}>
                    <div>
                        <h2 className={sectionTitleClass}>Poster Sets config</h2>
                        <p className={sectionBodyClass}>
                            Same layout as the original helper config.json — used only by this feature.
                            You can pull URL, token, and libraries from Settings â†’ Media Player.
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
                            <span className="text-xs font-bold uppercase tracking-wide text-muted">TPDB username</span>
                            <input
                                className={`${fieldClass} mt-2`}
                                autoComplete="username"
                                placeholder="ThePosterDB login (optional)"
                                value={configDraft.tpdb_username || ''}
                                onChange={(event) => setConfigDraft((prev) => ({ ...prev, tpdb_username: event.target.value }))}
                            />
                        </label>
                        <label className="block">
                            <span className="text-xs font-bold uppercase tracking-wide text-muted">TPDB password</span>
                            <input
                                className={`${fieldClass} mt-2`}
                                type="password"
                                autoComplete="current-password"
                                placeholder={configDraft.hasTpdbPassword ? '•••••••• (unchanged)' : 'Optional — unlocks TMDB title search'}
                                value={configDraft.tpdb_password === '********' ? '' : (configDraft.tpdb_password || '')}
                                onChange={(event) => setConfigDraft((prev) => ({ ...prev, tpdb_password: event.target.value }))}
                            />
                            <span className="mt-1 block text-[11px] text-muted">
                                Optional. Logged-in advanced search finds canonical title pages (e.g. Ted Lasso on /posters/243647).
                            </span>
                        </label>
                        <div className="sm:col-span-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3 space-y-0">
                            <p className="pt-3 text-sm font-semibold text-text">ThePosterDB local cache</p>
                            <p className="pb-2 text-xs text-muted">
                                Only scrapes and stores sets for titles in your Plex library (TMDB-matched opens). Speeds repeat opens and lets apply keep working when TPDB is down — after sets have been hydrated once.
                            </p>
                            <SettingsToggleRow
                                title="Cache library TPDB titles on disk"
                                description="Remember ThePosterDB set lists for library titles and serve them instantly next time (background refresh when online)."
                                checked={configDraft.tpdbLocalCacheEnabled !== false}
                                onChange={(next) => setConfigDraft((prev) => ({ ...prev, tpdbLocalCacheEnabled: next }))}
                            />
                            <SettingsToggleRow
                                title="Aggressive prefetch (library titles only)"
                                description="After a library title's TPDB sets load, download every set's assets and images in the background. Respects ThePosterDB's 7s rate limit (one request at a time, backs off on HTTP 429). Uses disk; default budget 2 GB."
                                checked={configDraft.tpdbAggressivePrefetch !== false}
                                onChange={(next) => setConfigDraft((prev) => ({ ...prev, tpdbAggressivePrefetch: next }))}
                                border={false}
                            />
                            <div className="flex flex-wrap gap-2 py-3">
                                <button
                                    type="button"
                                    className={buttonClass}
                                    disabled={busy !== null}
                                    onClick={async () => {
                                        setBusy('tpdb-cache');
                                        try {
                                            const recent = await posterSetsApi.libraryRecent(200);
                                            const items = [
                                                ...(recent.movies || []),
                                                ...(recent.shows || []),
                                                ...(recent.items || []),
                                            ]
                                                .map((row) => ({
                                                    tmdbId: (row.tmdbId || row.tmdb_id || row.id) as string | number | undefined,
                                                    title: String(row.title || row.name || ''),
                                                    year: (row.year as number | null | undefined) ?? null,
                                                    mediaType: String(row.mediaType || row.type || 'movie'),
                                                }))
                                                .filter((row) => row.tmdbId && row.title);
                                            const result = await posterSetsApi.warmTpdbLibraryCache(items);
                                            toast(result.message || `Warming ${result.titles || 0} library title(s).`);
                                        } catch (error) {
                                            toast(error instanceof Error ? error.message : 'Warm failed', 'error');
                                        } finally {
                                            setBusy(null);
                                        }
                                    }}
                                >
                                    {busy === 'tpdb-cache' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                    Warm cache from library
                                </button>
                                <button
                                    type="button"
                                    className={buttonClass}
                                    disabled={busy !== null}
                                    onClick={async () => {
                                        const ok = await askConfirm('Clear cached ThePosterDB titles, set previews, and images?', {
                                            title: 'Clear TPDB cache?',
                                            confirmLabel: 'Clear cache',
                                            cancelLabel: 'Cancel',
                                        });
                                        if (!ok) return;
                                        setBusy('tpdb-cache');
                                        try {
                                            const result = await posterSetsApi.clearTpdbCache();
                                            toast(`Cleared ${result.cleared?.titles || 0} titles, ${result.cleared?.sets || 0} sets, ${result.cleared?.images || 0} images.`);
                                        } catch (error) {
                                            toast(error instanceof Error ? error.message : 'Clear failed', 'error');
                                        } finally {
                                            setBusy(null);
                                        }
                                    }}
                                >
                                    Clear TPDB cache
                                </button>
                            </div>
                        </div>
                        <label className="block">
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
                                Filename under config/poster-sets/ for "Apply from file".
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
                                One MediUX / ThePosterDB username per line (no @ needed). Browse adds a "Creators you follow" row with only their sets. Click any @username to open their full catalog.
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
                        <p className="text-sm font-semibold text-text">Library title panel</p>
                        <p className="mt-1 text-xs text-muted">
                            On desktop, open a library title in a right-side drawer or a larger centered modal.
                            Mobile always uses the slide-out drawer. You can also toggle layout from the panel header.
                        </p>
                        <div className="mt-3">
                            <CustomSelect
                                value={libraryDetailLayout}
                                onChange={(value) => setLibraryDetailLayout(value === 'modal' ? 'modal' : 'drawer')}
                                options={[...LIBRARY_DETAIL_LAYOUT_OPTIONS]}
                                className="w-full min-w-[180px] sm:w-auto"
                            />
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
                    <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                        <p className="text-sm font-semibold text-text">Apply destination</p>
                        <p className="mt-1 text-xs text-muted">
                            Where queued artwork is written after a successful apply. Jellyfin/Emby use Settings â†’ Media Player credentials.
                            Local mode writes poster.jpg, season posters, and episode thumbs beside Plex media paths.
                        </p>
                        <div className="mt-3">
                            <CustomSelect
                                value={configDraft.applyDestination || 'plex'}
                                onChange={(value) => setConfigDraft((prev) => ({
                                    ...prev,
                                    applyDestination: value as PosterSetsConfig['applyDestination'],
                                }))}
                                options={[
                                    { value: 'plex', label: 'Plex server upload' },
                                    { value: 'local', label: 'Local files only (beside media)' },
                                    { value: 'plex_local', label: 'Plex upload + local files' },
                                    { value: 'jellyfin', label: 'Jellyfin Images API' },
                                    { value: 'emby', label: 'Emby Images API' },
                                ]}
                                className="w-full min-w-[180px] sm:w-auto"
                            />
                        </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                        <p className="text-sm font-semibold text-text">Apply destination</p>
                        <p className="mt-1 text-xs text-muted">
                            Where queued artwork is written after a successful apply. Jellyfin/Emby use Settings â†’ Media Player credentials.
                            Local mode writes poster.jpg, season posters, and episode thumbs beside Plex media paths.
                        </p>
                        <div className="mt-3">
                            <CustomSelect
                                value={configDraft.applyDestination || 'plex'}
                                onChange={(value) => setConfigDraft((prev) => ({
                                    ...prev,
                                    applyDestination: value as PosterSetsConfig['applyDestination'],
                                }))}
                                options={[
                                    { value: 'plex', label: 'Plex server upload' },
                                    { value: 'local', label: 'Local files only (beside media)' },
                                    { value: 'plex_local', label: 'Plex upload + local files' },
                                    { value: 'jellyfin', label: 'Jellyfin Images API' },
                                    { value: 'emby', label: 'Emby Images API' },
                                ]}
                                className="w-full min-w-[180px] sm:w-auto"
                            />
                        </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 px-4">
                        <SettingsToggleRow
                            title="Clear Kometa Overlay label after upload"
                            description="Default on. Removes Kometa's Overlay label so the next Kometa run reapplies overlays on the new artwork."
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
                            description="After you apply a set (or it fails because the title is not in your library yet), pin it on Watching so posters auto-apply when the title lands."
                            checked={configDraft.autoWatchOnApply !== false}
                            onChange={(next) => setConfigDraft((prev) => ({ ...prev, autoWatchOnApply: next }))}
                        />
                        <SettingsToggleRow
                            title="Gotify digest when watchers queue new art"
                            description="Send a Gotify digest when set watchers enqueue new posters. Requires Gotify enabled under Settings â†’ Notifications."
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
    
    
    
    );
};
