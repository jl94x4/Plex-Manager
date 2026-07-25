export type NavFeatureFlags = {
    maintenance?: boolean;
    upgrader?: boolean;
    collexions?: boolean;
    scanner?: boolean;
    request?: boolean;
    requestsQueue?: boolean;
    /** When false, Downloads is hidden from non-admins. Default/undefined = visible. */
    downloads?: boolean;
};

/** Default sidebar order matching Settings → Navigation stock layout. */
export const DEFAULT_NAV_ORDER = [
    'home',
    'discover',
    'request',
    'analytics',
    'users',
    'downloads',
    'upgrader',
    'collexions',
    'scanner',
    'mediastack',
    'requests',
    'status',
    'maintenance',
    'about',
    'settings',
    'logout',
] as const;

/** Mobile bottom bar shows this many items before the "More" overflow menu. */
export const MOBILE_NAV_PRIMARY_SLOTS = 7;

/** Labels must match the sidebar (`Navigation` in screens.tsx). */
export const NAV_ITEM_LABELS: Record<string, string> = {
    home: 'Home',
    discover: 'Dashboard',
    request: 'Discover & Request',
    analytics: 'Analytics',
    users: 'Users',
    downloads: 'Downloads',
    upgrader: 'Upgrader',
    collexions: 'ColleXions',
    scanner: 'Scanner',
    mediastack: 'Calendar',
    requests: 'Requests',
    status: 'Status',
    maintenance: 'Cleaner',
    about: 'About',
    settings: 'Settings',
    logs: 'Logs',
    logout: 'Logout',
};

const ADMIN_ONLY_NAV_KEYS = new Set([
    'users',
    'upgrader',
    'collexions',
    'scanner',
    'requests',
    'maintenance',
    'settings',
    'logs',
]);

export const getNavItemLabel = (key: string, options?: { adminSuffix?: boolean; downloadsMembersVisible?: boolean }) => {
    const base = NAV_ITEM_LABELS[key] || key;
    if (options?.adminSuffix) {
        if (ADMIN_ONLY_NAV_KEYS.has(key)) return `${base} (Admin Only)`;
        if (key === 'downloads' && options.downloadsMembersVisible === false) {
            return `${base} (Admin Only)`;
        }
    }
    return base;
};

const LEGACY_DEFAULT_NAV_ORDERS = [
    ['home', 'discover', 'users', 'status', 'analytics', 'downloads', 'mediastack', 'maintenance', 'request', 'about', 'settings', 'logout'],
    ['home', 'discover', 'users', 'analytics', 'downloads', 'mediastack', 'upgrader', 'requests', 'status', 'maintenance', 'request', 'about', 'logs', 'settings', 'logout'],
    ['home', 'discover', 'status', 'analytics', 'mediastack', 'request', 'about', 'settings', 'logout'],
    ['home', 'discover', 'status', 'analytics', 'request', 'users', 'downloads', 'mediastack', 'maintenance', 'about', 'settings', 'logout'],
    ['home', 'discover', 'request', 'analytics', 'users', 'downloads', 'upgrader', 'mediastack', 'requests', 'status', 'maintenance', 'about', 'settings', 'logout'],
];

const sameOrder = (a: string[], b: string[]) => (
    a.length === b.length && a.every((key, index) => key === b[index])
);

/** Upgrade known legacy defaults to the current default without clobbering custom orders. */
export const resolveNavOrder = (order?: string[] | null): string[] => {
    if (!Array.isArray(order) || !order.length) return [...DEFAULT_NAV_ORDER];
    if (LEGACY_DEFAULT_NAV_ORDERS.some((legacy) => sameOrder(order, legacy))) {
        return [...DEFAULT_NAV_ORDER];
    }
    return [...order];
};

/**
 * Merge any missing known nav keys into a saved order using DEFAULT_NAV_ORDER
 * relative positions, so Settings and the sidebar stay in sync.
 */
