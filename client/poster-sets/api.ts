import { apiFetch, PORTAL_CSRF_HEADER, PORTAL_CSRF_VALUE, portalRequestHeaders } from '../shared/api';
import { portalUrl } from '../shared/basePath';
import type {
    PosterSetsAuditEntry,
    PosterSetsBrowseResponse,
    PosterSetsConfig,
    PosterSetsJob,
    PosterSetsPreview,
    PosterSetsQueueResponse,
    PosterSetsQueueStats,
    PosterSetsSearchResult,
    PosterSetsSetMeta,
    PosterSetsStatus,
    PosterSetsTitleStatus,
    PosterSetsWatch,
    PosterSetsWatchStats,
} from './types';

const ROOT = '/api/poster-sets';

const json = (body: unknown) => ({
    method: 'POST' as const,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});

export type PosterSetsSearchPayload = {
    provider: 'mediux' | 'posterdb' | 'both';
    query?: string;
    titleUrl?: string;
    tmdbId?: string | number;
    imdbId?: string | number;
    titleHint?: string;
    yearHint?: number | null;
    mediaType?: string;
    mode?: 'title' | 'creator';
    titleSources?: Array<{
        provider: string;
        id?: string;
        url?: string;
        mediaType?: string | null;
        tmdbId?: string | number;
    }>;
    title?: string;
    dupePreference?: 'posterdb' | 'mediux';
    limit?: number;
    batchPages?: number;
};

const readNdjsonStream = async (
    response: Response,
    onEvent: (event: PosterSetsSearchResult & { type?: string }) => void,
    signal?: AbortSignal,
) => {
    if (!response.body) {
        throw new Error('Streaming search is not supported in this browser.');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
        while (true) {
            if (signal?.aborted) {
                await reader.cancel().catch(() => undefined);
                throw new DOMException('Aborted', 'AbortError');
            }
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                onEvent(JSON.parse(trimmed) as PosterSetsSearchResult & { type?: string });
            }
        }
        if (buffer.trim()) {
            onEvent(JSON.parse(buffer.trim()) as PosterSetsSearchResult & { type?: string });
        }
    } finally {
        reader.releaseLock();
    }
};

