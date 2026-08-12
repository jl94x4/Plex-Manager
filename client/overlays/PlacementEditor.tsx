import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Move, RotateCcw, Save } from 'lucide-react';
import { useDiscoverI18n } from '../discovery/i18n';
import { DashboardPanel } from '../shared/dashboard/DashboardChrome';
import { CustomSelect } from '../shared/ui';
import type { OverlayPlacementKind, OverlaysPlacement } from './api';
import { DEFAULT_OVERLAY_PLACEMENT } from './api';

export type PlacementKind = 'show' | 'season' | 'episode' | 'recently' | 'media' | 'status' | 'ratings' | 'network' | 'custom_collection';

type PresetOption = { value: string; label: string };

type Props = {
    placement: OverlaysPlacement;
    seasonPresetId: string;
    episodePresetId: string;
    recentlyPresetId: string;
    collectionPresetId?: string;
    seasonPresetOptions: PresetOption[];
    episodePresetOptions: PresetOption[];
    recentlyPresetOptions: PresetOption[];
    sampleBust: number;
    busy: boolean;
    onChange: (next: OverlaysPlacement) => void;
    onSeasonPresetChange: (id: string) => void;
    onEpisodePresetChange: (id: string) => void;
    onRecentlyPresetChange: (id: string) => void;
    onSave: () => void;
    onResetKind: (kind: PlacementKind) => void;
};

const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-text transition-colors hover:bg-white/10 disabled:opacity-50';
const primaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-plex px-3 py-2 text-sm font-bold text-background transition-colors hover:bg-plex-hover disabled:opacity-50';
const fieldInputClass = 'mt-1 w-full rounded-lg border border-white/10 bg-black/25 px-2.5 py-2 text-sm text-text outline-none transition focus:border-plex/50 focus:ring-1 focus:ring-plex/20';
const fieldLabelClass = 'text-[10px] font-bold uppercase tracking-[0.14em] text-muted';

const BANNER_KINDS: PlacementKind[] = ['show', 'season', 'episode', 'recently'];
const KOMETA_KINDS: PlacementKind[] = ['media', 'status', 'ratings', 'network', 'custom_collection'];

const kindBaseUrl = (kind: PlacementKind, bust: number) => {
    const sampleKind = kind === 'episode' ? 'episode-base' : 'show-base';
    return `/api/overlays/sample/${sampleKind}?t=${encodeURIComponent(String(bust))}`;
};

const kindBannerUrl = (
    kind: PlacementKind,
    seasonPresetId: string,
    episodePresetId: string,
    recentlyPresetId: string,
    collectionPresetId: string,
    bust: number,
) => {
    if (kind === 'custom_collection') {
        const id = collectionPresetId || 'placement-custom_collection';
        return `/api/overlays/preset-file?id=${encodeURIComponent(id)}&kind=season&t=${encodeURIComponent(String(bust))}`;
    }
    if (kind === 'media' || kind === 'status' || kind === 'ratings' || kind === 'network') {
        return `/api/overlays/preset-file?id=${encodeURIComponent(`placement-${kind}`)}&kind=season&t=${encodeURIComponent(String(bust))}`;
    }
    if (kind === 'recently') {
        return `/api/overlays/preset-file?id=${encodeURIComponent(recentlyPresetId || 'recently-added')}&kind=season&t=${encodeURIComponent(String(bust))}`;
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
    const left = ax === 'left' ? anchorX : ax === 'right' ? anchorX - w : anchorX - w / 2;
    const top = ay === 'top' ? anchorY : ay === 'center' ? anchorY - keepH / 2 : anchorY - keepH;
    return { left, top, width: w, height: h, keepH, clip };
}

const CompactField: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    hint?: string;
    onChange: (n: number) => void;
}> = ({ label, value, min, max, step = 1, hint, onChange }) => (
    <label className="block min-w-0">
        <span className={fieldLabelClass}>{label}</span>
        <input
            type="number"
            min={min}
            max={max}
            step={step}
            className={fieldInputClass}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
        />
        {hint ? <span className="mt-1 block text-[10px] leading-snug text-muted">{hint}</span> : null}
    </label>
);

