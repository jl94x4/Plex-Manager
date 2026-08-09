import { posterSetsApi } from './api';
import {
    catalogTitleMatchesWork,
    filterSetsForWork,
    pickAutoMatchedTitle,
} from './autoMatchTitle';
import type { LibraryRecentItem } from './libraryRecent';
import { collapseNearDuplicateSets, prioritizeSetsByFollowedCreators } from './prioritizeCreatorSets';
import type { PosterSetsSearchResult, PosterSetsSearchSet, PosterSetsSearchTitle } from './types';

export type FetchPosterSetsOptions = {
    dupePreference: 'mediux' | 'posterdb';
    mediaType?: 'show' | 'movie' | null;
    libraryItem?: Pick<LibraryRecentItem, 'title' | 'year' | 'mediaType'>;
    /** Followed creators — title search floats these sets first. */
    preferredCreators?: string[] | null;
    /** When false, skip long TPDB waits — public search cannot match many TV titles. */
    tpdbConfigured?: boolean;
    /** Called with merged sets as either provider lands (TPDB preferred in order). */
    onPartial?: (result: PosterSetsSearchResult) => void;
    /** Fired once MediUX settles (sets or soft failure) so the UI can leave the blank spinner. */
    onMediuxSettled?: (result: PosterSetsSearchResult) => void;
    /** Fired once ThePosterDB settles. */
    onTpdbSettled?: (result: PosterSetsSearchResult) => void;
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
const TPDB_NEEDS_LOGIN_HINT = 'ThePosterDB login not configured — add TPDB credentials in Poster Sets → Settings (required for many TV titles), or paste a set URL in Discover.';
/** Soft “still waiting” paint — server priority-cache / CLI allows ~120s+. */
const TPDB_SOFT_WAIT_MS = 90_000;
/** Absolute client wait for TPDB (must exceed server CLI timeout). */
const TPDB_HARD_MS = 180_000;
/** Short wait for public-only TPDB search (usually fails fast for TV). */
const TPDB_PUBLIC_MS = 45_000;
/** MediUX title pages can retry Cloudflare flakes — give them room before painting empty. */
const MEDIUX_HARD_MS = 90_000;
const TPDB_RETRY_DELAY_MS = 2500;
const TPDB_STILL_SEARCHING = 'ThePosterDB is taking longer than usual — still searching…';
const TPDB_TIMED_OUT = 'ThePosterDB search timed out — showing MediUX sets.';

const sleep = (ms: number) => new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
});

const errorMessage = (error: unknown, fallback: string) => (
    error instanceof Error ? error.message : fallback
);

