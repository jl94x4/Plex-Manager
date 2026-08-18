/**
 * iOS Safari "reveal" scroll suppressor.
 *
 * When the on-screen keyboard opens, iOS scrolls the page to bring the focused
 * field into view — even when the field is already fully visible above the
 * keyboard (worst on the first keyboard open after load). That shoves the whole
 * layout up. This watches scrolls for a short window after a text field gains
 * focus and undoes them, but only when the field would have remained visible at
 * the original position; fields that really would sit under the keyboard keep
 * the native reveal scroll so the user is never typing blind.
 */

const isIos = () => /iP(ad|hone|od)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

type ScrollTarget = { node: Element | Window; x: number; y: number };
type Saved = { el: HTMLElement; targets: ScrollTarget[]; until: number };

const isTextField = (target: EventTarget | null): target is HTMLElement => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
};

const scrollableAncestors = (el: HTMLElement): Element[] => {
    const out: Element[] = [];
    let node: HTMLElement | null = el.parentElement;
    while (node) {
        // html/body are covered by the window entry — including them here would
        // double-count the same scroll delta.
        if (node !== document.documentElement && node !== document.body
            && node.scrollHeight > node.clientHeight + 1) {
            out.push(node);
        }
        node = node.parentElement;
    }
    return out;
};

export const installIosKeyboardScrollLock = () => {
    if (typeof window === 'undefined' || !isIos()) return;

    let saved: Saved | null = null;

    document.addEventListener('focusin', (event) => {
        if (!isTextField(event.target)) return;
        saved = {
            el: event.target,
            // Covers the keyboard slide-in animation; short enough not to fight
            // deliberate user scrolling while typing.
            until: Date.now() + 900,
            targets: [
                ...scrollableAncestors(event.target).map((node) => ({
                    node,
                    x: node.scrollLeft,
                    y: node.scrollTop,
                })),
                { node: window, x: window.scrollX, y: window.scrollY },
            ],
        };
    }, true);

    document.addEventListener('focusout', () => { saved = null; }, true);

    const maybeRestore = () => {
        if (!saved) return;
        if (Date.now() > saved.until) {
            saved = null;
            return;
        }
        if (document.activeElement !== saved.el) return;

        let deltaY = 0;
        for (const target of saved.targets) {
            const currentY = target.node === window ? window.scrollY : (target.node as Element).scrollTop;
            deltaY += currentY - target.y;
        }
        if (deltaY <= 0) return;

        // Predict where the field would sit if the scroll were undone; only
        // restore when it stays clear of both the top edge and the keyboard.
        const rect = saved.el.getBoundingClientRect();
        const vv = window.visualViewport;
        const keyboardTop = vv ? vv.offsetTop + vv.height : window.innerHeight;
        if (rect.top + deltaY < 8 || rect.bottom + deltaY > keyboardTop - 8) return;

        for (const target of saved.targets) {
            if (target.node === window) {
                window.scrollTo(target.x, target.y);
            } else {
                (target.node as Element).scrollTop = target.y;
                (target.node as Element).scrollLeft = target.x;
            }
        }
    };

    window.addEventListener('scroll', maybeRestore, true);
    window.visualViewport?.addEventListener('resize', maybeRestore);
    window.visualViewport?.addEventListener('scroll', maybeRestore);
};
