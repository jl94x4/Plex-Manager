/**
 * Portal-native request helpers (Phases 5–7).
 * Phase 5: create / list / cancel pending JSON requests.
 * Phase 6: admin approve → *arr push, decline / retry / delete.
 * Phase 7: sync mediaStatus / isDownloading from *arr.
 */

import {
    addRadarrMovie,
    addSonarrSeries,
    fetchArrInstance,
    pickArrPosterUrl,
} from '../arr-service.js';
import {
    buildTmdbBackdropUrl,
    buildTmdbPosterUrl,
    buildMemberSeasonOptions,
    countMemberRequests,
    filterMemberRequestTab,
    seerrRequestStatusLabel,
} from '../request-app-service.js';
import { createTmdbClient } from './tmdbClient.js';
import { createJsonRequestStore } from './requestStore.js';
import { createLibraryAvailability } from './libraryAvailability.js';
import {
    clearPortalArrServiceOptionsCache,
    getPortalArrServiceOptions,
    listPortalArrServers,
    resolvePortalArrInstance,
} from './portalArrServices.js';
import { evaluatePortalMemberQuota } from './portalQuota.js';
import {
    canPolicyRequestMedia,
    resolveMemberRequestPolicy,
} from './portalRequestDefaults.js';
import { syncPortalRequestStatuses } from './requestStatusSync.js';
import { resolveTvdbPosterForTmdbShow } from './discoverTvdbPosters.js';

const REQUEST_STATUS_PENDING = 1;
const REQUEST_STATUS_APPROVED = 2;
const REQUEST_STATUS_DECLINED = 3;
const REQUEST_STATUS_FAILED = 4;

const ADMIN_FILTERS = new Set(['pending', 'approved', 'declined', 'processing', 'available', 'failed', 'all']);

const isPortalRequestAvailable = (dto) => {
    if (Number(dto?.status) !== REQUEST_STATUS_APPROVED) return false;
    if (dto?.isDownloading) return false;
    const mediaStatus = Number(dto?.mediaStatus);
    return mediaStatus === 4 || mediaStatus === 5;
};

const isPortalRequestProcessing = (dto) => {
    if (Number(dto?.status) !== REQUEST_STATUS_APPROVED) return false;
    if (isPortalRequestAvailable(dto)) return false;
    if (dto?.isDownloading) return true;
    const mediaStatus = Number(dto?.mediaStatus);
    return !Number.isFinite(mediaStatus) || mediaStatus === 3 || mediaStatus <= 0;
};

const filterAdminRequestTab = (dto, filter) => {
    const status = Number(dto?.status);
    if (!filter || filter === 'all') return true;
    if (filter === 'pending') return status === REQUEST_STATUS_PENDING;
    if (filter === 'declined') return status === REQUEST_STATUS_DECLINED;
    if (filter === 'failed') return status === REQUEST_STATUS_FAILED;
    if (filter === 'available') return isPortalRequestAvailable(dto);
    if (filter === 'processing') return isPortalRequestProcessing(dto);
    if (filter === 'approved') return status === REQUEST_STATUS_APPROVED && !isPortalRequestAvailable(dto);
    return true;
};

const countAdminRequests = (dtos = []) => {
    const counts = {
        pending: 0,
        approved: 0,
        declined: 0,
        processing: 0,
        available: 0,
        failed: 0,
        completed: 0,
        total: 0,
    };
    for (const item of dtos) {
        counts.total += 1;
        const status = Number(item?.status);
        if (status === REQUEST_STATUS_PENDING) counts.pending += 1;
        else if (status === REQUEST_STATUS_DECLINED) counts.declined += 1;
        else if (status === REQUEST_STATUS_FAILED) counts.failed += 1;
        else if (status === REQUEST_STATUS_APPROVED) {
            if (isPortalRequestAvailable(item)) {
                counts.available += 1;
                counts.completed += 1;
            } else {
                counts.approved += 1;
                if (isPortalRequestProcessing(item)) counts.processing += 1;
            }
        }
    }
    return counts;
};

const hasRequestOverrides = (overrides) => {
    if (!overrides || typeof overrides !== 'object') return false;
    return [
        'serverId',
        'profileId',
        'rootFolder',
        'languageProfileId',
        'userId',
        'tags',
        'seasons',
        'arrInstanceId',
    ].some((key) => {
        const value = overrides[key];
        if (Array.isArray(value)) return value.length > 0;
        return value != null && value !== '';
    });
};

const normalizeTagIds = (tags) => (
    Array.isArray(tags)
        ? tags.map((t) => Number(t)).filter((n) => Number.isFinite(n))
        : []
);

/**
 * Ensure advanced routing values exist on the live *arr instance before store/approve/push.
 */
const assertValidArrRouting = async (config, mediaType, routing, fetchOpts) => {
    const profileId = routing.profileId != null && routing.profileId !== ''
        ? Number(routing.profileId)
        : null;
    const rootFolder = routing.rootFolder != null && routing.rootFolder !== ''
        ? String(routing.rootFolder).trim()
        : '';
    const languageProfileId = routing.languageProfileId != null && routing.languageProfileId !== ''
        ? Number(routing.languageProfileId)
        : null;
    const tags = normalizeTagIds(routing.tags);
    const needsCheck = Number.isFinite(profileId)
        || !!rootFolder
        || tags.length > 0;
    if (!needsCheck) return;

    let options;
    try {
        options = await getPortalArrServiceOptions(config, mediaType, routing.serverId, {
            ...fetchOpts,
            arrInstanceId: routing.arrInstanceId || null,
        });
    } catch (error) {
        const err = new Error(error?.message || 'Could not verify *arr routing options.');
        err.status = 502;
        throw err;
    }

    if (Number.isFinite(profileId)) {
        const allowed = new Set((options.profiles || []).map((p) => Number(p.id)));
        if (!allowed.has(profileId)) {
            const err = new Error('Invalid quality profile for the selected *arr server.');
            err.status = 400;
            throw err;
        }
    }

    if (rootFolder) {
        const allowed = new Set(
            (options.rootFolders || [])
                .map((folder) => String(folder?.path || folder || '').trim())
                .filter(Boolean),
        );
        if (!allowed.has(rootFolder)) {
            const err = new Error('Invalid root folder for the selected *arr server.');
            err.status = 400;
            throw err;
        }
    }

    // languageProfileId intentionally not hard-validated — Sonarr v4 deprecated these.

    if (tags.length) {
        const allowed = new Set((options.tags || []).map((t) => Number(t.id)));
        const unknown = tags.filter((id) => !allowed.has(id));
        if (unknown.length) {
            const err = new Error('One or more request tags are not valid on the selected *arr server.');
            err.status = 400;
            throw err;
        }
    }
};

