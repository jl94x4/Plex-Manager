import { buildStatsFromHistoryItems, buildStatsFromAnalyticsPayload } from './stats.js';
import { evaluateAchievements, snapshotFromEvaluation } from './evaluate.js';
import { loadAchievementsState, saveAchievementsState } from './store.js';
import { normalizeXpWeights } from './xp.js';
import { mapJellyfinPlayedItemsToHistory } from './jellyfinMap.js';
import { enrichHistoryGenres } from './enrichGenres.js';

const BACKFILL_THROTTLE_MS = 30 * 60 * 1000;
const PLEX_HISTORY_CAP = 150000;

let inFlight = null;
let lastCompletedAt = 0;

const norm = (v) => String(v || '').trim().toLowerCase();

const shouldSkipPortalUser = (user) => {
    if (!user) return true;
    const status = String(user.plexAccessStatus || user.status || '').toLowerCase();
    if (status === 'revoked' || status === 'deleted' || status === 'banned') return true;
    return false;
};

/**
 * Map portal users.json entries → media-server account ids for achievements scoring.
 */
export const resolvePortalAchievementTargets = (users = [], {
    mediaServerType = 'plex',
    plexAccounts = [],
} = {}) => {
    const list = Array.isArray(users) ? users : [];
    const accounts = Array.isArray(plexAccounts) ? plexAccounts : [];
    const targets = [];
    const seen = new Set();

    for (const user of list) {
        if (shouldSkipPortalUser(user)) continue;
        const username = user.username || user.email || null;
        let accountId = null;

        if (['jellyfin', 'emby'].includes(String(mediaServerType || '').toLowerCase())) {
            accountId = user.jellyfinId || user.embyId || null;
        } else {
            if (user.plexAccountId) accountId = String(user.plexAccountId);
            if (!accountId && accounts.length) {
                const byName = accounts.find((a) => norm(a.name) === norm(user.username));
                if (byName) accountId = String(byName.id);
            }
            if (!accountId && user.email && accounts.length) {
                const byEmail = accounts.find((a) => (
                    norm(a.name) === norm(user.email)
                    || norm(a.email) === norm(user.email)
                    || norm(a.name) === norm(String(user.email).split('@')[0])
                ));
                if (byEmail) accountId = String(byEmail.id);
            }
            // Some portals store the local Plex account id in plexId.
            if (!accountId && user.plexId) {
                const plexId = String(user.plexId);
                if (accounts.some((a) => String(a.id) === plexId)) accountId = plexId;
                else if (/^\d+$/.test(plexId) && !accounts.length) accountId = plexId;
            }
            // Last resort: portal user id when it is a numeric Plex account id.
            if (!accountId && user.id && /^\d+$/.test(String(user.id))) {
                const id = String(user.id);
                if (!accounts.length || accounts.some((a) => String(a.id) === id)) accountId = id;
            }
        }

        if (!accountId) continue;
        const key = String(accountId);
        if (seen.has(key)) continue;
        seen.add(key);
        targets.push({
            accountId: key,
            username: username ? String(username) : `User ${key}`,
        });
    }

    return targets;
};

const groupPlexHistoryByAccount = (historyItems = []) => {
    const byAccount = new Map();
    for (const item of historyItems || []) {
        const accountId = String(
            item?.accountID
            ?? item?.AccountID
            ?? item?.accountId
            ?? item?.User?.id
            ?? '',
        ).trim();
        if (!accountId) continue;
        if (!byAccount.has(accountId)) byAccount.set(accountId, []);
        byAccount.get(accountId).push(item);
    }
    return byAccount;
};

const scoreTarget = ({
    target,
    historyItems,
    previous,
    config,
    thumb = null,
}) => {
    const stats = historyItems?.length
        ? buildStatsFromHistoryItems(historyItems)
        : buildStatsFromAnalyticsPayload({});
    const evaluation = evaluateAchievements({
        stats,
        previousBadges: previous?.badges || {},
        weights: normalizeXpWeights(config.achievementsXpWeights),
        disabledBadgeIds: config.achievementsDisabledBadgeIds,
    });
    const snapshot = snapshotFromEvaluation(target.accountId, target.username, evaluation, {
        leaderboardOptOut: !!previous?.leaderboardOptOut,
    });
    const resolvedThumb = thumb || previous?.thumb || null;
    if (resolvedThumb) snapshot.thumb = resolvedThumb;
    return snapshot;
};

const thumbFromPlexAccount = (account) => {
    if (!account) return null;
    return account.thumb || account.image || null;
};

const buildThumbLookup = (plexAccounts = [], portalUsers = []) => {
    const byId = {};
    for (const acc of plexAccounts || []) {
        const id = String(acc?.id || '').trim();
        const thumb = thumbFromPlexAccount(acc);
        if (id && thumb) byId[id] = thumb;
    }
    for (const user of portalUsers || []) {
        const id = String(user?.plexAccountId || user?.plexId || '').trim();
        const thumb = user?.thumb || null;
        if (id && thumb && !byId[id]) byId[id] = thumb;
    }
    return byId;
};

/**
 * Ensure every resolvable portal user has an achievements snapshot.
 * Plex: one full history pull + group by account (fast).
 * Jellyfin/Emby: per-user played items (concurrency-limited).
 *
 * Single-flight + throttle so leaderboard traffic does not stampede the media server.
 */
