import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePosterSetsConfig } from './config.js';

test('normalizePosterSetsConfig persists library cache build scope', () => {
    const saved = normalizePosterSetsConfig({
        tpdbCacheWarmMedia: 'show',
        tpdbCacheWarmSource: 'recent',
        tpdbCacheSkipCached: false,
        tpdbCacheFollowedCreatorsOnly: true,
    });
    assert.equal(saved.tpdbCacheWarmMedia, 'show');
    assert.equal(saved.tpdbCacheWarmSource, 'recent');
    assert.equal(saved.tpdbCacheSkipCached, false);
    assert.equal(saved.tpdbCacheFollowedCreatorsOnly, true);
});

test('normalizePosterSetsConfig defaults build scope to movies + TV', () => {
    const saved = normalizePosterSetsConfig({});
    assert.equal(saved.tpdbCacheWarmMedia, 'all');
    assert.equal(saved.tpdbCacheWarmSource, 'full');
    assert.equal(saved.tpdbCacheSkipCached, true);
    assert.equal(saved.tpdbCacheFollowedCreatorsOnly, false);
});

test('normalizePosterSetsConfig rejects unknown media filters', () => {
    const saved = normalizePosterSetsConfig({
        tpdbCacheWarmMedia: 'tv',
        tpdbCacheWarmSource: 'everything',
    });
    assert.equal(saved.tpdbCacheWarmMedia, 'all');
    assert.equal(saved.tpdbCacheWarmSource, 'full');
});
