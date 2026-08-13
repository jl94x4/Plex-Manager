import { resolvePortalUserFromSeerr } from './portal-request/seerrHistoryImport.js';

const collectSetCookieValues = (headers) => {
    if (!headers) return [];

    if (typeof headers.getSetCookie === 'function') {
        const list = headers.getSetCookie();
        if (Array.isArray(list) && list.length) return list;
    }

    if (typeof headers.raw === 'function') {
        try {
            const raw = headers.raw();
            const list = raw?.['set-cookie'] || raw?.['Set-Cookie'];
            if (Array.isArray(list) && list.length) return list;
        } catch {
            // ignore non-node-fetch header bags
        }
    }

    if (typeof headers.get === 'function') {
        const single = headers.get('set-cookie');
        if (single) return [single];
    }

    if (typeof headers.forEach === 'function') {
        const found = [];
        headers.forEach((value, key) => {
            if (String(key).toLowerCase() === 'set-cookie' && value) found.push(value);
        });
        if (found.length) return found;
    }

    return [];
};

/** Build a Cookie header from Fetch Set-Cookie values (connect.sid, …). */
export const cookieHeaderFromSetCookie = (headers) => collectSetCookieValues(headers)
    .map((entry) => String(entry || '').split(';')[0].trim())
    .filter(Boolean)
    .join('; ');

const PLACEHOLDER_TITLES = new Set(['your request', 'new request', 'unknown title']);

/** First non-empty title that is not a generic fallback label. */
export const firstRealMediaTitle = (...values) => {
    for (const value of values) {
        const text = String(value || '').trim();
        if (!text) continue;
        if (PLACEHOLDER_TITLES.has(text.toLowerCase())) continue;
        return text;
    }
    return '';
};

/**
 * Seerr approve/decline responses include `media` / `requestedBy` but usually
 * omit the movie/show name. Prefer the enriched GET /request DTO title.
 */
export const mergeSeerrLifecycleSource = (result, existing) => {
    if (!result && !existing) return {};
    if (!existing) return result || {};
    if (!result) return existing;
    const title = firstRealMediaTitle(
        result.title,
        result.name,
        result.media?.title,
        result.media?.name,
        existing.title,
        existing.name,
        existing.media?.title,
        existing.media?.name,
    );
    return {
        ...existing,
        ...result,
        ...(title ? { title } : {}),
        posterPath: result.posterPath || existing.posterPath || result.media?.posterPath || existing.media?.posterPath,
        posterUrl: result.posterUrl || existing.posterUrl,
        media: { ...(existing.media || {}), ...(result.media || {}) },
        requestedBy: result.requestedBy || existing.requestedBy,
        meta: { ...(existing.meta || {}), ...(result.meta || {}) },
    };
};

/** Map a Seerr request payload onto the portal lifecycle notify record shape. */
export const mapSeerrRequestToLifecycleRecord = (dto = {}, portalUsers = []) => {
    const seerrUser = dto?.requestedBy && typeof dto.requestedBy === 'object'
        ? dto.requestedBy
        : {};
    const media = dto?.media && typeof dto.media === 'object' ? dto.media : {};
    const portalUser = resolvePortalUserFromSeerr(seerrUser, portalUsers);
    const type = dto?.type === 'tv' || media?.mediaType === 'tv' || media?.type === 'tv'
        ? 'tv'
        : 'movie';
    const tmdbId = Number(dto?.tmdbId ?? media?.tmdbId ?? media?.id);
    const yearRaw = dto?.year
        || String(media?.releaseDate || media?.firstAirDate || '').slice(0, 4)
        || null;
    const posterPath = dto?.posterPath || media?.posterPath || media?.poster || null;
    const posterUrl = dto?.posterUrl || null;
    return {
        id: dto?.id != null ? `seerr:${dto.id}` : null,
        userId: portalUser?.id || null,
        title: firstRealMediaTitle(dto?.title, dto?.name, media?.title, media?.name) || 'Your request',
        year: yearRaw || null,
        mediaType: type,
        tmdbId: Number.isFinite(tmdbId) && tmdbId > 0 ? tmdbId : null,
        posterPath: posterPath || null,
        posterUrl: posterUrl || null,
        meta: {
            requestedByEmail: seerrUser.email || dto?.meta?.requestedByEmail || null,
            requestedByName: seerrUser.displayName || seerrUser.username || dto?.meta?.requestedByName || null,
            requestedByPlexId: seerrUser.plexId != null ? seerrUser.plexId : null,
            seerrRequestId: dto?.id ?? null,
            mediaStatus: dto?.mediaStatus ?? media?.status ?? null,
        },
    };
};
