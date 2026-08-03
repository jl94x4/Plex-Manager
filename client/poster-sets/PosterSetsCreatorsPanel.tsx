import React, { useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, User } from 'lucide-react';
import type { PosterSetsConfig } from './types';

const buttonClass = 'inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs font-semibold text-text transition hover:border-plex/40 hover:bg-white/5 disabled:pointer-events-none disabled:opacity-40 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm';
const primaryButtonClass = 'inline-flex items-center justify-center gap-1.5 rounded-xl bg-plex px-2.5 py-1.5 text-xs font-bold text-background transition hover:bg-plex-hover active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm';
const fieldClass = 'w-full rounded-lg border border-white/10 bg-background/70 px-3 py-2 text-xs text-text placeholder:text-muted/60 outline-none transition focus:border-plex focus:ring-1 focus:ring-plex sm:py-2.5 sm:text-sm';

const normalizeHandle = (value: string) => String(value || '').trim().replace(/^@+/, '');

export type PosterSetsCreatorsPanelProps = {
    creators: string[];
    busy?: string | null;
    onChange: (creators: string[]) => void;
    onSave: (config: Partial<PosterSetsConfig>) => Promise<void>;
    onOpenCreator?: (handle: string) => void;
    toast: (message: string, type?: 'success' | 'error') => void;
};

export function PosterSetsCreatorsPanel({
    creators,
    busy,
    onChange,
    onSave,
    onOpenCreator,
    toast,
}: PosterSetsCreatorsPanelProps) {
    const [draft, setDraft] = useState('');
    const sorted = useMemo(
        () => [...creators].map(normalizeHandle).filter(Boolean).sort((a, b) => a.localeCompare(b)),
        [creators],
    );

    const addCreator = async () => {
        const handle = normalizeHandle(draft);
        if (!handle) {
            toast('Enter a creator username.', 'error');
            return;
        }
        if (sorted.some((entry) => entry.toLowerCase() === handle.toLowerCase())) {
            toast('That creator is already in your follow list.', 'error');
            return;
        }
        const next = [...sorted, handle];
        onChange(next);
        setDraft('');
        try {
            await onSave({ creatorWhitelist: next });
            toast(`Following @${handle}.`);
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to save creators', 'error');
        }
    };

    const removeCreator = async (handle: string) => {
        const next = sorted.filter((entry) => entry.toLowerCase() !== handle.toLowerCase());
        onChange(next);
        try {
            await onSave({ creatorWhitelist: next });
            toast(`Removed @${handle}.`);
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Failed to save creators', 'error');
        }
    };

    return (
        <section className="space-y-4 rounded-xl border border-white/10 bg-black/20 p-4 sm:p-5">
            <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted">Creators you follow</p>
                <p className="mt-1 text-sm text-muted">
                    Pin MediUX and ThePosterDB creators for a dedicated Browse rail. Click a name to open their catalog.
                </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                    <input
                        className={`${fieldClass} pl-9`}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                void addCreator();
                            }
                        }}
                        placeholder="Username e.g. kaster"
                    />
                </div>
                <button type="button" className={primaryButtonClass} disabled={busy != null} onClick={() => void addCreator()}>
                    {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add
                </button>
            </div>
            {sorted.length ? (
                <div className="flex flex-wrap gap-2">
                    {sorted.map((handle) => (
                        <div
                            key={handle}
                            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/30 py-1 pl-2.5 pr-1 text-xs"
                        >
                            <button
                                type="button"
                                className="font-semibold text-plex hover:underline"
                                onClick={() => onOpenCreator?.(handle)}
                            >
                                @{handle}
                            </button>
                            <button
                                type="button"
                                className="rounded-full p-1 text-muted transition hover:bg-white/10 hover:text-red-200"
                                aria-label={`Remove ${handle}`}
                                disabled={busy != null}
                                onClick={() => void removeCreator(handle)}
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-sm text-muted">No followed creators yet. Add usernames to populate the Following rail in Browse.</p>
            )}
        </section>
    );
}
