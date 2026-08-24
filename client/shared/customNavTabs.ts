import {
    Activity,
    AppWindow,
    Bookmark,
    BookOpen,
    Box,
    Camera,
    Cast,
    Cloud,
    Cpu,
    Database,
    Download,
    ExternalLink,
    Film,
    Gamepad2,
    Globe,
    HardDrive,
    Headphones,
    Heart,
    Home,
    Layers,
    LayoutDashboard,
    Link,
    MessageSquare,
    Monitor,
    Music,
    Radio,
    Server,
    Shield,
    Star,
    Tv,
    Zap,
    type LucideIcon,
} from 'lucide-react';
import type { CustomNavTab } from './types';
import { portalUrl } from './basePath';

export const CUSTOM_NAV_KEY_PREFIX = 'custom:';

export type CustomNavTabOpenMode = 'embed' | 'sameTab' | 'newTab';

export const CUSTOM_NAV_ICON_OPTIONS = [
    'Globe', 'ExternalLink', 'Server', 'Monitor', 'Gamepad2', 'Music', 'Film', 'Tv',
    'BookOpen', 'Database', 'Cloud', 'Home', 'Link', 'Box', 'Cpu', 'HardDrive', 'Radio',
    'Cast', 'Headphones', 'Camera', 'Shield', 'Zap', 'Star', 'Heart', 'Bookmark',
    'LayoutDashboard', 'AppWindow', 'Layers', 'Activity', 'Download', 'MessageSquare',
] as const;

export type CustomNavIconName = typeof CUSTOM_NAV_ICON_OPTIONS[number];

const CUSTOM_NAV_ICON_MAP: Record<CustomNavIconName, LucideIcon> = {
    Globe,
    ExternalLink,
    Server,
    Monitor,
    Gamepad2,
    Music,
    Film,
    Tv,
    BookOpen,
    Database,
    Cloud,
    Home,
    Link,
    Box,
    Cpu,
    HardDrive,
    Radio,
    Cast,
    Headphones,
    Camera,
    Shield,
    Zap,
    Star,
    Heart,
    Bookmark,
    LayoutDashboard,
    AppWindow,
    Layers,
    Activity,
    Download,
    MessageSquare,
};

export const customNavTabKey = (id: string) => `${CUSTOM_NAV_KEY_PREFIX}${String(id || '').trim()}`;

export const parseCustomNavTabId = (key: string): string | null => {
    const raw = String(key || '');
    if (!raw.startsWith(CUSTOM_NAV_KEY_PREFIX)) return null;
    const id = raw.slice(CUSTOM_NAV_KEY_PREFIX.length).trim();
    return id || null;
};

export const isCustomNavTabKey = (key: string) => !!parseCustomNavTabId(key);

export const buildCustomNavTabMap = (tabs: CustomNavTab[] = []) => (
    new Map(tabs.map((tab) => [String(tab.id), tab]))
);

export const resolveCustomNavIcon = (iconName?: string | null): LucideIcon => {
    const key = String(iconName || '').trim() as CustomNavIconName;
    return CUSTOM_NAV_ICON_MAP[key] || Globe;
};

export const getCustomNavTabLabel = (key: string, tabs: CustomNavTab[] = []) => {
    const id = parseCustomNavTabId(key);
    if (!id) return key;
    const tab = tabs.find((entry) => String(entry.id) === id);
    return tab?.name || key;
};

export const isCustomNavTabMemberVisible = (key: string, tabMap: Map<string, CustomNavTab>) => {
    const id = parseCustomNavTabId(key);
    if (!id) return false;
    const tab = tabMap.get(id);
    return !!tab && tab.enabled && !tab.adminOnly;
};

export const canAccessCustomNavTab = (tab: CustomNavTab | undefined, isAdmin: boolean) => (
    !!tab && tab.enabled && (!tab.adminOnly || isAdmin)
);

export const insertNavKeyBefore = (order: string[], anchor: string, key: string) => {
    const next = order.filter((entry) => entry !== key);
    const index = next.indexOf(anchor);
    if (index < 0) return [...next, key];
    next.splice(index, 0, key);
    return next;
};

export const removeNavKey = (order: string[], key: string) => (
    order.filter((entry) => entry !== key)
);

export const createDefaultCustomNavTab = (): CustomNavTab => ({
    id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `tab-${Date.now()}`,
    name: 'New service',
    url: 'https://',
    icon: 'Globe',
    openMode: 'embed',
    adminOnly: false,
    enabled: true,
});

export type CustomTabEmbedIssue = 'mixed-content' | 'blocked-host' | 'proxy-incompatible';

const BLOCKED_EMBED_HOST_SUFFIXES = [
    'google.com',
    'youtube.com',
    'facebook.com',
    'twitter.com',
    'x.com',
    'instagram.com',
    'microsoft.com',
    'live.com',
    'office.com',
    'apple.com',
];

