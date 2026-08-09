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
        nextUnlocks: pickNextUnlocks(locked, 3),
    };
};

/** Closest incomplete badges — one per metric ladder, highest progress first. */
export const pickNextUnlocks = (locked = [], limit = 3) => {
    const byMetric = new Map();
    for (const badge of locked || []) {
        if (!badge || badge.earned) continue;
        const metric = String(badge.metric || badge.id || '');
        if (!metric) continue;
        const prev = byMetric.get(metric);
        if (!prev || (Number(badge.threshold) || 0) < (Number(prev.threshold) || 0)) {
            byMetric.set(metric, badge);
        }
    }
    return [...byMetric.values()]
        .sort((a, b) => (Number(b.progressPct) || 0) - (Number(a.progressPct) || 0)
            || (Number(a.threshold) || 0) - (Number(b.threshold) || 0))
        .slice(0, Math.max(0, limit))
        .map((b) => ({
            id: b.id,
            name: b.name,
            description: b.description,
            icon: b.icon,
            category: b.category,
            rarity: b.rarity,
            metric: b.metric,
            threshold: b.threshold,
            progress: b.progress,
            progressPct: b.progressPct,
        }));
};

export const snapshotFromEvaluation = (accountId, username, evaluation, opts = {}) => {
    const snap = {
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
    };
    if (Array.isArray(opts.seenUnlockIds)) {
        snap.seenUnlockIds = opts.seenUnlockIds.map(String).filter(Boolean);
    }
    return snap;
};

export { normalizeXpWeights };
