import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Globe, Minus, Plus, RefreshCw } from 'lucide-react';
import { useDiscoverI18n } from '../discovery/i18n';
import type { CustomNavTab } from '../shared/types';
import {
    canAccessCustomNavTab,
    detectCustomTabEmbedIssue,
    getCustomTabEmbedProxySrc,
    normalizeCustomTabEmbedUrl,
    shouldUseCustomTabEmbedProxy,
} from '../shared/customNavTabs';

type Props = {
    tabId: string | null;
    customNavTabs?: CustomNavTab[];
    isAdmin?: boolean;
};

const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 5;
const ZOOM_DEFAULT = 100;

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

export const CustomExternalTabPage: React.FC<Props> = ({ tabId, customNavTabs = [], isAdmin = false }) => {
    const { t } = useDiscoverI18n();
    const tab = useMemo(
        () => customNavTabs.find((entry) => String(entry.id) === String(tabId || '')),
        [customNavTabs, tabId],
    );
    const [iframeKey, setIframeKey] = useState(0);
    const [embedBlocked, setEmbedBlocked] = useState(false);
    const [zoom, setZoom] = useState(ZOOM_DEFAULT);
    const resolvedUrl = useMemo(() => normalizeCustomTabEmbedUrl(tab?.url || ''), [tab?.url]);
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
        if (useEmbedProxy) return getCustomTabEmbedProxySrc(tab.id);
        return resolvedUrl;
    }, [tab, useEmbedProxy, resolvedUrl]);

    useEffect(() => {
        setEmbedBlocked(false);
        setIframeKey((value) => value + 1);
        setZoom(tab?.id ? readStoredZoom(tab.id) : ZOOM_DEFAULT);
    }, [tab?.id, tab?.url, useEmbedProxy]);

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

    if (!tabId || !tab || !canAccessCustomNavTab(tab, isAdmin)) {
        return (
            <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-8 text-center">
                <Globe className="h-10 w-10 text-muted" />
                <p className="text-sm text-muted">{t('settings.navigation.customTabs.embed.unavailable')}</p>
            </div>
        );
    }

    if (tab.openMode !== 'embed') {
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
        <div className="flex w-full min-h-0 flex-1 flex-col gap-2 md:gap-3">
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
                        href={resolvedUrl || tab.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl bg-plex px-3 py-2 text-sm font-bold text-background hover:bg-plex-hover"
                    >
                        <ExternalLink className="h-4 w-4" />
                        {t('settings.navigation.customTabs.embed.openInBrowser')}
                    </a>
                </div>
            </div>

            {useEmbedProxy ? (
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
                        href={resolvedUrl || tab.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl bg-plex px-4 py-2 text-sm font-bold text-background hover:bg-plex-hover"
                    >
                        <ExternalLink className="h-4 w-4" />
                        {t('settings.navigation.customTabs.embed.openInBrowser')}
                    </a>
                </div>
            ) : (
                <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/30">
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
