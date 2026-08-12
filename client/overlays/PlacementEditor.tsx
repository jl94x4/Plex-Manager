import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Move, RotateCcw, Save } from 'lucide-react';
import { useDiscoverI18n } from '../discovery/i18n';
import { DashboardPanel } from '../shared/dashboard/DashboardChrome';
import type { OverlayPlacementKind, OverlaysPlacement } from './api';
import { DEFAULT_OVERLAY_PLACEMENT } from './api';

export type PlacementKind = 'show' | 'season' | 'episode' | 'media' | 'status' | 'ratings' | 'network';

type Props = {
    placement: OverlaysPlacement;
    seasonPresetId: string;
    episodePresetId: string;
    sampleBust: number;
    busy: boolean;
    onChange: (next: OverlaysPlacement) => void;
    onSave: () => void;
    onResetKind: (kind: PlacementKind) => void;
};

const buttonClass = 'inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-text hover:bg-white/10 disabled:opacity-50';
const primaryButtonClass = 'inline-flex items-center gap-2 rounded-md bg-plex px-3 py-2 text-sm font-bold text-background hover:bg-plex-hover disabled:opacity-50';
const fieldInputClass = 'mt-1.5 w-full rounded-lg border border-border bg-background p-3 text-sm text-text outline-none transition-all focus:border-plex focus:ring-1 focus:ring-plex';
const fieldLabelClass = 'text-[10px] font-bold uppercase tracking-[0.14em] text-muted';

const KIND_ORDER: PlacementKind[] = ['show', 'season', 'episode', 'media', 'status', 'ratings', 'network'];

const kindBaseUrl = (kind: PlacementKind, bust: number) => {
    const sampleKind = kind === 'episode' ? 'episode-base' : 'show-base';
    return `/api/overlays/sample/${sampleKind}?t=${encodeURIComponent(String(bust))}`;
};

