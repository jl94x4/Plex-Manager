import React from 'react';
import { CheckCircle2, Eye, ListOrdered, Loader2, X } from 'lucide-react';
import { usePosterSetsDashboard } from '../PosterSetsDashboardContext';
import { buttonClass, primaryButtonClass } from '../shared';

export const PosterSetsFloatingBars: React.FC = () => {
    const {
        selectedBulkCount,
        inspectorOpen,
        readyToApply,
        previewHeaderLabel,
        busy,
        matchedAssetCount,
        selectedAssetIds,
        applyMatched,
        collapseSetInspector,
        tab,
        searchSets,
        queueBulkSelected,
        watchBulkSelected,
        clearBulkSelection,
    } = usePosterSetsDashboard();

    return (
        <>
                        {selectedBulkCount > 0 ? (
                                        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-50 flex justify-center px-4 md:bottom-6">
                                            <div className="pointer-events-auto flex w-full max-w-3xl flex-wrap items-center gap-2 rounded-xl border border-plex/40 bg-card/95 p-3 shadow-lg backdrop-blur">
                                                <span className="text-sm font-semibold text-text">
                                                    {selectedBulkCount} selected
                                                </span>
                                                <button
                                                    type="button"
                                                    className={primaryButtonClass}
                                                    disabled={busy !== null}
                                                    onClick={() => void queueBulkSelected()}
                                                >
                                                    {busy === 'bulk-select' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListOrdered className="h-4 w-4" />}
                                                    Queue selected
                                                </button>
                                                <button
                                                    type="button"
                                                    className={buttonClass}
                                                    disabled={busy !== null}
                                                    onClick={() => void watchBulkSelected()}
                                                >
                                                    {busy === 'bulk-watch' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                                                    Watch selected
                                                </button>
                                                <button
                                                    type="button"
                                                    className={buttonClass}
                                                    disabled={busy !== null}
                                                    onClick={clearBulkSelection}
                                                >
                                                    Clear
                                                </button>
                                            </div>
                                        </div>
                                    ) : inspectorOpen && readyToApply ? (
                                        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-50 flex justify-center px-4 md:bottom-6">
                                            <div className="pointer-events-auto flex w-full max-w-3xl flex-wrap items-center gap-2 rounded-xl border border-plex/40 bg-card/95 p-3 shadow-lg backdrop-blur">
                                                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text" title={previewHeaderLabel}>
                                                    {previewHeaderLabel}
                                                </span>
                                                <button
                                                    type="button"
                                                    className={primaryButtonClass}
                                                    disabled={busy !== null || (matchedAssetCount < 1 && !selectedAssetIds.length)}
                                                    onClick={() => void applyMatched()}
                                                >
                                                    {busy === 'apply' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                                    Queue matched{matchedAssetCount ? ` (${matchedAssetCount})` : selectedAssetIds.length ? ` (${selectedAssetIds.length})` : ''}
                                                </button>
                                                <button
                                                    type="button"
                                                    className={buttonClass}
                                                    disabled={busy !== null}
                                                    onClick={() => collapseSetInspector({ scrollToSets: tab === 'apply' && searchSets.length > 0 })}
                                                >
                                                    <X className="h-4 w-4" />
                                                    Close
                                                </button>
                                            </div>
                                        </div>
                                    ) : null}
                </>
    );
};
