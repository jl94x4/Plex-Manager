import React, { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { portalUrl } from '../shared/basePath';
import { DashboardHero, DashboardPageShell, DashboardPanel } from '../shared/dashboard/DashboardChrome';
import { Toast, type ToastMessage } from '../shared/toast';
import { subscribeWebPush, unsubscribeWebPush, webPushSupported, getIosWebPushBlockReason } from '../shared/webPushSubscribe';
import { useDiscoverI18n } from '../discovery/i18n';
import { DiscoverLocaleSelect } from '../discovery/i18n/DiscoverLocaleSelect';

type Props = {
    sessionInfo: any;
    refreshSession: () => void;
};

const PrefToggle: React.FC<{
    title: string;
    hint: string;
    on: boolean;
    onToggle: () => void;
    ariaLabel: string;
    disabled?: boolean;
}> = ({ title, hint, on, onToggle, ariaLabel, disabled }) => (
    <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
            <p className="text-text font-bold text-sm">{title}</p>
            <p className="text-muted text-xs mt-1 leading-relaxed">{hint}</p>
        </div>
        <button
            type="button"
            onClick={onToggle}
            disabled={disabled}
            aria-label={ariaLabel}
            className={`relative inline-flex items-center w-14 h-7 rounded-full transition-all flex-shrink-0 border-2 disabled:opacity-50 ${
                on ? 'bg-plex border-plex' : 'bg-background border-border'
            }`}
        >
            <span className={`inline-block w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-300 ${on ? 'translate-x-8' : 'translate-x-1'}`} />
        </button>
    </div>
);

export const PreferencesPage: React.FC<Props> = ({ sessionInfo, refreshSession }) => {
    const { t } = useDiscoverI18n();
    const user = sessionInfo?.account;
    const isAdmin = !!(sessionInfo?.session?.isAdmin || user?.isAdmin);
    const [toast, setToast] = useState<ToastMessage | null>(null);
    const [busy, setBusy] = useState(false);

    const [optOutNewsletter, setOptOutNewsletter] = useState(user?.optOutNewsletter || false);
    const [notifyRequestAvailableEmail, setNotifyRequestAvailableEmail] = useState(user?.notifyRequestAvailableEmail !== false);
    const [notifyRequestAvailableInApp, setNotifyRequestAvailableInApp] = useState(user?.notifyRequestAvailableInApp !== false);
    const [notifyRequestAvailableWebPush, setNotifyRequestAvailableWebPush] = useState(user?.notifyRequestAvailableWebPush !== false);
    const [notifyRequestAvailableDiscord, setNotifyRequestAvailableDiscord] = useState(user?.notifyRequestAvailableDiscord !== false);
    const [notifyRequestApproved, setNotifyRequestApproved] = useState(
        user?.notifyRequestApprovedEmail !== false
        && user?.notifyRequestApprovedInApp !== false
        && user?.notifyRequestApprovedWebPush !== false,
    );
    const [notifyRequestDeclined, setNotifyRequestDeclined] = useState(
        user?.notifyRequestDeclinedEmail !== false
        && user?.notifyRequestDeclinedInApp !== false
        && user?.notifyRequestDeclinedWebPush !== false,
    );
    const [notifySeasonAvailable, setNotifySeasonAvailable] = useState(
        user?.notifySeasonAvailableEmail !== false
        && user?.notifySeasonAvailableInApp !== false
        && user?.notifySeasonAvailableWebPush !== false,
    );
    const [notifyNewEpisode, setNotifyNewEpisode] = useState(
        user?.notifyNewEpisodeEmail === true
        || user?.notifyNewEpisodeInApp === true
        || user?.notifyNewEpisodeWebPush === true,
    );
    const [notifyCollexionsFailed, setNotifyCollexionsFailed] = useState(user?.notifyCollexionsFailed !== false);
    const [notifyScannerFailed, setNotifyScannerFailed] = useState(user?.notifyScannerFailed !== false);
    const [notifyStatusDown, setNotifyStatusDown] = useState(user?.notifyStatusDown !== false);
    const [notifyStatusUp, setNotifyStatusUp] = useState(user?.notifyStatusUp !== false);
    const [notifyMediaJobFailed, setNotifyMediaJobFailed] = useState(user?.notifyMediaJobFailed !== false);
    const [notifyMediaJobCompleted, setNotifyMediaJobCompleted] = useState(user?.notifyMediaJobCompleted === true);
    const [notifyWebPush, setNotifyWebPush] = useState(user?.notifyWebPush !== false);
    const [browserPushReady, setBrowserPushReady] = useState(false);
    const browserPushSupportedFlag = webPushSupported();
    const iosPushBlock = typeof window !== 'undefined' ? getIosWebPushBlockReason() : null;

    useEffect(() => {
        setNotifyRequestAvailableEmail(user?.notifyRequestAvailableEmail !== false);
        setNotifyRequestAvailableInApp(user?.notifyRequestAvailableInApp !== false);
        setNotifyRequestAvailableWebPush(user?.notifyRequestAvailableWebPush !== false);
        setNotifyRequestAvailableDiscord(user?.notifyRequestAvailableDiscord !== false);
        setNotifyRequestApproved(
            user?.notifyRequestApprovedEmail !== false
            && user?.notifyRequestApprovedInApp !== false
            && user?.notifyRequestApprovedWebPush !== false,
        );
        setNotifyRequestDeclined(
            user?.notifyRequestDeclinedEmail !== false
            && user?.notifyRequestDeclinedInApp !== false
            && user?.notifyRequestDeclinedWebPush !== false,
        );
        setNotifySeasonAvailable(
            user?.notifySeasonAvailableEmail !== false
            && user?.notifySeasonAvailableInApp !== false
            && user?.notifySeasonAvailableWebPush !== false,
        );
        setNotifyNewEpisode(
            user?.notifyNewEpisodeEmail === true
            || user?.notifyNewEpisodeInApp === true
            || user?.notifyNewEpisodeWebPush === true,
        );
        setNotifyCollexionsFailed(user?.notifyCollexionsFailed !== false);
        setNotifyScannerFailed(user?.notifyScannerFailed !== false);
        setNotifyStatusDown(user?.notifyStatusDown !== false);
        setNotifyStatusUp(user?.notifyStatusUp !== false);
        setNotifyMediaJobFailed(user?.notifyMediaJobFailed !== false);
        setNotifyMediaJobCompleted(user?.notifyMediaJobCompleted === true);
        setNotifyWebPush(user?.notifyWebPush !== false);
        setOptOutNewsletter(!!user?.optOutNewsletter);
    }, [
        user?.notifyRequestAvailableEmail,
        user?.notifyRequestAvailableInApp,
        user?.notifyRequestAvailableWebPush,
        user?.notifyRequestAvailableDiscord,
        user?.notifyRequestApprovedEmail,
        user?.notifyRequestApprovedInApp,
        user?.notifyRequestApprovedWebPush,
        user?.notifyRequestDeclinedEmail,
        user?.notifyRequestDeclinedInApp,
        user?.notifyRequestDeclinedWebPush,
        user?.notifySeasonAvailableEmail,
        user?.notifySeasonAvailableInApp,
        user?.notifySeasonAvailableWebPush,
        user?.notifyNewEpisodeEmail,
        user?.notifyNewEpisodeInApp,
        user?.notifyNewEpisodeWebPush,
        user?.notifyCollexionsFailed,
        user?.notifyScannerFailed,
        user?.notifyStatusDown,
        user?.notifyStatusUp,
        user?.notifyMediaJobFailed,
        user?.notifyMediaJobCompleted,
        user?.notifyWebPush,
        user?.optOutNewsletter,
    ]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!browserPushSupportedFlag) return;
            try {
                const reg = await navigator.serviceWorker.getRegistration(portalUrl('/'));
                const sub = await reg?.pushManager.getSubscription();
                if (!cancelled) setBrowserPushReady(!!sub);
            } catch {
                if (!cancelled) setBrowserPushReady(false);
            }
        })();
        return () => { cancelled = true; };
    }, [browserPushSupportedFlag]);

    const savePref = async (body: Record<string, boolean>, apply: () => void, success: string) => {
        setBusy(true);
        try {
            await apiFetch('/api/users/preferences', {
                method: 'POST',
                body: JSON.stringify(body),
            });
            apply();
            setToast({ id: Date.now(), message: success, type: 'success' });
            refreshSession();
        } catch (e: any) {
            setToast({ id: Date.now(), message: e.message || t('preferencesPage.saveFailed'), type: 'error' });
        } finally {
            setBusy(false);
        }
    };

    const toggleLifecycle = (
        enabled: boolean,
        keys: string[],
        setLocal: (v: boolean) => void,
    ) => {
        const body: Record<string, boolean> = {};
        for (const key of keys) body[key] = enabled;
        void savePref(body, () => setLocal(enabled), t('preferencesPage.notificationsUpdated'));
    };

    return (
        <DashboardPageShell>
            {toast ? <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} /> : null}
            <DashboardHero
                accent="plex"
                eyebrow={t('preferencesPage.eyebrow')}
                title={t('preferencesPage.title')}
                description={t('preferencesPage.subtitle')}
                icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
            />

            {!user && !sessionInfo?.session?.isAdmin ? (
                <DashboardPanel title={t('preferencesPage.unavailableTitle')} subtitle={t('preferencesPage.unavailableHint')} />
            ) : (
                <div className="space-y-4">
                    <DashboardPanel title={t('common.language')}>
                        <DiscoverLocaleSelect />
                    </DashboardPanel>
                    <DashboardPanel title={t('preferencesPage.newsletterTitle')} subtitle={t('preferencesPage.newsletterSubtitle')}>
                        <PrefToggle
                            title={t('homeDashboard.weeklyNewsletter')}
                            hint={t('homeDashboard.weeklyNewsletterHint')}
                            on={!optOutNewsletter}
                            onToggle={() => {
                                const next = !optOutNewsletter;
                                void savePref(
                                    { optOutNewsletter: next },
                                    () => setOptOutNewsletter(next),
                                    t('preferencesPage.newsletterUpdated'),
                                );
                            }}
                            ariaLabel={t('homeDashboard.toggleNewsletterAria')}
                            disabled={busy}
                        />
                    </DashboardPanel>

                    <DashboardPanel title={t('preferencesPage.notificationsTitle')} subtitle={t('preferencesPage.notificationsSubtitle')}>
                        <div className="flex flex-col gap-5">
                            <PrefToggle
                                title={t('homeDashboard.requestAvailableEmail')}
                                hint={t('homeDashboard.requestAvailableEmailHint')}
                                on={notifyRequestAvailableEmail}
                                onToggle={() => {
                                    const next = !notifyRequestAvailableEmail;
                                    void savePref(
                                        { notifyRequestAvailableEmail: next },
                                        () => setNotifyRequestAvailableEmail(next),
                                        t('preferencesPage.notificationsUpdated'),
                                    );
                                }}
                                ariaLabel={t('homeDashboard.toggleRequestAvailableEmailAria')}
                                disabled={busy}
                            />
                            <PrefToggle
                                title={t('homeDashboard.requestAvailableInApp')}
                                hint={t('homeDashboard.requestAvailableInAppHint')}
                                on={notifyRequestAvailableInApp}
                                onToggle={() => {
                                    const next = !notifyRequestAvailableInApp;
                                    void savePref(
                                        { notifyRequestAvailableInApp: next },
                                        () => setNotifyRequestAvailableInApp(next),
                                        t('preferencesPage.notificationsUpdated'),
                                    );
                                }}
                                ariaLabel={t('homeDashboard.toggleRequestAvailableInAppAria')}
                                disabled={busy}
                            />
                            <PrefToggle
                                title={t('homeDashboard.requestAvailablePush')}
                                hint={t('homeDashboard.requestAvailablePushHint')}
                                on={notifyRequestAvailableWebPush}
                                onToggle={() => {
                                    const next = !notifyRequestAvailableWebPush;
                                    void savePref(
                                        { notifyRequestAvailableWebPush: next },
                                        () => setNotifyRequestAvailableWebPush(next),
                                        t('preferencesPage.notificationsUpdated'),
                                    );
                                }}
                                ariaLabel={t('homeDashboard.toggleRequestAvailableWebPushAria')}
                                disabled={busy}
                            />
                            <PrefToggle
                                title={t('homeDashboard.requestAvailableDiscord')}
                                hint={t('homeDashboard.requestAvailableDiscordHint')}
                                on={notifyRequestAvailableDiscord}
                                onToggle={() => {
                                    const next = !notifyRequestAvailableDiscord;
                                    void savePref(
                                        { notifyRequestAvailableDiscord: next },
                                        () => setNotifyRequestAvailableDiscord(next),
                                        t('preferencesPage.notificationsUpdated'),
                                    );
                                }}
                                ariaLabel={t('homeDashboard.toggleRequestAvailableDiscordAria')}
                                disabled={busy}
                            />
                            <PrefToggle
                                title={t('homeDashboard.requestApprovedAlerts')}
                                hint={t('homeDashboard.requestApprovedAlertsHint')}
                                on={notifyRequestApproved}
                                onToggle={() => toggleLifecycle(
                                    !notifyRequestApproved,
                                    ['notifyRequestApprovedEmail', 'notifyRequestApprovedInApp', 'notifyRequestApprovedWebPush'],
                                    setNotifyRequestApproved,
                                )}
                                ariaLabel={t('homeDashboard.toggleRequestApprovedAria')}
                                disabled={busy}
                            />
                            <PrefToggle
                                title={t('homeDashboard.requestDeclinedAlerts')}
                                hint={t('homeDashboard.requestDeclinedAlertsHint')}
                                on={notifyRequestDeclined}
                                onToggle={() => toggleLifecycle(
                                    !notifyRequestDeclined,
                                    ['notifyRequestDeclinedEmail', 'notifyRequestDeclinedInApp', 'notifyRequestDeclinedWebPush'],
                                    setNotifyRequestDeclined,
                                )}
                                ariaLabel={t('homeDashboard.toggleRequestDeclinedAria')}
                                disabled={busy}
                            />
                            <PrefToggle
                                title={t('homeDashboard.seasonAvailableAlerts')}
                                hint={t('homeDashboard.seasonAvailableAlertsHint')}
                                on={notifySeasonAvailable}
                                onToggle={() => toggleLifecycle(
                                    !notifySeasonAvailable,
                                    ['notifySeasonAvailableEmail', 'notifySeasonAvailableInApp', 'notifySeasonAvailableWebPush'],
                                    setNotifySeasonAvailable,
                                )}
                                ariaLabel={t('homeDashboard.toggleSeasonAvailableAria')}
                                disabled={busy}
                            />
                            <PrefToggle
                                title={t('homeDashboard.newEpisodeAlerts')}
                                hint={t('homeDashboard.newEpisodeAlertsHint')}
                                on={notifyNewEpisode}
                                onToggle={() => toggleLifecycle(
                                    !notifyNewEpisode,
                                    ['notifyNewEpisodeEmail', 'notifyNewEpisodeInApp', 'notifyNewEpisodeWebPush'],
                                    setNotifyNewEpisode,
                                )}
                                ariaLabel={t('homeDashboard.toggleNewEpisodeAria')}
                                disabled={busy}
                            />
                            <PrefToggle
                                title={t('homeDashboard.browserPushAllAlerts')}
                                hint={t('homeDashboard.browserPushAllAlertsHint')}
                                on={notifyWebPush}
                                onToggle={() => {
                                    const next = !notifyWebPush;
                                    void savePref(
                                        { notifyWebPush: next },
                                        () => setNotifyWebPush(next),
                                        t('preferencesPage.notificationsUpdated'),
                                    );
                                }}
                                ariaLabel={t('homeDashboard.toggleBrowserPushAria')}
                                disabled={busy}
                            />

                            {browserPushSupportedFlag && (
                                <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
                                    {iosPushBlock === 'ios-not-standalone' ? (
                                        <p className="text-amber-300/90 text-xs leading-relaxed">
                                            {t('homeDashboard.iosPushAddToHomeScreen')}
                                        </p>
                                    ) : iosPushBlock === 'ios-version' ? (
                                        <p className="text-amber-300/90 text-xs leading-relaxed">
                                            {t('homeDashboard.iosPushNeeds164')}
                                        </p>
                                    ) : (
                                        <p className="text-muted text-xs">
                                            {browserPushReady
                                                ? t('homeDashboard.browserPushSubscribed')
                                                : t('homeDashboard.browserPushSubscribe')}
                                        </p>
                                    )}
                                    <div className="flex flex-wrap gap-2">
                                        {!browserPushReady && (
                                            <button
                                                type="button"
                                                disabled={busy || !!iosPushBlock}
                                                onClick={() => {
                                                    setBusy(true);
                                                    void (async () => {
                                                        try {
                                                            await subscribeWebPush();
                                                            setBrowserPushReady(true);
                                                            setToast({ id: Date.now(), message: t('preferencesPage.pushEnabled'), type: 'success' });
                                                        } catch (e: any) {
                                                            const code = e?.code;
                                                            const message = code === 'ios-not-standalone'
                                                                ? t('homeDashboard.iosPushAddToHomeScreen')
                                                                : code === 'ios-version'
                                                                    ? t('homeDashboard.iosPushNeeds164')
                                                                    : (e.message || t('preferencesPage.pushFailed'));
                                                            setToast({ id: Date.now(), message, type: 'error' });
                                                        } finally {
                                                            setBusy(false);
                                                        }
                                                    })();
                                                }}
                                                className="px-3 py-2 rounded-lg bg-plex text-background text-xs font-bold hover:bg-plex-hover disabled:opacity-50"
                                            >
                                                {t('homeDashboard.enableOnThisDevice')}
                                            </button>
                                        )}
                                        {browserPushReady && (
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => {
                                                    setBusy(true);
                                                    void (async () => {
                                                        try {
                                                            await unsubscribeWebPush();
                                                            setBrowserPushReady(false);
                                                            setToast({ id: Date.now(), message: t('preferencesPage.pushDisabled'), type: 'success' });
                                                        } catch (e: any) {
                                                            setToast({ id: Date.now(), message: e.message || t('preferencesPage.pushFailed'), type: 'error' });
                                                        } finally {
                                                            setBusy(false);
                                                        }
                                                    })();
                                                }}
                                                className="px-3 py-2 rounded-lg border border-white/15 bg-white/5 text-xs font-bold text-text hover:bg-white/10 disabled:opacity-50"
                                            >
                                                {t('homeDashboard.disableOnThisDevice')}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </DashboardPanel>
                    {isAdmin && (
                        <DashboardPanel title={t('preferencesPage.adminNotificationsTitle')} subtitle={t('preferencesPage.adminNotificationsSubtitle')}>
                            <div className="flex flex-col gap-5">
                                <PrefToggle
                                    title={t('homeDashboard.collexionsFailedAlerts')}
                                    hint={t('homeDashboard.collexionsFailedAlertsHint')}
                                    on={notifyCollexionsFailed}
                                    onToggle={() => {
                                        const next = !notifyCollexionsFailed;
                                        void savePref(
                                            { notifyCollexionsFailed: next },
                                            () => setNotifyCollexionsFailed(next),
                                            t('preferencesPage.notificationsUpdated'),
                                        );
                                    }}
                                    ariaLabel={t('homeDashboard.toggleCollexionsFailedAria')}
                                    disabled={busy}
                                />
                                <PrefToggle
                                    title={t('homeDashboard.scannerFailedAlerts')}
                                    hint={t('homeDashboard.scannerFailedAlertsHint')}
                                    on={notifyScannerFailed}
                                    onToggle={() => {
                                        const next = !notifyScannerFailed;
                                        void savePref(
                                            { notifyScannerFailed: next },
                                            () => setNotifyScannerFailed(next),
                                            t('preferencesPage.notificationsUpdated'),
                                        );
                                    }}
                                    ariaLabel={t('homeDashboard.toggleScannerFailedAria')}
                                    disabled={busy}
                                />
                                <PrefToggle
                                    title={t('homeDashboard.statusDownAlerts')}
                                    hint={t('homeDashboard.statusDownAlertsHint')}
                                    on={notifyStatusDown}
                                    onToggle={() => {
                                        const next = !notifyStatusDown;
                                        void savePref(
                                            { notifyStatusDown: next },
                                            () => setNotifyStatusDown(next),
                                            t('preferencesPage.notificationsUpdated'),
                                        );
                                    }}
                                    ariaLabel={t('homeDashboard.toggleStatusDownAria')}
                                    disabled={busy}
                                />
                                <PrefToggle
                                    title={t('homeDashboard.statusUpAlerts')}
                                    hint={t('homeDashboard.statusUpAlertsHint')}
                                    on={notifyStatusUp}
                                    onToggle={() => {
                                        const next = !notifyStatusUp;
                                        void savePref(
                                            { notifyStatusUp: next },
                                            () => setNotifyStatusUp(next),
                                            t('preferencesPage.notificationsUpdated'),
                                        );
                                    }}
                                    ariaLabel={t('homeDashboard.toggleStatusUpAria')}
                                    disabled={busy}
                                />
                                <PrefToggle
                                    title={t('homeDashboard.mediaJobFailedAlerts')}
                                    hint={t('homeDashboard.mediaJobFailedAlertsHint')}
                                    on={notifyMediaJobFailed}
                                    onToggle={() => {
                                        const next = !notifyMediaJobFailed;
                                        void savePref(
                                            { notifyMediaJobFailed: next },
                                            () => setNotifyMediaJobFailed(next),
                                            t('preferencesPage.notificationsUpdated'),
                                        );
                                    }}
                                    ariaLabel={t('homeDashboard.toggleMediaJobFailedAria')}
                                    disabled={busy}
                                />
                                <PrefToggle
                                    title={t('homeDashboard.mediaJobCompletedAlerts')}
                                    hint={t('homeDashboard.mediaJobCompletedAlertsHint')}
                                    on={notifyMediaJobCompleted}
                                    onToggle={() => {
                                        const next = !notifyMediaJobCompleted;
                                        void savePref(
                                            { notifyMediaJobCompleted: next },
                                            () => setNotifyMediaJobCompleted(next),
                                            t('preferencesPage.notificationsUpdated'),
                                        );
                                    }}
                                    ariaLabel={t('homeDashboard.toggleMediaJobCompletedAria')}
                                    disabled={busy}
                                />
                            </div>
                        </DashboardPanel>
                    )}
                </div>
            )}
        </DashboardPageShell>
    );
};

export default PreferencesPage;
