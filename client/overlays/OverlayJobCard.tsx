import React, { useEffect, useState } from 'react';
import { ChevronDown, Loader2, Play, Stamp } from 'lucide-react';
import { overlaysApi } from './api';

const buttonClass = 'inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-text hover:bg-white/10 disabled:opacity-50';
const primaryButtonClass = 'inline-flex items-center gap-2 rounded-md bg-plex px-3 py-2 text-sm font-bold text-background hover:bg-plex-hover disabled:opacity-50';
const ghostButtonClass = 'inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-semibold text-muted hover:bg-white/5 hover:text-text disabled:opacity-50';
const fieldInputClass = 'mt-1.5 w-full rounded-lg border border-border bg-background p-2.5 text-sm text-text outline-none transition-all focus:border-plex focus:ring-1 focus:ring-plex';
const fieldLabelClass = 'text-[10px] font-bold uppercase tracking-[0.14em] text-muted';

export type OverlayJobTitleFilter = 'all' | 'show' | 'movie';

export type OverlayJobTitleTestProps = {
    searchLabel: string;
    searchPlaceholder: string;
    pickLabel: string;
    stampLabel: string;
    hint: string;
    emptyPick: string;
    noResultsLabel?: string;
    searchingLabel?: string;
    disabled?: boolean;
    busy?: boolean;
    titleFilter?: OverlayJobTitleFilter;
    onStamp: (ratingKey: string, title: string) => void;
};

type TitleCandidate = { ratingKey: string; title: string; type?: string; library?: string };

