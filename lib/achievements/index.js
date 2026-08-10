export {
    listBadgeDefinitions,
    getBadgeDefinitionMap,
    countBadgeDefinitions,
    ACHIEVEMENT_CATEGORIES,
    isSeasonActive,
    isBadgeSeasonActive,
    listActiveSpotlightSeasons,
} from './definitions.js';

export {
    DEFAULT_XP_WEIGHTS,
    XP_WEIGHT_LABELS,
    normalizeXpWeights,
    computeXpBreakdown,
    levelFromXp,
    xpForLevel,
    levelProgress,
} from './xp.js';

export {
    buildStatsFromHistoryItems,
    buildStatsFromAnalyticsPayload,
    filterHistoryByDays,
} from './stats.js';

export {
    evaluateAchievements,
    snapshotFromEvaluation,
    pickNextUnlocks,
} from './evaluate.js';

export { estimateUnlockTimestamps } from './unlockTimes.js';

export {
    loadAchievementsState,
    saveAchievementsState,
    upsertUserAchievementSnapshot,
    setLeaderboardOptOut,
    setMuteUnlockToasts,
    setPinnedBadgeIds,
    ackAchievementUnlocks,
    buildLeaderboard,
} from './store.js';

export {
    ensurePortalAchievementsBackfill,
    resolvePortalAchievementTargets,
    getAchievementsBackfillStatus,
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
    /** plex | tautulli — watch history source for achievements + personal wrap-up */
    watchHistorySource: 'plex',
    achievementsDisabledBadgeIds: [],
    achievementsXpWeights: null,
    /** 0 = off. When set (e.g. 50), plays below this % complete are ignored (needs Tautulli %). */
    achievementsMinPercentComplete: 0,
    /** Admin-defined seasonal windows that gate / spotlight badge IDs. */
    achievementsSeasons: [],
});

const normalizeSeason = (raw = {}) => {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim();
    const name = String(raw.name || '').trim();
    const activeFrom = String(raw.activeFrom || '').trim();
    const activeUntil = String(raw.activeUntil || '').trim();
    const badgeIds = Array.isArray(raw.badgeIds) ? raw.badgeIds.map(String).filter(Boolean) : [];
    if (!id && !name) return null;
    return {
        id: id || `season-${Math.random().toString(36).slice(2, 8)}`,
        name: name || id || 'Season',
        activeFrom,
        activeUntil,
        badgeIds,
        spotlight: raw.spotlight !== false,
    };
};

export const normalizeAchievementsConfig = (config = {}) => ({
    achievementsEnabled: !!config.achievementsEnabled,
    achievementsLeaderboardEnabled: config.achievementsLeaderboardEnabled !== false,
    achievementsHomeWidgetEnabled: config.achievementsHomeWidgetEnabled !== false,
    achievementsShowOnProfile: config.achievementsShowOnProfile !== false,
    watchHistorySource: config.watchHistorySource === 'tautulli' ? 'tautulli' : 'plex',
    achievementsDisabledBadgeIds: Array.isArray(config.achievementsDisabledBadgeIds)
        ? config.achievementsDisabledBadgeIds.map(String).filter(Boolean)
        : [],
    achievementsXpWeights: config.achievementsXpWeights && typeof config.achievementsXpWeights === 'object'
        ? config.achievementsXpWeights
        : null,
    achievementsMinPercentComplete: Math.min(100, Math.max(0, Number(config.achievementsMinPercentComplete) || 0)),
    achievementsSeasons: Array.isArray(config.achievementsSeasons)
        ? config.achievementsSeasons.map(normalizeSeason).filter(Boolean)
        : [],
});

export const isTautulliWatchHistorySource = (config = {}) => (
    config.watchHistorySource === 'tautulli'
    && !!(config.tautulliUrl && config.tautulliApiKey)
);
