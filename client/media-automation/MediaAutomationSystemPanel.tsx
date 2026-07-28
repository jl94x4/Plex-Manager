import React, { useCallback, useEffect, useState } from 'react';
import { Cpu, Gauge, Loader2, MemoryStick, RefreshCw, ServerCog } from 'lucide-react';
import { mediaAutomationApi } from './api';
import type { MediaAutomationHostMetrics } from './types';

const cardClass = 'glass-card shadow-xl';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-text transition hover:border-plex/40 hover:bg-white/5 disabled:pointer-events-none disabled:opacity-40';

const formatBytes = (value?: number) => {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
    return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
};

const formatUptime = (seconds?: number) => {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const days = Math.floor(total / 86_400);
    const hours = Math.floor((total % 86_400) / 3600);
    const mins = Math.floor((total % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
};

const Meter: React.FC<{ label: string; valueLabel: string; percent: number | null | undefined; hint?: string }> = ({
    label,
    valueLabel,
    percent,
    hint,
}) => {
    const width = Number.isFinite(Number(percent)) ? Math.max(2, Math.min(100, Number(percent))) : 0;
    return (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
                <p className="text-sm font-semibold text-text">{valueLabel}</p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
                <div className="h-full rounded-full bg-plex transition-all" style={{ width: `${width}%` }} />
            </div>
            {hint ? <p className="mt-2 text-xs text-muted">{hint}</p> : null}
        </div>
    );
};

type Props = {
    toast: (message: string, type?: 'success' | 'error') => void;
};

export const MediaAutomationSystemPanel: React.FC<Props> = ({ toast }) => {
    const [metrics, setMetrics] = useState<MediaAutomationHostMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async (soft = false) => {
        if (soft) setRefreshing(true);
        else setLoading(true);
        try {
            setMetrics(await mediaAutomationApi.metrics());
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to load system metrics', 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [toast]);

    useEffect(() => {
        void load();
        const timer = window.setInterval(() => { void load(true); }, 5_000);
        return () => window.clearInterval(timer);
    }, [load]);

    if (loading && !metrics) {
        return (
            <div className="flex min-h-48 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-plex" />
            </div>
        );
    }

    const mem = metrics?.memory;
    const cpu = metrics?.cpu;
    const proc = metrics?.process;
    const nvidiaGpus = metrics?.gpu?.nvidia?.gpus || [];
    const intel = metrics?.gpu?.intelOrAmd;

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2 className="text-lg font-bold text-text">System</h2>
                    <p className="mt-1 text-sm text-muted">
                        Live host CPU, memory, and GPU usage for this Media Automation container.
                    </p>
                </div>
                <button type="button" className={buttonClass} disabled={refreshing} onClick={() => void load(true)}>
                    {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Refresh
                </button>
            </div>

            <div className={`${cardClass} grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4`}>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Host</p>
                    <p className="mt-1 truncate font-semibold text-text">{metrics?.host || '-'}</p>
                    <p className="mt-1 text-xs text-muted">{metrics?.platform}/{metrics?.arch} · up {formatUptime(metrics?.uptimeSec)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Portal process</p>
                    <p className="mt-1 font-semibold text-text">{formatBytes(proc?.rssBytes)} RSS</p>
                    <p className="mt-1 text-xs text-muted">Heap {formatBytes(proc?.heapUsedBytes)} / {formatBytes(proc?.heapTotalBytes)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Active encodes</p>
                    <p className="mt-1 font-semibold text-text">
                        CPU {metrics?.gpu?.activeEncodes?.cpu ?? 0} · GPU {metrics?.gpu?.activeEncodes?.gpu ?? 0}
                    </p>
                    <p className="mt-1 text-xs text-muted">Current Media Automation worker slots</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Sampled</p>
                    <p className="mt-1 font-semibold text-text">{metrics?.at ? new Date(metrics.at).toLocaleTimeString() : '-'}</p>
                    <p className="mt-1 text-xs text-muted">Auto-refreshes every 5s</p>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <section className={`${cardClass} space-y-3 p-5`}>
                    <div className="flex items-center gap-2 text-sm font-bold text-text">
                        <MemoryStick className="h-4 w-4 text-plex" /> Memory
                    </div>
                    <Meter
                        label="OS memory"
                        valueLabel={`${formatBytes(mem?.usedBytes)} / ${formatBytes(mem?.totalBytes)}`}
                        percent={mem?.usedPercent}
                        hint={mem?.usedPercent != null ? `${mem.usedPercent.toFixed(1)}% used · ${formatBytes(mem.freeBytes)} free` : undefined}
                    />
                    <Meter
                        label="Portal RSS"
                        valueLabel={formatBytes(proc?.rssBytes)}
                        percent={mem?.totalBytes ? ((Number(proc?.rssBytes) || 0) / mem.totalBytes) * 100 : null}
                        hint="Process memory inside this container"
                    />
                </section>

                <section className={`${cardClass} space-y-3 p-5`}>
                    <div className="flex items-center gap-2 text-sm font-bold text-text">
                        <Cpu className="h-4 w-4 text-plex" /> CPU
                    </div>
                    <Meter
                        label="CPU usage"
                        valueLabel={cpu?.usedPercent != null ? `${cpu.usedPercent.toFixed(1)}%` : 'Sampling…'}
                        percent={cpu?.usedPercent}
                        hint={cpu?.model || undefined}
                    />
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Cores</p>
                            <p className="mt-1 font-semibold text-text">{cpu?.cores ?? '-'}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Load avg</p>
                            <p className="mt-1 font-semibold text-text">
                                {[cpu?.load1, cpu?.load5, cpu?.load15]
                                    .map((value) => (Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '-'))
                                    .join(' / ')}
                            </p>
                        </div>
                    </div>
                </section>
            </div>

            <section className={`${cardClass} space-y-3 p-5`}>
                <div className="flex items-center gap-2 text-sm font-bold text-text">
                    <Gauge className="h-4 w-4 text-plex" /> GPU
                </div>
                {nvidiaGpus.length > 0 ? (
                    <div className="grid gap-3 lg:grid-cols-2">
                        {nvidiaGpus.map((gpu) => (
                            <div key={`${gpu.index}-${gpu.name}`} className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-text">{gpu.name}</p>
                                        <p className="mt-1 text-xs text-muted">
                                            NVIDIA
                                            {Number.isFinite(Number(gpu.temperatureC)) ? ` · ${gpu.temperatureC}°C` : ''}
                                        </p>
                                    </div>
                                    <ServerCog className="h-4 w-4 shrink-0 text-plex" />
                                </div>
                                <Meter
                                    label="GPU util"
                                    valueLabel={Number.isFinite(Number(gpu.utilizationPercent)) ? `${Number(gpu.utilizationPercent).toFixed(0)}%` : '-'}
                                    percent={gpu.utilizationPercent}
                                />
                                <Meter
                                    label="VRAM"
                                    valueLabel={`${Number(gpu.memoryUsedMb) || 0} / ${Number(gpu.memoryTotalMb) || 0} MB`}
                                    percent={
                                        Number(gpu.memoryTotalMb) > 0
                                            ? ((Number(gpu.memoryUsedMb) || 0) / Number(gpu.memoryTotalMb)) * 100
                                            : null
                                    }
                                />
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-muted">
                        {metrics?.gpu?.nvidia?.error || 'No NVIDIA metrics (nvidia-smi not available in this container).'}
                    </p>
                )}
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-sm font-semibold text-text">Intel / AMD</p>
                    <p className="mt-1 text-sm text-muted">
                        {intel?.dri?.present
                            ? ` /dev/dri mapped${intel.dri.device ? ` (${intel.dri.device})` : ''}${intel.vendors?.length ? ` · ${intel.vendors.join(', ')}` : ''}`
                            : ' /dev/dri not mapped'}
                    </p>
                    <p className="mt-2 text-xs text-muted">{intel?.note}</p>
                    <p className="mt-2 text-xs text-muted">
                        Active GPU encodes: {metrics?.gpu?.activeEncodes?.gpu ?? 0}
                    </p>
                </div>
            </section>
        </div>
    );
};

export default MediaAutomationSystemPanel;