export const ensurePortalAchievementsBackfill = async (deps = {}, opts = {}) => {
    const {
        loadFile,
        CONFIG_PATH,
        USERS_PATH,
        getPlexConnectionUri,
        fetchPlexServerAccounts,
        fetchAllPlexHistory,
        fetchJellyfinPlayedItems,
        fetchPlexMetadataGenres,
        log = () => {},
    } = deps;
    const force = !!opts.force;

    if (inFlight) return inFlight;

    const run = (async () => {
        const config = await loadFile(CONFIG_PATH, {});
        if (!config?.achievementsEnabled) {
            return { ok: false, reason: 'disabled', processed: 0 };
        }
        if (config.achievementsLeaderboardEnabled === false) {
            return { ok: false, reason: 'leaderboard-disabled', processed: 0 };
        }

        const state = await loadAchievementsState();
        const users = await loadFile(USERS_PATH, []);
        const mediaServerType = String(config.mediaServerType || 'plex').toLowerCase();
        let plexAccounts = [];

        if (mediaServerType === 'plex') {
            const uri = await getPlexConnectionUri(config);
            if (uri && typeof fetchPlexServerAccounts === 'function') {
                const acc = await fetchPlexServerAccounts(uri, config);
                plexAccounts = acc?.list || [];
            }
        }

        const targets = resolvePortalAchievementTargets(users, { mediaServerType, plexAccounts });
        if (!targets.length) {
            return { ok: true, processed: 0, reason: 'no-targets' };
        }

        const thumbByAccountId = buildThumbLookup(plexAccounts, users);

        const missing = targets.filter((t) => !state.users?.[String(t.accountId)]);
        const stale = Date.now() - lastCompletedAt > BACKFILL_THROTTLE_MS;
        const needsWork = force || missing.length > 0 || stale;
        if (!needsWork) {
            return { ok: true, processed: 0, skipped: true, reason: 'fresh' };
        }

        // Prefer filling gaps always; full refresh on throttle/force.
        const toScore = (force || stale) ? targets : missing;
        log(`[achievements] Backfilling ${toScore.length} portal user(s) (${missing.length} missing)…`);

        const nextUsers = { ...(state.users || {}) };

        if (mediaServerType === 'plex' && typeof fetchAllPlexHistory === 'function') {
            const uri = await getPlexConnectionUri(config);
            if (!uri) {
                return { ok: false, reason: 'no-plex', processed: 0 };
            }
            let historyItems = await fetchAllPlexHistory(uri, config, { maxItems: PLEX_HISTORY_CAP });
            if (typeof fetchPlexMetadataGenres === 'function') {
                historyItems = await enrichHistoryGenres(
                    historyItems || [],
                    (ratingKey) => fetchPlexMetadataGenres(uri, config, ratingKey),
                    { maxLookups: 2500 },
                );
            }
            const byAccount = groupPlexHistoryByAccount(historyItems);
            for (const target of toScore) {
                const prev = nextUsers[String(target.accountId)] || {};
                const items = byAccount.get(String(target.accountId)) || [];
                nextUsers[String(target.accountId)] = scoreTarget({
                    target,
                    historyItems: items,
                    previous: prev,
                    config,
                    thumb: thumbByAccountId[String(target.accountId)] || null,
                });
            }
        } else if (['jellyfin', 'emby'].includes(mediaServerType) && typeof fetchJellyfinPlayedItems === 'function') {
            const concurrency = 2;
            let cursor = 0;
            const workers = Array.from({ length: concurrency }, async () => {
                while (cursor < toScore.length) {
                    const idx = cursor;
                    cursor += 1;
                    const target = toScore[idx];
                    const prev = nextUsers[String(target.accountId)] || {};
                    let items = [];
                    try {
                        const raw = await fetchJellyfinPlayedItems(config, target.accountId);
                        items = mapJellyfinPlayedItemsToHistory(raw);
                    } catch {
                        items = [];
                    }
                    nextUsers[String(target.accountId)] = scoreTarget({
                        target,
                        historyItems: items,
                        previous: prev,
                        config,
                        thumb: thumbByAccountId[String(target.accountId)] || null,
                    });
                }
            });
            await Promise.all(workers);
        } else {
            // Unknown server — still seed empty snapshots so the board isn't empty.
            for (const target of toScore) {
                const prev = nextUsers[String(target.accountId)] || {};
                nextUsers[String(target.accountId)] = scoreTarget({
                    target,
                    historyItems: [],
                    previous: prev,
                    config,
                    thumb: thumbByAccountId[String(target.accountId)] || null,
                });
            }
        }

        // Refresh thumbs on existing snapshots even when we only scored a subset.
        for (const target of targets) {
            const key = String(target.accountId);
            const snap = nextUsers[key];
            if (!snap) continue;
            const thumb = thumbByAccountId[key];
            if (thumb && snap.thumb !== thumb) nextUsers[key] = { ...snap, thumb };
        }

        await saveAchievementsState({ ...state, users: nextUsers });
        lastCompletedAt = Date.now();
        log(`[achievements] Backfill complete (${toScore.length} scored).`);
        return { ok: true, processed: toScore.length, missingBefore: missing.length };
    })();

    inFlight = run.finally(() => {
        inFlight = null;
    });
    return inFlight;
};
