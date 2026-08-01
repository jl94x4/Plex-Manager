import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { usePoll } from '../../shared/usePoll';
import { Card } from '../components/ui/Card';
import {
    Play,
    Square,
    Clock,
    Activity,
    Terminal,
    WifiOff,
    CalendarClock,
    RefreshCw,
    ToggleLeft,
    ToggleRight,
    Power,
    Cpu,
    Hourglass,
    AlertTriangle,
    CheckCircle2,
    Filter,
    Settings
} from 'lucide-react';
import { api, type CollexionsHealth } from '../api';
import { AppConfig, AppStatus, LibraryRunStats, PinFairness } from '../types';

const SKIP_LABELS: Record<string, string> = {
    recent_pin: 'Repeat block',
    explicit_exclusion: 'Exclusion list',
    regex: 'Regex exclusion',
    inactive_special: 'Inactive special',
    low_item_count: 'Below min items',
    item_count_error: 'Item count error',
    no_title: 'Missing title',
};

interface LogLibraryStats {
    name: string;
    found: number;
    eligible: number;
    pinned: number;
    blockedByTimer: number;
    blockedByCategory: boolean;
}

interface RunAnalysis {
    status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'UNKNOWN';
    startTime: string;
    duration: string;
    intervalConfig: string;
    totalPins: number;
    libraries: LibraryRunStats[] | LogLibraryStats[];
    errors: string[];
    fairness?: PinFairness;
    source: 'status.json' | 'logs';
    pinSlots?: number;
}

const formatSkipBreakdown = (lib: LibraryRunStats): string => {
    const skips = lib.skips || {};
    const parts = Object.entries(skips)
        .filter(([, n]) => Number(n) > 0)
        .map(([key, n]) => `${SKIP_LABELS[key] || key}: ${n}`);
    if (lib.withheld_by_category) {
        parts.push(`Category-held: ${lib.withheld_by_category}`);
    }
    if (lib.category_skipped_by_chance) {
        parts.push('Category roll skipped');
    }
    return parts.join(' · ') || '—';
};

const libraryReason = (lib: LibraryRunStats | LogLibraryStats): React.ReactNode => {
    if ('skips' in lib || 'notes' in lib) {
        const structured = lib as LibraryRunStats;
        if ((structured.pinned || 0) > 0) {
            return (
                <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {structured.pinned}/{structured.pin_limit ?? '?'} slots
                    {(structured.specials_picked || structured.categories_picked || structured.random_picked) ? (
                        <span className="text-muted font-normal normal-case tracking-normal">
                            {' '}(S{structured.specials_picked || 0}/C{structured.categories_picked || 0}/R{structured.random_picked || 0})
                        </span>
                    ) : null}
                </span>
            );
        }
        if (structured.notes?.length) {
            return <span className="text-amber-300/90">{structured.notes[0]}</span>;
        }
        if ((structured.eligible || 0) === 0 && (structured.found || 0) > 0) {
            return <span className="text-muted">All filtered out — {formatSkipBreakdown(structured)}</span>;
        }
        return <span className="text-muted">{formatSkipBreakdown(structured)}</span>;
    }

    const legacy = lib as LogLibraryStats;
    if (legacy.pinned > 0) {
        return <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Success</span>;
    }
    if (legacy.found === 0) return <span className="text-muted">Empty Library</span>;
    if (legacy.blockedByTimer > 0 && legacy.eligible === 0) {
        return <span className="text-amber-400 flex items-center gap-1"><Clock className="w-3 h-3" /> {legacy.blockedByTimer} items blocked by timer</span>;
    }
    if (legacy.eligible === 0) return <span className="text-muted">All filtered out (Exclusions)</span>;
    if (legacy.blockedByCategory) {
        return <span className="text-plex flex items-center gap-1"><Filter className="w-3 h-3" /> Category Mode Restricted</span>;
    }
    return <span className="text-muted">Skipped (Random chance)</span>;
};

