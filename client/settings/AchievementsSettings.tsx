import React, { useEffect, useMemo, useState } from 'react';
import { CustomSelect, SettingsToggleRow } from '../shared/ui';
import { SettingHint } from './SettingHint';
import { apiFetch } from '../shared/api';

export type AchievementsXpWeights = Record<string, number>;

type CatalogBadge = {
    id: string;
    name: string;
    icon?: string;
    category?: string;
};

type Props = {
    achievementsEnabled: boolean;
    setAchievementsEnabled: (v: boolean) => void;
    achievementsLeaderboardEnabled: boolean;
    setAchievementsLeaderboardEnabled: (v: boolean) => void;
    achievementsHomeWidgetEnabled: boolean;
    setAchievementsHomeWidgetEnabled: (v: boolean) => void;
    achievementsShowOnProfile: boolean;
    setAchievementsShowOnProfile: (v: boolean) => void;
    watchHistorySource: 'plex' | 'tautulli';
    setWatchHistorySource: (v: 'plex' | 'tautulli') => void;
    tautulliConfigured?: boolean;
    achievementsXpWeights: AchievementsXpWeights;
    setAchievementsXpWeights: (v: AchievementsXpWeights) => void;
    achievementsDisabledBadgeIds: string[];
    setAchievementsDisabledBadgeIds: (v: string[]) => void;
};

