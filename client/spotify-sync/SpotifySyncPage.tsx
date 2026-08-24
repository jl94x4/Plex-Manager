import React, { useCallback, useMemo, useState } from 'react';
import { Music, RefreshCw, Play, ExternalLink } from 'lucide-react';
import { portalUrl } from '../shared/basePath';
import { apiFetch } from '../shared/api';
import { pushToast } from '../shared/toast';
import { DashboardHero, DashboardPageShell } from '../shared/dashboard/DashboardChrome';
import { usePoll } from '../shared/usePoll';
import { BetaBadge, SpotifySyncBetaBanner } from '../shared/BetaBadge';
import { useDiscoverI18n } from '../discovery/i18n';

const EMBED_PATH = '/api/spotify-to-plex-embed/app/';
const LOGS_EMBED_PATH = '/api/spotify-to-plex-embed/app/advanced/logs';

type SyncStatus = {
    plexLoggedIn?: boolean;
    playlistRunCount?: number;
    lastSync?: Record<string, string | null>;
};

export const SpotifySyncPage: React.FC = () => {
    const { t } = useDiscoverI18n();
    const betaNotice = t('spotifySyncPage.betaNotice');
    const iframeSrc = useMemo(() => portalUrl(EMBED_PATH), []);
    const logsSrc = useMemo(() => portalUrl(LOGS_EMBED_PATH), []);
    const [iframeKey, setIframeKey] = useState(0);
    const [syncing, setSyncing] = useState(false);
    const [status, setStatus] = useState<SyncStatus | null>(null);

    const loadStatus = useCallback(async () => {
        try {
            const data = await apiFetch('/api/spotify-to-plex/status');
            setStatus(data || null);
        } catch {
            setStatus(null);
        }
    }, []);

    usePoll(() => { void loadStatus(); }, 60_000, { immediate: true });

    const runSync = async () => {
        setSyncing(true);
        try {
            const data = await apiFetch('/api/spotify-to-plex/sync', {
                method: 'POST',
                body: JSON.stringify({ type: 'all' }),
            });
            pushToast(data?.message || 'Sync started in the spotify-to-plex container', 'success');
            void loadStatus();
        } catch (e: any) {
            pushToast(e?.message || 'Failed to start sync', 'error');
        } finally {
            setSyncing(false);
        }
    };

    const formatWhen = (value?: string | null) => {
        if (!value) return '—';
        const parsed = Date.parse(value);
        if (!Number.isFinite(parsed)) return String(value);
        return new Date(parsed).toLocaleString();
    };

    return (
        <DashboardPageShell className="flex min-h-0 flex-1 flex-col">
            <SpotifySyncBetaBanner className="mb-4" />
            <DashboardHero
                accent="plex"
                eyebrow={
                    <span className="inline-flex items-center gap-2">
                        <span>Spotify Sync</span>
                        <BetaBadge title={betaNotice} />
                    </span>
                }
                title="Playlist sync for Plex"
                description="Manage Spotify-to-Plex playlists, matching, and sync schedules from the embedded spotify-to-plex container UI."
                icon={<Music className="h-3.5 w-3.5" />}
                secondaryBlob
            />
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-semibold ${status?.plexLoggedIn ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-200'}`}>
                    Plex {status?.plexLoggedIn ? 'linked' : 'not linked in container'}
                </span>
                <span className="text-muted">Last playlist sync: {formatWhen(status?.lastSync?.playlists)}</span>
                <span className="text-muted">Logged runs: {status?.playlistRunCount ?? 0}</span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-background/40 overflow-hidden">
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-b border-border px-3 py-2">
                    <button
                        type="button"
                        onClick={() => void runSync()}
                        disabled={syncing}
                        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:border-plex hover:text-plex disabled:opacity-50"
                    >
                        <Play className="h-3.5 w-3.5" />
                        {syncing ? 'Starting…' : 'Sync now'}
                    </button>
                    <a
                        href={logsSrc}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:border-plex hover:text-plex"
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Container logs
                    </a>
                    <button
                        type="button"
                        onClick={() => setIframeKey((value) => value + 1)}
                        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:border-plex hover:text-plex"
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Reload UI
                    </button>
                </div>
                <iframe
                    key={iframeKey}
                    title="Spotify Sync"
                    src={iframeSrc}
                    className="min-h-[min(72vh,900px)] w-full flex-1 border-0 bg-background md:min-h-[calc(100dvh-14rem)]"
                    allow="clipboard-read; clipboard-write"
                />
            </div>
        </DashboardPageShell>
    );
};
