import { createRoot } from 'react-dom/client';
import { MainApp } from './client/App';
import { installIosKeyboardScrollLock } from './client/shared/iosKeyboardScrollLock';

// iOS Safari auto-zooms focused inputs unless maximum-scale=1 (pinch zoom keeps
// working on iOS regardless, so accessibility is unaffected). This must live in
// the bundle: the CSP is script-src 'self', so inline scripts in index.html are
// silently blocked and never run.
const isIos = /iP(ad|hone|od)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const viewportMeta = document.querySelector('meta[name="viewport"]');
const viewportBase = 'width=device-width, initial-scale=1, viewport-fit=cover';
if (isIos) {
    viewportMeta?.setAttribute(
        'content',
        'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover',
    );
} else if (/Android/i.test(navigator.userAgent)) {
    // Android Chrome can keep a leftover pinch/focus scale across SPA loads.
    // Briefly lock maximum-scale to snap back to 1, then restore pinch-zoom.
    const resetAndroidZoom = () => {
        if (!viewportMeta) return;
        const scale = window.visualViewport?.scale ?? 1;
        if (scale <= 1.01) return;
        viewportMeta.setAttribute('content', `${viewportBase}, maximum-scale=1`);
        requestAnimationFrame(() => {
            viewportMeta.setAttribute('content', viewportBase);
        });
    };
    resetAndroidZoom();
    window.addEventListener('pageshow', resetAndroidZoom);
}
// Stop iOS shoving the page up when the keyboard opens on an already-visible field.
installIosKeyboardScrollLock();

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<MainApp />);
