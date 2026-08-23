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
