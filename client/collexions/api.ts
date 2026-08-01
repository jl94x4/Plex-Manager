import { apiFetch, portalRequestHeaders } from '../shared/api';
import { portalUrl } from '../shared/basePath';
import { DEFAULT_CONFIG } from './constants';
import type { AppConfig, AppStatus, HistoryResponse, PinEvent, PlexCollection } from './types';

const base = (path: string) => {
    const clean = path.startsWith('/') ? path : `/${path}`;
    return `/api/collexions${clean}`;
};

/** Match portal Collexions BFF long-op proxy budget (3 min). */
const COLLEXIONS_LONG_MS = 180_000;

const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
                    ms,
                );
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
};

export type CollexionsHealth = {
    ok: boolean;
    enabled: boolean;
    autostart: boolean;
    embedded?: { bundledAvailable?: boolean; running?: boolean; pid?: number | null };
    worker: {
        ok: boolean;
        reachable: boolean;
        error: string | null;
        detail: null | {
            ok: boolean;
            script?: string;
            plex?: { ok: boolean; error?: string | null };
            config?: { library_count?: number; dry_run?: boolean };
            issues?: string[];
        };
    };
    issues: string[];
};

export const collexionsImageUrl = (
    rawUrl: string,
    size: { width?: number; height?: number } = {},
) => {
    if (!rawUrl) return '';
    if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) return rawUrl;

    let path = rawUrl;
    if (path.startsWith('http://') || path.startsWith('https://')) {
        try {
            path = new URL(path).pathname;
        } catch {
            /* keep original */
        }
    }
    const q = path.indexOf('?');
    if (q >= 0) path = path.slice(0, q);
    if (!path.startsWith('/')) path = `/${path}`;

    // Use the portal Plex image proxy (transcoded + 24h browser cache) — one hop,
    // much faster than full-res through the Collexions Flask proxy.
    const width = size.width ?? 320;
    const height = size.height ?? 480;
    return portalUrl(
        `/api/plex/image?path=${encodeURIComponent(path)}&width=${width}&height=${height}`,
    );
};

class CollexionsApiService {
    async getAuthStatus(): Promise<{ is_setup: boolean; needs_onboarding?: boolean; portal_mode?: boolean }> {
        return withTimeout(apiFetch(base('/auth/status')), 8000, 'Connecting to Collexions');
    }

    /** Portal + worker health (never hangs more than ~8s). */
    async getHealth(): Promise<CollexionsHealth> {
        return withTimeout(apiFetch(base('/health')), 8000, 'Collexions health check');
    }

    /** Real portal Plex/TMDB values for seeding Collexions (admin-only; not masked). */
    async getPortalDefaults(): Promise<{
        plex_url: string;
        plex_token: string;
        tmdb_api_key: string;
        mediaServerType?: string;
        sources: { plex: boolean; tmdb: boolean; trakt: boolean; mdblist: boolean };
    }> {
        return withTimeout(apiFetch(base('/portal-defaults')), 10000, 'Portal defaults');
    }

    async getConfig(): Promise<AppConfig> {
        const data = await withTimeout(apiFetch(base('/config')), 10000, 'Loading config');
        return { ...DEFAULT_CONFIG, ...(data || {}) };
    }

    async saveConfig(config: AppConfig): Promise<void> {
        await withTimeout(
            apiFetch(base('/config'), { method: 'POST', body: JSON.stringify(config) }),
            COLLEXIONS_LONG_MS,
            'Saving config',
        );
    }

    /** Validate draft config against the worker (Plex reachability + library names). Does not save. */
    async validateConfig(config: AppConfig): Promise<{
        ok: boolean;
        errors: string[];
        warnings: string[];
        available_libraries?: string[];
    }> {
        return withTimeout(
            apiFetch(base('/config/validate'), { method: 'POST', body: JSON.stringify(config) }),
            COLLEXIONS_LONG_MS,
            'Validating config',
        );
    }

    async getStatus(): Promise<AppStatus> {
        try {
            return await withTimeout(apiFetch(base('/status')), 8000, 'Status');
        } catch {
            return { status: 'Offline', last_update: '', next_run_timestamp: 0 };
        }
    }

    /** Home widget: last/next run + labeled pin count (cached ~2m on worker). */
    async getSummary(): Promise<{
        status: string;
        last_update: string;
        last_run_at?: string | null;
        next_run_timestamp?: number;
        pinned_count?: number | null;
        labeled_count?: number;
        pin_slots?: number;
    }> {
        return withTimeout(apiFetch(base('/summary')), 20000, 'Collexions summary');
    }

    async getLogs(): Promise<string> {
        try {
            const response = await fetch(portalUrl(`${base('/logs')}?_=${Date.now()}`), {
                credentials: 'same-origin',
                cache: 'no-store',
                headers: portalRequestHeaders(),
            });
            if (!response.ok) throw new Error('Failed to load logs');
            return await response.text();
        } catch {
            return 'Backend is offline. Logs unavailable.';
        }
    }

