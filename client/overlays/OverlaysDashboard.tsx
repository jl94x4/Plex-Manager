import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    CheckCircle2,
    Clock3,
    Layers,
    List,
    Loader2,
    Play,
    RefreshCw,
    RotateCcw,
    Save,
    Settings2,
    Square,
    Upload,
    XCircle,
} from 'lucide-react';
import {
    DashboardHero,
    DashboardPageShell,
    DashboardPanel,
    DashboardStatCard,
    DashboardSubnav,
    dashboardSubnavLinkClass,
} from '../shared/dashboard/DashboardChrome';
import { CustomSelect, SettingsToggleRow, StyledCheckbox } from '../shared/ui';
import { pushToast, ToastContainer, type ToastMessage } from '../shared/toast';
import { overlaysApi, type OverlaysConfig } from './api';

type TabId = 'overview' | 'shows' | 'settings' | 'import' | 'activity';

const buttonClass = 'inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-text hover:bg-white/10 disabled:opacity-50';
const primaryButtonClass = 'inline-flex items-center gap-2 rounded-md bg-plex px-3 py-2 text-sm font-bold text-background hover:bg-plex-hover disabled:opacity-50';
const fieldInputClass = 'mt-1.5 w-full rounded-lg border border-border bg-background p-3 text-sm text-text outline-none transition-all focus:border-plex focus:ring-1 focus:ring-plex';
const fieldLabelClass = 'text-[10px] font-bold uppercase tracking-[0.14em] text-muted';

const DEFAULT_CONFIG: OverlaysConfig = {
    enabled: true,
    previewMode: false,
    newSeasonDays: 21,
    librarySectionIds: [],
    overlayPresetId: 'new-season',
    scheduleHours: 24,
    skipIfKometaOverlayLabel: true,
};

