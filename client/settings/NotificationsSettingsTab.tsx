import React, { useCallback, useEffect, useState } from 'react';
import { Bell, Loader2, RefreshCw, Send } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { notifyInAppNotificationsChanged } from '../shared/inAppNotificationsRefresh';
import { SettingsToggleRow } from '../shared/ui';
import { SettingFieldLabel, SettingHint } from './SettingHint';
import { NotificationTemplatesPanel } from './NotificationTemplatesPanel';

type StatusPayload = {
    requestAvailable?: {
        enabled?: boolean;
        email?: boolean;
        inApp?: boolean;
        webPush?: boolean;
        discord?: boolean;
        discordWebhookConfigured?: boolean;
    };
    webPush?: {
        enabled?: boolean;
        vapidReady?: boolean;
        usersWithSubscriptions?: number;
        deviceCount?: number;
        updatedAt?: string | null;
    };
    email?: { smtpReady?: boolean; requestAvailableAllowed?: boolean };
    discord?: { enabled?: boolean; webhookConfigured?: boolean };
    gotify?: { enabled?: boolean; configured?: boolean };
    inApp?: {
        total?: number;
        unread?: number;
        updatedAt?: string | null;
        byType?: Record<string, number>;
    };
    jobs?: {
        requestEngine?: string;
        seerrAvailableNotify?: {
            lastRun?: string | null;
            nextRun?: string | null;
            running?: boolean;
            lastError?: string | null;
        } | null;
        requestStatusSync?: {
            lastRun?: string | null;
            nextRun?: string | null;
            running?: boolean;
            lastError?: string | null;
        } | null;
    };
    seerrSnapshot?: { updatedAt?: string | null; trackedRequests?: number };
};

type RecentItem = {
    id: string;
    userId?: string;
    username?: string | null;
    type?: string;
    title?: string;
    body?: string;
    readAt?: string | null;
    createdAt?: string | null;
};

type Props = {
    requestAvailableNotifyEnabled: boolean;
    setRequestAvailableNotifyEnabled: (v: boolean) => void;
    requestAvailableNotifyEmail: boolean;
    setRequestAvailableNotifyEmail: (v: boolean) => void;
    requestAvailableNotifyInApp: boolean;
    setRequestAvailableNotifyInApp: (v: boolean) => void;
    requestAvailableNotifyWebPush: boolean;
    setRequestAvailableNotifyWebPush: (v: boolean) => void;
    requestAvailableNotifyDiscord: boolean;
    setRequestAvailableNotifyDiscord: (v: boolean) => void;
    requestAvailableDiscordWebhookUrl: string;
    setRequestAvailableDiscordWebhookUrl: (v: string) => void;
    webPushEnabled: boolean;
    setWebPushEnabled: (v: boolean) => void;
    notificationTemplates: Record<string, Record<string, string>>;
    setNotificationTemplates: (v: Record<string, Record<string, string>>) => void;
    notificationTemplateDefaults: Record<string, Record<string, string>>;
    notificationTemplateEvents: string[];
    notificationTemplateFields: Record<string, string[]>;
    onOpenGotify: () => void;
    onOpenSmtp: () => void;
    addToast: (message: string, type?: 'success' | 'error') => void;
    getSettingsSectionElementId: (id: string) => string;
};

