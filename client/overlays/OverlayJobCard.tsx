import React from 'react';
import { ChevronDown, Loader2, Play } from 'lucide-react';

const buttonClass = 'inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-text hover:bg-white/10 disabled:opacity-50';
const primaryButtonClass = 'inline-flex items-center gap-2 rounded-md bg-plex px-3 py-2 text-sm font-bold text-background hover:bg-plex-hover disabled:opacity-50';

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
    children,
}) => {
    const toneClass = statusTone === 'running'
        ? 'border-plex/40 bg-plex/10 text-plex'
        : statusTone === 'off'
            ? 'border-white/10 bg-white/5 text-muted'
            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100';

    return (
        <section className="rounded-xl border border-white/10 bg-black/30 overflow-hidden">
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-1.5">
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
                        className={buttonClass}
                        aria-expanded={expanded}
                        onClick={onToggleExpand}
                    >
                        <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        {expanded ? collapseLabel : expandLabel}
                    </button>
                </div>
            </div>
            {expanded && children ? (
                <div className="border-t border-white/10 bg-background/20 p-4 space-y-3">
                    {children}
                </div>
            ) : null}
        </section>
    );
};
