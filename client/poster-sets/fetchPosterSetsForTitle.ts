import { posterSetsApi } from './api';
import {
    catalogTitleMatchesWork,
    filterSetsForWork,
    pickAutoMatchedTitle,
} from './autoMatchTitle';
import type { LibraryRecentItem } from './libraryRecent';
import { prioritizeSetsByFollowedCreators } from './prioritizeCreatorSets';
import type { PosterSetsSearchResult, PosterSetsSearchSet, PosterSetsSearchTitle } from './types';

export type FetchPosterSetsOptions = {
    dupePreference: 'mediux' | 'posterdb';
    mediaType?: 'show' | 'movie' | null;
    libraryItem?: Pick<LibraryRecentItem, 'title' | 'year' | 'mediaType'>;
    /** Followed creators — title search floats these sets first. */
    preferredCreators?: string[] | null;
    /** Called with MediUX sets as soon as they are ready (TPDB may still be loading). */
    onPartial?: (result: PosterSetsSearchResult) => void;
};

type TitleSource = {
    provider: string;
    id: string;
    url: string;
    mediaType?: string | null;
};

export const normalizePosterSetsMediaType = (value?: string | null): 'show' | 'movie' => {
    const raw = String(value || '').toLowerCase();
    if (raw === 'show' || raw === 'tv' || raw === 'series') return 'show';
    return 'movie';
};

/** Merge primary, sources, and alsoOn into a deduped provider list. */
export const collectTitleSources = (title: PosterSetsSearchTitle): TitleSource[] => {
    const primary: TitleSource = {
        provider: String(title.provider || 'mediux').toLowerCase(),
        id: String(title.id || ''),
        url: String(title.url || ''),
        mediaType: title.mediaType,
    };
    const candidates = [
        ...(title.sources?.length ? title.sources : [primary]),
        ...(title.alsoOn || []),
    ].map((source) => ({
        provider: String(source.provider || '').toLowerCase(),
        id: String(source.id || ''),
        url: String(source.url || ''),
        mediaType: source.mediaType ?? title.mediaType,
    }));

    const seen = new Set<string>();
    const out: TitleSource[] = [];
    for (const source of candidates) {
        if (!source.id && !source.url) continue;
        const key = `${source.provider}:${source.id || source.url}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(source);
    }
    return out;
};

const mediuxMediaType = (source: TitleSource, fallback: 'show' | 'movie') =>
    normalizePosterSetsMediaType(source.mediaType) || fallback;

const TPDB_EMPTY_HINT = 'ThePosterDB returned no sets for this title; showing MediUX sets instead.';
/** Hard wait — server title search allows ~120s; don't abandon TPDB at 25s. */
const TPDB_HARD_MS = 90_000;

const filterResultForWork = (
    result: PosterSetsSearchResult,
    workTitle: string,
): PosterSetsSearchResult => {
    const filtered = filterSetsForWork(result.sets || [], workTitle);
    if (filtered.length === (result.sets || []).length) return result;
    return {
        ...result,
        sets: filtered,
        partialErrors: filtered.length
            ? result.partialErrors
            : [
                ...(result.partialErrors || []),
                `Dropped ${Math.max(0, (result.sets || []).length - filtered.length)} unrelated set(s) that did not match “${workTitle}”.`,
            ],
    };
};

const withTimeout = <T,>(
    promise: Promise<T>,
    ms: number,
    onTimeout: () => T,
): Promise<T> => new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(onTimeout());
    }, ms);
    promise.then(
        (value) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            resolve(value);
        },
        (error) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            reject(error);
        },
    );
});

const mergeSetsForDisplay = (
    parts: PosterSetsSearchResult[],
    dupePreference: 'mediux' | 'posterdb',
    preferredCreators?: string[] | null,
): PosterSetsSearchSet[] => {
    const preferMediux = dupePreference === 'mediux';
    const buckets: { mediux: PosterSetsSearchSet[]; posterdb: PosterSetsSearchSet[] } = {
        mediux: [],
        posterdb: [],
    };
    for (const part of parts) {
        for (const set of part.sets || []) {
            const provider = String(set.provider || '').toLowerCase() === 'mediux' ? 'mediux' : 'posterdb';
            buckets[provider].push(set);
        }
    }
    const order = preferMediux ? (['mediux', 'posterdb'] as const) : (['posterdb', 'mediux'] as const);
    const seen = new Set<string>();
    const out: PosterSetsSearchSet[] = [];
    for (const provider of order) {
        for (const set of buckets[provider]) {
            const key = `${set.provider || provider}:${set.setId}:${set.url}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(set);
        }
    }
    return prioritizeSetsByFollowedCreators(out, preferredCreators);
};

