import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    Bell,
    CheckCheck,
    ChevronRight,
    CircleCheck,
    CircleX,
    Clapperboard,
    ClipboardList,
    Inbox,
    Sparkles,
    Trash2,
    Tv,
} from 'lucide-react';
import { apiFetch } from './api';
import { IN_APP_NOTIFICATIONS_CHANGED_EVENT, notifyInAppNotificationsChanged } from './inAppNotificationsRefresh';
import { resolveNotificationDestination } from './notificationDestination';
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
            return { Icon: CircleCheck, tone: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' };
        case 'request_approved':
            return { Icon: Sparkles, tone: 'text-plex bg-plex/15 border-plex/30' };
        case 'request_declined':
            return { Icon: CircleX, tone: 'text-rose-400 bg-rose-500/15 border-rose-500/30' };
        case 'request_season_available':
            return { Icon: Tv, tone: 'text-sky-400 bg-sky-500/15 border-sky-500/30' };
        case 'request_new_episode':
            return { Icon: Clapperboard, tone: 'text-violet-300 bg-violet-500/15 border-violet-500/30' };
        case 'admin_pending':
            return { Icon: ClipboardList, tone: 'text-amber-300 bg-amber-500/15 border-amber-500/30' };
        case 'admin_test':
            return { Icon: Bell, tone: 'text-plex bg-plex/15 border-plex/30' };
        default:
            return { Icon: Inbox, tone: 'text-plex bg-plex/15 border-plex/30' };
    }
};

