/** Recently-added, browse, search, and artwork reset for Poster Sets Library tab. */

const PLEX_SORT_MAP = {
    titleAsc: 'titleSort:asc',
    titleDesc: 'titleSort:desc',
    yearDesc: 'year:desc',
    yearAsc: 'year:asc',
    addedDesc: 'addedAt:desc',
    addedAsc: 'addedAt:asc',
};

const normalizeSort = (value) => (
    PLEX_SORT_MAP[String(value || '').trim()] ? String(value).trim() : 'titleAsc'
);

const dedupeRecentList = (list, limit) => {
    const unique = [];
    const seen = new Set();
    const sorted = [...list].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    for (const item of sorted) {
        const key = `${item.mediaType}:${item.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(item);
        if (unique.length >= limit) break;
    }
    return unique;
};

const mapPlexRecentMetadata = (sectionType, metadata = {}, sectionTitle = null) => {
    if (sectionType !== 'movie' && sectionType !== 'show') return null;
    const mediaType = sectionType === 'movie' ? 'movie' : 'show';
    const isShow = mediaType === 'show';
    const id = isShow
        ? String(metadata.grandparentRatingKey || metadata.parentRatingKey || metadata.ratingKey || '').trim()
        : String(metadata.ratingKey || '').trim();
    const title = isShow
        ? String(metadata.grandparentTitle || metadata.parentTitle || metadata.title || '').trim()
        : String(metadata.title || '').trim();
    if (!title) return null;
    return {
        id: id || title,
        title,
        year: Number(metadata.year) || null,
        mediaType,
        thumb: metadata.grandparentThumb || metadata.parentThumb || metadata.thumb || null,
        addedAt: Number(metadata.addedAt) || 0,
        librarySection: sectionTitle,
    };
};

export const fetchPlexLibraryRecent = async (config, deps, { limit = 120 } = {}) => {
    const { getPlexConnectionUri, plexClientHeaders, fetchImpl = fetch } = deps;
    const uri = await getPlexConnectionUri(config);
    if (!uri) throw new Error('Cannot connect to Plex');

    const sectionsRes = await fetchImpl(
        `${uri}/library/sections?X-Plex-Token=${config.plexToken}`,
        { headers: plexClientHeaders(config.plexToken) },
    ).then((r) => r.json()).catch(() => null);
    const sections = (sectionsRes?.MediaContainer?.Directory || [])
        .filter((section) => section.type === 'movie' || section.type === 'show');

    if (!sections.length) {
        return { movies: [], shows: [], items: [] };
    }

    const perSectionLimit = Math.max(
        20,
        Math.min(50, Math.ceil(limit / Math.max(sections.length, 1)) + 5),
    );

    const buckets = await Promise.all(sections.map(async (section) => {
        const data = await fetchImpl(
            `${uri}/library/sections/${section.key}/recentlyAdded?X-Plex-Token=${config.plexToken}&X-Plex-Container-Start=0&X-Plex-Container-Size=${perSectionLimit}`,
            { headers: plexClientHeaders(config.plexToken) },
        ).then((r) => r.json()).catch(() => null);
        const metas = data?.MediaContainer?.Metadata || [];
        return metas
            .map((meta) => mapPlexRecentMetadata(section.type, meta, section.title))
            .filter(Boolean);
    }));

    const all = buckets.flat();
    const movies = dedupeRecentList(all.filter((item) => item.mediaType === 'movie'), limit);
    const shows = dedupeRecentList(all.filter((item) => item.mediaType === 'show'), limit);
    const items = dedupeRecentList(all, limit);
    return { movies, shows, items };
};

export const searchPlexLibraryMedia = async (config, deps, { query, limit = 40 } = {}) => {
    const q = String(query || '').trim();
    if (!q) return [];
    const { getPlexConnectionUri, plexClientHeaders, fetchImpl = fetch } = deps;
    const uri = await getPlexConnectionUri(config);
    if (!uri) throw new Error('Cannot connect to Plex');

    const searchRes = await fetchImpl(
        `${uri}/hubs/search?query=${encodeURIComponent(q)}&limit=${Math.min(limit, 80)}&includeGuids=1&X-Plex-Token=${config.plexToken}`,
        { headers: plexClientHeaders(config.plexToken) },
    ).then((r) => r.json()).catch(() => null);

    const results = [];
    const hubs = searchRes?.MediaContainer?.Hub || [];
    for (const hub of hubs) {
        const hubType = String(hub.type || '').toLowerCase();
        if (hubType !== 'movie' && hubType !== 'show') continue;
        for (const meta of (hub.Metadata || [])) {
            const mediaType = hubType === 'show' ? 'show' : 'movie';
            const title = String(meta.title || '').trim();
            if (!title) continue;
            results.push({
                id: String(meta.ratingKey || title),
                title,
                year: Number(meta.year) || null,
                mediaType,
                thumb: meta.thumb || null,
                addedAt: 0,
            });
            if (results.length >= limit) break;
        }
        if (results.length >= limit) break;
    }
    return results;
};

const mapPlexBrowseMetadata = (sectionType, metadata = {}, sectionTitle = null) => {
    if (sectionType !== 'movie' && sectionType !== 'show') return null;
    const mediaType = sectionType === 'movie' ? 'movie' : 'show';
    const id = String(metadata.ratingKey || '').trim();
    const title = String(metadata.title || '').trim();
    if (!id || !title) return null;
    return {
        id,
        title,
        year: Number(metadata.year) || null,
        mediaType,
        thumb: metadata.thumb || null,
        addedAt: Number(metadata.addedAt) || 0,
        librarySection: sectionTitle,
        librarySectionKey: metadata.librarySectionKey || null,
    };
};

export const fetchPlexLibrarySections = async (config, deps) => {
    const { getPlexConnectionUri, plexClientHeaders, fetchImpl = fetch } = deps;
    const uri = await getPlexConnectionUri(config);
    if (!uri) throw new Error('Cannot connect to Plex');

    const sectionsRes = await fetchImpl(
        `${uri}/library/sections?X-Plex-Token=${config.plexToken}`,
        { headers: plexClientHeaders(config.plexToken) },
    ).then((r) => r.json()).catch(() => null);

    return (sectionsRes?.MediaContainer?.Directory || [])
        .filter((section) => section.type === 'movie' || section.type === 'show')
        .map((section) => ({
            key: String(section.key || ''),
            title: String(section.title || '').trim(),
            type: section.type === 'show' ? 'show' : 'movie',
            count: Number(section.size) || 0,
        }))
        .filter((section) => section.key && section.title);
};

export const browsePlexLibraryMedia = async (config, deps, options = {}) => {
    const {
        sectionKey = '',
        mediaType = '',
        sort = 'titleAsc',
        start = 0,
        limit = 60,
    } = options;

    const { getPlexConnectionUri, plexClientHeaders, fetchImpl = fetch } = deps;
    const uri = await getPlexConnectionUri(config);
    if (!uri) throw new Error('Cannot connect to Plex');

    const sections = await fetchPlexLibrarySections(config, deps);
    let targetSections = sections;
    if (sectionKey) {
        targetSections = sections.filter((section) => section.key === String(sectionKey));
    }
    if (mediaType === 'movie' || mediaType === 'show') {
        targetSections = targetSections.filter((section) => section.type === mediaType);
    }
    if (!targetSections.length) {
        return { items: [], total: 0, sections };
    }

    const plexSort = PLEX_SORT_MAP[normalizeSort(sort)] || PLEX_SORT_MAP.titleAsc;
    const take = Math.min(Math.max(Number(limit) || 60, 1), 120);
    const offset = Math.max(Number(start) || 0, 0);
    const perSection = targetSections.length === 1
        ? take
        : Math.min(take, Math.max(20, Math.ceil(take / targetSections.length)));

    const buckets = await Promise.all(targetSections.map(async (section) => {
        const url = `${uri}/library/sections/${section.key}/all?X-Plex-Token=${config.plexToken}`
            + `&X-Plex-Container-Start=${offset}&X-Plex-Container-Size=${perSection}`
            + `&sort=${encodeURIComponent(plexSort)}`;
        const data = await fetchImpl(url, { headers: plexClientHeaders(config.plexToken) })
            .then((r) => r.json())
            .catch(() => null);
        const metas = data?.MediaContainer?.Metadata || [];
        const total = Number(data?.MediaContainer?.totalSize) || metas.length;
        return {
            total,
            items: metas.map((meta) => mapPlexBrowseMetadata(section.type, {
                ...meta,
                librarySectionKey: section.key,
            }, section.title)).filter(Boolean),
        };
    }));

    const items = dedupeRecentList(buckets.flatMap((bucket) => bucket.items), take);
    const total = buckets.reduce((sum, bucket) => sum + (bucket.total || 0), 0);
    return { items, total, sections: targetSections, sort: normalizeSort(sort) };
};

const plexMetadataPut = async (uri, token, ratingKey, query, deps) => {
    const { plexClientHeaders, fetchImpl = fetch } = deps;
    const url = `${uri}/library/metadata/${encodeURIComponent(String(ratingKey))}?${query}&X-Plex-Token=${encodeURIComponent(token)}`;
    const response = await fetchImpl(url, {
        method: 'PUT',
        headers: plexClientHeaders(token),
    });
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || `Plex metadata update failed (${response.status})`);
    }
    return true;
};

const fetchPlexChildren = async (uri, token, ratingKey, deps) => {
    const { plexClientHeaders, fetchImpl = fetch } = deps;
    const url = `${uri}/library/metadata/${encodeURIComponent(String(ratingKey))}/children?X-Plex-Token=${encodeURIComponent(token)}`;
    const data = await fetchImpl(url, { headers: plexClientHeaders(token) })
        .then((r) => r.json())
        .catch(() => null);
    return data?.MediaContainer?.Metadata || [];
};

/** Reset Plex artwork to agent defaults (poster/thumb and optional art/seasons/episodes). */
export const resetPlexLibraryArtwork = async (config, deps, options = {}) => {
    const ratingKey = String(options.ratingKey || '').trim();
    const mediaType = String(options.mediaType || '').toLowerCase();
    const scope = String(options.scope || 'poster').toLowerCase();
    if (!ratingKey) throw new Error('ratingKey is required');

    const { getPlexConnectionUri } = deps;
    const uri = await getPlexConnectionUri(config);
    if (!uri) throw new Error('Cannot connect to Plex');

    const token = config.plexToken;
    let cleared = 0;

    const clearPoster = async (key) => {
        await plexMetadataPut(uri, token, key, 'thumb.clear=1', deps);
        cleared += 1;
    };
    const clearArt = async (key) => {
        await plexMetadataPut(uri, token, key, 'art.clear=1', deps);
        cleared += 1;
    };

    if (mediaType === 'movie') {
        await clearPoster(ratingKey);
        if (scope === 'all' || scope === 'art') {
            try { await clearArt(ratingKey); } catch { /* art may not exist */ }
        }
        return { ok: true, cleared };
    }

    if (mediaType === 'show') {
        await clearPoster(ratingKey);
        if (scope === 'all' || scope === 'art') {
            try { await clearArt(ratingKey); } catch { /* ignore */ }
        }
        if (scope === 'seasons' || scope === 'episodes' || scope === 'all') {
            const seasons = await fetchPlexChildren(uri, token, ratingKey, deps);
            for (const season of seasons) {
                const seasonKey = String(season.ratingKey || '').trim();
                if (!seasonKey) continue;
                if (scope === 'seasons' || scope === 'all') {
                    await clearPoster(seasonKey);
                }
                if (scope === 'episodes' || scope === 'all') {
                    const episodes = await fetchPlexChildren(uri, token, seasonKey, deps);
                    for (const episode of episodes) {
                        const episodeKey = String(episode.ratingKey || '').trim();
                        if (!episodeKey) continue;
                        await clearPoster(episodeKey);
                    }
                }
            }
        }
    }

    return { ok: true, cleared };
};

export const fetchJellyfinLibrarySections = async (config, deps) => {
    const { resolveIntegrationUrlForFetch, jellyfinHeaders, fetchWithTimeout } = deps;
    const baseUrl = resolveIntegrationUrlForFetch(config.jellyfinUrl);
    const response = await fetchWithTimeout(`${baseUrl}/Users/Me/Views`, {
        headers: jellyfinHeaders(config.jellyfinApiKey),
    }, 15000);
    const data = response.ok ? await response.json() : { Items: [] };
    return (Array.isArray(data.Items) ? data.Items : [])
        .map((view) => {
            const collectionType = String(view.CollectionType || '').toLowerCase();
            const type = collectionType === 'tvshows' ? 'show' : collectionType === 'movies' ? 'movie' : null;
            if (!type) return null;
            return {
                key: String(view.Id || ''),
                title: String(view.Name || '').trim(),
                type,
                count: Number(view.ChildCount) || 0,
            };
        })
        .filter(Boolean);
};

const JELLYFIN_SORT_MAP = {
    titleAsc: { SortBy: 'SortName', SortOrder: 'Ascending' },
    titleDesc: { SortBy: 'SortName', SortOrder: 'Descending' },
    yearDesc: { SortBy: 'ProductionYear', SortOrder: 'Descending' },
    yearAsc: { SortBy: 'ProductionYear', SortOrder: 'Ascending' },
    addedDesc: { SortBy: 'DateCreated', SortOrder: 'Descending' },
    addedAsc: { SortBy: 'DateCreated', SortOrder: 'Ascending' },
};

export const browseJellyfinLibraryMedia = async (config, deps, options = {}) => {
    const {
        sectionKey = '',
        mediaType = '',
        sort = 'titleAsc',
        start = 0,
        limit = 60,
    } = options;
    const { resolveIntegrationUrlForFetch, jellyfinHeaders, fetchWithTimeout, withBasePath } = deps;
    const baseUrl = resolveIntegrationUrlForFetch(config.jellyfinUrl);
    const sections = await fetchJellyfinLibrarySections(config, deps);
    let targetSections = sections;
    if (sectionKey) {
        targetSections = sections.filter((section) => section.key === String(sectionKey));
    }
    if (mediaType === 'movie' || mediaType === 'show') {
        targetSections = targetSections.filter((section) => section.type === mediaType);
    }
    if (!targetSections.length) {
        return { items: [], total: 0, sections };
    }

    const sortConfig = JELLYFIN_SORT_MAP[normalizeSort(sort)] || JELLYFIN_SORT_MAP.titleAsc;
    const take = Math.min(Math.max(Number(limit) || 60, 1), 120);
    const offset = Math.max(Number(start) || 0, 0);
    const section = targetSections[0];
    const itemType = section.type === 'show' ? 'Series' : 'Movie';
    const params = new URLSearchParams({
        ParentId: section.key,
        IncludeItemTypes: itemType,
        Recursive: section.type === 'movie' ? 'true' : 'false',
        StartIndex: String(offset),
        Limit: String(take),
        SortBy: sortConfig.SortBy,
        SortOrder: sortConfig.SortOrder,
        Fields: 'ProductionYear,DateCreated,PrimaryImageAspectRatio,ImageTags',
    });
    const response = await fetchWithTimeout(`${baseUrl}/Items?${params.toString()}`, {
        headers: jellyfinHeaders(config.jellyfinApiKey),
    }, 20000);
    const data = response.ok ? await response.json() : { Items: [], TotalRecordCount: 0 };
    const items = (Array.isArray(data.Items) ? data.Items : [])
        .map((item) => {
            const mapped = mapJellyfinBrowseItem(config, item, section.type, withBasePath);
            if (!mapped) return null;
            return { ...mapped, librarySection: section.title, librarySectionKey: section.key };
        })
        .filter(Boolean);
    return {
        items,
        total: Number(data.TotalRecordCount) || items.length,
        sections: targetSections,
        sort: normalizeSort(sort),
    };
};

const mapJellyfinBrowseItem = (config, item = {}, mediaType = 'movie', withBasePath) => {
    const id = mediaType === 'show'
        ? String(item.SeriesId || item.Id || '')
        : String(item.Id || '');
    const title = mediaType === 'show'
        ? String(item.SeriesName || item.Name || '').trim()
        : String(item.Name || '').trim();
    if (!id || !title) return null;
    const posterId = mediaType === 'show' ? (item.SeriesId || item.Id) : item.Id;
    const height = mediaType === 'movie' ? 450 : 450;
    const width = mediaType === 'movie' ? 300 : 300;
    return {
        id,
        title,
        year: Number(item.ProductionYear) || null,
        mediaType,
        thumb: posterId,
        thumbUrl: posterId
            ? withBasePath(`/api/jellyfin/image?itemId=${encodeURIComponent(String(posterId))}&width=${width}&height=${height}`)
            : null,
        addedAt: item.DateCreated ? Math.floor(Date.parse(item.DateCreated) / 1000) : 0,
    };
};

export const fetchJellyfinLibraryRecent = async (config, deps, { limit = 120 } = {}) => {
    const { fetchJellyfinItems, withBasePath } = deps;
    const perTypeLimit = Math.max(40, Math.min(limit, 120));
    const [moviesRaw, episodesRaw] = await Promise.all([
        fetchJellyfinItems(config, 'Movie', perTypeLimit).catch(() => []),
        fetchJellyfinItems(config, 'Episode', perTypeLimit).catch(() => []),
    ]);

    const movies = dedupeRecentList(
        (Array.isArray(moviesRaw) ? moviesRaw : [])
            .map((item) => mapJellyfinBrowseItem(config, item, 'movie', withBasePath))
            .filter(Boolean),
        limit,
    );

    const showMap = new Map();
    for (const ep of (Array.isArray(episodesRaw) ? episodesRaw : [])) {
        const mapped = mapJellyfinBrowseItem(config, ep, 'show', withBasePath);
        if (!mapped) continue;
        const key = mapped.title.toLowerCase();
        const existing = showMap.get(key);
        if (!existing || (mapped.addedAt || 0) > (existing.addedAt || 0)) {
            showMap.set(key, mapped);
        }
    }
    const shows = dedupeRecentList([...showMap.values()], limit);
    const items = dedupeRecentList([...movies, ...shows], limit);
    return { movies, shows, items };
};

export const searchJellyfinLibraryMedia = async (config, deps, { query, limit = 40 } = {}) => {
    const q = String(query || '').trim();
    if (!q) return [];
    const { resolveIntegrationUrlForFetch, jellyfinHeaders, fetchWithTimeout, withBasePath } = deps;
    const baseUrl = resolveIntegrationUrlForFetch(config.jellyfinUrl);
    const params = new URLSearchParams({
        SearchTerm: q,
        IncludeItemTypes: 'Movie,Series',
        Limit: String(Math.min(limit, 80)),
        Recursive: 'true',
        Fields: 'ProductionYear,SeriesName,PrimaryImageAspectRatio,ImageTags',
    });
    const response = await fetchWithTimeout(`${baseUrl}/Items?${params.toString()}`, {
        headers: jellyfinHeaders(config.jellyfinApiKey),
    }, 15000);
    const data = response.ok ? await response.json() : { Items: [] };
    const items = Array.isArray(data.Items) ? data.Items : [];
    const results = [];
    for (const item of items) {
        const type = String(item.Type || '').toLowerCase();
        const mediaType = type === 'series' ? 'show' : type === 'movie' ? 'movie' : null;
        if (!mediaType) continue;
        const mapped = mapJellyfinBrowseItem(config, item, mediaType, withBasePath);
        if (mapped) results.push(mapped);
        if (results.length >= limit) break;
    }
    return results;
};
