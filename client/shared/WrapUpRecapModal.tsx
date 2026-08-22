import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { ChevronLeft, ChevronRight, Clapperboard, Sparkles, Tv, X } from 'lucide-react';
import { useDiscoverI18n } from '../discovery/i18n';
import { formatWrapUpDelta, periodLabel, wrapUpPriorPeriodLabel } from './WrapUpCards';
import { lockBackgroundScroll } from './lockBackgroundScroll';

type Slide = {
    key: string;
    kicker: string;
    title: string;
    body?: string;
    extra?: string[];
};

export const WrapUpRecapModal: React.FC<{
    analytics: any;
    days: number | string;
    onClose: () => void;
    onShare?: () => void;
}> = ({ analytics, days, onClose, onShare }) => {
    const { t } = useDiscoverI18n();
    const [index, setIndex] = useState(0);

    useEffect(() => lockBackgroundScroll(), []);

    const slides = useMemo<Slide[]>(() => {
        const compare = analytics?.compare || {};
        const highlights = compare.highlights || {};
        const period = periodLabel(days, t);
        const prior = wrapUpPriorPeriodLabel(compare.previousPeriodDays || days, t);
        const delta = formatWrapUpDelta(compare.totalPlays, t);
        const list: Slide[] = [{
            key: 'intro',
            kicker: period,
            title: t('wrapUp.title'),
            body: delta
                ? t('wrapUp.vsPrior', { delta, period: prior })
                : `${analytics?.totalPlays || 0} ${t('wrapUp.totalStreams').toLowerCase()}`,
        }];

        if (delta || Number(analytics?.totalPlays) > 0) {
            list.push({
                key: 'streams',
                kicker: t('wrapUp.recapStreams'),
                title: String(analytics?.totalPlays || 0),
                body: delta ? t('wrapUp.vsPrior', { delta, period: prior }) : t('wrapUp.totalStreams'),
            });
        }

        if (analytics?.topBinge?.title) {
            list.push({
                key: 'binge',
                kicker: t('wrapUp.recapBinge'),
                title: analytics.topBinge.title,
                body: compare.swaps?.topBinge?.from?.title
                    ? t('wrapUp.wasTitle', { title: compare.swaps.topBinge.from.title })
                    : t('wrapUp.episodePlays', { count: analytics.topBinge.plays || 0 }),
            });
        }

        if (analytics?.topMovie?.title) {
            list.push({
                key: 'movie',
                kicker: t('wrapUp.recapMovie'),
                title: analytics.topMovie.title,
                body: compare.swaps?.topMovie?.from?.title
                    ? t('wrapUp.wasTitle', { title: compare.swaps.topMovie.from.title })
                    : t('wrapUp.plays', { count: analytics.topMovie.plays || 0 }),
            });
        }

        const extras = [
            Number(highlights.newTitles) > 0 ? t('wrapUp.newTitlesCount', { count: highlights.newTitles }) : '',
            highlights.newGenre ? t('wrapUp.newGenre', { genre: highlights.newGenre }) : '',
            highlights.first4k ? t('wrapUp.first4k') : '',
            highlights.longestNight
                ? t('wrapUp.longestNight', {
                    plays: highlights.longestNight.plays,
                    date: highlights.longestNight.date,
                })
                : '',
            highlights.dominantDay
                ? t('wrapUp.mostlyOnDay', {
                    day: highlights.dominantDay.day,
                    percent: highlights.dominantDay.percent,
                })
                : '',
        ].filter(Boolean);
        if (extras.length) {
            list.push({
                key: 'firsts',
                kicker: t('wrapUp.recapFirsts'),
                title: extras[0],
                extra: extras.slice(1),
            });
        }

        list.push({
            key: 'share',
            kicker: period,
            title: t('wrapUp.recapShare'),
            body: t('wrapUp.shareModalSubtitle'),
        });
        return list;
    }, [analytics, days, t]);

    useEffect(() => {
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
            if (event.key === 'ArrowRight') setIndex((value) => Math.min(slides.length - 1, value + 1));
            if (event.key === 'ArrowLeft') setIndex((value) => Math.max(0, value - 1));
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose, slides.length]);

    const safeIndex = Math.min(index, Math.max(0, slides.length - 1));
    const slide = slides[safeIndex];
    const isLast = safeIndex >= slides.length - 1;
    const Icon = slide?.key === 'movie' ? Clapperboard : slide?.key === 'binge' ? Tv : Sparkles;

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[350] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} />
            <div
                className="relative w-full max-w-lg max-h-[min(92dvh,calc(100dvh-4.5rem))] sm:max-h-[85vh] bg-gradient-to-b from-card to-background border border-border/80 rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-plex/0 via-plex to-plex/0 opacity-50" />
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute top-4 right-4 z-20 text-muted hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-full p-2"
                    aria-label="Close"
                >
                    <X className="w-4 h-4" />
                </button>
                <div className="flex-1 min-h-[22rem] flex flex-col items-center justify-center text-center px-8 py-12">
                    <Icon className="w-10 h-10 text-plex mb-4" />
                    <p className="text-[11px] uppercase tracking-[0.2em] font-black text-plex mb-3">{slide?.kicker}</p>
                    <h2 className="text-3xl md:text-4xl font-black text-white leading-tight mb-3">{slide?.title}</h2>
                    {slide?.body ? <p className="text-sm text-muted max-w-sm">{slide.body}</p> : null}
                    {slide?.extra?.map((line) => (
                        <p key={line} className="text-sm text-muted mt-2">{line}</p>
                    ))}
                </div>
                <div className="px-5 pb-5 pt-2 flex items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={() => setIndex((value) => Math.max(0, value - 1))}
                        disabled={safeIndex === 0}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium border border-white/10 text-text disabled:opacity-30"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        {t('wrapUp.recapBack')}
                    </button>
                    <div className="flex gap-1.5">
                        {slides.map((item, slideIndex) => (
                            <span
                                key={item.key}
                                className={`h-1.5 rounded-full ${slideIndex === safeIndex ? 'w-6 bg-plex' : 'w-1.5 bg-white/20'}`}
                            />
                        ))}
                    </div>
                    {isLast && onShare ? (
                        <button
                            type="button"
                            onClick={onShare}
                            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold bg-plex/20 border border-plex/40 text-plex"
                        >
                            {t('wrapUp.share')}
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => (isLast ? onClose() : setIndex((value) => Math.min(slides.length - 1, value + 1)))}
                            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold bg-plex/20 border border-plex/40 text-plex"
                        >
                            {isLast ? t('wrapUp.recapDone') : t('wrapUp.recapNext')}
                            {!isLast && <ChevronRight className="w-4 h-4" />}
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
};
