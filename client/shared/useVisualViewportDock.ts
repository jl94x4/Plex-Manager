import { useEffect, type RefObject } from 'react';

type DockOptions = {
    /** Full-height mobile shell that ends at the visible viewport bottom. */
    shellRef: RefObject<HTMLElement | null>;
    /** Optional overlay that should fill the space above the bottom bar. */
    overlayRef?: RefObject<HTMLElement | null>;
    /** Bottom bar height used to size the More overlay. */
    barRef?: RefObject<HTMLElement | null>;
    enabled?: boolean;
    syncKey?: unknown;
};

/**
 * Keep mobile bottom chrome flush with the visible viewport on Firefox Android.
 *
 * Chrome already does the right thing with `position:fixed; bottom:0`. Firefox leaves
 * a dead gap when its bottom toolbar collapses. Fix: size a fixed flex shell to the
 * visible height and put the nav in normal flow at the shell bottom (`justify-end`)
 * so it isn't stuck on Firefox's layout-viewport fixed layer.
 */
export function useVisualViewportDock({
    shellRef,
    overlayRef,
    barRef,
    enabled = true,
    syncKey,
}: DockOptions) {
    useEffect(() => {
        if (!enabled || typeof window === 'undefined') return;

        let raf = 0;

        const syncNow = () => {
            const shell = shellRef.current;
            if (!shell) return;

            const vv = window.visualViewport;
            const layoutH = window.innerHeight;
            let height = layoutH;
            let top = 0;

            if (vv) {
                const visualBottom = vv.offsetTop + vv.height;
                const overlayGap = layoutH - visualBottom;
                // Pinch-zoom / visual pan — follow the visual viewport exactly.
                if (vv.offsetTop > 1 || Math.abs(vv.scale - 1) > 0.01) {
                    top = vv.offsetTop;
                    height = vv.height;
                } else if (overlayGap > 24 && window.scrollY < 8) {
                    // At top of page with a large layout-vs-visual gap → bottom toolbar is
                    // overlaying; size the shell to the visual viewport so the nav sits above it.
                    top = 0;
                    height = Math.max(1, visualBottom);
                } else {
                    // Scrolled (toolbar typically collapsed) or viewports agree → fill the
                    // layout viewport so we don't leave a dead gap under the nav.
                    top = 0;
                    height = Math.max(layoutH, visualBottom);
                }
            }

            shell.style.top = `${Math.round(top)}px`;
            shell.style.height = `${Math.round(height)}px`;
            shell.style.bottom = 'auto';
            document.documentElement.style.setProperty('--mobile-shell-height', `${Math.round(height)}px`);

            const overlay = overlayRef?.current;
            const bar = barRef?.current;
            if (overlay) {
                const barHeight = bar?.offsetHeight ?? 64;
                overlay.style.top = `${Math.round(top)}px`;
                overlay.style.height = `${Math.round(Math.max(0, height - barHeight))}px`;
                overlay.style.bottom = 'auto';
            }
        };

        const schedule = () => {
            if (raf) return;
            raf = window.requestAnimationFrame(() => {
                raf = 0;
                syncNow();
            });
        };

        syncNow();
        schedule();

        window.addEventListener('resize', schedule);
        window.addEventListener('orientationchange', schedule);
        window.addEventListener('scroll', schedule, { passive: true });
        window.visualViewport?.addEventListener('resize', schedule);
        window.visualViewport?.addEventListener('scroll', schedule);

        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
        if (shellRef.current) ro?.observe(shellRef.current);
        if (barRef?.current) ro?.observe(barRef.current);

        return () => {
            if (raf) window.cancelAnimationFrame(raf);
            window.removeEventListener('resize', schedule);
            window.removeEventListener('orientationchange', schedule);
            window.removeEventListener('scroll', schedule);
            window.visualViewport?.removeEventListener('resize', schedule);
            window.visualViewport?.removeEventListener('scroll', schedule);
            ro?.disconnect();
            document.documentElement.style.removeProperty('--mobile-shell-height');
        };
    }, [shellRef, overlayRef, barRef, enabled, syncKey]);
}
