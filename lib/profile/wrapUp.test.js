import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeProfileWrapUp, trimWrapUpForProfile, wrapUpFromHistoryItems, wrapUpDelta, summarizeWrapUpHistoryWindow, buildWrapUpCompare } from './wrapUp.js';

test('trimWrapUpForProfile keeps titles but strips peer history and obfuscates neighbours', () => {
    const trimmed = trimWrapUpForProfile({
        totalPlays: 40,
        topMovie: { title: 'Heat', plays: 8, thumbUrl: '/p/heat', plexAuthToken: 'secret' },
        recentHistory: [
            { title: 'Heat', viewedAt: 1, thumbUrl: '/p/heat' },
            { title: 'Heat', viewedAt: 2, episodeTitle: 'Again' },
            { title: 'The Bear', viewedAt: 3 },
            { title: 'Secret late night', viewedAt: 4 },
            { title: 'Dune', viewedAt: 5 },
            { title: 'Extra', viewedAt: 6 },
        ],
        heatmapData: { '2026-01-01': 9 },
        leaderboardNeighbourhood: [
            { rank: 2, username: 'Sam', accountId: '12', isMe: false, plays: 10 },
            { rank: 3, username: 'Jay', accountId: '42', isMe: true, plays: 8 },
        ],
        hourDistribution: new Array(24).fill(1),
        allLibraries: [{ title: 'Hidden', plays: 9 }],
    }, { isSelf: false, viewerIsAdmin: false, obfuscate: true });

    assert.equal(trimmed.topMovie.title, 'Heat');
    assert.equal(trimmed.topMovie.plexAuthToken, undefined);
    assert.deepEqual(trimmed.recentHistory.map((row) => row.title), ['Heat', 'The Bear', 'Secret late night', 'Dune']);
    assert.equal(trimmed.heatmapData, null);
    assert.equal(trimmed.allLibraries, undefined);
    assert.equal(trimmed.leaderboardNeighbourhood[0].username, 'Viewer 2');
    assert.equal(trimmed.leaderboardNeighbourhood[0].accountId, undefined);
    assert.equal(trimmed.leaderboardNeighbourhood[1].username, 'Jay');
    assert.equal(trimmed.leaderboardNeighbourhood[1].accountId, '42');
});

test('trimWrapUpForProfile keeps full history for self', () => {
    const trimmed = trimWrapUpForProfile({
        recentHistory: [{ title: 'A' }, { title: 'B' }, { title: 'C' }],
        heatmapData: { '2026-01-01': 2 },
    }, { isSelf: true, obfuscate: false });
    assert.equal(trimmed.recentHistory.length, 3);
    assert.deepEqual(trimmed.heatmapData, { '2026-01-01': 2 });
});

test('mergeProfileWrapUp prefers personal titles and snapshot XP rank', () => {
    const merged = mergeProfileWrapUp(
        { totalPlays: 4, hoursWatched: 9, leaderboardRank: 2, leaderboardSource: 'achievements' },
        { totalPlays: 40, topMovie: { title: 'Heat' }, hoursWatched: 0 },
        8400,
    );
    assert.equal(merged.totalPlays, 40);
    assert.equal(merged.hoursWatched, 9);
    assert.equal(merged.topMovie.title, 'Heat');
    assert.equal(merged.leaderboardRank, 2);
    assert.equal(merged.myXp, 8400);
});

test('wrapUpFromHistoryItems is subject-scoped from played items', () => {
    const now = Math.floor(Date.now() / 1000);
    const wrap = wrapUpFromHistoryItems([
        { type: 'movie', title: 'Heat', viewedAt: now - 100, ratingKey: 'm1' },
        { type: 'movie', title: 'Heat', viewedAt: now - 50, ratingKey: 'm1' },
        { type: 'episode', title: 'Pilot', grandparentTitle: 'The Bear', grandparentKey: 's1', viewedAt: now - 10, ratingKey: 'e1' },
    ]);
    assert.equal(wrap.totalPlays, 3);
    assert.equal(wrap.moviesCount, 2);
    assert.equal(wrap.showsCount, 1);
    assert.equal(wrap.topMovie.title, 'Heat');
    assert.equal(wrap.topBinge.title, 'The Bear');
    assert.equal(wrap.recentHistory[0].title, 'The Bear');
    assert.equal(wrap.period, 'last365');
});

test('wrapUpDelta reports percent vs the previous window', () => {
    assert.deepEqual(wrapUpDelta(120, 100), { current: 120, previous: 100, absolute: 20, percent: 20 });
    assert.equal(wrapUpDelta(10, 0).percent, null);
    assert.equal(wrapUpDelta(10, 0).absolute, 10);
});

test('summarizeWrapUpHistoryWindow counts titles in a slice', () => {
    const summary = summarizeWrapUpHistoryWindow([
        { type: 'movie', title: 'Heat', ratingKey: 'm1' },
        { type: 'movie', title: 'Heat', ratingKey: 'm1' },
        { type: 'episode', grandparentTitle: 'The Bear', grandparentKey: 's1' },
    ]);
    assert.equal(summary.totalPlays, 3);
    assert.equal(summary.moviesCount, 2);
    assert.equal(summary.topMovie.title, 'Heat');
    assert.equal(summary.topBinge.title, 'The Bear');
});

test('buildWrapUpCompare attaches previous-period deltas', () => {
    const compare = buildWrapUpCompare(
        { totalPlays: 40, uniqueTitles: 12, moviesCount: 10, showsCount: 30, musicCount: 0, topMovie: { title: 'Heat', plays: 8 } },
        { totalPlays: 20, uniqueTitles: 8, moviesCount: 4, showsCount: 16, musicCount: 0, topMovie: { title: 'Dune', plays: 5 } },
        30,
    );
    assert.equal(compare.previousPeriodDays, '30');
    assert.equal(compare.totalPlays.absolute, 20);
    assert.equal(compare.totalPlays.percent, 100);
    assert.equal(compare.previous.topMovie.title, 'Dune');
});

test('wrapUpFromHistoryItems compares the prior year when history reaches back', () => {
    const now = Math.floor(Date.now() / 1000);
    const wrap = wrapUpFromHistoryItems([
        { type: 'movie', title: 'Heat', viewedAt: now - 100, ratingKey: 'm1' },
        { type: 'movie', title: 'Dune', viewedAt: now - (400 * 24 * 60 * 60), ratingKey: 'm2' },
        { type: 'movie', title: 'Dune', viewedAt: now - (410 * 24 * 60 * 60), ratingKey: 'm2' },
    ]);
    assert.equal(wrap.totalPlays, 1);
    assert.equal(wrap.compare.previous.totalPlays, 2);
    assert.equal(wrap.compare.totalPlays.absolute, -1);
});

test('trimWrapUpForProfile keeps compare totals', () => {
    const trimmed = trimWrapUpForProfile({
        compare: { previousPeriodDays: '30', totalPlays: { current: 10, previous: 8, absolute: 2, percent: 25 } },
    }, { isSelf: true });
    assert.equal(trimmed.compare.previousPeriodDays, '30');
    assert.equal(trimmed.compare.totalPlays.absolute, 2);
});
