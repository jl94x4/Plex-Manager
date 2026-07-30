import type { PosterSetsWatch } from './types';

export type PosterSetsWatchGroup = {
    key: string;
    title: string;
    thumbUrl: string;
    watches: PosterSetsWatch[];
    errored: boolean;
    lastCheckedAt: string | null;
};

const normalizeTitleKey = (value: string) => String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const watchRecency = (watch: PosterSetsWatch) => {
    const raw = watch.updatedAt || watch.lastCheckedAt || watch.lastAppliedAt || watch.createdAt;
    if (!raw) return 0;
    const ms = new Date(raw).getTime();
    return Number.isFinite(ms) ? ms : 0;
};

export const posterSetsWatchGroupKey = (watch: PosterSetsWatch) => {
    const tmdbId = watch.tmdbId != null ? String(watch.tmdbId).trim() : '';
    if (tmdbId) return `tmdb:${tmdbId}`;
    const titleKey = normalizeTitleKey(String(watch.title || ''));
    if (titleKey) return `title:${titleKey}`;
    return `id:${watch.id}`;
};

/**
 * Group Watching pins by show/movie (tmdbId, else normalized title).
 * Keeps first-seen group order; sorts sets within a group by provider then creator.
 */
export const groupPosterSetsWatches = (watches: PosterSetsWatch[]): PosterSetsWatchGroup[] => {
    const order: string[] = [];
    const groups = new Map<string, PosterSetsWatch[]>();

    for (const watch of watches) {
        const key = posterSetsWatchGroupKey(watch);
        if (!groups.has(key)) {
            groups.set(key, []);
            order.push(key);
        }
        groups.get(key)!.push(watch);
    }

    return order.map((key) => {
        const members = [...(groups.get(key) || [])].sort((a, b) => {
            const provider = String(a.provider || '').localeCompare(String(b.provider || ''));
            if (provider !== 0) return provider;
            const user = String(a.user || '').localeCompare(String(b.user || ''));
            if (user !== 0) return user;
            return watchRecency(b) - watchRecency(a);
        });
        const primary = [...members].sort((a, b) => watchRecency(b) - watchRecency(a))[0] || members[0];
        const title = String(primary?.title || primary?.setId || primary?.url || 'Watch').trim();
        const thumbUrl = members.map((watch) => String(watch.thumbUrl || '').trim()).find(Boolean) || '';
        const lastCheckedAt = members
            .map((watch) => watch.lastCheckedAt)
            .filter(Boolean)
            .sort()
            .slice(-1)[0] || null;
        return {
            key,
            title,
            thumbUrl,
            watches: members,
            errored: members.some((watch) => Boolean(watch.lastError)),
            lastCheckedAt: lastCheckedAt ? String(lastCheckedAt) : null,
        };
    });
};
