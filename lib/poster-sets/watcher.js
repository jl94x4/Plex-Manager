/**
 * Periodic Poster Sets watcher — re-scrape watched sets and enqueue new assets.
 */
import { loadPosterSetsConfig } from './config.js';
import { runPosterSetsCli } from './runner.js';
import { enqueuePosterSetsJob } from './queue.js';
import {
    listPosterSetsWatches,
    patchPosterSetsWatch,
    upsertPosterSetsWatch,
} from './watches.js';

let watcherTimer = null;
let watcherBusy = false;
let enqueueApplyFn = null;
let notifyDigestFn = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const setPosterSetsEnqueueApply = (fn) => {
    enqueueApplyFn = typeof fn === 'function' ? fn : null;
};

/** Injected from portal boot — typically sendGotifyAlert wrapper. */
export const setPosterSetsNotifyDigest = (fn) => {
    notifyDigestFn = typeof fn === 'function' ? fn : null;
};

const inspectSetAssets = async (url, mediuxFilters) => {
    const config = await loadPosterSetsConfig();
    const run = await runPosterSetsCli('inspect', {
        config: {
            ...config,
            mediux_filters: Array.isArray(mediuxFilters) && mediuxFilters.length
                ? mediuxFilters
                : config.mediux_filters,
        },
        url,
        mediuxFilters,
    }, { timeoutMs: 180_000 });
    if (!run.ok) {
        const error = new Error(run.error || 'Failed to inspect set');
        error.logs = run.logs;
        throw error;
    }
    return run.result || {};
};

export const checkPosterSetsWatch = async (watch, { enqueue = true } = {}) => {
    if (!watch?.url) throw new Error('Watch URL is required');
    const inspected = await inspectSetAssets(watch.url, watch.mediuxFilters);
    const assets = Array.isArray(inspected.assets) ? inspected.assets : [];
    const assetIds = assets.map((asset) => String(asset.id || '').trim()).filter(Boolean);
    const known = new Set((watch.knownAssetIds || []).map((id) => String(id)));
    const isFirstCheck = known.size === 0;
    const newIds = isFirstCheck ? [] : assetIds.filter((id) => !known.has(id));
    const setMeta = inspected.setMeta || {
        provider: watch.provider,
        setId: watch.setId,
        url: watch.url,
        title: watch.title,
        user: watch.user,
        tmdbId: watch.tmdbId,
        tvdbId: watch.tvdbId,
        thumbUrl: watch.thumbUrl,
        assetCount: assetIds.length,
    };

    const idPatch = {
        tmdbId: setMeta.tmdbId || watch.tmdbId || null,
        tvdbId: setMeta.tvdbId || watch.tvdbId || null,
    };

    // First check: baseline fingerprints only (do not re-apply the whole historical set).
    if (isFirstCheck) {
        const patched = await patchPosterSetsWatch(watch.id, {
            knownAssetIds: assetIds,
            title: setMeta.title || watch.title,
            user: setMeta.user || watch.user,
            thumbUrl: setMeta.thumbUrl || watch.thumbUrl || '',
            setId: setMeta.setId || watch.setId,
            ...idPatch,
            lastCheckedAt: new Date().toISOString(),
            lastError: null,
            lastNewCount: 0,
        });
        return {
            watch: patched,
            newIds: [],
            assetIds,
            queued: false,
            baseline: true,
            setMeta,
        };
    }

    let queued = false;
    if (enqueue && newIds.length) {
        const jobInput = {
            url: watch.url,
            selectedIds: newIds,
            selectedCount: newIds.length,
            setMeta,
            watchId: watch.id,
            mediuxFilters: watch.mediuxFilters,
            source: 'watch',
        };
        if (enqueueApplyFn) {
            await enqueueApplyFn('apply', jobInput);
        } else {
            await enqueuePosterSetsJob('apply', jobInput);
        }
        queued = true;
    }

    // Fingerprints update on successful apply (via queue completion hook).
    // Track check metadata now; keep knownAssetIds unchanged until apply succeeds.
    const patched = await patchPosterSetsWatch(watch.id, {
        title: setMeta.title || watch.title,
        user: setMeta.user || watch.user,
        thumbUrl: setMeta.thumbUrl || watch.thumbUrl || '',
        setId: setMeta.setId || watch.setId,
        ...idPatch,
        lastCheckedAt: new Date().toISOString(),
        lastError: null,
        lastNewCount: newIds.length,
    });

    return {
        watch: patched,
        newIds,
        assetIds,
        queued,
        baseline: false,
        setMeta,
    };
};

