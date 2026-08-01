import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown, ChevronUp, ClipboardList, Film, Music, Sparkles } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { DiscoverPosterCard } from '../screens';
import { Carousel } from './Carousel';
import { CompanyCard, GenreCard } from './DiscoverCards';
import {
    DISCOVER_NETWORKS,
    DISCOVER_STUDIOS,
    MOVIE_GENRES,
    TV_GENRES,
    buildGenreSliderImage,
} from './discoverConstants';
import { enrichDiscoveryItems, normalizeRawDiscoveryItem } from './discoverItemUtils';
import { portalRequestsToDiscoveryRowItems } from './myRequestUtils';
import { filterHiddenAvailableItems, useDiscoveryPreferences } from './useDiscoveryPreferences';
import { useDiscoveryMe } from './useDiscoveryMe';
import { fetchDiscoverHomeRowResults } from './discoverFetchUtils';
import { enrichDiscoverItemsWithAvailability } from './discoverAvailabilityEnrich';
import { WatchlistPanel } from './WatchlistPanel';
import { DiscoverHomeSkeleton } from '../shared/skeletons';
import { discoveryTheme } from './discoveryThemeClasses';
import { useLibraryQueueToggle } from './useLibraryQueueToggle';
import { DiscoverGridSizeSelect } from './DiscoverGridSizeSelect';
import { useDiscoverGridSize } from './useDiscoverGridSize';
import { discoverRowCardWidthClass } from '../shared/portalLayout';
import { useDiscoverI18n } from './i18n';

type GenreSliderItem = { id: number; name: string; image?: string; backdrops?: string[] };

const mapGenreSliderResponse = (payload: any): GenreSliderItem[] => {
    const list = Array.isArray(payload) ? payload : (Array.isArray(payload?.results) ? payload.results : []);
    return list
        .map((genre: any) => {
            const id = Number(genre?.id);
            const name = String(genre?.name || '').trim();
            if (!Number.isFinite(id) || !name) return null;
            const backdrops = genre?.backdrops || genre?.backdropPaths || genre?.backdrop_paths || [];
            return {
                id,
                name,
                image: genre?.image || buildGenreSliderImage(id, backdrops),
            };
        })
        .filter(Boolean) as GenreSliderItem[];
};

const EmptyRail: React.FC<{
    title: string;
    body: string;
    actionLabel: string;
    onAction: () => void;
    icon: React.ReactNode;
}> = ({ title, body, actionLabel, onAction, icon }) => (
    <div className={`${discoveryTheme.emptyState} !py-8 px-4 flex flex-col items-center gap-3`}>
        <div className="w-10 h-10 rounded-full bg-plex/15 text-plex flex items-center justify-center">
            {icon}
        </div>
        <div>
            <p className={discoveryTheme.emptyTitle}>{title}</p>
            <p className={discoveryTheme.emptyBody}>{body}</p>
        </div>
        <button
            type="button"
            onClick={onAction}
            className="mt-1 px-4 py-2 rounded-lg bg-plex text-black text-xs font-black hover:bg-plex-hover transition-colors"
        >
            {actionLabel}
        </button>
    </div>
);

