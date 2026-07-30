/**
 * Durable Poster Sets watch list (AURA-simple).
 * Tracks set URLs + known asset fingerprints for periodic re-apply of new art.
 */
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { ensurePosterSetsDir, POSTER_SETS_DIR, DEFAULT_POSTER_SETS_CONFIG } from './config.js';

export const POSTER_SETS_WATCHES_PATH = path.join(POSTER_SETS_DIR, 'watches.json');

const MAX_WATCHES = 200;
const ALLOWED_FILTERS = new Set(['title_card', 'background', 'season_cover', 'show_cover']);

const emptyState = () => ({ version: 1, watches: [] });

const asFilterList = (value) => {
    const list = Array.isArray(value)
        ? value.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
    const filtered = list.filter((item) => ALLOWED_FILTERS.has(item));
    return filtered.length ? filtered : [...DEFAULT_POSTER_SETS_CONFIG.mediux_filters];
};

const detectProvider = (url) => {
    const raw = String(url || '').toLowerCase();
    if (raw.includes('mediux.pro')) return 'mediux';
    if (raw.includes('theposterdb.com')) return 'posterdb';
    return 'mediux';
};

const parseSetId = (url) => {
    const raw = String(url || '');
    const mediux = raw.match(/\/sets\/(\d+)/i);
    if (mediux) return mediux[1];
    const tpdb = raw.match(/\/set\/(\d+)/i);
    if (tpdb) return tpdb[1];
    return null;
};

const asExternalId = (value) => {
    if (value == null || value === false) return null;
    const text = String(value).trim();
    if (!text || text === '0' || text.toLowerCase() === 'null' || text.toLowerCase() === 'none') return null;
    return text;
};

export const serializeWatch = (watch) => ({
    id: String(watch.id),
    enabled: watch.enabled !== false,
    provider: watch.provider === 'posterdb' ? 'posterdb' : 'mediux',
    url: String(watch.url || '').trim(),
    setId: watch.setId != null ? String(watch.setId) : null,
    title: String(watch.title || '').trim() || null,
    user: String(watch.user || '').trim().replace(/^@/, '') || null,
    tmdbId: asExternalId(watch.tmdbId ?? watch.tmdb_id),
    tvdbId: asExternalId(watch.tvdbId ?? watch.tvdb_id),
    thumbUrl: String(watch.thumbUrl || ''),
    mediuxFilters: asFilterList(watch.mediuxFilters),
    knownAssetIds: Array.isArray(watch.knownAssetIds)
        ? [...new Set(watch.knownAssetIds.map((id) => String(id || '').trim()).filter(Boolean))]
        : [],
    lastCheckedAt: watch.lastCheckedAt || null,
    lastAppliedAt: watch.lastAppliedAt || null,
    lastError: watch.lastError || null,
    lastNewCount: Number.isFinite(Number(watch.lastNewCount)) ? Number(watch.lastNewCount) : 0,
    plexHint: watch.plexHint && typeof watch.plexHint === 'object' ? watch.plexHint : null,
    createdAt: watch.createdAt || null,
    updatedAt: watch.updatedAt || null,
});

let writeChain = Promise.resolve();
const withWatchLock = (fn) => {
    const run = writeChain.then(fn, fn);
    writeChain = run.catch(() => undefined);
    return run;
};

export const loadPosterSetsWatches = async () => {
    await ensurePosterSetsDir();
    try {
        const raw = await fs.readFile(POSTER_SETS_WATCHES_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        const watches = Array.isArray(parsed?.watches)
            ? parsed.watches.map(serializeWatch).filter((w) => w.id && w.url)
            : [];
        return { version: 1, watches: watches.slice(0, MAX_WATCHES) };
    } catch (error) {
        if (error?.code === 'ENOENT') return emptyState();
        throw error;
    }
};

export const savePosterSetsWatches = async (state) => {
    await ensurePosterSetsDir();
    const next = {
        version: 1,
        watches: (Array.isArray(state?.watches) ? state.watches : [])
            .map(serializeWatch)
            .filter((w) => w.id && w.url)
            .slice(0, MAX_WATCHES),
    };
    await fs.writeFile(POSTER_SETS_WATCHES_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    return next;
};

export const updatePosterSetsWatches = async (mutator) => withWatchLock(async () => {
    const current = await loadPosterSetsWatches();
    const next = await mutator({ ...current, watches: [...current.watches] }) || current;
    return savePosterSetsWatches(next);
});

export const listPosterSetsWatches = async () => (await loadPosterSetsWatches()).watches;

export const getPosterSetsWatch = async (id) => {
    const watches = await listPosterSetsWatches();
    return watches.find((watch) => watch.id === String(id)) || null;
};

export const upsertPosterSetsWatch = async (input = {}) => {
    const url = String(input.url || '').trim();
    if (!url) {
        const error = new Error('url is required');
        error.status = 400;
        throw error;
    }
    const now = new Date().toISOString();
    let saved = null;
    await updatePosterSetsWatches((state) => {
        const existing = state.watches.find((watch) => (
            watch.url === url || (input.id && watch.id === String(input.id))
        ));
        if (existing) {
            saved = serializeWatch({
                ...existing,
                ...input,
                id: existing.id,
                url,
                provider: input.provider || existing.provider || detectProvider(url),
                setId: input.setId ?? existing.setId ?? parseSetId(url),
                mediuxFilters: input.mediuxFilters || existing.mediuxFilters,
                knownAssetIds: input.knownAssetIds !== undefined
                    ? input.knownAssetIds
                    : existing.knownAssetIds,
                updatedAt: now,
                createdAt: existing.createdAt || now,
            });
            state.watches = state.watches.map((watch) => (watch.id === existing.id ? saved : watch));
            return state;
        }
        saved = serializeWatch({
            id: crypto.randomUUID(),
            enabled: input.enabled !== false,
            provider: input.provider || detectProvider(url),
            url,
            setId: input.setId ?? parseSetId(url),
            title: input.title || null,
            user: input.user || null,
            tmdbId: input.tmdbId ?? input.tmdb_id ?? null,
            tvdbId: input.tvdbId ?? input.tvdb_id ?? null,
            thumbUrl: input.thumbUrl || '',
            mediuxFilters: input.mediuxFilters,
            knownAssetIds: input.knownAssetIds || [],
            lastCheckedAt: null,
            lastAppliedAt: null,
            lastError: null,
            lastNewCount: 0,
            plexHint: input.plexHint || null,
            createdAt: now,
            updatedAt: now,
        });
        state.watches = [saved, ...state.watches];
        return state;
    });
    return saved;
};

export const patchPosterSetsWatch = async (id, patch = {}) => {
    let updated = null;
    await updatePosterSetsWatches((state) => {
        state.watches = state.watches.map((watch) => {
            if (watch.id !== String(id)) return watch;
            updated = serializeWatch({
                ...watch,
                ...patch,
                id: watch.id,
                updatedAt: new Date().toISOString(),
            });
            return updated;
        });
        return state;
    });
    return updated;
};

export const deletePosterSetsWatch = async (id) => {
    let removed = null;
    await updatePosterSetsWatches((state) => {
        const next = [];
        for (const watch of state.watches) {
            if (watch.id === String(id)) removed = watch;
            else next.push(watch);
        }
        state.watches = next;
        return state;
    });
    return removed;
};

export const watchStats = (watches = []) => {
    const list = Array.isArray(watches) ? watches : [];
    return {
        total: list.length,
        enabled: list.filter((w) => w.enabled).length,
        errored: list.filter((w) => w.lastError).length,
    };
};
