import assert from 'node:assert/strict';
import test from 'node:test';
import { excludeBlockedCreators, filterCollectionSets, isCollectionSet, keepFollowedCreatorsOnly, mergePosterSearchSets } from './searchMerge.js';

test('excludeBlockedCreators hides matching handles and keeps unknown users', () => {
    const sets = [
        { setId: '1', url: 'https://theposterdb.com/set/1', user: 'muikman2000', title: 'A' },
        { setId: '2', url: 'https://theposterdb.com/set/2', user: '@TheHeir', title: 'B' },
        { setId: '3', url: 'https://theposterdb.com/set/3', user: null, title: 'C' },
    ];
    const filtered = excludeBlockedCreators(sets, ['MuikMan2000']);
    assert.deepEqual(filtered.map((set) => set.setId), ['2', '3']);
});

test('keepFollowedCreatorsOnly keeps matching handles and drops unknown users', () => {
    const sets = [
        { setId: '1', url: 'https://theposterdb.com/set/1', user: 'muikman2000', title: 'A' },
        { setId: '2', url: 'https://theposterdb.com/set/2', user: '@TheHeir', title: 'B' },
        { setId: '3', url: 'https://theposterdb.com/set/3', user: null, title: 'C' },
    ];
    const filtered = keepFollowedCreatorsOnly(sets, ['TheHeir']);
    assert.deepEqual(filtered.map((set) => set.setId), ['2']);
    assert.deepEqual(keepFollowedCreatorsOnly(sets, []).map((set) => set.setId), []);
});

test('mergePosterSearchSets drops blocked creators after follow ranking', () => {
    const merged = mergePosterSearchSets([
        { setId: '1', url: 'https://theposterdb.com/poster/set/1', user: 'muikman2000', title: 'Carolina', provider: 'posterdb' },
        { setId: '2', url: 'https://theposterdb.com/poster/set/2', user: 'TheHeir', title: 'Carolina', provider: 'posterdb' },
    ], 'posterdb', {
        preferredCreators: ['muikman2000'],
        blockedCreators: ['muikman2000'],
    });
    assert.equal(merged.sets.length, 1);
    assert.equal(merged.sets[0].user, 'TheHeir');
});

test('isCollectionSet keeps boxsets, collection posters, and large packs', () => {
    assert.equal(isCollectionSet({ setKind: 'boxset', title: 'MCU' }), true);
    assert.equal(isCollectionSet({ setKind: 'collection', title: 'Star Wars' }), true);
    assert.equal(isCollectionSet({ mediaType: 'collection', title: 'Pixar' }), true);
    assert.equal(isCollectionSet({ title: 'Marvel Cinematic Universe Collection' }), true);
    assert.equal(isCollectionSet({ title: 'John Wick', posterCount: 24 }), true);
    assert.equal(isCollectionSet({ title: 'The Batman', posterCount: 4 }), false);
    assert.equal(isCollectionSet({ setKind: 'title_cards', posterCount: 40, title: 'Season 1' }), false);
    assert.equal(isCollectionSet({ title: 'Episode Title Cards' }), false);
});

test('filterCollectionSets drops single-title posters', () => {
    const filtered = filterCollectionSets([
        { setId: '1', title: 'Dune', posterCount: 3, setKind: 'posters' },
        { setId: '2', title: 'Dune Collection', posterCount: 2 },
        { setId: '3', title: 'MCU Boxset', setKind: 'boxset' },
    ]);
    assert.deepEqual(filtered.map((set) => set.setId), ['2', '3']);
});
