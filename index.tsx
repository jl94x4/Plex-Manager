import { createRoot } from 'react-dom/client';
import { MainApp } from './client/App';
import { installIosKeyboardScrollLock, installIosTextZoomGuard } from './client/shared/iosKeyboardScrollLock';

// iOS auto-zoom: 16px fields in CSS + maximum-scale=1 on iPhone/iPad only.
// CSP is script-src 'self', so this cannot live as an inline index.html script.
installIosTextZoomGuard();

const viewportMeta = document.querySelector('meta[name="viewport"]');
const viewportBase = 'width=device-width, initial-scale=1, viewport-fit=cover';
if (/Android/i.test(navigator.userAgent)) {
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
installIosKeyboardScrollLock();

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<MainApp />);