export const markWatchAssetsApplied = async (watchId, assetIds = []) => {
    if (!watchId || !assetIds?.length) return null;
    const watch = (await listPosterSetsWatches()).find((item) => item.id === String(watchId));
    if (!watch) return null;
    const merged = [...new Set([...(watch.knownAssetIds || []), ...assetIds.map(String)])];
    return patchPosterSetsWatch(watchId, {
        knownAssetIds: merged,
        lastAppliedAt: new Date().toISOString(),
        lastError: null,
        lastNewCount: 0,
    });
};

export const autoWatchFromApply = async ({ url, setMeta, selectedIds, mediuxFilters } = {}) => {
    const target = String(url || setMeta?.url || '').trim();
    if (!target) return null;
    const config = await loadPosterSetsConfig();
    if (!config.autoWatchOnApply) return null;
    const existing = (await listPosterSetsWatches()).find((watch) => watch.url === target);
    let known = [
        ...(existing?.knownAssetIds || []),
        ...(Array.isArray(selectedIds) ? selectedIds.map(String) : []),
    ];
    // New watches baseline to "everything currently on the set" so only future additions enqueue.
    if (!existing) {
        try {
            const inspected = await inspectSetAssets(
                target,
                mediuxFilters || config.mediux_filters,
            );
            const ids = (inspected.assets || []).map((asset) => String(asset.id || '').trim()).filter(Boolean);
            if (ids.length) known = ids;
        } catch {
            /* fall back to selectedIds only */
        }
    }
    return upsertPosterSetsWatch({
        url: target,
        provider: setMeta?.provider || existing?.provider,
        setId: setMeta?.setId || existing?.setId,
        title: setMeta?.title || existing?.title,
        user: setMeta?.user || existing?.user,
        tmdbId: setMeta?.tmdbId || existing?.tmdbId,
        tvdbId: setMeta?.tvdbId || existing?.tvdbId,
        thumbUrl: setMeta?.thumbUrl || existing?.thumbUrl || '',
        mediuxFilters: mediuxFilters || existing?.mediuxFilters || config.mediux_filters,
        knownAssetIds: known,
        enabled: true,
        lastAppliedAt: new Date().toISOString(),
        lastError: null,
    });
};

const normalizeTitleKey = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const idsEqual = (a, b) => {
    const left = a != null ? String(a).trim() : '';
    const right = b != null ? String(b).trim() : '';
    return Boolean(left && right && left === right);
};

export const matchPosterSetsWatchesForSeries = (watches, { title, tmdbId, tvdbId } = {}) => {
    const list = Array.isArray(watches) ? watches.filter((watch) => watch?.enabled !== false) : [];
    const titleKey = normalizeTitleKey(title);
    const byTvdb = tvdbId
        ? list.filter((watch) => idsEqual(watch.tvdbId, tvdbId))
        : [];
    if (byTvdb.length) return byTvdb;
    const byTmdb = tmdbId
        ? list.filter((watch) => idsEqual(watch.tmdbId, tmdbId))
        : [];
    if (byTmdb.length) return byTmdb;
    if (!titleKey) return [];
    return list.filter((watch) => normalizeTitleKey(watch.title) === titleKey);
};

