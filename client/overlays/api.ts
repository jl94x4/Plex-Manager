const ROOT = '/api/overlays';

const apiFetch = async (url: string, init?: RequestInit) => {
    const response = await fetch(url, {
        credentials: 'include',
        ...init,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.error || `Request failed (${response.status})`);
    }
    return data;
};

const json = (body: unknown) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
});

export type OverlayPlacementKind = {
    x: number;
    y: number;
    width: number;
    anchorX?: 'left' | 'center' | 'right';
    anchorY?: 'top' | 'center' | 'bottom';
    bottomClip?: number;
    maxHeight?: number;
};

export type OverlaysPlacement = {
    show: OverlayPlacementKind;
    season: OverlayPlacementKind;
    episode: OverlayPlacementKind;
    media?: OverlayPlacementKind;
    status?: OverlayPlacementKind;
    ratings?: OverlayPlacementKind;
    network?: OverlayPlacementKind;
    recently?: OverlayPlacementKind;
};

export type OverlayPlacement = OverlaysPlacement;

export const DEFAULT_OVERLAY_PLACEMENT: OverlaysPlacement = {
    show: {
        x: 0.5,
        y: 1.0,
        width: 0.92,
        anchorX: 'center',
        anchorY: 'bottom',
        bottomClip: 0.10,
    },
    season: {
        x: 0.5,
        y: 1.0,
        width: 0.70,
        maxHeight: 0.14,
        anchorX: 'center',
        anchorY: 'bottom',
        bottomClip: 0.10,
    },
    episode: {
        x: 0.5,
        y: 1.0,
        width: 0.50,
        maxHeight: 0.18,
        anchorX: 'center',
        anchorY: 'bottom',
        bottomClip: 0.10,
    },
    media: {
        x: 0.015,
        y: 0.01,
        width: 0.305,
        maxHeight: 0.18,
        anchorX: 'left',
        anchorY: 'top',
        bottomClip: 0,
    },
    status: {
        x: 0.015,
        y: 0.22,
        width: 0.305,
        maxHeight: 0.09,
        anchorX: 'left',
        anchorY: 'top',
        bottomClip: 0,
    },
    ratings: {
        x: 0.985,
        y: 0.5,
        width: 0.16,
        maxHeight: 0.14,
        anchorX: 'right',
        anchorY: 'center',
        bottomClip: 0,
    },
    network: {
        x: 0.015,
        y: 0.66,
        width: 0.305,
        maxHeight: 0.09,
        anchorX: 'left',
        anchorY: 'bottom',
        bottomClip: 0,
    },
    recently: {
        x: 0.5,
        y: 1.0,
        width: 0.72,
        anchorX: 'center',
        anchorY: 'bottom',
        bottomClip: 0.10,
    },
};

export type MediaInfoParts = {
    res4k?: boolean;
    res1080p?: boolean;
    res720p?: boolean;
    resOther?: boolean;
    hdr?: boolean;
    dolbyVision?: boolean;
    atmos?: boolean;
};