    async clearLogs(): Promise<void> {
        await apiFetch(base('/logs/clear'), { method: 'POST', body: '{}' });
    }

    async getHistory(limit?: number): Promise<HistoryResponse> {
        const params = new URLSearchParams();
        if (limit) params.append('limit', String(limit));
        const qs = params.toString();
        const data = await withTimeout(
            apiFetch(base(`/history${qs ? `?${qs}` : ''}`)),
            15000,
            'History',
        );
        if (Array.isArray(data)) {
            return {
                events: data,
                total_count: data.length,
                unique_count: new Set(data.map((e: any) => e.collectionName)).size,
            };
        }
        return data;
    }

    async saveHistory(events: PinEvent[]): Promise<void> {
        await apiFetch(base('/history'), { method: 'POST', body: JSON.stringify(events) });
    }

    async runNow(): Promise<void> {
        await withTimeout(apiFetch(base('/run'), { method: 'POST', body: '{}' }), 60000, 'Start service');
    }

    async stopScript(): Promise<void> {
        await withTimeout(apiFetch(base('/stop'), { method: 'POST', body: '{}' }), 15000, 'Stop service');
    }

    async getCollections(forceRefresh = false, opts?: { light?: boolean }): Promise<PlexCollection[]> {
        if (forceRefresh) {
            try { await apiFetch(base('/cache/clear'), { method: 'POST', body: '{}' }); } catch { /* ignore */ }
        }
        const params = new URLSearchParams();
        if (forceRefresh) params.append('refresh', 'true');
        // Default light=true on the worker — skip visibility() for fast first paint
        if (opts?.light === false) params.append('light', 'false');
        const qs = params.toString();
        const data = await withTimeout(
            apiFetch(base(`/collections${qs ? `?${qs}` : ''}`)),
            90000,
            'Scanning Plex libraries',
        );
        if (data && typeof data === 'object' && !Array.isArray(data)) return data.collections || [];
        return data || [];
    }

    async resolveCollectionPins(
        items: Array<{ title: string; library: string }>,
    ): Promise<Record<string, boolean>> {
        if (!items.length) return {};
        const data = await withTimeout(
            apiFetch(base('/collections/resolve-pins'), {
                method: 'POST',
                body: JSON.stringify({ items }),
            }),
            120000,
            'Resolving pin status',
        );
        return (data && data.pins) || {};
    }

    async bulkPinCollections(
        action: 'pin' | 'unpin' | 'delete',
        items: Array<{ title: string; library: string }>,
    ): Promise<{ success: boolean; ok_count: number; results: Array<{ ok: boolean; title: string; library: string; error?: string }> }> {
        const label = action === 'pin' ? 'Bulk pin' : action === 'unpin' ? 'Bulk unpin' : 'Bulk delete';
        return withTimeout(
            apiFetch(base('/collections/bulk'), {
                method: 'POST',
                body: JSON.stringify({ action, items }),
            }),
            120000,
            label,
        );
    }

    async getTrending(): Promise<any[]> {
        try {
            return await apiFetch(base('/trending'));
        } catch {
            return [];
        }
    }

    async searchLibrary(library: string, query: string, genre?: string, year?: string): Promise<any[]> {
        const params = new URLSearchParams({ library, query });
        if (genre) params.append('genre', genre);
        if (year) params.append('year', year);
        return apiFetch(base(`/search/local?${params.toString()}`));
    }

    async searchExternal(query: string, type: 'movie' | 'tv'): Promise<any[]> {
        return withTimeout(
            apiFetch(base(`/search/external?query=${encodeURIComponent(query)}&type=${type}`)),
            90000,
            'External search',
        );
    }

    async getTmdbGenres(type: 'movie' | 'tv'): Promise<any[]> {
        return apiFetch(base(`/tmdb/genres?type=${type}`));
    }

