import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    Bell,
    Calendar,
    CheckCheck,
    ChevronRight,
    CircleCheck,
    CircleX,
    Clapperboard,
    ClipboardList,
    Inbox,
    LifeBuoy,
    Radar,
    Layers,
    AlertTriangle,
    Cpu,
    Sparkles,
    Trash2,
    Tv,
} from 'lucide-react';
import { apiFetch } from './api';
import { IN_APP_NOTIFICATIONS_CHANGED_EVENT, notifyInAppNotificationsChanged } from './inAppNotificationsRefresh';
import { resolveNotificationDestination } from './notificationDestination';
import { resolveTmdbImageUrl } from '../discovery/tmdbImageUrl';
import { useDiscoverI18n } from '../discovery/i18n';
import type { DiscoverTranslate } from '../discovery/i18n/types';

export type InAppNotification = {
    id: string;
    type?: string;
    title: string;
    body?: string;
    href?: string;
    readAt?: string | null;
    createdAt?: string;
    meta?: {
        requestId?: string | number | null;
        mediaType?: string | null;
        tmdbId?: string | number | null;
        posterUrl?: string | null;
        posterPath?: string | null;
        [key: string]: unknown;
    };
};

const formatRelative = (iso: string | undefined, t: DiscoverTranslate) => {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms) || ms < 0) return '';
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return t('common.justNow');
    if (mins < 60) return t('common.minutesAgo', { count: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 48) return t('common.hoursAgo', { count: hours });
    const days = Math.floor(hours / 24);
    return t('common.daysAgo', { count: days });
};

const typeVisual = (type?: string) => {
    switch (String(type || '')) {
        case 'request_available':
            return {
                Icon: CircleCheck,
                tone: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/35',
                tile: 'from-emerald-500/30 via-emerald-500/10 to-card',
            };
        case 'request_approved':
            return {
                Icon: Sparkles,
                tone: 'text-plex bg-plex/15 border-plex/35',
                tile: 'from-plex/30 via-plex/10 to-card',
            };
        case 'request_declined':
            return {
                Icon: CircleX,
                tone: 'text-rose-400 bg-rose-500/15 border-rose-500/35',
                tile: 'from-rose-500/30 via-rose-500/10 to-card',
            };
        case 'request_season_available':
            return {
                Icon: Tv,
                tone: 'text-sky-400 bg-sky-500/15 border-sky-500/35',
                tile: 'from-sky-500/30 via-sky-500/10 to-card',
            };
        case 'request_new_episode':
            return {
                Icon: Clapperboard,
                tone: 'text-violet-300 bg-violet-500/15 border-violet-500/35',
                tile: 'from-violet-500/30 via-violet-500/10 to-card',
            };
        case 'admin_pending':
            return {
                Icon: ClipboardList,
                tone: 'text-amber-300 bg-amber-500/15 border-amber-500/35',
                tile: 'from-amber-400/30 via-amber-500/10 to-card',
            };
        case 'request_not_released':
            return {
                Icon: Calendar,
                tone: 'text-sky-300 bg-sky-500/15 border-sky-500/35',
                tile: 'from-cyan-500/25 via-sky-500/10 to-card',
            };
        case 'admin_test':
            return {
                Icon: Bell,
                tone: 'text-plex bg-plex/15 border-plex/35',
                tile: 'from-plex/25 via-plex/10 to-card',
            };
        case 'support_ticket':
            return {
                Icon: LifeBuoy,
                tone: 'text-plex bg-plex/15 border-plex/35',
                tile: 'from-orange-400/25 via-plex/10 to-card',
            };
        case 'collexions_failed':
            return {
                Icon: Layers,
                tone: 'text-rose-400 bg-rose-500/15 border-rose-500/35',
                tile: 'from-rose-500/30 via-fuchsia-500/10 to-card',
            };
        case 'scanner_failed':
            return {
                Icon: Radar,
                tone: 'text-amber-300 bg-amber-500/15 border-amber-500/35',
                tile: 'from-amber-500/30 via-orange-500/10 to-card',
            };
        case 'status_down':
            return {
                Icon: AlertTriangle,
                tone: 'text-rose-400 bg-rose-500/15 border-rose-500/35',
                tile: 'from-rose-600/35 via-rose-500/10 to-card',
            };
        case 'status_up':
            return {
                Icon: CircleCheck,
                tone: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/35',
                tile: 'from-emerald-400/30 via-teal-500/10 to-card',
            };
        case 'media_job_failed':
            return {
                Icon: CircleX,
                tone: 'text-rose-400 bg-rose-500/15 border-rose-500/35',
                tile: 'from-rose-500/30 via-orange-500/10 to-card',
            };
        case 'media_job_completed':
            return {
                Icon: Cpu,
                tone: 'text-plex bg-plex/15 border-plex/35',
                tile: 'from-plex/30 via-sky-500/10 to-card',
            };
        default:
            return {
                Icon: Inbox,
                tone: 'text-plex bg-plex/15 border-plex/35',
                tile: 'from-plex/20 via-white/5 to-card',
            };
    }
};

