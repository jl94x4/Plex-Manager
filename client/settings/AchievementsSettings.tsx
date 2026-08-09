import React from 'react';
import { CustomSelect, SettingsToggleRow } from '../shared/ui';
import { SettingHint } from './SettingHint';

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
}) => (
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
                border={false}
            />
        </div>
    </section>
);
