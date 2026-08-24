import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Clock3, Music, RefreshCw } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { usePoll } from '../shared/usePoll';

type SpotifySyncStatus = {
    ok?: boolean;
    plexLoggedIn?: boolean;
    playlistRunCount?: number;
    lastSync?: Record<string, string | null>;
};

type Props = {
    onOpen?: () => void;
};

const formatWhen = (value?: string | null) => {
    if (!value) return '—';
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return String(value);
    return new Date(parsed).toLocaleString();
};

export const SpotifySyncHomeWidget: React.FC<Props> = ({ onOpen }) => {
    const [status, setStatus] = useState<SpotifySyncStatus | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const loadGenRef = useRef(0);

    const load = useCallback(async () => {
        const gen = ++loadGenRef.current;
        setLoading(true);
        setError('');
        try {
            const data = await apiFetch('/api/spotify-to-plex/status');
            if (gen !== loadGenRef.current) return;
            setStatus(data || null);
        } catch (e: any) {
            if (gen !== loadGenRef.current) return;
            setError(e?.message || 'Spotify Sync status unavailable');
            setStatus(null);
        } finally {
            if (gen === loadGenRef.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    usePoll(() => { void load(); }, 60_000);

    const lastPlaylistSync = status?.lastSync?.playlists;

    return (
        <div className="glass-card p-4 md:p-5 shadow-xl w-full overflow-hidden">
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center shrink-0">
                            <Music className="w-5 h-5 text-emerald-300" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-muted text-[10px] uppercase tracking-widest font-bold">Spotify Sync</p>
                            <p className="text-text font-bold text-base truncate">Playlist sync sidecar</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => { void load(); }}
                        className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-white/5 transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {error && !status ? (
                    <p className="text-xs text-red-300/90">{error}</p>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <div className="rounded-xl bg-white/5 border border-border px-3 py-2.5">
                            <p className="text-[10px] uppercase tracking-wide text-muted font-semibold">Plex</p>
                            <p className="text-sm font-bold text-text mt-0.5">{status?.plexLoggedIn ? 'Connected' : 'Not linked'}</p>
                        </div>
                        <div className="rounded-xl bg-white/5 border border-border px-3 py-2.5">
                            <p className="text-[10px] uppercase tracking-wide text-muted font-semibold">Playlist runs</p>
                            <p className="text-sm font-bold text-text mt-0.5">{status?.playlistRunCount ?? 0}</p>
                        </div>
                        <div className="rounded-xl bg-white/5 border border-border px-3 py-2.5 col-span-2 sm:col-span-1">
                            <p className="text-[10px] uppercase tracking-wide text-muted font-semibold flex items-center gap-1">
                                <Clock3 className="w-3 h-3" /> Last playlist sync
                            </p>
                            <p className="text-xs font-semibold text-text mt-0.5 truncate">{formatWhen(lastPlaylistSync)}</p>
                        </div>
                    </div>
                )}

                {onOpen && (
                    <button
                        type="button"
                        onClick={onOpen}
                        className="self-start px-3 py-1.5 rounded-lg text-xs font-semibold border border-border hover:border-plex hover:text-plex transition-colors"
                    >
                        Open Spotify Sync
                    </button>
                )}
            </div>
        </div>
    );
};

export default SpotifySyncHomeWidget;
