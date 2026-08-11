import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import {
    OVERLAYS_DIR,
    OVERLAYS_CONFIG_PATH,
} from '../data-paths.js';

export { OVERLAYS_DIR, OVERLAYS_CONFIG_PATH };
export const OVERLAYS_LOG_PATH = path.join(OVERLAYS_DIR, 'overlaid_log.json');
export const OVERLAYS_EPISODE_LOG_PATH = path.join(OVERLAYS_DIR, 'episode_overlaid_log.json');
export const OVERLAYS_PREVIEW_DIR = path.join(OVERLAYS_DIR, 'preview');
export const OVERLAYS_BACKUPS_DIR = path.join(OVERLAYS_DIR, 'backups');
export const OVERLAYS_CUSTOM_PRESETS_DIR = path.join(OVERLAYS_DIR, 'presets', 'custom');

/** Normalized banner placement per art target (fractions of base art size). */
export const DEFAULT_OVERLAY_PLACEMENT = {
    show: {
        x: 0.5,
        y: 1.0,
        width: 0.92,
        anchorX: 'center',
        anchorY: 'bottom',
        bottomClip: 0.10,
    },
    season: {
        x: 0.5,
        y: 1.0,
        width: 0.70,
        maxHeight: 0.14,
        anchorX: 'center',
        anchorY: 'bottom',
        bottomClip: 0.10,
    },
    episode: {
        x: 0.5,
        y: 1.0,
        width: 0.55,
        maxHeight: 0.20,
        anchorX: 'center',
        anchorY: 'bottom',
        bottomClip: 0.10,
    },
};

export const DEFAULT_OVERLAYS_CONFIG = {
    enabled: true,
    previewMode: false,
    newSeasonDays: 21,
    newEpisodeEnabled: true,
    newEpisodeDays: 6,
    skipNewEpisodeOnBinge: true,
    librarySectionIds: [],
    overlayPresetId: 'new-season',
    episodeOverlayPresetId: 'new-episode',
    placement: DEFAULT_OVERLAY_PLACEMENT,
    scheduleHours: 24,
    skipIfKometaOverlayLabel: true,
    plexSource: 'portal',
    lastRunAt: null,
    lastRunSummary: null,
};

export const ensureOverlaysDir = async () => {
    await fs.mkdir(OVERLAYS_DIR, { recursive: true });
    await fs.mkdir(OVERLAYS_PREVIEW_DIR, { recursive: true });
    await fs.mkdir(OVERLAYS_BACKUPS_DIR, { recursive: true });
    await fs.mkdir(OVERLAYS_CUSTOM_PRESETS_DIR, { recursive: true });
};

const asStringList = (value) => {
    if (Array.isArray(value)) {
        return value.map((item) => String(item || '').trim()).filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) {
        return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
    }
    return [];
};

const inferPresetKind = (id, source) => {
    const name = String(id || '').toLowerCase();
    if (source === 'custom') {
        if (name.startsWith('episode-') || name.startsWith('episode_')) return 'episode';
        if (name.startsWith('season-') || name.startsWith('season_')) return 'season';
    }
    if (name.startsWith('new-episode') || name.includes('episode')) return 'episode';
    return 'season';
};

const clamp01 = (value, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(1, n));
};

const clampWidth = (value, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0.05, Math.min(1, n));
};

const normalizeAnchor = (value, axis, fallback) => {
    const v = String(value || '').trim().toLowerCase();
    if (axis === 'x') {
        if (v === 'left' || v === 'center' || v === 'right') return v;
    } else if (v === 'top' || v === 'center' || v === 'bottom') {
        return v;
    }
    return fallback;
};

export const normalizePlacementKind = (input = {}, fallback = {}) => {
    const raw = input && typeof input === 'object' ? input : {};
    const base = fallback && typeof fallback === 'object' ? fallback : {};
    const out = {
        x: clamp01(raw.x ?? base.x, 0.5),
        y: clamp01(raw.y ?? base.y, 1),
        width: clampWidth(raw.width ?? base.width, 0.92),
        anchorX: normalizeAnchor(raw.anchorX ?? raw.anchor_x ?? base.anchorX, 'x', 'center'),
        anchorY: normalizeAnchor(raw.anchorY ?? raw.anchor_y ?? base.anchorY, 'y', 'bottom'),
        bottomClip: clamp01(raw.bottomClip ?? raw.bottom_clip ?? base.bottomClip, 0.10),
    };
    const maxH = raw.maxHeight ?? raw.max_height ?? base.maxHeight;
    if (maxH !== undefined && maxH !== null && maxH !== '') {
        const n = Number(maxH);
        if (Number.isFinite(n)) out.maxHeight = Math.max(0.05, Math.min(1, n));
    } else if (typeof base.maxHeight === 'number') {
        out.maxHeight = base.maxHeight;
    }
    return out;
};

