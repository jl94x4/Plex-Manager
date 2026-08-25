import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldSkipGzipForUrl } from './skip-gzip.js';

test('shouldSkipGzipForUrl skips streamed images and fat JSON APIs', () => {
    assert.equal(shouldSkipGzipForUrl('/api/plex/image?path=/library/metadata/1/thumb'), true);
    assert.equal(shouldSkipGzipForUrl('/api/jellyfin/image?itemId=abc'), true);
    assert.equal(shouldSkipGzipForUrl('/api/plex/analytics/me?days=365'), true);
    assert.equal(shouldSkipGzipForUrl('/api/achievements/me'), true);
    assert.equal(shouldSkipGzipForUrl('/api/collexions/collections'), true);
    assert.equal(shouldSkipGzipForUrl('/api/speedtest/download'), true);
});

test('shouldSkipGzipForUrl still compresses normal pages and small APIs', () => {
    assert.equal(shouldSkipGzipForUrl('/'), false);
    assert.equal(shouldSkipGzipForUrl('/api/config/public'), false);
    assert.equal(shouldSkipGzipForUrl('/static/index.js'), false);
});
