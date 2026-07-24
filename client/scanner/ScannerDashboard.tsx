import React, { useCallback, useEffect, useState } from 'react';
import {
    ArrowUpCircle,
    Clock3,
    Copy,
    FileMinus2,
    FolderInput,
    Layers,
    ListTodo,
    Loader2,
    Radar,
    RefreshCw,
    Send,
    Target,
    Wand2,
} from 'lucide-react';
import { apiFetch } from '../shared/api';
import { portalUrl } from '../shared/basePath';
import {
    formatScannerWhen,
    scannerActionStyles,
} from './eventMeta';
import { ScannerSourceBadge } from './ScannerSourceBadge';

type ScannerStatus = {
    enabled: boolean;
    minimumAge: string;
    verifyPathExists: boolean;
    remaining: number;
    processed: number;
    targetCount: number;
    webhookPaths: {
        manual: string;
        sonarr: string[];
        radarr: string[];
        lidarr: string[];
    };
};

type LogEntry = {
    at?: string;
    ok?: boolean;
    folder?: string;
    source?: string;
    error?: string;
    results?: any[];
    eventType?: string;
    action?: string;
    reason?: string;
    title?: string;
    quality?: string;
    isUpgrade?: boolean;
};

type QueueItem = {
    folder: string;
    priority?: number;
    time?: string;
    source?: string;
    eventType?: string;
    action?: string;
    reason?: string;
    title?: string;
    quality?: string;
    isUpgrade?: boolean;
};

const ActionIcon: React.FC<{ action?: string; className?: string }> = ({ action, className }) => {
    const key = String(action || '').toLowerCase();
    if (key === 'upgrade') return <ArrowUpCircle className={className} />;
    if (key.includes('delete')) return <FileMinus2 className={className} />;
    if (key === 'rename') return <Wand2 className={className} />;
    if (key === 'manual') return <FolderInput className={className} />;
    if (key === 'import') return <FolderInput className={className} />;
    return <Radar className={className} />;
};

const StatCard: React.FC<{
    label: string;
    value: React.ReactNode;
    hint?: string;
    icon: React.ReactNode;
    tone: string;
}> = ({ label, value, hint, icon, tone }) => (
    <div className={`relative overflow-hidden rounded-2xl border px-4 py-4 ${tone}`}>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent" />
        <div className="relative flex items-start justify-between gap-3">
            <div>
                <p className="text-[10px] uppercase tracking-[0.18em] font-bold opacity-80">{label}</p>
                <p className="text-2xl md:text-3xl font-black tracking-tight mt-1.5">{value}</p>
                {hint ? <p className="text-[11px] mt-1.5 opacity-70">{hint}</p> : null}
            </div>
            <div className="w-9 h-9 rounded-xl bg-black/20 border border-white/10 flex items-center justify-center shrink-0">
                {icon}
            </div>
        </div>
    </div>
);

