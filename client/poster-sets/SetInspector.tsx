import React, { useState } from 'react';
import {
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronUp,
    Expand,
    Loader2,
    X,
} from 'lucide-react';
import type { PosterSetsSearchSet } from './types';
import { PosterImageLightbox } from './shared/posterSetsCards';
import { ProviderPill } from './shared/posterSetsPills';

const buttonClass = 'inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs font-semibold text-text transition hover:border-plex/40 hover:bg-white/5 disabled:pointer-events-none disabled:opacity-40 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm';
const primaryButtonClass = 'inline-flex items-center justify-center gap-1.5 rounded-xl bg-plex px-2.5 py-1.5 text-xs font-bold text-background transition hover:bg-plex-hover active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm';

export type SetInspectorProps = {
    panelRef?: React.RefObject<HTMLDivElement | null>;
    set: PosterSetsSearchSet | null;
    headerLabel: string;
    loading: boolean;
    ready: boolean;
    matchedCount: number;
    unmatchedCount: number;
    totalCount: number;
    selectedCount: number;
    titleCardsOnly?: boolean;
    showAssets: boolean;
    busy: string | null;
    onToggleShowAssets: () => void;
    onQueueMatched: () => void;
    onQueueSelected: () => void;
    onQueueEntire: () => void;
    onQueueUnmatched: () => void;
    onQueueNewSinceWatch: () => void;
    onSelectMatched: () => void;
    onSelectAll: () => void;
    onClearSelection: () => void;
    onClose: () => void;
    /** Override the dismiss button label (e.g. "Back to sets" in the library drawer). */
    closeLabel?: string;
    thumbStrip?: React.ReactNode;
    gallery?: React.ReactNode;
    relatedRail?: React.ReactNode;
};