const kindBannerUrl = (kind: PlacementKind, seasonPresetId: string, episodePresetId: string, bust: number) => {
    if (kind === 'media' || kind === 'status' || kind === 'ratings' || kind === 'network') {
        return `/api/overlays/preset-file?id=${encodeURIComponent(`placement-${kind}`)}&kind=season&t=${encodeURIComponent(String(bust))}`;
    }
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
    const [kind, setKind] = useState<PlacementKind>('show');
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

    const onPointerDownMove = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        dragRef.current = {
            mode: 'move',
            startX: e.clientX,
            startY: e.clientY,
            orig: { ...current },
            artW: artSize.w,
            artH: artSize.h,
        };
    };

    const onPointerDownResize = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        dragRef.current = {
            mode: 'resize',
            startX: e.clientX,
            startY: e.clientY,
            orig: { ...current },
            artW: artSize.w,
            artH: artSize.h,
        };
    };

    useEffect(() => {
        const onMove = (e: PointerEvent) => {
            const drag = dragRef.current;
            if (!drag) return;
            const dx = e.clientX - drag.startX;
            const dy = e.clientY - drag.startY;
            if (drag.mode === 'move') {
                const nx = Math.max(0, Math.min(1, drag.orig.x + dx / drag.artW));
                const ny = Math.max(0, Math.min(1, drag.orig.y + dy / drag.artH));
                patchKind({ x: nx, y: ny });
            } else {
                const nw = Math.max(0.05, Math.min(1, drag.orig.width + dx / drag.artW));
                patchKind({ width: nw });
            }
        };
        const onUp = () => { dragRef.current = null; };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
    }, [patchKind]);

    const box = bannerBox(artSize.w, artSize.h, bannerNat.w, bannerNat.h, current);
    const kindLabel = (k: PlacementKind) => t(`overlays.placement.kinds.${k}`);

    return (
        <DashboardPanel title={t('overlays.placement.title')} subtitle={t('overlays.placement.subtitle')}>
            <p className="mb-3 text-sm text-muted">{t('overlays.placement.hint')}</p>
            <div className="mb-4 flex flex-wrap gap-2">
                {KIND_ORDER.map((k) => (
                    <button
                        key={k}
                        type="button"
                        className={`rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${
                            kind === k ? 'bg-plex text-background' : 'border border-white/15 bg-white/5 text-text'
                        }`}
                        onClick={() => setKind(k)}
                    >
                        {kindLabel(k)}
                    </button>
                ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div
                    ref={stageRef}
                    className="relative mx-auto w-full max-w-[420px] overflow-hidden rounded-lg border border-border/60 bg-black/40"
                >
                    {!baseFailed ? (
                        <img
                            ref={artRef}
                            src={kindBaseUrl(kind, sampleBust)}
                            alt=""
                            className="block w-full"
                            onLoad={measureArt}
                            onError={() => setBaseFailed(true)}
                        />
                    ) : (
                        <div className="flex aspect-[2/3] items-center justify-center p-6 text-center text-sm text-muted">
                            {t('overlays.placement.needSample')}
                        </div>
                    )}
                    {!baseFailed && (
                        <div
                            className="absolute cursor-move border border-plex/80 bg-plex/10"
                            style={{
                                left: box.left,
                                top: box.top,
                                width: box.width,
                                height: box.keepH,
                                overflow: 'hidden',
                            }}
                            onPointerDown={onPointerDownMove}
                            title={t('overlays.placement.dragHint')}
                        >
                            <img
                                src={kindBannerUrl(kind, seasonPresetId, episodePresetId, sampleBust)}
                                alt=""
                                className="pointer-events-none max-w-none"
                                style={{
                                    width: box.width,
                                    height: box.height,
                                    marginTop: -box.clip,
                                    objectFit: 'contain',
                                }}
                                onLoad={(e) => {
                                    const img = e.currentTarget;
                                    if (img.naturalWidth > 0) {
                                        setBannerNat({ w: img.naturalWidth, h: img.naturalHeight });
                                    }
                                }}
                            />
                            <div
                                className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize bg-plex"
                                onPointerDown={onPointerDownResize}
                                title={t('overlays.placement.resize')}
                            />
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-40">
                                <Move className="h-5 w-5 text-white" />
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-3">
                    <label className="block">
                        <span className={fieldLabelClass}>{t('overlays.placement.width')}</span>
                        <input
                            type="number"
                            min={5}
                            max={100}
                            className={fieldInputClass}
                            value={Math.round((current.width || 0.5) * 100)}
                            onChange={(e) => patchKind({ width: Math.max(0.05, Math.min(1, (Number(e.target.value) || 50) / 100)) })}
                        />
                    </label>
                    <label className="block">
                        <span className={fieldLabelClass}>{t('overlays.placement.x')}</span>
                        <input
                            type="number"
                            min={0}
                            max={100}
                            className={fieldInputClass}
                            value={Math.round((current.x || 0) * 100)}
                            onChange={(e) => patchKind({ x: Math.max(0, Math.min(1, (Number(e.target.value) || 0) / 100)) })}
                        />
                    </label>
                    <label className="block">
                        <span className={fieldLabelClass}>{t('overlays.placement.y')}</span>
                        <input
                            type="number"
                            min={0}
                            max={100}
                            className={fieldInputClass}
                            value={Math.round((current.y || 0) * 100)}
                            onChange={(e) => patchKind({ y: Math.max(0, Math.min(1, (Number(e.target.value) || 0) / 100)) })}
                        />
                    </label>
                    <button type="button" className={buttonClass} disabled={busy} onClick={() => onResetKind(kind)}>
                        <RotateCcw className="h-4 w-4" />
                        {t('overlays.placement.resetKind')}
                    </button>
                    <button type="button" className={primaryButtonClass} disabled={busy} onClick={onSave}>
                        <Save className="h-4 w-4" />
                        {t('overlays.placement.save')}
                    </button>
                </div>
            </div>
        </DashboardPanel>
    );
};
