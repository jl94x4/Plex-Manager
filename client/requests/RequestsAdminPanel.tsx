import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, Film, Loader2, Pencil, RefreshCw, RotateCcw, Search, Trash2, Tv, X } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { formatDateTime } from '../shared/format';
import { Loader, ToastContainer, pushToast, type ToastMessage } from '../shared/toast';
import { CustomSelect } from '../shared/ui';
import { RequestApprovalModal } from './RequestApprovalModal';
import { RequestCardActions, RequestCardShell, requestCardActionBtnClass } from './RequestCardShell';
import { RequestMetaChips } from './RequestMetaChips';
import { OpenInArrButton } from '../shared/OpenInArrButton';
import {
    type AdminRequestFilter,
    buildRequesterOptions,
    defaultRequestListFilters,
    filterPortalRequests,
    type RequestListFilters,
} from './requestFilterUtils';
import type { PortalRequestItem, PortalRequestUser } from './types';

export type { PortalRequestItem } from './types';

type Props = {
    onCountsChange?: () => void;
    embedded?: boolean;
    initialReviewId?: number | null;
};

const formatRelativeTime = (value?: string | null) => {
    if (!value) return 'Unknown time';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return formatDateTime(value);
    const diffMs = Date.now() - date.getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return formatDateTime(value);
};

const RequestTypeBadge: React.FC<{ type: string; is4k: boolean }> = ({ type, is4k }) => (
    <span className="inline-flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-white/5 border border-border text-muted">
            {type === 'tv' ? 'TV' : 'Movie'}
        </span>
        {is4k && (
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-200">
                4K
            </span>
        )}
    </span>
);