export const normalizeOverlaysPlacement = (input = {}) => {
    const raw = input && typeof input === 'object' ? input : {};
    return {
        show: normalizePlacementKind(raw.show, DEFAULT_OVERLAY_PLACEMENT.show),
        season: normalizePlacementKind(raw.season, DEFAULT_OVERLAY_PLACEMENT.season),
        episode: normalizePlacementKind(raw.episode, DEFAULT_OVERLAY_PLACEMENT.episode),
    };
};

export const normalizeOverlaysConfig = (input = {}) => {
    const raw = input && typeof input === 'object' ? input : {};
    const days = Number(raw.newSeasonDays ?? raw.new_season_days);
    const episodeDays = Number(raw.newEpisodeDays ?? raw.new_episode_days);
    const scheduleHours = Number(raw.scheduleHours ?? raw.schedule_hours);
    return {
        enabled: raw.enabled === undefined ? true : Boolean(raw.enabled),
        previewMode: raw.previewMode === undefined
            ? Boolean(raw.preview_mode)
            : Boolean(raw.previewMode),
        newSeasonDays: Number.isFinite(days) ? Math.max(1, Math.min(365, Math.round(days))) : 21,
        newEpisodeEnabled: raw.newEpisodeEnabled === undefined
            && raw.new_episode_enabled === undefined
            ? true
            : Boolean(raw.newEpisodeEnabled ?? raw.new_episode_enabled),
        newEpisodeDays: Number.isFinite(episodeDays)
            ? Math.max(1, Math.min(30, Math.round(episodeDays)))
            : 6,
        skipNewEpisodeOnBinge: raw.skipNewEpisodeOnBinge === undefined
            && raw.skip_new_episode_on_binge === undefined
            ? true
            : Boolean(raw.skipNewEpisodeOnBinge ?? raw.skip_new_episode_on_binge),
        librarySectionIds: asStringList(raw.librarySectionIds ?? raw.library_section_ids),
        overlayPresetId: String(raw.overlayPresetId || raw.overlay_preset_id || 'new-season').trim() || 'new-season',
        episodeOverlayPresetId: String(
            raw.episodeOverlayPresetId || raw.episode_overlay_preset_id || 'new-episode',
        ).trim() || 'new-episode',
        placement: normalizeOverlaysPlacement(raw.placement || DEFAULT_OVERLAY_PLACEMENT),
        scheduleHours: Number.isFinite(scheduleHours)
            ? Math.max(0, Math.min(168, Math.round(scheduleHours)))
            : 24,
        skipIfKometaOverlayLabel: raw.skipIfKometaOverlayLabel === undefined
            && raw.skip_if_kometa_overlay_label === undefined
            ? true
            : Boolean(raw.skipIfKometaOverlayLabel ?? raw.skip_if_kometa_overlay_label),
        plexSource: String(raw.plexSource || raw.plex_source || 'portal').trim() || 'portal',
        lastRunAt: raw.lastRunAt || raw.last_run_at || null,
        lastRunSummary: raw.lastRunSummary || raw.last_run_summary || null,
    };
};

export const loadOverlaysConfig = async () => {
    await ensureOverlaysDir();
    try {
        const raw = await fs.readFile(OVERLAYS_CONFIG_PATH, 'utf8');
        return normalizeOverlaysConfig(JSON.parse(raw));
    } catch (error) {
        if (error?.code === 'ENOENT') return normalizeOverlaysConfig(DEFAULT_OVERLAYS_CONFIG);
        throw error;
    }
};

