/**
 * Admin ops notifications: ColleXions / Scanner / Status / Media Automation.
 * In-app + web push honor per-admin preferences; ntfy / webhook follow site event toggles.
 */

import { createInAppNotification } from './inAppStore.js';
import { sendWebPushToUser, isWebPushGloballyEnabled, userAllowsWebPush } from './webPush.js';
import { renderEventTemplates } from './templates/render.js';
import { notifyNtfyEvent } from './ntfy.js';
import { sendGenericWebhook } from './genericWebhook.js';

export const STATUS_NOTIFY_DOWN_DEFAULT_MINUTES = 5;
export const STATUS_NOTIFY_DOWN_MIN_MINUTES = 1;
export const STATUS_NOTIFY_DOWN_MAX_MINUTES = 1440;

const lastSentAt = new Map();

const EVENT_META = {
    collexions_failed: {
        prefKey: 'notifyCollexionsFailed',
        defaultOn: true,
        href: '/collexions',
        notifType: 'collexions_failed',
        pushTag: 'collexions-failed',
        cooldownMs: 30 * 60 * 1000,
        ntfyTags: 'warning,jigsaw',
    },
    scanner_failed: {
        prefKey: 'notifyScannerFailed',
        defaultOn: true,
        href: '/scanner',
        notifType: 'scanner_failed',
        pushTag: 'scanner-failed',
        cooldownMs: 15 * 60 * 1000,
        ntfyTags: 'warning,mag',
    },
    status_down: {
        prefKey: 'notifyStatusDown',
        defaultOn: true,
        href: '/status',
        notifType: 'status_down',
        pushTag: 'status-down',
        cooldownMs: 0,
        ntfyTags: 'rotating_light,warning',
    },
    status_up: {
        prefKey: 'notifyStatusUp',
        defaultOn: true,
        href: '/status',
        notifType: 'status_up',
        pushTag: 'status-up',
        cooldownMs: 0,
        ntfyTags: 'white_check_mark',
    },
    media_job_failed: {
        prefKey: 'notifyMediaJobFailed',
        defaultOn: true,
        href: '/media-automation',
        notifType: 'media_job_failed',
        pushTag: 'media-job-failed',
        cooldownMs: 0,
        ntfyTags: 'warning,gear',
    },
    media_job_completed: {
        prefKey: 'notifyMediaJobCompleted',
        defaultOn: false,
        href: '/media-automation',
        notifType: 'media_job_completed',
        pushTag: 'media-job-completed',
        cooldownMs: 0,
        ntfyTags: 'white_check_mark,gear',
    },
};

export const OPS_NOTIFY_EVENTS = Object.keys(EVENT_META);

export const normalizeStatusNotifyDownAfterMinutes = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return STATUS_NOTIFY_DOWN_DEFAULT_MINUTES;
    return Math.max(
        STATUS_NOTIFY_DOWN_MIN_MINUTES,
        Math.min(STATUS_NOTIFY_DOWN_MAX_MINUTES, Math.round(n)),
    );
};

export const isUnhealthyStatus = (status) => status === 'offline' || status === 'degraded';

/**
 * Track downtime and decide whether to fire down / recovery events.
 * Mutates `record` (`unhealthySince`, `downNotified`).
 */
export const applyStatusHealthNotifyState = ({
    record,
    previousStatus,
    nextStatus,
    now = Date.now(),
    delayMs = STATUS_NOTIFY_DOWN_DEFAULT_MINUTES * 60 * 1000,
} = {}) => {
    if (!record || typeof record !== 'object') return [];
    const isUnhealthy = isUnhealthyStatus(nextStatus);
    const events = [];

    if (isUnhealthy) {
        if (!record.unhealthySince) {
            const openIncident = Array.isArray(record.incidents)
                ? [...record.incidents].reverse().find((incident) => incident && incident.endedAt == null)
                : null;
            record.unhealthySince = Number(openIncident?.startedAt) || now;
        }
        if (!record.downNotified && (now - record.unhealthySince) >= delayMs) {
            record.downNotified = true;
            events.push('status_down');
        }
        return events;
    }

    if (record.downNotified && isUnhealthyStatus(previousStatus)) {
        events.push('status_up');
    }
    record.unhealthySince = null;
    record.downNotified = false;
    return events;
};

