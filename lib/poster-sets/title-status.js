/**
 * Match Poster Sets audit + watches to a library title.
 */
import { listPosterSetsAudit } from './audit.js';
import { listPosterSetsWatches } from './watches.js';

const stripDiacritics = (value) =>
    String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '');

export const normalizeTitleMatchKey = (value) => {
    let text = stripDiacritics(value).toLowerCase().trim();
    text = text.replace(/\(\s*(?:\d{4}|n\/a)\s*\)\s*$/i, '');
    text = text.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
    return text;
};

const titleMatches = (left, right) => {
    const a = normalizeTitleMatchKey(left);
    const b = normalizeTitleMatchKey(right);
    if (!a || !b) return false;
    if (a === b) return true;
    return a.startsWith(b) || b.startsWith(a);
};

export const resolvePosterSetsTitleStatus = async ({
    title,
    mediaType = '',
    ratingKey = '',
    auditLimit = 200,
    watchLimit = 200,
} = {}) => {
    const needle = String(title || '').trim();
    const type = String(mediaType || '').toLowerCase();
    const key = String(ratingKey || '').trim();

    const [auditEntries, watches] = await Promise.all([
        listPosterSetsAudit(auditLimit),
        listPosterSetsWatches(),
    ]);

    const matchingAudit = auditEntries.filter((entry) => {
        if (!needle) return false;
        if (!titleMatches(entry.title, needle)) return false;
        const state = String(entry.state || '').toLowerCase();
        if (state && !['succeeded', 'completed', 'success'].includes(state)) return false;
        return true;
    });

    const lastApply = matchingAudit.find((entry) => (
        ['apply', 'watch_apply'].includes(String(entry.action || '').toLowerCase())
    )) || matchingAudit[0] || null;

    const matchingWatches = watches.filter((watch) => {
        if (needle && watch.title && titleMatches(watch.title, needle)) return true;
        return false;
    });

    const activeWatches = matchingWatches.filter((watch) => watch.enabled !== false);

    return {
        title: needle,
        mediaType: type || null,
        ratingKey: key || null,
        lastApply: lastApply ? {
            at: lastApply.at || null,
            title: lastApply.title || null,
            url: lastApply.url || null,
            user: lastApply.user || null,
            uploaded: lastApply.uploaded ?? null,
            attempted: lastApply.attempted ?? null,
            source: lastApply.source || null,
            jobId: lastApply.jobId || null,
        } : null,
        watches: matchingWatches.map((watch) => ({
            id: watch.id,
            enabled: watch.enabled !== false,
            title: watch.title || null,
            url: watch.url || null,
            user: watch.user || null,
            provider: watch.provider || null,
            lastAppliedAt: watch.lastAppliedAt || null,
            lastCheckedAt: watch.lastCheckedAt || null,
            lastError: watch.lastError || null,
        })),
        watchingCount: activeWatches.length,
    };
};
