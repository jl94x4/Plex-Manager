import React, { useEffect, useMemo, useState } from 'react';
import {
    ArrowDownRight, ArrowUpRight, Check, Clock, Copy, Crown, LogOut, Mail, Minus, Palette,
    Shield, SlidersHorizontal, Sparkles, Trophy, User,
} from 'lucide-react';
import { apiFetch } from '../shared/api';
import { logoUrl, portalUrl, resolvePortalAssetUrl, stripBasePath } from '../shared/basePath';
import { daysSinceDate, formatUkDate, getDaysUntilExpiry } from '../shared/format';
import { CustomSelect } from '../shared/ui';
import { DashboardPageShell, DashboardPanel } from '../shared/dashboard/DashboardChrome';
import { discoverRowCardWidthClass } from '../shared/portalLayout';
import { WrapUpCardGrid } from '../shared/WrapUpCards';
import { WrapUpModal } from '../screens';
import { ProfileBadgeRack } from '../achievements/AchievementsDashboard';
import { BadgeDetailDrawer } from '../achievements/BadgeDetailDrawer';
import { useDiscoverI18n } from '../discovery/i18n';
import { resolveTmdbImageUrl } from '../discovery/tmdbImageUrl';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const timeOfDayFromHour = (peakHour: number) => {
    if (peakHour >= 5 && peakHour < 12) return 'Early Bird';
    if (peakHour >= 12 && peakHour < 18) return 'Afternoon Watcher';
    if (peakHour >= 18) return 'Evening Streamer';
    return 'Night Owl';
};

const mapJellyfinHomeAnalytics = (data: any) => {
    const topMovies = Array.isArray(data?.topMovies) ? data.topMovies : [];
    const topShows = Array.isArray(data?.topShows) ? data.topShows : [];
    const topMusic = Array.isArray(data?.topMusic) ? data.topMusic : [];
    const topWatched = [...topShows, ...topMovies, ...topMusic].sort((a: any, b: any) => (b.plays || 0) - (a.plays || 0));
    const peakHours = Array.isArray(data?.peakHours) ? data.peakHours : [];
    const peakHour = peakHours.reduce((best: number, value: number, hour: number) => (
        value > (peakHours[best] || 0) ? hour : best
    ), 0);
    const dayOfWeekCounts = data?.dayOfWeekCounts && Object.keys(data.dayOfWeekCounts).length > 0
        ? data.dayOfWeekCounts
        : Object.entries(data?.heatmapData || {}).reduce((counts: Record<number, number>, [dateKey, count]) => {
            const date = new Date(`${dateKey}T00:00:00`);
            if (!Number.isNaN(date.getTime())) {
                const day = date.getDay();
                counts[day] = (counts[day] || 0) + (Number(count) || 0);
            }
            return counts;
        }, { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 });
    const topDayEntry = Object.entries(dayOfWeekCounts)
        .map(([day, count]) => ({ day: Number(day), count: Number(count) || 0 }))
        .sort((a, b) => b.count - a.count)[0];
    const moviesCount = data?.jellystatInsights?.moviePlays || topMovies.reduce((sum: number, item: any) => sum + (item.plays || 0), 0);
    const showsCount = data?.jellystatInsights?.tvPlays || topShows.reduce((sum: number, item: any) => sum + (item.plays || 0), 0);
    const musicCount = data?.jellystatInsights?.musicPlays || topMusic.reduce((sum: number, item: any) => sum + (item.plays || 0), 0);
    const topMovie = topMovies[0] || null;
    const topBinge = topShows[0] || null;
    const topLibraries = Array.isArray(data?.topLibraries) ? data.topLibraries : [];

    return {
        totalPlays: data?.totalPlaybacks || data?.jellystatInsights?.totalPlays || 0,
        moviesCount,
        showsCount,
        musicCount,
        topWatched,
        recentHistory: [],
        topMovie: topMovie ? { ...topMovie, artUrl: topMovie.thumbUrl } : null,
        topBinge: topBinge ? { ...topBinge, artUrl: topBinge.thumbUrl } : null,
        peakHour,
        avgHour: peakHour,
        timeOfDay: timeOfDayFromHour(peakHour),
        popularDay: topDayEntry && topDayEntry.count > 0 ? DAYS_OF_WEEK[topDayEntry.day] : 'Recent Activity',
        dayOfWeekCounts,
        favoriteLibrary: topLibraries[0]?.title || 'None',
        topLibraries,
        mediaPreference: moviesCount > showsCount ? 'Movie Fan' : 'TV Binger',
        watchStyle: topWatched.length >= 10 ? 'Explorer' : 'Focused',
        uniqueTitles: topWatched.length,
        streamingHabit: 'Jellyfin Viewer',
        weekdayPlays: data?.totalPlaybacks || 0,
        weekendPlays: 0,
        leaderboardRank: data?.leaderboardRank || null,
        totalActiveUsers: data?.totalActiveUsers || 0,
        myPlaysOnLeaderboard: data?.myPlaysOnLeaderboard ?? null,
        myXp: data?.myXp ?? null,
        leaderboardNeighbourhood: data?.leaderboardNeighbourhood || [],
        leaderboardSource: data?.leaderboardSource || 'period_plays',
        leaderboardMetric: data?.leaderboardMetric || 'plays',
        heatmapData: data?.heatmapData || null,
    };
};