const Pill: React.FC<{ ok: boolean; label: string; detail?: string }> = ({ ok, label, detail }) => (
    <div className={`rounded-xl border px-3 py-2.5 ${ok ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
        <p className="text-xs font-bold uppercase tracking-wider text-text">{label}</p>
        <p className={`text-sm font-semibold mt-0.5 ${ok ? 'text-emerald-300' : 'text-amber-200'}`}>
            {ok ? 'Ready' : 'Needs setup'}
        </p>
        {detail ? <p className="text-[11px] text-muted mt-1 leading-snug">{detail}</p> : null}
    </div>
);

const formatWhen = (iso?: string | null) => {
    if (!iso) return 'Never';
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
};

export const NotificationsSettingsTab: React.FC<Props> = ({
    requestAvailableNotifyEnabled,
    setRequestAvailableNotifyEnabled,
    requestAvailableNotifyEmail,
    setRequestAvailableNotifyEmail,
    requestAvailableNotifyInApp,
    setRequestAvailableNotifyInApp,
    requestAvailableNotifyWebPush,
    setRequestAvailableNotifyWebPush,
    requestAvailableNotifyDiscord,
    setRequestAvailableNotifyDiscord,
    requestAvailableDiscordWebhookUrl,
    setRequestAvailableDiscordWebhookUrl,
    webPushEnabled,
    setWebPushEnabled,
    notificationTemplates,
    setNotificationTemplates,
    notificationTemplateDefaults,
    notificationTemplateEvents,
    notificationTemplateFields,
    onOpenGotify,
    onOpenSmtp,
    addToast,
    getSettingsSectionElementId,
}) => {
    const [status, setStatus] = useState<StatusPayload | null>(null);
    const [recent, setRecent] = useState<RecentItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [testing, setTesting] = useState(false);
    const [testChannels, setTestChannels] = useState({
        inApp: true,
        webPush: false,
        email: false,
        discord: false,
    });

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const [statusData, recentData] = await Promise.all([
                apiFetch('/api/admin/notifications/status'),
                apiFetch('/api/admin/notifications/recent?limit=40'),
            ]);
            setStatus(statusData || null);
            setRecent(Array.isArray(recentData?.items) ? recentData.items : []);
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Failed to load notification status', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const handleTest = async () => {
        const channels = Object.entries(testChannels)
            .filter(([, on]) => on)
            .map(([key]) => key);
        if (!channels.length) {
            addToast('Pick at least one test channel.', 'error');
            return;
        }
        setTesting(true);
        try {
            const result = await apiFetch('/api/admin/notifications/test', {
                method: 'POST',
                body: JSON.stringify({
                    channels,
                    title: 'Test notification',
                    body: 'This is a test from Settings → Notifications.',
                }),
            });
            const ok = !!result?.success;
            const bits = [
                result?.results?.inApp ? 'in-app' : null,
                result?.results?.webPush ? 'web push' : null,
                result?.results?.email ? 'email' : null,
                result?.results?.discord ? 'discord' : null,
            ].filter(Boolean);
            if (ok) {
                addToast(`Test sent (${bits.join(', ') || 'ok'}). Check the bell.`, 'success');
                if (result?.results?.inApp) {
                    notifyInAppNotificationsChanged();
                }
            } else {
                const errors = Array.isArray(result?.results?.errors) ? result.results.errors.join('; ') : 'No channel succeeded';
                addToast(errors, 'error');
            }
            await refresh();
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Test failed', 'error');
        } finally {
            setTesting(false);
        }
    };

    const engine = status?.jobs?.requestEngine || '—';
    const notifyJob = engine === 'seerr'
        ? status?.jobs?.seerrAvailableNotify
        : status?.jobs?.requestStatusSync;

    return (
        <div className="mb-8 space-y-8">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h3 className="text-xl font-bold text-plex mb-1 border-b border-border pb-2 inline-flex items-center gap-2">
                        <Bell className="w-5 h-5" />
                        Notifications
                    </h3>
                    <p className="text-sm text-muted max-w-2xl mt-2">
                        Hub for request-available alerts, browser push, Discord, in-app bell history, and send-to-myself tests.
                        Gotify admin alerts stay under their own tab.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={refresh}
                    disabled={loading}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background text-sm font-bold text-text hover:border-plex/40 hover:text-plex transition-colors disabled:opacity-50"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Refresh status
                </button>
            </div>

            <div id={getSettingsSectionElementId('notifications-status')} className="scroll-mt-24 space-y-3">
                <h4 className="text-sm font-bold text-text uppercase tracking-wider">Health</h4>
                {loading && !status ? (
                    <p className="text-sm text-muted flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                        <Pill
                            ok={!!status?.requestAvailable?.enabled}
                            label="Request available"
                            detail={`Engine: ${engine}. In-app store: ${status?.inApp?.total ?? 0} total / ${status?.inApp?.unread ?? 0} unread.`}
                        />
                        <Pill
                            ok={!!status?.email?.smtpReady}
                            label="Email (SMTP)"
                            detail={status?.email?.smtpReady ? 'SMTP looks configured.' : 'Configure under SMTP Alerts.'}
                        />
                        <Pill
                            ok={!!status?.webPush?.enabled && !!status?.webPush?.vapidReady}
                            label="Web Push"
                            detail={`${status?.webPush?.deviceCount ?? 0} device(s) across ${status?.webPush?.usersWithSubscriptions ?? 0} user(s).`}
                        />
                        <Pill
                            ok={!!status?.discord?.enabled && !!status?.discord?.webhookConfigured}
                            label="Discord"
                            detail={status?.discord?.webhookConfigured ? 'Webhook saved.' : 'Add a Discord webhook URL below.'}
                        />
                        <Pill
                            ok={!!status?.gotify?.configured}
                            label="Gotify"
                            detail={status?.gotify?.configured ? 'Admin Gotify alerts ready.' : 'Optional — configure under Gotify Alerts.'}
                        />
                        <Pill
                            ok={!notifyJob?.lastError}
                            label={engine === 'seerr' ? 'Seerr notify job' : 'Portal status sync'}
                            detail={`Last run: ${formatWhen(notifyJob?.lastRun)}.${notifyJob?.lastError ? ` Error: ${notifyJob.lastError}` : ''}`}
                        />
                    </div>
                )}
                {engine === 'seerr' && (
                    <p className="text-xs text-muted">
                        Seerr snapshot tracks {status?.seerrSnapshot?.trackedRequests ?? 0} request(s)
                        {status?.seerrSnapshot?.updatedAt ? ` · updated ${formatWhen(status.seerrSnapshot.updatedAt)}` : ''}.
                    </p>
                )}
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={onOpenSmtp} className="text-xs font-bold text-plex hover:underline">Open SMTP settings</button>
                    <span className="text-muted text-xs">·</span>
                    <button type="button" onClick={onOpenGotify} className="text-xs font-bold text-plex hover:underline">Open Gotify settings</button>
                </div>
            </div>

            <div id={getSettingsSectionElementId('notifications-request-available')} className="scroll-mt-24 space-y-3">
                <h4 className="text-sm font-bold text-text uppercase tracking-wider">Request available</h4>
                <p className="text-xs text-muted max-w-2xl">
                    When a request finishes downloading and becomes available, notify the requester.
                    Same settings also appear under Request Discovery.
                </p>
                <SettingsToggleRow
                    title="Enable notifications"
                    description="Master switch for request-available alerts (portal or Seerr engine)."
                    checked={requestAvailableNotifyEnabled}
                    onChange={setRequestAvailableNotifyEnabled}
                    border={false}
                />
                <div className={requestAvailableNotifyEnabled ? 'space-y-0' : 'space-y-0 opacity-50 pointer-events-none'}>
                    <SettingsToggleRow
                        title="Email"
                        description="SMTP email to the requester. Requires SMTP."
                        checked={requestAvailableNotifyEmail}
                        onChange={setRequestAvailableNotifyEmail}
                        border={false}
                    />
                    <SettingsToggleRow
                        title="In-app bell"
                        description="Unread item in the portal notification bell."
                        checked={requestAvailableNotifyInApp}
                        onChange={setRequestAvailableNotifyInApp}
                        border={false}
                    />
                    <SettingsToggleRow
                        title="Browser push"
                        description="Web Push to subscribed browsers/devices."
                        checked={requestAvailableNotifyWebPush}
                        onChange={setRequestAvailableNotifyWebPush}
                        border={false}
                    />
                    <SettingsToggleRow
                        title="Discord webhook"
                        description="Post to Discord when any request becomes available."
                        checked={requestAvailableNotifyDiscord}
                        onChange={setRequestAvailableNotifyDiscord}
                        border={false}
                    />
                    {requestAvailableNotifyDiscord && (
                        <div className="pt-1 pb-3">
                            <SettingFieldLabel htmlFor="notificationsDiscordWebhookUrl">
                                Discord webhook URL
                            </SettingFieldLabel>
                            <input
                                id="notificationsDiscordWebhookUrl"
                                type="password"
                                autoComplete="off"
                                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
                                placeholder="https://discord.com/api/webhooks/..."
                                value={requestAvailableDiscordWebhookUrl}
                                onChange={(e) => setRequestAvailableDiscordWebhookUrl(e.target.value)}
                            />
                            <p className="text-[11px] text-muted mt-1.5">
                                Leave as dots when editing other settings to keep the saved webhook.
                            </p>
                        </div>
                    )}
                </div>
                <SettingsToggleRow
                    title="Enable Web Push (global)"
                    description="Lets members subscribe their browser. Required for browser push channel above."
                    checked={webPushEnabled}
                    onChange={setWebPushEnabled}
                    border={false}
                />
            </div>

            <NotificationTemplatesPanel
                notificationTemplates={notificationTemplates}
                setNotificationTemplates={setNotificationTemplates}
                defaults={notificationTemplateDefaults}
                events={notificationTemplateEvents}
                eventFields={notificationTemplateFields}
                getSettingsSectionElementId={getSettingsSectionElementId}
            />

            <div id={getSettingsSectionElementId('notifications-test')} className="scroll-mt-24 space-y-3">
                <h4 className="text-sm font-bold text-text uppercase tracking-wider">Send test to me</h4>
                <p className="text-xs text-muted max-w-2xl">
                    Delivers a test to your admin account only. Use this to verify the in-app bell path before chasing Seerr mapping issues.
                </p>
                <div className="flex flex-wrap gap-4">
                    {([
                        ['inApp', 'In-app bell'],
                        ['webPush', 'Web Push'],
                        ['email', 'Email'],
                        ['discord', 'Discord'],
                    ] as const).map(([key, label]) => (
                        <label key={key} className="inline-flex items-center gap-2 text-sm text-text cursor-pointer">
                            <input
                                type="checkbox"
                                checked={!!testChannels[key]}
                                onChange={(e) => setTestChannels((prev) => ({ ...prev, [key]: e.target.checked }))}
                                className="rounded border-border"
                            />
                            {label}
                        </label>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={handleTest}
                    disabled={testing}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-plex text-background font-bold hover:bg-plex-hover transition-colors disabled:opacity-50"
                >
                    {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {testing ? 'Sending…' : 'Send test'}
                </button>
            </div>

            <div id={getSettingsSectionElementId('notifications-recent')} className="scroll-mt-24 space-y-3">
                <h4 className="text-sm font-bold text-text uppercase tracking-wider">Recent in-app notifications</h4>
                <p className="text-xs text-muted">
                    Latest items written to the shared store. If this stays empty while requests become available, the Seerr/portal user mapping or notify job is the problem — not the bell UI.
                </p>
                {!recent.length ? (
                    <div className="rounded-xl border border-border bg-background/40 px-4 py-8 text-center text-sm text-muted">
                        No in-app notifications stored yet.
                    </div>
                ) : (
                    <div className="rounded-xl border border-border overflow-hidden divide-y divide-border/60">
                        {recent.map((item) => (
                            <div key={item.id} className="px-3 py-2.5 bg-background/30 flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-text truncate">{item.title}</p>
                                    <p className="text-xs text-muted mt-0.5">
                                        {item.username || item.userId || 'Unknown user'}
                                        {item.type ? ` · ${item.type}` : ''}
                                        {item.readAt ? ' · read' : ' · unread'}
                                    </p>
                                    {item.body ? <p className="text-xs text-muted/80 mt-1 line-clamp-2">{item.body}</p> : null}
                                </div>
                                <p className="text-[10px] text-muted shrink-0 whitespace-nowrap">{formatWhen(item.createdAt)}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-lg border border-border bg-background/40 p-4">
                <SettingFieldLabel hint={<SettingHint>Save via the footer button to persist channel toggles and Discord webhook.</SettingHint>}>
                    Remember to Save Settings
                </SettingFieldLabel>
            </div>
        </div>
    );
};

export default NotificationsSettingsTab;