const normalizeGenreNames = (genres) => {
    if (!Array.isArray(genres)) return [];
    const names = [];
    const seen = new Set();
    for (const entry of genres) {
        const name = typeof entry === 'string'
            ? entry.trim()
            : String(entry?.name || '').trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        names.push(name);
    }
    return names;
};

const normalizeOriginalLanguage = (value) => {
    const code = String(value || '').trim().toLowerCase().split(/[-_]/)[0];
    return /^[a-z]{2,3}$/.test(code) ? code : null;
};

export const mapPortalRecordToDto = (record, user = {}) => {
    const status = Number(record?.status) || null;
    const posterPath = record?.posterPath || '';
    const backdropPath = record?.backdropPath || '';
    const seasons = record?.seasons === 'all'
        ? []
        : (Array.isArray(record?.seasons)
            ? record.seasons.map((seasonNumber) => ({ seasonNumber: Number(seasonNumber) }))
            : []);

    const routingParts = [];
    if (record?.profileId) routingParts.push(`Profile #${record.profileId}`);
    if (record?.rootFolder) routingParts.push(record.rootFolder);

    const displayName = user?.username || user?.email || user?.displayName || record?.meta?.requestedByName || 'Member';
    const canRetry = status === REQUEST_STATUS_FAILED
        || (status === REQUEST_STATUS_APPROVED && !!record?.meta?.arrError);

    return {
        id: Number(record?.id),
        status,
        statusLabel: seerrRequestStatusLabel(status),
        type: record?.mediaType === 'tv' ? 'tv' : 'movie',
        is4k: !!record?.is4k,
        title: record?.title || 'Unknown title',
        year: record?.year || null,
        overview: record?.overview || '',
        genres: normalizeGenreNames(record?.genres),
        originalLanguage: normalizeOriginalLanguage(record?.originalLanguage),
        posterUrl: buildTmdbPosterUrl(posterPath),
        backdropUrl: buildTmdbBackdropUrl(backdropPath),
        requestedBy: {
            // Prefer resolved portal user id so admin "Request As" matches /api/requests/users.
            // record.userId may be a plexId / legacy key that is not the dropdown value.
            id: user?.id ?? record?.userId ?? null,
            displayName,
            email: user?.email || record?.meta?.requestedByEmail || null,
            avatar: user?.thumb || user?.avatar || '',
            plexId: user?.plexId ?? null,
            username: user?.username || null,
        },
        modifiedBy: record?.meta?.modifiedBy || null,
        declineReason: record?.meta?.declineReason || null,
        createdAt: record?.createdAt || null,
        updatedAt: record?.updatedAt || null,
        mediaStatus: record?.meta?.mediaStatus ?? null,
        isDownloading: !!record?.meta?.isDownloading,
        seerrUrl: '',
        tmdbId: Number(record?.tmdbId) || null,
        mediaId: record?.meta?.arrEntityId != null ? Number(record.meta.arrEntityId) : null,
        serverId: record?.serverId ?? null,
        profileId: record?.profileId ?? null,
        profileName: record?.meta?.profileName || null,
        rootFolder: record?.rootFolder || null,
        languageProfileId: record?.languageProfileId ?? null,
        tags: Array.isArray(record?.tags) ? record.tags : [],
        seasons,
        routingSummary: routingParts.length ? routingParts.join(' · ') : null,
        canRemove: true,
        canRetry,
        isAnime: !!record?.meta?.isAnime,
        posterPath: posterPath || null,
        canCancel: status === REQUEST_STATUS_PENDING,
        engine: 'portal',
        arrInstanceId: record?.arrInstanceId || record?.meta?.arrInstanceId || null,
        arrError: record?.meta?.arrError || null,
    };
};

const fetchTitleMeta = async (config, mediaType, tmdbId, { fetchImpl = fetch } = {}) => {
    const apiKey = String(config?.tmdbApiKey || '').trim();
    if (!apiKey) {
        return {
            title: mediaType === 'tv' ? `TV ${tmdbId}` : `Movie ${tmdbId}`,
            year: null,
            overview: '',
            genres: [],
            originalLanguage: null,
            posterPath: null,
            backdropPath: null,
        };
    }
    try {
        const client = createTmdbClient({ tmdbApiKey: apiKey, language: 'en' });
        const details = mediaType === 'tv'
            ? await client.tv(tmdbId, { language: 'en' })
            : await client.movie(tmdbId, { language: 'en' });
        const title = mediaType === 'tv' ? (details?.name || `TV ${tmdbId}`) : (details?.title || `Movie ${tmdbId}`);
        const yearSource = mediaType === 'tv' ? details?.firstAirDate : details?.releaseDate;
        let posterPath = details?.posterPath || null;
        // TMDB often has no art for older UK docs — fall back to TheTVDB when configured.
        if (mediaType === 'tv' && !posterPath) {
            const tvdbPoster = await Promise.race([
                resolveTvdbPosterForTmdbShow(config, tmdbId, { fetchImpl }),
                new Promise((resolve) => {
                    setTimeout(() => resolve(null), 2500);
                }),
            ]);
            if (tvdbPoster?.posterPath) posterPath = tvdbPoster.posterPath;
        }
        return {
            title,
            year: yearSource ? String(yearSource).slice(0, 4) : null,
            overview: details?.overview || '',
            genres: normalizeGenreNames(details?.genres),
            originalLanguage: normalizeOriginalLanguage(details?.originalLanguage),
            posterPath,
            backdropPath: details?.backdropPath || null,
        };
    } catch {
        return {
            title: mediaType === 'tv' ? `TV ${tmdbId}` : `Movie ${tmdbId}`,
            year: null,
            overview: '',
            genres: [],
            originalLanguage: null,
            posterPath: null,
            backdropPath: null,
        };
    }
};

