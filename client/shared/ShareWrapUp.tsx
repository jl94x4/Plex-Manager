import React, { useCallback, useRef, useState } from 'react';
import { X, Copy, Download, Share2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import { WrapUpCardGrid, periodLabel } from './WrapUpCards';
import { formatStreamingHour } from './format';
import { getPublicOrigin } from './basePath';
import { useDiscoverI18n } from '../discovery/i18n';

const EXPORT_WIDTH_PX = 1080;

const waitForExportImages = (root: HTMLElement) => Promise.all(
    Array.from(root.querySelectorAll('img')).map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise<void>((resolve) => {
            const done = () => resolve();
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
        });
    }),
);

export const buildWrapUpShareText = (analytics: any, days: number | string, serverName: string, username?: string) => {
    const period = periodLabel(days);
    const leaderboardRank = Number(analytics?.leaderboardRank);
    const hasRank = Number.isFinite(leaderboardRank) && leaderboardRank > 0;
    const rank = hasRank
        ? `#${leaderboardRank} of ${analytics.totalActiveUsers || '?'}`
        : 'Not ranked yet';
    const dayCounts = Object.values(analytics?.dayOfWeekCounts || {})
        .map((value) => Number(value) || 0)
        .filter((value) => Number.isFinite(value));
    const topDayStreams = dayCounts.length > 0 ? Math.max(...dayCounts) : 0;

    const lines = [
        `📊 ${serverName} — Personal Wrap-Up (${period})`,
        username ? `👤 ${username}` : '',
        '',
        `🏆 Server Rank: ${rank}`,
        `▶️ Total Streams: ${analytics.totalPlays || 0} (🎬 ${analytics.moviesCount || 0} · 📺 ${analytics.showsCount || 0}${analytics.musicCount ? ` · 🎵 ${analytics.musicCount}` : ''})`,
        `📺 Top Binge: ${analytics.topBinge?.title || '—'} (${analytics.topBinge?.plays || 0} eps)`,
        `🎬 Top Movie: ${analytics.topMovie?.title || '—'} (${analytics.topMovie?.plays || 0} plays)`,
        `🕐 Time of Day: ${analytics.timeOfDay || '—'} (peak ${formatStreamingHour(analytics.peakHour ?? analytics.avgHour)})`,
        `📅 Top Day: ${analytics.popularDay || '—'} (${topDayStreams} streams)`,
        `📚 Top Library: ${analytics.favoriteLibrary || '—'} (${analytics.topLibraries?.[0]?.plays || 0} plays)`,
        `🎭 Media Profile: ${analytics.mediaPreference || '—'}`,
        `🧭 Watch Style: ${analytics.watchStyle || '—'} (${analytics.uniqueTitles || 0} unique titles)`,
        `☕ Streaming Habit: ${analytics.streamingHabit || '—'} (${analytics.weekdayPlays || 0} weekday · ${analytics.weekendPlays || 0} weekend)`,
        '',
        `Shared from ${window.location.origin}`,
    ].filter(Boolean);
    return lines.join('\n');
};

type ShareWrapUpModalProps = {
    analytics: any;
    days: number | string;
    serverName: string;
    username?: string;
    onClose: () => void;
    onToast?: (message: string, type: 'success' | 'error') => void;
};

