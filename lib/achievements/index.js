export {
    listBadgeDefinitions,
    getBadgeDefinitionMap,
    countBadgeDefinitions,
    ACHIEVEMENT_CATEGORIES,
} from './definitions.js';

export {
    DEFAULT_XP_WEIGHTS,
    normalizeXpWeights,
    computeXpBreakdown,
    levelFromXp,
    xpForLevel,
    levelProgress,
} from './xp.js';

export {
    buildStatsFromHistoryItems,
    buildStatsFromAnalyticsPayload,
} from './stats.js';

export {
    evaluateAchievements,
    snapshotFromEvaluation,
} from './evaluate.js';

export {
    loadAchievementsState,
    saveAchievementsState,
    upsertUserAchievementSnapshot,
    setLeaderboardOptOut,
    buildLeaderboard,
} from './store.js';

export {
    ensurePortalAchievementsBackfill,
    resolvePortalAchievementTargets,
} from './backfill.js';

export { mapJellyfinPlayedItemsToHistory } from './jellyfinMap.js';

export {
    GENRE_CATALOG,
    extractCanonicalGenreIds,
    extractGenreLabels,
    normalizeGenreId,
} from './genres.js';

export { enrichHistoryGenres } from './enrichGenres.js';

export const getDefaultAchievementsConfig = () => ({
    achievementsEnabled: false,
    achievementsLeaderboardEnabled: true,
    achievementsHomeWidgetEnabled: true,
    achievementsShowOnProfile: true,
    achievementsDisabledBadgeIds: [],
    achievementsXpWeights: null,
});

export const normalizeAchievementsConfig = (config = {}) => ({
    achievementsEnabled: !!config.achievementsEnabled,
    achievementsLeaderboardEnabled: config.achievementsLeaderboardEnabled !== false,
    achievementsHomeWidgetEnabled: config.achievementsHomeWidgetEnabled !== false,
    achievementsShowOnProfile: config.achievementsShowOnProfile !== false,
    achievementsDisabledBadgeIds: Array.isArray(config.achievementsDisabledBadgeIds)
        ? config.achievementsDisabledBadgeIds.map(String).filter(Boolean)
        : [],
    achievementsXpWeights: config.achievementsXpWeights && typeof config.achievementsXpWeights === 'object'
        ? config.achievementsXpWeights
        : null,
});
