import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Check, LifeBuoy, Loader2, MessageSquare, Plus, RotateCcw, Send, Trash2, X,
} from 'lucide-react';
import { apiFetch } from '../shared/api';
import { portalUrl } from '../shared/basePath';
import { DashboardHero, DashboardPageShell } from '../shared/dashboard/DashboardChrome';
import { formatDateTime } from '../shared/format';
import { ToastContainer, pushToast, type ToastMessage } from '../shared/toast';
import { issueStatusBadgeClass } from '../discovery/issueUtils';

type TicketFilter = 'open' | 'resolved' | 'closed' | 'all';

type TicketComment = {
    id: number;
    message: string;
    createdAt: string | null;
    user: { id?: string | null; displayName: string; avatar?: string; isAdmin?: boolean };
};

type Ticket = {
    id: number;
    subject: string;
    category: string;
    categoryLabel: string;
    status: number;
    statusLabel: string;
    createdAt: string | null;
    updatedAt: string | null;
    unreadForUser?: boolean;
    unreadForAdmin?: boolean;
    createdBy: { id?: string | null; displayName: string; email?: string | null };
    comments: TicketComment[];
    commentCount: number;
};

const CATEGORY_FALLBACK = [
    { id: 'media', label: 'Media request / problem' },
    { id: 'account', label: 'Account / access' },
    { id: 'server', label: 'Server / service' },
    { id: 'general', label: 'General question' },
    { id: 'other', label: 'Other' },
];

