import { apiFetch } from '../shared/api';
import type { PosterSetsConfig, PosterSetsJob, PosterSetsPreview, PosterSetsStatus } from './types';

const ROOT = '/api/poster-sets';

const json = (body: unknown) => ({
    method: 'POST' as const,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});

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
    preview: (url: string) => apiFetch(`${ROOT}/preview`, json({ url })) as Promise<PosterSetsPreview>,
    apply: (url: string, selectedIds?: string[]) => apiFetch(`${ROOT}/apply`, json({
        url,
        ...(selectedIds?.length ? { selectedIds } : {}),
    })) as Promise<{ ok: boolean; jobId: string; job: PosterSetsJob }>,
    imageUrl: (thumbUrl: string) => `${ROOT}/image?url=${encodeURIComponent(thumbUrl)}`,
    bulk: (payload: { urls?: string[]; text?: string; fromFile?: boolean }) => (
        apiFetch(`${ROOT}/bulk`, json(payload)) as Promise<{ ok: boolean; jobId: string; job: PosterSetsJob }>
    ),
    job: (id: string) => apiFetch(`${ROOT}/jobs/${encodeURIComponent(id)}`) as Promise<{ job: PosterSetsJob }>,
    jobs: () => apiFetch(`${ROOT}/jobs`) as Promise<{ ok?: boolean; jobs: PosterSetsJob[] }>,
};
