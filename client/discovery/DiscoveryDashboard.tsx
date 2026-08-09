import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DiscoverHeroHeader } from './DiscoverHeroHeader';
import { DiscoverAchievementsTeaser } from './DiscoverAchievementsTeaser';
import { DiscoverHome } from './DiscoverHome';
import { DiscoverMovies } from './DiscoverMovies';
import { DiscoverSeries } from './DiscoverSeries';
import { DiscoverCategoryPage } from './DiscoverCategoryPage';
import { MediaDetailsPage } from './MediaDetailsPage';
import { PersonDetailsPage } from './PersonDetailsPage';
import { Film, Tv, Compass, ClipboardList, AlertTriangle, ChevronDown, Music } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { portalUrl, stripBasePath } from '../shared/basePath';
import { normalizeRawDiscoveryItem } from './discoverItemUtils';
import { resolveMediaAvailabilityState } from './discoverAvailability';
import { DiscoverStatusOverlay } from './DiscoverStatusOverlay';
import { MyRequestsPage } from './MyRequestsPage';
import { MyIssuesPage } from './MyIssuesPage';
import { useMyRequestCount } from './useMyRequestCount';
import { useMyIssueCount } from './useMyIssueCount';
import { useDiscoveryMe } from './useDiscoveryMe';
import { WatchlistPage } from './WatchlistPage';
import { DiscoverMusic } from './DiscoverMusic';
import { MusicArtistPage } from './MusicArtistPage';
import { scrollPortalToTop, stashDiscoverDetailSeed } from './discoverNavigationUtils';
import { resolveTmdbImageUrl } from './tmdbImageUrl';
import { useDiscoverI18n } from './i18n';
import { discoveryTheme } from './discoveryThemeClasses';
import { ToastContainer, pushToast as appendToast, type ToastMessage } from '../shared/toast';

