import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Cpu, ListTodo, RefreshCw, TriangleAlert } from 'lucide-react';
import { mediaAutomationApi } from './api';
import type { MediaAutomationStatus } from './types';

type Props = { onOpen?: () => void };

export const MediaAutomationHomeWidget: React.FC<Props> = ({ onOpen }) => {
    const [status, setStatus] = useState<MediaAutomationStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setStatus(await mediaAutomationApi.status());
            setError('');
        } catch (err: any) {
            setError(err?.message || 'Media Automation unavailable');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
        const timer = window.setInterval(() => void load(), 15000);
        return () => window.clearInterval(timer);
    }, [load]);

    const stats = [
        { label: 'Queued', value: status?.queuedJobs ?? 0, icon: ListTodo, className: 'text-amber-300' },
        { label: 'Active', value: status?.activeJobs ?? 0, icon: Cpu, className: 'text-sky-300' },
        { label: 'Complete', value: status?.completedJobs ?? 0, icon: CheckCircle2, className: 'text-emerald-300' },
        { label: 'Failed', value: status?.failedJobs ?? 0, icon: TriangleAlert, className: 'text-red-300' },
    ];

    return (
        <div className="glass-card p-4 md:p-5 shadow-xl w-full">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="flex items-center gap-3 lg:min-w-[15rem]">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/15">
                        <Cpu className="h-5 w-5 text-violet-300" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Media Automation</p>
                        <p className="font-bold text-text">{status?.paused ? 'Worker paused' : 'Native processing'}</p>
                    </div>
                </div>
                {error && !status ? (
                    <p className="flex-1 text-xs text-red-300">{error}</p>
                ) : (
                    <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
                        {stats.map(({ label, value, icon: Icon, className }) => (
                            <div key={label} className="flex items-center gap-2 rounded-xl border border-border bg-background/40 px-3 py-2.5">
                                <Icon className={`h-4 w-4 ${className}`} />
                                <div><p className="text-lg font-black leading-none text-text">{value}</p><p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-muted">{label}</p></div>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex items-center justify-between gap-2 lg:justify-end">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${status?.paused ? 'border-amber-500/30 text-amber-300' : 'border-emerald-500/30 text-emerald-300'}`}>
                        {status?.paused ? 'Paused' : 'Running'}
                    </span>
                    <button type="button" onClick={() => void load()} className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-text" title="Refresh">
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    {onOpen && <button type="button" onClick={onOpen} className="text-xs font-bold text-violet-300 hover:underline">Open</button>}
                </div>
            </div>
        </div>
    );
};

export default MediaAutomationHomeWidget;
