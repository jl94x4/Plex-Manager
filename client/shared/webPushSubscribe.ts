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

export const subscribeWebPush = async () => {
    if (!webPushSupported()) {
        throw new Error('Web Push is not supported in this browser');
    }
    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        throw new Error('Web Push requires HTTPS');
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