export const ensureCompleteNavOrder = (order?: string[] | null): string[] => {
    const incoming = Array.isArray(order) ? order.filter(Boolean) : [];
    const result: string[] = [];
    const seen = new Set<string>();

    for (const key of incoming) {
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(key);
    }

    const insertMissing = (key: string) => {
        if (result.includes(key)) return;
        const defaultIndex = DEFAULT_NAV_ORDER.indexOf(key as typeof DEFAULT_NAV_ORDER[number]);
        if (defaultIndex < 0) {
            result.push(key);
            return;
        }
        for (let i = defaultIndex - 1; i >= 0; i -= 1) {
            const prevIdx = result.indexOf(DEFAULT_NAV_ORDER[i]);
            if (prevIdx >= 0) {
                result.splice(prevIdx + 1, 0, key);
                return;
            }
        }
        for (let i = defaultIndex + 1; i < DEFAULT_NAV_ORDER.length; i += 1) {
            const nextIdx = result.indexOf(DEFAULT_NAV_ORDER[i]);
            if (nextIdx >= 0) {
                result.splice(nextIdx, 0, key);
                return;
            }
        }
        result.push(key);
    };

    for (const key of DEFAULT_NAV_ORDER) {
        insertMissing(key);
    }

    // Keep Logs in the settings editor when it was already saved.
    if (incoming.includes('logs') && !result.includes('logs')) {
        const settingsIdx = result.indexOf('settings');
        if (settingsIdx >= 0) result.splice(settingsIdx, 0, 'logs');
        else result.push('logs');
    }

    return result;
};

const PLACEHOLDER_REQUEST_URLS = new Set([
    'https://yourdomain.com',
    'http://yourdomain.com',
    '',
]);

export const isRequestNavEnabled = (requestAppType?: string | null, requestUrl?: string | null) => {
    if (!requestAppType || requestAppType === 'none') return false;
    const url = String(requestUrl || '').trim();
    if (!url || PLACEHOLDER_REQUEST_URLS.has(url)) return false;
    return true;
};

/** Keys that cannot be hidden via Settings → Navigation (prevents lockout). */
export const ALWAYS_VISIBLE_NAV_KEYS = new Set(['home', 'settings', 'logout']);

/** Normalize a saved hidden-keys list; strips always-visible keys. */
export const normalizeNavHiddenKeys = (keys?: string[] | null): string[] => {
    if (!Array.isArray(keys)) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of keys) {
        const key = String(raw || '').trim();
        if (!key || ALWAYS_VISIBLE_NAV_KEYS.has(key) || seen.has(key)) continue;
        if (!(key in NAV_ITEM_LABELS) && key !== 'logs') continue;
        seen.add(key);
        result.push(key);
    }
    return result;
};

export const filterNavOrder = (
    order: string[],
    options: { isAdmin: boolean; features?: NavFeatureFlags; hiddenKeys?: string[] },
) => {
    const features = options.features || {};
    const maintenanceEnabled = features.maintenance !== false;
    const upgraderEnabled = !!features.upgrader;
    const collexionsEnabled = !!features.collexions;
    const scannerEnabled = !!features.scanner;
    const requestsQueueEnabled = !!features.requestsQueue;
    const requestEnabled = features.request !== false || requestsQueueEnabled;
    const hidden = new Set(normalizeNavHiddenKeys(options.hiddenKeys));

    return (Array.isArray(order) ? order : []).filter((key) => {
        if (key === 'logout' || key === 'logs') return false;
        if (hidden.has(key) && !ALWAYS_VISIBLE_NAV_KEYS.has(key)) return false;
        if ((key === 'users' || key === 'settings' || key === 'maintenance' || key === 'upgrader' || key === 'collexions' || key === 'scanner' || key === 'requests') && !options.isAdmin) return false;
        if (key === 'downloads' && !options.isAdmin && features.downloads === false) return false;
        if (key === 'maintenance' && !maintenanceEnabled) return false;
        if (key === 'upgrader' && !upgraderEnabled) return false;
        if (key === 'collexions' && !collexionsEnabled) return false;
        if (key === 'scanner' && !scannerEnabled) return false;
        if (key === 'request' && !requestEnabled) return false;
        if (key === 'requests' && !requestsQueueEnabled) return false;
        return true;
    });
};
