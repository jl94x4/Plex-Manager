import React, { useEffect, useMemo, useState } from 'react';
import {
    ArrowDownRight, ArrowUpRight, Check, Clock, Copy, Crown, Link2, Lock, LogOut, Mail, Minus, Play, Share2,
    Shield, SlidersHorizontal, Sparkles, Swords, Trophy, User,
} from 'lucide-react';
import { apiFetch } from '../shared/api';
import { logoUrl } from '../shared/basePath';
import { daysSinceDate, formatUkDate, getDaysUntilExpiry } from '../shared/format';
import { DashboardPageShell, DashboardPanel } from '../shared/dashboard/DashboardChrome';
import { discoverRowCardWidthClass } from '../shared/portalLayout';
import { ShareWrapUpModal } from '../shared/ShareWrapUp';
import { pushToast, ToastContainer, type ToastMessage } from '../shared/toast';
import { WrapUpCardGrid } from '../shared/WrapUpCards';
import { WrapUpModal } from '../screens';
import { ProfileBadgeRack } from '../achievements/AchievementsDashboard';
import { BadgeDetailDrawer } from '../achievements/BadgeDetailDrawer';
import { useDiscoverI18n } from '../discovery/i18n';
import {
    accessStatusTone,
    goToProfile,
    profileAccountIdFromPath,
    profileShareUrl,
    rarityGlow,
    relativeFromDays,
    requestDiscoveryPath,
    requestPoster,
    resolveAvatar,
    trophyRarityClass,
} from './helpers';
import { mapJellyfinHomeAnalytics, mergeProfileWrapUp } from './wrapUp';
import { DossierArena } from './DossierArena';

type Props = {
    sessionInfo?: any;
    onNavigate: (route: string, options?: { path?: string }) => void;
    onLogout: () => void;
    locationPath?: string;
};

