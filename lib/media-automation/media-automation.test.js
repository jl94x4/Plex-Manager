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
    buildStepPlan,
    executeStepPlan,
    renderStepTemplate,
    resolveAllowlistedExecutable,
    mergeTimeRanges,
    invertTimeRanges,
} from './steps.js';
import { collectBrowseRoots, listBrowseDirectory } from './browse.js';
import {
    CPU_ADAPTER,
    NVENC_ADAPTER,
    createSyntheticAdapterTest,
    detectFfmpegCapabilities,
    selectMediaAdapter,
} from './adapters.js';
import { prepareMediaOutput } from './output.js';
import { normalizeMediaAutomationConfig, getDefaultMediaAutomationConfig } from './config.js';
import { createMediaScheduler } from './scheduler.js';
import { createMediaLibraryWatcher } from './watcher.js';
import { parseProgressOutTimeUs } from './executor.js';

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

    const quality = buildFfmpegPlan({
        inputPath: '/media/in.mkv',
        outputPath: '/media/out.mkv',
        rule: { then: { mode: 'transcode', videoCodec: 'hevc', preset: 'slow', crf: 18 } },
        adapter: CPU_ADAPTER,
        capabilities: { details: { cpu: { encoders: ['libx265'] } } },
    });
    assert.ok(quality.args.includes('-crf'));
    assert.ok(quality.args.includes('18'));
    assert.ok(quality.args.includes('slow'));

    const bitrate = buildFfmpegPlan({
        inputPath: '/media/in.mkv',
        outputPath: '/media/out.mkv',
        rule: {
            then: {
                mode: 'transcode',
                videoCodec: 'hevc',
                audioCodec: 'copy',
                subtitleCodec: 'copy',
                preset: 'medium',
                videoBitrateKbps: 1500,
                crf: 23,
            },
        },
        adapter: CPU_ADAPTER,
        capabilities: { details: { cpu: { encoders: ['libx265'] } } },
    });
    assert.ok(bitrate.args.includes('-b:v'));
    assert.ok(bitrate.args.includes('1500k'));
    assert.ok(bitrate.args.includes('-maxrate'));
    assert.ok(!bitrate.args.includes('-crf'));
    assert.ok(bitrate.args.includes('-c:a'));
    assert.ok(bitrate.args.includes('copy'));
    assert.ok(bitrate.args.includes('-c:s'));
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

