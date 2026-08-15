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

type CompanionToastType = 'success' | 'error';

type Props = {
    session: NowPlayingSession;
    userKey: string;
    mediaServerType?: string;
    onNavigate?: (path: string) => void;
    onToast?: (message: string, type?: CompanionToastType) => void;
    onDisable?: () => void;
};

type Recommendation = {
    id: number;
    mediaType: 'movie' | 'tv';
    title: string;
    year: string;
    posterPath: string | null;
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
                title,
                year: formatYear(item?.release_date || item?.first_air_date || item?.releaseDate || item?.firstAirDate),
                posterPath: item?.poster_path || item?.posterPath || null,
            };
        })
        .filter(Boolean) as Recommendation[]
);

export const NowPlayingCompanionPanel: React.FC<Props> = ({
    session,
    userKey,
    mediaServerType = 'plex',
    onNavigate,
    onToast,
    onDisable,
}) => {
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

    const title = String(payload?.details?.title || payload?.details?.name || session?.title || 'Now playing').trim();
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
                setError('Companion details are not available yet.');
                return;
            }

            const topCast = Array.isArray(details?.credits?.cast) ? details.credits.cast.slice(0, 10) : [];
            const castInsights = await Promise.all(topCast.map(async (actor: any) => {
                const personId = Number(actor?.id);
                const profilePath = actor?.profile_path || actor?.profilePath || null;
                if (!Number.isFinite(personId) || personId <= 0) {
                    return {
                        id: Number(actor?.id || 0),
                        name: String(actor?.name || 'Unknown'),
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
                    name: String(actor?.name || 'Unknown'),
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
            setPayload({
                details,
                recommendations: normalizeRecommendations(recRes?.results || []),
                castInsights,
                soundtrackPeople: extractSoundtrackPeople(Array.isArray(details?.credits?.crew) ? details.credits.crew : []),
                seasonDetails,
            });
        };

        run()
            .catch((fetchError: any) => {
                if (cancelled) return;
                setPayload(null);
                setError(String(fetchError?.message || 'Companion data failed to load.'));
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

        if (releaseDate) facts.push({ label: 'Release', value: releaseDate });
        if (runtime > 0) facts.push({ label: 'Runtime', value: `${runtime} min` });
        else if (avgRuntime > 0) facts.push({ label: 'Episode runtime', value: `${avgRuntime} min` });
        if (genres.length) facts.push({ label: 'Genres', value: genres.join(' / ') });
        if (vote > 0) facts.push({ label: 'TMDB score', value: `${vote.toFixed(1)} / 10` });
        if (status) facts.push({ label: 'Status', value: status });
        if (mediaType === 'tv' && seasonNumber > 0 && episodeNumber > 0) {
            const epName = String(episodeContext.current?.name || session?.episodeTitle || '').trim();
            const epAirDate = String(episodeContext.current?.air_date || '').trim();
            facts.push({
                label: 'Current episode',
                value: `S${seasonNumber}E${episodeNumber}${epName ? ` - ${epName}` : ''}`,
            });
            if (epAirDate) facts.push({ label: 'Episode air date', value: epAirDate });
        }
        return facts;
    }, [episodeContext.current?.air_date, episodeContext.current?.name, episodeNumber, mediaType, payload?.details, seasonNumber, session?.episodeTitle]);

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
            facts.push(`TMDB community score is ${voteAverage.toFixed(1)}/10 from ${voteCount.toLocaleString()} votes.`);
        }
        if (popularity > 0) {
            facts.push(`Current popularity index sits at ${popularity.toFixed(1)} on TMDB trends.`);
        }
        if (mediaType === 'movie' && runtime > 0) {
            facts.push(`Runtime is about ${runtime} minutes.`);
        }
        if (mediaType === 'tv' && episodeRunTime > 0) {
            facts.push(`Typical episode runtime is around ${episodeRunTime} minutes.`);
        }
        if (mediaType === 'tv' && seasonCount > 0) {
            facts.push(`This show currently has ${seasonCount} season${seasonCount === 1 ? '' : 's'} and ${episodeCount > 0 ? episodeCount : 'multiple'} episodes.`);
        }
        if (originCountries.length) {
            facts.push(`Origin country: ${originCountries.join(', ')}.`);
        }
        if (studios.length) {
            facts.push(`Produced by ${studios.slice(0, 2).join(' and ')}${studios.length > 2 ? ` (+${studios.length - 2} more)` : ''}.`);
        }
        if (mediaType === 'movie' && budget > 0) {
            facts.push(`Reported budget is about $${budget.toLocaleString()}.`);
        }
        if (mediaType === 'movie' && revenue > 0) {
            facts.push(`Reported box office revenue is roughly $${revenue.toLocaleString()}.`);
        }
        if (mediaType === 'movie' && budget > 0 && revenue > 0) {
            const ratio = revenue / budget;
            if (Number.isFinite(ratio) && ratio > 1) {
                facts.push(`Estimated return is about ${ratio.toFixed(1)}x the production budget.`);
            }
        }
        if (topCast.length) {
            facts.push(`Top billed: ${topCast.map((person) => person.name).join(', ')}.`);
        }
        if (episodeContext.current?.air_date) {
            facts.push(`Current episode first aired on ${episodeContext.current.air_date}.`);
        }

        return facts.slice(0, 8);
    }, [episodeContext.current?.air_date, mediaType, normalizedDetails, payload?.castInsights]);

    const crewHighlights = useMemo(() => {
        const crew = Array.isArray(payload?.details?.credits?.crew) ? payload.details.credits.crew : [];
        if (!crew.length) return [] as string[];
        const byJob = new Map<string, string>();
        for (const entry of crew) {
            const job = String(entry?.job || '').trim();
            const name = String(entry?.name || '').trim();
            if (!job || !name || byJob.has(job)) continue;
            byJob.set(job, name);
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
        const picked: string[] = [];
        for (const job of preferredJobs) {
            const person = byJob.get(job);
            if (!person) continue;
            picked.push(`${job}: ${person}`);
            if (picked.length >= 6) break;
        }
        if (!picked.length) {
            for (const [job, person] of byJob.entries()) {
                picked.push(`${job}: ${person}`);
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
            onToast?.('Removed from quick watchlist.', 'success');
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
        onToast?.('Saved to quick watchlist on this device.', 'success');
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
                throw new Error('Library link not available');
            }
        } catch (openError: any) {
            onToast?.(String(openError?.message || 'Could not open provider link.'), 'error');
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
        onToast?.('Opened context in Discover details.', 'success');
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
                onToast?.('Watch room summary copied.', 'success');
                return;
            } catch {
                // fall through
            }
        }
        onToast?.('Clipboard unavailable on this client.', 'error');
    };

    const providerLabel = String(mediaServerType || '').toLowerCase() === 'jellyfin'
        ? 'Jellyfin'
        : String(mediaServerType || '').toLowerCase() === 'emby'
            ? 'Emby'
            : 'Plex';
    const playbackTelemetry = [
        { label: 'State', value: String(session.state || 'playing').toUpperCase() },
        { label: 'Progress', value: `${Math.round(Number(session.progress) || 0)}%` },
        { label: 'Media type', value: mediaType.toUpperCase() },
        ...(seasonNumber > 0 && episodeNumber > 0
            ? [{ label: 'Episode', value: `S${seasonNumber}E${episodeNumber}` }]
            : []),
    ];

    return (
        <div className="glass-card mt-4 p-4 md:p-5 border border-emerald-500/25 bg-black/25">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-emerald-200 flex items-center gap-2">
                        <Sparkles className="w-4 h-4" />
                        Second Screen Companion
                    </h3>
                    <p className="text-xs text-white/70 mt-1">
                        Live context for {title}
                        {year ? ` (${year})` : ''} - only on Home hero.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {onDisable ? (
                        <button
                            type="button"
                            onClick={onDisable}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-300/30 bg-amber-500/15 text-xs font-bold text-amber-100 hover:bg-amber-500/25 transition-colors"
                        >
                            Disable companion
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => setOpen((prev) => !prev)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/20 bg-white/5 text-xs font-bold text-white hover:bg-white/10 transition-colors"
                    >
                        {open ? (
                            <>
                                Collapse <ChevronUp className="w-3.5 h-3.5" />
                            </>
                        ) : (
                            <>
                                Expand <ChevronDown className="w-3.5 h-3.5" />
                            </>
                        )}
                    </button>
                </div>
            </div>

            {!open ? null : (
                <div className="mt-4 space-y-4">
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setTab('companion')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                                tab === 'companion'
                                    ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100'
                                    : 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10'
                            }`}
                        >
                            Companion
                        </button>
                        <button
                            type="button"
                            onClick={() => setTab('deep-dive')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                                tab === 'deep-dive'
                                    ? 'border-violet-400/50 bg-violet-500/20 text-violet-100'
                                    : 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10'
                            }`}
                        >
                            Deep Dive
                        </button>
                        <button
                            type="button"
                            onClick={() => setTab('watch-room')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                                tab === 'watch-room'
                                    ? 'border-sky-400/50 bg-sky-500/20 text-sky-100'
                                    : 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10'
                            }`}
                        >
                            Watch Room
                        </button>
                    </div>

                    {!Number.isFinite(tmdbId) || tmdbId <= 0 ? (
                        <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                            TMDB context is unavailable for this active session.
                        </div>
                    ) : loading ? (
                        <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex items-center gap-2 text-sm text-white/80">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading companion context...
                        </div>
                    ) : error ? (
                        <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
                            {error}
                        </div>
                    ) : null}

                    {tab === 'companion' && payload && (
                        <div className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={toggleLocalWatchlist}
                                    className="px-3 py-2 rounded-lg text-xs font-bold border border-white/20 bg-white/5 text-white hover:bg-white/10 transition-colors"
                                >
                                    {savedToWatchlist ? 'Saved to watchlist' : 'Save to watchlist'}
                                </button>
                                <button
                                    type="button"
                                    onClick={openInLibrary}
                                    disabled={openingLibrary}
                                    className="px-3 py-2 rounded-lg text-xs font-bold border border-white/20 bg-white/5 text-white hover:bg-white/10 transition-colors disabled:opacity-60"
                                >
                                    {openingLibrary ? `Opening ${providerLabel}...` : `Open in ${providerLabel}`}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => requestSimilar(payload.recommendations[0] || null)}
                                    disabled={!payload.recommendations[0]}
                                    className="px-3 py-2 rounded-lg text-xs font-bold border border-violet-400/40 bg-violet-500/20 text-violet-100 hover:bg-violet-500/30 transition-colors disabled:opacity-60"
                                >
                                    Request a similar title
                                </button>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {playbackTelemetry.map((entry) => (
                                    <div key={`telemetry-${entry.label}`} className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-2">
                                        <p className="text-[10px] uppercase tracking-wide text-white/50">{entry.label}</p>
                                        <p className="text-xs font-bold text-white">{entry.value}</p>
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
                                <div className="lg:col-span-2 rounded-xl border border-white/10 bg-white/5 p-3">
                                    <p className="text-[11px] uppercase tracking-widest text-white/60 font-bold mb-2 flex items-center gap-1.5">
                                        <Users className="w-3.5 h-3.5" />
                                        Cast intelligence grid
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                                        {payload.castInsights.map((actor) => (
                                            <div key={`cast-${actor.id}`} className="rounded-lg border border-white/10 bg-black/35 p-2.5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-16 h-16 rounded-full overflow-hidden bg-white/5 shrink-0 border border-white/15">
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
                                                            className="text-left text-sm font-bold text-white hover:text-emerald-200 truncate"
                                                        >
                                                            {actor.name}
                                                        </button>
                                                        {actor.character ? (
                                                            <p className="text-[11px] text-white/60 truncate">{actor.character}</p>
                                                        ) : null}
                                                        {actor.popularity > 0 ? (
                                                            <p className="text-[10px] text-emerald-200/80">
                                                                Popularity {actor.popularity.toFixed(1)}
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
                                                                className="px-2 py-1 rounded-md text-[10px] border border-white/15 bg-white/5 text-white/80 hover:bg-white/10 transition-colors"
                                                            >
                                                                {item.title}{item.year ? ` (${item.year})` : ''}
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="mt-2 text-[10px] text-white/45">No known-for links available.</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    {payload.castInsights.length === 0 ? (
                                        <p className="text-xs text-white/55 mt-2">No cast data was returned for this title.</p>
                                    ) : null}
                                    <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5">
                                        <p className="text-[11px] uppercase tracking-widest text-white/60 font-bold">
                                            Crew intelligence
                                        </p>
                                        {crewHighlights.length > 0 ? crewHighlights.map((entry, index) => (
                                            <p key={`crew-${index}`} className="text-xs text-white/80">
                                                - {entry}
                                            </p>
                                        )) : (
                                            <p className="text-xs text-white/55">Crew highlights are unavailable for this title.</p>
                                        )}
                                    </div>
                                </div>

                                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                    <p className="text-[11px] uppercase tracking-widest text-white/60 font-bold mb-2 flex items-center gap-1.5">
                                        <Music2 className="w-3.5 h-3.5" />
                                        Soundtrack cues
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
                                            No soundtrack credits were found for this item.
                                        </p>
                                    )}

                                    <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                                        <p className="text-[11px] uppercase tracking-widest text-white/60 font-bold">
                                            Ratings and links
                                        </p>
                                        <div className="grid grid-cols-2 gap-2">
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

                                    <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5">
                                        <p className="text-[11px] uppercase tracking-widest text-white/60 font-bold">
                                            Fact overload
                                        </p>
                                        <div className="flex flex-wrap gap-1.5 text-[10px]">
                                            <span className="px-1.5 py-0.5 rounded border border-white/15 bg-white/5 text-white/70">
                                                Wiki facts: {Number(factPayload?.sources?.wikipedia) || 0}
                                            </span>
                                            <span className="px-1.5 py-0.5 rounded border border-white/15 bg-white/5 text-white/70">
                                                TMDB facts: {Number(factPayload?.sources?.tmdb) || 0}
                                            </span>
                                            <span className="px-1.5 py-0.5 rounded border border-white/15 bg-white/5 text-white/70">
                                                Total loaded: {overloadFacts.length}
                                            </span>
                                        </div>
                                        {factLoading ? (
                                            <p className="text-xs text-white/55">Loading deep trivia from fact sources...</p>
                                        ) : overloadFacts.length > 0 ? (
                                            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                                                {overloadFacts.map((fact, idx) => (
                                                    <p key={`overload-${idx}`} className="text-xs text-white/80 leading-relaxed">
                                                        - {fact}
                                                    </p>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-white/55">
                                                Fact enrichment is unavailable for this title right now.
                                            </p>
                                        )}
                                    </div>

                                    {mediaType === 'tv' && seasonNumber > 0 ? (
                                        <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                                            <p className="text-[11px] uppercase tracking-widest text-white/60 font-bold flex items-center gap-1.5">
                                                <Clapperboard className="w-3.5 h-3.5" />
                                                Episode context
                                            </p>
                                            <div className="space-y-1 text-xs text-white/80">
                                                <button
                                                    type="button"
                                                    disabled={!episodeContext.previous}
                                                    onClick={() => goToPath(`${basePath}?season=${seasonNumber}&episode=${Number(episodeContext.previous?.episode_number)}`)}
                                                    className="w-full text-left px-2 py-1.5 rounded-md border border-white/10 bg-black/30 hover:bg-black/45 disabled:opacity-50"
                                                >
                                                    Prev: {episodeContext.previous?.name || 'N/A'}
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={!episodeContext.current}
                                                    onClick={() => goToPath(`${basePath}?season=${seasonNumber}&episode=${episodeNumber}`)}
                                                    className="w-full text-left px-2 py-1.5 rounded-md border border-emerald-400/30 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50"
                                                >
                                                    Current: {episodeContext.current?.name || session.episodeTitle || `Episode ${episodeNumber}`}
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={!episodeContext.next}
                                                    onClick={() => goToPath(`${basePath}?season=${seasonNumber}&episode=${Number(episodeContext.next?.episode_number)}`)}
                                                    className="w-full text-left px-2 py-1.5 rounded-md border border-white/10 bg-black/30 hover:bg-black/45 disabled:opacity-50"
                                                >
                                                    Next: {episodeContext.next?.name || 'N/A'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            {payload.recommendations.length > 0 ? (
                                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                    <p className="text-[11px] uppercase tracking-widest text-white/60 font-bold mb-2">
                                        Similar picks
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
                                                        <p className="text-[10px] text-white/55">{item.year || 'Unknown year'}</p>
                                                    </div>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => requestSimilar(item)}
                                                    className="w-full px-2 py-1.5 text-[10px] font-bold border-t border-white/10 text-violet-200 bg-violet-500/15 hover:bg-violet-500/25 transition-colors"
                                                >
                                                    Request
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
                                    Live trivia timeline
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
                                        <p className="text-xs text-white/55">No timeline facts available yet.</p>
                                    ) : null}
                                </div>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                <p className="text-[11px] uppercase tracking-widest text-white/60 font-bold mb-2 flex items-center gap-1.5">
                                    <Clapperboard className="w-3.5 h-3.5" />
                                    Production facts
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
                                        <p className="text-xs text-white/55">No production facts were returned for this title.</p>
                                    )}
                                </div>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                <p className="text-[11px] uppercase tracking-widest text-white/60 font-bold mb-2 flex items-center gap-1.5">
                                    <Link2 className="w-3.5 h-3.5" />
                                    Actor deep-link graph
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
                                            )) : <span className="text-white/55">No linked credits</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                <p className="text-[11px] uppercase tracking-widest text-white/60 font-bold mb-2 flex items-center gap-1.5">
                                    <MessageSquareQuote className="w-3.5 h-3.5" />
                                    Subtitle quote context
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
                                        <p className="text-xs text-white/55">No contextual lines available.</p>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    )}

                    {tab === 'watch-room' && payload && (
                        <div className="space-y-3">
                            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                <p className="text-[11px] uppercase tracking-widest text-white/60 font-bold mb-2">
                                    Shared reactions
                                </p>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => bumpReaction('like')}
                                        className="px-2.5 py-2 rounded-lg border border-white/15 bg-black/30 hover:bg-black/45 text-xs text-white/85 flex items-center justify-between"
                                    >
                                        <span className="inline-flex items-center gap-1.5"><ThumbsUp className="w-3.5 h-3.5" /> Like</span>
                                        <span className="font-bold">{reactions.like || 0}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => bumpReaction('fire')}
                                        className="px-2.5 py-2 rounded-lg border border-white/15 bg-black/30 hover:bg-black/45 text-xs text-white/85 flex items-center justify-between"
                                    >
                                        <span className="inline-flex items-center gap-1.5"><Flame className="w-3.5 h-3.5" /> Fire</span>
                                        <span className="font-bold">{reactions.fire || 0}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => bumpReaction('laugh')}
                                        className="px-2.5 py-2 rounded-lg border border-white/15 bg-black/30 hover:bg-black/45 text-xs text-white/85 flex items-center justify-between"
                                    >
                                        <span className="inline-flex items-center gap-1.5"><Laugh className="w-3.5 h-3.5" /> Laugh</span>
                                        <span className="font-bold">{reactions.laugh || 0}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => bumpReaction('wow')}
                                        className="px-2.5 py-2 rounded-lg border border-white/15 bg-black/30 hover:bg-black/45 text-xs text-white/85 flex items-center justify-between"
                                    >
                                        <span className="inline-flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Wow</span>
                                        <span className="font-bold">{reactions.wow || 0}</span>
                                    </button>
                                </div>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                <p className="text-[11px] uppercase tracking-widest text-white/60 font-bold mb-2">
                                    Quick poll
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {[
                                        { id: 'pacing', label: 'Best pacing' },
                                        { id: 'acting', label: 'Strong acting' },
                                        { id: 'visuals', label: 'Visual highlight' },
                                        { id: 'soundtrack', label: 'Great soundtrack' },
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
                                    Total votes: {totalPollVotes}
                                </p>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-white/5 p-3 flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs text-white/75">
                                    Copy a quick room summary to share context with friends.
                                </p>
                                <button
                                    type="button"
                                    onClick={copyRoomSummary}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20 bg-white/5 text-xs font-bold text-white hover:bg-white/10"
                                >
                                    Copy summary <ExternalLink className="w-3.5 h-3.5" />
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
