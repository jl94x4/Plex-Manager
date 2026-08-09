import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Award, Calendar, ChevronLeft, ChevronRight, Clapperboard, Clock, Disc3,
    Film, Flame, Lock, Music2, Sparkles, Trophy, X, Info, Medal, Target,
    Gauge, PlayCircle, type LucideIcon,
} from 'lucide-react';
import { apiFetch } from '../shared/api';
import { logoUrl, portalUrl, resolvePortalAssetUrl } from '../shared/basePath';
import { ModalPortal } from '../shared/ModalPortal';
import { ToastContainer, pushToast, type ToastMessage } from '../shared/toast';
import { tAchievements } from './i18n';

const LEADERBOARD_PAGE_SIZE = 10;
const LEADERBOARD_FETCH_LIMIT = 100;

const BREAKDOWN_META: Record<string, { icon: LucideIcon; statKey?: string; tipKey: string }> = {
    uniqueMovies: { icon: Film, tipKey: 'xp.tip.uniqueMovies', statKey: 'uniqueMovies' },
    uniqueShows: { icon: Clapperboard, tipKey: 'xp.tip.uniqueShows', statKey: 'uniqueShows' },
    uniqueMusic: { icon: Disc3, tipKey: 'xp.tip.uniqueMusic', statKey: 'uniqueMusic' },
    moviePlays: { icon: PlayCircle, tipKey: 'xp.tip.moviePlays', statKey: 'moviePlays' },
    episodePlays: { icon: Clapperboard, tipKey: 'xp.tip.episodePlays', statKey: 'episodePlays' },
    trackPlays: { icon: Music2, tipKey: 'xp.tip.trackPlays', statKey: 'trackPlays' },
    totalPlays: { icon: Gauge, tipKey: 'xp.tip.totalPlays', statKey: 'totalPlays' },
    activeDays: { icon: Calendar, tipKey: 'xp.tip.activeDays', statKey: 'activeDays' },
    longestStreak: { icon: Flame, tipKey: 'xp.tip.longestStreak', statKey: 'longestStreak' },
    weekendPlays: { icon: Sparkles, tipKey: 'xp.tip.weekendPlays', statKey: 'weekendPlays' },
    hoursWatched: { icon: Clock, tipKey: 'xp.tip.hoursWatched', statKey: 'hoursWatched' },
};

const formatLabel = (key: string) => tAchievements(`xp.source.${key}`) !== `xp.source.${key}`
    ? tAchievements(`xp.source.${key}`)
    : key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

const resolveLeaderboardAvatar = (thumb: string | null | undefined, width = 64, height = 64) => {
    if (!thumb) return logoUrl();
    if (thumb.startsWith('http://') || thumb.startsWith('https://') || thumb.startsWith('/api/')) {
        return resolvePortalAssetUrl(thumb);
    }
    return portalUrl(`/api/plex/image?path=${encodeURIComponent(thumb)}&width=${width}&height=${height}`);
};

const rarityClass = (rarity: string) => {
    if (rarity === 'legendary') return 'border-amber-400/50 bg-amber-500/10 text-amber-100';
    if (rarity === 'epic') return 'border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-100';
    if (rarity === 'rare') return 'border-sky-400/40 bg-sky-500/10 text-sky-100';
    return 'border-white/10 bg-white/[0.03] text-text';
};

