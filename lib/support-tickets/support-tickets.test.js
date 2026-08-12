import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import test from 'node:test';
import { createSupportTicketStore } from './store.js';
import { createSupportTicketService } from './service.js';
import { SUPPORT_TICKET_STATUS } from './constants.js';

const tmpDir = async () => fs.mkdtemp(path.join(os.tmpdir(), 'smp-support-'));

test('support ticket store creates and lists by user', async () => {
    const dir = await tmpDir();
    const store = createSupportTicketStore({ dataDir: dir });
    const a = await store.create({ userId: 'u1', subject: 'Cannot stream', category: 'media' });
    await store.create({ userId: 'u2', subject: 'Other person', category: 'account' });
    const mine = await store.list({ userId: 'u1' });
    assert.equal(mine.length, 1);
    assert.equal(mine[0].id, a.id);
    assert.equal(mine[0].unreadForAdmin, true);
});

test('support ticket service conversation and unread flags', async () => {
    const dir = await tmpDir();
    const service = createSupportTicketService({ dataDir: dir });
    const member = { id: 'u1', username: 'jay' };
    const admin = { id: 'admin', username: 'owner' };
    const created = await service.createTicket(member, {
        subject: 'Login issue',
        category: 'account',
        message: 'I cannot sign in on my phone.',
    });
    assert.equal(created.status, SUPPORT_TICKET_STATUS.OPEN);
    assert.equal(created.unreadForAdmin, true);

    const replied = await service.addComment(created.id, 'Try signing out first.', admin, { isAdmin: true });
    assert.equal(replied.unreadForUser, true);
    assert.equal(replied.unreadForAdmin, false);
    assert.equal(replied.commentCount, 2);

    const counts = await service.getCounts({ isAdmin: true });
    assert.equal(counts.open, 1);
    assert.equal(counts.unread, 0);

    const userCounts = await service.getCounts({ userId: 'u1', isAdmin: false });
    assert.equal(userCounts.unread, 1);

    const resolved = await service.updateStatus(created.id, 'resolved');
    assert.equal(resolved.statusLabel, 'resolved');

    await assert.rejects(
        () => service.assertCanAccess({ id: 'u2' }, created.id, { isAdmin: false }),
        (err) => err.status === 403,
    );
});