const posterSrcFor = (item: InAppNotification) => {
    const url = String(item.meta?.posterUrl || '').trim();
    if (url) return url;
    return resolveTmdbImageUrl(String(item.meta?.posterPath || ''), 'w185');
};

const NotificationArtwork: React.FC<{ item: InAppNotification }> = ({ item }) => {
    const [broken, setBroken] = useState(false);
    const posterSrc = posterSrcFor(item);
    const showPoster = Boolean(posterSrc) && !broken;
    const { Icon, tone, tile } = typeVisual(item.type);

    return (
        <span
            className={`relative mt-0.5 inline-flex h-14 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border shadow-[0_8px_18px_rgba(0,0,0,0.28)] transition-transform duration-300 ease-out group-hover:scale-[1.06] group-hover:-translate-y-0.5 ${
                showPoster ? 'border-white/15 bg-black/40' : `border ${tone} bg-gradient-to-br ${tile}`
            }`}
        >
            {showPoster ? (
                <img
                    src={posterSrc}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                    onError={() => setBroken(true)}
                />
            ) : (
                <Icon className="h-4 w-4 drop-shadow-[0_1px_4px_rgba(0,0,0,0.45)]" />
            )}
            {showPoster && (
                <span className={`absolute bottom-0.5 right-0.5 inline-flex h-4 w-4 items-center justify-center rounded-md border shadow-sm ${tone}`}>
                    <Icon className="h-2.5 w-2.5" />
                </span>
            )}
        </span>
    );
};

type Props = {
    onNavigate?: (route: string, options?: { path?: string; reviewId?: number }) => void;
    className?: string;
    buttonClassName?: string;
    /** Panel opens above the bell (desktop sidebar) or below (mobile top bar). */
    placement?: 'up' | 'down';
};
type NotificationFilter = 'all' | 'unread';

type PanelBox = {
    left: number;
    width: number;
    maxHeight: number;
    top?: number;
    bottom?: number;
};

