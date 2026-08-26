export const PLEX_TRACK_MATCH_BATCH = 4;
export const PLEX_TRACK_MATCH_CONCURRENCY = 2;
export const PLEX_CACHE_LOOKUP_BATCH = 80;

export const isSpotifySyncTimeoutError = (error) => {
    const status = Number(error?.status);
    if (status === 408 || status === 504 || status === 524) return true;
    return /timed out|timeout|aborted|504|524/i.test(String(error?.message || error || ''));
};

export const runPool = async (items, concurrency, worker) => {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return [];
    const limit = Math.max(1, Math.min(list.length, Number(concurrency) || 1));
    const results = new Array(list.length);
    let next = 0;
    const run = async () => {
        while (next < list.length) {
            const index = next;
            next += 1;
            results[index] = await worker(list[index], index);
        }
    };
    await Promise.all(Array.from({ length: limit }, () => run()));
    return results;
};

export const normalizeSpotifyTracks = (data) => {
    const tracks = Array.isArray(data?.tracks)
        ? data.tracks
        : (Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []));
    return tracks
        .filter((track) => track && (track.id || track.title || track.name))
        .map((track) => ({
            id: String(track.id || ''),
            title: String(track.title || track.name || ''),
            artists: Array.isArray(track.artists)
                ? track.artists.map((artist) => (typeof artist === 'string' ? artist : String(artist?.name || ''))).filter(Boolean)
                : (track.artist ? [String(track.artist)] : []),
            album: String(track.album || ''),
            album_id: String(track.album_id || track.albumId || 'unknown'),
        }));
};

export const toPlexSearchItems = (tracks = []) => tracks.map((track) => ({
    id: track.id,
    title: track.title,
    artists: track.artists,
    album: track.album,
    album_id: track.album_id,
}));

export const mergeSearchResults = (cached = [], searched = []) => {
    const byId = new Map();
    for (const item of [...cached, ...searched]) {
        if (!item) continue;
        const key = String(item.id || `${item.title || ''}|${item.artist || ''}`);
        if (!byId.has(key)) byId.set(key, item);
    }
    return [...byId.values()];
};

export const matchedPlexItems = (results = []) => {
    const items = [];
    for (const row of results) {
        const first = Array.isArray(row?.result) ? row.result[0] : null;
        if (first?.id) items.push({ key: first.id, source: first.source });
    }
    return items;
};

export const chunkItems = (items = [], size = PLEX_TRACK_MATCH_BATCH) => {
    const out = [];
    const step = Math.max(1, Number(size) || PLEX_TRACK_MATCH_BATCH);
    for (let i = 0; i < items.length; i += step) out.push(items.slice(i, i + step));
    return out;
};

export const matchPlexTrackBatch = async ({
    batch = [],
    type,
    playlistId,
    fetchJson,
    fast = true,
} = {}) => {
    const items = Array.isArray(batch) ? batch : [];
    if (!items.length) return [];
    try {
        const result = await fetchJson({
            path: '/api/plex/tracks',
            method: 'POST',
            body: {
                items,
                type,
                fast: !!fast,
                ...(type === 'spotify-album' ? { album: playlistId } : {}),
            },
            timeoutMs: 80000,
        });
        return Array.isArray(result) ? result : [];
    } catch (error) {
        if (!isSpotifySyncTimeoutError(error)) throw error;
        if (items.length > 1) {
            const mid = Math.ceil(items.length / 2);
            const left = await matchPlexTrackBatch({
                batch: items.slice(0, mid),
                type,
                playlistId,
                fetchJson,
                fast: true,
            });
            const right = await matchPlexTrackBatch({
                batch: items.slice(mid),
                type,
                playlistId,
                fetchJson,
                fast: true,
            });
            return [...left, ...right];
        }
        return [{ id: items[0]?.id, result: [] }];
    }
};

const asSavedItem = (data, id) => {
    if (Array.isArray(data)) return data.find((item) => item?.id === id) || data[0] || null;
    if (data && typeof data === 'object' && data.id) return data;
    return null;
};

