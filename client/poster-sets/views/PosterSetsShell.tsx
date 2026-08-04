import React from 'react';
import { Compass, Eye, Library, ListOrdered, RefreshCw, Settings2 } from 'lucide-react';
import { ToastContainer } from '../../shared/toast';
import { usePosterSetsDashboard } from '../PosterSetsDashboardContext';
import { LibraryTitleDetailPanel } from '../LibraryTitleDetailPanel';
import {
    StatusPill,
    buttonClass,
    cardClass,
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
        <div className={`flex w-full min-w-0 animate-fade-in flex-col gap-4 sm:gap-6 ${selectedBulkCount > 0 || inspectorOpen ? 'pb-28' : 'pb-10'}`}>
                <ToastContainer toasts={toasts} setToasts={setToasts} />
            
                <header className={`${cardClass} overflow-hidden p-4 sm:p-6`}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 max-w-3xl">
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-plex sm:text-xs">Poster Sets</p>
                            <h1 className="mt-1.5 text-xl font-bold tracking-tight text-text sm:mt-2 sm:text-3xl">Artwork from MediUX & ThePosterDB</h1>
                            <p className="mt-1.5 text-xs leading-relaxed text-muted sm:mt-2 sm:text-sm">
                                Start from your library, pick a title, preview poster sets, and apply.
                                Search creators and browse rails in Discover. Queue, Watching, and settings stay one click away.
                            </p>
                        </div>
                        <button type="button" className={`${buttonClass} shrink-0`} onClick={() => void load()} disabled={busy !== null}>
                            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> Refresh
                        </button>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                        {([
                            {
                                label: 'Worker',
                                value: status?.workerReady ? 'Ready' : 'Missing',
                            },
                            {
                                label: 'Config',
                                value: status?.configured ? 'Valid' : 'Setup',
                            },
                            {
                                label: 'Last job',
                                value: status?.recentJobs?.[0]?.state || 'None',
                                title: status?.recentJobs?.[0]
                                    ? `${status.recentJobs[0].type || 'job'} · ${status.recentJobs[0].state}`
                                    : 'No jobs yet',
                            },
                        ] as const).map((item) => (
                            <div
                                key={item.label}
                                className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-2.5 py-2.5 sm:px-3"
                                title={'title' in item ? item.title : undefined}
                            >
                                <p className="text-[10px] font-bold uppercase tracking-wide text-muted sm:text-[11px]">{item.label}</p>
                                <StatusPill value={item.value} />
                            </div>
                        ))}
                    </div>
                </header>
            
                <div className="flex min-w-0 flex-wrap justify-start gap-1.5 sm:gap-2">
                    {([
                        ['library', 'Library', Library],
                        ['discover', 'Discover', Compass],
                        ['queue', 'Queue', ListOrdered],
                        ['watches', 'Watching', Eye],
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
                    queuePaused={queuePaused}
                    watches={watches}
                    serverType={status?.mediaServerLabel?.toLowerCase() === 'jellyfin' ? 'jellyfin' : 'plex'}
                    layoutMode={libraryDetailLayout}
                    onLayoutModeChange={setLibraryDetailLayout}
                    toast={toast}
                    onApplied={() => {
                        void loadQueue();
                        void loadHistory();
                    }}
                    onWatchAdded={() => void loadWatches()}
                />
        </div>
    );
};
