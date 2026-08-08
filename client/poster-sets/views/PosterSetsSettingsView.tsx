import React, { useEffect, useState } from 'react';
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
import { formatTpdbEta } from '../shared/tpdbCacheUi';
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

const GB = 1024 * 1024 * 1024;
const TPDB_DISK_BUDGET_OPTIONS: Array<{ bytes: number; label: string }> = [
    { bytes: Math.round(0.5 * GB), label: '512 MB' },
    { bytes: 1 * GB, label: '1 GB' },
    { bytes: 2 * GB, label: '2 GB' },
    { bytes: 5 * GB, label: '5 GB' },
    { bytes: 10 * GB, label: '10 GB' },
    { bytes: 20 * GB, label: '20 GB' },
    { bytes: 50 * GB, label: '50 GB' },
    { bytes: 100 * GB, label: '100 GB' },
    { bytes: 128 * GB, label: '128 GB' },
    { bytes: 256 * GB, label: '256 GB' },
    { bytes: 512 * GB, label: '512 GB' },
];

const formatBytes = (bytes: number) => {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    if (value < GB) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    return `${(value / GB).toFixed(2)} GB`;
};

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

    const [tpdbCacheStatus, setTpdbCacheStatus] = useState<Awaited<ReturnType<typeof posterSetsApi.tpdbCacheStatus>> | null>(null);
    const [warmScope, setWarmScope] = useState<{
        media: 'all' | 'movie' | 'show';
        source: 'full' | 'recent';
        skipCached: boolean;
        followedPrefetchOnly: boolean;
    }>({
        media: 'all',
        source: 'full',
        skipCached: true,
        followedPrefetchOnly: false,
    });
    const [activityFilter, setActivityFilter] = useState<'all' | 'cache' | 'prefetch' | 'error' | 'followed'>('all');

    useEffect(() => {
        if (tab !== 'settings') return undefined;
        let cancelled = false;
        const refresh = () => {
            void posterSetsApi.tpdbCacheStatus()
                .then((status) => {
                    if (!cancelled) setTpdbCacheStatus(status);
                })
                .catch(() => {
                    if (!cancelled) setTpdbCacheStatus(null);
                });
        };
        refresh();
        // Keep the scrape activity panel live while Settings is open.
        const timer = window.setInterval(refresh, 2000);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [tab]);

    if (tab !== 'settings') return null;

    const warmPct = tpdbCacheStatus?.progress?.warm?.percent;
    const warmEta = formatTpdbEta(tpdbCacheStatus?.progress?.warm?.etaMs);
    const hydratePct = tpdbCacheStatus?.progress?.hydrate?.percent;
    const hydrateEta = formatTpdbEta(tpdbCacheStatus?.progress?.hydrate?.etaMs);
    const cacheBusy = Boolean(tpdbCacheStatus?.progress?.busy)
        || (tpdbCacheStatus?.hydrate?.warmQueue || 0) > 0
        || (tpdbCacheStatus?.hydrate?.queue || 0) > 0
        || (tpdbCacheStatus?.hydrate?.warmActive || 0) > 0
        || (tpdbCacheStatus?.hydrate?.active || 0) > 0
        || tpdbCacheStatus?.paused === true;
    const filteredActivity = (tpdbCacheStatus?.activity || []).filter((entry) => {
        if (activityFilter === 'all') return true;
        const kind = String(entry.kind || (
            entry.level === 'error' ? 'error'
                : /prefetch|hydrat|image/i.test(entry.message) ? 'prefetch'
                    : /follow/i.test(entry.message) ? 'followed'
                        : 'cache'
        ));
        return kind === activityFilter;
    });

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
                                Optional. Login unlocks advanced TMDB-id search. Poster pages themselves are public — if Cloudflare blocks login from your server, turn off “Use TPDB login” below and cache builds still scrape via public search.
                            </span>
                        </label>
                        <div className="sm:col-span-2">
                            <SettingsToggleRow
                                title="Use TPDB login (advanced search)"
                                description="On: try login for TMDB/IMDB/TVDB resolve. Off: public title+year search only (works when Cloudflare blocks login from Docker/VPS)."
                                checked={configDraft.tpdbUseLogin !== false}
                                onChange={(next) => setConfigDraft((prev) => ({
                                    ...prev,
                                    tpdbUseLogin: next,
                                }))}
                                border={false}
                            />
                        </div>
                        <div className="sm:col-span-2 rounded-xl border border-white/10 bg-black/20 px-4 py-4 lg:px-5 lg:py-5 space-y-5">
                            <div className="flex flex-wrap items-end justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-text">ThePosterDB local cache</p>
                                    <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
                                        Opt-in disk cache for <span className="text-text">library titles only</span> (Library / Watching).
                                        Faster reopen, offline reapply when hydrated, and resume after restart — not a Browse crawl.
                                    </p>
                                </div>
                                {tpdbCacheStatus ? (
                                    <p className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                        tpdbCacheStatus.cacheEnabled === true
                                            ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                                            : 'border-amber-400/30 bg-amber-500/10 text-amber-200'
                                    }`}
                                    >
                                        Server {tpdbCacheStatus.cacheEnabled === true ? 'ENABLED' : 'DISABLED'}
                                        {typeof tpdbCacheStatus.titles === 'number'
                                            ? ` · ${tpdbCacheStatus.titles} titles`
                                            : ''}
                                    </p>
                                ) : null}
                            </div>

                            <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
                                <div className="space-y-3 lg:col-span-5">
                                    <div className="space-y-2 text-xs leading-relaxed text-muted">
                                        <p>
                                            <span className="font-semibold text-text/90">What it’s for:</span>{' '}
                                            faster reopen of TPDB set lists; usable when ThePosterDB is down (after hydrate);
                                            offline/reapply from local images when possible.
                                        </p>
                                        <p>
                                            <span className="font-semibold text-text/90">How it works:</span>{' '}
                                            open a library title or build from library → metadata-first set lists (~1.5s logged in / ~2.5s public).
                                            Images hydrate on open or via Prefetch. Followed creators can queue first; parallel workers (5) speed titles but raise 429 risk.
                                            Resumes from <code className="text-text/80">tpdb-warm-progress.json</code>; oldest images drop when over budget.
                                        </p>
                                    </div>
                                    <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 font-mono text-[11px] text-text/85">
                                        <p className="font-sans text-[11px] font-semibold uppercase tracking-wide text-muted">Saved under</p>
                                        <p className="mt-1 break-all">
                                            {tpdbCacheStatus?.relativeRoot || 'config/poster-sets'}
                                            /
                                        </p>
                                        <ul className="mt-2 list-disc space-y-1 pl-4 font-sans text-[11px] text-muted">
                                            <li>
                                                <code className="text-text/80">tpdb-title-cache/</code>
                                                {' '}— title + set lists
                                            </li>
                                            <li>
                                                <code className="text-text/80">tpdb-set-cache/</code>
                                                {' '}— set preview metadata
                                            </li>
                                            <li>
                                                <code className="text-text/80">tpdb-image-cache/</code>
                                                {' '}— poster images
                                            </li>
                                        </ul>
                                        {tpdbCacheStatus?.rootDir ? (
                                            <p className="mt-2 break-all font-sans text-[11px] text-muted">
                                                Host: <span className="text-text/70">{tpdbCacheStatus.rootDir}</span>
                                            </p>
                                        ) : (
                                            <p className="mt-2 font-sans text-[11px] text-muted">
                                                Default <code className="text-text/80">config/poster-sets/</code>
                                                {' '}(or <code className="text-text/80">CONFIG_DIR</code> / <code className="text-text/80">POSTER_SETS_CONFIG_DIR</code>).
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="rounded-lg border border-white/10 bg-black/25 px-3 lg:col-span-7">
                                    <SettingsToggleRow
                                        title="Enable local TPDB cache"
                                        description="Turn on disk caching for library title set lists (and optionally full set images below)."
                                        checked={configDraft.tpdbLocalCacheEnabled === true}
                                        onChange={(next) => setConfigDraft((prev) => ({
                                            ...prev,
                                            tpdbLocalCacheEnabled: next,
                                            ...(next ? {} : { tpdbAggressivePrefetch: false, tpdbWarmParallelWorkers: false }),
                                        }))}
                                        className="!py-3"
                                    />
                                    {tpdbCacheStatus && (
                                        <p className={`-mt-1 mb-1 text-[11px] ${
                                            tpdbCacheStatus.cacheEnabled === true
                                                ? 'text-emerald-300/90'
                                                : 'text-amber-200/90'
                                        }`}
                                        >
                                            {configDraft.tpdbLocalCacheEnabled === true && tpdbCacheStatus.cacheEnabled !== true
                                                ? 'Toggle is on in this form but not saved yet — click Save settings.'
                                                : configDraft.tpdbLocalCacheEnabled !== true && tpdbCacheStatus.cacheEnabled === true
                                                    ? 'Form shows off; reload or Save to sync.'
                                                    : tpdbCacheStatus.cacheEnabled === true && (tpdbCacheStatus.titles || 0) === 0
                                                        ? 'Enabled but empty — open a library title or build from library once.'
                                                        : null}
                                        </p>
                                    )}
                                    <SettingsToggleRow
                                        title="Prefetch set images (library titles only)"
                                        description="Download set pages and images in the background after a library cache build resolves a title or you open one (up to 6 parallel CDN downloads). Disk counts for sets/images update live while this runs."
                                        checked={configDraft.tpdbLocalCacheEnabled === true && configDraft.tpdbAggressivePrefetch === true}
                                        onChange={(next) => setConfigDraft((prev) => ({
                                            ...prev,
                                            tpdbAggressivePrefetch: next,
                                            ...(next ? { tpdbLocalCacheEnabled: true } : {}),
                                        }))}
                                        disabled={configDraft.tpdbLocalCacheEnabled !== true}
                                        className="!py-3"
                                    />
                                    <SettingsToggleRow
                                        title="Prioritize Creators you follow"
                                        description="When Prefetch is caching set pages and images, queue sets from Creators you follow first (in whitelist order) ahead of everyone else. Add creators under Creators you follow below."
                                        checked={
                                            configDraft.tpdbLocalCacheEnabled === true
                                            && configDraft.tpdbPrioritizeFollowedCreators !== false
                                        }
                                        onChange={(next) => setConfigDraft((prev) => ({
                                            ...prev,
                                            tpdbPrioritizeFollowedCreators: next,
                                            ...(next ? { tpdbLocalCacheEnabled: true } : {}),
                                        }))}
                                        disabled={configDraft.tpdbLocalCacheEnabled !== true}
                                        className="!py-3"
                                    />
                                    <SettingsToggleRow
                                        title="Parallel cache workers (experimental)"
                                        description="Run 5 cache workers with separate TPDB sessions (~5× title resolve). Turn off if you hit rate limits or Cloudflare blocks."
                                        checked={configDraft.tpdbLocalCacheEnabled === true && configDraft.tpdbWarmParallelWorkers === true}
                                        onChange={(next) => setConfigDraft((prev) => ({
                                            ...prev,
                                            tpdbWarmParallelWorkers: next,
                                            ...(next ? { tpdbLocalCacheEnabled: true } : {}),
                                        }))}
                                        disabled={configDraft.tpdbLocalCacheEnabled !== true}
                                        border={false}
                                        className="!py-3"
                                    />
                                </div>
                            </div>

                            <div className={`grid gap-4 border-t border-white/10 pt-5 lg:grid-cols-12 lg:gap-5 ${configDraft.tpdbLocalCacheEnabled === true ? '' : 'opacity-50'}`}>
                                <div className={`lg:col-span-4 ${configDraft.tpdbLocalCacheEnabled === true ? '' : 'pointer-events-none'}`}>
                                    <span className="text-xs font-bold uppercase tracking-wide text-muted">Disk budget</span>
                                    <div className="mt-2">
                                        <CustomSelect
                                            value={String(
                                                TPDB_DISK_BUDGET_OPTIONS.find((option) => (
                                                    option.bytes === Number(configDraft.tpdbCacheMaxBytes)
                                                ))?.bytes
                                                || TPDB_DISK_BUDGET_OPTIONS.find((option) => option.bytes === 2 * GB)?.bytes
                                                || TPDB_DISK_BUDGET_OPTIONS[2].bytes
                                            )}
                                            onChange={(value) => setConfigDraft((prev) => ({
                                                ...prev,
                                                tpdbCacheMaxBytes: Number(value) || (2 * GB),
                                            }))}
                                            options={TPDB_DISK_BUDGET_OPTIONS.map((option) => ({
                                                value: String(option.bytes),
                                                label: option.label,
                                            }))}
                                            className="w-full min-w-[180px]"
                                        />
                                    </div>
                                    <span className="mt-1.5 block text-[11px] text-muted">
                                        Caps <code className="text-text/80">tpdb-image-cache/</code> only — oldest images are removed when over budget.
                                    </span>
                                </div>
                                {tpdbCacheStatus ? (
                                    <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-3 sm:px-4 lg:col-span-8">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                                                Cache on disk
                                            </p>
                                            <p className="text-[11px] text-muted">
                                                {(tpdbCacheStatus?.hydrate?.warmActive || 0) > 0
                                                    || (tpdbCacheStatus?.hydrate?.warmQueue || 0) > 0
                                                    || (tpdbCacheStatus?.hydrate?.active || 0) > 0
                                                    ? 'Live · refreshes every 2s'
                                                    : 'Refreshes every 2s'}
                                            </p>
                                        </div>
                                        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                                            <div>
                                                <p className="text-[10px] uppercase tracking-wide text-muted">Title pages</p>
                                                <p className="text-lg font-semibold tabular-nums text-text sm:text-xl">
                                                    {tpdbCacheStatus.titles || 0}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] uppercase tracking-wide text-muted">Set pages</p>
                                                <p className="text-lg font-semibold tabular-nums text-text sm:text-xl">
                                                    {tpdbCacheStatus.sets || 0}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] uppercase tracking-wide text-muted">Images</p>
                                                <p className="text-lg font-semibold tabular-nums text-text sm:text-xl">
                                                    {tpdbCacheStatus.images || 0}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] uppercase tracking-wide text-muted">Image disk</p>
                                                <p className="text-lg font-semibold tabular-nums text-text sm:text-xl">
                                                    {formatBytes(tpdbCacheStatus.imageBytes || 0)}
                                                </p>
                                            </div>
                                        </div>
                                        <p className="mt-3 text-[11px] text-muted">
                                            Library builds grow <span className="text-text/80">title pages</span> as each title resolves.
                                            With <span className="text-text/80">Prefetch</span>, set pages and images rise live too
                                            (otherwise when you open a title).
                                        </p>
                                    </div>
                                ) : (
                                    <div className="rounded-lg border border-dashed border-white/10 px-3 py-3 text-[11px] text-muted lg:col-span-8">
                                        Cache usage appears here once status loads.
                                    </div>
                                )}
                            </div>

                            <div className={`space-y-3 border-t border-white/10 pt-5 ${configDraft.tpdbLocalCacheEnabled === true ? '' : 'pointer-events-none opacity-50'}`}>
                                <div className="overflow-hidden rounded-lg border border-white/10 bg-black/25">
                                    <div className="border-b border-white/10 px-3 py-2 sm:px-4">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Build scope</p>
                                    </div>
                                    <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-white/10">
                                        <div className="grid gap-3 p-3 sm:grid-cols-2 sm:gap-4 sm:p-4">
                                            <label className="block min-w-0">
                                                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Media</span>
                                                <div className="mt-1.5">
                                                    <CustomSelect
                                                        value={warmScope.media}
                                                        onChange={(value) => setWarmScope((prev) => ({
                                                            ...prev,
                                                            media: (value === 'movie' || value === 'show' ? value : 'all') as 'all' | 'movie' | 'show',
                                                        }))}
                                                        options={[
                                                            { value: 'all', label: 'Movies + TV' },
                                                            { value: 'movie', label: 'Movies only' },
                                                            { value: 'show', label: 'TV only' },
                                                        ]}
                                                        className="w-full"
                                                    />
                                                </div>
                                            </label>
                                            <label className="block min-w-0">
                                                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Library source</span>
                                                <div className="mt-1.5">
                                                    <CustomSelect
                                                        value={warmScope.source}
                                                        onChange={(value) => setWarmScope((prev) => ({
                                                            ...prev,
                                                            source: value === 'recent' ? 'recent' : 'full',
                                                        }))}
                                                        options={[
                                                            { value: 'full', label: 'Recent + full library' },
                                                            { value: 'recent', label: 'Recently added only' },
                                                        ]}
                                                        className="w-full"
                                                    />
                                                </div>
                                            </label>
                                        </div>
                                        <div className="border-t border-white/10 px-3 py-1 lg:border-t-0 sm:px-4">
                                            <SettingsToggleRow
                                                title="Skip already cached titles"
                                                description="Only queue titles that do not already have a TPDB set list on disk (resume-friendly)."
                                                checked={warmScope.skipCached}
                                                onChange={(next) => setWarmScope((prev) => ({ ...prev, skipCached: next }))}
                                                border
                                                className="!py-2.5"
                                            />
                                            <SettingsToggleRow
                                                title="Prefetch followed creators first"
                                                description="When Prefetch is on, hydrate sets from Creators you follow before everyone else for this build — others still queue after."
                                                checked={warmScope.followedPrefetchOnly}
                                                onChange={(next) => setWarmScope((prev) => ({ ...prev, followedPrefetchOnly: next }))}
                                                border={false}
                                                className="!py-2.5"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        className={buttonClass}
                                        disabled={busy !== null || configDraft.tpdbLocalCacheEnabled !== true}
                                        onClick={async () => {
                                            setBusy('tpdb-cache');
                                            try {
                                                const mapRow = (row: Record<string, unknown>) => {
                                                    const tmdbRaw = row.tmdbId ?? row.tmdb_id;
                                                    const tmdbId = tmdbRaw != null ? String(tmdbRaw).trim() : '';
                                                    const mediaRaw = String(row.mediaType || row.type || 'movie').toLowerCase();
                                                    return {
                                                        tmdbId,
                                                        title: String(row.title || row.name || '').trim(),
                                                        year: (row.year as number | null | undefined) ?? null,
                                                        mediaType: mediaRaw === 'show' || mediaRaw === 'tv' || mediaRaw === 'series'
                                                            ? 'show'
                                                            : 'movie',
                                                    };
                                                };
                                                const seen = new Set<string>();
                                                const items: Array<{
                                                    tmdbId: string;
                                                    title: string;
                                                    year: number | null;
                                                    mediaType: string;
                                                }> = [];
                                                const pushRows = (rows: Array<Record<string, unknown>>) => {
                                                    for (const row of rows) {
                                                        const mapped = mapRow(row);
                                                        if (!/^\d+$/.test(mapped.tmdbId) || !mapped.title) continue;
                                                        if (warmScope.media !== 'all' && mapped.mediaType !== warmScope.media) continue;
                                                        const key = `${mapped.mediaType}:${mapped.tmdbId}`;
                                                        if (seen.has(key)) continue;
                                                        seen.add(key);
                                                        items.push(mapped);
                                                        if (items.length >= 1000) return;
                                                    }
                                                };

                                                const recent = await posterSetsApi.libraryRecent(200);
                                                pushRows([
                                                    ...(recent.movies || []),
                                                    ...(recent.shows || []),
                                                    ...(recent.items || []),
                                                ] as Array<Record<string, unknown>>);

                                                if (warmScope.source === 'full') {
                                                    const sections = await posterSetsApi.librarySections().catch(() => null);
                                                    for (const section of sections?.sections || []) {
                                                        if (items.length >= 1000) break;
                                                        const sectionType = String(section.type || '').toLowerCase();
                                                        if (sectionType !== 'movie' && sectionType !== 'show') continue;
                                                        if (warmScope.media === 'movie' && sectionType !== 'movie') continue;
                                                        if (warmScope.media === 'show' && sectionType !== 'show') continue;
                                                        let start = 0;
                                                        for (let page = 0; page < 20 && items.length < 1000; page += 1) {
                                                            const browse = await posterSetsApi.libraryBrowse({
                                                                section: section.key,
                                                                type: sectionType === 'show' ? 'show' : 'movie',
                                                                start,
                                                                limit: 100,
                                                                sort: 'titleSort',
                                                            }).catch(() => null);
                                                            const batch = (browse?.items || []) as Array<Record<string, unknown>>;
                                                            if (!batch.length) break;
                                                            const before = items.length;
                                                            pushRows(batch);
                                                            start += batch.length;
                                                            if (batch.length < 100 || items.length === before) break;
                                                        }
                                                    }
                                                }

                                                const result = await posterSetsApi.warmTpdbLibraryCache(items, {
                                                    skipCached: warmScope.skipCached,
                                                    force: !warmScope.skipCached,
                                                    followedPrefetchOnly: warmScope.followedPrefetchOnly,
                                                });
                                                toast(result.message || `Caching ${result.titles || 0} library title(s).`);
                                                const status = await posterSetsApi.tpdbCacheStatus().catch(() => null);
                                                if (status) setTpdbCacheStatus(status);
                                            } catch (error) {
                                                toast(error instanceof Error ? error.message : 'Cache build failed', 'error');
                                            } finally {
                                                setBusy(null);
                                            }
                                        }}
                                    >
                                        {busy === 'tpdb-cache' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                        Build cache from library
                                    </button>
                                    <button
                                        type="button"
                                        className={buttonClass}
                                        disabled={busy !== null || !cacheBusy}
                                        onClick={async () => {
                                            try {
                                                if (tpdbCacheStatus?.paused) {
                                                    await posterSetsApi.resumeTpdbCache();
                                                    toast('Cache resumed.');
                                                } else {
                                                    await posterSetsApi.pauseTpdbCache();
                                                    toast('Cache paused after the current title/set.');
                                                }
                                                const status = await posterSetsApi.tpdbCacheStatus().catch(() => null);
                                                if (status) setTpdbCacheStatus(status);
                                            } catch (error) {
                                                toast(error instanceof Error ? error.message : 'Pause/resume failed', 'error');
                                            }
                                        }}
                                    >
                                        {tpdbCacheStatus?.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                                        {tpdbCacheStatus?.paused ? 'Resume' : 'Pause'}
                                    </button>
                                    <button
                                        type="button"
                                        className={buttonClass}
                                        disabled={busy !== null || !cacheBusy}
                                        onClick={async () => {
                                            const ok = await askConfirm('Stop the cache queue? In-flight work finishes; waiting titles/sets are dropped (disk cache is kept).', {
                                                title: 'Stop cache build?',
                                                confirmLabel: 'Stop',
                                                cancelLabel: 'Cancel',
                                            });
                                            if (!ok) return;
                                            try {
                                                const result = await posterSetsApi.stopTpdbCache();
                                                toast(`Stopped — dropped ${result.droppedTitles || 0} title(s), ${result.droppedSets || 0} set(s).`);
                                                const status = await posterSetsApi.tpdbCacheStatus().catch(() => null);
                                                if (status) setTpdbCacheStatus(status);
                                            } catch (error) {
                                                toast(error instanceof Error ? error.message : 'Stop failed', 'error');
                                            }
                                        }}
                                    >
                                        <X className="h-4 w-4" />
                                        Stop
                                    </button>
                                    <button
                                        type="button"
                                        className={buttonClass}
                                        disabled={busy !== null}
                                        onClick={async () => {
                                            const ok = await askConfirm(
                                                'This will delete cached ThePosterDB title pages, set previews, and downloaded images from disk.',
                                                {
                                                    title: 'Clear TPDB cache?',
                                                    confirmLabel: 'Continue',
                                                    cancelLabel: 'Cancel',
                                                },
                                            );
                                            if (!ok) return;
                                            const confirmed = await askConfirm(
                                                'All TPDB cache files on disk will be permanently deleted. You will need to rebuild or re-open titles to restore them.\n\nThis action cannot be undone.',
                                                {
                                                    title: 'Permanently delete TPDB cache?',
                                                    confirmLabel: 'Delete everything',
                                                    cancelLabel: 'Keep cache',
                                                    danger: true,
                                                },
                                            );
                                            if (!confirmed) return;
                                            setBusy('tpdb-cache');
                                            try {
                                                const result = await posterSetsApi.clearTpdbCache();
                                                toast(`Cleared ${result.cleared?.titles || 0} titles, ${result.cleared?.sets || 0} sets, ${result.cleared?.images || 0} images.`);
                                                const status = await posterSetsApi.tpdbCacheStatus().catch(() => null);
                                                if (status) setTpdbCacheStatus(status);
                                            } catch (error) {
                                                toast(error instanceof Error ? error.message : 'Clear failed', 'error');
                                            } finally {
                                                setBusy(null);
                                            }
                                        }}
                                    >
                                        Clear TPDB cache
                                    </button>
                                    <button
                                        type="button"
                                        className={buttonClass}
                                        disabled={busy !== null}
                                        onClick={async () => {
                                            try {
                                                const status = await posterSetsApi.tpdbCacheStatus();
                                                setTpdbCacheStatus(status);
                                                toast('Cache usage refreshed.');
                                            } catch (error) {
                                                toast(error instanceof Error ? error.message : 'Status failed', 'error');
                                            }
                                        }}
                                    >
                                        <RefreshCw className="h-4 w-4" />
                                        Refresh usage
                                    </button>
                                </div>
                            </div>

                            <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-3 sm:px-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                                        Live scrape activity
                                    </p>
                                    <p className="text-[11px] text-muted">
                                        {tpdbCacheStatus?.paused
                                            ? 'Paused'
                                            : (tpdbCacheStatus?.hydrate?.warmActive || 0) > 0 || (tpdbCacheStatus?.hydrate?.active || 0) > 0
                                                ? 'Working…'
                                                : (tpdbCacheStatus?.hydrate?.warmQueue || 0) > 0 || (tpdbCacheStatus?.hydrate?.queue || 0) > 0
                                                    ? 'Queued'
                                                    : 'Idle'}
                                        {(tpdbCacheStatus?.hydrate?.warmQueue || 0) > 0
                                            ? ` · ${tpdbCacheStatus?.hydrate?.warmQueue} title(s)`
                                            : ''}
                                        {(tpdbCacheStatus?.hydrate?.queue || 0) > 0
                                            ? ` · ${tpdbCacheStatus?.hydrate?.queue} set(s)`
                                            : ''}
                                        {(tpdbCacheStatus?.hydrate?.rateLimit?.cooldownMs || 0) > 0
                                            ? ` · cooldown ${Math.ceil((tpdbCacheStatus?.hydrate?.rateLimit?.cooldownMs || 0) / 1000)}s`
                                            : ''}
                                    </p>
                                </div>
                                <div className="mt-3 grid gap-4 lg:grid-cols-12 lg:gap-5">
                                    <div className="space-y-2 lg:col-span-5">
                                        {(warmPct != null || hydratePct != null) ? (
                                            <div className="space-y-2 rounded-md border border-white/10 bg-black/25 px-2.5 py-2">
                                                {warmPct != null ? (
                                                    <div>
                                                        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                                            <span className="font-semibold text-text/90">
                                                                Titles {tpdbCacheStatus?.progress?.warm?.completed || 0}/{tpdbCacheStatus?.progress?.warm?.total || 0}
                                                                {warmPct != null ? ` · ${warmPct}%` : ''}
                                                            </span>
                                                            <span className="text-muted">{warmEta ? `ETA ${warmEta}` : 'ETA —'}</span>
                                                        </div>
                                                        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                                                            <div className="h-full rounded-full bg-plex/80 transition-all" style={{ width: `${Math.max(2, warmPct || 0)}%` }} />
                                                        </div>
                                                    </div>
                                                ) : null}
                                                {hydratePct != null && (tpdbCacheStatus?.progress?.hydrate?.total || 0) > 0 ? (
                                                    <div>
                                                        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                                            <span className="font-semibold text-text/90">
                                                                Prefetch {tpdbCacheStatus?.progress?.hydrate?.completed || 0}/{tpdbCacheStatus?.progress?.hydrate?.total || 0}
                                                                {hydratePct != null ? ` · ${hydratePct}%` : ''}
                                                            </span>
                                                            <span className="text-muted">{hydrateEta ? `ETA ${hydrateEta}` : 'ETA —'}</span>
                                                        </div>
                                                        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                                                            <div className="h-full rounded-full bg-sky-400/80 transition-all" style={{ width: `${Math.max(2, hydratePct || 0)}%` }} />
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </div>
                                        ) : null}
                                        <p className="text-xs text-text/90">
                                            {tpdbCacheStatus?.current
                                                || (configDraft.tpdbLocalCacheEnabled === true
                                                    ? 'No scrape in progress — open a library title or build the cache from your library to see activity here.'
                                                    : 'Enable local TPDB cache to start logging scrape / prefetch work.')}
                                        </p>
                                        {tpdbCacheStatus?.hydrate?.lastError ? (
                                            <div className="flex flex-wrap items-start justify-between gap-2">
                                                <p className="text-[11px] text-red-300/90">
                                                    Last error: {tpdbCacheStatus.hydrate.lastError}
                                                </p>
                                                <button
                                                    type="button"
                                                    className="text-[11px] font-semibold text-plex hover:underline"
                                                    onClick={async () => {
                                                        try {
                                                            await navigator.clipboard.writeText(String(tpdbCacheStatus.hydrate?.lastError || ''));
                                                            toast('Copied last error.');
                                                        } catch {
                                                            toast('Could not copy error', 'error');
                                                        }
                                                    }}
                                                >
                                                    Copy error
                                                </button>
                                            </div>
                                        ) : null}
                                        <p className="text-[11px] text-muted">
                                            Auto-refreshes every 2s. Builds write title pages as they finish; Prefetch also grows set/image counts live.
                                        </p>
                                    </div>
                                    <div className="space-y-2 lg:col-span-7">
                                        <div className="flex flex-wrap gap-1.5">
                                            {([
                                                ['all', 'All'],
                                                ['cache', 'Cache'],
                                                ['prefetch', 'Prefetch'],
                                                ['followed', 'Followed'],
                                                ['error', 'Errors'],
                                            ] as const).map(([id, label]) => (
                                                <button
                                                    key={id}
                                                    type="button"
                                                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide transition ${
                                                        activityFilter === id
                                                            ? 'border-plex/40 bg-plex/15 text-plex'
                                                            : 'border-white/10 bg-black/20 text-muted hover:border-plex/30 hover:text-text'
                                                    }`}
                                                    onClick={() => setActivityFilter(id)}
                                                >
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="max-h-56 overflow-y-auto rounded-md border border-white/5 bg-black/40 px-2 py-1.5 font-mono text-[11px] leading-relaxed lg:min-h-[12rem]">
                                            {filteredActivity.length ? (
                                                filteredActivity.slice(0, 40).map((entry) => {
                                                    const time = new Date(entry.at).toLocaleTimeString();
                                                    const tone = entry.level === 'error'
                                                        ? 'text-red-300'
                                                        : entry.level === 'warn'
                                                            ? 'text-amber-200/90'
                                                            : 'text-text/80';
                                                    return (
                                                        <div key={`${entry.at}-${entry.message}`} className={`py-0.5 ${tone}`}>
                                                            <span className="text-muted">{time}</span>
                                                            {' '}
                                                            {entry.message}
                                                            {entry.detail ? (
                                                                <span className="text-muted"> — {entry.detail}</span>
                                                            ) : null}
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <p className="py-1 text-muted">No activity yet this session.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
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
                                One MediUX / ThePosterDB username per line (no @ needed). Browse adds a &quot;Creators you follow&quot; row with only their sets.
                                With local cache Prefetch + Prioritize Creators you follow, their sets hydrate first during cache builds.
                                Click any @username to open their full catalog.
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