export const OverlayJobTitleTest: React.FC<OverlayJobTitleTestProps> = ({
    searchLabel,
    searchPlaceholder,
    pickLabel,
    stampLabel,
    hint,
    emptyPick,
    noResultsLabel = 'No matches',
    searchingLabel = 'Searching…',
    disabled = false,
    busy = false,
    titleFilter = 'all',
    onStamp,
}) => {
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<TitleCandidate | null>(null);
    const [candidates, setCandidates] = useState<TitleCandidate[]>([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        const q = query.trim();
        let cancelled = false;
        const timer = window.setTimeout(() => {
            setSearching(true);
            void overlaysApi.sampleCandidates(q).then((res) => {
                if (cancelled) return;
                const items = Array.isArray(res.items) && res.items.length
                    ? res.items
                    : (res.shows || []).map((s) => ({ ...s, type: s.type || 'show' }));
                const filtered = titleFilter === 'all'
                    ? items
                    : items.filter((row) => String(row.type || '').toLowerCase() === titleFilter);
                setCandidates(filtered);
            }).catch(() => {
                if (!cancelled) setCandidates([]);
            }).finally(() => {
                if (!cancelled) setSearching(false);
            });
        }, 250);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [query, titleFilter]);

    const showList = query.trim().length > 0 || candidates.length > 0;

    return (
        <div className="border-t border-white/10 bg-background/15 px-4 py-3 space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className={fieldLabelClass}>{searchLabel}</p>
                <p className="text-[11px] text-muted">{hint}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <label className="block min-w-0">
                    <span className="sr-only">{searchLabel}</span>
                    <input
                        className={fieldInputClass}
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setSelected(null);
                        }}
                        placeholder={searchPlaceholder}
                        disabled={disabled || busy}
                        autoComplete="off"
                    />
                </label>
                <button
                    type="button"
                    className={primaryButtonClass}
                    disabled={disabled || busy || !selected?.ratingKey}
                    onClick={() => {
                        if (!selected?.ratingKey) return;
                        onStamp(selected.ratingKey, selected.title || selected.ratingKey);
                    }}
                >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stamp className="h-4 w-4" />}
                    {stampLabel}
                </button>
            </div>
            {selected ? (
                <p className="text-[12px] text-text">
                    <span className="text-muted">{pickLabel}: </span>
                    {selected.library
                        ? `${selected.title} · ${selected.library}${selected.type ? ` (${selected.type})` : ''}`
                        : selected.title}
                </p>
            ) : null}
            {showList ? (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-border/60 bg-background/40">
                    {searching && candidates.length === 0 ? (
                        <p className="px-3 py-2 text-[12px] text-muted">{searchingLabel}</p>
                    ) : candidates.length === 0 ? (
                        <p className="px-3 py-2 text-[12px] text-muted">
                            {query.trim() ? noResultsLabel : emptyPick}
                        </p>
                    ) : (
                        <ul className="divide-y divide-white/5">
                            {candidates.map((row) => {
                                const active = selected?.ratingKey === row.ratingKey;
                                return (
                                    <li key={row.ratingKey}>
                                        <button
                                            type="button"
                                            className={`flex w-full items-start gap-2 px-3 py-2 text-left text-[13px] transition-colors ${
                                                active
                                                    ? 'bg-plex/20 text-text'
                                                    : 'text-text/90 hover:bg-white/5'
                                            }`}
                                            disabled={disabled || busy}
                                            onClick={() => setSelected(row)}
                                        >
                                            <span className="min-w-0 flex-1 truncate font-medium">{row.title}</span>
                                            <span className="shrink-0 text-[11px] text-muted">
                                                {[row.library, row.type].filter(Boolean).join(' · ')}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            ) : null}
        </div>
    );
};

export type OverlayJobCardProps = {
    title: string;
    hint: string;
    statusLabel: string;
    statusTone?: 'idle' | 'running' | 'off';
    enabledSummary?: string;
    previewLabel: string;
    runLabel: string;
    expandLabel: string;
    collapseLabel: string;
    expanded: boolean;
    onToggleExpand: () => void;
    onPreview: () => void;
    onRun: () => void;
    previewBusy?: boolean;
    runBusy?: boolean;
    actionsDisabled?: boolean;
    titleTest?: React.ReactNode;
    children?: React.ReactNode;
};

export const OverlayJobCard: React.FC<OverlayJobCardProps> = ({
    title,
    hint,
    statusLabel,
    statusTone = 'idle',
    enabledSummary,
    previewLabel,
    runLabel,
    expandLabel,
    collapseLabel,
    expanded,
    onToggleExpand,
    onPreview,
    onRun,
    previewBusy = false,
    runBusy = false,
    actionsDisabled = false,
    titleTest,
    children,
}) => {
    const toneClass = statusTone === 'running'
        ? 'border-plex/40 bg-plex/10 text-plex'
        : statusTone === 'off'
            ? 'border-white/10 bg-white/5 text-muted'
            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100';

    return (
        <section className="rounded-xl border border-white/10 bg-black/30 overflow-hidden">
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-text">{title}</h3>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${toneClass}`}>
                            {statusTone === 'running' ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                            {statusLabel}
                        </span>
                    </div>
                    <p className="text-sm text-muted">{hint}</p>
                    {enabledSummary ? (
                        <p className="text-[11px] text-muted/90">{enabledSummary}</p>
                    ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                        type="button"
                        className={buttonClass}
                        disabled={actionsDisabled || previewBusy || runBusy}
                        onClick={onPreview}
                    >
                        {previewBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {previewLabel}
                    </button>
                    <button
                        type="button"
                        className={primaryButtonClass}
                        disabled={actionsDisabled || previewBusy || runBusy}
                        onClick={onRun}
                    >
                        {runBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        {runLabel}
                    </button>
                    <button
                        type="button"
                        className={ghostButtonClass}
                        aria-expanded={expanded}
                        onClick={onToggleExpand}
                    >
                        <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        {expanded ? collapseLabel : expandLabel}
                    </button>
                </div>
            </div>
            {titleTest}
            {expanded && children ? (
                <div className="border-t border-white/10 bg-background/20 p-4 space-y-3">
                    {children}
                </div>
            ) : null}
        </section>
    );
};
