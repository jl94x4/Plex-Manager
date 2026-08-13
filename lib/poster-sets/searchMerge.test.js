import assert from 'node:assert/strict';
import test from 'node:test';
import { excludeBlockedCreators, keepFollowedCreatorsOnly, mergePosterSearchSets } from './searchMerge.js';

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
