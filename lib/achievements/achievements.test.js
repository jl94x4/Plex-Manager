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
    estimateUnlockTimestamps,
    enrichHistoryGenres,
} from './index.js';
import { mapTautulliHistoryRowToPlexItem } from './tautulliHistory.js';

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

test('Tautulli-like history without genre tags does not count documentary badges', () => {
    const history = [];
    for (let i = 0; i < 10; i += 1) {
        history.push(mapTautulliHistoryRowToPlexItem({
            media_type: 'episode',
            rating_key: 80000 + i,
            grandparent_rating_key: 70001,
            grandparent_title: 'Planet Earth',
            started: 1700000000 + i * 3600,
            percent_complete: 100,
            watched_status: 1,
        }));
    }
    const stats = buildStatsFromHistoryItems(history);
    assert.equal(stats.genreShows_documentary || 0, 0);
    assert.equal(stats.episodePlays, 10);
});

test('enrichHistoryGenres fills missing Tautulli episode genres from grandparentRatingKey', async () => {
    const history = [];
    for (let i = 0; i < 10; i += 1) {
        history.push(mapTautulliHistoryRowToPlexItem({
            media_type: 'episode',
            rating_key: 81000 + i,
            grandparent_rating_key: 881001,
            grandparent_title: 'Planet Earth',
            started: 1700000000 + i * 3600,
            percent_complete: 100,
            watched_status: 1,
        }));
    }
    const lookedUp = [];
    const enriched = await enrichHistoryGenres(history, async (ratingKey) => {
        lookedUp.push(String(ratingKey));
        if (String(ratingKey) === '881001') return ['Documentary'];
        return [];
    }, { skipCache: true });
    assert.deepEqual(lookedUp, ['881001']);
    const stats = buildStatsFromHistoryItems(enriched);
    assert.equal(stats.genreShows_documentary, 1);
    assert.equal(stats.episodePlays, 10);
});

test('genre show badges count unique shows, not episodes', () => {
    const history = [];
    for (let show = 0; show < 10; show += 1) {
        for (let ep = 0; ep < 3; ep += 1) {
            history.push({
                type: 'episode',
                ratingKey: `s${show}-e${ep}`,
                grandparentRatingKey: `show-${show}`,
                viewedAt: 1700000000 + show * 86400 + ep,
                Genre: [{ tag: 'Comedy' }, { tag: 'Crime' }],
            });
        }
    }
    const stats = buildStatsFromHistoryItems(history);
    assert.equal(stats.genreShows_comedy, 10);
    assert.equal(stats.genreShows_crime, 10);
    assert.equal(stats.episodePlays, 30);
    const result = evaluateAchievements({ stats, previousBadges: {} });
    assert.ok(result.earned.some((b) => b.id === 'genre_shows_comedy_10' || b.id.startsWith('genre_shows_comedy_')));
});

