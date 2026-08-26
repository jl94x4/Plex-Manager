import assert from 'node:assert/strict';
import test from 'node:test';
import {
    chunkItems,
    isSpotifySyncTimeoutError,
    matchPlexTrackBatch,
    matchedPlexItems,
    mergeSearchResults,
    normalizeSpotifyTracks,
    runPool,
    savedPlaylistIds,
    summarizePlaylistSyncResults,
    syncSpotifyPlaylistToPlex,
    syncSpotifyPlaylistsToPlex,
    toPlexSearchItems,
} from './spotify-to-plex-playlist-sync.js';

test('normalizeSpotifyTracks reads tracks or items arrays', () => {
    assert.deepEqual(normalizeSpotifyTracks({
        tracks: [{ id: 't1', title: 'Song', artists: ['A'], album: 'LP', album_id: 'al1' }],
    }), [{
        id: 't1', title: 'Song', artists: ['A'], album: 'LP', album_id: 'al1',
    }]);
    assert.equal(normalizeSpotifyTracks({ items: [{ id: 't2', name: 'B', artist: 'X' }] })[0].title, 'B');
});

test('matchedPlexItems uses the first Plex hit', () => {
    assert.deepEqual(matchedPlexItems([
        { result: [{ id: '/library/1', source: 'server' }, { id: '/library/2' }] },
        { result: [] },
        { result: [{ id: '/library/3' }] },
    ]), [
        { key: '/library/1', source: 'server' },
        { key: '/library/3', source: undefined },
    ]);
});

test('mergeSearchResults prefers cached rows and drops duplicates', () => {
    const merged = mergeSearchResults(
        [{ id: 't1', result: [{ id: 'cached' }] }],
        [{ id: 't1', result: [{ id: 'fresh' }] }, { id: 't2', result: [{ id: 'new' }] }],
    );
    assert.equal(merged.length, 2);
    assert.equal(merged[0].result[0].id, 'cached');
});