const registrableDomain = (hostname: string) => {
    const parts = String(hostname || '').toLowerCase().split('.').filter(Boolean);
    if (parts.length <= 2) return parts.join('.');
    return parts.slice(-2).join('.');
};

/** HTTPS sibling subdomains (e.g. photos.strymx.co.uk inside portal.strymx.co.uk) can iframe directly. */
export const isSameRegistrableDomainHost = (targetHost: string, portalHost: string) => {
    const target = String(targetHost || '').toLowerCase();
    const portal = String(portalHost || '').toLowerCase();
    if (!target || !portal || target === portal) return true;
    const base = registrableDomain(portal);
    return base.length > 0 && target.endsWith(`.${base}`) && registrableDomain(target) === base;
};

/** Immich / SvelteKit apps route on window.location.pathname and cannot run under /api/custom-tab-embed/…. */
export const isDirectEmbedOnlyAppUrl = (url: string) => {
    try {
        const parsed = new URL(String(url || '').trim(), typeof window !== 'undefined' ? window.location.origin : 'https://localhost');
        const host = parsed.hostname.toLowerCase();
        const port = parsed.port;
        if (port === '8888' || port === '2283') return true;
        if (host === 'photos.strymx.co.uk' || /^photos\./i.test(host)) return true;
        return false;
    } catch {
        return false;
    }
};

/** Use HTTPS for tunnel subdomains that only publish over TLS (e.g. photos.strymx.co.uk). */
export const normalizeCustomTabEmbedUrl = (url: string) => {
    const trimmed = String(url || '').trim();
    if (!trimmed) return trimmed;
    try {
        const parsed = new URL(trimmed, typeof window !== 'undefined' ? window.location.origin : 'https://localhost');
        const host = parsed.hostname.toLowerCase();
        if ((host === 'photos.strymx.co.uk' || /^photos\./i.test(host)) && parsed.protocol === 'http:') {
            parsed.protocol = 'https:';
            return parsed.href;
        }
    } catch {
        return trimmed;
    }
    return trimmed;
};

const wouldNeedEmbedProxy = (
    url: string,
    portalProtocol = typeof window !== 'undefined' ? window.location.protocol : 'https:',
) => {
    try {
        const parsed = new URL(String(url || '').trim(), typeof window !== 'undefined' ? window.location.origin : 'https://localhost');
        if (portalProtocol === 'https:' && parsed.protocol === 'http:') return true;
        const portalHost = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
        const targetHost = parsed.hostname.toLowerCase();
        if (!portalHost || targetHost === portalHost) return false;
        if (
            portalProtocol === 'https:'
            && parsed.protocol === 'https:'
            && isSameRegistrableDomainHost(targetHost, portalHost)
        ) {
            return false;
        }
        return true;
    } catch {
        return false;
    }
};

/** Predict iframe failures before the browser shows a broken embed. */
export const detectCustomTabEmbedIssue = (
    url: string,
    portalProtocol = typeof window !== 'undefined' ? window.location.protocol : 'https:',
): CustomTabEmbedIssue | null => {
    const trimmed = String(url || '').trim();
    if (!trimmed) return null;
    try {
        const parsed = new URL(trimmed, typeof window !== 'undefined' ? window.location.origin : 'https://localhost');
        const host = parsed.hostname.toLowerCase();
        for (const suffix of BLOCKED_EMBED_HOST_SUFFIXES) {
            if (host === suffix || host.endsWith(`.${suffix}`)) return 'blocked-host';
        }
        if (isDirectEmbedOnlyAppUrl(trimmed) && wouldNeedEmbedProxy(trimmed, portalProtocol)) {
            return 'proxy-incompatible';
        }
        if (portalProtocol === 'https:' && parsed.protocol === 'http:') return 'mixed-content';
    } catch {
        return null;
    }
    return null;
};

/** Route embeds through the portal when direct iframe would be blocked. */
export const shouldUseCustomTabEmbedProxy = (url: string): boolean => {
    const normalized = normalizeCustomTabEmbedUrl(url);
    if (detectCustomTabEmbedIssue(normalized) === 'blocked-host') return false;
    if (detectCustomTabEmbedIssue(normalized) === 'proxy-incompatible') return false;
    return wouldNeedEmbedProxy(normalized);
};

export const getCustomTabEmbedProxySrc = (tabId: string) => (
    portalUrl(`/api/custom-tab-embed/${encodeURIComponent(tabId)}/`)
);

export const isPrivateOrLocalHost = (url: string) => {
    try {
        const host = new URL(String(url || '').trim(), 'https://localhost').hostname.toLowerCase();
        return host === 'localhost'
            || host.endsWith('.local')
            || /^192\.168\./.test(host)
            || /^10\./.test(host)
            || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
            || host === '127.0.0.1';
    } catch {
        return false;
    }
};
