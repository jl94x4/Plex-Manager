import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { usePoll } from '../shared/usePoll';
import {
    ArrowUpCircle,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clock3,
    Copy,
    Cpu,
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
import { CustomSelect } from '../shared/ui';
import {
    formatScannerWhen,
    SCANNER_ACTION_FILTER_LABELS,
    scannerActionFilterGroup,
    scannerActionStyles,
    sourceAppIconUrl,
    sourceAppKey,
    type ScannerSourceAppKey,
} from './eventMeta';
import { ScannerSourceBadge } from './ScannerSourceBadge';
import {
    DashboardHero,
    DashboardPageShell,
    DashboardPanel,
    DashboardStatCard,
    dashboardGlowClass,
} from '../shared/dashboard/DashboardChrome';

type ScannerStatus = {
    enabled: boolean;
    minimumAge: string;
    remaining: number;
    processed: number;
    targetCount: number;
    configuredSources?: Array<'sonarr' | 'radarr' | 'lidarr' | 'media-automation'>;
    showWebhooks?: boolean;
    showManualPath?: boolean;
    webhookPaths: {
        manual: string;
        sonarr: string[];
        radarr: string[];
        lidarr: string[];
        mediaAutomation?: string[];
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

const MANUAL_PATH_COLLAPSED_KEY = 'scanner-manual-path-collapsed';
const ACTIVITY_FETCH_LIMIT = 500;
const ACTIVITY_PAGE_SIZE = 5;
const SOURCE_LABELS: Record<string, string> = {
    sonarr: 'Sonarr',
    radarr: 'Radarr',
    lidarr: 'Lidarr',
    'media-automation': 'Media Automation',
};
const CONFIGURED_SOURCE_KEYS = new Set<ScannerSourceAppKey>(['sonarr', 'radarr', 'lidarr', 'media-automation']);
const isConfiguredSourceKey = (source: string): source is Exclude<ScannerSourceAppKey, '' | 'manual'> => (
    CONFIGURED_SOURCE_KEYS.has(source as ScannerSourceAppKey)
);

const readManualPathCollapsed = () => {
    try {
        return localStorage.getItem(MANUAL_PATH_COLLAPSED_KEY) === '1';
    } catch {
        return false;
    }
};

const ACTIVITY_EVENT_FILTER_ORDER = ['import', 'upgrade', 'deleted', 'rename', 'manual', 'refresh', 'other'];

const ActionIcon: React.FC<{ action?: string; className?: string }> = ({ action, className }) => {
    const key = String(action || '').toLowerCase();
    if (key === 'upgrade') return <ArrowUpCircle className={className} />;
    if (key.includes('delete')) return <FileMinus2 className={className} />;
    if (key === 'rename') return <Wand2 className={className} />;
    if (key === 'manual') return <FolderInput className={className} />;
    if (key === 'import') return <FolderInput className={className} />;
    if (key === 'refresh') return <Radar className={className} />;
    return <Radar className={className} />;
};

const EventCard: React.FC<{
    accent: 'amber' | 'emerald' | 'rose';
    children: React.ReactNode;
}> = ({ accent, children }) => {
    const accentClass = accent === 'amber'
        ? 'border-l-amber-400/70'
        : accent === 'rose'
            ? 'border-l-rose-400/70'
            : 'border-l-emerald-400/60';
    return (
        <li className={`rounded-xl border border-white/10 border-l-[3px] bg-black/20 px-3.5 py-3 transition-colors hover:bg-white/[0.03] ${accentClass}`}>
            {children}
        </li>
    );
};

export const ScannerDashboard: React.FC = () => {
    const [path, setPath] = useState('');
    const [status, setStatus] = useState<ScannerStatus | null>(null);
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [log, setLog] = useState<LogEntry[]>([]);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [manualCollapsed, setManualCollapsed] = useState(readManualPathCollapsed);
    const [activityPage, setActivityPage] = useState(0);
    const [activitySource, setActivitySource] = useState('all');
    const [activityEvent, setActivityEvent] = useState('all');

    const toggleManualPath = () => {
        setManualCollapsed((prev) => {
            const next = !prev;
            try {
                localStorage.setItem(MANUAL_PATH_COLLAPSED_KEY, next ? '1' : '0');
            } catch {
                // ignore
            }
            return next;
        });
    };

    const refresh = useCallback(async () => {
        try {
            const [st, q, lg] = await Promise.all([
                apiFetch('/api/scanner/status'),
                apiFetch('/api/scanner/queue'),
                apiFetch(`/api/scanner/log?limit=${ACTIVITY_FETCH_LIMIT}`),
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
    }, [refresh]);

    usePoll(() => { void refresh(); }, 8000);

    const configuredSources = useMemo(() => {
        const configured = status?.configuredSources || [];
        const observed = log
            .map((entry) => sourceAppKey(entry.source))
            .filter(isConfiguredSourceKey);
        return [...new Set([...configured, ...observed])];
    }, [status?.configuredSources, log]);
    const activitySourceOptions = useMemo(() => [
        { value: 'all', label: 'All configured apps' },
        ...configuredSources.map((source) => ({
            value: source,
            label: SOURCE_LABELS[source] || source,
            icon: sourceAppIconUrl(source) ? (
                <img
                    src={sourceAppIconUrl(source) || ''}
                    alt=""
                    className="h-4 w-4 shrink-0 object-contain"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                />
            ) : source === 'media-automation' ? (
                <Cpu className="h-4 w-4 shrink-0 text-plex" />
            ) : undefined,
        })),
    ], [configuredSources]);
    const activityEventOptions = useMemo(() => {
        const present = new Set(
            log.map((entry) => scannerActionFilterGroup(entry.action || entry.reason, entry.isUpgrade)),
        );
        const ordered = ACTIVITY_EVENT_FILTER_ORDER.filter((key) => present.has(key));
        for (const key of present) {
            if (!ordered.includes(key)) ordered.push(key);
        }
        return [
            { value: 'all', label: SCANNER_ACTION_FILTER_LABELS.all },
            ...ordered.map((key) => ({
                value: key,
                label: SCANNER_ACTION_FILTER_LABELS[key]
                    || key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
            })),
        ];
    }, [log]);
    const filteredLog = useMemo(() => {
        let rows = log;
        if (activitySource !== 'all') {
            rows = rows.filter((entry) => sourceAppKey(entry.source) === activitySource);
        }
        if (activityEvent !== 'all') {
            rows = rows.filter(
                (entry) => scannerActionFilterGroup(entry.action || entry.reason, entry.isUpgrade) === activityEvent,
            );
        }
        return rows;
    }, [activityEvent, activitySource, log]);
    const activityTotalPages = Math.max(1, Math.ceil(filteredLog.length / ACTIVITY_PAGE_SIZE) || 1);
    const activitySafePage = Math.min(activityPage, activityTotalPages - 1);
    const activityPageEntries = filteredLog.slice(
        activitySafePage * ACTIVITY_PAGE_SIZE,
        activitySafePage * ACTIVITY_PAGE_SIZE + ACTIVITY_PAGE_SIZE,
    );

    useEffect(() => {
        if (
            activitySource !== 'all'
            && !configuredSources.includes(activitySource as Exclude<ScannerSourceAppKey, '' | 'manual'>)
        ) {
            setActivitySource('all');
        }
    }, [activitySource, configuredSources]);

    useEffect(() => {
        if (
            activityEvent !== 'all'
            && !activityEventOptions.some((option) => option.value === activityEvent)
        ) {
            setActivityEvent('all');
        }
    }, [activityEvent, activityEventOptions]);

    useEffect(() => {
        setActivityPage(0);
    }, [activitySource, activityEvent]);

    useEffect(() => {
        if (activityPage > activityTotalPages - 1) {
            setActivityPage(Math.max(0, activityTotalPages - 1));
        }
    }, [activityPage, activityTotalPages]);

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
        ...(status?.webhookPaths?.mediaAutomation || []).map((p) => ({ label: 'Media Automation', key: 'media-automation', tone: 'text-plex', path: p })),
        { label: 'Manual', key: 'manual', tone: 'text-emerald-300', path: status?.webhookPaths?.manual || '/triggers/manual' },
    ];

    return (
        <DashboardPageShell>
            <DashboardHero
                accent="sky"
                eyebrow="Library Scanner"
                title="Refresh with precision"
                description="Queue a folder for a partial library refresh on Plex, Jellyfin, or Emby. ARR webhooks land here automatically as imports, upgrades, deletes, and renames."
                icon={<Radar className="h-3.5 w-3.5" />}
                actions={(
                    <button
                        type="button"
                        onClick={() => void refresh()}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-white/5 hover:text-text"
                    >
                        <RefreshCw className="h-4 w-4" /> Refresh
                    </button>
                )}
            />

            {status?.showManualPath !== false ? (
            <div className="glass-card space-y-3 p-4 shadow-xl md:p-5">
                <button
                    type="button"
                    onClick={toggleManualPath}
                    className="group flex w-full items-start justify-between gap-3 text-left"
                    aria-expanded={!manualCollapsed}
                >
                    <div className="min-w-0">
                        <h2 className="text-sm font-bold uppercase tracking-wider text-muted transition-colors group-hover:text-sky-200">
                            Manual path
                        </h2>
                        <p className="mt-0.5 text-xs text-muted/80">
                            {manualCollapsed
                                ? 'Hidden — click to queue a folder manually.'
                                : 'Add a folder now — processed after the minimum age.'}
                        </p>
                    </div>
                    <span className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors group-hover:bg-white/5 group-hover:text-text">
                        {manualCollapsed ? 'Show' : 'Hide'}
                        <ChevronDown className={`h-4 w-4 transition-transform ${manualCollapsed ? '' : 'rotate-180'}`} />
                    </span>
                </button>
                {!manualCollapsed ? (
                    <form onSubmit={submitPath} className="space-y-3">
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <input
                                type="text"
                                value={path}
                                onChange={(e) => setPath(e.target.value)}
                                placeholder="Path to scan e.g. /mnt/unionfs/Media/Movies/Movie Name (year)"
                                className="flex-1 rounded-xl border border-white/10 bg-background/70 px-4 py-3 text-text placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
                            />
                            <button
                                type="submit"
                                disabled={busy || !path.trim()}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-400 px-5 py-3 font-bold text-black transition-colors hover:bg-sky-300 disabled:opacity-50"
                            >
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                Submit
                            </button>
                        </div>
                        <div className="rounded-xl border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm leading-relaxed text-sky-100/95">
                            Submit adds the path to the scan queue
                            {status?.minimumAge ? <> · waits <code className="text-sky-200">{status.minimumAge}</code> before targets are called</> : null}.
                        </div>
                    </form>
                ) : null}
            </div>
            ) : null}

            {(message || error) && (
                <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-400/20 bg-red-500/10 text-red-200' : 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'}`}>
                    {error || message}
                </div>
            )}

            <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
                <DashboardStatCard
                    label="Queued"
                    value={status?.remaining ?? '—'}
                    hint="Waiting for min age"
                    icon={<ListTodo className="h-4 w-4 text-amber-300" />}
                    glow={dashboardGlowClass('amber')}
                />
                <DashboardStatCard
                    label="Processed"
                    value={status?.processed ?? '—'}
                    hint="Successful refreshes"
                    icon={<Layers className="h-4 w-4 text-emerald-300" />}
                    glow={dashboardGlowClass('emerald')}
                />
                <DashboardStatCard
                    label="Targets"
                    value={status?.targetCount ?? '—'}
                    hint="Plex / JF / Emby"
                    icon={<Target className="h-4 w-4 text-violet-300" />}
                    glow={dashboardGlowClass('violet')}
                />
                <DashboardStatCard
                    label="Min age"
                    value={status?.minimumAge ?? '—'}
                    hint="Delay before scan"
                    icon={<Clock3 className="h-4 w-4 text-sky-300" />}
                    glow={dashboardGlowClass('sky')}
                />
            </div>

            {status?.showWebhooks !== false ? (
            <section className="glass-card space-y-4 p-4 shadow-xl md:p-5">
                <div>
                    <h2 className="text-lg font-bold tracking-tight text-text">ARR webhooks</h2>
                    <p className="mt-1 text-sm leading-relaxed text-muted">
                        In Sonarr / Radarr / Lidarr: Settings → Connect → Webhook → On Import + On Upgrade
                        (and delete/rename if you want those too). Use Basic Auth from Settings → Scanner.
                    </p>
                </div>
                <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                    {webhookRows.map((row) => {
                        const full = webhookUrl(row.path);
                        return (
                            <div
                                key={`${row.label}-${row.path}`}
                                className="group flex items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-3.5 py-3 transition-colors hover:bg-black/35"
                            >
                                <ScannerSourceBadge source={row.key} className={`w-[5.5rem] shrink-0 ${row.tone}`} />
                                <code className="flex-1 truncate font-mono text-xs text-text/85">{full}</code>
                                <button
                                    type="button"
                                    onClick={() => void copyText(full)}
                                    className="rounded-lg border border-transparent p-2 text-muted transition-colors hover:border-white/10 hover:bg-white/10 hover:text-text"
                                    title="Copy"
                                >
                                    <Copy className="h-4 w-4" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            </section>
            ) : null}

            <div className="grid grid-cols-1 gap-4 md:gap-5 xl:grid-cols-2">
                <DashboardPanel
                    title="Queue"
                    subtitle="Paths waiting for the minimum age."
                    badge={(
                        <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-200">
                            {queue.length} pending
                        </span>
                    )}
                >
                    {queue.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-10 text-center">
                            <p className="text-sm text-muted">Queue is empty — waiting for the next webhook or manual path.</p>
                        </div>
                    ) : (
                        <ul className="space-y-2">
                            {queue.map((item) => {
                                const style = scannerActionStyles(item.action || item.reason, item.isUpgrade);
                                return (
                                    <EventCard key={`${item.folder}-${item.time}`} accent="amber">
                                        <div className="mb-2 flex flex-wrap items-center gap-2">
                                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${style.className}`}>
                                                <ActionIcon action={item.action} className="h-3 w-3" />
                                                {item.reason || style.label}
                                            </span>
                                            <ScannerSourceBadge source={item.source} />
                                            <span className="ml-auto text-[10px] tabular-nums text-muted">P{item.priority ?? 0}</span>
                                        </div>
                                        {item.title ? <p className="mb-1 text-sm font-semibold text-text">{item.title}</p> : null}
                                        <p className="break-all font-mono text-xs leading-relaxed text-text/80" title={item.folder}>
                                            {item.folder}
                                        </p>
                                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
                                            <span>{formatScannerWhen(item.time)}</span>
                                            {item.quality ? <span>{item.quality}</span> : null}
                                            {item.eventType ? <span className="opacity-70">{item.eventType}</span> : null}
                                        </div>
                                    </EventCard>
                                );
                            })}
                        </ul>
                    )}
                </DashboardPanel>

                <DashboardPanel
                    title="Recent activity"
                    subtitle={`Latest ${ACTIVITY_FETCH_LIMIT} events · ${ACTIVITY_PAGE_SIZE} per page.`}
                    controls={(
                        <div className="flex flex-wrap items-center gap-2">
                            {configuredSources.length > 0 ? (
                                <CustomSelect
                                    id="scanner-activity-source"
                                    value={activitySource}
                                    onChange={setActivitySource}
                                    options={activitySourceOptions}
                                    compact
                                    className="w-44"
                                />
                            ) : null}
                            <CustomSelect
                                id="scanner-activity-event"
                                value={activityEvent}
                                onChange={setActivityEvent}
                                options={activityEventOptions}
                                compact
                                className="w-40"
                            />
                        </div>
                    )}
                    badge={(
                        <span className="whitespace-nowrap rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-200">
                            {filteredLog.length} events
                        </span>
                    )}
                >
                    {filteredLog.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-10 text-center">
                            <p className="text-sm text-muted">
                                {log.length === 0
                                    ? 'No scans processed yet.'
                                    : activityEvent !== 'all'
                                        ? `No ${SCANNER_ACTION_FILTER_LABELS[activityEvent] || activityEvent} events${activitySource !== 'all' ? ` for ${SOURCE_LABELS[activitySource] || activitySource}` : ''}.`
                                        : `No ${SOURCE_LABELS[activitySource] || activitySource} activity found.`}
                            </p>
                        </div>
                    ) : (
                        <>
                        <ul className="space-y-2">
                            {activityPageEntries.map((entry, i) => {
                                const style = scannerActionStyles(entry.action || entry.reason, entry.isUpgrade);
                                const targets = Array.isArray(entry.results) ? entry.results : [];
                                const globalIndex = activitySafePage * ACTIVITY_PAGE_SIZE + i;
                                return (
                                    <EventCard key={`${entry.at}-${globalIndex}`} accent={entry.ok ? 'emerald' : 'rose'}>
                                        <div className="mb-2 flex flex-wrap items-center gap-2">
                                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                                entry.ok
                                                    ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300'
                                                    : 'border-red-400/30 bg-red-500/15 text-red-300'
                                            }`}>
                                                {entry.ok ? 'OK' : 'Error'}
                                            </span>
                                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${style.className}`}>
                                                <ActionIcon action={entry.action} className="h-3 w-3" />
                                                {entry.reason || style.label}
                                            </span>
                                            <ScannerSourceBadge source={entry.source} />
                                            <span className="ml-auto text-[10px] text-muted">{formatScannerWhen(entry.at)}</span>
                                        </div>
                                        {entry.title ? <p className="mb-1 text-sm font-semibold text-text">{entry.title}</p> : null}
                                        <p className="break-all font-mono text-xs leading-relaxed text-text/85" title={entry.folder}>
                                            {entry.folder}
                                        </p>
                                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
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
                                        {entry.error ? <p className="mt-2 text-xs text-red-200">{entry.error}</p> : null}
                                    </EventCard>
                                );
                            })}
                        </ul>
                        {filteredLog.length > ACTIVITY_PAGE_SIZE ? (
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                                <p className="text-xs text-muted">
                                    Showing {activitySafePage * ACTIVITY_PAGE_SIZE + 1}–{Math.min(filteredLog.length, (activitySafePage + 1) * ACTIVITY_PAGE_SIZE)} of {filteredLog.length}
                                </p>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-white/5 hover:text-text disabled:opacity-40"
                                        disabled={activitySafePage <= 0}
                                        onClick={() => setActivityPage((p) => Math.max(0, p - 1))}
                                    >
                                        <ChevronLeft className="h-3.5 w-3.5" />
                                        Prev
                                    </button>
                                    <span className="text-xs font-semibold tabular-nums text-muted">
                                        {activitySafePage + 1} / {activityTotalPages}
                                    </span>
                                    <button
                                        type="button"
                                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-white/5 hover:text-text disabled:opacity-40"
                                        disabled={activitySafePage >= activityTotalPages - 1}
                                        onClick={() => setActivityPage((p) => Math.min(activityTotalPages - 1, p + 1))}
                                    >
                                        Next
                                        <ChevronRight className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                        ) : null}
                        </>
                    )}
                </DashboardPanel>
            </div>
        </DashboardPageShell>
    );
};

export default ScannerDashboard;