export const AchievementsSettings: React.FC<Props> = ({
    achievementsEnabled,
    setAchievementsEnabled,
    achievementsLeaderboardEnabled,
    setAchievementsLeaderboardEnabled,
    achievementsHomeWidgetEnabled,
    setAchievementsHomeWidgetEnabled,
    achievementsShowOnProfile,
    setAchievementsShowOnProfile,
    watchHistorySource,
    setWatchHistorySource,
    tautulliConfigured = false,
    achievementsXpWeights,
    setAchievementsXpWeights,
    achievementsDisabledBadgeIds,
    setAchievementsDisabledBadgeIds,
}) => {
    const [weightLabels, setWeightLabels] = useState<Record<string, string>>({});
    const [defaultWeights, setDefaultWeights] = useState<AchievementsXpWeights>({});
    const [categories, setCategories] = useState<Array<{ id: string; label: string }>>([]);
    const [catalog, setCatalog] = useState<CatalogBadge[]>([]);
    const [badgeQuery, setBadgeQuery] = useState('');
    const [badgeCategory, setBadgeCategory] = useState('all');
    const [catalogLoading, setCatalogLoading] = useState(false);

    useEffect(() => {
        if (!achievementsEnabled) return;
        let cancelled = false;
        setCatalogLoading(true);
        apiFetch('/api/achievements/meta?catalog=1')
            .then((data) => {
                if (cancelled || !data) return;
                if (data.xpWeightLabels && typeof data.xpWeightLabels === 'object') {
                    setWeightLabels(data.xpWeightLabels);
                }
                if (data.defaultXpWeights && typeof data.defaultXpWeights === 'object') {
                    setDefaultWeights(data.defaultXpWeights);
                }
                if (Array.isArray(data.categories)) {
                    setCategories(data.categories.map((c: any) => ({ id: String(c.id), label: String(c.label || c.id) })));
                }
                if (Array.isArray(data.catalog)) {
                    setCatalog(data.catalog.map((b: any) => ({
                        id: String(b.id),
                        name: String(b.name || b.id),
                        icon: b.icon ? String(b.icon) : undefined,
                        category: b.category ? String(b.category) : undefined,
                    })));
                }
            })
            .catch(() => {})
            .finally(() => {
                if (!cancelled) setCatalogLoading(false);
            });
        return () => { cancelled = true; };
    }, [achievementsEnabled]);

    const effectiveWeights = useMemo(
        () => ({ ...defaultWeights, ...(achievementsXpWeights || {}) }),
        [defaultWeights, achievementsXpWeights],
    );

    const weightKeys = useMemo(() => {
        const keys = Object.keys(defaultWeights);
        if (keys.length) return keys;
        const current = Object.keys(achievementsXpWeights || {});
        return current.length ? current : [
            'uniqueMovies', 'uniqueShows', 'uniqueMusic', 'moviePlays', 'episodePlays',
            'trackPlays', 'totalPlays', 'activeDays', 'longestStreak', 'weekendPlays', 'hoursWatched',
        ];
    }, [defaultWeights, achievementsXpWeights]);

    const disabledSet = useMemo(() => new Set(achievementsDisabledBadgeIds.map(String)), [achievementsDisabledBadgeIds]);

    const filteredBadges = useMemo(() => {
        const q = badgeQuery.trim().toLowerCase();
        return catalog.filter((b) => {
            if (badgeCategory !== 'all' && b.category !== badgeCategory) return false;
            if (!q) return true;
            return b.name.toLowerCase().includes(q) || b.id.toLowerCase().includes(q);
        });
    }, [catalog, badgeQuery, badgeCategory]);

    const setWeight = (key: string, raw: string) => {
        const n = Number(raw);
        const value = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
        setAchievementsXpWeights({ ...effectiveWeights, [key]: value });
    };

    const toggleBadgeDisabled = (id: string) => {
        const next = new Set(disabledSet);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setAchievementsDisabledBadgeIds([...next]);
    };

    return (
        <section id="settings-section-achievements" className="space-y-1 scroll-mt-24">
            <div className="mb-2">
                <h3 className="text-lg font-bold text-text">Achievements & XP</h3>
                <p className="text-sm text-muted mt-1">
                    Optional gamification with levels, badges, profile rack, and leaderboard. Off by default.
                </p>
            </div>
            <SettingsToggleRow
                title="Enable Achievements"
                description="Adds Achievements to navigation and tracks XP / badges from watch history."
                checked={achievementsEnabled}
                onChange={setAchievementsEnabled}
            />
            <div className={achievementsEnabled ? '' : 'opacity-50 pointer-events-none'}>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 py-4 border-b border-border/60">
                    <div className="min-w-0 sm:pr-6">
                        <p className="text-sm font-semibold text-text">Watch history source</p>
                        <SettingHint>
                            Used for achievements XP/badges and Home personal wrap-up counts.
                            Plex uses session history on this server; Tautulli usually retains fuller play history when configured.
                        </SettingHint>
                    </div>
                    <div className="w-full sm:w-56 shrink-0">
                        <CustomSelect
                            value={watchHistorySource}
                            onChange={(v) => setWatchHistorySource(v === 'tautulli' ? 'tautulli' : 'plex')}
                            options={[
                                { label: 'Plex (session history)', value: 'plex' },
                                { label: 'Tautulli', value: 'tautulli' },
                            ]}
                            compact
                            className="w-full"
                        />
                        {watchHistorySource === 'tautulli' && !tautulliConfigured && (
                            <p className="text-[11px] text-amber-300/90 mt-1.5">
                                Tautulli isn’t configured yet — add URL + API key under Integrations, or the portal will keep using Plex.
                            </p>
                        )}
                    </div>
                </div>
                <SettingsToggleRow
                    title="Show leaderboard"
                    description="Rank members by XP. Users can hide themselves from the board."
                    checked={achievementsLeaderboardEnabled}
                    onChange={setAchievementsLeaderboardEnabled}
                />
                <SettingsToggleRow
                    title="Home dashboard widget"
                    description="Show level, XP bar, and recent badges on Home."
                    checked={achievementsHomeWidgetEnabled}
                    onChange={setAchievementsHomeWidgetEnabled}
                />
                <SettingsToggleRow
                    title="Show badges on profile"
                    description="Display earned badges in the sidebar profile panel."
                    checked={achievementsShowOnProfile}
                    onChange={setAchievementsShowOnProfile}
                />

                <div className="py-4 border-b border-border/60 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-text">XP weights</p>
                            <SettingHint>
                                Points awarded per stat. Total plays defaults to 0 because it double-counts movie/episode/track plays.
                            </SettingHint>
                        </div>
                        {Object.keys(defaultWeights).length > 0 && (
                            <button
                                type="button"
                                className="text-xs font-semibold text-plex hover:underline shrink-0"
                                onClick={() => setAchievementsXpWeights({ ...defaultWeights })}
                            >
                                Reset to defaults
                            </button>
                        )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {weightKeys.map((key) => (
                            <label key={key} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/40 px-3 py-2">
                                <span className="text-xs text-text min-w-0 leading-snug">
                                    {weightLabels[key] || key}
                                </span>
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={1}
                                    className="w-16 shrink-0 p-1.5 rounded-md border border-border bg-background text-text text-sm text-right outline-none focus:border-plex"
                                    value={Number(effectiveWeights[key] ?? 0)}
                                    onChange={(e) => setWeight(key, e.target.value)}
                                />
                            </label>
                        ))}
                    </div>
                </div>

                <div className="py-4 space-y-3">
                    <div>
                        <p className="text-sm font-semibold text-text">Disable badges</p>
                        <SettingHint>
                            Hidden badges stay locked for everyone and won’t appear in progress or the hall of fame.
                            {disabledSet.size > 0 ? ` ${disabledSet.size} disabled.` : ''}
                        </SettingHint>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <input
                            type="search"
                            value={badgeQuery}
                            onChange={(e) => setBadgeQuery(e.target.value)}
                            placeholder="Search badges…"
                            className="flex-1 p-2.5 rounded-lg border border-border bg-background text-text text-sm outline-none focus:border-plex"
                        />
                        <div className="w-full sm:w-44 shrink-0">
                            <CustomSelect
                                value={badgeCategory}
                                onChange={setBadgeCategory}
                                options={[
                                    { label: 'All categories', value: 'all' },
                                    ...categories.map((c) => ({ label: c.label, value: c.id })),
                                ]}
                                compact
                                className="w-full"
                            />
                        </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/40">
                        {catalogLoading && (
                            <p className="p-3 text-xs text-muted">Loading badge catalog…</p>
                        )}
                        {!catalogLoading && filteredBadges.length === 0 && (
                            <p className="p-3 text-xs text-muted">No badges match.</p>
                        )}
                        {filteredBadges.slice(0, 200).map((badge) => {
                            const disabled = disabledSet.has(badge.id);
                            return (
                                <label
                                    key={badge.id}
                                    className="flex items-center gap-3 px-3 py-2 hover:bg-white/5 cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        checked={disabled}
                                        onChange={() => toggleBadgeDisabled(badge.id)}
                                        className="rounded border-border"
                                    />
                                    <span className="text-base w-6 text-center shrink-0">{badge.icon || '🏅'}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm text-text truncate">{badge.name}</span>
                                        <span className="block text-[10px] text-muted truncate">{badge.id}</span>
                                    </span>
                                    {disabled && (
                                        <span className="text-[10px] uppercase tracking-wide text-amber-300/90 shrink-0">Off</span>
                                    )}
                                </label>
                            );
                        })}
                        {filteredBadges.length > 200 && (
                            <p className="p-2 text-[11px] text-muted text-center">
                                Showing 200 of {filteredBadges.length} — refine search to see more.
                            </p>
                        )}
                    </div>
                    {disabledSet.size > 0 && (
                        <button
                            type="button"
                            className="text-xs font-semibold text-muted hover:text-text"
                            onClick={() => setAchievementsDisabledBadgeIds([])}
                        >
                            Clear all disabled badges
                        </button>
                    )}
                </div>
            </div>
        </section>
    );
};
