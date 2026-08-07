import React from 'react';
import { Compass, Eye, Image as ImageIcon, Library, ListOrdered, RefreshCw, ScrollText, Settings2 } from 'lucide-react';
import { ToastContainer } from '../../shared/toast';
import {
    DashboardHero,
    DashboardPageShell,
    DashboardStatCard,
    DashboardSubnav,
    dashboardGlowClass,
    dashboardSubnavLinkClass,
} from '../../shared/dashboard/DashboardChrome';
import { usePosterSetsDashboard } from '../PosterSetsDashboardContext';
import { LibraryTitleDetailPanel } from '../LibraryTitleDetailPanel';
import {
    buttonClass,
    isDiscoverInternalTab,
    primaryButtonClass,
    DISCOVER_SUB_NAV,
} from '../shared';
import { PosterSetsBrowseView } from './PosterSetsBrowseView';
import { PosterSetsLibraryView } from './PosterSetsLibraryView';
import { PosterSetsQueueView } from './PosterSetsQueueView';
import { PosterSetsWatchingView } from './PosterSetsWatchingView';
import { PosterSetsRecentView } from './PosterSetsRecentView';
import { PosterSetsSearchView } from './PosterSetsSearchView';
import { PosterSetsHistoryView } from './PosterSetsHistoryView';
import { PosterSetsSettingsView } from './PosterSetsSettingsView';
import { PosterSetsFloatingBars } from './PosterSetsFloatingBars';

