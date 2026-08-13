import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequestAppService, mapSeerrClientError } from './request-app-service.js';

const seerrConfig = {
    requestAppType: 'jellyseerr',
    requestAppUrl: 'http://seerr.local',
    requestAppApiKey: 'ADMIN-KEY',
};

const jsonResponse = (status, data, { setCookie = [] } = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: {
        getSetCookie: () => setCookie,
        get: (name) => (
            String(name).toLowerCase() === 'set-cookie' ? setCookie[0] || null : null
        ),
    },
    json: async () => data,
});

const createService = ({ fetchWithTimeout, resolveMemberPlexToken }) => createRequestAppService({
    fetchWithTimeout,
    resolveIntegrationUrlForFetch: (url) => url,
    resolveMemberPlexToken,
});

test('mapSeerrClientError keeps the Plex session message', () => {
    const mapped = mapSeerrClientError(
        'Sign in with Plex to submit requests. Seerr needs your Plex session so the request stays pending for approval.',
        403,
    );
    assert.equal(mapped.status, 403);
    assert.match(mapped.error, /Sign in with Plex/);
});

test('submitMemberRequest posts with the member cookie and never the admin API key', async () => {
    const calls = [];
    const service = createService({
        resolveMemberPlexToken: async () => 'member-plex-token',
        fetchWithTimeout: async (url, options = {}) => {
            calls.push({ url: String(url), options });
            if (String(url).endsWith('/api/v1/auth/plex')) {
                return jsonResponse(200, { id: 5, displayName: 'Member' }, {
                    setCookie: ['connect.sid=s%3Amember; Path=/; HttpOnly'],
                });
            }
            if (String(url).endsWith('/api/v1/request')) {
                return jsonResponse(201, {
                    id: 44,
                    status: 1,
                    media: { tmdbId: 99, title: 'Dune', posterPath: '/dune.jpg' },
                });
            }
            throw new Error(`unexpected ${url}`);
        },
    });

    const result = await service.submitMemberRequest(seerrConfig, { id: 'u1' }, {
        mediaType: 'movie',
        mediaId: 99,
    });
    assert.equal(result.id, 44);
    assert.equal(result.status, 1);

    const login = calls.find((call) => call.url.endsWith('/api/v1/auth/plex'));
    assert.equal(login.options.redirect, 'manual');
    assert.match(String(login.options.body), /member-plex-token/);

    const request = calls.find((call) => call.url.endsWith('/api/v1/request'));
    assert.equal(request.options.headers['X-Api-Key'], undefined);
    assert.equal(request.options.headers.Cookie, 'connect.sid=s%3Amember');
    assert.equal(
        calls.some((call) => call.url.endsWith('/api/v1/request') && call.options?.headers?.['X-Api-Key']),
        false,
    );
});

test('submitMemberRequest does not fall back to the admin API key without a Plex token', async () => {
    const calls = [];
    const service = createService({
        resolveMemberPlexToken: async () => null,
        fetchWithTimeout: async (url, options = {}) => {
            calls.push({ url: String(url), options });
            throw new Error(`unexpected ${url}`);
        },
    });

    await assert.rejects(
        () => service.submitMemberRequest(seerrConfig, { id: 'u1' }, { mediaType: 'movie', mediaId: 1 }),
        /Sign in with Plex/,
    );
    assert.equal(calls.length, 0);
});

test('submitMemberRequest does not fall back to the admin API key when Seerr login has no cookie', async () => {
    const calls = [];
    const service = createService({
        resolveMemberPlexToken: async () => 'member-plex-token',
        fetchWithTimeout: async (url, options = {}) => {
            calls.push({ url: String(url), options });
            if (String(url).endsWith('/api/v1/auth/plex')) {
                return jsonResponse(200, { id: 5 });
            }
            throw new Error(`unexpected ${url}`);
        },
    });

    await assert.rejects(
        () => service.submitMemberRequest(seerrConfig, { id: 'u1' }, { mediaType: 'movie', mediaId: 1 }),
        /Could not open a Seerr session/,
    );
    assert.equal(calls.some((call) => call.url.endsWith('/api/v1/request')), false);
});

test('submitMemberRequest uses Set-Cookie from a 302 Seerr login', async () => {
    const calls = [];
    const service = createService({
        resolveMemberPlexToken: async () => 'member-plex-token',
        fetchWithTimeout: async (url, options = {}) => {
            calls.push({ url: String(url), options });
            if (String(url).endsWith('/api/v1/auth/plex')) {
                return jsonResponse(302, null, {
                    setCookie: ['connect.sid=s%3Aredirect; Path=/'],
                });
            }
            if (String(url).endsWith('/api/v1/request')) {
                return jsonResponse(201, { id: 3, status: 1, media: { tmdbId: 1, posterPath: '/a.jpg', title: 'A' } });
            }
            return jsonResponse(200, {});
        },
    });

    const result = await service.submitMemberRequest(seerrConfig, { id: 'u1' }, {
        mediaType: 'movie',
        mediaId: 1,
    });
    assert.equal(result.id, 3);
    const request = calls.find((call) => call.url.endsWith('/api/v1/request'));
    assert.equal(request.options.headers.Cookie, 'connect.sid=s%3Aredirect');
    assert.equal(request.options.headers['X-Api-Key'], undefined);
});

test('submitMemberRequest enriches a missing poster from Seerr media details', async () => {
    const service = createService({
        resolveMemberPlexToken: async () => 'member-plex-token',
        fetchWithTimeout: async (url) => {
            if (String(url).endsWith('/api/v1/auth/plex')) {
                return jsonResponse(200, { id: 5 }, {
                    setCookie: ['connect.sid=s%3Amember; Path=/'],
                });
            }
            if (String(url).endsWith('/api/v1/request')) {
                return jsonResponse(201, {
                    id: 8,
                    status: 1,
                    media: { tmdbId: 77 },
                });
            }
            if (String(url).endsWith('/api/v1/movie/77')) {
                return jsonResponse(200, { posterPath: '/from-details.jpg', title: 'Poster Title' });
            }
            throw new Error(`unexpected ${url}`);
        },
    });

    const result = await service.submitMemberRequest(seerrConfig, { id: 'u1' }, {
        mediaType: 'movie',
        mediaId: 77,
    });
    assert.equal(result.media.posterPath, '/from-details.jpg');
});