export const BadgeTile: React.FC<{
    badge: any;
    compact?: boolean;
    onClick?: () => void;
}> = ({ badge, compact, onClick }) => {
    const earned = !!badge?.earned;
    return (
        <button
            type="button"
            onClick={onClick}
            className={`text-left rounded-xl border transition-colors ${rarityClass(badge?.rarity)} ${
                earned ? '' : 'opacity-55 grayscale'
            } ${compact ? 'p-2.5' : 'p-3'} hover:border-plex/40`}
        >
            <div className="flex items-start gap-2.5">
                <span className={`${compact ? 'text-xl' : 'text-2xl'} leading-none`}>{badge?.icon || '🏅'}</span>
                <div className="min-w-0 flex-1">
                    <p className={`font-bold truncate ${compact ? 'text-xs' : 'text-sm'}`}>{badge?.name}</p>
                    {!compact && (
                        <p className="text-[11px] text-muted mt-0.5 line-clamp-2">{badge?.description}</p>
                    )}
                    <div className="mt-2 h-1.5 rounded-full bg-black/40 overflow-hidden">
                        <div
                            className={`h-full rounded-full ${earned ? 'bg-plex' : 'bg-white/25'}`}
                            style={{ width: `${Math.min(100, Number(badge?.progressPct) || 0)}%` }}
                        />
                    </div>
                    <p className="mt-1 text-[10px] text-muted font-mono">
                        {earned ? tAchievements('badge.earned') : `${badge?.progress ?? 0} / ${badge?.threshold ?? 0}`}
                    </p>
                </div>
                {!earned && <Lock className="w-3.5 h-3.5 text-muted shrink-0 mt-0.5" />}
            </div>
        </button>
    );
};