export const syncSpotifyPlaylistToPlex = async ({
    id,
    fetchJson,
    onProgress = () => {},
    fast = true,
} = {}) => {
    const playlistId = String(id || '').trim();
    if (!playlistId) throw new Error('Playlist id is required.');
    if (typeof fetchJson !== 'function') throw new Error('Spotify Sync worker client is missing.');

    onProgress({ stage: 'load', message: 'Loading Spotify tracks…', done: 0, total: 0 });
    const saved = await fetchJson({
        path: `/api/saved-items?id=${encodeURIComponent(playlistId)}`,
        timeoutMs: 30000,
    });
    const savedItem = asSavedItem(saved, playlistId);
    if (!savedItem?.id) {
        throw new Error('Save this playlist first, then sync it to Plex.');
    }

    const spotifyData = await fetchJson({
        path: `/api/spotify/items/${encodeURIComponent(playlistId)}?full=1`,
        timeoutMs: 120000,
    });
    const tracks = normalizeSpotifyTracks(spotifyData);
    if (!tracks.length) {
        throw new Error('Spotify returned no tracks for this playlist.');
    }

    const searchItems = toPlexSearchItems(tracks);
    onProgress({ stage: 'cache', message: 'Checking Plex match cache…', done: 0, total: tracks.length });
    const cached = [];
    for (const cacheBatch of chunkItems(searchItems, PLEX_CACHE_LOOKUP_BATCH)) {
        try {
            const cachedResult = await fetchJson({
                path: '/api/plex/cached',
                method: 'POST',
                body: { items: cacheBatch },
                timeoutMs: 60000,
            });
            if (Array.isArray(cachedResult)) cached.push(...cachedResult);
        } catch {
            // Keep matching even if a cache lookup times out.
        }
    }

    const cachedIds = new Set(cached.map((item) => item?.id).filter(Boolean));
    const remaining = searchItems.filter((item) => !cachedIds.has(item.id));
    const searched = [];
    const type = savedItem.type === 'spotify-album' ? 'spotify-album' : 'spotify-playlist';
    let completed = 0;

    onProgress({
        stage: 'match',
        message: cached.length
            ? `Matching tracks in Plex (${cached.length}/${tracks.length} cached)…`
            : `Matching tracks in Plex (0/${tracks.length})…`,
        done: cached.length,
        total: tracks.length,
    });

    await runPool(chunkItems(remaining, PLEX_TRACK_MATCH_BATCH), PLEX_TRACK_MATCH_CONCURRENCY, async (batch) => {
        const batchResult = await matchPlexTrackBatch({
            batch,
            type,
            playlistId,
            fetchJson,
            fast,
        });
        if (Array.isArray(batchResult)) searched.push(...batchResult);
        completed += batch.length;
        onProgress({
            stage: 'match',
            message: `Matching tracks in Plex (${cached.length + completed}/${tracks.length})…`,
            done: cached.length + completed,
            total: tracks.length,
        });
        return batchResult;
    });

    const matches = mergeSearchResults(cached, searched);
    const plexItems = matchedPlexItems(matches);
    if (!plexItems.length) {
        throw new Error('None of these tracks were found in your Plex music library.');
    }

    const title = String(savedItem.title || spotifyData?.title || playlistId);
    const thumb = String(savedItem.image || spotifyData?.image || '');
    const payload = {
        type,
        id: playlistId,
        name: title,
        thumb,
        items: plexItems,
    };

    onProgress({ stage: 'write', message: 'Writing playlist to Plex…', done: tracks.length, total: tracks.length });
    let existing = null;
    try {
        existing = await fetchJson({
            path: `/api/playlists/${encodeURIComponent(playlistId)}`,
            timeoutMs: 30000,
        });
    } catch (error) {
        if (Number(error?.status) !== 404) throw error;
    }

    const result = existing?.id
        ? await fetchJson({
            path: `/api/playlists/${encodeURIComponent(playlistId)}`,
            method: 'PUT',
            body: payload,
            timeoutMs: 120000,
        })
        : await fetchJson({
            path: '/api/playlists',
            method: 'POST',
            body: payload,
            timeoutMs: 120000,
        });

    const matched = plexItems.length;
    const missing = Math.max(0, tracks.length - matched);
    return {
        ok: true,
        created: !existing?.id,
        id: playlistId,
        title,
        matched,
        missing,
        total: tracks.length,
        plexId: result?.id || existing?.id || null,
        link: result?.link || existing?.link || '',
        message: existing?.id
            ? `Updated “${title}” on Plex (${matched}/${tracks.length} tracks).`
            : `Created “${title}” on Plex (${matched}/${tracks.length} tracks).`,
    };
};

export const savedPlaylistIds = (items = []) => asItemArrayLike(items)
    .filter((item) => item?.id && item.type !== 'plex-media')
    .map((item) => String(item.id));

const asItemArrayLike = (data) => (Array.isArray(data) ? data : []);

export const summarizePlaylistSyncResults = (results = []) => {
    const ok = results.filter((item) => item?.ok);
    const failed = results.filter((item) => !item?.ok);
    const matched = ok.reduce((sum, item) => sum + Number(item.matched || 0), 0);
    const missing = ok.reduce((sum, item) => sum + Number(item.missing || 0), 0);
    let message = '';
    if (!results.length) message = 'No playlists to sync. Save a Spotify playlist first.';
    else if (results.length === 1) message = ok[0]?.message || failed[0]?.error || 'Sync failed.';
    else if (failed.length) {
        message = `Synced ${ok.length} playlist${ok.length === 1 ? '' : 's'} to Plex, ${failed.length} failed: ${failed[0].error}`;
    } else {
        message = `Synced ${ok.length} playlists to Plex (${matched} matched, ${missing} missing).`;
    }
    return {
        ok: results.length > 0 && failed.length === 0,
        results,
        matched,
        missing,
        message,
    };
};

export const syncSpotifyPlaylistsToPlex = async ({
    ids,
    all = false,
    fetchJson,
    onProgress = () => {},
    fast = true,
} = {}) => {
    let list = Array.isArray(ids) ? ids.map((value) => String(value || '').trim()).filter(Boolean) : [];
    if (!list.length && all) {
        const saved = await fetchJson({ path: '/api/saved-items', timeoutMs: 30000 });
        list = savedPlaylistIds(saved);
    }
    if (!list.length) return summarizePlaylistSyncResults([]);
    const results = [];
    for (const id of list) {
        onProgress({ stage: 'playlist', id, message: `Syncing ${id} to Plex…` });
        try {
            results.push(await syncSpotifyPlaylistToPlex({ id, fetchJson, onProgress, fast }));
        } catch (error) {
            results.push({ ok: false, id, error: error?.message || String(error) });
        }
    }
    return summarizePlaylistSyncResults(results);
};
