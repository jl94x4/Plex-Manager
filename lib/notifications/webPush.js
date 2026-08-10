/**
 * Web Push (VAPID) — subscription store + send helpers.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import webpush from 'web-push';
import {
    WEB_PUSH_SUBSCRIPTIONS_PATH,
    WEB_PUSH_VAPID_PATH,
} from '../data-paths.js';

const emptySubs = () => ({ version: 1, updatedAt: null, byUserId: {} });

let writeChain = Promise.resolve();
const serialize = (operation) => {
    const current = writeChain.then(operation, operation);
    writeChain = current.catch(() => {});
    return current;
};

const writeJsonAtomic = async (filePath, value) => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    try {
        await fs.rename(temporary, filePath);
    } finally {
        await fs.rm(temporary, { force: true }).catch(() => {});
    }
};

export const loadVapidKeys = async () => {
    try {
        const raw = await fs.readFile(WEB_PUSH_VAPID_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed?.publicKey && parsed?.privateKey) return parsed;
    } catch {
        // generate below
    }
    const keys = webpush.generateVAPIDKeys();
    const stored = {
        publicKey: keys.publicKey,
        privateKey: keys.privateKey,
        subject: 'mailto:portal@localhost',
        createdAt: new Date().toISOString(),
    };
    await writeJsonAtomic(WEB_PUSH_VAPID_PATH, stored);
    return stored;
};

export const getVapidPublicKey = async () => {
    const keys = await loadVapidKeys();
    return keys.publicKey;
};

const configureWebPush = async () => {
    const keys = await loadVapidKeys();
    webpush.setVapidDetails(
        keys.subject || 'mailto:portal@localhost',
        keys.publicKey,
        keys.privateKey,
    );
    return keys;
};

const loadSubsState = async () => {
    try {
        const raw = await fs.readFile(WEB_PUSH_SUBSCRIPTIONS_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return emptySubs();
        if (!parsed.byUserId || typeof parsed.byUserId !== 'object') parsed.byUserId = {};
        return parsed;
    } catch {
        return emptySubs();
    }
};

export const upsertWebPushSubscription = async (userId, subscription, meta = {}) => {
    if (!userId || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        throw new Error('Invalid push subscription');
    }
    return serialize(async () => {
        const state = await loadSubsState();
        const uid = String(userId);
        const list = Array.isArray(state.byUserId[uid]) ? state.byUserId[uid] : [];
        const endpoint = String(subscription.endpoint);
        const next = {
            endpoint,
            keys: {
                p256dh: String(subscription.keys.p256dh),
                auth: String(subscription.keys.auth),
            },
            expirationTime: subscription.expirationTime ?? null,
            userAgent: String(meta.userAgent || '').slice(0, 300) || null,
            updatedAt: new Date().toISOString(),
            createdAt: list.find((s) => s.endpoint === endpoint)?.createdAt || new Date().toISOString(),
        };
        const filtered = list.filter((s) => s.endpoint !== endpoint);
        filtered.unshift(next);
        state.byUserId[uid] = filtered.slice(0, 10);
        state.updatedAt = next.updatedAt;
        await writeJsonAtomic(WEB_PUSH_SUBSCRIPTIONS_PATH, state);
        return next;
    });
};

export const removeWebPushSubscription = async (userId, endpoint) => {
    if (!userId || !endpoint) return { removed: 0 };
    return serialize(async () => {
        const state = await loadSubsState();
        const uid = String(userId);
        const list = Array.isArray(state.byUserId[uid]) ? state.byUserId[uid] : [];
        const next = list.filter((s) => s.endpoint !== String(endpoint));
        const removed = list.length - next.length;
        if (removed) {
            if (next.length) state.byUserId[uid] = next;
            else delete state.byUserId[uid];
            state.updatedAt = new Date().toISOString();
            await writeJsonAtomic(WEB_PUSH_SUBSCRIPTIONS_PATH, state);
        }
        return { removed };
    });
};

export const listWebPushSubscriptionsForUser = async (userId) => {
    const state = await loadSubsState();
    return Array.isArray(state.byUserId[String(userId)]) ? state.byUserId[String(userId)] : [];
};

/** Admin overview of push subscription coverage. */
export const getWebPushAdminSummary = async () => {
    const state = await loadSubsState();
    const byUserId = state.byUserId && typeof state.byUserId === 'object' ? state.byUserId : {};
    const userIds = Object.keys(byUserId);
    let deviceCount = 0;
    for (const uid of userIds) {
        deviceCount += Array.isArray(byUserId[uid]) ? byUserId[uid].length : 0;
    }
    return {
        usersWithSubscriptions: userIds.length,
        deviceCount,
        updatedAt: state.updatedAt || null,
    };
};

export const isWebPushGloballyEnabled = (config = {}) => (
    config.webPushEnabled !== false
);

export const userAllowsWebPush = (user = null) => (
    user?.notifyWebPush !== false
);

/**
 * Send a browser push to all of a user's subscriptions.
 * Removes gone (410/404) endpoints automatically.
 */
export const sendWebPushToUser = async (userId, payload = {}, { config = {}, user = null, log = () => {} } = {}) => {
    if (!userId) return { sent: 0, skipped: 'no-user' };
    if (!isWebPushGloballyEnabled(config)) return { sent: 0, skipped: 'disabled' };
    if (!userAllowsWebPush(user)) return { sent: 0, skipped: 'user-opt-out' };

    const subs = await listWebPushSubscriptionsForUser(userId);
    if (!subs.length) return { sent: 0, skipped: 'no-subscriptions' };

    await configureWebPush();
    const body = JSON.stringify({
        title: String(payload.title || 'Notification'),
        body: String(payload.body || ''),
        href: String(payload.href || '/portal'),
        tag: String(payload.tag || payload.type || 'portal'),
        type: String(payload.type || 'generic'),
    });

    let sent = 0;
    const stale = [];
    for (const sub of subs) {
        try {
            await webpush.sendNotification({
                endpoint: sub.endpoint,
                keys: sub.keys,
                expirationTime: sub.expirationTime ?? undefined,
            }, body, {
                TTL: 60 * 60,
                urgency: 'normal',
            });
            sent += 1;
        } catch (error) {
            const status = Number(error?.statusCode || error?.status || 0);
            if (status === 404 || status === 410) {
                stale.push(sub.endpoint);
            } else if (typeof log === 'function') {
                log(`[WebPush] send failed: ${error?.message || error}`);
            }
        }
    }
    for (const endpoint of stale) {
        await removeWebPushSubscription(userId, endpoint);
    }
    return { sent, removed: stale.length };
};

export default sendWebPushToUser;
