/**
 * iOS Safari "reveal" scroll suppressor.
 *
 * iOS scrolls the page to reveal a focused field even when it is already
 * visible. Restoring after that scroll paints a one-frame flicker. Freeze
 * document overflow and focus with preventScroll on the opening tap so the
 * jump never happens. Fields that would sit under the keyboard are left
 * alone so the native reveal still works.
 */

const isIos = () => /iP(ad|hone|od)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

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

const fieldStaysAboveKeyboard = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    // iPhone keyboards cover roughly the bottom 40–45%. Leave a little headroom.
    return rect.top >= 0 && rect.bottom <= window.innerHeight * 0.55;
};

type Pin = {
    htmlOverflow: string;
    bodyOverflow: string;
    htmlOverscroll: string;
    raf: number;
    until: number;
    x: number;
    y: number;
};

export const installIosKeyboardScrollLock = () => {
    if (typeof window === 'undefined' || !isIos()) return;

    let pin: Pin | null = null;
    const html = document.documentElement;
    const body = document.body;

    const holdScroll = () => {
        if (!pin) return;
        window.scrollTo(pin.x, pin.y);
        html.scrollTop = pin.y;
        body.scrollTop = pin.y;
    };

    const stopPin = () => {
        if (!pin) return;
        cancelAnimationFrame(pin.raf);
        html.style.overflow = pin.htmlOverflow;
        body.style.overflow = pin.bodyOverflow;
        html.style.overscrollBehavior = pin.htmlOverscroll;
        pin = null;
    };

    const startPin = () => {
        if (pin) {
            pin.until = Date.now() + 450;
            return;
        }
        pin = {
            htmlOverflow: html.style.overflow,
            bodyOverflow: body.style.overflow,
            htmlOverscroll: html.style.overscrollBehavior,
            raf: 0,
            until: Date.now() + 450,
            x: window.scrollX,
            y: window.scrollY,
        };
        // overflow:hidden stops iOS from scrolling the layout viewport at all,
        // so the reveal jump never paints. 450ms covers the keyboard animation.
        html.style.overflow = 'hidden';
        body.style.overflow = 'hidden';
        html.style.overscrollBehavior = 'none';
        holdScroll();
        const tick = () => {
            if (!pin) return;
            if (Date.now() > pin.until) {
                stopPin();
                return;
            }
            holdScroll();
            pin.raf = requestAnimationFrame(tick);
        };
        pin.raf = requestAnimationFrame(tick);
    };

    // Capture the tap *before* iOS focuses+scrolls. preventDefault +
    // focus({ preventScroll: true }) is what actually removes the flicker;
    // overflow freeze is the belt-and-braces for the keyboard slide-in.
    document.addEventListener('touchend', (event) => {
        const el = event.target;
        if (!isTextField(el)) return;
        if (el.tagName === 'SELECT') return;
        if (!fieldStaysAboveKeyboard(el)) return;
        if (document.activeElement === el) return;
        event.preventDefault();
        el.focus({ preventScroll: true });
        startPin();
    }, { capture: true, passive: false });

    document.addEventListener('focusin', (event) => {
        if (!isTextField(event.target)) return;
        if (!fieldStaysAboveKeyboard(event.target)) return;
        startPin();
    }, true);
};
