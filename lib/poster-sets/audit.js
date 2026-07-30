/**
 * Durable Poster Sets apply audit log.
 */
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { ensurePosterSetsDir, POSTER_SETS_DIR } from './config.js';

export const POSTER_SETS_AUDIT_PATH = path.join(POSTER_SETS_DIR, 'audit.json');
const MAX_AUDIT = 500;

const emptyState = () => ({ version: 1, entries: [] });

export const serializeAuditEntry = (entry) => ({
    id: String(entry.id || crypto.randomUUID()),
    at: entry.at || new Date().toISOString(),
    action: String(entry.action || 'apply'),
    source: ['manual', 'watch', 'bulk'].includes(String(entry.source || ''))
        ? String(entry.source)
        : 'manual',
    url: String(entry.url || '').trim() || null,
    title: entry.title != null ? String(entry.title).trim() || null : null,
    user: entry.user != null ? String(entry.user).trim().replace(/^@/, '') || null : null,
    watchId: entry.watchId != null ? String(entry.watchId) : null,
    jobId: entry.jobId != null ? String(entry.jobId) : null,
    uploaded: Number.isFinite(Number(entry.uploaded)) ? Number(entry.uploaded) : null,
    attempted: Number.isFinite(Number(entry.attempted)) ? Number(entry.attempted) : null,
    selectedCount: Number.isFinite(Number(entry.selectedCount)) ? Number(entry.selectedCount) : null,
    state: entry.state != null ? String(entry.state) : null,
    error: entry.error != null ? String(entry.error) : null,
});

let writeChain = Promise.resolve();
const withAuditLock = (fn) => {
    const run = writeChain.then(fn, fn);
    writeChain = run.catch(() => undefined);
    return run;
};

export const loadPosterSetsAudit = async () => {
    await ensurePosterSetsDir();
    try {
        const raw = await fs.readFile(POSTER_SETS_AUDIT_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        const entries = Array.isArray(parsed?.entries)
            ? parsed.entries.map(serializeAuditEntry)
            : Array.isArray(parsed)
                ? parsed.map(serializeAuditEntry)
                : [];
        return { version: 1, entries: entries.slice(0, MAX_AUDIT) };
    } catch (error) {
        if (error?.code === 'ENOENT') return emptyState();
        throw error;
    }
};

export const savePosterSetsAudit = async (state) => {
    await ensurePosterSetsDir();
    const next = {
        version: 1,
        entries: (Array.isArray(state?.entries) ? state.entries : [])
            .map(serializeAuditEntry)
            .slice(0, MAX_AUDIT),
    };
    await fs.writeFile(POSTER_SETS_AUDIT_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    return next;
};

export const appendPosterSetsAudit = async (entry) => withAuditLock(async () => {
    const current = await loadPosterSetsAudit();
    const serialized = serializeAuditEntry(entry);
    const next = await savePosterSetsAudit({
        entries: [serialized, ...current.entries],
    });
    return serialized;
});

export const listPosterSetsAudit = async (limit = 100) => {
    const state = await loadPosterSetsAudit();
    const take = Math.max(1, Math.min(MAX_AUDIT, Number(limit) || 100));
    return state.entries.slice(0, take);
};

export const auditSourceFromJob = (job) => {
    const input = job?.input || {};
    if (input.watchId) return 'watch';
    if (input.source === 'bulk' || job?.type === 'bulk' || (Array.isArray(input.urls) && input.urls.length > 1) || input.fromFile) {
        return 'bulk';
    }
    return 'manual';
};

export const auditEntryFromJob = (job) => {
    const input = job?.input || {};
    const meta = input.setMeta || job?.result?.setMeta || {};
    return {
        action: job?.type === 'bulk' ? 'bulk' : (input.watchId ? 'watch_apply' : 'apply'),
        source: auditSourceFromJob(job),
        url: input.url || meta.url || (Array.isArray(input.urls) ? input.urls[0] : null),
        title: meta.title || null,
        user: meta.user || null,
        watchId: input.watchId || null,
        jobId: job?.id || null,
        uploaded: job?.result?.uploaded ?? null,
        attempted: job?.result?.attempted ?? null,
        selectedCount: input.selectedCount ?? (Array.isArray(input.selectedIds) ? input.selectedIds.length : null),
        state: job?.state || null,
        error: job?.error || null,
        at: job?.finishedAt || new Date().toISOString(),
    };
};