export const saveOverlaysConfig = async (input = {}) => {
    const existing = await loadOverlaysConfig();
    const patch = input && typeof input === 'object' ? input : {};
    const merged = { ...existing, ...patch };
    if (patch.placement && typeof patch.placement === 'object') {
        const prev = existing.placement || DEFAULT_OVERLAY_PLACEMENT;
        merged.placement = {
            show: { ...(prev.show || {}), ...(patch.placement.show || {}) },
            season: { ...(prev.season || {}), ...(patch.placement.season || {}) },
            episode: { ...(prev.episode || {}), ...(patch.placement.episode || {}) },
        };
    }
    const next = normalizeOverlaysConfig(merged);
    await ensureOverlaysDir();
    await fs.writeFile(OVERLAYS_CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    return next;
};

export const loadOverlaysLog = async () => {
    await ensureOverlaysDir();
    try {
        const raw = await fs.readFile(OVERLAYS_LOG_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        if (error?.code === 'ENOENT') return {};
        throw error;
    }
};

export const loadOverlaysEpisodeLog = async () => {
    await ensureOverlaysDir();
    try {
        const raw = await fs.readFile(OVERLAYS_EPISODE_LOG_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        if (error?.code === 'ENOENT') return {};
        throw error;
    }
};

export const saveOverlaysLog = async (log = {}) => {
    await ensureOverlaysDir();
    const data = log && typeof log === 'object' && !Array.isArray(log) ? log : {};
    await fs.writeFile(OVERLAYS_LOG_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    return data;
};

const readPresetDir = async (dir, source) => {
    try {
        const names = await fs.readdir(dir);
        return names
            .filter((name) => /\.png$/i.test(name))
            .map((name) => {
                const id = name.replace(/\.png$/i, '');
                return {
                    id,
                    file: name,
                    source,
                    kind: inferPresetKind(id, source),
                    path: path.join(dir, name),
                };
            });
    } catch {
        return [];
    }
};

export const listOverlayPresets = async (assetsDir, customDir = OVERLAYS_CUSTOM_PRESETS_DIR) => {
    const bundled = await readPresetDir(assetsDir, 'bundled');
    const custom = await readPresetDir(customDir, 'custom');
    const byId = new Map();
    for (const preset of [...bundled, ...custom]) {
        byId.set(`${preset.source}:${preset.id}`, preset);
    }
    const presets = [...byId.values()];
    presets.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'season' ? -1 : 1;
        if (a.source !== b.source) return a.source === 'bundled' ? -1 : 1;
        return a.id.localeCompare(b.id);
    });
    if (!presets.some((p) => p.kind === 'season')) {
        presets.push({ id: 'new-season', file: 'new-season.png', source: 'bundled', kind: 'season' });
    }
    if (!presets.some((p) => p.kind === 'episode')) {
        presets.push({ id: 'new-episode', file: 'new-episode.png', source: 'bundled', kind: 'episode' });
    }
    return presets;
};

export const resolveOverlayPresetPath = (presetId, kind, assetsDir, customDir = OVERLAYS_CUSTOM_PRESETS_DIR) => {
    const id = String(presetId || '').trim()
        || (kind === 'episode' ? 'new-episode' : 'new-season');
    const customPath = path.join(customDir, `${id}.png`);
    if (fsSync.existsSync(customPath)) return customPath;
    const bundledPath = path.join(assetsDir, `${id}.png`);
    if (fsSync.existsSync(bundledPath)) return bundledPath;
    return path.join(assetsDir, kind === 'episode' ? 'new-episode.png' : 'new-season.png');
};

export const sanitizePresetUploadName = (kind, originalName = '') => {
    const base = String(originalName || 'banner')
        .replace(/\.png$/i, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'banner';
    const prefix = kind === 'episode' ? 'episode' : 'season';
    return `${prefix}-${base}`;
};

export const listPreviewGallery = async (previewDir = OVERLAYS_PREVIEW_DIR, limit = 100) => {
    const items = [];
    const walk = async (dir, kind) => {
        let names = [];
        try {
            names = await fs.readdir(dir);
        } catch {
            return;
        }
        for (const name of names) {
            if (!/\.png$/i.test(name)) continue;
            if (name.startsWith('temp_')) continue;
            const full = path.join(dir, name);
            try {
                const st = await fs.stat(full);
                if (!st.isFile()) continue;
                const rel = path.relative(previewDir, full).replace(/\\/g, '/');
                items.push({
                    name,
                    kind,
                    rel,
                    mtime: st.mtimeMs,
                    size: st.size,
                    url: `/api/overlays/preview-file?path=${encodeURIComponent(rel)}`,
                });
            } catch {
                /* skip */
            }
        }
    };
    await walk(previewDir, 'show');
    await walk(path.join(previewDir, 'episodes'), 'episode');
    await walk(path.join(previewDir, 'samples'), 'sample');
    items.sort((a, b) => b.mtime - a.mtime);
    return items.slice(0, Math.max(1, Math.min(200, limit)));
};
