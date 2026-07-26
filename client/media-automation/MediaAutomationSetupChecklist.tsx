import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, ListChecks, X } from 'lucide-react';
import type { MediaAutomationLibrary, MediaAutomationPipeline, MediaAutomationStatus } from './types';
import {
    buildSetupChecklist,
    isSetupChecklistDismissed,
    setSetupChecklistDismissed,
    setupChecklistComplete,
    type SetupChecklistStep,
} from './pipelineUi';

const cardClass = 'rounded-2xl border border-border/70 bg-card/70 shadow-xl backdrop-blur-md';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-white/[0.04] px-3 py-2 text-sm font-semibold text-text transition hover:border-plex/50 hover:bg-plex/10 disabled:pointer-events-none disabled:opacity-40';

type Props = {
    status: MediaAutomationStatus;
    libraries: MediaAutomationLibrary[];
    pipelines: MediaAutomationPipeline[];
    compact?: boolean;
    onAction: (action: NonNullable<SetupChecklistStep['action']>) => void;
};

export const MediaAutomationSetupChecklist: React.FC<Props> = ({
    status,
    libraries,
    pipelines,
    compact = false,
    onAction,
}) => {
    const steps = useMemo(
        () => buildSetupChecklist({ status, libraries, pipelines }),
        [status, libraries, pipelines],
    );
    const complete = setupChecklistComplete(steps);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        setDismissed(isSetupChecklistDismissed());
    }, []);

    useEffect(() => {
        if (!complete && dismissed) {
            setSetupChecklistDismissed(false);
            setDismissed(false);
        }
    }, [complete, dismissed]);

    if (dismissed && complete) return null;

    const visible = compact ? steps.filter((step) => !step.done || step.warn) : steps;
    if (compact && visible.length === 0 && complete) return null;

    return (
        <section className={`${cardClass} p-5`}>
            <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                    <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-plex">
                        <ListChecks className="h-3.5 w-3.5" /> Setup
                    </div>
                    <h2 className="font-bold text-text">{complete ? 'Ready to process media' : 'Get a pipeline running'}</h2>
                    <p className="mt-1 text-xs text-muted">
                        {complete
                            ? 'Checklist complete. Queue a sample or run Scan now when you are ready.'
                            : 'Work top to bottom — missing any step usually looks like “job completed but nothing changed.”'}
                    </p>
                </div>
                {complete && (
                    <button
                        type="button"
                        className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-text"
                        aria-label="Dismiss setup checklist"
                        onClick={() => {
                            setSetupChecklistDismissed(true);
                            setDismissed(true);
                        }}
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>
            <ol className="space-y-2">
                {visible.map((step, index) => (
                    <li
                        key={step.id}
                        className={`flex flex-col gap-2 rounded-xl border px-3 py-3 sm:flex-row sm:items-center sm:justify-between ${
                            step.done && !step.warn
                                ? 'border-emerald-500/20 bg-emerald-500/5'
                                : step.warn
                                    ? 'border-amber-500/30 bg-amber-500/10'
                                    : 'border-border bg-background/30'
                        }`}
                    >
                        <div className="min-w-0 flex items-start gap-3">
                            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                                step.done && !step.warn
                                    ? 'bg-emerald-500/20 text-emerald-200'
                                    : 'bg-white/5 text-muted'
                            }`}
                            >
                                {step.done && !step.warn ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                            </span>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-text">{step.label}</p>
                                <p className="mt-0.5 text-xs text-muted">{step.detail}</p>
                            </div>
                        </div>
                        {step.action && step.actionLabel && (
                            <button type="button" className={buttonClass} onClick={() => onAction(step.action!)}>
                                {step.actionLabel} <ChevronRight className="h-4 w-4" />
                            </button>
                        )}
                    </li>
                ))}
            </ol>
        </section>
    );
};