const mergeProfileWrapUp = (snapshot: any, personal: any, identityXp?: number) => {
    if (!snapshot && !personal) return null;
    if (!personal) return snapshot;
    const snap = snapshot || {};
    return {
        ...snap,
        ...personal,
        totalPlays: Math.max(Number(snap.totalPlays) || 0, Number(personal.totalPlays) || 0),
        hoursWatched: Number(snap.hoursWatched) || Number(personal.hoursWatched) || 0,
        uniqueTitles: Number(snap.uniqueTitles) || Number(personal.uniqueTitles) || 0,
        moviesCount: Number(snap.moviesCount) || Number(personal.moviesCount) || 0,
        showsCount: Number(snap.showsCount) || Number(personal.showsCount) || 0,
        musicCount: Number(snap.musicCount) || Number(personal.musicCount) || 0,
        leaderboardRank: snap.leaderboardRank ?? personal.leaderboardRank ?? null,
        totalActiveUsers: snap.totalActiveUsers || personal.totalActiveUsers || 0,
        leaderboardSource: snap.leaderboardSource || personal.leaderboardSource || 'achievements',
        leaderboardMetric: snap.leaderboardMetric || personal.leaderboardMetric || 'xp',
        myXp: identityXp ?? personal.myXp,
        currentStreak: Number(snap.currentStreak) || Number(personal.currentStreak) || 0,
        longestStreak: Number(snap.longestStreak) || Number(personal.longestStreak) || 0,
        bingeMax: Number(snap.bingeMax) || Number(personal.bingeMax) || 0,
        activeDays: Number(snap.activeDays) || Number(personal.activeDays) || 0,
    };
};

const THEME_OPTIONS = [
    { label: 'Dynamic (Chameleon)', value: 'dynamic' },
    { label: 'Plex Dark', value: 'plex' },
    { label: 'Sleek Slate', value: 'slate' },
    { label: 'Nordic Frost', value: 'nordic' },
    { label: 'Jellyfin Purple', value: 'jellyfin' },
    { label: 'Emerald Green', value: 'emerald' },
    { label: 'Neon Midnight', value: 'midnight' },
    { label: 'Crimson Red', value: 'crimson' },
    { label: 'Deep Amethyst', value: 'amethyst' },
    { label: 'Sunset Orange', value: 'sunset' },
    { label: 'Ocean Teal', value: 'ocean' },
    { label: 'Rose Pink', value: 'rose' },
    { label: 'Royal Blue', value: 'royal' },
    { label: 'Graphite', value: 'graphite' },
    { label: 'Cyber Lime', value: 'cyberlime' },
    { label: 'Aurora', value: 'aurora' },
];

