import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyTpdbCacheBrowse,
    coverageKeyForLibraryItem,
    coverageKeyFromTitleCacheFileName,
    itemIsTpdbCached,
} from './tpdbCacheBrowse.js';

test('coverageKeyForLibraryItem uses media type + numeric TMDB id', () => {
    assert.equal(coverageKeyForLibraryItem({ tmdbId: '123', mediaType: 'show' }), 'show:123');
    assert.equal(coverageKeyForLibraryItem({ tmdbId: '99', mediaType: 'movie' }), 'movie:99');
    assert.equal(coverageKeyForLibraryItem({ tmdbId: 'abc' }), null);
    assert.equal(coverageKeyForLibraryItem({ id: '999', mediaType: 'movie' }), null);
});

test('coverageKeyFromTitleCacheFileName parses tmdb cache filenames', () => {
    assert.equal(coverageKeyFromTitleCacheFileName('tmdb_movie_550.json'), 'movie:550');
    assert.equal(coverageKeyFromTitleCacheFileName('tmdb_show_1396.json'), 'show:1396');
    assert.equal(coverageKeyFromTitleCacheFileName('hint_movie_foo_2011.json'), null);
});

test('applyTpdbCacheBrowse filters cached vs uncached and paginates', () => {
    const items = [
        { title: 'A', tmdbId: '1', mediaType: 'movie' },
        { title: 'B', tmdbId: '2', mediaType: 'movie' },
        { title: 'C', tmdbId: '3', mediaType: 'show' },
        { title: 'D', mediaType: 'movie' },
    ];
    const cachedKeys = new Set(['movie:1', 'show:3']);

    const cached = applyTpdbCacheBrowse(items, { cachedKeys, cacheStatus: 'cached', limit: 60 });
    assert.deepEqual(cached.items.map((item) => item.title), ['A', 'C']);
    assert.equal(cached.total, 2);

    const uncached = applyTpdbCacheBrowse(items, { cachedKeys, cacheStatus: 'uncached', limit: 60 });
    assert.deepEqual(uncached.items.map((item) => item.title), ['B', 'D']);
    assert.equal(uncached.total, 2);
});

test('applyTpdbCacheBrowse cachedFirst keeps original order within groups', () => {
    const items = [
        { title: 'Uncached 1', tmdbId: '10', mediaType: 'movie' },
        { title: 'Cached 1', tmdbId: '11', mediaType: 'movie' },
        { title: 'Uncached 2', tmdbId: '12', mediaType: 'show' },
        { title: 'Cached 2', tmdbId: '13', mediaType: 'show' },
    ];
    const cachedKeys = new Set(['movie:11', 'show:13']);
    const result = applyTpdbCacheBrowse(items, {
        cachedKeys,
        sort: 'cachedFirst',
        start: 0,
        limit: 60,
    });
    assert.deepEqual(result.items.map((item) => item.title), [
        'Cached 1',
        'Cached 2',
        'Uncached 1',
        'Uncached 2',
    ]);
    assert.equal(itemIsTpdbCached(items[1], cachedKeys), true);
});