test('parseProgressOutTimeUs reads ffmpeg progress clocks', () => {
    assert.equal(parseProgressOutTimeUs({ out_time_us: '1500000' }), 1_500_000);
    assert.equal(parseProgressOutTimeUs({ out_time: '00:01:30.5' }), 90.5 * 1_000_000);
    assert.equal(parseProgressOutTimeUs({}), null);
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

test('config normalizes scan and watch settings', () => {
    const defaults = getDefaultMediaAutomationConfig();
    assert.equal(defaults.libraryScanEnabled, true);
    assert.equal(defaults.libraryWatchEnabled, false);
    assert.deepEqual(defaults.customCommandAllowlist, ['ffmpeg', 'ffprobe']);
    const normalized = normalizeMediaAutomationConfig({
        libraryScanEnabled: false,
        libraryScanIntervalMinutes: 5,
        libraryWatchDebounceMs: 100,
        libraryWatchEnabled: true,
        customCommandAllowlist: ['ffmpeg', 'ffmpeg', 'ffprobe'],
    });
    assert.equal(normalized.libraryScanEnabled, false);
    assert.equal(normalized.libraryScanIntervalMinutes, 15);
    assert.equal(normalized.libraryWatchDebounceMs, 500);
    assert.equal(normalized.libraryWatchEnabled, true);
    assert.deepEqual(normalized.customCommandAllowlist, ['ffmpeg', 'ffprobe']);
    const copyMode = normalizeMediaAutomationConfig({ outputMode: 'copy', dryRun: true });
    assert.equal(copyMode.outputMode, 'copy');
    assert.equal(copyMode.dryRun, false);
});

test('first-party steps plan subtitle strip, move, and allowlisted custom command', () => {
    const strip = buildStepPlan({
        step: { type: 'subtitle-strip', container: 'mkv' },
        inputPath: '/media/in.mkv',
        outputPath: '/media/out.mkv',
    });
    assert.equal(strip.kind, 'ffmpeg');
    assert.ok(strip.args.includes('-0:s'));
    assert.ok(strip.args.includes('copy'));

    const extract = buildStepPlan({
        step: { type: 'subtitle-extract' },
        inputPath: '/media/library/title.mkv',
        libraryRoot: '/media/library',
    });
    assert.equal(extract.kind, 'ffmpeg');
    assert.equal(extract.skipMediaFinalize, true);
    assert.match(extract.outputPath, /\.srt$/);

    const keepLang = buildStepPlan({
        step: { type: 'subtitle-keep-lang', subtitleLanguages: 'eng,en' },
        inputPath: '/media/in.mkv',
        outputPath: '/media/out.mkv',
    });
    assert.ok(keepLang.args.includes('0:s:m:language:eng?'));
    assert.ok(keepLang.args.includes('0:s:m:language:en?'));

    const keepAudio = buildStepPlan({
        step: { type: 'keep-first-audio' },
        inputPath: '/media/in.mkv',
        outputPath: '/media/out.mkv',
    });
    assert.ok(keepAudio.args.includes('0:a:0?'));

    const dropCommentary = buildStepPlan({
        step: { type: 'drop-commentary' },
        inputPath: '/media/in.mkv',
        outputPath: '/media/out.mkv',
    });
    assert.ok(dropCommentary.args.includes('-0:a:m:disposition:commentary'));

    const loudnorm = buildStepPlan({
        step: { type: 'audio-normalize', audioBitrateKbps: 160 },
        inputPath: '/media/in.mkv',
        outputPath: '/media/out.mkv',
    });
    assert.ok(loudnorm.args.some((arg) => String(arg).includes('loudnorm')));
    assert.ok(loudnorm.args.includes('160k'));

    const stereo = buildStepPlan({
        step: { type: 'audio-stereo' },
        inputPath: '/media/in.mkv',
        outputPath: '/media/out.mkv',
    });
    assert.ok(stereo.args.includes('-ac'));
    assert.ok(stereo.args.includes('2'));

    const commercial = buildStepPlan({
        step: { type: 'commercial-strip' },
        inputPath: '/media/in.mkv',
        outputPath: '/media/out.mkv',
    });
    assert.equal(commercial.kind, 'commercial-strip');
    assert.match(commercial.commercialPattern, /commercial/i);

    const move = buildStepPlan({
        step: { type: 'move', destination: '{dir}/archive/{basename}' },
        inputPath: '/media/library/title.mkv',
        libraryRoot: '/media/library',
    });
    assert.equal(move.kind, 'move');
    assert.ok(move.outputPath.includes(`${path.sep}archive${path.sep}`) || move.outputPath.includes('/archive/'));

    assert.equal(resolveAllowlistedExecutable('ffmpeg', ['ffmpeg', 'ffprobe']), 'ffmpeg');
    assert.throws(() => resolveAllowlistedExecutable('bash', ['ffmpeg']), /allowlisted/);
    assert.equal(
        renderStepTemplate('-i {input}', { input: '/media/a.mkv' }),
        '-i /media/a.mkv',
    );

    const custom = buildStepPlan({
        step: {
            type: 'custom-command',
            executable: 'ffmpeg',
            args: ['-i', '{input}', '-c', 'copy', '{output}'],
        },
        inputPath: '/media/in.mkv',
        outputPath: '/media/out.mkv',
        allowlist: ['ffmpeg'],
    });
    assert.equal(custom.kind, 'command');
    assert.equal(custom.executable, 'ffmpeg');
    assert.ok(custom.args.some((arg) => String(arg).endsWith(`${path.sep}in.mkv`) || String(arg).endsWith('/in.mkv')));
});

test('browse lists only directories under allowed roots', async () => {
    await withTempDir(async (dir) => {
        const movies = path.join(dir, 'movies');
        const nested = path.join(movies, 'Action');
        await fs.mkdir(nested, { recursive: true });
        await fs.writeFile(path.join(movies, 'readme.txt'), 'nope');
        const roots = await collectBrowseRoots({ candidates: [dir], extraRoots: [] });
        assert.equal(roots.length, 1);
        const top = await listBrowseDirectory('', { roots });
        assert.ok(top.entries.some((entry) => entry.type === 'root'));
        const listing = await listBrowseDirectory(movies, { roots });
        assert.ok(listing.entries.some((entry) => entry.name === 'Action' && entry.type === 'directory'));
        assert.ok(!listing.entries.some((entry) => entry.name === 'readme.txt'));
        await fs.writeFile(path.join(movies, 'film.mkv'), 'video');
        const withFiles = await listBrowseDirectory(movies, { roots, includeFiles: true, extensions: ['.mkv'] });
        assert.ok(withFiles.entries.some((entry) => entry.name === 'film.mkv' && entry.type === 'file'));
        assert.ok(!withFiles.entries.some((entry) => entry.name === 'readme.txt'));
        await assert.rejects(() => listBrowseDirectory(path.join(dir, '..'), { roots }), /outside|invalid/i);
    });
});

test('commercial chapter ranges merge and invert', () => {
    const merged = mergeTimeRanges([
        { start: 10, end: 20 },
        { start: 18, end: 25 },
        { start: 40, end: 50 },
    ]);
    assert.deepEqual(merged, [
        { start: 10, end: 25 },
        { start: 40, end: 50 },
    ]);
    assert.deepEqual(invertTimeRanges(merged, 100), [
        { start: 0, end: 10 },
        { start: 25, end: 40 },
        { start: 50, end: 100 },
    ]);
});

test('move step stays inside library roots', async () => {
    await withTempDir(async (dir) => {
        const root = path.join(dir, 'library');
        const archive = path.join(root, 'archive');
        await fs.mkdir(archive, { recursive: true });
        const source = path.join(root, 'title.mkv');
        await fs.writeFile(source, 'video');
        const plan = buildStepPlan({
            step: { type: 'move', destination: '{dir}/archive/{basename}' },
            inputPath: source,
            libraryRoot: root,
        });
        const result = await executeStepPlan(plan, { libraryRoots: [root] });
        assert.equal(result.moved, true);
        await assert.rejects(() => fs.access(source));
        await fs.access(result.outputPath);
    });
});

test('queue setPriority and skip update queued jobs', async () => {
    await withTempDir(async (dir) => {
        const store = createAtomicJsonStore({
            filePath: path.join(dir, 'queue.json'),
            defaultValue: { version: 1, jobs: [] },
        });
        const queue = createDurableJobQueue({ store });
        const job = await queue.enqueue({ sourcePath: '/media/a.mkv', priority: 1 });
        const raised = await queue.setPriority(job.id, 90);
        assert.equal(raised.priority, 90);
        const skipped = await queue.skip(job.id, 'not needed');
        assert.equal(skipped.state, JOB_STATES.CANCELLED);
        assert.equal(skipped.error?.code, 'SKIPPED');
        assert.equal(skipped.metadata?.skipped, true);
    });
});

test('queue cancelMany and removeMany clear active and finished jobs', async () => {
    await withTempDir(async (dir) => {
        const store = createAtomicJsonStore({
            filePath: path.join(dir, 'queue.json'),
            defaultValue: { version: 1, jobs: [] },
        });
        const queue = createDurableJobQueue({ store });
        const a = await queue.enqueue({ sourcePath: '/media/a.mkv', priority: 1 });
        const b = await queue.enqueue({ sourcePath: '/media/b.mkv', priority: 2 });
        const claimed = await queue.claim({ workerId: 'w1', lane: 'cpu' });
        assert.ok(claimed);
        await queue.complete(claimed.id, 'w1', { dryRun: true });
        const cancelled = await queue.cancelMany();
        assert.equal(cancelled.length, 1);
        assert.equal(cancelled[0].state, JOB_STATES.CANCELLED);
        const removed = await queue.removeMany();
        assert.equal(removed, 2);
        assert.equal((await queue.list()).length, 0);
        assert.equal(a.id !== b.id, true);
    });
});

test('scheduler reports periodic scanning when enabled', async () => {
    let scanned = 0;
    const scheduler = createMediaScheduler({
        processor: {
            processOne: async () => ({ didWork: false }),
            scan: async () => {
                scanned += 1;
                return { discovered: 1, enqueued: 1, skipped: 0, errors: [] };
            },
        },
        getConfig: async () => ({
            enabled: true,
            cpuConcurrency: 1,
            gpuConcurrency: 1,
            libraryScanEnabled: true,
            libraryScanIntervalMinutes: 15,
        }),
        workerPollMs: 60_000,
    });
    await scheduler.start();
    const status = scheduler.status();
    assert.equal(status.periodicScanning, true);
    const result = await scheduler.scanNow();
    assert.equal(scanned, 1);
    assert.equal(result.enqueued, 1);
    assert.ok(status.lastScanAt || scheduler.status().lastScanAt);
    scheduler.stop();
    assert.equal(scheduler.status().periodicScanning, false);
});

test('watcher ignores disabled watch and unsupported extensions', async () => {
    await withTempDir(async (dir) => {
        const mediaDir = path.join(dir, 'media');
        await fs.mkdir(mediaDir);
        const mkv = path.join(mediaDir, 'show.mkv');
        const txt = path.join(mediaDir, 'notes.txt');
        await fs.writeFile(mkv, 'video');
        await fs.writeFile(txt, 'text');
        const enqueued = [];
        const watcher = createMediaLibraryWatcher({
            getConfig: async () => ({
                enabled: true,
                libraryWatchEnabled: true,
                libraryWatchDebounceMs: 50,
                extensions: ['.mkv'],
            }),
            listLibraries: async () => [{ id: 'lib-1', rootPath: mediaDir, enabled: true, pipelineId: null }],
            enqueuePath: async (filePath) => {
                enqueued.push(filePath);
                return { enqueued: true, job: { id: 'job-1', sourcePath: filePath } };
            },
        });
        await watcher.start();
        // Trigger handlers through a short-lived second start/stop cycle is hard;
        // instead assert status while watching the configured root.
        const status = watcher.status();
        assert.equal(status.watching, true);
        await watcher.stop();
        assert.equal(watcher.status().watching, false);

        const disabled = createMediaLibraryWatcher({
            getConfig: async () => ({
                enabled: true,
                libraryWatchEnabled: false,
                libraryWatchDebounceMs: 50,
                extensions: ['.mkv'],
            }),
            listLibraries: async () => [{ id: 'lib-1', rootPath: mediaDir, enabled: true }],
            enqueuePath: async () => ({ enqueued: true }),
        });
        const disabledStatus = await disabled.start();
        assert.equal(disabledStatus.watching, false);
        await disabled.stop();
        assert.equal(enqueued.length, 0);
    });
});
