import path from 'path';
import fs from 'fs/promises';
import { CONFIG_DIR } from '../data-paths.js';

export const POSTER_SETS_DIR = process.env.POSTER_SETS_CONFIG_DIR
    ? path.resolve(process.env.POSTER_SETS_CONFIG_DIR)
    : path.join(CONFIG_DIR, 'poster-sets');

export const POSTER_SETS_CONFIG_PATH = path.join(POSTER_SETS_DIR, 'config.json');

export const DEFAULT_POSTER_SETS_CONFIG = {
    base_url: '',
    token: '',
    bulk_txt: 'bulk_import.txt',
    tv_library: ['TV Shows'],
    movie_library: ['Movies'],
    mediux_filters: ['title_card', 'background', 'season_cover', 'show_cover'],
    /** Clear Kometa's Overlay label after upload so the next Kometa run reapplies overlays on new art. */
    reset_overlay: true,
};

const asLibraryList = (value) => {
    if (Array.isArray(value)) {
        return value.map((item) => String(item || '').trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
    }
    return [];
};

const asFilterList = (value) => {
    const allowed = new Set(['title_card', 'background', 'season_cover', 'show_cover']);
    return asLibraryList(value).filter((item) => allowed.has(item));
};

export const normalizePosterSetsConfig = (input = {}) => {
    const filters = asFilterList(input.mediux_filters);
    const resetOverlay = input.reset_overlay;
    return {
        base_url: String(input.base_url || '').trim(),
        token: String(input.token || '').trim(),
        bulk_txt: String(input.bulk_txt || 'bulk_import.txt').trim() || 'bulk_import.txt',
        tv_library: asLibraryList(input.tv_library),
        movie_library: asLibraryList(input.movie_library),
        mediux_filters: filters.length
            ? filters
            : [...DEFAULT_POSTER_SETS_CONFIG.mediux_filters],
        reset_overlay: resetOverlay === undefined ? true : !!resetOverlay,
    };
};

export const maskPosterSetsConfig = (config) => {
    const normalized = normalizePosterSetsConfig(config);
    const hasToken = Boolean(normalized.token);
    return {
        ...normalized,
        token: hasToken ? '********' : '',
        hasToken,
        configured: Boolean(normalized.base_url && hasToken),
    };
};

export const ensurePosterSetsDir = async () => {
    await fs.mkdir(POSTER_SETS_DIR, { recursive: true });
};

export const loadPosterSetsConfig = async () => {
    await ensurePosterSetsDir();
    try {
        const raw = await fs.readFile(POSTER_SETS_CONFIG_PATH, 'utf8');
        return normalizePosterSetsConfig(JSON.parse(raw));
    } catch (error) {
        if (error?.code === 'ENOENT') return normalizePosterSetsConfig(DEFAULT_POSTER_SETS_CONFIG);
        throw error;
    }
};

export const savePosterSetsConfig = async (input = {}, { keepExistingToken = true } = {}) => {
    const existing = await loadPosterSetsConfig();
    const incoming = input && typeof input === 'object' ? input : {};
    let token = String(incoming.token || '').trim();
    if ((!token || token === '********') && keepExistingToken) {
        token = existing.token;
    }
    const next = normalizePosterSetsConfig({
        ...existing,
        ...incoming,
        token,
    });
    await ensurePosterSetsDir();
    await fs.writeFile(POSTER_SETS_CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    return next;
};

export const resolveBulkFilePath = (config) => {
    const name = String(config?.bulk_txt || 'bulk_import.txt').trim() || 'bulk_import.txt';
    const safe = path.basename(name);
    return path.join(POSTER_SETS_DIR, safe);
};
