import React from 'react';
import { SettingsToggleRow } from '../shared/ui';

type Props = {
    achievementsEnabled: boolean;
    setAchievementsEnabled: (v: boolean) => void;
    achievementsLeaderboardEnabled: boolean;
    setAchievementsLeaderboardEnabled: (v: boolean) => void;
    achievementsHomeWidgetEnabled: boolean;
    setAchievementsHomeWidgetEnabled: (v: boolean) => void;
    achievementsShowOnProfile: boolean;
    setAchievementsShowOnProfile: (v: boolean) => void;
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
}) => (
    <section id="settings-section-achievements" className="space-y-1 scroll-mt-24">
        <div className="mb-2">
            <h3 className="text-lg font-bold text-text">Achievements & XP</h3>
            <p className="text-sm text-muted mt-1">
                Optional gamification with levels, 280+ badges, profile rack, and leaderboard. Off by default.
            </p>
        </div>
        <SettingsToggleRow
            title="Enable Achievements"
            description="Adds Achievements to navigation and tracks XP / badges from watch history."
            checked={achievementsEnabled}
            onChange={setAchievementsEnabled}
        />
        <div className={achievementsEnabled ? '' : 'opacity-50 pointer-events-none'}>
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
