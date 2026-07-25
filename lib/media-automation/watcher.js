import path from 'path';
import chokidar from 'chokidar';

const normalizeExtension = (filePath, extensions) => {
    const ext = path.extname(String(filePath || '')).toLowerCase();
    return extensions.has(ext);
};

/**
 * Watch enabled library roots and enqueue matching media files.
 */
export const createMediaLibraryWatcher = ({
    getConfig,
    listLibraries,
    enqueuePath,
    onActivity,
    logger = console,
} = {}) => {
    if (typeof getConfig !== 'function' || typeof listLibraries !== 'function' || typeof enqueuePath !== 'function') {
        throw new Error('getConfig, listLibraries, and enqueuePath are required');
    }

    let watcher = null;
    let stopped = true;
    const pending = new Map();
    let debounceMs = 5000;

    const clearPending = () => {
        for (const timer of pending.values()) clearTimeout(timer);
        pending.clear();
    };

    const handleFile = (filePath) => {
        const resolved = path.resolve(String(filePath || ''));
        if (!resolved) return;
        if (pending.has(resolved)) clearTimeout(pending.get(resolved));
        pending.set(resolved, setTimeout(async () => {
            pending.delete(resolved);
            try {
                const settings = await getConfig();
                if (!settings.enabled || settings.libraryWatchEnabled === false) return;
                const extensions = new Set(
                    (settings.extensions || []).map((entry) => String(entry || '').toLowerCase()),
                );
                if (!normalizeExtension(resolved, extensions)) return;
                const libraries = await listLibraries();
                const library = libraries
                    .filter((entry) => entry?.enabled !== false && entry?.rootPath)
                    .map((entry) => ({
                        ...entry,
                        rootPath: path.resolve(entry.rootPath),
                    }))
                    .filter((entry) => resolved === entry.rootPath || resolved.startsWith(`${entry.rootPath}${path.sep}`))
                    .sort((a, b) => b.rootPath.length - a.rootPath.length)[0];
                if (!library) return;
                const result = await enqueuePath(resolved, {
                    libraryId: library.id,
                    libraryRoot: library.rootPath,
                    pipelineId: library.pipelineId,
                    metadata: { source: 'library.watch' },
                });
                if (result?.enqueued) {
                    await onActivity?.({
                        type: 'library.watch.enqueued',
                        jobId: result.job?.id,
                        message: `Watcher queued ${path.basename(resolved)}`,
                        data: { path: resolved, libraryId: library.id },
                    });
                }
            } catch (error) {
                logger.warn?.(`[media-automation] watch enqueue failed for ${resolved}: ${error.message}`);
                await onActivity?.({
                    type: 'library.watch.error',
                    message: `Watcher failed for ${path.basename(resolved)}: ${error.message}`,
                    data: { path: resolved, error: error.message },
                });
            }
        }, debounceMs));
        pending.get(resolved)?.unref?.();
    };

    const stop = async () => {
        stopped = true;
        clearPending();
        if (!watcher) return;
        const current = watcher;
        watcher = null;
        await current.close().catch(() => {});
    };

    const start = async () => {
        const settings = await getConfig();
        debounceMs = Math.max(500, Number(settings.libraryWatchDebounceMs) || 5000);
        await stop();
        stopped = false;
        if (!settings.enabled || settings.libraryWatchEnabled === false) {
            return { watching: false, roots: [] };
        }
        const libraries = await listLibraries();
        const roots = [...new Set(
            libraries
                .filter((entry) => entry?.enabled !== false && entry?.rootPath)
                .map((entry) => path.resolve(entry.rootPath)),
        )];
        if (!roots.length) {
            return { watching: false, roots: [] };
        }
        watcher = chokidar.watch(roots, {
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: Math.min(debounceMs, 2000),
                pollInterval: 250,
            },
            ignored: (filePath) => {
                const base = path.basename(String(filePath || ''));
                return base.startsWith('.') || base.endsWith('.partial') || base.endsWith('.tmp');
            },
        });
        watcher.on('add', handleFile);
        watcher.on('change', handleFile);
        watcher.on('error', (error) => {
            logger.warn?.(`[media-automation] watcher error: ${error.message}`);
        });
        return { watching: true, roots };
    };

    const reload = async () => start();

    const status = () => ({
        watching: !stopped && !!watcher,
        pending: pending.size,
        roots: watcher
            ? [...(watcher.getWatched?.() ? Object.keys(watcher.getWatched()) : [])]
            : [],
    });

    return { start, stop, reload, status };
};

export default createMediaLibraryWatcher;
