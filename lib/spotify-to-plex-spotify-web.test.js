import assert from 'node:assert/strict';
import test from 'node:test';
import { createSpotifyWebClient } from './spotify-to-plex-spotify-web.js';

test('createSpotifyWebClient fetches a token then artist albums', async () => {
    const calls = [];
    const client = createSpotifyWebClient({
        clientId: 'id',
        clientSecret: 'secret',
        now: () => 1_000,
        fetchImpl: async (url, opts) => {
            calls.push({ url: String(url), method: opts?.method || 'GET' });
            if (String(url).includes('/api/token')) {
                return {
                    ok: true,
                    json: async () => ({ access_token: 'tok', expires_in: 3600 }),
                };
            }
            if (String(url).includes('/albums')) {
                return {
                    ok: true,
                    json: async () => ({ items: [{ id: 'al1', name: 'LP' }], total: 1 }),
                };
            }
            return { ok: true, json: async () => ({ id: 'ar1', name: 'Band' }) };
        },
    });
    const artist = await client.getArtist('ar1');
    const albums = await client.getArtistAlbums('ar1');
    assert.equal(artist.name, 'Band');
    assert.equal(albums[0].id, 'al1');
    assert.equal(calls.filter((call) => call.url.includes('/api/token')).length, 1);
    assert.equal(calls[0].method, 'POST');
});
