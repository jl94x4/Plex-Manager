import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import test from 'node:test';
import {
    JOB_PHASES,
    JOB_STATES,
    buildJobDedupeKey,
    canTransitionJob,
    createMediaJob,
    fingerprintSourceFile,
    transitionJob,
} from './models.js';
import { createAtomicJsonStore } from './store.js';
import { createDurableJobQueue } from './queue.js';
import { buildRuleContext, findMatchingRule, matchMediaRule } from './rules.js';
import { isPathContained, resolveContainedPath } from './files.js';
import { buildFfmpegPlan } from './ffmpeg-plan.js';
import {
    CPU_ADAPTER,
    NVENC_ADAPTER,
    createSyntheticAdapterTest,
    detectFfmpegCapabilities,
    selectMediaAdapter,
} from './adapters.js';
import { prepareMediaOutput } from './output.js';

const withTempDir = async (fn) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-automation-'));
    try {
        return await fn(dir);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
};

test('job state machine allows expected transitions only', () => {
    assert.equal(canTransitionJob(JOB_STATES.QUEUED, JOB_STATES.RUNNING), true);
    assert.equal(canTransitionJob(JOB_STATES.RUNNING, JOB_STATES.SUCCEEDED), true);
    assert.equal(canTransitionJob(JOB_STATES.RUNNING, JOB_PHASES.COMMITTING), false);
    assert.equal(canTransitionJob(JOB_STATES.SUCCEEDED, JOB_STATES.QUEUED), false);
    const job = createMediaJob({ sourcePath: '/media/a.mkv' });
    const running = transitionJob(job, JOB_STATES.RUNNING, { phase: JOB_PHASES.PROBING });
    assert.equal(running.state, JOB_STATES.RUNNING);
    assert.equal(running.phase, JOB_PHASES.PROBING);
});

test('dedupe key includes fingerprint and pipeline', () => {
    assert.equal(
        buildJobDedupeKey({ sourcePath: '/media/a.mkv', fingerprint: '10:20:30', pipelineId: 'p1' }),
        '/media/a.mkv::10:20:30::p1',
    );
});

test('fingerprintSourceFile uses size and mtime', async () => {
    await withTempDir(async (dir) => {
        const filePath = path.join(dir, 'clip.mkv');
        await fs.writeFile(filePath, 'abcdef');
        const fingerprint = await fingerprintSourceFile(filePath);
        assert.match(fingerprint, /^\d+:\d+:/);
    });
});

test('queue dedupes by fingerprint and recovers expired leases', async () => {
    await withTempDir(async (dir) => {
        let now = Date.parse('2026-01-01T00:00:00.000Z');
        const store = createAtomicJsonStore({
            filePath: path.join(dir, 'queue.json'),
            defaultValue: { version: 1, jobs: [] },
        });
        const queue = createDurableJobQueue({ store, clock: () => now });
        const first = await queue.enqueue({
            sourcePath: '/media/a.mkv',
            fingerprint: '1:2:3',
            pipelineId: 'pipe-1',
            dedupeKey: buildJobDedupeKey({
                sourcePath: '/media/a.mkv',
                fingerprint: '1:2:3',
                pipelineId: 'pipe-1',
            }),
        });
        const duplicate = await queue.enqueue({
            sourcePath: '/media/a.mkv',
            fingerprint: '1:2:3',
            pipelineId: 'pipe-1',
            dedupeKey: buildJobDedupeKey({
                sourcePath: '/media/a.mkv',
                fingerprint: '1:2:3',
                pipelineId: 'pipe-1',
            }),
        });
        assert.equal(duplicate.id, first.id);

        const claimed = await queue.claim({ workerId: 'worker-a', leaseMs: 1000 });
        assert.equal(claimed.id, first.id);
        now += 5000;
        const recovered = await queue.recoverExpired();
        assert.equal(recovered.length, 1);
        assert.equal(recovered[0].state, JOB_STATES.QUEUED);
        assert.equal(recovered[0].phase, JOB_PHASES.QUEUED);
    });
});

test('rules match structured condition groups', () => {
    const context = buildRuleContext({
        filePath: '/media/movies/film.mkv',
        libraryRoot: '/media/movies',
        probe: {
            format: { format_name: 'matroska,webm', bit_rate: '8000000' },
            streams: [
                { codec_type: 'video', codec_name: 'h264', width: 1920, color_transfer: 'bt709' },
                { codec_type: 'audio', codec_name: 'aac' },
            ],
        },
    });
    assert.equal(matchMediaRule({
        enabled: true,
        conditionGroup: {
            operator: 'AND',
            conditions: [
                { field: 'videoCodec', operator: 'equals', value: 'h264' },
                { field: 'width', operator: 'greaterThan', value: '1280' },
            ],
        },
    }, context), true);
    assert.equal(findMatchingRule([{
        id: 'hevc-only',
        priority: 10,
        conditionGroup: {
            operator: 'AND',
            conditions: [{ field: 'videoCodec', operator: 'equals', value: 'hevc' }],
        },
    }, {
        id: 'h264',
        priority: 1,
        conditionGroup: {
            operator: 'AND',
            conditions: [{ field: 'videoCodec', operator: 'equals', value: 'h264' }],
        },
    }], context)?.id, 'h264');
});

