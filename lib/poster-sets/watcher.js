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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const setPosterSetsEnqueueApply = (fn) => {
    enqueueApplyFn = typeof fn === 'function' ? fn : null;
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
        thumbUrl: watch.thumbUrl,
        assetCount: assetIds.length,
    };

    // First check: baseline fingerprints only (do not re-apply the whole historical set).
    if (isFirstCheck) {
        const patched = await patchPosterSetsWatch(watch.id, {
            knownAssetIds: assetIds,
            title: setMeta.title || watch.title,
            user: setMeta.user || watch.user,
            thumbUrl: setMeta.thumbUrl || watch.thumbUrl || '',
            setId: setMeta.setId || watch.setId,
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
        thumbUrl: setMeta?.thumbUrl || existing?.thumbUrl || '',
        mediuxFilters: mediuxFilters || existing?.mediuxFilters || config.mediux_filters,
        knownAssetIds: known,
        enabled: true,
        lastAppliedAt: new Date().toISOString(),
        lastError: null,
    });
};

export const runPosterSetsWatcherPass = async ({ forceAll = false } = {}) => {
    const config = await loadPosterSetsConfig();
    if (!config.watchersEnabled && !forceAll) {
        return { ok: true, skipped: true, reason: 'disabled', checked: 0, queued: 0 };
    }
    const watches = (await listPosterSetsWatches()).filter((watch) => watch.enabled);
    let checked = 0;
    let queued = 0;
    const errors = [];
    for (const watch of watches) {
        try {
            const result = await checkPosterSetsWatch(watch, { enqueue: true });
            checked += 1;
            if (result.queued) queued += 1;
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
    return { ok: true, checked, queued, errors };
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
