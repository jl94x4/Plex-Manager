const BLOCKED_RESPONSE_HEADERS = new Set([
    'x-frame-options',
    'content-security-policy',
    'content-security-policy-report-only',
    'transfer-encoding',
    'content-encoding',
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailers',
    'upgrade',
]);

const REQUEST_HEADER_ALLOW = new Set([
    'accept',
    'accept-language',
    'content-type',
    'content-length',
    'if-none-match',
    'if-modified-since',
    'range',
    'cache-control',
    'origin',
    'referer',
]);

const TEXTUAL_CONTENT_TYPES = [
    'text/html',
    'text/css',
    'application/javascript',
    'text/javascript',
    'application/json',
    'application/xml',
    'text/xml',
];

const PORTAL_COOKIE_NAMES = new Set(['session', 'plex_oauth_state']);

export const EMBED_PROXY_FRAME_CSP = "frame-ancestors 'self'; object-src 'none'";

export const isPortalEmbedProxyPath = (path) => (
    /\/api\/(custom-tab-embed|home-module-embed)(\/|$)/.test(String(path || '').split('?')[0])
);

export const isTextualContentType = (contentType) => {
    const ct = String(contentType || '').toLowerCase();
    return TEXTUAL_CONTENT_TYPES.some((type) => ct.includes(type));
};

export const filterUpstreamCookieHeader = (cookieHeader) => (
    String(cookieHeader || '')
        .split(';')
        .map((part) => part.trim())
        .filter((part) => {
            if (!part) return false;
            const name = part.split('=')[0].trim().toLowerCase();
            return name && !PORTAL_COOKIE_NAMES.has(name);
        })
        .join('; ')
);

const requestContentType = (req) => String(
    req?.headers?.['content-type'] || req?.headers?.['Content-Type'] || '',
).toLowerCase();

const appendFormValue = (params, key, value) => {
    if (value == null) return;
    if (Array.isArray(value)) {
        for (const item of value) appendFormValue(params, key, item);
        return;
    }
    if (typeof value === 'object') return;
    params.append(key, String(value));
};

/** Re-encode bodies Express already parsed so upstream apps still see a real form/JSON POST. */
export const serializeEmbedProxyRequestBody = (req) => {
    const body = req?.body;
    if (body == null) return undefined;
    if (Buffer.isBuffer(body) || typeof body === 'string') return body;
    if (typeof body !== 'object') return String(body);
    if (requestContentType(req).includes('application/x-www-form-urlencoded')) {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(body)) {
            appendFormValue(params, key, value);
        }
        return params.toString();
    }
    return JSON.stringify(body);
};

export const applyEmbedProxyFrameHeaders = (res) => {
    if (!res || typeof res.setHeader !== 'function') return;
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Security-Policy', EMBED_PROXY_FRAME_CSP);
};

const proxyPathnameFromPrefix = (proxyPublicPrefix) => {
    try {
        const href = String(proxyPublicPrefix || '');
        const url = new URL(href.endsWith('/') ? href : `${href}/`);
        return url.pathname.replace(/\/+$/, '') || '/';
    } catch {
        return String(proxyPublicPrefix || '').replace(/^https?:\/\/[^/]+/i, '').replace(/\/+$/, '') || '/';
    }
};

