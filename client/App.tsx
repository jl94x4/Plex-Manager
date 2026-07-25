import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
const SettingsDashboard = lazy(() => import('./settings/SettingsDashboard').then(m => ({ default: m.SettingsDashboard })));
import { bindAppConfirm } from './shared/confirm';
import { apiFetch } from './shared/api';
import { getPublicOrigin, portalUrl, resolvePortalAssetUrl, stripBasePath } from './shared/basePath';
import { ConfirmModal } from './shared/ui';
import { Loader } from './shared/toast';
import { AppAmbientBackground } from './shared/theme';
import { WhatsNewModal } from './shared/WhatsNewModal';
import { DiscoverI18nProvider } from './discovery/i18n';
import {
    getLastSeenVersion,
    parseAppSemver,
    setLastSeenVersion,
    shouldShowReleaseNotes,
    type ReleaseNotes,
} from './shared/releaseNotes';

const RequestQueueDashboard = lazy(() => import('./requests/RequestQueueDashboard').then(m => ({ default: m.RequestQueueDashboard })));
import { usePendingRequestCount } from './requests/usePendingRequestCount';
import { useWatchingCount } from './shared/useWatchingCount';
import { useDownloadCount } from './shared/useDownloadCount';
import { useAppDynamicTheme } from './shared/useAppDynamicTheme';
import { useOpenIssueCount } from './requests/useOpenIssueCount';
const UpgraderDashboard = lazy(() => import('./upgrader/UpgraderDashboard').then(m => ({ default: m.UpgraderDashboard })));
const CollexionsDashboard = lazy(() => import('./collexions/CollexionsDashboard').then(m => ({ default: m.CollexionsDashboard })));
const ScannerDashboard = lazy(() => import('./scanner/ScannerDashboard').then(m => ({ default: m.ScannerDashboard })));
import {
    updateFavicon,
    Login,
    PublicInviteClaim,
    StatusDashboard,
    LibraryDashboard,
    MaintenanceDashboard,
    LogsDashboard,
    MediaStackDashboard,
    DownloadStatusPage,
    AnalyticsDashboard,
    AdminDashboard,
    AboutDashboard,
    UserDashboard,
    Navigation,
} from './screens';
import { DiscoveryDashboard } from './discovery/DiscoveryDashboard';

