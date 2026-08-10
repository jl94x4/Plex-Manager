/** Fired when in-app notification state may have changed (send test, mark read, etc.). */
export const IN_APP_NOTIFICATIONS_CHANGED_EVENT = 'portal-in-app-notifications-changed';

export const notifyInAppNotificationsChanged = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(IN_APP_NOTIFICATIONS_CHANGED_EVENT));
};
