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

type PortalHtmlTheme = {
    colorScheme: 'dark' | 'light';
    card: string;
    text: string;
};

const DEFAULT_HTML_THEME: PortalHtmlTheme = {
    colorScheme: 'dark',
    card: '22 27 34',
    text: '201 209 217',
};

const rgbComponents = (value: string, fallback: string) => (
    /^[\d.\s]+$/.test(value.trim()) ? value.trim() : fallback
);

const readPortalHtmlTheme = (): PortalHtmlTheme => {
    if (typeof document === 'undefined') return DEFAULT_HTML_THEME;
    const root = document.documentElement;
    const styles = getComputedStyle(root);
    const isLight = root.getAttribute('data-theme') === 'light';
    return {
        colorScheme: isLight ? 'light' : 'dark',
        card: rgbComponents(styles.getPropertyValue('--color-card'), isLight ? '255 255 255' : DEFAULT_HTML_THEME.card),
        text: rgbComponents(styles.getPropertyValue('--color-text'), isLight ? '22 27 34' : DEFAULT_HTML_THEME.text),
    };
};

const buildHomeHtmlSrcDoc = (html: string, css: string, theme: PortalHtmlTheme) => {
    const safeCss = String(css || '').replace(/<\/style/gi, '<\\/style');
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>`
        + `:root{color-scheme:${theme.colorScheme};}`
        + `html,body{margin:0;padding:0;background:rgb(${theme.card});color:rgb(${theme.text});font-family:Inter,system-ui,sans-serif;}`
        + `.home-custom-module-html{box-sizing:border-box;min-width:0;}`
        + `${safeCss}`
        + `</style></head><body><div class="home-custom-module-html">${html || ''}</div></body></html>`;
};

export const HomeCustomModuleSection: React.FC<Props> = ({ module, isAdmin = false }) => {
    const { t } = useDiscoverI18n();
    const [iframeKey, setIframeKey] = useState(0);
    const [embedBlocked, setEmbedBlocked] = useState(false);
    const [portalTheme, setPortalTheme] = useState<PortalHtmlTheme>(DEFAULT_HTML_THEME);
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

    useEffect(() => {
        const apply = () => setPortalTheme(readPortalHtmlTheme());
        apply();
        const observer = new MutationObserver(apply);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
        return () => observer.disconnect();
    }, []);

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
        const srcDoc = buildHomeHtmlSrcDoc(module.html || '', module.css || '', portalTheme);
        return (
            <div className="glass-card p-4 md:p-5 shadow-xl w-full min-w-0">
                {header}
                <iframe
                    title={module.title}
                    srcDoc={srcDoc}
                    className="min-h-[16rem] w-full rounded-xl"
                    style={{ colorScheme: portalTheme.colorScheme, backgroundColor: `rgb(${portalTheme.card})` }}
                    sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                    referrerPolicy="no-referrer"
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
