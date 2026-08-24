import {
    applyEmbedProxyFrameHeaders,
    buildCustomTabTargetUrl,
    copyResponseHeaders,
    createEmbedProxyHandler,
    drainUpstreamBody,
    isTextualContentType,
    readUpstreamBodyWithLimit,
    rewriteProxiedBody,
} from './custom-tab-embed-proxy.js';

export const SPOTIFY_TO_PLEX_EMBED_ROUTE = 'spotify-to-plex-embed';
export const SPOTIFY_TO_PLEX_EMBED_ENTITY_ID = 'app';
export const SPOTIFY_TO_PLEX_DEFAULT_INTERNAL_URL = 'http://spotify-to-plex:9030';

const STP_API_PREFIXES = [
    '/api/playlists',
    '/api/spotify/',
    '/api/plex/',
    '/api/lidarr',
    '/api/slskd',
    '/api/tidal',
    '/api/saved-items',
    '/api/download',
    '/api/auth/url',
    '/api/auth/verify',
    '/api/settings',
    '/api/logs',
    '/api/sync',
];

export const isSpotifyToPlexEnabled = (config) => (
    !!config?.spotifyToPlexEnabled
    && String(config?.mediaServerType || 'plex').toLowerCase() === 'plex'
    && !!String(config?.spotifyToPlexInternalUrl || '').trim()
);

export const sanitizeSpotifyToPlexProxyBase = (rawUrl, { allowPrivate = false } = {}) => {
    const normalized = String(rawUrl || '').trim().replace(/\/+$/, '');
    if (!normalized) throw new Error('Spotify Sync internal URL is empty.');
    let url;
    try {
        url = new URL(normalized);
    } catch {
        throw new Error('Spotify Sync internal URL is invalid.');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('Spotify Sync internal URL must be http or https.');
    }
    const host = url.hostname;
    const isLoopback = /^(localhost|127(?:\.\d+){3})$/i.test(host);
    if (!isLoopback && !allowPrivate) {
        throw new Error('Spotify Sync internal URL must be loopback unless ALLOW_PRIVATE_INTEGRATION_URLS=true');
    }
    return `${url.origin}`;
};

export const resolveSpotifyToPlexCallbackUrl = (config, withBasePath, resolvePublicBaseUrl) => {
    const publicBase = String(resolvePublicBaseUrl?.(config) || '').trim().replace(/\/+$/, '');
    if (!publicBase) return '';
    const path = withBasePath?.('/api/spotify-to-plex/callback') || '/api/spotify-to-plex/callback';
    return `${publicBase}${path.startsWith('/') ? path : `/${path}`}`;
};

export const applySpotifyToPlexDefaults = (config, { log = () => {} } = {}) => {
    const next = { ...(config || {}) };
    if (!next.spotifyToPlexEnabled) return { config: next, changed: false };

    let changed = false;
    const currentUrl = String(next.spotifyToPlexInternalUrl || '').trim();
    if (!currentUrl) {
        next.spotifyToPlexInternalUrl = SPOTIFY_TO_PLEX_DEFAULT_INTERNAL_URL;
        changed = true;
        log(`[spotify-sync] Default internal URL set to ${SPOTIFY_TO_PLEX_DEFAULT_INTERNAL_URL}`);
    }
    return { config: next, changed };
};

