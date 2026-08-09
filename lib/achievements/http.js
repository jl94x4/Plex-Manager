import {
    ACHIEVEMENT_CATEGORIES,
    ackAchievementUnlocks,
    buildLeaderboard,
    buildStatsFromAnalyticsPayload,
    buildStatsFromHistoryItems,
    computeXpBreakdown,
    countBadgeDefinitions,
    DEFAULT_XP_WEIGHTS,
    evaluateAchievements,
    filterHistoryByDays,
    isTautulliWatchHistorySource,
    listBadgeDefinitions,
    loadAchievementsState,
    normalizeAchievementsConfig,
    normalizeXpWeights,
    setLeaderboardOptOut,
    snapshotFromEvaluation,
    upsertUserAchievementSnapshot,
    XP_WEIGHT_LABELS,
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
        fetchTautulliUserHistoryItems,
        fetchTautulliTimezone,
        getAdminProfile,
        log,
    } = deps;

    const isEnabled = async () => {
        const config = await loadFile(CONFIG_PATH, {});
        return !!config.achievementsEnabled;
    };

    const resolveTimeZone = async (config) => {
        if (typeof fetchTautulliTimezone === 'function') {
            try {
                const tz = await fetchTautulliTimezone(config);
                if (tz) return String(tz);
            } catch {
                /* fall through */
            }
        }
        return String(config.portalTimezone || process.env.PORTAL_TIMEZONE || process.env.TZ || 'UTC');
    };

    const normName = (v) => String(v || '').trim().toLowerCase();

    /** Resolve a usable avatar URL for achievements (Plex /accounts often lacks the owner thumb). */
    const resolveThumbForAccount = async (req, config, accountId, identity = {}) => {
        const username = identity.username || req?.user?.username || null;
        const fromSession = req?.user?.thumb || null;
        if (fromSession) return fromSession;

        try {
            const mediaServerType = String(config.mediaServerType || 'plex').toLowerCase();
            if (mediaServerType === 'plex' && typeof fetchPlexServerAccounts === 'function') {
                const uri = await getPlexConnectionUri(config);
                if (uri) {
                    const acc = await fetchPlexServerAccounts(uri, config);
                    const byId = accountId ? acc?.map?.[String(accountId)] : null;
                    if (byId?.thumb) return byId.thumb;
                    if (username) {
                        const match = (acc?.list || []).find((a) => normName(a.name) === normName(username));
                        if (match?.thumb) return match.thumb;
                    }
                }
            }
            if (USERS_PATH) {
                const users = await loadFile(USERS_PATH, []);
                const hit = (users || []).find((u) => (
                    (accountId && String(u?.plexAccountId || '') === String(accountId))
                    || (username && normName(u?.username) === normName(username))
                ));
                if (hit?.thumb) return hit.thumb;
            }
            if (req?.user?.isAdmin && typeof getAdminProfile === 'function') {
                const profile = await getAdminProfile(config);
                if (profile?.thumb) return profile.thumb;
            }
        } catch {
            /* ignore */
        }
        return null;
    };

    const buildLiveThumbLookup = async (config) => {
        const thumbByAccountId = {};
        const thumbByUsername = {};
        try {
            const users = USERS_PATH ? await loadFile(USERS_PATH, []) : [];
            const mediaServerType = String(config.mediaServerType || 'plex').toLowerCase();
            if (mediaServerType === 'plex' && typeof fetchPlexServerAccounts === 'function') {
                const uri = await getPlexConnectionUri(config);
                if (uri) {
                    const acc = await fetchPlexServerAccounts(uri, config);
                    for (const account of acc?.list || []) {
                        const id = String(account?.id || '').trim();
                        const thumb = account?.thumb || null;
                        if (id && thumb) thumbByAccountId[id] = thumb;
                        const name = normName(account?.name);
                        if (name && thumb) thumbByUsername[name] = thumb;
                    }
                }
            }
            for (const user of users || []) {
                const id = String(user?.plexAccountId || '').trim();
                const thumb = user?.thumb || null;
                if (id && thumb && !thumbByAccountId[id]) thumbByAccountId[id] = thumb;
                const name = normName(user?.username);
                if (name && thumb && !thumbByUsername[name]) thumbByUsername[name] = thumb;
            }
            if (typeof getAdminProfile === 'function') {
                const profile = await getAdminProfile(config).catch(() => null);
                if (profile?.thumb) {
                    // Home/admin Plex account is usually id "1" and often has no /accounts thumb.
                    if (!thumbByAccountId['1']) thumbByAccountId['1'] = profile.thumb;
                }
            }
        } catch {
            return { thumbByAccountId: {}, thumbByUsername: {} };
        }
        return { thumbByAccountId, thumbByUsername };
    };

    const resolveAccountContext = async (req) => {
        const config = await loadFile(CONFIG_PATH, {});
        req.user.isAdmin = await resolveCurrentAdmin(req.user, config);
        let accountId = null;
        const username = req.user?.username || req.user?.email || null;
        const email = req.user?.email || null;
        const mediaServerType = String(config.mediaServerType || 'plex').toLowerCase();

        if (typeof resolvePortalAccountId === 'function') {
            accountId = await resolvePortalAccountId(req, config);
        } else if (mediaServerType === 'plex') {
            const uri = await getPlexConnectionUri(config);
            if (uri) accountId = await resolveLocalPlexAccountId(config, uri, req.user);
        }

        return { config, accountId, username, email, mediaServerType };
    };

    const gatherHistoryAndStats = async (req, config, accountId, identity = {}, opts = {}) => {
        const mediaServerType = String(config.mediaServerType || 'plex').toLowerCase();
        const maxItems = Math.max(1000, Number(opts.maxItems) || 25000);
        const genreLookups = Math.max(0, Number(opts.genreLookups) || 0);
        const timeZone = opts.timeZone || await resolveTimeZone(config);
        const statsOpts = { timeZone };

        const maybeEnrich = async (historyItems) => {
            let items = historyItems || [];
            if (genreLookups > 0 && typeof fetchPlexMetadataGenres === 'function') {
                const uri = await getPlexConnectionUri(config).catch(() => null);
                if (uri) {
                    items = await enrichHistoryGenres(
                        items,
                        (ratingKey) => fetchPlexMetadataGenres(uri, config, ratingKey),
                        { maxLookups: genreLookups },
                    );
                }
            }
            return items;
        };

        if (mediaServerType === 'plex' && accountId) {
            if (isTautulliWatchHistorySource(config) && typeof fetchTautulliUserHistoryItems === 'function') {
                try {
                    let historyItems = await fetchTautulliUserHistoryItems(config, {
                        username: identity.username || req?.user?.username,
                        email: identity.email || req?.user?.email,
                        plexAccountName: identity.plexAccountName || identity.username,
                        maxItems,
                    });
                    if (historyItems?.length) {
                        historyItems = await maybeEnrich(historyItems);
                        return {
                            historyItems,
                            stats: buildStatsFromHistoryItems(historyItems, statsOpts),
                            timeZone,
                        };
                    }
                } catch (e) {
                    if (typeof log === 'function') {
                        log(`[achievements] Tautulli history failed, falling back to Plex: ${e?.message || e}`);
                    }
                }
            }

            const uri = await getPlexConnectionUri(config);
            if (!uri) {
                return { historyItems: [], stats: buildStatsFromAnalyticsPayload({}, statsOpts), timeZone };
            }
            let historyItems = await fetchPlexAccountHistory(uri, config, accountId, { maxItems });
            historyItems = await maybeEnrich(historyItems || []);
            return {
                historyItems,
                stats: buildStatsFromHistoryItems(historyItems || [], statsOpts),
                timeZone,
            };
        }

        if (['jellyfin', 'emby'].includes(mediaServerType) && accountId && typeof fetchJellyfinPlayedItems === 'function') {
            try {
                const items = await fetchJellyfinPlayedItems(config, accountId);
                if (Array.isArray(items) && items.length) {
                    const historyItems = mapJellyfinPlayedItemsToHistory(items);
                    return {
                        historyItems,
                        stats: buildStatsFromHistoryItems(historyItems, statsOpts),
                        timeZone,
                    };
                }
            } catch {
                /* fall through */
            }
        }
        return { historyItems: [], stats: buildStatsFromAnalyticsPayload({}, statsOpts), timeZone };
    };

    const resolveToastIds = (evaluation, prev = {}) => {
        const seen = new Set(Array.isArray(prev.seenUnlockIds) ? prev.seenUnlockIds.map(String) : []);
        const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const candidates = (evaluation.earned || []).filter((b) => {
            if (!b?.id || seen.has(String(b.id))) return false;
            const at = Date.parse(b.earnedAt || '');
            if (!Number.isFinite(at)) return !seen.size;
            return at >= weekAgo || !seen.size;
        });
        // First visit with a huge catalog: silently skip toast spam.
        if (!seen.size && candidates.length > 8) return [];
        return candidates.map((b) => String(b.id));
    };

    const slimBadge = (b) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        icon: b.icon,
        category: b.category,
        rarity: b.rarity,
        progress: b.progress,
        threshold: b.threshold,
        progressPct: b.progressPct,
        earned: b.earned,
        earnedAt: b.earnedAt,
    });

    const buildMePayload = (config, accountId, username, evaluation, prev = {}, extra = {}) => {
        const compact = !!extra.compact;
        const earnedSorted = [...evaluation.earned].sort((a, b) => String(b.earnedAt || '').localeCompare(String(a.earnedAt || '')));
        const newlyEarnedIds = Array.isArray(extra.newlyEarnedIds)
            ? extra.newlyEarnedIds
            : resolveToastIds(evaluation, prev);
        const base = {
            enabled: true,
            accountId: accountId ? String(accountId) : null,
            xp: evaluation.xp,
            level: evaluation.level,
            levelProgress: evaluation.levelProgress,
            breakdown: evaluation.breakdown,
            stats: evaluation.stats,
            earnedCount: evaluation.earnedCount,
            totalBadges: evaluation.totalBadges,
            recentEarned: earnedSorted.slice(0, 8).map(slimBadge),
            nextUnlocks: evaluation.nextUnlocks || [],
            newlyEarnedIds,
            categories: ACHIEVEMENT_CATEGORIES,
            leaderboardEnabled: config.achievementsLeaderboardEnabled !== false,
            leaderboardOptOut: !!prev.leaderboardOptOut,
            showOnProfile: config.achievementsShowOnProfile !== false,
            homeWidgetEnabled: config.achievementsHomeWidgetEnabled !== false,
            watchHistorySource: config.watchHistorySource === 'tautulli' ? 'tautulli' : 'plex',
        };
        if (!compact) {
            base.badges = evaluation.badgeResults;
            base.earned = earnedSorted;
        } else {
            base.earned = earnedSorted.slice(0, 24).map(slimBadge);
        }
        const { compact: _c, newlyEarnedIds: _n, ...restExtra } = extra;
        return { ...base, ...restExtra };
    };

    const ME_CACHE_MS = 15 * 60 * 1000;
    const refreshJobs = new Map();

    const scheduleMeRefresh = (accountId, username, email, config) => {
        const key = String(accountId);
        if (refreshJobs.has(key)) return;
        const job = (async () => {
            try {
                const state = await loadAchievementsState();
                const prev = state.users?.[key] || {};
                const { stats } = await gatherHistoryAndStats(null, config, accountId, {
                    username,
                    email,
                    plexAccountName: username,
                }, { maxItems: 50000, genreLookups: 120 });
                const evaluation = evaluateAchievements({
                    stats,
                    previousBadges: prev.badges || {},
                    weights: normalizeXpWeights(config.achievementsXpWeights),
                    disabledBadgeIds: config.achievementsDisabledBadgeIds,
                });
                const snapshot = snapshotFromEvaluation(accountId, username, evaluation, {
                    leaderboardOptOut: !!prev.leaderboardOptOut,
                });
                if (prev.thumb) snapshot.thumb = prev.thumb;
                else {
                    const liveThumb = await resolveThumbForAccount(
                        { user: { username, email, thumb: null, isAdmin: false } },
                        config,
                        accountId,
                        { username, email },
                    ).catch(() => null);
                    if (liveThumb) snapshot.thumb = liveThumb;
                }
                if (Array.isArray(prev.seenUnlockIds)) snapshot.seenUnlockIds = prev.seenUnlockIds;
                await upsertUserAchievementSnapshot(snapshot);
            } catch (e) {
                if (typeof log === 'function') log(`[achievements] Background /me refresh failed: ${e?.message || e}`);
            } finally {
                refreshJobs.delete(key);
            }
        })();
        refreshJobs.set(key, job);
    };

    const runLeaderboardBackfill = async () => {
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
                fetchTautulliUserHistoryItems,
                getAdminProfile,
                log,
            });
        } catch (e) {
            if (typeof log === 'function') log(`[achievements] Leaderboard backfill failed: ${e?.message || e}`);
        }
    };

    app.get('/api/achievements/meta', requireAuth, requireMember, async (req, res) => {
        const config = await loadFile(CONFIG_PATH, {});
        const normalized = normalizeAchievementsConfig(config);
        const payload = {
            enabled: normalized.achievementsEnabled,
            leaderboardEnabled: normalized.achievementsLeaderboardEnabled,
            homeWidgetEnabled: normalized.achievementsHomeWidgetEnabled,
            showOnProfile: normalized.achievementsShowOnProfile,
            totalBadges: countBadgeDefinitions(),
            categories: ACHIEVEMENT_CATEGORIES,
            watchHistorySource: normalized.watchHistorySource,
            xpWeights: normalizeXpWeights(normalized.achievementsXpWeights),
            defaultXpWeights: DEFAULT_XP_WEIGHTS,
            xpWeightLabels: XP_WEIGHT_LABELS,
            disabledBadgeIds: normalized.achievementsDisabledBadgeIds,
        };
        if (String(req.query.catalog || '') === '1') {
            payload.catalog = listBadgeDefinitions().map((b) => ({
                id: b.id,
                name: b.name,
                icon: b.icon,
                category: b.category,
            }));
        }
        res.json(payload);
    });

    app.get('/api/achievements/me', requireAuth, requireMember, async (req, res) => {
        try {
            if (!(await isEnabled())) {
                return res.status(404).json({ error: 'Achievements are disabled.' });
            }
            const { config, accountId, username, email } = await resolveAccountContext(req);
            const compact = String(req.query.view || '') === 'summary' || String(req.query.compact || '') === '1';
            const daysParam = req.query.days;
            const wantPeriod = daysParam != null && String(daysParam) !== '';

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
                    nextUnlocks: [],
                    categories: ACHIEVEMENT_CATEGORIES,
                    leaderboardEnabled: config.achievementsLeaderboardEnabled !== false,
                    leaderboardOptOut: false,
                    showOnProfile: config.achievementsShowOnProfile !== false,
                    watchHistorySource: config.watchHistorySource === 'tautulli' ? 'tautulli' : 'plex',
                });
            }

            const forceFresh = String(req.query.fresh || '') === '1';
            const state = await loadAchievementsState();
            const prev = state.users?.[String(accountId)] || {};
            const updatedMs = prev.updatedAt ? Date.parse(prev.updatedAt) : 0;
            const cacheAge = updatedMs ? Date.now() - updatedMs : Number.POSITIVE_INFINITY;
            const hasUsableCache = !!(prev.stats && prev.badges && Number.isFinite(cacheAge) && cacheAge < ME_CACHE_MS);

            const attachPeriod = async (payload, historyItems, timeZone) => {
                if (!wantPeriod) return payload;
                const periodItems = filterHistoryByDays(historyItems || [], daysParam);
                const periodStats = buildStatsFromHistoryItems(periodItems, { timeZone });
                const { xp, parts } = computeXpBreakdown(
                    periodStats,
                    normalizeXpWeights(config.achievementsXpWeights),
                );
                return {
                    ...payload,
                    periodDays: daysParam === 'all' ? 'all' : Number(daysParam) || daysParam,
                    periodXp: xp,
                    periodBreakdown: parts,
                    periodStats: {
                        totalPlays: periodStats.totalPlays,
                        hoursWatched: periodStats.hoursWatched,
                        activeDays: periodStats.activeDays,
                        uniqueTitles: periodStats.uniqueTitles,
                    },
                };
            };

            // Fast path: serve last snapshot immediately, refresh in background.
            if (!forceFresh && hasUsableCache && !wantPeriod) {
                const cachedEval = evaluateAchievements({
                    stats: prev.stats || {},
                    previousBadges: prev.badges || {},
                    weights: normalizeXpWeights(config.achievementsXpWeights),
                    disabledBadgeIds: config.achievementsDisabledBadgeIds,
                });
                scheduleMeRefresh(accountId, username, email, config);
                return res.json(buildMePayload(config, accountId, username, cachedEval, prev, {
                    compact,
                    newlyEarnedIds: resolveToastIds(cachedEval, prev),
                    cached: true,
                    refreshing: true,
                }));
            }

            const { historyItems, stats, timeZone } = await gatherHistoryAndStats(req, config, accountId, {
                username,
                email,
                plexAccountName: username,
            }, { maxItems: wantPeriod ? 50000 : 25000, genreLookups: compact ? 80 : 40 });

            const evaluation = evaluateAchievements({
                stats,
                previousBadges: prev.badges || {},
                weights: normalizeXpWeights(config.achievementsXpWeights),
                disabledBadgeIds: config.achievementsDisabledBadgeIds,
            });
            const snapshot = snapshotFromEvaluation(accountId, username, evaluation, {
                leaderboardOptOut: !!prev.leaderboardOptOut,
            });
            if (prev.thumb) snapshot.thumb = prev.thumb;
            else {
                const liveThumb = await resolveThumbForAccount(req, config, accountId, { username, email });
                if (liveThumb) snapshot.thumb = liveThumb;
            }
            if (Array.isArray(prev.seenUnlockIds)) snapshot.seenUnlockIds = prev.seenUnlockIds;
            await upsertUserAchievementSnapshot(snapshot);

            let payload = buildMePayload(config, accountId, username, evaluation, prev, {
                compact,
                cached: false,
                refreshing: false,
            });
            payload = await attachPeriod(payload, historyItems, timeZone);
            res.json(payload);
        } catch (e) {
            res.status(500).json({ error: e.message || 'Achievements error' });
        }
    });

    app.post('/api/achievements/me/ack-unlocks', requireAuth, requireMember, async (req, res) => {
        try {
            if (!(await isEnabled())) {
                return res.status(404).json({ error: 'Achievements are disabled.' });
            }
            const { accountId } = await resolveAccountContext(req);
            if (!accountId) return res.status(400).json({ error: 'No account id' });
            const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
            const seenUnlockIds = await ackAchievementUnlocks(accountId, ids);
            res.json({ ok: true, seenUnlockIds });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Ack failed' });
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

            // Never block the UI on a full portal rescore — kick it off in the background.
            void runLeaderboardBackfill();

            const { accountId } = await resolveAccountContext(req);
            const obfuscate = shouldObfuscateAnalyticsViewers
                ? shouldObfuscateAnalyticsViewers(req.user, config)
                : false;
            const state = await loadAchievementsState();
            const limit = parseInt(String(req.query.limit || '50'), 10) || 50;

            const { thumbByAccountId, thumbByUsername } = await buildLiveThumbLookup(config);

            // Prefer the live session/admin avatar for the viewer — PMS /accounts often omits the owner thumb.
            const viewerThumb = await resolveThumbForAccount(req, config, accountId, {
                username: req.user?.username,
                email: req.user?.email,
            });
            if (accountId && viewerThumb) {
                thumbByAccountId[String(accountId)] = viewerThumb;
            }

            const entries = buildLeaderboard(state, {
                limit,
                obfuscate,
                viewerAccountId: accountId,
                thumbByAccountId,
                thumbByUsername,
            });
            res.json({
                enabled: true,
                entries,
                populated: true,
                syncing: true,
            });
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
