import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Cpu, Gauge, Loader2, MemoryStick, RefreshCw, ServerCog, Activity } from 'lucide-react';
import { mediaAutomationApi } from './api';
import type { MediaAutomationHostMetrics } from './types';

const cardClass = 'glass-card shadow-xl';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-text transition hover:border-plex/40 hover:bg-white/5 disabled:pointer-events-none disabled:opacity-40';
const POLL_MS = 2_000;
const HISTORY_LEN = 36;

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

const clampPercent = (value: number | null | undefined) => {
    if (!Number.isFinite(Number(value))) return null;
    return Math.max(0, Math.min(100, Number(value)));
};

const toneFor = (percent: number | null) => {
    if (percent == null) return { stroke: 'rgb(var(--color-plex))', bar: 'from-plex/80 to-plex', text: 'text-plex' };
    if (percent >= 90) return { stroke: '#f87171', bar: 'from-rose-500 to-orange-400', text: 'text-rose-300' };
    if (percent >= 75) return { stroke: '#fb923c', bar: 'from-orange-400 to-plex', text: 'text-orange-300' };
    return { stroke: 'rgb(var(--color-plex))', bar: 'from-plex/90 to-amber-300', text: 'text-plex' };
};

const useSmoothNumber = (target: number | null | undefined, decimals = 1) => {
    const [display, setDisplay] = useState(() => (Number.isFinite(Number(target)) ? Number(target) : 0));
    const frameRef = useRef<number | null>(null);
    const valueRef = useRef(display);

    useEffect(() => {
        if (!Number.isFinite(Number(target))) return undefined;
        const goal = Number(target);
        const start = valueRef.current;
        const startedAt = performance.now();
        const duration = 750;

        const tick = (now: number) => {
            const t = Math.min(1, (now - startedAt) / duration);
            const eased = 1 - ((1 - t) ** 3);
            const next = start + ((goal - start) * eased);
            valueRef.current = next;
            setDisplay(next);
            if (t < 1) frameRef.current = requestAnimationFrame(tick);
        };

        frameRef.current = requestAnimationFrame(tick);
        return () => {
            if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
        };
    }, [target]);

    return Number.isFinite(Number(target)) ? display.toFixed(decimals) : '—';
};

const Sparkline: React.FC<{ values: number[]; color: string; id: string }> = ({ values, color, id }) => {
    const width = 120;
    const height = 36;
    if (values.length < 2) {
        return <div className="h-9 w-[7.5rem] rounded bg-white/5" />;
    }
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 100);
    const span = Math.max(1, max - min);
    const points = values.map((value, index) => {
        const x = (index / (values.length - 1)) * width;
        const y = height - (((value - min) / span) * (height - 4)) - 2;
        return `${x},${y}`;
    }).join(' ');
    const area = `0,${height} ${points} ${width},${height}`;
    const gradId = `ma-spark-${id}`;
    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="h-9 w-[7.5rem] overflow-visible" aria-hidden>
            <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <polygon points={area} fill={`url(#${gradId})`} />
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="drop-shadow-[0_0_6px_rgba(229,160,13,0.45)]"
            />
        </svg>
    );
};

const ArcGauge: React.FC<{
    label: string;
    percent: number | null;
    valueText: string;
    subtext?: string;
    icon: React.ReactNode;
    history: number[];
}> = ({ label, percent, valueText, subtext, icon, history }) => {
    const tone = toneFor(percent);
    const radius = 54;
    const circumference = Math.PI * radius;
    const offset = circumference - (((percent ?? 0) / 100) * circumference);
    const sparkId = label.toLowerCase().replace(/\s+/g, '-');

    return (
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-black/30 p-5">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgb(var(--color-plex)_/_0.12),transparent_55%)]" />
            <div className="relative flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted">
                    {icon}
                    {label}
                </div>
                <Sparkline values={history} color={tone.stroke} id={sparkId} />
            </div>
            <div className="relative mx-auto mt-2 flex h-36 w-full max-w-[220px] items-end justify-center">
                <svg viewBox="0 0 140 90" className="h-full w-full" aria-hidden>
                    <path
                        d="M 16 78 A 54 54 0 0 1 124 78"
                        fill="none"
                        stroke="rgb(255 255 255 / 0.08)"
                        strokeWidth="12"
                        strokeLinecap="round"
                    />
                    <path
                        d="M 16 78 A 54 54 0 0 1 124 78"
                        fill="none"
                        stroke={tone.stroke}
                        strokeWidth="12"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        className="ma-gauge-arc"
                        style={{ filter: `drop-shadow(0 0 10px ${tone.stroke}66)` }}
                    />
                </svg>
                <div className="absolute inset-x-0 bottom-1 text-center">
                    <p className={`text-3xl font-black tracking-tight ${tone.text}`}>{valueText}</p>
                    {subtext ? <p className="mt-1 text-[11px] text-muted">{subtext}</p> : null}
                </div>
            </div>
        </div>
    );
};