export type OverlaysConfig = {
    enabled?: boolean;
    previewMode?: boolean;
    newSeasonEnabled?: boolean;
    newSeasonDays?: number;
    newSeasonWatchNowStyle?: boolean;
    newEpisodeEnabled?: boolean;
    newEpisodeDays?: number;
    newEpisodeWatchNowStyle?: boolean;
    skipNewEpisodeOnBinge?: boolean;
    recentlyAddedEnabled?: boolean;
    recentlyAddedDays?: number;
    recentlyAddedPresetId?: string;
    liveScheduleEnabled?: boolean;
    liveScheduleDays?: number;
    top10Enabled?: boolean;
    top10Count?: number;
    tmdbAirDateFallback?: boolean;
    mediaInfoEnabled?: boolean;
    mediaInfoParts?: MediaInfoParts;
    mediaInfoIncludeMovies?: boolean;
    mediaInfoIncludeShows?: boolean;
    mediaInfoLibrarySectionIds?: string[];
    mediaInfoAllowKeys?: string[];
    mediaInfoDenyKeys?: string[];
    editionOverlayEnabled?: boolean;
    audioCodecEnabled?: boolean;
    audioCodecStyle?: 'compact' | 'standard';
    videoFormatEnabled?: boolean;
    kometaAddOverlayLabel?: boolean;
    aspectOverlayEnabled?: boolean;
    versionsOverlayEnabled?: boolean;
    languageCountEnabled?: boolean;
    languagesOverlayEnabled?: boolean;
    languagesAllowCodes?: string[];
    kometaFlagStyle?: 'round' | 'square';
    runtimesOverlayEnabled?: boolean;
    directPlayOverlayEnabled?: boolean;
    episodeInfoOverlayEnabled?: boolean;
    contentRatingEnabled?: boolean;
    contentRatingScheme?: 'us' | 'uk' | 'de' | 'au' | 'nz' | 'commonsense';
    ribbonOverlayEnabled?: boolean;
    ribbonStyle?: 'yellow' | 'red' | 'black' | 'gray';
    ribbonIncludeMovies?: boolean;
    ribbonIncludeShows?: boolean;
    ribbonLibrarySectionIds?: string[];
    ribbonAllowKeys?: string[];
    ribbonDenyKeys?: string[];
    mediastingerOverlayEnabled?: boolean;
    ratingsSource?: string;
    statusOverlayEnabled?: boolean;
    statusAiringDays?: number;
    statusLibrarySectionIds?: string[];
    statusAllowKeys?: string[];
    statusDenyKeys?: string[];
    ratingsOverlayEnabled?: boolean;
    ratingsMinimum?: number;
    ratingsIncludeMovies?: boolean;
    ratingsIncludeShows?: boolean;
    ratingsLibrarySectionIds?: string[];
    ratingsAllowKeys?: string[];
    ratingsDenyKeys?: string[];
    networkOverlayEnabled?: boolean;
    networkLibrarySectionIds?: string[];
    networkAllowKeys?: string[];
    networkDenyKeys?: string[];
    streamingOverlayEnabled?: boolean;
    streamingRegion?: string;
    streamingIncludeMovies?: boolean;
    streamingIncludeShows?: boolean;
    streamingLibrarySectionIds?: string[];
    streamingAllowKeys?: string[];
    streamingDenyKeys?: string[];
    /** Banners (core) run — New Season / Episode / Live / Top 10. Empty = fallback. */
    coreLibrarySectionIds?: string[];
    /** Recently Added run. Empty = fallback. */
    recentlyAddedLibrarySectionIds?: string[];
    /** Media / Kometa run default (family-specific lists still override). Empty = fallback. */
    kometaLibrarySectionIds?: string[];
    /** Advanced fallback when a per-run list is empty. Empty = all libraries. */
    librarySectionIds?: string[];
    overlayPresetId?: string;
    episodeOverlayPresetId?: string;
    placement?: OverlaysPlacement;
    scheduleHours?: number;
    recentlyAddedScheduleHours?: number;
    kometaScheduleHours?: number;
    skipIfKometaOverlayLabel?: boolean;
    plexSource?: string;
    lastRunAt?: string | null;
    recentlyAddedLastRunAt?: string | null;
    kometaLastRunAt?: string | null;
    lastRunSummary?: Record<string, unknown> | null;
};

export type OverlayPreset = {
    id: string;
    file?: string;
    source?: 'bundled' | 'custom';
    kind?: 'season' | 'episode';
};