export const ProfilePage: React.FC<Props> = ({
    sessionInfo,
    onNavigate,
    onLogout,
    locationPath,
}) => {
    const { t } = useDiscoverI18n();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copiedEmail, setCopiedEmail] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);
    const [shareWrapUpOpen, setShareWrapUpOpen] = useState(false);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [personalWrapUp, setPersonalWrapUp] = useState<any>(null);
    const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
    const [selectedBadgeId, setSelectedBadgeId] = useState<string | null>(null);
    const [pinnedIds, setPinnedIds] = useState<string[]>([]);
    const [pinBusy, setPinBusy] = useState(false);
    const [nowPlaying, setNowPlaying] = useState<any>(null);
    const accountId = profileAccountIdFromPath(locationPath);
    const mediaServerType = String(sessionInfo?.mediaServerType || 'plex').toLowerCase();
    const isJellyfinPortal = mediaServerType === 'jellyfin' || mediaServerType === 'emby';

    useEffect(() => {
        let cancelled = false;
        const path = accountId
            ? `/api/profile/${encodeURIComponent(accountId)}`
            : '/api/profile/me';
        setLoading(true);
        setError(null);
        apiFetch(path)
            .then((payload) => {
                if (!cancelled) setData(payload);
            })
            .catch((err: any) => {
                if (!cancelled) {
                    setData(null);
                    setError(err?.message || t('profilePage.loadFailed'));
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [accountId, t]);

    useEffect(() => {
        setPersonalWrapUp(null);
        setSelectedMetric(null);
        setSelectedBadgeId(null);
        setCopiedLink(false);
        setShareWrapUpOpen(false);
        setNowPlaying(null);
        if (!data?.viewer?.isSelf) return undefined;
        let cancelled = false;
        const wrapUpSubjectId = String(
            sessionInfo?.impersonation?.targetUserId
            || sessionInfo?.account?.id
            || sessionInfo?.session?.id
            || sessionInfo?.session?.username
            || 'anon',
        );
        if (!isJellyfinPortal) {
            try {
                const raw = sessionStorage.getItem(`smp.wrapup.analytics.v2:${wrapUpSubjectId}:all`);
                const parsed = raw ? JSON.parse(raw) : null;
                if (parsed?.payload && typeof parsed.at === 'number' && Date.now() - parsed.at < 6 * 60 * 60 * 1000) {
                    setPersonalWrapUp(parsed.payload);
                }
            } catch {
                /* ignore */
            }
        }
        const load = async () => {
            try {
                const payload = isJellyfinPortal
                    ? mapJellyfinHomeAnalytics(await apiFetch('/api/jellystat/analytics?days=all'))
                    : await apiFetch('/api/plex/analytics/me?days=all');
                if (!cancelled) setPersonalWrapUp(payload);
            } catch {
                if (!cancelled) setPersonalWrapUp((prev: any) => prev);
            }
        };
        void load();
        return () => { cancelled = true; };
    }, [accountId, data?.viewer?.isSelf, isJellyfinPortal, sessionInfo?.account?.id, sessionInfo?.impersonation?.targetUserId, sessionInfo?.session?.id, sessionInfo?.session?.username]);

    useEffect(() => {
        if (!data || data.privacy?.locked) {
            setNowPlaying(null);
            return undefined;
        }
        const subjectId = String(data.identity?.accountId || accountId || '').trim();
        const subjectName = String(data.identity?.username || '').trim().toLowerCase();
        const nameHidden = !subjectName || subjectName === 'anonymous' || /^viewer\s+\d+$/.test(subjectName);
        if (!subjectId && nameHidden) {
            setNowPlaying(null);
            return undefined;
        }
        let cancelled = false;
        const load = async () => {
            try {
                const payload = await apiFetch(
                    isJellyfinPortal ? '/api/jellyfin/dashboard?limit=5' : '/api/plex/dashboard?limit=5',
                );
                const sessions = Array.isArray(payload?.activeSessions) ? payload.activeSessions : [];
                const hit = sessions.find((session: any) => {
                    const sessionId = String(session?.accountId || '').trim();
                    const sessionName = String(session?.user || '').trim().toLowerCase();
                    if (subjectId && sessionId && sessionId === subjectId) return true;
                    if (nameHidden) return false;
                    return !!sessionName && sessionName === subjectName;
                }) || null;
                if (!cancelled) setNowPlaying(hit);
            } catch {
                if (!cancelled) setNowPlaying(null);
            }
        };
        void load();
        return () => { cancelled = true; };
    }, [accountId, data, isJellyfinPortal]);

    const identity = data?.identity || {};
    const account = data?.account;
    const achievements = data?.achievements;
    const isSelf = !!data?.viewer?.isSelf;
    const heroRarity = achievements?.lastBadge?.rarity || achievements?.trophyCase?.[0]?.rarity || 'common';
    const delta = Number(identity.rankDelta) || 0;
    const RankIcon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
    const rankTone = delta > 0 ? 'text-emerald-300' : delta < 0 ? 'text-rose-300' : 'text-muted';
    const into = Number(identity.levelProgress?.xpIntoLevel) || 0;
    const need = Math.max(1, Number(identity.levelProgress?.xpForNextLevel) || 1);
    const xpPct = Math.min(100, Math.round((into / need) * 100));
    const joinDate = identity.joiningDate || account?.joiningDate || null;
    const joinUk = formatUkDate(joinDate);
    const joinRelative = relativeFromDays(daysSinceDate(joinDate), t);
    const lastSeenUk = formatUkDate(account?.lastLogin);
    const lastSeenRelative = relativeFromDays(daysSinceDate(account?.lastLogin), t);
    const daysLeft = getDaysUntilExpiry(account?.expiryDate || null);
    const accessStatus = String(account?.plexAccessStatus || 'unknown');
    const accessTone = accessStatusTone(accessStatus);
    const accessHeadline = account?.expiryDate
        ? t('profilePage.expiresOn', { date: formatUkDate(account.expiryDate) })
        : t('profilePage.unlimited');
    const accessSub = account?.expiryDate && daysLeft != null
        ? t('profilePage.daysLeft', { count: Math.max(0, daysLeft) })
        : t('profilePage.noExpiry');

    const copyEmail = async () => {
        const email = String(account?.email || '').trim();
        if (!email) return;
        try {
            await navigator.clipboard.writeText(email);
            setCopiedEmail(true);
            window.setTimeout(() => setCopiedEmail(false), 1800);
        } catch {
            setCopiedEmail(false);
        }
    };

    const copyProfileLink = async () => {
        const url = profileShareUrl(identity.accountId, isSelf);
        try {
            await navigator.clipboard.writeText(url);
            setCopiedLink(true);
            window.setTimeout(() => setCopiedLink(false), 1800);
        } catch {
            setCopiedLink(false);
        }
    };

    const wrapAnalytics = useMemo(
        () => mergeProfileWrapUp(data?.watch?.wrapUp || null, personalWrapUp, Number(identity.xp) || undefined),
        [data?.watch?.wrapUp, personalWrapUp, identity.xp],
    );

    useEffect(() => {
        if (Array.isArray(data?.achievements?.pinnedBadgeIds)) {
            setPinnedIds(data.achievements.pinnedBadgeIds.map(String));
        }
    }, [data?.achievements?.pinnedBadgeIds]);

    const selectedTrophy = useMemo(() => {
        if (!selectedBadgeId) return null;
        const pool = [
            ...(Array.isArray(achievements?.trophyCase) ? achievements.trophyCase : []),
            ...(Array.isArray(achievements?.earned) ? achievements.earned : []),
        ];
        const found = pool.find((badge: any) => String(badge?.id) === selectedBadgeId);
        return found ? { ...found, earned: true } : { id: selectedBadgeId, earned: true };
    }, [achievements, selectedBadgeId]);

    useEffect(() => {
        if (!selectedBadgeId || !isSelf) return undefined;
        let cancelled = false;
        apiFetch('/api/achievements/me?view=summary')
            .then((me: any) => {
                if (!cancelled && Array.isArray(me?.pinnedBadgeIds)) {
                    setPinnedIds(me.pinnedBadgeIds.map(String));
                }
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [selectedBadgeId, isSelf]);

    const reloadProfile = () => {
        const path = accountId
            ? `/api/profile/${encodeURIComponent(accountId)}`
            : '/api/profile/me';
        apiFetch(path).then(setData).catch(() => {});
    };

    const togglePin = async (badgeId: string) => {
        const id = String(badgeId);
        const next = pinnedIds.includes(id)
            ? pinnedIds.filter((value) => value !== id)
            : [...pinnedIds, id].slice(0, 3);
        setPinBusy(true);
        try {
            const res = await apiFetch('/api/achievements/me/pins', {
                method: 'POST',
                body: JSON.stringify({ ids: next }),
            });
            const saved = Array.isArray(res?.pinnedBadgeIds) ? res.pinnedBadgeIds.map(String) : next;
            setPinnedIds(saved);
            reloadProfile();
        } catch {
            /* drawer already shows pin control; ignore */
        } finally {
            setPinBusy(false);
        }
    };

    return (
        <DashboardPageShell>
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[rgb(var(--color-card))] shadow-[0_28px_80px_rgba(0,0,0,0.35)]">
                <div className={`pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-b ${rarityGlow[heroRarity] || rarityGlow.common}`} />
                <div className="pointer-events-none absolute -right-16 top-10 h-48 w-48 rounded-full bg-plex/15 blur-3xl" />
                <div className="relative z-[1] px-5 sm:px-7 pt-6 pb-5">
                    {loading && (
                        <p className="text-sm text-muted py-10 text-center">{t('profilePage.loading')}</p>
                    )}
                    {error && !loading && (
                        <p className="text-sm text-red-300 py-10 text-center">{error}</p>
                    )}
                    {!loading && !error && data && (
                        <div className="flex flex-col lg:flex-row lg:items-end gap-5">
                            <div className="flex items-start gap-4 min-w-0 flex-1">
                                <div className="relative shrink-0">
                                    <div className="absolute -inset-1 rounded-full bg-gradient-to-br from-plex/50 via-amber-400/20 to-transparent blur-sm" />
                                    <img
                                        src={resolveAvatar(identity.thumb, 220)}
                                        alt=""
                                        className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover border-2 border-white/15 bg-black/40"
                                        onError={(e) => { (e.target as HTMLImageElement).src = logoUrl(); }}
                                    />
                                    {identity.rank ? (
                                        <span className="absolute -bottom-1 -right-1 inline-flex items-center justify-center min-w-[2.25rem] h-8 px-1.5 rounded-full bg-plex text-xs font-black text-black shadow-lg">
                                            #{identity.rank}
                                        </span>
                                    ) : (
                                        <span className="absolute -bottom-1 -right-1 inline-flex items-center justify-center w-8 h-8 rounded-full bg-black/70 border border-white/15 text-plex">
                                            <User className="w-4 h-4" />
                                        </span>
                                    )}
                                </div>
                                <div className="min-w-0 pt-1">
                                    <p className="text-[10px] uppercase tracking-[0.28em] text-plex font-bold mb-1">
                                        {identity.classTitle?.label || identity.provider || t('profilePage.eyebrow')}
                                    </p>
                                    <h1 className="text-3xl sm:text-4xl font-black text-text truncate">
                                        {identity.username || (isSelf ? sessionInfo?.session?.username : '') || t('profilePage.member')}
                                        {identity.isMe ? (
                                            <span className="ml-2 text-sm font-bold text-plex">{t('profilePage.you')}</span>
                                        ) : null}
                                    </h1>
                                    <p className="text-sm text-muted mt-1 leading-snug">
                                        {identity.classTitle?.blurb || t('profilePage.subtitle', { provider: identity.provider || 'Plex' })}
                                    </p>
                                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                                        {achievements?.enabled ? (
                                            <>
                                                <span className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/25 px-2 py-1 font-mono text-text">
                                                    {t('profilePage.level', { level: identity.level ?? '—' })}
                                                </span>
                                                <span className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/25 px-2 py-1 font-mono text-text">
                                                    {(Number(identity.xp) || 0).toLocaleString()} XP
                                                </span>
                                            </>
                                        ) : null}
                                        {identity.rank ? (
                                            <span className={`inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/25 px-2 py-1 ${rankTone}`}>
                                                <RankIcon className="w-3.5 h-3.5" />
                                                {delta > 0
                                                    ? t('profilePage.climbed', { n: delta })
                                                    : delta < 0
                                                        ? t('profilePage.dropped', { n: Math.abs(delta) })
                                                        : t('profilePage.steady')}
                                            </span>
                                        ) : null}
                                        <span className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/25 px-2 py-1 text-muted">
                                            {identity.provider}
                                        </span>
                                    </div>
                                    {achievements?.enabled ? (
                                        <div className="mt-4 max-w-md">
                                            <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-muted mb-1.5">
                                                <span>{t('profilePage.xpProgress')}</span>
                                                <span className="font-mono text-text normal-case tracking-normal">
                                                    {into.toLocaleString()} / {need.toLocaleString()}
                                                </span>
                                            </div>
                                            <div className="h-2 rounded-full bg-black/50 border border-white/5 overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-gradient-to-r from-plex/80 to-plex shadow-[0_0_12px_rgba(229,160,13,0.35)]"
                                                    style={{ width: `${xpPct}%` }}
                                                />
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                            {data ? (
                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => { void copyProfileLink(); }}
                                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm font-bold text-text hover:border-plex/40"
                                    >
                                        {copiedLink ? <Check className="w-4 h-4 text-emerald-300" /> : <Link2 className="w-4 h-4 text-plex" />}
                                        {copiedLink ? t('profilePage.linkCopied') : t('profilePage.copyLink')}
                                    </button>
                                    {isSelf ? (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => onNavigate('preferences')}
                                                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm font-bold text-text hover:border-plex/40"
                                            >
                                                <SlidersHorizontal className="w-4 h-4 text-plex" />
                                                {t('navigation.preferences')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={onLogout}
                                                className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-200 hover:bg-red-500/20"
                                            >
                                                <LogOut className="w-4 h-4" />
                                                {t('navigation.logout')}
                                            </button>
                                        </>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>
            </div>

            {!loading && !error && data && (
                <>
                    {data.privacy?.privateToPeers && data.viewer?.isAdmin && !isSelf ? (
                        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                            {t('profilePage.privateBanner')}
                        </div>
                    ) : null}

                    {data.privacy?.locked ? (
                        <DashboardPanel title={t('profilePage.privateTitle')}>
                            <div className="flex items-start gap-3 text-sm text-muted">
                                <Lock className="w-5 h-5 text-plex shrink-0 mt-0.5" />
                                <p>{t('profilePage.privateHint', { name: identity.username || t('profilePage.member') })}</p>
                            </div>
                        </DashboardPanel>
                    ) : null}

                    {!data.privacy?.locked && nowPlaying ? (
                        <DashboardPanel title={t('profilePage.currentlyWatching')} subtitle={t('profilePage.currentlyWatchingHint')}>
                            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 p-3">
                                {nowPlaying.thumb ? (
                                    <img
                                        src={resolveAvatar(nowPlaying.thumb, 120)}
                                        alt=""
                                        className="w-16 h-24 rounded-lg object-cover border border-white/10 shrink-0"
                                    />
                                ) : (
                                    <span className="inline-flex w-16 h-24 items-center justify-center rounded-lg border border-white/10 bg-black/40 text-plex shrink-0">
                                        <Play className="w-6 h-6" />
                                    </span>
                                )}
                                <div className="min-w-0">
                                    <p className="text-sm font-black text-text truncate">
                                        {nowPlaying.grandparentTitle || nowPlaying.title}
                                    </p>
                                    {nowPlaying.grandparentTitle && nowPlaying.title ? (
                                        <p className="text-xs text-muted truncate mt-0.5">{nowPlaying.title}</p>
                                    ) : null}
                                    <p className="text-[11px] text-muted mt-1 capitalize">
                                        {nowPlaying.state || 'playing'}
                                        {Number(nowPlaying.progress) > 0 ? ` · ${Math.round(Number(nowPlaying.progress))}%` : ''}
                                    </p>
                                </div>
                            </div>
                        </DashboardPanel>
                    ) : null}

                    {!data.privacy?.locked && data.compare ? (
                        <DashboardPanel title={t('profilePage.compare')} subtitle={t('profilePage.compareHint')}>
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                                <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/25 px-3 py-2 font-bold">
                                    <Swords className="w-4 h-4 text-plex" />
                                    {Number(data.compare.xpGap) > 0
                                        ? t('profilePage.xpAhead', { n: Math.abs(Number(data.compare.xpGap) || 0).toLocaleString() })
                                        : Number(data.compare.xpGap) < 0
                                            ? t('profilePage.xpBehind', { n: Math.abs(Number(data.compare.xpGap) || 0).toLocaleString() })
                                            : t('profilePage.xpTied')}
                                </span>
                                <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/25 px-3 py-2 font-bold">
                                    {t('profilePage.sharedBadges', { count: Number(data.compare.sharedCount) || 0 })}
                                </span>
                            </div>
                            {Array.isArray(data.compare.shared) && data.compare.shared.length ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {data.compare.shared.map((badge: any) => (
                                        <button
                                            key={badge.id}
                                            type="button"
                                            onClick={() => setSelectedBadgeId(String(badge.id))}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-xs font-bold hover:border-plex/40"
                                        >
                                            <span>{badge.icon || '🏅'}</span>
                                            <span className="truncate max-w-[10rem]">{badge.name}</span>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted mt-3">{t('profilePage.noSharedBadges')}</p>
                            )}
                        </DashboardPanel>
                    ) : null}

                    {!data.privacy?.locked && data.watch?.taste && (Number(data.watch.taste.hoursWatched) > 0 || Number(data.watch.taste.mix?.total) > 0) ? (
                        <DashboardPanel title={t('profilePage.taste')} subtitle={t('profilePage.tasteHint')}>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {[
                                    { label: t('mediaType.movie'), value: data.watch.taste.mix?.movies },
                                    { label: t('mediaType.tv'), value: data.watch.taste.mix?.shows },
                                    { label: t('mediaType.music'), value: data.watch.taste.mix?.music },
                                    { label: t('profilePage.watchStory'), value: Math.round(Number(data.watch.taste.hoursWatched) || 0) },
                                ].map((row) => (
                                    <div key={row.label} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5">
                                        <p className="text-[10px] uppercase tracking-widest font-bold text-muted">{row.label}</p>
                                        <p className="mt-1 text-lg font-black text-text">{Number(row.value) || 0}</p>
                                    </div>
                                ))}
                            </div>
                            {Array.isArray(data.watch.taste.genres) && data.watch.taste.genres.length ? (
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                    {data.watch.taste.genres.map((genre: any) => (
                                        <span
                                            key={genre.id}
                                            className="inline-flex items-center rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[11px] font-bold capitalize"
                                        >
                                            {genre.label} · {genre.count}
                                        </span>
                                    ))}
                                </div>
                            ) : null}
                        </DashboardPanel>
                    ) : null}

                    {!data.privacy?.locked && wrapAnalytics && (Number(wrapAnalytics.totalPlays) > 0 || Number(wrapAnalytics.hoursWatched) > 0 || wrapAnalytics.leaderboardRank) ? (
                        <DashboardPanel
                            title={t('profilePage.watchStory')}
                            subtitle={t('profilePage.watchStoryHint')}
                            controls={
                                <button
                                    type="button"
                                    onClick={() => setShareWrapUpOpen(true)}
                                    className="text-sm font-semibold text-plex hover:underline inline-flex items-center gap-1"
                                >
                                    <Share2 className="w-4 h-4" />
                                    {t('profilePage.shareWrapUp')}
                                </button>
                            }
                        >
                            <WrapUpCardGrid
                                analytics={wrapAnalytics}
                                desktopMaxCards={10}
                                interactive
                                onCardClick={setSelectedMetric}
                            />
                        </DashboardPanel>
                    ) : null}

                    {achievements?.showOnProfile ? (
                        <DashboardPanel
                            title={t('profilePage.trophyCase')}
                            subtitle={t('profilePage.trophyHint')}
                            controls={
                                <button
                                    type="button"
                                    onClick={() => onNavigate('achievements')}
                                    className="text-sm font-semibold text-plex hover:underline inline-flex items-center gap-1"
                                >
                                    <Trophy className="w-4 h-4" />
                                    {t('profilePage.openAchievements')}
                                </button>
                            }
                        >
                            <ProfileBadgeRack
                                earned={achievements.earned || achievements.trophyCase || []}
                                level={identity.level}
                                xp={identity.xp}
                                max={16}
                                onOpenAll={() => onNavigate('achievements')}
                                onBadgeClick={(id) => setSelectedBadgeId(id)}
                            />
                            {Array.isArray(achievements.trophyCase) && achievements.trophyCase.length > 0 ? (
                                <div className="mt-4 grid grid-cols-1 sm:grid-cols-5 gap-2">
                                    {achievements.trophyCase.map((badge: any) => (
                                        <button
                                            key={badge.id}
                                            type="button"
                                            onClick={() => setSelectedBadgeId(String(badge.id))}
                                            title={badge.name}
                                            className={`rounded-xl border px-3 py-3 text-center cursor-pointer hover:scale-[1.03] hover:ring-2 hover:ring-plex/40 transition-all ${trophyRarityClass(badge.rarity)}`}
                                        >
                                            <span className="text-3xl leading-none">{badge.icon || '🏅'}</span>
                                            <p className="mt-2 text-xs font-bold text-text truncate">{badge.name}</p>
                                            <p className="text-[10px] uppercase tracking-widest text-muted mt-1">
                                                {badge.pinned ? t('profilePage.pinned') : badge.rarity}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </DashboardPanel>
                    ) : null}

                    {achievements?.showOnProfile ? (
                        <DossierArena
                            achievements={achievements}
                            onNavigate={onNavigate}
                            onOpenBadge={(id) => setSelectedBadgeId(id)}
                        />
                    ) : null}

                    {account ? (
                        <DashboardPanel title={t('profilePage.account')} subtitle={t('profilePage.accountHint')}>
                            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/25">
                                <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accessTone.glow}`} />
                                <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-plex/15 blur-3xl" />
                                <div className="pointer-events-none absolute -left-10 bottom-0 h-28 w-28 rounded-full bg-amber-400/10 blur-3xl" />
                                <div className="relative p-4 sm:p-5">
                                    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
                                        <div>
                                            <p className="text-[10px] uppercase tracking-[0.28em] font-bold text-plex">
                                                {t('profilePage.memberSince')}
                                            </p>
                                            <p className="mt-1 text-2xl sm:text-3xl font-black text-text tracking-tight">
                                                {joinUk || t('profilePage.unknown')}
                                            </p>
                                            {joinRelative ? (
                                                <p className="mt-1 text-sm text-muted">
                                                    {t('profilePage.onThisServer', { relative: joinRelative })}
                                                </p>
                                            ) : null}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {account.isAdmin ? (
                                                <span className="inline-flex items-center gap-1 rounded-full border border-plex/40 bg-plex/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-plex">
                                                    <Crown className="w-3 h-3" />
                                                    {t('profilePage.admin')}
                                                </span>
                                            ) : null}
                                            {account.isTrial ? (
                                                <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-200">
                                                    {t('profilePage.trial')}
                                                </span>
                                            ) : null}
                                            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${accessTone.pill}`}>
                                                {accessStatus}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                                            <p className="text-[10px] uppercase tracking-widest font-bold text-muted flex items-center gap-1.5">
                                                <Shield className={`w-3.5 h-3.5 ${accessTone.icon}`} />
                                                {t('profilePage.access')}
                                            </p>
                                            <p className="mt-2 text-lg font-black text-text">{accessHeadline}</p>
                                            <p className="text-[11px] text-muted mt-0.5">{accessSub}</p>
                                        </div>
                                        <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                                            <p className="text-[10px] uppercase tracking-widest font-bold text-muted flex items-center gap-1.5">
                                                <Clock className="w-3.5 h-3.5 text-plex" />
                                                {t('profilePage.lastLogin')}
                                            </p>
                                            <p className="mt-2 text-lg font-black text-text">
                                                {lastSeenUk || t('profilePage.never')}
                                            </p>
                                            {lastSeenRelative ? (
                                                <p className="text-[11px] text-muted mt-0.5">{lastSeenRelative}</p>
                                            ) : null}
                                        </div>
                                    </div>

                                    {account.email ? (
                                        <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                                            <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-plex/15 text-plex shrink-0">
                                                <Mail className="w-4 h-4" />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[10px] uppercase tracking-widest font-bold text-muted">
                                                    {t('profilePage.email')}
                                                </p>
                                                <p className="text-sm font-bold text-text truncate" title={account.email}>
                                                    {account.email}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={copyEmail}
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-muted hover:text-text hover:border-plex/40 shrink-0"
                                            >
                                                {copiedEmail ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                                                {copiedEmail ? t('profilePage.copied') : t('profilePage.copyEmail')}
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </DashboardPanel>
                    ) : null}

                    {Array.isArray(data.requests?.recent) ? (
                        <DashboardPanel
                            title={t('profilePage.requests')}
                            subtitle={t('profilePage.requestsHint', {
                                total: data.requests.total || 0,
                                pending: data.requests.pending || 0,
                            })}
                            controls={
                                isSelf ? (
                                    <button
                                        type="button"
                                        onClick={() => onNavigate('discovery', { path: '/discovery/requests' })}
                                        className="text-sm font-semibold text-plex hover:underline"
                                    >
                                        {t('profilePage.openRequests')}
                                    </button>
                                ) : null
                            }
                        >
                            {data.requests.recent.length ? (
                                <div className="flex gap-4 overflow-x-auto no-scrollbar pb-1">
                                    {data.requests.recent.map((item: any) => {
                                        const poster = requestPoster(item);
                                        const qualities = Array.isArray(item.qualities) && item.qualities.length
                                            ? item.qualities
                                            : (item.is4k ? ['4K'] : []);
                                        const qualityLabel = qualities.includes('4K') ? qualities.join(' · ') : null;
                                        const discoveryPath = requestDiscoveryPath(item);
                                        const card = (
                                            <>
                                                <div className="aspect-[2/3] rounded-xl overflow-hidden border border-white/10 bg-black/40">
                                                    {poster ? (
                                                        <img src={poster} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-muted">
                                                            <Sparkles className="w-8 h-8" />
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="mt-2 text-sm font-bold text-text truncate">{item.title}</p>
                                                <p className="text-xs text-muted truncate">
                                                    {[qualityLabel, item.status || item.mediaType].filter(Boolean).join(' · ')}
                                                </p>
                                            </>
                                        );
                                        return discoveryPath ? (
                                            <button
                                                key={String(item.id || item.title)}
                                                type="button"
                                                onClick={() => onNavigate('discovery', { path: discoveryPath })}
                                                className={`${discoverRowCardWidthClass('xlarge')} shrink-0 text-left hover:opacity-90`}
                                            >
                                                {card}
                                            </button>
                                        ) : (
                                            <div
                                                key={String(item.id || item.title)}
                                                className={`${discoverRowCardWidthClass('xlarge')} shrink-0`}
                                            >
                                                {card}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-sm text-muted">{t('profilePage.noRequests')}</p>
                            )}
                        </DashboardPanel>
                    ) : null}
                </>
            )}
            {selectedMetric && wrapAnalytics ? (
                <WrapUpModal
                    metric={selectedMetric}
                    analytics={wrapAnalytics}
                    days="all"
                    onClose={() => setSelectedMetric(null)}
                    onOpenProfile={(id) => {
                        setSelectedMetric(null);
                        goToProfile(onNavigate, id);
                    }}
                />
            ) : null}
            {shareWrapUpOpen && wrapAnalytics ? (
                <ShareWrapUpModal
                    analytics={wrapAnalytics}
                    days="all"
                    serverName={sessionInfo?.serverName || 'Server Portal'}
                    username={identity.username || sessionInfo?.session?.username}
                    onClose={() => setShareWrapUpOpen(false)}
                    onToast={(message, type) => setToasts((prev) => pushToast(prev, message, type))}
                />
            ) : null}
            <BadgeDetailDrawer
                badgeId={selectedBadgeId}
                localBadge={selectedTrophy}
                pinnedIds={isSelf ? pinnedIds : []}
                onClose={() => setSelectedBadgeId(null)}
                onTogglePin={isSelf ? (id) => { void togglePin(id); } : undefined}
                pinBusy={pinBusy}
            />
            <ToastContainer toasts={toasts} setToasts={setToasts} />
        </DashboardPageShell>
    );
};

export default ProfilePage;
