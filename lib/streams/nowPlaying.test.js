import assert from 'node:assert/strict';
import test from 'node:test';
import {
    isDiscoverNowPlayingEnabled,
    userAllowsDiscoverNowPlaying,
    mapPlexSessionToNowPlaying,
    mapJellyfinSessionToNowPlaying,
    sessionBelongsToPlexUser,
    sessionBelongsToJellyfinUser,
} from './nowPlaying.js';

test('isDiscoverNowPlayingEnabled defaults true', () => {
    assert.equal(isDiscoverNowPlayingEnabled({}), true);
    assert.equal(isDiscoverNowPlayingEnabled({ discoverNowPlayingEnabled: false }), false);
    assert.equal(isDiscoverNowPlayingEnabled({ discoverNowPlayingEnabled: true }), true);
});

test('userAllowsDiscoverNowPlaying defaults true', () => {
    assert.equal(userAllowsDiscoverNowPlaying({}), true);
    assert.equal(userAllowsDiscoverNowPlaying({ showDiscoverNowPlaying: false }), false);
    assert.equal(userAllowsDiscoverNowPlaying({ showDiscoverNowPlaying: true }), true);
});

test('mapPlexSessionToNowPlaying maps episode with TMDB guid', () => {
    const mapped = mapPlexSessionToNowPlaying({
        type: 'episode',
        title: 'The One',
        grandparentTitle: 'Friends',
        parentIndex: 1,
        index: 2,
        duration: 1000,
        viewOffset: 250,
        Guid: [{ id: 'tmdb://1668' }],
        Player: { state: 'playing' },
        Session: { id: 'sess-1' },
    });
    assert.ok(mapped);
    assert.equal(mapped.mediaType, 'tv');
    assert.equal(mapped.title, 'Friends');
    assert.equal(mapped.episodeTitle, 'The One');
    assert.equal(mapped.season, 1);
    assert.equal(mapped.episode, 2);
    assert.equal(mapped.tmdbId, 1668);
    assert.equal(mapped.progress, 25);
});

test('mapPlexSessionToNowPlaying maps movie', () => {
    const mapped = mapPlexSessionToNowPlaying({
        type: 'movie',
        title: 'Inception',
        Guid: [{ id: 'tmdb://27205' }],
        duration: 2000,
        viewOffset: 1000,
        Player: { state: 'paused' },
    });
    assert.ok(mapped);
    assert.equal(mapped.mediaType, 'movie');
    assert.equal(mapped.tmdbId, 27205);
    assert.equal(mapped.state, 'paused');
    assert.equal(mapped.season, null);
});

test('mapJellyfinSessionToNowPlaying maps episode', () => {
    const mapped = mapJellyfinSessionToNowPlaying({
        Id: 'session',
        UserId: 'u1',
        UserName: 'jason',
        NowPlayingItem: {
            Type: 'Episode',
            Name: 'Pilot',
            SeriesName: 'Lost',
            ParentIndexNumber: 1,
            IndexNumber: 1,
            SeriesId: 'series-1',
            RunTimeTicks: 100000000,
            ProviderIds: { Tmdb: '123' },
        },
        PlayState: { PositionTicks: 25000000, IsPaused: false },
    });
    assert.ok(mapped);
    assert.equal(mapped.mediaType, 'tv');
    assert.equal(mapped.title, 'Lost');
    assert.equal(mapped.season, 1);
    assert.equal(mapped.episode, 1);
    assert.equal(mapped.progress, 25);
});

test('sessionBelongsToPlexUser matches account id or username', () => {
    assert.equal(sessionBelongsToPlexUser({ User: { id: 42, title: 'Other' } }, { accountId: 42 }), true);
    assert.equal(sessionBelongsToPlexUser({ User: { id: 1, title: 'Jason' } }, { username: 'jason' }), true);
    assert.equal(sessionBelongsToPlexUser({ User: { id: 1, title: 'Someone' } }, { accountId: 9, username: 'jason' }), false);
});

test('sessionBelongsToPlexUser matches plex cloud id and aliases', () => {
    assert.equal(sessionBelongsToPlexUser(
        { User: { id: '998877', title: 'Web Profile' } },
        { accountId: '1', plexId: '998877' },
    ), true);
    assert.equal(sessionBelongsToPlexUser(
        { User: { id: '9', title: 'ItsThatJA' } },
        { accountId: '1', username: 'admin', aliases: ['ItsThatJA'] },
    ), true);
    assert.equal(sessionBelongsToPlexUser(
        { type: 'episode', accountID: 1, User: { title: 'Someone' } },
        { accountId: '1' },
    ), true);
    assert.equal(sessionBelongsToPlexUser(
        {
            type: 'episode',
            User: {
                title: 'Web User',
                thumb: 'https://plex.tv/users/abc123xyz/avatar?c=1',
            },
        },
        { plexId: 'abc123xyz' },
    ), true);
    assert.equal(sessionBelongsToPlexUser(
        { User: [{ id: '55', title: 'Android Profile' }] },
        { accountId: '55' },
    ), true);
});

test('sessionBelongsToPlexUser matches owner cloud plexId with local accountID 1', () => {
    // Owner JWT often has plex.tv cloud plexId while PMS sessions report accountID "1".
    assert.equal(sessionBelongsToPlexUser(
        {
            type: 'movie',
            accountID: '1',
            User: { id: '1', title: 'Server Owner' },
        },
        {
            accountId: '1',
            accountIds: ['1', '9988776655'],
            plexId: '9988776655',
            username: 'owner',
        },
    ), true);
    assert.equal(sessionBelongsToPlexUser(
        {
            type: 'episode',
            User: {
                title: 'Web Profile',
                thumb: 'https://plex.tv/users/9988776655/avatar?c=1',
            },
        },
        {
            accountId: '1',
            accountIds: ['1', '9988776655'],
            plexId: '9988776655',
        },
    ), true);
});