    async discoverTmdb(params: Record<string, any>): Promise<any[]> {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                searchParams.append(key, String(value));
            }
        });
        return apiFetch(base(`/search/discover?${searchParams.toString()}`));
    }

    async createCollection(library: string, title: string, items: string[], sort_order = 'custom'): Promise<any> {
        return apiFetch(base('/collections/create'), {
            method: 'POST',
            body: JSON.stringify({ library, title, items, sort_order }),
        });
    }

    async createFromExternal(
        library: string,
        title: string,
        items: any[],
        sort_order = 'custom',
        auto_sync = false,
        source_type?: string,
        source_id?: string,
    ): Promise<any> {
        return apiFetch(base('/collections/create-from-external'), {
            method: 'POST',
            body: JSON.stringify({ library, title, items, sort_order, auto_sync, source_type, source_id }),
        });
    }

    async getTemplates(): Promise<{
        templates: Array<{
            id: string;
            name: string;
            description: string;
            category: string;
            media: string;
            source_type: string;
            source_id: string;
            default_sort: string;
            requires: string[];
            available: boolean;
        }>;
        categories: Array<{ id: string; label: string }>;
        keys: { tmdb: boolean; trakt: boolean };
    }> {
        return withTimeout(apiFetch(base('/templates')), 15000, 'Templates');
    }

    async searchFranchises(query: string): Promise<Array<{
        id: number;
        name: string;
        overview: string;
        poster: string | null;
        source_type: string;
        source_id: string;
        film_count?: number | null;
    }>> {
        return withTimeout(
            apiFetch(base(`/templates/franchise-search?q=${encodeURIComponent(query)}`)),
            30000,
            'Franchise search',
        );
    }

    async createFromTemplate(payload: {
        library: string;
        template_id?: string;
        title?: string;
        source_type?: string;
        source_id?: string;
        sort_order?: string;
        auto_sync?: boolean;
    }): Promise<{ success: boolean; matched?: number; total?: number; job_id?: string; title?: string; error?: string }> {
        return withTimeout(
            apiFetch(base('/templates/create'), { method: 'POST', body: JSON.stringify(payload) }),
            120000,
            'Creating collection',
        );
    }

    async getJobs(): Promise<any> {
        return apiFetch(base('/jobs'));
    }

    async runJobNow(id: string): Promise<any> {
        return withTimeout(
            apiFetch(base('/jobs/run'), { method: 'POST', body: JSON.stringify({ id }) }),
            COLLEXIONS_LONG_MS,
            'Running sync job',
        );
    }

    async deleteJob(id: string): Promise<any> {
        return apiFetch(base('/jobs/delete'), { method: 'POST', body: JSON.stringify({ id }) });
    }

    async getTraktList(url: string): Promise<any[]> {
        return apiFetch(base(`/trakt/list?url=${encodeURIComponent(url)}`));
    }

    async searchTraktLists(query: string): Promise<Array<{
        name: string;
        description: string;
        username: string;
        slug: string;
        url: string;
        item_count?: number | null;
        likes?: number | null;
        trakt_id?: number | null;
        score?: number | null;
    }>> {
        return withTimeout(
            apiFetch(base(`/trakt/lists/search?q=${encodeURIComponent(query)}`)),
            30000,
            'Trakt list search',
        );
    }

    async getMdbList(url: string): Promise<any[]> {
        return apiFetch(base(`/mdblist/list?url=${encodeURIComponent(url)}`));
    }

    async pinCollection(title: string, library: string): Promise<void> {
        await apiFetch(base('/collections/pin'), { method: 'POST', body: JSON.stringify({ title, library }) });
    }

    async unpinCollection(title: string, library: string): Promise<void> {
        await apiFetch(base('/collections/unpin'), { method: 'POST', body: JSON.stringify({ title, library }) });
    }

    async deleteCollection(title: string, library: string): Promise<{ success: boolean; removed_jobs?: string[] }> {
        return apiFetch(base('/collections/delete'), {
            method: 'POST',
            body: JSON.stringify({ title, library }),
        });
    }

    async fixCollectionArt(
        library: string,
        title?: string,
        force = false,
    ): Promise<{ success: boolean; ok_count?: number; results?: Array<{ title: string; library: string; ok: boolean }> }> {
        return withTimeout(
            apiFetch(base('/collections/fix-art'), {
                method: 'POST',
                body: JSON.stringify({ library, title, force }),
            }),
            180000,
            'Fixing collection art',
        );
    }

    async getPlexLibraries(): Promise<any[]> {
        return apiFetch(base('/plex/libraries'));
    }

    async getManagedHubs(library: string): Promise<{
        library: string;
        library_type: string;
        section_id: number | string;
        hubs: Array<{
            identifier: string;
            title: string;
            promoted_to_recommended: boolean;
            promoted_to_home: boolean;
            promoted_to_shared: boolean;
            deletable: boolean;
            is_collection: boolean;
        }>;
    }> {
        return withTimeout(
            apiFetch(base(`/hubs?library=${encodeURIComponent(library)}`)),
            60000,
            'Loading hubs',
        );
    }

    async moveManagedHub(
        library: string,
        identifier: string,
        after: string | null,
    ): Promise<{ success: boolean; hubs?: any[]; error?: string }> {
        return withTimeout(
            apiFetch(base('/hubs/move'), {
                method: 'POST',
                body: JSON.stringify({ library, identifier, after }),
            }),
            60000,
            'Reordering hub',
        );
    }

    async updateHubVisibility(
        library: string,
        identifier: string,
        visibility: { recommended?: boolean; home?: boolean; shared?: boolean },
    ): Promise<{ success: boolean; hub?: any; error?: string }> {
        return withTimeout(
            apiFetch(base('/hubs/visibility'), {
                method: 'POST',
                body: JSON.stringify({ library, identifier, ...visibility }),
            }),
            60000,
            'Updating hub visibility',
        );
    }
}

export const api = new CollexionsApiService();
