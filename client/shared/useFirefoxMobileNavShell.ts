import { useEffect, type RefObject } from 'react';

type Options = {
    /** The bottom nav bar element (not a full-viewport shell). */
    barRef: RefObject<HTMLElement | null>;
    enabled: boolean;
};

/** True for Firefox on a phone/tablet UA (including Firefox Android PWA). */
export const isFirefoxMobileClient = () => {
    if (typeof navigator === 'undefined') return false;
    return /Firefox/i.test(navigator.userAgent)
        && /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);
};

/**
 * True for iPhone / iPad (incl. iPadOS desktop UA). Used to portal the bottom
 * nav to `document.body` — Safari's `position:fixed` is trapped by the
 * `h-dvh`/`overflow` app shell and leaves a large empty gap under the bar.
 */
export const isIosMobileClient = () => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/i.test(ua)) return true;
    // iPadOS 13+ can report as MacIntel with touch.
    return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
};

/**
 * Firefox Android leaves `position:fixed; bottom:0` stranded when the dynamic
 * toolbar shows/hides. Pin the bar so its bottom edge matches the *visual*
 * viewport bottom (layout-viewport coordinates).
 *
 * Chrome / Chromium PWA must not use this path — plain CSS `bottom:0` is correct there.
 */
export function useFirefoxMobileNavShell({ barRef, enabled }: Options) {
    useEffect(() => {
        if (!enabled || typeof window === 'undefined') return;

        let raf = 0;
        let lastTop = Number.NaN;

        const clearInline = (bar: HTMLElement) => {
            bar.style.position = '';
            bar.style.left = '';
            bar.style.right = '';
            bar.style.width = '';
            bar.style.maxWidth = '';
            bar.style.margin = '';
            bar.style.bottom = '';
            bar.style.top = '';
            bar.style.transform = '';
        };

        const sync = () => {
            const bar = barRef.current;
            if (!bar) return;

            const vv = window.visualViewport;
            const barH = Math.max(bar.offsetHeight || 0, 56);
            const layoutBottom = window.innerHeight;
            let dockBottom = layoutBottom;

            if (vv) {
                const visualBottom = vv.offsetTop + vv.height;
                const coveredByToolbar = layoutBottom - visualBottom;
                const isZoomedOrPanned = vv.offsetTop > 1 || Math.abs(vv.scale - 1) > 0.01;

                if (isZoomedOrPanned) {
                    dockBottom = visualBottom;
                } else if (coveredByToolbar > 24) {
                    // Toolbar is visible over the page: keep the bar above it.
                    dockBottom = visualBottom;
                } else {
                    // Toolbar is collapsed: extend to Firefox's layout viewport so
                    // the gesture area is painted instead of leaving a bottom gap.
                    dockBottom = Math.max(layoutBottom, visualBottom);
                }
            }

            const top = Math.round(dockBottom - barH);

            if (top === lastTop) return;
            lastTop = top;

            bar.style.position = 'fixed';
            bar.style.left = '0px';
            bar.style.right = '0px';
            bar.style.width = '';
            bar.style.maxWidth = '';
            bar.style.margin = '0';
            bar.style.bottom = 'auto';
            bar.style.top = `${top}px`;
            // Own compositor layer — reduces paint gaps during toolbar animation.
            bar.style.transform = 'translateZ(0)';
        };

        const schedule = () => {
            if (raf) return;
            raf = window.requestAnimationFrame(() => {
                raf = 0;
                sync();
            });
        };

        lastTop = Number.NaN;
        sync();
        schedule();

        window.addEventListener('resize', schedule);
        window.addEventListener('orientationchange', schedule);
        window.addEventListener('scroll', schedule, { passive: true });
        // Mobile portal scrolls inside #main-scroll-container (not the window).
        const mainScroll = document.getElementById('main-scroll-container');
        mainScroll?.addEventListener('scroll', schedule, { passive: true });
        window.visualViewport?.addEventListener('resize', schedule);
        window.visualViewport?.addEventListener('scroll', schedule);

        const ro = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(() => {
                lastTop = Number.NaN;
                schedule();
            })
            : null;
        if (barRef.current) ro?.observe(barRef.current);

        return () => {
            if (raf) window.cancelAnimationFrame(raf);
            window.removeEventListener('resize', schedule);
            window.removeEventListener('orientationchange', schedule);
            window.removeEventListener('scroll', schedule);
            mainScroll?.removeEventListener('scroll', schedule);
            window.visualViewport?.removeEventListener('resize', schedule);
            window.visualViewport?.removeEventListener('scroll', schedule);
            ro?.disconnect();
            if (barRef.current) clearInline(barRef.current);
        };
    }, [barRef, enabled]);
}