export const PlacementEditor: React.FC<Props> = ({
    placement,
    seasonPresetId,
    episodePresetId,
    recentlyPresetId,
    collectionPresetId = '',
    seasonPresetOptions,
    episodePresetOptions,
    recentlyPresetOptions,
    sampleBust,
    busy,
    onChange,
    onSeasonPresetChange,
    onEpisodePresetChange,
    onRecentlyPresetChange,
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

    const current = placement[kind] || DEFAULT_OVERLAY_PLACEMENT[kind] || DEFAULT_OVERLAY_PLACEMENT.show;

    const measureArt = useCallback(() => {
        const stage = stageRef.current;
        if (!stage) return;
        const rect = stage.getBoundingClientRect();
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
    const stageAspectClass = kind === 'episode' ? 'aspect-video' : 'aspect-[2/3]';
    const showBottomClip = kind === 'show' || kind === 'season' || kind === 'episode' || kind === 'recently';

    const presetControls = useMemo(() => {
        if (kind === 'show') {
            return {
                label: t('overlays.settings.overlayPreset'),
                value: seasonPresetId || 'new-season',
                options: seasonPresetOptions.length ? seasonPresetOptions : [{ value: 'new-season', label: 'new-season' }],
                onChange: onSeasonPresetChange,
            };
        }
        if (kind === 'season' || kind === 'episode') {
            return {
                label: t('overlays.settings.episodeOverlayPreset'),
                value: episodePresetId || 'new-episode',
                options: episodePresetOptions.length ? episodePresetOptions : [{ value: 'new-episode', label: 'new-episode' }],
                onChange: onEpisodePresetChange,
            };
        }
        if (kind === 'recently') {
            return {
                label: t('overlays.settings.recentlyAddedPreset'),
                value: recentlyPresetId || 'recently-added',
                options: recentlyPresetOptions.length
                    ? recentlyPresetOptions
                    : [{ value: 'recently-added', label: 'recently-added' }],
                onChange: onRecentlyPresetChange,
            };
        }
        return null;
    }, [
        kind,
        t,
        seasonPresetId,
        episodePresetId,
        recentlyPresetId,
        seasonPresetOptions,
        episodePresetOptions,
        recentlyPresetOptions,
        onSeasonPresetChange,
        onEpisodePresetChange,
        onRecentlyPresetChange,
    ]);

    const bannerSrc = kindBannerUrl(kind, seasonPresetId, episodePresetId, recentlyPresetId, collectionPresetId, sampleBust);

    const renderKindButton = (k: PlacementKind) => {
        const active = kind === k;
        return (
            <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`w-full rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-colors ${
                    active
                        ? 'bg-plex text-background shadow-sm shadow-plex/20'
                        : 'text-text/85 hover:bg-white/5 hover:text-text'
                }`}
            >
                {kindLabel(k)}
            </button>
        );
    };

    return (
        <DashboardPanel
            title={t('overlays.placement.title')}
            subtitle={t('overlays.placement.subtitle')}
            controls={(
                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className={buttonClass} disabled={busy} onClick={() => onResetKind(kind)}>
                        <RotateCcw className="h-4 w-4" />
                        {t('overlays.placement.resetKind')}
                    </button>
                    <button type="button" className={primaryButtonClass} disabled={busy} onClick={onSave}>
                        <Save className="h-4 w-4" />
                        {t('overlays.placement.save')}
                    </button>
                </div>
            )}
        >
            <div className="grid gap-4 lg:grid-cols-[160px_minmax(200px,280px)_minmax(0,1fr)]">
                {/* Target list — dropdown on mobile, side nav on desktop */}
                <aside className="min-w-0">
                    <div className="lg:hidden">
                        <span className={fieldLabelClass}>{t('overlays.placement.target')}</span>
                        <CustomSelect
                            className="mt-1"
                            value={kind}
                            onChange={(id) => setKind(id as PlacementKind)}
                            options={[
                                ...BANNER_KINDS.map((k) => ({ value: k, label: `${t('overlays.placement.groupBanners')}: ${kindLabel(k)}` })),
                                ...KOMETA_KINDS.map((k) => ({ value: k, label: `${t('overlays.placement.groupKometa')}: ${kindLabel(k)}` })),
                            ]}
                        />
                    </div>
                    <div className="hidden rounded-xl border border-white/10 bg-black/20 p-2 lg:block">
                        <p className={`${fieldLabelClass} px-2.5 pb-1.5 pt-1`}>{t('overlays.placement.groupBanners')}</p>
                        <div className="flex flex-col">
                            {BANNER_KINDS.map(renderKindButton)}
                        </div>
                        <div className="my-2 border-t border-white/10" />
                        <p className={`${fieldLabelClass} px-2.5 pb-1.5 pt-1`}>{t('overlays.placement.groupKometa')}</p>
                        <div className="flex flex-col">
                            {KOMETA_KINDS.map(renderKindButton)}
                        </div>
                    </div>
                </aside>

                {/* Preview — fixed useful size, no giant empty gutters */}
                <div className="min-w-0">
                    <div
                        ref={stageRef}
                        className={`relative w-full overflow-hidden rounded-xl border border-white/10 bg-black/50 shadow-lg ${
                            kind === 'episode' ? 'max-w-md' : 'max-w-[280px]'
                        } ${stageAspectClass}`}
                    >
                        {!baseFailed ? (
                            <img
                                ref={artRef}
                                src={kindBaseUrl(kind, sampleBust)}
                                alt=""
                                className="absolute inset-0 h-full w-full object-cover"
                                onLoad={measureArt}
                                onError={() => setBaseFailed(true)}
                            />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center p-5 text-center text-sm text-muted">
                                {t('overlays.placement.needSample')}
                            </div>
                        )}
                        {!baseFailed && (
                            <div
                                className="absolute cursor-move"
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
                                    key={bannerSrc}
                                    src={bannerSrc}
                                    alt=""
                                    draggable={false}
                                    className="pointer-events-none max-w-none select-none"
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
                                    className="pointer-events-none absolute inset-0"
                                    style={{ boxShadow: 'inset 0 0 0 2px rgba(229, 160, 13, 0.85)' }}
                                />
                                <div
                                    className="absolute bottom-0 right-0 z-10 h-3.5 w-3.5 cursor-se-resize rounded-sm border border-background/80 bg-plex shadow"
                                    onPointerDown={onPointerDownResize}
                                    title={t('overlays.placement.resize')}
                                />
                                <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1 opacity-80">
                                    <Move className="h-3.5 w-3.5 text-white" />
                                </div>
                            </div>
                        )}
                    </div>
                    <p className="mt-2 max-w-[280px] text-[11px] leading-snug text-muted">
                        {t('overlays.placement.outlineHint')}
                    </p>
                </div>

                {/* Controls */}
                <div className="min-w-0 space-y-4 rounded-xl border border-white/10 bg-black/20 p-3 sm:p-4">
                    <div>
                        <p className="text-sm font-bold text-text">{kindLabel(kind)}</p>
                        <p className="mt-0.5 text-[11px] text-muted">{t('overlays.placement.hint')}</p>
                    </div>

                    {presetControls && (
                        <div>
                            <span className={fieldLabelClass}>{presetControls.label}</span>
                            <CustomSelect
                                className="mt-1"
                                value={presetControls.value}
                                onChange={presetControls.onChange}
                                options={presetControls.options}
                            />
                            <span className="mt-1 block text-[10px] text-muted">{t('overlays.placement.presetHint')}</span>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-2">
                        <CompactField
                            label={t('overlays.placement.width')}
                            value={Math.round((current.width || 0.5) * 100)}
                            min={5}
                            max={100}
                            onChange={(n) => patchKind({ width: Math.max(0.05, Math.min(1, (Number.isFinite(n) ? n : 50) / 100)) })}
                        />
                        <CompactField
                            label={t('overlays.placement.maxHeight')}
                            value={Math.round((current.maxHeight ?? 0.22) * 100)}
                            min={5}
                            max={100}
                            onChange={(n) => patchKind({
                                maxHeight: Math.max(0.05, Math.min(1, (Number.isFinite(n) ? n : 22) / 100)),
                            })}
                        />
                        <CompactField
                            label={t('overlays.placement.x')}
                            value={Math.round((current.x || 0) * 100)}
                            min={0}
                            max={100}
                            onChange={(n) => patchKind({ x: Math.max(0, Math.min(1, (Number.isFinite(n) ? n : 0) / 100)) })}
                        />
                        <CompactField
                            label={t('overlays.placement.y')}
                            value={Math.round((current.y || 0) * 100)}
                            min={0}
                            max={100}
                            onChange={(n) => patchKind({ y: Math.max(0, Math.min(1, (Number.isFinite(n) ? n : 0) / 100)) })}
                        />
                        {showBottomClip && (
                            <CompactField
                                label={t('overlays.placement.bottomClip')}
                                value={Math.round((current.bottomClip ?? 0.1) * 100)}
                                min={0}
                                max={20}
                                onChange={(n) => patchKind({
                                    bottomClip: Math.max(0, Math.min(0.2, (Number.isFinite(n) ? n : 0) / 100)),
                                })}
                            />
                        )}
                    </div>

                    <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3 lg:hidden">
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
            </div>
        </DashboardPanel>
    );
};