export const ScannerDashboard: React.FC = () => {
    const [path, setPath] = useState('');
    const [status, setStatus] = useState<ScannerStatus | null>(null);
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [log, setLog] = useState<LogEntry[]>([]);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            const [st, q, lg] = await Promise.all([
                apiFetch('/api/scanner/status'),
                apiFetch('/api/scanner/queue'),
                apiFetch('/api/scanner/log?limit=40'),
            ]);
            setStatus(st);
            setQueue(Array.isArray(q?.scans) ? q.scans : []);
            setLog(Array.isArray(lg?.entries) ? lg.entries : []);
            setError(null);
        } catch (e: any) {
            setError(e?.message || 'Failed to load scanner');
        }
    }, []);

    useEffect(() => {
        void refresh();
        const id = window.setInterval(() => { void refresh(); }, 8000);
        return () => window.clearInterval(id);
    }, [refresh]);

    const submitPath = async (e: React.FormEvent) => {
        e.preventDefault();
        const value = path.trim();
        if (!value) return;
        setBusy(true);
        setMessage(null);
        setError(null);
        try {
            const res = await apiFetch('/api/scanner/manual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: value }),
            });
            setMessage(`Queued: ${res.folder || value}`);
            setPath('');
            await refresh();
        } catch (err: any) {
            setError(err?.message || 'Failed to queue path');
        } finally {
            setBusy(false);
        }
    };

    const copyText = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setMessage('Copied to clipboard');
        } catch {
            setMessage(text);
        }
    };

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const webhookUrl = (p: string) => `${origin}${portalUrl(p)}`;
    const webhookRows = [
        ...(status?.webhookPaths?.sonarr || ['/triggers/sonarr']).map((p) => ({ label: 'Sonarr', key: 'sonarr', tone: 'text-sky-300', path: p })),
        ...(status?.webhookPaths?.radarr || ['/triggers/radarr']).map((p) => ({ label: 'Radarr', key: 'radarr', tone: 'text-amber-300', path: p })),
        ...(status?.webhookPaths?.lidarr || ['/triggers/lidarr']).map((p) => ({ label: 'Lidarr', key: 'lidarr', tone: 'text-violet-300', path: p })),
        { label: 'Manual', key: 'manual', tone: 'text-emerald-300', path: status?.webhookPaths?.manual || '/triggers/manual' },
    ];

    return (
        <div className="w-full flex flex-col gap-6 pb-10 animate-fade-in">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-sky-500/10 via-background/40 to-plex/10 p-5 md:p-6">
                <div className="pointer-events-none absolute -top-16 -right-10 w-56 h-56 rounded-full bg-sky-400/10 blur-3xl" />
                <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
                    <div className="min-w-0">
                        <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300/90 mb-3">
                            <span className="w-7 h-7 rounded-lg bg-sky-500/15 border border-sky-400/30 inline-flex items-center justify-center">
                                <Radar className="w-3.5 h-3.5" />
                            </span>
                            Library Scanner
                        </div>
                        <h1 className="text-3xl md:text-4xl font-black text-text tracking-tight">Refresh with precision</h1>
                        <p className="text-muted mt-2 text-sm md:text-[15px] max-w-2xl leading-relaxed">
                            Queue a folder for a partial library refresh on Plex, Jellyfin, or Emby.
                            ARR webhooks land here automatically as imports, upgrades, deletes, and renames.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void refresh()}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 bg-black/20 text-sm font-semibold text-muted hover:text-text hover:bg-white/5 transition-colors self-start lg:self-auto"
                    >
                        <RefreshCw className="w-4 h-4" /> Refresh
                    </button>
                </div>
            </div>

            <form onSubmit={submitPath} className="glass-card p-4 md:p-5 shadow-xl space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-bold uppercase tracking-wider text-muted">Manual path</h2>
                        <p className="text-xs text-muted/80 mt-0.5">Add a folder now — processed after the minimum age.</p>
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                    <input
                        type="text"
                        value={path}
                        onChange={(e) => setPath(e.target.value)}
                        placeholder="Path to scan e.g. /mnt/unionfs/Media/Movies/Movie Name (year)"
                        className="flex-1 rounded-xl bg-background/70 border border-white/10 px-4 py-3 text-text placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
                    />
                    <button
                        type="submit"
                        disabled={busy || !path.trim()}
                        className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-sky-400 text-black font-bold disabled:opacity-50 hover:bg-sky-300 transition-colors"
                    >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Submit
                    </button>
                </div>
                <div className="rounded-xl bg-sky-500/10 border border-sky-400/20 text-sky-100/95 text-sm px-4 py-3 leading-relaxed">
                    Submit adds the path to the scan queue
                    {status?.minimumAge ? <> · waits <code className="text-sky-200">{status.minimumAge}</code> before targets are called</> : null}.
                </div>
            </form>

            {(message || error) && (
                <div className={`rounded-xl px-4 py-3 text-sm border ${error ? 'bg-red-500/10 text-red-200 border-red-400/20' : 'bg-emerald-500/10 text-emerald-100 border-emerald-400/20'}`}>
                    {error || message}
                </div>
            )}

            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
                <StatCard
                    label="Queued"
                    value={status?.remaining ?? '—'}
                    hint="Waiting for min age"
                    icon={<ListTodo className="w-4 h-4 text-amber-200" />}
                    tone="border-amber-400/30 bg-amber-500/10 text-amber-50"
                />
                <StatCard
                    label="Processed"
                    value={status?.processed ?? '—'}
                    hint="Successful refreshes"
                    icon={<Layers className="w-4 h-4 text-emerald-200" />}
                    tone="border-emerald-400/30 bg-emerald-500/10 text-emerald-50"
                />
                <StatCard
                    label="Targets"
                    value={status?.targetCount ?? '—'}
                    hint="Plex / JF / Emby"
                    icon={<Target className="w-4 h-4 text-violet-200" />}
                    tone="border-violet-400/30 bg-violet-500/10 text-violet-50"
                />
                <StatCard
                    label="Min age"
                    value={status?.minimumAge ?? '—'}
                    hint="Delay before scan"
                    icon={<Clock3 className="w-4 h-4 text-sky-200" />}
                    tone="border-sky-400/30 bg-sky-500/10 text-sky-50"
                />
            </div>

            <section className="glass-card p-4 md:p-5 shadow-xl space-y-4">
                <div>
                    <h2 className="text-lg font-bold text-text tracking-tight">ARR webhooks</h2>
                    <p className="text-sm text-muted mt-1 leading-relaxed">
                        In Sonarr / Radarr / Lidarr: Settings → Connect → Webhook → On Import + On Upgrade
                        (and delete/rename if you want those too). Use Basic Auth from Settings → Scanner.
                    </p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                    {webhookRows.map((row) => {
                        const full = webhookUrl(row.path);
                        return (
                            <div
                                key={`${row.label}-${row.path}`}
                                className="group flex items-center gap-3 rounded-xl border border-white/10 bg-black/25 hover:bg-black/35 px-3.5 py-3 transition-colors"
                            >
                                <ScannerSourceBadge source={row.key} className={`w-[5.5rem] shrink-0 ${row.tone}`} />
                                <code className="flex-1 text-xs text-text/85 truncate font-mono">{full}</code>
                                <button
                                    type="button"
                                    onClick={() => void copyText(full)}
                                    className="p-2 rounded-lg border border-transparent text-muted hover:text-text hover:bg-white/10 hover:border-white/10 transition-colors"
                                    title="Copy"
                                >
                                    <Copy className="w-4 h-4" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            </section>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-5">
                <section className="glass-card p-4 md:p-5 shadow-xl space-y-4 min-h-[16rem]">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-bold text-text tracking-tight">Queue</h2>
                            <p className="text-xs text-muted mt-0.5">Paths waiting for the minimum age.</p>
                        </div>
                        <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border border-amber-400/25 bg-amber-500/10 text-amber-200">
                            {queue.length} pending
                        </span>
                    </div>
                    {queue.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-10 text-center">
                            <p className="text-sm text-muted">Queue is empty — waiting for the next webhook or manual path.</p>
                        </div>
                    ) : (
                        <ul className="space-y-2.5">
                            {queue.map((item) => {
                                const style = scannerActionStyles(item.action || item.reason, item.isUpgrade);
                                return (
                                    <li
                                        key={`${item.folder}-${item.time}`}
                                        className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent px-3.5 py-3"
                                    >
                                        <div className="flex flex-wrap items-center gap-2 mb-2">
                                            <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${style.className}`}>
                                                <ActionIcon action={item.action} className="w-3 h-3" />
                                                {item.reason || style.label}
                                            </span>
                                            <ScannerSourceBadge source={item.source} />
                                            <span className="text-[10px] text-muted ml-auto">P{item.priority ?? 0}</span>
                                        </div>
                                        {item.title ? <p className="text-sm font-semibold text-text mb-1">{item.title}</p> : null}
                                        <p className="text-xs text-text/80 break-all font-mono leading-relaxed" title={item.folder}>
                                            {item.folder}
                                        </p>
                                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-muted">
                                            <span>{formatScannerWhen(item.time)}</span>
                                            {item.quality ? <span>{item.quality}</span> : null}
                                            {item.eventType ? <span className="opacity-70">{item.eventType}</span> : null}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>

                <section className="glass-card p-4 md:p-5 shadow-xl space-y-4 min-h-[16rem]">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-bold text-text tracking-tight">Recent activity</h2>
                            <p className="text-xs text-muted mt-0.5">Why each refresh ran, and how it finished.</p>
                        </div>
                        <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border border-emerald-400/25 bg-emerald-500/10 text-emerald-200">
                            {log.length} events
                        </span>
                    </div>
                    {log.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-10 text-center">
                            <p className="text-sm text-muted">No scans processed yet.</p>
                        </div>
                    ) : (
                        <ul className="space-y-2.5">
                            {log.map((entry, i) => {
                                const style = scannerActionStyles(entry.action || entry.reason, entry.isUpgrade);
                                const targets = Array.isArray(entry.results) ? entry.results : [];
                                return (
                                    <li
                                        key={`${entry.at}-${i}`}
                                        className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent px-3.5 py-3"
                                    >
                                        <div className="flex flex-wrap items-center gap-2 mb-2">
                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                                entry.ok
                                                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
                                                    : 'bg-red-500/15 text-red-300 border-red-400/30'
                                            }`}>
                                                {entry.ok ? 'OK' : 'Error'}
                                            </span>
                                            <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${style.className}`}>
                                                <ActionIcon action={entry.action} className="w-3 h-3" />
                                                {entry.reason || style.label}
                                            </span>
                                            <ScannerSourceBadge source={entry.source} />
                                            <span className="text-[10px] text-muted ml-auto">{formatScannerWhen(entry.at)}</span>
                                        </div>
                                        {entry.title ? <p className="text-sm font-semibold text-text mb-1">{entry.title}</p> : null}
                                        <p className="text-xs text-text/85 break-all font-mono leading-relaxed" title={entry.folder}>
                                            {entry.folder}
                                        </p>
                                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-muted">
                                            {entry.quality ? <span>{entry.quality}</span> : null}
                                            {entry.eventType ? <span>{entry.eventType}</span> : null}
                                            {targets.length > 0 ? (
                                                <span>
                                                    {targets.map((r: any) => (
                                                        r?.skipped
                                                            ? `${r.type}: skipped`
                                                            : `${r.type}: refreshed`
                                                    )).join(' · ')}
                                                </span>
                                            ) : null}
                                        </div>
                                        {entry.error ? <p className="text-xs text-red-200 mt-2">{entry.error}</p> : null}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            </div>
        </div>
    );
};

export default ScannerDashboard;
