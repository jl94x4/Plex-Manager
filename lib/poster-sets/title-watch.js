/**
 * Title-level watch toggle — link a library title to a pinned poster set.
 */
import {
    listPosterSetsWatches,
    patchPosterSetsWatch,
    upsertPosterSetsWatch,
} from './watches.js';
import { normalizeTitleMatchKey } from './title-status.js';

export const buildPlexHint = ({ ratingKey, title, mediaType } = {}) => {
    const key = String(ratingKey || '').trim();
    const label = String(title || '').trim();
    const type = String(mediaType || '').trim().toLowerCase();
    if (!key && !label) return null;
    return {
        ratingKey: key || null,
        title: label || null,
        mediaType: type === 'movie' || type === 'show' ? type : null,
    };
};

const hintRatingKey = (watch) => String(watch?.plexHint?.ratingKey || '').trim();

const titleMatchesWatch = (needle, watch) => {
    const key = normalizeTitleMatchKey(needle);
    if (!key) return false;
    const hintTitle = watch?.plexHint?.title || watch?.title;
    if (hintTitle && normalizeTitleMatchKey(hintTitle) === key) return true;
    if (watch?.title && normalizeTitleMatchKey(watch.title) === key) return true;
    return false;
};

export const findWatchesForLibraryTitle = (watches, { ratingKey, title } = {}) => {
    const list = Array.isArray(watches) ? watches : [];
    const key = String(ratingKey || '').trim();
    const byKey = key
        ? list.filter((watch) => hintRatingKey(watch) === key)
        : [];
    if (byKey.length) return byKey;
    if (!title) return [];
    return list.filter((watch) => titleMatchesWatch(title, watch));
};

export const resolvePrimaryTitleWatch = (watches, { ratingKey, title, preferredUrl } = {}) => {
    const matches = findWatchesForLibraryTitle(watches, { ratingKey, title });
    if (!matches.length) return null;
    const url = String(preferredUrl || '').trim();
    if (url) {
        const byUrl = matches.find((watch) => String(watch.url || '').trim() === url);
        if (byUrl) return byUrl;
    }
    const enabled = matches.filter((watch) => watch.enabled !== false);
    const pool = enabled.length ? enabled : matches;
    return pool.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
};

export const summarizeTitleWatch = (watch) => {
    if (!watch) {
        return { enabled: false, watchId: null, url: null, setTitle: null, user: null };
    }
    return {
        enabled: watch.enabled !== false,
        watchId: watch.id,
        url: watch.url || null,
        setTitle: watch.title || null,
        user: watch.user || null,
    };
};

export const togglePosterSetsTitleWatch = async ({
    ratingKey,
    title,
    mediaType,
    setUrl,
    enabled,
    setMeta,
    lastApplyUrl,
} = {}) => {
    const label = String(title || '').trim();
    if (!label) {
        const error = new Error('title is required');
        error.status = 400;
        throw error;
    }

    const watches = await listPosterSetsWatches();
    const plexHint = buildPlexHint({ ratingKey, title: label, mediaType });
    const existing = resolvePrimaryTitleWatch(watches, {
        ratingKey,
        title: label,
        preferredUrl: setUrl || lastApplyUrl,
    });

    const turningOn = enabled === undefined
        ? !(existing?.enabled !== false)
        : Boolean(enabled);

    if (!turningOn) {
        const targets = findWatchesForLibraryTitle(watches, { ratingKey, title: label })
            .filter((watch) => watch.enabled !== false);
        if (!targets.length && existing) targets.push(existing);
        let last = null;
        for (const watch of targets) {
            last = await patchPosterSetsWatch(watch.id, { enabled: false });
        }
        return {
            enabled: false,
            watch: last,
            titleWatch: summarizeTitleWatch(last),
        };
    }

    const url = String(setUrl || lastApplyUrl || existing?.url || '').trim();
    if (!url) {
        const error = new Error('Apply a poster set first, or pick a set to watch.');
        error.status = 400;
        throw error;
    }

    const watch = await upsertPosterSetsWatch({
        url,
        id: existing?.id,
        enabled: true,
        title: setMeta?.title || existing?.title || label,
        user: setMeta?.user || existing?.user || null,
        provider: setMeta?.provider || existing?.provider,
        setId: setMeta?.setId ?? existing?.setId,
        tmdbId: setMeta?.tmdbId ?? existing?.tmdbId,
        tvdbId: setMeta?.tvdbId ?? existing?.tvdbId,
        thumbUrl: setMeta?.thumbUrl || existing?.thumbUrl || '',
        mediuxFilters: setMeta?.mediuxFilters || existing?.mediuxFilters,
        plexHint,
    });

    return {
        enabled: true,
        watch,
        titleWatch: summarizeTitleWatch(watch),
    };
};
