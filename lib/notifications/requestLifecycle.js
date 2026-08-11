/**
 * Request lifecycle notifications (Phase 1 / #89):
 * approved, declined, season available, new episode, admin pending.
 */

import { createInAppNotification } from './inAppStore.js';
import { sendWebPushToUser, isWebPushGloballyEnabled, userAllowsWebPush } from './webPush.js';
import { buildRequestDetailPath } from './requestAvailable.js';

const NEW_EPISODE_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h per series request

const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

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

const buildLifecycleEmailHtml = ({
    username,
    title,
    year,
    headline,
    body,
    statusLabel,
    ctaUrl,
    serverName,
    hasLogo = false,
} = {}) => {
    const safeName = escapeHtml(username || 'there');
    const safeTitle = escapeHtml(title || 'Your request');
    const safeYear = year ? ` (${escapeHtml(String(year))})` : '';
    const safeHeadline = escapeHtml(headline || 'Request update');
    const safeBody = escapeHtml(body || '');
    const safeStatus = escapeHtml(statusLabel || '');
    const safeServer = escapeHtml(serverName || 'your server');
    const safeCta = escapeHtml(ctaUrl || '#');

    return `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; padding: 30px; color: #333333; line-height: 1.6;">
            <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-top: 6px solid #e5a00d;">
                <div style="background-color: #282A2D; padding: 25px; text-align: center;">
                    ${hasLogo ? '<img src="cid:logo" alt="Logo" style="max-height: 100px; display: block; margin: 0 auto 10px auto;" />' : ''}
                    <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">${safeServer}</h1>
                </div>
                <div style="padding: 30px 40px;">
                    <h2 style="color: #e5a00d; font-size: 20px; margin-top: 0; font-weight: 600;">${safeHeadline}</h2>
                    <p>Hello <strong>${safeName}</strong>,</p>
                    <p>${safeBody}</p>
                    <div style="background-color: #fcf8f2; border-left: 4px solid #e5a00d; padding: 20px; margin: 25px 0; border-radius: 6px;">
                        <p style="margin: 0; font-size: 18px; font-weight: 700; color: #282A2D;">${safeTitle}${safeYear}</p>
                        ${safeStatus ? `<p style="margin: 8px 0 0 0; color: #718096; font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em;">${safeStatus}</p>` : ''}
                    </div>
                    <div style="text-align: center; margin: 28px 0 10px 0;">
                        <a href="${safeCta}" style="background-color: #e5a00d; color: #1a1a1a; text-decoration: none; padding: 14px 32px; font-weight: bold; border-radius: 6px; display: inline-block; font-size: 15px;">Open in Portal</a>
                    </div>
                </div>
                <div style="background-color: #f7fafc; padding: 18px 30px; border-top: 1px solid #edf2f7; text-align: center; font-size: 12px; color: #a0aec0;">
                    <p style="margin: 0;">You can change these alerts in your portal profile preferences.</p>
                </div>
            </div>
        </div>
    `;
};

const copyForEvent = (event, { title, seasonNumber, declineReason } = {}) => {
    if (event === 'approved') {
        return {
            inAppTitle: `${title} approved`,
            inAppBody: 'Your request was approved and is being processed.',
            pushTitle: `${title} approved`,
            pushBody: 'Your request was approved.',
            emailHeadline: 'Your request was approved',
            emailBody: 'An admin approved your request. We will notify you again when it is available.',
            statusLabel: 'Approved',
            emailType: 'request_approved',
            notifType: 'request_approved',
            pushTag: 'request-approved',
        };
    }
    if (event === 'declined') {
        const reason = declineReason ? ` Reason: ${declineReason}` : '';
        return {
            inAppTitle: `${title} declined`,
            inAppBody: `Your request was declined.${reason}`,
            pushTitle: `${title} declined`,
            pushBody: 'Your request was declined.',
            emailHeadline: 'Your request was declined',
            emailBody: `An admin declined your request.${reason}`,
            statusLabel: 'Declined',
            emailType: 'request_declined',
            notifType: 'request_declined',
            pushTag: 'request-declined',
        };
    }
    if (event === 'season') {
        const seasonLabel = `Season ${seasonNumber}`;
        return {
            inAppTitle: `${seasonLabel} of ${title} is available`,
            inAppBody: 'A requested season is ready to watch.',
            pushTitle: `${seasonLabel} of ${title} is available`,
            pushBody: 'A requested season is ready to watch.',
            emailHeadline: 'A season is available',
            emailBody: `${seasonLabel} of the series you requested is ready to watch.`,
            statusLabel: `${seasonLabel} available`,
            emailType: 'request_season_available',
            notifType: 'request_season_available',
            pushTag: 'request-season',
        };
    }
    // episode
    return {
        inAppTitle: `New episode: ${title}`,
        inAppBody: 'New episode(s) arrived for your requested series.',
        pushTitle: `New episode: ${title}`,
        pushBody: 'New episode(s) arrived for your series.',
        emailHeadline: 'New episode available',
        emailBody: 'New episode(s) arrived for a series you requested.',
        statusLabel: 'New episode',
        emailType: 'request_new_episode',
        notifType: 'request_new_episode',
        pushTag: 'request-episode',
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
    const copy = copyForEvent(event, { title, seasonNumber, declineReason });
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
                type: copy.notifType,
                title: copy.inAppTitle,
                body: copy.inAppBody,
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
                    title: copy.pushTitle,
                    body: copy.pushBody,
                    href: detailPath,
                    type: copy.notifType,
                    tag: `${copy.pushTag}-${record.id}${seasonNumber != null ? `-${seasonNumber}` : ''}`,
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
            ? await hasEmailBeenSent(dedupeUserId, copy.emailType, uniqueKey)
            : false;
        if (!already) {
            try {
                const html = buildLifecycleEmailHtml({
                    username,
                    title,
                    year,
                    headline: copy.emailHeadline,
                    body: copy.emailBody,
                    statusLabel: copy.statusLabel,
                    ctaUrl,
                    serverName: config?.serverName || 'Server Portal',
                    hasLogo: true,
                });
                const subject = `[${config?.serverName || 'Portal'}] ${copy.emailHeadline}: ${title}`;
                emailSent = !!(await sendEmail(config, emailTo, subject, html));
                if (emailSent && typeof logEmailSent === 'function') {
                    await logEmailSent(dedupeUserId, copy.emailType, uniqueKey);
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
    const kind = record.mediaType === 'tv' ? 'TV' : (record.mediaType === 'music' ? 'Music' : 'Movie');
    try {
        return !!(await sendGotifyAlert(
            config,
            'New media request',
            `${requester} requested ${kind}: ${title}`,
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
