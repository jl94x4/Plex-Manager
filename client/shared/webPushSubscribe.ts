import { apiFetch } from './api';
import { portalUrl } from './basePath';

const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
    return output;
};

export const webPushSupported = () => (
    typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
);

export const getWebPushPermission = () => (
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
);

export const isIosDevice = () => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return true;
    // iPadOS 13+ desktop UA
    return navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1;
};

export const isStandalonePwa = () => {
    if (typeof window === 'undefined') return false;
    return !!(
        window.matchMedia?.('(display-mode: standalone)')?.matches
        || window.matchMedia?.('(display-mode: fullscreen)')?.matches
        || (navigator as any).standalone === true
    );
};

/** iOS 16.4+ only delivers Web Push to a Safari Home Screen PWA — not Safari tabs or Chrome iOS. */
export const getIosWebPushBlockReason = (): 'ios-version' | 'ios-not-standalone' | null => {
    if (!isIosDevice()) return null;
    const ua = navigator.userAgent || '';
    const os = ua.match(/OS (\d+)[._](\d+)/);
    const major = os ? Number(os[1]) : 0;
    const minor = os ? Number(os[2]) : 0;
    if (major > 0 && (major < 16 || (major === 16 && minor < 4))) return 'ios-version';
    if (!isStandalonePwa()) return 'ios-not-standalone';
    return null;
};

const waitForActiveWorker = async (registration: ServiceWorkerRegistration) => {
    if (registration.active) return;
    const worker = registration.installing || registration.waiting;
    if (!worker) {
        await navigator.serviceWorker.ready;
        return;
    }
    await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('Service worker did not activate')), 15000);
        worker.addEventListener('statechange', () => {
            if (worker.state === 'activated' || worker.state === 'redundant') {
                window.clearTimeout(timer);
                resolve();
            }
        });
    });
};

export const subscribeWebPush = async () => {
    if (!webPushSupported()) {
        const err = new Error('Web Push is not supported in this browser');
        (err as Error & { code?: string }).code = 'unsupported';
        throw err;
    }
    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        const err = new Error('Web Push requires HTTPS');
        (err as Error & { code?: string }).code = 'insecure';
        throw err;
    }

    const iosBlock = getIosWebPushBlockReason();
    if (iosBlock) {
        const err = new Error(
            iosBlock === 'ios-version'
                ? 'iPhone push needs iOS 16.4 or later'
                : 'On iPhone, add the portal to your Home Screen from Safari, open that app, then enable push',
        );
        (err as Error & { code?: string }).code = iosBlock;
        throw err;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        throw new Error('Notification permission was not granted');
    }

    const { publicKey } = await apiFetch('/api/notifications/push/vapid-public-key');
    if (!publicKey) throw new Error('Push is not configured on this server');

    let registration = await navigator.serviceWorker.getRegistration(portalUrl('/'));
    if (!registration) {
        registration = await navigator.serviceWorker.register(portalUrl('/service-worker.js'), {
            scope: portalUrl('/'),
            updateViaCache: 'none',
        });
    }
    await waitForActiveWorker(registration);
    await navigator.serviceWorker.ready;

    const existing = await registration.pushManager.getSubscription();
    const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(String(publicKey)),
    });

    await apiFetch('/api/notifications/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({ subscription: subscription.toJSON() }),
    });

    return subscription;
};

export const unsubscribeWebPush = async () => {
    if (!webPushSupported()) return false;
    const registration = await navigator.serviceWorker.getRegistration(portalUrl('/'));
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return false;
    const endpoint = subscription.endpoint;
    try {
        await subscription.unsubscribe();
    } catch {
        // still clear server copy
    }
    await apiFetch('/api/notifications/push/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint }),
    });
    return true;
};
