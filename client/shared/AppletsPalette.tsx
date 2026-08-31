import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { resolvePortalAssetUrl } from './basePath';
import { resolveCustomNavIcon } from './customNavTabs';
import type { CustomNavTab } from './types';
import { useDiscoverI18n } from '../discovery/i18n';

type Props = {
    tabs: CustomNavTab[];
    openIds?: string[];
    activeId?: string | null;
    onActivate: (tab: CustomNavTab) => void;
    onCloseSession?: (tab: CustomNavTab) => void;
    onClose: () => void;
    anchorRef: React.RefObject<HTMLElement | null>;
};

const PAGE_SIZE = 9;

export const AppletCloseButton: React.FC<{
    name: string;
    onClick: () => void;
    className?: string;
}> = ({ name, onClick, className = '' }) => {
    const { t } = useDiscoverI18n();
    return (
        <button
            type="button"
            className={`absolute z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/80 text-muted shadow-sm ring-1 ring-white/20 hover:bg-red-500 hover:text-white ${className}`}
            aria-label={t('navigation.closeApplet', { name })}
            title={t('navigation.closeApplet', { name })}
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClick();
            }}
        >
            <X className="h-3 w-3" />
        </button>
    );
};

const AppletTile: React.FC<{
    tab: CustomNavTab;
    isOpen?: boolean;
    isActive?: boolean;
    onActivate: (tab: CustomNavTab) => void;
    onCloseSession?: (tab: CustomNavTab) => void;
}> = ({ tab, isOpen = false, isActive = false, onActivate, onCloseSession }) => {
    const Icon = resolveCustomNavIcon(tab.icon);
    const [logoFailed, setLogoFailed] = useState(false);
    const logoSrc = tab.logoUrl && !logoFailed ? resolvePortalAssetUrl(tab.logoUrl) : '';
    const showLabel = tab.showPaletteLabel !== false;

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => onActivate(tab)}
                className={`group flex min-h-[3.75rem] w-full flex-col items-center justify-center gap-1 rounded-xl border bg-transparent px-1 py-1 text-center transition-all duration-200 hover:bg-white/[0.07] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${
                    isActive
                        ? 'border-plex/50 bg-plex/10'
                        : isOpen
                            ? 'border-white/15 bg-white/[0.04]'
                            : 'border-transparent hover:border-white/10'
                }`}
                title={tab.description || tab.name}
                aria-current={isActive ? 'page' : undefined}
            >
                {logoSrc ? (
                    <img
                        src={logoSrc}
                        alt=""
                        className="h-8 w-8 object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.35)] transition-transform duration-200 group-hover:scale-105"
                        onError={() => setLogoFailed(true)}
                    />
                ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-plex">
                        <Icon className="h-5 w-5" />
                    </span>
                )}
                {showLabel ? (
                    <span className={`max-w-[4.5rem] truncate text-[11px] font-semibold ${isActive ? 'text-plex' : 'text-text/90 group-hover:text-plex'}`}>
                        {tab.name}
                    </span>
                ) : (
                    <span className="sr-only">{tab.name}</span>
                )}
            </button>
            {isOpen && onCloseSession ? (
                <AppletCloseButton
                    name={tab.name}
                    className="right-0.5 top-0.5"
                    onClick={() => onCloseSession(tab)}
                />
            ) : null}
        </div>
    );
};

