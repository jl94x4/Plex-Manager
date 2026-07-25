import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Folder, FolderOpen, Loader2, RefreshCw } from 'lucide-react';
import { mediaAutomationApi, type MediaAutomationBrowseResult } from './api';

const fieldClass = 'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-text placeholder:text-muted/60 outline-none transition focus:border-plex focus:ring-1 focus:ring-plex';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-white/[0.04] px-3 py-2 text-sm font-semibold text-text transition hover:border-plex/50 hover:bg-plex/10 disabled:pointer-events-none disabled:opacity-40';
const primaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-plex px-3 py-2 text-sm font-bold text-background transition hover:bg-plex-hover disabled:pointer-events-none disabled:opacity-40';

type Props = {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    optional?: boolean;
};

export const PathBrowserField: React.FC<Props> = ({
    label,
    value,
    onChange,
    placeholder,
    optional = false,
}) => {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [listing, setListing] = useState<MediaAutomationBrowseResult | null>(null);
    const [cursor, setCursor] = useState('');

    const load = useCallback(async (nextPath = '') => {
        setBusy(true);
        setError('');
        try {
            const result = await mediaAutomationApi.browse(nextPath);
            setListing(result);
            setCursor(result.path || '');
            if (result.message && !result.roots?.length) setError(result.message);
        } catch (err) {
            if (nextPath) {
                try {
                    const fallback = await mediaAutomationApi.browse('');
                    setListing(fallback);
                    setCursor('');
                    setError(err instanceof Error ? err.message : 'Path not browsable — pick a mount root');
                    return;
                } catch {
                    // fall through
                }
            }
            setError(err instanceof Error ? err.message : 'Failed to browse directories');
        } finally {
            setBusy(false);
        }
    }, []);

    useEffect(() => {
        if (!open) return;
        void load(value.trim());
        // Intentionally only when the browser is opened, not on every keystroke.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const crumbs = (() => {
        if (!listing?.path || !listing.root) return [] as string[];
        const relative = listing.path === listing.root
            ? ''
            : listing.path.slice(listing.root.length).replace(/^[/\\]+/, '');
        const parts = relative ? relative.split(/[/\\]+/).filter(Boolean) : [];
        const items = [listing.root];
        let built = listing.root;
        for (const part of parts) {
            built = `${built.replace(/[/\\]+$/, '')}/${part}`;
            items.push(built);
        }
        return items;
    })();

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-semibold text-text">{label}{optional ? ' (optional)' : ''}</label>
                <button
                    type="button"
                    className={buttonClass}
                    onClick={() => setOpen((current) => !current)}
                >
                    {open ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
                    {open ? 'Hide browser' : 'Browse'}
                </button>
            </div>
            <input
                className={fieldClass}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
            />
            {open && (
                <div className="rounded-xl border border-border bg-background/40 p-3 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            className={buttonClass}
                            disabled={busy || !listing?.parent}
                            onClick={() => listing?.parent && void load(listing.parent)}
                        >
                            <ChevronLeft className="h-4 w-4" /> Up
                        </button>
                        <button type="button" className={buttonClass} disabled={busy} onClick={() => void load(cursor || value.trim())}>
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
                        </button>
                        <button
                            type="button"
                            className={primaryButtonClass}
                            disabled={!cursor}
                            onClick={() => {
                                onChange(cursor);
                                setOpen(false);
                            }}
                        >
                            Use this folder
                        </button>
                        {optional && value && (
                            <button type="button" className={buttonClass} onClick={() => onChange('')}>
                                Clear
                            </button>
                        )}
                    </div>
                    {crumbs.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 text-xs text-muted">
                            {crumbs.map((crumb, index) => (
                                <React.Fragment key={crumb}>
                                    {index > 0 && <ChevronRight className="h-3 w-3" />}
                                    <button
                                        type="button"
                                        className="rounded px-1.5 py-0.5 font-mono hover:bg-plex/15 hover:text-plex"
                                        onClick={() => void load(crumb)}
                                    >
                                        {index === 0 ? crumb : crumb.split(/[/\\]/).filter(Boolean).pop()}
                                    </button>
                                </React.Fragment>
                            ))}
                        </div>
                    )}
                    {!listing?.path && (listing?.roots?.length || 0) > 0 && (
                        <p className="text-xs text-muted">
                            Select a mounted root to browse. These are paths inside the portal container
                            (e.g. <code className="text-plex">/media</code>, <code className="text-plex">/completed</code>)
                            — not Unraid host paths like <code className="text-plex">/mnt/…</code>.
                        </p>
                    )}
                    {!listing?.path && !(listing?.roots?.length) && !busy && (
                        <p className="text-xs text-amber-200">
                            No mounts found. In Unraid → Docker → Server Manager Portal → Edit, add path mappings
                            (Host → Container), then Apply / restart. Typical: media → <code className="text-plex">/media</code>,
                            completed → <code className="text-plex">/completed</code>, quarantine → <code className="text-plex">/quarantine</code>.
                        </p>
                    )}
                    <div className="max-h-56 overflow-y-auto rounded-lg border border-border/60 bg-card/40 custom-scrollbar">
                        {busy && !listing ? (
                            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-plex" /></div>
                        ) : (listing?.entries || []).length === 0 ? (
                            <p className="p-4 text-sm text-muted">
                                {error || 'No folders here. Pick a parent, or mount media paths on the container.'}
                            </p>
                        ) : (
                            <ul className="divide-y divide-border/50">
                                {(listing?.entries || []).map((entry) => (
                                    <li key={entry.path}>
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text transition hover:bg-plex/10"
                                            onClick={() => {
                                                if (entry.type === 'file') return;
                                                void load(entry.path);
                                            }}
                                            onDoubleClick={() => {
                                                if (entry.type === 'file') return;
                                                onChange(entry.path);
                                                setOpen(false);
                                            }}
                                        >
                                            <Folder className="h-4 w-4 shrink-0 text-plex" />
                                            <span className="truncate font-mono text-xs sm:text-sm">{entry.name}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    {cursor && <p className="break-all font-mono text-[11px] text-muted">Current: {cursor}</p>}
                    {error && listing?.roots?.length ? <p className="text-xs text-amber-200">{error}</p> : null}
                </div>
            )}
        </div>
    );
};
