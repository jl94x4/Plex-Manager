import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
    normalizeSeerrRequestId,
    syncSeerrPendingRequestNotifications,
} from './seerrPendingPoll.js';

const withTempConfigDir = async (fn) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'seerr-pending-'));
    const previous = process.env.CONFIG_DIR;
    process.env.CONFIG_DIR = dir;
    try {
        await fn(dir);
    } finally {
        if (previous === undefined) delete process.env.CONFIG_DIR;
        else process.env.CONFIG_DIR = previous;
        await fs.rm(dir, { recursive: true, force: true });
    }
};

test('normalizeSeerrRequestId strips seerr prefix', () => {
    assert.equal(normalizeSeerrRequestId('seerr:42'), '42');
    assert.equal(normalizeSeerrRequestId('42'), '42');
});

test('syncSeerrPendingRequestNotifications bootstraps without notifying', async () => {
    await withTempConfigDir(async () => {
        const notified = [];
        const summary = await syncSeerrPendingRequestNotifications({
            config: {},
            listRequests: async () => ({
                results: [{ id: 7, status: 1, title: 'Dune', type: 'movie', tmdbId: 438631 }],
            }),
            loadUsers: async () => [],
            notifyAdminPending: async (opts) => {
                notified.push(opts.record.id);
                return true;
            },
        });
        assert.equal(summary.bootstrapped, true);
        assert.equal(summary.seeded, 1);
        assert.equal(summary.notified, 0);
        assert.equal(notified.length, 0);

        const second = await syncSeerrPendingRequestNotifications({
            config: {},
            listRequests: async () => ({
                results: [{ id: 7, status: 1, title: 'Dune', type: 'movie', tmdbId: 438631 }],
            }),
            loadUsers: async () => [],
            notifyAdminPending: async (opts) => {
                notified.push(opts.record.id);
                return true;
            },
        });
        assert.equal(second.notified, 0);
        assert.equal(notified.length, 0);
    });
});

test('syncSeerrPendingRequestNotifications notifies new pending requests after bootstrap', async () => {
    await withTempConfigDir(async () => {
        const notified = [];
        let pending = [{ id: 1, status: 1, title: 'Old', type: 'movie', tmdbId: 1 }];

        await syncSeerrPendingRequestNotifications({
            config: {},
            listRequests: async () => ({ results: pending }),
            loadUsers: async () => [],
            notifyAdminPending: async () => true,
        });

        pending = [
            { id: 1, status: 1, title: 'Old', type: 'movie', tmdbId: 1 },
            { id: 2, status: 1, title: 'New', type: 'tv', tmdbId: 2 },
        ];

        const summary = await syncSeerrPendingRequestNotifications({
            config: {},
            listRequests: async () => ({ results: pending }),
            loadUsers: async () => [{ id: 'admin', isAdmin: true }],
            notifyAdminPending: async (opts) => {
                notified.push(opts.record);
                return true;
            },
        });

        assert.equal(summary.notified, 1);
        assert.equal(notified.length, 1);
        assert.equal(notified[0].id, 'seerr:2');
        assert.equal(notified[0].title, 'New');
    });
});
