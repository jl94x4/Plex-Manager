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

const LEADING_ARTICLES = new Set(['the', 'a', 'an']);

const normalizeMediaType = (value?: string | null): 'show' | 'movie' | null => {
    const raw = String(value || '').toLowerCase();
    if (raw === 'show' || raw === 'tv' || raw === 'series') return 'show';
    if (raw === 'movie' || raw === 'film') return 'movie';
    return null;
};

const titleTokens = (value: string): string[] =>
    normalizeTitleMatchKey(value).split(' ').filter(Boolean);

const tokensWithoutLeadingArticle = (value: string): string[] => {
    const tokens = titleTokens(value);
    if (tokens.length > 1 && LEADING_ARTICLES.has(tokens[0])) return tokens.slice(1);
    return tokens;
};

const mediaTypeMatches = (libraryItem: LibraryRecentItem, candidate: PosterSetsSearchTitle): boolean => {
    const candMedia = normalizeMediaType(candidate.mediaType);
    return !candMedia || candMedia === libraryItem.mediaType;
};

/** Auto-match requires an exact year when the library item has one. */
export const strictYearMatches = (
    libraryYear: number | null | undefined,
    candidateYear: number | null | undefined,
): boolean => {
    if (libraryYear == null) return true;
    if (candidateYear == null) return false;
    return libraryYear === candidateYear;
};

/**
 * True when catalog title is the same work — not a longer/shorter variant
 * (e.g. "Furious" must not match "Furious Attack").
 */
export const strictTitleMatches = (libraryTitle: string, candidateTitle: string): boolean => {
    const libKey = normalizeTitleMatchKey(libraryTitle);
    const candKey = normalizeTitleMatchKey(candidateTitle);
    if (!libKey || !candKey) return false;
    if (libKey === candKey) return true;

    const libTokens = tokensWithoutLeadingArticle(libraryTitle);
    const candTokens = tokensWithoutLeadingArticle(candidateTitle);
    if (!libTokens.length || !candTokens.length) return false;

    // Same words, optional leading article difference only.
    if (libTokens.length === candTokens.length) {
        return libTokens.every((token, index) => token === candTokens[index]);
    }

    return false;
};

const rankTitleCandidate = (
    libraryItem: LibraryRecentItem,
    candidate: PosterSetsSearchTitle,
): number => {
    let score = 0;
    if (strictTitleMatches(libraryItem.title, candidate.title)) score += 100;
    if (strictYearMatches(libraryItem.year, candidate.year ?? null)) score += 50;

    const candMedia = normalizeMediaType(candidate.mediaType);
    if (candMedia) score += candMedia === libraryItem.mediaType ? 20 : -100;

    const sourceCount = candidate.sources?.length || (candidate.provider ? 1 : 0);
    score += Math.min(sourceCount, 2) * 3;

    return score;
};

const isStrictAutoMatch = (
    libraryItem: LibraryRecentItem,
    candidate: PosterSetsSearchTitle,
): boolean => (
    mediaTypeMatches(libraryItem, candidate)
    && strictTitleMatches(libraryItem.title, candidate.title)
    && strictYearMatches(libraryItem.year, candidate.year ?? null)
);

/**
 * Pick a single catalog title from search results using library name, year, and media type.
 * Returns null when matches are ambiguous or no exact title+year hit exists.
 */
export const pickAutoMatchedTitle = (
    libraryItem: LibraryRecentItem,
    titles: PosterSetsSearchTitle[],
): PosterSetsSearchTitle | null => {
    if (!titles.length) return null;

    const viable = titles.filter((title) => mediaTypeMatches(libraryItem, title));
    const pool = viable.length ? viable : titles;

    const strictMatches = pool.filter((title) => isStrictAutoMatch(libraryItem, title));
    if (strictMatches.length === 1) return strictMatches[0];
    if (strictMatches.length > 1) return null;

    // When the library item has no year, allow a unique exact title match.
    if (libraryItem.year == null) {
        const exactTitle = pool.filter((title) => (
            strictTitleMatches(libraryItem.title, title.title)
            && mediaTypeMatches(libraryItem, title)
        ));
        if (exactTitle.length === 1) return exactTitle[0];
        if (exactTitle.length > 1) return null;
    }

    return null;
};

/** Sort search titles for manual pick lists — best title+year matches first. */
export const rankSearchTitlesForLibraryItem = (
    libraryItem: LibraryRecentItem,
    titles: PosterSetsSearchTitle[],
): PosterSetsSearchTitle[] => (
    [...titles].sort((a, b) => rankTitleCandidate(libraryItem, b) - rankTitleCandidate(libraryItem, a))
);
