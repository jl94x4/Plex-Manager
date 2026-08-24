const BLOCKED_RESPONSE_HEADERS = new Set([
    'x-frame-options',
    'content-security-policy',
    'content-security-policy-report-only',
    'transfer-encoding',
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
    'accept-encoding',
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
    if (!TEXTUAL_CONTENT_TYPES.some((type) => ct.includes(type))) return text;
    const base = new URL(tabUrl);
    const origins = [base.origin, `${base.protocol}//${base.host}`];
    const prefix = proxyPublicPrefix.replace(/\/$/, '');
    let out = text;
    for (const origin of origins) {
        out = out.split(origin).join(prefix);
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

        const search = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        const targetUrl = buildCustomTabTargetUrl(target.sourceUrl, subPath, search);
        const method = String(req.method || 'GET').toUpperCase();
        const headers = pickRequestHeaders(req, targetUrl);
        const init = { method, headers, redirect: 'manual' };

        if (method !== 'GET' && method !== 'HEAD') {
            if (Buffer.isBuffer(req.body)) init.body = req.body;
            else if (typeof req.body === 'string') init.body = req.body;
            else if (req.body != null) {
                headers['content-type'] = headers['content-type'] || 'application/json';
                init.body = JSON.stringify(req.body);
            }
        }

        const upstream = await fetchWithTimeout(targetUrl, init, 30000);
        const proxyPath = withBasePath(`/api/${proxyRouteName}/${encodeURIComponent(entityId)}`);
        const proxyPublicPrefix = `${req.protocol}://${req.get('host')}${proxyPath}`;

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
        res.status(upstream.status);

        if (method === 'HEAD') {
            return res.end();
        }

        const raw = Buffer.from(await upstream.arrayBuffer());
        const rewritten = rewriteProxiedBody(raw.toString('utf8'), contentType, target.sourceUrl, proxyPublicPrefix);
        return res.send(Buffer.from(rewritten, 'utf8'));
    } catch (error) {
        log(`[${proxyRouteName}] ${entityId} ${req.method} failed: ${error.message}`);
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
