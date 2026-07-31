/**
 * Poster Sets Browse rails: bootstrap first page, then fill up to CAP in the background.
 * In-memory + disk cache so revisiting Browse is instant; only Refresh wipes.
 * Soft revisits merge newest cards on top without discarding what you already loaded.
 */
import fs from 'fs/promises';
import path from 'path';
import { runPosterSetsCli } from './runner.js';
import { loadPosterSetsConfig, POSTER_SETS_DIR } from './config.js';

export const BROWSE_RAIL_CAP = 600;
export const BROWSE_PAGE_SIZE = 24;
/** Serve cached rails for a long time; soft-revalidate in the background. */
const BROWSE_CACHE_TTL_MS = 24 * 60 * 60_000;
/** How often a soft revisit may fetch newest pages and merge (without wiping). */
const BROWSE_REVALIDATE_MS = 5 * 60_000;
const FOLLOWING_PER_CREATOR_LIMIT = 36;
const FOLLOWING_CREATOR_CONCURRENCY = 2;
const DISK_CACHE_PATH = path.join(POSTER_SETS_DIR, 'browse-cache.json');

/** @typedef {'posterdb_recent' | 'mediux_recent' | 'mediux_title_cards' | 'following'} BrowseRailId */

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

const FOLLOWING_DEF = {
    id: 'following',
    title: 'Creators you follow',
    provider: 'both',
    kind: 'following',
};

/** @type {Map<string, object>} */
const railState = new Map();
let diskHydrated = false;
let diskSaveTimer = null;

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
    lastRevalidatedAt: 0,
    generation: 0,
    fillPromise: null,
    usernames: [],
});

const getOrCreate = (def) => {
    let state = railState.get(def.id);
    if (!state) {
        state = emptyRail(def);
        railState.set(def.id, state);
    }
    return state;
};

