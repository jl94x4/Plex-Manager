import { resolvePortalUserFromSeerr } from './portal-request/seerrHistoryImport.js';

/** Build a Cookie header from Fetch Set-Cookie values (connect.sid, …). */
export const cookieHeaderFromSetCookie = (headers) => {
    const list = typeof headers?.getSetCookie === 'function'
        ? headers.getSetCookie()
        : (headers?.get?.('set-cookie') ? [headers.get('set-cookie')] : []);
    return (Array.isArray(list) ? list : [])
        .map((entry) => String(entry || '').split(';')[0].trim())
        .filter(Boolean)
        .join('; ');
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
    return {
        id: dto?.id != null ? `seerr:${dto.id}` : null,
        userId: portalUser?.id || null,
        title: dto?.title || media?.title || media?.name || 'Your request',
        year: yearRaw || null,
        mediaType: type,
        tmdbId: Number.isFinite(tmdbId) && tmdbId > 0 ? tmdbId : null,
        meta: {
            requestedByEmail: seerrUser.email || dto?.meta?.requestedByEmail || null,
            requestedByName: seerrUser.displayName || seerrUser.username || dto?.meta?.requestedByName || null,
            requestedByPlexId: seerrUser.plexId != null ? seerrUser.plexId : null,
            seerrRequestId: dto?.id ?? null,
            mediaStatus: dto?.mediaStatus ?? media?.status ?? null,
        },
    };
};
