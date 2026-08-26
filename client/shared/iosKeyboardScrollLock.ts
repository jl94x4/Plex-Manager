/**
 * iOS Safari "reveal" scroll suppressor.
 *
 * Do NOT preventDefault the opening tap on already-visible fields.
 * That path made Analytics "Find user" (always in the top 55%) zoom, while
 * Users dashboard search (further down) used native focus and stayed put.
 * 16px fields + maximum-scale=1 on iPhone are enough to stop auto-zoom.
 */

const isIos = () => /iP(ad|hone|od)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Match index.html; maximum-scale=1 is appended only on iOS (West Wind). */
const VIEWPORT_BASE = 'width=device-width, initial-scale=1, viewport-fit=cover';
const VIEWPORT_NO_AUTOZOOM = `${VIEWPORT_BASE}, maximum-scale=1`;

/**
 * iOS Safari auto-zooms focused fields under 16px, and often keeps that zoom
 * after the keyboard closes. Setting maximum-scale=1 from bundled JS at load
 * is ignored until a user gesture. Lock it on the opening touch/pointer so
 * Safari re-evaluates before focus. Android is left alone so pinch-zoom stays.
 * https://weblog.west-wind.com/posts/2023/Apr/17/Preventing-iOS-Textbox-Auto-Zooming-and-ViewPort-Sizing
 */
export const installIosTextZoomGuard = () => {
    if (typeof window === 'undefined' || !isIos()) return;
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;

    const lock = () => {
        meta.setAttribute('content', VIEWPORT_NO_AUTOZOOM);
    };

    const snapIfZoomed = () => {
        const scale = window.visualViewport?.scale ?? 1;
        if (scale <= 1.01) return;
        lock();
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