const Dashboard: React.FC = () => {
    const [status, setStatus] = useState<AppStatus | null>(null);
    const [config, setConfig] = useState<AppConfig | null>(null);
    const [nextRun, setNextRun] = useState<string>('--:--');
    const [logs, setLogs] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [health, setHealth] = useState<CollexionsHealth | null>(null);
    const [healthError, setHealthError] = useState('');

    // Default Settings
    const [autoRefresh] = useState(true);
    const [liveLogs, setLiveLogs] = useState(true);

    // Persistence
    useEffect(() => {
        const saved = localStorage.getItem('collexions_dashboard_state');
        if (saved) {
            try {
                const state = JSON.parse(saved);
                if (state.liveLogs !== undefined) setLiveLogs(state.liveLogs);
            } catch (e) { console.error(e); }
        }
    }, []);

    useEffect(() => {
        localStorage.setItem('collexions_dashboard_state', JSON.stringify({ liveLogs }));
    }, [liveLogs]);

    const logContainerRef = useRef<HTMLDivElement>(null);
    const statusFetchGenRef = useRef(0);
    const healthFetchGenRef = useRef(0);
    const logsFetchGenRef = useRef(0);

    // --- Helpers ---
    const safeParseDate = (dateStr: string): Date | null => {
        if (!dateStr) return null;
        try {
            // Handle ISO-like formats with ' ' instead of 'T'
            let cleanStr = dateStr.replace(' ', 'T');

            let d = new Date(cleanStr);
            if (!isNaN(d.getTime())) return d;

            // Handle microsecond timestamps (strip extra decimals)
            d = new Date(cleanStr.replace(/(\.\d{3})\d+/, '$1'));
            if (!isNaN(d.getTime())) return d;

            d = new Date(cleanStr.split('.')[0]);
            if (!isNaN(d.getTime())) return d;

            // Final fallback: try the original string directly 
            // This handles formats like 'Thu Mar 12 01:02:35 2026' (ctime)
            d = new Date(dateStr);
            if (!isNaN(d.getTime())) return d;

        } catch (e) {
            console.warn("Date parse error", e);
        }
        return null;
    };

    const calculateNextRun = (s: AppStatus) => {
        if (s.next_run_timestamp && s.next_run_timestamp > 0) {
            const targetDate = new Date(s.next_run_timestamp * 1000);
            const timeStr = targetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const diff = targetDate.getTime() - Date.now();
            const mins = Math.ceil(diff / 60000);

            if (diff > 0) {
                setNextRun(`${timeStr} (in ${mins}m)`);
            } else {
                setNextRun("Due Now / Processing");
            }
        } else {
            setNextRun('--:--');
        }
    };

    // Prefer structured status.json from the worker; fall back to log scraping.
    const analyzeLastRun = useMemo((): RunAnalysis | null => {
        const structuredLibs = Array.isArray(status?.libraries) ? status!.libraries! : [];
        if (structuredLibs.length > 0 || status?.last_run_at) {
            const durationSec = Number(status?.last_run_duration_seconds);
            const duration = Number.isFinite(durationSec) && durationSec >= 0
                ? (durationSec >= 60
                    ? `${Math.floor(durationSec / 60)}m ${Math.round(durationSec % 60)}s`
                    : `${durationSec.toFixed(1)}s`)
                : '—';
            const statusLower = String(status?.status || '').toLowerCase();
            let runStatus: RunAnalysis['status'] = 'COMPLETED';
            if (/crash|error|fatal|critical/.test(statusLower)) runStatus = 'FAILED';
            else if (/processing|running|pinning/.test(statusLower) && status?.process_alive) runStatus = 'RUNNING';

            return {
                status: runStatus,
                startTime: status?.last_run_started_at || status?.last_run_at || 'Unknown',
                duration,
                intervalConfig: status?.fairness?.pinning_interval_minutes
                    ? `${status.fairness.pinning_interval_minutes} min`
                    : (config?.pinning_interval ? `${config.pinning_interval} min` : '?'),
                totalPins: Number(status?.last_run_pinned) || structuredLibs.reduce((n, l) => n + (l.pinned || 0), 0),
                libraries: structuredLibs,
                errors: [],
                fairness: status?.fairness,
                source: 'status.json',
                pinSlots: status?.pin_slots,
            };
        }

        if (!logs) return null;

        const lines = logs.split('\n');
        let startIndex = -1;
        for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].includes('====== Starting')) {
                startIndex = i;
                break;
            }
        }
        if (startIndex === -1) return null;

        const runLines = lines.slice(startIndex);
        const analysis: RunAnalysis = {
            status: 'RUNNING',
            startTime: 'Unknown',
            duration: '...',
            intervalConfig: '?',
            totalPins: 0,
            libraries: [],
            errors: [],
            source: 'logs',
        };

        const startMatch = runLines[0].match(/(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})/);
        if (startMatch) analysis.startTime = startMatch[1];

        let currentLib: LogLibraryStats | null = null;

        runLines.forEach(line => {
            if (line.includes('====== Run Finished') || line.includes('====== Collexions Script Run Finished')) {
                analysis.status = 'COMPLETED';
            }

            if (line.includes('Duration:') || line.includes('Total run duration:')) {
                const durMatch = line.match(/Duration: ([\d:.]+)/) || line.match(/Total run duration: ([\d:.]+)/);
                if (durMatch) analysis.duration = durMatch[1];
            }

            if (line.includes('CRITICAL') || line.includes('Traceback') || (line.includes('ERROR') && !line.includes('404'))) {
                if (!analysis.errors.includes(line)) analysis.errors.push(line);
                analysis.status = 'FAILED';
            }

            if (line.includes('Pinning interval set to')) {
                const match = line.match(/(?:CONFIG: )?Pinning interval set to (\d+) minutes/);
                if (match) analysis.intervalConfig = match[1] + ' min';
            }

            if (line.includes('Sleeping for approximately')) {
                const match = line.match(/maintain (\d+)m frequency/);
                if (match) analysis.intervalConfig = match[1] + ' min';
            }

            const libStart = line.match(/===== Processing Library: '(.+?)'/);
            if (libStart) {
                if (currentLib) analysis.libraries.push(currentLib);
                currentLib = {
                    name: libStart[1],
                    found: 0,
                    eligible: 0,
                    pinned: 0,
                    blockedByTimer: 0,
                    blockedByCategory: false,
                };
            }

            if (currentLib) {
                const foundMatch = line.match(/Found (\d+) collections/);
                if (foundMatch) currentLib.found = parseInt(foundMatch[1], 10);

                if (line.includes('excluded due to') && line.includes('block')) {
                    const listContent = line.match(/\[(.*?)\]/);
                    if (listContent) {
                        currentLib.blockedByTimer = listContent[1].split(',').length;
                    }
                }

                const eligMatch = line.match(/Found (\d+) eligible collections/);
                if (eligMatch) currentLib.eligible = parseInt(eligMatch[1], 10);

                if (line.includes("Pinned '")) {
                    currentLib.pinned++;
                    analysis.totalPins++;
                }

                if (line.includes('EXCLUDING ALL collections')) {
                    currentLib.blockedByCategory = true;
                }
            }
        });

        if (currentLib) analysis.libraries.push(currentLib);
        return analysis;
    }, [status, logs, config?.pinning_interval]);

    useEffect(() => {
        const loadConfig = async () => {
            try {
                const c = await api.getConfig();
                setConfig(c);
            } catch (e) {
                console.error("Failed to load config", e);
            }
        };
        loadConfig();
    }, []);

    const fetchStatusOnly = useCallback(async () => {
        const gen = ++statusFetchGenRef.current;
        try {
            const s = await api.getStatus();
            if (gen !== statusFetchGenRef.current) return;
            setStatus(s);
            calculateNextRun(s);
        } catch (e) { /* ignore */ }
    }, []);

    const fetchHealth = useCallback(async () => {
        const gen = ++healthFetchGenRef.current;
        try {
            const h = await api.getHealth();
            if (gen !== healthFetchGenRef.current) return;
            setHealth(h);
            setHealthError('');
        } catch (e: any) {
            if (gen !== healthFetchGenRef.current) return;
            setHealthError(e?.message || 'Health check failed');
        }
    }, []);

    const fetchLogsOnly = useCallback(async () => {
        const gen = ++logsFetchGenRef.current;
        try {
            const l = await api.getLogs();
            if (gen !== logsFetchGenRef.current) return;
            setLogs(l);
        } catch (e) { /* ignore */ }
    }, []);

    useEffect(() => {
        fetchStatusOnly();
        fetchLogsOnly();
        fetchHealth();
    }, []);

    useEffect(() => {
        if (!autoRefresh) return undefined;
        fetchStatusOnly();
        fetchHealth();
    }, [autoRefresh, fetchStatusOnly, fetchHealth]);

    usePoll(() => {
        fetchStatusOnly();
        fetchHealth();
    }, autoRefresh ? 5000 : null, { immediate: false });

    usePoll(fetchLogsOnly, liveLogs ? 5000 : null, { immediate: false });

    useEffect(() => {
        if (logContainerRef.current && liveLogs) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs, liveLogs]);

    // --- Actions ---
    const currentStatus = status?.status || 'Connecting...';
    const statusLower = currentStatus.toLowerCase();
    const isLoopActive = !!status?.process_alive
        || /running|sleeping|processing|waiting|run complete/.test(statusLower);
    const isWorking = statusLower.includes('processing') || statusLower.includes('pinning');
    const isOffline = statusLower === 'offline' || status === null;
    const lastUpdateDate = safeParseDate(status?.last_run_at || status?.last_update || '');
    const isDryRun = config?.dry_run === true;

    const handleStartService = async () => {
        if (loading) return;
        if (isLoopActive) return alert("Service is already active.");
        setLoading(true);
        try { await api.runNow(); setTimeout(fetchStatusOnly, 1000); } catch (error) { alert("Failed to start."); }
        setLoading(false);
    };

    const handleStopService = async () => {
        if (loading) return;
        if (!confirm("Stop the Automation Service?")) return;
        setLoading(true);
        try { await api.stopScript(); setTimeout(fetchStatusOnly, 1000); } catch (error) { console.error(error); }
        setLoading(false);
    };

    const manualRefresh = async () => {
        setIsRefreshing(true);
        await Promise.all([fetchStatusOnly(), fetchLogsOnly(), fetchHealth()]);
        setTimeout(() => setIsRefreshing(false), 500);
    };

    const healthIssues = health?.issues?.length ? health.issues : (healthError ? [healthError] : []);
    const showHealthWarn = !!(health && (!health.ok || healthIssues.length > 0)) || !!healthError;

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-10">

            {showHealthWarn && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90 space-y-2">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                            <p className="font-bold text-amber-200">Health check</p>
                            <ul className="mt-1 space-y-0.5 text-xs list-disc list-inside text-amber-100/80">
                                {healthIssues.slice(0, 5).map((issue) => (
                                    <li key={issue}>{issue}</li>
                                ))}
                            </ul>
                            {health && (
                                <p className="mt-2 text-[11px] text-amber-200/70 uppercase tracking-wider font-bold">
                                    Worker {health.worker?.reachable ? 'reachable' : 'down'}
                                    {' · '}
                                    Script {health.worker?.detail?.script || 'unknown'}
                                    {' · '}
                                    Plex {health.worker?.detail?.plex?.ok ? 'ok' : 'issue'}
                                    {health.autostart ? ' · auto-start on' : ''}
                                </p>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => { void fetchHealth(); }}
                            className="text-amber-200 font-semibold hover:underline text-xs whitespace-nowrap"
                        >
                            Recheck
                        </button>
                    </div>
                </div>
            )}

            {/* Config Warnings */}
            {config && isDryRun && (
                <div className="bg-amber-500/20 border border-amber-500/50 p-4 rounded-xl flex items-center gap-4 animate-pulse">
                    <div className="bg-amber-500 text-black p-2 rounded-lg"><AlertTriangle className="w-6 h-6" /></div>
                    <div className="flex-1">
                        <h3 className="font-bold text-amber-200">SIMULATION MODE ACTIVE</h3>
                        <p className="text-amber-100/80 text-sm">"Dry Run" is enabled. No changes will be made to Plex.</p>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-text tracking-tight flex items-center gap-3">
                        Dashboard
                        {isOffline && <span className="text-xs bg-red-900/50 text-red-400 px-2 py-1 rounded border border-red-800">OFFLINE</span>}
                    </h2>
                    <p className="text-muted mt-1 flex items-center gap-2 text-sm">
                        <Activity className="w-4 h-4 text-plex" /> Real-time automation overview
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={manualRefresh}
                        className={`p-2.5 rounded-xl bg-card border border-border text-muted hover:text-text hover:border-border transition-all ${isRefreshing ? 'animate-spin' : ''}`}
                        title="Manual Refresh"
                    >
                        <RefreshCw className="w-5 h-5" />
                    </button>

                    {isLoopActive ? (
                        <button
                            onClick={handleStopService}
                            disabled={loading || isOffline}
                            className="flex items-center gap-2 px-5 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/50 rounded-xl font-bold transition-all active:scale-95 disabled:opacity-50"
                        >
                            <Square className="w-4 h-4 fill-current" />
                            STOP SERVICE
                        </button>
                    ) : (
                        <button
                            onClick={handleStartService}
                            disabled={loading || isOffline}
                            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-text border border-emerald-400/50 rounded-xl font-bold transition-all shadow-lg shadow-emerald-900/20 active:scale-95 disabled:opacity-50"
                        >
                            <Play className="w-4 h-4 fill-current" />
                            START SERVICE
                        </button>
                    )}
                </div>
            </div>

            {/* Premium Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Status Card */}
                <Card compact className="p-3.5 border-border/80 bg-card/50 relative overflow-hidden group hover:border-border/80 transition-all duration-300">
                    <div className="flex flex-col relative z-10">
                        <div className="flex justify-between items-center mb-2.5">
                            <div className={`p-1.5 rounded-lg ${isOffline ? 'bg-card text-muted' : isWorking ? 'bg-emerald-500/20 text-emerald-400' : isLoopActive ? 'bg-plex/20 text-plex' : 'bg-amber-500/20 text-amber-400 shadow-lg shadow-amber-900/20'}`}>
                                {isOffline ? <WifiOff className="w-4 h-4" /> : isWorking ? <Cpu className="w-4 h-4 animate-spin" /> : isLoopActive ? <Hourglass className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-muted opacity-60">System</span>
                        </div>
                        <div className="space-y-0.5">
                            <h3 className={`text-base font-bold tracking-tight ${isWorking ? 'text-emerald-400' : 'text-white'}`}>
                                {isOffline ? 'Offline' : isWorking ? 'Processing' : isLoopActive ? 'Service Active' : 'Service Stopped'}
                            </h3>
                            <p className="text-[10px] text-muted font-bold uppercase tracking-wider">
                                {isOffline ? 'Check connection' : isWorking ? 'Performing sync' : isLoopActive ? 'Idle & Monitoring' : 'Requires start'}
                            </p>
                        </div>
                    </div>
                    <div className={`absolute -right-8 -bottom-8 w-24 h-24 blur-[60px] opacity-10 rounded-full transition-all duration-700 group-hover:opacity-30 ${isOffline ? 'bg-muted' : isWorking ? 'bg-emerald-500' : isLoopActive ? 'bg-plex' : 'bg-amber-500'}`}></div>
                </Card>

                {/* Last Activity Card */}
                <Card compact className="p-3.5 border-border/80 bg-card/50 relative overflow-hidden group hover:border-border/80 transition-all duration-300">
                    <div className="flex flex-col relative z-10">
                        <div className="flex justify-between items-center mb-2.5">
                            <div className="p-1.5 bg-white/5 text-muted rounded-lg">
                                <Clock className="w-4 h-4" />
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-muted opacity-60">Activity</span>
                        </div>
                        <div className="space-y-0.5">
                            <h3 className="text-base font-bold font-mono tracking-tighter text-text tabular-nums">
                                {lastUpdateDate ? lastUpdateDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '--:--:--'}
                            </h3>
                            <p className="text-[10px] text-muted font-bold uppercase tracking-wider">Last Run</p>
                        </div>
                    </div>
                </Card>

                {/* Next Run Card */}
                <Card compact className="p-3.5 border-border/80 bg-card/50 relative overflow-hidden group hover:border-border/80 transition-all duration-300">
                    <div className="flex flex-col relative z-10">
                        <div className="flex justify-between items-center mb-2.5">
                            <div className={`p-1.5 rounded-lg ${isLoopActive ? 'bg-plex/20 text-plex shadow-lg shadow-plex/10' : 'bg-white/5 text-muted'}`}>
                                <CalendarClock className="w-4 h-4" />
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-muted opacity-60">Scheduling</span>
                        </div>
                        <div className="space-y-0.5">
                            <h3 className={`text-base font-bold font-mono tracking-tighter tabular-nums ${isLoopActive ? 'text-plex' : 'text-muted'}`}>
                                {isLoopActive ? (nextRun.includes('(') ? nextRun.split(' (')[0] : nextRun) : 'Inactive'}
                            </h3>
                            <p className="text-[10px] text-muted font-bold uppercase tracking-wider">
                                {isLoopActive && nextRun.includes('in ') ? `Next Run in ${(nextRun.split('in ')[1] ?? '').replace(')', '')}` : 'Auto-Sync Paused'}
                            </p>
                        </div>
                    </div>
                </Card>

                {/* Frequency Card */}
                <Card compact className="p-3.5 border-border/80 bg-card/50 relative overflow-hidden group hover:border-border/80 transition-all duration-300">
                    <div className="flex flex-col relative z-10">
                        <div className="flex justify-between items-center mb-2.5">
                            <div className="p-1.5 bg-white/5 text-muted rounded-lg">
                                <Settings className="w-4 h-4" />
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-muted opacity-60">Frequency</span>
                        </div>
                        <div className="space-y-0.5">
                            <div className="flex items-baseline gap-1.5">
                                <h3 className="text-base font-bold font-mono tracking-tighter text-text">
                                    {config?.pinning_interval || 0}
                                </h3>
                                <span className="text-[9px] font-black text-muted uppercase tracking-widest">min interval</span>
                            </div>
                            {analyzeLastRun?.intervalConfig ? (
                                <p className="text-[10px] text-plex font-black uppercase tracking-wider">Active: {analyzeLastRun?.intervalConfig}</p>
                            ) : (
                                <p className="text-[10px] text-muted font-bold uppercase tracking-wider">Standard Cycle</p>
                            )}
                        </div>
                    </div>
                </Card>
            </div>

            {/* --- RUN INSPECTOR --- */}
            {analyzeLastRun && (
                <div className="animate-in slide-in-from-bottom-4 duration-500 space-y-4">
                    <h3 className="text-lg sm:text-xl font-bold text-text flex items-center gap-2 flex-wrap">
                        <Activity className="w-5 h-5 text-plex shrink-0" /> Run Inspector
                        <span className="text-xs font-normal text-muted w-full sm:w-auto">
                            ({analyzeLastRun.source === 'status.json' ? 'from status.json' : 'analyzed from logs'})
                        </span>
                    </h3>

                    {analyzeLastRun.fairness && (
                        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 text-[11px]">
                            <span className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-muted">
                                Repeat block <span className="text-text font-bold">{analyzeLastRun.fairness.repeat_block_hours ?? '—'}h</span>
                            </span>
                            <span className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-muted">
                                Min items <span className="text-text font-bold">{analyzeLastRun.fairness.min_items_for_pinning ?? '—'}</span>
                            </span>
                            <span className="col-span-2 sm:col-span-1 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-muted">
                                Category mode{' '}
                                <span className="text-text font-bold">
                                    {analyzeLastRun.fairness.use_random_category_mode
                                        ? `random (${analyzeLastRun.fairness.random_category_skip_percent ?? 0}% skip)`
                                        : 'default'}
                                </span>
                            </span>
                            {typeof analyzeLastRun.pinSlots === 'number' && (
                                <span className="col-span-2 sm:col-span-1 px-2.5 py-1.5 rounded-lg bg-plex/10 border border-plex/30 text-plex font-bold">
                                    Caps {analyzeLastRun.totalPins}/{analyzeLastRun.pinSlots} slots filled
                                </span>
                            )}
                        </div>
                    )}

                    <div className={`border rounded-xl overflow-hidden ${analyzeLastRun.status === 'FAILED' ? 'border-red-900/50 bg-red-950/10' : 'border-border/80 bg-card/50'}`}>
                        <div className="p-3 sm:p-4 border-b border-white/5 flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-4 sm:items-center sm:justify-between bg-background/30">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 min-w-0">
                                <div className={`self-start px-3 py-1 rounded text-xs font-bold uppercase ${analyzeLastRun.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' :
                                    analyzeLastRun.status === 'RUNNING' ? 'bg-plex/20 text-plex' :
                                        'bg-red-500/20 text-red-400'
                                    }`}>
                                    {analyzeLastRun.status}
                                </div>
                                <div className="text-sm text-muted flex items-start sm:items-center gap-2 min-w-0">
                                    <Clock className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
                                    <span className="min-w-0">
                                        Started:{' '}
                                        <span className="text-text font-mono break-all">
                                            {safeParseDate(analyzeLastRun.startTime)?.toLocaleString() || analyzeLastRun.startTime}
                                        </span>
                                    </span>
                                </div>
                                <div className="text-sm text-muted">
                                    Duration: <span className="text-text font-mono">{analyzeLastRun.duration}</span>
                                </div>
                            </div>
                            <div className="self-start text-sm font-bold text-text bg-card px-3 py-1 rounded-lg border border-border">
                                Total Pinned: {analyzeLastRun.totalPins}
                                {typeof analyzeLastRun.pinSlots === 'number' ? ` / ${analyzeLastRun.pinSlots}` : ''}
                            </div>
                        </div>

                        {/* Mobile: stacked library cards */}
                        <div className="md:hidden divide-y divide-border">
                            {analyzeLastRun.libraries.length === 0 ? (
                                <div className="px-4 py-8 text-center text-muted italic text-sm">
                                    No libraries processed yet in this run.
                                </div>
                            ) : (
                                analyzeLastRun.libraries.map((lib, idx) => (
                                    <div key={`${lib.name}-${idx}`} className="p-4 space-y-3">
                                        <div className="font-semibold text-text break-words">{lib.name}</div>
                                        <div className="grid grid-cols-3 gap-2 text-center">
                                            <div className="rounded-lg border border-border/70 bg-background/40 px-2 py-2">
                                                <div className="text-[10px] uppercase tracking-wider text-muted font-bold">Found</div>
                                                <div className="text-sm text-text font-mono mt-0.5">{lib.found}</div>
                                            </div>
                                            <div className="rounded-lg border border-border/70 bg-background/40 px-2 py-2">
                                                <div className="text-[10px] uppercase tracking-wider text-muted font-bold">Eligible</div>
                                                <div className={`text-sm font-mono mt-0.5 ${(lib.eligible || 0) > 0 ? 'text-plex' : 'text-muted'}`}>
                                                    {lib.eligible}
                                                </div>
                                            </div>
                                            <div className="rounded-lg border border-border/70 bg-background/40 px-2 py-2">
                                                <div className="text-[10px] uppercase tracking-wider text-muted font-bold">Pinned</div>
                                                <div className={`text-sm font-mono mt-0.5 ${(lib.pinned || 0) > 0 ? 'text-emerald-400 font-bold' : 'text-muted'}`}>
                                                    {(lib.pinned || 0) > 0
                                                        ? `${lib.pinned}${'pin_limit' in lib && lib.pin_limit != null ? `/${lib.pin_limit}` : ''}`
                                                        : '—'}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="rounded-lg border border-border/60 bg-background/30 px-3 py-2.5 text-xs space-y-1.5">
                                            <div className="text-[10px] uppercase tracking-wider text-muted font-bold">Why / decisions</div>
                                            <div className="text-text/90 leading-relaxed">{libraryReason(lib)}</div>
                                            {'skips' in lib && formatSkipBreakdown(lib as LibraryRunStats) !== '—' && (
                                                <div className="text-muted/80 font-mono text-[10px] leading-relaxed break-words">
                                                    {formatSkipBreakdown(lib as LibraryRunStats)}
                                                </div>
                                            )}
                                            {'skip_samples' in lib && (lib as LibraryRunStats).skip_samples && (
                                                <div className="text-muted/70 text-[10px] space-y-1 pt-0.5">
                                                    {Object.entries((lib as LibraryRunStats).skip_samples || {}).map(([reason, titles]) => (
                                                        <div key={reason} className="break-words">
                                                            <span className="text-muted">{SKIP_LABELS[reason] || reason}: </span>
                                                            {(titles || []).slice(0, 3).join(', ')}
                                                            {(titles || []).length > 3 ? '…' : ''}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Desktop: table */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-muted uppercase bg-background/60 border-b border-border">
                                    <tr>
                                        <th className="px-6 py-3">Library</th>
                                        <th className="px-6 py-3 text-center">Found</th>
                                        <th className="px-6 py-3 text-center">Eligible</th>
                                        <th className="px-6 py-3 text-center">Pinned</th>
                                        <th className="px-6 py-3">Why / fairness</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {analyzeLastRun.libraries.map((lib, idx) => (
                                        <tr key={`${lib.name}-${idx}`} className="hover:bg-white/5 transition-colors align-top">
                                            <td className="px-6 py-4 font-medium text-text">{lib.name}</td>
                                            <td className="px-6 py-4 text-center text-muted">{lib.found}</td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`px-2 py-1 rounded ${(lib.eligible || 0) > 0 ? 'bg-plex/10 text-plex' : 'bg-card text-muted'}`}>
                                                    {lib.eligible}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {(lib.pinned || 0) > 0 ? (
                                                    <span className="text-emerald-400 font-bold">
                                                        {lib.pinned}
                                                        {'pin_limit' in lib && lib.pin_limit != null ? `/${lib.pin_limit}` : ''}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted">-</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-xs space-y-1.5 max-w-md">
                                                <div>{libraryReason(lib)}</div>
                                                {'skips' in lib && formatSkipBreakdown(lib as LibraryRunStats) !== '—' && (
                                                    <div className="text-muted/80 font-mono text-[10px] leading-relaxed">
                                                        {formatSkipBreakdown(lib as LibraryRunStats)}
                                                    </div>
                                                )}
                                                {'skip_samples' in lib && (lib as LibraryRunStats).skip_samples && (
                                                    <div className="text-muted/70 text-[10px] space-y-0.5">
                                                        {Object.entries((lib as LibraryRunStats).skip_samples || {}).map(([reason, titles]) => (
                                                            <div key={reason}>
                                                                <span className="text-muted">{SKIP_LABELS[reason] || reason}: </span>
                                                                {(titles || []).slice(0, 3).join(', ')}
                                                                {(titles || []).length > 3 ? '…' : ''}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {analyzeLastRun.libraries.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-8 text-center text-muted italic">
                                                No libraries processed yet in this run.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Log Console */}
            <Card
                title="Live Logs"
                className="flex flex-col min-h-[400px] border-border/80 bg-card/50"
                actions={
                    <div className="flex gap-3">
                        <button onClick={() => setLiveLogs(!liveLogs)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${liveLogs ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-card text-muted border-border'}`}>
                            {liveLogs ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                            {liveLogs ? 'Live Stream ON' : 'Live Stream OFF'}
                        </button>
                    </div>
                }
            >
                <div ref={logContainerRef} className="bg-black/80 rounded-xl p-4 font-mono text-xs text-text overflow-y-auto h-80 border border-border shadow-inner leading-relaxed scrollbar-thin">
                    {logs ? <pre className="whitespace-pre-wrap break-all">{logs}</pre> : <div className="h-full flex items-center justify-center text-muted flex-col gap-3"><Terminal className="w-10 h-10 opacity-30" /><p>Waiting for logs...</p></div>}
                </div>
            </Card>
        </div>
    );
};

export default Dashboard;