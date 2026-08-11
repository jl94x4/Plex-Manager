/**
 * Resolve where an in-app notification should navigate when clicked.
 * Prefer an explicit href; fall back intelligently by notification type.
 */

export type NotificationDestination =
    | { kind: 'discovery'; path: string; labelKey: string }
    | { kind: 'requests'; reviewId?: number; labelKey: string }
    | { kind: 'home'; labelKey: string }
    | { kind: 'settings'; labelKey: string }
    | { kind: 'external'; href: string; labelKey: string };

export type NotificationLike = {
    type?: string | null;
    href?: string | null;
    meta?: {
        requestId?: string | number | null;
        mediaType?: string | null;
        tmdbId?: string | number | null;
        [key: string]: unknown;
    } | null;
};

const REQUEST_TYPES = new Set([
    'request_available',
    'request_approved',
    'request_declined',
    'request_season_available',
    'request_new_episode',
]);

const parseReviewId = (href: string, meta?: NotificationLike['meta']): number | undefined => {
    try {
        const url = new URL(href, 'http://local.invalid');
        const fromQuery = Number(url.searchParams.get('review'));
        if (Number.isFinite(fromQuery) && fromQuery > 0) return fromQuery;
    } catch {
        // ignore
    }
    const fromMeta = Number(meta?.requestId);
    if (Number.isFinite(fromMeta) && fromMeta > 0) return fromMeta;
    return undefined;
};

const isInternalPath = (href: string) => href.startsWith('/');

export const resolveNotificationDestination = (item: NotificationLike): NotificationDestination => {
    const type = String(item?.type || '').trim();
    const href = String(item?.href || '').trim();
    const meta = item?.meta && typeof item.meta === 'object' ? item.meta : null;

    if (href.startsWith('/discovery')) {
        return {
            kind: 'discovery',
            path: href,
            labelKey: href.includes('/requests')
                ? 'notifications.openMyRequests'
                : 'notifications.openInDiscover',
        };
    }

    if (href.startsWith('/requests')) {
        return {
            kind: 'requests',
            reviewId: parseReviewId(href, meta),
            labelKey: 'notifications.openRequestQueue',
        };
    }

    if (href === '/portal' || href === '/') {
        return { kind: 'home', labelKey: 'notifications.openHome' };
    }

    if (href.startsWith('/settings')) {
        return { kind: 'settings', labelKey: 'notifications.openSettings' };
    }

    if (href && isInternalPath(href) && !href.startsWith('//')) {
        // Unknown internal path — keep as SPA-agnostic absolute navigation.
        return { kind: 'external', href, labelKey: 'notifications.openLink' };
    }

    if (type === 'admin_pending') {
        return {
            kind: 'requests',
            reviewId: parseReviewId('', meta),
            labelKey: 'notifications.openRequestQueue',
        };
    }

    if (type === 'admin_test') {
        return { kind: 'home', labelKey: 'notifications.openHome' };
    }

    if (type === 'request_declined') {
        return { kind: 'discovery', path: '/discovery/requests', labelKey: 'notifications.openMyRequests' };
    }

    if (REQUEST_TYPES.has(type)) {
        return { kind: 'discovery', path: '/discovery/requests', labelKey: 'notifications.openMyRequests' };
    }

    return { kind: 'discovery', path: '/discovery/requests', labelKey: 'notifications.openMyRequests' };
};

export default resolveNotificationDestination;
