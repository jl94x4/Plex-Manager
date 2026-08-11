/**
 * Request lifecycle notifications (Phase 1 / #89):
 * approved, declined, season available, new episode, admin pending.
 */

import { createInAppNotification } from './inAppStore.js';
import { sendWebPushToUser, isWebPushGloballyEnabled, userAllowsWebPush } from './webPush.js';
import { buildRequestDetailPath, buildRequestAvailableEmailHtml } from './requestAvailable.js';
import { renderEventTemplates } from './templates/render.js';

const NEW_EPISODE_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h per series request

export const findRequesterUser = (users = [], record = {}) => {
    const list = Array.isArray(users) ? users : [];
    return list.find((u) => (
        String(u?.id) === String(record.userId)
        || (record?.meta?.requestedByEmail && String(u?.email || '').toLowerCase() === String(record.meta.requestedByEmail).toLowerCase())
        || (record?.meta?.requestedByName && String(u?.username || '').toLowerCase() === String(record.meta.requestedByName).toLowerCase())
    )) || null;
};

const userPrefDefaultOn = (user, key) => user?.[key] !== false;
const userPrefDefaultOff = (user, key) => user?.[key] === true;

const siteChannelEnabled = (config, channel) => {
    if (channel === 'email') return config?.requestAvailableNotifyEmail !== false;
    if (channel === 'inApp') return config?.requestAvailableNotifyInApp !== false;
    if (channel === 'webPush') {
        return config?.requestAvailableNotifyWebPush !== false && isWebPushGloballyEnabled(config);
    }
    return false;
};

/** @typedef {'approved'|'declined'|'season'|'episode'} LifecycleEvent */

const eventEnabled = (config, event) => {
    if (event === 'approved') return config?.requestApprovedNotifyEnabled !== false;
    if (event === 'declined') return config?.requestDeclinedNotifyEnabled !== false;
    if (event === 'season') return config?.requestSeasonNotifyEnabled !== false;
    if (event === 'episode') return config?.requestNewEpisodeNotifyEnabled !== false;
    return false;
};

const userAllowsEventChannel = (user, event, channel) => {
    const map = {
        approved: {
            email: 'notifyRequestApprovedEmail',
            inApp: 'notifyRequestApprovedInApp',
            webPush: 'notifyRequestApprovedWebPush',
        },
        declined: {
            email: 'notifyRequestDeclinedEmail',
            inApp: 'notifyRequestDeclinedInApp',
            webPush: 'notifyRequestDeclinedWebPush',
        },
        season: {
            email: 'notifySeasonAvailableEmail',
            inApp: 'notifySeasonAvailableInApp',
            webPush: 'notifySeasonAvailableWebPush',
        },
        episode: {
            email: 'notifyNewEpisodeEmail',
            inApp: 'notifyNewEpisodeInApp',
            webPush: 'notifyNewEpisodeWebPush',
        },
    };
    const key = map[event]?.[channel];
    if (!key) return false;
    if (event === 'episode') return userPrefDefaultOff(user, key);
    return userPrefDefaultOn(user, key);
};

export const shouldSendLifecycle = (config, user, event, channel) => {
    if (!eventEnabled(config, event)) return false;
    if (!siteChannelEnabled(config, channel)) return false;
    if (channel === 'webPush' && !userAllowsWebPush(user)) return false;
    return userAllowsEventChannel(user, event, channel);
};

const eventMeta = (event) => {
    if (event === 'approved') {
        return {
            emailType: 'request_approved',
            notifType: 'request_approved',
            pushTag: 'request-approved',
            status: 'Approved',
        };
    }
    if (event === 'declined') {
        return {
            emailType: 'request_declined',
            notifType: 'request_declined',
            pushTag: 'request-declined',
            status: 'Declined',
        };
    }
    if (event === 'season') {
        return {
            emailType: 'request_season_available',
            notifType: 'request_season_available',
            pushTag: 'request-season',
            status: 'Season available',
        };
    }
    return {
        emailType: 'request_new_episode',
        notifType: 'request_new_episode',
        pushTag: 'request-episode',
        status: 'New episode',
    };
};

/**
 * Fan-out email / in-app / web push for a lifecycle event.
 */
