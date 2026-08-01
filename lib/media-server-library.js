/** Recently-added and search helpers for Poster Sets Library tab. */

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
