/**
 * Genre helpers for achievements — best-effort from history metadata.
 */

/** Canonical genres and label aliases (Plex / Jellyfin naming quirks). */
export const GENRE_CATALOG = [
    { id: 'action', label: 'Action', aliases: ['action'], icon: '💥', movieName: 'Action Hero', showName: 'Action Marathon' },
    { id: 'adventure', label: 'Adventure', aliases: ['adventure'], icon: '🧭', movieName: 'Trailblazer', showName: 'Quest Mode' },
    { id: 'animation', label: 'Animation', aliases: ['animation', 'animated'], icon: '🖌️', movieName: 'Toon Ticket', showName: 'Toon Time' },
    { id: 'anime', label: 'Anime', aliases: ['anime'], icon: '🍥', movieName: 'Anime Frame', showName: 'Anime Arc' },
    { id: 'biography', label: 'Biography', aliases: ['biography', 'biographical'], icon: '📕', movieName: 'Life Story', showName: 'Real Lives' },
    { id: 'comedy', label: 'Comedy', aliases: ['comedy', 'sitcom', 'slapstick'], icon: '😂', movieName: 'Comedy Club', showName: 'Laugh Track' },
    { id: 'crime', label: 'Crime', aliases: ['crime'], icon: '🕵️', movieName: 'Case File', showName: 'Crime Scene' },
    { id: 'documentary', label: 'Documentary', aliases: ['documentary', 'docuseries'], icon: '🎥', movieName: 'True Lens', showName: 'Doc Hours' },
    { id: 'drama', label: 'Drama', aliases: ['drama'], icon: '🎭', movieName: 'Stage Lights', showName: 'Drama Desk' },
    { id: 'family', label: 'Family', aliases: ['family', 'children', 'kids', 'childrens'], icon: '👨‍👩‍👧‍👦', movieName: 'Family Night', showName: 'Family Room' },
    { id: 'fantasy', label: 'Fantasy', aliases: ['fantasy'], icon: '🧙', movieName: 'Spellbound', showName: 'Realm Hopper' },
    { id: 'history', label: 'History', aliases: ['history', 'historical'], icon: '🏛️', movieName: 'History Buff', showName: 'Timeline' },
    { id: 'horror', label: 'Horror', aliases: ['horror'], icon: '👻', movieName: 'Scream Queen', showName: 'Chills' },
    { id: 'music', label: 'Music', aliases: ['music', 'musical'], icon: '🎶', movieName: 'Soundtrack', showName: 'Music Series' },
    { id: 'mystery', label: 'Mystery', aliases: ['mystery'], icon: '🧩', movieName: 'Whodunit', showName: 'Clue Crew' },
    { id: 'romance', label: 'Romance', aliases: ['romance', 'romantic'], icon: '💞', movieName: 'Heartstrings', showName: 'Shipper' },
    { id: 'scifi', label: 'Sci-Fi', aliases: ['sci-fi', 'sci fi', 'science fiction', 'scifi'], icon: '🚀', movieName: 'Warp Drive', showName: 'Outer Limits' },
    { id: 'sport', label: 'Sport', aliases: ['sport', 'sports'], icon: '🏆', movieName: 'Game Day', showName: 'Sports Desk' },
    { id: 'thriller', label: 'Thriller', aliases: ['thriller', 'suspense'], icon: '🔪', movieName: 'Edge of Seat', showName: 'Suspense Hour' },
    { id: 'war', label: 'War', aliases: ['war'], icon: '🪖', movieName: 'Front Line', showName: 'War Stories' },
    { id: 'western', label: 'Western', aliases: ['western'], icon: '🤠', movieName: 'High Noon', showName: 'Frontier' },
];

const aliasToId = (() => {
    const map = new Map();
    for (const genre of GENRE_CATALOG) {
        map.set(genre.id, genre.id);
        map.set(genre.label.toLowerCase(), genre.id);
        for (const alias of genre.aliases) map.set(String(alias).toLowerCase(), genre.id);
    }
    return map;
})();

export const normalizeGenreId = (raw) => {
    const key = String(raw || '').trim().toLowerCase();
    if (!key) return null;
    return aliasToId.get(key) || null;
};

/** Pull genre tags from a Plex/Jellyfin-like history or metadata row. */
export const extractGenreLabels = (item) => {
    if (!item || typeof item !== 'object') return [];
    const out = [];
    const push = (val) => {
        if (val == null) return;
        if (typeof val === 'string') {
            const t = val.trim();
            if (t) out.push(t);
            return;
        }
        if (typeof val === 'object') {
            const t = String(val.tag || val.Name || val.name || val.Genre || '').trim();
            if (t) out.push(t);
        }
    };

    if (Array.isArray(item.Genre)) item.Genre.forEach(push);
    if (Array.isArray(item.Genres)) item.Genres.forEach(push);
    if (Array.isArray(item.genres)) item.genres.forEach(push);
    if (typeof item.genre === 'string') push(item.genre);
    if (Array.isArray(item.genre)) item.genre.forEach(push);

    // Episode rows sometimes only carry show genres on nested objects.
    if (item.grandparentGenre) push(item.grandparentGenre);
    if (Array.isArray(item.grandparentGenres)) item.grandparentGenres.forEach(push);

    return out;
};

export const extractCanonicalGenreIds = (item) => {
    const ids = new Set();
    for (const label of extractGenreLabels(item)) {
        const id = normalizeGenreId(label);
        if (id) ids.add(id);
    }
    return [...ids];
};

export const genreMovieMetric = (genreId) => `genreMovies_${genreId}`;
export const genreShowMetric = (genreId) => `genreShows_${genreId}`;

export const emptyGenreStatFields = () => {
    const fields = { genreTagsSeen: 0 };
    for (const g of GENRE_CATALOG) {
        fields[genreMovieMetric(g.id)] = 0;
        fields[genreShowMetric(g.id)] = 0;
    }
    return fields;
};
