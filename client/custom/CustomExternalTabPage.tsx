import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Globe, Minus, Plus, RefreshCw, X } from 'lucide-react';
import { useDiscoverI18n } from '../discovery/i18n';
import type { CustomNavTab } from '../shared/types';
import type { OpenAppletSession } from '../shared/openApplets';
import {
    canAccessCustomNavTab,
    detectCustomTabEmbedIssue,
    getCustomTabEmbedProxySrc,
    normalizeCustomTabEmbedUrl,
    shouldUseCustomTabEmbedProxy,
} from '../shared/customNavTabs';
import { isSafeArrEmbedPath } from '../../lib/arr-portal-embed.js';

type Props = {
    tabId: string | null;
    embedPath?: string;
    customNavTabs?: CustomNavTab[];
    isAdmin?: boolean;
    onClose?: () => void;
};

const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 5;
const ZOOM_DEFAULT = 100;
const TOOLBAR_STORAGE_KEY = 'portal.embedToolbarCollapsed';

const embedZoomStorageKey = (id: string) => `portal.embedZoom.${id}`;

const clampZoom = (value: number) => {
    if (!Number.isFinite(value)) return ZOOM_DEFAULT;
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value / ZOOM_STEP) * ZOOM_STEP));
};

const readStoredZoom = (id: string) => {
    try {
        const raw = window.localStorage.getItem(embedZoomStorageKey(id));
        if (raw == null) return ZOOM_DEFAULT;
        return clampZoom(Number(raw));
    } catch {
        return ZOOM_DEFAULT;
    }
};

const readToolbarCollapsed = () => {
    try {
        return window.localStorage.getItem(TOOLBAR_STORAGE_KEY) === '1';
    } catch {
        return false;
    }
};

