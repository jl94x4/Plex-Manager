/**
 * Pure helpers for Poster Sets library cache badges / browse filter / sort.
 */

const normalizeWarmMediaType = (value) => {
    const raw = String(value || 'movie').toLowerCase();
    if (raw === 'show' || raw === 'tv' || raw === 'series') return 'show';
    return 'movie';
};

const numericId = (value) => {
    const id = String(value || '').trim();
    return /^\d+$/.test(id) ? id : null;
};

/**
 * Coverage key for local TPDB title cache.
 * TMDB: `show:1396` / `movie:550`
 * TVDB-only (no TMDB): `tvdb:show:78804` — prefix avoids colliding with TMDB id space.
 */
export const coverageKeyForLibraryItem = (item = {}) => {
    const mediaType = normalizeWarmMediaType(item?.mediaType);
    const tmdbId = numericId(item?.tmdbId);
    if (tmdbId) return `${mediaType}:${tmdbId}`;
    const tvdbId = numericId(item?.tvdbId);
    if (tvdbId) return `tvdb:${mediaType}:${tvdbId}`;
    return null;
};

export const coverageKeyFromTitleCacheFileName = (name = '') => {
    const raw = String(name || '').trim();
    const tmdbMatch = raw.match(/^tmdb_(movie|show)_(\d+)\.json$/i);
    if (tmdbMatch) return `${tmdbMatch[1].toLowerCase()}:${tmdbMatch[2]}`;
    const tvdbMatch = raw.match(/^tvdb_(movie|show)_(\d+)\.json$/i);
    if (tvdbMatch) return `tvdb:${tvdbMatch[1].toLowerCase()}:${tvdbMatch[2]}`;
    return null;
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
