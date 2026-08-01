import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Layers, Pin, RefreshCw, Clock, CalendarClock } from 'lucide-react';
import { api } from './api';

export type CollexionsSummary = {
    status?: string;
    last_update?: string;
    last_run_at?: string | null;
    next_run_timestamp?: number;
    pinned_count?: number | null;
    labeled_count?: number;
    pin_slots?: number;
};

type Props = {
    onOpen?: () => void;
};

const formatRelative = (tsSeconds: number): string => {
    const diffMs = tsSeconds * 1000 - Date.now();
    const abs = Math.abs(diffMs);
    const mins = Math.round(abs / 60000);
    if (mins < 1) return diffMs >= 0 ? 'now' : 'just now';
    if (mins < 60) return diffMs >= 0 ? `in ${mins}m` : `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 48) return diffMs >= 0 ? `in ${hours}h` : `${hours}h ago`;
    const days = Math.round(hours / 24);
    return diffMs >= 0 ? `in ${days}d` : `${days}d ago`;
};

const formatLastRun = (raw?: string): string => {
    if (!raw) return '—';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

export const CollexionsHomeWidget: React.FC<Props> = ({ onOpen }) => {
    const [summary, setSummary] = useState<CollexionsSummary | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const loadGenRef = useRef(0);

    const load = useCallback(async () => {
        const gen = ++loadGenRef.current;
        setLoading(true);
        setError('');
        try {
            const data = await api.getSummary();
            if (gen !== loadGenRef.current) return;
            setSummary(data || null);
        } catch (e: any) {
            if (gen !== loadGenRef.current) return;
            setError(e?.message || 'Unavailable');
            setSummary(null);
        } finally {
            if (gen === loadGenRef.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
        const id = window.setInterval(() => { void load(); }, 60000);
        return () => window.clearInterval(id);
    }, [load]);

    const status = summary?.status || 'Unknown';
    const statusLower = status.toLowerCase();
    const active = /running|sleeping|processing|waiting/.test(statusLower);
    const nextTs = Number(summary?.next_run_timestamp) || 0;
    const pinned = summary?.pinned_count;
    const slots = summary?.pin_slots;

    return (
        <div className="glass-card p-4 md:p-5 shadow-xl w-full self-start">
            <div className="flex items-center justify-between gap-2 mb-3 md:mb-4">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-plex/15 border border-plex/30 flex items-center justify-center shrink-0">
                        <Layers className="w-4 h-4 text-plex" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-muted text-[10px] uppercase tracking-widest font-bold">ColleXions</p>
                        <p className="text-text font-bold text-sm truncate">Collection pinning</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => { void load(); }}
                    className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-white/5 transition-colors"
                    title="Refresh"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {error && !summary ? (
                <p className="text-xs text-red-300/90 mb-3">{error}</p>
            ) : (
                <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="rounded-xl bg-background/50 border border-white/5 p-2.5 text-center">
                        <Pin className="w-3.5 h-3.5 text-plex mx-auto mb-1 opacity-80" />
                        <p className="text-lg font-black text-text leading-none">
                            {pinned == null ? '—' : pinned}
                        </p>
                        <p className="text-[9px] uppercase tracking-wider font-bold text-muted mt-1">
                            Pinned{typeof slots === 'number' && slots > 0 ? ` / ${slots}` : ''}
                        </p>
                    </div>
                    <div className="rounded-xl bg-background/50 border border-white/5 p-2.5 text-center">
                        <Clock className="w-3.5 h-3.5 text-plex mx-auto mb-1 opacity-80" />
                        <p className="text-[11px] font-bold text-text leading-snug mt-0.5">
                            {formatLastRun(summary?.last_run_at || summary?.last_update)}
                        </p>
                        <p className="text-[9px] uppercase tracking-wider font-bold text-muted mt-1">Last run</p>
                    </div>
                    <div className="rounded-xl bg-background/50 border border-white/5 p-2.5 text-center">
                        <CalendarClock className="w-3.5 h-3.5 text-plex mx-auto mb-1 opacity-80" />
                        <p className="text-[11px] font-bold text-text leading-snug mt-0.5">
                            {nextTs > 0 ? formatRelative(nextTs) : '—'}
                        </p>
                        <p className="text-[9px] uppercase tracking-wider font-bold text-muted mt-1">Next run</p>
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between gap-2">
                <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${
                    active
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-white/5 border-white/10 text-muted'
                }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-400 animate-pulse' : 'bg-muted'}`} />
                    {status}
                </span>
                {onOpen && (
                    <button
                        type="button"
                        onClick={onOpen}
                        className="text-xs font-bold text-plex hover:underline"
                    >
                        Open
                    </button>
                )}
            </div>
        </div>
    );
};
