import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Globe, RefreshCw } from 'lucide-react';
import { useDiscoverI18n } from '../discovery/i18n';
import type { CustomNavTab } from '../shared/types';
import {
    canAccessCustomNavTab,
    detectCustomTabEmbedIssue,
    getCustomTabEmbedProxySrc,
    shouldUseCustomTabEmbedProxy,
} from '../shared/customNavTabs';

type Props = {
    tabId: string | null;
    customNavTabs?: CustomNavTab[];
    isAdmin?: boolean;
};

export const CustomExternalTabPage: React.FC<Props> = ({ tabId, customNavTabs = [], isAdmin = false }) => {
    const { t } = useDiscoverI18n();
    const tab = useMemo(
        () => customNavTabs.find((entry) => String(entry.id) === String(tabId || '')),
        [customNavTabs, tabId],
    );
    const [iframeKey, setIframeKey] = useState(0);
    const [embedBlocked, setEmbedBlocked] = useState(false);
    const useEmbedProxy = useMemo(
        () => !!(tab?.url && shouldUseCustomTabEmbedProxy(tab.url)),
        [tab?.url],
    );
    const predictedEmbedIssue = useMemo(() => {
        if (!tab?.url) return null;
        if (useEmbedProxy) {
            return detectCustomTabEmbedIssue(tab.url) === 'blocked-host' ? 'blocked-host' : null;
        }
        return detectCustomTabEmbedIssue(tab.url);
    }, [tab?.url, useEmbedProxy]);
    const iframeSrc = useMemo(() => {
        if (!tab) return '';
        if (useEmbedProxy) return getCustomTabEmbedProxySrc(tab.id);
        return tab.url;
    }, [tab, useEmbedProxy]);

    useEffect(() => {
        setEmbedBlocked(false);
        setIframeKey((value) => value + 1);
    }, [tab?.id, tab?.url, useEmbedProxy]);

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
        : embedBlocked
            ? t('settings.navigation.customTabs.embed.genericBlocked')
            : '';

    return (
        <div className="flex min-h-[calc(100dvh-8rem)] flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="min-w-0">
                    <h1 className="truncate text-lg font-bold text-text">{tab.name}</h1>
                    {tab.description ? (
                        <p className="mt-1 max-w-3xl text-sm text-muted">{tab.description}</p>
                    ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {!predictedEmbedIssue ? (
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
                    ) : null}
                    <a
                        href={tab.url}
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
                <div className="rounded-2xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-sm leading-relaxed text-sky-100">
                    {t('settings.navigation.customTabs.embed.proxyActive')}
                </div>
            ) : null}

            {showEmbedWarning ? (
                <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm leading-relaxed text-yellow-100">
                    <p>{embedWarningText}</p>
                    <p className="mt-2 text-yellow-200/90">{t('settings.navigation.customTabs.embed.useOpenInBrowser')}</p>
                </div>
            ) : null}

            {predictedEmbedIssue ? (
                <div className="flex min-h-[50vh] flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/15 bg-black/20 p-8 text-center">
                    <Globe className="h-12 w-12 text-muted" />
                    <p className="max-w-xl text-sm text-muted">{embedWarningText}</p>
                    <a
                        href={tab.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl bg-plex px-4 py-2 text-sm font-bold text-background hover:bg-plex-hover"
                    >
                        <ExternalLink className="h-4 w-4" />
                        {t('settings.navigation.customTabs.embed.openInBrowser')}
                    </a>
                </div>
            ) : (
                <div className="min-h-[60vh] flex-1 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                    <iframe
                        key={iframeKey}
                        title={tab.name}
                        src={iframeSrc}
                        className="h-full min-h-[60vh] w-full border-0 bg-white"
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
            )}
        </div>
    );
};
