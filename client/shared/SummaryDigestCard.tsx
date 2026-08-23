import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    Activity,
    BarChart3,
    Clapperboard,
    Cpu,
    Layers,
    Radar,
    RefreshCw,
    Server,
    X,
} from 'lucide-react';
import { apiFetch } from './api';
import { portalUrl } from './basePath';

export type SummaryDigest = {
    id: string;
    createdAt?: string;
    frequency?: string;
    periodLabel?: string;
    periodStart?: string;
    periodEnd?: string;
    metrics?: {
        uptime?: {
            aggregatePct?: number | null;
            plex?: { label?: string; uptimePct?: number | null } | null;
            sonarr?: { label?: string; uptimePct?: number | null } | null;
            radarr?: { label?: string; uptimePct?: number | null } | null;
            services?: Array<{ id?: string; label?: string; uptimePct?: number | null }>;
        };
        requests?: {
            made?: number;
            approved?: number;
            declined?: number;
            available?: number;
        };
        scannerImports?: number;
        collexionsRotations?: number;
        mediaAutomationJobs?: number;
    };
    highlights?: Array<{
        kind?: string;
        title?: string;
        subtitle?: string;
        at?: string;
    }>;
};

const formatPct = (value?: number | null) => (
    value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(2)}%`
);

const formatWhen = (iso?: string) => {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
};

const MetricTile: React.FC<{
    label: string;
    value: string;
    hint?: string;
    tone?: 'default' | 'success' | 'accent';
}> = ({ label, value, hint, tone = 'default' }) => {
    const valueClass = tone === 'success'
        ? 'text-emerald-300'
        : tone === 'accent'
            ? 'text-plex'
            : 'text-text';
    return (
        <div className="rounded-xl border border-border/70 bg-background/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <p className="text-[11px] uppercase tracking-wider font-bold text-muted">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${valueClass}`}>{value}</p>
            {hint ? <p className="mt-1 text-xs text-muted/80">{hint}</p> : null}
        </div>
    );
};

const UptimeRow: React.FC<{ label: string; value?: number | null }> = ({ label, value }) => (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-border/50 last:border-b-0">
        <span className="text-sm text-text/90">{label}</span>
        <span className="text-sm font-bold text-emerald-300">{formatPct(value)}</span>
    </div>
);

type Props = {
    digestId?: string | null;
    onClose: () => void;
};