export const PosterSetsShell: React.FC = () => {
    const ctx = usePosterSetsDashboard();
    const {
        toasts,
        setToasts,
        load,
        busy,
        status,
        tab,
        browseSeeAllId,
        openBrowseRail,
        goToPrimaryTab,
        queueStats,
        watchStatsState,
        goToDiscoverView,
        selectedBulkCount,
        inspectorOpen,
        libraryDetailItem,
        setLibraryDetailItem,
        libraryDetailLayout,
        setLibraryDetailLayout,
        configDraft,
        queuePaused,
        watches,
        toast,
        loadQueue,
        loadHistory,
        loadWatches,
    } = ctx;

    return (
        <DashboardPageShell className={`${selectedBulkCount > 0 || inspectorOpen ? 'pb-28' : ''}`}>
                <ToastContainer toasts={toasts} setToasts={setToasts} />

                <DashboardHero
                    accent="plex"
                    eyebrow="Poster Sets"
                    title="Artwork from MediUX & ThePosterDB"
                    description="Start from your library, pick a title, preview poster sets, and apply. Search creators and browse rails in Discover — queue, watching, logs, and settings stay one click away."
                    icon={<ImageIcon className="h-3.5 w-3.5" />}
                    secondaryBlob
                    actions={(
                        <button type="button" className={buttonClass} onClick={() => void load()} disabled={busy !== null}>
                            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> Refresh
                        </button>
                    )}
                />

                <div className="grid grid-cols-3 gap-3">
                    {([
                        {
                            label: 'Worker',
                            value: status?.workerReady ? 'Ready' : 'Missing',
                            glow: status?.workerReady ? dashboardGlowClass('emerald') : dashboardGlowClass('rose'),
                            icon: <Settings2 className="h-4 w-4 text-muted" />,
                        },
                        {
                            label: 'Config',
                            value: status?.configured ? 'Valid' : 'Setup',
                            glow: status?.configured ? dashboardGlowClass('emerald') : dashboardGlowClass('amber'),
                            icon: <Settings2 className="h-4 w-4 text-muted" />,
                        },
                        {
                            label: 'Last job',
                            value: String(status?.recentJobs?.[0]?.state || 'None'),
                            glow: dashboardGlowClass('sky'),
                            icon: <ListOrdered className="h-4 w-4 text-muted" />,
                            hint: status?.recentJobs?.[0]
                                ? `${status.recentJobs[0].type || 'job'} · ${status.recentJobs[0].state}`
                                : 'No jobs yet',
                        },
                    ] as const).map((item) => (
                        <DashboardStatCard
                            key={item.label}
                            label={item.label}
                            value={item.value}
                            hint={item.hint}
                            icon={item.icon}
                            glow={item.glow}
                        />
                    ))}
                </div>

                <div className="space-y-2">
                    <DashboardSubnav>
                        {([
                            ['library', 'Library', Library],
                            ['discover', 'Discover', Compass],
                            ['queue', 'Queue', ListOrdered],
                            ['watches', 'Watching', Eye],
                            ['logs', 'Logs', ScrollText],
                            ['settings', 'Settings', Settings2],
                        ] as const).map(([id, label, Icon]) => {
                            const active = id === 'discover'
                                ? isDiscoverInternalTab(tab)
                                : tab === id;
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${dashboardSubnavLinkClass(active)}`}
                                    onClick={() => {
                                        if (active && id === 'discover' && browseSeeAllId) {
                                            openBrowseRail(null);
                                            return;
                                        }
                                        if (active) return;
                                        goToPrimaryTab(id);
                                    }}
                                >
                                    <Icon className="h-4 w-4 shrink-0" />
                                    <span>{label}</span>
                                    {id === 'queue' && (queueStats.pending || 0) > 0 ? (
                                        <span className="rounded-full bg-background/30 px-1.5 py-0.5 text-[10px] font-bold">
                                            {queueStats.pending}
                                        </span>
                                    ) : null}
                                    {id === 'watches' && (watchStatsState.errored || 0) > 0 ? (
                                        <span className="rounded-full bg-red-500/30 px-1.5 py-0.5 text-[10px] font-bold text-red-200">
                                            {watchStatsState.errored}
                                        </span>
                                    ) : id === 'watches' && (watchStatsState.enabled || 0) > 0 ? (
                                        <span className="rounded-full bg-background/30 px-1.5 py-0.5 text-[10px] font-bold">
                                            {watchStatsState.enabled}
                                        </span>
                                    ) : null}
                                </button>
                            );
                        })}
                    </DashboardSubnav>

                    <div className="flex min-w-0 flex-wrap justify-start gap-1.5 md:hidden">
                    {([
                        ['library', 'Library', Library],
                        ['discover', 'Discover', Compass],
                        ['queue', 'Queue', ListOrdered],
                        ['watches', 'Watching', Eye],
                        ['logs', 'Logs', ScrollText],
                        ['settings', 'Settings', Settings2],
                    ] as const).map(([id, label, Icon]) => {
                        const active = id === 'discover'
                            ? isDiscoverInternalTab(tab)
                            : tab === id;
                        return (
                        <button
                            key={id}
                            type="button"
                            className={`${active ? primaryButtonClass : buttonClass}`}
                            onClick={() => {
                                if (active && id === 'discover' && browseSeeAllId) {
                                    openBrowseRail(null);
                                    return;
                                }
                                if (active) return;
                                goToPrimaryTab(id);
                            }}
                        >
                            <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> {label}
                            {id === 'queue' && (queueStats.pending || 0) > 0 ? (
                                <span className="rounded-full bg-background/30 px-1.5 py-0.5 text-[10px] font-bold">
                                    {queueStats.pending}
                                </span>
                            ) : null}
                            {id === 'watches' && (watchStatsState.errored || 0) > 0 ? (
                                <span className="rounded-full bg-red-500/30 px-1.5 py-0.5 text-[10px] font-bold text-red-200">
                                    {watchStatsState.errored}
                                </span>
                            ) : id === 'watches' && (watchStatsState.enabled || 0) > 0 ? (
                                <span className="rounded-full bg-background/30 px-1.5 py-0.5 text-[10px] font-bold">
                                    {watchStatsState.enabled}
                                </span>
                            ) : null}
                        </button>
                        );
                    })}
                </div>
            
                {isDiscoverInternalTab(tab) ? (
                    <div className="flex min-w-0 flex-wrap justify-start gap-1 sm:gap-1.5">
                        {DISCOVER_SUB_NAV.map(({ id, label, internalTab }) => (
                            <button
                                key={id}
                                type="button"
                                className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition sm:px-3 sm:text-xs ${
                                    tab === internalTab
                                        ? 'border-plex/40 bg-plex/15 text-plex'
                                        : 'border-white/10 bg-black/20 text-muted hover:border-plex/30 hover:text-text'
                                }`}
                                onClick={() => goToDiscoverView(id)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                ) : null}
                </div>

            <PosterSetsBrowseView />
            <PosterSetsLibraryView />
            <PosterSetsQueueView />
            <PosterSetsWatchingView />
            <PosterSetsRecentView />
            <PosterSetsSearchView />
            <PosterSetsHistoryView />
            <PosterSetsSettingsView />
            <PosterSetsFloatingBars />
            <LibraryTitleDetailPanel
                    item={libraryDetailItem}
                    onClose={() => setLibraryDetailItem(null)}
                    dupePreference={configDraft.dupePreference === 'mediux' ? 'mediux' : 'posterdb'}
                    preferredCreators={configDraft.creatorWhitelist || []}
                    queuePaused={queuePaused}
                    watches={watches}
                    serverType={status?.mediaServerLabel?.toLowerCase() === 'jellyfin' ? 'jellyfin' : 'plex'}
                    layoutMode={libraryDetailLayout}
                    onLayoutModeChange={setLibraryDetailLayout}
                    toast={toast}
                    tpdbConfigured={Boolean(configDraft.hasTpdbPassword && String(configDraft.tpdb_username || '').trim())}
                    onOpenTpdbSettings={() => goToPrimaryTab('settings')}
                    onApplied={() => {
                        void loadQueue();
                        void loadHistory();
                    }}
                    onWatchAdded={() => void loadWatches()}
                />
        </DashboardPageShell>
    );
};
