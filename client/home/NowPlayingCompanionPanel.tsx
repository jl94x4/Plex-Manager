import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ChevronDown,
    ChevronUp,
    Clapperboard,
    ExternalLink,
    Flame,
    Laugh,
    Link2,
    Loader2,
    MessageSquareQuote,
    Music2,
    Sparkles,
    ThumbsUp,
    Users,
} from 'lucide-react';
import { apiFetch } from '../shared/api';
import { NoPosterPlaceholder } from '../shared/NoPosterPlaceholder';
import type { NowPlayingSession } from '../shared/useNowPlaying';
import {
    buildExternalLinks,
    buildMediaFactRows,
    fetchCombinedRatings,
    type CombinedRatings,
} from '../discovery/mediaDetailUtils';
import { enrichDiscoverItemsWithAvailability } from '../discovery/discoverAvailabilityEnrich';
import { useDiscoverI18n } from '../discovery/i18n';
import {
    resolveMediaAvailabilityState,
    shouldHideAvailableItem,
    shouldHideRequestedItem,
} from '../discovery/discoverAvailability';

type CompanionToastType = 'success' | 'error';

type Props = {
    session: NowPlayingSession;
    userKey: string;
    mediaServerType?: string;
    onNavigate?: (path: string) => void;
    onToast?: (message: string, type?: CompanionToastType) => void;
};

type Recommendation = {
    id: number;
    tmdbId?: number;
    mediaType: 'movie' | 'tv';
    title: string;
    year: string;
    posterPath: string | null;
    mediaInfo?: any;
};

type KnownForItem = {
    id: number;
    mediaType: 'movie' | 'tv';
    title: string;
    year: string;
};

type CastInsight = {
    id: number;
    name: string;
    character: string;
    profilePath: string | null;
    popularity: number;
    knownForDepartment: string;
    birthday: string;
    placeOfBirth: string;
    biographySnippet: string;
    knownFor: KnownForItem[];
};

type CrewInsight = {
    id: number;
    name: string;
    job: string;
    department: string;
    profilePath: string | null;
};

type CompanionPayload = {
    details: any | null;
    recommendations: Recommendation[];
    castInsights: CastInsight[];
    soundtrackPeople: string[];
    seasonDetails: any | null;
};

type PollVotes = Record<string, number>;
type ReactionCounts = Record<string, number>;
type DiscoveryFactPayload = {
    facts?: string[];
    fact?: string | null;
    sources?: {
        wikipedia?: number;
        tmdb?: number;
    };
};

const LOCAL_WATCHLIST_KEY = 'portal.companion.watchlist.v1';
const LOCAL_ROOM_STATE_KEY = 'portal.companion.room.v1';

const posterUrl = (path?: string | null, size = 'w342') => (
    path ? `https://image.tmdb.org/t/p/${size}${path}` : ''
);

const initialsForName = (name: string): string => {
    const parts = String(name || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2);
    if (!parts.length) return '?';
    return parts.map((part) => part[0]?.toUpperCase() || '').join('');
};

const normalizedMediaType = (raw: unknown): 'movie' | 'tv' | null => {
    const value = String(raw || '').toLowerCase();
    if (value === 'tv' || value === 'show' || value === 'series') return 'tv';
    if (value === 'movie') return 'movie';
    return null;
};

const formatYear = (date: unknown): string => {
    const raw = String(date || '');
    return raw.slice(0, 4);
};

const readJsonStorage = <T,>(key: string, fallback: T): T => {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed as T : fallback;
    } catch {
        return fallback;
    }
};

const writeJsonStorage = (key: string, value: unknown) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Ignore persistence failures.
    }
};

