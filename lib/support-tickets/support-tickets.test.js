import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import test from 'node:test';
import { createSupportTicketStore } from './store.js';
import { createSupportTicketService } from './service.js';
import { createSupportTicketFromMediaIssue, attachTicketIdsToIssues } from './fromIssue.js';
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

test('support ticket comments can be edited and reacted to', async () => {
    const dir = await tmpDir();
    const service = createSupportTicketService({ dataDir: dir });
    const member = { id: 'u1', username: 'jay', thumb: 'https://plex.tv/users/jay.png' };
    const admin = { id: 'admin', username: 'owner', thumb: '/library/metadata/1/thumb' };
    const created = await service.createTicket(member, {
        subject: 'Buffering on 4K',
        category: 'media',
        message: 'Keeps buffering.',
    });
    const edited = await service.editComment(created.id, created.comments[0].id, 'Keeps buffering on Shield.', member);
    assert.equal(edited.comments[0].message, 'Keeps buffering on Shield.');
    assert.ok(edited.comments[0].editedAt);

    await assert.rejects(
        () => service.editComment(created.id, created.comments[0].id, 'Nope', { id: 'u2' }),
        (err) => err.status === 403,
    );

    const reacted = await service.toggleReaction(created.id, created.comments[0].id, '👍', admin);
    assert.equal(reacted.comments[0].reactions[0].emoji, '👍');
    assert.equal(reacted.comments[0].reactions[0].count, 1);
    assert.deepEqual(reacted.comments[0].reactions[0].userIds, ['admin']);

    const unreacted = await service.toggleReaction(created.id, created.comments[0].id, '👍', admin);
    assert.equal(unreacted.comments[0].reactions.length, 0);

    await assert.rejects(
        () => service.toggleReaction(created.id, created.comments[0].id, '🔥', admin),
        (err) => err.status === 400,
    );
});

test('media issue reports create a linked support ticket once', async () => {
    const dir = await tmpDir();
    const actor = { id: 'u1', username: 'jay', thumb: 'https://plex.tv/users/jay.png' };
    const issue = {
        id: 41,
        engine: 'portal',
        title: 'Andor',
        year: '2022',
        type: 'tv',
        issueTypeLabel: 'Video',
        tmdbId: 83867,
        posterUrl: 'https://image.tmdb.org/t/p/w342/poster.jpg',
        problemSeason: 2,
        problemEpisode: 1,
        comments: [{ message: 'Episode pixelates after 12 minutes.' }],
    };
    const first = await createSupportTicketFromMediaIssue({
        config: {},
        dataDir: dir,
        resolveUser: async (id) => (String(id) === 'u1' ? actor : null),
        actor,
        issue,
        message: 'Episode pixelates after 12 minutes.',
    });
    assert.equal(first.category, 'media');
    assert.equal(first.subject, 'Video issue: Andor');
    assert.match(first.comments[0].message, /S2E1/);
    assert.equal(first.linkedMedia.issueId, '41');
    assert.equal(first.linkedMedia.tmdbId, 83867);
    assert.equal(first.createdBy.avatar, actor.thumb);

    const mapped = await attachTicketIdsToIssues({
        config: {},
        dataDir: dir,
        issues: [{ id: 41, title: 'Andor' }],
        engine: 'portal',
    });
    assert.equal(mapped[0].ticketId, first.id);

    const second = await createSupportTicketFromMediaIssue({
        config: {},
        dataDir: dir,
        actor,
        issue,
        message: 'Still broken.',
    });
    assert.equal(second.id, first.id);

    const disabled = await createSupportTicketFromMediaIssue({
        config: { supportTicketsEnabled: false },
        dataDir: dir,
        actor,
        issue,
        message: 'Should not create',
    });
    assert.equal(disabled, null);
});

test('ticket avatars refresh from the live user record', async () => {
    const dir = await tmpDir();
    const stale = { id: 'u1', username: 'jay', thumb: 'https://plex.tv/old.png' };
    const live = { id: 'u1', username: 'jay', thumb: 'https://plex.tv/new.png' };
    const service = createSupportTicketService({
        dataDir: dir,
        resolveUser: async () => live,
    });
    const created = await service.createTicket(stale, {
        subject: 'Avatar check',
        category: 'general',
        message: 'Hello there admin.',
    });
    assert.equal(created.createdBy.avatar, live.thumb);
    assert.equal(created.comments[0].user.avatar, live.thumb);
});

test('support ticket replies can include image attachments', async () => {
    const dir = await tmpDir();
    const service = createSupportTicketService({ dataDir: dir });
    const member = { id: 'u1', username: 'jay' };
    const created = await service.createTicket(member, {
        subject: 'Broken poster',
        category: 'media',
        message: 'Screenshot attached.',
    });
    const { writeSupportAttachment } = await import('./attachments.js');
    const png = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x00,
    ]);
    const uploaded = await writeSupportAttachment(dir, created.id, png, 'shot.png');
    const replied = await service.addComment(created.id, 'Here is the image', member, {
        attachments: [uploaded],
    });
    assert.equal(replied.comments.at(-1).attachments.length, 1);
    assert.equal(replied.comments.at(-1).attachments[0].id, uploaded.id);
    assert.match(replied.comments.at(-1).attachments[0].url, /\/attachments\//);

    const imageOnly = await service.addComment(created.id, '', member, {
        attachments: [uploaded],
    });
    assert.equal(imageOnly.comments.at(-1).message, '');
    assert.equal(imageOnly.comments.at(-1).attachments.length, 1);
});
