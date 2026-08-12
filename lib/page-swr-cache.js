import { createSwrCache } from './swr-cache.js';

/**
 * Shared stale-while-revalidate caches for expensive Home / Analytics / Achievements
 * payloads. Keep sessions live on the request path; cache recently-added and stats.
 */
export const dashboardRecentSwr = createSwrCache({ name: 'dashboard-recent' });
export const tautulliStatsSwr = createSwrCache({ name: 'tautulli-stats' });
export const tautulliGraphsSwr = createSwrCache({ name: 'tautulli-graphs' });
export const jellystatAnalyticsSwr = createSwrCache({ name: 'jellystat-analytics' });
export const achievementsPeriodSwr = createSwrCache({ name: 'achievements-period' });
export const achievementsLeaderboardSwr = createSwrCache({ name: 'achievements-leaderboard' });
export const achievementsThumbsSwr = createSwrCache({ name: 'achievements-thumbs' });

export const DASHBOARD_RECENT_FRESH_MS = 45_000;
export const DASHBOARD_RECENT_STALE_MS = 8 * 60 * 1000;
export const TAUTULLI_STATS_FRESH_MS = 10 * 60 * 1000;
export const TAUTULLI_STATS_STALE_MS = 60 * 60 * 1000;
export const TAUTULLI_GRAPHS_FRESH_MS = 8 * 60 * 1000;
export const TAUTULLI_GRAPHS_STALE_MS = 45 * 60 * 1000;
export const JELLYSTAT_ANALYTICS_FRESH_MS = 8 * 60 * 1000;
export const JELLYSTAT_ANALYTICS_STALE_MS = 45 * 60 * 1000;
export const ACHIEVEMENTS_PERIOD_FRESH_MS = 12 * 60 * 1000;
export const ACHIEVEMENTS_PERIOD_STALE_MS = 60 * 60 * 1000;
export const ACHIEVEMENTS_LEADERBOARD_FRESH_MS = 3 * 60 * 1000;
export const ACHIEVEMENTS_LEADERBOARD_STALE_MS = 30 * 60 * 1000;
export const ACHIEVEMENTS_THUMBS_FRESH_MS = 10 * 60 * 1000;
export const ACHIEVEMENTS_THUMBS_STALE_MS = 45 * 60 * 1000;

export const pageSwrStats = () => ({
    dashboardRecent: dashboardRecentSwr.stats(),
    tautulliStats: tautulliStatsSwr.stats(),
    tautulliGraphs: tautulliGraphsSwr.stats(),
    jellystatAnalytics: jellystatAnalyticsSwr.stats(),
    achievementsPeriod: achievementsPeriodSwr.stats(),
    achievementsLeaderboard: achievementsLeaderboardSwr.stats(),
    achievementsThumbs: achievementsThumbsSwr.stats(),
});