export const notifyRequestLifecycle = async ({
    event,
    config,
    record,
    seasonNumber = null,
    declineReason = null,
    emailUniqueKey = null,
    loadUsers,
    sendEmail,
    hasEmailBeenSent,
    logEmailSent,
    resolvePublicBaseUrl,
    log = () => {},
} = {}) => {
    if (!record?.id || !event) {
        return { notified: false, email: false, inApp: false, webPush: false, skipped: 'no-record' };
    }

    const users = typeof loadUsers === 'function' ? await loadUsers() : [];
    const user = findRequesterUser(users, record);
    const username = user?.username || record?.meta?.requestedByName || 'there';
    const title = record?.title || 'Your request';
    const year = record?.year || null;
    const mediaType = record.mediaType === 'tv' ? 'tv' : (record.mediaType === 'music' ? 'music' : 'movie');
    const detailPath = buildRequestDetailPath(record);
    const baseUrl = typeof resolvePublicBaseUrl === 'function'
        ? String(resolvePublicBaseUrl(config) || '').replace(/\/+$/, '')
        : '';
    const ctaUrl = baseUrl ? `${baseUrl}${detailPath.startsWith('/') ? detailPath : `/${detailPath}`}` : detailPath;
    const meta = eventMeta(event);
    const { rendered } = renderEventTemplates(config, event, {
        title,
        username,
        mediaType,
        year,
        seasonNumber,
        declineReason: declineReason || record?.meta?.declineReason || null,
        serverName: config?.serverName || 'Server Portal',
        portalUrl: ctaUrl,
        status: meta.status,
    });

    const uniqueKey = emailUniqueKey || (
        event === 'season'
            ? `request:${record.id}:season:${seasonNumber}`
            : event === 'episode'
                ? `request:${record.id}:episode:${record?.meta?.lastNewEpisodeNotifyAt || Date.now()}`
                : `request:${record.id}:${event}`
    );

    let emailSent = false;
    let inAppCreated = false;
    let webPushSent = false;

    if (shouldSendLifecycle(config, user, event, 'inApp')) {
        const targetUserId = user?.id || record.userId;
        if (targetUserId) {
            await createInAppNotification({
                userId: targetUserId,
                type: meta.notifType,
                title: rendered.pushTitle || title,
                body: rendered.pushBody || '',
                href: detailPath,
                meta: {
                    requestId: record.id,
                    tmdbId: record.tmdbId || null,
                    mediaType,
                    seasonNumber,
                    skipWebPush: true,
                },
            });
            inAppCreated = true;
        }
    }

    if (shouldSendLifecycle(config, user, event, 'webPush')) {
        const targetUserId = user?.id || record.userId;
        if (targetUserId) {
            try {
                const result = await sendWebPushToUser(targetUserId, {
                    title: rendered.pushTitle || title,
                    body: rendered.pushBody || '',
                    href: detailPath,
                    type: meta.notifType,
                    tag: `${meta.pushTag}-${record.id}${seasonNumber != null ? `-${seasonNumber}` : ''}`,
                }, { config, user, log });
                webPushSent = (result?.sent || 0) > 0;
            } catch (error) {
                if (typeof log === 'function') {
                    log(`[RequestLifecycle] web push failed (${event}) ${record.id}: ${error?.message || error}`);
                }
            }
        }
    }

    const emailTo = user?.email || record?.meta?.requestedByEmail || null;
    if (emailTo && shouldSendLifecycle(config, user, event, 'email') && typeof sendEmail === 'function') {
        const dedupeUserId = user?.id || record.userId || emailTo;
        const already = typeof hasEmailBeenSent === 'function'
            ? await hasEmailBeenSent(dedupeUserId, meta.emailType, uniqueKey)
            : false;
        if (!already) {
            try {
                const html = buildRequestAvailableEmailHtml({
                    username,
                    title,
                    year,
                    mediaType,
                    ctaUrl,
                    serverName: config?.serverName || 'Server Portal',
                    hasLogo: true,
                    headline: rendered.emailHeadline,
                    body: rendered.emailBody,
                    statusLabel: meta.status,
                });
                const subject = rendered.emailSubject
                    || `[${config?.serverName || 'Portal'}] ${rendered.emailHeadline || meta.status}: ${title}`;
                emailSent = !!(await sendEmail(config, emailTo, subject, html));
                if (emailSent && typeof logEmailSent === 'function') {
                    await logEmailSent(dedupeUserId, meta.emailType, uniqueKey);
                }
            } catch (error) {
                if (typeof log === 'function') {
                    log(`[RequestLifecycle] email failed (${event}) ${record.id}: ${error?.message || error}`);
                }
            }
        }
    }

    return {
        notified: emailSent || inAppCreated || webPushSent,
        email: emailSent,
        inApp: inAppCreated,
        webPush: webPushSent,
    };
};

export const notifyRequestApproved = (deps) => notifyRequestLifecycle({ ...deps, event: 'approved' });

