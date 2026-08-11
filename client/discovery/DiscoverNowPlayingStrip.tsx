import React from 'react';
import { Pause, Play } from 'lucide-react';
import type { NowPlayingSession } from '../shared/useNowPlaying';
import { useDiscoverI18n } from './i18n';

type Props = {
    session: NowPlayingSession;
    onNavigate?: (path: string) => void;
};

const pad = (n: number) => String(n).padStart(2, '0');

export const DiscoverNowPlayingStrip: React.FC<Props> = ({ session, onNavigate }) => {
    const { t } = useDiscoverI18n();
    const hasTmdb = Number.isFinite(Number(session.tmdbId)) && Number(session.tmdbId) > 0;
    const basePath = hasTmdb
        ? `/discovery/${session.mediaType}/${session.tmdbId}`
        : null;
    const season = Number(session.season);
    const episode = Number(session.episode);
    const hasSeason = session.mediaType === 'tv' && Number.isFinite(season) && season > 0;
    const hasEpisode = hasSeason && Number.isFinite(episode) && episode > 0;
    const paused = String(session.state || '').toLowerCase() === 'paused';
    const progress = Math.min(100, Math.max(0, Number(session.progress) || 0));

    const goShow = (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (basePath && onNavigate) onNavigate(basePath);
    };

    const goSeason = (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (basePath && hasSeason && onNavigate) onNavigate(`${basePath}?season=${season}`);
    };

    const goEpisode = (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (basePath && hasSeason && onNavigate) {
            const qs = new URLSearchParams({ season: String(season) });
            if (hasEpisode) qs.set('episode', String(episode));
            onNavigate(`${basePath}?${qs.toString()}`);
        }
    };

    const linkClass = basePath && onNavigate
        ? 'font-semibold text-white hover:underline underline-offset-2 decoration-white/70'
        : 'font-semibold text-white';

    return (
        <div className="absolute bottom-0 inset-x-0 z-20 rounded-b-2xl overflow-hidden">
            <div className="relative bg-emerald-600/95 text-white">
                <div
                    className="absolute left-0 top-0 bottom-0 bg-emerald-400/50 transition-[width] duration-500"
                    style={{ width: `${progress}%` }}
                    aria-hidden
                />
                <div className="relative flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-[11px] sm:text-xs min-h-[2rem]">
                    <span className="inline-flex items-center gap-1 shrink-0 font-bold uppercase tracking-wider text-emerald-50/95">
                        {paused ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current" />}
                        {paused ? t('nowPlaying.paused') : t('nowPlaying.watching')}
                    </span>
                    <span className="text-emerald-100/70 shrink-0">·</span>
                    <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <button type="button" className={`${linkClass} truncate max-w-full text-left`} onClick={goShow}>
                            {session.title}
                        </button>
                        {hasSeason && (
                            <>
                                <span className="text-emerald-100/70">·</span>
                                <button type="button" className={linkClass} onClick={goSeason}>
                                    {t('nowPlaying.season', { number: season })}
                                </button>
                            </>
                        )}
                        {hasEpisode && (
                            <>
                                <span className="text-emerald-100/70">·</span>
                                <button type="button" className={linkClass} onClick={goEpisode}>
                                    {t('nowPlaying.episode', { number: episode })}
                                    {session.episodeTitle ? (
                                        <span className="font-normal text-emerald-50/90">
                                            {` — ${session.episodeTitle}`}
                                        </span>
                                    ) : null}
                                </button>
                            </>
                        )}
                    </div>
                    {hasSeason && hasEpisode && (
                        <span className="hidden sm:inline shrink-0 font-mono text-emerald-50/90 tabular-nums">
                            {`S${pad(season)}E${pad(episode)}`}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DiscoverNowPlayingStrip;