test('chunkItems splits match batches', () => {
    assert.deepEqual(chunkItems([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test('isSpotifySyncTimeoutError detects abort and gateway timeouts', () => {
    assert.equal(isSpotifySyncTimeoutError(new Error('Spotify Sync worker timed out. Try a smaller playlist, or retry.')), true);
    const gateway = new Error('proxy');
    gateway.status = 504;
    assert.equal(isSpotifySyncTimeoutError(gateway), true);
    assert.equal(isSpotifySyncTimeoutError(new Error('Save this playlist first')), false);
});

test('runPool keeps a concurrency cap', async () => {
    let inflight = 0;
    let max = 0;
    await runPool([1, 2, 3, 4], 2, async () => {
        inflight += 1;
        max = Math.max(max, inflight);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inflight -= 1;
    });
    assert.equal(max, 2);
});

test('matchPlexTrackBatch splits a timed-out batch instead of failing', async () => {
    const sizes = [];
    const result = await matchPlexTrackBatch({
        batch: [{ id: 'a' }, { id: 'b' }],
        type: 'spotify-playlist',
        fetchJson: async (opts) => {
            sizes.push(opts.body.items.length);
            if (opts.body.items.length > 1) {
                throw new Error('Spotify Sync worker timed out. Try a smaller playlist, or retry.');
            }
            return [{ id: opts.body.items[0].id, result: [{ id: `/lib/${opts.body.items[0].id}` }] }];
        },
    });
    assert.deepEqual(sizes, [2, 1, 1]);
    assert.equal(result.length, 2);
    assert.equal(result[0].result[0].id, '/lib/a');
});

test('matchPlexTrackBatch skips a single track that still times out', async () => {
    const result = await matchPlexTrackBatch({
        batch: [{ id: 'stuck' }],
        type: 'spotify-playlist',
        fetchJson: async () => {
            throw new Error('Spotify Sync worker timed out. Try a smaller playlist, or retry.');
        },
    });
    assert.deepEqual(result, [{ id: 'stuck', result: [] }]);
});

test('savedPlaylistIds skips plex-media placeholders', () => {
    assert.deepEqual(savedPlaylistIds([
        { id: 'pl1', type: 'spotify-playlist' },
        { id: 'media', type: 'plex-media' },
        { id: 'al1', type: 'spotify-album' },
    ]), ['pl1', 'al1']);
});

test('summarizePlaylistSyncResults reports mixed outcomes', () => {
    const summary = summarizePlaylistSyncResults([
        { ok: true, matched: 10, missing: 1, message: 'Created A' },
        { ok: false, error: 'not found' },
    ]);
    assert.equal(summary.ok, false);
    assert.match(summary.message, /failed/);
});

test('syncSpotifyPlaylistToPlex matches tracks and creates a Plex playlist', async () => {
    const calls = [];
    const result = await syncSpotifyPlaylistToPlex({
        id: 'pl1',
        fetchJson: async (opts) => {
            calls.push(`${opts.method || 'GET'} ${opts.path}`);
            if (String(opts.path).startsWith('/api/saved-items')) {
                return [{ id: 'pl1', title: 'Gym', type: 'spotify-playlist', image: 'http://img' }];
            }
            if (String(opts.path).includes('/api/spotify/items/')) {
                return { title: 'Gym', tracks: [
                    { id: 't1', title: 'One', artists: ['A'], album: 'LP', album_id: 'al' },
                    { id: 't2', title: 'Two', artists: ['B'], album: 'LP', album_id: 'al' },
                ] };
            }
            if (opts.path === '/api/plex/cached') return [{ id: 't1', result: [{ id: '/lib/1', source: 's' }] }];
            if (opts.path === '/api/plex/tracks') {
                assert.equal(opts.body.fast, true);
                return [{ id: 't2', result: [{ id: '/lib/2', source: 's' }] }];
            }
            if (String(opts.path).startsWith('/api/playlists/pl1')) {
                const err = new Error('missing');
                err.status = 404;
                throw err;
            }
            if (opts.path === '/api/playlists' && opts.method === 'POST') {
                assert.equal(opts.body.items.length, 2);
                assert.equal(opts.body.name, 'Gym');
                return { id: 'plex-9', link: 'http://plex/playlist' };
            }
            throw new Error(`unexpected ${opts.path}`);
        },
    });
    assert.equal(result.ok, true);
    assert.equal(result.created, true);
    assert.equal(result.matched, 2);
    assert.equal(result.plexId, 'plex-9');
    assert.ok(calls.some((line) => line.startsWith('POST /api/playlists')));
});

test('syncSpotifyPlaylistToPlex updates an existing Plex playlist', async () => {
    const result = await syncSpotifyPlaylistToPlex({
        id: 'pl1',
        fetchJson: async (opts) => {
            if (String(opts.path).startsWith('/api/saved-items')) {
                return [{ id: 'pl1', title: 'Gym', type: 'spotify-playlist' }];
            }
            if (String(opts.path).includes('/api/spotify/items/')) {
                return { tracks: [{ id: 't1', title: 'One', artists: ['A'] }] };
            }
            if (opts.path === '/api/plex/cached') return [{ id: 't1', result: [{ id: '/lib/1' }] }];
            if (opts.path === '/api/plex/tracks') return [];
            if (opts.path === '/api/playlists/pl1' && !opts.method) return { id: 'plex-9', link: 'http://plex/old' };
            if (opts.path === '/api/playlists/pl1' && opts.method === 'PUT') return { id: 'plex-9', link: 'http://plex/new' };
            throw new Error(`unexpected ${opts.method} ${opts.path}`);
        },
    });
    assert.equal(result.created, false);
    assert.equal(result.link, 'http://plex/new');
    assert.match(result.message, /Updated/);
});

test('toPlexSearchItems keeps artist arrays for the worker matcher', () => {
    assert.deepEqual(toPlexSearchItems([{ id: 't', title: 'S', artists: ['A'], album: 'L', album_id: 'x' }]), [
        { id: 't', title: 'S', artists: ['A'], album: 'L', album_id: 'x' },
    ]);
});

test('syncSpotifyPlaylistsToPlex loads all saved ids when all is set', async () => {
    const summary = await syncSpotifyPlaylistsToPlex({
        all: true,
        fetchJson: async (opts) => {
            if (opts.path === '/api/saved-items') {
                return [{ id: 'pl1', type: 'spotify-playlist' }, { id: 'skip', type: 'plex-media' }];
            }
            if (String(opts.path).startsWith('/api/saved-items?id=')) {
                return [{ id: 'pl1', title: 'Gym', type: 'spotify-playlist' }];
            }
            if (String(opts.path).includes('/api/spotify/items/')) {
                return { tracks: [{ id: 't1', title: 'One', artists: ['A'] }] };
            }
            if (opts.path === '/api/plex/cached') return [{ id: 't1', result: [{ id: '/lib/1' }] }];
            if (opts.path === '/api/plex/tracks') return [];
            if (String(opts.path).startsWith('/api/playlists/pl1') && !opts.method) {
                const err = new Error('missing');
                err.status = 404;
                throw err;
            }
            if (opts.path === '/api/playlists' && opts.method === 'POST') return { id: 'plex-9' };
            throw new Error(`unexpected ${opts.method} ${opts.path}`);
        },
    });
    assert.equal(summary.ok, true);
    assert.equal(summary.results.length, 1);
    assert.equal(summary.results[0].created, true);
});
