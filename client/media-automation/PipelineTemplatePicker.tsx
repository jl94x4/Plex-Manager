import React, { useMemo, useState } from 'react';
import { Layers3, X } from 'lucide-react';
import { ModalPortal } from '../shared/ModalPortal';
import {
    PIPELINE_PRESETS,
    PIPELINE_PRESET_CATEGORY_LABELS,
    type PipelinePresetCategory,
    type MediaAutomationPipeline,
} from './types';

const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-text transition hover:border-plex/40 hover:bg-white/5 disabled:pointer-events-none disabled:opacity-40';
const cardClass = 'glass-card shadow-xl';

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
                    <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                        <div>
                            <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-plex">
                                <Layers3 className="h-3.5 w-3.5" /> Templates
                            </div>
                            <h2 className="text-lg font-bold tracking-tight text-text">Start from a template</h2>
                            <p className="mt-1 text-sm leading-relaxed text-muted">Pick a goal, then tweak matching and output before you go live.</p>
                        </div>
                        <button type="button" className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-text" onClick={onClose}>
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto border-b border-white/10 p-3 custom-scrollbar">
                        <button
                            type="button"
                            className={`min-w-max rounded-full border px-3 py-1.5 text-xs font-bold transition ${category === 'all' ? 'border-plex/40 bg-plex/15 text-plex' : 'border-white/10 text-muted hover:text-text'}`}
                            onClick={() => setCategory('all')}
                        >
                            All
                        </button>
                        {CATEGORIES.map((id) => (
                            <button
                                key={id}
                                type="button"
                                className={`min-w-max rounded-full border px-3 py-1.5 text-xs font-bold transition ${category === id ? 'border-plex/40 bg-plex/15 text-plex' : 'border-white/10 text-muted hover:text-text'}`}
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
                                className="w-full rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-4 text-left transition hover:border-plex/40 hover:bg-plex/5"
                                onClick={() => onSelect({
                                    ...preset.pipeline,
                                    samplePath: '',
                                })}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="font-bold tracking-tight text-text">{preset.label}</p>
                                        <p className="mt-1 text-xs leading-relaxed text-muted">{preset.detail}</p>
                                    </div>
                                    <span className="shrink-0 rounded-full border border-white/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                                        {PIPELINE_PRESET_CATEGORY_LABELS[preset.category]}
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                    <div className="border-t border-white/10 px-5 py-3">
                        <button type="button" className={buttonClass} onClick={onClose}>Cancel</button>
                    </div>
                </div>
            </div>
        </ModalPortal>
    );
};
