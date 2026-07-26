import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock3, ListTodo, Radar, RefreshCw, Target } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { formatScannerWhen, scannerActionStyles, shortenScannerPath } from './eventMeta';
import { ScannerSourceBadge } from './ScannerSourceBadge';

type ScannerStatus = {
    enabled?: boolean;
    remaining?: number;
    processed?: number;
    targetCount?: number;
    minimumAge?: string;
    lastActivity?: {
        at?: string;
        ok?: boolean;
        folder?: string;
        source?: string;
        error?: string;
        reason?: string;
        action?: string;
        title?: string;
        isUpgrade?: boolean;
    } | null;
};

type Props = {
    onOpen?: () => void;
};

export const ScannerHomeWidget: React.FC<Props> = ({ onOpen }) => {
    const [status, setStatus] = useState<ScannerStatus | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await apiFetch('/api/scanner/status');
            setStatus(data || null);
        } catch (e: any) {
            setError(e?.message || 'Unavailable');
            setStatus(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
        const id = window.setInterval(() => { void load(); }, 15000);
        return () => window.clearInterval(id);
    }, [load]);

    const remaining = status?.remaining ?? 0;
    const processed = status?.processed ?? 0;
    const targets = status?.targetCount ?? 0;
    const last = status?.lastActivity;
    const active = !!status?.enabled;
    const lastStyle = scannerActionStyles(last?.action || last?.reason, last?.isUpgrade);

    return (
        <div className="glass-card p-4 md:p-5 shadow-xl w-full overflow-hidden">
            <div className="flex flex-col gap-4">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
                    <div className="flex items-center justify-between gap-3 lg:min-w-[14rem] shrink-0">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center shrink-0">
                                <Radar className="w-5 h-5 text-sky-300" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-muted text-[10px] uppercase tracking-widest font-bold">Scanner</p>
                                <p className="text-text font-bold text-base truncate">Library refresh</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 lg:hidden">
                            <button
                                type="button"
                                onClick={() => { void load(); }}
                                className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-white/5 transition-colors"
                                title="Refresh"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                    </div>

                    {error && !status ? (
                        <p className="text-xs text-red-300/90 flex-1">{error}</p>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1 min-w-0">
                            <div className="rounded-xl bg-amber-500/10 border border-amber-400/25 px-3 py-2.5 flex items-center gap-2.5">
                                <ListTodo className="w-4 h-4 text-amber-300 shrink-0" />
                                <div>
                                    <p className="text-lg font-black text-amber-50 leading-none">{remaining}</p>
                                    <p className="text-[9px] uppercase tracking-wider font-bold text-amber-200/80 mt-1">Queued</p>
                                </div>
                            </div>
                            <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/25 px-3 py-2.5 flex items-center gap-2.5">
                                <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                                <div>
                                    <p className="text-lg font-black text-emerald-50 leading-none">{processed}</p>
                                    <p className="text-[9px] uppercase tracking-wider font-bold text-emerald-200/80 mt-1">Processed</p>
                                </div>
                            </div>
                            <div className="rounded-xl bg-violet-500/10 border border-violet-400/25 px-3 py-2.5 flex items-center gap-2.5">
                                <Target className="w-4 h-4 text-violet-300 shrink-0" />
                                <div>
                                    <p className="text-lg font-black text-violet-50 leading-none">{targets}</p>
                                    <p className="text-[9px] uppercase tracking-wider font-bold text-violet-200/80 mt-1">Targets</p>
                                </div>
                            </div>
                            <div className="rounded-xl bg-sky-500/10 border border-sky-400/25 px-3 py-2.5 flex items-center gap-2.5">
                                <Clock3 className="w-4 h-4 text-sky-300 shrink-0" />
                                <div>
                                    <p className="text-lg font-black text-sky-50 leading-none">{status?.minimumAge ?? '—'}</p>
                                    <p className="text-[9px] uppercase tracking-wider font-bold text-sky-200/80 mt-1">Min age</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="hidden lg:flex items-center gap-2 shrink-0">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                            active
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                : 'bg-white/5 border-white/10 text-muted'
                        }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-400 animate-pulse' : 'bg-muted'}`} />
                            {active ? 'Armed' : 'Idle'}
                        </span>
                        <button
                            type="button"
                            onClick={() => { void load(); }}
                            className="p-2 rounded-lg text-muted hover:text-text hover:bg-white/5 transition-colors"
                            title="Refresh"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        {onOpen ? (
                            <button
                                type="button"
                                onClick={onOpen}
                                className="text-xs font-bold text-sky-300 hover:underline px-1"
                            >
                                Open
                            </button>
                        ) : null}
                    </div>
                </div>

                <div className="rounded-xl bg-black/25 border border-white/5 px-3.5 py-3">
                    <p className="text-[9px] uppercase tracking-wider font-bold text-muted mb-2.5">Latest activity</p>
                    {last ? (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,11rem)_minmax(0,1.2fr)_minmax(0,1fr)] md:items-center md:gap-4">
                            <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                                <span className={`text-[10px] font-bold uppercase ${last.ok ? 'text-emerald-300' : 'text-red-300'}`}>
                                    {last.ok ? 'ok' : 'error'}
                                </span>
                                {(last.reason || last.action) ? (
                                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${lastStyle.className}`}>
                                        {last.reason || lastStyle.label}
                                    </span>
                                ) : null}
                                <span className="text-[10px] text-muted">{formatScannerWhen(last.at)}</span>
                                <ScannerSourceBadge source={last.source} />
                            </div>
                            <div className="min-w-0">
                                {last.title ? (
                                    <p className="text-sm text-text font-semibold truncate" title={last.title}>{last.title}</p>
                                ) : (
                                    <p className="text-sm text-muted">No title reported</p>
                                )}
                                {last.error ? <p className="text-[10px] text-red-200/90 mt-1 truncate" title={last.error}>{last.error}</p> : null}
                            </div>
                            <div className="min-w-0 md:text-right">
                                <p className="text-xs text-muted font-medium truncate md:whitespace-nowrap" title={last.folder}>
                                    {shortenScannerPath(last.folder, 5)}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <p className="text-xs text-muted">Waiting for the next webhook or manual scan.</p>
                    )}
                </div>

                <div className="flex items-center justify-between gap-2 lg:hidden">
                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${
                        active
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-white/5 border-white/10 text-muted'
                    }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-400 animate-pulse' : 'bg-muted'}`} />
                        {active ? 'Armed' : 'Idle'}
                        {status?.minimumAge ? ` · ${status.minimumAge}` : ''}
                    </span>
                    {onOpen ? (
                        <button
                            type="button"
                            onClick={onOpen}
                            className="text-xs font-bold text-sky-300 hover:underline"
                        >
                            Open
                        </button>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

export default ScannerHomeWidget;
