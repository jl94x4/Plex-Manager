import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import test from 'node:test';
import { getCollexionsDataDir, readCollexionsRunHints } from './collexions-embedded.js';

test('readCollexionsRunHints uses pinning_interval and in-progress status', async () => {
    const configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'colx-hints-'));
    const dataDir = getCollexionsDataDir(configDir);
    await fs.mkdir(path.join(dataDir, 'config'), { recursive: true });
    await fs.mkdir(path.join(dataDir, 'data'), { recursive: true });
    await fs.writeFile(
        path.join(dataDir, 'config', 'config.json'),
        JSON.stringify({ pinning_interval: 90 }),
        'utf8',
    );
    await fs.writeFile(
        path.join(dataDir, 'data', 'status.json'),
        JSON.stringify({
            status: 'Processing: Movies',
            last_run_at: '2026-08-29T10:00:00.000Z',
            last_run_started_at: '2026-08-29T09:00:00.000Z',
            next_run_timestamp: 1756468800,
        }),
        'utf8',
    );
    try {
        const hints = await readCollexionsRunHints(configDir);
        assert.equal(hints.intervalMs, 90 * 60 * 1000);
        assert.equal(hints.interrupted, true);
        assert.equal(hints.lastCompletedAt, '2026-08-29T10:00:00.000Z');
        assert.equal(hints.nextRunTs, 1756468800);
    } finally {
        await fs.rm(configDir, { recursive: true, force: true });
    }
});

test('readCollexionsRunHints treats Sleeping as not interrupted', async () => {
    const configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'colx-sleep-'));
    const dataDir = getCollexionsDataDir(configDir);
    await fs.mkdir(path.join(dataDir, 'data'), { recursive: true });
    await fs.writeFile(
        path.join(dataDir, 'data', 'status.json'),
        JSON.stringify({ status: 'Sleeping (30 min)', last_run_at: '2026-08-29T11:00:00.000Z' }),
        'utf8',
    );
    try {
        const hints = await readCollexionsRunHints(configDir);
        assert.equal(hints.interrupted, false);
        assert.equal(hints.intervalMs, 180 * 60 * 1000);
    } finally {
        await fs.rm(configDir, { recursive: true, force: true });
    }
});
