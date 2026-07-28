export type ScannerAction =
    | 'import'
    | 'upgrade'
    | 'file-delete'
    | 'series-delete'
    | 'movie-delete'
    | 'artist-delete'
    | 'rename'
    | 'manual'
    | 'test'
    | 'refresh'
    | string;

export type ScannerEventMeta = {
    eventType?: string;
    action?: ScannerAction;
    reason?: string;
    title?: string;
    quality?: string;
    isUpgrade?: boolean;
    source?: string;
};

export const scannerActionStyles = (action?: string, isUpgrade?: boolean): {
    label: string;
    className: string;
    iconTone: string;
} => {
    const key = isUpgrade && action === 'import' ? 'upgrade' : String(action || '').toLowerCase();
    switch (key) {
        case 'import':
            return {
                label: 'Import',
                className: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
                iconTone: 'text-emerald-300',
            };
        case 'upgrade':
            return {
                label: 'Upgrade',
                className: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
                iconTone: 'text-amber-300',
            };
        case 'file-delete':
            return {
                label: 'File deleted',
                className: 'bg-rose-500/15 text-rose-300 border-rose-400/30',
                iconTone: 'text-rose-300',
            };
        case 'series-delete':
            return {
                label: 'Series deleted',
                className: 'bg-rose-500/15 text-rose-300 border-rose-400/30',
                iconTone: 'text-rose-300',
            };
        case 'movie-delete':
            return {
                label: 'Movie deleted',
                className: 'bg-rose-500/15 text-rose-300 border-rose-400/30',
                iconTone: 'text-rose-300',
            };
        case 'artist-delete':
            return {
                label: 'Artist deleted',
                className: 'bg-rose-500/15 text-rose-300 border-rose-400/30',
                iconTone: 'text-rose-300',
            };
        case 'rename':
            return {
                label: 'Rename',
                className: 'bg-violet-500/15 text-violet-300 border-violet-400/30',
                iconTone: 'text-violet-300',
            };
        case 'manual':
            return {
                label: 'Manual',
                className: 'bg-sky-500/15 text-sky-300 border-sky-400/30',
                iconTone: 'text-sky-300',
            };
        case 'refresh':
            return {
                label: 'Refresh',
                className: 'bg-plex/15 text-plex border-plex/30',
                iconTone: 'text-plex',
            };
        default:
            return {
                label: 'Refresh',
                className: 'bg-white/10 text-muted border-white/15',
                iconTone: 'text-muted',
            };
    }
};

export const formatScannerWhen = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
};

export const shortenScannerPath = (folder?: string, keep = 3) => {
    if (!folder) return '—';
    const parts = folder.replace(/\\/g, '/').split('/').filter(Boolean);
    if (parts.length <= keep) return folder;
    return `…/${parts.slice(-keep).join('/')}`;
};

export const sourceAppLabel = (source?: string) => {
    if (!source) return '';
    const head = String(source).split(':')[0];
    if (/^sonarr$/i.test(head)) return 'Sonarr';
    if (/^radarr$/i.test(head)) return 'Radarr';
    if (/^lidarr$/i.test(head)) return 'Lidarr';
    if (/^manual/i.test(head)) return 'Manual';
    if (/^media-automation$/i.test(head) || /^media_automation$/i.test(head)) return 'Automation';
    return head;
};

/** Official-ish ARR icons (same CDN used elsewhere in Settings). */
const SOURCE_APP_ICONS: Record<string, string> = {
    sonarr: 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/sonarr.svg',
    radarr: 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/radarr.svg',
    lidarr: 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/lidarr.svg',
};

export type ScannerSourceAppKey = 'sonarr' | 'radarr' | 'lidarr' | 'manual' | 'media-automation' | '';

export const sourceAppKey = (source?: string): ScannerSourceAppKey => {
    if (!source) return '';
    const head = String(source).split(':')[0].toLowerCase();
    if (head === 'sonarr') return 'sonarr';
    if (head === 'radarr') return 'radarr';
    if (head === 'lidarr') return 'lidarr';
    if (head === 'media-automation' || head === 'media_automation') return 'media-automation';
    if (head.startsWith('manual')) return 'manual';
    return '';
};

export const sourceAppIconUrl = (source?: string): string | null => {
    const key = sourceAppKey(source);
    if (!key || key === 'manual' || key === 'media-automation') return null;
    return SOURCE_APP_ICONS[key] || null;
};