export const posterSetsApi = {
    status: () => apiFetch(`${ROOT}/status`) as Promise<PosterSetsStatus>,
    getConfig: () => apiFetch(`${ROOT}/config`) as Promise<{ config: PosterSetsConfig }>,
    saveConfig: (config: Partial<PosterSetsConfig>) => apiFetch(`${ROOT}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
    }) as Promise<{ ok: boolean; config: PosterSetsConfig }>,
    importPortal: () => apiFetch(`${ROOT}/import-portal`, json({})) as Promise<{
        ok: boolean;
        config: PosterSetsConfig;
        imported?: {
            base_url?: string;
            tv_library?: string[];
            movie_library?: string[];
            librarySource?: string;
        };
        error?: string;
    }>,
    test: (config?: Partial<PosterSetsConfig>) => apiFetch(`${ROOT}/test`, json(config || {})) as Promise<{
        ok: boolean;
        server?: string;
        tvLibraries?: string[];
        movieLibraries?: string[];
        sections?: Array<{ title?: string; type?: string }>;
        logs?: string[];
        error?: string;
    }>,
    preview: (url: string, options?: { mediuxFilters?: string[] }) => apiFetch(`${ROOT}/preview`, json({
        url,
        ...(options?.mediuxFilters?.length ? { mediuxFilters: options.mediuxFilters } : {}),
    })) as Promise<PosterSetsPreview>,
    search: (payload: PosterSetsSearchPayload) => (
        apiFetch(`${ROOT}/search`, json(payload)) as Promise<PosterSetsSearchResult>
    ),
    browse: (options?: { refresh?: boolean }) => (
        apiFetch(`${ROOT}/browse`, json({ refresh: Boolean(options?.refresh) })) as Promise<PosterSetsBrowseResponse>
    ),
    /**
     * Creator search streams NDJSON batches (first ~3 source pages, then more).
     * `onBatch` is called with the full merged set list so far.
     */
    searchCreatorStream: async (
        payload: PosterSetsSearchPayload,
        {
            onBatch,
            signal,
        }: {
            onBatch: (event: PosterSetsSearchResult & { type?: string }) => void;
            signal?: AbortSignal;
        },
    ) => {
        const response = await fetch(portalUrl(`${ROOT}/search`), {
            method: 'POST',
            credentials: 'same-origin',
            signal,
            headers: portalRequestHeaders({
                Accept: 'application/x-ndjson, application/json',
                [PORTAL_CSRF_HEADER]: PORTAL_CSRF_VALUE,
            }),
            body: JSON.stringify({
                ...payload,
                mode: 'creator',
                batchPages: payload.batchPages ?? 3,
            }),
        });

        const contentType = String(response.headers.get('content-type') || '').toLowerCase();
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Search failed' }));
            throw new Error(errorData.error || `Search failed with status ${response.status}`);
        }

        if (!contentType.includes('ndjson')) {
            const data = await response.json() as PosterSetsSearchResult;
            onBatch({ ...data, type: 'result', loading: false });
            return data;
        }

        let finalEvent: PosterSetsSearchResult | null = null;
        await readNdjsonStream(response, (event) => {
            if (event.type === 'error' || event.ok === false) {
                throw new Error(event.error || 'Creator search failed');
            }
            onBatch(event);
            if (event.type === 'result' || event.loading === false) {
                finalEvent = event;
            }
        }, signal);
        return finalEvent;
    },
    apply: (
        url: string,
        selectedIds?: string[],
        setMeta?: PosterSetsSetMeta | null,
        source?: 'manual' | 'bulk' | 'watch',
        mediuxFilters?: string[],
        plexHint?: { ratingKey?: string; title?: string; mediaType?: string } | null,
    ) => (
        apiFetch(`${ROOT}/apply`, json({
            url,
            ...(selectedIds?.length ? { selectedIds } : {}),
            ...(setMeta ? { setMeta } : {}),
            ...(source ? { source } : {}),
            ...(mediuxFilters?.length ? { mediuxFilters } : {}),
            ...(plexHint ? { plexHint } : {}),
        })) as Promise<{ ok: boolean; jobId: string; job: PosterSetsJob; queued?: boolean }>
    ),
    imageUrl: (thumbUrl: string) => `${ROOT}/image?url=${encodeURIComponent(thumbUrl)}`,
    bulk: (payload: { urls?: string[]; text?: string; fromFile?: boolean }) => (
        apiFetch(`${ROOT}/bulk`, json(payload)) as Promise<{ ok: boolean; jobId: string; job: PosterSetsJob; queued?: boolean }>
    ),
    job: (id: string) => apiFetch(`${ROOT}/jobs/${encodeURIComponent(id)}`) as Promise<{ job: PosterSetsJob }>,
    jobs: () => apiFetch(`${ROOT}/jobs`) as Promise<{ ok?: boolean; jobs: PosterSetsJob[] }>,
    queue: () => apiFetch(`${ROOT}/queue`) as Promise<PosterSetsQueueResponse>,
    pauseQueue: (paused: boolean) => apiFetch(`${ROOT}/queue/pause`, json({ paused })) as Promise<{
        ok: boolean;
        paused: boolean;
        stats: PosterSetsQueueStats;
    }>,
    cancelQueueJob: (id: string) => apiFetch(`${ROOT}/queue/cancel/${encodeURIComponent(id)}`, json({})) as Promise<{
        ok: boolean;
        job: PosterSetsJob;
    }>,
    clearFinishedQueue: () => apiFetch(`${ROOT}/queue/clear-finished`, json({})) as Promise<{
        ok: boolean;
        stats: PosterSetsQueueStats;
        jobs: PosterSetsJob[];
    }>,
    watches: () => apiFetch(`${ROOT}/watches`) as Promise<{
        ok?: boolean;
        watches: PosterSetsWatch[];
        stats?: PosterSetsWatchStats;
    }>,
    watchByUrl: (url: string) => apiFetch(`${ROOT}/watches?url=${encodeURIComponent(url)}`) as Promise<{
        ok?: boolean;
        watch: PosterSetsWatch | null;
        watches?: PosterSetsWatch[];
        stats?: PosterSetsWatchStats;
    }>,
    addWatch: (payload: {
        url: string;
        title?: string;
        user?: string;
        thumbUrl?: string;
        provider?: string;
        setId?: string;
        mediuxFilters?: string[];
    }) => (
        apiFetch(`${ROOT}/watches`, json(payload)) as Promise<{ ok: boolean; watch: PosterSetsWatch }>
    ),
    patchWatch: (id: string, patch: {
        mediuxFilters?: string[];
        enabled?: boolean;
        title?: string;
        user?: string;
        thumbUrl?: string;
    }) => apiFetch(`${ROOT}/watches/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
    }) as Promise<{ ok: boolean; watch: PosterSetsWatch }>,
    toggleWatch: (id: string, enabled?: boolean) => apiFetch(`${ROOT}/watches/${encodeURIComponent(id)}/toggle`, json(
        enabled === undefined ? {} : { enabled },
    )) as Promise<{ ok: boolean; watch: PosterSetsWatch }>,
    checkWatch: (id: string, enqueue = true) => apiFetch(`${ROOT}/watches/${encodeURIComponent(id)}/check`, json({ enqueue })) as Promise<{
        ok: boolean;
        watch?: PosterSetsWatch;
        newIds?: string[];
        queued?: boolean;
        baseline?: boolean;
    }>,
    runWatches: () => apiFetch(`${ROOT}/watches/run`, json({})) as Promise<{
        ok: boolean;
        checked?: number;
        queued?: number;
        assetsQueued?: number;
        errors?: Array<{ id: string; error: string }>;
    }>,
    deleteWatch: (id: string) => apiFetch(`${ROOT}/watches/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
    }) as Promise<{ ok: boolean; watch: PosterSetsWatch }>,
    audit: (limit = 100) => apiFetch(`${ROOT}/audit?limit=${encodeURIComponent(String(limit))}`) as Promise<{
        ok?: boolean;
        entries: PosterSetsAuditEntry[];
    }>,
    libraryRecent: (limit = 120, options?: { refresh?: boolean }) => apiFetch(
        `/api/media-server/library/recent?limit=${encodeURIComponent(String(limit))}${options?.refresh ? '&refresh=1' : ''}`,
    ) as Promise<{
        serverType?: string;
        movies?: Array<Record<string, unknown>>;
        shows?: Array<Record<string, unknown>>;
        items?: Array<Record<string, unknown>>;
    }>,
    librarySearch: (query: string, limit = 40, options?: { refresh?: boolean }) => apiFetch(
        `/api/media-server/library/search?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(String(limit))}${options?.refresh ? '&refresh=1' : ''}`,
    ) as Promise<{
        serverType?: string;
        results?: Array<Record<string, unknown>>;
    }>,
    librarySections: (options?: { refresh?: boolean }) => apiFetch(
        `/api/media-server/library/sections${options?.refresh ? '?refresh=1' : ''}`,
    ) as Promise<{ serverType?: string; sections?: Array<{ key: string; title: string; type: string; count?: number }> }>,
    libraryBrowse: (options: {
        section?: string;
        type?: 'movie' | 'show' | '';
        sort?: string;
        start?: number;
        limit?: number;
        refresh?: boolean;
    } = {}) => {
        const params = new URLSearchParams();
        if (options.section) params.set('section', options.section);
        if (options.type) params.set('type', options.type);
        if (options.sort) params.set('sort', options.sort);
        if (options.start != null) params.set('start', String(options.start));
        if (options.limit != null) params.set('limit', String(options.limit));
        if (options.refresh) params.set('refresh', '1');
        const qs = params.toString();
        return apiFetch(`/api/media-server/library/browse${qs ? `?${qs}` : ''}`) as Promise<{
            serverType?: string;
            items?: Array<Record<string, unknown>>;
            total?: number;
            sort?: string;
        }>;
    },
    titleStatus: (payload: { title: string; mediaType?: string; ratingKey?: string }) => {
        const params = new URLSearchParams({ title: payload.title });
        if (payload.mediaType) params.set('mediaType', payload.mediaType);
        if (payload.ratingKey) params.set('ratingKey', payload.ratingKey);
        return apiFetch(`${ROOT}/title-status?${params.toString()}`) as Promise<PosterSetsTitleStatus & { ok?: boolean }>;
    },
    titleWatch: (payload: {
        title: string;
        mediaType?: string;
        ratingKey?: string;
        setUrl?: string;
        enabled?: boolean;
        setMeta?: PosterSetsSetMeta | null;
    }) => apiFetch(`${ROOT}/title-watch`, json(payload)) as Promise<{
        ok: boolean;
        enabled: boolean;
        watch?: PosterSetsWatch | null;
        titleWatch?: PosterSetsTitleStatus['titleWatch'];
    }>,
    resetArt: (payload: {
        ratingKey: string;
        mediaType: 'movie' | 'show';
        scope?: 'poster' | 'seasons' | 'episodes' | 'all' | 'art';
    }) => apiFetch(`${ROOT}/reset-art`, json(payload)) as Promise<{ ok?: boolean; cleared?: number }>,
};
