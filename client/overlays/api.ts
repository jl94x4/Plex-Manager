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

export type OverlaysConfig = {
    enabled?: boolean;
    previewMode?: boolean;
    newSeasonDays?: number;
    librarySectionIds?: string[];
    overlayPresetId?: string;
    scheduleHours?: number;
    skipIfKometaOverlayLabel?: boolean;
    plexSource?: string;
    lastRunAt?: string | null;
    lastRunSummary?: Record<string, unknown> | null;
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
    presets: () => apiFetch(`${ROOT}/presets`),
    sections: () => apiFetch(`${ROOT}/sections`),
    scan: () => apiFetch(`${ROOT}/scan`, json({})),
    reconcile: () => apiFetch(`${ROOT}/reconcile`, json({})),
    run: (options?: { preview?: boolean }) => apiFetch(`${ROOT}/run`, json(options || {})),
    preview: () => apiFetch(`${ROOT}/preview`, json({})),
    stop: () => apiFetch(`${ROOT}/stop`, json({})),
    importLog: (log: Record<string, unknown>, mode: 'merge' | 'replace' = 'merge') => (
        apiFetch(`${ROOT}/import-log`, json({ mode, log }))
    ),
    resetOne: (ratingKey: string) => apiFetch(`${ROOT}/reset-one`, json({ ratingKey })),
};