/** Stable row component — must live outside DiscoverHome or every setState remounts posters. */
const DiscoverHomeRow: React.FC<{
    title: string;
    items: any[];
    posterCardClass: string;
    viewAllLabel: string;
    formatItem: (item: any) => any;
    onSelect: (item: any) => void;
    onViewAll?: () => void;
    empty?: React.ReactNode;
    animateEnter?: boolean;
}> = ({
    title,
    items,
    posterCardClass,
    viewAllLabel,
    formatItem,
    onSelect,
    onViewAll,
    empty,
    animateEnter = false,
}) => {
    if (!items?.length) {
        if (!empty) return null;
        return (
            <div className="flex flex-col gap-2 relative">
                <div className="flex items-center gap-3 min-w-0 px-2 pr-16">
                    <h2 className={`${discoveryTheme.sectionTitle} truncate`}>{title}</h2>
                    {onViewAll && (
                        <button type="button" onClick={onViewAll} className="shrink-0 text-xs font-bold text-plex hover:underline">
                            {viewAllLabel}
                        </button>
                    )}
                </div>
                {empty}
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-2 relative">
            <div className="flex items-center gap-3 min-w-0 px-2 pr-16">
                <h2 className={`${discoveryTheme.sectionTitle} truncate`}>{title}</h2>
                {onViewAll && (
                    <button type="button" onClick={onViewAll} className="shrink-0 text-xs font-bold text-plex hover:underline">
                        {viewAllLabel}
                    </button>
                )}
            </div>
            <Carousel>
                {items.map((rawItem, idx) => {
                    if (!rawItem) return null;
                    const formatted = formatItem(rawItem);
                    return (
                        <div
                            key={`${title}-${formatted.id || idx}`}
                            className={`${posterCardClass} flex-shrink-0 relative group${animateEnter ? ' discover-poster-enter' : ''}`}
                            style={animateEnter ? { animationDelay: `${Math.min(idx, 12) * 30}ms` } : undefined}
                        >
                            <DiscoverPosterCard
                                item={formatted}
                                overlay={formatted.overlay}
                                showQualityBadges={false}
                                onPosterClick={() => onSelect(formatted)}
                            />
                        </div>
                    );
                })}
            </Carousel>
        </div>
    );
};

const DiscoverGenreSliderRow: React.FC<{
    title: string;
    apiGenres: GenreSliderItem[];
    fallbackGenres: typeof MOVIE_GENRES;
    basePath: '/discovery/movies' | '/discovery/series';
    navigate: (path: string) => void;
}> = ({ title, apiGenres, fallbackGenres, basePath, navigate }) => {
    const items = (apiGenres?.length ?? 0)
        ? apiGenres
        : fallbackGenres.map((g) => ({
            id: g.id,
            name: g.name,
            image: buildGenreSliderImage(g.id),
        }));

    return (
        <div className="flex flex-col gap-2 relative">
            <h2 className={`${discoveryTheme.sectionTitle} px-2 pr-16`}>{title}</h2>
            <Carousel>
                {items.map((g) => {
                    const fallback = fallbackGenres.find((fg) => fg.id === g.id);
                    return (
                        <GenreCard
                            key={g.id}
                            name={g.name}
                            image={g.image}
                            gradient={fallback?.gradient}
                            onClick={() => navigate(`${basePath}?genre=${g.id}`)}
                        />
                    );
                })}
            </Carousel>
        </div>
    );
};

export const DiscoverHome: React.FC<{
    onSelect: (item: any) => void;
    formatItem: (item: any) => any;
    navigate: (path: string) => void;
    pushToast?: (msg: string, type: 'success' | 'error') => void;
    providerLabel?: string;
}> = ({ onSelect, formatItem, navigate, pushToast, providerLabel = 'Plex' }) => {
    const { t, locale } = useDiscoverI18n();
    const { preferences, loaded } = useDiscoveryPreferences();
    const { profile: discoveryMe } = useDiscoveryMe(loaded);
    const musicEnabled = discoveryMe.musicConfigured !== false && discoveryMe.permissions?.requestMusic !== false;
    const { showLibraryQueue, toggleLibraryQueue } = useLibraryQueueToggle();
    const [gridSize, setGridSize] = useDiscoverGridSize();
    const posterCardClass = discoverRowCardWidthClass(gridSize);
    const [rows, setRows] = useState({
        recentlyAdded: [] as any[],
        recentRequests: [] as any[],
        plexWatchlist: [] as any[],
        becauseYouWatched: [] as any[],
        becauseYouWatchedSeed: null as { mediaType: string; tmdbId: number; title?: string | null } | null,
        recentMusic: [] as any[],
        trending: [] as any[],
        popularMovies: [] as any[],
        upcomingMovies: [] as any[],
        popularSeries: [] as any[],
        upcomingSeries: [] as any[],
    });
    const [movieGenres, setMovieGenres] = useState<GenreSliderItem[]>(() => (
        MOVIE_GENRES.map((g) => ({ id: g.id, name: g.name, image: buildGenreSliderImage(g.id) }))
    ));
    const [tvGenres, setTvGenres] = useState<GenreSliderItem[]>(() => (
        TV_GENRES.map((g) => ({ id: g.id, name: g.name, image: buildGenreSliderImage(g.id) }))
    ));
    const [loading, setLoading] = useState(true);
    const loadGenRef = useRef(0);
    const hasPaintedRef = useRef(false);
    const [enterAnim, setEnterAnim] = useState(true);

    const loadData = useCallback(async () => {
        if (!loaded) return;
        const gen = ++loadGenRef.current;
        const paintAbort = new AbortController();
        const paintTimer = window.setTimeout(() => paintAbort.abort(), 10000);
        // Avoid skeleton ↔ content flicker on preference/locale refreshes after first paint.
        if (!hasPaintedRef.current) setLoading(true);
        try {
            const hideAvailable = preferences.hideAvailableMedia;
            // Seerr-style: one endpoint per rail; advance same URL pages only (no multi-source storm).
            const rowOpts = {
                needsBackfill: hideAvailable,
                maxPages: hideAvailable ? 4 : 2,
                maxItems: 30,
                minItems: hideAvailable ? 20 : 30,
                hideRequested: false,
                trustAttachedAvailability: true,
                pageConcurrency: 1,
                requirePoster: true,
                signal: paintAbort.signal,
            };
            const trendingUrl = (page: number) => `/api/discovery/proxy/discover/trending?page=${page}`;
            const moviesUrl = (page: number) => `/api/discovery/proxy/discover/movies?sortBy=popularity.desc&page=${page}`;
            const upcomingMoviesUrl = (page: number) => `/api/discovery/proxy/discover/movies/upcoming?page=${page}`;
            const seriesUrl = (page: number) => `/api/discovery/proxy/discover/tv?sortBy=popularity.desc&page=${page}`;
            const upcomingSeriesUrl = (page: number) => `/api/discovery/proxy/discover/tv/upcoming?page=${page}`;

            const [
                trendingRes,
                popularMovies,
                upcomingMovies,
                popularSeries,
                upcomingSeries,
            ] = await Promise.all([
                fetchDiscoverHomeRowResults(trendingUrl, hideAvailable, rowOpts).catch(() => []),
                fetchDiscoverHomeRowResults(moviesUrl, hideAvailable, rowOpts).catch(() => []),
                fetchDiscoverHomeRowResults(upcomingMoviesUrl, hideAvailable, rowOpts).catch(() => []),
                fetchDiscoverHomeRowResults(seriesUrl, hideAvailable, rowOpts).catch(() => []),
                fetchDiscoverHomeRowResults(upcomingSeriesUrl, hideAvailable, rowOpts).catch(() => []),
            ]);

            if (gen !== loadGenRef.current) return;

            setRows((prev) => ({
                ...prev,
                recentlyAdded: [],
                recentRequests: [],
                plexWatchlist: [],
                becauseYouWatched: [],
                becauseYouWatchedSeed: null,
                recentMusic: [],
                trending: filterHiddenAvailableItems(trendingRes, hideAvailable),
                popularMovies: filterHiddenAvailableItems(popularMovies, hideAvailable),
                upcomingMovies: filterHiddenAvailableItems(upcomingMovies, hideAvailable),
                popularSeries: filterHiddenAvailableItems(popularSeries, hideAvailable),
                upcomingSeries: filterHiddenAvailableItems(upcomingSeries, hideAvailable),
            }));
            hasPaintedRef.current = true;
            setLoading(false);
            // Stagger enter only on the first successful paint.
            window.setTimeout(() => setEnterAnim(false), 700);

            // Side rails + poster enrich after first paint (never block the skeleton).
            void (async () => {
                try {
                    if (gen !== loadGenRef.current) return;
                    const [addedRes, reqRes, watchlistRes, becauseRes, musicRes] = await Promise.all([
                        (hideAvailable || preferences.showRecentlyAdded === false)
                            ? Promise.resolve(null)
                            : apiFetch('/api/discovery/proxy/media?filter=allavailable&take=40&sort=mediaAdded').catch(() => null),
                        apiFetch('/api/discovery/my-requests?filter=all&take=40').catch(() => null),
                        preferences.showWatchlist === false
                            ? Promise.resolve(null)
                            : apiFetch('/api/discovery/watchlist').catch(() => null),
                        apiFetch('/api/discovery/because-you-watched').catch(() => null),
                        musicEnabled
                            ? apiFetch('/api/discovery/music/recent?limit=24').catch(() => null)
                            : Promise.resolve(null),
                    ]);

                    if (gen !== loadGenRef.current) return;

                    const myRequestItems = Array.isArray(reqRes?.results)
                        ? portalRequestsToDiscoveryRowItems(reqRes.results)
                        : [];

                    // Normalize library/requests; enrich watchlist posters + availability (Request vs Available).
                    const recentlyAdded = (addedRes?.results || []).map(normalizeRawDiscoveryItem);
                    const recentRequests = await enrichDiscoveryItems(myRequestItems);
                    const watchlistPosters = await enrichDiscoveryItems(watchlistRes?.results || []);
                    const plexWatchlist = await enrichDiscoverItemsWithAvailability(watchlistPosters);
                    const becauseItems = await enrichDiscoverItemsWithAvailability(becauseRes?.results || []);
                    const recentMusic = await enrichDiscoverItemsWithAvailability(musicRes?.results || []);

                    if (gen !== loadGenRef.current) return;
                    setRows((prev) => ({
                        ...prev,
                        recentlyAdded,
                        recentRequests: filterHiddenAvailableItems(recentRequests, hideAvailable),
                        plexWatchlist,
                        becauseYouWatched: filterHiddenAvailableItems(becauseItems, hideAvailable),
                        becauseYouWatchedSeed: becauseRes?.seed || null,
                        recentMusic: recentMusic,
                    }));
                } catch {
                    // Side rails are best-effort.
                }
            })();

            // Genre sliders after rows are visible (best-effort, no per-genre fan-out).
            void (async () => {
                try {
                    if (gen !== loadGenRef.current) return;
                    const [movieGenreRes, tvGenreRes] = await Promise.all([
                        apiFetch('/api/discovery/proxy/discover/genreslider/movie').catch(() => null),
                        apiFetch('/api/discovery/proxy/discover/genreslider/tv').catch(() => null),
                    ]);
                    if (gen !== loadGenRef.current) return;
                    const mappedMovies = mapGenreSliderResponse(movieGenreRes);
                    const mappedTv = mapGenreSliderResponse(tvGenreRes);
                    setMovieGenres(mappedMovies.length
                        ? mappedMovies.map((g) => ({ ...g, image: g.image || buildGenreSliderImage(g.id) }))
                        : MOVIE_GENRES.map((g) => ({ id: g.id, name: g.name, image: buildGenreSliderImage(g.id) })));
                    setTvGenres(mappedTv.length
                        ? mappedTv.map((g) => ({ ...g, image: g.image || buildGenreSliderImage(g.id) }))
                        : TV_GENRES.map((g) => ({ id: g.id, name: g.name, image: buildGenreSliderImage(g.id) })));
                } catch {
                    if (gen !== loadGenRef.current) return;
                    setMovieGenres(MOVIE_GENRES.map((g) => ({ id: g.id, name: g.name, image: buildGenreSliderImage(g.id) })));
                    setTvGenres(TV_GENRES.map((g) => ({ id: g.id, name: g.name, image: buildGenreSliderImage(g.id) })));
                }
            })();
        } catch (e) {
            console.error(e);
            if (gen === loadGenRef.current) setLoading(false);
        } finally {
            window.clearTimeout(paintTimer);
            if (gen === loadGenRef.current) setLoading(false);
        }
    }, [loaded, musicEnabled, preferences.hideAvailableMedia, preferences.discoverRegion, preferences.discoverLanguage, preferences.showRecentlyAdded, preferences.showWatchlist, locale]);

    useEffect(() => {
        loadData();
        return () => {
            loadGenRef.current += 1;
        };
    }, [loadData]);

    if (loading) {
        return (
            <div aria-busy="true">
                <DiscoverHomeSkeleton />
            </div>
        );
    }

    return (
        <div className={`flex flex-col gap-6 w-full max-w-full overflow-hidden pb-8 px-1${enterAnim ? ' discover-content-enter' : ''}`}>
            <section className={discoveryTheme.personalPanel}>
                <div className="px-1 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className={discoveryTheme.personalEyebrow}>{t('home.forYou')}</p>
                        <h2 className="text-lg sm:text-xl font-black text-text mt-1">{t('home.libraryQueue')}</h2>
                        {showLibraryQueue && (
                            <p className="text-sm text-muted mt-1">{t('home.libraryQueueHint')}</p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={toggleLibraryQueue}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white/5 hover:bg-white/10 text-xs font-bold text-muted hover:text-text transition-colors"
                        aria-expanded={showLibraryQueue}
                        aria-controls="discover-library-queue"
                        title={showLibraryQueue ? t('home.hideLibraryQueue') : t('home.showLibraryQueue')}
                    >
                        {showLibraryQueue ? t('common.hide') : t('common.show')}
                        {showLibraryQueue ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                </div>

                {showLibraryQueue && (
                    <div id="discover-library-queue" className="flex flex-col gap-5">
                        <DiscoverHomeRow
                            title={t('home.yourRequests')}
                            items={rows.recentRequests}
                            posterCardClass={posterCardClass}
                            viewAllLabel={t('common.viewAll')}
                            formatItem={formatItem}
                            onSelect={onSelect}
                            animateEnter={enterAnim}
                            onViewAll={() => navigate('/discovery/requests')}
                            empty={(
                                <EmptyRail
                                    title={t('home.noRequestsTitle')}
                                    body={t('home.noRequestsBody')}
                                    actionLabel={t('home.browseMovies')}
                                    onAction={() => navigate('/discovery/movies')}
                                    icon={<ClipboardList className="w-5 h-5" />}
                                />
                            )}
                        />

                        {preferences.showWatchlist !== false && (rows.plexWatchlist?.length ?? 0) > 0 ? (
                            <WatchlistPanel
                                items={rows.plexWatchlist}
                                formatItem={formatItem}
                                onSelect={onSelect}
                                navigate={navigate}
                                pushToast={pushToast}
                                onRefresh={loadData}
                                variant="row"
                                providerLabel={providerLabel}
                                rowCardClassName={posterCardClass}
                            />
                        ) : preferences.showWatchlist !== false ? (
                            <div className="flex flex-col gap-2">
                                <h2 className={`${discoveryTheme.sectionTitle} px-2`}>{t('watchlist.title', { provider: providerLabel })}</h2>
                                <EmptyRail
                                    title={t('home.watchlistEmptyTitle')}
                                    body={t('home.watchlistEmptyBody', { provider: providerLabel })}
                                    actionLabel={t('home.seeTrending')}
                                    onAction={() => {
                                        document.getElementById('discover-trending')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    }}
                                    icon={<Sparkles className="w-5 h-5" />}
                                />
                            </div>
                        ) : null}

                        {rows.becauseYouWatchedSeed && (
                            <DiscoverHomeRow
                                title={t('home.becauseYouWatched', {
                                    title: rows.becauseYouWatchedSeed.title || t('mediaType.tvShow'),
                                })}
                                items={rows.becauseYouWatched || []}
                                posterCardClass={posterCardClass}
                                viewAllLabel={t('common.viewAll')}
                                formatItem={formatItem}
                                onSelect={onSelect}
                                animateEnter={enterAnim}
                            />
                        )}

                        {(rows.recentMusic?.length ?? 0) > 0 && musicEnabled && (
                            <DiscoverHomeRow
                                title={t('home.recentMusic')}
                                items={rows.recentMusic}
                                posterCardClass={posterCardClass}
                                viewAllLabel={t('common.viewAll')}
                                formatItem={formatItem}
                                onSelect={onSelect}
                                animateEnter={enterAnim}
                                onViewAll={() => navigate('/discovery/music')}
                            />
                        )}
                        {(rows.recentMusic?.length ?? 0) === 0 && musicEnabled && (
                            <DiscoverHomeRow
                                title={t('home.recentMusic')}
                                items={[]}
                                posterCardClass={posterCardClass}
                                viewAllLabel={t('common.viewAll')}
                                formatItem={formatItem}
                                onSelect={onSelect}
                                animateEnter={enterAnim}
                                onViewAll={() => navigate('/discovery/music')}
                                empty={(
                                    <EmptyRail
                                        title={t('home.recentMusicEmptyTitle')}
                                        body={t('home.recentMusicEmptyBody')}
                                        actionLabel={t('home.browseMusic')}
                                        onAction={() => navigate('/discovery/music')}
                                        icon={<Music className="w-5 h-5" />}
                                    />
                                )}
                            />
                        )}
                    </div>
                )}
            </section>

            <section className={discoveryTheme.browseSection}>
                <div className="px-3 flex items-end justify-between gap-3 flex-wrap">
                    <div>
                        <p className={discoveryTheme.personalEyebrow}>{t('home.browse')}</p>
                        <h2 className="text-lg sm:text-xl font-black text-text mt-1">{t('home.whatsPopular')}</h2>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3">
                        <DiscoverGridSizeSelect value={gridSize} onChange={setGridSize} />
                        <button
                            type="button"
                            onClick={() => navigate('/discovery/movies')}
                            className="text-xs font-bold text-plex hover:underline inline-flex items-center gap-1"
                        >
                            <Film className="w-3.5 h-3.5" /> {t('home.allMovies')}
                        </button>
                    </div>
                </div>

                {preferences.showRecentlyAdded !== false && (
                    <DiscoverHomeRow
                        title={t('home.recentlyAdded')}
                        items={rows.recentlyAdded}
                        posterCardClass={posterCardClass}
                        viewAllLabel={t('common.viewAll')}
                        formatItem={formatItem}
                        onSelect={onSelect}
                        animateEnter={enterAnim}
                    />
                )}
                <div id="discover-trending">
                    <DiscoverHomeRow
                        title={t('home.trending')}
                        items={rows.trending}
                        posterCardClass={posterCardClass}
                        viewAllLabel={t('common.viewAll')}
                        formatItem={formatItem}
                        onSelect={onSelect}
                        animateEnter={enterAnim}
                    />
                </div>
                <DiscoverHomeRow
                    title={t('home.popularMovies')}
                    items={rows.popularMovies}
                    posterCardClass={posterCardClass}
                    viewAllLabel={t('common.viewAll')}
                    formatItem={formatItem}
                    onSelect={onSelect}
                    animateEnter={enterAnim}
                    onViewAll={() => navigate('/discovery/movies')}
                />
                <DiscoverGenreSliderRow
                    title={t('home.movieGenres')}
                    apiGenres={movieGenres}
                    fallbackGenres={MOVIE_GENRES}
                    basePath="/discovery/movies"
                    navigate={navigate}
                />
                <DiscoverHomeRow
                    title={t('home.upcomingMovies')}
                    items={rows.upcomingMovies}
                    posterCardClass={posterCardClass}
                    viewAllLabel={t('common.viewAll')}
                    formatItem={formatItem}
                    onSelect={onSelect}
                    animateEnter={enterAnim}
                />

                <div className="flex flex-col gap-2 relative rounded-2xl border border-border/60 bg-white/[0.02] p-3 sm:p-4">
                    <h2 className={`${discoveryTheme.sectionTitle} px-1 pr-16`}>{t('home.studios')}</h2>
                    <Carousel>
                        {DISCOVER_STUDIOS.map((studio) => (
                            <CompanyCard
                                key={studio.id}
                                name={studio.name}
                                logoPath={studio.logoPath}
                                onClick={() => navigate(`/discovery/movies/studio/${studio.id}`)}
                            />
                        ))}
                    </Carousel>
                </div>

                <DiscoverHomeRow
                    title={t('home.popularSeries')}
                    items={rows.popularSeries}
                    posterCardClass={posterCardClass}
                    viewAllLabel={t('common.viewAll')}
                    formatItem={formatItem}
                    onSelect={onSelect}
                    animateEnter={enterAnim}
                    onViewAll={() => navigate('/discovery/series')}
                />
                <DiscoverGenreSliderRow
                    title={t('home.seriesGenres')}
                    apiGenres={tvGenres}
                    fallbackGenres={TV_GENRES}
                    basePath="/discovery/series"
                    navigate={navigate}
                />
                <DiscoverHomeRow
                    title={t('home.upcomingSeries')}
                    items={rows.upcomingSeries}
                    posterCardClass={posterCardClass}
                    viewAllLabel={t('common.viewAll')}
                    formatItem={formatItem}
                    onSelect={onSelect}
                    animateEnter={enterAnim}
                />

                <div className="flex flex-col gap-2 relative rounded-2xl border border-border/60 bg-white/[0.02] p-3 sm:p-4">
                    <h2 className={`${discoveryTheme.sectionTitle} px-1 pr-16`}>{t('home.networks')}</h2>
                    <Carousel>
                        {DISCOVER_NETWORKS.map((network) => (
                            <CompanyCard
                                key={`${network.id}-${network.name}`}
                                name={network.name}
                                logoPath={network.logoPath}
                                onClick={() => navigate(`/discovery/series/network/${network.id}`)}
                            />
                        ))}
                    </Carousel>
                </div>

                {musicEnabled && (
                <div className="flex flex-col gap-2 relative mt-2">
                    <div className="px-3 flex items-end justify-between gap-3 flex-wrap">
                        <div>
                            <p className={discoveryTheme.personalEyebrow}>{t('home.musicSection')}</p>
                            <h2 className="text-lg sm:text-xl font-black text-text mt-1">{t('home.recentMusic')}</h2>
                        </div>
                        <button
                            type="button"
                            onClick={() => navigate('/discovery/music')}
                            className="text-xs font-bold text-plex hover:underline inline-flex items-center gap-1"
                        >
                            <Music className="w-3.5 h-3.5" /> {t('home.allMusic')}
                        </button>
                    </div>
                    <DiscoverHomeRow
                        title={t('home.recentMusic')}
                        items={rows.recentMusic || []}
                        posterCardClass={posterCardClass}
                        viewAllLabel={t('common.viewAll')}
                        formatItem={formatItem}
                        onSelect={onSelect}
                        animateEnter={enterAnim}
                        onViewAll={() => navigate('/discovery/music')}
                        empty={(
                            <EmptyRail
                                title={t('home.recentMusicEmptyTitle')}
                                body={t('home.recentMusicEmptyBody')}
                                actionLabel={t('home.browseMusic')}
                                onAction={() => navigate('/discovery/music')}
                                icon={<Music className="w-5 h-5" />}
                            />
                        )}
                    />
                </div>
                )}
            </section>
        </div>
    );
};