async function fetchBothSetsProgressive(
    linkedTmdbId: string,
    options: {
        dupePreference: 'mediux' | 'posterdb';
        preferredCreators?: string[] | null;
        fallbackMedia: 'show' | 'movie';
        titleHint: string;
        yearHint: number | null;
        onPartial?: (result: PosterSetsSearchResult) => void;
    },
): Promise<PosterSetsSearchResult> {
    const workTitle = options.titleHint;
    const posterdbSource: TitleSource = {
        provider: 'posterdb',
        id: '',
        url: '',
        mediaType: options.fallbackMedia,
    };
    const mediuxP = fetchMediuxSets(linkedTmdbId, options.fallbackMedia);
    const posterdbP = fetchPosterdbSets(posterdbSource, {
        tmdbId: linkedTmdbId,
        titleHint: options.titleHint,
        yearHint: options.yearHint,
        mediaType: options.fallbackMedia,
    });

    const emitPartial = (partial: PosterSetsSearchResult) => {
        const filtered = filterResultForWork(partial, workTitle);
        if ((filtered.sets?.length || 0) > 0) {
            options.onPartial?.({
                ...filtered,
                sets: prioritizeSetsByFollowedCreators(filtered.sets || [], options.preferredCreators),
            });
        }
    };

    // Paint MediUX as soon as it lands; keep waiting for TPDB (scrape is often 30–60s).
    void mediuxP.then((partial) => {
        if ((partial.sets?.length || 0) > 0) emitPartial(partial);
    });

    // If TPDB finishes after the hard deadline, still merge it into the drawer.
    void posterdbP.then(async (late) => {
        if ((late.sets?.length || 0) === 0) return;
        const mediuxLate = await mediuxP.catch(() => ({
            ok: false,
            sets: [],
            titles: [],
        } as PosterSetsSearchResult));
        emitPartial({
            ok: true,
            sets: mergeSetsForDisplay([mediuxLate, late], options.dupePreference, options.preferredCreators),
            titles: [],
            title: mediuxLate.title || late.title,
        });
    }).catch(() => undefined);

    const [mediuxSettled, posterdbSettled] = await Promise.allSettled([
        mediuxP,
        withTimeout(posterdbP, TPDB_HARD_MS, () => ({
            ok: false,
            sets: [],
            titles: [],
            partialErrors: ['ThePosterDB search timed out — showing MediUX sets.'],
        })),
    ]);
    const mediuxResult: PosterSetsSearchResult = mediuxSettled.status === 'fulfilled'
        ? mediuxSettled.value
        : { ok: false, sets: [], titles: [] };
    const posterdbResult: PosterSetsSearchResult = posterdbSettled.status === 'fulfilled'
        ? posterdbSettled.value
        : { ok: false, sets: [], titles: [] };
    const partialErrors = [
        ...(mediuxResult.partialErrors || []),
        ...(posterdbResult.partialErrors || []),
    ];
    if (mediuxSettled.status === 'rejected') {
        partialErrors.push(
            mediuxSettled.reason instanceof Error
                ? mediuxSettled.reason.message
                : 'MediUX search failed',
        );
    }
    if (posterdbSettled.status === 'rejected') {
        partialErrors.push(
            posterdbSettled.reason instanceof Error
                ? posterdbSettled.reason.message
                : 'ThePosterDB search failed',
        );
    }
    const sets = mergeSetsForDisplay(
        [mediuxResult, posterdbResult],
        options.dupePreference,
        options.preferredCreators,
    );
    if ((posterdbResult.sets?.length || 0) === 0 && (mediuxResult.sets?.length || 0) > 0) {
        if (!partialErrors.some((msg) => msg.includes('ThePosterDB'))) {
            partialErrors.push(TPDB_EMPTY_HINT);
        }
    }
    return filterResultForWork({
        ok: true,
        sets,
        titles: [],
        title: mediuxResult.title || posterdbResult.title,
        partialErrors: partialErrors.length ? partialErrors : undefined,
    }, workTitle);
}

