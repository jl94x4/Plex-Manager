import fs from 'fs/promises';
import { ACHIEVEMENTS_STATE_PATH } from '../data-paths.js';

const emptyState = () => ({
    version: 1,
    users: {},
    updatedAt: null,
});

export const loadAchievementsState = async () => {
    try {
        const raw = await fs.readFile(ACHIEVEMENTS_STATE_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return emptyState();
        if (!parsed.users || typeof parsed.users !== 'object') parsed.users = {};
        return parsed;
    } catch {
        return emptyState();
    }
};

export const saveAchievementsState = async (state) => {
    const next = {
        version: 1,
        users: state?.users && typeof state.users === 'object' ? state.users : {},
        updatedAt: new Date().toISOString(),
    };
    await fs.mkdir(ACHIEVEMENTS_STATE_PATH.replace(/[/\\][^/\\]+$/, ''), { recursive: true });
    await fs.writeFile(ACHIEVEMENTS_STATE_PATH, JSON.stringify(next, null, 2), 'utf8');
    return next;
};

export const upsertUserAchievementSnapshot = async (snapshot) => {
    if (!snapshot?.accountId) throw new Error('accountId required');
    const state = await loadAchievementsState();
    const prev = state.users[String(snapshot.accountId)] || {};
    state.users[String(snapshot.accountId)] = {
        ...prev,
        ...snapshot,
        leaderboardOptOut: snapshot.leaderboardOptOut ?? prev.leaderboardOptOut ?? false,
    };
    await saveAchievementsState(state);
    return state.users[String(snapshot.accountId)];
};

export const setLeaderboardOptOut = async (accountId, optOut) => {
    const state = await loadAchievementsState();
    const key = String(accountId);
    const prev = state.users[key] || { accountId: key, xp: 0, level: 1, badges: {} };
    prev.leaderboardOptOut = !!optOut;
    prev.updatedAt = new Date().toISOString();
    state.users[key] = prev;
    await saveAchievementsState(state);
    return prev;
};

export const buildLeaderboard = (state, {
    limit = 50,
    obfuscate = false,
    viewerAccountId = null,
} = {}) => {
    const users = Object.values(state?.users || {})
        .filter((u) => u && !u.leaderboardOptOut)
        .sort((a, b) => (Number(b.xp) || 0) - (Number(a.xp) || 0) || (Number(b.earnedCount) || 0) - (Number(a.earnedCount) || 0));

    return users.slice(0, Math.max(1, Math.min(200, limit))).map((user, index) => {
        const rank = index + 1;
        const isMe = viewerAccountId != null && String(user.accountId) === String(viewerAccountId);
        const username = obfuscate && !isMe
            ? `Viewer ${rank}`
            : (user.username || `User ${rank}`);
        return {
            rank,
            accountId: isMe || !obfuscate ? user.accountId : undefined,
            username,
            xp: Number(user.xp) || 0,
            level: Number(user.level) || 1,
            earnedCount: Number(user.earnedCount) || 0,
            isMe,
        };
    });
};
