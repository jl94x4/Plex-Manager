import test from 'node:test';
import assert from 'node:assert/strict';
import {
    countBadgeDefinitions,
    evaluateAchievements,
    buildStatsFromHistoryItems,
    levelFromXp,
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
