import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { resolvePortalAssetUrl } from './basePath';
import { resolveCustomNavIcon } from './customNavTabs';
import type { CustomNavTab } from './types';
import { useDiscoverI18n } from '../discovery/i18n';

type Props = {
    tabs: CustomNavTab[];
    onActivate: (tab: CustomNavTab) => void;
    onClose: () => void;
    anchorRef: React.RefObject<HTMLElement | null>;
};

const AppletTile: React.FC<{ tab: CustomNavTab; onActivate: (tab: CustomNavTab) => void }> = ({ tab, onActivate }) => {
    const Icon = resolveCustomNavIcon(tab.icon);
    const [logoFailed, setLogoFailed] = useState(false);
    const logoSrc = tab.logoUrl && !logoFailed ? resolvePortalAssetUrl(tab.logoUrl) : '';
    const showLabel = tab.showPaletteLabel !== false;

    return (
        <button
            type="button"
            onClick={() => onActivate(tab)}
            className="group flex flex-col items-center gap-2 rounded-2xl border border-transparent bg-transparent px-2 py-3 text-center transition-colors hover:border-border/70 hover:bg-white/5"
            title={tab.description || tab.name}
        >
            <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-plex/25 bg-plex/10 text-plex shadow-[0_0_18px_rgba(229,160,13,0.12)]">
                {logoSrc ? (
                    <img
                        src={logoSrc}
                        alt=""
                        className="h-full w-full object-contain p-1.5"
                        onError={() => setLogoFailed(true)}
                    />
                ) : (
                    <Icon className="h-7 w-7" />
                )}
            </span>
            {showLabel ? (
                <span className="max-w-[5.5rem] truncate text-xs font-semibold text-text group-hover:text-plex">
                    {tab.name}
                </span>
            ) : (
                <span className="sr-only">{tab.name}</span>
            )}
        </button>
    );
};

export const AppletsPalette: React.FC<Props> = ({ tabs, onActivate, onClose, anchorRef }) => {
    const { t } = useDiscoverI18n();
    const panelRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    useLayoutEffect(() => {
        const place = () => {
            const anchor = anchorRef.current;
            if (!anchor) return;
            const rect = anchor.getBoundingClientRect();
            const width = Math.min(352, window.innerWidth - 24);
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
    }, [anchorRef, tabs.length]);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
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
    }, [anchorRef, onClose]);

    return ReactDOM.createPortal(
        <div
            ref={panelRef}
            style={pos
                ? { position: 'fixed', top: pos.top, left: pos.left, zIndex: 80 }
                : { position: 'fixed', top: 0, left: 0, visibility: 'hidden', zIndex: 80 }}
            className="w-[min(22rem,calc(100vw-1.5rem))] max-h-[min(28rem,calc(100vh-1.5rem))] overflow-y-auto rounded-2xl border border-border/80 bg-card/95 p-4 shadow-2xl backdrop-blur-md"
            role="dialog"
            aria-label={t('navigation.applets')}
        >
            <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-text">{t('navigation.applets')}</p>
                <p className="text-[11px] text-muted">{t('navigation.appletsHint')}</p>
            </div>
            {tabs.length ? (
                <div className="grid grid-cols-3 gap-1">
                    {tabs.map((tab) => (
                        <AppletTile key={tab.id} tab={tab} onActivate={onActivate} />
                    ))}
                </div>
            ) : (
                <p className="px-2 py-6 text-center text-sm text-muted">{t('navigation.appletsEmpty')}</p>
            )}
        </div>,
        document.body,
    );
};
