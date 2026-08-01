import React from 'react';
import {
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Loader2,
    X,
} from 'lucide-react';
import type { PosterSetsSearchSet } from './types';

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

    return (
        <div
            ref={panelRef}
            className="min-w-0 space-y-4 rounded-xl border border-plex/30 bg-plex/5 p-4 sm:p-5"
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
                    <button type="button" className={buttonClass} onClick={onClose} aria-label="Close">
                        <X className="h-4 w-4" />
                    </button>
                </div>
            ) : null}

            {ready ? (
                <>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                            <p className="text-xs font-bold uppercase tracking-wide text-plex">Selected set</p>
                            <h3 className="mt-1 truncate text-lg font-bold text-text" title={headerLabel}>
                                {headerLabel}
                            </h3>
                            <p className="mt-1 text-sm text-muted">
                                <span className="text-emerald-300">{matchedCount} matched</span>
                                {' · '}
                                <span className="text-amber-200">{unmatchedCount} missing</span>
                                {' · '}
                                {totalCount} in set
                                {' · '}
                                {selectedCount} selected
                            </p>
                            <p className="mt-1 text-xs text-muted">
                                {titleCardsOnly
                                    ? 'Title-card pack — only episode title cards from this set.'
                                    : 'Matched art is ready to queue. Open assets only if you want to pick specific pieces.'}
                            </p>
                        </div>
                        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                            <button
                                type="button"
                                className={`${primaryButtonClass} sm:min-w-[220px]`}
                                disabled={busy !== null || (matchedCount < 1 && !selectedCount)}
                                onClick={onQueueMatched}
                            >
                                {busy === 'apply' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                {queueMatchedLabel}
                            </button>
                            <div className="flex flex-wrap gap-2 sm:justify-end">
                                <button
                                    type="button"
                                    className={buttonClass}
                                    disabled={busy !== null}
                                    onClick={onQueueEntire}
                                >
                                    Queue entire set
                                </button>
                                <button type="button" className={buttonClass} onClick={onClose}>
                                    <X className="h-4 w-4" />
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>

                    {thumbStrip ? (
                        <div className="border-t border-white/10 pt-3">
                            {thumbStrip}
                        </div>
                    ) : null}

                    <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
                        <button type="button" className={buttonClass} onClick={onToggleShowAssets}>
                            {showAssets ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            {showAssets ? 'Hide assets' : 'Show all assets'}
                        </button>
                        {showAssets ? (
                            <>
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
                            </>
                        ) : null}
                    </div>

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

/** Compact matched-poster strip shown before expanding the full gallery. */
export function SetInspectorThumbStrip({
    thumbs,
}: {
    thumbs: Array<{ id: string; thumbUrl?: string; title: string }>;
}) {
    if (!thumbs.length) return null;
    return (
        <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Matched preview
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {thumbs.slice(0, 12).map((thumb) => (
                    <div
                        key={thumb.id}
                        className="h-20 w-14 shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/40 sm:h-24 sm:w-16"
                        title={thumb.title}
                    >
                        {thumb.thumbUrl ? (
                            <img
                                src={thumb.thumbUrl}
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
                            />
                        ) : (
                            <div className="h-full w-full bg-white/5" />
                        )}
                    </div>
                ))}
                {thumbs.length > 12 ? (
                    <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-md border border-white/10 bg-black/30 text-[11px] font-semibold text-muted sm:h-24 sm:w-16">
                        +{thumbs.length - 12}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