type Props = {
    onNavigate?: (route: string, options?: { path?: string; reviewId?: number }) => void;
    className?: string;
    buttonClassName?: string;
    /** Panel opens above the bell (desktop sidebar) or below (mobile top bar). */
    placement?: 'up' | 'down';
};

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
    const [items, setItems] = useState<InAppNotification[]>([]);
    const [unread, setUnread] = useState(0);
    const [loading, setLoading] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [panelBox, setPanelBox] = useState<PanelBox | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const refresh = useCallback(async () => {
        try {
            setLoading(true);
            const data = await apiFetch('/api/notifications?limit=50');
            setItems(Array.isArray(data?.items) ? data.items : []);
            setUnread(Number(data?.unread) || 0);
        } catch {
            // ignore — bell stays quiet if API unavailable
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();

        const onChanged = () => { refresh(); };
        const onFocus = () => { refresh(); };
        const onVisibility = () => {
            if (document.visibilityState === 'visible') refresh();
        };

        window.addEventListener(IN_APP_NOTIFICATIONS_CHANGED_EVENT, onChanged);
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisibility);

        const id = window.setInterval(() => {
            if (document.visibilityState === 'visible') refresh();
        }, 15_000);

        return () => {
            window.clearInterval(id);
            window.removeEventListener(IN_APP_NOTIFICATIONS_CHANGED_EVENT, onChanged);
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [refresh]);

    const updatePanelBox = useCallback(() => {
        const button = buttonRef.current;
        if (!button) return;
        const rect = button.getBoundingClientRect();
        const margin = 12;

        if (placement === 'up') {
            const top = margin;
            const bottom = Math.max(margin, window.innerHeight - rect.top + 8);
            const maxHeight = Math.max(320, window.innerHeight - top - bottom);
            const width = Math.min(
                Math.max(420, Math.floor(window.innerWidth * 0.72)),
                window.innerWidth - margin * 2,
            );
            let left = Math.max(margin, rect.left - 8);
            left = Math.min(left, window.innerWidth - margin - width);
            left = Math.max(margin, left);
            setPanelBox({ left, width, maxHeight, top, bottom });
            return;
        }

        const width = Math.min(
            Math.max(300, Math.floor(window.innerWidth * 0.92)),
            window.innerWidth - margin * 2,
        );
        const maxHeight = Math.max(
            280,
            Math.min(Math.floor(window.innerHeight * 0.78), window.innerHeight - rect.bottom - margin * 2),
        );
        let left = rect.right - width;
        left = Math.min(Math.max(left, margin), window.innerWidth - margin - width);
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
            setItems((prev) => prev.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })));
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
                setItems((prev) => prev.map((row) => (
                    row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row
                )));
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
                className="fixed flex flex-col overflow-hidden rounded-2xl border border-border/80 shadow-2xl z-[400] bg-card/90 backdrop-blur-xl"
                style={{
                    left: panelBox.left,
                    width: panelBox.width,
                    ...(panelBox.top != null && panelBox.bottom != null
                        ? { top: panelBox.top, bottom: panelBox.bottom }
                        : { top: panelBox.top, height: panelBox.maxHeight, maxHeight: panelBox.maxHeight }),
                }}
            >
                <div className="relative shrink-0 overflow-hidden border-b border-border/70">
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-plex/20 via-plex/5 to-transparent" />
                    <div className="relative flex items-start justify-between gap-3 px-5 py-4">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2.5">
                                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-plex/35 bg-plex/15 text-plex shadow-[0_0_24px_rgba(0,0,0,0.15)]">
                                    <Bell className="h-4 w-4" />
                                </span>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold tracking-wide text-text">{t('notifications.title')}</p>
                                    <p className="text-xs text-muted mt-0.5">
                                        {unread > 0
                                            ? t('notifications.unreadCount', { count: unread })
                                            : t('notifications.allCaughtUp')}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            {unread > 0 && (
                                <button
                                    type="button"
                                    onClick={markAllRead}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-plex/30 bg-plex/10 px-2.5 py-1.5 text-[11px] font-semibold text-plex hover:bg-plex/20 transition-colors"
                                >
                                    <CheckCheck className="h-3.5 w-3.5" />
                                    {t('notifications.markAllRead')}
                                </button>
                            )}
                            {items.length > 0 && (
                                <button
                                    type="button"
                                    onClick={clearAll}
                                    disabled={clearing}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-muted hover:text-text hover:border-border transition-colors disabled:opacity-50"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    {t('notifications.clearAll')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    {loading && !items.length ? (
                        <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
                            <span className="h-10 w-10 rounded-2xl border border-border bg-white/5 animate-pulse" />
                            <p className="text-sm text-muted">{t('common.loadingMore')}</p>
                        </div>
                    ) : !items.length ? (
                        <div className="h-full flex flex-col items-center justify-center gap-3 px-8 text-center">
                            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-plex/25 bg-plex/10 text-plex">
                                <Inbox className="h-6 w-6" />
                            </span>
                            <div>
                                <p className="text-base font-semibold text-text">{t('notifications.empty')}</p>
                                <p className="text-sm text-muted mt-1 max-w-sm">{t('notifications.emptyHint')}</p>
                            </div>
                        </div>
                    ) : (
                        <ul className="py-1">
                            {items.map((item) => {
                                const unreadItem = !item.readAt;
                                const { Icon, tone } = typeVisual(item.type);
                                const dest = resolveNotificationDestination(item);
                                return (
                                    <li key={item.id}>
                                        <button
                                            type="button"
                                            onClick={() => openItem(item)}
                                            className={`group relative w-full text-left px-4 sm:px-5 py-3.5 transition-colors border-b border-border/40 last:border-b-0 hover:bg-plex/5 focus-visible:outline-none focus-visible:bg-plex/10 ${
                                                unreadItem ? 'bg-plex/[0.04]' : ''
                                            }`}
                                        >
                                            {unreadItem && (
                                                <span className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-plex" />
                                            )}
                                            <div className="flex items-start gap-3">
                                                <span className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${tone}`}>
                                                    <Icon className="h-4 w-4" />
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <p className={`text-sm leading-snug ${unreadItem ? 'font-bold text-text' : 'font-semibold text-text/90'}`}>
                                                            {item.title}
                                                        </p>
                                                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-plex" />
                                                    </div>
                                                    {item.body ? (
                                                        <p className="text-sm text-muted mt-1 line-clamp-2 leading-relaxed">{item.body}</p>
                                                    ) : null}
                                                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                                                        <span className="text-muted/80">{formatRelative(item.createdAt, t)}</span>
                                                        <span className="text-border">·</span>
                                                        <span className="font-semibold text-plex/90 group-hover:text-plex">
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
                    if (!open) refresh();
                }}
                className={buttonClassName || 'relative text-muted hover:text-text transition-colors'}
                title={t('notifications.title')}
                aria-label={t('notifications.title')}
                aria-expanded={open}
            >
                <Bell className="w-4 h-4" />
                {unread > 0 && (
                    <span className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-plex text-background text-[8px] font-bold flex items-center justify-center leading-none pointer-events-none">
                        {unread > 9 ? '9+' : unread}
                    </span>
                )}
            </button>
            {panel}
        </div>
    );
};

export default InAppNotificationsBell;
