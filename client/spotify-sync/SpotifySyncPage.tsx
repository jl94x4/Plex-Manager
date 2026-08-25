import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    CheckCircle2,
    ListMusic,
    Loader2,
    Play,
    RefreshCw,
    ScrollText,
    Settings2,
    SlidersHorizontal,
    Users,
    XCircle,
    Link2,
    Plus,
    Trash2,
    Pencil,
    Plug,
} from 'lucide-react';
import { apiFetch } from '../shared/api';
import { portalUrl } from '../shared/basePath';
import { pushToast } from '../shared/toast';
import {
    DashboardHero,
    DashboardPageShell,
    DashboardPanel,
    DashboardSubnav,
    dashboardSubnavLinkClass,
} from '../shared/dashboard/DashboardChrome';
import { usePoll } from '../shared/usePoll';
import { BetaBadge, SpotifySyncBetaBanner } from '../shared/BetaBadge';
import { useDiscoverI18n } from '../discovery/i18n';
import { CustomSelect } from '../shared/ui';
import { SpotifySyncMark } from './SpotifySyncMark';
import { formatWhen, workerFetch, workerImageUrl } from './spotifySyncApi';

const buttonClass = 'inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-muted hover:border-plex hover:text-plex disabled:opacity-50';
const primaryButtonClass = 'inline-flex items-center gap-2 rounded-lg bg-plex px-3 py-1.5 text-xs font-bold text-background hover:brightness-110 disabled:opacity-50';

type TabId = 'playlists' | 'users' | 'sync' | 'matching' | 'integrations' | 'logs';

type SyncStatus = {
    ok?: boolean;
    workerReachable?: boolean;
    plexLoggedIn?: boolean;
    plexUri?: string;
    playlistRunCount?: number;
    lastSync?: Record<string, string | null>;
    embedded?: {
        running?: boolean;
        bundledAvailable?: boolean;
        lastError?: string;
    };
};

type SavedItem = {
    id: string;
    title?: string;
    type?: string;
    image?: string;
    uri?: string;
    label?: string;
    sync?: boolean;
    sync_interval?: string | number;
};

type SpotifyUser = {
    id: string;
    name?: string;
    label?: string;
    sync?: boolean;
    recentContext?: boolean;
};

const TABS: { id: TabId; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'playlists', label: 'Playlists', icon: ListMusic },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'sync', label: 'Sync', icon: Play },
    { id: 'matching', label: 'Matching', icon: SlidersHorizontal },
    { id: 'integrations', label: 'Integrations', icon: Plug },
    { id: 'logs', label: 'Logs', icon: ScrollText },
];

const SYNC_TYPES = [
    { id: 'playlists', label: 'Playlists' },
    { id: 'albums', label: 'Albums' },
    { id: 'users', label: 'Users' },
    { id: 'lidarr', label: 'Lidarr' },
    { id: 'slskd', label: 'SLSKD' },
    { id: 'mqtt', label: 'MQTT' },
    { id: 'all', label: 'Everything' },
];

