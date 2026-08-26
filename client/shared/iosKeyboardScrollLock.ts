/**
 * iOS Safari "reveal" scroll suppressor.
 *
 * Do NOT preventDefault the opening tap on already-visible fields.
 * That path made Analytics "Find user" (always in the top 55%) zoom, while
 * Users dashboard search (further down) used native focus and stayed put.
 *
 * Safari only honors maximum-scale=1 when it is in the HTML at parse time
 * (index.html). JS here keeps iPad desktop-mode locked and snaps leftover zoom.
 */

export const isIosClient = () => /iP(ad|hone|od)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Match index.html / lockViewportForAppleClients. */
export const VIEWPORT_BASE = 'width=device-width, initial-scale=1, viewport-fit=cover';
export const VIEWPORT_NO_AUTOZOOM = 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover';

/**
 * iOS Safari auto-zooms focused fields under 16px, and often keeps that zoom
 * after the keyboard closes. Parse-time maximum-scale=1 in index.html is the
 * real lock; this re-applies it on gesture for iPad "desktop website" mode.
 * Android / desktop strip the lock in index.tsx so pinch-zoom stays.
 * https://weblog.west-wind.com/posts/2023/Apr/17/Preventing-iOS-Textbox-Auto-Zooming-and-ViewPort-Sizing
 */
export const installIosTextZoomGuard = () => {
    if (typeof window === 'undefined' || !isIosClient()) return;
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;

    const lock = () => {
        if (meta.getAttribute('content') === VIEWPORT_NO_AUTOZOOM) return;
        meta.setAttribute('content', VIEWPORT_NO_AUTOZOOM);
    };

    const snapIfZoomed = () => {
        const scale = window.visualViewport?.scale ?? 1;
        if (scale <= 1.01) return;
        // Force Safari to re-read a changed content string, then re-lock.
        meta.setAttribute('content', `${VIEWPORT_BASE}, maximum-scale=1.01`);
        meta.setAttribute('content', VIEWPORT_NO_AUTOZOOM);
    };

    lock();
    document.addEventListener('touchstart', lock, { capture: true, passive: true });
    document.addEventListener('pointerover', (event) => {
        if (isTextField(event.target)) lock();
    }, true);
    document.addEventListener('focusin', (event) => {
        if (isTextField(event.target)) lock();
    }, true);
    document.addEventListener('focusout', () => {
        requestAnimationFrame(snapIfZoomed);
    }, true);
    window.visualViewport?.addEventListener('resize', snapIfZoomed);
};

const NON_TEXT_INPUT_TYPES = new Set([
    'button', 'submit', 'reset', 'checkbox', 'radio', 'range',
    'file', 'color', 'hidden', 'image',
]);

const isTextField = (target: EventTarget | null): target is HTMLElement => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === 'TEXTAREA' || target.isContentEditable) return true;
    if (tag !== 'INPUT') return false;
    return !NON_TEXT_INPUT_TYPES.has((target as HTMLInputElement).type || 'text');
};

/** Kept so index.tsx can call it; intercepting taps caused analytics zoom. */
export const installIosKeyboardScrollLock = () => {
    // no-op — see file comment
};