export const isCollexionsFailureStatus = (statusMessage = '') => {
    const raw = String(statusMessage || '').trim();
    if (!raw) return false;
    if (/stopped \(interrupt/i.test(raw)) return false;
    if (/sleeping|initializing|running|processing|pinning|idle/i.test(raw) && !/error|crash|fatal|fail/i.test(raw)) {
        return false;
    }
    return /crash|error|fatal|critical|fail/i.test(raw);
};

const adminAllowsEvent = (user, event) => {
    const meta = EVENT_META[event];
    if (!meta) return false;
    const value = user?.[meta.prefKey];
    if (meta.defaultOn) return value !== false;
    return value === true;
};

const shouldSendInApp = (user, event) => adminAllowsEvent(user, event);

const shouldSendWebPush = (config, user, event) => {
    if (!adminAllowsEvent(user, event)) return false;
    if (!isWebPushGloballyEnabled(config)) return false;
    if (!userAllowsWebPush(user)) return false;
    return true;
};

const cooldownAllows = (dedupeKey, cooldownMs, now) => {
    if (!dedupeKey || !cooldownMs) return true;
    const prev = lastSentAt.get(dedupeKey) || 0;
    return now - prev >= cooldownMs;
};

const markCooldown = (dedupeKey, now) => {
    if (dedupeKey) lastSentAt.set(dedupeKey, now);
};

/** @internal tests */
export const resetOpsNotifyCooldownsForTests = () => lastSentAt.clear();

/**
 * Fan-out an ops event to every admin who opted in.
 */
export const notifyOpsAdmins = async ({
    event,
    config,
    title,
    body = '',
    href,
    dedupeKey = '',
    cooldownMs: cooldownMsOverride,
    loadUsers,
    log = () => {},
    now = Date.now(),
} = {}) => {
    const meta = EVENT_META[event];
    if (!meta) return { notified: false, skipped: 'unknown-event' };

    const cooldownMs = Number.isFinite(Number(cooldownMsOverride))
        ? Math.max(0, Number(cooldownMsOverride))
        : (meta.cooldownMs || 0);
    const key = String(dedupeKey || event);
    if (!cooldownAllows(key, cooldownMs, now)) {
        return { notified: false, skipped: 'cooldown' };
    }

    const users = typeof loadUsers === 'function' ? await loadUsers() : [];
    const admins = (Array.isArray(users) ? users : []).filter((u) => u && u.isAdmin && u.id);
    const detailHref = href || meta.href;
    const { rendered, vars } = renderEventTemplates(config, event, {
        title: title || event,
        username: 'admin',
        serverName: config?.serverName || 'Server Portal',
        portalUrl: detailHref,
        status: event,
    });
    const notifTitle = rendered.pushTitle || title || event;
    const notifBody = rendered.pushBody || body || '';

    let inAppCreated = 0;
    let webPushSent = 0;

    for (const admin of admins) {
        if (shouldSendInApp(admin, event)) {
            try {
                const created = await createInAppNotification({
                    userId: admin.id,
                    type: meta.notifType,
                    title: notifTitle,
                    body: notifBody,
                    href: detailHref,
                    meta: { skipWebPush: true, opsEvent: event },
                });
                if (created) inAppCreated += 1;
            } catch (error) {
                if (typeof log === 'function') {
                    log(`[ops-notify] in-app failed for ${admin.id}: ${error?.message || error}`);
                }
            }
        }
        if (shouldSendWebPush(config, admin, event)) {
            try {
                const result = await sendWebPushToUser(admin.id, {
                    title: notifTitle,
                    body: notifBody,
                    href: detailHref,
                    type: meta.notifType,
                    tag: `${meta.pushTag}-${key}`.slice(0, 120),
                }, { config, user: admin, log });
                if ((result?.sent || 0) > 0) webPushSent += 1;
            } catch (error) {
                if (typeof log === 'function') {
                    log(`[ops-notify] web push failed for ${admin.id}: ${error?.message || error}`);
                }
            }
        }
    }

    let ntfySent = false;
    let webhookSent = false;
    try {
        ntfySent = !!(await notifyNtfyEvent({
            config,
            event,
            title: rendered.ntfyTitle || notifTitle,
            body: rendered.ntfyBody || notifBody,
            clickUrl: detailHref,
            tags: meta.ntfyTags,
            log,
        }));
    } catch (error) {
        if (typeof log === 'function') log(`[ops-notify] ntfy failed: ${error?.message || error}`);
    }
    try {
        webhookSent = !!(await sendGenericWebhook({
            config,
            event,
            vars,
            renderedBody: rendered.webhookBody || '',
            log,
        }));
    } catch (error) {
        if (typeof log === 'function') log(`[ops-notify] webhook failed: ${error?.message || error}`);
    }

    const notified = inAppCreated > 0 || webPushSent > 0 || ntfySent || webhookSent;
    markCooldown(key, now);
    return { notified, inAppCreated, webPushSent, ntfySent, webhookSent };
};

export default notifyOpsAdmins;
