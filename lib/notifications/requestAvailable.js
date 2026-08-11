/**
 * Fan-out when a portal/Seerr request becomes available:
 * email + in-app (+ Web Push via in-app hook) + Discord webhook.
 */

import { createInAppNotification } from './inAppStore.js';
import { sendWebPushToUser, isWebPushGloballyEnabled, userAllowsWebPush } from './webPush.js';
import { notifyRequestAvailableDiscord } from './discordWebhook.js';
import { renderEventTemplates } from './templates/render.js';

const SEERR_MEDIA_AVAILABLE = 5;

export const isRequestAvailableNotifyEnabled = (config = {}) => (
    config.requestAvailableNotifyEnabled !== false
);

export const shouldSendRequestAvailableEmail = (config = {}, user = null) => {
    if (!isRequestAvailableNotifyEnabled(config)) return false;
    if (config.requestAvailableNotifyEmail === false) return false;
    if (user?.notifyRequestAvailableEmail === false) return false;
    return true;
};

export const shouldSendRequestAvailableInApp = (config = {}, user = null) => {
    if (!isRequestAvailableNotifyEnabled(config)) return false;
    if (config.requestAvailableNotifyInApp === false) return false;
    if (user?.notifyRequestAvailableInApp === false) return false;
    return true;
};

export const shouldSendRequestAvailableWebPush = (config = {}, user = null) => {
    if (!isRequestAvailableNotifyEnabled(config)) return false;
    if (config.requestAvailableNotifyWebPush === false) return false;
    if (!isWebPushGloballyEnabled(config)) return false;
    if (user?.notifyRequestAvailableWebPush === false) return false;
    if (!userAllowsWebPush(user)) return false;
    return true;
};

