import React, { useMemo, useState } from 'react';
import { Layers3, X } from 'lucide-react';
import { ModalPortal } from '../shared/ModalPortal';
import {
    PIPELINE_PRESETS,
    PIPELINE_PRESET_CATEGORY_LABELS,
    type PipelinePresetCategory,
    type MediaAutomationPipeline,
} from './types';

const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-white/[0.04] px-3 py-2 text-sm font-semibold text-text transition hover:border-plex/50 hover:bg-plex/10 disabled:pointer-events-none disabled:opacity-40';
const cardClass = 'rounded-2xl border border-border/70 bg-card/70 shadow-xl backdrop-blur-md';

const CATEGORIES: PipelinePresetCategory[] = ['quality', 'remux', 'audio', 'subtitles', 'utility'];

type Props = {
    open: boolean;
    onClose: () => void;
    onSelect: (pipeline: MediaAutomationPipeline) => void;
};

export const PipelineTemplatePicker: React.FC<Props> = ({ open, onClose, onSelect }) => {
    const [category, setCategory] = useState<PipelinePresetCategory | 'all'>('quality');
    const presets = useMemo(
        () => (category === 'all' ? PIPELINE_PRESETS : PIPELINE_PRESETS.filter((preset) => preset.category === category)),
        [category],
    );

    return (
        <ModalPortal open={open}>
            <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
                <div
                    className={`${cardClass} max-h-[92dvh] w-full overflow-hidden sm:max-w-3xl`}
                    onMouseDown={(event) => event.stopPropagation()}
                >
                    <div className="flex items-center justify-between border-b border-border px-5 py-4">
                        <div>
                            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-plex">
                                <Layers3 className="h-3.5 w-3.5" /> Templates
                            </div>
                            <h2 className="text-lg font-bold text-text">Start from a template</h2>
                            <p className="mt-1 text-xs text-muted">Pick a goal, then tweak matching and output before you go live.</p>
                        </div>
                        <button type="button" className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-text" onClick={onClose}>
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="flex gap-1 overflow-x-auto border-b border-border p-3 custom-scrollbar">
                        <button
                            type="button"
                            className={`min-w-max rounded-lg px-3 py-1.5 text-xs font-bold ${category === 'all' ? 'bg-plex text-background' : 'text-muted hover:bg-white/5 hover:text-text'}`}
                            onClick={() => setCategory('all')}
                        >
                            All
                        </button>
                        {CATEGORIES.map((id) => (
                            <button
                                key={id}
                                type="button"
                                className={`min-w-max rounded-lg px-3 py-1.5 text-xs font-bold ${category === id ? 'bg-plex text-background' : 'text-muted hover:bg-white/5 hover:text-text'}`}
                                onClick={() => setCategory(id)}
                            >
                                {PIPELINE_PRESET_CATEGORY_LABELS[id]}
                            </button>
                        ))}
                    </div>
                    <div className="max-h-[60dvh] space-y-2 overflow-y-auto p-4 custom-scrollbar">
                        {presets.map((preset) => (
                            <button
                                key={preset.id}
                                type="button"
                                className="w-full rounded-xl border border-border bg-background/30 p-4 text-left transition hover:border-plex/50 hover:bg-plex/10"
                                onClick={() => onSelect({
                                    ...preset.pipeline,
                                    samplePath: '',
                                })}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="font-bold text-text">{preset.label}</p>
                                        <p className="mt-1 text-xs text-muted">{preset.detail}</p>
                                    </div>
                                    <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                                        {PIPELINE_PRESET_CATEGORY_LABELS[preset.category]}
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                    <div className="border-t border-border px-5 py-3">
                        <button type="button" className={buttonClass} onClick={onClose}>Cancel</button>
                    </div>
                </div>
            </div>
        </ModalPortal>
    );
};