const rarityGlow: Record<string, string> = {
    legendary: 'from-amber-400/35 via-amber-500/10 to-[rgb(var(--color-card))]',
    epic: 'from-fuchsia-400/30 via-fuchsia-500/10 to-[rgb(var(--color-card))]',
    rare: 'from-sky-400/28 via-sky-500/10 to-[rgb(var(--color-card))]',
    common: 'from-white/10 via-white/5 to-[rgb(var(--color-card))]',
};

const resolveAvatar = (thumb: string | null | undefined, size = 220) => {
    if (!thumb) return logoUrl();
    if (thumb.startsWith('http://') || thumb.startsWith('https://') || thumb.startsWith('/api/')) {
        return resolvePortalAssetUrl(thumb);
    }
    return portalUrl(`/api/plex/image?path=${encodeURIComponent(thumb)}&width=${size}&height=${size}`);
};

const profileAccountIdFromPath = () => {
    const path = stripBasePath(window.location.pathname);
    const match = path.match(/^\/profile\/([^/]+)/i);
    if (!match) return '';
    try {
        return decodeURIComponent(match[1]);
    } catch {
        return match[1];
    }
};

const requestPoster = (item: { posterUrl?: string | null }) => {
    const raw = String(item?.posterUrl || '').trim();
    if (!raw) return '';
    if (raw.startsWith('/api/')) return resolvePortalAssetUrl(raw);
    return resolveTmdbImageUrl(raw, 'w500');
};

const trophyRarityClass = (rarity: string) => {
    if (rarity === 'legendary') return 'border-amber-400/50 text-amber-100 bg-amber-500/10 hover:border-amber-300/70';
    if (rarity === 'epic') return 'border-fuchsia-400/45 text-fuchsia-100 bg-fuchsia-500/10 hover:border-fuchsia-300/70';
    if (rarity === 'rare') return 'border-sky-400/45 text-sky-100 bg-sky-500/10 hover:border-sky-300/70';
    return 'border-white/10 bg-black/25 hover:border-plex/40';
};

const relativeFromDays = (days: number | null, t: (key: string, vars?: Record<string, string | number>) => string) => {
    if (days == null) return null;
    if (days <= 0) return t('profilePage.today');
    if (days === 1) return t('profilePage.yesterday');
    if (days < 14) return t('profilePage.daysAgo', { count: days });
    if (days < 60) return t('profilePage.weeksAgo', { count: Math.max(1, Math.round(days / 7)) });
    const months = Math.round(days / 30.44);
    if (months < 24) return t('profilePage.monthsAgo', { count: Math.max(1, months) });
    return t('profilePage.yearsAgo', { count: Math.max(1, Math.round(days / 365.25)) });
};

const accessStatusTone = (status: string) => {
    const value = String(status || 'unknown').toLowerCase();
    if (value === 'active') return {
        pill: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200',
        glow: 'from-emerald-400/25 via-emerald-500/5 to-transparent',
        icon: 'text-emerald-300',
    };
    if (value === 'pending') return {
        pill: 'border-amber-400/30 bg-amber-500/15 text-amber-200',
        glow: 'from-amber-400/25 via-amber-500/5 to-transparent',
        icon: 'text-amber-300',
    };
    if (value === 'revoked' || value === 'expired') return {
        pill: 'border-rose-400/30 bg-rose-500/15 text-rose-200',
        glow: 'from-rose-400/25 via-rose-500/5 to-transparent',
        icon: 'text-rose-300',
    };
    return {
        pill: 'border-white/15 bg-white/5 text-muted',
        glow: 'from-white/10 via-transparent to-transparent',
        icon: 'text-plex',
    };
};

