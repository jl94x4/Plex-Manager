import test from 'node:test';
import assert from 'node:assert/strict';
import {
    countBadgeDefinitions,
    evaluateAchievements,
    buildStatsFromHistoryItems,
    levelFromXp,
    isSeasonActive,
    isBadgeSeasonActive,
    listActiveSpotlightSeasons,
} from './index.js';

test('achievements catalog has hundreds of badges', () => {
    const count = countBadgeDefinitions();
    assert.ok(count >= 200, `expected >= 200 badges, got ${count}`);
});

test('evaluateAchievements awards movie and episode milestones', () => {
    const history = [];
    for (let i = 0; i < 12; i += 1) {
        history.push({
            type: 'movie',
            ratingKey: `m${i}`,
            viewedAt: 1700000000 + i * 86400,
            librarySectionID: 1,
        });
    }
    for (let i = 0; i < 30; i += 1) {
        history.push({
            type: 'episode',
            grandparentKey: 'show-a',
            viewedAt: 1700000000 + i * 3600,
            librarySectionID: 2,
        });
    }
    const stats = buildStatsFromHistoryItems(history);
    const result = evaluateAchievements({ stats, previousBadges: {} });
    assert.ok(result.xp > 0);
    assert.ok(result.level >= 1);
    assert.ok(result.earned.some((b) => b.id === 'movies_10'));
    assert.ok(result.earned.some((b) => b.id.startsWith('episodes_')));
    assert.equal(levelFromXp(result.xp), result.level);
});

test('genre badges count unique comedy movies', () => {
    const history = [];
    for (let i = 0; i < 12; i += 1) {
        history.push({
            type: 'movie',
            ratingKey: `comedy-${i}`,
            viewedAt: 1700000000 + i * 86400,
            Genre: [{ tag: 'Comedy' }],
        });
    }
    history.push({
        type: 'movie',
        ratingKey: 'horror-1',
        viewedAt: 1700000000,
        Genre: [{ tag: 'Horror' }],
    });
    const stats = buildStatsFromHistoryItems(history);
    assert.equal(stats.genreMovies_comedy, 12);
    assert.equal(stats.genreMovies_horror, 1);
    assert.ok(stats.genreTagsSeen >= 2);
    const result = evaluateAchievements({ stats, previousBadges: {} });
    assert.ok(result.earned.some((b) => b.id === 'genre_movies_comedy_10'));
});

test('isSeasonActive handles inclusive and cross-year windows', () => {
    assert.equal(isSeasonActive({ activeFrom: '10-01', activeUntil: '10-31' }, new Date('2026-10-15')), true);
    assert.equal(isSeasonActive({ activeFrom: '10-01', activeUntil: '10-31' }, new Date('2026-09-30')), false);
    assert.equal(isSeasonActive({ activeFrom: '12-15', activeUntil: '01-05' }, new Date('2026-12-20')), true);
    assert.equal(isSeasonActive({ activeFrom: '12-15', activeUntil: '01-05' }, new Date('2026-01-03')), true);
    assert.equal(isSeasonActive({ activeFrom: '12-15', activeUntil: '01-05' }, new Date('2026-02-01')), false);
    assert.equal(isSeasonActive({}, new Date('2026-06-01')), true);
});

test('seasonal badges only newly unlock while in season', () => {
    const stats = {
        genreMovies_horror: 5,
        uniqueMovies: 0,
        episodePlays: 0,
        activeDays: 0,
    };
    const inSeason = evaluateAchievements({
        stats,
        previousBadges: {},
        now: new Date('2026-10-20'),
    });
    assert.ok(inSeason.earned.some((b) => b.id === 'seasonal_halloween'));

    const outOfSeason = evaluateAchievements({
        stats,
        previousBadges: {},
        now: new Date('2026-03-01'),
    });
    assert.ok(!outOfSeason.earned.some((b) => b.id === 'seasonal_halloween'));

    const kept = evaluateAchievements({
        stats,
        previousBadges: {
            seasonal_halloween: { earnedAt: '2025-10-20T00:00:00.000Z' },
        },
        now: new Date('2026-03-01'),
    });
    assert.ok(kept.earned.some((b) => b.id === 'seasonal_halloween'));
});

test('admin seasons overlay gates and spotlights badge ids', () => {
    const seasons = [{
        id: 'spring',
        name: 'Spring',
        activeFrom: '03-01',
        activeUntil: '03-31',
        badgeIds: ['movies_10'],
        spotlight: true,
    }];
    assert.equal(
        isBadgeSeasonActive({ id: 'movies_10' }, new Date('2026-03-15'), seasons),
        true,
    );
    assert.equal(
        isBadgeSeasonActive({ id: 'movies_10' }, new Date('2026-04-02'), seasons),
        false,
    );
    // Unlisted badges keep their own seasonal window (none = always active).
    assert.equal(
        isBadgeSeasonActive({ id: 'movies_25' }, new Date('2026-04-02'), seasons),
        true,
    );
    const spotlight = listActiveSpotlightSeasons(seasons, new Date('2026-03-10'));
    assert.equal(spotlight.length, 1);
    assert.equal(spotlight[0].id, 'spring');
    assert.equal(listActiveSpotlightSeasons(seasons, new Date('2026-05-01')).length, 0);
});
