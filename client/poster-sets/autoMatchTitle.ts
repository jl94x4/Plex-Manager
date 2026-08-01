import type { LibraryRecentItem } from './libraryRecent';
import type { PosterSetsSearchTitle } from './types';

const stripDiacritics = (value: string) =>
    String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '');

/** Align with server-side poster title normalization for consistent matching. */
export const normalizeTitleMatchKey = (value: string): string => {
    let text = stripDiacritics(value).toLowerCase().trim();
    text = text.replace(/\(\s*(?:\d{4}|n\/a)\s*\)\s*$/i, '');
    text = text.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
    return text;
};

const normalizeMediaType = (value?: string | null): 'show' | 'movie' | null => {
    const raw = String(value || '').toLowerCase();
    if (raw === 'show' || raw === 'tv' || raw === 'series') return 'show';
    if (raw === 'movie' || raw === 'film') return 'movie';
    return null;
};

const titleTokens = (value: string): string[] =>
    normalizeTitleMatchKey(value).split(' ').filter(Boolean);

const tokenOverlapRatio = (a: string, b: string): number => {
    const left = new Set(titleTokens(a));
    const right = titleTokens(b);
    if (!left.size || !right.length) return 0;
    const overlap = right.filter((token) => left.has(token)).length;
    return overlap / Math.max(left.size, right.length);
};

const mediaTypeMatches = (libraryItem: LibraryRecentItem, candidate: PosterSetsSearchTitle): boolean => {
    const candMedia = normalizeMediaType(candidate.mediaType);
    return !candMedia || candMedia === libraryItem.mediaType;
};

const yearMatches = (libraryYear: number | null | undefined, candidateYear: number | null | undefined): boolean => {
    if (libraryYear == null) return true;
    if (candidateYear == null) return true;
    return Math.abs(libraryYear - candidateYear) <= 1;
};

const scoreTitleMatch = (libraryItem: LibraryRecentItem, candidate: PosterSetsSearchTitle): number => {
    const libKey = normalizeTitleMatchKey(libraryItem.title);
    const candKey = normalizeTitleMatchKey(candidate.title);
    let score = 0;

    if (libKey && candKey) {
        if (libKey === candKey) score += 100;
        else if (candKey.startsWith(libKey) || libKey.startsWith(candKey)) score += 75;
        else {
            const overlap = tokenOverlapRatio(libraryItem.title, candidate.title);
            score += Math.round(overlap * 70);
            if (overlap < 0.5) score -= 40;
        }
    }

    const libYear = libraryItem.year ?? null;
    const candYear = candidate.year ?? null;
    if (libYear != null && candYear != null) {
        const delta = Math.abs(libYear - candYear);
        if (delta === 0) score += 50;
        else if (delta === 1) score += 25;
        else if (delta <= 3) score += 5;
        else score -= 35;
    } else if (libYear != null && candYear == null) {
        score -= 5;
    }

    const candMedia = normalizeMediaType(candidate.mediaType);
    if (candMedia) {
        score += candMedia === libraryItem.mediaType ? 30 : -50;
    }

    const sourceCount = candidate.sources?.length || (candidate.provider ? 1 : 0);
    score += Math.min(sourceCount, 2) * 5;

    return score;
};

/**
 * Pick a single catalog title from search results using library name, year, and media type.
 * Returns null when matches are ambiguous and the user should choose manually.
 */
export const pickAutoMatchedTitle = (
    libraryItem: LibraryRecentItem,
    titles: PosterSetsSearchTitle[],
): PosterSetsSearchTitle | null => {
    if (!titles.length) return null;

    const libKey = normalizeTitleMatchKey(libraryItem.title);
    const libYear = libraryItem.year ?? null;

    const viable = titles.filter((title) => mediaTypeMatches(libraryItem, title));
    const pool = viable.length ? viable : titles;

    if (pool.length === 1) return pool[0];

    const exactAll = pool.filter((title) => (
        normalizeTitleMatchKey(title.title) === libKey
        && yearMatches(libYear, title.year ?? null)
    ));
    if (exactAll.length === 1) return exactAll[0];

    const exactTitle = pool.filter((title) => normalizeTitleMatchKey(title.title) === libKey);
    if (exactTitle.length === 1) return exactTitle[0];

    if (libYear != null) {
        const yearAligned = pool.filter((title) => (
            normalizeTitleMatchKey(title.title) === libKey
            && yearMatches(libYear, title.year ?? null)
        ));
        if (yearAligned.length === 1) return yearAligned[0];
    }

    const scored = pool
        .map((title) => ({ title, score: scoreTitleMatch(libraryItem, title) }))
        .sort((a, b) => b.score - a.score);

    const best = scored[0];
    const second = scored[1];
    const minScore = libYear != null ? 95 : 90;
    const minGap = 25;

    if (best && best.score >= minScore && best.score - (second?.score ?? 0) >= minGap) {
        return best.title;
    }

    return null;
};
