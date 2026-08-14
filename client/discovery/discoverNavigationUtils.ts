/** Scroll the portal main view back to the top after in-app discovery navigation. */
export const scrollPortalToTop = () => {
    if (typeof window === 'undefined') return;
    window.scrollTo(0, 0);
    const container = document.getElementById('main-scroll-container');
    if (container) container.scrollTop = 0;
};

const DISCOVER_SCROLL_STATE_KEY = 'discover:scrollByPath:v1';
const DISCOVER_LAST_BROWSE_PATH_KEY = 'discover:lastBrowsePath:v1';
const MAX_SCROLL_ENTRIES = 36;

const toDiscoveryPath = (value = '') => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.startsWith('/discovery') ? raw : '';
};

const isDetailPath = (path = '') => (
    /^\/discovery\/(movie|tv|person)\//.test(path)
    || /^\/discovery\/music\/artist\//.test(path)
);

export const currentDiscoverPathWithSearch = () => {
    if (typeof window === 'undefined') return '/discovery';
    return `${window.location.pathname || '/discovery'}${window.location.search || ''}`;
};

const readScrollMap = (): Record<string, number> => {
    if (typeof sessionStorage === 'undefined') return {};
    try {
        const raw = sessionStorage.getItem(DISCOVER_SCROLL_STATE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        if (!parsed || typeof parsed !== 'object') return {};
        return parsed;
    } catch {
        return {};
    }
};

const writeScrollMap = (value: Record<string, number>) => {
    if (typeof sessionStorage === 'undefined') return;
    try {
        const entries = Object.entries(value)
            .filter(([key, top]) => key && Number.isFinite(Number(top)))
            .slice(-MAX_SCROLL_ENTRIES);
        sessionStorage.setItem(DISCOVER_SCROLL_STATE_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch {
        // ignore quota / private mode
    }
};

export const stashDiscoverScrollPosition = (path = currentDiscoverPathWithSearch()) => {
    if (typeof window === 'undefined') return;
    const key = toDiscoveryPath(path);
    if (!key) return;
    const container = document.getElementById('main-scroll-container');
    const scrollTop = container
        ? Math.max(0, Math.round(container.scrollTop || 0))
        : Math.max(0, Math.round(window.scrollY || 0));
    const next = readScrollMap();
    next[key] = scrollTop;
    writeScrollMap(next);
};

export const restoreDiscoverScrollPosition = (path = currentDiscoverPathWithSearch()) => {
    if (typeof window === 'undefined') return false;
    const key = toDiscoveryPath(path);
    if (!key) return false;
    const top = Number(readScrollMap()[key]);
    if (!Number.isFinite(top)) return false;
    const container = document.getElementById('main-scroll-container');
    if (container) container.scrollTop = top;
    window.scrollTo(0, top);
    return true;
};

export const stashDiscoverBrowsePath = (path = currentDiscoverPathWithSearch()) => {
    if (typeof sessionStorage === 'undefined') return;
    const key = toDiscoveryPath(path);
    if (!key || isDetailPath(key)) return;
    try {
        sessionStorage.setItem(DISCOVER_LAST_BROWSE_PATH_KEY, key);
    } catch {
        // ignore quota / private mode
    }
};

export const readDiscoverBrowsePath = () => {
    if (typeof sessionStorage === 'undefined') return '';
    try {
        return toDiscoveryPath(sessionStorage.getItem(DISCOVER_LAST_BROWSE_PATH_KEY) || '');
    } catch {
        return '';
    }
};

const DISCOVER_DETAIL_SEED_KEY = 'discover:detailSeed';

/** Stash a lightweight TMDB row so MediaDetailsPage can paint before the proxy returns. */
export const stashDiscoverDetailSeed = (item: any) => {
    if (typeof sessionStorage === 'undefined' || !item) return;
    try {
        const mediaType = item?.type === 'tv' || item?.mediaType === 'tv' ? 'tv' : 'movie';
        const id = Number(item?.id ?? item?.tmdbId);
        if (!Number.isFinite(id) || id <= 0) return;
        const title = item.title || item.name || '';
        sessionStorage.setItem(DISCOVER_DETAIL_SEED_KEY, JSON.stringify({
            id,
            tmdbId: id,
            mediaType,
            title: mediaType === 'movie' ? title : undefined,
            name: mediaType === 'tv' ? title : undefined,
            posterPath: item.posterPath || null,
            backdropPath: item.backdropPath || null,
            overview: item.overview || '',
            releaseDate: item.releaseDate || null,
            firstAirDate: item.firstAirDate || null,
            voteAverage: item.voteAverage,
            mediaInfo: item.mediaInfo || null,
            _seed: true,
        }));
    } catch {
        // ignore quota / private mode
    }
};

/** Read a seed that matches the current detail route; otherwise null. */
export const readDiscoverDetailSeed = (mediaType: string, mediaId: number) => {
    if (typeof sessionStorage === 'undefined') return null;
    try {
        const raw = sessionStorage.getItem(DISCOVER_DETAIL_SEED_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const type = parsed?.mediaType === 'tv' ? 'tv' : 'movie';
        const id = Number(parsed?.id ?? parsed?.tmdbId);
        if (type !== mediaType || id !== Number(mediaId)) return null;
        return parsed;
    } catch {
        return null;
    }
};
