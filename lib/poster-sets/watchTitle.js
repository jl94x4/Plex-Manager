/**
 * One watched poster set per show/movie.
 * Strong ids (tmdb / tvdb / Plex rating key) win; title is the fallback when ids are missing.
 */

const asId = (value) => {
    if (value == null || value === false) return '';
    const text = String(value).trim();
    if (!text || text === '0' || text.toLowerCase() === 'null' || text.toLowerCase() === 'none') return '';
    return text;
};

export const normalizeWatchTitleKey = (value) => {
    let text = String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
    text = text.replace(/\(\s*(?:\d{4}|n\/a)\s*\)\s*$/i, '');
    text = text.replace(/\b(set|poster set|posters|title cards?|season posters?|collection|system)\b/g, ' ');
    text = text.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
    return text;
};

export const watchesShareTitle = (left, right) => {
    if (!left || !right) return false;
    const aTmdb = asId(left.tmdbId ?? left.tmdb_id);
    const bTmdb = asId(right.tmdbId ?? right.tmdb_id);
    if (aTmdb && bTmdb) return aTmdb === bTmdb;

    const aTvdb = asId(left.tvdbId ?? left.tvdb_id);
    const bTvdb = asId(right.tvdbId ?? right.tvdb_id);
    if (aTvdb && bTvdb) return aTvdb === bTvdb;

    const aKey = asId(left.plexHint?.ratingKey);
    const bKey = asId(right.plexHint?.ratingKey);
    if (aKey && bKey) return aKey === bKey;

    const aTitle = normalizeWatchTitleKey(left.title || left.plexHint?.title);
    const bTitle = normalizeWatchTitleKey(right.title || right.plexHint?.title);
    return Boolean(aTitle && aTitle === bTitle);
};

export const findSameTitleWatches = (watches, candidate) => {
    if (!candidate) return [];
    const incomingUrl = String(candidate.url || '').trim();
    const incomingId = candidate.id != null ? String(candidate.id) : '';
    return (Array.isArray(watches) ? watches : []).filter((watch) => {
        if (!watch) return false;
        if (incomingId && String(watch.id) === incomingId) return false;
        if (incomingUrl && String(watch.url || '').trim() === incomingUrl) return false;
        return watchesShareTitle(watch, candidate);
    });
};
