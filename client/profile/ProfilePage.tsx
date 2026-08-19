import React, { useEffect, useMemo, useState } from 'react';
import {
    ArrowDownRight, ArrowUpRight, Calendar, Clock, LogOut, Minus, Palette,
    Shield, SlidersHorizontal, Sparkles, Trophy, User,
} from 'lucide-react';
import { apiFetch } from '../shared/api';
import { logoUrl, portalUrl, resolvePortalAssetUrl, stripBasePath } from '../shared/basePath';
import { formatDate } from '../shared/format';
import { CustomSelect } from '../shared/ui';
import { DashboardPageShell, DashboardPanel } from '../shared/dashboard/DashboardChrome';
import { WrapUpCardGrid } from '../shared/WrapUpCards';
import { ProfileBadgeRack } from '../achievements/AchievementsDashboard';
import { useDiscoverI18n } from '../discovery/i18n';
import { resolveTmdbImageUrl } from '../discovery/tmdbImageUrl';

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
    return resolveTmdbImageUrl(raw, 'w185');
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
    const accountId = profileAccountIdFromPath();

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
    const accessLabel = account?.expiryDate
        ? formatDate(account.expiryDate)
        : t('profilePage.unlimited');

    const wrapAnalytics = useMemo(() => data?.watch?.wrapUp || null, [data?.watch?.wrapUp]);

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
                            <WrapUpCardGrid analytics={wrapAnalytics} desktopMaxCards={10} />
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
                                        <div
                                            key={badge.id}
                                            className="rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-center"
                                        >
                                            <span className="text-3xl leading-none">{badge.icon || '🏅'}</span>
                                            <p className="mt-2 text-xs font-bold text-text truncate">{badge.name}</p>
                                            <p className="text-[10px] uppercase tracking-widest text-muted mt-1">{badge.rarity}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                        </DashboardPanel>
                    ) : null}

                    {account ? (
                        <DashboardPanel title={t('profilePage.account')} subtitle={t('profilePage.accountHint')}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                                    <p className="text-[10px] uppercase tracking-widest font-bold text-muted flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5 text-plex" />
                                        {t('profilePage.joined')}
                                    </p>
                                    <p className="mt-1.5 text-sm font-bold text-text">
                                        {identity.joiningDate || account.joiningDate
                                            ? formatDate(identity.joiningDate || account.joiningDate)
                                            : t('profilePage.unknown')}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                                    <p className="text-[10px] uppercase tracking-widest font-bold text-muted flex items-center gap-1.5">
                                        <Shield className="w-3.5 h-3.5 text-plex" />
                                        {t('profilePage.access')}
                                    </p>
                                    <p className="mt-1.5 text-sm font-bold text-text">{accessLabel}</p>
                                    <p className="text-[11px] text-muted mt-0.5">
                                        {account.plexAccessStatus || 'unknown'}
                                        {account.isTrial ? ` · ${t('profilePage.trial')}` : ''}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                                    <p className="text-[10px] uppercase tracking-widest font-bold text-muted flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5 text-plex" />
                                        {t('profilePage.lastLogin')}
                                    </p>
                                    <p className="mt-1.5 text-sm font-bold text-text">
                                        {account.lastLogin ? formatDate(account.lastLogin) : t('profilePage.never')}
                                    </p>
                                </div>
                                {account.email ? (
                                    <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                                        <p className="text-[10px] uppercase tracking-widest font-bold text-muted">
                                            {t('profilePage.email')}
                                        </p>
                                        <p className="mt-1.5 text-sm font-bold text-text truncate" title={account.email}>
                                            {account.email}
                                        </p>
                                    </div>
                                ) : null}
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
                                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                                    {data.requests.recent.map((item: any) => {
                                        const poster = requestPoster(item);
                                        return (
                                            <div
                                                key={String(item.id || item.title)}
                                                className="w-24 shrink-0"
                                            >
                                                <div className="aspect-[2/3] rounded-xl overflow-hidden border border-white/10 bg-black/40">
                                                    {poster ? (
                                                        <img src={poster} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-muted">
                                                            <Sparkles className="w-6 h-6" />
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="mt-1.5 text-[11px] font-bold text-text truncate">{item.title}</p>
                                                <p className="text-[10px] text-muted truncate">{item.status || item.mediaType}</p>
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
        </DashboardPageShell>
    );
};

export default ProfilePage;
