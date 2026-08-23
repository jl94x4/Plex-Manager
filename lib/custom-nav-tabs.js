const CUSTOM_NAV_KEY_PREFIX = 'custom:';
export const MAX_CUSTOM_NAV_TABS = 20;
const ALLOWED_OPEN_MODES = new Set(['embed', 'sameTab', 'newTab']);
const ALLOWED_ICONS = new Set([
    'Globe', 'ExternalLink', 'Server', 'Monitor', 'Gamepad2', 'Music', 'Film', 'Tv',
    'BookOpen', 'Database', 'Cloud', 'Home', 'Link', 'Box', 'Cpu', 'HardDrive', 'Radio',
    'Cast', 'Headphones', 'Camera', 'Shield', 'Zap', 'Star', 'Heart', 'Bookmark',
    'LayoutDashboard', 'AppWindow', 'Layers', 'Activity', 'Download', 'MessageSquare',
]);

export const customNavTabKey = (id) => `${CUSTOM_NAV_KEY_PREFIX}${String(id || '').trim()}`;

export const parseCustomNavTabKey = (key) => {
    const raw = String(key || '');
    if (!raw.startsWith(CUSTOM_NAV_KEY_PREFIX)) return null;
    const id = raw.slice(CUSTOM_NAV_KEY_PREFIX.length).trim();
    return id || null;
};

export const isCustomNavTabKey = (key) => !!parseCustomNavTabKey(key);

const isSafeCustomNavUrl = (url) => {
    const value = String(url || '').trim();
    if (!value) return false;
    if (/^(javascript|data|vbscript):/i.test(value)) return false;
    if (value.startsWith('/')) return true;
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
};

const normalizeOpenMode = (value) => {
    const mode = String(value || '').trim();
    return ALLOWED_OPEN_MODES.has(mode) ? mode : 'embed';
};

const normalizeIcon = (value) => {
    const icon = String(value || '').trim();
    return ALLOWED_ICONS.has(icon) ? icon : 'Globe';
};

const makeId = () => (
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
);

export const normalizeCustomNavTabs = (tabs, existing = []) => {
    const source = Array.isArray(tabs) ? tabs : (Array.isArray(existing) ? existing : []);
    const seen = new Set();
    const result = [];
    for (const raw of source) {
        if (!raw || typeof raw !== 'object') continue;
        const id = String(raw.id || '').trim() || makeId();
        if (seen.has(id)) continue;
        const name = String(raw.name || '').trim();
        const url = String(raw.url || '').trim();
        if (!name || !isSafeCustomNavUrl(url)) continue;
        seen.add(id);
        const description = String(raw.description || '').trim().slice(0, 240);
        result.push({
            id,
            name: name.slice(0, 80),
            description: description || undefined,
            url,
            icon: normalizeIcon(raw.icon),
            openMode: normalizeOpenMode(raw.openMode),
            adminOnly: !!raw.adminOnly,
            enabled: raw.enabled !== false,
        });
        if (result.length >= MAX_CUSTOM_NAV_TABS) break;
    }
    return result;
};

export const sanitizeCustomNavTabsForSession = (tabs = []) => (
    normalizeCustomNavTabs(tabs).map((tab) => ({ ...tab }))
);

export const pruneNavOrderCustomKeys = (order = [], tabs = []) => {
    const enabledIds = new Set(
        normalizeCustomNavTabs(tabs)
            .filter((tab) => tab.enabled)
            .map((tab) => customNavTabKey(tab.id)),
    );
    return (Array.isArray(order) ? order : []).filter((key) => (
        !isCustomNavTabKey(key) || enabledIds.has(String(key))
    ));
};
