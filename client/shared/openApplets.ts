import { customNavTabKey } from './customNavTabs';
import type { CustomNavTab } from './types';

export type OpenAppletSession = {
    id: string;
    embedPath: string;
};

const STORAGE_PREFIX = 'portal.openApplets.v1';

const storageKey = (accountKey: string) => `${STORAGE_PREFIX}.${accountKey || 'guest'}`;

const parseSessions = (value: unknown): OpenAppletSession[] => {
    if (!Array.isArray(value)) return [];
    return value
        .map((entry) => ({
            id: String((entry as OpenAppletSession)?.id || '').trim(),
            embedPath: String((entry as OpenAppletSession)?.embedPath || ''),
        }))
        .filter((entry) => entry.id);
};

export const readStoredOpenApplets = (accountKey: string): OpenAppletSession[] => {
    if (typeof sessionStorage === 'undefined') return [];
    try {
        const raw = sessionStorage.getItem(storageKey(accountKey));
        if (!raw) return [];
        return parseSessions(JSON.parse(raw));
    } catch {
        return [];
    }
};

export const writeStoredOpenApplets = (accountKey: string, sessions: OpenAppletSession[]): void => {
    if (typeof sessionStorage === 'undefined') return;
    try {
        if (!sessions.length) {
            sessionStorage.removeItem(storageKey(accountKey));
            return;
        }
        sessionStorage.setItem(storageKey(accountKey), JSON.stringify(sessions));
    } catch {
        /* ignore quota */
    }
};

export const clearStoredOpenApplets = (accountKey: string): void => {
    if (typeof sessionStorage === 'undefined') return;
    try {
        sessionStorage.removeItem(storageKey(accountKey));
    } catch {
        /* ignore */
    }
};

export const upsertOpenApplet = (
    prev: OpenAppletSession[],
    id: string,
    embedPath = '',
): OpenAppletSession[] => {
    const nextId = String(id || '').trim();
    if (!nextId) return prev;
    const path = String(embedPath || '');
    const rest = prev.filter((session) => session.id !== nextId);
    return [...rest, { id: nextId, embedPath: path }];
};

export const closeOpenApplet = (prev: OpenAppletSession[], id: string): OpenAppletSession[] => (
    prev.filter((session) => session.id !== id)
);

export const nextAppletAfterClose = (
    prev: OpenAppletSession[],
    closedId: string,
): OpenAppletSession | null => {
    const next = closeOpenApplet(prev, closedId);
    return next[next.length - 1] || null;
};

const navOrderIndex = (navOrder: string[], tabId: string): number => {
    const key = customNavTabKey(tabId);
    const index = navOrder.indexOf(key);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
};

export const sortCustomNavTabsByNavOrder = (tabs: CustomNavTab[], navOrder: string[]): CustomNavTab[] => (
    [...tabs].sort((a, b) => {
        const delta = navOrderIndex(navOrder, a.id) - navOrderIndex(navOrder, b.id);
        if (delta !== 0) return delta;
        return a.name.localeCompare(b.name);
    })
);

export const sortOpenAppletSessionsByNavOrder = (
    sessions: OpenAppletSession[],
    navOrder: string[],
): OpenAppletSession[] => (
    [...sessions].sort((a, b) => {
        const delta = navOrderIndex(navOrder, a.id) - navOrderIndex(navOrder, b.id);
        if (delta !== 0) return delta;
        return a.id.localeCompare(b.id);
    })
);
