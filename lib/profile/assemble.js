/**
 * Privacy-aware profile payloads for /api/profile/me and /api/profile/:accountId.
 * Peer views never include account secrets; hidden / opt-out peers 404.
 */

import { getBadgeDefinitionMap } from '../achievements/definitions.js';
import { levelProgress } from '../achievements/xp.js';

export const PROFILE_UNAVAILABLE = 'Profile not available';

const RARITY_RANK = Object.freeze({
    legendary: 4,
    epic: 3,
    rare: 2,
    common: 1,
});

export const normalizeHideStreamUsers = (config = {}) => (
    config.hideStreamUsers === true ? 'anonymous' : String(config.hideStreamUsers || 'false')
);

export const shouldObfuscateProfilePeers = (viewer = {}, config = {}) => {
    if (viewer?.isAdmin) return false;
    const hideMode = normalizeHideStreamUsers(config);
    if (hideMode === 'anonymous' || hideMode === 'hidden') return true;
    return config.showUsernamesInAnalytics !== true;
};

export const findPortalUserForAccountId = (users = [], accountId = '') => {
    const key = String(accountId || '').trim();
    if (!key || !Array.isArray(users)) return null;
    const jellyfinBare = key.startsWith('jellyfin:') ? key.slice('jellyfin:'.length) : '';
    return users.find((user) => {
        if (!user) return false;
        const ids = [
            user.id,
            user.plexId,
            user.jellyfinId,
            user.plexAccountId,
            user.jellyfinId ? `jellyfin:${user.jellyfinId}` : '',
        ].map((value) => String(value || '').trim()).filter(Boolean);
        if (ids.includes(key)) return true;
        return !!(jellyfinBare && String(user.jellyfinId || '') === jellyfinBare);
    }) || null;
};

export const resolveAchievementsAccountId = (portalUser, rawId, state = {}) => {
    const key = String(rawId || '').trim();
    const snapshots = state?.users && typeof state.users === 'object' ? state.users : {};
    if (key && snapshots[key]) return key;
    const candidates = [
        portalUser?.plexAccountId,
        portalUser?.id,
        portalUser?.plexId,
        portalUser?.jellyfinId,
        portalUser?.jellyfinId ? `jellyfin:${portalUser.jellyfinId}` : '',
        key,
    ].map((value) => String(value || '').trim()).filter(Boolean);
    for (const candidate of candidates) {
        if (snapshots[candidate]) return candidate;
    }
    return candidates[0] || key || null;
};

export const isSameProfileSubject = ({
    viewer = {},
    viewerAccountId = null,
    subjectAccountId = null,
    portalUser = null,
} = {}) => {
    const viewerIds = [
        viewerAccountId,
        viewer.id,
        viewer.plexId,
        viewer.jellyfinId,
        viewer.plexAccountId,
    ].map((value) => String(value || '').trim()).filter(Boolean);
    const subjectIds = [
        subjectAccountId,
        portalUser?.id,
        portalUser?.plexId,
        portalUser?.jellyfinId,
        portalUser?.plexAccountId,
    ].map((value) => String(value || '').trim()).filter(Boolean);
    return subjectIds.some((id) => viewerIds.includes(id));
};

/**
 * @returns {{ ok: true, obfuscate: boolean, includeAccount: boolean } | { ok: false, status: number, error: string }}
 */
export const decidePeerProfileAccess = ({
    isSelf = false,
    viewerIsAdmin = false,
    hideStreamUsers = 'false',
    showUsernamesInAnalytics = false,
    leaderboardOptOut = false,
} = {}) => {
    if (isSelf || viewerIsAdmin) {
        return { ok: true, obfuscate: false, includeAccount: true };
    }
    const hideMode = hideStreamUsers === true ? 'anonymous' : String(hideStreamUsers || 'false');
    if (hideMode === 'hidden') {
        return { ok: false, status: 404, error: PROFILE_UNAVAILABLE };
    }
    if (leaderboardOptOut) {
        return { ok: false, status: 404, error: PROFILE_UNAVAILABLE };
    }
    return {
        ok: true,
        obfuscate: hideMode === 'anonymous' || showUsernamesInAnalytics !== true,
        includeAccount: false,
    };
};

export const buildAccountStrip = (user = {}) => {
    if (!user || typeof user !== 'object') return null;
    return {
        email: user.email || '',
        joiningDate: user.joiningDate || null,
        expiryDate: user.expiryDate ?? null,
        lastLogin: user.lastLogin || null,
        plexAccessStatus: user.plexAccessStatus || 'unknown',
        isTrial: !!user.isTrial,
        isAdmin: !!user.isAdmin,
    };
};

export const statsToWrapUpAnalytics = (stats = {}, dossier = null) => {
    const source = stats && typeof stats === 'object' ? stats : {};
    const rank = Number(dossier?.rank);
    return {
        totalPlays: Number(source.totalPlays) || 0,
        hoursWatched: Number(source.hoursWatched) || 0,
        moviesCount: Number(source.moviePlays) || 0,
        showsCount: Number(source.episodePlays) || 0,
        musicCount: Number(source.trackPlays) || 0,
        uniqueTitles: Number(source.uniqueTitles) || 0,
        uniqueMovies: Number(source.uniqueMovies) || 0,
        uniqueShows: Number(source.uniqueShows) || 0,
        uniqueMusic: Number(source.uniqueMusic) || 0,
        leaderboardRank: Number.isFinite(rank) && rank > 0 ? rank : null,
        totalActiveUsers: Number(dossier?.boardSize) || 0,
        leaderboardSource: 'achievements',
        leaderboardMetric: 'xp',
        currentStreak: Number(source.currentStreak) || 0,
        longestStreak: Number(source.longestStreak) || 0,
        bingeMax: Number(source.bingeMax) || 0,
        activeDays: Number(source.activeDays) || 0,
    };
};

