import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Music, X } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { ModalPortal } from '../shared/ModalPortal';
import { NoPosterPlaceholder } from '../shared/NoPosterPlaceholder';
import { CustomSelect } from '../shared/ui';
import { formatQuotaHint } from './requestSeasonUtils';

type Props = {
    open: boolean;
    mbid: string;
    title?: string;
    posterUrl?: string | null;
    overview?: string | null;
    onClose: () => void;
    onSuccess: (message: string) => void;
    onError: (message: string) => void;
};

type ServiceOptions = {
    server: { id: number; name: string; activeProfileId?: number; activeDirectory?: string };
    profiles: { id: number; name: string }[];
    rootFolders: { id: number; path: string; freeSpace?: number | null }[];
    tags: { id: number; label: string }[];
};

const formatBytes = (bytes?: number | null) => {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return '';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(sizes.length - 1, Math.max(0, Math.floor(Math.log(n) / Math.log(k))));
    return `${parseFloat((n / Math.pow(k, i)).toFixed(1))} ${sizes[i]} free`;
};

export const MusicRequestModal: React.FC<Props> = ({
    open,
    mbid,
    title: fallbackTitle,
    posterUrl: fallbackPosterUrl,
    overview: fallbackOverview,
    onClose,
    onSuccess,
    onError,
}) => {
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [options, setOptions] = useState<any>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [serverId, setServerId] = useState<number | null>(null);
    const [profileId, setProfileId] = useState<number | null>(null);
    const [rootFolder, setRootFolder] = useState('');
    const [serviceOptions, setServiceOptions] = useState<ServiceOptions | null>(null);
    const [serviceLoading, setServiceLoading] = useState(false);
    const loadGenRef = useRef(0);

    const loadOptions = useCallback(async () => {
        const gen = ++loadGenRef.current;
        setLoading(true);
        try {
            const data = await apiFetch(
                `/api/discovery/request-options?mediaType=music&mediaId=${encodeURIComponent(mbid)}`,
            );
            if (gen !== loadGenRef.current) return;
            if (data?.error) throw new Error(data.error);
            setOptions(data);
            const servers = Array.isArray(data?.servers) ? data.servers : [];
            const preferred = servers.find((s: any) => s.isDefault) || servers[0] || null;
            setServerId(preferred?.id ?? null);
            if (gen === loadGenRef.current) setLoading(false);
        } catch (e: any) {
            if (gen !== loadGenRef.current) return;
            onError(e?.message || 'Failed to load request options');
            setOptions(null);
            setLoading(false);
        }
    }, [mbid, onError]);

    useEffect(() => {
        if (!open) return;
        loadOptions();
    }, [open, loadOptions]);

    useEffect(() => {
        if (!open || !showAdvanced || !options?.canRequestAdvanced || serverId == null) return;
        let cancelled = false;
        setServiceLoading(true);
        void (async () => {
            try {
                const data = await apiFetch(`/api/discovery/request-services/music/${serverId}`);
                if (cancelled) return;
                setServiceOptions(data);
                const profiles = data?.profiles || [];
                const folders = data?.rootFolders || [];
                setProfileId(Number(data?.server?.activeProfileId ?? profiles[0]?.id) || null);
                setRootFolder(String(data?.server?.activeDirectory || folders[0]?.path || ''));
            } catch {
                if (!cancelled) setServiceOptions(null);
            } finally {
                if (!cancelled) setServiceLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [open, showAdvanced, options?.canRequestAdvanced, serverId]);

    const submit = async () => {
        if (!options?.canRequest) return;
        setSubmitting(true);
        try {
            const body: Record<string, unknown> = {
                mediaType: 'music',
                mediaId: mbid,
            };
            if (showAdvanced && options.canRequestAdvanced) {
                if (serverId != null) body.serverId = serverId;
                if (profileId != null) body.profileId = profileId;
                if (rootFolder) body.rootFolder = rootFolder;
            }
            await apiFetch('/api/discovery/request', {
                method: 'POST',
                body: JSON.stringify(body),
            });
            onSuccess(`Request submitted for ${options?.title || fallbackTitle || 'artist'}.`);
            onClose();
        } catch (e: any) {
            onError(e?.message || 'Failed to submit request');
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    const title = options?.title || fallbackTitle || 'Artist';
    const overview = options?.overview || fallbackOverview || '';
    const posterUrl = options?.posterUrl || options?.posterPath || fallbackPosterUrl || null;
    const quotaHint = options?.quota ? formatQuotaHint(options.quota, false) : '';

    return (
        <ModalPortal>
            <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4">
                <button type="button" className="absolute inset-0 bg-black/70" onClick={onClose} aria-label="Close" />
                <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-border bg-background shadow-2xl">
                    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-background/95 backdrop-blur">
                        <div className="flex items-center gap-2 min-w-0">
                            <Music className="w-4 h-4 text-plex shrink-0" />
                            <h2 className="font-black text-sm truncate">Request artist</h2>
                        </div>
                        <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-muted">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="p-4 flex flex-col gap-4">
                        <div className="flex gap-3">
                            <div className="w-20 h-20 rounded-xl overflow-hidden bg-white/5 shrink-0">
                                {posterUrl ? (
                                    <img src={posterUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <NoPosterPlaceholder className="w-full h-full" label="No art" />
                                )}
                            </div>
                            <div className="min-w-0">
                                <h3 className="font-black text-lg leading-tight">{title}</h3>
                                {overview && <p className="text-sm text-muted mt-1 line-clamp-3">{overview}</p>}
                            </div>
                        </div>

                        {loading ? (
                            <div className="py-8 flex justify-center text-muted">
                                <Loader2 className="w-6 h-6 animate-spin" />
                            </div>
                        ) : !options ? (
                            <p className="text-sm text-red-400">Unable to load request options.</p>
                        ) : (
                            <>
                                {options.blockReason && (
                                    <p className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                                        {options.blockReason}
                                    </p>
                                )}
                                {quotaHint && (
                                    <p className="text-xs text-muted">{quotaHint}</p>
                                )}
                                {options.canRequestAdvanced && (
                                    <button
                                        type="button"
                                        onClick={() => setShowAdvanced((v) => !v)}
                                        className="text-xs font-bold text-plex hover:underline self-start"
                                    >
                                        {showAdvanced ? 'Hide advanced' : 'Advanced options'}
                                    </button>
                                )}
                                {showAdvanced && options.canRequestAdvanced && (
                                    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-white/[0.02] p-3">
                                        {serviceLoading ? (
                                            <div className="py-4 flex justify-center text-muted">
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                            </div>
                                        ) : serviceOptions ? (
                                            <>
                                                <CustomSelect
                                                    label="Lidarr server"
                                                    value={serverId != null ? String(serverId) : ''}
                                                    onChange={(v) => setServerId(Number(v) || null)}
                                                    options={(options.servers || []).map((s: any) => ({
                                                        value: String(s.id),
                                                        label: s.name,
                                                    }))}
                                                />
                                                <CustomSelect
                                                    label="Quality profile"
                                                    value={profileId != null ? String(profileId) : ''}
                                                    onChange={(v) => setProfileId(Number(v) || null)}
                                                    options={(serviceOptions.profiles || []).map((p) => ({
                                                        value: String(p.id),
                                                        label: p.name,
                                                    }))}
                                                />
                                                <CustomSelect
                                                    label="Root folder"
                                                    value={rootFolder}
                                                    onChange={setRootFolder}
                                                    options={(serviceOptions.rootFolders || []).map((f) => ({
                                                        value: f.path,
                                                        label: f.freeSpace != null
                                                            ? `${f.path} (${formatBytes(f.freeSpace)})`
                                                            : f.path,
                                                    }))}
                                                />
                                            </>
                                        ) : (
                                            <p className="text-xs text-muted">Could not load Lidarr options.</p>
                                        )}
                                    </div>
                                )}
                                <button
                                    type="button"
                                    disabled={!options.canRequest || submitting}
                                    onClick={submit}
                                    className="w-full py-3 rounded-xl bg-plex text-black font-black hover:bg-plex-hover disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                                >
                                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    {submitting ? 'Submitting…' : 'Submit request'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </ModalPortal>
    );
};
