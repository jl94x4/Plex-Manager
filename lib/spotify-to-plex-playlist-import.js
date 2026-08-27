export const likedSongsItemId = (userId) => `liked-${String(userId || '').trim()}`;

export const isAlreadyAddedError = (message) => /already added/i.test(String(message || ''));

export const asItemArray = (data) => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.playlists)) return data.playlists;
    return [];
};

export const fetchSpotifyAccountPlaylistPages = async (fetchPage, { limit = 50, maxPages = 40 } = {}) => {
    const all = [];
    const seen = new Set();
    const pageSize = Math.max(1, Number(limit) || 50);
    const pages = Math.max(1, Number(maxPages) || 40);
    for (let page = 0; page < pages; page += 1) {
        const offset = page * pageSize;
        const data = await fetchPage({ limit: pageSize, offset });
        const items = asItemArray(data);
        let added = 0;
        for (const item of items) {
            const id = String(item?.id || item?.uri || '');
            if (!id || seen.has(id)) continue;
            seen.add(id);
            all.push(item);
            added += 1;
        }
        const total = Number(data?.total);
        if (items.length < pageSize) break;
        if (Number.isFinite(total) && all.length >= total) break;
        if (!added) break;
    }
    return all;
};

export const savedItemIdSet = (items) => new Set(
    asItemArray(items).map((item) => String(item?.id || '')).filter(Boolean),
);

export const buildLikedSongsPlaylist = (user = {}, { savedIds } = {}) => {
    const userId = String(user.id || '').trim();
    const name = String(user.name || user.label || userId).trim() || userId;
    const id = likedSongsItemId(userId);
    return {
        id,
        title: 'Liked Songs',
        liked: true,
        private: true,
        owner: name,
        userId,
        image: '',
        search: `${name}:liked`,
        added: savedIds instanceof Set ? savedIds.has(id) : false,
    };
};

export const normalizeSpotifyAccountPlaylists = (raw, { user = {}, savedIds } = {}) => {
    const saved = savedIds instanceof Set ? savedIds : savedItemIdSet(savedIds);
    const userId = String(user.id || '').trim();
    const playlists = asItemArray(raw)
        .filter((item) => item && (item.id || item.uri))
        .map((item) => {
            const id = String(item.id || '').trim();
            return {
                id,
                title: String(item.title || item.name || id),
                liked: false,
                private: !!item.private,
                owner: String(item.owner || ''),
                userId: String(item.user_id || userId),
                image: String(item.image || ''),
                search: `spotify:playlist:${id}`,
                added: item.added === true || saved.has(id),
            };
        });
    if (!userId) return playlists;
    return [buildLikedSongsPlaylist(user, { savedIds: saved }), ...playlists];
};

export const buildSavedItemAddBody = (playlist) => ({
    search: String(playlist?.search || '').trim(),
    ...(playlist?.userId ? { user_id: String(playlist.userId) } : {}),
});