const earnedFromSnapshot = (snapshot = {}) => {
    const defs = getBadgeDefinitionMap();
    const rows = [];
    for (const [badgeId, badge] of Object.entries(snapshot.badges || {})) {
        if (!badge?.earnedAt || badge?.revokedAt) continue;
        const def = defs.get(String(badgeId));
        if (!def) continue;
        rows.push({
            id: def.id,
            name: def.name,
            description: def.description,
            icon: def.icon,
            category: def.category,
            rarity: def.rarity || 'common',
            earnedAt: badge.earnedAt,
        });
    }
    rows.sort((a, b) => String(b.earnedAt || '').localeCompare(String(a.earnedAt || '')));
    return rows;
};

const trophyCaseFromEarned = (earned = []) => (
    [...earned]
        .sort((a, b) => (RARITY_RANK[b.rarity] || 0) - (RARITY_RANK[a.rarity] || 0)
            || String(b.earnedAt || '').localeCompare(String(a.earnedAt || '')))
        .slice(0, 5)
);

const mediaServerLabel = (mediaServerType = 'plex') => {
    const type = String(mediaServerType || 'plex').toLowerCase();
    if (type === 'emby') return 'Emby';
    if (type === 'jellyfin') return 'Jellyfin';
    return 'Plex';
};

export const assembleProfilePayload = ({
    isSelf = false,
    viewerIsAdmin = false,
    obfuscate = false,
    includeAccount = false,
    mediaServerType = 'plex',
    portalUser = null,
    subjectAccountId = null,
    dossier = null,
    snapshot = null,
    achievementsEnabled = false,
    showOnProfile = true,
    requests = null,
} = {}) => {
    const rank = Number(dossier?.rank) || null;
    const xp = Number(dossier?.xp ?? snapshot?.xp) || 0;
    const level = Number(dossier?.level ?? snapshot?.level) || 1;
    const progress = levelProgress(xp);
    const rawUsername = dossier?.username
        || portalUser?.username
        || snapshot?.username
        || 'Member';
    const username = obfuscate && !isSelf
        ? (rank ? `Viewer ${rank}` : 'Member')
        : rawUsername;
    const thumb = obfuscate && !isSelf
        ? null
        : (dossier?.thumb || portalUser?.thumb || snapshot?.thumb || null);

    const earned = dossier?.momentum?.recentBadges?.length
        ? null
        : earnedFromSnapshot(snapshot || {});
    const trophySource = Array.isArray(dossier?.trophyCase) && dossier.trophyCase.length
        ? dossier.trophyCase
        : trophyCaseFromEarned(earned);
    const lastBadge = dossier?.lastBadge || (earned && earned[0]) || null;
    const showTrophies = achievementsEnabled && showOnProfile !== false;

    const identity = {
        accountId: obfuscate && !isSelf ? undefined : (subjectAccountId || dossier?.accountId || null),
        username,
        thumb,
        provider: mediaServerLabel(mediaServerType),
        isMe: !!isSelf,
        classTitle: dossier?.classTitle || null,
        rank: rank || null,
        previousRank: dossier?.previousRank || null,
        rankDelta: dossier?.rankDelta || 0,
        boardSize: Number(dossier?.boardSize) || 0,
        xp,
        level,
        earnedCount: Number(dossier?.earnedCount ?? snapshot?.earnedCount ?? earned?.length) || 0,
        totalBadges: Number(dossier?.totalBadges ?? snapshot?.totalBadges) || 0,
        levelProgress: progress,
        joiningDate: includeAccount ? (portalUser?.joiningDate || null) : null,
    };

    const achievements = achievementsEnabled ? {
        enabled: true,
        showOnProfile: showTrophies,
        leaderboardOptOut: !!snapshot?.leaderboardOptOut,
        ...(showTrophies ? {
            trophyCase: trophySource,
            lastBadge,
            earned: (earned || dossier?.momentum?.recentBadges || []).slice(0, 16),
            rarityBreakdown: dossier?.rarityBreakdown || null,
            firstUnlocks: dossier?.firstUnlocks || null,
            closest: dossier?.closest || null,
            rivals: dossier?.rivals || null,
            threat: dossier?.threat || null,
            momentum: dossier?.momentum || null,
            signature: dossier?.signature || null,
        } : {}),
    } : null;

    const stats = snapshot?.stats || {};
    const watch = {
        wrapUp: statsToWrapUpAnalytics(stats, dossier),
        hoursWatched: Number(stats.hoursWatched) || 0,
        totalPlays: Number(stats.totalPlays) || 0,
        currentStreak: Number(stats.currentStreak) || 0,
        longestStreak: Number(stats.longestStreak) || 0,
    };

    return {
        viewer: { isSelf: !!isSelf, isAdmin: !!viewerIsAdmin },
        identity,
        account: includeAccount ? buildAccountStrip(portalUser || {}) : null,
        achievements,
        watch,
        requests: includeAccount && isSelf && requests ? requests : null,
        features: {
            achievements: !!achievementsEnabled,
            requests: !!(includeAccount && isSelf && requests),
        },
        updatedAt: snapshot?.updatedAt || dossier?.updatedAt || null,
    };
};

export default assembleProfilePayload;
