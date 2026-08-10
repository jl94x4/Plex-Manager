import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell } from 'lucide-react';
import { apiFetch } from './api';
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
    const [panelBox, setPanelBox] = useState<PanelBox | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const refresh = useCallback(async () => {
        try {
            setLoading(true);
            const data = await apiFetch('/api/notifications?limit=25');
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
        const id = window.setInterval(refresh, 60_000);
        return () => window.clearInterval(id);
    }, [refresh]);

    const updatePanelBox = useCallback(() => {
        const button = buttonRef.current;
        if (!button) return;
        const rect = button.getBoundingClientRect();
        const margin = 8;
        const width = Math.min(320, Math.max(220, window.innerWidth - margin * 2));
        // Prefer aligning the panel’s right edge with the bell, then clamp into the viewport.
        let left = rect.right - width;
        left = Math.min(Math.max(left, margin), window.innerWidth - margin - width);

        if (placement === 'up') {
            const maxHeight = Math.max(120, Math.min(384, rect.top - margin * 2));
            setPanelBox({
                left,
                width,
                maxHeight,
                bottom: window.innerHeight - rect.top + margin,
            });
            return;
        }

        const maxHeight = Math.max(120, Math.min(384, window.innerHeight - rect.bottom - margin * 2));
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
        } catch {
            // ignore
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
                className="fixed overflow-hidden rounded-xl border border-border bg-card shadow-2xl z-[400]"
                style={{
                    left: panelBox.left,
                    width: panelBox.width,
                    maxHeight: panelBox.maxHeight,
                    top: panelBox.top,
                    bottom: panelBox.bottom,
                }}
            >
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/80">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted">{t('notifications.title')}</p>
                    {unread > 0 && (
                        <button
                            type="button"
                            onClick={markAllRead}
                            className="text-[11px] font-semibold text-plex hover:underline"
                        >
                            {t('notifications.markAllRead')}
                        </button>
                    )}
                </div>
                <div className="overflow-y-auto max-h-[inherit] custom-scrollbar" style={{ maxHeight: `calc(${panelBox.maxHeight}px - 2.5rem)` }}>
                    {loading && !items.length ? (
                        <p className="px-3 py-6 text-sm text-muted text-center">{t('common.loadingMore')}</p>
                    ) : !items.length ? (
                        <p className="px-3 py-6 text-sm text-muted text-center">{t('notifications.empty')}</p>
                    ) : (
                        items.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => openItem(item)}
                                className={`w-full text-left px-3 py-2.5 border-b border-border/40 hover:bg-white/5 transition-colors ${item.readAt ? 'opacity-70' : ''}`}
                            >
                                <div className="flex items-start gap-2">
                                    {!item.readAt && (
                                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-plex shrink-0" />
                                    )}
                                    <div className={`min-w-0 flex-1 ${item.readAt ? 'pl-3.5' : ''}`}>
                                        <p className="text-sm font-semibold text-text truncate">{item.title}</p>
                                        {item.body ? (
                                            <p className="text-xs text-muted mt-0.5 line-clamp-2">{item.body}</p>
                                        ) : null}
                                        <p className="text-[10px] text-muted/80 mt-1">{formatRelative(item.createdAt, t)}</p>
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
                    <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-plex text-background text-[8px] font-bold flex items-center justify-center leading-none">
                        {unread > 9 ? '9+' : unread}
                    </span>
                )}
            </button>
            {panel}
        </div>
    );
};

export default InAppNotificationsBell;