test('enrichHistoryGenres attaches Plex movie genres onto Tautulli rows', async () => {
    const history = [mapTautulliHistoryRowToPlexItem({
        media_type: 'movie',
        rating_key: 882002,
        title: 'A Sci-Fi Film',
        started: 1700000000,
        percent_complete: 100,
        watched_status: 1,
    })];
    const enriched = await enrichHistoryGenres(history, async (ratingKey) => {
        if (String(ratingKey) === '882002') return ['Science Fiction', 'Adventure'];
        return [];
    }, { skipCache: true });
    const stats = buildStatsFromHistoryItems(enriched);
    assert.equal(stats.genreMovies_scifi, 1);
    assert.equal(stats.genreMovies_adventure, 1);
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

test('estimateUnlockTimestamps uses the play that crossed the threshold', () => {
    const history = [];
    for (let i = 0; i < 12; i += 1) {
        history.push({
            type: 'movie',
            ratingKey: `m${i}`,
            // 10th movie (0-based index 9) crosses movies_10
            viewedAt: 1_700_000_000 + i * 86400,
            librarySectionID: 1,
        });
    }
    const unlocks = estimateUnlockTimestamps(history);
    assert.ok(unlocks.movies_10);
    assert.equal(Date.parse(unlocks.movies_10), (1_700_000_000 + 9 * 86400) * 1000);
});

test('evaluateAchievements prefers historic unlock time over now', () => {
    const stats = { uniqueMovies: 12, moviePlays: 12 };
    const historic = '2024-06-01T12:00:00.000Z';
    const result = evaluateAchievements({
        stats,
        previousBadges: {},
        now: new Date('2026-08-10T12:00:00.000Z'),
        unlockTimestamps: { movies_10: historic },
    });
    const badge = result.earned.find((b) => b.id === 'movies_10');
    assert.ok(badge);
    assert.equal(badge.earnedAt, historic);
});

test('evaluateAchievements repairs bulk-stamped earnedAt from history', () => {
    const bulk = '2026-08-09T18:00:00.000Z';
    const historic = '2023-01-15T08:00:00.000Z';
    const result = evaluateAchievements({
        stats: { totalPlays: 800 },
        previousBadges: {
            plays_800: { earnedAt: bulk },
        },
        now: new Date('2026-08-10T12:00:00.000Z'),
        unlockTimestamps: { plays_800: historic },
    });
    const badge = result.badgeResults.find((b) => b.id === 'plays_800');
    assert.ok(badge?.earned);
    assert.equal(badge.earnedAt, historic);
    assert.ok(!result.newlyEarnedIds.includes('plays_800'));
});

test('forceUnlockTimestamps overwrites stored earnedAt even when history is later', () => {
    const stored = '2023-05-26T00:00:00.000Z';
    const historic = '2024-01-10T12:00:00.000Z';
    const soft = evaluateAchievements({
        stats: { uniqueMovies: 500, moviePlays: 500 },
        previousBadges: { movies_500: { earnedAt: stored } },
        unlockTimestamps: { movies_500: historic },
        forceUnlockTimestamps: false,
    });
    assert.equal(soft.badgeResults.find((b) => b.id === 'movies_500')?.earnedAt, stored);

    const forced = evaluateAchievements({
        stats: { uniqueMovies: 500, moviePlays: 500 },
        previousBadges: { movies_500: { earnedAt: stored } },
        unlockTimestamps: { movies_500: historic },
        forceUnlockTimestamps: true,
    });
    assert.equal(forced.badgeResults.find((b) => b.id === 'movies_500')?.earnedAt, historic);
    assert.ok(!forced.newlyEarnedIds.includes('movies_500'));
});
test('who-unlocked-first ordering follows historic times', () => {
    const early = estimateUnlockTimestamps(
        Array.from({ length: 800 }, (_, i) => ({
            type: 'episode',
            grandparentKey: 'show',
            viewedAt: 1_600_000_000 + i * 60,
        })),
    );
    const late = estimateUnlockTimestamps(
        Array.from({ length: 800 }, (_, i) => ({
            type: 'episode',
            grandparentKey: 'show',
            viewedAt: 1_700_000_000 + i * 60,
        })),
    );
    assert.ok(early.plays_800);
    assert.ok(late.plays_800);
    assert.ok(Date.parse(early.plays_800) < Date.parse(late.plays_800));
});

test('buildMemberDossier ranks first unlocks and rivals', async () => {
    const { buildMemberDossier, applyRankTrace } = await import('./memberDossier.js');
    const state = {
        users: {
            a: {
                accountId: 'a',
                username: 'alpha',
                xp: 5000,
                level: 20,
                earnedCount: 2,
                badges: {
                    movies_10: { earnedAt: '2024-01-01T00:00:00.000Z' },
                    plays_100: { earnedAt: '2024-02-01T00:00:00.000Z' },
                },
                stats: { uniqueMovies: 12, moviePlays: 12, totalPlays: 100 },
            },
            b: {
                accountId: 'b',
                username: 'bravo',
                xp: 4000,
                level: 18,
                earnedCount: 1,
                badges: {
                    movies_10: { earnedAt: '2024-06-01T00:00:00.000Z' },
                },
                stats: { uniqueMovies: 11, moviePlays: 11, totalPlays: 80 },
            },
            c: {
                accountId: 'c',
                username: 'charlie',
                xp: 3000,
                level: 15,
                earnedCount: 1,
                badges: {
                    plays_100: { earnedAt: '2023-01-01T00:00:00.000Z' },
                },
                stats: { uniqueMovies: 5, moviePlays: 5, totalPlays: 120 },
            },
        },
    };
    applyRankTrace(state, ['a', 'b', 'c']);
    // Simulate a drop for alpha
    state.users.a.boardRankPrevious = 1;
    state.users.a.boardRank = 1;
    const dossier = buildMemberDossier(state, { accountId: 'a', viewerAccountId: 'a' });
    assert.equal(dossier.rank, 1);
    assert.equal(dossier.firstUnlocks.count, 1); // movies_10 first; plays_100 owned by c earlier
    assert.equal(dossier.rivals.below.username, 'bravo');
    assert.ok(dossier.lastBadge);
    assert.ok(dossier.trophyCase.length >= 1);
    assert.equal(dossier.classTitle.id, 'sovereign');
});
