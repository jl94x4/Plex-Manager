/**
 * Discover music enrichment — Lidarr posters + library rows.
 */

import {
    getArrInstances,
    isArrInstanceReady,
    pickLidarrArtistImage,
} from './arr-service.js';
import { resolveCoverArtUrlForReleaseGroup } from './musicbrainz-client.js';

export const mapLidarrArtistToDiscoverItem = (artist = {}, instance = null) => {
    const mbid = String(artist?.foreignArtistId || '').trim();
    if (!mbid) return null;
    const name = String(artist?.artistName || artist?.name || '').trim();
    if (!name) return null;
    const posterUrl = pickLidarrArtistImage(artist);
    return {
        mbid,
        id: mbid,
        mediaType: 'music',
        type: 'music',
        name,
        title: name,
        overview: artist?.overview || '',
        posterPath: posterUrl,
        posterUrl,
        lidarrLibraryStatus: {
            matched: true,
            artistId: artist?.id,
            instanceId: instance?.id || null,
            instanceName: instance?.name || 'Lidarr',
            source: 'catalog',
        },
    };
};

export const listRecentLidarrArtists = async (config, { limit = 30, fetchImpl = fetch } = {}) => {
    const instances = getArrInstances(config, { type: 'lidarr', enabledOnly: true })
        .filter(isArrInstanceReady);
    if (!instances.length) return [];

    const fetchOpts = { fetchImpl, timeoutMs: 15000 };
    const { fetchArrInstanceCatalogItems } = await import('./arr-service.js');
    const rows = [];
    for (const instance of instances) {
        const list = await fetchArrInstanceCatalogItems(instance, fetchOpts);
        for (const artist of (Array.isArray(list) ? list : [])) {
            const mapped = mapLidarrArtistToDiscoverItem(artist, instance);
            if (mapped) rows.push({ ...mapped, dateAdded: artist?.added || artist?.dateAdded || null });
        }
    }
    rows.sort((a, b) => String(b.dateAdded || '').localeCompare(String(a.dateAdded || '')));
    return rows.slice(0, Math.max(1, limit));
};

/**
 * Attach poster URLs to MusicBrainz search hits (Lidarr catalog first, then CAA).
 */
export const enrichMusicSearchPosters = async (results = [], {
    config = {},
    fetchImpl = fetch,
    maxCoverLookups = 8,
    catalogByMbid = null,
} = {}) => {
    const list = Array.isArray(results) ? results : [];
    if (!list.length) return list;

    let catalog = catalogByMbid;
    if (!catalog) {
        catalog = new Map();
        const instances = getArrInstances(config, { type: 'lidarr', enabledOnly: true })
            .filter(isArrInstanceReady);
        if (instances.length) {
            const { fetchArrInstanceCatalogItems } = await import('./arr-service.js');
            for (const instance of instances) {
                const artists = await fetchArrInstanceCatalogItems(instance, { fetchImpl, timeoutMs: 12000 }).catch(() => []);
                for (const artist of (Array.isArray(artists) ? artists : [])) {
                    const mbid = String(artist?.foreignArtistId || '').trim();
                    if (mbid && !catalog.has(mbid)) {
                        catalog.set(mbid, { artist, instance });
                    }
                }
            }
        }
    }

    let coverBudget = maxCoverLookups;
    const enriched = [];
    for (const hit of list) {
        const mbid = String(hit?.mbid || hit?.id || '').trim();
        if (!mbid) {
            enriched.push(hit);
            continue;
        }
        const inLibrary = catalog.get(mbid);
        if (inLibrary?.artist) {
            const posterUrl = pickLidarrArtistImage(inLibrary.artist);
            enriched.push({
                ...hit,
                posterPath: posterUrl || hit.posterPath,
                posterUrl: posterUrl || hit.posterUrl,
                lidarrLibraryStatus: {
                    matched: true,
                    artistId: inLibrary.artist.id,
                    instanceId: inLibrary.instance?.id || null,
                    source: 'catalog',
                },
            });
            continue;
        }
        if (coverBudget > 0 && !hit.posterPath && !hit.posterUrl) {
            coverBudget -= 1;
            const posterUrl = await resolveCoverArtUrlForReleaseGroup(null, { mbid, fetchImpl }).catch(() => null);
            enriched.push({
                ...hit,
                posterPath: posterUrl || hit.posterPath,
                posterUrl: posterUrl || hit.posterUrl,
            });
            continue;
        }
        enriched.push(hit);
    }
    return enriched;
};
