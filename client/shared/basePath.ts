declare global {
    interface Window {
        __BASE_PATH__?: string;
    }
}

export const LOGO_PATH = '/static/logo.png';

/** Official brand marks for auth buttons (not the portal SMP logo). */
export const PLEX_ICON_URL = 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/plex.svg';
export const JELLYFIN_ICON_URL = 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/jellyfin.svg';
export const EMBY_ICON_URL = 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/emby.svg';

const readBasePathFromBaseTag = (): string => {
    const baseEl = document.querySelector('base[href]');
    if (!baseEl) return '';
    const href = baseEl.getAttribute('href') || '/';
    try {
        const path = new URL(href, window.location.origin).pathname.replace(/\/+$/, '');
        return path === '/' ? '' : path;
    } catch {
        return '';
    }
};

export const getBasePath = (): string => {
    if (typeof window === 'undefined') return '';
    if (typeof window.__BASE_PATH__ === 'string' && window.__BASE_PATH__ !== '') {
        const base = window.__BASE_PATH__;
        return base === '/' ? '' : base.replace(/\/+$/, '');
    }
    // Inline bootstrap script may be blocked by CSP; <base href> is always injected in HTML.
    return readBasePathFromBaseTag();
};

/** Prefix an app-root path with the configured base path. */
export const portalUrl = (path: string): string => {
    if (!path || path.startsWith('http://') || path.startsWith('https://')) return path;
    const base = getBasePath();
    const normalized = path.startsWith('/') ? path : `/${path}`;
    if (base && (normalized === base || normalized.startsWith(`${base}/`))) return normalized;
    return base ? `${base}${normalized}` : normalized;
};

/** Prefix root-relative asset or API paths; leave absolute http(s) URLs unchanged. */
export const resolvePortalAssetUrl = (url: string | null | undefined): string => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return portalUrl(url.startsWith('/') ? url : `/${url}`);
};

/** Strip the configured base path from a pathname for client-side routing. */
export const stripBasePath = (pathname: string): string => {
    const base = getBasePath();
    if (!base) return pathname || '/';
    if (pathname === base || pathname === `${base}/`) return '/';
    if (pathname.startsWith(`${base}/`)) return pathname.slice(base.length) || '/';
    return pathname || '/';
};

/** Public origin including base path — use for shareable links and referrals. */
export const getPublicOrigin = (): string => `${window.location.origin}${getBasePath()}`;

export const logoUrl = (): string => portalUrl(LOGO_PATH);
