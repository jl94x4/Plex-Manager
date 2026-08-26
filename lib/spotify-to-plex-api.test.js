import assert from 'node:assert/strict';
import test from 'node:test';
import {
    detectSpotifyToPlexSyncFailure,
    summarizeSpotifyToPlexLogs,
} from './spotify-to-plex-api.js';

test('summarizeSpotifyToPlexLogs reads object type-log timestamps', () => {
    const summary = summarizeSpotifyToPlexLogs({
        sync_type_log: {
            playlists: { type: 'playlists', start: Date.parse('2026-01-01T01:00:00.000Z'), end: Date.parse('2026-01-01T02:00:00.000Z'), status: 'success' },
        },
        sync_log: { playlists: [] },
    });
    assert.equal(summary.lastSync.playlists, '2026-01-01T02:00:00.000Z');
});

test('summarizeSpotifyToPlexLogs extracts last sync and playlist run count', () => {
    const summary = summarizeSpotifyToPlexLogs({
        sync_type_log: { playlists: '2026-01-01T02:00:00.000Z' },
        sync_log: {
            playlists: [
                { success: true, finishedAt: '2026-01-01T01:00:00.000Z' },
                { success: true, finishedAt: '2026-01-02T02:00:00.000Z' },
            ],
        },
    });
    assert.equal(summary.playlistRunCount, 2);
    assert.equal(summary.lastSync.playlists, '2026-01-01T02:00:00.000Z');
});

test('detectSpotifyToPlexSyncFailure finds recent failed sync entries', () => {
    const now = Date.parse('2026-01-03T12:00:00.000Z');
    const failure = detectSpotifyToPlexSyncFailure({
        sync_log: {
            playlists: [{ success: false, error: 'timeout', finishedAt: '2026-01-03T02:00:00.000Z' }],
        },
    }, { now, maxAgeMs: 24 * 3600 * 1000 });
    assert.ok(failure);
    assert.equal(failure.failures[0].type, 'playlists');
    assert.match(failure.failures[0].message, /timeout/);
});

test('detectSpotifyToPlexSyncFailure ignores stale failures', () => {
    const now = Date.parse('2026-01-03T12:00:00.000Z');
    const failure = detectSpotifyToPlexSyncFailure({
        sync_log: {
            playlists: [{ success: false, error: 'old', finishedAt: '2025-01-01T02:00:00.000Z' }],
        },
    }, { now, maxAgeMs: 24 * 3600 * 1000 });
    assert.equal(failure, null);
});
