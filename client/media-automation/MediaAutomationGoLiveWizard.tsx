import React, { useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, CirclePlay, FolderCog, Layers3, Loader2, ShieldCheck, Sparkles, X } from 'lucide-react';
import { ModalPortal } from '../shared/ModalPortal';
import { buildSetupChecklist, setupChecklistComplete, type SetupChecklistStep } from './pipelineUi';
import type { MediaAutomationLibrary, MediaAutomationPipeline, MediaAutomationStatus } from './types';

type Props = {
    open: boolean;
    onClose: () => void;
    status: MediaAutomationStatus;
    libraries: MediaAutomationLibrary[];
    pipelines: MediaAutomationPipeline[];
    onAction: (action: SetupChecklistStep['action']) => void;
    busy?: string | null;
};

const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-text transition hover:border-plex/40 hover:bg-white/5 disabled:pointer-events-none disabled:opacity-40';
const primaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-plex px-3 py-2 text-sm font-bold text-background transition hover:bg-plex-hover disabled:pointer-events-none disabled:opacity-40';

export const MediaAutomationGoLiveWizard: React.FC<Props> = ({
    open,
    onClose,
    status,
    libraries,
    pipelines,
    onAction,
    busy,
}) => {
    const steps = useMemo(
        () => buildSetupChecklist({ status, libraries, pipelines }),
        [status, libraries, pipelines],
    );
    const complete = setupChecklistComplete(steps);
    const firstOpen = steps.findIndex((step) => !step.done || step.warn);
    const [index, setIndex] = useState(0);
    const activeIndex = Math.min(Math.max(index, firstOpen < 0 ? steps.length - 1 : firstOpen), steps.length - 1);
    const step = steps[activeIndex] || steps[0];

    if (!open || !step) return null;

    return (
        <ModalPortal open={open}>
            <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
                <div className="max-h-[94dvh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card shadow-2xl custom-scrollbar sm:max-w-xl sm:rounded-2xl" onMouseDown={(event) => event.stopPropagation()}>
                    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-5 py-4 backdrop-blur-md">
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-plex">Go live</p>
                            <h2 className="text-lg font-bold text-text">Guided setup</h2>
                        </div>
                        <button type="button" className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-text" onClick={onClose} aria-label="Close">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="space-y-5 p-5">
                        <div className="flex flex-wrap gap-2">
                            {steps.map((entry, stepIndex) => (
                                <button
                                    key={entry.id}
                                    type="button"
                                    className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                                        stepIndex === activeIndex
                                            ? 'border-plex/40 bg-plex/15 text-plex'
                                            : entry.done && !entry.warn
                                                ? 'border-emerald-500/30 text-emerald-300'
                                                : 'border-border text-muted'
                                    }`}
                                    onClick={() => setIndex(stepIndex)}
                                >
                                    {stepIndex + 1}. {entry.label}
                                </button>
                            ))}
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-5">
                            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-plex/30 bg-plex/15">
                                {step.id === 'feature' && <ShieldCheck className="h-5 w-5 text-plex" />}
                                {step.id === 'library' && <FolderCog className="h-5 w-5 text-plex" />}
                                {step.id === 'pipeline' && <Layers3 className="h-5 w-5 text-plex" />}
                                {step.id === 'writes' && <ShieldCheck className="h-5 w-5 text-plex" />}
                                {step.id === 'sample' && <Sparkles className="h-5 w-5 text-plex" />}
                                {step.id === 'worker' && <CirclePlay className="h-5 w-5 text-plex" />}
                            </div>
                            <h3 className="text-xl font-bold text-text">{step.label}</h3>
                            <p className="mt-2 text-sm text-muted">{step.detail}</p>
                            {step.done && !step.warn && (
                                <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-emerald-300">
                                    <CheckCircle2 className="h-4 w-4" /> Done
                                </p>
                            )}
                        </div>
                        <div className="flex flex-wrap justify-between gap-2">
                            <button type="button" className={buttonClass} disabled={activeIndex <= 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}>
                                Back
                            </button>
                            <div className="flex flex-wrap gap-2">
                                {step.action && step.actionLabel && (
                                    <button
                                        type="button"
                                        className={primaryButtonClass}
                                        disabled={busy !== null}
                                        onClick={() => onAction(step.action)}
                                    >
                                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                        {step.actionLabel}
                                    </button>
                                )}
                                {activeIndex < steps.length - 1 ? (
                                    <button type="button" className={buttonClass} onClick={() => setIndex((value) => Math.min(steps.length - 1, value + 1))}>
                                        Next <ChevronRight className="h-4 w-4" />
                                    </button>
                                ) : (
                                    <button type="button" className={primaryButtonClass} onClick={onClose}>
                                        {complete ? 'Finish' : 'Close'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </ModalPortal>
    );
};

export default MediaAutomationGoLiveWizard;