export const isLeakedSpotifyToPlexEmbedAssetPath = (pathname) => {
    const p = String(pathname || '').split('?')[0];
    if (p === '/_next' || p.startsWith('/_next/')) return true;
    if (STP_API_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`) || p.startsWith(prefix))) {
        return true;
    }
    return false;
};

export const parseSpotifyToPlexEmbedFromReferer = (referer) => {
    const match = String(referer || '').match(/\/api\/spotify-to-plex-embed\/([^/?#]+)/i);
    if (!match) return null;
    try {
        return { entityId: decodeURIComponent(match[1]) };
    } catch {
        return { entityId: match[1] };
    }
};

export const createSpotifyToPlexEmbedProxyHandler = (deps) => createEmbedProxyHandler({
    ...deps,
    proxyRouteName: SPOTIFY_TO_PLEX_EMBED_ROUTE,
    resolveEmbedTarget: async ({
        config,
        resolveCurrentAdmin,
        getSessionActor,
        effectiveViewerIsAdmin,
        req,
    }) => {
        if (!isSpotifyToPlexEnabled(config)) return null;
        const actor = getSessionActor(req.user);
        const isRealAdmin = await resolveCurrentAdmin(actor, config);
        const isAdmin = effectiveViewerIsAdmin(req.user, isRealAdmin);
        if (!isAdmin) return { forbidden: true };
        const base = sanitizeSpotifyToPlexProxyBase(
            config.spotifyToPlexInternalUrl,
            { allowPrivate: deps.allowPrivateIntegrationUrls },
        );
        return { sourceUrl: `${base}/` };
    },
});

export const createSpotifyToPlexCallbackHandler = ({
    loadConfig,
    withBasePath,
    resolvePublicBaseUrlFromConfig,
    fetchWithTimeout,
    allowPrivateIntegrationUrls = false,
    log = () => {},
}) => async (req, res) => {
    applyEmbedProxyFrameHeaders(res);
    try {
        const config = await loadConfig();
        if (!isSpotifyToPlexEnabled(config)) {
            return res.status(404).send('Spotify Sync is not enabled.');
        }
        const base = sanitizeSpotifyToPlexProxyBase(
            config.spotifyToPlexInternalUrl,
            { allowPrivate: allowPrivateIntegrationUrls },
        );
        const callbackUrl = resolveSpotifyToPlexCallbackUrl(config, withBasePath, resolvePublicBaseUrlFromConfig);
        if (!callbackUrl) {
            return res.status(503).send('Set Public Base URL in Settings before connecting Spotify.');
        }

        const target = new URL(`${base}/api/spotify/token`);
        for (const [key, value] of Object.entries(req.query || {})) {
            if (value == null) continue;
            if (Array.isArray(value)) value.forEach((entry) => target.searchParams.append(key, String(entry)));
            else target.searchParams.set(key, String(value));
        }
        if (!target.searchParams.has('redirect_uri')) {
            target.searchParams.set('redirect_uri', callbackUrl);
        }

        const upstream = await fetchWithTimeout(target.href, {
            method: 'GET',
            headers: {
                Accept: req.headers.accept || 'text/html,application/json',
                'accept-encoding': 'identity',
            },
            redirect: 'manual',
        }, 60000);

        const proxyPath = withBasePath(`/api/${SPOTIFY_TO_PLEX_EMBED_ROUTE}/${SPOTIFY_TO_PLEX_EMBED_ENTITY_ID}`);
        const proxyPublicPrefix = `${req.protocol}://${req.get('host')}${proxyPath}`;
        const contentType = upstream.headers.get('content-type') || '';
        const isTextual = isTextualContentType(contentType);
        const tabUrl = `${base}/`;

        copyResponseHeaders(upstream, res, {
            proxyPath,
            tabUrl,
            proxyPublicPrefix,
            passthroughBinary: !isTextual,
        });
        applyEmbedProxyFrameHeaders(res);
        res.status(upstream.status);

        if (upstream.status >= 300 && upstream.status < 400) {
            await drainUpstreamBody(upstream);
            return res.end();
        }

        if (!isTextual) {
            const raw = await readUpstreamBodyWithLimit(upstream);
            return res.send(raw);
        }

        const raw = await readUpstreamBodyWithLimit(upstream);
        const rewritten = rewriteProxiedBody(raw.toString('utf8'), contentType, tabUrl, proxyPublicPrefix);
        return res.send(rewritten);
    } catch (error) {
        log(`[spotify-sync] callback failed: ${error.message}`);
        applyEmbedProxyFrameHeaders(res);
        return res.status(502).send('Spotify authorization callback failed through the portal proxy.');
    }
};
