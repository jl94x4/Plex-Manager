import test from 'node:test';
import assert from 'node:assert/strict';
import {
    listNewlyCompletedSeasons,
    shouldNotifyNewEpisode,
    shouldSendLifecycle,
} from './requestLifecycle.js';

test('listNewlyCompletedSeasons skips already stamped seasons', () => {
    const nums = listNewlyCompletedSeasons(
        {
            mediaType: 'tv',
            seasons: 'all',
            meta: { notifiedSeasonAvailable: { '1': '2026-01-01T00:00:00.000Z' } },
        },
        {
            mediaInfo: {
                seasons: [
                    { seasonNumber: 1, status: 5 },
                    { seasonNumber: 2, status: 5 },
                    { seasonNumber: 3, status: 4 },
                ],
            },
        },
    );
    assert.deepEqual(nums, [2]);
});

test('listNewlyCompletedSeasons respects requested season list', () => {
    const nums = listNewlyCompletedSeasons(
        {
            mediaType: 'tv',
            seasons: [2, 3],
            meta: {},
        },
        {
            mediaInfo: {
                seasons: [
                    { seasonNumber: 1, status: 5 },
                    { seasonNumber: 2, status: 5 },
                ],
            },
        },
    );
    assert.deepEqual(nums, [2]);
});

test('shouldNotifyNewEpisode seeds baseline without notifying', () => {
    const result = shouldNotifyNewEpisode(
        { mediaType: 'tv', meta: { mediaStatus: 4 } },
        { sonarrLibraryStatus: { episodeFileCount: 12 } },
    );
    assert.equal(result.ok, false);
    assert.equal(result.seed, true);
    assert.equal(result.nextCount, 12);
});

test('shouldNotifyNewEpisode fires when count increases', () => {
    const result = shouldNotifyNewEpisode(
        { mediaType: 'tv', meta: { mediaStatus: 4, lastEpisodeFileCount: 10 } },
        { sonarrLibraryStatus: { episodeFileCount: 12 } },
        Date.now(),
    );
    assert.equal(result.ok, true);
    assert.equal(result.added, 2);
});

test('shouldNotifyNewEpisode respects cooldown', () => {
    const now = Date.now();
    const result = shouldNotifyNewEpisode(
        {
            mediaType: 'tv',
            meta: {
                mediaStatus: 4,
                lastEpisodeFileCount: 10,
                lastNewEpisodeNotifyAt: new Date(now - 60_000).toISOString(),
            },
        },
        { sonarrLibraryStatus: { episodeFileCount: 12 } },
        now,
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'cooldown');
});

test('shouldSendLifecycle defaults new episode off and approved on', () => {
    const config = {};
    assert.equal(shouldSendLifecycle(config, {}, 'approved', 'email'), true);
    assert.equal(shouldSendLifecycle(config, {}, 'episode', 'email'), false);
    assert.equal(shouldSendLifecycle(config, { notifyNewEpisodeEmail: true }, 'episode', 'email'), true);
    assert.equal(shouldSendLifecycle(config, { notifyRequestApprovedEmail: false }, 'approved', 'email'), false);
});
