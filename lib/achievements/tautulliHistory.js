/**
 * Map Tautulli get_history rows into Plex-like history items for achievements / wrap-up.
 */

export const mapTautulliHistoryRowToPlexItem = (row = {}) => {
    const mediaType = String(row.media_type || row.mediaType || '').toLowerCase();
    let type = 'movie';
    if (mediaType === 'episode') type = 'episode';
    else if (mediaType === 'track' || mediaType === 'music') type = 'track';
    else if (mediaType === 'movie') type = 'movie';
    else if (mediaType === 'show') type = 'episode';

    const viewedAt = Number(row.started || row.date || row.viewedAt || 0) || 0;
    const ratingKey = row.rating_key != null ? String(row.rating_key) : null;
    const parentKey = row.parent_rating_key != null ? String(row.parent_rating_key) : null;
    const grandparentKey = row.grandparent_rating_key != null ? String(row.grandparent_rating_key) : null;
    const durationSec = Number(row.duration || row.play_duration || 0) || 0;

    return {
        type,
        viewedAt,
        duration: durationSec > 0 ? durationSec * 1000 : 0, // stats builder treats large values as ms
        ratingKey,
        key: ratingKey ? `/library/metadata/${ratingKey}` : null,
        grandparentKey: grandparentKey ? `/library/metadata/${grandparentKey}` : null,
        grandparentRatingKey: grandparentKey,
        grandparentTitle: row.grandparent_title || null,
        parentKey: parentKey ? `/library/metadata/${parentKey}` : null,
        parentTitle: row.parent_title || null,
        title: row.full_title || row.title || row.grandparent_title || 'Untitled',
        thumb: row.thumb || row.grandparent_thumb || row.parent_thumb || null,
        librarySectionID: row.section_id != null ? row.section_id : (row.library_id != null ? row.library_id : null),
        // Best-effort genre tags when Tautulli includes them
        genres: Array.isArray(row.genres) ? row.genres : undefined,
        Genre: typeof row.genres === 'string'
            ? String(row.genres).split(/[,|]/).map((t) => ({ tag: t.trim() })).filter((g) => g.tag)
            : undefined,
    };
};
