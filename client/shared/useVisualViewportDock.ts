import { useEffect, type RefObject } from 'react';

type DockOptions = {
    /** Bottom bar that should stay flush with the visible viewport bottom. */
    barRef: RefObject<HTMLElement | null>;
    /** Optional overlay that should fill the space above the bar. */
    overlayRef?: RefObject<HTMLElement | null>;
    /** Re-run when this changes (e.g. overlay mounts). */
    enabled?: boolean;
    /** Extra dependency so remounts/open overlays re-bind. */
    syncKey?: unknown;
};

/**
 * Pin fixed bottom chrome to the *visual* viewport.
 * Mobile Firefox/Chrome collapse their toolbars without moving layout-viewport
 * `bottom: 0` elements, which leaves a dead gap under the nav.
 */
export function useVisualViewportDock({ barRef, overlayRef, enabled = true, syncKey }: DockOptions) {
    useEffect(() => {
        if (!enabled || typeof window === 'undefined') return;

        const sync = () => {
            const bar = barRef.current;
            if (!bar) return;

            const vv = window.visualViewport;
            if (!vv) {
                bar.style.top = 'auto';
                bar.style.bottom = '0px';
                bar.style.height = '';
                const overlay = overlayRef?.current;
                if (overlay) {
                    overlay.style.top = '0px';
                    overlay.style.bottom = `${bar.offsetHeight}px`;
                    overlay.style.height = '';
                }
                return;
            }

            const barHeight = bar.offsetHeight;
            const visualBottom = vv.offsetTop + vv.height;
            bar.style.bottom = 'auto';
            bar.style.top = `${Math.round(visualBottom - barHeight)}px`;
            bar.style.left = '0px';
            bar.style.right = '0px';

            const overlay = overlayRef?.current;
            if (overlay) {
                overlay.style.top = `${Math.round(vv.offsetTop)}px`;
                overlay.style.bottom = 'auto';
                overlay.style.height = `${Math.round(Math.max(0, visualBottom - vv.offsetTop - barHeight))}px`;
                overlay.style.left = '0px';
                overlay.style.right = '0px';
            }
        };

        sync();
        // Overlay mounts a frame later when opened — sync again next frame.
        const raf = window.requestAnimationFrame(sync);

        const vv = window.visualViewport;
        vv?.addEventListener('resize', sync);
        vv?.addEventListener('scroll', sync);
        window.addEventListener('resize', sync);
        window.addEventListener('orientationchange', sync);

        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null;
        if (barRef.current) ro?.observe(barRef.current);

        return () => {
            window.cancelAnimationFrame(raf);
            vv?.removeEventListener('resize', sync);
            vv?.removeEventListener('scroll', sync);
            window.removeEventListener('resize', sync);
            window.removeEventListener('orientationchange', sync);
            ro?.disconnect();
        };
    }, [barRef, overlayRef, enabled, syncKey]);
}