export const checkPosterSetsWatchesForSeries = async ({
    title,
    tmdbId,
    tvdbId,
    seasonNumber,
    notify = true,
} = {}) => {
    const all = await listPosterSetsWatches();
    const matched = matchPosterSetsWatchesForSeries(all, { title, tmdbId, tvdbId });
    let checked = 0;
    let queued = 0;
    let assetsQueued = 0;
    const errors = [];
    for (const watch of matched) {
        try {
            const result = await checkPosterSetsWatch(watch, { enqueue: true });
            checked += 1;
            if (result.queued) {
                queued += 1;
                assetsQueued += Array.isArray(result.newIds) ? result.newIds.length : 0;
            }
        } catch (error) {
            errors.push({ id: watch.id, error: error?.message || String(error) });
            try {
                await patchPosterSetsWatch(watch.id, {
                    lastCheckedAt: new Date().toISOString(),
                    lastError: error?.message || String(error),
                });
            } catch {
                /* ignore */
            }
        }
        await sleep(500);
    }

    if (notify && queued > 0 && notifyDigestFn) {
        const label = String(title || '').trim() || 'Show';
        const season = Number.isFinite(Number(seasonNumber)) ? ` S${Number(seasonNumber)}` : '';
        try {
            await notifyDigestFn({
                title: 'Poster Sets · Sonarr import',
                message: `ARR import → ${assetsQueued} asset${assetsQueued === 1 ? '' : 's'} queued for ${label}${season} (${queued} watch${queued === 1 ? '' : 'es'}).`,
                checked,
                queued,
                assetsQueued,
            });
        } catch {
            /* ignore */
        }
    }

    return {
        ok: true,
        matched: matched.length,
        checked,
        queued,
        assetsQueued,
        seasonNumber: Number.isFinite(Number(seasonNumber)) ? Number(seasonNumber) : null,
        errors,
    };
};

export const runPosterSetsWatcherPass = async ({ forceAll = false, notify = true } = {}) => {
    const config = await loadPosterSetsConfig();
    if (!config.watchersEnabled && !forceAll) {
        return { ok: true, skipped: true, reason: 'disabled', checked: 0, queued: 0, assetsQueued: 0 };
    }
    const watches = (await listPosterSetsWatches()).filter((watch) => watch.enabled);
    let checked = 0;
    let queued = 0;
    let assetsQueued = 0;
    const errors = [];
    for (const watch of watches) {
        try {
            const result = await checkPosterSetsWatch(watch, { enqueue: true });
            checked += 1;
            if (result.queued) {
                queued += 1;
                assetsQueued += Array.isArray(result.newIds) ? result.newIds.length : 0;
            }
        } catch (error) {
            errors.push({ id: watch.id, error: error?.message || String(error) });
            try {
                await patchPosterSetsWatch(watch.id, {
                    lastCheckedAt: new Date().toISOString(),
                    lastError: error?.message || String(error),
                });
            } catch {
                /* ignore */
            }
        }
        // Gentle pacing so MediUX/TPDB aren't hammered.
        await sleep(750);
    }
    const summary = { ok: true, checked, queued, assetsQueued, errors };
    if (
        notify
        && config.notifyOnWatcherDigest !== false
        && queued > 0
        && notifyDigestFn
    ) {
        try {
            await notifyDigestFn({
                title: 'Poster Sets watcher',
                message: `${queued} watch${queued === 1 ? '' : 'es'} had new art; ${assetsQueued} asset${assetsQueued === 1 ? '' : 's'} queued.`,
                checked,
                queued,
                assetsQueued,
            });
        } catch {
            /* never fail the pass on notify */
        }
    }
    return summary;
};

export const startPosterSetsWatcher = () => {
    if (watcherTimer) return;
    const arm = async () => {
        if (watcherBusy) return;
        watcherBusy = true;
        try {
            await runPosterSetsWatcherPass();
        } catch {
            /* keep alive */
        } finally {
            watcherBusy = false;
        }
        try {
            const config = await loadPosterSetsConfig();
            const hours = Math.max(1, Number(config.watchIntervalHours) || 6);
            if (watcherTimer) clearInterval(watcherTimer);
            watcherTimer = setInterval(() => { void arm(); }, hours * 60 * 60 * 1000);
            watcherTimer.unref?.();
        } catch {
            watcherTimer = setInterval(() => { void arm(); }, 6 * 60 * 60 * 1000);
            watcherTimer.unref?.();
        }
    };
    // First pass deferred so boot isn't blocked; then re-arm with configured interval.
    watcherTimer = setTimeout(() => { void arm(); }, 20_000);
    watcherTimer.unref?.();
};

export const stopPosterSetsWatcher = () => {
    if (watcherTimer) clearInterval(watcherTimer);
    if (watcherTimer) clearTimeout(watcherTimer);
    watcherTimer = null;
};
