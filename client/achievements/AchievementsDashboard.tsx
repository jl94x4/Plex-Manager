import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Award, ChevronRight, Lock, Sparkles, Trophy, X, Info, Medal,
} from 'lucide-react';
import { apiFetch } from '../shared/api';
import { ModalPortal } from '../shared/ModalPortal';
import { ToastContainer, pushToast, type ToastMessage } from '../shared/toast';
import { tAchievements } from './i18n';

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
    xp?: number;
    levelProgress?: any;
}> = ({ open, onClose, breakdown, xp, levelProgress }) => {
    if (!open) return null;
    const rows = Object.entries(breakdown || {}).sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0));
    return (
        <ModalPortal open={open}>
            <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
                <button type="button" className="absolute inset-0 bg-black/70" aria-label="Close" onClick={onClose} />
                <div className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-2xl p-5">
                    <div className="flex items-start justify-between gap-3 mb-4">
                        <div>
                            <h3 className="text-lg font-black text-text flex items-center gap-2">
                                <Info className="w-5 h-5 text-plex" /> {tAchievements('page.xpBreakdown')}
                            </h3>
                            <p className="text-xs text-muted mt-1">
                                {tAchievements('page.level', { level: levelProgress?.level ?? 1 })} · {(xp || 0).toLocaleString()} XP
                            </p>
                        </div>
                        <button type="button" onClick={onClose} className="p-2 rounded-lg text-muted hover:bg-white/5">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto custom-scrollbar">
                        {rows.map(([key, value]) => (
                            <div key={key} className="flex items-center justify-between text-sm border-b border-white/5 py-2">
                                <span className="text-muted capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                                <span className="font-mono text-text">+{Number(value).toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </ModalPortal>
    );
};

export const AchievementsDashboard: React.FC = () => {
    const [data, setData] = useState<any>(null);
    const [board, setBoard] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [category, setCategory] = useState('all');
    const [showEarnedOnly, setShowEarnedOnly] = useState(false);
    const [breakdownOpen, setBreakdownOpen] = useState(false);
    const [optOutBusy, setOptOutBusy] = useState(false);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const me = await apiFetch('/api/achievements/me');
            setData(me);
            const newly = Array.isArray(me?.newlyEarnedIds) ? me.newlyEarnedIds : [];
            if (newly.length === 1) {
                const badge = (me.earned || []).find((b: any) => b.id === newly[0]);
                setToasts((prev) => pushToast(prev, tAchievements('toast.unlockedOne', { name: badge?.name || newly[0] }), 'success'));
            } else if (newly.length > 1) {
                setToasts((prev) => pushToast(prev, tAchievements('toast.unlockedMany', { count: newly.length }), 'success'));
            }
            if (me?.leaderboardEnabled) {
                const lb = await apiFetch('/api/achievements/leaderboard?limit=25');
                setBoard(Array.isArray(lb?.entries) ? lb.entries : []);
            } else {
                setBoard([]);
            }
        } catch (e: any) {
            setError(e?.message || tAchievements('page.error'));
        } finally {
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
            <div className="w-full max-w-5xl mx-auto py-10 text-center text-muted text-sm">
                {tAchievements('page.loading')}
            </div>
        );
    }

    if (error) {
        return (
            <div className="w-full max-w-5xl mx-auto py-10 text-center text-red-300 text-sm">
                {error}
            </div>
        );
    }

    const lp = data?.levelProgress || {};

    return (
        <div className="w-full max-w-5xl mx-auto space-y-6 animate-fade-in pb-8">
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
                        <div className="space-y-1.5">
                            {board.map((entry) => (
                                <div
                                    key={`${entry.rank}-${entry.username}`}
                                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border ${
                                        entry.isMe ? 'border-plex/50 bg-plex/10' : 'border-white/5 bg-black/20'
                                    }`}
                                >
                                    <span className="w-8 text-center font-mono font-bold text-plex">#{entry.rank}</span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold truncate">{entry.username}{entry.isMe ? ' (you)' : ''}</p>
                                        <p className="text-[11px] text-muted font-mono">
                                            Lv {entry.level} · {Number(entry.xp).toLocaleString()} XP · {entry.earnedCount} badges
                                        </p>
                                    </div>
                                </div>
                            ))}
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
                xp={data?.xp}
                levelProgress={lp}
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
