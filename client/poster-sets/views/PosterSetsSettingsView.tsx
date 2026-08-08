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

    const [tpdbCacheStatus, setTpdbCacheStatus] = useState<{
        cacheEnabled?: boolean;
        prefetchEnabled?: boolean;
        titles?: number;
        sets?: number;
        images?: number;
        imageBytes?: number;
        rootDir?: string;
        relativeRoot?: string;
        folders?: { titles?: string; sets?: string; images?: string };
        current?: string | null;
        activity?: Array<{
            at: number;
            level: string;
            message: string;
            detail?: string | null;
        }>;
        hydrate?: {
            queue?: number;
            active?: number;
            lastError?: string | null;
            warmQueue?: number;
            warmActive?: number;
            rateLimit?: { gapMs?: number; cooldownMs?: number; msSinceLastRequest?: number | null };
        };
    } | null>(null);

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
                        <div className="sm:col-span-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3 space-y-0">
                            <p className="pt-3 text-sm font-semibold text-text">ThePosterDB local cache</p>
                            <div className="space-y-2 pb-3 text-xs leading-relaxed text-muted">
                                <p>
                                    Opt-in cache for <span className="text-text">library titles only</span> (TMDB-matched opens from Library / Watching).
                                    It does not crawl Browse or the whole ThePosterDB catalog.
                                </p>
                                <p>
                                    <span className="font-semibold text-text/90">What it’s for:</span>{' '}
                                    faster reopen of TPDB set lists you’ve already looked up; keeping Poster Sets usable when ThePosterDB is down
                                    (after sets/images have been hydrated once); offline/reapply from local image files when possible.
                                </p>
                                <p>
                                    <span className="font-semibold text-text/90">How it works:</span>{' '}
                                    when you open a library title (or build the cache from your library), SMP resolves TPDB sets and can store them on disk.
                                    A library cache build is <span className="text-text/90">metadata-first</span> (title URL + set list, first page / up to ~48 sets)
                                    with ~1.5s HTML spacing when logged in, ~2.5s when using public search — images hydrate when you open a title (or via Prefetch).
                                    Optional parallel cache workers (5 separate sessions) speed title resolve but raise 429 risk.
                                    Already-cached titles are skipped and, after a portal restart, any unfinished queue resumes from{' '}
                                    <code className="text-text/80">tpdb-warm-progress.json</code>.
                                    Oldest images are dropped when the disk budget is hit.
                                </p>
                                <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-[11px] text-text/85">
                                    <p className="font-sans text-[11px] font-semibold uppercase tracking-wide text-muted">Saved under</p>
                                    <p className="mt-1 break-all">
                                        {tpdbCacheStatus?.relativeRoot || 'config/poster-sets'}
                                        /
                                    </p>
                                    <ul className="mt-2 list-disc space-y-1 pl-4 font-sans text-[11px] text-muted">
                                        <li>
                                            <code className="text-text/80">tpdb-title-cache/</code>
                                            {' '}— title page + set lists (JSON)
                                        </li>
                                        <li>
                                            <code className="text-text/80">tpdb-set-cache/</code>
                                            {' '}— per-set preview / asset metadata (JSON)
                                        </li>
                                        <li>
                                            <code className="text-text/80">tpdb-image-cache/</code>
                                            {' '}— poster image files (<code className="text-text/80">.bin</code> + meta)
                                        </li>
                                    </ul>
                                    <p className="mt-2 font-sans text-[11px] text-muted">
                                        Default path is <code className="text-text/80">config/poster-sets/</code> next to portal config
                                        (or <code className="text-text/80">CONFIG_DIR/poster-sets</code> / <code className="text-text/80">POSTER_SETS_CONFIG_DIR</code> if those env vars are set).
                                        {tpdbCacheStatus?.rootDir ? (
                                            <>
                                                {' '}Absolute on this host:{' '}
                                                <span className="break-all text-text/70">{tpdbCacheStatus.rootDir}</span>
                                            </>
                                        ) : null}
                                    </p>
                                </div>
                            </div>
                            <SettingsToggleRow
                                title="Enable local TPDB cache"
                                description="Turn on disk caching for library title set lists (and optionally full set images below)."
                                checked={configDraft.tpdbLocalCacheEnabled === true}
                                onChange={(next) => setConfigDraft((prev) => ({
                                    ...prev,
                                    tpdbLocalCacheEnabled: next,
                                    ...(next ? {} : { tpdbAggressivePrefetch: false, tpdbWarmParallelWorkers: false }),
                                }))}
                            />
                            {tpdbCacheStatus && (
                                <p className={`-mt-1 mb-2 text-[11px] ${
                                    tpdbCacheStatus.cacheEnabled === true
                                        ? 'text-emerald-300/90'
                                        : 'text-amber-200/90'
                                }`}
                                >
                                    Server (Docker volume): cache is{' '}
                                    <span className="font-semibold">
                                        {tpdbCacheStatus.cacheEnabled === true ? 'ENABLED' : 'DISABLED'}
                                    </span>
                                    {typeof tpdbCacheStatus.titles === 'number'
                                        ? ` · ${tpdbCacheStatus.titles} title(s) cached`
                                        : ''}
                                    {configDraft.tpdbLocalCacheEnabled === true && tpdbCacheStatus.cacheEnabled !== true
                                        ? ' — toggle is on in this form but not saved yet. Click Save settings.'
                                        : ''}
                                    {configDraft.tpdbLocalCacheEnabled !== true && tpdbCacheStatus.cacheEnabled === true
                                        ? ' — form shows off; reload or Save to sync.'
                                        : ''}
                                    {tpdbCacheStatus.cacheEnabled === true && (tpdbCacheStatus.titles || 0) === 0
                                        ? ' — enabled, but empty. Open a library title or build the cache from your library once.'
                                        : ''}
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
                            />
                            <div className={`space-y-2 border-t border-white/10 py-3 ${configDraft.tpdbLocalCacheEnabled === true ? '' : 'opacity-50'}`}>
                                <label className="block max-w-md">
                                    <span className="text-xs font-bold uppercase tracking-wide text-muted">Disk budget</span>
                                    <div className={`mt-2 ${configDraft.tpdbLocalCacheEnabled === true ? '' : 'pointer-events-none'}`}>
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
                                    <span className="mt-1 block text-[11px] text-muted">
                                        Caps <code className="text-text/80">tpdb-image-cache/</code> only — oldest images are removed when over budget.
                                    </span>
                                    {tpdbCacheStatus ? (
                                        <div className="mt-2 rounded-md border border-white/10 bg-black/25 px-3 py-2">
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
                                            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                                <div>
                                                    <p className="text-[10px] uppercase tracking-wide text-muted">Title pages</p>
                                                    <p className="text-sm font-semibold tabular-nums text-text">
                                                        {tpdbCacheStatus.titles || 0}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] uppercase tracking-wide text-muted">Set pages</p>
                                                    <p className="text-sm font-semibold tabular-nums text-text">
                                                        {tpdbCacheStatus.sets || 0}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] uppercase tracking-wide text-muted">Images</p>
                                                    <p className="text-sm font-semibold tabular-nums text-text">
                                                        {tpdbCacheStatus.images || 0}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] uppercase tracking-wide text-muted">Image disk</p>
                                                    <p className="text-sm font-semibold tabular-nums text-text">
                                                        {formatBytes(tpdbCacheStatus.imageBytes || 0)}
                                                    </p>
                                                </div>
                                            </div>
                                            <p className="mt-2 text-[11px] text-muted">
                                                A library cache build grows <span className="text-text/80">title pages</span> as each title resolves.
                                                With <span className="text-text/80">Prefetch</span> on, it also queues set pages and images
                                                so those counts rise live too (otherwise they grow when you open a title).
                                            </p>
                                        </div>
                                    ) : null}
                                </label>
                                <div className="flex flex-wrap gap-2 pt-1">
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
                                                        // Real TMDB ids only — never fall back to Plex ratingKey.
                                                        if (!/^\d+$/.test(mapped.tmdbId) || !mapped.title) continue;
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

                                                const sections = await posterSetsApi.librarySections().catch(() => null);
                                                for (const section of sections?.sections || []) {
                                                    if (items.length >= 1000) break;
                                                    const sectionType = String(section.type || '').toLowerCase();
                                                    if (sectionType !== 'movie' && sectionType !== 'show') continue;
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

                                                const result = await posterSetsApi.warmTpdbLibraryCache(items);
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
                                <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 space-y-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                                            Live scrape activity
                                        </p>
                                        <p className="text-[11px] text-muted">
                                            {(tpdbCacheStatus?.hydrate?.warmActive || 0) > 0 || (tpdbCacheStatus?.hydrate?.active || 0) > 0
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
                                    <p className="text-xs text-text/90">
                                        {tpdbCacheStatus?.current
                                            || (configDraft.tpdbLocalCacheEnabled === true
                                                ? 'No scrape in progress — open a library title or build the cache from your library to see activity here.'
                                                : 'Enable local TPDB cache to start logging scrape / prefetch work.')}
                                    </p>
                                    {tpdbCacheStatus?.hydrate?.lastError ? (
                                        <p className="text-[11px] text-red-300/90">
                                            Last error: {tpdbCacheStatus.hydrate.lastError}
                                        </p>
                                    ) : null}
                                    <div className="max-h-52 overflow-y-auto rounded-md border border-white/5 bg-black/40 px-2 py-1.5 font-mono text-[11px] leading-relaxed">
                                        {(tpdbCacheStatus?.activity || []).length ? (
                                            (tpdbCacheStatus?.activity || []).slice(0, 40).map((entry) => {
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
                                    <p className="text-[11px] text-muted">
                                        Auto-refreshes every 2s while this page is open. A library cache build writes each title page as it
                                        finishes; with Prefetch on it also scrapes set pages and downloads images so those
                                        counts rise live. Without Prefetch, open a title to hydrate sets/images.
                                    </p>
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
