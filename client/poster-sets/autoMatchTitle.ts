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

/** Auto-match requires an exact year when the library item has one.
 *  Allow ±1 for festival vs theatrical year mismatches (e.g. Rose of Nevada TMDB 2025 / Plex 2026).
 */
export const strictYearMatches = (
    libraryYear: number | null | undefined,
    candidateYear: number | null | undefined,
    options?: { tolerance?: number },
): boolean => {
    if (libraryYear == null) return true;
    if (candidateYear == null) return false;
    const tolerance = Number.isFinite(Number(options?.tolerance))
        ? Math.max(0, Number(options?.tolerance))
        : 1;
    return Math.abs(libraryYear - candidateYear) <= tolerance;
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
    if (libraryItem.year != null && candidate.year != null) {
        const delta = Math.abs(libraryItem.year - candidate.year);
        if (delta === 0) score += 50;
        else if (delta === 1) score += 35;
        else score -= 40;
    } else if (strictYearMatches(libraryItem.year, candidate.year ?? null)) {
        score += 50;
    }

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
    && strictYearMatches(libraryItem.year, candidate.year ?? null, { tolerance: 1 })
);

/** True when a loaded catalog title still looks like the library item (guards wrong TMDB hits). */
export const catalogTitleMatchesLibraryItem = (
    libraryItem: Pick<LibraryRecentItem, 'title' | 'year' | 'mediaType'>,
    catalogTitle?: Pick<PosterSetsSearchTitle, 'title' | 'year' | 'mediaType'> | null,
): boolean => {
    if (!catalogTitle?.title) return false;
    const pseudo: LibraryRecentItem = {
        id: '',
        title: libraryItem.title,
        year: libraryItem.year ?? null,
        mediaType: libraryItem.mediaType,
    };
    return isStrictAutoMatch(pseudo, catalogTitle as PosterSetsSearchTitle);
};

/**
 * Pick a single catalog title from search results using library name, year, and media type.
 * Returns null when matches are ambiguous or no exact title(+year) hit exists.
 */
export const pickAutoMatchedTitle = (
    libraryItem: LibraryRecentItem,
    titles: PosterSetsSearchTitle[],
): PosterSetsSearchTitle | null => {
    if (!titles.length) return null;

    const viable = titles.filter((title) => mediaTypeMatches(libraryItem, title));
    const pool = viable.length ? viable : titles;

    // Prefer exact year, then ±1 theatrical/festival drift, for a unique title match.
    const exactYear = pool.filter((title) => (
        mediaTypeMatches(libraryItem, title)
        && strictTitleMatches(libraryItem.title, title.title)
        && strictYearMatches(libraryItem.year, title.year ?? null, { tolerance: 0 })
    ));
    if (exactYear.length === 1) return exactYear[0];
    if (exactYear.length > 1) return null;

    const nearYear = pool.filter((title) => (
        mediaTypeMatches(libraryItem, title)
        && strictTitleMatches(libraryItem.title, title.title)
        && strictYearMatches(libraryItem.year, title.year ?? null, { tolerance: 1 })
    ));
    if (nearYear.length === 1) return nearYear[0];
    if (nearYear.length > 1) {
        // Prefer closest year when multiple festival/theatrical variants exist.
        return [...nearYear].sort((a, b) => {
            const aDelta = Math.abs(Number(a.year) - Number(libraryItem.year));
            const bDelta = Math.abs(Number(b.year) - Number(libraryItem.year));
            return aDelta - bDelta;
        })[0] || null;
    }

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