const whitelistKey = (usernames = []) => [...usernames]
    .map((item) => String(item || '').trim().replace(/^@+/, '').toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|');

/** Newer MediUX / TPDB set ids are higher — use as latest-first proxy (no date on cards). */
const sortSetsLatestFirst = (state) => {
    state.sets.sort((a, b) => {
        const aId = Number(a?.setId);
        const bId = Number(b?.setId);
        if (Number.isFinite(aId) && Number.isFinite(bId) && aId !== bId) return bId - aId;
        return String(b?.setId || '').localeCompare(String(a?.setId || ''), undefined, { numeric: true });
    });
};

const serializeRail = (state) => {
    if (state.kind === 'following' && state.sets.length > 1) {
        sortSetsLatestFirst(state);
    }
    return {
        id: state.id,
        title: state.title,
        provider: state.provider,
        kind: state.kind,
        sets: state.sets,
        buffered: state.sets.length,
        cap: state.cap,
        loading: Boolean(state.loading),
        hasMore: Boolean(state.hasMore),
        error: state.error || null,
    };
};

const setKey = (raw, fallbackProvider) => {
    const setId = String(raw?.setId || '').trim();
    if (!setId) return '';
    const provider = String(raw?.provider || fallbackProvider || 'unknown').toLowerCase();
    return `${provider}:${setId}`;
};

const mergeSets = (state, incoming = []) => {
    let added = 0;
    for (const raw of Array.isArray(incoming) ? incoming : []) {
        if (!raw?.setId || !raw?.url) continue;
        if (state.sets.length >= state.cap) break;
        const key = setKey(raw, state.provider);
        if (!key) continue;
        if (state.byId.has(key)) {
            const existing = state.byId.get(key);
            if (!existing.user && raw.user) existing.user = raw.user;
            if ((!existing.title || String(existing.title).startsWith('Set ')) && raw.title) {
                existing.title = raw.title;
            }
            if (!existing.thumbUrl && raw.thumbUrl) existing.thumbUrl = raw.thumbUrl;
            if (!existing.setKind && raw.setKind) existing.setKind = raw.setKind;
            continue;
        }
        const normalized = {
            setId: String(raw.setId),
            url: String(raw.url),
            title: String(raw.title || `Set ${raw.setId}`),
            user: raw.user || null,
            thumbUrl: raw.thumbUrl || '',
            posterCount: raw.posterCount ?? null,
            provider: raw.provider || state.provider,
            setKind: raw.setKind || (state.kind === 'title_cards' ? 'title_cards' : null),
        };
        state.byId.set(key, normalized);
        state.sets.push(normalized);
        added += 1;
    }
    state.buffered = state.sets.length;
    state.updatedAt = now();
    if (state.kind === 'following' && added > 0) {
        sortSetsLatestFirst(state);
    }
    return added;
};

const scheduleDiskCacheSave = ({ immediate = false } = {}) => {
    const write = async () => {
        diskSaveTimer = null;
        try {
            await fs.mkdir(POSTER_SETS_DIR, { recursive: true });
            const rails = [...railState.values()]
                .filter((state) => state.sets.length > 0)
                .map((state) => ({
                    ...serializeRail(state),
                    // Never persist loading=true — remount should show cards, then soft-fill.
                    loading: false,
                    usernames: state.usernames || [],
                    nextPage: state.nextPage,
                    updatedAt: state.updatedAt,
                    lastRevalidatedAt: state.lastRevalidatedAt || state.updatedAt,
                    hasMore: Boolean(state.hasMore) && state.sets.length < state.cap,
                }));
            await fs.writeFile(
                DISK_CACHE_PATH,
                JSON.stringify({ savedAt: now(), rails }),
                'utf8',
            );
        } catch {
            // disk cache is best-effort
        }
    };
    if (immediate) {
        if (diskSaveTimer) {
            clearTimeout(diskSaveTimer);
            diskSaveTimer = null;
        }
        void write();
        return;
    }
    if (diskSaveTimer) return;
    diskSaveTimer = setTimeout(() => { void write(); }, 1200);
};

const hydrateFromDisk = async () => {
    if (diskHydrated) return;
    diskHydrated = true;
    try {
        const raw = JSON.parse(await fs.readFile(DISK_CACHE_PATH, 'utf8'));
        if (!raw?.savedAt || (now() - Number(raw.savedAt)) > BROWSE_CACHE_TTL_MS) return;
        for (const rail of Array.isArray(raw.rails) ? raw.rails : []) {
            const def = RAIL_DEFS.find((entry) => entry.id === rail.id)
                || (rail.id === FOLLOWING_DEF.id ? FOLLOWING_DEF : null);
            if (!def) continue;
            const state = getOrCreate(def);
            if (state.sets.length) continue;
            state.sets = [];
            state.byId = new Map();
            mergeSets(state, rail.sets || []);
            state.loading = false;
            state.error = null;
            state.nextPage = Number(rail.nextPage) || 2;
            state.hasMore = Boolean(rail.hasMore) && state.sets.length < state.cap;
            state.updatedAt = Number(rail.updatedAt) || Number(raw.savedAt) || now();
            state.lastRevalidatedAt = Number(rail.lastRevalidatedAt) || state.updatedAt;
            state.usernames = Array.isArray(rail.usernames) ? rail.usernames.map(String) : [];
        }
    } catch {
        // ignore missing/invalid cache
    }
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

const fetchCreatorProviderSets = async (username, provider) => {
    const run = await runPosterSetsCli('search', {
        provider,
        mode: 'creator',
        query: username,
        limit: FOLLOWING_PER_CREATOR_LIMIT,
        streamBatches: false,
        batchPages: 2,
    }, { timeoutMs: 180_000 });
    if (!run.ok) {
        return { sets: [], error: run.error || `${provider} @${username} failed` };
    }
    const sets = Array.isArray(run.result?.sets) ? run.result.sets : [];
    return {
        sets: sets.map((item) => ({
            ...item,
            provider: item.provider || provider,
            user: item.user || username,
        })),
        error: null,
    };
};

const mapPool = async (items, concurrency, worker) => {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return;
    let index = 0;
    const runners = Array.from({ length: Math.min(concurrency, list.length) }, async () => {
        while (index < list.length) {
            const current = index;
            index += 1;
            await worker(list[current], current);
        }
    });
    await Promise.all(runners);
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
                scheduleDiskCacheSave();
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
                state.lastRevalidatedAt = now();
                scheduleDiskCacheSave({ immediate: true });
            }
        }
    })();
    return state.fillPromise;
};

