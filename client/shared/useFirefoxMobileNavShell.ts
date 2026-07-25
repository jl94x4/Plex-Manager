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
            const top = Math.round(
                vv
                    ? vv.offsetTop + vv.height - barH
                    : window.innerHeight - barH
            );

            if (top === lastTop) return;
            lastTop = top;

            bar.style.position = 'fixed';
            bar.style.left = '0px';
            bar.style.right = '0px';
            bar.style.width = '100%';
            bar.style.maxWidth = '100%';
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
            window.visualViewport?.removeEventListener('resize', schedule);
            window.visualViewport?.removeEventListener('scroll', schedule);
            ro?.disconnect();
            if (barRef.current) clearInline(barRef.current);
        };
    }, [barRef, enabled]);
}
