/**
 * MusicBrainz metadata for Discover music search & requests.
 * https://musicbrainz.org/doc/MusicBrainz_API
 */

const DEFAULT_USER_AGENT = 'ServerPortal/1.0 (https://github.com/)';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let lastRequestAt = 0;

const throttleMusicBrainz = async () => {
    const now = Date.now();
    const wait = Math.max(0, 1100 - (now - lastRequestAt));
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
};

const musicBrainzFetch = async (path, { fetchImpl = fetch, userAgent = DEFAULT_USER_AGENT } = {}) => {
    await throttleMusicBrainz();
    const url = path.startsWith('http')
        ? path
        : `https://musicbrainz.org/ws/2${path.startsWith('/') ? path : `/${path}`}`;
    const response = await fetchImpl(url, {
        headers: {
            Accept: 'application/json',
            'User-Agent': userAgent,
        },
    });
    if (!response.ok) {
        const err = new Error(`MusicBrainz request failed (${response.status})`);
        err.status = response.status;
        throw err;
    }
    return response.json();
};

const mapArtistSearchHit = (entry = {}) => {
    const mbid = String(entry?.id || '').trim();
    if (!mbid) return null;
    const name = String(entry?.name || entry?.['artist-credit']?.[0]?.name || '').trim();
    if (!name) return null;
    const disambiguation = String(entry.disambiguation || '').trim() || null;
    const tags = Array.isArray(entry.tags)
        ? entry.tags.map((t) => t?.name).filter(Boolean).slice(0, 5)
        : [];
    return {
        mbid,
        id: mbid,
        mediaType: 'music',
        type: 'music',
        name,
        title: name,
        disambiguation,
        country: entry.country || null,
        tags,
        posterPath: null,
        overview: disambiguation || (tags.length ? tags.join(', ') : ''),
    };
};

export const searchMusicBrainzArtists = async (query, {
    limit = 20,
    fetchImpl = fetch,
    userAgent = DEFAULT_USER_AGENT,
} = {}) => {
    const q = String(query || '').trim();
    if (q.length < 2) return { results: [], total: 0 };
    const encoded = encodeURIComponent(q);
    const payload = await musicBrainzFetch(
        `/artist?query=${encoded}&limit=${Math.min(50, Math.max(1, limit))}&fmt=json`,
        { fetchImpl, userAgent },
    );
    const artists = Array.isArray(payload?.artists) ? payload.artists : [];
    const results = artists.map(mapArtistSearchHit).filter(Boolean);
    return {
        results,
        total: Number(payload?.['artist-count']) || results.length,
    };
};

const resolveCoverArtUrl = async (releaseGroupId, { fetchImpl = fetch, mbid = null } = {}) => {
    const id = String(releaseGroupId || '').trim();
    if (!id && !mbid) return null;
    try {
        await throttleMusicBrainz();
        if (id) {
            const response = await fetchImpl(`https://coverartarchive.org/release-group/${encodeURIComponent(id)}`, {
                headers: { Accept: 'application/json' },
            });
            if (response.ok) {
                const payload = await response.json().catch(() => null);
                const front = (payload?.images || []).find((img) => img.front) || payload?.images?.[0];
                const url = front?.thumbnails?.small || front?.thumbnails?.['250'] || front?.image || null;
                if (url) return url;
            }
        }
        if (mbid) {
            const detail = await musicBrainzFetch(
                `/artist/${encodeURIComponent(mbid)}?inc=release-groups&fmt=json`,
                { fetchImpl },
            );
            const releaseGroups = Array.isArray(detail?.['release-groups']) ? detail['release-groups'] : [];
            const primaryRg = releaseGroups.find((rg) => rg['primary-type'] === 'Album') || releaseGroups[0];
            if (primaryRg?.id) {
                return resolveCoverArtUrl(primaryRg.id, { fetchImpl });
            }
        }
    } catch {
        return null;
    }
    return null;
};

export const resolveCoverArtUrlForReleaseGroup = resolveCoverArtUrl;

export const fetchMusicBrainzArtist = async (mbid, {
    fetchImpl = fetch,
    userAgent = DEFAULT_USER_AGENT,
} = {}) => {
    const id = String(mbid || '').trim();
    if (!id) return null;
    const payload = await musicBrainzFetch(
        `/artist/${encodeURIComponent(id)}?inc=tags+aliases+url-rels+release-groups&fmt=json`,
        { fetchImpl, userAgent },
    );
    if (!payload?.id) return null;
    const name = String(payload.name || '').trim();
    const disambiguation = String(payload.disambiguation || '').trim() || null;
    const tags = Array.isArray(payload.tags)
        ? payload.tags.sort((a, b) => (b.count || 0) - (a.count || 0)).map((t) => t.name).filter(Boolean).slice(0, 8)
        : [];
    const releaseGroups = Array.isArray(payload['release-groups']) ? payload['release-groups'] : [];
    const primaryRg = releaseGroups.find((rg) => rg['primary-type'] === 'Album') || releaseGroups[0];
    const posterUrl = primaryRg?.id
        ? await resolveCoverArtUrl(primaryRg.id, { fetchImpl })
        : null;
    const overviewParts = [
        disambiguation,
        payload.area?.name ? `From ${payload.area.name}` : null,
        payload['life-span']?.begin ? `Active since ${payload['life-span'].begin}` : null,
        tags.length ? tags.join(', ') : null,
    ].filter(Boolean);

    return {
        mbid: payload.id,
        id: payload.id,
        mediaType: 'music',
        type: 'music',
        name,
        title: name,
        disambiguation,
        overview: overviewParts.join(' · ') || '',
        tags,
        posterUrl,
        posterPath: posterUrl,
        releaseGroupCount: releaseGroups.length,
        country: payload.country || payload.area?.name || null,
    };
};