async function fetchMediuxSets(
    tmdbId: string,
    mediaType: 'show' | 'movie',
): Promise<PosterSetsSearchResult> {
    return posterSetsApi.search({
        provider: 'mediux',
        tmdbId,
        mediaType,
        limit: 40,
    });
}

const posterdbTmdbFromSources = (sources: TitleSource[]) => {
    const mediux = sources.find((source) => source.provider === 'mediux' && source.id);
    return mediux?.id || null;
};

async function resolveLinkedTmdbId(
    sources: TitleSource[],
    title: PosterSetsSearchTitle,
    options: FetchPosterSetsOptions,
    fallbackMedia: 'show' | 'movie',
): Promise<string | null> {
    const fromSources = posterdbTmdbFromSources(sources)
        || (String(title.provider || '').toLowerCase() === 'mediux' && title.id ? String(title.id) : null);
    if (fromSources) return fromSources;

    const libraryItem = options.libraryItem;
    if (!libraryItem) return null;

    const queries = libraryItem.year != null
        ? [`${libraryItem.title} ${libraryItem.year}`, libraryItem.title]
        : [libraryItem.title];
    for (const query of queries) {
        const titleSearch = await posterSetsApi.search({
            provider: 'mediux',
            query,
            mode: 'title',
            limit: 24,
            mediaType: fallbackMedia,
            titleHint: libraryItem.title,
            yearHint: libraryItem.year ?? undefined,
        });
        const match = pickAutoMatchedTitle(libraryItem, titleSearch.titles || []);
        if (match?.id) return String(match.id);
    }
    return null;
}

async function fetchPosterdbSets(
    source: TitleSource,
    options: {
        tmdbId?: string | null;
        titleHint?: string;
        yearHint?: number | null;
        mediaType?: 'show' | 'movie';
    },
): Promise<PosterSetsSearchResult> {
    const tmdbId = options.tmdbId || undefined;
    const titleHint = String(options.titleHint || '').trim();
    const yearHint = options.yearHint ?? null;
    const basePayload = {
        provider: 'posterdb' as const,
        query: titleHint || undefined,
        titleHint: titleHint || undefined,
        yearHint: yearHint ?? undefined,
        mediaType: options.mediaType,
        limit: 40,
    };
    let response = await posterSetsApi.search({
        ...basePayload,
        // When TMDB is known, resolve the canonical TPDB page instead of a stale text-search URL.
        titleUrl: tmdbId ? undefined : (source.url || undefined),
        tmdbId,
    });
    response = filterResultForWork(response, titleHint);
    if ((response.sets?.length || 0) > 0) return response;

    // Never open titles[0] from a fuzzy TPDB search (e.g. "Python Hunt" → "Monty Python").
    const matchedTitle = (response.titles || []).find((candidate) => catalogTitleMatchesWork(
        { title: titleHint, year: yearHint, mediaType: options.mediaType },
        candidate,
    ));
    const pickedUrl = String(matchedTitle?.url || '').trim();
    if (!pickedUrl) {
        return {
            ...response,
            sets: [],
            titles: (response.titles || []).filter((candidate) => catalogTitleMatchesWork(
                { title: titleHint, year: yearHint, mediaType: options.mediaType },
                candidate,
                { yearRequired: false },
            )),
        };
    }

    response = await posterSetsApi.search({
        ...basePayload,
        titleUrl: pickedUrl,
    });
    return filterResultForWork(response, titleHint);
}

async function fetchMediuxSetsViaTmdbLookup(
    libraryItem: Pick<LibraryRecentItem, 'title' | 'year' | 'mediaType'>,
    fallbackMedia: 'show' | 'movie',
): Promise<PosterSetsSearchResult | null> {
    const queries = libraryItem.year != null
        ? [`${libraryItem.title} ${libraryItem.year}`, libraryItem.title]
        : [libraryItem.title];

    for (const query of queries) {
        const titleSearch = await posterSetsApi.search({
            provider: 'mediux',
            query,
            mode: 'title',
            limit: 24,
        });
        const match = pickAutoMatchedTitle(libraryItem, titleSearch.titles || []);
        if (!match?.id) continue;
        const response = await fetchMediuxSets(
            match.id,
            normalizePosterSetsMediaType(match.mediaType) || fallbackMedia,
        );
        if ((response.sets?.length || 0) > 0) {
            return {
                ...response,
                title: match.title,
                partialErrors: [TPDB_EMPTY_HINT],
            };
        }
        return null;
    }
    return null;
}

