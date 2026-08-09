import React, { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { portalUrl } from '../shared/basePath';
import { useDiscoverI18n } from './i18n';

/** Light achievements teaser for Discover — next unlock chip linking to /achievements. */
export const DiscoverAchievementsTeaser: React.FC<{
    enabled?: boolean;
    navigate?: (path: string) => void;
}> = ({ enabled = true, navigate }) => {
    const { t } = useDiscoverI18n();
    const [next, setNext] = useState<any>(null);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        let idleId: number | null = null;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        const load = () => {
            apiFetch('/api/achievements/me?view=summary')
                .then((data) => {
                    if (cancelled || !data?.enabled) {
                        if (!cancelled) setNext(null);
                        return;
                    }
                    const unlock = Array.isArray(data.nextUnlocks) ? data.nextUnlocks[0] : null;
                    setNext(unlock || null);
                })
                .catch(() => {
                    if (!cancelled) setNext(null);
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

    if (!enabled || !next) return null;

    const go = () => {
        if (navigate) navigate('/achievements');
        else window.location.assign(portalUrl('/achievements'));
    };

    return (
        <div className="px-4 sm:px-6 -mt-2 mb-2 flex justify-center">
            <button
                type="button"
                onClick={go}
                className="inline-flex items-center gap-2 max-w-full rounded-full border border-white/10 bg-black/30 backdrop-blur px-3 py-1.5 text-xs font-semibold text-text hover:border-plex/40 transition-colors"
            >
                <Trophy className="w-3.5 h-3.5 text-plex shrink-0" />
                <span className="truncate">
                    {t('hero.achievementsNext', {
                        name: next.name || 'badge',
                        progress: `${next.progress ?? 0}/${next.threshold ?? 0}`,
                    })}
                </span>
            </button>
        </div>
    );
};