export const ShareWrapUpModal: React.FC<ShareWrapUpModalProps> = ({
    analytics,
    days,
    serverName,
    username,
    onClose,
    onToast,
}) => {
    const { t } = useDiscoverI18n();
    const exportRef = useRef<HTMLDivElement>(null);
    const [busy, setBusy] = useState<'copy' | 'download' | 'share' | null>(null);
    const period = periodLabel(days, t);

    const leaderboardRank = Number(analytics?.leaderboardRank);
    const hasRank = Number.isFinite(leaderboardRank) && leaderboardRank > 0;
    const rankPct = hasRank && analytics.totalActiveUsers > 0
        ? Math.max(1, Math.round((leaderboardRank / analytics.totalActiveUsers) * 100))
        : null;

    const renderExportBlob = useCallback(async (): Promise<Blob | null> => {
        const node = exportRef.current;
        if (!node) return null;

        const prevWidth = node.style.width;
        const prevMaxWidth = node.style.maxWidth;
        node.style.width = `${EXPORT_WIDTH_PX}px`;
        node.style.maxWidth = 'none';

        try {
            if (document.fonts?.ready) {
                await document.fonts.ready;
            }
            await waitForExportImages(node);
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

            const canvas = await html2canvas(node, {
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#0d0e10',
                scale: 2,
                logging: false,
                scrollX: 0,
                scrollY: -window.scrollY,
                width: node.scrollWidth,
                height: node.scrollHeight,
                onclone: (clonedDoc, clonedNode) => {
                    const exportRoot = clonedNode as HTMLElement;
                    exportRoot.style.overflow = 'visible';
                    exportRoot.style.width = `${EXPORT_WIDTH_PX}px`;
                    exportRoot.style.maxWidth = 'none';
                    exportRoot.style.paddingBottom = '1.5rem';

                    clonedDoc.querySelectorAll('[data-wrap-up-card]').forEach((card) => {
                        const el = card as HTMLElement;
                        el.style.isolation = 'isolate';
                        el.style.overflow = 'visible';
                    });
                    clonedDoc.querySelectorAll('svg').forEach((svg) => {
                        const el = svg as SVGElement;
                        el.style.overflow = 'hidden';
                        el.setAttribute('overflow', 'hidden');
                    });
                    clonedDoc.querySelectorAll('[class*="line-clamp"]').forEach((el) => {
                        const node = el as HTMLElement;
                        node.style.display = 'block';
                        node.style.overflow = 'visible';
                        node.style.webkitLineClamp = 'unset';
                        node.style.lineHeight = '1.35';
                    });
                },
            });
            return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        } finally {
            node.style.width = prevWidth;
            node.style.maxWidth = prevMaxWidth;
        }
    }, []);

    const handleCopyText = async () => {
        setBusy('copy');
        try {
            await navigator.clipboard.writeText(buildWrapUpShareText(analytics, days, serverName, username));
            onToast?.('Wrap-Up stats copied to clipboard!', 'success');
        } catch {
            onToast?.('Could not copy to clipboard.', 'error');
        } finally {
            setBusy(null);
        }
    };

    const handleDownload = async () => {
        setBusy('download');
        try {
            const blob = await renderExportBlob();
            if (!blob) {
                onToast?.('Could not generate image.', 'error');
                return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `wrap-up-${serverName.replace(/\s+/g, '-').toLowerCase()}.png`;
            a.click();
            URL.revokeObjectURL(url);
            onToast?.('Wrap-Up image downloaded!', 'success');
        } catch {
            onToast?.('Could not generate image.', 'error');
        } finally {
            setBusy(null);
        }
    };

    const handleShare = async () => {
        setBusy('share');
        const text = buildWrapUpShareText(analytics, days, serverName, username);

        try {
            if (!navigator.share) {
                await navigator.clipboard.writeText(text);
                onToast?.('Share not supported on this browser — full stats copied. Use Save Image for the card.', 'success');
                return;
            }

            const blob = await renderExportBlob();
            if (blob) {
                const file = new File([blob], 'wrap-up.png', { type: 'image/png' });
                if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        title: `${serverName} — Personal Wrap-Up`,
                        files: [file],
                    });
                    onToast?.('Wrap-Up shared!', 'success');
                    return;
                }
            }

            await navigator.share({
                title: `${serverName} — Personal Wrap-Up`,
                text,
            });
            onToast?.('Wrap-Up shared!', 'success');
        } catch (e) {
            const err = e as Error;
            if (err.name === 'AbortError') return;
            try {
                await navigator.clipboard.writeText(text);
                onToast?.('Share sheet unavailable — full stats copied. Use Save Image for the visual card.', 'success');
            } catch {
                onToast?.('Share unavailable. Try Copy Text or Save Image.', 'error');
            }
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 md:p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="glass-card shadow-2xl w-[calc(100vw-1.5rem)] max-w-[1080px] p-5 md:p-6 relative max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 text-muted hover:text-text transition-colors z-10">
                    <X className="w-5 h-5" />
                </button>

                <h3 className="text-xl font-bold text-text mb-1 pr-10">Share Your Wrap-Up</h3>
                <p className="text-muted text-sm mb-4">Preview matches what Save Image exports — same cards as your dashboard.</p>

                <div className="overflow-y-auto overflow-x-hidden flex-1 min-h-0 custom-scrollbar mb-4">
                    <div
                        ref={exportRef}
                        className="w-full rounded-2xl border border-white/10 bg-[#0d0e10] p-5 pb-6 overflow-visible"
                    >
                        <div className="mb-4 pb-3 border-b border-white/10">
                            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-plex mb-1">Personal Wrap-Up</p>
                            <h4 className="text-2xl font-black text-white">{serverName}</h4>
                            <p className="text-sm text-muted mt-1">
                                {period}
                                {username ? ` · ${username}` : ''}
                            </p>
                        </div>

                        <WrapUpCardGrid analytics={analytics} variant="export" />

                        <p className="text-[10px] text-muted/70 mt-5 leading-normal break-all">{getPublicOrigin()}</p>
                    </div>

                    <div className="mt-4 rounded-xl border border-border/50 bg-background/40 p-4 text-sm space-y-2">
                        <p className="font-bold text-text">Full stats summary</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-muted">
                            <p><span className="text-text font-semibold">Rank:</span> {hasRank ? `#${leaderboardRank}` : 'Not ranked yet'}{rankPct ? ` (top ${rankPct}%)` : ''}</p>
                            <p><span className="text-text font-semibold">Streams:</span> {analytics.totalPlays || 0} total</p>
                            <p><span className="text-text font-semibold">Movies / TV:</span> {analytics.moviesCount || 0} / {analytics.showsCount || 0}</p>
                            <p><span className="text-text font-semibold">Top binge:</span> {analytics.topBinge?.title || '—'}</p>
                            <p><span className="text-text font-semibold">Top movie:</span> {analytics.topMovie?.title || '—'}</p>
                            <p><span className="text-text font-semibold">Time of day:</span> {analytics.timeOfDay || '—'}</p>
                            <p><span className="text-text font-semibold">Top day:</span> {analytics.popularDay || '—'}</p>
                            <p><span className="text-text font-semibold">Top library:</span> {analytics.favoriteLibrary || '—'}</p>
                            <p><span className="text-text font-semibold">Media profile:</span> {analytics.mediaPreference || '—'}</p>
                            <p><span className="text-text font-semibold">Watch style:</span> {analytics.watchStyle || '—'}</p>
                            <p className="sm:col-span-2"><span className="text-text font-semibold">Streaming habit:</span> {analytics.streamingHabit || '—'} · {analytics.weekdayPlays || 0} weekday / {analytics.weekendPlays || 0} weekend plays</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-shrink-0">
                    <button type="button" onClick={handleCopyText} disabled={!!busy}
                        className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/5 border border-border hover:border-plex/50 font-bold text-sm transition-colors disabled:opacity-50">
                        <Copy className="w-4 h-4" /> {busy === 'copy' ? 'Copying…' : 'Copy Text'}
                    </button>
                    <button type="button" onClick={handleDownload} disabled={!!busy}
                        className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/5 border border-border hover:border-plex/50 font-bold text-sm transition-colors disabled:opacity-50">
                        <Download className="w-4 h-4" /> {busy === 'download' ? 'Saving…' : 'Save Image'}
                    </button>
                    <button type="button" onClick={handleShare} disabled={!!busy}
                        className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-plex text-background font-bold text-sm hover:bg-plex-hover transition-colors disabled:opacity-50">
                        <Share2 className="w-4 h-4" /> {busy === 'share' ? 'Sharing…' : 'Share'}
                    </button>
                </div>
            </div>
        </div>
    );
};
