import http from 'http';
import https from 'https';
import dns from 'node:dns/promises';
import net from 'node:net';
import { Readable } from 'node:stream';

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

/** Skip in-memory HTML/JS/CSS rewrites above this size to avoid OOM on large bundles. */
export const EMBED_PROXY_MAX_REWRITE_BYTES = 8 * 1024 * 1024;

export const EMBED_PROXY_FRAME_CSP = "frame-ancestors 'self'; object-src 'none'";

export const isPortalEmbedProxyPath = (path) => (
    /\/api\/(custom-tab-embed|home-module-embed|spotify-to-plex-embed)(\/|$)/.test(String(path || '').split('?')[0])
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

export const rewriteSpaUrlBase = (text, proxyPath) => {
    const path = String(proxyPath || '').replace(/\/+$/, '') || '/';
    return String(text || '')
        .replace(/(urlBase\s*:\s*)(["'])\2/g, `$1$2${path}$2`)
        .replace(/(urlBase\s*:\s*)(["'])\/\2/g, `$1$2${path}$2`);
};

export const rewriteWebpackPublicPath = (text, proxyPath) => {
    const pub = `${String(proxyPath || '').replace(/\/+$/, '')}/`;
    const escaped = pub.replace(/\$/g, '$$$$');
    return String(text || '')
        .replace(/__webpack_require__\.p\s*=\s*(["'])\/?\1/g, `__webpack_require__.p=$1${escaped}$1`)
        .replace(/__webpack_public_path__\s*=\s*(["'])\/?\1/g, `__webpack_public_path__=$1${escaped}$1`);
};

/** SvelteKit (Immich) bootstraps with dynamic import("/_app/...") which ignores <base href>. */
export const rewriteDynamicImports = (text, proxyPublicPrefix) => {
    const prefix = String(proxyPublicPrefix || '').replace(/\/$/, '');
    if (!prefix || !text) return text;
    return String(text)
        .replace(/import\s*\(\s*(["'])\/(?!\/)/g, `import($1${prefix}/`)
        .replace(/import\s*\(\s*`\//g, `import(\`${prefix}/`);
};

export const isLeakedArrEmbedAssetPath = (pathname) => {
    const p = String(pathname || '').split('?')[0];
    if (p === '/Content' || p.startsWith('/Content/')) return true;
    if (p === '/UI' || p.startsWith('/UI/')) return true;
    if (p === '/initialize.js') return true;
    if (/^\/[0-9]+-[a-z0-9]+\.(js|css)$/i.test(p)) return true;
    if (/^\/signalr(\/|$)/i.test(p)) return true;
    // *arr SPAs build API URLs as /api/v3/... on the iframe origin.
    if (p === '/api/v3' || p.startsWith('/api/v3/')) return true;
    if (p === '/api/v1' || p.startsWith('/api/v1/')) return true;
    // SvelteKit / Immich assets and bootstrap paths.
    if (p === '/_app' || p.startsWith('/_app/')) return true;
    if (p === '/service-worker.js') return true;
    if (p === '/favicon.ico' || /^\/favicon-\d+\.png$/i.test(p) || /^\/apple-icon-\d+\.png$/i.test(p)) return true;
    // Immich API namespaces (avoid portal /api/auth/plex, /api/config, etc.).
    if (p === '/api/server' || p.startsWith('/api/server/')) return true;
    if (p === '/api/assets' || p.startsWith('/api/assets/')) return true;
    if (p === '/api/albums' || p.startsWith('/api/albums/')) return true;
    if (p === '/api/timeline' || p.startsWith('/api/timeline/')) return true;
    if (p === '/api/search' || p.startsWith('/api/search/')) return true;
    if (p === '/api/jobs' || p.startsWith('/api/jobs/')) return true;
    if (p === '/api/socket' || p.startsWith('/api/socket/')) return true;
    if (p === '/api/sync' || p.startsWith('/api/sync/')) return true;
    if (p === '/api/oauth' || p.startsWith('/api/oauth/')) return true;
    if (p === '/api/map' || p.startsWith('/api/map/')) return true;
    if (p === '/api/tags' || p.startsWith('/api/tags/')) return true;
    if (p === '/api/people' || p.startsWith('/api/people/')) return true;
    if (p === '/api/shared-links' || p.startsWith('/api/shared-links/')) return true;
    if (p === '/api/download' || p.startsWith('/api/download/')) return true;
    if (p === '/api/server-info' || p.startsWith('/api/server-info/')) return true;
    return false;
};

export const parseEmbedProxyFromReferer = (referer) => {
    const match = String(referer || '').match(/\/api\/(custom-tab-embed|home-module-embed)\/([^/?#]+)/i);
    if (!match) return null;
    try {
        return { routeName: match[1], entityId: decodeURIComponent(match[2]) };
    } catch {
        return { routeName: match[1], entityId: match[2] };
    }
};

export const buildEmbedProxyShim = (proxyPath) => {
    const prefix = JSON.stringify(String(proxyPath || '').replace(/\/+$/, '') || '/');
    return `<script data-portal-embed-shim="1">(function(){var p=${prefix};function r(u){if(u==null)return u;var s=String(u);if(!s||s===p||s.indexOf(p+'/')===0)return s;if(s.charAt(0)==='/'&&s.charAt(1)!=='/')return p+s;try{var x=new URL(s,location.href);if(x.origin===location.origin&&x.pathname!==p&&x.pathname.indexOf(p+'/')!==0){x.pathname=p+x.pathname;return x.href;}}catch(e){}return s;}function pin(o){if(o&&typeof o==='object')try{o.urlBase=p;}catch(e){}}function fix(el){if(!el||el.nodeType!==1||!el.getAttribute)return;['src','href'].forEach(function(a){var v=el.getAttribute(a);if(!v)return;var n=r(v);if(n!==v)el.setAttribute(a,n);});}['Sonarr','Radarr','Lidarr','Prowlarr','Whisparr','Readarr'].forEach(function(n){var c=window[n];try{Object.defineProperty(window,n,{configurable:true,enumerable:true,get:function(){return c;},set:function(v){c=v;pin(v);}});}catch(e){}pin(c);});try{var f=window.fetch;if(f){window.fetch=function(i,n){if(typeof i==='string')i=r(i);else if(i instanceof Request)i=new Request(r(i.url),i);return f.call(this,i,n);};}var o=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){arguments[1]=r(u);return o.apply(this,arguments);};if(window.WebSocket){var W=window.WebSocket;window.WebSocket=function(u,c){return c===undefined?new W(r(u)):new W(r(u),c);};window.WebSocket.prototype=W.prototype;window.WebSocket.CONNECTING=W.CONNECTING;window.WebSocket.OPEN=W.OPEN;window.WebSocket.CLOSING=W.CLOSING;window.WebSocket.CLOSED=W.CLOSED;}var hp=history.pushState.bind(history);history.pushState=function(s,t,u){if(u!=null)u=r(u);return hp(s,t,u);};var hr=history.replaceState.bind(history);history.replaceState=function(s,t,u){if(u!=null)u=r(u);return hr(s,t,u);}try{var la=location.assign.bind(location);location.assign=function(u){return la(r(u));};var lr=location.replace.bind(location);location.replace=function(u){return lr(r(u));};}catch(e){}var sa=Element.prototype.setAttribute;Element.prototype.setAttribute=function(n,v){if((n==='src'||n==='href')&&typeof v==='string')v=r(v);return sa.call(this,n,v);};function patch(proto,attr){var d=Object.getOwnPropertyDescriptor(proto,attr);if(!d||!d.set)return;Object.defineProperty(proto,attr,{configurable:true,enumerable:d.enumerable,get:d.get,set:function(v){d.set.call(this,r(v));}});}patch(HTMLScriptElement.prototype,'src');patch(HTMLLinkElement.prototype,'href');patch(HTMLImageElement.prototype,'src');if(window.MutationObserver){new MutationObserver(function(ms){ms.forEach(function(m){if(m.type==='attributes')fix(m.target);(m.addedNodes||[]).forEach(function(n){fix(n);if(n.querySelectorAll)n.querySelectorAll('link[href],script[src],img[src]').forEach(fix);});});}).observe(document.documentElement||document,{childList:true,subtree:true,attributes:true,attributeFilter:['src','href']});}}catch(e){}})();</script>`;
};

export const injectEmbedProxyShim = (html, proxyPublicPrefix) => {
    let text = String(html || '');
    if (!text || /data-portal-embed-shim=/i.test(text)) return text;
    if (!/<(!doctype|html|head)\b/i.test(text)) return text;
    const proxyPath = proxyPathnameFromPrefix(proxyPublicPrefix);
    text = text.replace(/<base\b[^>]*>/gi, '');
    text = rewriteSpaUrlBase(text, proxyPath);
    const shim = buildEmbedProxyShim(proxyPath);
    const baseHref = String(proxyPublicPrefix || '').endsWith('/')
        ? proxyPublicPrefix
        : `${proxyPublicPrefix}/`;
    const headBits = `<meta name="color-scheme" content="light dark"><style data-portal-embed-color-scheme="1">:root{color-scheme:light dark;}</style><base href="${baseHref}">${shim}`;
    if (/<head[^>]*>/i.test(text)) return text.replace(/<head[^>]*>/i, (match) => `${match}${headBits}`);
    if (/<html[^>]*>/i.test(text)) return text.replace(/<html[^>]*>/i, (match) => `${match}${headBits}`);
    return `${headBits}${text}`;
};

export const isBlockedEmbedMetadataHost = (hostname = '') => {
    const host = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
    if (!host) return true;
    if (
        host === 'metadata.google.internal'
        || host === 'metadata.goog'
        || host.endsWith('.metadata.google.internal')
        || host === 'kubernetes.default'
        || host === 'kubernetes.default.svc'
    ) return true;
    if (host === '169.254.169.254' || host === 'fd00:ec2::254') return true;
    if (net.isIPv4(host) && host.startsWith('169.254.')) return true;
    return false;
};

export const assertEmbedTargetNotMetadata = async (rawUrl) => {
    const parsed = new URL(String(rawUrl || '').trim());
    if (isBlockedEmbedMetadataHost(parsed.hostname)) {
        const error = new Error('Embed target is not allowed');
        error.status = 403;
        throw error;
    }
    if (net.isIP(parsed.hostname)) return;
    let addresses;
    try {
        addresses = await dns.lookup(parsed.hostname, { all: true, verbatim: true });
    } catch {
        return;
    }
    for (const entry of addresses || []) {
        const address = String(entry?.address || entry || '');
        if (isBlockedEmbedMetadataHost(address) || address.startsWith('169.254.')) {
            const error = new Error('Embed target is not allowed');
            error.status = 403;
            throw error;
        }
    }
};

export const buildCustomTabTargetUrl = (tabUrl, subPath = '', search = '') => {
    const base = new URL(String(tabUrl || '').trim());
    const normalizedSub = String(subPath || '').replace(/^\/+/, '');
    if (/(^|[\\/])\.\.([\\/]|$)/.test(normalizedSub) || normalizedSub.includes('\\') || normalizedSub.includes('\0')) {
        throw new Error('Invalid embed path');
    }
    const applySearch = (url) => {
        if (search) url.search = String(search).replace(/^\?/, '');
        return url.href;
    };
    if (!normalizedSub) {
        return applySearch(new URL(tabUrl));
    }
    let dir = base.pathname || '/';
    if (!dir.endsWith('/')) dir = `${dir}/`;
    const target = dir === '/'
        ? new URL(`/${normalizedSub}`, base.origin)
        : new URL(normalizedSub, new URL(dir, base.origin));
    if (target.origin !== base.origin) {
        throw new Error('Invalid embed path');
    }
    if (dir !== '/' && !target.pathname.startsWith(dir) && `${target.pathname}/` !== dir) {
        throw new Error('Invalid embed path');
    }
    return applySearch(target);
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
    const isHtml = ct.includes('text/html');
    const isJs = ct.includes('javascript') || ct.includes('ecmascript');
    const isCss = ct.includes('text/css');
    let out = text;
    // Blanket origin swap in minified JS can break syntax (e.g. regexes, comments before try).
    if (isHtml || isCss || ct.includes('json')) {
        for (const origin of origins) {
            out = out.split(origin).join(prefix);
        }
    }
    if (isHtml || isCss) {
        out = rewriteRootRelativeUrls(out, prefix);
    }
    if (isJs || isHtml) {
        out = rewriteWebpackPublicPath(out, proxyPathnameFromPrefix(prefix));
        out = rewriteDynamicImports(out, prefix);
    }
    if (isHtml) {
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

export const copyResponseHeaders = (upstream, res, { proxyPath, tabUrl, proxyPublicPrefix, passthroughBinary = false }) => {
    upstream.headers.forEach((value, key) => {
        const lower = key.toLowerCase();
        if (BLOCKED_RESPONSE_HEADERS.has(lower)) return;
        if (!passthroughBinary && lower === 'content-length') return;
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

export const drainUpstreamBody = async (upstream) => {
    try {
        const body = upstream?.body;
        if (!body) return;
        if (typeof body.destroy === 'function') {
            body.destroy();
            return;
        }
        if (typeof body.cancel === 'function') {
            await body.cancel();
        }
    } catch {
        // ignore cleanup failures
    }
};

export const readUpstreamBodyWithLimit = async (upstream, maxBytes = EMBED_PROXY_MAX_REWRITE_BYTES) => {
    const limit = Number(maxBytes) > 0 ? Number(maxBytes) : EMBED_PROXY_MAX_REWRITE_BYTES;
    const body = upstream?.body;
    if (body && typeof body[Symbol.asyncIterator] === 'function') {
        const chunks = [];
        let total = 0;
        for await (const chunk of body) {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            total += buf.length;
            if (total > limit) {
                await drainUpstreamBody(upstream);
                const error = new Error(`Upstream response exceeds ${limit} byte embed proxy limit`);
                error.code = 'EMBED_PROXY_BODY_TOO_LARGE';
                throw error;
            }
            chunks.push(buf);
        }
        return Buffer.concat(chunks);
    }
    if (typeof upstream?.arrayBuffer === 'function') {
        const buf = Buffer.from(await upstream.arrayBuffer());
        if (buf.length > limit) {
            const error = new Error(`Upstream response exceeds ${limit} byte embed proxy limit`);
            error.code = 'EMBED_PROXY_BODY_TOO_LARGE';
            throw error;
        }
        return buf;
    }
    return Buffer.alloc(0);
};

export const pipeUpstreamBody = (upstream, res, { log = () => {}, proxyRouteName = '', entityId = '' } = {}) => {
    const body = upstream?.body;
    if (!body) {
        res.end();
        return;
    }
    const onClientClose = () => {
        drainUpstreamBody(upstream);
    };
    res.once('close', onClientClose);
    body.once('error', (error) => {
        res.removeListener('close', onClientClose);
        log(`[${proxyRouteName}] ${entityId} upstream stream error: ${error.message}`);
        if (!res.headersSent) {
            res.status(502).end('Failed to stream embedded content.');
        } else {
            res.end();
        }
    });
    body.pipe(res);
};

/** Bounded keep-alive pool for embed proxy upstream fetches (avoids unbounded socket growth). */
export const createEmbedProxyFetch = (fetchImpl, options = {}) => {
    const maxSockets = Number(options.maxSockets) > 0 ? Number(options.maxSockets) : 32;
    const maxFreeSockets = Math.min(8, maxSockets);
    const httpAgent = new http.Agent({
        keepAlive: true,
        maxSockets,
        maxFreeSockets,
        timeout: 60000,
    });
    const httpsAgent = new https.Agent({
        keepAlive: true,
        maxSockets,
        maxFreeSockets,
        timeout: 60000,
    });
    return (url, init = {}, timeoutMs) => {
        const isHttps = String(url || '').toLowerCase().startsWith('https:');
        return fetchImpl(url, { ...init, agent: isHttps ? httpsAgent : httpAgent }, timeoutMs);
    };
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
        let targetUrl;
        try {
            targetUrl = buildCustomTabTargetUrl(sourceUrl, subPath, search);
            await assertEmbedTargetNotMetadata(targetUrl);
        } catch (error) {
            const status = Number(error?.status) || (String(error?.message || '').includes('Invalid embed path') ? 400 : 403);
            return res.status(status).send(status === 400 ? 'Invalid embed path' : 'Embed target is not allowed');
        }
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
        const contentType = upstream.headers.get('content-type') || '';
        const isTextual = isTextualContentType(contentType);

        copyResponseHeaders(upstream, res, {
            proxyPath,
            tabUrl: target.sourceUrl,
            proxyPublicPrefix,
            passthroughBinary: !isTextual,
        });
        applyEmbedProxyFrameHeaders(res);
        res.status(upstream.status);

        // Login is usually 302 + Set-Cookie. Dropping cookies here sends the iframe
        // back to /login with no session, which looks like the form just reloaded.
        if (method === 'HEAD' || (upstream.status >= 300 && upstream.status < 400)) {
            await drainUpstreamBody(upstream);
            return res.end();
        }

        if (!isTextual) {
            if (upstream.body && typeof upstream.body.pipe === 'function') {
                pipeUpstreamBody(upstream, res, { log, proxyRouteName, entityId });
                return;
            }
            if (upstream.body && typeof Readable.fromWeb === 'function' && typeof upstream.body.getReader === 'function') {
                pipeUpstreamBody({ body: Readable.fromWeb(upstream.body) }, res, { log, proxyRouteName, entityId });
                return;
            }
            const raw = await readUpstreamBodyWithLimit(upstream, EMBED_PROXY_MAX_REWRITE_BYTES * 4);
            return res.send(raw);
        }

        const raw = await readUpstreamBodyWithLimit(upstream);
        if (raw.length > EMBED_PROXY_MAX_REWRITE_BYTES) {
            log(`[${proxyRouteName}] ${entityId} textual response ${raw.length} bytes exceeds rewrite cap; sending without rewrite`);
            return res.send(raw);
        }
        const rewritten = rewriteProxiedBody(raw.toString('utf8'), contentType, target.sourceUrl, proxyPublicPrefix);
        return res.send(rewritten);
    } catch (error) {
        if (error?.code === 'EMBED_PROXY_BODY_TOO_LARGE') {
            log(`[${proxyRouteName}] ${entityId} ${req.method} body too large: ${error.message}`);
            applyEmbedProxyFrameHeaders(res);
            return res.status(502).send('Embedded upstream response was too large for the portal proxy.');
        }
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
