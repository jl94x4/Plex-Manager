import { useEffect, type RefObject } from 'react';

type Options = {
    shellRef: RefObject<HTMLElement | null>;
    enabled: boolean;
};

/** True for Firefox on a phone/tablet UA (including Firefox Android PWA). */
export const isFirefoxMobileClient = () => {
    if (typeof navigator === 'undefined') return false;
    return /Firefox/i.test(navigator.userAgent)
        && /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);
};

/**
 * Firefox Android leaves `position:fixed; bottom:0` stranded when the toolbar
 * collapses. Size a full-viewport flex shell from `window.innerHeight` (updated on
 * resize/scroll) and put the nav in normal flow at the bottom. Chrome keeps
 * plain CSS fixed bottom and must not use this path.
 */
export function useFirefoxMobileNavShell({ shellRef, enabled }: Options) {
    useEffect(() => {
        if (!enabled || typeof window === 'undefined') return;

        let raf = 0;
        const sync = () => {
            const shell = shellRef.current;
            if (!shell) return;
            const h = Math.round(window.innerHeight);
            shell.style.top = '0px';
            shell.style.left = '0px';
            shell.style.right = '0px';
            shell.style.bottom = 'auto';
            shell.style.height = `${h}px`;
            shell.style.width = '100%';
            shell.style.position = 'fixed';
        };

        const schedule = () => {
            if (raf) return;
            raf = window.requestAnimationFrame(() => {
                raf = 0;
                sync();
            });
        };

        sync();
        window.addEventListener('resize', schedule);
        window.addEventListener('orientationchange', schedule);
        window.addEventListener('scroll', schedule, { passive: true });
        window.visualViewport?.addEventListener('resize', schedule);
        window.visualViewport?.addEventListener('scroll', schedule);

        return () => {
            if (raf) window.cancelAnimationFrame(raf);
            window.removeEventListener('resize', schedule);
            window.removeEventListener('orientationchange', schedule);
            window.removeEventListener('scroll', schedule);
            window.visualViewport?.removeEventListener('resize', schedule);
            window.visualViewport?.removeEventListener('scroll', schedule);
            const shell = shellRef.current;
            if (shell) {
                shell.style.top = '';
                shell.style.left = '';
                shell.style.right = '';
                shell.style.bottom = '';
                shell.style.height = '';
                shell.style.width = '';
                shell.style.position = '';
            }
        };
    }, [shellRef, enabled]);
}