const softResult = (error: unknown, fallback: string): PosterSetsSearchResult => ({
    ok: false,
    sets: [],
    titles: [],
    partialErrors: [errorMessage(error, fallback)],
});

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
): Promise<T> => new Promise((resolve) => {
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
        () => {
            // Soft-timeout wrapper never rejects — callers use softResult upstream.
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            resolve(onTimeout());
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
    const near = collapseNearDuplicateSets(out);
    return prioritizeSetsByFollowedCreators(near.sets, preferredCreators);
};

async function fetchBothSetsProgressive(
    linkedTmdbId: string,
    options: {
        dupePreference: 'mediux' | 'posterdb';
        preferredCreators?: string[] | null;
        fallbackMedia: 'show' | 'movie';
        titleHint: string;
        yearHint: number | null;
        posterdbSource?: TitleSource;
        tpdbConfigured?: boolean;
        onPartial?: (result: PosterSetsSearchResult) => void;
        onMediuxSettled?: (result: PosterSetsSearchResult) => void;
        onTpdbSettled?: (result: PosterSetsSearchResult) => void;
    },
): Promise<PosterSetsSearchResult> {
    const posterdbSource: TitleSource = options.posterdbSource || {
        provider: 'posterdb',
        id: '',
        url: '',
        mediaType: options.fallbackMedia,
    };
    const tpdbHardMs = options.tpdbConfigured ? TPDB_HARD_MS : TPDB_PUBLIC_MS;
    const tpdbSoftWaitMs = options.tpdbConfigured ? TPDB_SOFT_WAIT_MS : Math.min(TPDB_PUBLIC_MS, 20_000);

    const preferSets = (sets: PosterSetsSearchSet[]) => prioritizeSetsByFollowedCreators(
        collapseNearDuplicateSets(sets || []).sets,
        options.preferredCreators,
    );

    // Progressive library loads put ThePosterDB first visually (user preference),
    // while still respecting dupePreference for near-duplicate collapse via merge helpers
    // that receive that flag on final return when needed.
    const paintOrder: 'mediux' | 'posterdb' = 'posterdb';

    let mediuxResult: PosterSetsSearchResult = { ok: true, sets: [], titles: [] };
    let posterdbResult: PosterSetsSearchResult = { ok: true, sets: [], titles: [] };

    const paintMerged = () => {
        const sets = mergeSetsForDisplay(
            [mediuxResult, posterdbResult],
            paintOrder,
            options.preferredCreators,
        );
        if (!sets.length) return;
        options.onPartial?.({
            ok: true,
            sets: preferSets(sets),
            titles: [],
            title: posterdbResult.title || mediuxResult.title,
            fromCache: Boolean(posterdbResult.fromCache) && (posterdbResult.sets?.length || 0) > 0,
            stale: posterdbResult.stale,
        });
    };

    // Parallel scrapes — paint whichever returns first; don't await MediUX before TPDB
    // (sequential MediUX-first left the drawer on “Loading MediUX…” for a long time).
    const mediuxTask = (async () => {
        const mediuxRaw = await withTimeout(
            fetchMediuxSets(linkedTmdbId, options.fallbackMedia),
            MEDIUX_HARD_MS,
            () => ({
                ok: false,
                sets: [],
                titles: [],
                partialErrors: ['MediUX search timed out'],
            }),
        );
        mediuxResult = mediuxRaw;
        if ((mediuxResult.sets?.length || 0) === 0) {
            await sleep(800);
            const retry = await withTimeout(
                fetchMediuxSets(linkedTmdbId, options.fallbackMedia),
                45_000,
                () => mediuxResult,
            );
            if ((retry.sets?.length || 0) > 0) mediuxResult = retry;
        }
        paintMerged();
        options.onMediuxSettled?.(mediuxResult);
    })();

    const tpdbTask = (async () => {
        const fetchPromise = fetchPosterdbSets(posterdbSource, {
            tmdbId: linkedTmdbId,
            titleHint: options.titleHint,
            yearHint: options.yearHint,
            mediaType: options.fallbackMedia,
            tpdbConfigured: options.tpdbConfigured,
        });

        // Soft wait: paint MediUX / progress without abandoning the in-flight TPDB request.
        posterdbResult = await withTimeout(
            fetchPromise,
            tpdbSoftWaitMs,
            () => ({
                ok: true,
                sets: [],
                titles: [],
                partialErrors: options.tpdbConfigured
                    ? [TPDB_STILL_SEARCHING]
                    : [TPDB_NEEDS_LOGIN_HINT],
            }),
        );
        paintMerged();

        // Always finish the real request (server CLI ~120s). Soft wait only early-paints.
        let final: PosterSetsSearchResult;
        try {
            final = await withTimeout(
                fetchPromise,
                Math.max(5_000, tpdbHardMs - tpdbSoftWaitMs),
                () => ({
                    ok: true,
                    sets: [],
                    titles: [],
                    partialErrors: options.tpdbConfigured
                        ? [TPDB_TIMED_OUT]
                        : [TPDB_NEEDS_LOGIN_HINT],
                }),
            );
        } catch {
            final = {
                ok: false,
                sets: [],
                titles: [],
                partialErrors: options.tpdbConfigured
                    ? [TPDB_TIMED_OUT]
                    : [TPDB_NEEDS_LOGIN_HINT],
            };
        }

        // Prefer real sets over the soft “still searching” placeholder.
        if ((final.sets?.length || 0) > 0
            || !(posterdbResult.sets?.length)
            || final.fromCache
            || (posterdbResult.partialErrors || []).includes(TPDB_STILL_SEARCHING)) {
            posterdbResult = {
                ...final,
                fromCache: Boolean(final.fromCache),
                partialErrors: (final.sets?.length || 0) > 0
                    ? (final.partialErrors || []).filter((msg) => (
                        !msg.includes('taking longer')
                        && !msg.includes('timed out')
                        && msg !== TPDB_STILL_SEARCHING
                        && msg !== TPDB_TIMED_OUT
                    ))
                    : (final.partialErrors?.length
                        ? final.partialErrors.map((msg) => (
                            msg === TPDB_STILL_SEARCHING ? TPDB_TIMED_OUT : msg
                        ))
                        : (options.tpdbConfigured ? [TPDB_TIMED_OUT] : [TPDB_NEEDS_LOGIN_HINT])),
            };
            paintMerged();
        }

        options.onTpdbSettled?.(posterdbResult);

        // Late arrival if hard wait gave up — still paint when the request finishes.
        void fetchPromise.then((late) => {
            if ((late.sets?.length || 0) === 0) return;
            if ((posterdbResult.sets?.length || 0) >= (late.sets?.length || 0)
                && posterdbResult.fromCache === Boolean(late.fromCache)) {
                // Already painted an equal-or-better result.
                const alreadyHas = new Set((posterdbResult.sets || []).map((s) => s.id || s.url));
                const addsNew = (late.sets || []).some((s) => !alreadyHas.has(s.id || s.url));
                if (!addsNew) return;
            }
            posterdbResult = {
                ...late,
                fromCache: Boolean(late.fromCache),
                partialErrors: (late.partialErrors || []).filter((msg) => (
                    !msg.includes('taking longer')
                    && !msg.includes('timed out')
                    && msg !== TPDB_STILL_SEARCHING
                    && msg !== TPDB_TIMED_OUT
                )),
            };
            paintMerged();
        }).catch(() => {});

        // After a cache hit, await a live merge so new sets appear in the UI (and disk).
        if (posterdbResult.fromCache && options.tpdbConfigured !== false) {
            try {
                const refreshed = await fetchPosterdbSets(posterdbSource, {
                    tmdbId: linkedTmdbId,
                    titleHint: options.titleHint,
                    yearHint: options.yearHint,
                    mediaType: options.fallbackMedia,
                    tpdbConfigured: options.tpdbConfigured,
                    refresh: true,
                });
                if ((refreshed.sets?.length || 0) > 0) {
                    posterdbResult = {
                        ...refreshed,
                        fromCache: true,
                    };
                    paintMerged();
                }
            } catch {
                // Keep the cache paint — scheduled refresh will try again later.
            }
        }
    })();

    await Promise.all([mediuxTask, tpdbTask]);

    const partialErrors = [
        ...(mediuxResult.partialErrors || []),
        ...(posterdbResult.partialErrors || []),
    ];
    const sets = mergeSetsForDisplay(
        [mediuxResult, posterdbResult],
        paintOrder,
        options.preferredCreators,
    );
    if ((posterdbResult.sets?.length || 0) === 0 && (mediuxResult.sets?.length || 0) > 0) {
        const tpdbFailedSoftly = partialErrors.some((msg) => msg.includes('ThePosterDB'));
        if (!tpdbFailedSoftly) {
            partialErrors.push(
                options.tpdbConfigured ? TPDB_EMPTY_HINT : TPDB_NEEDS_LOGIN_HINT,
            );
        }
    }
    return {
        ok: true,
        sets: preferSets(sets),
        titles: [],
        title: posterdbResult.title || mediuxResult.title,
        fromCache: Boolean(posterdbResult.fromCache) && (posterdbResult.sets?.length || 0) > 0,
        stale: posterdbResult.stale,
        partialErrors: partialErrors.length ? partialErrors : undefined,
    };
}

async function fetchMediuxSets(
    tmdbId: string,
    mediaType: 'show' | 'movie',
): Promise<PosterSetsSearchResult> {
    try {
        return await posterSetsApi.search({
            provider: 'mediux',
            tmdbId,
            mediaType,
            limit: 200,
        });
    } catch (error) {
        return softResult(error, 'MediUX search failed');
    }
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
        try {
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
        } catch {
            // Title resolve is optional.
        }
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
        tpdbConfigured?: boolean;
        refresh?: boolean;
    },
): Promise<PosterSetsSearchResult> {
    const tmdbId = options.tmdbId || undefined;
    const titleHint = String(options.titleHint || '').trim();
    const yearHint = options.yearHint ?? null;
    const explicitUrl = Boolean(String(source.url || '').trim());

    if (!options.tpdbConfigured && !explicitUrl) {
        return {
            ok: true,
            sets: [],
            titles: [],
            partialErrors: [TPDB_NEEDS_LOGIN_HINT],
        };
    }

    const basePayload = {
        provider: 'posterdb' as const,
        query: titleHint || undefined,
        titleHint: titleHint || undefined,
        yearHint: yearHint ?? undefined,
        mediaType: options.mediaType,
        limit: 500,
        refresh: options.refresh === true,
    };

    const runSearch = async (extra: {
        tmdbId?: string;
        titleUrl?: string;
    } = {}): Promise<PosterSetsSearchResult> => {
        try {
            return await posterSetsApi.search({
                ...basePayload,
                titleUrl: extra.titleUrl,
                tmdbId: extra.tmdbId,
            });
        } catch (error) {
            return softResult(error, 'ThePosterDB search failed');
        }
    };

    const finalize = (response: PosterSetsSearchResult) => {
        const filtered = filterResultForWork(response, titleHint);
        const partialErrors = [
            ...(response.partialErrors || []),
            ...(filtered.partialErrors || []),
        ];
        return partialErrors.length ? { ...filtered, partialErrors } : filtered;
    };

    try {
        let response = finalize(await runSearch({
            titleUrl: explicitUrl ? source.url : undefined,
            tmdbId: explicitUrl ? undefined : tmdbId,
        }));
        if ((response.sets?.length || 0) > 0) return response;

        // TMDB resolve can fail transiently — fall back to text search without TMDB pin.
        if (tmdbId && titleHint) {
            const fallback = finalize(await runSearch({
                tmdbId: undefined,
                titleUrl: source.url || undefined,
            }));
            if ((fallback.sets?.length || 0) > 0) return fallback;
            response = fallback;
        }

        // Never open titles[0] from a fuzzy TPDB search (e.g. "Python Hunt" → "Monty Python").
        const matchedTitle = (response.titles || []).find((candidate) => catalogTitleMatchesWork(
            { title: titleHint, year: yearHint, mediaType: options.mediaType },
            candidate,
        ));
        let pickedUrl = String(matchedTitle?.url || '').trim();
        if (pickedUrl) {
            response = finalize(await runSearch({ titleUrl: pickedUrl, tmdbId: undefined }));
            if ((response.sets?.length || 0) > 0) return response;
        }

        // One delayed retry — TPDB search pages often flake on first load.
        if (titleHint) {
            await sleep(TPDB_RETRY_DELAY_MS);
            response = finalize(await runSearch({
                titleUrl: pickedUrl || (tmdbId ? undefined : (source.url || undefined)),
                tmdbId: pickedUrl ? undefined : tmdbId,
            }));
            if ((response.sets?.length || 0) > 0) return response;

            if (!pickedUrl) {
                const retryTitle = (response.titles || []).find((candidate) => catalogTitleMatchesWork(
                    { title: titleHint, year: yearHint, mediaType: options.mediaType },
                    candidate,
                ));
                pickedUrl = String(retryTitle?.url || '').trim();
                if (pickedUrl) {
                    response = finalize(await runSearch({ titleUrl: pickedUrl, tmdbId: undefined }));
                }
            }
        }

        return response;
    } catch (error) {
        return softResult(error, 'ThePosterDB search failed');
    }
}

async function fetchMediuxSetsViaTmdbLookup(
    libraryItem: Pick<LibraryRecentItem, 'title' | 'year' | 'mediaType'>,
    fallbackMedia: 'show' | 'movie',
    tpdbConfigured?: boolean,
): Promise<PosterSetsSearchResult | null> {
    const queries = libraryItem.year != null
        ? [`${libraryItem.title} ${libraryItem.year}`, libraryItem.title]
        : [libraryItem.title];

    for (const query of queries) {
        try {
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
                    partialErrors: [tpdbConfigured ? TPDB_EMPTY_HINT : TPDB_NEEDS_LOGIN_HINT],
                };
            }
            return null;
        } catch {
            continue;
        }
    }
    return null;
}

