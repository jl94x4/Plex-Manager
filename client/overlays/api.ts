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
        width: 0.55,
        maxHeight: 0.20,
        anchorX: 'center',
        anchorY: 'bottom',
        bottomClip: 0.10,
    },
};

export type OverlaysConfig = {
    enabled?: boolean;
    previewMode?: boolean;
    newSeasonDays?: number;
    newEpisodeEnabled?: boolean;
    newEpisodeDays?: number;
    skipNewEpisodeOnBinge?: boolean;
    librarySectionIds?: string[];
    overlayPresetId?: string;
    episodeOverlayPresetId?: string;
    placement?: OverlaysPlacement;
    scheduleHours?: number;
    skipIfKometaOverlayLabel?: boolean;
    plexSource?: string;
    lastRunAt?: string | null;
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
    run: (options?: { preview?: boolean }) => apiFetch(`${ROOT}/run`, json(options || {})),
    preview: () => apiFetch(`${ROOT}/preview`, json({})),
    stop: () => apiFetch(`${ROOT}/stop`, json({})),
    importLog: (log: Record<string, unknown>, mode: 'merge' | 'replace' = 'merge') => (
        apiFetch(`${ROOT}/import-log`, json({ mode, log }))
    ),
    resetOne: (ratingKey: string, kind?: 'show' | 'episode' | 'seasonEpisode') => (
        apiFetch(`${ROOT}/reset-one`, json({ ratingKey, kind }))
    ),
    resetAll: () => apiFetch(`${ROOT}/reset-all`, json({})),
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
