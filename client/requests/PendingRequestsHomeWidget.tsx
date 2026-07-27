import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight, Film, Loader2, Pencil, RefreshCw, Tv } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { RequestApprovalModal } from './RequestApprovalModal';
import { RequestCardActions, RequestCardShell, requestCardActionBtnClass } from './RequestCardShell';
import { RequestMetaChips } from './RequestMetaChips';
import type { PortalRequestItem } from './types';

const formatRelativeTime = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const diffMs = Date.now() - date.getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
};

export const PendingRequestsHomeWidget: React.FC<{
    onViewAll?: () => void;
    onReviewRequest?: (requestId: number) => void;
    onActionComplete?: () => void;
    onToast?: (message: string, type: 'success' | 'error') => void;
    layout?: 'compact' | 'wide';
    showEmpty?: boolean;
}> = ({ onViewAll, onReviewRequest, onActionComplete, onToast, layout = 'compact', showEmpty = false }) => {
    const isWide = layout === 'wide';
    const [requests, setRequests] = useState<PortalRequestItem[]>([]);
    const [pendingTotal, setPendingTotal] = useState(0);
    const [configured, setConfigured] = useState(true);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [actionId, setActionId] = useState<number | null>(null);
    const [reviewTarget, setReviewTarget] = useState<PortalRequestItem | null>(null);

    const load = useCallback(async (opts?: { silent?: boolean }) => {
        if (!opts?.silent) setLoading(true);
        else setRefreshing(true);
        setError(null);
        try {
            const data = await apiFetch(`/api/requests/pending?take=${isWide ? 6 : 5}`);
            if (!data?.configured) {
                setConfigured(false);
                setRequests([]);
                setPendingTotal(0);
                return;
            }
            setConfigured(true);
            if (data?.connected === false) {
                setError(data?.error || 'Cannot connect to your request app');
                setRequests([]);
                setPendingTotal(0);
                return;
            }
            const pending = Number(data?.pending) || 0;
            const results = Array.isArray(data?.results) ? data.results : [];
            setPendingTotal(Math.max(pending, results.length));
            setRequests(results);
        } catch (e: any) {
            setError(e?.message || 'Could not reach your request app');
            setRequests([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [isWide]);

    useEffect(() => {
        load();
        const timer = window.setInterval(() => load({ silent: true }), 90_000);
        return () => window.clearInterval(timer);
    }, [load]);

    const handleApprove = async (item: PortalRequestItem) => {
        setActionId(item.id);
        try {
            await apiFetch(`/api/requests/${item.id}/approve`, {
                method: 'POST',
                body: JSON.stringify({ title: item.title }),
            });
            onToast?.(`Approved "${item.title}"`, 'success');
            await load({ silent: true });
            onActionComplete?.();
        } catch (e: any) {
            onToast?.(e?.message || 'Failed to approve', 'error');
        } finally {
            setActionId(null);
        }
    };

    const cardClass = isWide
        ? 'glass-card p-4 md:p-5 shadow-xl w-full relative'
        : 'glass-card p-4 md:p-5 shadow-xl flex flex-col flex-shrink-0 relative';

    if (!configured) {
        if (!showEmpty) return null;
        return (
            <div className={`${cardClass} border-white/10`}>
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-sm font-semibold text-text">Jellyfin Requests</p>
                        <p className="text-xs text-muted mt-1">Connect Jellyseerr, Overseerr, or Ombi to show request approvals here.</p>
                    </div>
                    {onViewAll && (
                        <button type="button" onClick={onViewAll} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-sm font-semibold text-text hover:bg-white/5 transition-colors">
                            Open Requests <ChevronRight className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className={`${cardClass} min-h-[4.5rem] flex items-center`}>
                <div className="flex items-center gap-2 text-muted text-sm">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>Checking pending requests...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={`${cardClass} border-red-500/30`}>
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-sm font-semibold text-text">Pending Requests</p>
                        <p className="text-xs text-red-200 mt-1">{error}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => load()}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted hover:text-text"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (pendingTotal === 0 && !showEmpty) return null;

    const openReview = (item: PortalRequestItem) => {
        if (onReviewRequest) {
            onReviewRequest(item.id);
            return;
        }
        setReviewTarget(item);
    };

    const renderRequestRow = (item: PortalRequestItem, wide: boolean) => {
        const TypeIcon = item.type === 'tv' ? Tv : Film;
        const busy = actionId === item.id;
        if (wide) {
            return (
                <RequestCardShell key={item.id} backdropUrl={item.backdropUrl} posterUrl={item.posterUrl}>
                <div className="flex flex-col sm:flex-row sm:items-start gap-3 p-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                        {/* Explicit w×h — flex stretch overrides aspect-ratio and squeezes posters. */}
                        <div className="w-16 h-24 rounded-lg overflow-hidden bg-card border border-border/40 shrink-0 self-start">
                            {item.posterUrl ? (
                                <img src={item.posterUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted">
                                    <TypeIcon className="w-5 h-5 opacity-40" />
                                </div>
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-text truncate">
                                {item.title}
                                {item.year ? <span className="text-muted font-medium"> ({item.year})</span> : null}
                            </p>
                            <p className="text-xs text-muted mt-1 truncate">
                                {item.requestedBy.displayName} · {formatRelativeTime(item.createdAt)}
                                {item.is4k ? ' · 4K' : ''}
                            </p>
                            <RequestMetaChips
                                genres={item.genres}
                                originalLanguage={item.originalLanguage}
                                maxGenres={3}
                                className="mt-1.5"
                            />
                            {item.overview && (
                                <p className="text-[11px] text-muted/90 line-clamp-2 mt-1.5 hidden md:block">{item.overview}</p>
                            )}
                        </div>
                    </div>
                    <RequestCardActions>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => openReview(item)}
                            className={`${requestCardActionBtnClass} border border-plex/50 bg-background/80 text-plex font-bold hover:bg-plex/15`}
                        >
                            <Pencil className="w-3.5 h-3.5" />
                            Review
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleApprove(item)}
                            className={`${requestCardActionBtnClass} bg-plex text-background font-bold hover:bg-plex-hover shadow-sm shadow-black/20`}
                        >
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            Approve
                        </button>
                    </RequestCardActions>
                </div>
                </RequestCardShell>
            );
        }
        return (
            <RequestCardShell key={item.id} backdropUrl={item.backdropUrl} posterUrl={item.posterUrl}>
            <div className="flex items-center gap-3 p-2.5">
                <div className="w-12 h-[4.5rem] rounded overflow-hidden bg-card border border-border/40 shrink-0 self-center">
                    {item.posterUrl ? (
                        <img src={item.posterUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted">
                            <TypeIcon className="w-4 h-4 opacity-40" />
                        </div>
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-text truncate">
                        {item.title}
                        {item.year ? <span className="text-muted font-normal"> ({item.year})</span> : null}
                    </p>
                    <p className="text-[11px] text-muted truncate">
                        {item.requestedBy.displayName} · {formatRelativeTime(item.createdAt)}
                        {item.is4k ? ' · 4K' : ''}
                    </p>
                </div>
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => openReview(item)}
                    className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md border border-plex/50 bg-background/90 text-plex hover:bg-plex/15 transition-colors disabled:opacity-50 shadow-sm shadow-black/20"
                    title="Review"
                >
                    <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleApprove(item)}
                    className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg bg-plex text-background hover:bg-plex-hover transition-colors disabled:opacity-50"
                    title="Quick approve"
                >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
            </div>
            </RequestCardShell>
        );
    };

    return (
        <div className={cardClass}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3 md:mb-4">
                <div className="min-w-0">
                    <p className="text-muted text-sm uppercase tracking-widest font-semibold">Pending Requests</p>
                    <p className="text-xs text-muted mt-1">
                        {pendingTotal} awaiting approval
                        {isWide ? ' — approve from home' : ''}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={() => load({ silent: true })}
                        disabled={refreshing}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 text-xs font-semibold text-muted hover:text-text hover:bg-white/5 transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                    </button>
                    {onViewAll && (
                        <button
                            type="button"
                            onClick={onViewAll}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-sm font-semibold text-text hover:bg-white/5 transition-colors"
                        >
                            Open Requests <ChevronRight className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {requests.length === 0 ? (
                <p className="text-sm text-muted">
                    {pendingTotal > 0 ? `${pendingTotal} pending in your request app — open Requests to review them.` : 'No pending requests right now.'}
                </p>
            ) : (
                <div className={isWide ? 'grid grid-cols-1 xl:grid-cols-2 gap-3' : 'space-y-2'}>
                    {requests.map((item) => renderRequestRow(item, isWide))}
                </div>
            )}
            {reviewTarget && !onReviewRequest && typeof document !== 'undefined' && createPortal(
                <RequestApprovalModal
                    requestId={reviewTarget.id}
                    initialTitle={reviewTarget.title}
                    mode="approve"
                    onClose={() => setReviewTarget(null)}
                    onComplete={(message) => {
                        onToast?.(message, 'success');
                        setReviewTarget(null);
                        load({ silent: true });
                        onActionComplete?.();
                    }}
                    onError={(message) => onToast?.(message, 'error')}
                />,
                document.body
            )}
        </div>
    );
};