test('path containment rejects escapes and symlinks', async () => {
    await withTempDir(async (dir) => {
        const root = path.join(dir, 'library');
        const outside = path.join(dir, 'outside.mkv');
        const inside = path.join(root, 'inside.mkv');
        const link = path.join(root, 'linked.mkv');
        await fs.mkdir(root, { recursive: true });
        await fs.writeFile(outside, 'x');
        await fs.writeFile(inside, 'y');
        assert.equal(isPathContained(root, inside), true);
        assert.equal(isPathContained(root, outside), false);
        await assert.rejects(() => resolveContainedPath(root, '../outside.mkv'), /escapes/);
        assert.equal(await resolveContainedPath(root, inside), path.resolve(inside));
        try {
            await fs.symlink(outside, link);
        } catch (error) {
            // Windows often blocks symlink creation without Developer Mode / elevation.
            if (error?.code === 'EPERM' || error?.code === 'EACCES') return;
            throw error;
        }
        await assert.rejects(() => resolveContainedPath(root, link, { allowSymlinks: false }), /Symbolic links/);
        const allowed = await resolveContainedPath(root, link, { allowSymlinks: true });
        assert.equal(path.resolve(allowed), path.resolve(outside));
    });
});

test('ffmpeg plan builds remux and transcode args without shell fragments', () => {
    const remux = buildFfmpegPlan({
        inputPath: '/media/in.mkv',
        outputPath: '/media/out.mkv',
        rule: { then: { mode: 'remux' } },
    });
    assert.equal(remux.mode, 'remux');
    assert.ok(remux.args.includes('-c'));
    assert.ok(remux.args.includes('copy'));
    assert.ok(!remux.args.some((arg) => String(arg).includes(';')));

    const transcode = buildFfmpegPlan({
        inputPath: '/media/in.mkv',
        outputPath: '/media/out.mkv',
        rule: { then: { mode: 'transcode', videoCodec: 'h264', audioCodec: 'aac', subtitleCodec: 'drop', maxWidth: 1280 } },
        adapter: CPU_ADAPTER,
        capabilities: { details: { cpu: { encoders: ['libx264'] } } },
    });
    assert.equal(transcode.adapter, 'cpu');
    assert.ok(transcode.args.includes('libx264'));
    assert.ok(transcode.args.includes('-sn'));
    assert.ok(transcode.args.includes('-vf'));
});

test('hardware adapters select auto preference and run synthetic tests through fake ffmpeg', async () => {
    const capabilities = await detectFfmpegCapabilities({
        syntheticOutput: ' V..... h264_nvenc\n V..... libx264\n V..... h264_qsv\n V..... h264_vaapi\n',
        testAdapter: createSyntheticAdapterTest({ nvenc: true, qsv: false, vaapi: true, 'intel-vaapi': true }),
        runSyntheticTests: true,
    });
    assert.equal(capabilities.cpu, true);
    assert.equal(capabilities.nvenc, true);
    assert.equal(capabilities.qsv, false);
    assert.equal(selectMediaAdapter('auto', capabilities, 'h264').name, 'nvenc');
    assert.equal(selectMediaAdapter('cpu', capabilities, 'h264').name, 'cpu');
    assert.throws(() => selectMediaAdapter('qsv', capabilities, 'h264'), /unavailable/);
    assert.equal(NVENC_ADAPTER.encoders.h264, 'h264_nvenc');
});

test('prepareMediaOutput supports dry-run copy and replace targets', () => {
    const dry = prepareMediaOutput({ sourcePath: '/media/a.mkv', mode: 'dry-run' });
    assert.equal(dry.mode, 'dry-run');
    const copy = prepareMediaOutput({ sourcePath: '/media/a.mkv', mode: 'copy', extension: '.mkv' });
    assert.equal(copy.mode, 'copy');
    assert.match(copy.finalPath, /\.automated\.mkv$/);
    const replace = prepareMediaOutput({ sourcePath: '/media/a.mkv', mode: 'replace', extension: '.mkv' });
    assert.equal(replace.finalPath, path.resolve('/media/a.mkv'));
    assert.notEqual(replace.workPath, replace.finalPath);
});
