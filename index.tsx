import { createRoot } from 'react-dom/client';
import { MainApp } from './client/App';

// iOS Safari auto-zooms focused inputs unless maximum-scale=1 (pinch zoom keeps
// working on iOS regardless, so accessibility is unaffected). This must live in
// the bundle: the CSP is script-src 'self', so inline scripts in index.html are
// silently blocked and never run.
const isIos = /iP(ad|hone|od)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (isIos) {
    document.querySelector('meta[name="viewport"]')?.setAttribute(
        'content',
        'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover',
    );
}

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<MainApp />);
