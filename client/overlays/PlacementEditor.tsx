import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Move, RotateCcw, Save } from 'lucide-react';
import { useDiscoverI18n } from '../discovery/i18n';
import { DashboardPanel } from '../shared/dashboard/DashboardChrome';
import type { OverlayPlacementKind, OverlaysPlacement } from './api';
import { DEFAULT_OVERLAY_PLACEMENT } from './api';

type Kind = 'show' | 'season' | 'episode';

type Props = {
    placement: OverlaysPlacement;
    seasonPresetId: string;
    episodePresetId: string;
    sampleBust: number;
    busy: boolean;
    onChange: (next: OverlaysPlacement) => void;
    onSave: () => void;
    onResetKind: (kind: Kind) => void;
};

const buttonClass = 'inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-text hover:bg-white/10 disabled:opacity-50';
const primaryButtonClass = 'inline-flex items-center gap-2 rounded-md bg-plex px-3 py-2 text-sm font-bold text-background hover:bg-plex-hover disabled:opacity-50';
const fieldInputClass = 'mt-1.5 w-full rounded-lg border border-border bg-background p-3 text-sm text-text outline-none transition-all focus:border-plex focus:ring-1 focus:ring-plex';
const fieldLabelClass = 'text-[10px] font-bold uppercase tracking-[0.14em] text-muted';

const kindBaseUrl = (kind: Kind, bust: number) => {
    const sampleKind = kind === 'episode' ? 'episode-base' : 'show-base';
    return `/api/overlays/sample/${sampleKind}?t=${encodeURIComponent(String(bust))}`;
};

const kindBannerUrl = (kind: Kind, seasonPresetId: string, episodePresetId: string, bust: number) => {
    const id = kind === 'show' ? seasonPresetId : episodePresetId;
    const presetKind = kind === 'show' ? 'season' : 'episode';
    return `/api/overlays/preset-file?id=${encodeURIComponent(id)}&kind=${presetKind}&t=${encodeURIComponent(String(bust))}`;
};

/** Mirror worker sizing: width fraction, optional maxHeight clamp, bottom clip. */
function bannerBox(
    artW: number,
    artH: number,
    bannerNatW: number,
    bannerNatH: number,
    p: OverlayPlacementKind,
) {
    let w = artW * Math.max(0.05, Math.min(1, p.width));
    let h = bannerNatW > 0 ? bannerNatH * (w / bannerNatW) : w * 0.25;
    if (typeof p.maxHeight === 'number' && Number.isFinite(p.maxHeight)) {
        const maxH = artH * Math.max(0.05, Math.min(1, p.maxHeight));
        if (h > maxH) {
            w *= maxH / h;
            h = maxH;
        }
    }
    const clip = Math.max(0, Math.min(h - 1, h * Math.max(0, Math.min(0.2, p.bottomClip ?? 0.1))));
    const keepH = Math.max(1, h - clip);
    const ax = p.anchorX || 'center';
    const ay = p.anchorY || 'bottom';
    const anchorX = artW * Math.max(0, Math.min(1, p.x));
    const anchorY = artH * Math.max(0, Math.min(1, p.y));
    let left = ax === 'left' ? anchorX : ax === 'right' ? anchorX - w : anchorX - w / 2;
    let top = ay === 'top' ? anchorY : ay === 'center' ? anchorY - keepH / 2 : anchorY - keepH;
    return { left, top, width: w, height: h, keepH, clip };
}