type Props = {
    sessionInfo?: any;
    onNavigate: (route: string, options?: { path?: string }) => void;
    onLogout: () => void;
    activeTheme: string;
    setActiveTheme: (theme: string) => void;
};

export const ProfilePage: React.FC<Props> = ({
    sessionInfo,
    onNavigate,
    onLogout,
    activeTheme,
    setActiveTheme,
}) => {
    const { t } = useDiscoverI18n();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copiedEmail, setCopiedEmail] = useState(false);
    const [personalWrapUp, setPersonalWrapUp] = useState<any>(null);
    const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
    const [selectedBadgeId, setSelectedBadgeId] = useState<string | null>(null);
    const [pinnedIds, setPinnedIds] = useState<string[]>([]);
    const [pinBusy, setPinBusy] = useState(false);
    const accountId = profileAccountIdFromPath();
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

    const wrapAnalytics = useMemo(
        () => mergeProfileWrapUp(data?.watch?.wrapUp || null, personalWrapUp, Number(identity.xp) || undefined),
        [data?.watch?.wrapUp, personalWrapUp, identity.xp],
    );

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
        if (!selectedBadgeId) return undefined;
        let cancelled = false;
        apiFetch('/api/achievements/me?view=summary')
            .then((me: any) => {
                if (!cancelled && Array.isArray(me?.pinnedBadgeIds)) {
                    setPinnedIds(me.pinnedBadgeIds.map(String));
                }
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [selectedBadgeId]);

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
                                        {identity.username || sessionInfo?.session?.username || t('profilePage.member')}
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
                            {isSelf ? (
                                <div className="flex flex-wrap items-center gap-2 shrink-0">
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
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>
            </div>

            {!loading && !error && data && (
                <>
                    {wrapAnalytics && (Number(wrapAnalytics.totalPlays) > 0 || Number(wrapAnalytics.hoursWatched) > 0 || wrapAnalytics.leaderboardRank) ? (
                        <DashboardPanel title={t('profilePage.watchStory')} subtitle={t('profilePage.watchStoryHint')}>
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
                                            <p className="text-[10px] uppercase tracking-widest text-muted mt-1">{badge.rarity}</p>
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </DashboardPanel>
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

                    {isSelf && Array.isArray(data.requests?.recent) ? (
                        <DashboardPanel
                            title={t('profilePage.requests')}
                            subtitle={t('profilePage.requestsHint', {
                                total: data.requests.total || 0,
                                pending: data.requests.pending || 0,
                            })}
                            controls={
                                <button
                                    type="button"
                                    onClick={() => onNavigate('discovery', { path: '/discovery/requests' })}
                                    className="text-sm font-semibold text-plex hover:underline"
                                >
                                    {t('profilePage.openRequests')}
                                </button>
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
                                        return (
                                            <div
                                                key={String(item.id || item.title)}
                                                className={`${discoverRowCardWidthClass('xlarge')} shrink-0`}
                                            >
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
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-sm text-muted">{t('profilePage.noRequests')}</p>
                            )}
                        </DashboardPanel>
                    ) : null}

                    {isSelf ? (
                        <DashboardPanel title={t('profilePage.theme')} subtitle={t('profilePage.themeHint')}>
                            <div className="max-w-md flex items-center gap-3">
                                <Palette className="w-4 h-4 text-plex shrink-0" />
                                <CustomSelect
                                    value={activeTheme}
                                    onChange={setActiveTheme}
                                    options={THEME_OPTIONS}
                                    className="w-full"
                                />
                            </div>
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
                />
            ) : null}
            <BadgeDetailDrawer
                badgeId={selectedBadgeId}
                localBadge={selectedTrophy}
                pinnedIds={pinnedIds}
                onClose={() => setSelectedBadgeId(null)}
                onTogglePin={(id) => { void togglePin(id); }}
                pinBusy={pinBusy}
            />
        </DashboardPageShell>
    );
};

export default ProfilePage;