async function tryMediuxFallback(
    sources: TitleSource[],
    fallbackMedia: 'show' | 'movie',
    libraryItem: FetchPosterSetsOptions['libraryItem'],
    partialErrors: string[] = [],
    tpdbConfigured?: boolean,
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
                partialErrors: [...partialErrors, tpdbConfigured ? TPDB_EMPTY_HINT : TPDB_NEEDS_LOGIN_HINT],
            };
        }
    }

    if (libraryItem) {
        return fetchMediuxSetsViaTmdbLookup(libraryItem, fallbackMedia, tpdbConfigured);
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

    const useProgressive = Boolean(linkedTmdbId);

    const fetchBothSources = async (sourceList: TitleSource[]) => {
        try {
            return await posterSetsApi.search({
                provider: 'both',
                query: title.title,
                title: title.title,
                titleSources: sourceList,
                mediaType: fallbackMedia,
                dupePreference,
                limit: 500,
                tmdbId: linkedTmdbId || undefined,
                titleHint: titleHint || undefined,
                yearHint: yearHint ?? undefined,
            });
        } catch (error) {
            return softResult(error, 'Poster set search failed');
        }
    };

    const withPreferred = (result: PosterSetsSearchResult): PosterSetsSearchResult => {
        const filtered = filterResultForWork(result, titleHint || title.title);
        return {
            ...filtered,
            sets: prioritizeSetsByFollowedCreators(filtered.sets || [], options.preferredCreators),
        };
    };

    if (useProgressive && linkedTmdbId) {
        const posterdbFromSources = sources.find((entry) => (
            entry.provider === 'posterdb' && (entry.url || entry.id)
        ));
        // Progressive already tried MediUX — never fall through to another untimeouted MediUX scrape.
        // Skip work-title set filtering: TMDB-scoped pages include season packs whose card titles
        // do not contain the show name (filtering would wipe most MediUX results).
        return await fetchBothSetsProgressive(linkedTmdbId, {
            dupePreference,
            preferredCreators: options.preferredCreators,
            fallbackMedia,
            titleHint: titleHint || title.title,
            yearHint,
            posterdbSource: posterdbFromSources || {
                provider: 'posterdb',
                id: '',
                url: '',
                mediaType: fallbackMedia,
            },
            tpdbConfigured: options.tpdbConfigured,
            onPartial: options.onPartial,
            onMediuxSettled: options.onMediuxSettled,
            onTpdbSettled: options.onTpdbSettled,
        });
    }

    if (sources.length > 1) {
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
                tpdbConfigured: options.tpdbConfigured,
            });
        }
    } else {
        response = { ok: true, sets: [], titles: [] };
    }

    if ((response.sets?.length || 0) > 0) return withPreferred(response);

    const fallback = await tryMediuxFallback(
        sources,
        fallbackMedia,
        options.libraryItem,
        response.partialErrors || [],
        options.tpdbConfigured,
    );
    return withPreferred(fallback || response);
}
