/**
 * Poster Sets Browse rails: bootstrap first page, then fill up to CAP in the background.
 */
import { runPosterSetsCli } from './runner.js';

export const BROWSE_RAIL_CAP = 600;
export const BROWSE_PAGE_SIZE = 24;
const BROWSE_CACHE_TTL_MS = 15 * 60_000;

/** @typedef {'posterdb_recent' | 'mediux_recent' | 'mediux_title_cards'} BrowseRailId */

const RAIL_DEFS = [
    {
        id: 'posterdb_recent',
        title: 'ThePosterDB · Recently added',
        provider: 'posterdb',
        kind: 'posters',
    },
    {
        id: 'mediux_recent',
        title: 'MediUX · Recently added',
        provider: 'mediux',
        kind: 'posters',
    },
    {
        id: 'mediux_title_cards',
        title: 'MediUX · Title cards',
        provider: 'mediux',
        kind: 'title_cards',
    },
];

/** @type {Map<string, object>} */
const railState = new Map();

const now = () => Date.now();

const emptyRail = (def) => ({
    id: def.id,
    title: def.title,
    provider: def.provider,
    kind: def.kind,
    sets: [],
    byId: new Map(),
    buffered: 0,
    cap: BROWSE_RAIL_CAP,
    loading: false,
    error: null,
    nextPage: 1,
    hasMore: true,
    updatedAt: 0,
    generation: 0,
    fillPromise: null,
});

const getOrCreate = (def) => {
    let state = railState.get(def.id);
    if (!state) {
        state = emptyRail(def);
        railState.set(def.id, state);
    }
    return state;
};

const serializeRail = (state) => ({
    id: state.id,
    title: state.title,
    provider: state.provider,
    sets: state.sets,
    buffered: state.sets.length,
    cap: state.cap,
    loading: Boolean(state.loading),
    error: state.error || null,
});

const mergeSets = (state, incoming = []) => {
    let added = 0;
    for (const raw of Array.isArray(incoming) ? incoming : []) {
        if (!raw?.setId || !raw?.url) continue;
        if (state.sets.length >= state.cap) break;
        const setId = String(raw.setId);
        if (state.byId.has(setId)) {
            const existing = state.byId.get(setId);
            if (!existing.user && raw.user) existing.user = raw.user;
            if ((!existing.title || String(existing.title).startsWith('Set ')) && raw.title) {
                existing.title = raw.title;
            }
            if (!existing.thumbUrl && raw.thumbUrl) existing.thumbUrl = raw.thumbUrl;
            if (!existing.setKind && raw.setKind) existing.setKind = raw.setKind;
            continue;
        }
        const normalized = {
            setId,
            url: String(raw.url),
            title: String(raw.title || `Set ${setId}`),
            user: raw.user || null,
            thumbUrl: raw.thumbUrl || '',
            posterCount: raw.posterCount ?? null,
            provider: state.provider,
            setKind: raw.setKind || (state.kind === 'title_cards' ? 'title_cards' : null),
        };
        state.byId.set(setId, normalized);
        state.sets.push(normalized);
        added += 1;
    }
    state.buffered = state.sets.length;
    state.updatedAt = now();
    return added;
};

const fetchRecentPage = async (state, page) => {
    const run = await runPosterSetsCli('search', {
        provider: state.provider,
        mode: 'recent',
        kind: state.kind,
        page,
        limit: BROWSE_PAGE_SIZE,
        streamBatches: false,
    }, { timeoutMs: 120_000 });
    if (!run.ok) {
        throw new Error(run.error || `${state.id} scrape failed`);
    }
    const result = run.result || {};
    const sets = Array.isArray(result.sets) ? result.sets : [];
    return {
        sets,
        hasMore: result.hasMore !== false && (result.nextPage != null || sets.length > 0),
        nextPage: result.nextPage != null ? Number(result.nextPage) : page + 1,
    };
};

const fillRailInBackground = async (state) => {
    if (state.fillPromise) return state.fillPromise;
    const generation = state.generation;
    state.loading = true;
    state.error = null;
    state.fillPromise = (async () => {
        try {
            while (
                state.generation === generation
                && state.sets.length < state.cap
                && state.hasMore
            ) {
                const page = Math.max(1, Number(state.nextPage) || 1);
                const batch = await fetchRecentPage(state, page);
                if (state.generation !== generation) return;
                const added = mergeSets(state, batch.sets);
                if (!batch.sets.length || (!added && !batch.hasMore)) {
                    state.hasMore = false;
                    break;
                }
                state.nextPage = batch.nextPage || page + 1;
                state.hasMore = Boolean(batch.hasMore) && state.sets.length < state.cap;
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
        } catch (error) {
            if (state.generation === generation) {
                state.error = error instanceof Error ? error.message : String(error || 'Browse scrape failed');
                state.hasMore = false;
            }
        } finally {
            if (state.generation === generation) {
                state.loading = false;
                state.fillPromise = null;
                state.updatedAt = now();
            }
        }
    })();
    return state.fillPromise;
};

const bootstrapRail = async (def, { refresh = false } = {}) => {
    const state = getOrCreate(def);
    const freshEnough = state.sets.length > 0
        && !refresh
        && (now() - (state.updatedAt || 0) < BROWSE_CACHE_TTL_MS);

    if (freshEnough) {
        if (state.hasMore && state.sets.length < state.cap && !state.loading) {
            void fillRailInBackground(state);
        }
        return serializeRail(state);
    }

    // Invalidate any in-flight fill before resetting the buffer.
    state.generation = (state.generation || 0) + 1;
    state.hasMore = false;
    if (state.fillPromise) {
        try { await state.fillPromise; } catch { /* ignore */ }
    }

    state.sets = [];
    state.byId = new Map();
    state.buffered = 0;
    state.error = null;
    state.nextPage = 1;
    state.hasMore = true;
    state.loading = true;
    state.fillPromise = null;
    const generation = state.generation;

    try {
        const first = await fetchRecentPage(state, 1);
        if (state.generation !== generation) return serializeRail(state);
        mergeSets(state, first.sets);
        state.nextPage = first.nextPage || 2;
        state.hasMore = Boolean(first.hasMore) && state.sets.length < state.cap;
    } catch (error) {
        if (state.generation === generation) {
            state.error = error instanceof Error ? error.message : String(error || 'Browse scrape failed');
            state.hasMore = false;
            state.loading = false;
        }
        return serializeRail(state);
    }

    if (state.generation === generation && state.hasMore && state.sets.length < state.cap) {
        void fillRailInBackground(state);
    } else if (state.generation === generation) {
        state.loading = false;
    }
    return serializeRail(state);
};

export const getBrowseRailsSnapshot = async ({ refresh = false } = {}) => {
    const rails = await Promise.all(RAIL_DEFS.map((def) => bootstrapRail(def, { refresh })));
    return { ok: true, rails, cap: BROWSE_RAIL_CAP };
};