export const CustomExternalTabPage: React.FC<Props> = ({ tabId, embedPath = '', customNavTabs = [], isAdmin = false, onClose }) => {
    const { t } = useDiscoverI18n();
    const tab = useMemo(
        () => customNavTabs.find((entry) => String(entry.id) === String(tabId || '')),
        [customNavTabs, tabId],
    );
    const [iframeKey, setIframeKey] = useState(0);
    const [embedBlocked, setEmbedBlocked] = useState(false);
    const [zoom, setZoom] = useState(ZOOM_DEFAULT);
    const [toolbarCollapsed, setToolbarCollapsed] = useState(readToolbarCollapsed);
    const skipRemountRef = useRef(true);
    const resolvedUrl = useMemo(() => normalizeCustomTabEmbedUrl(tab?.url || ''), [tab?.url]);
    const safeEmbedPath = useMemo(
        () => (isSafeArrEmbedPath(embedPath) ? String(embedPath).replace(/^\/+/, '') : ''),
        [embedPath],
    );
    const deepResolvedUrl = useMemo(() => {
        if (!resolvedUrl || !safeEmbedPath) return resolvedUrl;
        try {
            const base = resolvedUrl.endsWith('/') ? resolvedUrl : `${resolvedUrl}/`;
            return new URL(safeEmbedPath, base).href;
        } catch {
            return resolvedUrl;
        }
    }, [resolvedUrl, safeEmbedPath]);
    const useEmbedProxy = useMemo(
        () => !!(resolvedUrl && shouldUseCustomTabEmbedProxy(resolvedUrl)),
        [resolvedUrl],
    );
    const predictedEmbedIssue = useMemo(() => {
        if (!resolvedUrl) return null;
        return detectCustomTabEmbedIssue(resolvedUrl);
    }, [resolvedUrl]);
    const iframeSrc = useMemo(() => {
        if (!tab) return '';
        if (useEmbedProxy) {
            const prefix = getCustomTabEmbedProxySrc(tab.id);
            return safeEmbedPath ? `${prefix}${safeEmbedPath}` : prefix;
        }
        return deepResolvedUrl || resolvedUrl;
    }, [tab, useEmbedProxy, resolvedUrl, deepResolvedUrl, safeEmbedPath]);

    useEffect(() => {
        if (skipRemountRef.current) {
            skipRemountRef.current = false;
            setZoom(tab?.id ? readStoredZoom(tab.id) : ZOOM_DEFAULT);
            return;
        }
        setEmbedBlocked(false);
        setIframeKey((value) => value + 1);
        setZoom(tab?.id ? readStoredZoom(tab.id) : ZOOM_DEFAULT);
    }, [tab?.id, tab?.url, useEmbedProxy, safeEmbedPath]);

    const applyZoom = (next: number) => {
        const clamped = clampZoom(next);
        setZoom(clamped);
        if (!tab?.id) return;
        try {
            window.localStorage.setItem(embedZoomStorageKey(tab.id), String(clamped));
        } catch {
            // ignore quota / private mode
        }
    };

    const applyToolbarCollapsed = (collapsed: boolean) => {
        setToolbarCollapsed(collapsed);
        try {
            window.localStorage.setItem(TOOLBAR_STORAGE_KEY, collapsed ? '1' : '0');
        } catch {
            // ignore quota / private mode
        }
    };

    if (!tabId || !tab || !canAccessCustomNavTab(tab, isAdmin)) {
        return (
            <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-8 text-center">
                <Globe className="h-10 w-10 text-muted" />
                <p className="text-sm text-muted">{t('settings.navigation.customTabs.embed.unavailable')}</p>
            </div>
        );
    }

    if (tab.openMode !== 'embed' && !safeEmbedPath) {
        return (
            <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
                <Globe className="h-10 w-10 text-plex" />
                <div>
                    <h1 className="text-xl font-bold text-text">{tab.name}</h1>
                    {tab.description ? <p className="mt-2 max-w-xl text-sm text-muted">{tab.description}</p> : null}
                </div>
                <a
                    href={tab.url}
                    target={tab.openMode === 'newTab' ? '_blank' : undefined}
                    rel={tab.openMode === 'newTab' ? 'noreferrer' : undefined}
                    className="inline-flex items-center gap-2 rounded-xl bg-plex px-4 py-2 text-sm font-bold text-background hover:bg-plex-hover"
                >
                    <ExternalLink className="h-4 w-4" />
                    {t('settings.navigation.customTabs.embed.openNamed', { name: tab.name })}
                </a>
            </div>
        );
    }

    const showEmbedWarning = predictedEmbedIssue || embedBlocked;
    const embedWarningText = predictedEmbedIssue === 'blocked-host'
        ? t('settings.navigation.customTabs.embed.blockedHost')
        : predictedEmbedIssue === 'proxy-incompatible'
            ? t('settings.navigation.customTabs.embed.proxyIncompatible')
            : embedBlocked
            ? t('settings.navigation.customTabs.embed.genericBlocked')
            : '';
    const scale = zoom / 100;

    return (
        <div className={`flex w-full min-h-0 flex-1 flex-col ${toolbarCollapsed ? 'gap-0' : 'gap-2 md:gap-3'}`}>
            {toolbarCollapsed ? null : (
                <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-2.5 md:py-3">
                    <div className="min-w-0">
                        <h1 className="truncate text-lg font-bold text-text">{tab.name}</h1>
                        {tab.description ? (
                            <p className="mt-1 max-w-3xl text-sm text-muted">{tab.description}</p>
                        ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {!predictedEmbedIssue ? (
                            <>
                                <div className="inline-flex items-center rounded-xl border border-white/10 bg-black/20">
                                    <button
                                        type="button"
                                        className="inline-flex items-center justify-center rounded-l-xl px-2.5 py-2 text-text hover:bg-white/5 disabled:opacity-40"
                                        onClick={() => applyZoom(zoom - ZOOM_STEP)}
                                        disabled={zoom <= ZOOM_MIN}
                                        aria-label={t('settings.navigation.customTabs.embed.zoomOut')}
                                        title={t('settings.navigation.customTabs.embed.zoomOut')}
                                    >
                                        <Minus className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        className="min-w-[3.5rem] px-1 py-2 text-center text-xs font-bold tabular-nums text-text hover:bg-white/5"
                                        onClick={() => applyZoom(ZOOM_DEFAULT)}
                                        title={t('settings.navigation.customTabs.embed.zoomReset')}
                                    >
                                        {zoom}%
                                    </button>
                                    <button
                                        type="button"
                                        className="inline-flex items-center justify-center rounded-r-xl px-2.5 py-2 text-text hover:bg-white/5 disabled:opacity-40"
                                        onClick={() => applyZoom(zoom + ZOOM_STEP)}
                                        disabled={zoom >= ZOOM_MAX}
                                        aria-label={t('settings.navigation.customTabs.embed.zoomIn')}
                                        title={t('settings.navigation.customTabs.embed.zoomIn')}
                                    >
                                        <Plus className="h-4 w-4" />
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-text hover:bg-white/5"
                                    onClick={() => {
                                        setEmbedBlocked(false);
                                        setIframeKey((value) => value + 1);
                                    }}
                                >
                                    <RefreshCw className="h-4 w-4" />
                                    {t('settings.navigation.customTabs.embed.reload')}
                                </button>
                            </>
                        ) : null}
                        <a
                            href={deepResolvedUrl || tab.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-xl bg-plex px-3 py-2 text-sm font-bold text-background hover:bg-plex-hover"
                        >
                            <ExternalLink className="h-4 w-4" />
                            {t('settings.navigation.customTabs.embed.openInBrowser')}
                        </a>
                        <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-xl border border-white/10 px-2.5 py-2 text-text hover:bg-white/5"
                            onClick={() => applyToolbarCollapsed(true)}
                            aria-expanded={!toolbarCollapsed}
                            aria-label={t('settings.navigation.customTabs.embed.collapseBar')}
                            title={t('settings.navigation.customTabs.embed.collapseBar')}
                        >
                            <ChevronUp className="h-4 w-4" />
                        </button>
                        {onClose ? (
                            <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-xl border border-white/10 px-2.5 py-2 text-text hover:bg-red-500/80 hover:text-white"
                                onClick={onClose}
                                aria-label={t('navigation.closeApplet', { name: tab.name })}
                                title={t('navigation.closeApplet', { name: tab.name })}
                            >
                                <X className="h-4 w-4" />
                            </button>
                        ) : null}
                    </div>
                </div>
            )}

            {!toolbarCollapsed && useEmbedProxy ? (
                <div className="shrink-0 rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-xs leading-relaxed text-sky-100 md:text-sm">
                    {t('settings.navigation.customTabs.embed.proxyActive')}
                </div>
            ) : null}

            {showEmbedWarning ? (
                <div className="shrink-0 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm leading-relaxed text-yellow-100">
                    <p>{embedWarningText}</p>
                    <p className="mt-2 text-yellow-200/90">{t('settings.navigation.customTabs.embed.useOpenInBrowser')}</p>
                </div>
            ) : null}

            {predictedEmbedIssue ? (
                <div className="flex min-h-[50vh] flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/15 bg-black/20 p-8 text-center">
                    <Globe className="h-12 w-12 text-muted" />
                    <p className="max-w-xl text-sm text-muted">{embedWarningText}</p>
                    <a
                        href={deepResolvedUrl || tab.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl bg-plex px-4 py-2 text-sm font-bold text-background hover:bg-plex-hover"
                    >
                        <ExternalLink className="h-4 w-4" />
                        {t('settings.navigation.customTabs.embed.openInBrowser')}
                    </a>
                </div>
            ) : (
                <div className={`relative flex min-h-0 flex-1 flex-col overflow-hidden border border-white/10 bg-black/30 ${toolbarCollapsed ? 'rounded-t-xl rounded-b-none md:rounded-2xl' : 'rounded-2xl'}`}>
                    {toolbarCollapsed ? (
                        <div className="absolute left-1/2 top-2 z-10 flex -translate-x-1/2 items-center gap-1">
                            <button
                                type="button"
                                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/70 px-3 py-1 text-xs font-semibold text-text shadow-lg backdrop-blur-md hover:bg-black/85"
                                onClick={() => applyToolbarCollapsed(false)}
                                aria-expanded={!toolbarCollapsed}
                                aria-label={t('settings.navigation.customTabs.embed.expandBar')}
                                title={t('settings.navigation.customTabs.embed.expandBar')}
                            >
                                <ChevronDown className="h-3.5 w-3.5" />
                                <span className="max-w-[10rem] truncate">{tab.name}</span>
                            </button>
                            {onClose ? (
                                <button
                                    type="button"
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/70 text-text shadow-lg backdrop-blur-md hover:bg-red-500 hover:text-white"
                                    onClick={onClose}
                                    aria-label={t('navigation.closeApplet', { name: tab.name })}
                                    title={t('navigation.closeApplet', { name: tab.name })}
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            ) : null}
                        </div>
                    ) : null}
                    <div
                        className="absolute left-0 top-0 origin-top-left"
                        style={{
                            width: `${100 / scale}%`,
                            height: `${100 / scale}%`,
                            transform: `scale(${scale})`,
                        }}
                    >
                        <iframe
                            key={iframeKey}
                            title={tab.name}
                            src={iframeSrc}
                            className="block h-full w-full border-0 bg-white"
                            style={{ colorScheme: 'normal' }}
                            sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-downloads"
                            referrerPolicy="same-origin"
                            onLoad={(event) => {
                                try {
                                    const doc = (event.currentTarget as HTMLIFrameElement).contentDocument;
                                    if (!doc) {
                                        setEmbedBlocked(false);
                                        return;
                                    }
                                    const bodyText = doc.body?.innerText?.trim() || '';
                                    if (/refused to connect|x-frame-options|frame-ancestors|content is blocked/i.test(bodyText)) {
                                        setEmbedBlocked(true);
                                    }
                                } catch {
                                    setEmbedBlocked(false);
                                }
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

type HostProps = {
    sessions: OpenAppletSession[];
    activeId: string | null;
    visible: boolean;
    customNavTabs?: CustomNavTab[];
    isAdmin?: boolean;
    onClose: (id: string) => void;
};

export const OpenAppletsHost: React.FC<HostProps> = ({
    sessions,
    activeId,
    visible,
    customNavTabs = [],
    isAdmin = false,
    onClose,
}) => {
    const panes = sessions.map((session) => {
        const shown = visible && session.id === activeId;
        return (
            <div
                key={session.id}
                className={shown
                    ? 'relative flex min-h-0 flex-1 flex-col'
                    : 'pointer-events-none invisible fixed left-0 top-0 -z-10 h-[100dvh] w-screen'}
                aria-hidden={!shown}
                inert={!shown}
            >
                <CustomExternalTabPage
                    tabId={session.id}
                    embedPath={session.embedPath}
                    customNavTabs={customNavTabs}
                    isAdmin={isAdmin}
                    onClose={() => onClose(session.id)}
                />
            </div>
        );
    });
    if (visible) {
        return <div className="relative flex min-h-0 flex-1 flex-col">{panes}</div>;
    }
    return <>{panes}</>;
};