export const rewriteRootRelativeUrls = (text, proxyPublicPrefix) => {
    const prefix = String(proxyPublicPrefix || '').replace(/\/$/, '');
    if (!prefix || !text) return text;
    return String(text)
        .replace(/(\s(?:href|src|action|poster|data-src)\s*=\s*)(["'])\/(?!\/)/gi, `$1$2${prefix}/`)
        .replace(/(\ssrcset\s*=\s*)(["'])([^"']*)/gi, (_, attr, quote, value) => (
            `${attr}${quote}${value.replace(/(^|[\s,])\/(?!\/)/g, `$1${prefix}/`)}`
        ))
        .replace(/url\(\s*(['"]?)\/(?!\/)/gi, `url($1${prefix}/`);
};

export const buildEmbedProxyShim = (proxyPath) => {
    const prefix = JSON.stringify(String(proxyPath || '').replace(/\/+$/, '') || '/');
    return `<script data-portal-embed-shim="1">(function(){var p=${prefix};function r(u){if(u==null)return u;var s=String(u);if(!s||s===p||s.indexOf(p+'/')===0)return s;if(s.charAt(0)==='/'&&s.charAt(1)!=='/')return p+s;try{var x=new URL(s,location.href);if(x.origin===location.origin&&x.pathname!==p&&x.pathname.indexOf(p+'/')!==0){x.pathname=p+x.pathname;return x.href;}}catch(e){}return s;}try{var f=window.fetch;if(f){window.fetch=function(i,n){if(typeof i==='string')i=r(i);else if(i instanceof Request)i=new Request(r(i.url),i);return f.call(this,i,n);};}var o=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){arguments[1]=r(u);return o.apply(this,arguments);};if(window.WebSocket){var W=window.WebSocket;window.WebSocket=function(u,c){return c===undefined?new W(r(u)):new W(r(u),c);};window.WebSocket.prototype=W.prototype;window.WebSocket.CONNECTING=W.CONNECTING;window.WebSocket.OPEN=W.OPEN;window.WebSocket.CLOSING=W.CLOSING;window.WebSocket.CLOSED=W.CLOSED;}var hp=history.pushState.bind(history);history.pushState=function(s,t,u){if(u!=null)u=r(u);return hp(s,t,u);};var hr=history.replaceState.bind(history);history.replaceState=function(s,t,u){if(u!=null)u=r(u);return hr(s,t,u);};}catch(e){}})();</script>`;
};

export const injectEmbedProxyShim = (html, proxyPublicPrefix) => {
    const text = String(html || '');
    if (!text || /data-portal-embed-shim=/i.test(text)) return text;
    if (!/<(!doctype|html|head)\b/i.test(text)) return text;
    const shim = buildEmbedProxyShim(proxyPathnameFromPrefix(proxyPublicPrefix));
    const baseHref = String(proxyPublicPrefix || '').endsWith('/')
        ? proxyPublicPrefix
        : `${proxyPublicPrefix}/`;
    const headBits = `<meta name="color-scheme" content="light dark"><style data-portal-embed-color-scheme="1">:root{color-scheme:light dark;}</style><base href="${baseHref}">${shim}`;
    if (/<head[^>]*>/i.test(text)) return text.replace(/<head[^>]*>/i, (match) => `${match}${headBits}`);
    if (/<html[^>]*>/i.test(text)) return text.replace(/<html[^>]*>/i, (match) => `${match}${headBits}`);
    return `${headBits}${text}`;
};

export const buildCustomTabTargetUrl = (tabUrl, subPath = '', search = '') => {
    const base = new URL(String(tabUrl || '').trim());
    const normalizedSub = String(subPath || '').replace(/^\/+/, '');
    if (!normalizedSub) {
        const direct = new URL(tabUrl);
        if (search) {
            direct.search = String(search).replace(/^\?/, '');
        }
        return direct.href;
    }
    const target = new URL(`/${normalizedSub}`, base.origin);
    if (search) {
        target.search = String(search).replace(/^\?/, '');
    }
    return target.href;
};

export const rewriteLocationHeader = (location, tabUrl, proxyPublicPrefix) => {
    try {
        const base = new URL(tabUrl);
        const resolved = new URL(location, base);
        if (resolved.origin !== base.origin) return location;
        const rel = `${resolved.pathname}${resolved.search}${resolved.hash}`;
        const proxyBase = proxyPublicPrefix.endsWith('/') ? proxyPublicPrefix : `${proxyPublicPrefix}/`;
        return new URL(rel.replace(/^\//, ''), proxyBase).href;
    } catch {
        return location;
    }
};

export const rewriteSetCookieHeader = (value, proxyPath) => {
    let next = String(value || '');
    if (/;\s*path=/i.test(next)) {
        next = next.replace(/;\s*path=[^;]*/gi, `; Path=${proxyPath}`);
    } else {
        next += `; Path=${proxyPath}`;
    }
    if (/;\s*domain=/i.test(next)) {
        next = next.replace(/;\s*domain=[^;]*/gi, '');
    }
    if (/;\s*samesite=/i.test(next)) {
        next = next.replace(/;\s*samesite=[^;]*/gi, '; SameSite=Lax');
    } else {
        next += '; SameSite=Lax';
    }
    return next;
};

export const rewriteProxiedBody = (body, contentType, tabUrl, proxyPublicPrefix) => {
    const text = String(body || '');
    if (!text) return text;
    const ct = String(contentType || '').toLowerCase();
    if (!isTextualContentType(ct)) return text;
    const base = new URL(tabUrl);
    const origins = [base.origin, `${base.protocol}//${base.host}`];
    const prefix = proxyPublicPrefix.replace(/\/$/, '');
    let out = text;
    for (const origin of origins) {
        out = out.split(origin).join(prefix);
    }
    if (ct.includes('text/html') || ct.includes('text/css')) {
        out = rewriteRootRelativeUrls(out, prefix);
    }
    if (ct.includes('text/html')) {
        out = injectEmbedProxyShim(out, prefix);
    }
    return out;
};

const pickRequestHeaders = (req, targetUrl) => {
    const headers = {};
    for (const [key, value] of Object.entries(req.headers || {})) {
        const lower = key.toLowerCase();
        if (!REQUEST_HEADER_ALLOW.has(lower) || value == null) continue;
        if (lower === 'referer' || lower === 'origin') {
            headers[lower] = targetUrl;
            continue;
        }
        headers[lower] = Array.isArray(value) ? value.join(', ') : String(value);
    }
    const cookie = filterUpstreamCookieHeader(req.headers?.cookie);
    if (cookie) headers.cookie = cookie;
    headers['accept-encoding'] = 'identity';
    return headers;
};

const copyResponseHeaders = (upstream, res, { proxyPath, tabUrl, proxyPublicPrefix }) => {
    upstream.headers.forEach((value, key) => {
        const lower = key.toLowerCase();
        if (BLOCKED_RESPONSE_HEADERS.has(lower)) return;
        if (lower === 'content-length') return;
        if (lower === 'location') {
            res.setHeader('Location', rewriteLocationHeader(value, tabUrl, proxyPublicPrefix));
            return;
        }
        if (lower === 'set-cookie') {
            return;
        }
        res.setHeader(key, value);
    });
    const cookies = typeof upstream.headers.getSetCookie === 'function'
        ? upstream.headers.getSetCookie()
        : (upstream.headers.get('set-cookie') ? [upstream.headers.get('set-cookie')] : []);
    for (const cookie of cookies) {
        if (typeof res.append === 'function') {
            res.append('Set-Cookie', rewriteSetCookieHeader(cookie, proxyPath));
        } else {
            res.setHeader('Set-Cookie', rewriteSetCookieHeader(cookie, proxyPath));
        }
    }
};

export const createEmbedProxyHandler = ({
    loadConfig,
    resolveEmbedTarget,
    proxyRouteName,
    resolveCurrentAdmin,
    getSessionActor,
    effectiveViewerIsAdmin,
    withBasePath,
    fetchWithTimeout,
    log = () => {},
}) => async (req, res) => {
    applyEmbedProxyFrameHeaders(res);
    const entityId = String(req.params?.tabId || req.params?.moduleId || '').trim();
    const subPath = String(req.params?.[0] || '').replace(/^\/+/, '');
    if (!entityId) {
        return res.status(400).send('Missing embed id');
    }

    try {
        const config = await loadConfig();
        const target = await resolveEmbedTarget({
            req,
            config,
            entityId,
            resolveCurrentAdmin,
            getSessionActor,
            effectiveViewerIsAdmin,
        });
        if (!target) {
            return res.status(404).send('Embed target not found');
        }
        if (target.forbidden) {
            return res.status(403).send('Forbidden');
        }

        const sourceUrl = target.sourceUrl;
        const search = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        const targetUrl = buildCustomTabTargetUrl(sourceUrl, subPath, search);
        const method = String(req.method || 'GET').toUpperCase();
        const headers = pickRequestHeaders(req, targetUrl);
        const init = { method, headers, redirect: 'manual' };

        if (method !== 'GET' && method !== 'HEAD') {
            const body = serializeEmbedProxyRequestBody(req);
            if (body != null) {
                init.body = body;
                delete headers['content-length'];
                if (!headers['content-type'] && typeof body === 'string' && !Buffer.isBuffer(body)) {
                    headers['content-type'] = body.startsWith('{') || body.startsWith('[')
                        ? 'application/json'
                        : 'application/x-www-form-urlencoded';
                }
            }
        }

        const upstream = await fetchWithTimeout(targetUrl, init, 30000);
        const proxyPath = withBasePath(`/api/${proxyRouteName}/${encodeURIComponent(entityId)}`);
        const proxyPublicPrefix = `${req.protocol}://${req.get('host')}${proxyPath}`;
        applyEmbedProxyFrameHeaders(res);

        if (upstream.status >= 300 && upstream.status < 400) {
            const location = upstream.headers.get('location');
            res.status(upstream.status);
            if (location) {
                res.setHeader('Location', rewriteLocationHeader(location, target.sourceUrl, proxyPublicPrefix));
            }
            return res.end();
        }

        const contentType = upstream.headers.get('content-type') || '';
        copyResponseHeaders(upstream, res, {
            proxyPath,
            tabUrl: target.sourceUrl,
            proxyPublicPrefix,
        });
        applyEmbedProxyFrameHeaders(res);
        res.status(upstream.status);

        if (method === 'HEAD') {
            return res.end();
        }

        const raw = Buffer.from(await upstream.arrayBuffer());
        if (!isTextualContentType(contentType)) {
            return res.send(raw);
        }
        const rewritten = rewriteProxiedBody(raw.toString('utf8'), contentType, target.sourceUrl, proxyPublicPrefix);
        return res.send(rewritten);
    } catch (error) {
        log(`[${proxyRouteName}] ${entityId} ${req.method} failed: ${error.message}`);
        applyEmbedProxyFrameHeaders(res);
        return res.status(502).send('Failed to load embedded content through the portal proxy.');
    }
};

export const createCustomTabEmbedProxyHandler = (deps) => createEmbedProxyHandler({
    ...deps,
    proxyRouteName: 'custom-tab-embed',
    resolveEmbedTarget: async ({ req, config, entityId, resolveCurrentAdmin, getSessionActor, effectiveViewerIsAdmin }) => {
        const tabs = deps.normalizeCustomNavTabs(config.customNavTabs);
        const tab = tabs.find((entry) => String(entry.id) === entityId);
        if (!tab || !tab.enabled || tab.openMode !== 'embed') return null;
        const actor = getSessionActor(req.user);
        const isRealAdmin = await resolveCurrentAdmin(actor, config);
        const isAdmin = effectiveViewerIsAdmin(req.user, isRealAdmin);
        if (tab.adminOnly && !isAdmin) return { forbidden: true };
        return { sourceUrl: tab.url };
    },
});

export const createHomeModuleEmbedProxyHandler = (deps) => createEmbedProxyHandler({
    ...deps,
    proxyRouteName: 'home-module-embed',
    resolveEmbedTarget: async ({ req, config, entityId, resolveCurrentAdmin, getSessionActor, effectiveViewerIsAdmin }) => {
        const modules = deps.normalizeHomeCustomModules(config.homeCustomModules);
        const module = modules.find((entry) => String(entry.id) === entityId);
        if (!module || !module.enabled || module.mode !== 'iframe' || !module.url) return null;
        const actor = getSessionActor(req.user);
        const isRealAdmin = await resolveCurrentAdmin(actor, config);
        const isAdmin = effectiveViewerIsAdmin(req.user, isRealAdmin);
        if (module.adminOnly && !isAdmin) return { forbidden: true };
        return { sourceUrl: module.url };
    },
});
