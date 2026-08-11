import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Mirror of client/shared/notificationDestination.ts for backend-free unit coverage.
 * Keep behavior aligned when changing either file.
 */
const REQUEST_TYPES = new Set([
    'request_available',
    'request_approved',
    'request_declined',
    'request_season_available',
    'request_new_episode',
]);

const parseReviewId = (href = '', meta = {}) => {
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

const resolveNotificationDestination = (item = {}) => {
    const type = String(item?.type || '').trim();
    const href = String(item?.href || '').trim();
    const meta = item?.meta && typeof item.meta === 'object' ? item.meta : null;

    if (href.startsWith('/discovery')) {
        return {
            kind: 'discovery',
            path: href,
            labelKey: href.includes('/requests') ? 'notifications.openMyRequests' : 'notifications.openInDiscover',
        };
    }
    if (href.startsWith('/requests')) {
        return { kind: 'requests', reviewId: parseReviewId(href, meta), labelKey: 'notifications.openRequestQueue' };
    }
    if (href === '/portal' || href === '/') {
        return { kind: 'home', labelKey: 'notifications.openHome' };
    }
    if (href.startsWith('/settings')) {
        return { kind: 'settings', labelKey: 'notifications.openSettings' };
    }
    if (href && href.startsWith('/') && !href.startsWith('//')) {
        return { kind: 'external', href, labelKey: 'notifications.openLink' };
    }
    if (type === 'admin_pending') {
        return { kind: 'requests', reviewId: parseReviewId('', meta), labelKey: 'notifications.openRequestQueue' };
    }
    if (type === 'admin_test') {
        return { kind: 'home', labelKey: 'notifications.openHome' };
    }
    if (type === 'request_declined' || REQUEST_TYPES.has(type)) {
        return { kind: 'discovery', path: '/discovery/requests', labelKey: 'notifications.openMyRequests' };
    }
    return { kind: 'discovery', path: '/discovery/requests', labelKey: 'notifications.openMyRequests' };
};

test('media detail href stays on Discover title page', () => {
    const dest = resolveNotificationDestination({
        type: 'request_available',
        href: '/discovery/movie/123',
    });
    assert.equal(dest.kind, 'discovery');
    assert.equal(dest.path, '/discovery/movie/123');
});

test('admin pending href opens requests review', () => {
    const dest = resolveNotificationDestination({
        type: 'admin_pending',
        href: '/requests?review=42',
    });
    assert.equal(dest.kind, 'requests');
    assert.equal(dest.reviewId, 42);
});

test('admin pending falls back to meta.requestId', () => {
    const dest = resolveNotificationDestination({
        type: 'admin_pending',
        href: '',
        meta: { requestId: 9 },
    });
    assert.equal(dest.kind, 'requests');
    assert.equal(dest.reviewId, 9);
});

test('declined without href opens my requests', () => {
    const dest = resolveNotificationDestination({ type: 'request_declined' });
    assert.equal(dest.kind, 'discovery');
    assert.equal(dest.path, '/discovery/requests');
});

test('admin test opens home', () => {
    const dest = resolveNotificationDestination({ type: 'admin_test', href: '/portal' });
    assert.equal(dest.kind, 'home');
});
