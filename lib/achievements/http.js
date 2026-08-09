import {
    ACHIEVEMENT_CATEGORIES,
    buildLeaderboard,
    buildStatsFromAnalyticsPayload,
    buildStatsFromHistoryItems,
    countBadgeDefinitions,
    evaluateAchievements,
    loadAchievementsState,
    normalizeAchievementsConfig,
    normalizeXpWeights,
    setLeaderboardOptOut,
    snapshotFromEvaluation,
    upsertUserAchievementSnapshot,
} from './index.js';
import { ensurePortalAchievementsBackfill } from './backfill.js';
import { mapJellyfinPlayedItemsToHistory } from './jellyfinMap.js';
import { enrichHistoryGenres } from './enrichGenres.js';

/**
 * Mount achievements HTTP routes.
 * deps must provide auth middleware and media-server helpers used by analytics.
 */
export const registerAchievementsRoutes = (app, deps) => {
    const {
        requireAuth,
        requireMember,
        requireAdmin,
        loadFile,
        CONFIG_PATH,
        USERS_PATH,
        resolveCurrentAdmin,
        getPlexConnectionUri,
        resolveLocalPlexAccountId,
        fetchPlexAccountHistory,
        fetchAllPlexHistory,
        fetchPlexServerAccounts,
        shouldObfuscateAnalyticsViewers,
        resolvePortalAccountId,
        fetchJellyfinPlayedItems,
        fetchPlexMetadataGenres,
        log,
    } = deps;

    const isEnabled = async () => {
        const config = await loadFile(CONFIG_PATH, {});
        return !!config.achievementsEnabled;
    };

    const resolveAccountContext = async (req) => {
        const config = await loadFile(CONFIG_PATH, {});
        req.user.isAdmin = await resolveCurrentAdmin(req.user, config);
        let accountId = null;
        const username = req.user?.username || req.user?.email || null;
        const mediaServerType = String(config.mediaServerType || 'plex').toLowerCase();

        if (typeof resolvePortalAccountId === 'function') {
            accountId = await resolvePortalAccountId(req, config);
        } else if (mediaServerType === 'plex') {
            const uri = await getPlexConnectionUri(config);
            if (uri) accountId = await resolveLocalPlexAccountId(config, uri, req.user);
        }

        return { config, accountId, username, mediaServerType };
    };

    const gatherStats = async (req, config, accountId) => {
        const mediaServerType = String(config.mediaServerType || 'plex').toLowerCase();
        if (mediaServerType === 'plex' && accountId) {
            const uri = await getPlexConnectionUri(config);
            if (!uri) return buildStatsFromAnalyticsPayload({});
            let historyItems = await fetchPlexAccountHistory(uri, config, accountId);
            if (typeof fetchPlexMetadataGenres === 'function') {
                historyItems = await enrichHistoryGenres(
                    historyItems || [],
                    (ratingKey) => fetchPlexMetadataGenres(uri, config, ratingKey),
                    { maxLookups: 300 },
                );
            }
            return buildStatsFromHistoryItems(historyItems || []);
        }

        if (['jellyfin', 'emby'].includes(mediaServerType) && accountId && typeof fetchJellyfinPlayedItems === 'function') {
            try {
                const items = await fetchJellyfinPlayedItems(config, accountId);
                if (Array.isArray(items) && items.length) {
                    return buildStatsFromHistoryItems(mapJellyfinPlayedItemsToHistory(items));
                }
            } catch {
                /* fall through */
            }
        }
        return buildStatsFromAnalyticsPayload({});
    };

    const runLeaderboardBackfill = async () => {
        if (!USERS_PATH || typeof fetchAllPlexHistory !== 'function' && typeof fetchJellyfinPlayedItems !== 'function') {
            // Still try with whatever deps we have.
        }
        try {
            await ensurePortalAchievementsBackfill({
                loadFile,
                CONFIG_PATH,
                USERS_PATH,
                getPlexConnectionUri,
                fetchPlexServerAccounts,
                fetchAllPlexHistory,
                fetchJellyfinPlayedItems,
                fetchPlexMetadataGenres,
                log,
            });
        } catch (e) {
            if (typeof log === 'function') log(`[achievements] Leaderboard backfill failed: ${e?.message || e}`);
        }
    };

    app.get('/api/achievements/meta', requireAuth, requireMember, async (_req, res) => {
        const config = await loadFile(CONFIG_PATH, {});
        const normalized = normalizeAchievementsConfig(config);
        res.json({
            enabled: normalized.achievementsEnabled,
            leaderboardEnabled: normalized.achievementsLeaderboardEnabled,
            homeWidgetEnabled: normalized.achievementsHomeWidgetEnabled,
            showOnProfile: normalized.achievementsShowOnProfile,
            totalBadges: countBadgeDefinitions(),
            categories: ACHIEVEMENT_CATEGORIES,
        });
    });

    app.get('/api/achievements/me', requireAuth, requireMember, async (req, res) => {
        try {
            if (!(await isEnabled())) {
                return res.status(404).json({ error: 'Achievements are disabled.' });
            }
            const { config, accountId, username } = await resolveAccountContext(req);
            if (!accountId) {
                return res.json({
                    enabled: true,
                    accountId: null,
                    xp: 0,
                    level: 1,
                    earnedCount: 0,
                    totalBadges: countBadgeDefinitions(),
                    badges: [],
                    earned: [],
                    categories: ACHIEVEMENT_CATEGORIES,
                    leaderboardEnabled: config.achievementsLeaderboardEnabled !== false,
                    leaderboardOptOut: false,
                    showOnProfile: config.achievementsShowOnProfile !== false,
                });
            }

            const state = await loadAchievementsState();
            const prev = state.users?.[String(accountId)] || {};
            const stats = await gatherStats(req, config, accountId);
            const evaluation = evaluateAchievements({
                stats,
                previousBadges: prev.badges || {},
                weights: normalizeXpWeights(config.achievementsXpWeights),
                disabledBadgeIds: config.achievementsDisabledBadgeIds,
            });
            const snapshot = snapshotFromEvaluation(accountId, username, evaluation, {
                leaderboardOptOut: !!prev.leaderboardOptOut,
            });
            await upsertUserAchievementSnapshot(snapshot);

            const earnedSorted = [...evaluation.earned].sort((a, b) => String(b.earnedAt || '').localeCompare(String(a.earnedAt || '')));

            res.json({
                enabled: true,
                accountId: String(accountId),
                xp: evaluation.xp,
                level: evaluation.level,
                levelProgress: evaluation.levelProgress,
                breakdown: evaluation.breakdown,
                stats: evaluation.stats,
                earnedCount: evaluation.earnedCount,
                totalBadges: evaluation.totalBadges,
                badges: evaluation.badgeResults,
                earned: earnedSorted,
                recentEarned: earnedSorted.slice(0, 8),
                newlyEarnedIds: evaluation.newlyEarnedIds,
                categories: ACHIEVEMENT_CATEGORIES,
                leaderboardEnabled: config.achievementsLeaderboardEnabled !== false,
                leaderboardOptOut: !!prev.leaderboardOptOut,
                showOnProfile: config.achievementsShowOnProfile !== false,
                homeWidgetEnabled: config.achievementsHomeWidgetEnabled !== false,
            });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Achievements error' });
        }
    });

    app.get('/api/achievements/leaderboard', requireAuth, requireMember, async (req, res) => {
        try {
            if (!(await isEnabled())) {
                return res.status(404).json({ error: 'Achievements are disabled.' });
            }
            const config = await loadFile(CONFIG_PATH, {});
            if (config.achievementsLeaderboardEnabled === false) {
                return res.json({ enabled: false, entries: [] });
            }
            // Populate XP for every portal user (not only visitors who opened /achievements).
            await runLeaderboardBackfill();
            const { accountId } = await resolveAccountContext(req);
            const obfuscate = shouldObfuscateAnalyticsViewers
                ? shouldObfuscateAnalyticsViewers(req.user, config)
                : false;
            const state = await loadAchievementsState();
            const limit = parseInt(String(req.query.limit || '50'), 10) || 50;

            // Attach live Plex (or portal) profile thumbs for the Hall of Fame avatars.
            let thumbByAccountId = {};
            try {
                const users = USERS_PATH ? await loadFile(USERS_PATH, []) : [];
                const mediaServerType = String(config.mediaServerType || 'plex').toLowerCase();
                if (mediaServerType === 'plex' && typeof fetchPlexServerAccounts === 'function') {
                    const uri = await getPlexConnectionUri(config);
                    if (uri) {
                        const acc = await fetchPlexServerAccounts(uri, config);
                        for (const account of acc?.list || []) {
                            const id = String(account?.id || '').trim();
                            if (id && account?.thumb) thumbByAccountId[id] = account.thumb;
                        }
                    }
                }
                for (const user of users || []) {
                    const id = String(user?.plexAccountId || '').trim();
                    if (id && user?.thumb && !thumbByAccountId[id]) thumbByAccountId[id] = user.thumb;
                }
            } catch {
                thumbByAccountId = {};
            }

            const entries = buildLeaderboard(state, {
                limit,
                obfuscate,
                viewerAccountId: accountId,
                thumbByAccountId,
            });
            res.json({ enabled: true, entries, populated: true });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Leaderboard error' });
        }
    });

    app.post('/api/achievements/me/opt-out', requireAuth, requireMember, async (req, res) => {
        try {
            if (!(await isEnabled())) {
                return res.status(404).json({ error: 'Achievements are disabled.' });
            }
            const { accountId } = await resolveAccountContext(req);
            if (!accountId) return res.status(400).json({ error: 'No account id' });
            const updated = await setLeaderboardOptOut(accountId, !!req.body?.optOut);
            res.json({ ok: true, leaderboardOptOut: !!updated.leaderboardOptOut });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Opt-out failed' });
        }
    });

    app.get('/api/achievements/user/:accountId', requireAuth, requireAdmin, async (req, res) => {
        try {
            if (!(await isEnabled())) {
                return res.status(404).json({ error: 'Achievements are disabled.' });
            }
            const state = await loadAchievementsState();
            const snap = state.users?.[String(req.params.accountId)];
            if (!snap) return res.status(404).json({ error: 'No achievements snapshot for user' });
            res.json(snap);
        } catch (e) {
            res.status(500).json({ error: e.message || 'Achievements error' });
        }
    });
};