const applyOverridesToRecord = (record, overrides = {}) => {
    if (!hasRequestOverrides(overrides)) return record;
    const next = { ...record };
    if (overrides.serverId != null && overrides.serverId !== '') {
        next.serverId = Number(overrides.serverId);
    }
    if (overrides.arrInstanceId) next.arrInstanceId = String(overrides.arrInstanceId);
    if (overrides.profileId != null && overrides.profileId !== '') {
        next.profileId = Number(overrides.profileId);
        next.qualityProfile = Number(overrides.profileId);
    }
    if (overrides.rootFolder != null && overrides.rootFolder !== '') {
        next.rootFolder = String(overrides.rootFolder);
    }
    if (overrides.languageProfileId != null && overrides.languageProfileId !== '') {
        next.languageProfileId = Number(overrides.languageProfileId);
    }
    if (Array.isArray(overrides.tags)) {
        next.tags = overrides.tags.map((t) => Number(t)).filter((n) => Number.isFinite(n));
    }
    if (Array.isArray(overrides.seasons)) {
        next.seasons = overrides.seasons.map((n) => Number(n)).filter((n) => Number.isFinite(n));
    }
    if (overrides.userId != null && overrides.userId !== '') {
        next.userId = String(overrides.userId);
    }
    return next;
};

/**
 * @param {object} options
 * @param {string} options.dataDir
 * @param {object} options.config
 * @param {(url: string) => string} [options.resolveUrl]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {(id: string) => Promise<object|null>} [options.resolveUser]
 * @param {() => Promise<object[]>} [options.listUsers]
 * @param {(mediaType: string, tmdbId: number) => Promise<boolean>} [options.isBlocked]
 */
