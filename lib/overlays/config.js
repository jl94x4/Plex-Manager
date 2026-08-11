import path from 'path';
import fs from 'fs/promises';
import {
    OVERLAYS_DIR,
    OVERLAYS_CONFIG_PATH,
} from '../data-paths.js';

export { OVERLAYS_DIR, OVERLAYS_CONFIG_PATH };
export const OVERLAYS_LOG_PATH = path.join(OVERLAYS_DIR, 'overlaid_log.json');
export const OVERLAYS_PREVIEW_DIR = path.join(OVERLAYS_DIR, 'preview');

export const DEFAULT_OVERLAYS_CONFIG = {
    enabled: true,
    previewMode: false,
    newSeasonDays: 21,
    librarySectionIds: [],
    overlayPresetId: 'new-season',
    scheduleHours: 24,
    skipIfKometaOverlayLabel: true,
    plexSource: 'portal',
    lastRunAt: null,
    lastRunSummary: null,
};

export const ensureOverlaysDir = async () => {
    await fs.mkdir(OVERLAYS_DIR, { recursive: true });
    await fs.mkdir(OVERLAYS_PREVIEW_DIR, { recursive: true });
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

export const normalizeOverlaysConfig = (input = {}) => {
    const raw = input && typeof input === 'object' ? input : {};
    const days = Number(raw.newSeasonDays ?? raw.new_season_days);
    const scheduleHours = Number(raw.scheduleHours ?? raw.schedule_hours);
    return {
        enabled: raw.enabled === undefined ? true : Boolean(raw.enabled),
        previewMode: raw.previewMode === undefined
            ? Boolean(raw.preview_mode)
            : Boolean(raw.previewMode),
        newSeasonDays: Number.isFinite(days) ? Math.max(1, Math.min(365, Math.round(days))) : 21,
        librarySectionIds: asStringList(raw.librarySectionIds ?? raw.library_section_ids),
        overlayPresetId: String(raw.overlayPresetId || raw.overlay_preset_id || 'new-season').trim() || 'new-season',
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
    const next = normalizeOverlaysConfig({ ...existing, ...(input || {}) });
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

export const saveOverlaysLog = async (log = {}) => {
    await ensureOverlaysDir();
    const data = log && typeof log === 'object' && !Array.isArray(log) ? log : {};
    await fs.writeFile(OVERLAYS_LOG_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    return data;
};

export const listOverlayPresets = async (assetsDir) => {
    try {
        const names = await fs.readdir(assetsDir);
        return names
            .filter((name) => /\.png$/i.test(name))
            .map((name) => ({
                id: name.replace(/\.png$/i, ''),
                file: name,
            }));
    } catch {
        return [{ id: 'new-season', file: 'new-season.png' }];
    }
};