/** Fetch only the newest creator pages and merge — never clears existing cards. */
const softRevalidateFollowing = async (state, usernames) => {
    if (state.fillPromise) return state.fillPromise;
    const generation = state.generation;
    state.loading = true;
    state.error = null;
    state.fillPromise = (async () => {
        const errors = [];
        try {
            await mapPool(usernames, FOLLOWING_CREATOR_CONCURRENCY, async (username) => {
                if (state.generation !== generation) return;
                for (const provider of ['mediux', 'posterdb']) {
                    if (state.generation !== generation) return;
                    if (state.sets.length >= state.cap) return;
                    const batch = await fetchCreatorProviderSets(username, provider);
                    if (state.generation !== generation) return;
                    if (batch.error) errors.push(batch.error);
                    mergeSets(state, batch.sets);
                    scheduleDiskCacheSave();
                }
            });
            if (state.generation === generation && !state.sets.length && errors.length) {
                state.error = errors[0];
            }
        } catch (error) {
            if (state.generation === generation) {
                state.error = error instanceof Error ? error.message : String(error || 'Following scrape failed');
            }
        } finally {
            if (state.generation === generation) {
                state.loading = false;
                state.hasMore = false;
                state.fillPromise = null;
                state.updatedAt = now();
                state.lastRevalidatedAt = now();
                scheduleDiskCacheSave({ immediate: true });
            }
        }
    })();
    return state.fillPromise;
};

const fillFollowingInBackground = async (state, usernames, generation) => {
    if (state.fillPromise) return state.fillPromise;
    state.loading = true;
    state.error = null;
    state.fillPromise = (async () => {
        const errors = [];
        try {
            await mapPool(usernames, FOLLOWING_CREATOR_CONCURRENCY, async (username) => {
                if (state.generation !== generation) return;
                for (const provider of ['mediux', 'posterdb']) {
                    if (state.generation !== generation) return;
                    if (state.sets.length >= state.cap) return;
                    const batch = await fetchCreatorProviderSets(username, provider);
                    if (state.generation !== generation) return;
                    if (batch.error) errors.push(batch.error);
                    mergeSets(state, batch.sets);
                    scheduleDiskCacheSave();
                }
            });
            if (state.generation === generation) {
                if (!state.sets.length && errors.length) {
                    state.error = errors[0];
                }
            }
        } catch (error) {
            if (state.generation === generation) {
                state.error = error instanceof Error ? error.message : String(error || 'Following scrape failed');
            }
        } finally {
            if (state.generation === generation) {
                state.loading = false;
                state.hasMore = false;
                state.fillPromise = null;
                state.updatedAt = now();
                state.lastRevalidatedAt = now();
                scheduleDiskCacheSave({ immediate: true });
            }
        }
    })();
    return state.fillPromise;
};

const resetRailContents = (state) => {
    state.sets = [];
    state.byId = new Map();
    state.buffered = 0;
    state.error = null;
    state.nextPage = 1;
    state.hasMore = true;
    state.loading = false;
    state.fillPromise = null;
};

const bootstrapFollowingRail = async (usernames, { refresh = false } = {}) => {
    const state = getOrCreate(FOLLOWING_DEF);
    const key = whitelistKey(usernames);
    const sameUsers = whitelistKey(state.usernames) === key;
    const age = now() - (state.updatedAt || 0);
    const revalidateAge = now() - (state.lastRevalidatedAt || state.updatedAt || 0);
    const hasCache = sameUsers && state.sets.length > 0;

    // Hard refresh or whitelist change — wipe and rebuild.
    if (refresh || (state.usernames?.length && !sameUsers)) {
        state.generation = (state.generation || 0) + 1;
        if (state.fillPromise) {
            try { await state.fillPromise; } catch { /* ignore */ }
        }
        resetRailContents(state);
        state.hasMore = false;
        state.loading = true;
        state.usernames = [...usernames];
        const generation = state.generation;
        void fillFollowingInBackground(state, usernames, generation);
        return serializeRail(state);
    }

    // First cold start (no memory/disk cache yet).
    if (!hasCache && !state.loading && !state.fillPromise) {
        state.generation = (state.generation || 0) + 1;
        resetRailContents(state);
        state.hasMore = false;
        state.loading = true;
        state.usernames = [...usernames];
        const generation = state.generation;
        void fillFollowingInBackground(state, usernames, generation);
        return serializeRail(state);
    }

    // Always serve whatever we already have (including in-flight progress).
    state.usernames = [...usernames];

    // Still scraping the initial fill — never restart.
    if (state.loading || state.fillPromise) {
        return serializeRail(state);
    }

    // Soft revalidate: pull newest creator pages and merge on top when stale.
    if (hasCache && (age > BROWSE_CACHE_TTL_MS || revalidateAge >= BROWSE_REVALIDATE_MS)) {
        void softRevalidateFollowing(state, usernames);
    }

    return serializeRail(state);
};

