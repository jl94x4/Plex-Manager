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
type ActionId = 'refresh' | 'stop' | 'preview' | 'resetAll' | 'run' | 'saveSettings' | 'scan' | 'reconcile' | 'reset' | 'importLog' | 'sample';

type SampleMeta = {
    exists: boolean;
    showTitle?: string | null;
    episodeTitle?: string | null;
    showTitleForEp?: string | null;
    generatedAt?: string | null;
    presetId?: string | null;
};

const buttonClass = 'inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-text hover:bg-white/10 disabled:opacity-50';
const primaryButtonClass = 'inline-flex items-center gap-2 rounded-md bg-plex px-3 py-2 text-sm font-bold text-background hover:bg-plex-hover disabled:opacity-50';
const fieldInputClass = 'mt-1.5 w-full rounded-lg border border-border bg-background p-3 text-sm text-text outline-none transition-all focus:border-plex focus:ring-1 focus:ring-plex';
const fieldLabelClass = 'text-[10px] font-bold uppercase tracking-[0.14em] text-muted';

const DEFAULT_CONFIG: OverlaysConfig = {
    enabled: true,
    previewMode: false,
    newSeasonDays: 21,
    newEpisodeEnabled: true,
    newEpisodeDays: 6,
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
    const [episodes, setEpisodes] = useState<any[]>([]);
    const [sections, setSections] = useState<Array<{ id: string; key: string; title: string }>>([]);
    const [reconcile, setReconcile] = useState<any>(null);
    const [importText, setImportText] = useState('');
    const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
    const [busy, setBusy] = useState<ActionId | null>(null);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [sampleMeta, setSampleMeta] = useState<SampleMeta | null>(null);
    const [sampleBust, setSampleBust] = useState(() => Date.now());
    const [sampleError, setSampleError] = useState<string | null>(null);
    const sampleLoadedRef = React.useRef(false);
    const wasRunningRef = React.useRef(false);

    const toast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToasts((prev) => pushToast(prev, message, type));
    }, []);

    const refresh = useCallback(async () => {
        const [nextStatus, showsRes, episodesRes] = await Promise.all([
            overlaysApi.status(),
            overlaysApi.shows().catch(() => ({ shows: [] })),
            overlaysApi.episodes().catch(() => ({ episodes: [] })),
        ]);
        setStatus(nextStatus);
        if (nextStatus?.config) setConfigDraft({ ...DEFAULT_CONFIG, ...nextStatus.config });
        setShows(showsRes.shows || []);
        setEpisodes(episodesRes.episodes || []);
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
                if (s?.command === 'scan' || s?.command === 'reconcile') {
                    toast(t('overlays.eligibleToast', { count: s.eligible ?? 0 }));
                } else if (s?.previewMode || s?.command === 'preview') {
                    toast(t('overlays.previewFinishedSummary', {
                        eligible: s?.eligible ?? 0,
                        added: s?.added ?? 0,
                        refreshed: s?.refreshed ?? 0,
                        episodesEligible: s?.episodesEligible ?? 0,
                        episodesAdded: s?.episodesAdded ?? 0,
                    }));
                } else {
                    toast(
                        s
                            ? t('overlays.jobFinishedSummary', {
                                added: s.added ?? 0,
                                removed: s.removed ?? 0,
                                episodesAdded: s.episodesAdded ?? 0,
                                episodesRemoved: s.episodesRemoved ?? 0,
                                preview: s.previewMode ? t('overlays.overview.previewSuffix') : '',
                            })
                            : t('overlays.jobFinished'),
                    );
                }
            }
            void Promise.all([
                overlaysApi.shows().then((showsRes) => setShows(showsRes.shows || [])),
                overlaysApi.episodes().then((episodesRes) => setEpisodes(episodesRes.episodes || [])),
            ]).catch(() => {});
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

    useEffect(() => {
        if (tab !== 'settings') return;
        if (sections.length > 0) return;
        void loadSections();
    }, [tab, sections.length, loadSections]);

    const summary = status?.lastRunSummary || configDraft.lastRunSummary || null;
    const activity = status?.activity || [];
    const workerReady = !!status?.workerReady;
    const showCount = shows.length || status?.logCount || 0;
    const episodeCount = episodes.length || status?.episodeLogCount || 0;
    const trackedTotal = showCount + episodeCount;
    const jobRunning = !!status?.running;

    const tabs = useMemo(() => ([
        { id: 'overview' as const, label: t('overlays.tabs.overview'), icon: Layers },
        { id: 'shows' as const, label: t('overlays.tabs.shows', { count: showCount, episodes: episodeCount }), icon: List },
        { id: 'settings' as const, label: t('overlays.tabs.settings'), icon: Settings2 },
        { id: 'import' as const, label: t('overlays.tabs.import'), icon: Upload },
        { id: 'activity' as const, label: t('overlays.tabs.activity'), icon: Activity },
    ]), [showCount, episodeCount, t]);

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
        const prevPreset = status?.config?.overlayPresetId || 'new-season';
        await overlaysApi.saveConfig(configDraft);
        if ((configDraft.overlayPresetId || 'new-season') !== prevPreset) {
            await regenerateSamples({ quiet: true });
        }
    });

    const applySampleResult = (payload: {
        show?: { title?: string };
        episode?: { title?: string; showTitle?: string };
        generatedAt?: string;
        presetId?: string;
        meta?: Record<string, unknown>;
    }) => {
        const meta = payload.meta || {};
        setSampleMeta({
            exists: true,
            showTitle: payload.show?.title || (meta.showTitle as string) || null,
            episodeTitle: payload.episode?.title || (meta.episodeTitle as string) || null,
            showTitleForEp: payload.episode?.showTitle || (meta.showTitleForEp as string) || null,
            generatedAt: payload.generatedAt || (meta.generatedAt as string) || null,
            presetId: payload.presetId || (meta.presetId as string) || null,
        });
        setSampleBust(Date.now());
        setSampleError(null);
    };

    const regenerateSamples = async ({ quiet = false }: { quiet?: boolean } = {}) => {
        setBusy('sample');
        setSampleError(null);
        try {
            const result = await overlaysApi.sampleGenerate();
            applySampleResult(result);
            if (!quiet) toast(t('overlays.actionComplete', { action: actionLabel('sample') }));
        } catch (error) {
            const message = error instanceof Error ? error.message : t('overlays.actionFailed', { action: actionLabel('sample') });
            setSampleError(message);
            if (!quiet) toast(message, 'error');
        } finally {
            setBusy(null);
        }
    };

    useEffect(() => {
        if (tab !== 'settings' || sampleLoadedRef.current) return;
        sampleLoadedRef.current = true;
        let cancelled = false;
        void (async () => {
            try {
                const meta = await overlaysApi.sampleMeta();
                if (cancelled) return;
                if (meta.exists) {
                    setSampleMeta({
                        exists: true,
                        showTitle: meta.showTitle,
                        episodeTitle: meta.episodeTitle,
                        showTitleForEp: meta.showTitleForEp,
                        generatedAt: meta.generatedAt,
                        presetId: meta.presetId,
                    });
                    setSampleBust(Date.now());
                    return;
                }
                await regenerateSamples({ quiet: true });
            } catch {
                if (!cancelled) setSampleMeta({ exists: false });
            }
        })();
        return () => {
            cancelled = true;
        };
        // Only on first Settings visit — regenerateSamples is stable enough via refs/state setters
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab]);

    const canResetAll = trackedTotal > 0 && !jobRunning && busy !== 'resetAll';

    const resetAll = () => {
        void (async () => {
            const ok = await askConfirm(
                t('overlays.resetAllConfirm', { count: showCount, episodes: episodeCount }),
                {
                    title: t('overlays.resetAllTitle'),
                    confirmLabel: t('overlays.actions.resetAll'),
                    cancelLabel: t('common.cancel', { defaultValue: 'Cancel' }),
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
                        <p className="truncate text-sm font-semibold tabular-nums sm:text-[15px]">
                            {t('overlays.status.loggedCounts', {
                                shows: status?.logCount ?? showCount,
                                episodes: status?.episodeLogCount ?? episodeCount,
                            })}
                        </p>
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
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <DashboardStatCard
                            label={t('overlays.overview.loggedOverlays')}
                            value={status?.logCount ?? showCount}
                            icon={<Layers className="h-4 w-4 text-sky-300" />}
                            glow="sky"
                        />
                        <DashboardStatCard
                            label={t('overlays.overview.loggedEpisodes')}
                            value={status?.episodeLogCount ?? episodeCount}
                            hint={t('overlays.overview.episodeWindowHint', { days: configDraft.newEpisodeDays ?? 6 })}
                            icon={<Play className="h-4 w-4 text-rose-300" />}
                            glow="rose"
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
                                disabled={busy !== null || jobRunning || !workerReady}
                                onClick={() => startBackgroundJob('scan', () => overlaysApi.scan())}
                            >
                                {t('overlays.actions.scanLibrary')}
                            </button>
                            <button
                                type="button"
                                className={buttonClass}
                                disabled={busy !== null || jobRunning || !workerReady}
                                onClick={() => startBackgroundJob('reconcile', async () => {
                                    await overlaysApi.reconcile();
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
                <div className="space-y-4">
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
                                                    onClick={() => void runAction('reset', () => overlaysApi.resetOne(row.ratingKey, 'show'))}
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

                <DashboardPanel
                    title={t('overlays.episodes.title')}
                    subtitle={t('overlays.episodes.subtitle')}
                >
                    {episodes.length === 0 ? (
                        <p className="text-sm text-muted">{t('overlays.episodes.empty')}</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-left text-sm">
                                <thead className="text-xs uppercase text-muted">
                                    <tr>
                                        <th className="px-2 py-2">{t('overlays.table.show')}</th>
                                        <th className="px-2 py-2">{t('overlays.table.title')}</th>
                                        <th className="px-2 py-2">{t('overlays.table.episode')}</th>
                                        <th className="px-2 py-2">{t('overlays.table.aired')}</th>
                                        <th className="px-2 py-2">{t('overlays.table.mode')}</th>
                                        <th className="px-2 py-2" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {episodes.map((row) => (
                                        <tr key={row.ratingKey} className="border-t border-white/10">
                                            <td className="px-2 py-2 font-medium">{row.showTitle || '—'}</td>
                                            <td className="px-2 py-2">{row.title}</td>
                                            <td className="px-2 py-2 tabular-nums text-muted">
                                                {row.seasonIndex != null || row.episodeIndex != null
                                                    ? `S${row.seasonIndex ?? '?'}E${row.episodeIndex ?? '?'}`
                                                    : '—'}
                                            </td>
                                            <td className="px-2 py-2 text-muted">
                                                {row.airedAt ? new Date(row.airedAt).toLocaleString() : '—'}
                                            </td>
                                            <td className="px-2 py-2">{row.previewOnly ? t('overlays.mode.preview') : t('overlays.mode.live')}</td>
                                            <td className="px-2 py-2 text-right">
                                                <button
                                                    type="button"
                                                    className="text-xs font-semibold text-amber-200 hover:underline disabled:opacity-50"
                                                    disabled={busy !== null}
                                                    onClick={() => void runAction('reset', () => overlaysApi.resetOne(row.ratingKey, 'episode'))}
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
                </div>
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
                    <SettingsToggleRow
                        title={t('overlays.settings.newEpisodeEnabled')}
                        description={t('overlays.settings.newEpisodeEnabledHint')}
                        checked={configDraft.newEpisodeEnabled !== false}
                        onChange={(newEpisodeEnabled) => setConfigDraft((prev) => ({ ...prev, newEpisodeEnabled }))}
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
                            <span className={fieldLabelClass}>{t('overlays.fields.newEpisodeWindowDays')}</span>
                            <input
                                type="number"
                                min={1}
                                max={30}
                                className={fieldInputClass}
                                value={configDraft.newEpisodeDays ?? 6}
                                onChange={(e) => setConfigDraft((prev) => ({
                                    ...prev,
                                    newEpisodeDays: Math.max(1, Math.min(30, Number(e.target.value) || 6)),
                                }))}
                            />
                            <span className="mt-1 block text-[11px] text-muted">
                                {t('overlays.settings.newEpisodeWindowHint')}
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

                    <div className="border-b border-border/40 py-4">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <span className={fieldLabelClass}>{t('overlays.settings.visualSample')}</span>
                                <p className="mt-1 max-w-2xl text-[11px] text-muted">
                                    {t('overlays.settings.visualSampleHint')}
                                </p>
                            </div>
                            <button
                                type="button"
                                className={buttonClass}
                                disabled={busy !== null || jobRunning}
                                onClick={() => void regenerateSamples()}
                            >
                                {busy === 'sample' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                {t('overlays.actions.refreshSample')}
                            </button>
                        </div>
                        {sampleError ? (
                            <p className="mb-3 text-xs text-red-400">{sampleError}</p>
                        ) : null}
                        {sampleMeta?.exists ? (
                            <div className="flex flex-wrap items-end gap-6">
                                <figure className="space-y-2">
                                    <figcaption className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
                                        {t('overlays.settings.visualSampleShow')}
                                    </figcaption>
                                    <img
                                        src={overlaysApi.sampleImageUrl('show', sampleBust)}
                                        alt={sampleMeta.showTitle || 'New Season sample'}
                                        className="h-[180px] w-[120px] rounded-md border border-border object-cover bg-background/60"
                                    />
                                    <figcaption className="max-w-[120px] truncate text-xs text-text" title={sampleMeta.showTitle || ''}>
                                        {sampleMeta.showTitle || '—'}
                                    </figcaption>
                                </figure>
                                <figure className="space-y-2">
                                    <figcaption className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
                                        {t('overlays.settings.visualSampleEpisode')}
                                    </figcaption>
                                    <img
                                        src={overlaysApi.sampleImageUrl('episode', sampleBust)}
                                        alt={sampleMeta.episodeTitle || 'New Episode sample'}
                                        className="h-[135px] w-[240px] rounded-md border border-border object-cover bg-background/60"
                                    />
                                    <figcaption
                                        className="max-w-[240px] truncate text-xs text-text"
                                        title={[sampleMeta.showTitleForEp, sampleMeta.episodeTitle].filter(Boolean).join(' — ')}
                                    >
                                        {[sampleMeta.showTitleForEp, sampleMeta.episodeTitle].filter(Boolean).join(' — ') || '—'}
                                    </figcaption>
                                </figure>
                            </div>
                        ) : (
                            <p className="text-sm text-muted">
                                {busy === 'sample' ? t('overlays.actionStarted', { action: actionLabel('sample') }) : t('overlays.settings.visualSampleEmpty')}
                            </p>
                        )}
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
                                    const selected = configDraft.librarySectionIds || [];
                                    const allSelected = selected.length === 0;
                                    const checked = allSelected || selected.includes(id);
                                    return (
                                        <StyledCheckbox
                                            key={id}
                                            checked={checked}
                                            label={`${section.title} (${id})`}
                                            onChange={(next) => {
                                                setConfigDraft((prev) => {
                                                    const allIds = sections.map((s) => s.id || s.key);
                                                    const currentSelected = prev.librarySectionIds || [];
                                                    const currentlyAll = currentSelected.length === 0;
                                                    let nextIds: string[];
                                                    if (currentlyAll) {
                                                        nextIds = next
                                                            ? [...allIds]
                                                            : allIds.filter((value) => value !== id);
                                                    } else {
                                                        const current = new Set(currentSelected);
                                                        if (next) current.add(id);
                                                        else current.delete(id);
                                                        nextIds = [...current];
                                                    }
                                                    // Persist empty array when every section is selected (= all).
                                                    if (
                                                        nextIds.length === allIds.length
                                                        && allIds.every((value) => nextIds.includes(value))
                                                    ) {
                                                        return { ...prev, librarySectionIds: [] };
                                                    }
                                                    return { ...prev, librarySectionIds: nextIds };
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
                            disabled={busy !== null || jobRunning || !workerReady}
                            onClick={() => startBackgroundJob('reconcile', () => overlaysApi.reconcile())}
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
                    {!reconcile && summary?.command === 'reconcile' && (
                        <div className="mt-4 rounded-lg border border-white/10 bg-black/25 p-3 text-sm">
                            <p className="font-semibold">{t('overlays.reconcile.title')}</p>
                            <p className="mt-1 text-muted">
                                {t('overlays.reconcile.summary', {
                                    add: summary.wouldAddCount ?? 0,
                                    convert: summary.wouldConvertCount ?? 0,
                                    remove: summary.wouldRemoveCount ?? 0,
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