export const createPortalRequestService = ({
    dataDir,
    config,
    resolveUrl = (url) => url,
    fetchImpl = fetch,
    resolveUser = async () => null,
    listUsers = async () => [],
    isBlocked = async () => false,
} = {}) => {
    const store = createJsonRequestStore({ dataDir });
    const fetchOpts = { resolveUrl, fetchImpl };

    const persistPosterIfMissing = async (record, posterPath, source = 'tvdb') => {
        if (!record?.id || !posterPath || record.posterPath) return record;
        return store.update(record.id, {
            posterPath,
            meta: {
                ...(record.meta || {}),
                posterSource: source,
            },
        }) || { ...record, posterPath };
    };

    const resolveMissingTvPoster = async (record, { timeoutMs = 2000 } = {}) => {
        if (!record || record.mediaType !== 'tv' || record.posterPath || !(Number(record.tmdbId) > 0)) {
            return record;
        }

        const timed = (promise) => Promise.race([
            promise,
            new Promise((resolve) => {
                setTimeout(() => resolve(null), timeoutMs);
            }),
        ]);

        try {
            const tvdbPoster = await timed(resolveTvdbPosterForTmdbShow(config, record.tmdbId, {
                fetchImpl,
                tvdbIdHint: record?.meta?.tvdbId || record?.tvdbId || null,
            }));
            if (tvdbPoster?.posterPath) {
                return persistPosterIfMissing(record, tvdbPoster.posterPath, 'tvdb');
            }
        } catch {
            // fall through to Sonarr lookup art
        }

        try {
            const instance = resolvePortalArrInstance(
                config,
                'tv',
                record.serverId,
                record.arrInstanceId,
            );
            if (!instance) return record;
            const lookup = await timed(fetchArrInstance(
                instance,
                `/api/v3/series/lookup?term=tmdb:${Number(record.tmdbId)}`,
                { ...fetchOpts, timeoutMs },
            ));
            const rows = Array.isArray(lookup?.data) ? lookup.data : [];
            const hit = rows.find((row) => Number(row?.tmdbId) === Number(record.tmdbId)) || rows[0] || null;
            const poster = pickArrPosterUrl(hit);
            if (poster) return persistPosterIfMissing(record, poster, 'sonarr');
        } catch {
            // keep placeholder
        }
        return record;
    };

    const enrichDto = async (record, { detail = false } = {}) => {
        let working = record;
        // Detail + list-page callers can opt into a short poster backfill.
        if (detail) {
            working = await resolveMissingTvPoster(working, { timeoutMs: 2500 });
        }

        const user = await resolveUser(working?.userId).catch(() => null);
        const dto = mapPortalRecordToDto(working, user || {});

        // Only fetch TMDB seasons for detail/approve views — avoid N+1 on request lists.
        if (detail && dto.type === 'tv' && dto.tmdbId) {
            try {
                const apiKey = String(config?.tmdbApiKey || '').trim();
                if (apiKey) {
                    const client = createTmdbClient({ tmdbApiKey: apiKey, language: 'en' });
                    const details = await client.tv(dto.tmdbId, { language: 'en' });
                    dto.isAnime = !!details?.isAnime;
                    const tvSeasons = Array.isArray(details?.seasons)
                        ? details.seasons
                            .map((season) => {
                                const seasonNumber = Number(season?.seasonNumber);
                                if (!Number.isFinite(seasonNumber) || seasonNumber < 0) return null;
                                return {
                                    seasonNumber,
                                    name: season?.name
                                        || (seasonNumber === 0 ? 'Specials' : `Season ${seasonNumber}`),
                                    episodeCount: Number(season?.episodeCount) || 0,
                                };
                            })
                            .filter(Boolean)
                        : [];
                    dto.tvSeasons = tvSeasons;

                    // record.seasons === 'all' maps to [] in the DTO — expand so approve UI can select.
                    const wantsAll = working?.seasons === 'all'
                        || working?.seasons == null
                        || (Array.isArray(working?.seasons) && working.seasons.length === 0);
                    if (wantsAll && (!Array.isArray(dto.seasons) || dto.seasons.length === 0)) {
                        dto.seasons = tvSeasons
                            .filter((season) => season.seasonNumber > 0)
                            .map((season) => ({ seasonNumber: season.seasonNumber, status: null }));
                    }
                }
            } catch {
                // Keep list DTO fields if TMDB is unavailable.
            }
        }

        return dto;
    };

    const createMemberRequest = async (user, body = {}) => {
        const mediaType = body.mediaType === 'tv' ? 'tv' : 'movie';
        const tmdbId = Number(body.mediaId ?? body.tmdbId);
        if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
            const err = new Error('Invalid mediaId');
            err.status = 400;
            throw err;
        }

        const want4k = !!body.is4k;
        const sessionKey = String(user?.id || user?.plexId || '').trim();
        const resolved = sessionKey ? await resolveUser(sessionKey).catch(() => null) : null;
        const ownerUserId = String(resolved?.id || user?.id || user?.plexId || '').trim();
        const policy = resolveMemberRequestPolicy(config, resolved || user);
        const perm = canPolicyRequestMedia(policy, mediaType, { is4k: want4k });
        if (!perm.ok) {
            const err = new Error(perm.reason || 'You do not have permission to request this media.');
            err.status = 403;
            throw err;
        }
        if (
            body.serverId != null
            || body.profileId != null
            || body.rootFolder
            || body.languageProfileId != null
            || (Array.isArray(body.tags) && body.tags.length)
        ) {
            if (!policy.allowAdvancedRequests) {
                const err = new Error('Advanced request options are disabled.');
                err.status = 403;
                throw err;
            }
        }

        const existing = await store.list({
            userId: ownerUserId,
            mediaType,
            tmdbId,
        });
        // Also catch duplicates filed under a legacy plexId key for the same person.
        const legacyExisting = (!resolved || String(resolved.id) === sessionKey)
            ? []
            : await store.list({ userId: sessionKey, mediaType, tmdbId });
        const candidates = [...existing, ...legacyExisting];
        const duplicate = candidates.find((row) => {
            const status = Number(row?.status);
            if (status === REQUEST_STATUS_DECLINED || status === REQUEST_STATUS_FAILED) return false;
            if (!!row?.is4k !== want4k) return false;
            if (mediaType === 'tv') {
                // Block repeat of the same season set (or another "all" while one is open).
                const incoming = body.seasons ?? 'all';
                const prev = row?.seasons;
                if (incoming === 'all' || prev === 'all') return true;
                if (!Array.isArray(incoming) || !Array.isArray(prev)) return true;
                const want = new Set(incoming.map((n) => Number(n)).filter((n) => Number.isFinite(n)));
                return prev.some((n) => want.has(Number(n)));
            }
            return true;
        });
        if (duplicate) {
            const err = new Error(
                mediaType === 'tv'
                    ? 'You already have an open request for this series (or overlapping seasons).'
                    : 'You already requested this movie.',
            );
            err.status = 409;
            throw err;
        }

        const meta = await fetchTitleMeta(config, mediaType, tmdbId, { fetchImpl });
        if (await isBlocked(mediaType, tmdbId).catch(() => false)) {
            const err = new Error('This title is blacklisted.');
            err.status = 403;
            throw err;
        }
        let arrInstanceId = body.arrInstanceId ? String(body.arrInstanceId) : null;
        let serverId = body.serverId != null ? Number(body.serverId) : null;
        if (!arrInstanceId && Number.isFinite(serverId)) {
            const instance = resolvePortalArrInstance(config, mediaType, serverId, null);
            if (instance) arrInstanceId = instance.id;
        }
        // Without advanced server picks, route HD / UHD to the matching *arr instance.
        if (!arrInstanceId) {
            const servers = listPortalArrServers(config, mediaType);
            const preferred = servers.find((server) => !!server.is4k === want4k)
                || servers.find((server) => server.isDefault)
                || servers[0]
                || null;
            if (preferred?.instanceId) arrInstanceId = preferred.instanceId;
            if (serverId == null && preferred?.id != null) serverId = Number(preferred.id);
        }

        if (policy.allowAdvancedRequests) {
            await assertValidArrRouting(config, mediaType, {
                serverId: Number.isFinite(serverId) ? serverId : null,
                arrInstanceId,
                profileId: body.profileId,
                rootFolder: body.rootFolder,
                languageProfileId: body.languageProfileId,
                tags: body.tags,
            }, fetchOpts);
        }

        const record = await store.create({
            userId: ownerUserId,
            mediaType,
            tmdbId,
            title: meta.title,
            year: meta.year,
            overview: meta.overview,
            genres: meta.genres,
            originalLanguage: meta.originalLanguage,
            posterPath: meta.posterPath,
            backdropPath: meta.backdropPath,
            is4k: want4k,
            seasons: mediaType === 'tv' ? (body.seasons ?? 'all') : [],
            rootFolder: body.rootFolder,
            qualityProfile: body.profileId,
            profileId: body.profileId,
            serverId: Number.isFinite(serverId) ? serverId : null,
            arrInstanceId,
            languageProfileId: body.languageProfileId,
            tags: normalizeTagIds(body.tags),
            status: REQUEST_STATUS_PENDING,
            meta: {
                requestedByName: resolved?.username || user?.username || user?.email || null,
                requestedByEmail: resolved?.email || user?.email || null,
            },
        });

        return mapPortalRecordToDto(record, resolved || user);
    };

    const memberUserIds = (user) => {
        const ids = [user?.id, user?.plexId]
            .map((value) => String(value || '').trim())
            .filter(Boolean);
        return [...new Set(ids)];
    };

    const listMemberRecords = async (user) => {
        const userIds = memberUserIds(user);
        if (!userIds.length) return [];
        return store.list({ userIds });
    };

    const listMemberRequests = async (user, { filter = 'all', take = 20, skip = 0 } = {}) => {
        const records = await listMemberRecords(user);
        const dtos = records.map((record) => mapPortalRecordToDto(record, user));
        const counts = countMemberRequests(dtos);
        const filtered = dtos.filter((item) => filterMemberRequestTab(item, filter));
        const page = filtered.slice(skip, skip + take);
        return {
            userMapped: true,
            results: page,
            counts,
            pageInfo: {
                total: filtered.length,
                take,
                skip,
            },
        };
    };

    const getMemberRequestCounts = async (user) => {
        const records = await listMemberRecords(user);
        const dtos = records.map((record) => mapPortalRecordToDto(record, user));
        return {
            userMapped: true,
            ...countMemberRequests(dtos),
        };
    };

    const cancelMemberRequest = async (user, requestId) => {
        const record = await store.get(requestId);
        if (!record) {
            const err = new Error('Request not found');
            err.status = 404;
            throw err;
        }
        const ownerIds = new Set(memberUserIds(user));
        if (!ownerIds.has(String(record.userId || ''))) {
            const err = new Error('You can only manage your own requests.');
            err.status = 403;
            throw err;
        }
        if (Number(record.status) !== REQUEST_STATUS_PENDING) {
            const err = new Error('Only pending requests can be cancelled.');
            err.status = 400;
            throw err;
        }
        await store.remove(requestId);
        return true;
    };

    const listAdminRequests = async ({ filter = 'pending', take = 20, skip = 0 } = {}) => {
        const safeFilter = ADMIN_FILTERS.has(String(filter)) ? String(filter) : 'pending';
        const records = await store.list();
        const dtos = [];
        for (const record of records) {
            dtos.push(await enrichDto(record));
        }
        const filtered = dtos.filter((item) => filterAdminRequestTab(item, safeFilter));
        const page = filtered.slice(skip, skip + take);

        // Backfill missing TV posters + genres/language for the visible page only (persist for next load).
        const recordById = new Map(records.map((row) => [String(row.id), row]));
        await Promise.all(page.map(async (dto, index) => {
            const record = recordById.get(String(dto.id));
            if (!record) return;

            let updated = record;
            if (dto?.type === 'tv' && !dto?.posterUrl && !dto?.posterPath) {
                updated = await resolveMissingTvPoster(updated, { timeoutMs: 2000 });
            }

            const needsMeta = !(Array.isArray(updated.genres) && updated.genres.length)
                || !normalizeOriginalLanguage(updated.originalLanguage);
            if (needsMeta && Number(updated.tmdbId) > 0 && String(config?.tmdbApiKey || '').trim()) {
                try {
                    const meta = await Promise.race([
                        fetchTitleMeta(config, updated.mediaType === 'tv' ? 'tv' : 'movie', updated.tmdbId, fetchOpts),
                        new Promise((resolve) => {
                            setTimeout(() => resolve(null), 2500);
                        }),
                    ]);
                    if (meta) {
                        const patch = {};
                        if (!(Array.isArray(updated.genres) && updated.genres.length) && meta.genres?.length) {
                            patch.genres = meta.genres;
                        }
                        if (!normalizeOriginalLanguage(updated.originalLanguage) && meta.originalLanguage) {
                            patch.originalLanguage = meta.originalLanguage;
                        }
                        if (!updated.overview && meta.overview) patch.overview = meta.overview;
                        if (!updated.year && meta.year) patch.year = meta.year;
                        if (Object.keys(patch).length) {
                            updated = await store.update(updated.id, patch) || { ...updated, ...patch };
                        }
                    }
                } catch {
                    /* best-effort backfill */
                }
            }

            if (updated !== record) {
                page[index] = mapPortalRecordToDto(updated, {
                    id: dto.requestedBy?.id,
                    username: dto.requestedBy?.displayName,
                    email: dto.requestedBy?.email,
                    thumb: dto.requestedBy?.avatar,
                });
            }
        }));

        const total = filtered.length;
        const pages = Math.max(1, Math.ceil(total / Math.max(1, take)));
        return {
            results: page,
            pageInfo: {
                pages,
                page: Math.floor(skip / Math.max(1, take)) + 1,
                results: total,
            },
        };
    };

    const getAdminRequestCounts = async () => {
        const records = await store.list();
        const dtos = records.map((record) => mapPortalRecordToDto(record));
        return countAdminRequests(dtos);
    };

    const getAdminRequest = async (requestId) => {
        let record = await store.get(requestId);
        if (!record) {
            const err = new Error('Request not found');
            err.status = 404;
            throw err;
        }
        const needsMeta = !(Array.isArray(record.genres) && record.genres.length)
            || !normalizeOriginalLanguage(record.originalLanguage);
        if (needsMeta && Number(record.tmdbId) > 0 && String(config?.tmdbApiKey || '').trim()) {
            try {
                const meta = await fetchTitleMeta(
                    config,
                    record.mediaType === 'tv' ? 'tv' : 'movie',
                    record.tmdbId,
                    fetchOpts,
                );
                const patch = {};
                if (!(Array.isArray(record.genres) && record.genres.length) && meta.genres?.length) {
                    patch.genres = meta.genres;
                }
                if (!normalizeOriginalLanguage(record.originalLanguage) && meta.originalLanguage) {
                    patch.originalLanguage = meta.originalLanguage;
                }
                if (Object.keys(patch).length) {
                    record = await store.update(record.id, patch) || { ...record, ...patch };
                }
            } catch {
                /* best-effort */
            }
        }
        return enrichDto(record, { detail: true });
    };

    const listPortalRequestUsers = async () => {
        const users = await listUsers().catch(() => []);
        return (Array.isArray(users) ? users : []).map((user) => ({
            id: user?.id,
            displayName: user?.username || user?.email || `User ${user?.id}`,
            email: user?.email || null,
            username: user?.username || null,
            plexId: user?.plexId ?? user?.id ?? null,
            avatar: user?.thumb || user?.avatar || null,
        }));
    };

    const pushRecordToArr = async (record) => {
        const mediaType = record.mediaType === 'tv' ? 'tv' : 'movie';
        let profileId = record.profileId != null ? Number(record.profileId) : null;
        let rootFolder = record.rootFolder ? String(record.rootFolder) : '';
        let languageProfileId = record.languageProfileId != null ? Number(record.languageProfileId) : null;
        let tags = Array.isArray(record.tags) ? record.tags : [];

        const instance = resolvePortalArrInstance(
            config,
            mediaType,
            record.serverId,
            record.arrInstanceId,
        );
        if (!instance) {
            return {
                ok: false,
                reason: `No ${mediaType === 'tv' ? 'Sonarr' : 'Radarr'} instance is configured in the portal.`,
            };
        }

        // Fill missing routing from live *arr defaults.
        if (!Number.isFinite(profileId) || !rootFolder) {
            try {
                const options = await Promise.race([
                    getPortalArrServiceOptions(config, mediaType, record.serverId, {
                        ...fetchOpts,
                        arrInstanceId: instance.id,
                        timeoutMs: 8000,
                    }),
                    new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('Timed out loading *arr defaults')), 9000);
                    }),
                ]);
                if (!Number.isFinite(profileId)) {
                    profileId = Number(options.server?.activeProfileId ?? options.profiles[0]?.id);
                }
                if (!rootFolder) {
                    rootFolder = String(options.server?.activeDirectory || options.rootFolders[0]?.path || '');
                }
                if (!Number.isFinite(languageProfileId) && options.languageProfiles?.length) {
                    languageProfileId = Number(options.server?.activeLanguageProfileId ?? options.languageProfiles[0]?.id);
                }
            } catch (error) {
                return {
                    ok: false,
                    reason: error?.message || 'Could not load *arr defaults for this request.',
                };
            }
        }

        // Skip re-validating stored routing on approve/retry — member create already gated
        // advanced options, and a second *arr options round-trip was hanging into blank 502s.

        const servers = listPortalArrServers(config, mediaType);
        const serverMeta = servers.find((entry) => entry.instanceId === instance.id);

        const pushResult = mediaType === 'tv'
            ? await addSonarrSeries(instance, {
                tmdbId: record.tmdbId,
                // Sonarr is TVDB-first; pass config so we can bridge TMDB → TVDB when
                // Sonarr's `tmdb:` lookup misses (common for new shows like Junk or Jackpot?).
                config,
                qualityProfileId: profileId,
                rootFolderPath: rootFolder,
                languageProfileId,
                tags,
                seasons: record.seasons === 'all' ? 'all' : (record.seasons || 'all'),
                search: true,
                ...fetchOpts,
            })
            : await addRadarrMovie(instance, {
                tmdbId: record.tmdbId,
                qualityProfileId: profileId,
                rootFolderPath: rootFolder,
                tags,
                search: true,
                ...fetchOpts,
            });

        if (!pushResult.ok) return pushResult;

        return {
            ok: true,
            created: !!pushResult.created,
            entity: pushResult.entity,
            instance,
            serverId: serverMeta?.id ?? record.serverId ?? null,
            profileId,
            rootFolder,
            languageProfileId,
        };
    };

    const updateAdminRequest = async (requestId, overrides = {}, adminUser = null) => {
        const existing = await store.get(requestId);
        if (!existing) {
            const err = new Error('Request not found');
            err.status = 404;
            throw err;
        }
        const patched = applyOverridesToRecord(existing, overrides);
        if (overrides?.arrInstanceId || overrides?.serverId != null) {
            const instance = resolvePortalArrInstance(
                config,
                patched.mediaType,
                patched.serverId,
                patched.arrInstanceId,
            );
            if (instance) patched.arrInstanceId = instance.id;
        }
        const updated = await store.update(requestId, {
            ...patched,
            meta: {
                ...(existing.meta || {}),
                ...(patched.meta || {}),
                modifiedBy: adminUser ? {
                    id: adminUser.id,
                    displayName: adminUser.username || adminUser.email || 'Admin',
                } : (existing.meta?.modifiedBy || null),
            },
        });
        return enrichDto(updated, { detail: true });
    };

    const approveAdminRequest = async (requestId, overrides = null, adminUser = null) => {
        let record = await store.get(requestId);
        if (!record) {
            const err = new Error('Request not found');
            err.status = 404;
            throw err;
        }

        if (hasRequestOverrides(overrides)) {
            await updateAdminRequest(requestId, overrides, adminUser);
            record = await store.get(requestId);
        }

        const pushResult = await pushRecordToArr(record);
        if (!pushResult.ok) {
            const failed = await store.update(requestId, {
                status: REQUEST_STATUS_FAILED,
                meta: {
                    ...(record.meta || {}),
                    arrError: pushResult.reason || 'Failed to push to *arr',
                    modifiedBy: adminUser ? {
                        id: adminUser.id,
                        displayName: adminUser.username || adminUser.email || 'Admin',
                    } : (record.meta?.modifiedBy || null),
                },
            });
            const err = new Error(pushResult.reason || 'Failed to push to *arr');
            err.status = 502;
            err.request = await enrichDto(failed, { detail: true });
            throw err;
        }

        const approved = await store.update(requestId, {
            status: REQUEST_STATUS_APPROVED,
            serverId: pushResult.serverId ?? record.serverId,
            arrInstanceId: pushResult.instance?.id || record.arrInstanceId,
            profileId: pushResult.profileId ?? record.profileId,
            qualityProfile: pushResult.profileId ?? record.qualityProfile,
            rootFolder: pushResult.rootFolder || record.rootFolder,
            languageProfileId: pushResult.languageProfileId ?? record.languageProfileId,
            ...(!record.posterPath && pickArrPosterUrl(pushResult.entity)
                ? { posterPath: pickArrPosterUrl(pushResult.entity) }
                : {}),
            meta: {
                ...(record.meta || {}),
                arrError: null,
                arrEntityId: pushResult.entity?.id ?? null,
                arrInstanceId: pushResult.instance?.id || null,
                arrInstanceName: pushResult.instance?.name || null,
                arrCreated: !!pushResult.created,
                mediaStatus: 3,
                isDownloading: true,
                ...(!record.posterPath && pickArrPosterUrl(pushResult.entity)
                    ? { posterSource: 'arr' }
                    : {}),
                modifiedBy: adminUser ? {
                    id: adminUser.id,
                    displayName: adminUser.username || adminUser.email || 'Admin',
                } : (record.meta?.modifiedBy || null),
            },
        });

        return enrichDto(approved, { detail: true });
    };

    const declineAdminRequest = async (requestId, reason = '', adminUser = null) => {
        const record = await store.get(requestId);
        if (!record) {
            const err = new Error('Request not found');
            err.status = 404;
            throw err;
        }
        const declined = await store.update(requestId, {
            status: REQUEST_STATUS_DECLINED,
            meta: {
                ...(record.meta || {}),
                declineReason: String(reason || '').trim() || null,
                modifiedBy: adminUser ? {
                    id: adminUser.id,
                    displayName: adminUser.username || adminUser.email || 'Admin',
                } : (record.meta?.modifiedBy || null),
            },
        });
        return enrichDto(declined, { detail: true });
    };

    const deleteAdminRequest = async (requestId) => {
        const removed = await store.remove(requestId);
        if (!removed) {
            const err = new Error('Request not found');
            err.status = 404;
            throw err;
        }
        return true;
    };

    const retryAdminRequest = async (requestId, adminUser = null) => {
        const record = await store.get(requestId);
        if (!record) {
            const err = new Error('Request not found');
            err.status = 404;
            throw err;
        }
        const status = Number(record.status);
        if (status !== REQUEST_STATUS_FAILED && status !== REQUEST_STATUS_APPROVED) {
            const err = new Error('Only failed or approved requests can be retried.');
            err.status = 400;
            throw err;
        }
        return approveAdminRequest(requestId, null, adminUser);
    };

    const retryMemberRequest = async (user, requestId) => {
        const record = await store.get(requestId);
        if (!record) {
            const err = new Error('Request not found');
            err.status = 404;
            throw err;
        }
        if (String(record.userId) !== String(user?.id || '')) {
            const err = new Error('You can only manage your own requests.');
            err.status = 403;
            throw err;
        }
        return retryAdminRequest(requestId, user);
    };

    const createPortalTag = async ({ mediaType, label, serverName = '', serverId = null }) => {
        const cleanLabel = String(label || '').trim();
        if (!cleanLabel) {
            const err = new Error('Tag label is required');
            err.status = 400;
            throw err;
        }
        const instance = resolvePortalArrInstance(config, mediaType, serverId, null)
            || (() => {
                const servers = listPortalArrServers(config, mediaType);
                const nameKey = String(serverName || '').trim().toLowerCase();
                const match = nameKey
                    ? servers.find((s) => String(s.name || '').toLowerCase() === nameKey)
                    : servers.find((s) => s.isDefault) || servers[0];
                return match ? resolvePortalArrInstance(config, mediaType, match.id, match.instanceId) : null;
            })();
        if (!instance) {
            const err = new Error('No matching *arr instance is configured.');
            err.status = 400;
            throw err;
        }

        const created = await fetchArrInstance(instance, '/api/v3/tag', {
            ...fetchOpts,
            method: 'POST',
            body: { label: cleanLabel },
        });
        if (created?.ok && created.data?.id != null) {
            clearPortalArrServiceOptionsCache(mediaType, instance.id);
            return { id: Number(created.data.id), label: String(created.data.label || cleanLabel) };
        }

        const listed = await fetchArrInstance(instance, '/api/v3/tag', fetchOpts);
        const tags = Array.isArray(listed?.data) ? listed.data : [];
        const existing = tags.find((tag) => (
            String(tag?.label || '').trim().toLowerCase() === cleanLabel.toLowerCase()
        ));
        if (existing?.id != null) {
            clearPortalArrServiceOptionsCache(mediaType, instance.id);
            return { id: Number(existing.id), label: String(existing.label || cleanLabel) };
        }
        const err = new Error(created?.data?.message || 'Failed to create tag in *arr');
        err.status = created?.status || 502;
        throw err;
    };

    /**
     * Member request modal payload (Seerr-shaped) without calling Seerr.
     * TMDB supplies title/overview/poster/seasons; *arr supplies library season status.
     */
    const getMemberRequestOptions = async (user, { mediaType, mediaId } = {}) => {
        const type = mediaType === 'tv' ? 'tv' : 'movie';
        const tmdbId = Number(mediaId);
        if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
            const err = new Error('Invalid mediaId');
            err.status = 400;
            throw err;
        }

        const apiKey = String(config?.tmdbApiKey || '').trim();
        if (!apiKey) {
            const err = new Error('TMDB API key is required for portal request options.');
            err.status = 400;
            throw err;
        }

        const client = createTmdbClient({ tmdbApiKey: apiKey, language: 'en' });
        const details = type === 'tv'
            ? await client.tv(tmdbId, { language: 'en' })
            : await client.movie(tmdbId, { language: 'en' });

        const library = createLibraryAvailability(config, {
            resolveUrl,
            fetchImpl,
            upgraderItems: [],
        });
        // Modal open path: use disk-cache stamps only — live Sonarr/TVDB fan-out can take
        // many seconds on long-running shows and blocks the request-options spinner.
        const yearRaw = String(details?.firstAirDate || details?.releaseDate || '').slice(0, 4);
        const year = Number(yearRaw);
        const sessionKey = String(user?.id || user?.plexId || '').trim();
        const [statusPayload, related, resolvedUser] = await Promise.all([
            type === 'tv'
                ? library.getTvListStatus(tmdbId, {
                    title: details?.name || details?.title || '',
                    year: Number.isFinite(year) && year > 1900 ? year : null,
                    networkLookups: false,
                }).catch(() => null)
                : library.getMediaStatus(type, tmdbId).catch(() => null),
            store.list({ mediaType: type, tmdbId }),
            sessionKey ? resolveUser(sessionKey).catch(() => null) : Promise.resolve(null),
        ]);
        const mediaInfo = statusPayload?.mediaInfo && typeof statusPayload.mediaInfo === 'object'
            ? { ...statusPayload.mediaInfo }
            : {};

        const portalRequestRows = related
            .filter((row) => Number(row?.status) !== REQUEST_STATUS_DECLINED)
            .map((row) => {
                let seasons = [];
                if (type === 'tv') {
                    if (row.seasons === 'all') {
                        seasons = (details?.seasons || [])
                            .map((s) => Number(s?.seasonNumber))
                            .filter((n) => Number.isFinite(n) && n >= 0)
                            .map((seasonNumber) => ({ seasonNumber }));
                    } else if (Array.isArray(row.seasons)) {
                        seasons = row.seasons
                            .map((n) => Number(n))
                            .filter((n) => Number.isFinite(n))
                            .map((seasonNumber) => ({ seasonNumber }));
                    }
                }
                return {
                    id: row.id,
                    status: Number(row.status) || REQUEST_STATUS_PENDING,
                    is4k: !!row.is4k,
                    seasons,
                };
            });
        mediaInfo.requests = [
            ...(Array.isArray(mediaInfo.requests) ? mediaInfo.requests : []),
            ...portalRequestRows,
        ];

        const servers = listPortalArrServers(config, type);
        const has4kServer = servers.some((server) => !!server.is4k);
        const hasHdServer = servers.some((server) => !server.is4k) || (servers.length > 0 && !has4kServer);

        const policy = resolveMemberRequestPolicy(config, resolvedUser || user);
        const memberRecords = await store.list({ userId: String(resolvedUser?.id || user?.id || '') });
        const quotaEval = evaluatePortalMemberQuota(config, memberRecords, {
            policy,
            mediaType: type,
        });

        const seasons = type === 'tv' ? buildMemberSeasonOptions(details, mediaInfo) : [];
        let mediaStatus = Number(mediaInfo?.status ?? statusPayload?.status) || null;
        if (!Number.isFinite(mediaStatus) || mediaStatus === 1) {
            if (portalRequestRows.some((row) => Number(row.status) === REQUEST_STATUS_PENDING)) {
                mediaStatus = 2;
            } else if (portalRequestRows.some((row) => Number(row.status) === REQUEST_STATUS_APPROVED)) {
                mediaStatus = 3;
            }
        }
        const blocked = await isBlocked(type, tmdbId).catch(() => false);
        if (blocked) mediaStatus = 6;
        const isBlacklisted = mediaStatus === 6 || blocked;

        const permHd = canPolicyRequestMedia(policy, type, { is4k: false });
        const perm4k = canPolicyRequestMedia(policy, type, { is4k: true });
        const canRequest4k = has4kServer && perm4k.ok;
        const canRequestAdvanced = !!policy.allowAdvancedRequests && servers.length > 0;

        const radarrLib = statusPayload?.radarrLibraryStatus || null;
        const hdInLibrary = type === 'movie'
            ? !!(radarrLib?.hdHasFile || (!has4kServer && radarrLib?.hasFile) || (!radarrLib && mediaStatus === 5 && !has4kServer))
            : false;
        const fourKInLibrary = type === 'movie'
            ? !!(radarrLib?.fourKHasFile || (!hasHdServer && has4kServer && radarrLib?.hasFile))
            : false;

        let blockReason = null;
        let availabilityNote = null;
        let canRequest = !isBlacklisted && servers.length > 0 && (permHd.ok || canRequest4k);
        if (isBlacklisted) blockReason = 'This title is blacklisted.';
        else if (!servers.length) {
            blockReason = type === 'tv'
                ? 'No Sonarr instance is configured.'
                : 'No Radarr instance is configured.';
        } else if (!permHd.ok && !canRequest4k) {
            blockReason = permHd.reason || perm4k.reason;
        }

        if (canRequest && type === 'movie') {
            const hdStillNeeded = hasHdServer && permHd.ok && !hdInLibrary;
            const fourKStillNeeded = canRequest4k && !fourKInLibrary;
            if (!hdStillNeeded && !fourKStillNeeded && (hdInLibrary || fourKInLibrary || mediaStatus === 5)) {
                canRequest = false;
                blockReason = blockReason || 'This movie is already available.';
            } else if (!hdStillNeeded && !fourKStillNeeded && (mediaStatus === 2 || mediaStatus === 3)) {
                canRequest = false;
                blockReason = blockReason || 'This title is already requested or downloading.';
            } else if (hdInLibrary && fourKStillNeeded) {
                availabilityNote = 'HD is already in your library — you can still request 4K.';
            } else if (fourKInLibrary && hdStillNeeded) {
                availabilityNote = '4K is already in your library — you can still request HD.';
            }
        } else if (canRequest && type === 'tv') {
            const requestableCount = seasons.filter((s) => s.requestable).length;
            if (requestableCount === 0) {
                canRequest = false;
                blockReason = blockReason || 'All seasons are already requested or available.';
            }
        }

        if (
            canRequest
            && quotaEval.standardQuotaBlocked
            && (!canRequest4k || quotaEval.fourKQuotaBlocked || fourKInLibrary)
        ) {
            canRequest = false;
            blockReason = `You have used all ${quotaEval.quota.standard.limit} requests for this period.`;
        }

        const title = type === 'tv'
            ? (details?.name || details?.title || '')
            : (details?.title || details?.name || '');

        const payload = {
            mediaType: type,
            tmdbId,
            title,
            overview: details?.overview || '',
            mediaStatus: Number.isFinite(mediaStatus) ? mediaStatus : null,
            isBlacklisted,
            isAnime: !!details?.isAnime,
            canRequest,
            canRequest4k,
            canRequestAdvanced,
            canCreateIssues: true,
            has4kServer,
            hasHdServer,
            libraryQualities: type === 'movie'
                ? { hd: hdInLibrary, '4k': fourKInLibrary }
                : null,
            availabilityNote,
            standardQuotaBlocked: quotaEval.standardQuotaBlocked,
            fourKQuotaBlocked: quotaEval.fourKQuotaBlocked,
            seerrUserId: null,
            servers,
            permissions: {
                request: permHd.ok,
                requestMovie: policy.allowRequestMovies,
                requestTv: policy.allowRequestTv,
                request4k: canRequest4k,
                request4kMovie: policy.allowRequest4kMovies,
                request4kTv: policy.allowRequest4kTv,
                requestAdvanced: canRequestAdvanced,
                createIssues: true,
            },
            quota: quotaEval.quota,
            seasons,
            userMapped: true,
            blockReason,
            posterPath: details?.posterPath || null,
            engine: 'portal',
        };

        if (type === 'tv' && !payload.posterPath) {
            const tvdbPoster = await resolveTvdbPosterForTmdbShow(config, tmdbId, { fetchImpl });
            if (tvdbPoster?.posterPath) {
                payload.posterPath = tvdbPoster.posterPath;
                payload.tvdbId = tvdbPoster.tvdbId;
            }
        }

        return payload;
    };

    return {
        store,
        createMemberRequest,
        listMemberRequests,
        getMemberRequestCounts,
        cancelMemberRequest,
        listAdminRequests,
        getAdminRequestCounts,
        getAdminRequest,
        listPortalRequestUsers,
        updateAdminRequest,
        approveAdminRequest,
        declineAdminRequest,
        deleteAdminRequest,
        retryAdminRequest,
        retryMemberRequest,
        createPortalTag,
        getMemberRequestOptions,
        listPortalArrServers: (type) => listPortalArrServers(config, type),
        getPortalArrServiceOptions: (type, serverId) => getPortalArrServiceOptions(config, type, serverId, fetchOpts),
        syncRequestStatuses: () => syncPortalRequestStatuses({
            config,
            store,
            resolveUrl,
            fetchImpl,
        }),
    };
};

export default createPortalRequestService;
