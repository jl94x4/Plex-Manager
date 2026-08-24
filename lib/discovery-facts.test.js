import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreWikipediaSearchHit } from './discovery-facts.js';

test('scoreWikipediaSearchHit prefers exact film match with year', () => {
    const exact = scoreWikipediaSearchHit(
        { title: 'Inception (2010 film)' },
        'Inception',
        '2010',
        'movie',
    );
    const wrong = scoreWikipediaSearchHit(
        { title: 'Inception (TV series)' },
        'Inception',
        '2010',
        'movie',
    );
    assert.ok(exact > wrong);
    assert.ok(exact >= 18);
});

test('scoreWikipediaSearchHit rejects unrelated titles', () => {
    const score = scoreWikipediaSearchHit(
        { title: 'Friends (1994 TV series)' },
        'Breaking Bad',
        '2008',
        'tv',
    );
    assert.equal(score, -100);
});
