import crypto from 'crypto';

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled', 'canceled', 'completed', 'success']);

const slimJob = (job = {}) => {
    const result = job.result && typeof job.result === 'object' ? job.result : {};
    const output = result.output && typeof result.output === 'object' ? result.output : {};
    return {
        id: String(job.id || crypto.randomUUID()),
        sourcePath: String(job.sourcePath || job.path || ''),
        pipelineId: job.pipelineId == null ? null : String(job.pipelineId),
        pipelineName: String(job.pipelineName || job.metadata?.pipeline?.name || ''),
        libraryId: job.libraryId == null ? null : String(job.libraryId),
        state: String(job.state || 'succeeded'),
        lane: job.lane === 'gpu' ? 'gpu' : 'cpu',
        tags: Array.isArray(job.metadata?.tags) ? job.metadata.tags.map(String) : [],
        createdAt: job.createdAt || null,
        startedAt: job.startedAt || null,
        finishedAt: job.finishedAt || job.completedAt || new Date().toISOString(),
        sourceBytes: Number(result.sourceBytes || result.inputBytes || 0) || 0,
        outputBytes: Number(result.outputBytes || 0) || 0,
        bytesSaved: Number(result.bytesSaved) || Math.max(0, Number(result.sourceBytes || 0) - Number(result.outputBytes || 0)),
        durationMs: Number(result.durationMs || 0) || 0,
        adapter: result.adapter || result.adapterLabel || null,
        adapterLabel: result.adapterLabel || null,
        dryRun: result.dryRun === true,
        finalPath: output.finalPath || job.outputPath || null,
        quarantinedPath: output.quarantinedPath || null,
        delivery: result.delivery || null,
        error: job.error || null,
    };
};

export const createHistoryStore = ({
    store,
    maxEntries = 2000,
    clock = () => Date.now(),
} = {}) => {
    if (!store?.read || !store?.update) throw new Error('store is required');
    const normalize = (value) => ({
        version: 1,
        entries: Array.isArray(value?.entries) ? value.entries : [],
    });

    const record = async (job) => {
        if (!job || !TERMINAL.has(String(job.state || '').toLowerCase())) return null;
        const entry = slimJob(job);
        await store.update((raw) => {
            const state = normalize(raw);
            const existing = state.entries.findIndex((item) => item.id === entry.id);
            if (existing >= 0) state.entries.splice(existing, 1);
            state.entries.unshift(entry);
            state.entries.length = Math.min(state.entries.length, maxEntries);
            return state;
        });
        return entry;
    };

    const list = async ({ limit = 200, state, q } = {}) => {
        let entries = normalize(await store.read()).entries;
        if (state && state !== 'all') {
            const wanted = String(state).toLowerCase();
            entries = entries.filter((entry) => {
                const value = String(entry.state || '').toLowerCase();
                if (wanted === 'dry-run') return entry.dryRun === true;
                if (wanted === 'completed') return ['succeeded', 'completed', 'success'].includes(value) && !entry.dryRun;
                if (wanted === 'failed') return ['failed', 'error'].includes(value);
                if (wanted === 'cancelled') return ['cancelled', 'canceled'].includes(value);
                return value === wanted;
            });
        }
        if (q) {
            const needle = String(q).toLowerCase();
            entries = entries.filter((entry) => (
                `${entry.sourcePath} ${entry.pipelineName} ${entry.id} ${(entry.tags || []).join(' ')}`
                    .toLowerCase()
                    .includes(needle)
            ));
        }
        return entries.slice(0, Math.max(1, Number(limit) || 200));
    };

    const aggregates = async ({ days = 7 } = {}) => {
        const cutoff = clock() - (Math.max(1, Number(days) || 7) * 86_400_000);
        const entries = normalize(await store.read()).entries.filter((entry) => {
            const at = Date.parse(entry.finishedAt || 0);
            return Number.isFinite(at) && at >= cutoff;
        });
        const completed = entries.filter((entry) => ['succeeded', 'completed', 'success'].includes(String(entry.state || '').toLowerCase()) && !entry.dryRun);
        const failed = entries.filter((entry) => ['failed', 'error'].includes(String(entry.state || '').toLowerCase()));
        const cancelled = entries.filter((entry) => ['cancelled', 'canceled'].includes(String(entry.state || '').toLowerCase()));
        return {
            days: Math.max(1, Number(days) || 7),
            completed: completed.length,
            failed: failed.length,
            cancelled: cancelled.length,
            bytesIn: completed.reduce((sum, entry) => sum + (Number(entry.sourceBytes) || 0), 0),
            bytesOut: completed.reduce((sum, entry) => sum + (Number(entry.outputBytes) || 0), 0),
            bytesSaved: completed.reduce((sum, entry) => sum + (Number(entry.bytesSaved) || 0), 0),
            encodeMs: completed.reduce((sum, entry) => sum + (Number(entry.durationMs) || 0), 0),
        };
    };

    /** Lifetime totals from durable history (survives clearing finished queue jobs). */
    const totals = async () => {
        const entries = normalize(await store.read()).entries;
        const completed = entries.filter((entry) => ['succeeded', 'completed', 'success'].includes(String(entry.state || '').toLowerCase()) && !entry.dryRun);
        const failed = entries.filter((entry) => ['failed', 'error'].includes(String(entry.state || '').toLowerCase()));
        return {
            completed: completed.length,
            failed: failed.length,
            entries: entries.length,
        };
    };

    return { record, list, aggregates, totals };
};

export default createHistoryStore;
