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
    notifyOnWatcherDigest?: boolean;
    /** Debounced watch check when Sonarr On Import fires (Scanner webhook). */
    arrWatchHookEnabled?: boolean;
    /** Creator usernames shown on Browse → Following (MediUX / ThePosterDB). */
    creatorWhitelist?: string[];
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
    tmdbId?: string | null;
    tvdbId?: string | null;
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
    tmdbId?: string | null;
    tvdbId?: string | null;
    mediaType?: 'movie' | 'show' | string | null;
    thumbUrl?: string;
    assetCount?: number | null;
    /** Dominant art type when known (title_cards, backgrounds, posters). */
    setKind?: string | null;
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
    source?: 'manual' | 'watch' | 'bulk' | string;
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
    /** MediUX filter id when known (title_card, background, season_cover, show_cover). */
    fileType?: string | null;
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
    /** MediUX card kind when known (boxset, title_cards). */
    setKind?: string | null;
    alsoOn?: Array<{
        provider: string;
        setId: string;
        url: string;
        title?: string;
        user?: string | null;
        thumbUrl?: string;
        setKind?: string | null;
    }>;
};

export type PosterSetsBrowseRail = {
    id: string;
    title: string;
    provider?: string;
    kind?: string;
    sets: PosterSetsSearchSet[];
    buffered?: number;
    cap?: number;
    loading?: boolean;
    hasMore?: boolean;
    error?: string | null;
};

export type PosterSetsBrowseResponse = {
    ok?: boolean;
    rails?: PosterSetsBrowseRail[];
    cap?: number;
    error?: string;
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

export type PosterSetsAuditEntry = {
    id: string;
    at?: string;
    action?: string;
    source?: 'manual' | 'watch' | 'bulk' | string;
    url?: string | null;
    title?: string | null;
    user?: string | null;
    watchId?: string | null;
    jobId?: string | null;
    uploaded?: number | null;
    attempted?: number | null;
    selectedCount?: number | null;
    state?: string | null;
    error?: string | null;
};

export const MEDIUX_FILTER_OPTIONS = [
    { id: 'show_cover', label: 'Show cover' },
    { id: 'season_cover', label: 'Season cover' },
    { id: 'background', label: 'Background' },
    { id: 'title_card', label: 'Title card' },
] as const;

const MEDIUX_FILTER_IDS = new Set(MEDIUX_FILTER_OPTIONS.map((option) => option.id));

/** Infer watch/apply mediux filter ids from the assets the user actually selected. */
export const mediuxFiltersFromAssets = (assets: Array<Partial<PosterSetsPreviewAsset> | null | undefined>) => {
    const filters = new Set<string>();
    for (const asset of assets) {
        if (!asset) continue;
        const explicit = String(asset.fileType || '').trim();
        if (MEDIUX_FILTER_IDS.has(explicit as typeof MEDIUX_FILTER_OPTIONS[number]['id'])) {
            filters.add(explicit);
            continue;
        }
        if (asset.kind !== 'show') continue;
        const season = asset.season;
        const episode = asset.episode;
        if (season === 'Cover') filters.add('show_cover');
        else if (season === 'Backdrop') filters.add('background');
        else if (episode === 'Cover' || episode == null || episode === '') filters.add('season_cover');
        else filters.add('title_card');
    }
    return MEDIUX_FILTER_OPTIONS.map((option) => option.id).filter((id) => filters.has(id));
};

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
    notifyOnWatcherDigest: true,
    arrWatchHookEnabled: true,
    creatorWhitelist: [],
};