export const OverlaysDashboard: React.FC = () => {
    const [tab, setTab] = useState<TabId>('overview');
    const [status, setStatus] = useState<any>(null);
    const [configDraft, setConfigDraft] = useState<OverlaysConfig>(DEFAULT_CONFIG);
    const [shows, setShows] = useState<any[]>([]);
    const [sections, setSections] = useState<Array<{ id: string; key: string; title: string }>>([]);
    const [reconcile, setReconcile] = useState<any>(null);
    const [importText, setImportText] = useState('');
    const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
    const [busy, setBusy] = useState<string | null>(null);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const toast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToasts((prev) => pushToast(prev, message, type));
    }, []);

    const refresh = useCallback(async () => {
        const [nextStatus, showsRes] = await Promise.all([
            overlaysApi.status(),
            overlaysApi.shows().catch(() => ({ shows: [] })),
        ]);
        setStatus(nextStatus);
        if (nextStatus?.config) setConfigDraft({ ...DEFAULT_CONFIG, ...nextStatus.config });
        setShows(showsRes.shows || []);
    }, []);

    useEffect(() => {
        void refresh().catch((error) => toast(error.message || 'Failed to load Overlays', 'error'));
    }, [refresh, toast]);

    useEffect(() => {
        if (!status?.running) return undefined;
        const timer = window.setInterval(() => {
            void refresh().catch(() => {});
        }, 2000);
        return () => window.clearInterval(timer);
    }, [status?.running, refresh]);

    const loadSections = useCallback(async () => {
        try {
            const res = await overlaysApi.sections();
            setSections(res.sections || []);
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to list TV sections', 'error');
        }
    }, [toast]);

    const summary = status?.lastRunSummary || configDraft.lastRunSummary || null;
    const activity = status?.activity || [];
    const workerReady = !!status?.workerReady;
    const showCount = shows.length || status?.logCount || 0;

    const tabs = useMemo(() => ([
        { id: 'overview' as const, label: 'Overview', icon: Layers },
        { id: 'shows' as const, label: `Shows (${showCount})`, icon: List },
        { id: 'settings' as const, label: 'Settings', icon: Settings2 },
        { id: 'import' as const, label: 'Import', icon: Upload },
        { id: 'activity' as const, label: 'Activity', icon: Activity },
    ]), [showCount]);

    const presetOptions = useMemo(
        () => (status?.presets || [{ id: 'new-season' }]).map((preset: { id: string }) => ({
            value: preset.id,
            label: preset.id,
        })),
        [status?.presets],
    );

    const importModeOptions = useMemo(() => ([
        { value: 'merge', label: 'Merge' },
        { value: 'replace', label: 'Replace' },
    ]), []);

    const runAction = async (label: string, fn: () => Promise<unknown>) => {
        setBusy(label);
        try {
            await fn();
            await refresh();
            toast(`${label} complete`);
        } catch (error) {
            toast(error instanceof Error ? error.message : `${label} failed`, 'error');
        } finally {
            setBusy(null);
        }
    };

    const saveSettings = () => runAction('Save settings', async () => {
        await overlaysApi.saveConfig(configDraft);
    });

    const resetAll = () => {
        const count = status?.logCount || shows.length || 0;
        const ok = window.confirm(
            `Reset all ${count} logged New Season overlay(s)?\n\nThis restores original posters from config/overlays/backups/ when available (falls back to Plex metadata), then clears the log.`,
        );
        if (!ok) return;
        void runAction('Reset all', () => overlaysApi.resetAll());
    };

    return (
        <DashboardPageShell>
            <ToastContainer toasts={toasts} setToasts={setToasts} />

            <DashboardHero
                accent="plex"
                eyebrow="Overlays"
                title="New Season banners"
                description="Phase 1: TV show season banners (parity with the standalone plex-new-season-overlay tool). Uses Media Player Plex credentials. Skip shows that already have a Kometa Overlay label by default."
                icon={<Layers className="h-3.5 w-3.5" />}
                secondaryBlob
                actions={(
                    <>
                        <button
                            type="button"
                            className={buttonClass}
                            disabled={busy !== null}
                            onClick={() => void runAction('Refresh', refresh)}
                        >
                            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> Refresh
                        </button>
                        <button
                            type="button"
                            className={buttonClass}
                            disabled={busy !== null || !status?.running}
                            onClick={() => void runAction('Stop', () => overlaysApi.stop())}
                        >
                            <Square className="h-4 w-4" /> Stop
                        </button>
                        <button
                            type="button"
                            className={buttonClass}
                            disabled={busy !== null || status?.running}
                            onClick={() => void runAction('Preview', () => overlaysApi.preview())}
                        >
                            Preview
                        </button>
                        <button
                            type="button"
                            className={`${buttonClass} border-amber-500/40 text-amber-100`}
                            disabled={busy !== null || status?.running || !(status?.logCount > 0)}
                            onClick={resetAll}
                        >
                            <RotateCcw className="h-4 w-4" /> Reset all
                        </button>
                        <button
                            type="button"
                            className={primaryButtonClass}
                            disabled={busy !== null || status?.running || !workerReady}
                            onClick={() => void runAction('Run', () => overlaysApi.run({ preview: false }))}
                        >
                            {busy || status?.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                            Run now
                        </button>
                    </>
                )}
            />

            <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30">
                <div className="grid grid-cols-3 divide-x divide-white/10">
                    <div className="flex min-w-0 flex-col items-center gap-1 px-2 py-2.5 text-center sm:items-start sm:px-3 sm:py-3 sm:text-left">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
                            {workerReady
                                ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                                : <XCircle className="h-3.5 w-3.5 text-rose-300" />}
                            <span>Worker</span>
                        </div>
                        <p className={`truncate text-sm font-semibold sm:text-[15px] ${workerReady ? 'text-text' : 'text-amber-100'}`}>
                            {workerReady ? 'Ready' : 'Missing'}
                        </p>
                    </div>
                    <div className="flex min-w-0 flex-col items-center gap-1 px-2 py-2.5 text-center sm:items-start sm:px-3 sm:py-3 sm:text-left">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
                            <Layers className="h-3.5 w-3.5 text-sky-300" />
                            <span>Logged</span>
                        </div>
                        <p className="truncate text-sm font-semibold tabular-nums sm:text-[15px]">{status?.logCount ?? 0}</p>
                    </div>
                    <div className="flex min-w-0 flex-col items-center gap-1 px-2 py-2.5 text-center sm:items-start sm:px-3 sm:py-3 sm:text-left">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
                            <Clock3 className="h-3.5 w-3.5 text-plex" />
                            <span>Schedule</span>
                        </div>
                        <p className="truncate text-sm font-semibold sm:text-[15px]">
                            {configDraft.scheduleHours ? `Every ${configDraft.scheduleHours}h` : 'Disabled'}
                        </p>
                    </div>
                </div>
            </div>

            {!workerReady && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                        <p className="font-semibold">Overlays Python worker missing</p>
                        <p className="text-sm text-amber-100/80">
                            Expected <code>overlays/cli.py</code> in the container or repo root. On Docker, rebuild the image so the overlays worker is bundled; locally run{' '}
                            <code>pip install -r overlays/requirements.txt</code> (or reuse the Poster Sets venv).
                        </p>
                    </div>
                </div>
            )}

            <DashboardSubnav className="!flex">
                {tabs.map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        type="button"
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${dashboardSubnavLinkClass(tab === id)}`}
                        onClick={() => setTab(id)}
                    >
                        <Icon className="h-4 w-4" />
                        {label}
                    </button>
                ))}
            </DashboardSubnav>

            {tab === 'overview' && (
                <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                        <DashboardStatCard
                            label="Logged overlays"
                            value={status?.logCount ?? 0}
                            icon={<Layers className="h-4 w-4 text-sky-300" />}
                            glow="sky"
                        />
                        <DashboardStatCard
                            label="Last run"
                            value={status?.lastRunAt ? new Date(status.lastRunAt).toLocaleString() : 'Never'}
                            hint={summary ? `+${String(summary.added ?? 0)} / −${String(summary.removed ?? 0)}${summary.previewMode ? ' (preview)' : ''}` : undefined}
                            icon={<Clock3 className="h-4 w-4 text-plex" />}
                            glow="plex"
                            valueClassName="text-lg md:text-xl"
                        />
                        <DashboardStatCard
                            label="New season window"
                            value={`${configDraft.newSeasonDays || 21} days`}
                            hint={`Preset: ${configDraft.overlayPresetId || 'new-season'}`}
                            icon={<Settings2 className="h-4 w-4 text-amber-300" />}
                            glow="amber"
                            valueClassName="text-lg md:text-xl"
                        />
                    </div>

                    <DashboardPanel title="Quick configuration" subtitle="Adjust window and schedule, then scan or run.">
                        <div className="flex flex-wrap items-end gap-3">
                            <label className="min-w-[160px] flex-1">
                                <span className={fieldLabelClass}>New season window (days)</span>
                                <input
                                    type="number"
                                    min={1}
                                    max={365}
                                    className={fieldInputClass}
                                    value={configDraft.newSeasonDays ?? 21}
                                    onChange={(e) => setConfigDraft((prev) => ({
                                        ...prev,
                                        newSeasonDays: Math.max(1, Math.min(365, Number(e.target.value) || 21)),
                                    }))}
                                />
                            </label>
                            <label className="min-w-[160px] flex-1">
                                <span className={fieldLabelClass}>Schedule (hours, 0=off)</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={168}
                                    className={fieldInputClass}
                                    value={configDraft.scheduleHours ?? 24}
                                    onChange={(e) => setConfigDraft((prev) => ({
                                        ...prev,
                                        scheduleHours: Math.max(0, Math.min(168, Number(e.target.value) || 0)),
                                    }))}
                                />
                            </label>
                            <button
                                type="button"
                                className={primaryButtonClass}
                                disabled={busy !== null}
                                onClick={() => void saveSettings()}
                            >
                                <Save className="h-4 w-4" /> Save
                            </button>
                        </div>
                        <p className="mt-3 text-xs text-muted">
                            Days controls how long a season counts as “new” (default 21, same as the standalone tool). Change it anytime — Save, then Scan / Run.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <button
                                type="button"
                                className={buttonClass}
                                disabled={busy !== null || !workerReady}
                                onClick={() => void runAction('Scan', async () => {
                                    const res = await overlaysApi.scan();
                                    setReconcile(null);
                                    toast(`Eligible: ${res.eligibleCount ?? 0}`);
                                })}
                            >
                                Scan library
                            </button>
                            <button
                                type="button"
                                className={buttonClass}
                                disabled={busy !== null || !workerReady}
                                onClick={() => void runAction('Reconcile', async () => {
                                    const res = await overlaysApi.reconcile();
                                    setReconcile(res);
                                    setTab('import');
                                })}
                            >
                                Reconcile dry-run
                            </button>
                        </div>
                        <p className="mt-3 text-xs text-muted">
                            Preview writes to <code>config/overlays/preview/</code>. Live mode uploads show + latest-season posters to Plex and updates <code>overlaid_log.json</code>.
                        </p>
                    </DashboardPanel>
                </div>
            )}

            {tab === 'shows' && (
                <DashboardPanel
                    title="Tracked shows"
                    subtitle="Shows currently tracked in overlaid_log.json."
                    controls={(
                        <button
                            type="button"
                            className={`${buttonClass} border-amber-500/40 text-amber-100`}
                            disabled={busy !== null || status?.running || shows.length === 0}
                            onClick={resetAll}
                        >
                            <RotateCcw className="h-4 w-4" /> Reset all overlays
                        </button>
                    )}
                >
                    {shows.length === 0 ? (
                        <p className="text-sm text-muted">No overlays logged yet. Run a preview/live pass or import an existing log.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-left text-sm">
                                <thead className="text-xs uppercase text-muted">
                                    <tr>
                                        <th className="px-2 py-2">Title</th>
                                        <th className="px-2 py-2">Key</th>
                                        <th className="px-2 py-2">Season</th>
                                        <th className="px-2 py-2">Mode</th>
                                        <th className="px-2 py-2">When</th>
                                        <th className="px-2 py-2" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {shows.map((row) => (
                                        <tr key={row.ratingKey} className="border-t border-white/10">
                                            <td className="px-2 py-2 font-medium">{row.title}</td>
                                            <td className="px-2 py-2 tabular-nums text-muted">{row.ratingKey}</td>
                                            <td className="px-2 py-2">{row.seasonIndex ?? '—'}</td>
                                            <td className="px-2 py-2">{row.previewOnly ? 'Preview' : 'Live'}</td>
                                            <td className="px-2 py-2 text-muted">
                                                {row.timestamp ? new Date(row.timestamp).toLocaleString() : '—'}
                                            </td>
                                            <td className="px-2 py-2 text-right">
                                                <button
                                                    type="button"
                                                    className="text-xs font-semibold text-amber-200 hover:underline disabled:opacity-50"
                                                    disabled={busy !== null}
                                                    onClick={() => void runAction('Reset', () => overlaysApi.resetOne(row.ratingKey))}
                                                >
                                                    Reset
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </DashboardPanel>
            )}

            {tab === 'settings' && (
                <DashboardPanel title="Settings" subtitle="Module behaviour, schedule, and library scope.">
                    <SettingsToggleRow
                        title="Module enabled"
                        checked={configDraft.enabled !== false}
                        onChange={(enabled) => setConfigDraft((prev) => ({ ...prev, enabled }))}
                    />
                    <SettingsToggleRow
                        title="Default to preview mode (scheduled too)"
                        checked={configDraft.previewMode === true}
                        onChange={(previewMode) => setConfigDraft((prev) => ({ ...prev, previewMode }))}
                    />
                    <SettingsToggleRow
                        title="Skip if Kometa Overlay label present"
                        checked={configDraft.skipIfKometaOverlayLabel !== false}
                        onChange={(skipIfKometaOverlayLabel) => setConfigDraft((prev) => ({ ...prev, skipIfKometaOverlayLabel }))}
                    />

                    <div className="grid gap-4 border-b border-border/40 py-4 md:grid-cols-2">
                        <label className="block">
                            <span className={fieldLabelClass}>New season window (days)</span>
                            <input
                                type="number"
                                min={1}
                                max={365}
                                className={fieldInputClass}
                                value={configDraft.newSeasonDays ?? 21}
                                onChange={(e) => setConfigDraft((prev) => ({
                                    ...prev,
                                    newSeasonDays: Math.max(1, Math.min(365, Number(e.target.value) || 21)),
                                }))}
                            />
                            <span className="mt-1 block text-[11px] text-muted">
                                How long after S01 airs a season stays eligible (1–365).
                            </span>
                        </label>
                        <label className="block">
                            <span className={fieldLabelClass}>Schedule hours (0 = off)</span>
                            <input
                                type="number"
                                min={0}
                                max={168}
                                className={fieldInputClass}
                                value={configDraft.scheduleHours ?? 24}
                                onChange={(e) => setConfigDraft((prev) => ({
                                    ...prev,
                                    scheduleHours: Number(e.target.value) || 0,
                                }))}
                            />
                        </label>
                    </div>

                    <div className="border-b border-border/40 py-4">
                        <span className={fieldLabelClass}>Overlay preset</span>
                        <CustomSelect
                            className="mt-1.5 max-w-md"
                            value={configDraft.overlayPresetId || 'new-season'}
                            onChange={(value) => setConfigDraft((prev) => ({ ...prev, overlayPresetId: value }))}
                            options={presetOptions}
                        />
                    </div>

                    <div className="py-4">
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <span className={fieldLabelClass}>TV libraries (empty = all)</span>
                            <button type="button" className="text-xs font-semibold text-plex underline" onClick={() => void loadSections()}>
                                Load sections
                            </button>
                        </div>
                        {sections.length === 0 ? (
                            <p className="text-xs text-muted">Load sections to pick specific TV libraries.</p>
                        ) : (
                            <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-border bg-background/40 p-3">
                                {sections.map((section) => {
                                    const id = section.id || section.key;
                                    const checked = (configDraft.librarySectionIds || []).includes(id);
                                    return (
                                        <StyledCheckbox
                                            key={id}
                                            checked={checked}
                                            label={`${section.title} (${id})`}
                                            onChange={(next) => {
                                                setConfigDraft((prev) => {
                                                    const current = new Set(prev.librarySectionIds || []);
                                                    if (next) current.add(id);
                                                    else current.delete(id);
                                                    return { ...prev, librarySectionIds: [...current] };
                                                });
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        className={primaryButtonClass}
                        disabled={busy !== null}
                        onClick={() => void saveSettings()}
                    >
                        <Save className="h-4 w-4" /> Save settings
                    </button>
                </DashboardPanel>
            )}

            {tab === 'import' && (
                <DashboardPanel title="Import log" subtitle="Migrate from the standalone plex-new-season-overlay tool.">
                    <p className="text-sm text-muted">
                        Paste your standalone <code>overlaid_log.json</code> to migrate without re-stamping already-overlaid shows.
                    </p>
                    <textarea
                        className="mt-3 min-h-[220px] w-full rounded-lg border border-border bg-background p-3 font-mono text-xs text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex"
                        placeholder='{"12345":{"title":"Example Show","timestamp":"2025-01-15T14:30:00","preview_only":false}}'
                        value={importText}
                        onChange={(e) => setImportText(e.target.value)}
                    />
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <CustomSelect
                            className="w-40"
                            compact
                            value={importMode}
                            onChange={(value) => setImportMode(value === 'replace' ? 'replace' : 'merge')}
                            options={importModeOptions}
                        />
                        <button
                            type="button"
                            className={primaryButtonClass}
                            disabled={busy !== null || !importText.trim()}
                            onClick={() => void runAction('Import', async () => {
                                const parsed = JSON.parse(importText);
                                await overlaysApi.importLog(parsed, importMode);
                            })}
                        >
                            <Upload className="h-4 w-4" /> Import log
                        </button>
                        <button
                            type="button"
                            className={buttonClass}
                            disabled={busy !== null || !workerReady}
                            onClick={() => void runAction('Reconcile', async () => {
                                setReconcile(await overlaysApi.reconcile());
                            })}
                        >
                            Reconcile dry-run
                        </button>
                    </div>
                    {reconcile && (
                        <div className="mt-4 rounded-lg border border-white/10 bg-black/25 p-3 text-sm">
                            <p className="font-semibold">Reconcile</p>
                            <p className="mt-1 text-muted">
                                Would add {reconcile.wouldAddCount ?? 0} · convert {reconcile.wouldConvertCount ?? 0} · remove {reconcile.wouldRemoveCount ?? 0}
                            </p>
                        </div>
                    )}
                </DashboardPanel>
            )}

            {tab === 'activity' && (
                <DashboardPanel title="Activity" subtitle="Recent worker output this session.">
                    {status?.running && (
                        <p className="mb-3 inline-flex items-center gap-2 text-sm text-plex">
                            <Loader2 className="h-4 w-4 animate-spin" /> Running {status.command || '…'}
                        </p>
                    )}
                    {activity.length === 0 ? (
                        <p className="text-sm text-muted">No activity yet this session.</p>
                    ) : (
                        <ul className="max-h-[480px] space-y-1 overflow-y-auto font-mono text-xs">
                            {activity.map((entry: any, index: number) => (
                                <li key={`${entry.at}-${index}`} className={entry.level === 'error' ? 'text-red-300' : 'text-text/80'}>
                                    <span className="text-muted">{new Date(entry.at).toLocaleTimeString()}</span>
                                    {' '}
                                    {entry.message}
                                </li>
                            ))}
                        </ul>
                    )}
                </DashboardPanel>
            )}

            {status?.lastError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span className="text-sm">{status.lastError}</span>
                </div>
            )}

            {configDraft.enabled !== false && workerReady && (
                <p className="inline-flex items-center gap-2 text-xs text-muted">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                    Worker ready · data in <code>config/overlays/</code>
                </p>
            )}
        </DashboardPageShell>
    );
};

export default OverlaysDashboard;
