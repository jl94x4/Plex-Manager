import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, FileVideo, Folder, FolderOpen, Loader2, RefreshCw } from 'lucide-react';
import { mediaAutomationApi, type MediaAutomationBrowseResult } from './api';

const fieldClass = 'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-text placeholder:text-muted/60 outline-none transition focus:border-plex focus:ring-1 focus:ring-plex';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-white/[0.04] px-3 py-2 text-sm font-semibold text-text transition hover:border-plex/50 hover:bg-plex/10 disabled:pointer-events-none disabled:opacity-40';
const primaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-plex px-3 py-2 text-sm font-bold text-background transition hover:bg-plex-hover disabled:pointer-events-none disabled:opacity-40';

type Props = {
    label?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    optional?: boolean;
    /** directory = pick folders; file = pick media files under mounts */
    mode?: 'directory' | 'file';
    extensions?: string[];
    hint?: string;
};

export const PathBrowserField: React.FC<Props> = ({
    label,
    value,
    onChange,
    placeholder,
    optional = false,
    mode = 'directory',
    extensions,
    hint,
}) => {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [listing, setListing] = useState<MediaAutomationBrowseResult | null>(null);
    const [cursor, setCursor] = useState('');
    const pickFiles = mode === 'file';

    const load = useCallback(async (nextPath = '') => {
        setBusy(true);
        setError('');
        try {
            const result = await mediaAutomationApi.browse(nextPath, {
                files: pickFiles,
                extensions,
            });
            setListing(result);
            setCursor(result.path || '');
            if (result.message && !result.roots?.length) setError(result.message);
        } catch (err) {
            if (nextPath) {
                try {
                    const fallback = await mediaAutomationApi.browse('', { files: pickFiles, extensions });
                    setListing(fallback);
                    setCursor('');
                    setError(err instanceof Error ? err.message : 'Path not browsable — pick a mount root');
                    return;
                } catch {
                    // fall through
                }
            }
            setError(err instanceof Error ? err.message : 'Failed to browse');
        } finally {
            setBusy(false);
        }
    }, [extensions, pickFiles]);

    useEffect(() => {
        if (!open) return;
        const start = value.trim();
        // If current value is a file, open its parent directory.
        const initial = pickFiles && start && /\.[a-z0-9]+$/i.test(start)
            ? start.replace(/[/\\][^/\\]+$/, '')
            : start;
        void load(initial);
        // Intentionally only when the browser is opened.
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

    const selectPath = (next: string) => {
        onChange(next);
        setOpen(false);
    };

    return (
        <div className="space-y-2">
            {(label || true) && (
                <div className="flex items-center justify-between gap-2">
                    {label ? <label className="text-sm font-semibold text-text">{label}{optional ? ' (optional)' : ''}</label> : <span />}
                    <button
                        type="button"
                        className={buttonClass}
                        onClick={() => setOpen((current) => !current)}
                    >
                        {open ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
                        {open ? 'Hide browser' : (pickFiles ? 'Browse files' : 'Browse')}
                    </button>
                </div>
            )}
            <input
                className={fieldClass}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
            />
            {hint && <p className="text-xs text-muted">{hint}</p>}
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
                        <button type="button" className={buttonClass} disabled={busy} onClick={() => void load(cursor || '')}>
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
                        </button>
                        {!pickFiles && (
                            <button
                                type="button"
                                className={primaryButtonClass}
                                disabled={!cursor}
                                onClick={() => cursor && selectPath(cursor)}
                            >
                                Use this folder
                            </button>
                        )}
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
                            {pickFiles
                                ? 'Open a mounted root, then click a media file. Use container paths (e.g. /media/...), not Unraid /mnt/… paths.'
                                : 'Select a mounted root to browse. Use container paths (e.g. /media), not Unraid /mnt/… paths.'}
                        </p>
                    )}
                    {!listing?.path && !(listing?.roots?.length) && !busy && (
                        <p className="text-xs text-amber-200">
                            No mounts found. Map media into the portal container first (e.g. host share → /media).
                        </p>
                    )}
                    <div className="max-h-64 overflow-y-auto rounded-lg border border-border/60 bg-card/40 custom-scrollbar">
                        {busy && !listing ? (
                            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-plex" /></div>
                        ) : (listing?.entries || []).length === 0 ? (
                            <p className="p-4 text-sm text-muted">
                                {error || (pickFiles ? 'No media files in this folder.' : 'No folders here.')}
                            </p>
                        ) : (
                            <ul className="divide-y divide-border/50">
                                {(listing?.entries || []).map((entry) => {
                                    const isFile = entry.type === 'file';
                                    return (
                                        <li key={entry.path}>
                                            <button
                                                type="button"
                                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text transition hover:bg-plex/10"
                                                onClick={() => {
                                                    if (isFile) selectPath(entry.path);
                                                    else void load(entry.path);
                                                }}
                                            >
                                                {isFile
                                                    ? <FileVideo className="h-4 w-4 shrink-0 text-plex" />
                                                    : <Folder className="h-4 w-4 shrink-0 text-plex" />}
                                                <span className="truncate font-mono text-xs sm:text-sm">{entry.name}</span>
                                                {isFile && <span className="ml-auto text-[10px] uppercase text-muted">Select</span>}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                    {cursor && <p className="break-all font-mono text-[11px] text-muted">Folder: {cursor}</p>}
                    {error && listing?.roots?.length ? <p className="text-xs text-amber-200">{error}</p> : null}
                </div>
            )}
        </div>
    );
};