export const ProfileBadgeRack: React.FC<{
    earned: any[];
    level?: number;
    xp?: number;
    onOpenAll?: () => void;
    max?: number;
}> = ({ earned, level, xp, onOpenAll, max = 12 }) => {
    const shown = (earned || []).slice(0, max);
    if (!shown.length && level == null) return null;
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-muted font-bold">
                    <Award className="w-3.5 h-3.5 text-plex" />
                    {tAchievements('profile.title')}
                    {level != null && (
                        <span className="normal-case tracking-normal text-plex font-black">Lv {level}</span>
                    )}
                </div>
                {onOpenAll && (
                    <button
                        type="button"
                        onClick={onOpenAll}
                        className="text-[11px] font-semibold text-plex hover:underline inline-flex items-center gap-0.5"
                    >
                        {tAchievements('profile.all')} <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
            {xp != null && (
                <p className="text-[11px] text-muted font-mono">{Number(xp).toLocaleString()} XP · {earned?.length || 0} badges</p>
            )}
            <div className="flex flex-wrap gap-1.5">
                {shown.map((badge) => (
                    <span
                        key={badge.id}
                        title={`${badge.name}${badge.description ? ` — ${badge.description}` : ''}`}
                        className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-white/10 bg-black/30 text-lg"
                    >
                        {badge.icon || '🏅'}
                    </span>
                ))}
                {!shown.length && (
                    <p className="text-xs text-muted">{tAchievements('profile.empty')}</p>
                )}
            </div>
        </div>
    );
};

export const XpBreakdownModal: React.FC<{
    open: boolean;
    onClose: () => void;
    breakdown?: Record<string, number>;
    stats?: Record<string, number>;
    xp?: number;
    levelProgress?: any;
    earnedCount?: number;
    totalBadges?: number;
    nextUnlocks?: any[];
}> = ({
    open,
    onClose,
    breakdown,
    stats,
    xp = 0,
    levelProgress,
    earnedCount = 0,
    totalBadges = 0,
    nextUnlocks = [],
}) => {
    if (!open) return null;

    const level = Number(levelProgress?.level) || 1;
    const into = Number(levelProgress?.xpIntoLevel) || 0;
    const need = Math.max(1, Number(levelProgress?.xpForNextLevel) || 1);
    const progressPct = Math.min(100, Math.max(0, Number(levelProgress?.progressPct) || Math.round((into / need) * 100)));
    const remaining = Math.max(0, need - into);
    const totalXp = Number(xp) || 0;

    const rows = Object.entries(breakdown || {})
        .map(([key, value]) => [key, Number(value) || 0] as const)
        .filter(([, value]) => value > 0)
        .sort((a, b) => b[1] - a[1]);
    const zeroRows = Object.entries(breakdown || {})
        .map(([key, value]) => [key, Number(value) || 0] as const)
        .filter(([, value]) => value <= 0)
        .sort((a, b) => a[0].localeCompare(b[0]));
    const partsSum = rows.reduce((sum, [, value]) => sum + value, 0) || totalXp || 1;
    const topKey = rows[0]?.[0];
    const topShare = rows[0] ? Math.round((rows[0][1] / partsSum) * 100) : 0;

    const activity = [
        { key: 'hours', label: tAchievements('xp.stat.hours'), value: Number(stats?.hoursWatched) || 0, icon: Clock },
        { key: 'streak', label: tAchievements('xp.stat.streak'), value: Number(stats?.longestStreak) || 0, icon: Flame },
        { key: 'active', label: tAchievements('xp.stat.activeDays'), value: Number(stats?.activeDays) || 0, icon: Calendar },
        { key: 'unique', label: tAchievements('xp.stat.unique'), value: (Number(stats?.uniqueMovies) || 0) + (Number(stats?.uniqueShows) || 0), icon: Film },
        { key: 'plays', label: tAchievements('xp.stat.plays'), value: Number(stats?.totalPlays) || 0, icon: PlayCircle },
        { key: 'badges', label: tAchievements('xp.stat.badges'), value: earnedCount, icon: Award, sub: totalBadges ? `/ ${totalBadges}` : undefined },
    ];

    return (
        <ModalPortal open={open}>
            <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-5">
                <button type="button" className="absolute inset-0 bg-black/75 backdrop-blur-[2px]" aria-label="Close" onClick={onClose} />
                <div className="relative w-full sm:max-w-3xl max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-white/10 bg-[#12141a] shadow-[0_24px_80px_rgba(0,0,0,0.55)] overflow-hidden">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-plex/20 via-plex/5 to-transparent" />

                    <div className="relative flex items-start justify-between gap-3 px-5 sm:px-7 pt-5 sm:pt-6 pb-4 border-b border-white/8 shrink-0">
                        <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-[0.28em] text-plex font-bold mb-1.5">
                                {tAchievements('xp.eyebrow')}
                            </p>
                            <h3 className="text-xl sm:text-2xl font-black text-text flex items-center gap-2.5">
                                <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-plex/15 border border-plex/30">
                                    <Sparkles className="w-4 h-4 text-plex" />
                                </span>
                                {tAchievements('page.xpBreakdown')}
                            </h3>
                            <p className="text-sm text-muted mt-1.5 max-w-xl leading-relaxed">
                                {tAchievements('xp.subtitle')}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2.5 rounded-xl text-muted hover:text-text hover:bg-white/5 border border-transparent hover:border-white/10 transition-colors shrink-0"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="relative flex-1 overflow-y-auto custom-scrollbar px-5 sm:px-7 py-5 space-y-6">
                        {/* Level overview */}
                        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-4 sm:p-5">
                            <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
                                <div className="shrink-0">
                                    <p className="text-[10px] uppercase tracking-[0.22em] text-muted font-bold">
                                        {tAchievements('page.level', { level })}
                                    </p>
                                    <p className="text-3xl sm:text-4xl font-black text-text font-mono tabular-nums mt-1">
                                        {totalXp.toLocaleString()}
                                        <span className="text-base sm:text-lg font-bold text-muted ml-1.5">XP</span>
                                    </p>
                                    {topKey && (
                                        <p className="text-xs text-muted mt-2">
                                            {tAchievements('xp.topSource', {
                                                source: formatLabel(topKey),
                                                pct: topShare,
                                            })}
                                        </p>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0 space-y-2">
                                    <div className="flex items-center justify-between gap-3 text-xs">
                                        <span className="text-muted font-semibold">
                                            {tAchievements('xp.progressTo', { level: level + 1 })}
                                        </span>
                                        <span className="font-mono text-plex font-bold tabular-nums">
                                            {progressPct}%
                                        </span>
                                    </div>
                                    <div className="h-3 rounded-full bg-black/50 border border-white/10 overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-gradient-to-r from-plex/80 to-plex shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-all"
                                            style={{ width: `${progressPct}%` }}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between gap-3 text-[11px] font-mono text-muted tabular-nums">
                                        <span>{tAchievements('page.toNext', { into, need })}</span>
                                        <span className="text-text/80 font-semibold">
                                            {tAchievements('xp.remaining', { xp: remaining.toLocaleString() })}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Activity snapshot */}
                        <div>
                            <h4 className="text-[10px] uppercase tracking-[0.22em] text-muted font-bold mb-3">
                                {tAchievements('xp.activityTitle')}
                            </h4>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                                {activity.map((item) => {
                                    const Icon = item.icon;
                                    return (
                                        <div
                                            key={item.key}
                                            className="rounded-xl border border-white/8 bg-black/25 px-3 py-2.5 min-w-0"
                                        >
                                            <div className="flex items-center gap-1.5 text-muted mb-1">
                                                <Icon className="w-3.5 h-3.5 text-plex/80 shrink-0" />
                                                <span className="text-[10px] uppercase tracking-wide font-semibold truncate">
                                                    {item.label}
                                                </span>
                                            </div>
                                            <p className="text-lg font-black text-text font-mono tabular-nums leading-none">
                                                {Number(item.value).toLocaleString()}
                                                {item.sub ? (
                                                    <span className="text-[11px] text-muted font-semibold ml-1">{item.sub}</span>
                                                ) : null}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Contribution bars */}
                        <div>
                            <div className="flex items-end justify-between gap-3 mb-3">
                                <h4 className="text-[10px] uppercase tracking-[0.22em] text-muted font-bold">
                                    {tAchievements('xp.sourcesTitle')}
                                </h4>
                                <p className="text-[11px] text-muted hidden sm:block">
                                    {tAchievements('xp.sourcesHint')}
                                </p>
                            </div>
                            <div className="space-y-2.5">
                                {rows.map(([key, value], index) => {
                                    const meta = BREAKDOWN_META[key] || { icon: Info, tipKey: '', statKey: undefined };
                                    const Icon = meta.icon;
                                    const pct = Math.round((value / partsSum) * 100);
                                    const barPct = Math.max(3, Math.round((value / (rows[0]?.[1] || value || 1)) * 100));
                                    const rawStat = meta.statKey ? Number(stats?.[meta.statKey]) || 0 : null;
                                    return (
                                        <div
                                            key={key}
                                            className={`rounded-xl border px-3.5 py-3 ${
                                                index === 0
                                                    ? 'border-plex/35 bg-plex/10'
                                                    : 'border-white/8 bg-black/20'
                                            }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <span className={`mt-0.5 inline-flex items-center justify-center w-9 h-9 rounded-xl border shrink-0 ${
                                                    index === 0
                                                        ? 'border-plex/40 bg-plex/15 text-plex'
                                                        : 'border-white/10 bg-white/5 text-muted'
                                                }`}>
                                                    <Icon className="w-4 h-4" />
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-bold text-text truncate">
                                                                {formatLabel(key)}
                                                            </p>
                                                            <p className="text-[11px] text-muted mt-0.5 line-clamp-2">
                                                                {tAchievements(meta.tipKey)}
                                                                {rawStat != null ? (
                                                                    <span className="text-text/70"> · {tAchievements('xp.statCount', { count: rawStat.toLocaleString() })}</span>
                                                                ) : null}
                                                            </p>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <p className="text-sm font-black font-mono text-text tabular-nums">
                                                                +{value.toLocaleString()}
                                                            </p>
                                                            <p className="text-[10px] font-semibold text-plex tabular-nums mt-0.5">
                                                                {pct}%
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="mt-2.5 h-2 rounded-full bg-black/45 border border-white/5 overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${
                                                                index === 0 ? 'bg-plex' : 'bg-white/35'
                                                            }`}
                                                            style={{ width: `${barPct}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {!rows.length && (
                                    <p className="text-sm text-muted py-6 text-center border border-dashed border-white/10 rounded-xl">
                                        {tAchievements('xp.empty')}
                                    </p>
                                )}
                            </div>

                            {!!zeroRows.length && (
                                <details className="mt-4 group">
                                    <summary className="cursor-pointer text-xs font-semibold text-muted hover:text-text list-none flex items-center gap-2">
                                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/25 group-open:bg-plex" />
                                        {tAchievements('xp.zeroSources', { count: zeroRows.length })}
                                    </summary>
                                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                        {zeroRows.map(([key]) => (
                                            <div key={key} className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/15 px-3 py-2 text-xs">
                                                <span className="text-muted truncate">{formatLabel(key)}</span>
                                                <span className="font-mono text-muted/70">+0</span>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            )}
                        </div>

                        {/* Closest unlocks */}
                        {Array.isArray(nextUnlocks) && nextUnlocks.length > 0 && (
                            <div>
                                <h4 className="text-[10px] uppercase tracking-[0.22em] text-muted font-bold mb-3 flex items-center gap-2">
                                    <Target className="w-3.5 h-3.5 text-plex" />
                                    {tAchievements('xp.nextGoals')}
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    {nextUnlocks.slice(0, 3).map((badge: any) => (
                                        <div key={badge.id} className="rounded-xl border border-white/8 bg-black/25 px-3 py-2.5">
                                            <div className="flex items-start gap-2">
                                                <span className="text-lg leading-none">{badge.icon || '🏅'}</span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-bold truncate">{badge.name}</p>
                                                    <div className="mt-2 h-1.5 rounded-full bg-black/40 overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full bg-plex/80"
                                                            style={{ width: `${Math.min(100, Number(badge.progressPct) || 0)}%` }}
                                                        />
                                                    </div>
                                                    <p className="mt-1 text-[10px] text-muted font-mono tabular-nums">
                                                        {badge.progress ?? 0} / {badge.threshold ?? 0}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <p className="text-[11px] text-muted/80 leading-relaxed border-t border-white/5 pt-4 flex items-start gap-2">
                            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-plex/70" />
                            {tAchievements('xp.footnote')}
                        </p>
                    </div>
                </div>
            </div>
        </ModalPortal>
    );
};

export const AchievementsDashboard: React.FC<{ sessionInfo?: any }> = ({ sessionInfo = null }) => {
    const [data, setData] = useState<any>(null);
    const [board, setBoard] = useState<any[]>([]);
    const [boardPage, setBoardPage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [category, setCategory] = useState('all');
    const [showEarnedOnly, setShowEarnedOnly] = useState(false);
    const [breakdownOpen, setBreakdownOpen] = useState(false);
    const [optOutBusy, setOptOutBusy] = useState(false);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const sessionThumb = useMemo(() => {
        const session = sessionInfo?.session || {};
        return session.thumb
            || sessionInfo?.account?.thumb
            || (session.isAdmin ? sessionInfo?.adminThumb : null)
            || null;
    }, [sessionInfo]);

    const avatarForEntry = (entry: any) => {
        const thumb = entry?.thumb || (entry?.isMe ? sessionThumb : null);
        return resolveLeaderboardAvatar(thumb, 72, 72);
    };

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const mePromise = apiFetch('/api/achievements/me');
            const lbPromise = apiFetch(`/api/achievements/leaderboard?limit=${LEADERBOARD_FETCH_LIMIT}`).catch(() => null);

            const me = await mePromise;
            setData(me);
            setLoading(false);

            const newly = Array.isArray(me?.newlyEarnedIds) ? me.newlyEarnedIds : [];
            if (newly.length === 1) {
                const badge = (me.earned || me.badges || []).find((b: any) => b.id === newly[0]);
                setToasts((prev) => pushToast(prev, tAchievements('toast.unlockedOne', { name: badge?.name || newly[0] }), 'success'));
            } else if (newly.length > 1) {
                setToasts((prev) => pushToast(prev, tAchievements('toast.unlockedMany', { count: newly.length }), 'success'));
            }
            if (newly.length) {
                void apiFetch('/api/achievements/me/ack-unlocks', {
                    method: 'POST',
                    body: JSON.stringify({ ids: newly }),
                }).catch(() => null);
            }

            if (me?.leaderboardEnabled) {
                const lb = await lbPromise;
                setBoard(Array.isArray(lb?.entries) ? lb.entries : []);
                setBoardPage(0);
            } else {
                setBoard([]);
                setBoardPage(0);
            }
        } catch (e: any) {
            setError(e?.message || tAchievements('page.error'));
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const categories = data?.categories || [];
    const badges = useMemo(() => {
        let list = Array.isArray(data?.badges) ? data.badges : [];
        if (category !== 'all') list = list.filter((b: any) => b.category === category);
        if (showEarnedOnly) list = list.filter((b: any) => b.earned);
        return list;
    }, [data, category, showEarnedOnly]);

    const boardPageCount = Math.max(1, Math.ceil(board.length / LEADERBOARD_PAGE_SIZE));
    const safeBoardPage = Math.min(boardPage, boardPageCount - 1);
    const pageEntries = useMemo(
        () => board.slice(
            safeBoardPage * LEADERBOARD_PAGE_SIZE,
            safeBoardPage * LEADERBOARD_PAGE_SIZE + LEADERBOARD_PAGE_SIZE,
        ),
        [board, safeBoardPage],
    );

    const toggleOptOut = async () => {
        if (!data) return;
        setOptOutBusy(true);
        try {
            const next = !data.leaderboardOptOut;
            await apiFetch('/api/achievements/me/opt-out', {
                method: 'POST',
                body: JSON.stringify({ optOut: next }),
            });
            await load();
        } catch {
            /* ignore */
        } finally {
            setOptOutBusy(false);
        }
    };

    if (loading) {
        return (
            <div className="w-full py-10 text-center text-muted text-sm">
                {tAchievements('page.loading')}
            </div>
        );
    }

    if (error) {
        return (
            <div className="w-full py-10 text-center text-red-300 text-sm">
                {error}
            </div>
        );
    }

    const lp = data?.levelProgress || {};

    return (
        <div className="w-full space-y-6 animate-fade-in pb-8">
            <ToastContainer toasts={toasts} setToasts={setToasts} />
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-plex font-bold mb-1">{tAchievements('page.eyebrow')}</p>
                    <h1 className="text-3xl font-black text-text flex items-center gap-2">
                        <Trophy className="w-8 h-8 text-plex" /> {tAchievements('page.title')}
                    </h1>
                    <p className="text-sm text-muted mt-1">
                        {tAchievements('page.badgesCount', {
                            earned: data?.earnedCount || 0,
                            total: data?.totalBadges || 0,
                            level: data?.level || 1,
                        })}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setBreakdownOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-white/5 text-sm font-semibold hover:border-plex/40"
                >
                    <Sparkles className="w-4 h-4 text-plex" /> {tAchievements('page.xpBreakdown')}
                </button>
            </div>

            <div className="glass-card p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-xs text-muted uppercase tracking-widest font-bold">
                            {tAchievements('page.level', { level: lp.level || data?.level })}
                        </p>
                        <p className="text-2xl font-black text-text font-mono">{(data?.xp || 0).toLocaleString()} XP</p>
                    </div>
                    <Medal className="w-10 h-10 text-plex opacity-80" />
                </div>
                <div className="h-2.5 rounded-full bg-black/40 overflow-hidden border border-white/5">
                    <div className="h-full bg-plex rounded-full transition-all" style={{ width: `${lp.progressPct || 0}%` }} />
                </div>
                <p className="text-[11px] text-muted font-mono">
                    {tAchievements('page.toNext', { into: lp.xpIntoLevel || 0, need: lp.xpForNextLevel || 0 })}
                </p>
            </div>

            {Array.isArray(data?.nextUnlocks) && data.nextUnlocks.length > 0 && (
                <div className="glass-card p-5 space-y-3">
                    <h2 className="text-sm font-bold text-text uppercase tracking-widest flex items-center gap-2">
                        <Target className="w-4 h-4 text-plex" />
                        {tAchievements('page.nextUnlocks')}
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {data.nextUnlocks.map((badge: any) => (
                            <div key={badge.id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 min-w-0">
                                <div className="flex items-start gap-2">
                                    <span className="text-xl leading-none">{badge.icon || '🏅'}</span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold truncate">{badge.name}</p>
                                        <p className="text-[11px] text-muted line-clamp-2 mt-0.5">{badge.description}</p>
                                        <div className="mt-2 h-1.5 rounded-full bg-black/40 overflow-hidden">
                                            <div className="h-full rounded-full bg-plex" style={{ width: `${Math.min(100, Number(badge.progressPct) || 0)}%` }} />
                                        </div>
                                        <p className="mt-1 text-[10px] text-muted font-mono">
                                            {badge.progress ?? 0} / {badge.threshold ?? 0}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {data?.leaderboardEnabled && (
                <div className="glass-card p-5 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-lg font-bold text-text">{tAchievements('page.leaderboard')}</h2>
                        <button
                            type="button"
                            disabled={optOutBusy}
                            onClick={toggleOptOut}
                            className="text-xs font-semibold text-muted hover:text-text"
                        >
                            {data.leaderboardOptOut ? tAchievements('page.showMe') : tAchievements('page.hideMe')}
                        </button>
                    </div>
                    {!board.length ? (
                        <p className="text-sm text-muted">{tAchievements('page.noRankings')}</p>
                    ) : (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                {pageEntries.map((entry) => (
                                    <div
                                        key={`${entry.rank}-${entry.username}`}
                                        className={`rounded-xl px-3 py-2.5 border min-w-0 ${
                                            entry.isMe ? 'border-plex/50 bg-plex/10' : 'border-white/5 bg-black/20'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <img
                                                src={avatarForEntry(entry)}
                                                alt=""
                                                className={`w-10 h-10 rounded-full object-cover bg-black/40 shrink-0 border ${
                                                    entry.isMe ? 'border-plex/60' : 'border-white/10'
                                                }`}
                                                onError={(e) => {
                                                    const img = e.target as HTMLImageElement;
                                                    if (entry.isMe && sessionThumb && !img.dataset.fallback) {
                                                        img.dataset.fallback = '1';
                                                        img.src = resolveLeaderboardAvatar(sessionThumb, 72, 72);
                                                        return;
                                                    }
                                                    img.src = logoUrl();
                                                }}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className="font-mono font-bold text-plex text-sm">#{entry.rank}</p>
                                                <p className="text-sm font-bold truncate mt-0.5">
                                                    {entry.username}{entry.isMe ? ' (you)' : ''}
                                                </p>
                                                <p className="text-[10px] text-muted font-mono mt-1 leading-snug truncate">
                                                    Lv {entry.level} · {Number(entry.xp).toLocaleString()} XP
                                                </p>
                                                <p className="text-[10px] text-muted font-mono truncate">
                                                    {entry.earnedCount} badges
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {board.length > LEADERBOARD_PAGE_SIZE && (
                                <div className="flex items-center justify-between gap-3 pt-1">
                                    <button
                                        type="button"
                                        disabled={safeBoardPage <= 0}
                                        onClick={() => setBoardPage((p) => Math.max(0, p - 1))}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted disabled:opacity-40 hover:text-text hover:border-plex/40"
                                    >
                                        <ChevronLeft className="w-3.5 h-3.5" />
                                        {tAchievements('page.prev')}
                                    </button>
                                    <span className="text-xs text-muted font-semibold">
                                        {tAchievements('page.of', {
                                            page: safeBoardPage + 1,
                                            total: boardPageCount,
                                        })}
                                    </span>
                                    <button
                                        type="button"
                                        disabled={safeBoardPage >= boardPageCount - 1}
                                        onClick={() => setBoardPage((p) => Math.min(boardPageCount - 1, p + 1))}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted disabled:opacity-40 hover:text-text hover:border-plex/40"
                                    >
                                        {tAchievements('page.next')}
                                        <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div className="flex flex-wrap gap-2 items-center">
                <button
                    type="button"
                    onClick={() => setCategory('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${category === 'all' ? 'border-plex text-plex bg-plex/10' : 'border-border text-muted'}`}
                >
                    {tAchievements('page.all')}
                </button>
                {categories.map((cat: any) => (
                    <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategory(cat.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${category === cat.id ? 'border-plex text-plex bg-plex/10' : 'border-border text-muted'}`}
                    >
                        {cat.label}
                    </button>
                ))}
                <label className="ml-auto flex items-center gap-2 text-xs text-muted">
                    <input type="checkbox" checked={showEarnedOnly} onChange={(e) => setShowEarnedOnly(e.target.checked)} />
                    {tAchievements('page.earnedOnly')}
                </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {badges.map((badge: any) => (
                    <BadgeTile key={badge.id} badge={badge} />
                ))}
            </div>

            <XpBreakdownModal
                open={breakdownOpen}
                onClose={() => setBreakdownOpen(false)}
                breakdown={data?.breakdown}
                stats={data?.stats}
                xp={data?.xp}
                levelProgress={lp}
                earnedCount={data?.earnedCount}
                totalBadges={data?.totalBadges}
                nextUnlocks={data?.nextUnlocks}
            />
        </div>
    );
};

export const AchievementsHomeWidget: React.FC<{
    summary: any;
    onOpen?: () => void;
}> = ({ summary, onOpen }) => {
    if (!summary) return null;
    const lp = summary.levelProgress || {};
    const recent = (summary.recentEarned || summary.earned?.slice?.(0, 6) || []) as any[];
    const next = (Array.isArray(summary.nextUnlocks) ? summary.nextUnlocks.slice(0, 2) : []) as any[];
    return (
        <button
            type="button"
            onClick={onOpen}
            className="glass-card p-4 md:p-5 shadow-xl w-full text-left hover:border-plex/40 transition-colors border border-transparent"
        >
            <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                    <p className="text-[10px] uppercase tracking-[0.25em] text-plex font-bold">{tAchievements('home.eyebrow')}</p>
                    <p className="text-xl font-black text-text mt-1">{tAchievements('page.level', { level: summary.level || 1 })}</p>
                    <p className="text-xs text-muted font-mono mt-0.5">
                        {(summary.xp || 0).toLocaleString()} XP · {summary.earnedCount || 0}/{summary.totalBadges || 0} badges
                    </p>
                </div>
                <Trophy className="w-7 h-7 text-plex" />
            </div>
            <div className="h-2 rounded-full bg-black/40 overflow-hidden mb-3">
                <div className="h-full bg-plex rounded-full" style={{ width: `${lp.progressPct || 0}%` }} />
            </div>
            {next.length > 0 && (
                <div className="mb-3 space-y-1.5">
                    <p className="text-[10px] uppercase tracking-widest text-muted font-bold">{tAchievements('home.next')}</p>
                    {next.map((badge) => (
                        <div key={badge.id} className="flex items-center gap-2 min-w-0">
                            <span className="text-base leading-none">{badge.icon || '🏅'}</span>
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-semibold truncate">{badge.name}</p>
                                <div className="mt-0.5 h-1 rounded-full bg-black/40 overflow-hidden">
                                    <div className="h-full bg-plex/80 rounded-full" style={{ width: `${Math.min(100, Number(badge.progressPct) || 0)}%` }} />
                                </div>
                            </div>
                            <span className="text-[10px] text-muted font-mono shrink-0">{badge.progress ?? 0}/{badge.threshold ?? 0}</span>
                        </div>
                    ))}
                </div>
            )}
            <div className="flex flex-wrap gap-1.5">
                {recent.map((b) => (
                    <span key={b.id} className="w-8 h-8 rounded-lg border border-white/10 bg-black/30 flex items-center justify-center text-base" title={b.name}>
                        {b.icon}
                    </span>
                ))}
                {!recent.length && <span className="text-xs text-muted">{tAchievements('home.empty')}</span>}
            </div>
        </button>
    );
};