export const AppletsPalette: React.FC<Props> = ({ tabs, openIds = [], activeId = null, onActivate, onCloseSession, onClose, anchorRef }) => {
    const { t } = useDiscoverI18n();
    const panelRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const [page, setPage] = useState(0);
    const pageCount = Math.max(1, Math.ceil(tabs.length / PAGE_SIZE));

    useEffect(() => {
        setPage((current) => Math.min(Math.max(current, 0), pageCount - 1));
    }, [pageCount]);

    const pageTabs = useMemo(
        () => tabs.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
        [page, tabs],
    );

    useLayoutEffect(() => {
        const place = () => {
            const anchor = anchorRef.current;
            if (!anchor) return;
            const rect = anchor.getBoundingClientRect();
            const width = Math.min(320, window.innerWidth - 24);
            let left = rect.right + 12;
            if (left + width > window.innerWidth - 12) left = Math.max(12, window.innerWidth - width - 12);
            const panelHeight = panelRef.current?.offsetHeight || 240;
            let top = rect.top + rect.height / 2 - panelHeight / 2;
            top = Math.max(12, Math.min(top, window.innerHeight - panelHeight - 12));
            setPos({ top, left });
        };
        place();
        const frame = window.requestAnimationFrame(place);
        window.addEventListener('resize', place);
        return () => {
            window.cancelAnimationFrame(frame);
            window.removeEventListener('resize', place);
        };
    }, [anchorRef, page, tabs.length]);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
                return;
            }
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                setPage((current) => Math.max(0, current - 1));
                return;
            }
            if (event.key === 'ArrowRight') {
                event.preventDefault();
                setPage((current) => Math.min(pageCount - 1, current + 1));
            }
        };
        const onPointer = (event: MouseEvent) => {
            const target = event.target as Node;
            if (panelRef.current?.contains(target)) return;
            if (anchorRef.current?.contains(target)) return;
            onClose();
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('mousedown', onPointer);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('mousedown', onPointer);
        };
    }, [anchorRef, onClose, pageCount]);

    return ReactDOM.createPortal(
        <div
            ref={panelRef}
            style={pos
                ? { position: 'fixed', top: pos.top, left: pos.left, zIndex: 80 }
                : { position: 'fixed', top: 0, left: 0, visibility: 'hidden', zIndex: 80 }}
            className="glass-card relative isolate w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden p-3.5 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.7)] ring-1 ring-inset ring-white/[0.06] backdrop-saturate-150"
            role="dialog"
            aria-label={t('navigation.applets')}
        >
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.1] via-white/[0.02] to-transparent" />
            <div className="relative">
                <div className="mb-2.5 flex items-baseline justify-between gap-2 border-b border-white/[0.06] pb-2">
                    <p className="text-sm font-bold tracking-tight text-text">{t('navigation.applets')}</p>
                    <p className="text-[11px] text-muted/80">{t('navigation.appletsHint')}</p>
                </div>
                {tabs.length ? (
                    <>
                        <div className="grid grid-cols-3 grid-rows-3">
                            {Array.from({ length: PAGE_SIZE }, (_, index) => {
                                const tab = pageTabs[index];
                                if (!tab) return <div key={`empty-${index}`} className="min-h-[3.75rem]" />;
                                return (
                                    <AppletTile
                                        key={tab.id}
                                        tab={tab}
                                        isOpen={openIds.includes(tab.id)}
                                        isActive={activeId === tab.id}
                                        onActivate={onActivate}
                                        onCloseSession={onCloseSession}
                                    />
                                );
                            })}
                        </div>
                        {pageCount > 1 ? (
                            <div className="mt-1 flex items-center justify-center gap-1.5">
                                <button
                                    type="button"
                                    className="rounded-md p-1 text-muted hover:text-text disabled:opacity-30"
                                    disabled={page <= 0}
                                    onClick={() => setPage((current) => Math.max(0, current - 1))}
                                    aria-label={t('navigation.appletsPrev')}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                {Array.from({ length: pageCount }, (_, index) => (
                                    <button
                                        key={index}
                                        type="button"
                                        className={`h-1.5 rounded-full transition-colors ${index === page ? 'w-3 bg-plex' : 'w-1.5 bg-muted/50 hover:bg-muted'}`}
                                        onClick={() => setPage(index)}
                                        aria-label={t('navigation.appletsPage', { current: index + 1, total: pageCount })}
                                        aria-current={index === page ? 'true' : undefined}
                                    />
                                ))}
                                <button
                                    type="button"
                                    className="rounded-md p-1 text-muted hover:text-text disabled:opacity-30"
                                    disabled={page >= pageCount - 1}
                                    onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                                    aria-label={t('navigation.appletsNext')}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        ) : null}
                    </>
                ) : (
                    <p className="px-2 py-6 text-center text-sm text-muted">{t('navigation.appletsEmpty')}</p>
                )}
            </div>
        </div>,
        document.body,
    );
};