export function SetInspector({
    panelRef,
    set,
    headerLabel,
    loading,
    ready,
    matchedCount,
    unmatchedCount,
    totalCount,
    selectedCount,
    titleCardsOnly,
    showAssets,
    busy,
    onToggleShowAssets,
    onQueueMatched,
    onQueueSelected,
    onQueueEntire,
    onQueueUnmatched,
    onQueueNewSinceWatch,
    onSelectMatched,
    onSelectAll,
    onClearSelection,
    onClose,
    closeLabel = 'Close',
    thumbStrip,
    gallery,
    relatedRail,
}: SetInspectorProps) {
    if (!set && !loading && !ready) return null;

    const queueMatchedLabel = matchedCount
        ? `Queue matched (${matchedCount})`
        : selectedCount
            ? `Queue selected (${selectedCount})`
            : 'Queue matched';

    const dismissIcon = closeLabel.toLowerCase().includes('back')
        ? <ChevronLeft className="h-4 w-4" />
        : <X className="h-4 w-4" />;

    return (
        <div
            ref={panelRef}
            className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5"
        >
            {loading && !ready ? (
                <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 shrink-0 animate-spin text-plex" />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-text">Loading set…</p>
                        <p className="truncate text-xs text-muted" title={headerLabel || set?.url}>
                            {headerLabel || set?.title || set?.url}
                        </p>
                    </div>
                    <button type="button" className={buttonClass} onClick={onClose} aria-label={closeLabel}>
                        {dismissIcon}
                    </button>
                </div>
            ) : null}

            {ready ? (
                <>
                    <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-xs font-bold uppercase tracking-wide text-plex">Selected set</p>
                                    {set ? <ProviderPill provider={set.provider} compact /> : null}
                                </div>
                                <h3 className="mt-1 text-lg font-bold leading-snug text-text sm:truncate" title={headerLabel}>
                                    {headerLabel}
                                </h3>
                                {set?.user ? (
                                    <p className="mt-0.5 truncate text-sm text-muted">
                                        @{String(set.user).trim().replace(/^@+/, '')}
                                    </p>
                                ) : null}
                            </div>
                            <button type="button" className={`${buttonClass} shrink-0`} onClick={onClose}>
                                {dismissIcon}
                                <span className="hidden sm:inline">{closeLabel}</span>
                            </button>
                        </div>

                        <p className="text-sm text-muted">
                            <span className="text-emerald-300">{matchedCount} matched</span>
                            {' · '}
                            <span className="text-amber-200">{unmatchedCount} missing</span>
                            {' · '}
                            {totalCount} in set
                            {' · '}
                            {selectedCount} selected
                        </p>
                        <p className="text-xs text-muted">
                            {titleCardsOnly
                                ? 'Title-card pack — only episode title cards from this set.'
                                : 'Matched art is ready to queue. Click art to enlarge, or open assets to pick pieces.'}
                        </p>

                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                            <button
                                type="button"
                                className={`${primaryButtonClass} w-full sm:w-auto sm:min-w-[11rem]`}
                                disabled={busy !== null || (matchedCount < 1 && !selectedCount)}
                                onClick={onQueueMatched}
                            >
                                {busy === 'apply' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                {queueMatchedLabel}
                            </button>
                            <button
                                type="button"
                                className={`${buttonClass} w-full sm:w-auto`}
                                disabled={busy !== null}
                                onClick={onQueueEntire}
                            >
                                Queue entire set
                            </button>
                            <button type="button" className={`${buttonClass} w-full sm:w-auto`} onClick={onToggleShowAssets}>
                                {showAssets ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                {showAssets ? 'Hide assets' : 'Show all assets'}
                            </button>
                        </div>

                        {showAssets ? (
                            <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
                                <button type="button" className={buttonClass} onClick={onSelectMatched}>Matched only</button>
                                <button type="button" className={buttonClass} onClick={onSelectAll}>Select all</button>
                                <button type="button" className={buttonClass} onClick={onClearSelection}>Clear selection</button>
                                <button
                                    type="button"
                                    className={buttonClass}
                                    disabled={busy !== null || !selectedCount}
                                    onClick={onQueueSelected}
                                >
                                    Queue selected ({selectedCount})
                                </button>
                                <button
                                    type="button"
                                    className={buttonClass}
                                    disabled={busy !== null}
                                    onClick={onQueueUnmatched}
                                >
                                    Queue unmatched
                                </button>
                                <button
                                    type="button"
                                    className={buttonClass}
                                    disabled={busy !== null}
                                    onClick={onQueueNewSinceWatch}
                                >
                                    Queue new since watch
                                </button>
                            </div>
                        ) : null}
                    </div>

                    {thumbStrip ? (
                        <div className="min-w-0 border-t border-white/10 pt-4">
                            {thumbStrip}
                        </div>
                    ) : null}

                    {showAssets && gallery ? (
                        <div className="space-y-3 border-t border-white/10 pt-3">
                            {gallery}
                        </div>
                    ) : null}

                    {relatedRail}
                </>
            ) : null}
        </div>
    );
}

type ThumbPreview = {
    id: string;
    thumbUrl?: string;
    title: string;
};

/** Featured matched-art preview — click any thumb to enlarge. */
export function SetInspectorThumbStrip({
    thumbs,
    layout = 'poster',
    setUrl,
    provider,
}: {
    thumbs: Array<ThumbPreview>;
    layout?: 'poster' | 'landscape';
    setUrl?: string | null;
    provider?: string | null;
}) {
    const [lightbox, setLightbox] = useState<ThumbPreview | null>(null);
    if (!thumbs.length) return null;

    const landscape = layout === 'landscape';
    const single = thumbs.length === 1;
    const gridClass = landscape
        ? (single
            ? 'grid grid-cols-1 max-w-md'
            : 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4')
        : (single
            ? 'grid max-w-[11rem] grid-cols-1'
            : 'grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6');

    return (
        <div className="space-y-2">
            <PosterImageLightbox
                open={Boolean(lightbox)}
                src={lightbox?.thumbUrl || ''}
                title={lightbox?.title}
                setUrl={setUrl}
                provider={provider}
                onClose={() => setLightbox(null)}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                    Matched preview
                    <span className="ml-1.5 font-semibold normal-case tracking-normal text-muted/80">{thumbs.length}</span>
                </p>
                <p className="inline-flex items-center gap-1 text-[10px] text-muted">
                    <Expand className="h-3 w-3" />
                    Click to enlarge
                </p>
            </div>
            <div className={gridClass}>
                {thumbs.map((thumb) => {
                    const canPreview = Boolean(String(thumb.thumbUrl || '').trim());
                    return (
                        <button
                            key={thumb.id}
                            type="button"
                            disabled={!canPreview}
                            className={`group relative w-full overflow-hidden rounded-lg border border-white/10 bg-black/40 text-left shadow-sm transition ${
                                landscape ? 'aspect-[16/9]' : 'aspect-[2/3]'
                            } ${
                                canPreview
                                    ? 'cursor-zoom-in hover:border-plex/50 hover:ring-1 hover:ring-plex/30'
                                    : 'cursor-default opacity-60'
                            }`}
                            title={canPreview ? `Enlarge ${thumb.title}` : thumb.title}
                            aria-label={canPreview ? `Enlarge ${thumb.title}` : thumb.title}
                            onClick={() => {
                                if (!canPreview) return;
                                setLightbox(thumb);
                            }}
                        >
                            {thumb.thumbUrl ? (
                                <img
                                    src={thumb.thumbUrl}
                                    alt={thumb.title}
                                    className="h-full w-full object-contain object-center transition duration-300 group-hover:scale-[1.02]"
                                    loading="lazy"
                                />
                            ) : (
                                <div className="h-full w-full bg-white/5" />
                            )}
                            {canPreview ? (
                                <span className="pointer-events-none absolute bottom-1.5 right-1.5 inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-black/65 text-text opacity-0 transition group-hover:opacity-100">
                                    <Expand className="h-3.5 w-3.5" />
                                </span>
                            ) : null}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