export const SummaryDigestCard: React.FC<Props> = ({ digestId = 'latest', onClose }) => {
    const [digest, setDigest] = useState<SummaryDigest | null>(null);
    const [history, setHistory] = useState<SummaryDigest[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async (targetId = digestId || 'latest') => {
        setLoading(true);
        setError('');
        try {
            const [digestRes, historyRes] = await Promise.all([
                apiFetch(targetId === 'latest' ? '/api/admin/summary-digest/latest' : `/api/admin/summary-digest/${encodeURIComponent(targetId)}`),
                apiFetch('/api/admin/summary-digest/history?limit=7'),
            ]);
            setDigest(digestRes);
            setHistory(Array.isArray(historyRes?.items) ? historyRes.items : []);
        } catch (e: any) {
            setError(e?.message || 'Failed to load summary digest.');
            setDigest(null);
        } finally {
            setLoading(false);
        }
    }, [digestId]);

    useEffect(() => {
        void load();
    }, [load]);

    const uptimeRows = useMemo(() => {
        const uptime = digest?.metrics?.uptime;
        const rows: Array<{ label: string; value?: number | null }> = [];
        if (uptime?.plex) rows.push({ label: uptime.plex.label || 'Plex', value: uptime.plex.uptimePct });
        if (uptime?.sonarr) rows.push({ label: uptime.sonarr.label || 'Sonarr', value: uptime.sonarr.uptimePct });
        if (uptime?.radarr) rows.push({ label: uptime.radarr.label || 'Radarr', value: uptime.radarr.uptimePct });
        for (const row of uptime?.services || []) {
            if (rows.some((entry) => entry.label === row.label)) continue;
            rows.push({ label: row.label || 'Service', value: row.uptimePct });
        }
        return rows.slice(0, 8);
    }, [digest]);

    const close = () => {
        try {
            const url = new URL(window.location.href);
            url.searchParams.delete('summary');
            window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
        } catch {
            // ignore
        }
        onClose();
    };

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const requests = digest?.metrics?.requests || {};

    const modal = (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 sm:p-6">
            <button
                type="button"
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                aria-label="Close summary"
                onClick={close}
            />
            <div className="relative w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl border border-border/80 bg-card/95 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl flex flex-col">
                <div className="flex items-start justify-between gap-4 border-b border-border/70 px-5 py-4 sm:px-6">
                    <div>
                        <div className="flex items-center gap-2 text-plex">
                            <BarChart3 className="w-5 h-5" />
                            <p className="text-xs font-bold uppercase tracking-wider">Smart summary</p>
                        </div>
                        <h2 className="mt-1 text-xl sm:text-2xl font-bold text-text">
                            {digest?.periodLabel || 'Server summary'}
                        </h2>
                        <p className="mt-1 text-sm text-muted">
                            {digest?.periodStart && digest?.periodEnd
                                ? `${formatWhen(digest.periodStart)} → ${formatWhen(digest.periodEnd)}`
                                : 'Snapshot of server health and activity'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={close}
                        className="rounded-lg border border-border p-2 text-muted hover:text-text hover:bg-white/5 transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {loading ? (
                        <div className="flex items-center justify-center py-20 text-muted">
                            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                            Loading summary…
                        </div>
                    ) : error ? (
                        <div className="p-6 text-center text-rose-300">{error}</div>
                    ) : digest ? (
                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-0 lg:gap-6 p-5 sm:p-6">
                            <div className="space-y-6 min-w-0">
                                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                                    <MetricTile
                                        label="Requests made"
                                        value={String(requests.made ?? 0)}
                                        hint="New requests in period"
                                        tone="accent"
                                    />
                                    <MetricTile
                                        label="Approved"
                                        value={String(requests.approved ?? 0)}
                                        hint="Approved or processing"
                                        tone="success"
                                    />
                                    <MetricTile
                                        label="Available"
                                        value={String(requests.available ?? 0)}
                                        hint="Ready to watch"
                                    />
                                    <MetricTile
                                        label="Aggregate uptime"
                                        value={formatPct(digest.metrics?.uptime?.aggregatePct)}
                                        hint="Monitored services"
                                        tone="success"
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <section className="rounded-2xl border border-border/70 bg-background/30 p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Server className="w-4 h-4 text-plex" />
                                            <h3 className="text-sm font-bold text-text">Service uptime</h3>
                                        </div>
                                        {uptimeRows.length ? uptimeRows.map((row) => (
                                            <UptimeRow key={row.label} label={row.label} value={row.value} />
                                        )) : (
                                            <p className="text-sm text-muted">No uptime samples for this period.</p>
                                        )}
                                    </section>

                                    <section className="rounded-2xl border border-border/70 bg-background/30 p-4 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <Activity className="w-4 h-4 text-plex" />
                                            <h3 className="text-sm font-bold text-text">Automation activity</h3>
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 text-sm">
                                            <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                                                <span className="flex items-center gap-2 text-muted"><Radar className="w-4 h-4" /> Scanner imports</span>
                                                <span className="font-bold text-text">{digest.metrics?.scannerImports ?? 0}</span>
                                            </div>
                                            <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                                                <span className="flex items-center gap-2 text-muted"><Layers className="w-4 h-4" /> ColleXions rotations</span>
                                                <span className="font-bold text-text">{digest.metrics?.collexionsRotations ?? 0}</span>
                                            </div>
                                            <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                                                <span className="flex items-center gap-2 text-muted"><Cpu className="w-4 h-4" /> Media automation jobs</span>
                                                <span className="font-bold text-text">{digest.metrics?.mediaAutomationJobs ?? 0}</span>
                                            </div>
                                        </div>
                                    </section>
                                </div>

                                {digest.highlights?.length ? (
                                    <section className="rounded-2xl border border-border/70 bg-background/30 p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Clapperboard className="w-4 h-4 text-plex" />
                                            <h3 className="text-sm font-bold text-text">Highlights</h3>
                                        </div>
                                        <div className="space-y-2">
                                            {digest.highlights.map((item, index) => (
                                                <div key={`${item.title}-${index}`} className="rounded-lg border border-border/50 bg-white/[0.02] px-3 py-2">
                                                    <p className="text-sm font-semibold text-text">{item.title}</p>
                                                    {item.subtitle ? <p className="text-xs text-muted mt-0.5">{item.subtitle}</p> : null}
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                ) : null}
                            </div>

                            <aside className="border-t lg:border-t-0 lg:border-l border-border/60 pt-4 lg:pt-0 lg:pl-4">
                                <p className="text-[11px] uppercase tracking-wider font-bold text-muted mb-2">Recent summaries</p>
                                <div className="space-y-2">
                                    {history.map((item) => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => {
                                                void load(item.id);
                                                try {
                                                    const url = new URL(window.location.href);
                                                    url.searchParams.set('summary', item.id);
                                                    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
                                                } catch {
                                                    // ignore
                                                }
                                            }}
                                            className={`w-full text-left rounded-xl border px-3 py-2 transition-colors ${
                                                item.id === digest.id
                                                    ? 'border-plex/40 bg-plex/10'
                                                    : 'border-border/60 hover:border-plex/30 hover:bg-white/[0.03]'
                                            }`}
                                        >
                                            <p className="text-sm font-semibold text-text">{item.periodLabel || 'Summary'}</p>
                                            <p className="text-[11px] text-muted mt-0.5">{formatWhen(item.createdAt)}</p>
                                        </button>
                                    ))}
                                    {!history.length ? (
                                        <p className="text-xs text-muted">No previous summaries yet.</p>
                                    ) : null}
                                </div>
                            </aside>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );

    return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal;
};

export const openSummaryDigestFromUrl = () => {
    try {
        const id = new URLSearchParams(window.location.search).get('summary');
        if (!id) return null;
        return id;
    } catch {
        return null;
    }
};

export const navigateToSummaryDigest = (digestId: string) => {
    const href = portalUrl(`/portal?summary=${encodeURIComponent(digestId)}`);
    window.history.pushState({}, '', href);
    window.dispatchEvent(new CustomEvent('portal-summary-open', { detail: { digestId } }));
};
