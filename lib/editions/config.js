import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CONFIG_DIR = path.join(REPO_ROOT, 'config');

export const EDITIONS_APP_DIR = process.env.EDITIONS_APP_DIR
    ? path.resolve(process.env.EDITIONS_APP_DIR)
    : path.join(REPO_ROOT, 'editions');

export const EDITIONS_CONFIG_PATH = path.join(CONFIG_DIR, 'editions.json');
export const EDITIONS_LOG_PATH = path.join(CONFIG_DIR, 'editions-activity.json');

export const ALL_EDITION_MODULES = [
    'AudioChannels',
    'AudioCodec',
    'Bitrate',
    'ContentRating',
    'Country',
    'Cut',
    'Director',
    'Duration',
    'DynamicRange',
    'FrameRate',
    'Genre',
    'Language',
    'Rating',
    'Release',
    'Resolution',
    'ShortFilm',
    'Size',
    'Source',
    'SpecialFeatures',
    'Studio',
    'VideoCodec',
    'Writer',
];

export const DEFAULT_EDITIONS_CONFIG = {
    skipLibraries: [],
    modules: {
        order: ['Cut', 'Release', 'Resolution', 'DynamicRange', 'AudioCodec', 'Source'],
    },
    language: {
        excludedLanguages: ['English'],
        skipMultipleAudioTracks: true,
    },
    rating: {
        source: 'imdb',
        rottenTomatoesType: 'critic',
        tmdbApiKey: '',
    },
    performance: {
        maxWorkers: 8,
        batchSize: 20,
        metadataBatchSize: 50,
    },
    template: {
        format: 'auto',
        separator: ' • ',
        maxLength: 0,
    },
    tmdbLanguage: {
        hideWhenEnglish: true,
    },
    webhookEnabled: false,
};

const ensureDir = async (dir) => {
    await fs.promises.mkdir(dir, { recursive: true });
};

export const loadEditionsConfig = async () => {
    await ensureDir(CONFIG_DIR);
    try {
        const raw = await fs.promises.readFile(EDITIONS_CONFIG_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        return normalizeEditionsConfig(parsed);
    } catch {
        return { ...DEFAULT_EDITIONS_CONFIG, modules: { ...DEFAULT_EDITIONS_CONFIG.modules, order: [...DEFAULT_EDITIONS_CONFIG.modules.order] } };
    }
};

export const normalizeEditionsConfig = (input = {}) => {
    const base = {
        ...DEFAULT_EDITIONS_CONFIG,
        ...(input && typeof input === 'object' ? input : {}),
        modules: {
            ...DEFAULT_EDITIONS_CONFIG.modules,
            ...(input?.modules && typeof input.modules === 'object' ? input.modules : {}),
        },
        language: {
            ...DEFAULT_EDITIONS_CONFIG.language,
            ...(input?.language && typeof input.language === 'object' ? input.language : {}),
        },
        rating: {
            ...DEFAULT_EDITIONS_CONFIG.rating,
            ...(input?.rating && typeof input.rating === 'object' ? input.rating : {}),
        },
        performance: {
            ...DEFAULT_EDITIONS_CONFIG.performance,
            ...(input?.performance && typeof input.performance === 'object' ? input.performance : {}),
        },
        template: {
            ...DEFAULT_EDITIONS_CONFIG.template,
            ...(input?.template && typeof input.template === 'object' ? input.template : {}),
        },
        tmdbLanguage: {
            ...DEFAULT_EDITIONS_CONFIG.tmdbLanguage,
            ...(input?.tmdbLanguage && typeof input.tmdbLanguage === 'object' ? input.tmdbLanguage : {}),
        },
    };

    const orderRaw = Array.isArray(base.modules.order) ? base.modules.order : String(base.modules.order || '').split(/[;；]/);
    const order = [...new Set(orderRaw.map((m) => String(m || '').trim()).filter(Boolean))]
        .filter((m) => ALL_EDITION_MODULES.includes(m));
    // Keep disabled modules out of order; UI can re-add from catalog.
    base.modules.order = order.length ? order : [...DEFAULT_EDITIONS_CONFIG.modules.order];

    base.skipLibraries = Array.isArray(base.skipLibraries)
        ? base.skipLibraries.map((x) => String(x).trim()).filter(Boolean)
        : String(base.skipLibraries || '').split(/[;；]/).map((x) => x.trim()).filter(Boolean);

    base.language.excludedLanguages = Array.isArray(base.language.excludedLanguages)
        ? base.language.excludedLanguages.map((x) => String(x).trim()).filter(Boolean)
        : String(base.language.excludedLanguages || '').split(/[,;]/).map((x) => x.trim()).filter(Boolean);

    base.language.skipMultipleAudioTracks = base.language.skipMultipleAudioTracks !== false;
    base.webhookEnabled = !!base.webhookEnabled;
    base.performance.maxWorkers = Math.max(1, Math.min(32, Number(base.performance.maxWorkers) || 8));
    base.performance.batchSize = Math.max(1, Math.min(200, Number(base.performance.batchSize) || 20));
    base.performance.metadataBatchSize = Math.max(1, Math.min(200, Number(base.performance.metadataBatchSize) || 50));
    base.template.maxLength = Math.max(0, Number(base.template.maxLength) || 0);

    return base;
};

export const saveEditionsConfig = async (next) => {
    await ensureDir(CONFIG_DIR);
    const normalized = normalizeEditionsConfig(next);
    await fs.promises.writeFile(EDITIONS_CONFIG_PATH, JSON.stringify(normalized, null, 2), 'utf8');
    return normalized;
};

export const buildEditionsCliConfig = (editionsConfig, plex = {}, portalConfig = {}) => {
    const cfg = normalizeEditionsConfig(editionsConfig);
    const tmdbFromPortal = String(portalConfig?.tmdbApiKey || '').trim();
    return {
        server: {
            address: String(plex.base_url || plex.baseUrl || '').replace(/\/$/, ''),
            token: String(plex.token || ''),
            skipLibraries: cfg.skipLibraries,
        },
        modules: { order: cfg.modules.order },
        language: {
            excludedLanguages: cfg.language.excludedLanguages,
            skipMultipleAudioTracks: cfg.language.skipMultipleAudioTracks,
        },
        rating: {
            source: cfg.rating.source,
            rottenTomatoesType: cfg.rating.rottenTomatoesType,
            tmdbApiKey: cfg.rating.tmdbApiKey || tmdbFromPortal || '',
        },
        performance: { ...cfg.performance },
        template: { ...cfg.template },
        tmdbLanguage: { ...cfg.tmdbLanguage },
    };
};
