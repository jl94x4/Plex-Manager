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
 * True for iPhone / iPad (incl. iPadOS desktop UA).
 * iOS bottom nav uses plain CSS `fixed; bottom:0` + safe-area padding — do not
 * run this hook on iOS.
 */
export const isIosMobileClient = () => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/i.test(ua)) return true;
    // iPadOS 13+ can report as MacIntel with touch.
    return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
};

/** Home-screen / standalone display (iOS Safari PWA, Android TWA, etc.). */
export const isStandaloneDisplayMode = () => {
    if (typeof window === 'undefined') return false;
    return Boolean(
        window.matchMedia?.('(display-mode: standalone)').matches
        || window.matchMedia?.('(display-mode: fullscreen)').matches
        || (typeof navigator !== 'undefined' && (navigator as any).standalone === true)
    );
};

/**
 * Firefox Android needs explicit visual-viewport docking when its dynamic
 * toolbar changes. iOS and Chrome / Chromium Android use plain CSS `bottom:0`.
 */
export function useFirefoxMobileNavShell({ barRef, enabled }: Options) {
    useEffect(() => {
        if (!enabled || typeof window === 'undefined') return;

        let raf = 0;
        let lastTop: number | string = Number.NaN;

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
            const layoutBottom = Math.max(
                window.innerHeight || 0,
                document.documentElement?.clientHeight || 0,
                vv ? Math.ceil(vv.height + vv.offsetTop) : 0,
            );
            const visualBottom = vv ? (vv.offsetTop + vv.height) : layoutBottom;
            const isZoomed = vv ? Math.abs(vv.scale - 1) > 0.01 : false;
            const coveredByToolbar = layoutBottom - visualBottom;

            let dockBottom = layoutBottom;
            if (isZoomed) {
                dockBottom = visualBottom;
            } else if (coveredByToolbar > 24) {
                // Toolbar is visible over the page — keep the bar above it.
                dockBottom = visualBottom;
            } else {
                dockBottom = Math.max(layoutBottom, visualBottom);
            }

            bar.style.position = 'fixed';
            bar.style.left = '0px';
            bar.style.right = '0px';
            bar.style.width = '';
            bar.style.maxWidth = '';
            bar.style.margin = '0';
            bar.style.transform = 'translateZ(0)';

            const top = Math.round(dockBottom - barH);
            if (top === lastTop) return;
            lastTop = top;
            bar.style.bottom = 'auto';
            bar.style.top = `${top}px`;
        };

        const schedule = () => {
            if (raf) return;
            raf = window.requestAnimationFrame(() => {
                raf = 0;
                sync();
            });
        };

        const forceSync = () => {
            if (barRef.current && ro) ro.observe(barRef.current);
            lastTop = Number.NaN;
            schedule();
        };

        lastTop = Number.NaN;
        sync();
        schedule();

        window.addEventListener('resize', schedule);
        window.addEventListener('orientationchange', schedule);
        window.addEventListener('pageshow', forceSync);
        window.addEventListener('scroll', schedule, { passive: true });
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

        const retryTimers = [0, 100].map((ms) => window.setTimeout(forceSync, ms));

        return () => {
            if (raf) window.cancelAnimationFrame(raf);
            retryTimers.forEach((id) => window.clearTimeout(id));
            window.removeEventListener('resize', schedule);
            window.removeEventListener('orientationchange', schedule);
            window.removeEventListener('pageshow', forceSync);
            window.removeEventListener('scroll', schedule);
            mainScroll?.removeEventListener('scroll', schedule);
            window.visualViewport?.removeEventListener('resize', schedule);
            window.visualViewport?.removeEventListener('scroll', schedule);
            ro?.disconnect();
            if (barRef.current) clearInline(barRef.current);
        };
    }, [barRef, enabled]);
}