export const RequestsAdminPanel: React.FC<Props> = ({ onCountsChange, embedded = false, initialReviewId = null }) => {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [filter, setFilter] = useState<AdminRequestFilter>('pending');
    const [listFilters, setListFilters] = useState(defaultRequestListFilters);
    const [requests, setRequests] = useState<PortalRequestItem[]>([]);
    const [users, setUsers] = useState<PortalRequestUser[]>([]);
    const [counts, setCounts] = useState({
        pending: 0,
        approved: 0,
        declined: 0,
        failed: 0,
        processing: 0,
        available: 0,
        total: 0,
        configured: false,
        connected: false,
        supported: true,
    });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [actionId, setActionId] = useState<number | null>(null);
    const [declineTarget, setDeclineTarget] = useState<PortalRequestItem | null>(null);
    const [declineReason, setDeclineReason] = useState('');
    const [declineAndBlocklist, setDeclineAndBlocklist] = useState(false);
    const [bulkDeclineOpen, setBulkDeclineOpen] = useState(false);
    const [bulkDeclineReason, setBulkDeclineReason] = useState('');
    const [bulkAction, setBulkAction] = useState<'approve' | 'decline' | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [reviewTarget, setReviewTarget] = useState<PortalRequestItem | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<PortalRequestItem | null>(null);

    const addToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToasts((prev) => pushToast(prev, message, type));
    }, []);

    const loadData = useCallback(async (opts?: { silent?: boolean }) => {
        if (!opts?.silent) setLoading(true);
        else setRefreshing(true);
        setError(null);
        try {
            const countData = await apiFetch('/api/requests/count');
            const nextCounts = {
                pending: Number(countData?.pending) || 0,
                approved: Number(countData?.approved) || 0,
                declined: Number(countData?.declined) || 0,
                failed: Number(countData?.failed) || 0,
                processing: Number(countData?.processing) || 0,
                available: Number(countData?.available) || 0,
                total: Number(countData?.total) || 0,
                configured: !!countData?.configured,
                connected: !!countData?.connected,
                supported: countData?.supported !== false,
            };
            setCounts(nextCounts);

            if (!nextCounts.configured) {
                setRequests([]);
                return;
            }
            if (!nextCounts.supported || !nextCounts.connected) {
                setRequests([]);
                setError(countData?.error || 'Cannot connect to your request app');
                return;
            }

            const [listData, usersData] = await Promise.all([
                apiFetch(`/api/requests?filter=${encodeURIComponent(filter)}&take=50`),
                apiFetch('/api/requests/users').catch(() => ({ users: [] })),
            ]);
            if (listData?.connected === false) {
                setRequests([]);
                setError(listData?.error || 'Cannot connect to your request app');
                return;
            }
            setRequests(Array.isArray(listData?.results) ? listData.results : []);
            setUsers(Array.isArray(usersData?.users) ? usersData.users : []);
            setSelectedIds(new Set());
        } catch (e: any) {
            setError(e?.message || 'Failed to load requests');
            setRequests([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [filter]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        if (!initialReviewId || loading) return;
        const match = requests.find((item) => item.id === initialReviewId);
        if (match) {
            setReviewTarget(match);
            const url = new URL(window.location.href);
            url.searchParams.delete('review');
            window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
        }
    }, [initialReviewId, loading, requests]);

    const filteredRequests = useMemo(
        () => filterPortalRequests(requests, listFilters),
        [requests, listFilters],
    );

    const requesterOptions = useMemo(
        () => [{ value: '', label: 'All requesters' }, ...buildRequesterOptions(users, requests)],
        [users, requests],
    );

    const filterTabs = useMemo(() => ([
        { id: 'pending' as const, label: 'Pending', count: counts.pending },
        { id: 'processing' as const, label: 'Processing', count: counts.processing },
        { id: 'available' as const, label: 'Available', count: counts.available },
        { id: 'failed' as const, label: 'Failed', count: counts.failed },
        { id: 'approved' as const, label: 'Approved', count: counts.approved },
        { id: 'declined' as const, label: 'Declined', count: counts.declined },
    ]), [counts]);

    const allVisibleSelected = filteredRequests.length > 0
        && filteredRequests.every((item) => selectedIds.has(item.id));

    const toggleSelectAll = () => {
        if (allVisibleSelected) {
            setSelectedIds(new Set());
            return;
        }
        setSelectedIds(new Set(filteredRequests.map((item) => item.id)));
    };

    const toggleSelected = (id: number) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleBulkApprove = async () => {
        const ids = Array.from(selectedIds);
        if (!ids.length) return;
        setBulkAction('approve');
        let ok = 0;
        for (const id of ids) {
            try {
                const item = requests.find((r) => r.id === id);
                await apiFetch(`/api/requests/${id}/approve`, {
                    method: 'POST',
                    body: JSON.stringify({ title: item?.title || '' }),
                });
                ok += 1;
            } catch {
                // continue with remaining
            }
        }
        addToast(ok === ids.length ? `Approved ${ok} request${ok === 1 ? '' : 's'}` : `Approved ${ok} of ${ids.length} requests`);
        setSelectedIds(new Set());
        await loadData({ silent: true });
        onCountsChange?.();
        setBulkAction(null);
    };

    const handleBulkDecline = async () => {
        const ids = Array.from(selectedIds);
        if (!ids.length) return;
        setBulkAction('decline');
        let ok = 0;
        for (const id of ids) {
            try {
                const item = requests.find((r) => r.id === id);
                await apiFetch(`/api/requests/${id}/decline`, {
                    method: 'POST',
                    body: JSON.stringify({
                        title: item?.title || '',
                        reason: bulkDeclineReason.trim(),
                    }),
                });
                ok += 1;
            } catch {
                // continue with remaining
            }
        }
        addToast(ok === ids.length ? `Declined ${ok} request${ok === 1 ? '' : 's'}` : `Declined ${ok} of ${ids.length} requests`);
        setBulkDeclineOpen(false);
        setBulkDeclineReason('');
        setSelectedIds(new Set());
        await loadData({ silent: true });
        onCountsChange?.();
        setBulkAction(null);
    };

    const handleQuickApprove = async (item: PortalRequestItem) => {
        setActionId(item.id);
        try {
            await apiFetch(`/api/requests/${item.id}/approve`, {
                method: 'POST',
                body: JSON.stringify({ title: item.title }),
            });
            addToast(`Approved "${item.title}"`);
            await loadData({ silent: true });
            onCountsChange?.();
        } catch (e: any) {
            addToast(e?.message || 'Failed to approve request', 'error');
        } finally {
            setActionId(null);
        }
    };

    const handleDecline = async () => {
        if (!declineTarget) return;
        setActionId(declineTarget.id);
        try {
            await apiFetch(`/api/requests/${declineTarget.id}/decline`, {
                method: 'POST',
                body: JSON.stringify({
                    title: declineTarget.title,
                    reason: declineReason.trim(),
                    blacklist: declineAndBlocklist,
                    tmdbId: declineTarget.tmdbId,
                    mediaType: declineTarget.type,
                }),
            });
            addToast(
                declineAndBlocklist
                    ? `Declined and blocklisted "${declineTarget.title}"`
                    : `Declined "${declineTarget.title}"`,
            );
            setDeclineTarget(null);
            setDeclineReason('');
            setDeclineAndBlocklist(false);
            await loadData({ silent: true });
            onCountsChange?.();
        } catch (e: any) {
            addToast(e?.message || 'Failed to decline request', 'error');
        } finally {
            setActionId(null);
        }
    };

    const handleRetry = async (item: PortalRequestItem) => {
        setActionId(item.id);
        try {
            await apiFetch(`/api/requests/${item.id}/retry`, {
                method: 'POST',
                body: JSON.stringify({ title: item.title }),
            });
            addToast(`Retried "${item.title}"`);
            await loadData({ silent: true });
            onCountsChange?.();
        } catch (e: any) {
            addToast(e?.message || 'Failed to retry request', 'error');
        } finally {
            setActionId(null);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setActionId(deleteTarget.id);
        try {
            await apiFetch(`/api/requests/${deleteTarget.id}`, {
                method: 'DELETE',
                body: JSON.stringify({ title: deleteTarget.title }),
            });
            addToast(`Deleted "${deleteTarget.title}"`);
            setDeleteTarget(null);
            await loadData({ silent: true });
            onCountsChange?.();
        } catch (e: any) {
            addToast(e?.message || 'Failed to delete request', 'error');
        } finally {
            setActionId(null);
        }
    };

    const seerrLink = requests[0]?.seerrUrl || null;
    const showPendingActions = filter === 'pending';

    return (
        <div className={`w-full max-w-[100%] ${embedded ? '' : 'animate-fade-in'}`}>
            <Loader isLoading={loading && requests.length === 0} />
            <ToastContainer toasts={toasts} setToasts={setToasts} />

            {!embedded && (
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-plex">Requests</h1>
                    <p className="text-sm text-muted mt-1">
                        {counts.configured && counts.connected
                            ? `${counts.pending} pending · full Seerr-style review with profiles, folders, tags & seasons`
                            : counts.configured
                                ? 'Request app is configured — connection failed (see below)'
                                : 'Connect Seerr, Overseerr, or Jellyseerr in Settings → Integrations to manage requests here.'}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {seerrLink && (
                        <a
                            href={seerrLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium text-muted hover:text-text hover:bg-white/5 transition-colors"
                        >
                            Open Seerr <ExternalLink className="w-4 h-4" />
                        </a>
                    )}
                    <button
                        type="button"
                        onClick={() => loadData({ silent: true })}
                        disabled={refreshing}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-border text-text text-sm font-semibold hover:bg-opacity-80 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>
            )}

            <div className="glass-card p-4 md:p-6 shadow-2xl">
                <div className="flex flex-wrap gap-2 mb-4">
                    {filterTabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setFilter(tab.id)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                                filter === tab.id
                                    ? 'nav-item-active'
                                    : 'text-muted hover:text-text hover:bg-white/5'
                            }`}
                        >
                            {tab.label}
                            <span className="ml-1.5 text-xs opacity-70">({tab.count})</span>
                        </button>
                    ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-4">
                    <div className="relative sm:col-span-2 xl:col-span-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                        <input
                            type="search"
                            value={listFilters.search}
                            onChange={(e) => setListFilters((prev) => ({ ...prev, search: e.target.value }))}
                            placeholder="Search title or requester..."
                            className="w-full pl-10 pr-3 py-2 rounded-lg border border-border bg-background text-text text-sm outline-none focus:border-plex transition-colors"
                        />
                    </div>
                    <CustomSelect
                        value={listFilters.requesterId}
                        onChange={(val) => setListFilters((prev) => ({ ...prev, requesterId: val }))}
                        options={requesterOptions}
                    />
                    <CustomSelect
                        value={listFilters.mediaType}
                        onChange={(val) => setListFilters((prev) => ({ ...prev, mediaType: val as RequestListFilters['mediaType'] }))}
                        options={[
                            { value: 'all', label: 'All types' },
                            { value: 'movie', label: 'Movies' },
                            { value: 'tv', label: 'TV' },
                        ]}
                    />
                    <CustomSelect
                        value={listFilters.quality}
                        onChange={(val) => setListFilters((prev) => ({ ...prev, quality: val as RequestListFilters['quality'] }))}
                        options={[
                            { value: 'all', label: 'All quality' },
                            { value: 'hd', label: 'HD only' },
                            { value: '4k', label: '4K only' },
                        ]}
                    />
                    <CustomSelect
                        value={listFilters.dateRange}
                        onChange={(val) => setListFilters((prev) => ({ ...prev, dateRange: val as RequestListFilters['dateRange'] }))}
                        options={[
                            { value: 'all', label: 'All dates' },
                            { value: '7d', label: 'Last 7 days' },
                            { value: '30d', label: 'Last 30 days' },
                        ]}
                    />
                </div>

                {showPendingActions && filteredRequests.length > 0 && (
                    <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-xl border border-white/10 bg-white/[0.03]">
                        <label className="inline-flex items-center gap-2 text-sm text-muted cursor-pointer">
                            <input
                                type="checkbox"
                                checked={allVisibleSelected}
                                onChange={toggleSelectAll}
                                className="h-4 w-4 rounded border-border bg-background text-plex focus:ring-plex"
                            />
                            Select all ({filteredRequests.length})
                        </label>
                        {selectedIds.size > 0 && (
                            <>
                                <span className="text-xs text-muted">{selectedIds.size} selected</span>
                                <button
                                    type="button"
                                    disabled={!!bulkAction}
                                    onClick={handleBulkApprove}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-plex text-black text-xs font-bold hover:bg-plex-hover transition-colors disabled:opacity-50"
                                >
                                    {bulkAction === 'approve' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                    Bulk approve
                                </button>
                                <button
                                    type="button"
                                    disabled={!!bulkAction}
                                    onClick={() => setBulkDeclineOpen(true)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/40 text-red-200 text-xs font-bold hover:bg-red-500/10 transition-colors disabled:opacity-50"
                                >
                                    <X className="w-3.5 h-3.5" />
                                    Bulk decline
                                </button>
                            </>
                        )}
                    </div>
                )}

                {error && (
                    <div className="mb-4 p-4 rounded-xl border border-red-500/40 bg-red-500/10 text-red-200 text-sm space-y-2">
                        <p>{error}</p>
                        {counts.configured && (
                            <p className="text-xs text-red-200/80">
                                If you use a public reverse-proxy URL, the portal container may not reach it. Add an
                                {' '}<strong>Internal fetch URL</strong> under Settings → Integrations
                                (docker service name or LAN IP, e.g. <code className="text-red-100">http://jellyseerr:5055</code>).
                            </p>
                        )}
                    </div>
                )}

                {!counts.configured && !loading && !error && (
                    <div className="py-12 text-center text-muted">
                        <p className="font-medium text-text mb-2">Request app not configured</p>
                        <p className="text-sm max-w-md mx-auto">
                            Set Request App Type, URL, and API key under Settings → Integrations. Ombi is not supported for in-portal approval yet.
                        </p>
                    </div>
                )}

                {counts.configured && !counts.supported && !loading && (
                    <div className="py-12 text-center text-muted">
                        <p className="font-medium text-text mb-2">Request app type not supported</p>
                        <p className="text-sm max-w-md mx-auto">
                            In-portal approval works with Seerr, Overseerr, and Jellyseerr. Ombi requires the external request UI.
                        </p>
                    </div>
                )}

                {counts.configured && counts.supported && !loading && filteredRequests.length === 0 && !error && (
                    <div className="py-12 text-center text-muted">
                        <p className="font-medium text-text mb-1">
                            {requests.length === 0 ? `No ${filter} requests` : 'No requests match your filters'}
                        </p>
                        <p className="text-sm">You&apos;re all caught up.</p>
                    </div>
                )}

                <div className="space-y-3">
                    {filteredRequests.map((item) => {
                        const busy = actionId === item.id;
                        const TypeIcon = item.type === 'tv' ? Tv : Film;
                        const isSelected = selectedIds.has(item.id);
                        return (
                            <RequestCardShell
                                key={item.id}
                                backdropUrl={item.backdropUrl}
                                posterUrl={item.posterUrl}
                                className={`hover:border-plex/25 ${isSelected ? 'ring-1 ring-plex/40' : ''}`}
                            >
                            <div className="flex flex-col sm:flex-row sm:items-start gap-4 p-4">
                                <div className="flex items-start gap-4 min-w-0 flex-1">
                                    {showPendingActions && (
                                        <label className="flex items-start pt-1 cursor-pointer shrink-0">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleSelected(item.id)}
                                                className="h-4 w-4 rounded border-border bg-background text-plex focus:ring-plex"
                                            />
                                        </label>
                                    )}
                                    <div className="w-[9rem] h-[13.5rem] self-start rounded-lg overflow-hidden bg-card border border-border/50 shrink-0">
                                        {item.posterUrl ? (
                                            <img
                                                src={item.posterUrl}
                                                alt=""
                                                className="w-full h-full object-cover"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-muted">
                                                <TypeIcon className="w-8 h-8 opacity-40" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                            <h3 className="font-bold text-text truncate">
                                                {item.title}
                                                {item.year ? <span className="text-muted font-medium"> ({item.year})</span> : null}
                                            </h3>
                                            <RequestTypeBadge type={item.type} is4k={item.is4k} />
                                        </div>
                                        <p className="text-sm text-muted mb-1">
                                            Requested by <span className="text-text font-medium">{item.requestedBy.displayName}</span>
                                            {' · '}
                                            {formatRelativeTime(item.createdAt)}
                                            {item.updatedAt && item.updatedAt !== item.createdAt
                                                ? ` · Updated ${formatRelativeTime(item.updatedAt)}`
                                                : ''}
                                        </p>
                                        <RequestMetaChips
                                            genres={item.genres}
                                            originalLanguage={item.originalLanguage}
                                            className="mb-2"
                                        />
                                        {item.modifiedBy && (
                                            <p className="text-xs text-muted mb-1">
                                                Last action by {item.modifiedBy.displayName}
                                            </p>
                                        )}
                                        {filter === 'declined' && item.declineReason && (
                                            <p className="text-xs text-red-200/90 mb-2 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-2">
                                                {item.declineReason}
                                            </p>
                                        )}
                                        {item.routingSummary && (
                                            <p className="text-xs text-plex/90 mb-2 font-medium">{item.routingSummary}</p>
                                        )}
                                        {item.type === 'tv' && item.seasons && item.seasons.length > 0 && (
                                            <p className="text-xs text-muted mb-2">
                                                Seasons: {item.seasons.map((s) => s.seasonNumber).join(', ')}
                                            </p>
                                        )}
                                        {item.overview && (
                                            <p className="text-xs text-muted line-clamp-2">{item.overview}</p>
                                        )}
                                    </div>
                                </div>

                                <RequestCardActions>
                                    {showPendingActions && (
                                        <>
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => setReviewTarget(item)}
                                                className={`${requestCardActionBtnClass} border border-plex/50 bg-background/80 text-plex font-bold hover:bg-plex/15`}
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                                Review
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => handleQuickApprove(item)}
                                                className={`${requestCardActionBtnClass} bg-plex text-background font-bold hover:bg-plex-hover shadow-sm shadow-black/20`}
                                            >
                                                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                                Quick Approve
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => {
                                                    setDeclineTarget(item);
                                                    setDeclineReason('');
                                                    setDeclineAndBlocklist(false);
                                                }}
                                                className={`${requestCardActionBtnClass} border border-red-500/50 bg-background/80 text-red-200 hover:bg-red-500/15`}
                                            >
                                                <X className="w-3.5 h-3.5" />
                                                Decline
                                            </button>
                                        </>
                                    )}
                                    {(filter === 'failed' || item.canRetry) && (
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => handleRetry(item)}
                                            className={`${requestCardActionBtnClass} border border-amber-500/50 bg-background/80 text-amber-200 hover:bg-amber-500/15`}
                                        >
                                            <RotateCcw className="w-3.5 h-3.5" />
                                            Retry
                                        </button>
                                    )}
                                    {!showPendingActions && (
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => setReviewTarget(item)}
                                            className={`${requestCardActionBtnClass} border border-white/15 bg-background/80 text-text hover:bg-white/10`}
                                        >
                                            <Pencil className="w-3.5 h-3.5" />
                                            Edit
                                        </button>
                                    )}
                                    <OpenInArrButton
                                        mediaType={item.type === 'tv' ? 'tv' : 'movie'}
                                        tmdbId={item.tmdbId}
                                        title={item.title}
                                        year={item.year}
                                        is4k={!!item.is4k}
                                        className={`${requestCardActionBtnClass} border border-sky-500/40 bg-background/80 text-sky-200 hover:bg-sky-500/15`}
                                        onError={(message) => addToast(message, 'error')}
                                    />
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => setDeleteTarget(item)}
                                        className={`${requestCardActionBtnClass} border border-border bg-background/80 text-muted hover:text-red-200 hover:border-red-500/40 hover:bg-red-500/10`}
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Delete
                                    </button>
                                </RequestCardActions>
                            </div>
                            </RequestCardShell>
                        );
                    })}
                </div>
            </div>

            {reviewTarget && (
                <RequestApprovalModal
                    requestId={reviewTarget.id}
                    initialTitle={reviewTarget.title}
                    mode={showPendingActions ? 'approve' : 'edit'}
                    onClose={() => setReviewTarget(null)}
                    onComplete={(message) => {
                        addToast(message);
                        setReviewTarget(null);
                        loadData({ silent: true });
                        onCountsChange?.();
                    }}
                    onError={(message) => addToast(message, 'error')}
                />
            )}

            {declineTarget && (
                <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-md glass-card p-5 shadow-2xl border border-border">
                        <h3 className="text-lg font-bold text-text mb-1">Decline request</h3>
                        <p className="text-sm text-muted mb-4">
                            Decline <span className="text-text font-medium">{declineTarget.title}</span>?
                        </p>
                        <label className="block text-sm font-medium text-text mb-2">Reason (optional)</label>
                        <textarea
                            className="w-full min-h-[100px] p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex transition-colors mb-4"
                            value={declineReason}
                            onChange={(e) => setDeclineReason(e.target.value)}
                            placeholder="Let the requester know why this was declined..."
                        />
                        {declineTarget.tmdbId && (
                            <label className="flex items-start gap-3 mb-4 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={declineAndBlocklist}
                                    onChange={(e) => setDeclineAndBlocklist(e.target.checked)}
                                    className="mt-1 h-4 w-4 rounded border-border bg-background text-plex focus:ring-plex"
                                />
                                <span className="text-sm text-muted">
                                    Also add <span className="text-text font-medium">{declineTarget.title}</span> to the blocklist so it cannot be requested again.
                                </span>
                            </label>
                        )}
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setDeclineTarget(null);
                                    setDeclineReason('');
                                    setDeclineAndBlocklist(false);
                                }}
                                className="px-4 py-2 rounded-lg border border-border text-muted hover:text-text transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDecline}
                                disabled={actionId === declineTarget.id}
                                className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold hover:bg-red-500 transition-colors disabled:opacity-50"
                            >
                                {actionId === declineTarget.id
                                    ? (declineAndBlocklist ? 'Declining & blocking...' : 'Declining...')
                                    : (declineAndBlocklist ? 'Decline & blocklist' : 'Decline request')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {bulkDeclineOpen && (
                <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-md glass-card p-5 shadow-2xl border border-border">
                        <h3 className="text-lg font-bold text-text mb-1">Decline {selectedIds.size} requests</h3>
                        <p className="text-sm text-muted mb-4">
                            Optional reason will be sent to each requester.
                        </p>
                        <textarea
                            className="w-full min-h-[100px] p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex transition-colors mb-4"
                            value={bulkDeclineReason}
                            onChange={(e) => setBulkDeclineReason(e.target.value)}
                            placeholder="Reason for declining these requests..."
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setBulkDeclineOpen(false);
                                    setBulkDeclineReason('');
                                }}
                                className="px-4 py-2 rounded-lg border border-border text-muted hover:text-text transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleBulkDecline}
                                disabled={bulkAction === 'decline'}
                                className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold hover:bg-red-500 transition-colors disabled:opacity-50"
                            >
                                {bulkAction === 'decline' ? 'Declining...' : `Decline ${selectedIds.size} requests`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteTarget && (
                <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-md glass-card p-5 shadow-2xl border border-border">
                        <h3 className="text-lg font-bold text-text mb-1">Delete request</h3>
                        <p className="text-sm text-muted mb-4">
                            Permanently delete <span className="text-text font-medium">{deleteTarget.title}</span> from your request app?
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setDeleteTarget(null)}
                                className="px-4 py-2 rounded-lg border border-border text-muted hover:text-text transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={actionId === deleteTarget.id}
                                className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold hover:bg-red-500 transition-colors disabled:opacity-50"
                            >
                                {actionId === deleteTarget.id ? 'Deleting...' : 'Delete request'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