export const InAppNotificationsBell: React.FC<Props> = ({
    onNavigate,
    className = '',
    buttonClassName = '',
    placement = 'down',
}) => {
    const { t } = useDiscoverI18n();
    const [open, setOpen] = useState(false);
    const [filterMode, setFilterMode] = useState<NotificationFilter>('all');
    const [items, setItems] = useState<InAppNotification[]>([]);
    const [unread, setUnread] = useState(0);
    const [loading, setLoading] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [panelBox, setPanelBox] = useState<PanelBox | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const refresh = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
        try {
            if (!silent) setLoading(true);
            const params = new URLSearchParams({ limit: '50' });
            if (filterMode === 'unread') params.set('unreadOnly', '1');
            const data = await apiFetch(`/api/notifications?${params.toString()}`);
            setItems(Array.isArray(data?.items) ? data.items : []);
            setUnread(Number(data?.unread) || 0);
        } catch {
            // ignore — bell stays quiet if API unavailable
        } finally {
            if (!silent) setLoading(false);
        }
    }, [filterMode]);

    useEffect(() => {
        refresh();

        const onChanged = () => { refresh({ silent: true }); };
        const onFocus = () => { refresh({ silent: true }); };
        const onVisibility = () => {
            if (document.visibilityState === 'visible') refresh({ silent: true });
        };

        window.addEventListener(IN_APP_NOTIFICATIONS_CHANGED_EVENT, onChanged);
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisibility);

        const id = window.setInterval(() => {
            if (document.visibilityState === 'visible') refresh({ silent: true });
        }, open ? 12_000 : 30_000);

        return () => {
            window.clearInterval(id);
            window.removeEventListener(IN_APP_NOTIFICATIONS_CHANGED_EVENT, onChanged);
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [refresh, open]);

    const updatePanelBox = useCallback(() => {
        const button = buttonRef.current;
        if (!button) return;
        const rect = button.getBoundingClientRect();
        const margin = 12;

        if (placement === 'up') {
            // Half the previous “almost full viewport” panel — tall enough to scan, not dominate.
            const available = Math.max(260, rect.top - margin * 2);
            const maxHeight = Math.max(240, Math.min(Math.floor(available * 0.5), Math.floor(window.innerHeight * 0.48)));
            const width = Math.min(
                Math.max(300, Math.floor(window.innerWidth * 0.36)),
                window.innerWidth - margin * 2,
                480,
            );
            let left = Math.max(margin, rect.left - 8);
            left = Math.min(left, window.innerWidth - margin - width);
            left = Math.max(margin, left);
            setPanelBox({
                left,
                width,
                maxHeight,
                bottom: window.innerHeight - rect.top + 8,
            });
            return;
        }

        // Mobile top bar: nearly full-width sheet under the bell so long labels fit.
        const width = Math.min(window.innerWidth - margin * 2, 420);
        const maxHeight = Math.max(
            220,
            Math.min(Math.floor(window.innerHeight * 0.52), window.innerHeight - rect.bottom - margin * 2),
        );
        const left = window.innerWidth <= 480
            ? margin
            : Math.min(Math.max(rect.right - width, margin), window.innerWidth - margin - width);
        setPanelBox({
            left,
            width,
            maxHeight,
            top: rect.bottom + margin,
        });
    }, [placement]);

    useLayoutEffect(() => {
        if (!open) {
            setPanelBox(null);
            return;
        }
        updatePanelBox();
        const onWin = () => updatePanelBox();
        window.addEventListener('resize', onWin);
        window.addEventListener('scroll', onWin, true);
        return () => {
            window.removeEventListener('resize', onWin);
            window.removeEventListener('scroll', onWin, true);
        };
    }, [open, updatePanelBox]);

    useEffect(() => {
        if (!open) return;
        const onDoc = (event: MouseEvent) => {
            const target = event.target as Node;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            setOpen(false);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const markAllRead = async () => {
        try {
            await apiFetch('/api/notifications/read', {
                method: 'POST',
                body: JSON.stringify({ all: true }),
            });
            setItems((prev) => (
                filterMode === 'unread'
                    ? []
                    : prev.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() }))
            ));
            setUnread(0);
            notifyInAppNotificationsChanged();
        } catch {
            // ignore
        }
    };

    const clearAll = async () => {
        if (clearing || !items.length) return;
        try {
            setClearing(true);
            await apiFetch('/api/notifications/clear', {
                method: 'POST',
                body: JSON.stringify({ all: true }),
            });
            setItems([]);
            setUnread(0);
            notifyInAppNotificationsChanged();
        } catch {
            // ignore
        } finally {
            setClearing(false);
        }
    };

    const openItem = async (item: InAppNotification) => {
        if (!item.readAt) {
            try {
                await apiFetch('/api/notifications/read', {
                    method: 'POST',
                    body: JSON.stringify({ ids: [item.id] }),
                });
                setItems((prev) => (
                    filterMode === 'unread'
                        ? prev.filter((row) => row.id !== item.id)
                        : prev.map((row) => (row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row))
                ));
                setUnread((n) => Math.max(0, n - 1));
            } catch {
                // ignore
            }
        }
        setOpen(false);

        const dest = resolveNotificationDestination(item);
        if (dest.kind === 'discovery') {
            onNavigate?.('discovery', { path: dest.path });
            return;
        }
        if (dest.kind === 'requests') {
            onNavigate?.('requests', dest.reviewId ? { reviewId: dest.reviewId } : undefined);
            return;
        }
        if (dest.kind === 'home') {
            onNavigate?.('user');
            return;
        }
        if (dest.kind === 'settings') {
            onNavigate?.('settings');
            return;
        }
        if (dest.kind === 'support') {
            onNavigate?.('support', { path: dest.path });
            return;
        }
        if (dest.kind === 'route') {
            onNavigate?.(dest.route);
            return;
        }
        if (dest.kind === 'external' && dest.href.startsWith('/')) {
            window.location.assign(dest.href);
            return;
        }
        onNavigate?.('discovery', { path: '/discovery/requests' });
    };

    const panel = open && panelBox && typeof document !== 'undefined'
        ? createPortal(
            <div
                ref={panelRef}
                role="dialog"
                aria-label={t('notifications.title')}
                className={`notif-panel-enter fixed flex flex-col overflow-hidden rounded-2xl border border-border/80 shadow-[0_24px_64px_rgba(0,0,0,0.55)] z-[400] bg-card/90 backdrop-blur-xl ${
                    placement === 'up' ? 'notif-panel-enter-up' : 'notif-panel-enter-down'
                }`}
                style={{
                    left: panelBox.left,
                    width: panelBox.width,
                    ...(panelBox.top != null && panelBox.bottom != null
                        ? { top: panelBox.top, bottom: panelBox.bottom }
                        : panelBox.bottom != null
                            ? { bottom: panelBox.bottom, height: panelBox.maxHeight, maxHeight: panelBox.maxHeight }
                            : { top: panelBox.top, height: panelBox.maxHeight, maxHeight: panelBox.maxHeight }),
                }}
            >
                <div className="relative shrink-0 border-b border-border/70">
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-plex/20 via-plex/5 to-transparent" />
                    <div className="relative flex flex-col gap-2 px-3 py-3 sm:px-5">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="notif-header-icon inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-plex/35 bg-plex/15 text-plex">
                                <Bell className="h-3.5 w-3.5" />
                            </span>
                            <div className="min-w-0">
                                <p className="text-xs font-bold tracking-wide text-text truncate">{t('notifications.title')}</p>
                                <p className="text-[10px] text-muted mt-0.5 truncate">
                                    {unread > 0
                                        ? t('notifications.unreadCount', { count: unread })
                                        : t('notifications.allCaughtUp')}
                                </p>
                            </div>
                        </div>
                        {(unread > 0 || items.length > 0) && (
                            <div className="flex flex-wrap items-center gap-1.5">
                                <div className="inline-flex items-center rounded-lg border border-border/80 bg-black/20 p-0.5">
                                    <button
                                        type="button"
                                        onClick={() => setFilterMode('all')}
                                        className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-colors ${
                                            filterMode === 'all'
                                                ? 'bg-plex/20 text-plex'
                                                : 'text-muted hover:text-text'
                                        }`}
                                    >
                                        {t('notifications.filterAll')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFilterMode('unread')}
                                        className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-colors ${
                                            filterMode === 'unread'
                                                ? 'bg-plex/20 text-plex'
                                                : 'text-muted hover:text-text'
                                        }`}
                                    >
                                        {t('notifications.filterUnread')}
                                    </button>
                                </div>
                                {unread > 0 && (
                                    <button
                                        type="button"
                                        onClick={markAllRead}
                                        className="notif-mark-read inline-flex min-h-8 items-center gap-1 rounded-lg border border-plex/30 bg-plex/10 px-2.5 py-1 text-[10px] font-semibold text-plex transition-all duration-200 hover:bg-plex/20 hover:border-plex/50 active:scale-[0.97]"
                                    >
                                        <CheckCheck className="h-3 w-3 shrink-0" />
                                        <span className="whitespace-nowrap">{t('notifications.markAllRead')}</span>
                                    </button>
                                )}
                                {items.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={clearAll}
                                        disabled={clearing}
                                        className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-border/80 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-muted transition-all duration-200 hover:text-text hover:border-border hover:bg-white/10 active:scale-[0.97] disabled:opacity-50"
                                    >
                                        <Trash2 className="h-3 w-3 shrink-0" />
                                        <span className="whitespace-nowrap">{t('notifications.clearAll')}</span>
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    {loading && !items.length ? (
                        <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
                            <span className="h-10 w-10 rounded-2xl border border-border bg-white/5 animate-pulse" />
                            <p className="text-xs text-muted">{t('common.loadingMore')}</p>
                        </div>
                    ) : !items.length ? (
                        <div className="h-full flex flex-col items-center justify-center gap-3 px-8 text-center">
                            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-plex/25 bg-plex/10 text-plex">
                                <Inbox className="h-5 w-5" />
                            </span>
                            <div>
                                <p className="text-sm font-semibold text-text">{t('notifications.empty')}</p>
                                <p className="text-xs text-muted mt-1 max-w-sm">{t('notifications.emptyHint')}</p>
                            </div>
                        </div>
                    ) : (
                        <ul className="py-1">
                            {items.map((item, index) => {
                                const unreadItem = !item.readAt;
                                const dest = resolveNotificationDestination(item);
                                const repeatCount = Math.max(1, Number(item?.meta?.repeatCount || 1));
                                return (
                                    <li
                                        key={item.id}
                                        className="notif-row-enter"
                                        style={{ animationDelay: `${Math.min(index, 12) * 28}ms` }}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => openItem(item)}
                                            className={`notif-row-btn group relative w-full text-left px-3.5 sm:px-4 py-3 transition-all duration-200 border-b border-border/40 last:border-b-0 hover:bg-plex/[0.07] focus-visible:outline-none focus-visible:bg-plex/10 ${
                                                unreadItem ? 'bg-plex/[0.045]' : ''
                                            }`}
                                        >
                                            {unreadItem && (
                                                <span className={`notif-unread-bar absolute left-0 top-3 bottom-3 w-0.5 rounded-full ${item.type === 'media_job_completed' ? 'bg-emerald-500' : 'bg-plex'}`} />
                                            )}
                                            <div className="flex items-start gap-2.5">
                                                <NotificationArtwork item={item} />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <p className={`text-xs leading-snug ${unreadItem ? 'font-bold text-text' : 'font-semibold text-text/90'}`}>
                                                            {item.title}
                                                        </p>
                                                        {repeatCount > 1 && (
                                                            <span className="shrink-0 rounded-md border border-plex/30 bg-plex/10 px-1.5 py-0.5 text-[10px] font-bold text-plex">
                                                                {t('notifications.repeats', { count: repeatCount })}
                                                            </span>
                                                        )}
                                                        <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-plex" />
                                                    </div>
                                                    {item.body ? (
                                                        <p className="text-[11px] text-muted mt-0.5 line-clamp-2 leading-relaxed">{item.body}</p>
                                                    ) : null}
                                                    <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px]">
                                                        <span className="text-muted/80">{formatRelative(item.createdAt, t)}</span>
                                                        <span className="text-border">·</span>
                                                        <span className="font-semibold text-plex/90 transition-colors duration-200 group-hover:text-plex">
                                                            {t(dest.labelKey)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>,
            document.body,
        )
        : null;

    return (
        <div className={`relative ${className}`}>
            <button
                ref={buttonRef}
                type="button"
                onClick={() => {
                    setOpen((v) => !v);
                    if (!open) refresh({ silent: true });
                }}
                className={buttonClassName || 'relative text-muted hover:text-text transition-colors'}
                title={t('notifications.title')}
                aria-label={t('notifications.title')}
                aria-expanded={open}
            >
                <Bell className="w-4 h-4" />
                {unread > 0 && (
                    <span className="notif-bell-count absolute top-0.5 right-0.5 pointer-events-none">
                        <span className="notif-bell-ping" aria-hidden="true" />
                        <span className="notif-bell-badge">
                            {unread > 9 ? '9+' : unread}
                        </span>
                    </span>
                )}
            </button>
            {panel}
        </div>
    );
};

export default InAppNotificationsBell;
