import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildNotificationPosterUrl,
    resolveRequesterDisplayName,
    rewriteAnonymousRequestBody,
    inAppRequestMeta,
    enrichInAppNotificationItems,
} from './mediaMeta.js';

test('buildNotificationPosterUrl maps TMDB paths and keeps absolute URLs', () => {
    assert.equal(
        buildNotificationPosterUrl({ posterPath: '/abc.jpg' }),
        'https://image.tmdb.org/t/p/w185/abc.jpg',
    );
    assert.equal(
        buildNotificationPosterUrl({ posterUrl: 'https://img.example/p.jpg' }),
        'https://img.example/p.jpg',
    );
});

test('buildNotificationPosterUrl falls back to Cover Art Archive for music', () => {
    assert.equal(
        buildNotificationPosterUrl({ mediaType: 'music', mbid: 'rg-1' }),
        'https://coverartarchive.org/release-group/rg-1/front-250',
    );
});

test('resolveRequesterDisplayName prefers portal username over A user fallbacks', () => {
    assert.equal(
        resolveRequesterDisplayName(
            { meta: { requestedByName: 'Display', requestedByEmail: 'jane@example.com' } },
            { username: 'jane' },
        ),
        'jane',
    );
    assert.equal(
        resolveRequesterDisplayName({ meta: { requestedByEmail: 'sam@host' } }),
        'sam',
    );
    assert.equal(resolveRequesterDisplayName({}), 'Someone');
});

test('rewriteAnonymousRequestBody swaps A user for the requester', () => {
    assert.equal(
        rewriteAnonymousRequestBody('A user requested movie: Lucy', 'missjane741'),
        'missjane741 has requested movie: Lucy',
    );
    assert.equal(
        rewriteAnonymousRequestBody('A user has requested TV show: Lost', 'Alex'),
        'Alex has requested TV show: Lost',
    );
    assert.equal(
        rewriteAnonymousRequestBody('jane requested movie: Dune', 'jane'),
        'jane has requested movie: Dune',
    );
});

test('inAppRequestMeta includes poster and ids for the bell', () => {
    const meta = inAppRequestMeta({
        id: 9,
        tmdbId: 42,
        mediaType: 'movie',
        posterPath: '/p.png',
    });
    assert.equal(meta.requestId, 9);
    assert.equal(meta.tmdbId, 42);
    assert.equal(meta.posterUrl, 'https://image.tmdb.org/t/p/w185/p.png');
    assert.equal(meta.skipWebPush, true);
});

test('enrichInAppNotificationItems attaches posters and rewrites anonymous copy', async () => {
    const items = await enrichInAppNotificationItems(
        [{
            id: 'n1',
            body: 'A user requested movie: Lucy Shimmers and the Prince of Peace',
            meta: { requestId: 7 },
        }],
        {
            getRequest: async () => ({
                id: 7,
                userId: 'u1',
                mediaType: 'movie',
                posterPath: '/lucy.jpg',
                meta: { requestedByName: 'missjane741' },
            }),
        },
    );
    assert.equal(items[0].meta.posterUrl, 'https://image.tmdb.org/t/p/w185/lucy.jpg');
    assert.match(items[0].body, /^missjane741 has requested /);
});