const DiscoveryDashboardInner: React.FC<{
    onItemClick: (item: any) => void;
    pushToast?: (msg: string, type: 'success' | 'error') => void;
    mediaServerType?: string;
    isAdmin?: boolean;
}> = ({ pushToast, mediaServerType = 'plex', isAdmin = false }) => {
    const { t, locale } = useDiscoverI18n();
    const [path, setPath] = useState(() => {
        if (typeof window !== 'undefined') return window.location.pathname;
        return '/discovery';
    });

    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchRetryToken, setSearchRetryToken] = useState(0);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const searchAbortRef = useRef<AbortController | null>(null);
    const searchSeqRef = useRef(0);
    const { pendingCount: myPendingCount, refresh: refreshMyRequestCount } = useMyRequestCount(true);
    const { openCount: myOpenIssueCount, refresh: refreshMyIssueCount } = useMyIssueCount(true);
    const { profile: discoveryMe } = useDiscoveryMe(true);
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
    const providerLabel = String(mediaServerType || 'plex').toLowerCase() === 'jellyfin'
        ? 'Jellyfin'
        : String(mediaServerType || 'plex').toLowerCase() === 'emby'
            ? 'Emby'
            : 'Plex';

    const refreshPath = useCallback(() => {
        setPath(window.location.pathname);
    }, []);

    useEffect(() => {
        const handlePopState = () => refreshPath();
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [refreshPath]);

    useEffect(() => {
        scrollPortalToTop();
    }, [path]);

    const navigate = useCallback((newPath: string) => {
        const [pathname, ...rest] = newPath.split('?');
        const search = rest.length ? `?${rest.join('?')}` : '';
        const target = `${portalUrl(pathname)}${search}`;
        window.history.pushState({}, '', target);
        setPath(window.location.pathname);
        setSearchOpen(false);
        scrollPortalToTop();
        window.dispatchEvent(new Event('portal-discovery-navigate'));
    }, []);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
            const target = event.target as HTMLElement | null;
            const tag = target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
            event.preventDefault();
            searchInputRef.current?.focus();
            searchInputRef.current?.select();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    useEffect(() => {
        const q = query.trim();
        if (q.length < 2) {
            searchAbortRef.current?.abort();
            searchAbortRef.current = null;
            setSearchResults([]);
            setSearchError(null);
            setSearchLoading(false);
            return undefined;
        }

        const timer = window.setTimeout(async () => {
            searchAbortRef.current?.abort();
            const controller = new AbortController();
            searchAbortRef.current = controller;
            const seq = ++searchSeqRef.current;
            let timedOut = false;
            // Hard cap so a hung API never leaves the hero stuck on "Searching…"
            const timeoutId = window.setTimeout(() => {
                timedOut = true;
                controller.abort();
            }, 12000);

            setSearchLoading(true);
            setSearchError(null);
            setSearchOpen(true);

            try {
                const res = await apiFetch(
                    `/api/discovery/search?query=${encodeURIComponent(q)}`,
                    { signal: controller.signal },
                );
                if (seq !== searchSeqRef.current) return;
                setSearchResults(Array.isArray(res?.results) ? res.results : []);
                setSearchError(null);
            } catch (e: any) {
                if (seq !== searchSeqRef.current) return;
                const aborted = controller.signal.aborted
                    || e?.name === 'AbortError'
                    || /aborted/i.test(String(e?.message || ''));
                if (aborted && !timedOut) return; // superseded by a newer query
                console.error(e);
                setSearchResults([]);
                setSearchError(e?.message || t('common.searchFailed'));
            } finally {
                window.clearTimeout(timeoutId);
                if (seq === searchSeqRef.current) setSearchLoading(false);
            }
        }, 300);

        return () => {
            window.clearTimeout(timer);
        };
    }, [query, locale, searchRetryToken, t]);

    const formatItem = (rawItem: any) => {
        const item = normalizeRawDiscoveryItem(rawItem);
        const isPerson = item.mediaType === 'person';
        const isMusic = item.mediaType === 'music';
        const isMovie = item.mediaType === 'movie';
        const title = isPerson ? item.name : (isMovie ? (item.title || item.name) : (item.name || item.title));
        const year = (item.releaseDate || item.firstAirDate || '').substring(0, 4);
        const posterUrl = isMusic
            ? (item.posterPath || item.posterUrl || null)
            : resolveTmdbImageUrl(item.posterPath, 'w342');
        const profileUrl = resolveTmdbImageUrl(item.profilePath, 'w185');
        const overview = item.overview;
        const mediaType = isPerson ? 'person' : (isMusic ? 'music' : (isMovie ? 'movie' : 'tv'));

        const availability = resolveMediaAvailabilityState(item);
        const overlay = !isPerson && availability.kind !== 'none'
            ? <DiscoverStatusOverlay state={availability} />
            : null;

        return {
            ...item,
            id: item.tmdbId || item.mbid || item.id,
            mediaType,
            title,
            year,
            thumbUrl: isPerson ? profileUrl : (posterUrl || null),
            overview,
            type: mediaType,
            tags: [isPerson ? t('mediaType.person') : (isMusic ? t('mediaType.music') : (isMovie ? t('mediaType.movie') : t('mediaType.tvShow')))],
            status: item.mediaInfo?.status,
            availability,
            isAvailable: availability.kind === 'available',
            isPartial: availability.kind === 'partial',
            isPending: availability.kind === 'pending' || availability.kind === 'processing',
            overlay,
        };
    };

    const heroProps = {
        query,
        searchOpen,
        searchLoading,
        searchError,
        searchResults,
        onClose: () => setSearchOpen(false),
        onClear: () => {
            searchAbortRef.current?.abort();
            setQuery('');
            setSearchOpen(false);
            setSearchResults([]);
            setSearchError(null);
        },
        onQueryChange: setQuery,
        onFocus: () => query.trim().length >= 2 && setSearchOpen(true),
        onRetrySearch: () => setSearchRetryToken((n) => n + 1),
        formatItem,
        navigate,
        searchInputRef,
        onSelect: (formatted: any) => {
            if (formatted.type === 'person') {
                navigate(`/discovery/person/${formatted.id}`);
            } else if (formatted.type === 'music' || formatted.mediaType === 'music') {
                navigate(`/discovery/music/artist/${encodeURIComponent(String(formatted.mbid || formatted.id))}`);
            } else {
                stashDiscoverDetailSeed(formatted);
                navigate(`/discovery/${formatted.type}/${formatted.id}`);
            }
        },
    };

    const openMedia = useCallback((item: any) => {
        if (item.type === 'music' || item.mediaType === 'music') {
            const mbid = item.mbid || item.id;
            navigate(`/discovery/music/artist/${encodeURIComponent(String(mbid))}`);
            return;
        }
        stashDiscoverDetailSeed(item);
        navigate(`/discovery/${item.type}/${item.id}`);
    }, [navigate]);

    const routeParts = stripBasePath(path).split('/').filter(Boolean);
    const subRoute = routeParts[1] || 'home';

    if (routeParts.length >= 4 && routeParts[1] === 'movies' && routeParts[2] === 'studio') {
        const id = parseInt(routeParts[3], 10);
        if (!Number.isNaN(id)) {
            return (
                <DiscoverCategoryPage
                    kind="studio"
                    id={id}
                    onBack={() => navigate('/discovery')}
                    onSelect={openMedia}
                    formatItem={formatItem}
                />
            );
        }
    }

    if (routeParts.length >= 4 && routeParts[1] === 'series' && routeParts[2] === 'network') {
        const id = parseInt(routeParts[3], 10);
        if (!Number.isNaN(id)) {
            return (
                <DiscoverCategoryPage
                    kind="network"
                    id={id}
                    onBack={() => navigate('/discovery')}
                    onSelect={openMedia}
                    formatItem={formatItem}
                />
            );
        }
    }

    if (routeParts.length >= 3 && routeParts[1] === 'person') {
        const id = parseInt(routeParts[2], 10);
        return (
            <PersonDetailsPage
                personId={id}
                onBack={() => window.history.back()}
                onSelect={openMedia}
                formatItem={formatItem}
            />
        );
    }

    if (routeParts.length >= 4 && routeParts[1] === 'music' && routeParts[2] === 'artist') {
        const mbid = decodeURIComponent(routeParts[3] || '');
        return (
            <div className="discovery-theme w-full flex flex-col gap-4 pb-8">
                <DiscoverHeroHeader {...heroProps} />
                <MusicArtistPage
                    mbid={mbid}
                    onBack={() => navigate('/discovery/music')}
                    pushToast={pushToast}
                />
            </div>
        );
    }

    if (routeParts.length >= 3 && (routeParts[1] === 'movie' || routeParts[1] === 'tv')) {
        const type = routeParts[1] as 'movie' | 'tv';
        const id = parseInt(routeParts[2], 10);
        return (
            <MediaDetailsPage
                mediaType={type}
                mediaId={id}
                onBack={() => navigate('/discovery')}
                formatItem={formatItem}
                pushToast={pushToast}
                isAdmin={isAdmin}
                mediaServerType={mediaServerType}
            />
        );
    }

    const showTabs = ['home', 'movies', 'series', 'music', 'requests', 'issues'].includes(subRoute);

    if (subRoute === 'watchlist') {
        return (
            <div className="discovery-theme w-full flex flex-col gap-4 pb-8">
                <DiscoverHeroHeader {...heroProps} />
                <WatchlistPage
                    formatItem={formatItem}
                    onSelect={openMedia}
                    navigate={navigate}
                    pushToast={pushToast}
                    providerLabel={providerLabel}
                />
            </div>
        );
    }

    const canSeeIssuesTab = Boolean(
        discoveryMe?.permissions?.createIssues || discoveryMe?.permissions?.viewIssues
    );

    const tabs = [
        { id: 'home', path: '/discovery', label: t('nav.discover'), icon: Compass, count: 0, countColor: '' },
        { id: 'movies', path: '/discovery/movies', label: t('nav.movies'), icon: Film, count: 0, countColor: '' },
        { id: 'series', path: '/discovery/series', label: t('nav.series'), icon: Tv, count: 0, countColor: '' },
        { id: 'music', path: '/discovery/music', label: t('nav.music'), icon: Music, count: 0, countColor: '' },
        { id: 'requests', path: '/discovery/requests', label: t('nav.myRequests'), icon: ClipboardList, count: myPendingCount, countColor: 'bg-plex/25 text-plex' },
        ...(canSeeIssuesTab
            ? [{ id: 'issues', path: '/discovery/issues', label: t('nav.myIssues'), icon: AlertTriangle, count: myOpenIssueCount, countColor: 'bg-amber-500/25 text-amber-300' }]
            : []),
    ];

    const activeTab = tabs.find(t => t.id === subRoute) || tabs[0];
    const ActiveIcon = activeTab.icon;

    const renderTabBadge = (tab: typeof tabs[number], active: boolean) => {
        if (!tab.count) return null;
        return (
            <span className={`min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-black inline-flex items-center justify-center ${
                active ? (tab.countColor || 'bg-plex/25 text-plex') : 'bg-plex text-background'
            }`}>
                {tab.count > 99 ? '99+' : tab.count}
            </span>
        );
    };

    return (
        <div className="discovery-theme w-full flex flex-col gap-4 pb-8">
            <DiscoverHeroHeader {...heroProps} />
            <DiscoverAchievementsTeaser navigate={navigate} />

            {showTabs && (
                <>
                    <div className={`w-full ${discoveryTheme.tabSticky}`}>
                        <div className="sm:hidden relative">
                            <button
                                type="button"
                                onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
                                className={discoveryTheme.mobileNavBtn}
                            >
                                <span className="flex items-center gap-2 min-w-0">
                                    <ActiveIcon className="w-5 h-5 shrink-0" />
                                    <span className="truncate">{activeTab.label}</span>
                                    {renderTabBadge(activeTab, true)}
                                </span>
                                <ChevronDown className={`w-5 h-5 shrink-0 transition-transform ${isMobileNavOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isMobileNavOpen && (
                                <div className={discoveryTheme.mobileNavMenu}>
                                    {tabs.map(tab => (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            onClick={() => { navigate(tab.path); setIsMobileNavOpen(false); }}
                                            className={`${discoveryTheme.mobileNavItem} ${tab.id === subRoute ? discoveryTheme.mobileNavItemActive : ''}`}
                                        >
                                            <tab.icon className="w-5 h-5" /> {tab.label}
                                            {tab.count > 0 && (
                                                <span className="ml-auto min-w-[1.25rem] h-5 px-1.5 rounded-full bg-plex text-black text-[10px] font-black inline-flex items-center justify-center">
                                                    {tab.count > 99 ? '99+' : tab.count}
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className={`hidden sm:flex ${discoveryTheme.tabBar} items-center gap-2`}>
                            <div className="flex flex-1 min-w-0 gap-1 overflow-x-auto">
                            {tabs.map(tab => {
                                const active = tab.id === subRoute;
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => navigate(tab.path)}
                                        className={`${discoveryTheme.tab} ${active ? discoveryTheme.tabActive : ''}`}
                                    >
                                        <tab.icon className="w-4 h-4" />
                                        {tab.label}
                                        {renderTabBadge(tab, active)}
                                    </button>
                                );
                            })}
                            </div>
                        </div>
                    </div>

                    <div className="w-full mt-1">
                        {subRoute === 'home' && (
                    <DiscoverHome
                        onSelect={openMedia}
                        formatItem={formatItem}
                        navigate={navigate}
                        pushToast={pushToast}
                        providerLabel={providerLabel}
                    />
                        )}
                        {subRoute === 'movies' && (
                            <DiscoverMovies
                                onSelect={openMedia}
                                formatItem={formatItem}
                                navigate={navigate}
                            />
                        )}
                        {subRoute === 'series' && (
                            <DiscoverSeries
                                onSelect={openMedia}
                                formatItem={formatItem}
                                navigate={navigate}
                            />
                        )}
                        {subRoute === 'music' && (
                            <DiscoverMusic
                                navigate={navigate}
                                formatItem={formatItem}
                                onSelect={openMedia}
                            />
                        )}
                        {subRoute === 'requests' && (
                            <MyRequestsPage
                                navigate={navigate}
                                pushToast={pushToast}
                                onCountsChange={refreshMyRequestCount}
                            />
                        )}
                        {subRoute === 'issues' && (
                            <MyIssuesPage
                                navigate={navigate}
                                pushToast={pushToast}
                                onCountsChange={refreshMyIssueCount}
                            />
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export const DiscoveryDashboard: React.FC<{
    onItemClick: (item: any) => void;
    pushToast?: (msg: string, type: 'success' | 'error') => void;
    mediaServerType?: string;
    isAdmin?: boolean;
}> = ({ pushToast: pushToastProp, ...props }) => {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const pushToast = useCallback((msg: string, type: 'success' | 'error') => {
        setToasts((prev) => appendToast(prev, msg, type));
        pushToastProp?.(msg, type);
    }, [pushToastProp]);

    return (
        <>
            <DiscoveryDashboardInner {...props} pushToast={pushToast} />
            <ToastContainer toasts={toasts} setToasts={setToasts} />
        </>
    );
};
