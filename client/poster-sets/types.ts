export type PosterSetsConfig = {
    base_url: string;
    token: string;
    bulk_txt: string;
    tv_library: string[];
    movie_library: string[];
    mediux_filters: string[];
    /** Clear Kometa Overlay label after upload (default true). */
    reset_overlay?: boolean;
    /** Prefer this provider when MediUX and ThePosterDB both return the same set/title. */
    dupePreference?: 'posterdb' | 'mediux';
    watchersEnabled?: boolean;
    watchIntervalHours?: number;
    autoWatchOnApply?: boolean;
    hasToken?: boolean;
    configured?: boolean;
};

export type PosterSetsWatch = {
    id: string;
    enabled?: boolean;
    provider?: string;
    url: string;
    setId?: string | null;
    title?: string | null;
    user?: string | null;
    thumbUrl?: string;
    mediuxFilters?: string[];
    knownAssetIds?: string[];
    lastCheckedAt?: string | null;
    lastAppliedAt?: string | null;
    lastError?: string | null;
    lastNewCount?: number;
    createdAt?: string | null;
    updatedAt?: string | null;
};

export type PosterSetsWatchStats = {
    total?: number;
    enabled?: number;
    errored?: number;
};

export type PosterSetsSetMeta = {
    provider?: string | null;
    setId?: string | null;
    url?: string | null;
    title?: string | null;
    user?: string | null;
    thumbUrl?: string;
    assetCount?: number | null;
};

export type PosterSetsJobInput = {
    url?: string;
    urls?: string[];
    text?: string;
    count?: number;
    fromFile?: boolean;
    file?: string;
    lineCount?: number;
    selectedCount?: number;
    selectedIds?: string[] | null;
    setMeta?: PosterSetsSetMeta | null;
    watchId?: string | null;
    mediuxFilters?: string[];
};

export type PosterSetsQueueStats = {
    paused?: boolean;
    queued?: number;
    running?: number;
    succeeded?: number;
    failed?: number;
    cancelled?: number;
    pending?: number;
};

export type PosterSetsQueueResponse = {
    ok?: boolean;
    paused: boolean;
    stats: PosterSetsQueueStats;
    jobs: PosterSetsJob[];
};

export type PosterSetsStatus = {
    ok?: boolean;
    workerReady?: boolean;
    configured?: boolean;
    appDir?: string;
    config?: PosterSetsConfig;
    queue?: PosterSetsQueueStats;
    watches?: PosterSetsWatchStats;
    recentJobs?: Array<{
        id: string;
        type?: string;
        state?: string;
        createdAt?: string;
        finishedAt?: string | null;
        error?: string | null;
        uploaded?: number | null;
        attempted?: number | null;
        input?: PosterSetsJobInput | null;
        setMeta?: PosterSetsSetMeta | null;
    }>;
};

export type PosterSetsPreviewAsset = {
    id: string;
    kind: 'movie' | 'show' | 'collection';
    title: string;
    year?: number | null;
    season?: string | number | null;
    episode?: string | number | null;
    label: string;
    thumbUrl: string;
    matched: boolean;
    matchDetail?: string;
    source?: string;
};

export type PosterSetsPreview = {
    ok?: boolean;
    url?: string;
    movies?: number;
    shows?: number;
    collections?: number;
    total?: number;
    matched?: number;
    unmatched?: number;
    samples?: {
        movies?: string[];
        shows?: string[];
        collections?: string[];
    };
    assets?: PosterSetsPreviewAsset[];
    setMeta?: PosterSetsSetMeta | null;
    logs?: string[];
    error?: string;
};

export type PosterSetsJob = {
    id: string;
    type?: string;
    state?: string;
    createdAt?: string;
    finishedAt?: string | null;
    logs?: Array<{ at?: string; message?: string } | string>;
    result?: Record<string, unknown> | null;
    error?: string | null;
    input?: PosterSetsJobInput | null;
    uploaded?: number | null;
    attempted?: number | null;
    logCount?: number;
    setMeta?: PosterSetsSetMeta | null;
};

export type PosterSetsSearchTitle = {
    id: string;
    title: string;
    year?: number | null;
    url: string;
    mediaType?: string | null;
    thumbUrl?: string;
    provider?: string;
    sources?: Array<{
        provider: string;
        id: string;
        url: string;
        mediaType?: string | null;
        year?: number | null;
        thumbUrl?: string;
    }>;
    alsoOn?: Array<{
        provider: string;
        id: string;
        url: string;
        mediaType?: string | null;
        year?: number | null;
        thumbUrl?: string;
    }>;
};

export type PosterSetsSearchSet = {
    setId: string;
    title: string;
    url: string;
    thumbUrl?: string;
    user?: string | null;
    posterCount?: number | null;
    provider?: string;
    alsoOn?: Array<{
        provider: string;
        setId: string;
        url: string;
        title?: string;
        user?: string | null;
        thumbUrl?: string;
    }>;
};

export type PosterSetsSearchResult = {
    ok?: boolean;
    provider?: string;
    phase?: 'titles' | 'sets' | string;
    mode?: string;
    query?: string;
    title?: string | null;
    titleUrl?: string;
    titles?: PosterSetsSearchTitle[];
    sets?: PosterSetsSearchSet[];
    dupesCollapsed?: number;
    dupePreference?: string;
    partialErrors?: string[];
    loading?: boolean;
    error?: string;
    code?: string;
};

export const MEDIUX_FILTER_OPTIONS = [
    { id: 'show_cover', label: 'Show cover' },
    { id: 'season_cover', label: 'Season cover' },
    { id: 'background', label: 'Background' },
    { id: 'title_card', label: 'Title card' },
] as const;

export const DEFAULT_POSTER_SETS_CONFIG: PosterSetsConfig = {
    base_url: '',
    token: '',
    bulk_txt: 'bulk_import.txt',
    tv_library: ['TV Shows'],
    movie_library: ['Movies'],
    mediux_filters: ['title_card', 'background', 'season_cover', 'show_cover'],
    reset_overlay: true,
    dupePreference: 'posterdb',
    watchersEnabled: true,
    watchIntervalHours: 6,
    autoWatchOnApply: true,
};
