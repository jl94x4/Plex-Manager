import assert from 'node:assert/strict';
import test from 'node:test';
import { cookieHeaderFromSetCookie, mapSeerrRequestToLifecycleRecord } from './seerr-user-session.js';

test('cookieHeaderFromSetCookie keeps name=value pairs only', () => {
    const headers = {
        getSetCookie: () => [
            'connect.sid=s%3Aabc; Path=/; HttpOnly',
            'other=1; Secure',
        ],
    };
    assert.equal(cookieHeaderFromSetCookie(headers), 'connect.sid=s%3Aabc; other=1');
});

test('cookieHeaderFromSetCookie reads node-fetch headers.raw()', () => {
    const headers = {
        getSetCookie: () => [],
        raw: () => ({
            'set-cookie': ['connect.sid=s%3Axyz; Path=/; HttpOnly'],
        }),
    };
    assert.equal(cookieHeaderFromSetCookie(headers), 'connect.sid=s%3Axyz');
});

test('mapSeerrRequestToLifecycleRecord maps Seerr requester onto a portal user', () => {
    const record = mapSeerrRequestToLifecycleRecord({
        id: 44,
        type: 'movie',
        title: 'Insidious',
        requestedBy: { id: 9, email: 'jay@example.com', displayName: 'ItsThatJk', plexId: 123 },
        media: { tmdbId: 49018, title: 'Insidious' },
    }, [
        { id: 'portal-1', email: 'jay@example.com', username: 'ItsThatJk', plexId: '123' },
    ]);
    assert.equal(record.userId, 'portal-1');
    assert.equal(record.id, 'seerr:44');
    assert.equal(record.tmdbId, 49018);
    assert.equal(record.meta.requestedByEmail, 'jay@example.com');
    assert.equal(record.posterPath, null);
});

test('mapSeerrRequestToLifecycleRecord copies Seerr poster fields', () => {
    const fromMedia = mapSeerrRequestToLifecycleRecord({
        id: 12,
        type: 'movie',
        media: { tmdbId: 11, title: 'Dune', posterPath: '/dune.jpg' },
    }, []);
    assert.equal(fromMedia.posterPath, '/dune.jpg');

    const fromDto = mapSeerrRequestToLifecycleRecord({
        id: 13,
        type: 'tv',
        title: 'Lost',
        tmdbId: 4607,
        posterPath: '/lost.jpg',
        posterUrl: 'https://image.tmdb.org/t/p/w185/lost.jpg',
    }, []);
    assert.equal(fromDto.posterPath, '/lost.jpg');
    assert.equal(fromDto.posterUrl, 'https://image.tmdb.org/t/p/w185/lost.jpg');
});
