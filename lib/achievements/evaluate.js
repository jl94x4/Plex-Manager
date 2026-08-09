import { listBadgeDefinitions } from './definitions.js';
import { computeXpBreakdown, levelFromXp, levelProgress, normalizeXpWeights } from './xp.js';

const metricValue = (stats, metric) => {
    if (metric === 'level') return Number(stats?.level) || 1;
    return Math.max(0, Number(stats?.[metric]) || 0);
};

/**
 * Evaluate all badge definitions against a stats object.
 * @returns {{ badgeResults: object[], earned: object[], locked: object[], newlyEarnedIds: string[] }}
 */
export const evaluateAchievements = ({
    stats,
    previousBadges = {},
    weights,
    disabledBadgeIds = [],
} = {}) => {
    const disabled = new Set((disabledBadgeIds || []).map(String));
    const { xp, parts } = computeXpBreakdown(stats, weights);
    const level = levelFromXp(xp);
    const progress = levelProgress(xp);
    const enrichedStats = { ...stats, level, xp };

    const nowIso = new Date().toISOString();
    const badgeResults = [];
    const newlyEarnedIds = [];

    for (const def of listBadgeDefinitions()) {
        if (disabled.has(def.id)) continue;
        const current = metricValue(enrichedStats, def.metric);
        const threshold = Number(def.threshold) || 0;
        const ratio = threshold > 0 ? Math.min(1, current / threshold) : 0;
        const earned = current >= threshold;
        const prev = previousBadges?.[def.id];
        const wasEarned = !!(prev && prev.earnedAt && !prev.revokedAt);

        let earnedAt = prev?.earnedAt || null;
        let revokedAt = prev?.revokedAt || null;

        if (earned) {
            if (!wasEarned) {
                earnedAt = nowIso;
                revokedAt = null;
                newlyEarnedIds.push(def.id);
            } else if (revokedAt) {
                // Re-earned after revoke
                earnedAt = nowIso;
                revokedAt = null;
                newlyEarnedIds.push(def.id);
            }
        } else if (wasEarned && def.revocable) {
            revokedAt = nowIso;
        }

        badgeResults.push({
            id: def.id,
            name: def.name,
            description: def.description,
            icon: def.icon,
            category: def.category,
            rarity: def.rarity,
            metric: def.metric,
            threshold,
            progress: current,
            progressPct: Math.round(ratio * 100),
            earned,
            earnedAt,
            revokedAt,
            revocable: !!def.revocable,
        });
    }

    const earned = badgeResults.filter((b) => b.earned);
    const locked = badgeResults.filter((b) => !b.earned);

    const badgesState = {};
    for (const badge of badgeResults) {
        if (badge.earnedAt || badge.revokedAt) {
            badgesState[badge.id] = {
                earnedAt: badge.earnedAt,
                revokedAt: badge.revokedAt || null,
                progress: badge.progress,
            };
        }
    }

    return {
        xp,
        level,
        levelProgress: progress,
        breakdown: parts,
        stats: enrichedStats,
        badgeResults,
        earned,
        locked,
        newlyEarnedIds,
        badgesState,
        earnedCount: earned.length,
        totalBadges: badgeResults.length,
    };
};

export const snapshotFromEvaluation = (accountId, username, evaluation, opts = {}) => ({
    accountId: String(accountId),
    username: username || null,
    xp: evaluation.xp,
    level: evaluation.level,
    earnedCount: evaluation.earnedCount,
    totalBadges: evaluation.totalBadges,
    badges: evaluation.badgesState,
    stats: evaluation.stats,
    breakdown: evaluation.breakdown,
    leaderboardOptOut: !!opts.leaderboardOptOut,
    updatedAt: new Date().toISOString(),
});

export { normalizeXpWeights };
