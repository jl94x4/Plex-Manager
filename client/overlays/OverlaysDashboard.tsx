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
import { askConfirm } from '../shared/confirm';
import { pushToast, ToastContainer, type ToastMessage } from '../shared/toast';
import { useDiscoverI18n } from '../discovery/i18n';
import { overlaysApi, type OverlaysConfig } from './api';

type TabId = 'overview' | 'shows' | 'settings' | 'import' | 'activity';
type ActionId = 'refresh' | 'stop' | 'preview' | 'resetAll' | 'run' | 'saveSettings' | 'scan' | 'reconcile' | 'reset' | 'importLog';

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
    const { t } = useDiscoverI18n();
    const [tab, setTab] = useState<TabId>('overview');
    const [status, setStatus] = useState<any>(null);
    const [configDraft, setConfigDraft] = useState<OverlaysConfig>(DEFAULT_CONFIG);
    const [shows, setShows] = useState<any[]>([]);
    const [sections, setSections] = useState<Array<{ id: string; key: string; title: string }>>([]);
    const [reconcile, setReconcile] = useState<any>(null);
    const [importText, setImportText] = useState('');
    const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
    const [busy, setBusy] = useState<ActionId | null>(null);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const wasRunningRef = React.useRef(false);

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
        return nextStatus;
    }, []);

    useEffect(() => {
        void refresh().catch((error) => toast(error.message || t('overlays.loadFailed'), 'error'));
    }, [refresh, toast, t]);

    useEffect(() => {
        if (!status?.running) return undefined;
        const timer = window.setInterval(() => {
            void refresh().catch(() => {});
        }, 1500);
        return () => window.clearInterval(timer);
    }, [status?.running, refresh]);

    useEffect(() => {
        const running = !!status?.running;
        if (wasRunningRef.current && !running) {
            if (status?.lastOutcome === 'cancelled') {
                // Stop action already toasts
            } else if (status?.lastError || status?.lastOutcome === 'error') {
                toast(status.lastError || t('overlays.jobFailed'), 'error');
            } else if (status?.lastOutcome === 'ok') {
                const s = status?.lastRunSummary;
                toast(
                    s
                        ? t('overlays.jobFinishedSummary', {
                            added: s.added ?? 0,
                            removed: s.removed ?? 0,
                            preview: s.previewMode ? t('overlays.overview.previewSuffix') : '',
                        })
                        : t('overlays.jobFinished'),
                );
            }
            void overlaysApi.shows().then((showsRes) => setShows(showsRes.shows || [])).catch(() => {});
        }
        wasRunningRef.current = running;
    }, [status?.running, status?.lastError, status?.lastOutcome, status?.lastRunSummary, toast, t]);

    const loadSections = useCallback(async () => {
        try {
            const res = await overlaysApi.sections();
            setSections(res.sections || []);
        } catch (error) {
            toast(error instanceof Error ? error.message : t('overlays.sectionsLoadFailed'), 'error');
        }
    }, [toast, t]);

    const summary = status?.lastRunSummary || configDraft.lastRunSummary || null;
    const activity = status?.activity || [];
    const workerReady = !!status?.workerReady;
    const showCount = shows.length || status?.logCount || 0;
    const jobRunning = !!status?.running;

    const tabs = useMemo(() => ([
        { id: 'overview' as const, label: t('overlays.tabs.overview'), icon: Layers },
        { id: 'shows' as const, label: t('overlays.tabs.shows', { count: showCount }), icon: List },
        { id: 'settings' as const, label: t('overlays.tabs.settings'), icon: Settings2 },
        { id: 'import' as const, label: t('overlays.tabs.import'), icon: Upload },
        { id: 'activity' as const, label: t('overlays.tabs.activity'), icon: Activity },
    ]), [showCount, t]);

    const presetOptions = useMemo(
        () => (status?.presets || [{ id: 'new-season' }]).map((preset: { id: string }) => ({
            value: preset.id,
            label: preset.id,
        })),
        [status?.presets],
    );

    const importModeOptions = useMemo(() => ([
        { value: 'merge', label: t('overlays.import.modeMerge') },
        { value: 'replace', label: t('overlays.import.modeReplace') },
    ]), [t]);

    const actionLabel = (id: ActionId) => t(`overlays.actionLabels.${id}`);

    const runAction = async (id: ActionId, fn: () => Promise<unknown>, { startedToast = false } = {}) => {
        setBusy(id);
        const label = actionLabel(id);
        try {
            await fn();
            await refresh();
            toast(startedToast ? t('overlays.actionStarted', { action: label }) : t('overlays.actionComplete', { action: label }));
        } catch (error) {
            toast(error instanceof Error ? error.message : t('overlays.actionFailed', { action: label }), 'error');
        } finally {
            setBusy(null);
        }
    };

    const startBackgroundJob = (id: ActionId, fn: () => Promise<unknown>) => {
        setTab('activity');
        setBusy(id);
        const label = actionLabel(id);
        void (async () => {
            try {
                await fn();
                toast(t('overlays.actionStarted', { action: label }));
            } catch (error) {
                toast(error instanceof Error ? error.message : t('overlays.actionFailed', { action: label }), 'error');
            } finally {
                setBusy(null);
            }
            void refresh().catch(() => {});
        })();
    };

    const saveSettings = () => runAction('saveSettings', async () => {
        await overlaysApi.saveConfig(configDraft);
    });

    const canResetAll = showCount > 0 && !jobRunning && busy !== 'resetAll';

    const resetAll = () => {
        void (async () => {
            const count = showCount;
            const ok = await askConfirm(
                t('overlays.resetAllConfirm', { count }),
                {
                    title: t('overlays.resetAllTitle'),
                    confirmLabel: t('overlays.actions.resetAll'),
                    cancelLabel: t('common.cancel'),
                    danger: true,
                },
            );
            if (!ok) return;
            await runAction('resetAll', () => overlaysApi.resetAll());
        })();
    };

    return (
        <DashboardPageShell>
            <ToastContainer toasts={toasts} setToasts={setToasts} />

            <DashboardHero
                accent="plex"
                eyebrow={t('overlays.eyebrow')}
                title={t('overlays.title')}
                description={t('overlays.description')}
                icon={<Layers className="h-3.5 w-3.5" />}
                secondaryBlob
                actions={(
                    <>
                        <button
                            type="button"
                            className={buttonClass}
                            disabled={busy !== null}
                            onClick={() => void runAction('refresh', refresh)}
                        >
                            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> {t('overlays.actions.refresh')}
                        </button>
                        <button
                            type="button"
                            className={buttonClass}
                            disabled={busy === 'stop' || !jobRunning}
                            onClick={() => void runAction('stop', () => overlaysApi.stop())}
                        >
                            <Square className="h-4 w-4" /> {t('overlays.actions.stop')}
                        </button>
                        <button
                            type="button"
                            className={buttonClass}
                            disabled={busy !== null || jobRunning || !workerReady}
                            onClick={() => startBackgroundJob('preview', () => overlaysApi.preview())}
                        >
                            {t('overlays.actions.preview')}
                        </button>
                        <button
                            type="button"
                            className={`${buttonClass} border-amber-500/40 text-amber-100`}
                            disabled={!canResetAll}
                            onClick={resetAll}
                        >
                            <RotateCcw className="h-4 w-4" /> {t('overlays.actions.resetAll')}
                        </button>
                        <button
                            type="button"
                            className={primaryButtonClass}
                            disabled={busy !== null || jobRunning || !workerReady}
                            onClick={() => startBackgroundJob('run', () => overlaysApi.run({ preview: false }))}
                        >
                            {busy === 'run' || jobRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                            {t('overlays.actions.runNow')}
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
                            <span>{t('overlays.status.worker')}</span>
                        </div>
                        <p className={`truncate text-sm font-semibold sm:text-[15px] ${workerReady ? 'text-text' : 'text-amber-100'}`}>
                            {workerReady ? t('overlays.status.ready') : t('overlays.status.missing')}
                        </p>
                    </div>
                    <div className="flex min-w-0 flex-col items-center gap-1 px-2 py-2.5 text-center sm:items-start sm:px-3 sm:py-3 sm:text-left">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
                            <Layers className="h-3.5 w-3.5 text-sky-300" />
                            <span>{t('overlays.status.logged')}</span>
                        </div>
                        <p className="truncate text-sm font-semibold tabular-nums sm:text-[15px]">{status?.logCount ?? 0}</p>
                    </div>
                    <div className="flex min-w-0 flex-col items-center gap-1 px-2 py-2.5 text-center sm:items-start sm:px-3 sm:py-3 sm:text-left">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
                            <Clock3 className="h-3.5 w-3.5 text-plex" />
                            <span>{t('overlays.status.schedule')}</span>
                        </div>
                        <p className="truncate text-sm font-semibold sm:text-[15px]">
                            {configDraft.scheduleHours ? t('overlays.status.everyHours', { hours: configDraft.scheduleHours }) : t('overlays.status.disabled')}
                        </p>
                    </div>
                </div>
            </div>

            {!workerReady && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                        <p className="font-semibold">{t('overlays.workerMissingTitle')}</p>
                        <p className="text-sm text-amber-100/80">
                            {t('overlays.workerMissingBeforeCli')} <code>overlays/cli.py</code> {t('overlays.workerMissingAfterCli')}{' '}
                            <code>pip install -r overlays/requirements.txt</code> {t('overlays.workerMissingAfterCommand')}
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
                            label={t('overlays.overview.loggedOverlays')}
                            value={status?.logCount ?? 0}
                            icon={<Layers className="h-4 w-4 text-sky-300" />}
                            glow="sky"
                        />
                        <DashboardStatCard
                            label={t('overlays.overview.lastRun')}
                            value={status?.lastRunAt ? new Date(status.lastRunAt).toLocaleString() : t('overlays.overview.never')}
                            hint={summary ? t('overlays.overview.lastRunHint', {
                                added: String(summary.added ?? 0),
                                removed: String(summary.removed ?? 0),
                                preview: summary.previewMode ? t('overlays.overview.previewSuffix') : '',
                            }) : undefined}
                            icon={<Clock3 className="h-4 w-4 text-plex" />}
                            glow="plex"
                            valueClassName="text-lg md:text-xl"
                        />
                        <DashboardStatCard
                            label={t('overlays.overview.newSeasonWindow')}
                            value={t('overlays.overview.daysValue', { count: configDraft.newSeasonDays || 21 })}
                            hint={t('overlays.overview.presetHint', { preset: configDraft.overlayPresetId || 'new-season' })}
                            icon={<Settings2 className="h-4 w-4 text-amber-300" />}
                            glow="amber"
                            valueClassName="text-lg md:text-xl"
                        />
                    </div>

                    <DashboardPanel title={t('overlays.quick.title')} subtitle={t('overlays.quick.subtitle')}>
                        <div className="flex flex-wrap items-end gap-3">
                            <label className="min-w-[160px] flex-1">
                                <span className={fieldLabelClass}>{t('overlays.fields.newSeasonWindowDays')}</span>
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
                                <span className={fieldLabelClass}>{t('overlays.fields.scheduleHoursShort')}</span>
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
                                <Save className="h-4 w-4" /> {t('overlays.actions.save')}
                            </button>
                        </div>
                        <p className="mt-3 text-xs text-muted">
                            {t('overlays.quick.daysHint')}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <button
                                type="button"
                                className={buttonClass}
                                disabled={busy !== null || !workerReady}
                                onClick={() => void runAction('scan', async () => {
                                    const res = await overlaysApi.scan();
                                    setReconcile(null);
                                    toast(t('overlays.eligibleToast', { count: res.eligibleCount ?? 0 }));
                                })}
                            >
                                {t('overlays.actions.scanLibrary')}
                            </button>
                            <button
                                type="button"
                                className={buttonClass}
                                disabled={busy !== null || !workerReady}
                                onClick={() => void runAction('reconcile', async () => {
                                    const res = await overlaysApi.reconcile();
                                    setReconcile(res);
                                    setTab('import');
                                })}
                            >
                                {t('overlays.actions.reconcileDryRun')}
                            </button>
                        </div>
                        <p className="mt-3 text-xs text-muted">
                            {t('overlays.quick.previewHintBeforePreviewPath')} <code>config/overlays/preview/</code>. {t('overlays.quick.previewHintBetweenPaths')} <code>overlaid_log.json</code>.
                        </p>
                    </DashboardPanel>
                </div>
            )}

            {tab === 'shows' && (
                <DashboardPanel
                    title={t('overlays.shows.title')}
                    subtitle={t('overlays.shows.subtitle')}
                    controls={(
                        <button
                            type="button"
                            className={`${buttonClass} border-amber-500/40 text-amber-100`}
                            disabled={!canResetAll}
                            onClick={resetAll}
                        >
                            <RotateCcw className="h-4 w-4" /> {t('overlays.actions.resetAllOverlays')}
                        </button>
                    )}
                >
                    {shows.length === 0 ? (
                        <p className="text-sm text-muted">{t('overlays.shows.empty')}</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-left text-sm">
                                <thead className="text-xs uppercase text-muted">
                                    <tr>
                                        <th className="px-2 py-2">{t('overlays.table.title')}</th>
                                        <th className="px-2 py-2">{t('overlays.table.key')}</th>
                                        <th className="px-2 py-2">{t('overlays.table.season')}</th>
                                        <th className="px-2 py-2">{t('overlays.table.mode')}</th>
                                        <th className="px-2 py-2">{t('overlays.table.when')}</th>
                                        <th className="px-2 py-2" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {shows.map((row) => (
                                        <tr key={row.ratingKey} className="border-t border-white/10">
                                            <td className="px-2 py-2 font-medium">{row.title}</td>
                                            <td className="px-2 py-2 tabular-nums text-muted">{row.ratingKey}</td>
                                            <td className="px-2 py-2">{row.seasonIndex ?? '—'}</td>
                                            <td className="px-2 py-2">{row.previewOnly ? t('overlays.mode.preview') : t('overlays.mode.live')}</td>
                                            <td className="px-2 py-2 text-muted">
                                                {row.timestamp ? new Date(row.timestamp).toLocaleString() : '—'}
                                            </td>
                                            <td className="px-2 py-2 text-right">
                                                <button
                                                    type="button"
                                                    className="text-xs font-semibold text-amber-200 hover:underline disabled:opacity-50"
                                                    disabled={busy !== null}
                                                    onClick={() => void runAction('reset', () => overlaysApi.resetOne(row.ratingKey))}
                                                >
                                                    {t('overlays.actions.reset')}
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
                <DashboardPanel title={t('overlays.settings.title')} subtitle={t('overlays.settings.subtitle')}>
                    <SettingsToggleRow
                        title={t('overlays.settings.moduleEnabled')}
                        checked={configDraft.enabled !== false}
                        onChange={(enabled) => setConfigDraft((prev) => ({ ...prev, enabled }))}
                    />
                    <SettingsToggleRow
                        title={t('overlays.settings.defaultPreviewMode')}
                        checked={configDraft.previewMode === true}
                        onChange={(previewMode) => setConfigDraft((prev) => ({ ...prev, previewMode }))}
                    />
                    <SettingsToggleRow
                        title={t('overlays.settings.skipKometa')}
                        checked={configDraft.skipIfKometaOverlayLabel !== false}
                        onChange={(skipIfKometaOverlayLabel) => setConfigDraft((prev) => ({ ...prev, skipIfKometaOverlayLabel }))}
                    />

                    <div className="grid gap-4 border-b border-border/40 py-4 md:grid-cols-2">
                        <label className="block">
                            <span className={fieldLabelClass}>{t('overlays.fields.newSeasonWindowDays')}</span>
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
                                {t('overlays.settings.windowHint')}
                            </span>
                        </label>
                        <label className="block">
                            <span className={fieldLabelClass}>{t('overlays.fields.scheduleHours')}</span>
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
                        <span className={fieldLabelClass}>{t('overlays.settings.overlayPreset')}</span>
                        <CustomSelect
                            className="mt-1.5 max-w-md"
                            value={configDraft.overlayPresetId || 'new-season'}
                            onChange={(value) => setConfigDraft((prev) => ({ ...prev, overlayPresetId: value }))}
                            options={presetOptions}
                        />
                    </div>

                    <div className="py-4">
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <span className={fieldLabelClass}>{t('overlays.settings.tvLibraries')}</span>
                            <button type="button" className="text-xs font-semibold text-plex underline" onClick={() => void loadSections()}>
                                {t('overlays.actions.loadSections')}
                            </button>
                        </div>
                        {sections.length === 0 ? (
                            <p className="text-xs text-muted">{t('overlays.settings.loadSectionsHint')}</p>
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
                        <Save className="h-4 w-4" /> {t('overlays.actions.saveSettings')}
                    </button>
                </DashboardPanel>
            )}

            {tab === 'import' && (
                <DashboardPanel title={t('overlays.import.title')} subtitle={t('overlays.import.subtitle')}>
                    <p className="text-sm text-muted">
                        {t('overlays.import.bodyBeforeLog')} <code>overlaid_log.json</code> {t('overlays.import.bodyAfterLog')}
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
                            onClick={() => void runAction('importLog', async () => {
                                const parsed = JSON.parse(importText);
                                await overlaysApi.importLog(parsed, importMode);
                            })}
                        >
                            <Upload className="h-4 w-4" /> {t('overlays.actions.importLog')}
                        </button>
                        <button
                            type="button"
                            className={buttonClass}
                            disabled={busy !== null || !workerReady}
                            onClick={() => void runAction('reconcile', async () => {
                                setReconcile(await overlaysApi.reconcile());
                            })}
                        >
                            {t('overlays.actions.reconcileDryRun')}
                        </button>
                    </div>
                    {reconcile && (
                        <div className="mt-4 rounded-lg border border-white/10 bg-black/25 p-3 text-sm">
                            <p className="font-semibold">{t('overlays.reconcile.title')}</p>
                            <p className="mt-1 text-muted">
                                {t('overlays.reconcile.summary', {
                                    add: reconcile.wouldAddCount ?? 0,
                                    convert: reconcile.wouldConvertCount ?? 0,
                                    remove: reconcile.wouldRemoveCount ?? 0,
                                })}
                            </p>
                        </div>
                    )}
                </DashboardPanel>
            )}

            {tab === 'activity' && (
                <DashboardPanel title={t('overlays.activity.title')} subtitle={t('overlays.activity.subtitle')}>
                    {status?.running && (
                        <p className="mb-3 inline-flex items-center gap-2 text-sm text-plex">
                            <Loader2 className="h-4 w-4 animate-spin" /> {t('overlays.activity.running', { command: status.command || '…' })}
                        </p>
                    )}
                    {activity.length === 0 ? (
                        <p className="text-sm text-muted">{t('overlays.activity.empty')}</p>
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
                    {t('overlays.footer.workerReadyBeforePath')} <code>config/overlays/</code>
                </p>
            )}
        </DashboardPageShell>
    );
};

export default OverlaysDashboard;
