import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
    watcherTitleKey,
    notifyEligibility,
    isActivePortalRequest,
    createRequestWatcherStore,
} from './requestWatchers.js';

test('watcherTitleKey covers movie, tv, and music albums', () => {
    assert.equal(watcherTitleKey({ mediaType: 'movie', tmdbId: 550 }), 'movie:550');
    assert.equal(watcherTitleKey({ mediaType: 'tv', mediaId: 1396 }), 'tv:1396');
    assert.equal(watcherTitleKey({ mediaType: 'music', mbid: 'artist-1' }), 'music:artist-1');
    assert.equal(
        watcherTitleKey({ mediaType: 'music', mbid: 'artist-1', albumMbid: 'album-9' }),
        'music:artist-1:album:album-9',
    );
});

test('notifyEligibility allows follow when someone else has an active request', () => {
    const records = [
        { id: '1', userId: 'alice', status: 1 },
    ];
    const eligible = notifyEligibility({
        viewerId: 'bob',
        records,
        mediaStatus: 2,
    });
    assert.equal(eligible.canNotify, true);
    assert.equal(eligible.isWatching, false);

    const own = notifyEligibility({
        viewerId: 'alice',
        records,
        mediaStatus: 2,
    });
    assert.equal(own.canNotify, false);

    const available = notifyEligibility({
        viewerId: 'bob',
        records,
        mediaStatus: 5,
    });
    assert.equal(available.canNotify, false);
});

test('isActivePortalRequest skips declined and fully available rows', () => {
    assert.equal(isActivePortalRequest({ status: 1 }), true);
    assert.equal(isActivePortalRequest({ status: 3 }), false);
    assert.equal(isActivePortalRequest({ status: 2, meta: { mediaStatus: 5 } }), false);
});

test('createRequestWatcherStore subscribe and unsubscribe', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'smp-watchers-'));
    const store = createRequestWatcherStore(path.join(dir, 'watchers.json'));
    const key = 'movie:550';
    const added = await store.setWatching(key, 'bob', true);
    assert.equal(added.isWatching, true);
    assert.equal(await store.isWatching(key, 'bob'), true);
    const removed = await store.setWatching(key, 'bob', false);
    assert.equal(removed.isWatching, false);
    assert.deepEqual(await store.listWatcherIds(key), []);
});
