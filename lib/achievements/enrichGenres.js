/**
 * Best-effort: attach Genre tags to history rows missing them via Plex metadata lookups.
 */

import { extractGenreLabels } from './genres.js';

const ratingKeyFromItem = (item) => {
    const type = String(item?.type || '').toLowerCase();
    if (type === 'movie') {
        const key = String(item.ratingKey || '').trim();
        if (key && /^\d+$/.test(key)) return key;
        const fromPath = String(item.key || '').match(/\/(\d+)(?:\?|$)/);
        return fromPath?.[1] || null;
    }
    if (type === 'episode') {
        const show = String(item.grandparentRatingKey || '').trim();
        if (show && /^\d+$/.test(show)) return show;
        const fromGp = String(item.grandparentKey || '').match(/\/(\d+)(?:\?|$)/);
        if (fromGp?.[1]) return fromGp[1];
        // Fall back to episode key — less ideal but sometimes carries genres.
        const ep = String(item.ratingKey || '').trim();
        return ep && /^\d+$/.test(ep) ? ep : null;
    }
    return null;
};

/**
 * Mutates items in place, adding `Genre: [{ tag }]` when resolvable.
 * @param {object[]} items
 * @param {(ratingKey: string) => Promise<string[]>} fetchGenreTags
 * @param {{ maxLookups?: number }} [opts]
 */
export const enrichHistoryGenres = async (items, fetchGenreTags, opts = {}) => {
    if (!Array.isArray(items) || typeof fetchGenreTags !== 'function') return items;
    const maxLookups = Math.max(0, Number(opts.maxLookups) || 400);
    if (maxLookups <= 0) return items;

    const needKeys = [];
    const seen = new Set();
    for (const item of items) {
        if (extractGenreLabels(item).length) continue;
        const key = ratingKeyFromItem(item);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        needKeys.push(key);
        if (needKeys.length >= maxLookups) break;
    }

    if (!needKeys.length) return items;

    const cache = new Map();
    const concurrency = 6;
    let cursor = 0;
    const workers = Array.from({ length: concurrency }, async () => {
        while (cursor < needKeys.length) {
            const idx = cursor;
            cursor += 1;
            const key = needKeys[idx];
            try {
                const tags = await fetchGenreTags(key);
                cache.set(key, Array.isArray(tags) ? tags.filter(Boolean) : []);
            } catch {
                cache.set(key, []);
            }
        }
    });
    await Promise.all(workers);

    for (const item of items) {
        if (extractGenreLabels(item).length) continue;
        const key = ratingKeyFromItem(item);
        if (!key || !cache.has(key)) continue;
        const tags = cache.get(key) || [];
        if (!tags.length) continue;
        item.Genre = tags.map((tag) => ({ tag }));
    }

    return items;
};
