import assert from 'node:assert/strict';
import {
    buildCustomTabTargetUrl,
    rewriteLocationHeader,
    rewriteProxiedBody,
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

console.log('custom tab embed proxy ok');
