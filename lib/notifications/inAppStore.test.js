import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'inapp-notify-'));
process.env.CONFIG_DIR = path.join(tmpRoot, 'config');
await fs.mkdir(process.env.CONFIG_DIR, { recursive: true });

const {
    createInAppNotification,
    loadNotificationsState,
} = await import('./inAppStore.js');

test('merged notifications accumulate repeatHistory entries', async () => {
    const userId = 'admin-1';
    const first = await createInAppNotification({
        userId,
        type: 'scanner_import',
        title: 'Scanner Notification',
        body: 'Imported: Show A',
        href: '/scanner',
        meta: { posterPath: '/a.jpg' },
    });
    assert.ok(first?.id);

    const second = await createInAppNotification({
        userId,
        type: 'scanner_import',
        title: 'Scanner Notification',
        body: 'Imported: Show B',
        href: '/scanner',
        meta: { posterPath: '/b.jpg' },
    });
    assert.equal(second?.id, first.id);
    assert.equal(second?.meta?.repeatCount, 2);
    assert.equal(second?.meta?.repeatHistory?.length, 2);
    assert.equal(second?.meta?.repeatHistory?.[0]?.body, 'Imported: Show B');
    assert.equal(second?.meta?.repeatHistory?.[1]?.body, 'Imported: Show A');
    assert.equal(second?.body, 'Imported: Show B');

    const state = await loadNotificationsState();
    assert.equal(state.items.filter((item) => item.userId === userId).length, 1);
});

test.after(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
});
