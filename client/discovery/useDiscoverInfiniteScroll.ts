import { useCallback, useEffect, useRef, useState } from 'react';
import type { UpgraderGridSize } from '../shared/portalLayout';
import { mergeDiscoverResults } from './discoverItemUtils';
import { filterDiscoverBrowseItems } from './discoverAvailability';
import { DISCOVER_LOAD_MORE_TARGET } from './discoverPaginationUtils';

export type DiscoverPagePayload = {
    results: any[];
    totalPages: number;
    lastFetchedPage?: number;
};

type BrowseFilterOptions = {
    hideAvailable?: boolean;
    hideRequested?: boolean;
};

type Options = {
    resetKey: string;
    gridSize: UpgraderGridSize;
    containerRef: React.RefObject<HTMLElement | null>;
    fetchPage: (page: number) => Promise<DiscoverPagePayload>;
    /** Re-applied after live badge enrich so newly-marked available titles drop out. */
    filterOptions?: BrowseFilterOptions;
};

/** First paint: two batches (~60 titles), then +30 on each scroll. */
const INITIAL_BATCH_COUNT = 2;

export function useDiscoverInfiniteScroll({
    resetKey,
    gridSize,
    containerRef,
    fetchPage,
    filterOptions,
}: Options) {
    const filterOptionsRef = useRef(filterOptions);
    filterOptionsRef.current = filterOptions;
    const [results, setResults] = useState<any[]>([]);
    const [loadedPage, setLoadedPage] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const fetchingRef = useRef(false);
    const prefetchingRef = useRef(false);
    const prefetchRef = useRef<{
        fromPage: number;
        mergedBatch: any[];
        lastPage: number;
        totalPages: number;
    } | null>(null);
    const generationRef = useRef(0);

    const hasMore = loadedPage < totalPages;

    const prefetchNextBatch = useCallback(async (fromPage: number, knownTotalPages: number) => {
        if (prefetchingRef.current) return;
        if (fromPage <= 0 || fromPage > knownTotalPages) return;
        const generation = generationRef.current;
        prefetchingRef.current = true;
        try {
            let mergedBatch: any[] = [];
            let lastPage = fromPage - 1;
            let maxTotalPages = Math.max(1, knownTotalPages);

            while (mergedBatch.length < DISCOVER_LOAD_MORE_TARGET && lastPage < maxTotalPages) {
                const nextPage = lastPage + 1;
                const payload = await fetchPage(nextPage);
                if (generation !== generationRef.current) return;
                maxTotalPages = Math.max(1, Number(payload.totalPages) || maxTotalPages);
                const batch = Array.isArray(payload.results) ? payload.results : [];
                const filteredBatch = filterDiscoverBrowseItems(batch, filterOptionsRef.current || {});
                mergedBatch = mergeDiscoverResults(mergedBatch, filteredBatch);
                lastPage = payload.lastFetchedPage ?? nextPage;
                if (lastPage >= maxTotalPages) break;
            }

            if (generation !== generationRef.current) return;
            prefetchRef.current = {
                fromPage,
                mergedBatch,
                lastPage,
                totalPages: maxTotalPages,
            };
        } catch {
            if (generation !== generationRef.current) return;
            prefetchRef.current = null;
        } finally {
            if (generation === generationRef.current) prefetchingRef.current = false;
        }
    }, [fetchPage]);

    useEffect(() => {
        let cancelled = false;
        generationRef.current += 1;
        prefetchRef.current = null;
        prefetchingRef.current = false;

        const runInitialLoad = async () => {
            setLoading(true);
            setResults([]);
            setLoadedPage(0);
            setTotalPages(1);

            fetchingRef.current = false;
            let merged: any[] = [];
            let lastPage = 0;
            let maxTotalPages = 1;

            try {
                // First paint loads multiple 30-title batches; scroll keeps appending more.
                const initialTarget = DISCOVER_LOAD_MORE_TARGET * INITIAL_BATCH_COUNT;
                while (merged.length < initialTarget && lastPage < maxTotalPages) {
                    if (cancelled) return;
                    const pageNumber = lastPage + 1;
                    if (lastPage > 0 && pageNumber > maxTotalPages) break;
                    const payload = await fetchPage(pageNumber);
                    maxTotalPages = Math.max(1, Number(payload.totalPages) || 1);
                    const batch = Array.isArray(payload.results) ? payload.results : [];
                    merged = mergeDiscoverResults(merged, batch);
                    lastPage = payload.lastFetchedPage ?? pageNumber;
                    if (lastPage >= maxTotalPages) break;
                }

                if (!cancelled) {
                    // Server stamps mediaInfo (disk cache + warm catalog). Re-apply hide only —
                    // do not client availability-batch (that made badges pop in after paint).
                    setResults(filterDiscoverBrowseItems(merged, filterOptionsRef.current || {}));
                    setLoadedPage(lastPage);
                    setTotalPages(maxTotalPages);
                    void prefetchNextBatch(lastPage + 1, maxTotalPages);
                }
            } catch (e) {
                console.error(e);
                if (!cancelled) {
                    setResults([]);
                    setLoadedPage(1);
                    setTotalPages(1);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        runInitialLoad();
        return () => {
            cancelled = true;
            fetchingRef.current = false;
            prefetchRef.current = null;
        };
    }, [resetKey, fetchPage, gridSize, containerRef, prefetchNextBatch]);

    const loadNextPage = useCallback(async () => {
        if (fetchingRef.current || loading || loadingMore || !hasMore) return;
        if (loadedPage >= totalPages) return;

        setLoadingMore(true);
        fetchingRef.current = true;
        try {
            const prefetched = prefetchRef.current;
            if (
                prefetched
                && prefetched.fromPage === loadedPage + 1
            ) {
                prefetchRef.current = null;
                setResults((prev) => mergeDiscoverResults(prev, prefetched.mergedBatch));
                setLoadedPage(prefetched.lastPage);
                setTotalPages(prefetched.totalPages);
                void prefetchNextBatch(prefetched.lastPage + 1, prefetched.totalPages);
                return;
            }

            let mergedBatch: any[] = [];
            let lastPage = loadedPage;
            let maxTotalPages = totalPages;

            while (mergedBatch.length < DISCOVER_LOAD_MORE_TARGET && lastPage < maxTotalPages) {
                const nextPage = lastPage + 1;
                const payload = await fetchPage(nextPage);
                maxTotalPages = Math.max(1, Number(payload.totalPages) || maxTotalPages);
                const batch = Array.isArray(payload.results) ? payload.results : [];
                const filteredBatch = filterDiscoverBrowseItems(batch, filterOptionsRef.current || {});
                mergedBatch = mergeDiscoverResults(mergedBatch, filteredBatch);
                lastPage = payload.lastFetchedPage ?? nextPage;
                if (lastPage >= maxTotalPages) break;
            }

            setResults((prev) => mergeDiscoverResults(prev, mergedBatch));
            setLoadedPage(lastPage);
            setTotalPages(maxTotalPages);
            prefetchRef.current = null;
            void prefetchNextBatch(lastPage + 1, maxTotalPages);
        } catch (e) {
            console.error(e);
            setLoadedPage(totalPages);
        } finally {
            fetchingRef.current = false;
            setLoadingMore(false);
        }
    }, [fetchPage, hasMore, loadedPage, loading, loadingMore, prefetchNextBatch, totalPages]);

    useEffect(() => {
        if (loading || loadingMore || !hasMore) return undefined;
        const node = sentinelRef.current;
        if (!node) return undefined;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    loadNextPage();
                }
            },
            { root: null, rootMargin: '600px 0px 400px 0px', threshold: 0.01 },
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, [hasMore, loadNextPage, loading, loadingMore, results.length]);

    return {
        results,
        loading,
        loadingMore,
        hasMore,
        sentinelRef,
    };
}
