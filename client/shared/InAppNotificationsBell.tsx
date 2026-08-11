import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell } from 'lucide-react';
import { apiFetch } from './api';
import { IN_APP_NOTIFICATIONS_CHANGED_EVENT, notifyInAppNotificationsChanged } from './inAppNotificationsRefresh';
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

type Props = {
    onNavigate?: (route: string, options?: { path?: string }) => void;
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

        // Faster than once-a-minute so a just-sent test / available request shows the badge
        // without requiring a tap. Keep it gentle for shared portal sessions.
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
            // Desktop sidebar: claim most of the viewport above the bell and grow into main content.
            const top = margin;
            const bottom = Math.max(margin, window.innerHeight - rect.top + 8);
            const maxHeight = Math.max(320, window.innerHeight - top - bottom);
            const width = Math.min(
                Math.max(420, Math.floor(window.innerWidth * 0.72)),
                window.innerWidth - margin * 2,
            );
            // Anchor near the bell, then shift left if needed so the wide panel stays on-screen.
            let left = Math.max(margin, rect.left - 8);
            left = Math.min(left, window.innerWidth - margin - width);
            left = Math.max(margin, left);
            setPanelBox({ left, width, maxHeight, top, bottom });
            return;
        }

        // Mobile top bar: wide dropdown under the bell.
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
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
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
        const href = String(item.href || '').trim() || '/discovery/requests';
        if (href.startsWith('/discovery')) {
            onNavigate?.('discovery', { path: href });
            return;
        }
        if (href.startsWith('/')) {
            window.location.assign(href);
            return;
        }
        onNavigate?.('discovery');
    };

    const panel = open && panelBox && typeof document !== 'undefined'
        ? createPortal(
            <div
                ref={panelRef}
                className="fixed flex flex-col overflow-hidden rounded-xl border border-border shadow-2xl z-[400]"
                style={{
                    left: panelBox.left,
                    width: panelBox.width,
                    // Prefer top+bottom stretch for desktop (placement=up); height for mobile dropdown.
                    ...(panelBox.top != null && panelBox.bottom != null
                        ? { top: panelBox.top, bottom: panelBox.bottom }
                        : { top: panelBox.top, height: panelBox.maxHeight, maxHeight: panelBox.maxHeight }),
                    backgroundColor: 'rgb(var(--color-card))',
                }}
            >
                <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-b border-border/80 shrink-0">
                    <p className="text-sm font-bold uppercase tracking-wider text-muted">{t('notifications.title')}</p>
                    <div className="flex items-center gap-3 shrink-0">
                        {unread > 0 && (
                            <button
                                type="button"
                                onClick={markAllRead}
                                className="text-xs font-semibold text-plex hover:underline"
                            >
                                {t('notifications.markAllRead')}
                            </button>
                        )}
                        {items.length > 0 && (
                            <button
                                type="button"
                                onClick={clearAll}
                                disabled={clearing}
                                className="text-xs font-semibold text-muted hover:text-text hover:underline disabled:opacity-50"
                            >
                                {t('notifications.clearAll')}
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    {loading && !items.length ? (
                        <div className="h-full flex items-center justify-center px-6">
                            <p className="text-base text-muted text-center">{t('common.loadingMore')}</p>
                        </div>
                    ) : !items.length ? (
                        <div className="h-full flex items-center justify-center px-6">
                            <p className="text-base text-muted text-center">{t('notifications.empty')}</p>
                        </div>
                    ) : (
                        items.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => openItem(item)}
                                className={`w-full text-left px-5 py-3.5 border-b border-border/40 hover:bg-white/5 transition-colors ${item.readAt ? 'opacity-70' : ''}`}
                            >
                                <div className="flex items-start gap-2.5">
                                    {!item.readAt && (
                                        <span className="mt-1.5 w-2 h-2 rounded-full bg-plex shrink-0" />
                                    )}
                                    <div className={`min-w-0 flex-1 ${item.readAt ? 'pl-4' : ''}`}>
                                        <p className="text-sm font-semibold text-text truncate">{item.title}</p>
                                        {item.body ? (
                                            <p className="text-sm text-muted mt-0.5 line-clamp-2">{item.body}</p>
                                        ) : null}
                                        <p className="text-xs text-muted/80 mt-1.5">{formatRelative(item.createdAt, t)}</p>
                                    </div>
                                </div>
                            </button>
                        ))
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
