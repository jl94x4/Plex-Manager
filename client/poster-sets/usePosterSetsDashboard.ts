import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pushToast, type ToastMessage } from '../shared/toast';
import { usePoll } from '../shared/usePoll';
import { askConfirm } from '../shared/confirm';
import {
    internalTabFromUrl,
    normalizePosterLocation,
    parsePosterSetsUrl,
    urlStateFromInternalTab,
    writePosterSetsUrl,
    type DiscoverView,
} from './urlState';
import {
    normalizeUpgraderGridSize,
    upgraderLandscapeGridStyle,
    upgraderPosterGridClass,
    upgraderPosterGridStyle,
    type UpgraderGridSize,
} from '../shared/portalLayout';
import { posterSetsApi } from './api';
import {
    DEFAULT_POSTER_SETS_CONFIG,
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
import { groupPosterSetsWatchesByCategory } from './watchGroups';
import type { RecentSetCategory } from './shared/posterSetsRecent';
import { prioritizeSetsByFollowedCreators } from './prioritizeCreatorSets';
import { classifyPreviewAsset, groupPreviewAssets } from './previewGroups';
import { pickAutoMatchedTitle, rankSearchTitlesForLibraryItem } from './autoMatchTitle';
import { fetchPosterSetsForTitle } from './fetchPosterSetsForTitle';
import {
    clearLibraryRecentCache,
    readLibraryRecentCache,
    readLibrarySearchCache,
    writeLibraryRecentCache,
    writeLibrarySearchCache,
} from './libraryCache';
import {
    normalizeLibraryItems,
    type LibraryRecentItem,
} from './libraryRecent';
import {
    ALL_MEDIUX_FILTER_IDS,
    DISCOVER_SUB_NAV,
    POSTER_SETS_GRID_STORAGE_KEY,
    POSTER_SETS_LIBRARY_DETAIL_LAYOUT_KEY,
    SEARCH_SETS_PAGE_SIZE,
    TITLE_CARD_ONLY_FILTERS,
    browseRailsCache,
    buildSetUrl,
    bulkEntryFromSet,
    classifyRecentSet,
    formatSetLabel,
    formatTime,
    inferRecentSetKindFromAssets,
    inferRecentSetKindFromFilters,
    isBackgroundSet,
    isTitleCardSet,
    jobLogLines,
    jobSetMeta,
    jobTitle,
    listToText,
    MAX_RECENT_SETS,
    normalizeLibraryDetailLayout,
    normalizeRecentSetKind,
    parseSetRef,
    readRecentSets,
    textToList,
    upsertRecentSet,
    type BulkSetSelection,
    type HistoryFilter,
    type PrimaryTabId,
    type RecentSetCategory,
    type RecentSetChip,
    type SearchProvider,
    type SetProvider,
    type TabId,
} from './shared';
import type { PosterSetsDashboardContextValue } from './posterSetsDashboardContextTypes';
import {
    inferPreviewMediaType,
    normalizeRelatedTitle,
    pickBestRelatedTitle,
    relatedSetKey,
} from './posterSetsDashboardUtils';

export function usePosterSetsDashboard(): PosterSetsDashboardContextValue {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const toast = useCallback((message: string, type: ToastMessage['type'] = 'success') => {
        setToasts((current) => pushToast(current, message, type));
    }, []);

    const initialUrlState = useMemo(
        () => (typeof window !== 'undefined'
            ? parsePosterSetsUrl()
            : urlStateFromInternalTab('library')),
        [],
    );
    const initialLocation = useMemo(
        () => ({
            ...initialUrlState,
            tab: internalTabFromUrl(initialUrlState),
        }),
        [initialUrlState],
    );
    const [tab, setTab] = useState<TabId>(initialLocation.tab);
    const [libraryDetailItem, setLibraryDetailItem] = useState<LibraryRecentItem | null>(null);
    const [libraryViewMode, setLibraryViewMode] = useState<'recent' | 'browse'>('recent');
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
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [showInspectorAssets, setShowInspectorAssets] = useState(false);
    const previewPanelRef = useRef<HTMLDivElement | null>(null);
    const searchSetsSectionRef = useRef<HTMLDivElement | null>(null);
    const [recentTick, setRecentTick] = useState(0);
    const [gridSize, setGridSize] = useState<UpgraderGridSize>(() => {
        if (typeof window === 'undefined') return 'medium';
        return normalizeUpgraderGridSize(window.localStorage.getItem(POSTER_SETS_GRID_STORAGE_KEY));
    });
    const [libraryDetailLayout, setLibraryDetailLayout] = useState(() => {
        if (typeof window === 'undefined') return normalizeLibraryDetailLayout('drawer');
        return normalizeLibraryDetailLayout(window.localStorage.getItem(POSTER_SETS_LIBRARY_DETAIL_LAYOUT_KEY));
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
    const [watchesCategoryFilter, setWatchesCategoryFilter] = useState<'all' | RecentSetCategory>('all');
    const [watchArtKindOverrides, setWatchArtKindOverrides] = useState<Record<string, RecentSetCategory>>({});
    const [selectedBulkSets, setSelectedBulkSets] = useState<Record<string, BulkSetSelection>>({});
    const [browseRails, setBrowseRails] = useState<PosterSetsBrowseRail[]>(() => browseRailsCache.rails);
    const browseRailsRef = useRef<PosterSetsBrowseRail[]>(browseRailsCache.rails);
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
            browseRailsCache.rails = applied;
        } catch (error) {
            if (requestId !== browseLoadGenRef.current) return;
            if (!silent) {
                toast(error instanceof Error ? error.message : 'Failed to load browse rails', 'error');
            }
        } finally {
            if (requestId === browseLoadGenRef.current && !silent) setBrowseLoading(false);
        }
    }, [toast]);

    /** Collapse the inline set inspector without wiping search/browse results. */
    const collapseSetInspector = useCallback((options?: { scrollToSets?: boolean }) => {
        setPreview(null);
        setSelectedSearchSet(null);
        setSelectedAssetIds([]);
        setShowInspectorAssets(false);
        setTitleCardsOnly(false);
        titleCardsOnlyRef.current = false;
        syncedSetUrlRef.current = null;
        const creator = searchMode === 'creator' ? String(searchQuery || '').trim().replace(/^@+/, '') || null : null;
        writePosterSetsUrl(normalizePosterLocation({
            tab: tab === 'browse' ? 'browse' : 'apply',
            rail: tab === 'browse' ? browseSeeAllId : null,
            setUrl: null,
            creator: tab === 'apply' ? creator : null,
            titleCardsOnly: false,
        }), 'replace');
        if (options?.scrollToSets !== false) {
            requestAnimationFrame(() => {
                searchSetsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }
    }, [browseSeeAllId, searchMode, searchQuery, tab]);

    const dismissPreviewToSearch = collapseSetInspector;

    const pushPosterLocation = useCallback((next: Parameters<typeof normalizePosterLocation>[0], mode: 'push' | 'replace' = 'push') => {
        const state = normalizePosterLocation(next);
        const internal = internalTabFromUrl(state);
        syncedSetUrlRef.current = internal === 'apply' ? state.setUrl : null;
        const nextTitleCards = Boolean(internal === 'apply' && state.titleCardsOnly && state.setUrl);
        titleCardsOnlyRef.current = nextTitleCards;
        setTitleCardsOnly(nextTitleCards);
        writePosterSetsUrl(state, mode);
    }, []);

    const goToTab = useCallback((id: TabId, options?: { rail?: string | null; mode?: 'push' | 'replace' }) => {
        setLibraryDetailItem(null);
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
            void loadAudit();
            if (historyFilter !== 'audit') setHistoryFilter('audit');
        }
        if (id === 'queue') void loadQueue();
        if (id === 'watches') void loadWatches();
        if (id === 'browse') void loadBrowse({ silent: browseRailsRef.current.length > 0 });
        if (id === 'library') void loadLibraryRecent({ silent: libraryShows.length > 0 || libraryMovies.length > 0 });
    }, [historyFilter, loadAudit, loadBrowse, loadHistory, loadLibraryRecent, loadQueue, loadWatches, libraryMovies.length, libraryShows.length, pushPosterLocation, setHistoryFilter]);

    const goToPrimaryTab = useCallback((id: PrimaryTabId, options?: { mode?: 'push' | 'replace' }) => {
        if (id === 'discover') {
            goToTab('apply', options);
            return;
        }
        if (id === 'logs') {
            goToTab('history', options);
            return;
        }
        goToTab(id, options);
    }, [goToTab]);

    const goToDiscoverView = useCallback((view: DiscoverView, options?: { rail?: string | null; mode?: 'push' | 'replace' }) => {
        const internal: TabId = view === 'browse'
            ? 'browse'
            : view === 'recent'
                ? 'recent'
                : 'apply';
        goToTab(internal, options);
    }, [goToTab]);

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
                tpdb_password: cfg.hasTpdbPassword ? '********' : '',
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

    const saveCreatorsConfig = async (partial: Partial<PosterSetsConfig>) => {
        setBusy('save');
        try {
            const response = await posterSetsApi.saveConfig({
                ...configDraft,
                tv_library: textToList(tvText),
                movie_library: textToList(movieText),
                creatorWhitelist: textToList(whitelistText).map((item) => item.replace(/^@+/, '')),
                ...partial,
            });
            setConfigDraft({
                ...response.config,
                token: response.config.hasToken ? '********' : '',
                tpdb_password: response.config.hasTpdbPassword ? '********' : '',
            });
            setWhitelistText(listToText(response.config.creatorWhitelist));
            void loadBrowse({ refresh: true, silent: true });
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to save creators', 'error');
            throw error;
        } finally {
            setBusy(null);
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
                token: configDraft.token === '********' ? undefined : configDraft.token,
                tpdb_password: configDraft.tpdb_password === '********' ? undefined : configDraft.tpdb_password,
            };
            const nextWhitelist = (payload.creatorWhitelist || [])
                .map((item) => String(item).replace(/^@+/, '').toLowerCase())
                .sort()
                .join('|');
            const response = await posterSetsApi.saveConfig(payload);
            setConfigDraft({
                ...response.config,
                token: response.config.hasToken ? '********' : '',
                tpdb_password: response.config.hasTpdbPassword ? '********' : '',
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
                tpdb_password: cfg.hasTpdbPassword ? '********' : '',
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
                tpdb_password: configDraft.tpdb_password === '********' ? undefined : configDraft.tpdb_password,
            });
            const libraries = [
                ...(response.tvLibraries || []).map((name) => `TV: ${name}`),
                ...(response.movieLibraries || []).map((name) => `Movie: ${name}`),
            ];
            const tpdbLine = response.tpdb?.ok
                ? (response.tpdb.warning
                    ? `ThePosterDB login OK. ${response.tpdb.warning}`
                    : 'ThePosterDB login OK.')
                : response.tpdb?.error
                    ? `ThePosterDB: ${response.tpdb.error}`
                    : '';
            const message = response.ok
                ? [
                    `Connected${response.server ? ` to ${response.server}` : ''}. ${libraries.join(' · ') || 'No matched libraries.'}`,
                    tpdbLine,
                ].filter(Boolean).join(' ')
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

    /** Expand a set inline and load preview without wiping search/browse results. */
    const expandSetInline = async (
        set: PosterSetsSearchSet,
        options?: { skipUrl?: boolean; stayOnTab?: boolean; toggle?: boolean },
    ) => {
        const target = String(set.url || '').trim();
        if (!target) {
            toast('This set is missing a URL.', 'error');
            return;
        }
        const sameKey = selectedSearchSet
            && relatedSetKey(selectedSearchSet) === relatedSetKey(set)
            && (Boolean(preview) || busy === 'preview');
        if (options?.toggle !== false && sameKey) {
            collapseSetInspector({ scrollToSets: false });
            return;
        }

        const restrictTitleCards = isTitleCardSet(set);
        const stayOnTab = Boolean(options?.stayOnTab);
        setShowInspectorAssets(false);
        setSelectedSearchSet(set);
        setUrl(target);
        setTitleCardsOnly(restrictTitleCards);
        titleCardsOnlyRef.current = restrictTitleCards;
        scrollPreviewAfterLoadRef.current = true;

        if (!stayOnTab) {
            setBrowseSeeAllId(null);
            setTab('apply');
        }

        if (!options?.skipUrl && !stayOnTab) {
            pushPosterLocation({
                tab: 'apply',
                rail: null,
                setUrl: target,
                creator: null,
                titleCardsOnly: restrictTitleCards,
            }, 'push');
        } else if (!stayOnTab) {
            syncedSetUrlRef.current = target;
        } else if (tab === 'apply' && !options?.skipUrl) {
            pushPosterLocation({
                tab: 'apply',
                rail: null,
                setUrl: target,
                creator: null,
                titleCardsOnly: restrictTitleCards,
            }, 'push');
        }

        await runPreview(target, {
            scroll: false,
            keepSearch: true,
            titleCardsOnly: restrictTitleCards,
        });
        window.setTimeout(() => {
            previewPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            scrollPreviewAfterLoadRef.current = false;
        }, 200);
    };

    /** Deep links / Recent / Queue reopen — Apply with set expanded (keeps any existing search). */
    const openSetForApply = async (set: PosterSetsSearchSet, options?: { skipUrl?: boolean }) => {
        await expandSetInline(set, { skipUrl: options?.skipUrl, stayOnTab: false, toggle: false });
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
        writePosterSetsUrl(initialUrlState, 'replace');
    }, [initialUrlState]);

    useEffect(() => {
        if (deepLinkHandledRef.current) return;
        deepLinkHandledRef.current = true;
        if (initialLocation.tab !== 'apply') return;
        const target = initialUrlState.setUrl;
        if (target) {
            void openSetForApplyRef.current({
                setId: '',
                title: '',
                url: target,
                setKind: initialUrlState.titleCardsOnly ? 'title_cards' : null,
            }, { skipUrl: true });
            return;
        }
        if (initialUrlState.creator) {
            void openCreatorCatalogRef.current(initialUrlState.creator, { skipUrl: true });
        }
    }, [initialLocation.tab, initialUrlState]);

    useEffect(() => {
        const onPopState = () => {
            const parsed = parsePosterSetsUrl();
            const internalTab = internalTabFromUrl(parsed);
            setTab(internalTab);
            setBrowseSeeAllId(internalTab === 'browse' ? parsed.rail : null);
            const nextTitleCards = Boolean(parsed.titleCardsOnly);

            if (internalTab === 'apply' && parsed.setUrl) {
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

            if (internalTab === 'apply' && parsed.creator) {
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

    const selectedAssetsForIds = (ids: string[]) => {
        if (!ids.length) return undefined;
        const byId = new Map((preview?.assets || []).map((asset) => [asset.id, asset]));
        const assets = ids
            .map((id) => byId.get(id))
            .filter((asset): asset is PosterSetsPreviewAsset => Boolean(asset?.thumbUrl));
        if (!assets.length) return undefined;
        return assets.map((asset) => ({
            id: asset.id,
            kind: asset.kind,
            title: asset.title,
            year: asset.year ?? null,
            season: asset.season ?? null,
            episode: asset.episode ?? null,
            url: asset.thumbUrl,
            thumbUrl: asset.thumbUrl,
            source: asset.source,
            fileType: asset.fileType ?? null,
        }));
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
                undefined,
                selected ? selectedAssetsForIds(selected) : undefined,
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
        setBusy('apply');
        try {
            const target = url.trim();
            const response = await posterSetsApi.apply(
                target,
                ids,
                currentSetMeta(),
                undefined,
                filtersForSelectedIds(ids),
                undefined,
                selectedAssetsForIds(ids),
            );
            setActiveJob(response.job);
            rememberRecentFromContext(jobSetMeta(response.job) || currentSetMeta(), target, {
                mediuxFilters: filtersForSelectedIds(ids),
            });
            await loadQueue();
            collapseSetInspector({ scrollToSets: tab === 'apply' && searchSets.length > 0 });
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
                undefined,
                selectedAssetsForIds(unmatchedIds),
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
                undefined,
                selectedAssetsForIds(newIds),
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
        const rawId = findId.trim();
        const built = buildSetUrl(findProvider, rawId);
        if (!built) {
            toast(findProvider === 'mediux'
                ? 'Enter a MediUX set ID (numbers only).'
                : 'Enter a ThePosterDB set ID, poster ID, or username.', 'error');
            return;
        }
        setSelectedSearchSet({
            setId: rawId,
            title: `Set ${rawId}`,
            url: built,
            provider: findProvider,
        });
        setUrl(built);
        if (andPreview) {
            setShowInspectorAssets(false);
            pushPosterLocation({ tab: 'apply', rail: null, setUrl: built, creator: null, titleCardsOnly: false }, 'push');
            let response = await runPreview(built, { titleCardsOnly: false, keepSearch: true });
            // Numeric TPDb ids are often poster ids (/poster/N), not set ids — retry when /set/N fails.
            if (
                !response
                && findProvider === 'posterdb'
                && /^\d+$/.test(rawId)
            ) {
                const posterUrl = buildSetUrl('posterdb', rawId, 'poster');
                setSelectedSearchSet({
                    setId: rawId,
                    title: `Poster ${rawId}`,
                    url: posterUrl,
                    provider: 'posterdb',
                });
                setUrl(posterUrl);
                pushPosterLocation({ tab: 'apply', rail: null, setUrl: posterUrl, creator: null, titleCardsOnly: false }, 'replace');
                response = await runPreview(posterUrl, { titleCardsOnly: false, keepSearch: true });
            }
        } else toast('Set URL filled — preview or apply when ready.');
    };

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(POSTER_SETS_GRID_STORAGE_KEY, gridSize === 'list' ? 'medium' : gridSize);
    }, [gridSize]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(POSTER_SETS_LIBRARY_DETAIL_LAYOUT_KEY, libraryDetailLayout);
    }, [libraryDetailLayout]);

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
            writePosterSetsUrl(normalizePosterLocation({
                tab: 'apply',
                rail: null,
                setUrl: null,
                creator: handle,
                titleCardsOnly: false,
            }), 'replace');
        }
        requestAnimationFrame(() => {
            searchSetsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        void runCatalogSearch({ mode: 'creator', query: handle, provider: 'both' });
    };
    openCreatorCatalogRef.current = openCreatorCatalog;

    const openLibraryItem = (item: LibraryRecentItem) => {
        setLibraryDetailItem(item);
    };

    const openSearchTitle = async (title: PosterSetsSearchTitle, libraryItem?: LibraryRecentItem) => {
        setBusy('search');
        setSearchSets([]);
        setSearchSetsPage(1);
        setSearchLoadingMore(false);
        setSelectedSearchTitle(title);
        setSelectedSearchSet(null);
        setPreview(null);
        const hasLinkedTmdb = String(title.provider || '').toLowerCase() === 'mediux' && Boolean(title.id);
        const tpdbConfigured = Boolean(configDraft.hasTpdbPassword && String(configDraft.tpdb_username || '').trim());
        const waitForTpdb = hasLinkedTmdb && tpdbConfigured;
        if (waitForTpdb) setSearchLoadingMore(true);
        try {
            const response = await fetchPosterSetsForTitle(title, {
                dupePreference: configDraft.dupePreference === 'mediux' ? 'mediux' : 'posterdb',
                mediaType: libraryItem?.mediaType,
                libraryItem,
                preferredCreators: configDraft.creatorWhitelist,
                tpdbConfigured,
                onPartial: (partial) => {
                    if ((partial.sets?.length || 0) > 0) {
                        setSearchSets(partial.sets || []);
                        setSearchContext(partial.title || title.title);
                        if (waitForTpdb) setSearchLoadingMore(true);
                        setBusy((current) => (current === 'search' ? null : current));
                    }
                },
            });
            setSearchSets(response.sets || []);
            setSearchSetsPage(1);
            setSearchContext(response.title || title.title);
            // Focus on sets: titles list becomes a back action only.
            setSearchTitles([]);
            const dupes = Number(response.dupesCollapsed || 0);
            const setCount = response.sets?.length || 0;
            if (!setCount) {
                toast(`No poster sets found for ${title.title}.`, 'error');
            } else {
                toast(`Sets for ${title.title}${dupes > 0 ? ` · ${dupes} duplicate${dupes === 1 ? '' : 's'} collapsed` : ''}. Expand one to queue.`);
            }
            if (response.partialErrors?.length) {
                const msg = response.partialErrors[0];
                if (!msg.includes('ThePosterDB login not configured')) {
                    toast(msg, 'error');
                }
            }
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to load sets', 'error');
        } finally {
            setBusy((current) => (current === 'search' ? null : current));
            setSearchLoadingMore(false);
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
        const queries = [item.title];

        try {
            const tmdbId = String(item.tmdbId || '').trim();
            if (tmdbId) {
                const directTitle: PosterSetsSearchTitle = {
                    id: tmdbId,
                    title: item.title,
                    year: item.year ?? null,
                    url: item.mediaType === 'show'
                        ? `https://mediux.pro/shows/${tmdbId}`
                        : `https://mediux.pro/movies/${tmdbId}`,
                    mediaType: item.mediaType,
                    provider: 'mediux',
                    thumbUrl: '',
                };
                toast(`Matched ${item.title} via library ID — loading sets…`);
                await openSearchTitle(directTitle, item);
                return;
            }

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
                    mediaType: item.mediaType,
                    titleHint: item.title,
                    yearHint: item.year ?? undefined,
                });
                titles = response.titles || [];
                autoMatch = pickAutoMatchedTitle(item, titles);
                if (autoMatch) break;
            }

            if (autoMatch) {
                const yearLabel = autoMatch.year ? ` (${autoMatch.year})` : '';
                toast(`Auto-matched ${autoMatch.title}${yearLabel} — loading sets…`);
                await openSearchTitle(autoMatch, item);
                return;
            }

            setSearchTitles(rankSearchTitlesForLibraryItem(item, titles));
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
        await expandSetInline(set, { stayOnTab: true, toggle: true });
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
        setShowInspectorAssets(false);
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
    const rankedSearchSets = useMemo(
        () => prioritizeSetsByFollowedCreators(searchSets, configDraft.creatorWhitelist),
        [searchSets, configDraft.creatorWhitelist],
    );
    const pagedSearchSets = useMemo(() => {
        const page = Math.min(Math.max(1, searchSetsPage), searchSetsPageCount);
        const start = (page - 1) * SEARCH_SETS_PAGE_SIZE;
        return rankedSearchSets.slice(start, start + SEARCH_SETS_PAGE_SIZE);
    }, [rankedSearchSets, searchSetsPage, searchSetsPageCount]);

    const searchResultsLoading = busy === 'search';
    const searchHasResults = searchTitles.length > 0 || searchSets.length > 0 || !!preview || !!selectedSearchSet;
    const searchEmptyLabel = selectedSearchTitle?.title || searchContext || searchQuery.trim();
    const showSearchEmpty = !searchResultsLoading
        && !searchLoadingMore
        && !searchHasResults
        && Boolean(searchContext || selectedSearchTitle);

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

    const watchGroups = useMemo(
        () => groupPosterSetsWatchesByCategory(filteredWatches, watchArtKindOverrides),
        [filteredWatches, watchArtKindOverrides],
    );

    const watchGroupsByCategory = useMemo(() => {
        const buckets: Record<RecentSetCategory, typeof watchGroups> = {
            posters: [],
            backgrounds: [],
            title_cards: [],
        };
        for (const group of watchGroups) {
            buckets[group.category].push(group);
        }
        return buckets;
    }, [watchGroups]);

    const categoryFilteredWatchGroups = useMemo(() => (
        watchesCategoryFilter === 'all'
            ? watchGroups
            : watchGroups.filter((group) => group.category === watchesCategoryFilter)
    ), [watchGroups, watchesCategoryFilter]);

    const promoteWatchArtKind = useCallback((watchId: string, kind: RecentSetCategory) => {
        const id = String(watchId || '').trim();
        if (!id) return;
        setWatchArtKindOverrides((prev) => (prev[id] === kind ? prev : { ...prev, [id]: kind }));
        void posterSetsApi.patchWatch(id, { setKind: kind }).catch(() => undefined);
    }, []);

    const watchesPageCount = watchesCategoryFilter === 'all'
        ? 1
        : Math.max(1, Math.ceil(categoryFilteredWatchGroups.length / Math.max(1, watchesPageSize)));
    const pagedWatchGroups = useMemo(() => {
        if (watchesCategoryFilter === 'all') return categoryFilteredWatchGroups;
        const page = Math.min(Math.max(1, watchesPage), watchesPageCount);
        const start = (page - 1) * watchesPageSize;
        return categoryFilteredWatchGroups.slice(start, start + watchesPageSize);
    }, [categoryFilteredWatchGroups, watchesCategoryFilter, watchesPage, watchesPageCount, watchesPageSize]);

    const pagedWatchGroupsByCategory = useMemo(() => {
        const buckets: Record<RecentSetCategory, typeof pagedWatchGroups> = {
            posters: [],
            backgrounds: [],
            title_cards: [],
        };
        for (const group of pagedWatchGroups) {
            buckets[group.category].push(group);
        }
        return buckets;
    }, [pagedWatchGroups]);

    useEffect(() => {
        setWatchesPage((page) => Math.min(page, watchesPageCount));
    }, [watchesPageCount]);

    const readyToApply = Boolean(preview);
    const inspectorOpen = Boolean(
        selectedSearchSet
        || preview
        || (busy === 'preview' && Boolean(String(url || '').trim())),
    );
    const matchedThumbStrip = useMemo(() => {
        let assets = (preview?.assets || []).filter((asset) => asset.matched === true);
        if (titleCardsOnly || isTitleCardSet(selectedSearchSet)) {
            const titleCards = assets.filter((asset) => classifyPreviewAsset(asset) === 'title_card');
            const rest = assets.filter((asset) => classifyPreviewAsset(asset) !== 'title_card');
            assets = titleCardsOnly && titleCards.length ? titleCards : [...titleCards, ...rest];
        }
        return assets.map((asset) => ({
            id: asset.id,
            title: asset.title,
            thumbUrl: asset.thumbUrl ? posterSetsApi.imageUrl(asset.thumbUrl) : '',
        }));
    }, [preview, titleCardsOnly, selectedSearchSet]);

    const queueEntireWithConfirm = async () => {
        const ok = await askConfirm('Queue the entire set, including posters not matched in your libraries?', {
            title: 'Queue full set?',
            confirmLabel: 'Add to queue',
            cancelLabel: 'Cancel',
        });
        if (!ok) return;
        void runApply(false);
    };

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
            entry.detail,
            entry.jobId,
            entry.url,
            formatSetLabel(entry),
        ].join(' ').toLowerCase();
        return haystack.includes(needle);
    });
    return {
        toasts, setToasts, toast,
        tab, setTab,
        libraryDetailItem, setLibraryDetailItem,
        libraryDetailLayout, setLibraryDetailLayout,
        libraryViewMode, setLibraryViewMode,
        busy, setBusy,
        status, setStatus,
        configDraft, setConfigDraft,
        tvText, setTvText,
        movieText, setMovieText,
        whitelistText, setWhitelistText,
        url, setUrl,
        titleCardsOnly, setTitleCardsOnly,
        bulkText, setBulkText,
        findProvider, setFindProvider,
        findId, setFindId,
        searchProvider, setSearchProvider,
        searchMode, setSearchMode,
        searchQuery, setSearchQuery,
        searchTitles, setSearchTitles,
        searchSets, setSearchSets,
        searchSetsPage, setSearchSetsPage,
        searchLoadingMore, setSearchLoadingMore,
        searchContext, setSearchContext,
        creatorSearchAbortRef,
        selectedSearchTitle, setSelectedSearchTitle,
        selectedSearchSet, setSelectedSearchSet,
        advancedOpen, setAdvancedOpen,
        showInspectorAssets, setShowInspectorAssets,
        previewPanelRef,
        searchSetsSectionRef,
        recentTick, setRecentTick,
        gridSize, setGridSize,
        preview, setPreview,
        relatedSets, setRelatedSets,
        relatedSetsLoading, setRelatedSetsLoading,
        relatedSetsAbortRef,
        relatedSetsGenRef,
        browseLoadGenRef,
        queueLoadGenRef,
        watchesLoadGenRef,
        selectedAssetIds, setSelectedAssetIds,
        activeJob, setActiveJob,
        testResult, setTestResult,
        historyJobs, setHistoryJobs,
        historyFilter, setHistoryFilter,
        historySearch, setHistorySearch,
        selectedHistoryJob, setSelectedHistoryJob,
        selectedQueueJob, setSelectedQueueJob,
        auditEntries, setAuditEntries,
        queueJobs, setQueueJobs,
        queuePaused, setQueuePaused,
        queueStats, setQueueStats,
        watches, setWatches,
        watchStatsState, setWatchStatsState,
        watchUrlDraft, setWatchUrlDraft,
        watchesPage, setWatchesPage,
        watchesPageSize, setWatchesPageSize,
        watchesFilter, setWatchesFilter,
        watchesCategoryFilter, setWatchesCategoryFilter,
        selectedBulkSets, setSelectedBulkSets,
        browseRails, setBrowseRails,
        browseRailsRef,
        browseLoading, setBrowseLoading,
        browseSeeAllId, setBrowseSeeAllId,
        libraryShows, setLibraryShows,
        libraryMovies, setLibraryMovies,
        libraryLoading, setLibraryLoading,
        libraryError, setLibraryError,
        librarySearchQuery, setLibrarySearchQuery,
        librarySearchResults, setLibrarySearchResults,
        librarySearching, setLibrarySearching,
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
    };
}