const LiveBar: React.FC<{
    label: string;
    valueLabel: string;
    percent: number | null | undefined;
    hint?: string;
}> = ({ label, valueLabel, percent, hint }) => {
    const width = clampPercent(percent) ?? 0;
    const tone = toneFor(clampPercent(percent));
    return (
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
                <p className="text-sm font-semibold tabular-nums text-text">{valueLabel}</p>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/[0.06] ring-1 ring-white/5">
                <div
                    className={`ma-meter-fill h-full rounded-full bg-gradient-to-r ${tone.bar}`}
                    style={{
                        width: `${width}%`,
                        boxShadow: `0 0 18px ${tone.stroke}55`,
                    }}
                />
            </div>
            {hint ? <p className="mt-2 text-xs text-muted">{hint}</p> : null}
        </div>
    );
};

type HistoryState = {
    cpu: number[];
    mem: number[];
    gpu: number[];
};

type Props = {
    toast: (message: string, type?: 'success' | 'error') => void;
};

export const MediaAutomationSystemPanel: React.FC<Props> = ({ toast }) => {
    const [metrics, setMetrics] = useState<MediaAutomationHostMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [live, setLive] = useState(true);
    const [history, setHistory] = useState<HistoryState>({ cpu: [], mem: [], gpu: [] });
    const inFlight = useRef(false);

    const pushHistory = useCallback((next: MediaAutomationHostMetrics) => {
        const cpu = clampPercent(next.cpu?.usedPercent);
        const mem = clampPercent(next.memory?.usedPercent);
        const gpuUtil = next.gpu?.nvidia?.gpus?.[0]?.utilizationPercent;
        const gpu = clampPercent(gpuUtil);
        setHistory((prev) => ({
            cpu: cpu == null ? prev.cpu : [...prev.cpu, cpu].slice(-HISTORY_LEN),
            mem: mem == null ? prev.mem : [...prev.mem, mem].slice(-HISTORY_LEN),
            gpu: gpu == null ? prev.gpu : [...prev.gpu, gpu].slice(-HISTORY_LEN),
        }));
    }, []);

    const load = useCallback(async (soft = false) => {
        if (inFlight.current) return;
        inFlight.current = true;
        if (soft) setRefreshing(true);
        else setLoading(true);
        try {
            const next = await mediaAutomationApi.metrics();
            setMetrics(next);
            pushHistory(next);
            setLive(true);
        } catch (error) {
            setLive(false);
            if (!soft) toast(error instanceof Error ? error.message : 'Failed to load system metrics', 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
            inFlight.current = false;
        }
    }, [pushHistory, toast]);

    useEffect(() => {
        void load();
        const timer = window.setInterval(() => { void load(true); }, POLL_MS);
        return () => window.clearInterval(timer);
    }, [load]);

    const cpuSmooth = useSmoothNumber(metrics?.cpu?.usedPercent, 1);
    const memSmooth = useSmoothNumber(metrics?.memory?.usedPercent, 1);
    const primaryGpu = metrics?.gpu?.nvidia?.gpus?.[0];
    const gpuSmooth = useSmoothNumber(primaryGpu?.utilizationPercent, 0);

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
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-text">System</h2>
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                            live
                                ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                                : 'border-rose-400/30 bg-rose-400/10 text-rose-300'
                        }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${live ? 'ma-live-dot bg-emerald-400' : 'bg-rose-400'}`} />
                            {live ? 'Live' : 'Offline'}
                        </span>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                        Streaming host CPU, memory, and GPU usage — refreshed every {POLL_MS / 1000}s.
                    </p>
                </div>
                <button type="button" className={buttonClass} disabled={refreshing} onClick={() => void load(true)}>
                    {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Refresh
                </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <ArcGauge
                    label="CPU"
                    icon={<Cpu className="h-3.5 w-3.5 text-plex" />}
                    percent={clampPercent(cpu?.usedPercent)}
                    valueText={cpu?.usedPercent != null ? `${cpuSmooth}%` : '…'}
                    subtext={`${cpu?.cores ?? '—'} cores`}
                    history={history.cpu}
                />
                <ArcGauge
                    label="Memory"
                    icon={<MemoryStick className="h-3.5 w-3.5 text-plex" />}
                    percent={clampPercent(mem?.usedPercent)}
                    valueText={mem?.usedPercent != null ? `${memSmooth}%` : '…'}
                    subtext={`${formatBytes(mem?.usedBytes)} / ${formatBytes(mem?.totalBytes)}`}
                    history={history.mem}
                />
                <ArcGauge
                    label="GPU"
                    icon={<Gauge className="h-3.5 w-3.5 text-plex" />}
                    percent={clampPercent(primaryGpu?.utilizationPercent)}
                    valueText={primaryGpu ? `${gpuSmooth}%` : 'N/A'}
                    subtext={primaryGpu?.name || 'No NVIDIA metrics'}
                    history={history.gpu}
                />
            </div>

            <div className={`${cardClass} grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4`}>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Host</p>
                    <p className="mt-1 truncate font-semibold text-text">{metrics?.host || '-'}</p>
                    <p className="mt-1 text-xs text-muted">{metrics?.platform}/{metrics?.arch} · up {formatUptime(metrics?.uptimeSec)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Portal process</p>
                    <p className="mt-1 font-semibold tabular-nums text-text">{formatBytes(proc?.rssBytes)} RSS</p>
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
                    <p className="mt-1 flex items-center gap-2 font-semibold tabular-nums text-text">
                        <Activity className={`h-3.5 w-3.5 ${live ? 'text-emerald-300' : 'text-muted'}`} />
                        {metrics?.at ? new Date(metrics.at).toLocaleTimeString() : '-'}
                    </p>
                    <p className="mt-1 text-xs text-muted">Streaming telemetry</p>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <section className={`${cardClass} space-y-3 p-5`}>
                    <div className="flex items-center gap-2 text-sm font-bold text-text">
                        <MemoryStick className="h-4 w-4 text-plex" /> Memory detail
                    </div>
                    <LiveBar
                        label="OS memory"
                        valueLabel={`${formatBytes(mem?.usedBytes)} / ${formatBytes(mem?.totalBytes)}`}
                        percent={mem?.usedPercent}
                        hint={mem?.usedPercent != null ? `${mem.usedPercent.toFixed(1)}% used · ${formatBytes(mem.freeBytes)} free` : undefined}
                    />
                    <LiveBar
                        label="Portal RSS"
                        valueLabel={formatBytes(proc?.rssBytes)}
                        percent={mem?.totalBytes ? ((Number(proc?.rssBytes) || 0) / mem.totalBytes) * 100 : null}
                        hint="Process memory inside this container"
                    />
                </section>

                <section className={`${cardClass} space-y-3 p-5`}>
                    <div className="flex items-center gap-2 text-sm font-bold text-text">
                        <Cpu className="h-4 w-4 text-plex" /> CPU detail
                    </div>
                    <LiveBar
                        label="CPU usage"
                        valueLabel={cpu?.usedPercent != null ? `${cpu.usedPercent.toFixed(1)}%` : 'Sampling…'}
                        percent={cpu?.usedPercent}
                        hint={cpu?.model || undefined}
                    />
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Cores</p>
                            <p className="mt-1 font-semibold tabular-nums text-text">{cpu?.cores ?? '-'}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Load avg</p>
                            <p className="mt-1 font-semibold tabular-nums text-text">
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
                    <Gauge className="h-4 w-4 text-plex" /> GPU detail
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
                                <LiveBar
                                    label="GPU util"
                                    valueLabel={Number.isFinite(Number(gpu.utilizationPercent)) ? `${Number(gpu.utilizationPercent).toFixed(0)}%` : '-'}
                                    percent={gpu.utilizationPercent}
                                />
                                <LiveBar
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
                            ? `/dev/dri mapped${intel.dri.device ? ` (${intel.dri.device})` : ''}${intel.vendors?.length ? ` · ${intel.vendors.join(', ')}` : ''}`
                            : '/dev/dri not mapped'}
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
