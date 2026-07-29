export type PosterSetsConfig = {
    base_url: string;
    token: string;
    bulk_txt: string;
    tv_library: string[];
    movie_library: string[];
    mediux_filters: string[];
    hasToken?: boolean;
    configured?: boolean;
};

export type PosterSetsJobInput = {
    url?: string;
    urls?: string[];
    count?: number;
    fromFile?: boolean;
    file?: string;
    lineCount?: number;
};

export type PosterSetsStatus = {
    ok?: boolean;
    workerReady?: boolean;
    configured?: boolean;
    appDir?: string;
    config?: PosterSetsConfig;
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
    }>;
};

export type PosterSetsPreview = {
    ok?: boolean;
    url?: string;
    movies?: number;
    shows?: number;
    collections?: number;
    total?: number;
    samples?: {
        movies?: string[];
        shows?: string[];
        collections?: string[];
    };
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
};
