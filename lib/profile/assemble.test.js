import assert from 'node:assert/strict';
import test from 'node:test';
import {
    PROFILE_UNAVAILABLE,
    assembleProfilePayload,
    buildAccountStrip,
    decidePeerProfileAccess,
    findPortalUserForAccountId,
    isSameProfileSubject,
    statsToWrapUpAnalytics,
} from './assemble.js';

const portalUser = {
    id: 'plex-share-1',
    plexId: 'plex-share-1',
    plexAccountId: '42',
    username: 'jay',
    email: 'jay@example.com',
    thumb: 'https://plex.tv/users/jay/avatar',
    joiningDate: '2024-01-01T00:00:00.000Z',
    expiryDate: '2027-01-01T00:00:00.000Z',
    lastLogin: '2026-08-01T00:00:00.000Z',
    plexAccessStatus: 'active',
    plexAuthToken: 'secret-token',
    libraryIds: [1, 2],
};

test('findPortalUserForAccountId matches portal, plex, and jellyfin ids', () => {
    const users = [
        portalUser,
        { id: 'jellyfin:abc', jellyfinId: 'abc', username: 'sam' },
    ];
    assert.equal(findPortalUserForAccountId(users, '42')?.username, 'jay');
    assert.equal(findPortalUserForAccountId(users, 'plex-share-1')?.username, 'jay');
    assert.equal(findPortalUserForAccountId(users, 'abc')?.username, 'sam');
    assert.equal(findPortalUserForAccountId(users, 'jellyfin:abc')?.username, 'sam');
    assert.equal(findPortalUserForAccountId(users, 'missing'), null);
});

test('isSameProfileSubject matches viewer to subject across id fields', () => {
    assert.equal(isSameProfileSubject({
        viewer: { id: 'plex-share-1' },
        viewerAccountId: '42',
        subjectAccountId: '42',
        portalUser,
    }), true);
    assert.equal(isSameProfileSubject({
        viewer: { id: 'other' },
        viewerAccountId: '99',
        subjectAccountId: '42',
        portalUser,
    }), false);
});

test('decidePeerProfileAccess: self and admin always get the full account', () => {
    assert.deepEqual(decidePeerProfileAccess({ isSelf: true, hideStreamUsers: 'hidden', leaderboardOptOut: true }), {
        ok: true,
        obfuscate: false,
        includeAccount: true,
    });
    assert.equal(decidePeerProfileAccess({ viewerIsAdmin: true, leaderboardOptOut: true }).includeAccount, true);
});

test('decidePeerProfileAccess: hidden and opt-out 404 for peers', () => {
    const hidden = decidePeerProfileAccess({ hideStreamUsers: 'hidden' });
    assert.equal(hidden.ok, false);
    assert.equal(hidden.status, 404);
    assert.equal(hidden.error, PROFILE_UNAVAILABLE);

    const opted = decidePeerProfileAccess({ leaderboardOptOut: true, showUsernamesInAnalytics: true });
    assert.equal(opted.ok, false);
    assert.equal(opted.status, 404);
});

test('decidePeerProfileAccess: anonymous and analytics-username-off obfuscate peers', () => {
    assert.equal(decidePeerProfileAccess({ hideStreamUsers: 'anonymous', showUsernamesInAnalytics: true }).obfuscate, true);
    assert.equal(decidePeerProfileAccess({ hideStreamUsers: 'false', showUsernamesInAnalytics: false }).obfuscate, true);
    assert.equal(decidePeerProfileAccess({ hideStreamUsers: 'false', showUsernamesInAnalytics: true }).obfuscate, false);
});

test('buildAccountStrip never copies tokens or libraries', () => {
    const strip = buildAccountStrip(portalUser);
    assert.equal(strip.email, 'jay@example.com');
    assert.equal(strip.expiryDate, '2027-01-01T00:00:00.000Z');
    assert.equal(strip.plexAuthToken, undefined);
    assert.equal(strip.libraryIds, undefined);
});

