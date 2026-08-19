/**
 * Profile HTTP routes.
 */

import { loadAchievementsState } from '../achievements/store.js';
import { buildMemberDossier } from '../achievements/memberDossier.js';
import {
    PROFILE_UNAVAILABLE,
    assembleProfilePayload,
    collapseProfileRequests,
    decidePeerProfileAccess,
    findPortalUserForAccountId,
    isSameProfileSubject,
    normalizeHideStreamUsers,
    resolveAchievementsAccountId,
} from './assemble.js';

const slimRequest = (item = {}) => ({
    id: item.id ?? item.requestId ?? null,
    title: item.title || item.mediaTitle || item.name || '',
    posterUrl: item.posterUrl || item.posterPath || item.image || null,
    status: item.statusLabel || item.status || item.mediaStatus || null,
    mediaType: item.mediaType || item.type || null,
    tmdbId: Number(item.tmdbId) || null,
    mbid: item.mbid || null,
    is4k: !!item.is4k,
    statusLabel: item.statusLabel || null,
});

export const registerProfileRoutes = (app, deps) => {
    const {
        requireAuth,
        requireMember,
        loadFile,
        CONFIG_PATH,
        USERS_PATH,
        resolvePortalAccountId,
        resolveLocalUser = async () => null,
        loadRequestSummary = async () => null,
        log = () => {},
    } = deps;

    const buildForSubject = async ({
        req,
        config,
        users,
        portalUser,
        rawId,
        isOwnEndpoint,
    }) => {
        const viewerIsAdmin = !!req.user?.isAdmin;
        const viewerAccountId = typeof resolvePortalAccountId === 'function'
            ? await resolvePortalAccountId(req, config)
            : (req.user?.jellyfinId || req.user?.id || null);
        const achievementsEnabled = !!config.achievementsEnabled;
        const showOnProfile = config.achievementsShowOnProfile !== false;
        const state = achievementsEnabled ? await loadAchievementsState() : { users: {} };
        const subjectAccountId = resolveAchievementsAccountId(
            portalUser,
            isOwnEndpoint ? (viewerAccountId || rawId) : rawId,
            state,
            {
                viewerAccountId,
                username: portalUser?.username || req.user?.username,
                adminPlexId: config.adminPlexId,
            },
        );
        const snapshot = subjectAccountId ? (state.users?.[String(subjectAccountId)] || null) : null;
        const isSelf = isOwnEndpoint || isSameProfileSubject({
            viewer: req.user,
            viewerAccountId,
            subjectAccountId,
            portalUser,
        });

        if (!portalUser && !snapshot && !isSelf) {
            return { status: 404, body: { error: PROFILE_UNAVAILABLE } };
        }

        const access = decidePeerProfileAccess({
            isSelf,
            viewerIsAdmin,
            hideStreamUsers: normalizeHideStreamUsers(config),
            showUsernamesInAnalytics: config.showUsernamesInAnalytics,
            leaderboardOptOut: !!snapshot?.leaderboardOptOut,
        });
        if (!access.ok) {
            return { status: access.status || 404, body: { error: access.error || PROFILE_UNAVAILABLE } };
        }

        const dossier = achievementsEnabled && subjectAccountId
            ? buildMemberDossier(state, {
                accountId: subjectAccountId,
                viewerAccountId,
                obfuscate: access.obfuscate,
                weights: config.achievementsXpWeights,
            })
            : null;

        let requests = null;
        if (access.includeAccount && isSelf) {
            try {
                const summary = await loadRequestSummary(req, config);
                if (summary) {
                    requests = {
                        ...summary,
                        recent: collapseProfileRequests(
                            (Array.isArray(summary.recent) ? summary.recent : []).map(slimRequest),
                            { limit: 6 },
                        ),
                    };
                }
            } catch (error) {
                if (typeof log === 'function') log(`[profile] requests summary failed: ${error?.message || error}`);
            }
        }

        const payload = assembleProfilePayload({
            isSelf,
            viewerIsAdmin,
            obfuscate: access.obfuscate,
            includeAccount: access.includeAccount,
            mediaServerType: config.mediaServerType || 'plex',
            portalUser: portalUser || (isSelf ? findPortalUserForAccountId(users, viewerAccountId) : null),
            subjectAccountId: access.obfuscate && !isSelf ? null : subjectAccountId,
            dossier,
            snapshot,
            achievementsEnabled,
            showOnProfile,
            requests,
        });
        return { status: 200, body: payload };
    };

    app.get('/api/profile/me', requireAuth, requireMember, async (req, res) => {
        try {
            const config = await loadFile(CONFIG_PATH, {});
            const users = await loadFile(USERS_PATH, []);
            const portalUser = await resolveLocalUser(req.user) || findPortalUserForAccountId(
                users,
                req.user?.id || req.user?.plexId || req.user?.jellyfinId || '',
            );
            const result = await buildForSubject({
                req,
                config,
                users,
                portalUser,
                rawId: null,
                isOwnEndpoint: true,
            });
            res.status(result.status).json(result.body);
        } catch (error) {
            if (typeof log === 'function') log(`[profile] /me failed: ${error?.message || error}`);
            res.status(500).json({ error: error?.message || 'Profile error' });
        }
    });

    app.get('/api/profile/:accountId', requireAuth, requireMember, async (req, res) => {
        try {
            const rawId = decodeURIComponent(String(req.params.accountId || '').trim());
            if (!rawId || rawId === 'me') {
                return res.redirect(302, '/api/profile/me');
            }
            const config = await loadFile(CONFIG_PATH, {});
            const users = await loadFile(USERS_PATH, []);
            const portalUser = findPortalUserForAccountId(users, rawId);
            const result = await buildForSubject({
                req,
                config,
                users,
                portalUser,
                rawId,
                isOwnEndpoint: false,
            });
            res.status(result.status).json(result.body);
        } catch (error) {
            if (typeof log === 'function') log(`[profile] /:accountId failed: ${error?.message || error}`);
            res.status(500).json({ error: error?.message || 'Profile error' });
        }
    });
};

export default registerProfileRoutes;
export { slimRequest };
