/**
 * Followed-creator collection / boxset catalog.
 * Disk-cached like Browse → Following; TPDB collection sets are always hydrated.
 */
import fs from 'fs/promises';
import path from 'path';
import { runPosterSetsCli } from './runner.js';
import { loadPosterSetsConfig, POSTER_SETS_DIR } from './config.js';
import {
    excludeBlockedCreators,
    filterCollectionSets,
    isCollectionSet,
    keepFollowedCreatorsOnly,
} from './searchMerge.js';
import { enqueueTpdbLibraryTitleHydrate } from './tpdbCache.js';

const COLLECTIONS_PER_CREATOR_LIMIT = 400;
const COLLECTIONS_MAX_PAGES = 30;
const COLLECTIONS_CREATOR_CONCURRENCY = 2;
const COLLECTIONS_CACHE_TTL_MS = 24 * 60 * 60_000;
const COLLECTIONS_REVALIDATE_MS = 15 * 60_000;
const DISK_CACHE_PATH = path.join(POSTER_SETS_DIR, 'collections-cache.json');

const now = () => Date.now();

const emptyState = () => ({
    sets: [],
    byId: new Map(),
    loading: false,
    error: null,
    updatedAt: 0,
    lastRevalidatedAt: 0,
    generation: 0,
    fillPromise: null,
    usernames: [],
    hydratedKeys: new Set(),
});

/** @type {ReturnType<typeof emptyState>} */
let catalogState = emptyState();
let diskHydrated = false;
/** @type {Promise<void> | null} */
let diskHydratePromise = null;
let diskSaveTimer = null;

