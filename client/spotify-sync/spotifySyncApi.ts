import { apiFetch } from '../shared/api';
import { portalUrl } from '../shared/basePath';

const WORKER = '/api/spotify-to-plex/worker';

export const workerFetch = async (path: string, options: RequestInit = {}) => {
    const rel = String(path || '').replace(/^\/+/, '');
    return apiFetch(`${WORKER}/${rel}`, options);
};

export const workerImageUrl = (src?: string | null) => {
    const value = String(src || '').trim();
    if (!value) return '';
    if (value.startsWith('/api/')) {
        return portalUrl(`${WORKER}/${value.replace(/^\/api\//, '')}`);
    }
    return value;
};

export const formatWhen = (value?: string | null) => {
    if (!value) return '—';
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return String(value);
    return new Date(parsed).toLocaleString();
};