const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const buildRequestAvailableEmailHtml = ({
    username,
    title,
    year,
    mediaType,
    ctaUrl,
    serverName,
    hasLogo = false,
    headline,
    body,
    statusLabel = 'Now available',
} = {}) => {
    const safeName = escapeHtml(username || 'there');
    const safeTitle = escapeHtml(title || 'Your request');
    const safeYear = year ? ` (${escapeHtml(String(year))})` : '';
    const kind = mediaType === 'tv' ? 'TV show' : (mediaType === 'music' ? 'album/artist' : 'movie');
    const safeServer = escapeHtml(serverName || 'your server');
    const safeCta = escapeHtml(ctaUrl || '#');
    const safeHeadline = escapeHtml(headline || 'Your request is available');
    const safeBody = escapeHtml(
        body || `Good news — the ${kind} you requested is ready to watch on the server.`,
    );
    const safeStatus = escapeHtml(statusLabel || 'Now available');

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
                        <p style="margin: 8px 0 0 0; color: #718096; font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em;">${safeStatus}</p>
                    </div>
                    <div style="text-align: center; margin: 28px 0 10px 0;">
                        <a href="${safeCta}" style="background-color: #e5a00d; color: #1a1a1a; text-decoration: none; padding: 14px 32px; font-weight: bold; border-radius: 6px; display: inline-block; font-size: 15px;">Open in Portal</a>
                    </div>
                </div>
                <div style="background-color: #f7fafc; padding: 18px 30px; border-top: 1px solid #edf2f7; text-align: center; font-size: 12px; color: #a0aec0;">
                    <p style="margin: 0;">You can turn off these emails in your portal profile preferences.</p>
                </div>
            </div>
        </div>
    `;
};

export const buildRequestDetailPath = (record = {}) => {
    const mediaType = record.mediaType === 'tv'
        ? 'tv'
        : (record.mediaType === 'music' ? 'music' : 'movie');
    if (mediaType === 'music') {
        const mbid = String(record.mbid || '').trim();
        return mbid ? `/discovery/music/artist/${encodeURIComponent(mbid)}` : '/discovery/requests';
    }
    const tmdbId = Number(record.tmdbId);
    if (Number.isFinite(tmdbId) && tmdbId > 0) {
        return `/discovery/${mediaType}/${tmdbId}`;
    }
    return '/discovery/requests';
};

/**
 * @returns {{ notified: boolean, email: boolean, inApp: boolean, webPush: boolean, discord: boolean, skipped?: string }}
 */
export const notifyRequestBecameAvailable = async ({
    config,
    record,
    prevMediaStatus,
    loadUsers,
    sendEmail,
    hasEmailBeenSent,
    logEmailSent,
    resolvePublicBaseUrl,
    log = () => {},
} = {}) => {
    if (!record?.id) return { notified: false, email: false, inApp: false, webPush: false, discord: false, skipped: 'no-record' };
    if (!isRequestAvailableNotifyEnabled(config)) {
        return { notified: false, email: false, inApp: false, webPush: false, discord: false, skipped: 'disabled' };
    }

    if (record?.meta?.notifiedAvailableAt) {
        return { notified: false, email: false, inApp: false, webPush: false, discord: false, skipped: 'already-notified' };
    }

    const nextStatus = Number(record?.meta?.mediaStatus);
    if (nextStatus !== SEERR_MEDIA_AVAILABLE) {
        return { notified: false, email: false, inApp: false, webPush: false, discord: false, skipped: 'not-available' };
    }

    const prev = Number(prevMediaStatus);
    if (prev === SEERR_MEDIA_AVAILABLE) {
        return { notified: false, email: false, inApp: false, webPush: false, discord: false, skipped: 'was-already-available' };
    }

    const users = typeof loadUsers === 'function' ? await loadUsers() : [];
    const list = Array.isArray(users) ? users : [];
    const user = list.find((u) => (
        String(u?.id) === String(record.userId)
        || (record?.meta?.requestedByEmail && String(u?.email || '').toLowerCase() === String(record.meta.requestedByEmail).toLowerCase())
        || (record?.meta?.requestedByName && String(u?.username || '').toLowerCase() === String(record.meta.requestedByName).toLowerCase())
    )) || null;

    const username = user?.username || record?.meta?.requestedByName || 'there';
    const title = record?.title || 'Your request';
    const year = record?.year || null;
    const mediaType = record.mediaType === 'tv' ? 'tv' : (record.mediaType === 'music' ? 'music' : 'movie');
    const detailPath = buildRequestDetailPath(record);
    const baseUrl = typeof resolvePublicBaseUrl === 'function'
        ? String(resolvePublicBaseUrl(config) || '').replace(/\/+$/, '')
        : '';
    const href = detailPath;
    const ctaUrl = baseUrl ? `${baseUrl}${detailPath.startsWith('/') ? detailPath : `/${detailPath}`}` : detailPath;

    const { rendered } = renderEventTemplates(config, 'available', {
        title,
        username,
        mediaType,
        year,
        serverName: config?.serverName || 'Server Portal',
        portalUrl: ctaUrl,
        status: 'Available',
    });

    let emailSent = false;
    let inAppCreated = false;
    let webPushSent = false;
    let discordSent = false;

    if (shouldSendRequestAvailableInApp(config, user)) {
        const targetUserId = user?.id || record.userId;
        if (targetUserId) {
            await createInAppNotification({
                userId: targetUserId,
                type: 'request_available',
                title: rendered.pushTitle || `${title} is available`,
                body: rendered.pushBody || 'Your request is ready to watch.',
                href,
                meta: {
                    requestId: record.id,
                    tmdbId: record.tmdbId || null,
                    mediaType,
                    skipWebPush: true,
                },
            });
            inAppCreated = true;
        }
    }

    if (shouldSendRequestAvailableWebPush(config, user)) {
        const targetUserId = user?.id || record.userId;
        if (targetUserId) {
            try {
                const result = await sendWebPushToUser(targetUserId, {
                    title: rendered.pushTitle || `${title} is available`,
                    body: rendered.pushBody || 'Your request is ready to watch.',
                    href,
                    type: 'request_available',
                    tag: `request-available-${record.id}`,
                }, { config, user, log });
                webPushSent = (result?.sent || 0) > 0;
            } catch (error) {
                if (typeof log === 'function') {
                    log(`[RequestAvailableNotify] web push failed for ${record.id}: ${error?.message || error}`);
                }
            }
        }
    }

    const emailTo = user?.email || record?.meta?.requestedByEmail || null;
    if (emailTo && shouldSendRequestAvailableEmail(config, user) && typeof sendEmail === 'function') {
        const uniqueKey = `request:${record.id}`;
        const dedupeUserId = user?.id || record.userId || emailTo;
        const already = typeof hasEmailBeenSent === 'function'
            ? await hasEmailBeenSent(dedupeUserId, 'request_available', uniqueKey)
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
                    statusLabel: 'Now available',
                });
                const subject = rendered.emailSubject
                    || `[${config?.serverName || 'Portal'}] ${title} is now available`;
                emailSent = !!(await sendEmail(config, emailTo, subject, html));
                if (emailSent && typeof logEmailSent === 'function') {
                    await logEmailSent(dedupeUserId, 'request_available', uniqueKey);
                }
            } catch (error) {
                if (typeof log === 'function') {
                    log(`[RequestAvailableNotify] email failed for request ${record.id}: ${error?.message || error}`);
                }
            }
        }
    }

    try {
        discordSent = !!(await notifyRequestAvailableDiscord({
            config,
            user,
            username,
            title,
            year,
            mediaType,
            ctaUrl,
            rendered,
            log,
        }));
    } catch (error) {
        if (typeof log === 'function') {
            log(`[RequestAvailableNotify] discord failed for ${record.id}: ${error?.message || error}`);
        }
    }

    return {
        notified: emailSent || inAppCreated || webPushSent || discordSent,
        email: emailSent,
        inApp: inAppCreated,
        webPush: webPushSent,
        discord: discordSent,
    };
};

export default notifyRequestBecameAvailable;