export const overlaysApi = {
    status: () => apiFetch(`${ROOT}/status`),
    getConfig: () => apiFetch(`${ROOT}/config`) as Promise<{ config: OverlaysConfig }>,
    saveConfig: (config: Partial<OverlaysConfig>) => apiFetch(`${ROOT}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
    }) as Promise<{ ok: boolean; config: OverlaysConfig }>,
    shows: () => apiFetch(`${ROOT}/shows`),
    episodes: () => apiFetch(`${ROOT}/episodes`),
    kometa: () => apiFetch(`${ROOT}/kometa`) as Promise<{
        ok: boolean;
        items: Array<{
            ratingKey: string;
            title: string;
            library?: string;
            itemType?: string;
            timestamp?: string | null;
            previewOnly?: boolean;
            families?: Record<string, { name?: string; weight?: number }>;
            hasBackup?: boolean;
        }>;
        total: number;
    }>,
    revertKometa: (ratingKey?: string) => apiFetch(`${ROOT}/revert-kometa`, json(ratingKey ? { ratingKey } : {})),
    presets: () => apiFetch(`${ROOT}/presets`) as Promise<{ presets: OverlayPreset[] }>,
    uploadPreset: async (kind: 'season' | 'episode', file: File) => {
        const buf = await file.arrayBuffer();
        const response = await fetch(
            `${ROOT}/presets/upload?kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(file.name || 'banner')}`,
            {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': file.type || 'application/octet-stream',
                    'X-Overlay-Kind': kind,
                    'X-Overlay-Name': file.name || 'banner',
                },
                body: buf,
            },
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || `Upload failed (${response.status})`);
        return data;
    },
    deleteCustomPreset: (id: string) => apiFetch(`${ROOT}/presets/custom/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    sections: () => apiFetch(`${ROOT}/sections`),
    scan: () => apiFetch(`${ROOT}/scan`, json({})),
    reconcile: () => apiFetch(`${ROOT}/reconcile`, json({})),
    run: (options?: { preview?: boolean; bundle?: 'core' | 'recently' | 'kometa' | 'all' }) =>
        apiFetch(`${ROOT}/run`, json(options || {})),
    preview: (options?: { bundle?: 'core' | 'recently' | 'kometa' | 'all' }) =>
        apiFetch(`${ROOT}/preview`, json(options || {})),
    promote: () => apiFetch(`${ROOT}/promote`, json({})),
    stop: () => apiFetch(`${ROOT}/stop`, json({})),
    importLog: (log: Record<string, unknown>, mode: 'merge' | 'replace' = 'merge') => (
        apiFetch(`${ROOT}/import-log`, json({ mode, log }))
    ),
    resetOne: (ratingKey: string, kind?: 'show' | 'episode' | 'seasonEpisode' | 'recently' | 'live' | 'top10') => (
        apiFetch(`${ROOT}/reset-one`, json({ ratingKey, kind }))
    ),
    resetAll: (scope: 'all' | 'shows' | 'episodes' = 'all') => apiFetch(`${ROOT}/reset-all`, json({ scope })),
    resetBingeGroup: (ratingKeys: string[]) => apiFetch(`${ROOT}/reset-binge-group`, json({ ratingKeys })),
    previewGallery: () => apiFetch(`${ROOT}/preview-gallery`) as Promise<{ items: Array<{
        name: string;
        kind: string;
        rel: string;
        mtime: number;
        url: string;
    }> }>,
    sampleMeta: () => apiFetch(`${ROOT}/sample/meta`) as Promise<{
        ok: boolean;
        exists: boolean;
        showTitle?: string | null;
        episodeTitle?: string | null;
        showTitleForEp?: string | null;
        generatedAt?: string | null;
        presetId?: string | null;
        showRatingKey?: string | null;
    }>,
    sampleGenerate: (opts?: { showRatingKey?: string; episodeRatingKey?: string }) => (
        apiFetch(`${ROOT}/sample`, json(opts || {})) as Promise<{
            ok: boolean;
            show?: { title?: string; source?: string; ratingKey?: string };
            episode?: { title?: string; showTitle?: string; source?: string };
            generatedAt?: string;
            presetId?: string;
            meta?: Record<string, unknown>;
        }>
    ),
    sampleCandidates: (q = '') => apiFetch(`${ROOT}/sample-candidates?q=${encodeURIComponent(q)}`) as Promise<{
        shows: Array<{ ratingKey: string; title: string; library?: string }>;
    }>,
    sampleImageUrl: (kind: 'show' | 'episode' | 'season' | 'show-base' | 'episode-base', bust?: string | number) => (
        `${ROOT}/sample/${kind}?t=${encodeURIComponent(String(bust || Date.now()))}`
    ),
    presetFileUrl: (id: string, kind: 'season' | 'episode' = 'season', bust?: string | number) => (
        `${ROOT}/preset-file?id=${encodeURIComponent(id)}&kind=${kind}&t=${encodeURIComponent(String(bust || Date.now()))}`
    ),
};