export const SpotifySyncPage: React.FC = () => {
    const { t } = useDiscoverI18n();
    const betaNotice = t('spotifySyncPage.betaNotice');
    const [tab, setTab] = useState<TabId>('playlists');
    const [status, setStatus] = useState<SyncStatus | null>(null);
    const [statusError, setStatusError] = useState('');
    const [busy, setBusy] = useState(false);

    const loadStatus = useCallback(async () => {
        try {
            const data = await apiFetch('/api/spotify-to-plex/status');
            setStatus(data || null);
            setStatusError('');
        } catch (e: any) {
            setStatus(null);
            setStatusError(e?.message || 'Worker unreachable');
        }
    }, []);

    usePoll(() => { void loadStatus(); }, 60_000, { immediate: true });

    useEffect(() => {
        void (async () => {
            try {
                await apiFetch('/api/spotify-to-plex/apply-portal-defaults', { method: 'POST' });
            } catch {
                // worker may still be starting
            }
            await loadStatus();
        })();
    }, [loadStatus]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('spotify') === 'connected') {
            pushToast('Spotify account connected', 'success');
            setTab('users');
            void loadStatus();
        }
    }, [loadStatus]);

    const runSync = async (type = 'all') => {
        setBusy(true);
        try {
            const data = await apiFetch('/api/spotify-to-plex/sync', {
                method: 'POST',
                body: JSON.stringify({ type }),
            });
            pushToast(data?.message || `${type} sync started`, 'success');
            void loadStatus();
        } catch (e: any) {
            pushToast(e?.message || 'Failed to start sync', 'error');
        } finally {
            setBusy(false);
        }
    };

    const startWorker = async () => {
        setBusy(true);
        try {
            const data = await apiFetch('/api/spotify-to-plex/start-worker', { method: 'POST' });
            pushToast(data?.message || 'Worker start requested', 'success');
            await loadStatus();
        } catch (e: any) {
            pushToast(e?.message || 'Could not start worker', 'error');
            await loadStatus();
        } finally {
            setBusy(false);
        }
    };

    const applyPlex = async () => {
        setBusy(true);
        try {
            const data = await apiFetch('/api/spotify-to-plex/apply-portal-defaults', { method: 'POST' });
            pushToast(data?.message || 'Portal Plex settings applied', 'success');
            await loadStatus();
        } catch (e: any) {
            pushToast(e?.message || 'Could not apply Plex settings', 'error');
        } finally {
            setBusy(false);
        }
    };

    const workerOk = !!status?.workerReachable;
    const plexOk = !!status?.plexLoggedIn;

    return (
        <DashboardPageShell>
            <SpotifySyncBetaBanner />
            <DashboardHero
                accent="plex"
                eyebrow={
                    <span className="inline-flex items-center gap-2">
                        <span>Spotify Sync</span>
                        <BetaBadge title={betaNotice} />
                    </span>
                }
                title="Playlists from Spotify to Plex"
                description="Native portal controls for the same worker features: saved playlists, Spotify users, matching, Lidarr/SLSKD, and scheduled sync. Plex URL and token come from Settings → Plex."
                icon={<SpotifySyncMark className="h-5 w-5" />}
                secondaryBlob
                actions={(
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className={buttonClass} onClick={() => void loadStatus()} disabled={busy}>
                            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> Refresh
                        </button>
                        <button type="button" className={primaryButtonClass} onClick={() => void runSync('all')} disabled={busy || !workerOk}>
                            <Play className="h-4 w-4" /> Sync now
                        </button>
                    </div>
                )}
            />

            <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30">
                <div className="grid grid-cols-2 divide-x divide-white/10 sm:grid-cols-4">
                    {[
                        {
                            label: 'Worker',
                            value: workerOk ? 'Ready' : 'Offline',
                            ok: workerOk,
                            icon: workerOk ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" /> : <XCircle className="h-3.5 w-3.5 text-rose-300" />,
                        },
                        {
                            label: 'Plex',
                            value: plexOk ? 'Linked' : 'Not linked',
                            ok: plexOk,
                            icon: plexOk ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" /> : <Link2 className="h-3.5 w-3.5 text-amber-300" />,
                        },
                        {
                            label: 'Last playlist sync',
                            value: formatWhen(status?.lastSync?.playlists),
                            ok: !!status?.lastSync?.playlists,
                            icon: <ListMusic className="h-3.5 w-3.5 text-sky-300" />,
                        },
                        {
                            label: 'Logged runs',
                            value: String(status?.playlistRunCount ?? 0),
                            ok: (status?.playlistRunCount || 0) > 0,
                            icon: <ScrollText className="h-3.5 w-3.5 text-violet-300" />,
                        },
                    ].map((item) => (
                        <div key={item.label} className="flex min-w-0 flex-col gap-1 px-3 py-3">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
                                {item.icon}
                                <span>{item.label}</span>
                            </div>
                            <p className={`truncate text-sm font-semibold ${item.ok ? 'text-text' : 'text-amber-100'}`}>{item.value}</p>
                        </div>
                    ))}
                </div>
            </div>

            {statusError || !workerOk ? (
                <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                    <p className="font-semibold">Spotify Sync worker is not reachable</p>
                    <p className="mt-1 text-xs text-rose-100/80">
                        {statusError
                            || status?.embedded?.lastError
                            || 'Nothing is listening on 127.0.0.1:9030 inside the portal container. Start the bundled worker, or redeploy the latest nightly image if this build did not include spotify-to-plex.'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" className={primaryButtonClass} onClick={() => void startWorker()} disabled={busy}>
                            Start worker
                        </button>
                        <button type="button" className={buttonClass} onClick={() => void applyPlex()} disabled={busy}>Apply Plex from portal</button>
                        <button type="button" className={buttonClass} onClick={() => void loadStatus()} disabled={busy}>Retry</button>
                    </div>
                </div>
            ) : null}

            <div className="md:hidden">
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-muted">Section</label>
                <CustomSelect
                    id="spotify-sync-tab"
                    value={tab}
                    onChange={(val) => setTab(val as TabId)}
                    options={TABS.map((item) => ({ label: item.label, value: item.id }))}
                />
            </div>
            <DashboardSubnav>
                {TABS.map((item) => {
                    const Icon = item.icon;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setTab(item.id)}
                            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${dashboardSubnavLinkClass(tab === item.id)}`}
                        >
                            <Icon className="h-4 w-4 shrink-0" />
                            {item.label}
                        </button>
                    );
                })}
            </DashboardSubnav>

            {tab === 'playlists' && <PlaylistsPanel />}
            {tab === 'users' && <UsersPanel />}
            {tab === 'sync' && <SyncPanel status={status} busy={busy} onSync={runSync} onApplyPlex={applyPlex} />}
            {tab === 'matching' && <MatchingPanel />}
            {tab === 'integrations' && <IntegrationsPanel />}
            {tab === 'logs' && <LogsPanel />}
        </DashboardPageShell>
    );
};

const PlaylistsPanel: React.FC = () => {
    const [items, setItems] = useState<SavedItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [adding, setAdding] = useState(false);
    const [editing, setEditing] = useState<SavedItem | null>(null);
    const [preview, setPreview] = useState<{ title: string; tracks: any[] } | null>(null);
    const [previewing, setPreviewing] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await workerFetch('saved-items');
            setItems(Array.isArray(data) ? data : []);
        } catch (e: any) {
            pushToast(e?.message || 'Failed to load playlists', 'error');
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const groups = useMemo(() => {
        const map = new Map<string, SavedItem[]>();
        for (const item of items) {
            const label = item.label || 'Uncategorized';
            if (!map.has(label)) map.set(label, []);
            map.get(label)!.push(item);
        }
        return [...map.entries()].sort((a, b) => {
            if (a[0] === 'Uncategorized') return -1;
            if (b[0] === 'Uncategorized') return 1;
            return a[0].localeCompare(b[0]);
        });
    }, [items]);

    const labels = useMemo(
        () => [...new Set(items.map((item) => item.label).filter(Boolean))] as string[],
        [items],
    );

    const inspectItem = async (item: SavedItem) => {
        setPreviewing(true);
        try {
            const data = await workerFetch(`spotify/items/${encodeURIComponent(item.id)}`);
            const tracks = Array.isArray(data?.tracks)
                ? data.tracks
                : (Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []));
            setPreview({ title: data?.title || item.title || item.id, tracks });
        } catch (e: any) {
            pushToast(e?.message || 'Could not load Spotify tracks', 'error');
        } finally {
            setPreviewing(false);
        }
    };

    const addItem = async () => {
        if (!search.trim()) return;
        setAdding(true);
        try {
            const data = await workerFetch('saved-items', {
                method: 'POST',
                body: JSON.stringify({ search: search.trim() }),
            });
            setItems(Array.isArray(data) ? data : []);
            setSearch('');
            pushToast('Playlist added', 'success');
        } catch (e: any) {
            pushToast(e?.message || 'Could not add playlist', 'error');
        } finally {
            setAdding(false);
        }
    };

    const removeItem = async (id: string) => {
        try {
            const data = await workerFetch(`saved-items?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
            setItems(Array.isArray(data) ? data : items.filter((item) => item.id !== id));
            pushToast('Removed', 'success');
        } catch (e: any) {
            pushToast(e?.message || 'Delete failed', 'error');
        }
    };

    return (
        <>
            <DashboardPanel title="Add playlist or album" subtitle="Spotify URL, URI, or username:liked for Liked Songs.">
                <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-text"
                        placeholder="https://open.spotify.com/playlist/… or spotify:playlist:…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') void addItem(); }}
                    />
                    <button type="button" className={primaryButtonClass} onClick={() => void addItem()} disabled={adding || !search.trim()}>
                        {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        Add
                    </button>
                </div>
            </DashboardPanel>

            <DashboardPanel title="Saved items" subtitle={`${items.length} playlist${items.length === 1 ? '' : 's'} and albums`}>
                {loading ? (
                    <p className="text-sm text-muted">Loading…</p>
                ) : items.length === 0 ? (
                    <p className="text-sm text-muted">Nothing saved yet. Add a Spotify playlist URL above.</p>
                ) : (
                    <div className="space-y-6">
                        {groups.map(([label, groupItems]) => (
                            <div key={label}>
                                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{label}</h3>
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                    {groupItems.map((item) => (
                                        <div key={item.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/25 p-3">
                                            {item.image ? (
                                                <img src={workerImageUrl(item.image)} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                                            ) : (
                                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-plex/15 text-plex">
                                                    <ListMusic className="h-5 w-5" />
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-semibold text-text">{item.title || item.id}</p>
                                                <p className="text-[11px] text-muted">
                                                    {item.sync ? `Auto-sync every ${item.sync_interval || 1}d` : 'Manual only'}
                                                </p>
                                            </div>
                                            <button type="button" className="rounded-lg p-1.5 text-muted hover:text-plex" onClick={() => void inspectItem(item)} title="Preview tracks">
                                                <Play className="h-3.5 w-3.5" />
                                            </button>
                                            <button type="button" className="rounded-lg p-1.5 text-muted hover:text-plex" onClick={() => setEditing(item)} title="Settings">
                                                <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                            <button type="button" className="rounded-lg p-1.5 text-muted hover:text-rose-300" onClick={() => void removeItem(item.id)} title="Remove">
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </DashboardPanel>

            {preview ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setPreview(null)}>
                    <div className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="border-b border-white/10 px-5 py-3">
                            <h3 className="font-bold text-text">{preview.title}</h3>
                            <p className="text-xs text-muted">{preview.tracks.length} tracks</p>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto p-3">
                            {preview.tracks.length === 0 ? (
                                <p className="px-2 py-4 text-sm text-muted">No track list returned for this item.</p>
                            ) : preview.tracks.map((track: any, index: number) => (
                                <div key={track.id || index} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm">
                                    <span className="min-w-0 truncate text-text">{track.title || track.name || 'Track'}</span>
                                    <span className="shrink-0 text-xs text-muted">{track.artist || track.artists || ''}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : null}
            {previewing ? (
                <p className="text-xs text-muted">Loading Spotify tracks…</p>
            ) : null}
            {editing ? (
                <SavedItemEditor
                    item={editing}
                    labels={labels}
                    onClose={() => setEditing(null)}
                    onSaved={(next) => { setItems(next); setEditing(null); }}
                />
            ) : null}
        </>
    );
};

const SavedItemEditor: React.FC<{
    item: SavedItem;
    labels: string[];
    onClose: () => void;
    onSaved: (items: SavedItem[]) => void;
}> = ({ item, labels, onClose, onSaved }) => {
    const [label, setLabel] = useState(item.label || '');
    const [sync, setSync] = useState(!!item.sync);
    const [interval, setIntervalDays] = useState(String(item.sync_interval || '2'));
    const [saving, setSaving] = useState(false);

    const save = async () => {
        setSaving(true);
        try {
            const data = await workerFetch('saved-items', {
                method: 'PUT',
                body: JSON.stringify({
                    ids: [item.id],
                    label,
                    sync,
                    sync_interval: interval,
                }),
            });
            pushToast('Saved', 'success');
            onSaved(Array.isArray(data) ? data : []);
        } catch (e: any) {
            pushToast(e?.message || 'Save failed', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-text">Playlist settings</h3>
                <p className="mt-1 truncate text-xs text-muted">{item.title}</p>
                <label className="mt-4 block text-[11px] font-bold uppercase tracking-wider text-muted">Category</label>
                <input className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm" value={label} onChange={(e) => setLabel(e.target.value)} />
                <div className="mt-2 flex flex-wrap gap-1">
                    {labels.map((entry) => (
                        <button key={entry} type="button" className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-muted hover:border-plex hover:text-plex" onClick={() => setLabel(entry)}>
                            {entry}
                        </button>
                    ))}
                </div>
                <label className="mt-4 flex items-center gap-2 text-sm text-text">
                    <input type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)} />
                    Automatic sync
                </label>
                {sync ? (
                    <input
                        type="number"
                        min={0}
                        className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
                        value={interval}
                        onChange={(e) => setIntervalDays(e.target.value)}
                    />
                ) : null}
                <div className="mt-5 flex justify-end gap-2">
                    <button type="button" className={buttonClass} onClick={onClose}>Cancel</button>
                    <button type="button" className={primaryButtonClass} onClick={() => void save()} disabled={saving}>Save</button>
                </div>
            </div>
        </div>
    );
};

const UsersPanel: React.FC = () => {
    const [users, setUsers] = useState<SpotifyUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [emptyMessage, setEmptyMessage] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await workerFetch('spotify/users');
            setUsers(Array.isArray(data) ? data : []);
            setEmptyMessage('');
        } catch (e: any) {
            setUsers([]);
            setEmptyMessage(e?.message || 'No Spotify users connected.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const updateUser = async (user: SpotifyUser, patch: Partial<SpotifyUser>) => {
        try {
            const data = await workerFetch('spotify/users', {
                method: 'PUT',
                body: JSON.stringify({ id: user.id, ...patch }),
            });
            setUsers(Array.isArray(data) ? data : []);
        } catch (e: any) {
            pushToast(e?.message || 'Update failed', 'error');
        }
    };

    const removeUser = async (id: string) => {
        try {
            await workerFetch(`spotify/users?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
            await load();
            pushToast('Spotify user removed', 'success');
        } catch (e: any) {
            pushToast(e?.message || 'Remove failed', 'error');
        }
    };

    return (
        <DashboardPanel
            title="Spotify accounts"
            subtitle="Connect accounts used for private playlists and Liked Songs."
            controls={(
                <a href={portalUrl('/api/spotify-to-plex/spotify-login')} className={primaryButtonClass}>
                    Connect Spotify
                </a>
            )}
        >
            {loading ? (
                <p className="text-sm text-muted">Loading…</p>
            ) : users.length === 0 ? (
                <p className="text-sm text-muted">{emptyMessage || 'No Spotify users connected yet.'}</p>
            ) : (
                <div className="space-y-2">
                    {users.map((user) => (
                        <div key={user.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                            <div className="min-w-0 flex-1">
                                <p className="font-semibold text-text">{user.name || user.id}</p>
                                <p className="text-[11px] text-muted">{user.id}</p>
                            </div>
                            <label className="flex items-center gap-2 text-xs text-muted">
                                <input type="checkbox" checked={!!user.sync} onChange={(e) => void updateUser(user, { sync: e.target.checked })} />
                                Sync
                            </label>
                            <label className="flex items-center gap-2 text-xs text-muted">
                                <input type="checkbox" checked={!!user.recentContext} onChange={(e) => void updateUser(user, { recentContext: e.target.checked })} />
                                Recent context
                            </label>
                            <button type="button" className={buttonClass} onClick={() => void removeUser(user.id)}>
                                <Trash2 className="h-3.5 w-3.5" /> Remove
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </DashboardPanel>
    );
};

const SyncPanel: React.FC<{
    status: SyncStatus | null;
    busy: boolean;
    onSync: (type: string) => void;
    onApplyPlex: () => void;
}> = ({ status, busy, onSync, onApplyPlex }) => {
    const [availability, setAvailability] = useState<Record<string, boolean>>({});

    useEffect(() => {
        void workerFetch('sync/availability').then((data) => {
            if (data && typeof data === 'object') setAvailability(data);
        }).catch(() => {});
    }, []);

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <DashboardPanel title="Plex connection" subtitle="Uses Settings → Plex URL and token. No extra Plex login in this page.">
                <p className="text-sm text-text">{status?.plexLoggedIn ? 'Linked' : 'Not linked yet'}</p>
                {status?.plexUri ? <p className="mt-1 truncate text-xs text-muted">{status.plexUri}</p> : null}
                <button type="button" className={`${buttonClass} mt-3`} onClick={onApplyPlex} disabled={busy}>
                    <Settings2 className="h-3.5 w-3.5" /> Apply portal Plex settings
                </button>
            </DashboardPanel>
            <DashboardPanel title="Manual sync" subtitle="Same worker jobs as the original app: playlists, albums, users, Lidarr, SLSKD, MQTT.">
                <div className="flex flex-wrap gap-2">
                    {SYNC_TYPES.map((entry) => (
                        <button
                            key={entry.id}
                            type="button"
                            className={entry.id === 'all' ? primaryButtonClass : buttonClass}
                            disabled={busy || (entry.id !== 'all' && availability[entry.id] === false)}
                            onClick={() => onSync(entry.id)}
                            title={availability[entry.id] === false ? 'Not configured' : undefined}
                        >
                            {entry.label}
                        </button>
                    ))}
                </div>
            </DashboardPanel>
        </div>
    );
};

const MatchingPanel: React.FC = () => {
    const [filters, setFilters] = useState('[]');
    const [approaches, setApproaches] = useState('[]');
    const [text, setText] = useState('{}');
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [match, search, processing] = await Promise.all([
                workerFetch('plex/music-search-config/match-filters'),
                workerFetch('plex/music-search-config/search-approaches'),
                workerFetch('plex/music-search-config/text-processing'),
            ]);
            setFilters(JSON.stringify(match, null, 2));
            setApproaches(JSON.stringify(search, null, 2));
            setText(JSON.stringify(processing, null, 2));
        } catch (e: any) {
            pushToast(e?.message || 'Could not load matching config', 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const saveJson = async (path: string, raw: string, label: string) => {
        try {
            const parsed = JSON.parse(raw);
            await workerFetch(path, { method: 'POST', body: JSON.stringify(parsed) });
            pushToast(`${label} saved`, 'success');
        } catch (e: any) {
            pushToast(e?.message || `Invalid JSON for ${label}`, 'error');
        }
    };

    const reset = async () => {
        try {
            await workerFetch('plex/music-search-config/reset', { method: 'POST', body: JSON.stringify({}) });
            pushToast('Matching config reset', 'success');
            await load();
        } catch (e: any) {
            pushToast(e?.message || 'Reset failed', 'error');
        }
    };

    if (loading) return <p className="text-sm text-muted">Loading matching config…</p>;

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <button type="button" className={buttonClass} onClick={() => void reset()}>Reset to defaults</button>
            </div>
            {[
                { title: 'Match filters', value: filters, set: setFilters, path: 'plex/music-search-config/match-filters' },
                { title: 'Search approaches', value: approaches, set: setApproaches, path: 'plex/music-search-config/search-approaches' },
                { title: 'Text processing', value: text, set: setText, path: 'plex/music-search-config/text-processing' },
            ].map((block) => (
                <DashboardPanel key={block.path} title={block.title} controls={(
                    <button type="button" className={primaryButtonClass} onClick={() => void saveJson(block.path, block.value, block.title)}>Save</button>
                )}>
                    <textarea
                        className="min-h-[160px] w-full rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs text-text"
                        value={block.value}
                        onChange={(e) => block.set(e.target.value)}
                    />
                </DashboardPanel>
            ))}
        </div>
    );
};

const IntegrationsPanel: React.FC = () => {
    const [lidarr, setLidarr] = useState('{}');
    const [slskd, setSlskd] = useState('{}');
    const [tidalOk, setTidalOk] = useState<boolean | null>(null);
    const [lidarrOk, setLidarrOk] = useState<boolean | null>(null);
    const [slskdOk, setSlskdOk] = useState<boolean | null>(null);

    useEffect(() => {
        void (async () => {
            try { setLidarr(JSON.stringify(await workerFetch('lidarr/settings'), null, 2)); } catch { /* ignore */ }
            try { setSlskd(JSON.stringify(await workerFetch('slskd/settings'), null, 2)); } catch { /* ignore */ }
            try {
                const valid = await workerFetch('lidarr/valid');
                setLidarrOk(!!valid?.ok);
            } catch { setLidarrOk(false); }
            try {
                const valid = await workerFetch('slskd/valid');
                setSlskdOk(!!valid?.ok);
            } catch { setSlskdOk(false); }
            try {
                const valid = await workerFetch('tidal/valid');
                setTidalOk(!!valid?.ok);
            } catch { setTidalOk(false); }
        })();
    }, []);

    const save = async (path: string, raw: string, label: string) => {
        try {
            await workerFetch(path, { method: 'PUT', body: JSON.stringify(JSON.parse(raw)) });
            pushToast(`${label} saved`, 'success');
        } catch (e: any) {
            pushToast(e?.message || `Could not save ${label}`, 'error');
        }
    };

    return (
        <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
                {[
                    { label: 'Lidarr', ok: lidarrOk },
                    { label: 'SLSKD', ok: slskdOk },
                    { label: 'Tidal', ok: tidalOk },
                ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{item.label}</p>
                        <p className={`mt-1 text-sm font-semibold ${item.ok ? 'text-emerald-300' : 'text-amber-200'}`}>
                            {item.ok == null ? '…' : item.ok ? 'Configured' : 'Not configured'}
                        </p>
                    </div>
                ))}
            </div>
            <DashboardPanel title="Lidarr" controls={<button type="button" className={primaryButtonClass} onClick={() => void save('lidarr/settings', lidarr, 'Lidarr')}>Save</button>}>
                <textarea className="min-h-[140px] w-full rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs" value={lidarr} onChange={(e) => setLidarr(e.target.value)} />
            </DashboardPanel>
            <DashboardPanel title="SLSKD" controls={<button type="button" className={primaryButtonClass} onClick={() => void save('slskd/settings', slskd, 'SLSKD')}>Save</button>}>
                <textarea className="min-h-[140px] w-full rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs" value={slskd} onChange={(e) => setSlskd(e.target.value)} />
            </DashboardPanel>
        </div>
    );
};

const LogsPanel: React.FC = () => {
    const [logs, setLogs] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setLogs(await workerFetch('logs'));
        } catch (e: any) {
            pushToast(e?.message || 'Could not load logs', 'error');
            setLogs(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const clear = async () => {
        try {
            await workerFetch('logs', { method: 'DELETE' });
            pushToast('Logs cleared', 'success');
            await load();
        } catch (e: any) {
            pushToast(e?.message || 'Clear failed', 'error');
        }
    };

    const missing = logs?.missing_files || {};

    return (
        <DashboardPanel
            title="Sync history"
            subtitle="Worker logs for playlists, albums, users, Lidarr, and SLSKD."
            controls={(
                <div className="flex gap-2">
                    <button type="button" className={buttonClass} onClick={() => void load()}>Refresh</button>
                    <button type="button" className={buttonClass} onClick={() => void clear()}>Clear</button>
                </div>
            )}
        >
            {loading ? <p className="text-sm text-muted">Loading…</p> : (
                <div className="space-y-4">
                    {Object.entries(logs?.sync_log || {}).map(([type, entries]) => (
                        <div key={type}>
                            <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">{type}</h3>
                            {!Array.isArray(entries) || !entries.length ? (
                                <p className="text-xs text-muted">No runs</p>
                            ) : (
                                <ul className="space-y-1 text-xs">
                                    {[...entries].slice(-8).reverse().map((entry: any, index: number) => (
                                        <li key={index} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-text">
                                            {entry.error || entry.message || entry.status || JSON.stringify(entry)}
                                            {entry.finishedAt || entry.timestamp ? (
                                                <span className="ml-2 text-muted">{formatWhen(entry.finishedAt || entry.timestamp)}</span>
                                            ) : null}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ))}
                    {Object.entries(missing).some(([, value]) => String(value || '').trim()) ? (
                        <div>
                            <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Missing files</h3>
                            {Object.entries(missing).map(([name, value]) => String(value || '').trim() ? (
                                <pre key={name} className="mb-2 max-h-48 overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 text-[11px] text-muted">
                                    {name}{'\n'}{String(value)}
                                </pre>
                            ) : null)}
                        </div>
                    ) : null}
                </div>
            )}
        </DashboardPanel>
    );
};

export default SpotifySyncPage;