test('assembleProfilePayload: peer never receives email, expiry, or requests', () => {
    const payload = assembleProfilePayload({
        isSelf: false,
        viewerIsAdmin: false,
        obfuscate: false,
        includeAccount: false,
        portalUser,
        subjectAccountId: '42',
        snapshot: {
            accountId: '42',
            username: 'jay',
            xp: 1200,
            level: 8,
            earnedCount: 3,
            stats: { hoursWatched: 40, totalPlays: 90 },
        },
        achievementsEnabled: true,
        showOnProfile: true,
        requests: { total: 4, pending: 1, recent: [{ id: 1, title: 'Dune' }] },
        dossier: {
            accountId: '42',
            username: 'jay',
            rank: 2,
            boardSize: 10,
            xp: 1200,
            level: 8,
            earnedCount: 3,
            trophyCase: [{ id: 'movies_10', name: 'Movie buff', rarity: 'rare', icon: '🎬' }],
            lastBadge: { id: 'movies_10', name: 'Movie buff' },
        },
    });
    assert.equal(payload.account, null);
    assert.equal(payload.requests, null);
    assert.equal(payload.identity.username, 'jay');
    assert.equal(payload.identity.accountId, '42');
    assert.equal(payload.achievements.trophyCase[0].id, 'movies_10');
    assert.ok(!JSON.stringify(payload).includes('jay@example.com'));
    assert.ok(!JSON.stringify(payload).includes('secret-token'));
});

test('assembleProfilePayload: obfuscated peers lose accountId and thumb', () => {
    const payload = assembleProfilePayload({
        isSelf: false,
        obfuscate: true,
        includeAccount: false,
        portalUser,
        subjectAccountId: '42',
        dossier: { username: 'jay', rank: 4, thumb: 'https://plex.tv/users/jay/avatar', xp: 10, level: 1 },
        snapshot: { username: 'jay', xp: 10, level: 1, stats: {} },
        achievementsEnabled: true,
        showOnProfile: true,
    });
    assert.equal(payload.identity.username, 'Viewer 4');
    assert.equal(payload.identity.accountId, undefined);
    assert.equal(payload.identity.thumb, null);
});

test('assembleProfilePayload: self includes account strip even when opted out', () => {
    const payload = assembleProfilePayload({
        isSelf: true,
        viewerIsAdmin: false,
        includeAccount: true,
        portalUser,
        subjectAccountId: '42',
        snapshot: {
            accountId: '42',
            username: 'jay',
            xp: 50,
            level: 2,
            leaderboardOptOut: true,
            stats: { hoursWatched: 3, totalPlays: 8 },
        },
        achievementsEnabled: true,
        showOnProfile: true,
        requests: { total: 2, pending: 0, recent: [] },
    });
    assert.equal(payload.account.email, 'jay@example.com');
    assert.equal(payload.achievements.leaderboardOptOut, true);
    assert.equal(payload.requests.total, 2);
    assert.equal(payload.identity.isMe, true);
});

test('assembleProfilePayload: showOnProfile false hides trophies', () => {
    const payload = assembleProfilePayload({
        isSelf: true,
        includeAccount: true,
        portalUser,
        snapshot: { xp: 10, level: 1, badges: { movies_10: { earnedAt: '2024-01-01T00:00:00.000Z' } }, stats: {} },
        achievementsEnabled: true,
        showOnProfile: false,
    });
    assert.equal(payload.achievements.showOnProfile, false);
    assert.equal(payload.achievements.trophyCase, undefined);
    assert.equal(payload.identity.xp, 10);
});

test('statsToWrapUpAnalytics maps snapshot stats for wrap-up cards', () => {
    const wrap = statsToWrapUpAnalytics(
        { totalPlays: 12, hoursWatched: 4.5, moviePlays: 3, episodePlays: 9 },
        { rank: 7, boardSize: 20 },
    );
    assert.equal(wrap.totalPlays, 12);
    assert.equal(wrap.hoursWatched, 4.5);
    assert.equal(wrap.leaderboardRank, 7);
    assert.equal(wrap.leaderboardSource, 'achievements');
});
