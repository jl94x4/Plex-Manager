import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useDiscoverI18n } from '../discovery/i18n';
import type { HomeCustomModule } from '../shared/types';
import {
    canAccessHomeCustomModule,
    homeModuleEmbedIssue,
    homeModuleUsesProxy,
    resolveHomeModuleIframeSrc,
} from '../shared/homeCustomModules';

type Props = {
    module: HomeCustomModule;
    isAdmin?: boolean;
};

export const HomeCustomModuleSection: React.FC<Props> = ({ module, isAdmin = false }) => {
    const { t } = useDiscoverI18n();
    const [iframeKey, setIframeKey] = useState(0);
    const [embedBlocked, setEmbedBlocked] = useState(false);
    const accessible = canAccessHomeCustomModule(module, isAdmin);
    const usesProxy = homeModuleUsesProxy(module);
    const predictedEmbedIssue = module.mode === 'iframe' ? homeModuleEmbedIssue(module) : null;
    const iframeSrc = useMemo(() => (
        module.mode === 'iframe' ? resolveHomeModuleIframeSrc(module) : ''
    ), [module]);

    useEffect(() => {
        setEmbedBlocked(false);
        setIframeKey((value) => value + 1);
    }, [module.id, module.url, module.mode, usesProxy]);

    if (!accessible) return null;

    const header = (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
                <h3 className="text-lg font-bold text-text">{module.title}</h3>
                {module.description ? (
                    <p className="mt-1 max-w-3xl text-sm text-muted">{module.description}</p>
                ) : null}
            </div>
            {module.mode === 'iframe' && module.url ? (
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
                            {t('settings.homeModules.embed.reload')}
                        </button>
                    ) : null}
                    <a
                        href={module.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl bg-plex px-3 py-2 text-sm font-bold text-background hover:bg-plex-hover"
                    >
                        <ExternalLink className="h-4 w-4" />
                        {t('settings.homeModules.embed.openInBrowser')}
                    </a>
                </div>
            ) : null}
        </div>
    );

    if (module.mode === 'html') {
        return (
            <div className="glass-card p-4 md:p-5 shadow-xl w-full min-w-0">
                {header}
                {module.css ? <style dangerouslySetInnerHTML={{ __html: module.css }} /> : null}
                <div
                    className="home-custom-module-html min-w-0 overflow-x-auto"
                    dangerouslySetInnerHTML={{ __html: module.html || '' }}
                />
            </div>
        );
    }

    const embedWarningText = predictedEmbedIssue === 'blocked-host'
        ? t('settings.homeModules.embed.blockedHost')
        : embedBlocked
            ? t('settings.homeModules.embed.genericBlocked')
            : '';

    return (
        <div className="glass-card p-4 md:p-5 shadow-xl w-full min-w-0">
            {header}
            {usesProxy ? (
                <div className="mb-3 rounded-2xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-sm leading-relaxed text-sky-100">
                    {t('settings.homeModules.embed.proxyActive')}
                </div>
            ) : null}
            {(predictedEmbedIssue || embedBlocked) ? (
                <div className="mb-3 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm leading-relaxed text-yellow-100">
                    <p>{embedWarningText}</p>
                    <p className="mt-2 text-yellow-200/90">{t('settings.homeModules.embed.useOpenInBrowser')}</p>
                </div>
            ) : null}
            {predictedEmbedIssue ? (
                <div className="flex min-h-[24rem] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/15 bg-black/20 p-8 text-center">
                    <p className="max-w-xl text-sm text-muted">{embedWarningText}</p>
                    <a
                        href={module.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl bg-plex px-4 py-2 text-sm font-bold text-background hover:bg-plex-hover"
                    >
                        <ExternalLink className="h-4 w-4" />
                        {t('settings.homeModules.embed.openInBrowser')}
                    </a>
                </div>
            ) : (
                <div className="min-h-[24rem] overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                    <iframe
                        key={iframeKey}
                        title={module.title}
                        src={iframeSrc}
                        className="h-full min-h-[24rem] w-full border-0 bg-white"
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
