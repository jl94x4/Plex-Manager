import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Loader2, RefreshCw, Send } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { notifyInAppNotificationsChanged } from '../shared/inAppNotificationsRefresh';
import { SettingsToggleRow } from '../shared/ui';
import { SettingFieldLabel, SettingHint } from './SettingHint';
import { NotificationTemplatesPanel } from './NotificationTemplatesPanel';

const formatWhen = (iso?: string | null) => {
    if (!iso) return 'Never';
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
};

const formatDayKey = (iso?: string | null) => {
    if (!iso) return 'Unknown';
    try {
        return new Intl.DateTimeFormat(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        }).format(new Date(iso));
    } catch {
        return String(iso).slice(0, 10);
    }
};

const RecentNotificationsHistory: React.FC<{ items: any[] }> = ({ items }) => {
    const types = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const item of items) {
            const key = String(item?.type || 'unknown');
            counts[key] = (counts[key] || 0) + 1;
        }
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }, [items]);
    const [filter, setFilter] = useState('all');
    const filtered = useMemo(
        () => (filter === 'all' ? items : items.filter((item) => String(item?.type || 'unknown') === filter)),
        [items, filter],
    );
    const groups = useMemo(() => {
        const map = new Map<string, any[]>();
        for (const item of filtered) {
            const key = formatDayKey(item?.createdAt);
            const list = map.get(key) || [];
            list.push(item);
            map.set(key, list);
        }
        return [...map.entries()];
    }, [filtered]);

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => setFilter('all')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                        filter === 'all' ? 'border-plex text-plex bg-plex/10' : 'border-border text-muted hover:text-text'
                    }`}
                >
                    All ({items.length})
                </button>
                {types.map(([type, count]) => (
                    <button
                        key={type}
                        type="button"
                        onClick={() => setFilter(type)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                            filter === type ? 'border-plex text-plex bg-plex/10' : 'border-border text-muted hover:text-text'
                        }`}
                    >
                        {type} ({count})
                    </button>
                ))}
            </div>
            <div className="rounded-xl border border-border overflow-hidden divide-y divide-border/60">
                {groups.map(([day, rows]) => (
                    <div key={day}>
                        <div className="px-3 py-1.5 bg-white/[0.03] text-[10px] uppercase tracking-wider font-bold text-muted">
                            {day}
                        </div>
                        {rows.map((item) => (
                            <div key={item.id} className="px-3 py-2.5 bg-background/30 flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-semibold text-text truncate">{item.title}</p>
                                        {!item.readAt && (
                                            <span className="text-[10px] font-bold uppercase tracking-wide text-plex bg-plex/10 border border-plex/30 px-1.5 py-0.5 rounded">
                                                unread
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted mt-0.5">
                                        {item.username || item.userId || 'Unknown user'}
                                        {item.type ? ` · ${item.type}` : ''}
                                        {item.href ? ` · ${item.href}` : ''}
                                    </p>
                                    {item.body ? <p className="text-xs text-muted/80 mt-1 line-clamp-2">{item.body}</p> : null}
                                </div>
                                <p className="text-[10px] text-muted shrink-0 whitespace-nowrap">{formatWhen(item.createdAt)}</p>
                            </div>
                        ))}
                    </div>
                ))}
                {!filtered.length && (
                    <div className="px-4 py-8 text-center text-sm text-muted">No notifications for this filter.</div>
                )}
            </div>
        </div>
    );
};

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
    ntfy?: { enabled?: boolean; configured?: boolean; events?: Record<string, boolean> };
    webhook?: { enabled?: boolean; configured?: boolean; events?: Record<string, boolean> };
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
    requestNotReleasedNotifyEnabled: boolean;
    setRequestNotReleasedNotifyEnabled: (v: boolean) => void;
    requestNotReleasedNotifyEmail: boolean;
    setRequestNotReleasedNotifyEmail: (v: boolean) => void;
    requestNotReleasedNotifyInApp: boolean;
    setRequestNotReleasedNotifyInApp: (v: boolean) => void;
    requestNotReleasedNotifyWebPush: boolean;
    setRequestNotReleasedNotifyWebPush: (v: boolean) => void;
    notifyReleaseDatePreference: string;
    setNotifyReleaseDatePreference: (v: string) => void;
    webPushEnabled: boolean;
    setWebPushEnabled: (v: boolean) => void;
    notificationTemplates: Record<string, Record<string, string>>;
    setNotificationTemplates: (v: Record<string, Record<string, string>>) => void;
    notificationTemplateDefaults: Record<string, Record<string, string>>;
    notificationTemplateEvents: string[];
    notificationTemplateFields: Record<string, string[]>;
    ntfyEnabled: boolean;
    setNtfyEnabled: (v: boolean) => void;
    ntfyServerUrl: string;
    setNtfyServerUrl: (v: string) => void;
    ntfyTopic: string;
    setNtfyTopic: (v: string) => void;
    ntfyToken: string;
    setNtfyToken: (v: string) => void;
    ntfyPriority: number;
    setNtfyPriority: (v: number) => void;
    ntfyEvents: Record<string, boolean>;
    setNtfyEvents: (v: Record<string, boolean>) => void;
    webhookEnabled: boolean;
    setWebhookEnabled: (v: boolean) => void;
    webhookUrl: string;
    setWebhookUrl: (v: string) => void;
    webhookHeadersJson: string;
    setWebhookHeadersJson: (v: string) => void;
    webhookEvents: Record<string, boolean>;
    setWebhookEvents: (v: Record<string, boolean>) => void;
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
    requestNotReleasedNotifyEnabled,
    setRequestNotReleasedNotifyEnabled,
    requestNotReleasedNotifyEmail,
    setRequestNotReleasedNotifyEmail,
    requestNotReleasedNotifyInApp,
    setRequestNotReleasedNotifyInApp,
    requestNotReleasedNotifyWebPush,
    setRequestNotReleasedNotifyWebPush,
    notifyReleaseDatePreference,
    setNotifyReleaseDatePreference,
    webPushEnabled,
    setWebPushEnabled,
    notificationTemplates,
    setNotificationTemplates,
    notificationTemplateDefaults,
    notificationTemplateEvents,
    notificationTemplateFields,
    ntfyEnabled,
    setNtfyEnabled,
    ntfyServerUrl,
    setNtfyServerUrl,
    ntfyTopic,
    setNtfyTopic,
    ntfyToken,
    setNtfyToken,
    ntfyPriority,
    setNtfyPriority,
    ntfyEvents,
    setNtfyEvents,
    webhookEnabled,
    setWebhookEnabled,
    webhookUrl,
    setWebhookUrl,
    webhookHeadersJson,
    setWebhookHeadersJson,
    webhookEvents,
    setWebhookEvents,
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
        ntfy: false,
        webhook: false,
    });

    const eventLabels: Record<string, string> = {
        available: 'Available',
        approved: 'Approved',
        declined: 'Declined',
        season: 'Season',
        episode: 'New episode',
        admin_pending: 'Admin pending',
        collexions_failed: 'ColleXions failed',
        scanner_failed: 'Scanner failed',
        status_down: 'Status down',
        status_up: 'Status recovered',
        media_job_failed: 'Media job failed',
        media_job_completed: 'Media job finished',
    };

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
                        SMTP and Gotify admin alerts are on this same page (above and below).
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
                            detail={status?.email?.smtpReady ? 'SMTP looks configured.' : 'Configure under SMTP above.'}
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
                            detail={status?.gotify?.configured ? 'Admin Gotify alerts ready.' : 'Optional — configure Gotify below.'}
                        />
                        <Pill
                            ok={!!status?.ntfy?.configured}
                            label="ntfy"
                            detail={status?.ntfy?.configured ? 'ntfy topic ready.' : 'Optional — configure ntfy below.'}
                        />
                        <Pill
                            ok={!!status?.webhook?.configured}
                            label="Webhook"
                            detail={status?.webhook?.configured ? 'Generic webhook ready.' : 'Optional — configure webhook below.'}
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

            <div id={getSettingsSectionElementId('notifications-not-released')} className="scroll-mt-24 space-y-3">
                <h4 className="text-sm font-bold text-text uppercase tracking-wider">Not released yet</h4>
                <p className="text-xs text-muted max-w-2xl">
                    When someone requests a movie/show that isn’t out yet, tell them the expected date (defaults to digital release).
                    Those titles also appear on the Media Stack calendar when their date falls in the viewed month.
                </p>
                <SettingsToggleRow
                    title="Enable not-released alerts"
                    description="Notify the requester on create when the preferred release date is still in the future."
                    checked={requestNotReleasedNotifyEnabled}
                    onChange={setRequestNotReleasedNotifyEnabled}
                    border={false}
                />
                <div className={requestNotReleasedNotifyEnabled ? 'space-y-3' : 'space-y-3 opacity-50 pointer-events-none'}>
                    <div>
                        <SettingFieldLabel htmlFor="notifyReleaseDatePreference">Preferred release date</SettingFieldLabel>
                        <select
                            id="notifyReleaseDatePreference"
                            className="w-full max-w-md rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
                            value={notifyReleaseDatePreference || 'digital'}
                            onChange={(e) => setNotifyReleaseDatePreference(e.target.value)}
                        >
                            <option value="digital">Digital (preferred)</option>
                            <option value="theatrical">Theatrical / cinema</option>
                            <option value="physical">Physical</option>
                            <option value="tmdb">TMDB primary release date</option>
                        </select>
                    </div>
                    <SettingsToggleRow
                        title="Email"
                        checked={requestNotReleasedNotifyEmail}
                        onChange={setRequestNotReleasedNotifyEmail}
                        border={false}
                    />
                    <SettingsToggleRow
                        title="In-app bell"
                        checked={requestNotReleasedNotifyInApp}
                        onChange={setRequestNotReleasedNotifyInApp}
                        border={false}
                    />
                    <SettingsToggleRow
                        title="Browser push"
                        checked={requestNotReleasedNotifyWebPush}
                        onChange={setRequestNotReleasedNotifyWebPush}
                        border={false}
                    />
                </div>
            </div>

            <div id={getSettingsSectionElementId('notifications-ntfy')} className="scroll-mt-24 space-y-3">
                <h4 className="text-sm font-bold text-text uppercase tracking-wider">ntfy</h4>
                <p className="text-xs text-muted max-w-2xl">
                    Push to an ntfy topic for request lifecycle + admin pending (self-hosted or ntfy.sh).
                </p>
                <SettingsToggleRow
                    title="Enable ntfy"
                    description="Send selected events to your ntfy topic."
                    checked={ntfyEnabled}
                    onChange={setNtfyEnabled}
                    border={false}
                />
                <div className={ntfyEnabled ? 'space-y-3' : 'space-y-3 opacity-50 pointer-events-none'}>
                    <div>
                        <SettingFieldLabel htmlFor="ntfyServerUrl">Server URL</SettingFieldLabel>
                        <input
                            id="ntfyServerUrl"
                            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
                            placeholder="https://ntfy.sh"
                            value={ntfyServerUrl}
                            onChange={(e) => setNtfyServerUrl(e.target.value)}
                        />
                    </div>
                    <div>
                        <SettingFieldLabel htmlFor="ntfyTopic">Topic</SettingFieldLabel>
                        <input
                            id="ntfyTopic"
                            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
                            placeholder="server-manager-portal"
                            value={ntfyTopic}
                            onChange={(e) => setNtfyTopic(e.target.value)}
                        />
                    </div>
                    <div>
                        <SettingFieldLabel htmlFor="ntfyToken">Access token (optional)</SettingFieldLabel>
                        <input
                            id="ntfyToken"
                            type="password"
                            autoComplete="off"
                            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
                            value={ntfyToken}
                            onChange={(e) => setNtfyToken(e.target.value)}
                        />
                    </div>
                    <div>
                        <SettingFieldLabel htmlFor="ntfyPriority">Priority (1–5)</SettingFieldLabel>
                        <input
                            id="ntfyPriority"
                            type="number"
                            min={1}
                            max={5}
                            className="w-28 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
                            value={ntfyPriority}
                            onChange={(e) => setNtfyPriority(Math.max(1, Math.min(5, Number(e.target.value) || 3)))}
                        />
                    </div>
                    <div className="flex flex-wrap gap-3 pt-1">
                        {Object.keys(eventLabels).map((key) => (
                            <label key={key} className="inline-flex items-center gap-2 text-sm text-text cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={ntfyEvents?.[key] !== false}
                                    onChange={(e) => setNtfyEvents({ ...ntfyEvents, [key]: e.target.checked })}
                                    className="rounded border-border"
                                />
                                {eventLabels[key]}
                            </label>
                        ))}
                    </div>
                </div>
            </div>

            <div id={getSettingsSectionElementId('notifications-webhook')} className="scroll-mt-24 space-y-3">
                <h4 className="text-sm font-bold text-text uppercase tracking-wider">Generic webhook</h4>
                <p className="text-xs text-muted max-w-2xl">
                    POST JSON to any HTTPS endpoint. Optional body template under Notification templates (must be valid JSON).
                </p>
                <SettingsToggleRow
                    title="Enable webhook"
                    description="Send selected events as JSON POST requests."
                    checked={webhookEnabled}
                    onChange={setWebhookEnabled}
                    border={false}
                />
                <div className={webhookEnabled ? 'space-y-3' : 'space-y-3 opacity-50 pointer-events-none'}>
                    <div>
                        <SettingFieldLabel htmlFor="webhookUrl">Webhook URL</SettingFieldLabel>
                        <input
                            id="webhookUrl"
                            type="password"
                            autoComplete="off"
                            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
                            placeholder="https://example.com/hooks/portal"
                            value={webhookUrl}
                            onChange={(e) => setWebhookUrl(e.target.value)}
                        />
                    </div>
                    <div>
                        <SettingFieldLabel htmlFor="webhookHeadersJson">Extra headers (JSON object, optional)</SettingFieldLabel>
                        <textarea
                            id="webhookHeadersJson"
                            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm min-h-[72px]"
                            placeholder={'{"Authorization":"Bearer …"}'}
                            value={webhookHeadersJson}
                            onChange={(e) => setWebhookHeadersJson(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-wrap gap-3 pt-1">
                        {Object.keys(eventLabels).map((key) => (
                            <label key={key} className="inline-flex items-center gap-2 text-sm text-text cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={!!webhookEvents?.[key]}
                                    onChange={(e) => setWebhookEvents({ ...webhookEvents, [key]: e.target.checked })}
                                    className="rounded border-border"
                                />
                                {eventLabels[key]}
                            </label>
                        ))}
                    </div>
                    <SettingHint>
                        Defaults: Available on, other events off. Use templates → webhook JSON body to customize the payload.
                    </SettingHint>
                </div>
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
                        ['ntfy', 'ntfy'],
                        ['webhook', 'Webhook'],
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
                <h4 className="text-sm font-bold text-text uppercase tracking-wider">Notification history</h4>
                <p className="text-xs text-muted">
                    Shared in-app store across members. Filter by type to diagnose mapping / notify issues.
                </p>
                {!recent.length ? (
                    <div className="rounded-xl border border-border bg-background/40 px-4 py-8 text-center text-sm text-muted">
                        No in-app notifications stored yet.
                    </div>
                ) : (
                    <RecentNotificationsHistory items={recent} />
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