export const MainApp: React.FC = () => {
    const [confirmState, setConfirmState] = useState<{ isOpen: boolean, message: string, onConfirm: () => void }>({ isOpen: false, message: '', onConfirm: () => { } });

    const [activeTheme, setActiveTheme] = useState(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('portal-theme') || 'plex';
            // Light theme is temporarily disabled — migrate saved preference.
            if (stored === 'light') {
                localStorage.setItem('portal-theme', 'plex');
                return 'plex';
            }
            return stored;
        }
        return 'plex';
    });

    useEffect(() => {
        bindAppConfirm((message, onConfirm) => {
            setConfirmState({ isOpen: true, message, onConfirm });
        });
    }, []);


    const closeConfirm = () => setConfirmState(s => ({ ...s, isOpen: false }));
    const handleConfirm = () => {
        confirmState.onConfirm();
        closeConfirm();
    };

    const [currentRoute, setCurrentRoute] = useState<'login' | 'admin' | 'user' | 'users' | 'status' | 'dashboard' | 'settings' | 'logs' | 'analytics' | 'downloads' | 'mediastack' | 'maintenance' | 'upgrader' | 'collexions' | 'scanner' | 'requests' | 'discovery' | 'about' | 'invite' | 'loading'>('loading');
    const [sessionInfo, setSessionInfo] = useState<any>(null);
    const [publicConfig, setPublicConfig] = useState<any>({});
    const [releaseNotes, setReleaseNotes] = useState<ReleaseNotes | null>(null);
    const [showWhatsNew, setShowWhatsNew] = useState(false);
    const whatsNewCheckedRef = useRef(false);

    const fetchPublicConfig = useCallback(async () => {
        try {
            const data = await apiFetch('/api/config/public');
            window.__USE_24_HOUR_CLOCK__ = data.use24HourClock === true;
            if (typeof data.basePath === 'string') {
                window.__BASE_PATH__ = data.basePath;
            }
            setPublicConfig(data);

            if (data.customLogoUrl) {
                updateFavicon(data.customLogoUrl);
            }
        } catch (e) { }
    }, []);

    const lastBrandingTheme = useRef<string | null>(null);

    useEffect(() => {
        if (!publicConfig.brandingTheme) return;

        const resolveTheme = (value: string) => (value === 'light' ? 'plex' : value);

        if (lastBrandingTheme.current === null) {
            // First time config loads - respect user's localStorage choice if any
            const theme = resolveTheme(localStorage.getItem('portal-theme') || publicConfig.brandingTheme || 'plex');
            setActiveTheme(theme);
            lastBrandingTheme.current = publicConfig.brandingTheme;
        } else if (publicConfig.brandingTheme !== lastBrandingTheme.current) {
            // Default theme setting was changed (e.g. saved in Settings) - override local theme
            const theme = resolveTheme(publicConfig.brandingTheme);
            setActiveTheme(theme);
            localStorage.setItem('portal-theme', theme);
            lastBrandingTheme.current = publicConfig.brandingTheme;
        }
    }, [publicConfig.brandingTheme]);

    useEffect(() => {
        const theme = activeTheme === 'light' ? 'plex' : activeTheme;
        if (theme !== activeTheme) {
            setActiveTheme('plex');
            return;
        }
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('portal-theme', theme);
        if (theme !== 'dynamic') {
            document.documentElement.style.removeProperty('--color-plex');
            document.documentElement.style.removeProperty('--color-plex-hover');
        }
    }, [activeTheme]);

    useAppDynamicTheme(activeTheme, currentRoute, publicConfig);

    useEffect(() => {
        if (publicConfig?.useBrandedSkeleton !== false) {
            document.documentElement.classList.add('branded-skeleton');
        } else {
            document.documentElement.classList.remove('branded-skeleton');
        }
    }, [publicConfig?.useBrandedSkeleton]);

    useEffect(() => {
        window.scrollTo(0, 0);
        const container = document.getElementById('main-scroll-container');
        if (container) container.scrollTop = 0;
    }, [currentRoute]);

    useEffect(() => {
        fetchPublicConfig();
    }, [fetchPublicConfig]);

    useEffect(() => {
        if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

        const isFirefox = /Firefox/i.test(navigator.userAgent || '');
        let cancelled = false;
        let refreshing = false;

        const onControllerChange = () => {
            // Pick up portal-sw v6 (no fetch proxy) without requiring a manual hard refresh.
            if (refreshing || cancelled) return;
            refreshing = true;
            window.location.reload();
        };
        navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

        (async () => {
            try {
                const regs = await navigator.serviceWorker.getRegistrations();

                // Firefox does not need a SW for Install/A2HS. A leftover broken SW
                // from earlier PWA work makes Install silently do nothing — remove it.
                if (isFirefox) {
                    await Promise.all(regs.map((reg) => reg.unregister()));
                    return;
                }

                if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
                    return;
                }
                if (cancelled) return;

                const reg = await navigator.serviceWorker.register(portalUrl('/service-worker.js'), {
                    scope: portalUrl('/'),
                    updateViaCache: 'none',
                });
                try {
                    await reg.update();
                } catch {
                    // ignore update probe failures
                }
            } catch {
                // ignore
            }
        })();

        return () => {
            cancelled = true;
            navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
        };
    }, []);

    useEffect(() => {
        if (currentRoute === 'status' && !sessionInfo && publicConfig?.showPublicStatusMonitor === false) {
            setCurrentRoute('login');
            window.history.replaceState({}, '', portalUrl('/'));
        }
    }, [currentRoute, publicConfig?.showPublicStatusMonitor, sessionInfo]);

    useEffect(() => {
        const onPublicConfigUpdated = () => { fetchPublicConfig(); };
        window.addEventListener('portal-public-config-updated', onPublicConfigUpdated);
        return () => window.removeEventListener('portal-public-config-updated', onPublicConfigUpdated);
    }, [fetchPublicConfig]);

    useEffect(() => {
        if (!sessionInfo || !publicConfig?.appVersion) return;
        if (currentRoute === 'login' || currentRoute === 'loading' || currentRoute === 'invite') return;
        if (whatsNewCheckedRef.current) return;

        whatsNewCheckedRef.current = true;
        let cancelled = false;

        (async () => {
            try {
                const notes = await apiFetch('/api/release-notes') as ReleaseNotes;
                if (cancelled) return;
                if (shouldShowReleaseNotes(publicConfig.appVersion, notes, getLastSeenVersion())) {
                    setReleaseNotes(notes);
                    setShowWhatsNew(true);
                }
            } catch {
                // Release notes are optional — ignore fetch failures.
            }
        })();

        return () => { cancelled = true; };
    }, [sessionInfo, publicConfig?.appVersion, currentRoute]);

    const dismissWhatsNew = useCallback(() => {
        const semver = parseAppSemver(publicConfig?.appVersion);
        if (semver) setLastSeenVersion(semver);
        setShowWhatsNew(false);
    }, [publicConfig?.appVersion]);

    const setRoute = useCallback((route: 'login' | 'admin' | 'user' | 'users' | 'status' | 'dashboard' | 'settings' | 'logs' | 'analytics' | 'downloads' | 'mediastack' | 'maintenance' | 'upgrader' | 'collexions' | 'scanner' | 'requests' | 'discovery' | 'about' | 'invite' | 'loading', options?: { hash?: string; reviewId?: number }) => {
        if (route === 'logs') {
            setCurrentRoute('settings');
            window.history.pushState({}, '', portalUrl('/settings#logs'));
            return;
        }
        setCurrentRoute(route);
        if (route !== 'loading' && route !== 'invite') {
            let path = '/';
            if (route === 'admin') path = '/admin';
            if (route === 'users') path = '/users';
            if (route === 'user') path = '/portal';
            if (route === 'status') path = '/status';
            if (route === 'dashboard') path = '/dashboard';
            if (route === 'settings') path = '/settings#branding';
            if (route === 'analytics') path = '/analytics';
            if (route === 'downloads') path = '/downloads';
            if (route === 'mediastack') path = '/mediastack';
            if (route === 'maintenance') path = '/maintenance';
            if (route === 'upgrader') path = '/upgrader';
            if (route === 'collexions') path = '/collexions';
            if (route === 'scanner') path = '/scanner';
            if (route === 'requests') {
                path = options?.reviewId ? `/requests?review=${options.reviewId}` : '/requests';
            }
            if (route === 'discovery') path = '/discovery';
            if (route === 'about') path = '/about';
            if (options?.hash) path += options.hash;
            window.history.pushState({}, '', portalUrl(path));
        }
    }, []);

    useEffect(() => {
        if (!sessionInfo) return;
        if (currentRoute !== 'downloads') return;
        if (sessionInfo.session?.isAdmin) return;
        if (sessionInfo.navFeatures?.downloads !== false) return;
        setRoute('user');
    }, [currentRoute, sessionInfo, setRoute]);

    const checkSession = useCallback(async () => {
        let path = stripBasePath(window.location.pathname).toLowerCase();
        if (path.endsWith('/') && path.length > 1) path = path.slice(0, -1);
        if (path.startsWith('/invite/')) {
            setCurrentRoute('invite');
            return;
        }
        const params = new URLSearchParams(window.location.search);
        const loginError = params.get('loginError');
        if (loginError) {
            setCurrentRoute('login');
            return;
        }

        if (path.startsWith('/auth/')) {
            setCurrentRoute('login');
            return;
        }

        try {
            const data = await apiFetch('/api/users/me');
            setSessionInfo(data);
            if (data.serverName) document.title = `${data.serverName} Portal`;
            if (path.startsWith('/status')) setCurrentRoute('status');
            else if (path.startsWith('/dashboard')) setCurrentRoute('dashboard');
            else if (path.startsWith('/settings') && data.session.isAdmin) setCurrentRoute('settings');
            else if (path === '/logs' && data.session.isAdmin) {
                window.history.replaceState({}, '', portalUrl('/settings#logs'));
                setCurrentRoute('settings');
            }
            else if (path.startsWith('/mediastack')) setCurrentRoute('mediastack');
            else if (path.startsWith('/downloads')) setCurrentRoute('downloads');
            else if (path.startsWith('/maintenance') && data.session.isAdmin) setCurrentRoute('maintenance');
            else if (path.startsWith('/upgrader') && data.session.isAdmin) setCurrentRoute('upgrader');
            else if (
                path.startsWith('/collexions')
                && data.session.isAdmin
                && data.navFeatures?.collexions
                && String(data.mediaServerType || 'plex').toLowerCase() === 'plex'
            ) setCurrentRoute('collexions');
            else if (path.startsWith('/collexions')) {
                window.history.replaceState({}, '', portalUrl('/portal'));
                setCurrentRoute('user');
            }
            else if (path.startsWith('/scanner') && data.session.isAdmin && data.navFeatures?.scanner) setCurrentRoute('scanner');
            else if (path.startsWith('/scanner')) {
                window.history.replaceState({}, '', portalUrl('/portal'));
                setCurrentRoute('user');
            }
            else if (path.startsWith('/requests') && data.session.isAdmin) setCurrentRoute('requests');
            else if (path.startsWith('/discovery')) setCurrentRoute('discovery');
            else if (path.startsWith('/about')) setCurrentRoute('about');
            else if (path.startsWith('/analytics')) setCurrentRoute('analytics');
            else if (path.startsWith('/admin') || path.startsWith('/users')) {
                if (data.session.isAdmin && !data.impersonation?.active) setCurrentRoute('users');
                else {
                    window.history.replaceState({}, '', portalUrl('/portal'));
                    setCurrentRoute('user');
                }
            }
            else if (path === '/portal') setCurrentRoute('user');
            else {
                window.history.replaceState({}, '', portalUrl('/portal'));
                setCurrentRoute('user');
            }
        } catch {
            if (path === '/status' && publicConfig?.showPublicStatusMonitor !== false) setCurrentRoute('status');
            else if (path === '/dashboard') setCurrentRoute('dashboard');
            else setCurrentRoute('login');
        }
    }, [publicConfig?.showPublicStatusMonitor]);

    useEffect(() => {
        // Initial session check
        checkSession();
    }, [checkSession]);

    useEffect(() => {
        const onPopState = () => {
            checkSession();
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, [checkSession]);

    const handleLogout = async () => {
        await apiFetch('/api/auth/logout', { method: 'POST' });
        setSessionInfo(null);
        setRoute('login');
    };

    const handleStopImpersonation = async () => {
        try {
            await apiFetch('/api/admin/stop-impersonation', { method: 'POST' });
            await checkSession();
            setRoute('users');
        } catch (e) {
            console.error('Failed to stop impersonation', e);
        }
    };

    const handleViewAsUser = async (userId: string) => {
        try {
            await apiFetch(`/api/admin/impersonate/${encodeURIComponent(userId)}`, { method: 'POST' });
            await checkSession();
            setRoute('user');
        } catch (e) {
            console.error('Failed to impersonate user', e);
            throw e;
        }
    };

    const requestsQueueEnabled = !!sessionInfo?.session?.isAdmin && !!sessionInfo?.navFeatures?.requestsQueue;
    const { pendingCount: pendingRequestCount, refresh: refreshPendingRequestCount } = usePendingRequestCount(requestsQueueEnabled);
    const showDashboardWatchingBadge = publicConfig?.showDashboardWatchingBadge === true;
    const dashboardWatchingBadgePollSeconds = Number(publicConfig?.dashboardWatchingBadgePollSeconds) || 15;
    const { watchingCount } = useWatchingCount(showDashboardWatchingBadge, dashboardWatchingBadgePollSeconds);
    const downloadsNavEnabled = !!sessionInfo && (
        !!sessionInfo?.session?.isAdmin || sessionInfo?.navFeatures?.downloads !== false
    );
    const { downloadCount } = useDownloadCount(downloadsNavEnabled, 15);
    const { openCount: openIssueCount, refresh: refreshOpenIssueCount } = useOpenIssueCount(requestsQueueEnabled);
    const queueBadgeCount = pendingRequestCount + openIssueCount;
    const refreshQueueCounts = useCallback(() => {
        refreshPendingRequestCount();
        refreshOpenIssueCount();
    }, [refreshPendingRequestCount, refreshOpenIssueCount]);

    if (currentRoute === 'loading') return <Loader isLoading={true} isCinematic={!!publicConfig?.useCinematicLoading} />;
    if (currentRoute === 'login') {
        const initialLoginError = typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('loginError')
            : null;
        return <Login onLoginSuccess={checkSession} publicConfig={publicConfig} initialError={initialLoginError || undefined} />;
    }

    const isAdmin = !!sessionInfo?.session?.isAdmin;
    const isImpersonating = !!sessionInfo?.impersonation?.active;

    const isPublicStatus = currentRoute === 'status' && !sessionInfo;
    const isPublicInvite = currentRoute === 'invite';
    const isPublicView = isPublicStatus || isPublicInvite;

    const renderView = () => {
        if (currentRoute === 'invite') {
            const code = stripBasePath(window.location.pathname).split('/')[2];
            return <PublicInviteClaim code={code} />;
        }
        if (currentRoute === 'status') return <StatusDashboard onBack={() => isPublicStatus ? setRoute('login') : setRoute('user')} isAdmin={isAdmin} isPublic={isPublicStatus} />;
        if (currentRoute === 'dashboard') return <LibraryDashboard onBack={() => setRoute('user')} isAdmin={isAdmin} publicConfig={publicConfig} mediaServerType={sessionInfo?.mediaServerType} onViewAnalytics={(hash) => setRoute('analytics', { hash })} />;
        if (currentRoute === 'settings' && isAdmin) return <SettingsDashboard />;
        if (currentRoute === 'maintenance' && isAdmin) return <MaintenanceDashboard />;
        if (currentRoute === 'upgrader' && isAdmin) return <UpgraderDashboard />;
        if (
            currentRoute === 'collexions'
            && isAdmin
            && sessionInfo?.navFeatures?.collexions
            && String(sessionInfo?.mediaServerType || publicConfig?.mediaServerType || 'plex').toLowerCase() === 'plex'
        ) return <CollexionsDashboard />;
        if (currentRoute === 'scanner' && isAdmin && sessionInfo?.navFeatures?.scanner) {
            return (
                <Suspense fallback={<Loader isLoading={true} isCinematic={!!publicConfig?.useCinematicLoading} />}>
                    <ScannerDashboard />
                </Suspense>
            );
        }
        if (currentRoute === 'requests' && isAdmin) {
            return (
                <RequestQueueDashboard
                    onCountsChange={refreshQueueCounts}
                    openIssueCount={openIssueCount}
                />
            );
        }
        if (currentRoute === 'discovery') return <DiscoveryDashboard onItemClick={(item) => console.log('Item', item)} mediaServerType={sessionInfo?.mediaServerType || publicConfig?.mediaServerType || 'plex'} isAdmin={isAdmin} />;
        if (currentRoute === 'logs' && isAdmin) return <LogsDashboard onLogout={handleLogout} />;
        if (currentRoute === 'mediastack') return <MediaStackDashboard isAdmin={isAdmin} />;
        if (currentRoute === 'downloads') return <DownloadStatusPage isAdmin={isAdmin} />;
        if (currentRoute === 'analytics') return <AnalyticsDashboard isAdmin={isAdmin} sessionInfo={sessionInfo} />;
        if (currentRoute === 'about') return <AboutDashboard appVersion={publicConfig?.appVersion} mediaServerType={sessionInfo?.mediaServerType || publicConfig?.mediaServerType} />;
        if (currentRoute === 'admin' || currentRoute === 'users') return <AdminDashboard onLogout={handleLogout} onViewUserPortal={() => setRoute('user')} onViewStatus={() => setRoute('status')} onViewDashboard={() => setRoute('dashboard')} onViewAsUser={handleViewAsUser} />;
        return <UserDashboard sessionInfo={sessionInfo} publicConfig={publicConfig} onLogout={handleLogout} refreshSession={checkSession} onViewAdmin={() => setRoute('users')} onViewStatus={() => setRoute('status')} onViewDashboard={() => setRoute('dashboard')} onViewSettings={() => setRoute('settings')} onViewLogs={() => setRoute('logs')} onViewCollexions={() => setRoute('collexions')} onViewScanner={() => setRoute('scanner')} onViewRequests={(reviewId) => setRoute('requests', reviewId ? { reviewId } : undefined)} onPendingRequestsChange={refreshPendingRequestCount} />;
    };

    return (
        <DiscoverI18nProvider>
        <div className="relative flex w-full min-h-screen md:h-dvh md:overflow-hidden">
            <AppAmbientBackground backgroundImageUrl={publicConfig?.backgroundImageUrl} />
            <ConfirmModal isOpen={confirmState.isOpen} message={confirmState.message} onConfirm={handleConfirm} onCancel={closeConfirm} />
            {showWhatsNew && releaseNotes && (
                <WhatsNewModal
                    notes={releaseNotes}
                    appVersion={publicConfig?.appVersion}
                    onDismiss={dismissWhatsNew}
                />
            )}
            {!isPublicView && <Navigation currentRoute={currentRoute} onNavigate={setRoute as any} onLogout={handleLogout} isAdmin={isAdmin} serverName={sessionInfo?.serverName || 'Server Portal'} adminThumb={sessionInfo?.adminThumb} customLogoUrl={publicConfig?.customLogoUrl} requestUrl={sessionInfo?.requestUrl || 'https://yourdomain.com'} navOrder={sessionInfo?.navOrder || ['home', 'discover', 'request', 'analytics', 'users', 'downloads', 'upgrader', 'collexions', 'mediastack', 'requests', 'status', 'maintenance', 'about', 'logs', 'settings', 'logout']} navHiddenKeys={sessionInfo?.navHiddenKeys} navFeatures={sessionInfo?.navFeatures} appVersion={publicConfig.appVersion} activeTheme={activeTheme} setActiveTheme={setActiveTheme} pendingRequestCount={queueBadgeCount} watchingCount={watchingCount} downloadCount={downloadCount} showDashboardWatchingBadge={showDashboardWatchingBadge} sessionInfo={sessionInfo} mediaServerType={sessionInfo?.mediaServerType || publicConfig?.mediaServerType || 'plex'} sidebarIdentityPosition={publicConfig?.sidebarIdentityPosition || 'bottom'} />}
            <div id="main-scroll-container" className={`relative z-10 flex-1 min-w-0 min-h-0 flex flex-col items-center px-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:px-8 md:pb-8 overflow-x-visible md:overflow-y-auto custom-scrollbar ${isPublicView ? '!pb-8' : ''}`}>
                {isImpersonating && (
                    <div className="w-full max-w-[100%] pt-[calc(5rem+env(safe-area-inset-top,0px))] md:pt-0 md:sticky md:top-0 md:z-30">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-100 shadow-lg backdrop-blur-md">
                            <p className="text-sm font-medium">
                                Viewing portal as <span className="font-bold text-white">{sessionInfo?.impersonation?.targetUsername || sessionInfo?.session?.username}</span>
                            </p>
                            <button
                                type="button"
                                onClick={handleStopImpersonation}
                                className="px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-50 text-sm font-bold hover:bg-amber-500/30 transition-colors whitespace-nowrap"
                            >
                                Exit impersonation
                            </button>
                        </div>
                    </div>
                )}
                <div className={`w-full min-w-0 max-w-[100%] ${isImpersonating ? 'pt-3 md:pt-4' : 'pt-[calc(5rem+env(safe-area-inset-top,0px))] md:pt-8'}`}>
                    <Suspense fallback={<div className="flex w-full items-center justify-center pt-20"><Loader isLoading={true} isCinematic={false} /></div>}>
                        {renderView()}
                    </Suspense>
                </div>

                {/* Mobile Bottom Version */}
                {!isPublicView && publicConfig?.appVersion && (
                    <div className="md:hidden mt-auto pt-12 pb-4 w-full text-center text-[10px] text-white/30 font-mono tracking-widest pointer-events-none">
                        {publicConfig.appVersion}
                    </div>
                )}
            </div>
        </div>
        </DiscoverI18nProvider>
    );
};
