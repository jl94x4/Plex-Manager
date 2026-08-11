/**
 * Resolve the signed-in user's current media-server session for Discover "Now Playing".
 */

import { extractTmdbIdFromPlexItem } from '../discovery-because-you-watched.js';

const normalize = (value) => String(value || '').trim().toLowerCase();

export const isDiscoverNowPlayingEnabled = (config = {}) => config?.discoverNowPlayingEnabled !== false;

export const userAllowsDiscoverNowPlaying = (user = {}) => user?.showDiscoverNowPlaying !== false;

const pickPlexTmdbId = (metadata = {}) => {
    const fromEpisode = extractTmdbIdFromPlexItem(metadata);
    if (fromEpisode) return fromEpisode;
    // Some sessions only expose grandparentGuid as a string.
    const gp = String(metadata.grandparentGuid || '');
    const match = gp.match(/(?:tmdb|themoviedb):\/\/(\d+)/i);
    return match ? Number(match[1]) : null;
};

const pickJellyfinTmdbId = (item = {}) => {
    const providers = item.ProviderIds || {};
    const raw = providers.Tmdb || providers.tmdb || providers.TMDB;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
};

export const mapPlexSessionToNowPlaying = (metadata = {}, { thumbBase = '' } = {}) => {
    const type = String(metadata.type || '').toLowerCase();
    const isEpisode = type === 'episode';
    const mediaType = isEpisode ? 'tv' : (type === 'movie' ? 'movie' : null);
    if (!mediaType) return null;

    const season = isEpisode ? Number(metadata.parentIndex) : null;
    const episode = isEpisode ? Number(metadata.index) : null;
    const duration = Number(metadata.duration || 0);
    const viewOffset = Number(metadata.viewOffset || 0);
    const progress = duration > 0 ? Math.min(100, Math.max(0, (viewOffset / duration) * 100)) : 0;
    const tmdbId = pickPlexTmdbId(metadata);
    const title = isEpisode
        ? (metadata.grandparentTitle || metadata.title || 'Unknown show')
        : (metadata.title || 'Unknown movie');
    const thumbPath = metadata.grandparentThumb || metadata.parentThumb || metadata.thumb || '';
    const thumbUrl = thumbPath && thumbBase
        ? `${thumbBase}${thumbPath}${thumbPath.includes('?') ? '&' : '?'}X-Plex-Token=`
        : '';

    return {
        mediaType,
        tmdbId: Number.isFinite(tmdbId) && tmdbId > 0 ? tmdbId : null,
        title: String(title),
        episodeTitle: isEpisode ? String(metadata.title || '') : null,
        season: Number.isFinite(season) && season > 0 ? season : null,
        episode: Number.isFinite(episode) && episode > 0 ? episode : null,
        progress,
        state: String(metadata.Player?.state || 'playing').toLowerCase(),
        ratingKey: String(metadata.grandparentRatingKey || metadata.ratingKey || ''),
        sourceRatingKey: String(metadata.ratingKey || ''),
        thumbPath: thumbPath || null,
        sessionId: String(metadata.Session?.id || metadata.sessionKey || ''),
    };
};

export const mapJellyfinSessionToNowPlaying = (session = {}) => {
    const item = session.NowPlayingItem || null;
    if (!item) return null;
    const type = String(item.Type || '');
    const isEpisode = type === 'Episode';
    const isMovie = type === 'Movie';
    if (!isEpisode && !isMovie) return null;

    const playState = session.PlayState || {};
    const runtime = Number(item.RunTimeTicks || 0) / 10000;
    const position = Number(playState.PositionTicks || 0) / 10000;
    const progress = runtime > 0 ? Math.min(100, Math.max(0, (position / runtime) * 100)) : 0;
    const tmdbId = isEpisode
        ? (pickJellyfinTmdbId({ ProviderIds: item.ProviderIds }) // episode may have series in SeriesId only
            || null)
        : pickJellyfinTmdbId(item);

    // Prefer series TMDB for episodes when episode ProviderIds are episode-scoped.
    let seriesTmdb = tmdbId;
    if (isEpisode && item.SeriesId && !seriesTmdb) {
        seriesTmdb = null;
    }

    return {
        mediaType: isEpisode ? 'tv' : 'movie',
        tmdbId: seriesTmdb,
        jellyfinSeriesId: isEpisode ? (item.SeriesId || null) : null,
        jellyfinItemId: item.Id || null,
        title: isEpisode
            ? String(item.SeriesName || item.Name || 'Unknown show')
            : String(item.Name || 'Unknown movie'),
        episodeTitle: isEpisode ? String(item.Name || '') : null,
        season: isEpisode && Number.isFinite(Number(item.ParentIndexNumber))
            ? Number(item.ParentIndexNumber)
            : null,
        episode: isEpisode && Number.isFinite(Number(item.IndexNumber))
            ? Number(item.IndexNumber)
            : null,
        progress,
        state: playState.IsPaused ? 'paused' : 'playing',
        sessionId: String(session.Id || ''),
        providerIds: item.ProviderIds || {},
    };
};

export const sessionBelongsToPlexUser = (metadata = {}, { accountId = null, username = '', email = '' } = {}) => {
    const user = metadata.User || {};
    if (accountId != null && String(user.id) === String(accountId)) return true;
    const title = normalize(user.title);
    if (username && title && title === normalize(username)) return true;
    if (email && title && title === normalize(email)) return true;
    return false;
};

export const sessionBelongsToJellyfinUser = (session = {}, { jellyfinId = null, username = '' } = {}) => {
    if (jellyfinId && String(session.UserId) === String(jellyfinId)) return true;
    if (username && normalize(session.UserName) === normalize(username)) return true;
    return false;
};

export default {
    isDiscoverNowPlayingEnabled,
    userAllowsDiscoverNowPlaying,
    mapPlexSessionToNowPlaying,
    mapJellyfinSessionToNowPlaying,
    sessionBelongsToPlexUser,
    sessionBelongsToJellyfinUser,
};