async function tryMediuxFallback(
    sources: TitleSource[],
    fallbackMedia: 'show' | 'movie',
    libraryItem: FetchPosterSetsOptions['libraryItem'],
    partialErrors: string[] = [],
): Promise<PosterSetsSearchResult | null> {
    const mediuxSource = sources.find((source) => source.provider === 'mediux' && source.id);
    if (mediuxSource) {
        const response = await fetchMediuxSets(
            mediuxSource.id,
            mediuxMediaType(mediuxSource, fallbackMedia),
        );
        if ((response.sets?.length || 0) > 0) {
            return {
                ...response,
                partialErrors: [...partialErrors, TPDB_EMPTY_HINT],
            };
        }
    }

    if (libraryItem) {
        return fetchMediuxSetsViaTmdbLookup(libraryItem, fallbackMedia);
    }
    return null;
}

/** Load poster sets for a matched catalog title, with MediUX fallback when TPDB scrape is empty. */
export async function fetchPosterSetsForTitle(
    title: PosterSetsSearchTitle,
    options: FetchPosterSetsOptions,
): Promise<PosterSetsSearchResult> {
    const fallbackMedia = options.mediaType
        || (options.libraryItem ? normalizePosterSetsMediaType(options.libraryItem.mediaType) : null)
        || normalizePosterSetsMediaType(title.mediaType);
    const sources = collectTitleSources(title);
    const dupePreference = options.dupePreference;
    const linkedTmdbId = await resolveLinkedTmdbId(sources, title, options, fallbackMedia);
    const titleHint = options.libraryItem?.title || title.title;
    const yearHint = options.libraryItem?.year ?? title.year ?? null;

    let response: PosterSetsSearchResult;

    const useProgressive = Boolean(options.onPartial && linkedTmdbId);

    const fetchBothSources = async (sourceList: TitleSource[]) => (
        posterSetsApi.search({
            provider: 'both',
            query: title.title,
            title: title.title,
            titleSources: sourceList,
            mediaType: fallbackMedia,
            dupePreference,
            limit: 40,
            tmdbId: linkedTmdbId || undefined,
            titleHint: titleHint || undefined,
            yearHint: yearHint ?? undefined,
        })
    );

    if (useProgressive && linkedTmdbId) {
        response = await fetchBothSetsProgressive(linkedTmdbId, {
            dupePreference,
            preferredCreators: options.preferredCreators,
            fallbackMedia,
            titleHint: titleHint || title.title,
            yearHint,
            onPartial: options.onPartial,
        });
    } else if (sources.length > 1) {
        response = await fetchBothSources(sources);
    } else if (sources.length === 1) {
        const source = sources[0];
        if (source.provider === 'mediux' && linkedTmdbId) {
            response = await fetchBothSources([
                source,
                {
                    provider: 'posterdb',
                    id: '',
                    url: '',
                    mediaType: fallbackMedia,
                },
            ]);
        } else if (source.provider === 'mediux') {
            response = await fetchMediuxSets(source.id, mediuxMediaType(source, fallbackMedia));
        } else if (linkedTmdbId) {
            response = await fetchBothSources([
                {
                    provider: 'mediux',
                    id: linkedTmdbId,
                    url: '',
                    mediaType: fallbackMedia,
                },
                source,
            ]);
        } else {
            response = await fetchPosterdbSets(source, {
                tmdbId: linkedTmdbId,
                titleHint,
                yearHint,
                mediaType: fallbackMedia,
            });
        }
    } else {
        response = { ok: true, sets: [], titles: [] };
    }

    const withPreferred = (result: PosterSetsSearchResult): PosterSetsSearchResult => {
        const filtered = filterResultForWork(result, titleHint || title.title);
        return {
            ...filtered,
            sets: prioritizeSetsByFollowedCreators(filtered.sets || [], options.preferredCreators),
        };
    };

    if ((response.sets?.length || 0) > 0) return withPreferred(response);

    const fallback = await tryMediuxFallback(
        sources,
        fallbackMedia,
        options.libraryItem,
        response.partialErrors || [],
    );
    return withPreferred(fallback || response);
}
