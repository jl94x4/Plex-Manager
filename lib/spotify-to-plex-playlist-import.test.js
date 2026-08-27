import assert from 'node:assert/strict';
import test from 'node:test';
import {
    asItemArray,
    buildLikedSongsPlaylist,
    buildSavedItemAddBody,
    fetchSpotifyAccountPlaylistPages,
    isAlreadyAddedError,
    likedSongsItemId,
    normalizeSpotifyAccountPlaylists,
    savedItemIdSet,
} from './spotify-to-plex-playlist-import.js';

test('likedSongsItemId prefixes the Spotify user id', () => {
    assert.equal(likedSongsItemId('abc'), 'liked-abc');
});

test('isAlreadyAddedError matches worker duplicate messages', () => {
    assert.equal(isAlreadyAddedError('Discover Weekly (spotify id: 37i) is already added.'), true);
    assert.equal(isAlreadyAddedError('Invalid Spotify URI'), false);
});

test('normalizeSpotifyAccountPlaylists prepends Liked Songs and marks saved items', () => {
    const items = normalizeSpotifyAccountPlaylists([
        { id: 'pl1', title: 'Gym', private: true, owner: 'Jay', user_id: 'u1', added: false },
        { id: 'pl2', name: 'Public mix', private: false, owner: 'Spotify', added: true },
    ], {
        user: { id: 'u1', name: 'ItsThatJA' },
        savedIds: savedItemIdSet([{ id: 'liked-u1' }]),
    });
    assert.equal(items[0].id, 'liked-u1');
    assert.equal(items[0].search, 'ItsThatJA:liked');
    assert.equal(items[0].added, true);
    assert.equal(items[1].search, 'spotify:playlist:pl1');
    assert.equal(items[1].userId, 'u1');
    assert.equal(items[2].added, true);
});

test('buildSavedItemAddBody includes user_id for private account playlists', () => {
    assert.deepEqual(buildSavedItemAddBody({
        search: 'spotify:playlist:pl1',
        userId: 'u1',
    }), { search: 'spotify:playlist:pl1', user_id: 'u1' });
    assert.deepEqual(buildSavedItemAddBody({
        search: 'ItsThatJA:liked',
        userId: 'u1',
    }), { search: 'ItsThatJA:liked', user_id: 'u1' });
});

test('asItemArray ignores non-arrays', () => {
    assert.deepEqual(asItemArray({ error: 'nope' }), []);
    assert.deepEqual(asItemArray(null), []);
});

test('asItemArray unwraps items envelopes', () => {
    assert.deepEqual(asItemArray({ items: [{ id: 'pl1' }] }), [{ id: 'pl1' }]);
});

test('fetchSpotifyAccountPlaylistPages walks offset until a short page', async () => {
    const pages = [
        { items: [{ id: 'a' }, { id: 'b' }], total: 3 },
        { items: [{ id: 'c' }] },
    ];
    const raw = await fetchSpotifyAccountPlaylistPages(async ({ offset }) => pages[offset === 0 ? 0 : 1], { limit: 2 });
    assert.deepEqual(raw.map((item) => item.id), ['a', 'b', 'c']);
});

test('buildLikedSongsPlaylist uses the connected username', () => {
    const liked = buildLikedSongsPlaylist({ id: 'u1', name: 'Jay' });
    assert.equal(liked.id, 'liked-u1');
    assert.equal(liked.search, 'Jay:liked');
    assert.equal(liked.private, true);
});