export const PlacementEditor: React.FC<Props> = ({
    placement,
    seasonPresetId,
    episodePresetId,
    sampleBust,
    busy,
    onChange,
    onSave,
    onResetKind,
}) => {
    const { t } = useDiscoverI18n();
    const [kind, setKind] = useState<Kind>('show');
    const [baseFailed, setBaseFailed] = useState(false);
    const [bannerNat, setBannerNat] = useState({ w: 800, h: 200 });
    const stageRef = useRef<HTMLDivElement | null>(null);
    const artRef = useRef<HTMLImageElement | null>(null);
    const [artSize, setArtSize] = useState({ w: 400, h: 600 });
    const dragRef = useRef<{
        mode: 'move' | 'resize';
        startX: number;
        startY: number;
        orig: OverlayPlacementKind;
        artW: number;
        artH: number;
    } | null>(null);

    const current = placement[kind] || DEFAULT_OVERLAY_PLACEMENT[kind];

    const measureArt = useCallback(() => {
        const img = artRef.current;
        const stage = stageRef.current;
        if (!img || !stage) return;
        const rect = img.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            setArtSize({ w: rect.width, h: rect.height });
        }
    }, []);

    useEffect(() => {
        setBaseFailed(false);
        const id = window.setTimeout(measureArt, 50);
        return () => window.clearTimeout(id);
    }, [kind, sampleBust, measureArt]);

    useEffect(() => {
        const onResize = () => measureArt();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [measureArt]);

    const patchKind = useCallback((partial: Partial<OverlayPlacementKind>) => {
        onChange({
            ...placement,
            [kind]: { ...current, ...partial },
        });
    }, [placement, kind, current, onChange]);

    const onPointerMove = useCallback((e: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        const { artW, artH, orig } = drag;
        if (drag.mode === 'move') {
            const box = bannerBox(artW, artH, bannerNat.w, bannerNat.h, orig);
            const newLeft = box.left + dx;
            const newTop = box.top + dy;
            const ax = orig.anchorX || 'center';
            const ay = orig.anchorY || 'bottom';
            let anchorX = ax === 'left' ? newLeft : ax === 'right' ? newLeft + box.width : newLeft + box.width / 2;
            let anchorY = ay === 'top' ? newTop : ay === 'center' ? newTop + box.keepH / 2 : newTop + box.keepH;
            patchKind({
                x: Math.max(0, Math.min(1, anchorX / artW)),
                y: Math.max(0, Math.min(1, anchorY / artH)),
            });
        } else {
            const deltaRatio = dx / artW;
            const nextWidth = Math.max(0.05, Math.min(1, orig.width + deltaRatio));
            patchKind({ width: nextWidth });
        }
    }, [bannerNat.h, bannerNat.w, patchKind]);

    const onPointerUp = useCallback(() => {
        dragRef.current = null;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
    }, [onPointerMove]);

    const startDrag = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragRef.current = {
            mode,
            startX: e.clientX,
            startY: e.clientY,
            orig: { ...current },
            artW: artSize.w,
            artH: artSize.h,
        };
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
    };

    useEffect(() => () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
    }, [onPointerMove, onPointerUp]);

    const box = bannerBox(artSize.w, artSize.h, bannerNat.w, bannerNat.h, current);
    const aspectClass = kind === 'episode' ? 'aspect-video max-w-xl' : 'aspect-[2/3] max-w-sm';

    return (
        <DashboardPanel title={t('overlays.placement.title')} subtitle={t('overlays.placement.subtitle')}>
            <div className="mb-4 flex flex-wrap gap-2">
                {(['show', 'season', 'episode'] as Kind[]).map((id) => (
                    <button
                        key={id}
                        type="button"
                        className={`${buttonClass} ${kind === id ? 'border-plex bg-plex/20 text-plex' : ''}`}
                        onClick={() => setKind(id)}
                    >
                        {t(`overlays.placement.kinds.${id}`)}
                    </button>
                ))}
            </div>

            <p className="mb-3 text-sm text-muted">{t('overlays.placement.hint')}</p>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
                <div
                    ref={stageRef}
                    className={`relative mx-auto w-full overflow-hidden rounded-lg border border-border bg-black/40 ${aspectClass}`}
                >
                    {!baseFailed ? (
                        <img
                            ref={artRef}
                            src={kindBaseUrl(kind, sampleBust)}
                            alt=""
                            className="h-full w-full object-contain"
                            draggable={false}
                            onLoad={measureArt}
                            onError={() => setBaseFailed(true)}
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950 p-4 text-center text-xs text-muted">
                            {t('overlays.placement.needSample')}
                        </div>
                    )}
                    <div
                        className="absolute cursor-move touch-none"
                        style={{
                            left: box.left,
                            top: box.top,
                            width: box.width,
                            height: box.keepH,
                            overflow: 'hidden',
                        }}
                        onPointerDown={startDrag('move')}
                    >
                        <img
                            src={kindBannerUrl(kind, seasonPresetId, episodePresetId, sampleBust)}
                            alt=""
                            className="pointer-events-none block max-w-none"
                            style={{
                                width: box.width,
                                height: box.height,
                                objectFit: 'fill',
                            }}
                            draggable={false}
                            onLoad={(e) => {
                                const img = e.currentTarget;
                                if (img.naturalWidth > 0) {
                                    setBannerNat({ w: img.naturalWidth, h: img.naturalHeight });
                                }
                            }}
                        />
                        <button
                            type="button"
                            aria-label={t('overlays.placement.resize')}
                            className="absolute -right-1 -bottom-1 h-4 w-4 cursor-se-resize rounded-sm border border-white/40 bg-plex"
                            onPointerDown={startDrag('resize')}
                        />
                    </div>
                    <div className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/80">
                        <Move className="h-3 w-3" /> {t('overlays.placement.dragHint')}
                    </div>
                </div>

                <div className="space-y-3">
                    <label className="block">
                        <span className={fieldLabelClass}>{t('overlays.placement.width')}</span>
                        <input
                            type="number"
                            min={5}
                            max={100}
                            step={1}
                            className={fieldInputClass}
                            value={Math.round(current.width * 100)}
                            onChange={(e) => patchKind({ width: Math.max(0.05, Math.min(1, Number(e.target.value) / 100 || 0.05)) })}
                        />
                    </label>
                    <label className="block">
                        <span className={fieldLabelClass}>{t('overlays.placement.x')}</span>
                        <input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            className={fieldInputClass}
                            value={Math.round(current.x * 100)}
                            onChange={(e) => patchKind({ x: Math.max(0, Math.min(1, Number(e.target.value) / 100 || 0)) })}
                        />
                    </label>
                    <label className="block">
                        <span className={fieldLabelClass}>{t('overlays.placement.y')}</span>
                        <input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            className={fieldInputClass}
                            value={Math.round(current.y * 100)}
                            onChange={(e) => patchKind({ y: Math.max(0, Math.min(1, Number(e.target.value) / 100 || 0)) })}
                        />
                    </label>
                    <div className="flex flex-wrap gap-2 pt-2">
                        <button
                            type="button"
                            className={buttonClass}
                            disabled={busy}
                            onClick={() => onResetKind(kind)}
                        >
                            <RotateCcw className="h-4 w-4" /> {t('overlays.placement.resetKind')}
                        </button>
                        <button
                            type="button"
                            className={primaryButtonClass}
                            disabled={busy}
                            onClick={onSave}
                        >
                            <Save className="h-4 w-4" /> {t('overlays.placement.save')}
                        </button>
                    </div>
                </div>
            </div>
        </DashboardPanel>
    );
};

