import { portalUrl } from './basePath';
import {
    DISCOVER_LOCALE_HEADER,
    readDiscoverUiLocale,
} from '../discovery/i18n/types';

/** Sent on every API call so mutating routes can reject cross-site CSRF. */
export const PORTAL_CSRF_HEADER = 'X-Requested-With';
export const PORTAL_CSRF_VALUE = 'ServerManagerPortal';

const needsDiscoverMetadataLocale = (url: string) => {
    const path = String(url || '');
    return path.includes('/api/discovery/proxy')
        || path.includes('/api/discovery/search')
        || path.includes('/api/discovery/trending');
};

const discoverLocaleHeaders = (url: string): HeadersInit => {
    if (!needsDiscoverMetadataLocale(url)) return {};
    try {
        return {
            [DISCOVER_LOCALE_HEADER]: readDiscoverUiLocale(),
        };
    } catch {
        return {};
    }
};

export const portalRequestHeaders = (extra: HeadersInit = {}): HeadersInit => ({
    'Content-Type': 'application/json',
    Accept: 'application/json',
    [PORTAL_CSRF_HEADER]: PORTAL_CSRF_VALUE,
    ...extra,
});

export const apiFetch = async (url: string, options: RequestInit = {}) => {
    const response = await fetch(portalUrl(url), {
        credentials: 'same-origin',
        ...options,
        headers: portalRequestHeaders({
            ...discoverLocaleHeaders(url),
            ...(options.headers || {}),
        }),
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'An unknown API error occurred.' }));
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
    }
    if (response.status === 204) return;
    return response.json();
};

/** Deduplicate concurrent identical GETs (Home Wrap-Up + achievements widget). */
const inflightGets = new Map<string, Promise<any>>();
export const apiFetchShared = (url: string, options: RequestInit = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    if (method !== 'GET' || options.body) return apiFetch(url, options);
    const existing = inflightGets.get(url);
    if (existing) return existing;
    const pending = apiFetch(url, options).finally(() => {
        inflightGets.delete(url);
    });
    inflightGets.set(url, pending);
    return pending;
};