export const notifyRequestDeclined = (deps) => notifyRequestLifecycle({
    ...deps,
    event: 'declined',
    declineReason: deps.declineReason || deps.record?.meta?.declineReason || null,
});

export const notifySeasonAvailable = (deps) => notifyRequestLifecycle({
    ...deps,
    event: 'season',
    seasonNumber: deps.seasonNumber,
});

export const notifyNewEpisode = (deps) => notifyRequestLifecycle({
    ...deps,
    event: 'episode',
});

/**
 * Seasons that belong to this request and are newly complete.
 */
export const listNewlyCompletedSeasons = (record = {}, availability = {}) => {
    if (record.mediaType !== 'tv') return [];
    const seasons = availability?.mediaInfo?.seasons || availability?.seasons || [];
    if (!Array.isArray(seasons) || !seasons.length) return [];

    const requested = record.seasons === 'all' || record.seasons == null
        ? null
        : new Set(
            (Array.isArray(record.seasons) ? record.seasons : [])
                .map((n) => Number(n))
                .filter((n) => Number.isFinite(n) && n > 0),
        );

    const notified = record?.meta?.notifiedSeasonAvailable && typeof record.meta.notifiedSeasonAvailable === 'object'
        ? record.meta.notifiedSeasonAvailable
        : {};

    const out = [];
    for (const season of seasons) {
        const num = Number(season?.seasonNumber);
        if (!Number.isFinite(num) || num <= 0) continue;
        if (requested && !requested.has(num)) continue;
        if (Number(season?.status) !== 5) continue;
        if (notified[String(num)]) continue;
        out.push(num);
    }
    return out.sort((a, b) => a - b);
};

export const shouldNotifyNewEpisode = (record = {}, availability = {}, now = Date.now()) => {
    if (record.mediaType !== 'tv') return { ok: false, reason: 'not-tv' };
    if (Number(record?.meta?.mediaStatus) === 5 && !record?.meta?.isDownloading) {
        return { ok: false, reason: 'fully-available' };
    }

    const nextCount = Number(
        availability?.sonarrLibraryStatus?.episodeFileCount
        ?? availability?.sonarrLibraryStatus?.fileCount
        ?? NaN,
    );
    if (!Number.isFinite(nextCount) || nextCount <= 0) {
        return { ok: false, reason: 'no-count', nextCount: null };
    }

    const prevCount = Number(record?.meta?.lastEpisodeFileCount);
    if (!Number.isFinite(prevCount)) {
        // First observation — seed baseline without notifying.
        return { ok: false, reason: 'baseline', nextCount, seed: true };
    }
    if (nextCount <= prevCount) {
        return { ok: false, reason: 'no-increase', nextCount };
    }

    const lastAt = Date.parse(String(record?.meta?.lastNewEpisodeNotifyAt || ''));
    if (Number.isFinite(lastAt) && (now - lastAt) < NEW_EPISODE_COOLDOWN_MS) {
        return { ok: false, reason: 'cooldown', nextCount };
    }

    return { ok: true, nextCount, added: nextCount - prevCount };
};

export const notifyAdminPendingRequest = async ({
    config,
    record,
    sendGotifyAlert,
    alertRuleEnabled,
    log = () => {},
} = {}) => {
    if (!record?.id) return false;
    if (typeof alertRuleEnabled === 'function' && !alertRuleEnabled(config, 'requestPending')) {
        return false;
    }
    if (typeof sendGotifyAlert !== 'function') return false;

    const title = record.title || `Request #${record.id}`;
    const requester = record?.meta?.requestedByName || record?.meta?.requestedByEmail || 'A user';
    const mediaType = record.mediaType === 'tv' ? 'tv' : (record.mediaType === 'music' ? 'music' : 'movie');
    const { rendered } = renderEventTemplates(config, 'admin_pending', {
        title,
        username: requester,
        mediaType,
        serverName: config?.serverName || 'Server Portal',
    });
    try {
        return !!(await sendGotifyAlert(
            config,
            rendered.gotifyTitle || 'New media request',
            rendered.gotifyBody || `${requester} requested ${mediaType}: ${title}`,
        ));
    } catch (error) {
        if (typeof log === 'function') {
            log(`[RequestLifecycle] admin pending Gotify failed: ${error?.message || error}`);
        }
        return false;
    }
};

export default {
    notifyRequestLifecycle,
    notifyRequestApproved,
    notifyRequestDeclined,
    notifySeasonAvailable,
    notifyNewEpisode,
    notifyAdminPendingRequest,
    listNewlyCompletedSeasons,
    shouldNotifyNewEpisode,
    findRequesterUser,
    shouldSendLifecycle,
};
