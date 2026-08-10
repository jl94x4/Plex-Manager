import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { NOTIFICATIONS_PATH } from '../data-paths.js';

const emptyState = () => ({
    version: 1,
    updatedAt: null,
    items: [],
});

let writeChain = Promise.resolve();
/** Optional fan-out after a notification is persisted (e.g. Web Push). */
let afterCreateHook = null;

export const setInAppNotificationCreatedHook = (fn) => {
    afterCreateHook = typeof fn === 'function' ? fn : null;
};

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

export const loadNotificationsState = async () => {
    try {
        const raw = await fs.readFile(NOTIFICATIONS_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return emptyState();
        if (!Array.isArray(parsed.items)) parsed.items = [];
        return parsed;
    } catch {
        return emptyState();
    }
};

export const createInAppNotification = async ({
    userId,
    type = 'request_available',
    title,
    body = '',
    href = '',
    meta = {},
} = {}) => {
    if (!userId) return null;
    const item = await serialize(async () => {
        const state = await loadNotificationsState();
        const created = {
            id: crypto.randomUUID(),
            userId: String(userId),
            type: String(type || 'request_available'),
            title: String(title || 'Notification'),
            body: String(body || ''),
            href: String(href || ''),
            meta: meta && typeof meta === 'object' ? meta : {},
            readAt: null,
            createdAt: new Date().toISOString(),
        };
        state.items.unshift(created);
        if (state.items.length > 2000) state.items = state.items.slice(0, 2000);
        state.updatedAt = created.createdAt;
        await writeJsonAtomic(NOTIFICATIONS_PATH, state);
        return created;
    });
    if (item && afterCreateHook) {
        try {
            await afterCreateHook(item);
        } catch {
            // never fail notification create on push fan-out
        }
    }
    return item;
};

export const listInAppNotificationsForUser = async (userId, { limit = 30, unreadOnly = false } = {}) => {
    const state = await loadNotificationsState();
    const uid = String(userId || '');
    let items = state.items.filter((item) => String(item.userId) === uid);
    if (unreadOnly) items = items.filter((item) => !item.readAt);
    return items.slice(0, Math.max(1, Math.min(100, Number(limit) || 30)));
};

export const countUnreadInAppNotifications = async (userId) => {
    const state = await loadNotificationsState();
    const uid = String(userId || '');
    return state.items.filter((item) => String(item.userId) === uid && !item.readAt).length;
};

export const markInAppNotificationsRead = async (userId, ids = null) => {
    return serialize(async () => {
        const state = await loadNotificationsState();
        const uid = String(userId || '');
        const idSet = Array.isArray(ids) && ids.length
            ? new Set(ids.map(String))
            : null;
        const now = new Date().toISOString();
        let changed = 0;
        for (const item of state.items) {
            if (String(item.userId) !== uid || item.readAt) continue;
            if (idSet && !idSet.has(String(item.id))) continue;
            item.readAt = now;
            changed += 1;
        }
        if (changed) {
            state.updatedAt = now;
            await writeJsonAtomic(NOTIFICATIONS_PATH, state);
        }
        return { changed };
    });
};
