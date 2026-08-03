import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';
import { posterSetsApi } from '../api';
import { previewAssetEpisodeLabel, type PreviewAssetSections } from '../previewGroups';
import { type PosterSetsPreviewAsset } from '../types';
import { posterMediaRadiusClass, previewStripClass } from './posterSetsUi';

export function PreviewAssetTile({
    asset,
    selected,
    layout,
    caption,
    onToggle,
}: {
    asset: PosterSetsPreviewAsset;
    selected: boolean;
    layout: 'poster' | 'landscape';
    caption?: string;
    onToggle: (id: string) => void;
}) {
    const matched = asset.matched === true;
    const unmatched = asset.matched === false;
    const title = caption
        || (layout === 'landscape' ? previewAssetEpisodeLabel(asset) : `${asset.title}${asset.year ? ` (${asset.year})` : ''}`);
    return (
        <button
            type="button"
            onClick={() => onToggle(asset.id)}
            className={`group shrink-0 overflow-hidden ${posterMediaRadiusClass} border text-left transition ${
                layout === 'landscape' ? 'w-64 sm:w-72' : 'w-[7.25rem] sm:w-36'
            } ${
                selected
                    ? 'border-plex/60 bg-plex/10 ring-1 ring-plex/40'
                    : unmatched
                        ? 'border-amber-500/45 bg-amber-500/[0.06] hover:border-amber-400/60'
                        : 'border-white/10 bg-black/20 hover:border-plex/35'
            }`}
        >
            <div className={`relative bg-black/40 ${layout === 'landscape' ? 'aspect-[16/9]' : 'aspect-[2/3]'}`}>
                {asset.thumbUrl ? (
                    <img
                        src={posterSetsApi.imageUrl(asset.thumbUrl)}
                        alt={asset.title}
                        loading="lazy"
                        className="h-full w-full object-cover"
                    />
                ) : (
                    <div className="flex h-full items-center justify-center text-muted">
                        <ImageIcon className="h-8 w-8 opacity-40" />
                    </div>
                )}
                <span className={`absolute left-2 top-2 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    matched
                        ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-100'
                        : unmatched
                            ? 'border-amber-500/40 bg-amber-500/20 text-amber-100'
                            : 'border-white/15 bg-black/50 text-muted'
                }`}>
                    {matched ? 'In library' : unmatched ? 'Missing' : 'Unknown'}
                </span>
                <span className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md border text-xs font-bold ${
                    selected
                        ? 'border-plex bg-plex text-background'
                        : 'border-white/20 bg-black/50 text-muted'
                }`}>
                    {selected ? '✓' : ''}
                </span>
            </div>
            <div className="space-y-0.5 p-2.5 sm:p-3">
                <p className="truncate text-xs font-semibold text-text sm:text-sm" title={title}>
                    {title}
                </p>
                {layout === 'poster' ? (
                    <p className="truncate text-[10px] font-bold uppercase tracking-wide text-plex/90 sm:text-[11px]">{asset.label}</p>
                ) : null}
                {asset.matchDetail ? (
                    <p className="truncate text-[10px] text-muted sm:text-[11px]" title={asset.matchDetail}>{asset.matchDetail}</p>
                ) : null}
            </div>
        </button>
    );
}

export function PreviewAssetStrip({
    title,
    count,
    children,
}: {
    title: React.ReactNode;
    count: number;
    children: React.ReactNode;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [atStart, setAtStart] = useState(true);
    const [atEnd, setAtEnd] = useState(true);

    const updateScrollState = useCallback(() => {
        const node = scrollRef.current;
        if (!node) return;
        const { scrollLeft, scrollWidth, clientWidth } = node;
        const margin = 8;
        const canScroll = scrollWidth > clientWidth + margin;
        if (!canScroll) {
            setAtStart(true);
            setAtEnd(true);
            return;
        }
        setAtStart(scrollLeft <= margin);
        setAtEnd(scrollLeft >= scrollWidth - clientWidth - margin);
    }, []);

    useEffect(() => {
        updateScrollState();
        const node = scrollRef.current;
        if (!node) return undefined;
        const resizeObserver = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(() => updateScrollState())
            : null;
        resizeObserver?.observe(node);
        const timer = window.setTimeout(updateScrollState, 120);
        window.addEventListener('resize', updateScrollState);
        return () => {
            resizeObserver?.disconnect();
            window.clearTimeout(timer);
            window.removeEventListener('resize', updateScrollState);
        };
    }, [children, updateScrollState]);

    const scrollByPage = (direction: 'left' | 'right') => {
        const node = scrollRef.current;
        if (!node) return;
        const amount = Math.max(240, Math.floor(node.clientWidth * 0.85));
        node.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
    };

    const showArrows = !(atStart && atEnd);

    return (
        <section className="min-w-0 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-baseline gap-2">
                    <h4 className="min-w-0 text-xs font-bold uppercase tracking-wide text-muted">{title}</h4>
                    <span className="shrink-0 text-[11px] text-muted/80">{count}</span>
                </div>
                {showArrows ? (
                    <div className="flex shrink-0 items-center gap-0.5">
                        <button
                            type="button"
                            onClick={() => scrollByPage('left')}
                            disabled={atStart}
                            className={`rounded-md border border-white/10 p-1 transition ${
                                atStart ? 'cursor-default text-muted/30' : 'text-muted hover:border-plex/40 hover:bg-white/5 hover:text-text'
                            }`}
                            aria-label="Scroll left"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => scrollByPage('right')}
                            disabled={atEnd}
                            className={`rounded-md border border-white/10 p-1 transition ${
                                atEnd ? 'cursor-default text-muted/30' : 'text-muted hover:border-plex/40 hover:bg-white/5 hover:text-text'
                            }`}
                            aria-label="Scroll right"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                ) : null}
            </div>
            <div
                ref={scrollRef}
                onScroll={updateScrollState}
                className={previewStripClass}
            >
                {children}
            </div>
        </section>
    );
}

export function PreviewAssetGallery({
    sections,
    selectedAssetIds,
    onToggle,
}: {
    sections: PreviewAssetSections;
    selectedAssetIds: string[];
    onToggle: (id: string) => void;
}) {
    const renderStrip = (
        title: string,
        assets: PosterSetsPreviewAsset[],
        layout: 'poster' | 'landscape',
        captionFor?: (asset: PosterSetsPreviewAsset) => string | undefined,
    ) => {
        if (!assets.length) return null;
        return (
            <PreviewAssetStrip title={title} count={assets.length}>
                {assets.map((asset) => (
                    <PreviewAssetTile
                        key={asset.id}
                        asset={asset}
                        selected={selectedAssetIds.includes(asset.id)}
                        layout={layout}
                        caption={captionFor?.(asset)}
                        onToggle={onToggle}
                    />
                ))}
            </PreviewAssetStrip>
        );
    };

    return (
        <div className="min-w-0 space-y-5">
            {renderStrip('Show & season covers', sections.covers, 'poster', (asset) => asset.label || asset.title)}
            {renderStrip('Posters', sections.posters, 'poster')}
            {renderStrip('Backgrounds', sections.backgrounds, 'landscape', (asset) => asset.label || 'Background')}
            {sections.titleCardSeasons.map((season) => (
                <PreviewAssetStrip
                    key={season.key}
                    count={season.assets.length}
                    title={(
                        <>
                            {season.label}
                            <span className="ml-2 font-semibold normal-case tracking-normal text-muted/70">title cards</span>
                        </>
                    )}
                >
                    {season.assets.map((asset) => (
                        <PreviewAssetTile
                            key={asset.id}
                            asset={asset}
                            selected={selectedAssetIds.includes(asset.id)}
                            layout="landscape"
                            caption={previewAssetEpisodeLabel(asset)}
                            onToggle={onToggle}
                        />
                    ))}
                </PreviewAssetStrip>
            ))}
            {renderStrip('Other assets', sections.other, 'poster')}
        </div>
    );
}
