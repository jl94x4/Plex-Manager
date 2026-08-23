import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Globe, RefreshCw } from 'lucide-react';
import type { CustomNavTab } from '../shared/types';
import { canAccessCustomNavTab } from '../shared/customNavTabs';

type Props = {
    tabId: string | null;
    customNavTabs?: CustomNavTab[];
    isAdmin?: boolean;
};

export const CustomExternalTabPage: React.FC<Props> = ({ tabId, customNavTabs = [], isAdmin = false }) => {
    const tab = useMemo(
        () => customNavTabs.find((entry) => String(entry.id) === String(tabId || '')),
        [customNavTabs, tabId],
    );
    const [iframeKey, setIframeKey] = useState(0);
    const [embedBlocked, setEmbedBlocked] = useState(false);

    useEffect(() => {
        setEmbedBlocked(false);
        setIframeKey((value) => value + 1);
    }, [tab?.id, tab?.url]);

    if (!tabId || !tab || !canAccessCustomNavTab(tab, isAdmin)) {
        return (
            <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-8 text-center">
                <Globe className="h-10 w-10 text-muted" />
                <p className="text-sm text-muted">This external tab is unavailable or you do not have access.</p>
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
                    Open {tab.name}
                </a>
            </div>
        );
    }

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
                    <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-text hover:bg-white/5"
                        onClick={() => {
                            setEmbedBlocked(false);
                            setIframeKey((value) => value + 1);
                        }}
                    >
                        <RefreshCw className="h-4 w-4" />
                        Reload
                    </button>
                    <a
                        href={tab.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl bg-plex px-3 py-2 text-sm font-bold text-background hover:bg-plex-hover"
                    >
                        <ExternalLink className="h-4 w-4" />
                        Open in browser
                    </a>
                </div>
            </div>

            {embedBlocked ? (
                <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
                    This site may block embedding inside the portal. Use <strong>Open in browser</strong> instead.
                </div>
            ) : null}

            <div className="min-h-[60vh] flex-1 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                <iframe
                    key={iframeKey}
                    title={tab.name}
                    src={tab.url}
                    className="h-full min-h-[60vh] w-full border-0 bg-background"
                    sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-downloads"
                    referrerPolicy="no-referrer"
                    onLoad={(event) => {
                        try {
                            const doc = (event.currentTarget as HTMLIFrameElement).contentDocument;
                            if (!doc) {
                                setEmbedBlocked(false);
                                return;
                            }
                            const bodyText = doc.body?.innerText?.trim() || '';
                            if (/refused to connect|x-frame-options|frame-ancestors/i.test(bodyText)) {
                                setEmbedBlocked(true);
                            }
                        } catch {
                            setEmbedBlocked(false);
                        }
                    }}
                />
            </div>
        </div>
    );
};
