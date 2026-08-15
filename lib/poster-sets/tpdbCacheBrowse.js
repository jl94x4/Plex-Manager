/**
 * Pure helpers for Poster Sets library cache badges / browse filter / sort.
 */

export const coverageKeyForLibraryItem = (item = {}) => {
    const tmdbId = String(item?.tmdbId || '').trim();
    if (!/^\d+$/.test(tmdbId)) return null;
    const mediaType = String(item?.mediaType || 'movie').toLowerCase();
    const normalized = (mediaType === 'show' || mediaType === 'tv' || mediaType === 'series')
        ? 'show'
        : 'movie';
    return `${normalized}:${tmdbId}`;
};

export const coverageKeyFromTitleCacheFileName = (name = '') => {
    const match = String(name || '').trim().match(/^tmdb_(movie|show)_(\d+)\.json$/i);
    if (!match) return null;
    return `${match[1].toLowerCase()}:${match[2]}`;
};

export const itemIsTpdbCached = (item, cachedKeys) => {
    const key = coverageKeyForLibraryItem(item);
    if (!key) return false;
    return cachedKeys instanceof Set ? cachedKeys.has(key) : Boolean(cachedKeys?.[key]);
};

/**
 * Filter + sort a full library listing by local TPDB cache status, then paginate.
 * `cachedFirst` keeps the incoming order as a secondary key (Plex/Jellyfin sort).
 */
export const applyTpdbCacheBrowse = (items = [], options = {}) => {
    const list = Array.isArray(items) ? items : [];
    const cachedKeys = options.cachedKeys instanceof Set ? options.cachedKeys : new Set();
    const cacheStatus = String(options.cacheStatus || 'all').trim().toLowerCase();
    const sort = String(options.sort || '').trim();
    const start = Math.max(0, Number(options.start) || 0);
    const limit = Math.min(Math.max(Number(options.limit) || 60, 1), 120);

    const filtered = list.filter((item) => {
        if (cacheStatus === 'cached') return itemIsTpdbCached(item, cachedKeys);
        if (cacheStatus === 'uncached' || cacheStatus === 'not-cached') {
            return !itemIsTpdbCached(item, cachedKeys);
        }
        return true;
    });

    const ranked = sort === 'cachedFirst'
        ? filtered
            .map((item, index) => ({ item, index, cached: itemIsTpdbCached(item, cachedKeys) }))
            .sort((a, b) => {
                if (a.cached !== b.cached) return a.cached ? -1 : 1;
                return a.index - b.index;
            })
            .map((row) => row.item)
        : filtered;

    return {
        items: ranked.slice(start, start + limit),
        total: ranked.length,
        cacheStatus: cacheStatus === 'uncached' || cacheStatus === 'not-cached' || cacheStatus === 'cached'
            ? (cacheStatus === 'not-cached' ? 'uncached' : cacheStatus)
            : 'all',
        sort: sort === 'cachedFirst' ? 'cachedFirst' : sort || null,
    };
};