const buildKnownFor = (payload: any, currentTmdbId: number): KnownForItem[] => {
    const seen = new Set<string>();
    const pool = [
        ...(Array.isArray(payload?.cast) ? payload.cast : []),
        ...(Array.isArray(payload?.crew) ? payload.crew : []),
    ];
    return pool
        .map((entry) => {
            const mediaType = normalizedMediaType(entry?.media_type || entry?.mediaType);
            const id = Number(entry?.id);
            if (!mediaType || !Number.isFinite(id) || id <= 0 || id === currentTmdbId) return null;
            const title = String(entry?.title || entry?.name || '').trim();
            if (!title) return null;
            const key = `${mediaType}:${id}`;
            if (seen.has(key)) return null;
            seen.add(key);
            return {
                id,
                mediaType,
                title,
                year: formatYear(
                    entry?.release_date
                    || entry?.first_air_date
                    || entry?.releaseDate
                    || entry?.firstAirDate,
                ),
                popularity: Number(entry?.popularity) || 0,
                voteCount: Number(entry?.vote_count ?? entry?.voteCount) || 0,
            };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => (
            (b.voteCount - a.voteCount)
            || (b.popularity - a.popularity)
        ))
        .slice(0, 3)
        .map((entry: any) => ({
            id: entry.id,
            mediaType: entry.mediaType,
            title: entry.title,
            year: entry.year,
        }));
};

const extractSoundtrackPeople = (crew: any[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const entry of crew) {
        const department = String(entry?.department || '').toLowerCase();
        const job = String(entry?.job || '').toLowerCase();
        const name = String(entry?.name || '').trim();
        if (!name) continue;
        const isMusic = department.includes('sound')
            || department.includes('music')
            || job.includes('composer')
            || job.includes('music')
            || job.includes('score')
            || job.includes('soundtrack');
        if (!isMusic) continue;
        if (seen.has(name)) continue;
        seen.add(name);
        out.push(name);
        if (out.length >= 6) break;
    }
    return out;
};

const normalizeRecommendations = (results: any[]): Recommendation[] => (
    (Array.isArray(results) ? results : [])
        .map((item) => {
            const mediaType = normalizedMediaType(item?.media_type || item?.mediaType);
            const id = Number(item?.id);
            if (!mediaType || !Number.isFinite(id) || id <= 0) return null;
            const title = String(item?.title || item?.name || '').trim();
            if (!title) return null;
            return {
                id,
                mediaType,
                tmdbId: id,
                title,
                year: formatYear(item?.release_date || item?.first_air_date || item?.releaseDate || item?.firstAirDate),
                posterPath: item?.poster_path || item?.posterPath || null,
            };
        })
        .filter(Boolean) as Recommendation[]
);

const isRequestableRecommendation = (item: Recommendation): boolean => {
    const kind = resolveMediaAvailabilityState(item).kind;
    if (kind === 'blacklisted') return false;
    return !shouldHideAvailableItem(item) && !shouldHideRequestedItem(item);
};

export const NowPlayingCompanionPanel: React.FC<Props> = ({
    session,
    userKey,
    mediaServerType = 'plex',
    onNavigate,
    onToast,
}) => {
    const { t } = useDiscoverI18n();
    const tmdbId = Number(session?.tmdbId || 0);
    const mediaType = session?.mediaType === 'tv' ? 'tv' : 'movie';
    const seasonNumber = Number(session?.season || 0);
    const episodeNumber = Number(session?.episode || 0);
    const storageKey = `${userKey}:${mediaType}:${tmdbId}`;
    const basePath = Number.isFinite(tmdbId) && tmdbId > 0 ? `/discovery/${mediaType}/${tmdbId}` : '';

    const [open, setOpen] = useState(true);
    const [tab, setTab] = useState<'companion' | 'deep-dive' | 'watch-room'>('companion');
    const [payload, setPayload] = useState<CompanionPayload | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [openingLibrary, setOpeningLibrary] = useState(false);
    const [savedToWatchlist, setSavedToWatchlist] = useState(false);
    const [activeQuote, setActiveQuote] = useState('');
    const [pollChoice, setPollChoice] = useState<string | null>(null);
    const [pollVotes, setPollVotes] = useState<PollVotes>({});
    const [reactions, setReactions] = useState<ReactionCounts>({});
    const [ratings, setRatings] = useState<CombinedRatings | null>(null);
    const [factPayload, setFactPayload] = useState<DiscoveryFactPayload | null>(null);
    const [factLoading, setFactLoading] = useState(false);
    const [factSpotlightIndex, setFactSpotlightIndex] = useState(0);

    const title = String(payload?.details?.title || payload?.details?.name || session?.title || t('homeDashboard.nowPlayingCompanion.fallbacks.nowPlaying')).trim();
    const year = formatYear(payload?.details?.release_date || payload?.details?.first_air_date);

    useEffect(() => {
        setOpen(true);
        setTab('companion');
    }, [mediaType, tmdbId, seasonNumber, episodeNumber]);

    useEffect(() => {
        const saved = readJsonStorage<Record<string, any>>(LOCAL_WATCHLIST_KEY, {});
        setSavedToWatchlist(!!saved[storageKey]);
    }, [storageKey]);

    useEffect(() => {
        const room = readJsonStorage<Record<string, any>>(LOCAL_ROOM_STATE_KEY, {});
        const reactionSeed = room?.[storageKey]?.reactions || { like: 0, fire: 0, laugh: 0, wow: 0 };
        const pollSeed = room?.[storageKey]?.pollVotes || {
            pacing: 0,
            acting: 0,
            visuals: 0,
            soundtrack: 0,
        };
        setReactions({
            like: Number(reactionSeed.like) || 0,
            fire: Number(reactionSeed.fire) || 0,
            laugh: Number(reactionSeed.laugh) || 0,
            wow: Number(reactionSeed.wow) || 0,
        });
        setPollVotes({
            pacing: Number(pollSeed.pacing) || 0,
            acting: Number(pollSeed.acting) || 0,
            visuals: Number(pollSeed.visuals) || 0,
            soundtrack: Number(pollSeed.soundtrack) || 0,
        });
        setPollChoice(room?.[storageKey]?.pollChoice || null);
    }, [storageKey]);

    useEffect(() => {
        if (!open || !Number.isFinite(tmdbId) || tmdbId <= 0) {
            setPayload(null);
            setLoading(false);
            setError(null);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);

        const run = async () => {
            const detailPath = `/api/discovery/proxy/${mediaType}/${tmdbId}`;
            const recPath = `/api/discovery/proxy/${mediaType}/${tmdbId}/recommendations`;
            const seasonPath = mediaType === 'tv' && seasonNumber > 0
                ? `/api/discovery/proxy/tv/${tmdbId}/season/${seasonNumber}`
                : '';

            const [details, recRes, seasonDetails] = await Promise.all([
                apiFetch(detailPath).catch(() => null),
                apiFetch(recPath).catch(() => null),
                seasonPath ? apiFetch(seasonPath).catch(() => null) : Promise.resolve(null),
            ]);

            if (cancelled) return;
            if (!details || details?.error) {
                setPayload(null);
                setError('__companion_details_unavailable__');
                return;
            }

            const topCast = Array.isArray(details?.credits?.cast)
                ? details.credits.cast.filter((actor: any) => String(actor?.name || '').trim()).slice(0, 10)
                : [];
            const castInsights = await Promise.all(topCast.map(async (actor: any) => {
                const personId = Number(actor?.id);
                const profilePath = actor?.profile_path || actor?.profilePath || null;
                if (!Number.isFinite(personId) || personId <= 0) {
                    return {
                        id: Number(actor?.id || 0),
                        name: String(actor?.name || '').trim(),
                        character: String(actor?.character || '').trim(),
                        profilePath,
                        popularity: Number(actor?.popularity) || 0,
                        knownForDepartment: String(actor?.known_for_department || actor?.knownForDepartment || '').trim(),
                        birthday: '',
                        placeOfBirth: '',
                        biographySnippet: '',
                        knownFor: [],
                    } as CastInsight;
                }
                const [credits, personDetails] = await Promise.all([
                    apiFetch(`/api/discovery/proxy/person/${personId}/combined_credits`).catch(() => null),
                    apiFetch(`/api/discovery/proxy/person/${personId}`).catch(() => null),
                ]);
                const biographyRaw = String(personDetails?.biography || '').trim();
                const biographySnippet = biographyRaw
                    ? biographyRaw.replace(/\s+/g, ' ').slice(0, 180)
                    : '';
                return {
                    id: personId,
                    name: String(actor?.name || '').trim(),
                    character: String(actor?.character || '').trim(),
                    profilePath: profilePath || personDetails?.profile_path || personDetails?.profilePath || null,
                    popularity: Number(actor?.popularity ?? personDetails?.popularity) || 0,
                    knownForDepartment: String(
                        actor?.known_for_department
                        || actor?.knownForDepartment
                        || personDetails?.known_for_department
                        || personDetails?.knownForDepartment
                        || '',
                    ).trim(),
                    birthday: String(personDetails?.birthday || '').trim(),
                    placeOfBirth: String(personDetails?.place_of_birth || personDetails?.placeOfBirth || '').trim(),
                    biographySnippet,
                    knownFor: buildKnownFor(credits, tmdbId),
                } as CastInsight;
            }));

            if (cancelled) return;
            const rawRecommendations = normalizeRecommendations(recRes?.results || []).slice(0, 20);
            const enrichedRecommendations = await enrichDiscoverItemsWithAvailability(rawRecommendations);
            const requestableRecommendations = enrichedRecommendations
                .filter(isRequestableRecommendation)
                .slice(0, 6);
            if (cancelled) return;
            setPayload({
                details,
                recommendations: requestableRecommendations,
                castInsights,
                soundtrackPeople: extractSoundtrackPeople(Array.isArray(details?.credits?.crew) ? details.credits.crew : []),
                seasonDetails,
            });
        };

        run()
            .catch((fetchError: any) => {
                if (cancelled) return;
                setPayload(null);
                setError(String(fetchError?.message || '__companion_load_failed__'));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [open, mediaType, tmdbId, seasonNumber]);

    useEffect(() => {
        if (!open || !Number.isFinite(tmdbId) || tmdbId <= 0) {
            setRatings(null);
            return;
        }
        let cancelled = false;
        fetchCombinedRatings(mediaType, tmdbId)
            .then((res) => {
                if (cancelled) return;
                setRatings(res || null);
            })
            .catch(() => {
                if (cancelled) return;
                setRatings(null);
            });
        return () => {
            cancelled = true;
        };
    }, [open, mediaType, tmdbId]);

    useEffect(() => {
        if (!open || !Number.isFinite(tmdbId) || tmdbId <= 0) {
            setFactPayload(null);
            setFactLoading(false);
            return;
        }
        let cancelled = false;
        setFactLoading(true);
        apiFetch(`/api/discovery/fact?mediaType=${mediaType}&mediaId=${tmdbId}`)
            .then((res) => {
                if (cancelled) return;
                setFactPayload(res && typeof res === 'object' ? res : null);
            })
            .catch(() => {
                if (cancelled) return;
                setFactPayload(null);
            })
            .finally(() => {
                if (cancelled) return;
                setFactLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [open, mediaType, tmdbId]);

    const normalizedDetails = useMemo(() => {
        const details = payload?.details;
        if (!details || typeof details !== 'object') return null;
        return {
            ...details,
            releaseDate: details.releaseDate || details.release_date || null,
            firstAirDate: details.firstAirDate || details.first_air_date || null,
            lastAirDate: details.lastAirDate || details.last_air_date || null,
            originalLanguage: details.originalLanguage || details.original_language || null,
            productionCountries: details.productionCountries || details.production_countries || [],
            productionCompanies: details.productionCompanies || details.production_companies || [],
            originalTitle: details.originalTitle || details.original_title || null,
            originalName: details.originalName || details.original_name || null,
            episodeRunTime: details.episodeRunTime || details.episode_run_time || [],
            createdBy: details.createdBy || details.created_by || [],
            externalIds: details.externalIds || details.external_ids || null,
            imdbId: details.imdbId || details.imdb_id || null,
        };
    }, [payload?.details]);

    const productionFacts = useMemo(() => (
        normalizedDetails ? buildMediaFactRows(mediaType, normalizedDetails).slice(0, 8) : []
    ), [mediaType, normalizedDetails]);

    const externalLinks = useMemo(() => (
        normalizedDetails ? buildExternalLinks(mediaType, normalizedDetails, ratings) : []
    ), [mediaType, normalizedDetails, ratings]);

    const episodeContext = useMemo(() => {
        if (mediaType !== 'tv' || !payload?.seasonDetails || !seasonNumber || !episodeNumber) {
            return { current: null, previous: null, next: null };
        }
        const episodes = Array.isArray(payload.seasonDetails?.episodes) ? payload.seasonDetails.episodes : [];
        const index = episodes.findIndex((ep: any) => Number(ep?.episode_number) === episodeNumber);
        const current = index >= 0 ? episodes[index] : null;
        const previous = index > 0 ? episodes[index - 1] : null;
        const next = index >= 0 && index < episodes.length - 1 ? episodes[index + 1] : null;
        return { current, previous, next };
    }, [episodeNumber, mediaType, payload?.seasonDetails, seasonNumber]);

    const timelineFacts = useMemo(() => {
        const details = payload?.details;
        if (!details) return [];
        const facts: Array<{ label: string; value: string }> = [];
        const releaseDate = String(details?.release_date || details?.first_air_date || '').trim();
        const runtime = Number(details?.runtime || 0);
        const avgRuntime = Number(Array.isArray(details?.episode_run_time) ? details.episode_run_time[0] : 0);
        const genres = Array.isArray(details?.genres)
            ? details.genres.map((g: any) => String(g?.name || '').trim()).filter(Boolean).slice(0, 3)
            : [];
        const vote = Number(details?.vote_average || 0);
        const status = String(details?.status || '').trim();

        if (releaseDate) facts.push({ label: t('homeDashboard.nowPlayingCompanion.timeline.release'), value: releaseDate });
        if (runtime > 0) facts.push({ label: t('homeDashboard.nowPlayingCompanion.timeline.runtime'), value: t('common.runtimeMin', { count: runtime }) });
        else if (avgRuntime > 0) facts.push({ label: t('homeDashboard.nowPlayingCompanion.timeline.episodeRuntime'), value: t('common.runtimeMin', { count: avgRuntime }) });
        if (genres.length) facts.push({ label: t('homeDashboard.nowPlayingCompanion.timeline.genres'), value: genres.join(' / ') });
        if (vote > 0) facts.push({ label: t('homeDashboard.nowPlayingCompanion.timeline.tmdbScore'), value: `${vote.toFixed(1)} / 10` });
        if (status) facts.push({ label: t('homeDashboard.nowPlayingCompanion.timeline.status'), value: status });
        if (mediaType === 'tv' && seasonNumber > 0 && episodeNumber > 0) {
            const epName = String(episodeContext.current?.name || session?.episodeTitle || '').trim();
            const epAirDate = String(episodeContext.current?.air_date || '').trim();
            facts.push({
                label: t('homeDashboard.nowPlayingCompanion.timeline.currentEpisode'),
                value: `S${seasonNumber}E${episodeNumber}${epName ? ` - ${epName}` : ''}`,
            });
            if (epAirDate) facts.push({ label: t('homeDashboard.nowPlayingCompanion.timeline.episodeAirDate'), value: epAirDate });
        }
        return facts;
    }, [episodeContext.current?.air_date, episodeContext.current?.name, episodeNumber, mediaType, payload?.details, seasonNumber, session?.episodeTitle, t]);

    const quoteMoments = useMemo(() => {
        const source = String(
            episodeContext.current?.overview
            || payload?.details?.overview
            || '',
        ).trim();
        if (!source) return [];
        const parts = source
            .split(/(?<=[.!?])\s+/)
            .map((part) => part.trim())
            .filter((part) => part.length >= 24)
            .slice(0, 3);
        if (parts.length) return parts;
        return [source.slice(0, 160)];
    }, [episodeContext.current?.overview, payload?.details?.overview]);

    const triviaFacts = useMemo(() => {
        const details = normalizedDetails;
        if (!details) return [] as string[];
        const facts: string[] = [];
        const voteAverage = Number(details.voteAverage ?? details.vote_average ?? 0);
        const voteCount = Number(details.voteCount ?? details.vote_count ?? 0);
        const popularity = Number(details.popularity || 0);
        const runtime = Number(details.runtime || 0);
        const episodeRunTime = Number(Array.isArray(details.episodeRunTime) ? details.episodeRunTime[0] : 0);
        const seasonCount = Number(details.numberOfSeasons ?? details.number_of_seasons ?? 0);
        const episodeCount = Number(details.numberOfEpisodes ?? details.number_of_episodes ?? 0);
        const originCountries = Array.isArray(details.originCountry || details.origin_country)
            ? (details.originCountry || details.origin_country)
            : [];
        const studios = Array.isArray(details.productionCompanies)
            ? details.productionCompanies.map((studio: any) => String(studio?.name || '').trim()).filter(Boolean)
            : [];
        const topCast = payload?.castInsights?.slice(0, 3) || [];
        const budget = Number(details.budget || 0);
        const revenue = Number(details.revenue || 0);

        if (voteAverage > 0 && voteCount > 0) {
            facts.push(t('homeDashboard.nowPlayingCompanion.facts.communityScore', { score: voteAverage.toFixed(1), votes: voteCount.toLocaleString() }));
        }
        if (popularity > 0) {
            facts.push(t('homeDashboard.nowPlayingCompanion.facts.popularity', { value: popularity.toFixed(1) }));
        }
        if (mediaType === 'movie' && runtime > 0) {
            facts.push(t('homeDashboard.nowPlayingCompanion.facts.movieRuntime', { value: runtime }));
        }
        if (mediaType === 'tv' && episodeRunTime > 0) {
            facts.push(t('homeDashboard.nowPlayingCompanion.facts.episodeRuntime', { value: episodeRunTime }));
        }
        if (mediaType === 'tv' && seasonCount > 0) {
            facts.push(t('homeDashboard.nowPlayingCompanion.facts.seriesSummary', { seasons: seasonCount, episodes: episodeCount > 0 ? episodeCount : t('homeDashboard.nowPlayingCompanion.facts.multipleEpisodes') }));
        }
        if (originCountries.length) {
            facts.push(t('homeDashboard.nowPlayingCompanion.facts.originCountry', { countries: originCountries.join(', ') }));
        }
        if (studios.length) {
            const additionalStudioCount = Math.max(0, studios.length - 2);
            facts.push(t('homeDashboard.nowPlayingCompanion.facts.producedBy', {
                studios: studios.slice(0, 2).join(', '),
                count: additionalStudioCount > 0 ? ` (+${additionalStudioCount})` : '',
            }));
        }
        if (mediaType === 'movie' && budget > 0) {
            facts.push(t('homeDashboard.nowPlayingCompanion.facts.budget', { value: budget.toLocaleString() }));
        }
        if (mediaType === 'movie' && revenue > 0) {
            facts.push(t('homeDashboard.nowPlayingCompanion.facts.revenue', { value: revenue.toLocaleString() }));
        }
        if (mediaType === 'movie' && budget > 0 && revenue > 0) {
            const ratio = revenue / budget;
            if (Number.isFinite(ratio) && ratio > 1) {
                facts.push(t('homeDashboard.nowPlayingCompanion.facts.returnOnBudget', { ratio: ratio.toFixed(1) }));
            }
        }
        if (topCast.length) {
            facts.push(t('homeDashboard.nowPlayingCompanion.facts.topBilled', { names: topCast.map((person) => person.name).join(', ') }));
        }
        if (episodeContext.current?.air_date) {
            facts.push(t('homeDashboard.nowPlayingCompanion.facts.currentEpisodeAired', { date: episodeContext.current.air_date }));
        }

        return facts.slice(0, 8);
    }, [episodeContext.current?.air_date, mediaType, normalizedDetails, payload?.castInsights, t]);

    const crewHighlights = useMemo(() => {
        const crew = Array.isArray(payload?.details?.credits?.crew) ? payload.details.credits.crew : [];
        if (!crew.length) return [] as CrewInsight[];
        const byJob = new Map<string, CrewInsight>();
        for (const entry of crew) {
            const job = String(entry?.job || '').trim();
            const name = String(entry?.name || '').trim();
            if (!job || !name || byJob.has(job)) continue;
            byJob.set(job, {
                id: Number(entry?.id) || 0,
                name,
                job,
                department: String(entry?.department || '').trim(),
                profilePath: entry?.profile_path || entry?.profilePath || null,
            });
        }
        const preferredJobs = [
            'Director',
            'Screenplay',
            'Writer',
            'Original Music Composer',
            'Director of Photography',
            'Editor',
            'Producer',
            'Executive Producer',
        ];
        const picked: CrewInsight[] = [];
        for (const job of preferredJobs) {
            const match = byJob.get(job);
            if (!match) continue;
            picked.push(match);
            if (picked.length >= 6) break;
        }
        if (!picked.length) {
            for (const match of byJob.values()) {
                picked.push(match);
                if (picked.length >= 6) break;
            }
        }
        return picked;
    }, [payload?.details?.credits?.crew]);

    const overloadFacts = useMemo(() => {
        const apiFacts = Array.isArray(factPayload?.facts) ? factPayload.facts : [];
        const combined = [...apiFacts, ...triviaFacts];
        const seen = new Set<string>();
        const out: string[] = [];
        for (const raw of combined) {
            const text = String(raw || '').trim();
            if (!text) continue;
            const key = text.toLowerCase().replace(/\s+/g, ' ').slice(0, 240);
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(text);
            if (out.length >= 14) break;
        }
        return out;
    }, [factPayload?.facts, triviaFacts]);

    useEffect(() => {
        setFactSpotlightIndex(0);
    }, [tmdbId, mediaType]);

    useEffect(() => {
        if (factSpotlightIndex >= overloadFacts.length) {
            setFactSpotlightIndex(0);
        }
    }, [factSpotlightIndex, overloadFacts.length]);

    useEffect(() => {
        if (!open || tab !== 'companion' || factLoading || overloadFacts.length <= 1) return undefined;
        const timer = window.setInterval(() => {
            setFactSpotlightIndex((prev) => ((prev + 1) % overloadFacts.length));
        }, 3200);
        return () => window.clearInterval(timer);
    }, [factLoading, open, overloadFacts.length, tab]);

    const bumpReaction = useCallback((key: string) => {
        setReactions((prev) => {
            const next = { ...prev, [key]: (Number(prev[key]) || 0) + 1 };
            const room = readJsonStorage<Record<string, any>>(LOCAL_ROOM_STATE_KEY, {});
            room[storageKey] = {
                ...(room[storageKey] || {}),
                reactions: next,
                pollVotes,
                pollChoice,
                updatedAt: new Date().toISOString(),
            };
            writeJsonStorage(LOCAL_ROOM_STATE_KEY, room);
            return next;
        });
    }, [pollChoice, pollVotes, storageKey]);

    const votePoll = useCallback((optionId: string) => {
        setPollVotes((prev) => {
            const next = { ...prev };
            if (pollChoice && pollChoice !== optionId) {
                next[pollChoice] = Math.max(0, (Number(next[pollChoice]) || 0) - 1);
            }
            if (pollChoice !== optionId) {
                next[optionId] = (Number(next[optionId]) || 0) + 1;
            }
            const room = readJsonStorage<Record<string, any>>(LOCAL_ROOM_STATE_KEY, {});
            room[storageKey] = {
                ...(room[storageKey] || {}),
                reactions,
                pollVotes: next,
                pollChoice: optionId,
                updatedAt: new Date().toISOString(),
            };
            writeJsonStorage(LOCAL_ROOM_STATE_KEY, room);
            return next;
        });
        setPollChoice(optionId);
    }, [pollChoice, reactions, storageKey]);

    const totalPollVotes = useMemo(
        () => Object.values(pollVotes).reduce((sum, value) => sum + (Number(value) || 0), 0),
        [pollVotes],
    );

    const goToPath = (path: string) => {
        if (!path || !onNavigate) return;
        onNavigate(path);
    };

    const requestSimilar = (item?: Recommendation | null) => {
        if (!item || !onNavigate) return;
        onNavigate(`/discovery/${item.mediaType}/${item.id}?request=1`);
    };

    const toggleLocalWatchlist = () => {
        if (!Number.isFinite(tmdbId) || tmdbId <= 0) return;
        const current = readJsonStorage<Record<string, any>>(LOCAL_WATCHLIST_KEY, {});
        if (current[storageKey]) {
            delete current[storageKey];
            writeJsonStorage(LOCAL_WATCHLIST_KEY, current);
            setSavedToWatchlist(false);
            onToast?.(t('homeDashboard.nowPlayingCompanion.toasts.watchlistRemoved'), 'success');
            return;
        }
        current[storageKey] = {
            userKey,
            mediaType,
            tmdbId,
            title,
            year,
            posterPath: payload?.details?.poster_path || null,
            savedAt: new Date().toISOString(),
        };
        writeJsonStorage(LOCAL_WATCHLIST_KEY, current);
        setSavedToWatchlist(true);
        onToast?.(t('homeDashboard.nowPlayingCompanion.toasts.watchlistSaved'), 'success');
    };

    const openInLibrary = async () => {
        if (!Number.isFinite(tmdbId) || tmdbId <= 0 || openingLibrary) return;
        setOpeningLibrary(true);
        try {
            const params = new URLSearchParams({
                mediaType,
                tmdbId: String(tmdbId),
                title,
            });
            if (year) params.set('year', year);
            const payloadRes = await apiFetch(`/api/discovery/library-link?${params.toString()}`);
            if (payloadRes?.url) {
                window.open(String(payloadRes.url), '_blank', 'noopener,noreferrer');
            } else {
                throw new Error('__companion_provider_link_unavailable__');
            }
        } catch (openError: any) {
            const message = String(openError?.message || '__companion_provider_open_failed__');
            onToast?.(message === '__companion_provider_link_unavailable__' ? t('homeDashboard.nowPlayingCompanion.errors.providerLinkUnavailable') : message === '__companion_provider_open_failed__' ? t('homeDashboard.nowPlayingCompanion.errors.providerOpenFailed') : message, 'error');
        } finally {
            setOpeningLibrary(false);
        }
    };

    const jumpToQuoteContext = async (quote: string) => {
        setActiveQuote(quote);
        if (!onNavigate || !basePath) return;
        if (mediaType === 'tv' && seasonNumber > 0) {
            const qs = new URLSearchParams({ season: String(seasonNumber) });
            if (episodeNumber > 0) qs.set('episode', String(episodeNumber));
            onNavigate(`${basePath}?${qs.toString()}`);
        } else {
            onNavigate(basePath);
        }
        onToast?.(t('homeDashboard.nowPlayingCompanion.toasts.openedDiscoverContext'), 'success');
        if (navigator?.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(quote);
            } catch {
                // Ignore clipboard write failures.
            }
        }
    };

    const copyRoomSummary = async () => {
        const summary = `${title}${year ? ` (${year})` : ''} - ${mediaType.toUpperCase()} - progress ${Math.round(Number(session.progress) || 0)}%`;
        if (navigator?.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(summary);
                onToast?.(t('homeDashboard.nowPlayingCompanion.toasts.summaryCopied'), 'success');
                return;
            } catch {
                // fall through
            }
        }
        onToast?.(t('homeDashboard.nowPlayingCompanion.toasts.clipboardUnavailable'), 'error');
    };

    const providerLabel = String(mediaServerType || '').toLowerCase() === 'jellyfin'
        ? 'Jellyfin'
        : String(mediaServerType || '').toLowerCase() === 'emby'
            ? 'Emby'
            : 'Plex';
    const playbackTelemetry = [
        { label: t('homeDashboard.nowPlayingCompanion.telemetry.state'), value: String(session.state || 'playing').toLowerCase() === 'playing' ? t('homeDashboard.nowPlayingCompanion.telemetry.playing') : String(session.state || '').toLowerCase() === 'paused' ? t('nowPlaying.paused') : String(session.state || 'playing').toUpperCase() },
        { label: t('homeDashboard.nowPlayingCompanion.telemetry.progress'), value: `${Math.round(Number(session.progress) || 0)}%` },
        { label: t('homeDashboard.nowPlayingCompanion.telemetry.mediaType'), value: mediaType === 'tv' ? t('mediaType.tv') : t('mediaType.movie') },
        ...(seasonNumber > 0 && episodeNumber > 0
            ? [{ label: t('homeDashboard.nowPlayingCompanion.telemetry.episode'), value: `S${seasonNumber}E${episodeNumber}` }]
            : []),
    ];
    const firstRecommendation = payload?.recommendations?.[0] || null;
    const leadCast = payload?.castInsights?.[0] || null;
    const nextEpisodeNumber = Number(episodeContext.next?.episode_number || 0);
    const nextBestAction = (() => {
        if (
            mediaType === 'tv'
            && seasonNumber > 0
            && Number.isFinite(nextEpisodeNumber)
            && nextEpisodeNumber > 0
            && basePath
        ) {
            const nextName = String(episodeContext.next?.name || '').trim();
            return {
                tone: 'sky' as const,
                title: t('homeDashboard.nowPlayingCompanion.nextAction.continueTitle'),
                hint: nextName
                    ? t('homeDashboard.nowPlayingCompanion.nextAction.continueHintWithName', { season: seasonNumber, episode: nextEpisodeNumber, name: nextName })
                    : t('homeDashboard.nowPlayingCompanion.nextAction.continueHint', { season: seasonNumber, episode: nextEpisodeNumber }),
                cta: t('homeDashboard.nowPlayingCompanion.actions.openNextEpisode'),
                onClick: () => goToPath(`${basePath}?season=${seasonNumber}&episode=${nextEpisodeNumber}`),
            };
        }
        if (firstRecommendation) {
            return {
                tone: 'violet' as const,
                title: t('homeDashboard.nowPlayingCompanion.nextAction.queueSimilarTitle'),
                hint: t('homeDashboard.nowPlayingCompanion.nextAction.queueSimilarHint', { title: firstRecommendation.title, year: firstRecommendation.year || '' }),
                cta: t('homeDashboard.nowPlayingCompanion.actions.requestSimilar'),
                onClick: () => requestSimilar(firstRecommendation),
            };
        }
        if (leadCast && Number.isFinite(leadCast.id) && leadCast.id > 0) {
            return {
                tone: 'emerald' as const,
                title: t('homeDashboard.nowPlayingCompanion.nextAction.exploreActorTitle'),
                hint: t('homeDashboard.nowPlayingCompanion.nextAction.exploreActorHint', { name: leadCast.name }),
                cta: t('homeDashboard.nowPlayingCompanion.actions.openActorProfile'),
                onClick: () => goToPath(`/discovery/person/${leadCast.id}`),
            };
        }
        if (!savedToWatchlist) {
            return {
                tone: 'emerald' as const,
                title: t('homeDashboard.nowPlayingCompanion.nextAction.saveForLaterTitle'),
                hint: t('homeDashboard.nowPlayingCompanion.nextAction.saveForLaterHint'),
                cta: t('homeDashboard.nowPlayingCompanion.actions.saveToWatchlist'),
                onClick: toggleLocalWatchlist,
            };
        }
        if (basePath) {
            return {
                tone: 'emerald' as const,
                title: t('homeDashboard.nowPlayingCompanion.nextAction.diveDetailsTitle'),
                hint: t('homeDashboard.nowPlayingCompanion.nextAction.diveDetailsHint'),
                cta: t('homeDashboard.nowPlayingCompanion.actions.openDetails'),
                onClick: () => goToPath(basePath),
            };
        }
        return null;
    })();

    return (
        <div className="glass-card mt-4 p-3 sm:p-4 md:p-5 border border-emerald-500/25 bg-black/25">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                    <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-emerald-200 flex items-center gap-2">
                        <Sparkles className="w-4 h-4" />
                        {t('homeDashboard.nowPlayingCompanion.header.title')}
                    </h3>
                    <p className="text-xs text-white/70 mt-1">
                        {year ? t('homeDashboard.nowPlayingCompanion.header.subtitleWithYear', { title, year }) : t('homeDashboard.nowPlayingCompanion.header.subtitle', { title })}
                    </p>
                </div>
                <div className="flex items-center justify-end">
                    <button
                        type="button"
                        onClick={() => setOpen((prev) => !prev)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/20 bg-white/5 text-xs font-bold text-white hover:bg-white/10 transition-colors"
                    >
                        {open ? (
                            <>
                                {t('homeDashboard.nowPlayingCompanion.actions.collapse')} <ChevronUp className="w-3.5 h-3.5" />
                            </>
                        ) : (
                            <>
                                {t('homeDashboard.nowPlayingCompanion.actions.expand')} <ChevronDown className="w-3.5 h-3.5" />
                            </>
                        )}
                    </button>
                </div>
            </div>

            {!open ? null : (
                <div className="mt-4 space-y-4">
                    <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setTab('companion')}
                            className={`px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold border transition-colors ${
                                tab === 'companion'
                                    ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100'
                                    : 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10'
                            }`}
                        >
                            {t('homeDashboard.nowPlayingCompanion.tabs.companion')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setTab('deep-dive')}
                            className={`px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold border transition-colors ${
                                tab === 'deep-dive'
                                    ? 'border-violet-400/50 bg-violet-500/20 text-violet-100'
                                    : 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10'
                            }`}
                        >
                            {t('homeDashboard.nowPlayingCompanion.tabs.deepDive')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setTab('watch-room')}
                            className={`px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold border transition-colors ${
                                tab === 'watch-room'
                                    ? 'border-sky-400/50 bg-sky-500/20 text-sky-100'
                                    : 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10'
                            }`}
                        >
                            {t('homeDashboard.nowPlayingCompanion.tabs.watchRoom')}
                        </button>
                    </div>

                    {!Number.isFinite(tmdbId) || tmdbId <= 0 ? (
                        <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                            {t('homeDashboard.nowPlayingCompanion.errors.noTmdbContext')}
                        </div>
                    ) : loading ? (
                        <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex items-center gap-2 text-sm text-white/80">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {t('homeDashboard.nowPlayingCompanion.loading.context')}
                        </div>
                    ) : error ? (
                        <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
                            {error === '__companion_details_unavailable__' ? t('homeDashboard.nowPlayingCompanion.errors.detailsUnavailable') : error === '__companion_load_failed__' ? t('homeDashboard.nowPlayingCompanion.errors.loadFailed') : error}
                        </div>
                    ) : null}

                    {tab === 'companion' && payload && (
                        <div className="space-y-4">
                            {nextBestAction ? (
                                <div className={`rounded-xl border p-3 ${
                                    nextBestAction.tone === 'violet'
                                        ? 'border-violet-400/30 bg-violet-500/10'
                                        : nextBestAction.tone === 'sky'
                                            ? 'border-sky-400/30 bg-sky-500/10'
                                            : 'border-emerald-400/30 bg-emerald-500/10'
                                }`}>
                                    <p className="text-[11px] uppercase tracking-widest font-bold text-white/70">
                                        {t('homeDashboard.nowPlayingCompanion.sections.nextBestAction')}
                                    </p>
                                    <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-bold text-white">{nextBestAction.title}</p>
                                            <p className="text-xs text-white/70 mt-0.5">{nextBestAction.hint}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={nextBestAction.onClick}
                                            className={`w-full sm:w-auto px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                                                nextBestAction.tone === 'violet'
                                                    ? 'border-violet-400/45 bg-violet-500/25 text-violet-100 hover:bg-violet-500/35'
                                                    : nextBestAction.tone === 'sky'
                                                        ? 'border-sky-400/45 bg-sky-500/25 text-sky-100 hover:bg-sky-500/35'
                                                        : 'border-emerald-400/45 bg-emerald-500/25 text-emerald-100 hover:bg-emerald-500/35'
                                            }`}
                                        >
                                            {nextBestAction.cta}
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <button
                                    type="button"
                                    onClick={toggleLocalWatchlist}
                                    className="w-full px-3 py-2 rounded-lg text-xs font-bold border border-white/20 bg-white/5 text-white hover:bg-white/10 transition-colors"
                                >
                                    {savedToWatchlist ? t('homeDashboard.nowPlayingCompanion.actions.savedToWatchlist') : t('homeDashboard.nowPlayingCompanion.actions.saveToWatchlist')}
                                </button>
                                <button
                                    type="button"
                                    onClick={openInLibrary}
                                    disabled={openingLibrary}
                                    className="w-full px-3 py-2 rounded-lg text-xs font-bold border border-white/20 bg-white/5 text-white hover:bg-white/10 transition-colors disabled:opacity-60"
                                >
                                    {openingLibrary ? t('homeDashboard.nowPlayingCompanion.actions.openingProvider', { provider: providerLabel }) : t('homeDashboard.nowPlayingCompanion.actions.openInProvider', { provider: providerLabel })}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => requestSimilar(firstRecommendation)}
                                    disabled={!firstRecommendation}
                                    className="w-full px-3 py-2 rounded-lg text-xs font-bold border border-violet-400/40 bg-violet-500/20 text-violet-100 hover:bg-violet-500/30 transition-colors disabled:opacity-60"
                                >
                                    {firstRecommendation ? t('homeDashboard.nowPlayingCompanion.actions.requestTitle', { title: firstRecommendation.title }) : t('homeDashboard.nowPlayingCompanion.actions.noSimilarTitles')}
                                </button>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {playbackTelemetry.map((entry) => (
                                    <div key={`telemetry-${entry.label}`} className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 min-w-0">
                                        <p className="text-[10px] uppercase tracking-wide text-white/50">{entry.label}</p>
                                        <p className="text-xs font-bold text-white truncate">{entry.value}</p>
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 items-stretch">
                                <div className="xl:col-span-2 rounded-xl border border-white/10 bg-white/5 p-2.5 sm:p-3">
                                    <p className="text-[11px] uppercase tracking-widest text-white/60 font-bold mb-2 flex items-center gap-1.5">
                                        <Users className="w-3.5 h-3.5" />
                                        {t('homeDashboard.nowPlayingCompanion.sections.castIntelligence')}
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                                        {payload.castInsights.map((actor) => (
                                            <div key={`cast-${actor.id}`} className="rounded-lg border border-white/10 bg-black/35 p-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden bg-white/5 shrink-0 border border-white/15">
                                                        {actor.profilePath ? (
                                                            <img
                                                                src={posterUrl(actor.profilePath, 'w185')}
                                                                alt={actor.name}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-500/35 to-cyan-500/20 text-emerald-100 text-xs font-black">
                                                                {initialsForName(actor.name)}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => goToPath(`/discovery/person/${actor.id}`)}
                                                            className="text-left text-sm font-bold text-white hover:text-emerald-200 truncate max-w-full"
                                                        >
                                                            {actor.name}
                                                        </button>
                                                        {actor.character ? (
                                                            <p className="text-[11px] text-white/60 truncate">{actor.character}</p>
                                                        ) : null}
                                                        {actor.popularity > 0 ? (
                                                            <p className="text-[10px] text-emerald-200/80">
                                                                {t('homeDashboard.nowPlayingCompanion.cast.popularity', { value: actor.popularity.toFixed(1) })}
                                                            </p>
                                                        ) : null}
                                                        {actor.knownForDepartment ? (
                                                            <p className="text-[10px] text-white/55 truncate">
                                                                {actor.knownForDepartment}
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                </div>
                                                {actor.birthday || actor.placeOfBirth ? (
                                                    <p className="mt-1.5 text-[10px] text-white/50">
                                                        {[actor.birthday, actor.placeOfBirth].filter(Boolean).join(' • ')}
                                                    </p>
                                                ) : null}
                                                {actor.biographySnippet ? (
                                                    <p className="mt-1.5 text-[10px] text-white/60 leading-relaxed">
                                                        {actor.biographySnippet}
                                                        {actor.biographySnippet.length >= 180 ? '…' : ''}
                                                    </p>
                                                ) : null}
                                                {actor.knownFor.length > 0 ? (
                                                    <div className="mt-2 flex flex-wrap gap-1">
                                                        {actor.knownFor.map((item) => (
                                                            <button
                                                                key={`known-${actor.id}-${item.mediaType}-${item.id}`}
                                                                type="button"
                                                                onClick={() => goToPath(`/discovery/${item.mediaType}/${item.id}`)}
                                                                className="px-2 py-1 rounded-md text-[10px] border border-white/15 bg-white/5 text-white/80 hover:bg-white/10 transition-colors truncate max-w-full"
                                                            >
                                                                {item.title}{item.year ? ` (${item.year})` : ''}
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="mt-2 text-[10px] text-white/45">{t('homeDashboard.nowPlayingCompanion.empty.noKnownFor')}</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    {payload.castInsights.length === 0 ? (
                                        <p className="text-xs text-white/55 mt-2">{t('homeDashboard.nowPlayingCompanion.empty.noCastData')}</p>
                                    ) : null}
                                    <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                                        <p className="text-[11px] uppercase tracking-widest text-white/60 font-bold">
                                            {t('homeDashboard.nowPlayingCompanion.sections.crewIntelligence')}
                                        </p>
                                        {crewHighlights.length > 0 ? (
                                            <div className="flex gap-2 overflow-x-auto pb-1 pr-1 snap-x snap-mandatory">
                                                {crewHighlights.map((entry, index) => (
                                                    <div
                                                        key={`crew-${entry.job}-${entry.name}-${index}`}
                                                        className="snap-start min-w-[220px] sm:min-w-[240px] rounded-lg border border-white/10 bg-black/35 p-2.5"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-10 h-10 rounded-full overflow-hidden bg-white/5 border border-white/15 shrink-0">
                                                                {entry.profilePath ? (
                                                                    <img
                                                                        src={posterUrl(entry.profilePath, 'w185')}
                                                                        alt={entry.name}
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-500/35 to-cyan-500/20 text-violet-100 text-[10px] font-black">
                                                                        {initialsForName(entry.name)}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="min-w-0">
                                                                {entry.id > 0 ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => goToPath(`/discovery/person/${entry.id}`)}
                                                                        className="text-left text-xs font-bold text-white hover:text-violet-200 truncate"
                                                                    >
                                                                        {entry.name}
                                                                    </button>
                                                                ) : (
                                                                    <p className="text-xs font-bold text-white truncate">{entry.name}</p>
                                                                )}
                                                                <p className="text-[10px] text-violet-200/90">{entry.job}</p>
                                                                {entry.department ? (
                                                                    <p className="text-[10px] text-white/50 truncate">{entry.department}</p>
                                                                ) : null}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-white/55">{t('homeDashboard.nowPlayingCompanion.empty.noCrewHighlights')}</p>
                                        )}
                                    </div>
                                </div>

                                <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 sm:p-3 flex flex-col min-h-0">
                                    <p className="text-[11px] uppercase tracking-widest text-white/60 font-bold mb-2 flex items-center gap-1.5 shrink-0">
                                        <Music2 className="w-3.5 h-3.5" />
                                        {t('homeDashboard.nowPlayingCompanion.sections.soundtrackCues')}
                                    </p>
                                    {payload.soundtrackPeople.length > 0 ? (
                                        <div className="space-y-1.5">
                                            {payload.soundtrackPeople.map((name) => (
                                                <div
                                                    key={`music-${name}`}
                                                    className="px-2 py-1.5 rounded-md bg-black/35 border border-white/10 text-xs text-white/85"
                                                >
                                                    {name}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-white/55">
                                            {t('homeDashboard.nowPlayingCompanion.empty.noSoundtrackCredits')}
                                        </p>
                                    )}

                                    <div className="mt-3 pt-3 border-t border-white/10 space-y-2 shrink-0">
                                        <p className="text-[11px] uppercase tracking-widest text-white/60 font-bold">
                                        {t('homeDashboard.nowPlayingCompanion.sections.ratingsAndLinks')}
                                        </p>
                                        <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                                            <div className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5">
                                                <p className="text-[10px] uppercase tracking-wide text-white/50">IMDb</p>
                                                <p className="text-xs font-bold text-white">
                                                    {ratings?.imdb?.criticsScore ? `${ratings.imdb.criticsScore.toFixed(1)}/10` : 'N/A'}
                                                </p>
                                            </div>
                                            <div className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5">
                                                <p className="text-[10px] uppercase tracking-wide text-white/50">Rotten Tomatoes</p>
                                                <p className="text-xs font-bold text-white">
                                                    {Number.isFinite(Number(ratings?.rt?.criticsScore))
                                                        ? `${Number(ratings?.rt?.criticsScore)}%`
                                                        : 'N/A'}
                                                </p>
                                            </div>
                                        </div>
                                        {externalLinks.length > 0 ? (
                                            <div className="flex flex-wrap gap-1.5">
                                                {externalLinks.slice(0, 4).map((link) => (
                                                    <a
                                                        key={`link-${link.key}`}
                                                        href={link.url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
                                                    >
                                                        {link.label} <ExternalLink className="w-3 h-3" />
                                                    </a>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>

                                    <div className="mt-3 pt-3 border-t border-white/10 flex-1 min-h-0 flex flex-col">
                                        <div className="relative overflow-hidden rounded-xl border border-fuchsia-400/25 bg-gradient-to-br from-fuchsia-500/10 via-violet-500/10 to-cyan-500/10 p-2.5 flex-1 min-h-0 flex flex-col">
                                            <div className="pointer-events-none absolute -top-10 right-0 w-28 h-28 rounded-full bg-fuchsia-400/20 blur-2xl animate-pulse motion-reduce:animate-none" />
                                            <div className="pointer-events-none absolute -bottom-12 -left-6 w-32 h-32 rounded-full bg-cyan-400/15 blur-2xl animate-pulse motion-reduce:animate-none" />
                                            <div className="relative space-y-2 flex-1 min-h-0 flex flex-col">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-[11px] uppercase tracking-widest text-fuchsia-100 font-black flex items-center gap-1.5">
                                                        <span className="relative inline-flex h-2 w-2">
                                                            <span className="absolute inline-flex h-full w-full rounded-full bg-fuchsia-300 opacity-75 animate-ping motion-reduce:animate-none" />
                                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-fuchsia-200" />
                                                        </span>
                                        {t('homeDashboard.nowPlayingCompanion.sections.factOverload')}
                                                    </p>
                                                    <span className="px-1.5 py-0.5 rounded border border-fuchsia-300/35 bg-fuchsia-500/15 text-[10px] font-bold text-fuchsia-100">
                                        {t('homeDashboard.nowPlayingCompanion.factOverload.live')}
                                                    </span>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5 text-[10px]">
                                                    <span className="px-1.5 py-0.5 rounded border border-fuchsia-300/25 bg-black/25 text-fuchsia-100/85">
                                                        Wiki {Number(factPayload?.sources?.wikipedia) || 0}
                                                    </span>
                                                    <span className="px-1.5 py-0.5 rounded border border-cyan-300/25 bg-black/25 text-cyan-100/85">
                                                        TMDB {Number(factPayload?.sources?.tmdb) || 0}
                                                    </span>
                                                    <span className="px-1.5 py-0.5 rounded border border-white/20 bg-black/25 text-white/80">
                                        {t('homeDashboard.nowPlayingCompanion.factOverload.total', { total: overloadFacts.length })}
                                                    </span>
                                                </div>
                                                {factLoading ? (
                                                    <div className="rounded-lg border border-fuchsia-300/25 bg-black/30 px-2.5 py-2 text-xs text-fuchsia-100/80 animate-pulse motion-reduce:animate-none">
                                        {t('homeDashboard.nowPlayingCompanion.loading.facts')}
                                                    </div>
                                                ) : overloadFacts.length > 0 ? (
                                                    <>
                                                        <div className="rounded-lg border border-fuchsia-300/35 bg-black/35 px-2.5 py-2 shadow-[0_0_24px_rgba(217,70,239,0.25)]">
                                            <p className="text-[10px] uppercase tracking-widest text-fuchsia-200/90 font-bold">{t('homeDashboard.nowPlayingCompanion.factOverload.spotlight')}</p>
                                                            <p className="mt-1 text-xs text-white leading-relaxed">
                                                                {overloadFacts[factSpotlightIndex] || overloadFacts[0]}
                                                            </p>
                                                        </div>
                                                        <div className="space-y-1.5 flex-1 min-h-[12rem] overflow-y-auto pr-1">
                                                            {overloadFacts.map((fact, idx) => {
                                                                const active = idx === factSpotlightIndex;
                                                                return (
                                                                    <div
                                                                        key={`overload-${idx}`}
                                                                        className={`rounded-md border px-2 py-1.5 text-xs leading-relaxed transition-all duration-500 ${
                                                                            active
                                                                                ? 'border-fuchsia-300/50 bg-fuchsia-500/18 text-white shadow-[0_0_16px_rgba(217,70,239,0.25)]'
                                                                                : 'border-white/10 bg-black/25 text-white/80'
                                                                        }`}
                                                                    >
                                                                        {active ? <span className="mr-1 text-[10px] text-fuchsia-200">★</span> : null}
                                                                        {fact}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <p className="text-xs text-white/65">
                                            {t('homeDashboard.nowPlayingCompanion.empty.factsUnavailable')}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {mediaType === 'tv' && seasonNumber > 0 ? (
                                        <div className="mt-3 pt-3 border-t border-white/10 space-y-2 shrink-0">
                                            <p className="text-[11px] uppercase tracking-widest text-white/60 font-bold flex items-center gap-1.5">
                                                <Clapperboard className="w-3.5 h-3.5" />
                                        {t('homeDashboard.nowPlayingCompanion.sections.episodeContext')}
                                            </p>
                                            <div className="space-y-1 text-xs text-white/80">
                                                <button
                                                    type="button"
                                                    disabled={!episodeContext.previous}
                                                    onClick={() => goToPath(`${basePath}?season=${seasonNumber}&episode=${Number(episodeContext.previous?.episode_number)}`)}
                                                    className="w-full text-left px-2 py-1.5 rounded-md border border-white/10 bg-black/30 hover:bg-black/45 disabled:opacity-50"
                                                >
                                            {t('homeDashboard.nowPlayingCompanion.episode.previous', { name: episodeContext.previous?.name || t('homeDashboard.nowPlayingCompanion.empty.notAvailable') })}
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={!episodeContext.current}
                                                    onClick={() => goToPath(`${basePath}?season=${seasonNumber}&episode=${episodeNumber}`)}
                                                    className="w-full text-left px-2 py-1.5 rounded-md border border-emerald-400/30 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50"
                                                >
                                            {t('homeDashboard.nowPlayingCompanion.episode.current', { name: episodeContext.current?.name || session.episodeTitle || t('nowPlaying.episode', { number: episodeNumber }) })}
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={!episodeContext.next}
                                                    onClick={() => goToPath(`${basePath}?season=${seasonNumber}&episode=${Number(episodeContext.next?.episode_number)}`)}
                                                    className="w-full text-left px-2 py-1.5 rounded-md border border-white/10 bg-black/30 hover:bg-black/45 disabled:opacity-50"
                                                >
                                            {t('homeDashboard.nowPlayingCompanion.episode.next', { name: episodeContext.next?.name || t('homeDashboard.nowPlayingCompanion.empty.notAvailable') })}
                                                </button>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            {payload.recommendations.length > 0 ? (
                                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                    <p className="text-[11px] uppercase tracking-widest text-white/60 font-bold mb-2">
                                        {t('homeDashboard.nowPlayingCompanion.sections.similarPicks')}
                                    </p>
                                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                                        {payload.recommendations.slice(0, 6).map((item) => (
                                            <div key={`rec-${item.mediaType}-${item.id}`} className="rounded-lg overflow-hidden border border-white/10 bg-black/30">
                                                <button
                                                    type="button"
                                                    onClick={() => goToPath(`/discovery/${item.mediaType}/${item.id}`)}
                                                    className="w-full text-left"
                                                >
                                                    <div className="aspect-[2/3] bg-white/5">
                                                        {item.posterPath ? (
                                                            <img
                                                                src={posterUrl(item.posterPath)}
                                                                alt={item.title}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <NoPosterPlaceholder compact />
                                                        )}
                                                    </div>
                                                    <div className="p-2">
                                                        <p className="text-[11px] text-white font-semibold truncate">{item.title}</p>
                                                        <p className="text-[10px] text-white/55">{item.year || t('homeDashboard.nowPlayingCompanion.empty.unknownYear')}</p>
                                                    </div>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => requestSimilar(item)}
                                                    className="w-full px-2 py-1.5 text-[10px] font-bold border-t border-white/10 text-violet-200 bg-violet-500/15 hover:bg-violet-500/25 transition-colors"
                                                >
                                                    {t('quickActions.request')}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    )}

                    {tab === 'deep-dive' && payload && (
                        <div className="space-y-3">
                            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                <p className="text-[11px] uppercase tracking-widest text-white/60 font-bold mb-2 flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5" />
                                    {t('homeDashboard.nowPlayingCompanion.sections.liveTriviaTimeline')}
                                </p>
                                <div className="space-y-2">
                                    {timelineFacts.map((fact) => (
                                        <div
                                            key={`fact-${fact.label}`}
                                            className="flex items-start gap-2 text-xs text-white/85 border-b border-white/5 pb-1.5 last:border-b-0 last:pb-0"
                                        >
                                            <span className="text-emerald-200 font-bold min-w-28">{fact.label}</span>
                                            <span>{fact.value}</span>
                                        </div>
                                    ))}
                                    {!timelineFacts.length ? (
                                        <p className="text-xs text-white/55">{t('homeDashboard.nowPlayingCompanion.empty.noTimelineFacts')}</p>
                                    ) : null}
                                </div>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                <p className="text-[11px] uppercase tracking-widest text-white/60 font-bold mb-2 flex items-center gap-1.5">
                                    <Clapperboard className="w-3.5 h-3.5" />
                                    {t('homeDashboard.nowPlayingCompanion.sections.productionFacts')}
                                </p>
                                <div className="space-y-2">
                                    {productionFacts.length > 0 ? productionFacts.map((fact) => (
                                        <div
                                            key={`prod-${fact.key}`}
                                            className="flex items-start gap-2 text-xs text-white/85 border-b border-white/5 pb-1.5 last:border-b-0 last:pb-0"
                                        >
                                            <span className="text-violet-200 font-bold min-w-28">{fact.label}</span>
                                            <span>{fact.value}</span>
                                        </div>
                                    )) : (
                                        <p className="text-xs text-white/55">{t('homeDashboard.nowPlayingCompanion.empty.noProductionFacts')}</p>
                                    )}
                                </div>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                <p className="text-[11px] uppercase tracking-widest text-white/60 font-bold mb-2 flex items-center gap-1.5">
                                    <Link2 className="w-3.5 h-3.5" />
                                    {t('homeDashboard.nowPlayingCompanion.sections.actorGraph')}
                                </p>
                                <div className="space-y-2">
                                    {payload.castInsights.slice(0, 4).map((actor) => (
                                        <div key={`graph-${actor.id}`} className="text-xs text-white/85">
                                            <button
                                                type="button"
                                                onClick={() => goToPath(`/discovery/person/${actor.id}`)}
                                                className="font-bold text-emerald-200 hover:underline"
                                            >
                                                {actor.name}
                                            </button>
                                            <span className="text-white/50 mx-1">{'->'}</span>
                                            {actor.knownFor.length > 0 ? actor.knownFor.map((work, idx) => (
                                                <React.Fragment key={`graph-work-${actor.id}-${work.id}`}>
                                                    <button
                                                        type="button"
                                                        onClick={() => goToPath(`/discovery/${work.mediaType}/${work.id}`)}
                                                        className="text-white hover:text-emerald-200"
                                                    >
                                                        {work.title}
                                                    </button>
                                                    {idx < actor.knownFor.length - 1 ? <span className="text-white/35 mx-1">/</span> : null}
                                                </React.Fragment>
                                            )) : <span className="text-white/55">{t('homeDashboard.nowPlayingCompanion.empty.noLinkedCredits')}</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                <p className="text-[11px] uppercase tracking-widest text-white/60 font-bold mb-2 flex items-center gap-1.5">
                                    <MessageSquareQuote className="w-3.5 h-3.5" />
                                    {t('homeDashboard.nowPlayingCompanion.sections.subtitleQuoteContext')}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {quoteMoments.map((quote, index) => (
                                        <button
                                            key={`quote-${index}`}
                                            type="button"
                                            onClick={() => jumpToQuoteContext(quote)}
                                            className={`px-2.5 py-1.5 rounded-md text-xs border transition-colors ${
                                                activeQuote === quote
                                                    ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-100'
                                                    : 'border-white/15 bg-black/30 text-white/80 hover:bg-black/45'
                                            }`}
                                        >
                                            "{quote}"
                                        </button>
                                    ))}
                                    {!quoteMoments.length ? (
                                        <p className="text-xs text-white/55">{t('homeDashboard.nowPlayingCompanion.empty.noContextualLines')}</p>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    )}

                    {tab === 'watch-room' && payload && (
                        <div className="space-y-3">
                            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                <p className="text-[11px] uppercase tracking-widest text-white/60 font-bold mb-2">
                                    {t('homeDashboard.nowPlayingCompanion.sections.sharedReactions')}
                                </p>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => bumpReaction('like')}
                                        className="px-2.5 py-2 rounded-lg border border-white/15 bg-black/30 hover:bg-black/45 text-xs text-white/85 flex items-center justify-between"
                                    >
                                        <span className="inline-flex items-center gap-1.5"><ThumbsUp className="w-3.5 h-3.5" /> {t('homeDashboard.nowPlayingCompanion.reactions.like')}</span>
                                        <span className="font-bold">{reactions.like || 0}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => bumpReaction('fire')}
                                        className="px-2.5 py-2 rounded-lg border border-white/15 bg-black/30 hover:bg-black/45 text-xs text-white/85 flex items-center justify-between"
                                    >
                                        <span className="inline-flex items-center gap-1.5"><Flame className="w-3.5 h-3.5" /> {t('homeDashboard.nowPlayingCompanion.reactions.fire')}</span>
                                        <span className="font-bold">{reactions.fire || 0}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => bumpReaction('laugh')}
                                        className="px-2.5 py-2 rounded-lg border border-white/15 bg-black/30 hover:bg-black/45 text-xs text-white/85 flex items-center justify-between"
                                    >
                                        <span className="inline-flex items-center gap-1.5"><Laugh className="w-3.5 h-3.5" /> {t('homeDashboard.nowPlayingCompanion.reactions.laugh')}</span>
                                        <span className="font-bold">{reactions.laugh || 0}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => bumpReaction('wow')}
                                        className="px-2.5 py-2 rounded-lg border border-white/15 bg-black/30 hover:bg-black/45 text-xs text-white/85 flex items-center justify-between"
                                    >
                                        <span className="inline-flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> {t('homeDashboard.nowPlayingCompanion.reactions.wow')}</span>
                                        <span className="font-bold">{reactions.wow || 0}</span>
                                    </button>
                                </div>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                <p className="text-[11px] uppercase tracking-widest text-white/60 font-bold mb-2">
                                    {t('homeDashboard.nowPlayingCompanion.sections.quickPoll')}
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {[
                                        { id: 'pacing', label: t('homeDashboard.nowPlayingCompanion.poll.bestPacing') },
                                        { id: 'acting', label: t('homeDashboard.nowPlayingCompanion.poll.strongActing') },
                                        { id: 'visuals', label: t('homeDashboard.nowPlayingCompanion.poll.visualHighlight') },
                                        { id: 'soundtrack', label: t('homeDashboard.nowPlayingCompanion.poll.greatSoundtrack') },
                                    ].map((option) => (
                                        <button
                                            key={option.id}
                                            type="button"
                                            onClick={() => votePoll(option.id)}
                                            className={`px-2.5 py-2 rounded-lg border text-xs text-left transition-colors ${
                                                pollChoice === option.id
                                                    ? 'border-sky-400/45 bg-sky-500/20 text-sky-100'
                                                    : 'border-white/15 bg-black/30 text-white/85 hover:bg-black/45'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span>{option.label}</span>
                                                <span className="font-bold">{pollVotes[option.id] || 0}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                                <p className="mt-2 text-[11px] text-white/55">
                                    {t('homeDashboard.nowPlayingCompanion.poll.totalVotes', { total: totalPollVotes })}
                                </p>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-white/5 p-3 flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs text-white/75">
                                    {t('homeDashboard.nowPlayingCompanion.poll.summaryHint')}
                                </p>
                                <button
                                    type="button"
                                    onClick={copyRoomSummary}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20 bg-white/5 text-xs font-bold text-white hover:bg-white/10"
                                >
                                    {t('homeDashboard.nowPlayingCompanion.actions.copySummary')} <ExternalLink className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default NowPlayingCompanionPanel;