export const SupportInbox: React.FC<{ sessionInfo?: any; onCountsChange?: () => void }> = ({
    sessionInfo = null,
    onCountsChange,
}) => {
    const isAdmin = !!sessionInfo?.session?.isAdmin;
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [filter, setFilter] = useState<TicketFilter>('open');
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [counts, setCounts] = useState({ open: 0, resolved: 0, closed: 0, unread: 0, total: 0 });
    const [categories, setCategories] = useState(CATEGORY_FALLBACK);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [composeOpen, setComposeOpen] = useState(false);
    const [subject, setSubject] = useState('');
    const [category, setCategory] = useState('general');
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);
    const [activeId, setActiveId] = useState<number | null>(null);
    const [active, setActive] = useState<Ticket | null>(null);
    const [reply, setReply] = useState('');
    const [busy, setBusy] = useState(false);

    const addToast = useCallback((text: string, type: 'success' | 'error' = 'success') => {
        setToasts((prev) => pushToast(prev, text, type));
    }, []);

    const loadList = useCallback(async () => {
        setError(null);
        try {
            const data = await apiFetch(`/api/support/tickets?filter=${encodeURIComponent(filter)}&take=60`);
            setTickets(Array.isArray(data?.results) ? data.results : []);
            if (data?.counts) setCounts(data.counts);
        } catch (e: any) {
            setError(e?.message || 'Failed to load tickets');
            setTickets([]);
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        apiFetch('/api/support/meta').then((meta) => {
            if (Array.isArray(meta?.categories) && meta.categories.length) setCategories(meta.categories);
        }).catch(() => null);
    }, []);

    useEffect(() => {
        setLoading(true);
        void loadList();
    }, [loadList]);

    useEffect(() => {
        const applyFromLocation = () => {
            const params = new URLSearchParams(window.location.search);
            const fromQuery = Number(params.get('ticket'));
            if (Number.isFinite(fromQuery) && fromQuery > 0) setActiveId(fromQuery);
            if (params.get('compose') === '1') setComposeOpen(true);
        };
        applyFromLocation();
        const onNavigate = (event: Event) => {
            const ticketId = Number((event as CustomEvent)?.detail?.ticketId);
            if (Number.isFinite(ticketId) && ticketId > 0) setActiveId(ticketId);
        };
        window.addEventListener('popstate', applyFromLocation);
        window.addEventListener('portal-support-navigate', onNavigate);
        return () => {
            window.removeEventListener('popstate', applyFromLocation);
            window.removeEventListener('portal-support-navigate', onNavigate);
        };
    }, []);

    useEffect(() => {
        if (!activeId) {
            setActive(null);
            return;
        }
        let cancelled = false;
        apiFetch(`/api/support/tickets/${activeId}`).then((data) => {
            if (cancelled) return;
            setActive(data?.ticket || null);
            onCountsChange?.();
        }).catch((e: any) => {
            if (!cancelled) addToast(e?.message || 'Could not open ticket', 'error');
        });
        return () => { cancelled = true; };
    }, [activeId, addToast, onCountsChange]);

    const tabs = useMemo(() => ([
        { id: 'open' as const, label: 'Open', count: counts.open },
        { id: 'resolved' as const, label: 'Resolved', count: counts.resolved },
        { id: 'closed' as const, label: 'Closed', count: counts.closed },
        { id: 'all' as const, label: 'All', count: counts.total },
    ]), [counts]);

    const submitTicket = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const data = await apiFetch('/api/support/tickets', {
                method: 'POST',
                body: JSON.stringify({ subject, category, message }),
            });
            setSubject('');
            setMessage('');
            setComposeOpen(false);
            addToast('Ticket sent');
            setActiveId(data?.ticket?.id || null);
            await loadList();
            onCountsChange?.();
        } catch (err: any) {
            addToast(err?.message || 'Could not send ticket', 'error');
        } finally {
            setSaving(false);
        }
    };

    const sendReply = async () => {
        if (!active || !reply.trim()) return;
        setBusy(true);
        try {
            const data = await apiFetch(`/api/support/tickets/${active.id}/comment`, {
                method: 'POST',
                body: JSON.stringify({ message: reply }),
            });
            setReply('');
            setActive(data?.ticket || active);
            await loadList();
            onCountsChange?.();
        } catch (err: any) {
            addToast(err?.message || 'Reply failed', 'error');
        } finally {
            setBusy(false);
        }
    };

    const setStatus = async (status: 'open' | 'resolved' | 'closed') => {
        if (!active) return;
        setBusy(true);
        try {
            const data = await apiFetch(`/api/support/tickets/${active.id}/status`, {
                method: 'POST',
                body: JSON.stringify({ status }),
            });
            setActive(data?.ticket || active);
            await loadList();
            onCountsChange?.();
        } catch (err: any) {
            addToast(err?.message || 'Could not update status', 'error');
        } finally {
            setBusy(false);
        }
    };

    const deleteTicket = async () => {
        if (!active || !isAdmin) return;
        setBusy(true);
        try {
            await apiFetch(`/api/support/tickets/${active.id}`, { method: 'DELETE' });
            setActiveId(null);
            setActive(null);
            await loadList();
            onCountsChange?.();
            addToast('Ticket deleted');
        } catch (err: any) {
            addToast(err?.message || 'Delete failed', 'error');
        } finally {
            setBusy(false);
        }
    };

    const unreadOn = (ticket: Ticket) => (isAdmin ? ticket.unreadForAdmin : ticket.unreadForUser);

    return (
        <DashboardPageShell>
            <ToastContainer toasts={toasts} setToasts={setToasts} />
            <DashboardHero
                accent="plex"
                eyebrow="Support"
                title={isAdmin ? 'Support inbox' : 'Contact admin'}
                description={isAdmin
                    ? 'Reply to member tickets without leaving the portal.'
                    : 'Message the server admin directly — no Discord or email required.'}
                icon={<LifeBuoy className="h-3.5 w-3.5" />}
                secondaryBlob
                actions={(
                    <button
                        type="button"
                        onClick={() => setComposeOpen(true)}
                        className="inline-flex items-center gap-2 rounded-xl bg-plex px-4 py-2.5 text-sm font-bold text-background hover:bg-plex-hover"
                    >
                        <Plus className="w-4 h-4" /> New ticket
                    </button>
                )}
            />

            <div className="flex flex-wrap gap-2">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setFilter(tab.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                            filter === tab.id ? 'border-plex text-plex bg-plex/10' : 'border-border text-muted'
                        }`}
                    >
                        {tab.label} {tab.count}
                    </button>
                ))}
            </div>

            {error && <p className="text-sm text-red-300">{error}</p>}

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(18rem,28rem)_minmax(0,1fr)] gap-4 items-start">
                <div className="space-y-2">
                    {loading ? (
                        <div className="glass-card p-8 text-center text-muted text-sm">
                            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading tickets…
                        </div>
                    ) : tickets.length === 0 ? (
                        <div className="glass-card p-8 text-center text-muted text-sm">
                            No tickets in this view.
                        </div>
                    ) : tickets.map((ticket) => (
                        <button
                            key={ticket.id}
                            type="button"
                            onClick={() => {
                                setActiveId(ticket.id);
                                window.history.replaceState({}, '', portalUrl(`/support?ticket=${ticket.id}`));
                            }}
                            className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                                activeId === ticket.id ? 'border-plex/50 bg-plex/10' : 'border-white/10 bg-black/20 hover:border-plex/30'
                            }`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-bold text-sm truncate flex items-center gap-2">
                                        {unreadOn(ticket) && <span className="w-2 h-2 rounded-full bg-plex shrink-0" />}
                                        {ticket.subject}
                                    </p>
                                    <p className="text-[11px] text-muted mt-1 truncate">
                                        {isAdmin ? ticket.createdBy?.displayName : ticket.categoryLabel}
                                        {' · '}
                                        {ticket.commentCount} {ticket.commentCount === 1 ? 'message' : 'messages'}
                                    </p>
                                </div>
                                <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border shrink-0 ${issueStatusBadgeClass(ticket.statusLabel)}`}>
                                    {ticket.statusLabel}
                                </span>
                            </div>
                        </button>
                    ))}
                </div>

                <div className="glass-card p-5 min-h-[22rem]">
                    {!active ? (
                        <div className="h-full flex flex-col items-center justify-center text-center text-muted py-10">
                            <MessageSquare className="w-8 h-8 mb-3 opacity-60" />
                            <p className="text-sm">Select a ticket to read the conversation.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h2 className="text-lg font-black text-text">{active.subject}</h2>
                                    <p className="text-xs text-muted mt-1">
                                        {active.categoryLabel} · {active.createdBy?.displayName}
                                        {active.createdAt ? ` · ${formatDateTime(active.createdAt)}` : ''}
                                    </p>
                                </div>
                                <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border shrink-0 ${issueStatusBadgeClass(active.statusLabel)}`}>
                                    {active.statusLabel}
                                </span>
                            </div>
                            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                                {(active.comments || []).map((comment) => (
                                    <div
                                        key={comment.id}
                                        className={`rounded-xl border px-3 py-2.5 ${
                                            comment.user?.isAdmin ? 'border-plex/30 bg-plex/5' : 'border-white/10 bg-black/20'
                                        }`}
                                    >
                                        <p className="text-[11px] font-bold text-muted">
                                            {comment.user?.displayName}
                                            {comment.user?.isAdmin ? ' · Admin' : ''}
                                            {comment.createdAt ? ` · ${formatDateTime(comment.createdAt)}` : ''}
                                        </p>
                                        <p className="text-sm text-text mt-1 whitespace-pre-wrap">{comment.message}</p>
                                    </div>
                                ))}
                            </div>
                            {active.statusLabel !== 'closed' && (
                                <div className="flex gap-2">
                                    <textarea
                                        value={reply}
                                        onChange={(e) => setReply(e.target.value)}
                                        rows={3}
                                        placeholder="Write a reply…"
                                        className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-text outline-none focus:border-plex/50"
                                    />
                                    <button
                                        type="button"
                                        disabled={busy || !reply.trim()}
                                        onClick={() => { void sendReply(); }}
                                        className="self-end px-3 py-2 rounded-xl bg-plex text-background font-bold disabled:opacity-40"
                                    >
                                        <Send className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                            <div className="flex flex-wrap gap-2">
                                {isAdmin && active.statusLabel !== 'resolved' && (
                                    <button type="button" disabled={busy} onClick={() => { void setStatus('resolved'); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:border-plex/40">
                                        <Check className="w-3.5 h-3.5" /> Resolve
                                    </button>
                                )}
                                {active.statusLabel !== 'open' && (
                                    <button type="button" disabled={busy} onClick={() => { void setStatus('open'); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:border-plex/40">
                                        <RotateCcw className="w-3.5 h-3.5" /> Reopen
                                    </button>
                                )}
                                {active.statusLabel !== 'closed' && (
                                    <button type="button" disabled={busy} onClick={() => { void setStatus('closed'); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:border-plex/40">
                                        <X className="w-3.5 h-3.5" /> Close
                                    </button>
                                )}
                                {isAdmin && (
                                    <button type="button" disabled={busy} onClick={() => { void deleteTicket(); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 text-xs font-semibold text-red-300 hover:border-red-400/50 ml-auto">
                                        <Trash2 className="w-3.5 h-3.5" /> Delete
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {composeOpen && (
                <div className="fixed inset-0 z-[220] flex items-end sm:items-center justify-center p-0 sm:p-5">
                    <button type="button" className="absolute inset-0 bg-black/70" aria-label="Close" onClick={() => setComposeOpen(false)} />
                    <form
                        onSubmit={submitTicket}
                        className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border border-white/10 bg-[#12141a] p-5 space-y-3"
                    >
                        <h2 className="text-lg font-black text-text">New support ticket</h2>
                        <label className="block text-xs font-bold text-muted uppercase tracking-wide">
                            Category
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="mt-1 w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-text"
                            >
                                {categories.map((item) => (
                                    <option key={item.id} value={item.id}>{item.label}</option>
                                ))}
                            </select>
                        </label>
                        <label className="block text-xs font-bold text-muted uppercase tracking-wide">
                            Subject
                            <input
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                className="mt-1 w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-text"
                                placeholder="Short summary"
                                required
                            />
                        </label>
                        <label className="block text-xs font-bold text-muted uppercase tracking-wide">
                            Message
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                rows={5}
                                className="mt-1 w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-text"
                                placeholder="What do you need help with?"
                                required
                            />
                        </label>
                        <div className="flex justify-end gap-2 pt-1">
                            <button type="button" onClick={() => setComposeOpen(false)} className="px-3 py-2 rounded-xl border border-border text-sm font-semibold">Cancel</button>
                            <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-plex text-background text-sm font-bold disabled:opacity-50">
                                {saving ? 'Sending…' : 'Send'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </DashboardPageShell>
    );
};

export default SupportInbox;