const whitelistKey = (usernames = []) => [...usernames]
    .map((item) => String(item || '').trim().replace(/^@+/, '').toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|');

const setKey = (raw) => {
    const setId = String(raw?.setId || '').trim();
    if (!setId) return '';
    const provider = String(raw?.provider || 'unknown').toLowerCase();
    return `${provider}:${setId}`;
};

const sortSetsLatestFirst = (sets) => {
    const list = Array.isArray(sets) ? [...sets] : [];
    list.sort((a, b) => {
        const aId = Number(a?.setId);
        const bId = Number(b?.setId);
        if (Number.isFinite(aId) && Number.isFinite(bId) && aId !== bId) return bId - aId;
        return String(b?.setId || '').localeCompare(String(a?.setId || ''), undefined, { numeric: true });
    });
    return list;
};

const normalizeSet = (raw, fallbackUser = '') => {
    if (!raw?.setId || !raw?.url) return null;
    return {
        setId: String(raw.setId),
        url: String(raw.url),
        title: String(raw.title || `Set ${raw.setId}`),
        user: raw.user || fallbackUser || null,
        thumbUrl: raw.thumbUrl || '',
        posterCount: raw.posterCount ?? raw.assetCount ?? null,
        provider: raw.provider || 'unknown',
        setKind: raw.setKind
            || (/box\s*sets?/i.test(String(raw.title || '')) ? 'boxset' : null)
            || (isCollectionSet(raw) ? 'collection' : null),
        mediaType: raw.mediaType || null,
    };
};

const groupByCreator = (sets = []) => {
    const groups = new Map();
    for (const set of Array.isArray(sets) ? sets : []) {
        const handle = String(set?.user || '').trim().replace(/^@+/, '') || 'Unknown';
        const key = handle.toLowerCase();
        if (!groups.has(key)) groups.set(key, { user: handle, sets: [] });
        groups.get(key).sets.push(set);
    }
    return [...groups.values()].sort((a, b) => a.user.localeCompare(b.user, undefined, { sensitivity: 'base' }));
};

const serializeCatalog = (state, { usernames = [], blocklist = [] } = {}) => {
    const sets = excludeBlockedCreators(state.sets, blocklist);
    return {
        ok: true,
        loading: Boolean(state.loading),
        error: state.error || null,
        sets,
        groups: groupByCreator(sets),
        buffered: sets.length,
        usernames: Array.isArray(usernames) ? usernames : state.usernames,
        updatedAt: state.updatedAt || 0,
    };
};

const publishCollected = (state, collected) => {
    const byId = new Map();
    for (const raw of Array.isArray(collected) ? collected : []) {
        const item = normalizeSet(raw);
        if (!item) continue;
        const key = setKey(item);
        if (!key || byId.has(key)) continue;
        byId.set(key, item);
    }
    state.sets = sortSetsLatestFirst([...byId.values()]);
    state.byId = byId;
    state.updatedAt = now();
};

const scheduleDiskCacheSave = ({ immediate = false } = {}) => {
    if (diskSaveTimer) clearTimeout(diskSaveTimer);
    const save = async () => {
        diskSaveTimer = null;
        try {
            await fs.mkdir(POSTER_SETS_DIR, { recursive: true });
            await fs.writeFile(DISK_CACHE_PATH, JSON.stringify({
                savedAt: now(),
                usernames: catalogState.usernames,
                sets: catalogState.sets,
            }), 'utf8');
        } catch {
            /* ignore disk write failures */
        }
    };
    if (immediate) {
        void save();
        return;
    }
    diskSaveTimer = setTimeout(() => { void save(); }, 1200);
};

const hydrateFromDisk = async () => {
    if (diskHydrated) return;
    if (diskHydratePromise) return diskHydratePromise;
    diskHydratePromise = (async () => {
        try {
            const raw = JSON.parse(await fs.readFile(DISK_CACHE_PATH, 'utf8'));
            const sets = Array.isArray(raw?.sets) ? raw.sets : [];
            if (sets.length) {
                publishCollected(catalogState, sets);
                catalogState.usernames = Array.isArray(raw.usernames) ? raw.usernames : [];
                catalogState.updatedAt = Number(raw.savedAt) || now();
                catalogState.lastRevalidatedAt = catalogState.updatedAt;
            }
        } catch {
            /* missing or invalid cache */
        } finally {
            diskHydrated = true;
            diskHydratePromise = null;
        }
    })();
    return diskHydratePromise;
};

const fetchCreatorCollectionSets = async (username, provider) => {
    const run = await runPosterSetsCli('search', {
        provider,
        mode: 'creator',
        query: username,
        kind: 'collections',
        limit: COLLECTIONS_PER_CREATOR_LIMIT,
        maxPages: COLLECTIONS_MAX_PAGES,
        streamBatches: false,
        batchPages: 3,
    }, { timeoutMs: 240_000 });
    if (!run.ok) {
        return { sets: [], error: run.error || `${provider} @${username} failed` };
    }
    const sets = filterCollectionSets(Array.isArray(run.result?.sets) ? run.result.sets : []);
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

const hydrateFollowedCollectionSets = (sets = []) => {
    const tpdbSets = (Array.isArray(sets) ? sets : []).filter((item) => {
        const provider = String(item?.provider || '').toLowerCase();
        return provider === 'posterdb' || provider === 'tpdb' || provider === 'theposterdb';
    });
    if (!tpdbSets.length) return;
    const fresh = [];
    for (const set of tpdbSets) {
        const key = setKey(set);
        if (!key || catalogState.hydratedKeys.has(key)) continue;
        catalogState.hydratedKeys.add(key);
        fresh.push(set);
    }
    if (!fresh.length) return;
    void enqueueTpdbLibraryTitleHydrate(fresh, {
        collectionSets: true,
        force: true,
        followedCreatorsOnly: true,
        titleKey: 'followed-collection-sets',
    });
};

const fillCollectionsInBackground = async (state, usernames, generation) => {
    if (state.fillPromise) return state.fillPromise;
    state.loading = true;
    state.error = null;
    const hadCacheAtStart = state.sets.length > 0;
    state.fillPromise = (async () => {
        const errors = [];
        const collected = [];
        try {
            await mapPool(usernames, COLLECTIONS_CREATOR_CONCURRENCY, async (username) => {
                if (state.generation !== generation) return;
                for (const provider of ['mediux', 'posterdb']) {
                    if (state.generation !== generation) return;
                    const batch = await fetchCreatorCollectionSets(username, provider);
                    if (state.generation !== generation) return;
                    if (batch.error) errors.push(batch.error);
                    for (const item of batch.sets || []) collected.push(item);
                    if (!hadCacheAtStart && state.generation === generation) {
                        publishCollected(state, collected);
                        hydrateFollowedCollectionSets(collected);
                        scheduleDiskCacheSave();
                    }
                }
            });
            if (state.generation === generation) {
                publishCollected(state, collected);
                hydrateFollowedCollectionSets(collected);
                if (!state.sets.length && errors.length) {
                    state.error = errors[0];
                }
            }
        } catch (error) {
            if (state.generation === generation) {
                state.error = error instanceof Error ? error.message : String(error || 'Collection scrape failed');
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

const resetCatalog = () => {
    const generation = catalogState.generation || 0;
    catalogState = emptyState();
    catalogState.generation = generation;
};

export const getCollectionSetsSnapshot = async ({ refresh = false } = {}) => {
    await hydrateFromDisk();
    const config = await loadPosterSetsConfig();
    const whitelist = Array.isArray(config.creatorWhitelist) ? config.creatorWhitelist : [];
    const blocklist = Array.isArray(config.creatorBlocklist) ? config.creatorBlocklist : [];
    const usernames = whitelist
        .map((item) => String(item || '').trim().replace(/^@+/, ''))
        .filter(Boolean);
    const key = whitelistKey(usernames);
    const sameUsers = whitelistKey(catalogState.usernames) === key;
    const age = now() - (catalogState.updatedAt || 0);
    const revalidateAge = now() - (catalogState.lastRevalidatedAt || catalogState.updatedAt || 0);
    const hasCache = sameUsers && catalogState.sets.length > 0;

    if (!usernames.length) {
        if (catalogState.usernames.length) resetCatalog();
        return {
            ok: true,
            loading: false,
            error: null,
            sets: [],
            groups: [],
            buffered: 0,
            usernames: [],
            updatedAt: 0,
            needsFollowers: true,
        };
    }

    if (refresh || (catalogState.usernames?.length && !sameUsers)) {
        catalogState.generation = (catalogState.generation || 0) + 1;
        if (catalogState.fillPromise) {
            try { await catalogState.fillPromise; } catch { /* ignore */ }
        }
        if (!sameUsers) resetCatalog();
        catalogState.loading = true;
        catalogState.error = null;
        catalogState.fillPromise = null;
        catalogState.usernames = [...usernames];
        const generation = catalogState.generation;
        void fillCollectionsInBackground(catalogState, usernames, generation);
        return serializeCatalog(catalogState, { usernames, blocklist });
    }

    if (!hasCache && !catalogState.loading && !catalogState.fillPromise) {
        catalogState.generation = (catalogState.generation || 0) + 1;
        resetCatalog();
        catalogState.loading = true;
        catalogState.usernames = [...usernames];
        const generation = catalogState.generation;
        void fillCollectionsInBackground(catalogState, usernames, generation);
        return serializeCatalog(catalogState, { usernames, blocklist });
    }

    catalogState.usernames = [...usernames];
    if (catalogState.loading || catalogState.fillPromise) {
        return serializeCatalog(catalogState, { usernames, blocklist });
    }

    if (hasCache && (age > COLLECTIONS_CACHE_TTL_MS || revalidateAge >= COLLECTIONS_REVALIDATE_MS)) {
        catalogState.generation = (catalogState.generation || 0) + 1;
        void fillCollectionsInBackground(catalogState, usernames, catalogState.generation);
    } else {
        hydrateFollowedCollectionSets(keepFollowedCreatorsOnly(catalogState.sets, usernames));
    }

    return serializeCatalog(catalogState, { usernames, blocklist });
};

/** Kick a background fill + hydrate without waiting (cache build / settings save). */
export const ensureFollowedCollectionSetsCached = () => {
    void getCollectionSetsSnapshot({ refresh: false });
};
