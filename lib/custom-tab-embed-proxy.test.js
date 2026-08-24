import assert from 'node:assert/strict';
import {
    applyEmbedProxyFrameHeaders,
    buildCustomTabTargetUrl,
    createEmbedProxyHandler,
    filterUpstreamCookieHeader,
    injectEmbedProxyShim,
    isPortalEmbedProxyPath,
    rewriteLocationHeader,
    rewriteProxiedBody,
    rewriteRootRelativeUrls,
} from './custom-tab-embed-proxy.js';

assert.equal(
    buildCustomTabTargetUrl('http://192.168.1.6:8888/photos', '', ''),
    'http://192.168.1.6:8888/photos',
);
assert.equal(
    buildCustomTabTargetUrl('https://sonarr.strymx.co.uk/', 'api/v3/system/status', ''),
    'https://sonarr.strymx.co.uk/api/v3/system/status',
);

const proxy = 'https://portal.strymx.co.uk/api/custom-tab-embed/abc';
assert.equal(
    rewriteLocationHeader('/login', 'https://sonarr.strymx.co.uk/', proxy),
    'https://portal.strymx.co.uk/api/custom-tab-embed/abc/login',
);

const html = '<script src="https://sonarr.strymx.co.uk/Content/app.js"></script>';
assert.equal(
    rewriteProxiedBody(html, 'text/html', 'https://sonarr.strymx.co.uk/', proxy),
    `<script src="${proxy}/Content/app.js"></script>`,
);

assert.equal(
    rewriteRootRelativeUrls('<script src="/Content/app.js"></script>', proxy),
    `<script src="${proxy}/Content/app.js"></script>`,
);

const page = rewriteProxiedBody(
    '<!doctype html><html><head></head><body><script src="/Content/app.js"></script></body></html>',
    'text/html',
    'https://tv.strymx.co.uk/',
    proxy,
);
assert.match(page, new RegExp(`src="${proxy}/Content/app.js"`));
assert.match(page, /data-portal-embed-shim="1"/);
assert.match(page, /<base href="https:\/\/portal\.strymx\.co\.uk\/api\/custom-tab-embed\/abc\/">/);
assert.match(injectEmbedProxyShim('<html><head></head></html>', proxy), /history\.pushState/);

assert.equal(filterUpstreamCookieHeader('session=portal-jwt; arrAuth=sonarr'), 'arrAuth=sonarr');
assert.equal(filterUpstreamCookieHeader('session=portal-jwt'), '');

assert.equal(isPortalEmbedProxyPath('/api/custom-tab-embed/abc/'), true);
assert.equal(isPortalEmbedProxyPath('/api/home-module-embed/xyz/foo'), true);
assert.equal(isPortalEmbedProxyPath('/api/config'), false);
assert.equal(isPortalEmbedProxyPath('/portal'), false);

const framed = { headers: {} };
applyEmbedProxyFrameHeaders({
    setHeader(key, value) {
        framed.headers[String(key).toLowerCase()] = value;
    },
});
assert.equal(framed.headers['x-frame-options'], 'SAMEORIGIN');
assert.match(framed.headers['content-security-policy'], /frame-ancestors 'self'/);

const mockRes = () => {
    const res = {
        statusCode: 200,
        headers: {},
        body: null,
        setHeader(key, value) {
            this.headers[String(key).toLowerCase()] = value;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        send(body) {
            this.body = body;
            return this;
        },
        end() {
            return this;
        },
    };
    return res;
};

const handler = createEmbedProxyHandler({
    loadConfig: async () => ({}),
    resolveEmbedTarget: async () => ({ sourceUrl: 'https://tv.strymx.co.uk/' }),
    proxyRouteName: 'custom-tab-embed',
    withBasePath: (route) => route,
    fetchWithTimeout: async () => ({
        status: 200,
        headers: {
            get: (key) => (String(key).toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null),
            forEach: (cb) => cb('text/html; charset=utf-8', 'content-type'),
            getSetCookie: () => [],
        },
        arrayBuffer: async () => Buffer.from('<!doctype html><html><head></head><body>sonarr-ok</body></html>'),
    }),
});

const req = {
    params: { tabId: 'abc' },
    url: '/',
    method: 'GET',
    protocol: 'https',
    headers: {},
    get: () => 'portal.strymx.co.uk',
};
const res = mockRes();
await handler(req, res);
assert.equal(res.statusCode, 200);
assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
assert.match(String(res.body), /sonarr-ok/);
assert.match(String(res.body), /data-portal-embed-shim="1"/);

const binaryHandler = createEmbedProxyHandler({
    loadConfig: async () => ({}),
    resolveEmbedTarget: async () => ({ sourceUrl: 'https://tv.strymx.co.uk/' }),
    proxyRouteName: 'custom-tab-embed',
    withBasePath: (route) => route,
    fetchWithTimeout: async () => ({
        status: 200,
        headers: {
            get: (key) => (String(key).toLowerCase() === 'content-type' ? 'image/png' : null),
            forEach: (cb) => cb('image/png', 'content-type'),
            getSetCookie: () => [],
        },
        arrayBuffer: async () => Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    }),
});
const binaryRes = mockRes();
await binaryHandler({ ...req, params: { tabId: 'abc', 0: 'logo.png' } }, binaryRes);
assert.ok(Buffer.isBuffer(binaryRes.body));
assert.deepEqual([...binaryRes.body], [0x89, 0x50, 0x4e, 0x47]);

console.log('custom tab embed proxy ok');