test('sessionBelongsToPlexUser matches dashed uuid against undashed thumb/Account', async () => {
    const { expandPlexIdVariants } = await import('./nowPlaying.js');
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const nodash = 'a1b2c3d4e5f67890abcdef1234567890';
    assert.ok(expandPlexIdVariants(uuid).includes(nodash));
    assert.equal(sessionBelongsToPlexUser(
        {
            type: 'movie',
            Account: { id: nodash },
            User: { title: 'Web', thumb: `https://plex.tv/users/${nodash}/avatar` },
        },
        { accountIds: [uuid], plexId: '999' },
    ), true);
});

test('pickOwnPlexNowPlayingSession admin falls back to sole playable session', async () => {
    const { pickOwnPlexNowPlayingSession } = await import('./nowPlaying.js');
    const picked = pickOwnPlexNowPlayingSession([
        {
            type: 'movie',
            title: 'Owner Movie',
            viewOffset: 50,
            User: { id: '999', title: 'Someone Else Entirely' },
            Player: { state: 'playing' },
        },
    ], {
        isAdmin: true,
        accountId: '1',
        accountIds: ['1', '998877'],
        plexId: '998877',
        username: 'owner',
    });
    assert.equal(picked?.title, 'Owner Movie');
});

test('pickOwnPlexNowPlayingSession admin does not steal others when multiple play', async () => {
    const { pickOwnPlexNowPlayingSession } = await import('./nowPlaying.js');
    const picked = pickOwnPlexNowPlayingSession([
        {
            type: 'movie',
            title: 'Guest Movie',
            viewOffset: 50,
            User: { id: '55', title: 'Guest' },
            accountID: '55',
            Player: { state: 'playing' },
        },
        {
            type: 'episode',
            title: 'Ep',
            grandparentTitle: 'Show',
            viewOffset: 10,
            User: { id: '66', title: 'Other' },
            accountID: '66',
            Player: { state: 'playing' },
        },
    ], {
        isAdmin: true,
        accountId: '1',
        accountIds: ['1'],
        username: 'owner',
    });
    assert.equal(picked, null);
});

test('pickOwnPlexNowPlayingSession admin falls back to single active playable session', async () => {
    const { pickOwnPlexNowPlayingSession } = await import('./nowPlaying.js');
    const picked = pickOwnPlexNowPlayingSession([
        {
            type: 'movie',
            title: 'Paused Guest Movie',
            viewOffset: 350,
            User: { id: '55', title: 'Guest' },
            accountID: '55',
            Player: { state: 'paused' },
        },
        {
            type: 'episode',
            title: 'Active Owner Episode',
            grandparentTitle: 'Owner Show',
            viewOffset: 120,
            User: { id: '66', title: 'Some Other Label' },
            accountID: '66',
            Player: { state: 'playing' },
        },
    ], {
        isAdmin: true,
        accountId: '1',
        accountIds: ['1'],
        username: 'owner',
    });
    assert.equal(picked?.title, 'Active Owner Episode');
});

test('asArray wraps single Plex Metadata objects', async () => {
    const { asArray } = await import('./nowPlaying.js');
    assert.deepEqual(asArray(undefined), []);
    assert.deepEqual(asArray([{ id: 1 }]), [{ id: 1 }]);
    assert.deepEqual(asArray({ id: 1 }), [{ id: 1 }]);
});

test('pickOwnPlexNowPlayingSession prefers playing movie/episode', async () => {
    const { pickOwnPlexNowPlayingSession } = await import('./nowPlaying.js');
    const picked = pickOwnPlexNowPlayingSession([
        {
            type: 'track',
            viewOffset: 999,
            User: { id: '1', title: 'Jason' },
            Player: { state: 'playing' },
        },
        {
            type: 'episode',
            viewOffset: 100,
            title: 'Ep',
            grandparentTitle: 'Show',
            User: { id: '1', title: 'Jason' },
            Player: { state: 'paused' },
        },
        {
            type: 'episode',
            viewOffset: 400,
            title: 'Ep2',
            grandparentTitle: 'Show',
            User: { id: '1', title: 'Jason' },
            Player: { state: 'playing' },
        },
    ], { accountId: '1', username: 'jason' });
    assert.equal(picked?.title, 'Ep2');
    assert.equal(picked?.viewOffset, 400);
});

test('pickOwnPlexNowPlayingSession accepts single Metadata object', async () => {
    const { pickOwnPlexNowPlayingSession } = await import('./nowPlaying.js');
    const picked = pickOwnPlexNowPlayingSession({
        type: 'movie',
        title: 'Inception',
        User: { id: '1', title: 'Jason' },
        Player: { state: 'playing' },
    }, { username: 'jason' });
    assert.equal(picked?.title, 'Inception');
});

test('sessionBelongsToJellyfinUser matches id or username', () => {
    assert.equal(sessionBelongsToJellyfinUser({ UserId: 'abc', UserName: 'x' }, { jellyfinId: 'abc' }), true);
    assert.equal(sessionBelongsToJellyfinUser({ UserId: 'z', UserName: 'Jason' }, { username: 'jason' }), true);
    assert.equal(sessionBelongsToJellyfinUser({ UserId: 'z', UserName: 'x' }, { jellyfinId: 'nope', username: 'jason' }), false);
});
