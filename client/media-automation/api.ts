import { apiFetch } from '../shared/api';
import type {
    MediaAutomationActivity,
    MediaAutomationCapabilities,
    MediaAutomationJob,
    MediaAutomationLibrary,
    MediaAutomationPendingTest,
    MediaAutomationPipeline,
    MediaAutomationPipelinePreview,
    MediaAutomationStatus,
} from './types';

const ROOT = '/api/media-automation';

export type MediaAutomationBrowseEntry = {
    name: string;
    path: string;
    type: 'root' | 'directory' | 'file';
};

export type MediaAutomationBrowseResult = {
    ok?: boolean;
    path?: string | null;
    parent?: string | null;
    root?: string | null;
    roots?: string[];
    entries?: MediaAutomationBrowseEntry[];
    message?: string;
    error?: string;
};

const asList = <T,>(value: unknown, keys: string[]): T[] => {
    if (Array.isArray(value)) return value as T[];
    if (!value || typeof value !== 'object') return [];
    const record = value as Record<string, unknown>;
    for (const key of keys) {
        if (Array.isArray(record[key])) return record[key] as T[];
    }
    return [];
};

const json = (value: unknown): RequestInit => ({
    method: 'POST',
    body: JSON.stringify(value),
});

export const mediaAutomationApi = {
    status: () => apiFetch(`${ROOT}/status`) as Promise<MediaAutomationStatus>,
    capabilities: () => apiFetch(`${ROOT}/capabilities`) as Promise<MediaAutomationCapabilities>,
    jobs: async (limit = 100) => asList<MediaAutomationJob>(
        await apiFetch(`${ROOT}/jobs?limit=${limit}`),
        ['jobs', 'items', 'results'],
    ),
    getJob: async (id: string | number) => {
        const response = await apiFetch(`${ROOT}/jobs/${encodeURIComponent(id)}`) as { job?: MediaAutomationJob };
        return response.job || null;
    },
    jobLogs: async (id: string | number, limit = 100) => asList<MediaAutomationActivity>(
        await apiFetch(`${ROOT}/jobs/${encodeURIComponent(id)}/logs?limit=${limit}`),
        ['entries', 'logs', 'activity', 'items'],
    ),
    activity: async (limit = 100) => asList<MediaAutomationActivity>(
        await apiFetch(`${ROOT}/activity?limit=${limit}`),
        ['activity', 'events', 'items', 'results'],
    ),
    browse: (path = '') => apiFetch(
        `${ROOT}/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`,
    ) as Promise<MediaAutomationBrowseResult>,
    libraries: async () => asList<MediaAutomationLibrary>(
        await apiFetch(`${ROOT}/libraries`),
        ['libraries', 'items', 'results'],
    ),
    pipelines: async () => asList<MediaAutomationPipeline>(
        await apiFetch(`${ROOT}/pipelines`),
        ['pipelines', 'items', 'results'],
    ),
    enqueue: (path: string, pipelineId?: string | number) => apiFetch(`${ROOT}/enqueue`, json({ path, pipelineId })),
    testWorker: () => apiFetch(`${ROOT}/worker/test`, json({})),
    control: (action: string) => apiFetch(`${ROOT}/control`, json({ action })),
    scanNow: () => apiFetch(`${ROOT}/scan`, json({})),
    testPending: (path: string) => apiFetch(`${ROOT}/pending/test`, json({ path })) as Promise<MediaAutomationPendingTest>,
    cancelJob: (id: string | number) => apiFetch(`${ROOT}/jobs/${encodeURIComponent(id)}/cancel`, json({})),
    skipJob: (id: string | number, reason = 'skipped') => apiFetch(`${ROOT}/jobs/${encodeURIComponent(id)}/skip`, json({ reason })),
    setPriority: (id: string | number, priority: number) => apiFetch(`${ROOT}/jobs/${encodeURIComponent(id)}/priority`, json({ priority })),
    retryJob: (id: string | number) => apiFetch(`${ROOT}/jobs/${encodeURIComponent(id)}/retry`, json({})),
    createLibrary: (library: MediaAutomationLibrary) => apiFetch(`${ROOT}/libraries`, json(library)),
    updateLibrary: (id: string | number, library: MediaAutomationLibrary) => apiFetch(`${ROOT}/libraries/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(library),
    }),
    deleteLibrary: (id: string | number) => apiFetch(`${ROOT}/libraries/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    createPipeline: (pipeline: MediaAutomationPipeline) => apiFetch(`${ROOT}/pipelines`, json(pipeline)),
    updatePipeline: (id: string | number, pipeline: MediaAutomationPipeline) => apiFetch(`${ROOT}/pipelines/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(pipeline),
    }),
    deletePipeline: (id: string | number) => apiFetch(`${ROOT}/pipelines/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    testLibrary: (id: string | number) => apiFetch(`${ROOT}/libraries/${encodeURIComponent(id)}/test`, json({})),
    previewPipeline: (id: string | number, path: string) => apiFetch(
        `${ROOT}/pipelines/${encodeURIComponent(id)}/preview`,
        json({ path }),
    ) as Promise<MediaAutomationPipelinePreview>,
    testPipeline: (id: string | number, path: string) => apiFetch(
        `${ROOT}/pipelines/${encodeURIComponent(id)}/test`,
        json({ path }),
    ),
};
