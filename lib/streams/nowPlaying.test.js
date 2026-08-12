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
