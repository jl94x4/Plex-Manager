import React, { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { portalUrl } from '../shared/basePath';
import { useDiscoverI18n } from './i18n';
import { UnlockCelebration } from '../achievements/UnlockCelebration';

/** Light achievements teaser for Discover — next unlock / pinned goals linking to /achievements. */
export const DiscoverAchievementsTeaser: React.FC<{
    enabled?: boolean;
    navigate?: (path: string) => void;
}> = ({ enabled = true, navigate }) => {
    const { t } = useDiscoverI18n();
    const [next, setNext] = useState<any>(null);
    const [pinned, setPinned] = useState(false);
    const [celebrationBadges, setCelebrationBadges] = useState<any[]>([]);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        let idleId: number | null = null;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        const load = () => {
            apiFetch('/api/achievements/me?view=summary')
                .then((data) => {
                    if (cancelled || !data?.enabled) {
                        if (!cancelled) {
                            setNext(null);
                            setPinned(false);
                        }
                        return;
                    }
                    const pinIds = Array.isArray(data.pinnedBadgeIds) ? data.pinnedBadgeIds.map(String) : [];
                    const unlocks = Array.isArray(data.nextUnlocks) ? data.nextUnlocks : [];
                    const earned = Array.isArray(data.earned) ? data.earned : [];
                    const pinnedBadge = pinIds
                        .map((id: string) => unlocks.find((b: any) => String(b?.id) === id)
                            || earned.find((b: any) => String(b?.id) === id))
                        .find(Boolean);
                    const unlock = pinnedBadge || unlocks[0] || null;
                    setNext(unlock || null);
                    setPinned(!!pinnedBadge);

                    const newly = Array.isArray(data.newlyEarnedIds) ? data.newlyEarnedIds : [];
                    if (newly.length && data.notifyOnUnlock !== false) {
                        const unlocked = newly.map((id: string) => (
                            (data.recentEarned || data.earned || []).find((b: any) => b.id === id)
                            || { id, name: id, icon: '🏅' }
                        ));
                        setCelebrationBadges(unlocked);
                    }
                    if (newly.length) {
                        void apiFetch('/api/achievements/me/ack-unlocks', {
                            method: 'POST',
                            body: JSON.stringify({ ids: newly }),
                        }).catch(() => null);
                    }
                })
                .catch(() => {
                    if (!cancelled) {
                        setNext(null);
                        setPinned(false);
                    }
                });
        };

        if (typeof window !== 'undefined' && typeof (window as any).requestIdleCallback === 'function') {
            idleId = (window as any).requestIdleCallback(load, { timeout: 5000 });
        } else {
            timeoutId = setTimeout(load, 2800);
        }

        return () => {
            cancelled = true;
            if (idleId != null && typeof (window as any).cancelIdleCallback === 'function') {
                (window as any).cancelIdleCallback(idleId);
            }
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [enabled]);

    if (!enabled || (!next && !celebrationBadges.length)) return null;

    const go = () => {
        if (navigate) navigate('/achievements');
        else window.location.assign(portalUrl('/achievements'));
    };

    return (
        <>
            {next && (
                <div className="px-4 sm:px-6 -mt-2 mb-2 flex justify-center">
                    <button
                        type="button"
                        onClick={go}
                        className="inline-flex items-center gap-2 max-w-full rounded-full border border-white/10 bg-black/30 backdrop-blur px-3 py-1.5 text-xs font-semibold text-text hover:border-plex/40 transition-colors"
                    >
                        <Trophy className="w-3.5 h-3.5 text-plex shrink-0" />
                        <span className="truncate">
                            {t(pinned ? 'hero.achievementsPinned' : 'hero.achievementsNext', {
                                name: next.name || t('hero.achievementFallbackBadge'),
                                progress: next.earned
                                    ? t('hero.achievementProgressEarned')
                                    : `${next.progress ?? 0}/${next.threshold ?? 0}`,
                            })}
                        </span>
                    </button>
                </div>
            )}
            {celebrationBadges.length > 0 && (
                <UnlockCelebration
                    badges={celebrationBadges}
                    onClose={() => setCelebrationBadges([])}
                />
            )}
        </>
    );
};
