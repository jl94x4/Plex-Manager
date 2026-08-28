import React, { useEffect, useMemo, useRef, useState } from 'react';
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

const HOME_HTML_RESIZE_SOURCE = 'smp-home-html-resize';
const MIN_HOME_HTML_FRAME_PX = 1;
const MAX_HOME_HTML_FRAME_PX = 100_000;

const clampHomeHtmlFrameHeight = (value: unknown) => {
    const height = Math.ceil(Number(value));
    if (!Number.isFinite(height) || height < 0) return null;
    return Math.min(Math.max(height, MIN_HOME_HTML_FRAME_PX), MAX_HOME_HTML_FRAME_PX);
};

const buildHomeHtmlResizeScript = (moduleId: string) => {
    const meta = JSON.stringify({ source: HOME_HTML_RESIZE_SOURCE, id: String(moduleId) });
    return `<script>(function(){`
        + `var meta=${meta};`
        + `var last=-1;`
        + `function measure(){`
        + `var wrap=document.querySelector(".home-custom-module-html");`
        + `var body=document.body;`
        + `var root=document.documentElement;`
        + `var height=Math.ceil(Math.max(wrap&&wrap.scrollHeight||0,wrap&&wrap.offsetHeight||0,body&&body.scrollHeight||0,body&&body.offsetHeight||0,root&&root.scrollHeight||0));`
        + `if(!isFinite(height)||height<0) height=0;`
        + `if(height===last) return;`
        + `last=height;`
        + `parent.postMessage({source:meta.source,id:meta.id,height:height},"*");`
        + `}`
        + `function schedule(){ if(typeof requestAnimationFrame==="function") requestAnimationFrame(measure); else measure(); }`
        + `window.addEventListener("load",schedule);`
        + `window.addEventListener("resize",schedule);`
        + `document.addEventListener("click",function(){ setTimeout(schedule,50); setTimeout(schedule,320); });`
        + `document.addEventListener("transitionend",schedule);`
        + `if(typeof ResizeObserver!=="undefined"){ var ro=new ResizeObserver(schedule); if(document.documentElement) ro.observe(document.documentElement); if(document.body) ro.observe(document.body); var wrapEl=document.querySelector(".home-custom-module-html"); if(wrapEl) ro.observe(wrapEl); }`
        + `if(typeof MutationObserver!=="undefined"&&document.body){ new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,characterData:true}); }`
        + `schedule();`
        + `})();</script>`;
};

const buildHomeHtmlSrcDoc = (html: string, css: string, theme: PortalHtmlTheme, moduleId: string) => {
    const safeCss = String(css || '').replace(/<\/style/gi, '<\\/style');
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>`
        + `:root{color-scheme:${theme.colorScheme};}`
        + `html,body{margin:0;padding:0;background:rgb(${theme.card});color:rgb(${theme.text});font-family:Inter,system-ui,sans-serif;}`
        + `.home-custom-module-html{box-sizing:border-box;min-width:0;}`
        + `${safeCss}`
        + `html,body,.home-custom-module-html{height:auto!important;max-height:none!important;overflow:visible!important;}`
        + `</style></head><body><div class="home-custom-module-html">${html || ''}</div>${buildHomeHtmlResizeScript(moduleId)}</body></html>`;
};

export const HomeCustomModuleSection: React.FC<Props> = ({ module, isAdmin = false }) => {
    const { t } = useDiscoverI18n();
    const [iframeKey, setIframeKey] = useState(0);
    const [embedBlocked, setEmbedBlocked] = useState(false);
    const [portalTheme, setPortalTheme] = useState<PortalHtmlTheme>(DEFAULT_HTML_THEME);
    const [htmlFrameHeight, setHtmlFrameHeight] = useState<number | null>(null);
    const htmlIframeRef = useRef<HTMLIFrameElement>(null);
    const accessible = canAccessHomeCustomModule(module, isAdmin);
    const usesProxy = homeModuleUsesProxy(module);
    const predictedEmbedIssue = module.mode === 'iframe' ? homeModuleEmbedIssue(module) : null;
    const iframeSrc = useMemo(() => (
        module.mode === 'iframe' ? resolveHomeModuleIframeSrc(module) : ''
    ), [module]);
    const htmlSrcDoc = useMemo(() => (
        module.mode === 'html'
            ? buildHomeHtmlSrcDoc(module.html || '', module.css || '', portalTheme, module.id)
            : ''
    ), [module.mode, module.html, module.css, module.id, portalTheme]);

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

    useEffect(() => {
        setHtmlFrameHeight(null);
    }, [htmlSrcDoc]);

    useEffect(() => {
        if (module.mode !== 'html') return;
        const onMessage = (event: MessageEvent) => {
            const frame = htmlIframeRef.current;
            if (!frame || event.source !== frame.contentWindow) return;
            const data = event.data;
            if (!data || data.source !== HOME_HTML_RESIZE_SOURCE || String(data.id) !== String(module.id)) return;
            const next = clampHomeHtmlFrameHeight(data.height);
            if (next == null) return;
            setHtmlFrameHeight((prev) => (prev === next ? prev : next));
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [module.id, module.mode]);

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
                <iframe
                    ref={htmlIframeRef}
                    title={module.title}
                    srcDoc={htmlSrcDoc}
                    className="block w-full rounded-xl border-0"
                    style={{
                        height: htmlFrameHeight ?? undefined,
                        minHeight: htmlFrameHeight ? undefined : '16rem',
                        overflow: 'hidden',
                        colorScheme: portalTheme.colorScheme,
                        backgroundColor: `rgb(${portalTheme.card})`,
                    }}
                    scrolling="no"
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
