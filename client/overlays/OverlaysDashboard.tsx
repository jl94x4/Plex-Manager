import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    Layers,
    Loader2,
    Play,
    RefreshCw,
    Save,
    Square,
    Upload,
} from 'lucide-react';
import { pushToast, ToastContainer, type ToastMessage } from '../shared/toast';
import { overlaysApi, type OverlaysConfig } from './api';

type TabId = 'overview' | 'shows' | 'settings' | 'import' | 'activity';

const buttonClass = 'inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-text hover:bg-white/10 disabled:opacity-50';
const primaryButtonClass = 'inline-flex items-center gap-2 rounded-md bg-plex px-3 py-2 text-sm font-bold text-background hover:bg-plex-hover disabled:opacity-50';
const cardClass = 'rounded-xl border border-white/10 bg-black/30 p-4';

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

    const tabs = useMemo(() => ([
        { id: 'overview' as const, label: 'Overview' },
        { id: 'shows' as const, label: `Shows (${shows.length || status?.logCount || 0})` },
        { id: 'settings' as const, label: 'Settings' },
        { id: 'import' as const, label: 'Import' },
        { id: 'activity' as const, label: 'Activity' },
    ]), [shows.length, status?.logCount]);

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

    return (
        <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="inline-flex items-center gap-2 text-plex">
                        <Layers className="h-5 w-5" />
                        <h1 className="text-2xl font-bold text-text">Overlays</h1>
                    </div>
                    <p className="mt-1 max-w-2xl text-sm text-muted">
                        Phase 1: New Season banners for TV shows (parity with the standalone plex-new-season-overlay tool).
                        Uses Media Player Plex credentials. Skip shows that already have a Kometa Overlay label by default.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        className={buttonClass}
                        disabled={busy !== null}
                        onClick={() => void runAction('Refresh', refresh)}
                    >
                        <RefreshCw className="h-4 w-4" /> Refresh
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
                        className={primaryButtonClass}
                        disabled={busy !== null || status?.running}
                        onClick={() => void runAction('Run', () => overlaysApi.run({ preview: false }))}
                    >
                        {busy || status?.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        Run now
                    </button>
                </div>
            </div>

            {!status?.workerReady && (
                <div className={`${cardClass} flex items-start gap-3 border-amber-500/30 text-amber-100`}>
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                        <p className="font-semibold">Overlays Python worker missing</p>
                        <p className="text-sm text-amber-100/80">
                            Expected <code>overlays/cli.py</code>. Install deps with{' '}
                            <code>pip install -r overlays/requirements.txt</code> (or reuse the Poster Sets venv).
                        </p>
                    </div>
                </div>
            )}

            <div className="flex flex-wrap gap-2 border-b border-white/10 pb-2">
                {tabs.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tab === item.id ? 'bg-plex text-background' : 'text-muted hover:bg-white/5 hover:text-text'}`}
                        onClick={() => setTab(item.id)}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            {tab === 'overview' && (
                <div className="grid gap-4 md:grid-cols-3">
                    <div className={cardClass}>
                        <p className="text-xs uppercase tracking-wide text-muted">Logged overlays</p>
                        <p className="mt-2 text-3xl font-bold tabular-nums">{status?.logCount ?? 0}</p>
                    </div>
                    <div className={cardClass}>
                        <p className="text-xs uppercase tracking-wide text-muted">Last run</p>
                        <p className="mt-2 text-sm font-semibold">
                            {status?.lastRunAt ? new Date(status.lastRunAt).toLocaleString() : 'Never'}
                        </p>
                        {summary && (
                            <p className="mt-2 text-xs text-muted">
                                +{String(summary.added ?? 0)} / −{String(summary.removed ?? 0)}
                                {summary.previewMode ? ' (preview)' : ''}
                            </p>
                        )}
                    </div>
                    <div className={cardClass}>
                        <p className="text-xs uppercase tracking-wide text-muted">Schedule</p>
                        <p className="mt-2 text-sm font-semibold">
                            {configDraft.scheduleHours ? `Every ${configDraft.scheduleHours}h` : 'Disabled'}
                        </p>
                        <p className="mt-2 text-xs text-muted">
                            Window {configDraft.newSeasonDays || 21} days · preset {configDraft.overlayPresetId || 'new-season'}
                        </p>
                    </div>
                    <div className={`${cardClass} md:col-span-3`}>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                className={buttonClass}
                                disabled={busy !== null}
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
                                disabled={busy !== null}
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
                    </div>
                </div>
            )}

            {tab === 'shows' && (
                <div className={cardClass}>
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
                </div>
            )}

            {tab === 'settings' && (
                <div className={`${cardClass} space-y-4`}>
                    <label className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold">Module enabled</span>
                        <input
                            type="checkbox"
                            checked={configDraft.enabled !== false}
                            onChange={(e) => setConfigDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
                        />
                    </label>
                    <label className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold">Default to preview mode (scheduled too)</span>
                        <input
                            type="checkbox"
                            checked={configDraft.previewMode === true}
                            onChange={(e) => setConfigDraft((prev) => ({ ...prev, previewMode: e.target.checked }))}
                        />
                    </label>
                    <label className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold">Skip if Kometa Overlay label present</span>
                        <input
                            type="checkbox"
                            checked={configDraft.skipIfKometaOverlayLabel !== false}
                            onChange={(e) => setConfigDraft((prev) => ({ ...prev, skipIfKometaOverlayLabel: e.target.checked }))}
                        />
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase text-muted">New season window (days)</span>
                        <input
                            type="number"
                            min={1}
                            max={365}
                            className="mt-1.5 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm"
                            value={configDraft.newSeasonDays ?? 21}
                            onChange={(e) => setConfigDraft((prev) => ({
                                ...prev,
                                newSeasonDays: Number(e.target.value) || 21,
                            }))}
                        />
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase text-muted">Schedule hours (0 = off)</span>
                        <input
                            type="number"
                            min={0}
                            max={168}
                            className="mt-1.5 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm"
                            value={configDraft.scheduleHours ?? 24}
                            onChange={(e) => setConfigDraft((prev) => ({
                                ...prev,
                                scheduleHours: Number(e.target.value) || 0,
                            }))}
                        />
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase text-muted">Overlay preset</span>
                        <select
                            className="mt-1.5 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm"
                            value={configDraft.overlayPresetId || 'new-season'}
                            onChange={(e) => setConfigDraft((prev) => ({ ...prev, overlayPresetId: e.target.value }))}
                        >
                            {(status?.presets || [{ id: 'new-season' }]).map((preset: { id: string }) => (
                                <option key={preset.id} value={preset.id}>{preset.id}</option>
                            ))}
                        </select>
                    </label>
                    <div>
                        <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase text-muted">TV libraries (empty = all)</span>
                            <button type="button" className="text-xs text-plex underline" onClick={() => void loadSections()}>
                                Load sections
                            </button>
                        </div>
                        {sections.length === 0 ? (
                            <p className="text-xs text-muted">Load sections to pick specific TV libraries.</p>
                        ) : (
                            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-white/10 p-2">
                                {sections.map((section) => {
                                    const id = section.id || section.key;
                                    const checked = (configDraft.librarySectionIds || []).includes(id);
                                    return (
                                        <label key={id} className="flex items-center gap-2 text-sm">
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={(e) => {
                                                    setConfigDraft((prev) => {
                                                        const current = new Set(prev.librarySectionIds || []);
                                                        if (e.target.checked) current.add(id);
                                                        else current.delete(id);
                                                        return { ...prev, librarySectionIds: [...current] };
                                                    });
                                                }}
                                            />
                                            {section.title}
                                            <span className="text-xs text-muted">({id})</span>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        className={primaryButtonClass}
                        disabled={busy !== null}
                        onClick={() => void runAction('Save settings', async () => {
                            await overlaysApi.saveConfig(configDraft);
                        })}
                    >
                        <Save className="h-4 w-4" /> Save settings
                    </button>
                </div>
            )}

            {tab === 'import' && (
                <div className={`${cardClass} space-y-4`}>
                    <p className="text-sm text-muted">
                        Paste your standalone <code>overlaid_log.json</code> to migrate without re-stamping already-overlaid shows.
                    </p>
                    <textarea
                        className="min-h-[220px] w-full rounded-md border border-white/15 bg-black/40 p-3 font-mono text-xs"
                        placeholder='{"12345":{"title":"Example Show","timestamp":"2025-01-15T14:30:00","preview_only":false}}'
                        value={importText}
                        onChange={(e) => setImportText(e.target.value)}
                    />
                    <div className="flex flex-wrap items-center gap-3">
                        <label className="text-sm">
                            <select
                                className="rounded-md border border-white/15 bg-black/40 px-2 py-1.5"
                                value={importMode}
                                onChange={(e) => setImportMode(e.target.value === 'replace' ? 'replace' : 'merge')}
                            >
                                <option value="merge">Merge</option>
                                <option value="replace">Replace</option>
                            </select>
                        </label>
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
                            disabled={busy !== null}
                            onClick={() => void runAction('Reconcile', async () => {
                                setReconcile(await overlaysApi.reconcile());
                            })}
                        >
                            Reconcile dry-run
                        </button>
                    </div>
                    {reconcile && (
                        <div className="rounded-lg border border-white/10 bg-black/25 p-3 text-sm">
                            <p className="font-semibold">Reconcile</p>
                            <p className="mt-1 text-muted">
                                Would add {reconcile.wouldAddCount ?? 0} · convert {reconcile.wouldConvertCount ?? 0} · remove {reconcile.wouldRemoveCount ?? 0}
                            </p>
                        </div>
                    )}
                </div>
            )}

            {tab === 'activity' && (
                <div className={`${cardClass} space-y-2`}>
                    {status?.running && (
                        <p className="inline-flex items-center gap-2 text-sm text-plex">
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
                </div>
            )}

            <ToastContainer toasts={toasts} setToasts={setToasts} />

            {status?.lastError && (
                <div className={`${cardClass} flex items-start gap-2 border-red-500/30 text-red-200`}>
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span className="text-sm">{status.lastError}</span>
                </div>
            )}

            {configDraft.enabled !== false && status?.workerReady && (
                <p className="inline-flex items-center gap-2 text-xs text-muted">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                    Worker ready · data in <code>config/overlays/</code>
                </p>
            )}
        </div>
    );
};

export default OverlaysDashboard;