const softRevalidateRecent = async (state) => {
    if (state.fillPromise || state.loading) return;
    const generation = state.generation;
    state.loading = true;
    state.fillPromise = (async () => {
        try {
            const first = await fetchRecentPage(state, 1);
            if (state.generation !== generation) return;
            mergeSets(state, first.sets);
            if (!state.nextPage || state.nextPage < 2) {
                state.nextPage = first.nextPage || 2;
            }
            state.hasMore = state.sets.length < state.cap && (
                Boolean(state.hasMore) || Boolean(first.hasMore)
            );
            scheduleDiskCacheSave();
        } catch (error) {
            if (state.generation === generation && !state.sets.length) {
                state.error = error instanceof Error ? error.message : String(error || 'Browse scrape failed');
            }
        } finally {
            if (state.generation === generation) {
                state.loading = false;
                state.fillPromise = null;
                state.updatedAt = now();
                state.lastRevalidatedAt = now();
                scheduleDiskCacheSave({ immediate: true });
                if (state.hasMore && state.sets.length < state.cap) {
                    void fillRailInBackground(state);
                }
            }
        }
    })();
    return state.fillPromise;
};

const bootstrapRail = async (def, { refresh = false } = {}) => {
    const state = getOrCreate(def);
    const age = now() - (state.updatedAt || 0);
    const revalidateAge = now() - (state.lastRevalidatedAt || state.updatedAt || 0);
    const hasCache = state.sets.length > 0;

    if (refresh) {
        state.generation = (state.generation || 0) + 1;
        if (state.fillPromise) {
            try { await state.fillPromise; } catch { /* ignore */ }
        }
        resetRailContents(state);
        state.loading = true;
        const generation = state.generation;
        try {
            const first = await fetchRecentPage(state, 1);
            if (state.generation !== generation) return serializeRail(state);
            mergeSets(state, first.sets);
            scheduleDiskCacheSave();
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
            state.lastRevalidatedAt = now();
            scheduleDiskCacheSave({ immediate: true });
        }
        return serializeRail(state);
    }

    // In-flight or warm cache — serve immediately.
    if (hasCache || state.loading || state.fillPromise) {
        if (hasCache && !state.loading && !state.fillPromise) {
            if (state.hasMore && state.sets.length < state.cap) {
                void fillRailInBackground(state);
            } else if (age > BROWSE_CACHE_TTL_MS || revalidateAge >= BROWSE_REVALIDATE_MS) {
                void softRevalidateRecent(state);
            }
        }
        return serializeRail(state);
    }

    // Cold start.
    state.generation = (state.generation || 0) + 1;
    resetRailContents(state);
    state.loading = true;
    const generation = state.generation;

    try {
        const first = await fetchRecentPage(state, 1);
        if (state.generation !== generation) return serializeRail(state);
        mergeSets(state, first.sets);
        scheduleDiskCacheSave();
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
        state.lastRevalidatedAt = now();
        scheduleDiskCacheSave({ immediate: true });
    }
    return serializeRail(state);
};

export const getBrowseRailsSnapshot = async ({ refresh = false } = {}) => {
    await hydrateFromDisk();
    const config = await loadPosterSetsConfig();
    const whitelist = Array.isArray(config.creatorWhitelist) ? config.creatorWhitelist : [];
    const rails = await Promise.all(RAIL_DEFS.map((def) => bootstrapRail(def, { refresh })));
    if (whitelist.length) {
        const following = await bootstrapFollowingRail(whitelist, { refresh });
        rails.unshift(following);
    }
    return { ok: true, rails, cap: BROWSE_RAIL_CAP, creatorWhitelist: whitelist };
};
