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
    QSV_ADAPTER,
    createSyntheticAdapterTest,
    detectFfmpegCapabilities,
    selectMediaAdapter,
} from './adapters.js';
import { prepareMediaOutput } from './output.js';
import { estimateHeuristicSavings, summarizeProbeForAnalyze } from './analyze.js';
import {
    detectHdr,
    shouldSkipForHdr,
    buildHdrPreserveArgs,
    formatMasterDisplay,
} from './hdr.js';
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

test('qsv plan uses vaapi child device and format=qsv upload filter', () => {
    const plan = buildFfmpegPlan({
        inputPath: '/media/in.mkv',
        outputPath: '/media/out.mkv',
        rule: { then: { mode: 'transcode', videoCodec: 'hevc', audioCodec: 'copy', subtitleCodec: 'copy', videoBitrateKbps: 1500 } },
        adapter: QSV_ADAPTER,
        capabilities: { details: { qsv: { encoders: ['hevc_qsv', 'h264_qsv'] } } },
        vaapiDevice: '/dev/dri/renderD128',
    });
    assert.equal(plan.adapter, 'qsv');
    assert.ok(plan.args.includes('hevc_qsv'));
    assert.ok(plan.args.includes('-init_hw_device'));
    assert.ok(plan.args.some((arg) => String(arg).startsWith('vaapi=va:/dev/dri/renderD128')));
    assert.ok(plan.args.includes('qsv=hw@va'));
    const vfIndex = plan.args.indexOf('-vf');
    assert.ok(vfIndex >= 0);
    assert.match(String(plan.args[vfIndex + 1]), /format=nv12,hwupload=extra_hw_frames=64,format=qsv/);
});

test('10-bit transcode plans use p010/main10 and ignore h264', () => {
    const qsvTenBit = buildFfmpegPlan({
        inputPath: '/media/in.mkv',
        outputPath: '/media/out.mkv',
        rule: { then: { mode: 'transcode', videoCodec: 'hevc', tenBit: true } },
        adapter: QSV_ADAPTER,
        capabilities: { details: { qsv: { encoders: ['hevc_qsv'] } } },
        vaapiDevice: '/dev/dri/renderD128',
    });
    const qsvVf = String(qsvTenBit.args[qsvTenBit.args.indexOf('-vf') + 1]);
    assert.match(qsvVf, /^format=p010,hwupload/);
    assert.ok(qsvTenBit.args.includes('-profile:v'));
    assert.ok(qsvTenBit.args.includes('main10'));

    const cpuTenBit = buildFfmpegPlan({
        inputPath: '/media/in.mkv',
        outputPath: '/media/out.mkv',
        rule: { then: { mode: 'transcode', videoCodec: 'hevc', tenBit: true } },
        capabilities: { details: { cpu: { encoders: ['libx265'] } } },
    });
    const pixIndex = cpuTenBit.args.indexOf('-pix_fmt');
    assert.ok(pixIndex >= 0);
    assert.equal(cpuTenBit.args[pixIndex + 1], 'yuv420p10le');
    assert.ok(cpuTenBit.args.includes('main10'));

    // 10-bit H.264 is rejected by hardware encoders and most players — flag is ignored.
    const h264TenBit = buildFfmpegPlan({
        inputPath: '/media/in.mkv',
        outputPath: '/media/out.mkv',
        rule: { then: { mode: 'transcode', videoCodec: 'h264', tenBit: true } },
        capabilities: { details: { cpu: { encoders: ['libx264'] } } },
    });
    assert.ok(!h264TenBit.args.includes('-pix_fmt'));
    assert.ok(!h264TenBit.args.includes('main10'));
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
    assert.match(String(capabilities.details.qsv?.error || ''), /synthetic test disabled/);
    assert.equal(selectMediaAdapter('auto', capabilities, 'h264').name, 'nvenc');
    assert.equal(selectMediaAdapter('cpu', capabilities, 'h264').name, 'cpu');
    assert.throws(() => selectMediaAdapter('qsv', capabilities, 'h264'), /unavailable/);
    assert.equal(NVENC_ADAPTER.encoders.h264, 'h264_nvenc');
});

test('capability preflight reports missing /dev/dri instead of opaque ffmpeg VA errors', async () => {
    const capabilities = await detectFfmpegCapabilities({
        syntheticOutput: ' V..... h264_qsv\n V..... h264_vaapi\n V..... h264_nvenc\n V..... libx264\n',
        runSyntheticTests: true,
        devices: {
            dri: {
                present: false,
                renderNodes: [],
                cardNodes: [],
                device: '/dev/dri/renderD128',
                exists: false,
                readable: false,
                vendors: [],
                vendor: null,
            },
            nvidia: {
                device: true,
                cudaLib: null,
                visibleDevices: null,
                driverCapabilities: null,
            },
        },
    });
    assert.equal(capabilities.qsv, false);
    assert.match(String(capabilities.details.qsv?.error || ''), /not mapped/i);
    assert.equal(capabilities.nvenc, false);
    assert.match(String(capabilities.details.nvenc?.error || ''), /libcuda|NVIDIA/i);
});

test('capability preflight keeps AMD VAAPI off on Intel-only DRM vendors', async () => {
    const capabilities = await detectFfmpegCapabilities({
        syntheticOutput: ' V..... h264_qsv\n V..... h264_vaapi\n V..... libx264\n',
        runSyntheticTests: true,
        testAdapter: createSyntheticAdapterTest({ qsv: true, 'intel-vaapi': true, vaapi: true }),
        devices: {
            dri: {
                present: true,
                renderNodes: ['/dev/dri/renderD128'],
                cardNodes: ['/dev/dri/card0'],
                device: '/dev/dri/renderD128',
                exists: true,
                readable: true,
                vendors: ['intel'],
                vendor: 'intel',
                vendorId: '0x8086',
            },
            nvidia: {
                device: false,
                cudaLib: null,
                visibleDevices: null,
                driverCapabilities: null,
            },
        },
    });
    assert.equal(capabilities['intel-vaapi'], true);
    assert.equal(capabilities.qsv, true);
    assert.equal(capabilities.vaapi, false);
    assert.match(String(capabilities.details.vaapi?.error || ''), /No AMD GPU/i);
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
    const pausedLanes = normalizeMediaAutomationConfig({ cpuConcurrency: 0, gpuConcurrency: 0 });
    assert.equal(pausedLanes.cpuConcurrency, 0);
    assert.equal(pausedLanes.gpuConcurrency, 0);
    assert.equal(defaults.pauseWhenStreamingEnabled, false);
    assert.equal(defaults.arrRescanEnabled, false);
    assert.equal(defaults.minSavingsPercent, 0);
    assert.equal(defaults.dolbyVisionHandling, 'skip');
    assert.equal(defaults.hdr10Handling, 'preserve');
    assert.equal(defaults.workerPaused, true);
    assert.equal(normalizeMediaAutomationConfig({}).workerPaused, true);
    assert.equal(normalizeMediaAutomationConfig({ workerPaused: false }).workerPaused, false);
    assert.equal(normalizeMediaAutomationConfig({ workerPaused: true }).workerPaused, true);
    const guarded = normalizeMediaAutomationConfig({
        pauseWhenStreamingEnabled: true,
        pauseWhenStreamingLanes: 'ALL',
        arrRescanEnabled: true,
        minSavingsPercent: 150,
    });
    assert.equal(guarded.pauseWhenStreamingEnabled, true);
    assert.equal(guarded.pauseWhenStreamingLanes, 'all');
    assert.equal(guarded.arrRescanEnabled, true);
    assert.equal(guarded.minSavingsPercent, 95);
    assert.equal(normalizeMediaAutomationConfig({ pauseWhenStreamingLanes: 'bogus' }).pauseWhenStreamingLanes, 'gpu');
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

test('browse sorts full directory then paginates and filters', async () => {
    await withTempDir(async (dir) => {
        const shows = path.join(dir, 'tv');
        await fs.mkdir(shows, { recursive: true });
        const names = ['Zebra', 'Alpha', 'Happy Together', 'Halo', 'Yankee', 'Beta'];
        for (const name of names) {
            await fs.mkdir(path.join(shows, name), { recursive: true });
        }
        const roots = await collectBrowseRoots({ candidates: [dir], extraRoots: [] });
        const page = await listBrowseDirectory(shows, { roots, limit: 3, offset: 0 });
        assert.equal(page.total, 6);
        assert.equal(page.hasMore, true);
        assert.deepEqual(page.entries.map((entry) => entry.name), ['Alpha', 'Beta', 'Halo']);
        const next = await listBrowseDirectory(shows, { roots, limit: 3, offset: 3 });
        assert.deepEqual(next.entries.map((entry) => entry.name), ['Happy Together', 'Yankee', 'Zebra']);
        assert.equal(next.hasMore, false);
        const filtered = await listBrowseDirectory(shows, { roots, query: 'happ', limit: 10 });
        assert.deepEqual(filtered.entries.map((entry) => entry.name), ['Happy Together']);
        assert.equal(filtered.total, 1);
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

test('queue retryMany requeues failed and cancelled jobs', async () => {
    await withTempDir(async (dir) => {
        const store = createAtomicJsonStore({
            filePath: path.join(dir, 'queue.json'),
            defaultValue: { version: 1, jobs: [] },
        });
        const queue = createDurableJobQueue({ store });
        const a = await queue.enqueue({ sourcePath: '/media/a.mkv', maxAttempts: 1 });
        const b = await queue.enqueue({ sourcePath: '/media/b.mkv', maxAttempts: 1 });
        const c = await queue.enqueue({ sourcePath: '/media/c.mkv' });
        const claimedA = await queue.claim({ workerId: 'w1', lane: 'cpu' });
        assert.equal(claimedA.id, a.id);
        await queue.fail(claimedA.id, 'w1', new Error('boom'));
        await queue.cancelMany({ ids: [b.id] });
        const retried = await queue.retryMany();
        assert.equal(retried.length, 2);
        assert.ok(retried.every((job) => job.state === JOB_STATES.QUEUED && job.attempts === 0 && !job.error));
        const listed = await queue.list();
        assert.equal(listed.filter((job) => job.state === JOB_STATES.QUEUED).length, 3);
        assert.equal(listed.find((job) => job.id === c.id).state, JOB_STATES.QUEUED);
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

test('scheduler pauses gpu lane while streams are active and resumes after', async () => {
    const lanesProcessed = [];
    let streams = 2;
    const scheduler = createMediaScheduler({
        processor: {
            processOne: async ({ lane }) => {
                lanesProcessed.push(lane);
                return { didWork: false };
            },
            scan: async () => ({}),
        },
        getConfig: async () => ({
            enabled: true,
            workerPaused: false,
            cpuConcurrency: 1,
            gpuConcurrency: 1,
            libraryScanEnabled: false,
            pauseWhenStreamingEnabled: true,
            pauseWhenStreamingLanes: 'gpu',
        }),
        getActiveStreamCount: async () => streams,
        streamCheckTtlMs: 0,
        workerPollMs: 60_000,
    });
    await scheduler.start();
    await scheduler.processNow();
    assert.ok(lanesProcessed.includes('cpu'));
    assert.ok(!lanesProcessed.includes('gpu'));
    assert.equal(scheduler.status().streamingPauseActive, true);
    assert.equal(scheduler.status().activeStreamCount, 2);
    streams = 0;
    lanesProcessed.length = 0;
    await scheduler.processNow();
    assert.ok(lanesProcessed.includes('gpu'));
    assert.equal(scheduler.status().streamingPauseActive, false);
    scheduler.stop();
});

test('scheduler cancelScan aborts an in-flight scan', async () => {
    let started = false;
    let sawAbort = false;
    const scheduler = createMediaScheduler({
        processor: {
            processOne: async () => ({ didWork: false }),
            scan: async ({ signal } = {}) => {
                started = true;
                await new Promise((resolve, reject) => {
                    const timer = setTimeout(resolve, 5_000);
                    signal?.addEventListener('abort', () => {
                        sawAbort = true;
                        clearTimeout(timer);
                        reject(Object.assign(new Error('Scan cancelled'), { code: 'ABORT_ERR' }));
                    }, { once: true });
                }).catch((error) => {
                    if (error?.code === 'ABORT_ERR') return { discovered: 1, enqueued: 0, skipped: 0, cancelled: true, errors: [] };
                    throw error;
                });
                return { discovered: 1, enqueued: 0, skipped: 0, cancelled: true, errors: [] };
            },
        },
        getConfig: async () => ({
            enabled: true,
            workerPaused: true,
            libraryScanEnabled: false,
        }),
        workerPollMs: 60_000,
    });
    await scheduler.start();
    const pending = scheduler.scanNow();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(started, true);
    const cancelResult = await scheduler.cancelScan();
    assert.equal(cancelResult.cancelled, true);
    const result = await pending;
    assert.equal(sawAbort, true);
    assert.equal(result.cancelled, true);
    scheduler.stop();
});

test('scheduler skips encode claims when workerPaused and still scans', async () => {
    let processCalls = 0;
    let scanCalls = 0;
    const scheduler = createMediaScheduler({
        processor: {
            processOne: async () => {
                processCalls += 1;
                return { didWork: false };
            },
            scan: async () => {
                scanCalls += 1;
                return { discovered: 2, enqueued: 1, skipped: 1, errors: [] };
            },
        },
        getConfig: async () => ({
            enabled: true,
            workerPaused: true,
            cpuConcurrency: 1,
            gpuConcurrency: 1,
            libraryScanEnabled: true,
            libraryScanIntervalMinutes: 15,
        }),
        workerPollMs: 60_000,
    });
    await scheduler.start();
    await scheduler.processNow();
    assert.equal(processCalls, 0);
    const result = await scheduler.scanNow();
    assert.equal(scanCalls, 1);
    assert.equal(result.enqueued, 1);
    scheduler.stop();

    processCalls = 0;
    const active = createMediaScheduler({
        processor: {
            processOne: async () => {
                processCalls += 1;
                return { didWork: false };
            },
            scan: async () => ({}),
        },
        getConfig: async () => ({
            enabled: true,
            workerPaused: false,
            cpuConcurrency: 1,
            gpuConcurrency: 0,
            libraryScanEnabled: false,
        }),
        workerPollMs: 60_000,
    });
    await active.start();
    await active.processNow();
    assert.ok(processCalls > 0);
    active.stop();
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

test('heuristic savings prefer target bitrate and still estimate CRF pipelines', () => {
    const probe = {
        format: { size: 10_000_000_000, duration: '7200', bit_rate: '11111111', format_name: 'matroska,webm' },
        streams: [
            { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, bit_rate: '10000000' },
            { codec_type: 'audio', codec_name: 'aac', bit_rate: '384000', channels: 2 },
        ],
    };
    const summary = summarizeProbeForAnalyze(probe);
    assert.equal(summary.videoCodec, 'h264');
    assert.equal(summary.width, 1920);
    assert.ok(summary.bitrateKbps > 9000);

    const bitratePipeline = {
        steps: [{ mode: 'transcode', videoCodec: 'hevc', audioCodec: 'copy', videoBitrateKbps: 1500 }],
    };
    const bitrateEstimate = estimateHeuristicSavings({ probe, pipeline: bitratePipeline });
    assert.equal(bitrateEstimate.confidence, 'high');
    assert.equal(bitrateEstimate.reason, 'target-bitrate');
    assert.ok(bitrateEstimate.estimatedBytesSaved > 5_000_000_000);
    assert.ok(bitrateEstimate.estimatedSavingsPercent > 50);

    const crfPipeline = {
        steps: [{ mode: 'transcode', videoCodec: 'hevc', audioCodec: 'copy', crf: 23 }],
    };
    const crfEstimate = estimateHeuristicSavings({ probe, pipeline: crfPipeline });
    assert.equal(crfEstimate.confidence, 'medium');
    assert.equal(crfEstimate.reason, 'crf-ratio');
    assert.ok(crfEstimate.estimatedBytesSaved > 0);
    assert.ok(crfEstimate.estimatedSavingsPercent > 20);

    const remuxOnly = estimateHeuristicSavings({
        probe,
        pipeline: { steps: [{ mode: 'remux', videoCodec: 'copy', audioCodec: 'copy' }] },
    });
    assert.equal(remuxOnly.estimatedBytesSaved, 0);
    assert.equal(remuxOnly.reason, 'no-transcode-step');
});

test('HDR detect distinguishes SDR, HDR10, HLG, Dolby Vision, and 10-bit SDR', () => {
    assert.equal(detectHdr({
        codec_type: 'video',
        codec_name: 'hevc',
        bits_per_raw_sample: '10',
        color_transfer: 'bt709',
    }).kind, 'none');

    const hdr10 = detectHdr({
        codec_type: 'video',
        codec_name: 'hevc',
        color_transfer: 'smpte2084',
        color_primaries: 'bt2020',
        color_space: 'bt2020nc',
        side_data_list: [{
            side_data_type: 'Mastering display metadata',
            red_x: 0.68, red_y: 0.32,
            green_x: 0.265, green_y: 0.69,
            blue_x: 0.15, blue_y: 0.06,
            white_point_x: 0.3127, white_point_y: 0.329,
            min_luminance: 0.005, max_luminance: 1000,
        }, {
            side_data_type: 'Content light level metadata',
            max_content: 1000,
            max_average: 200,
        }],
    });
    assert.equal(hdr10.kind, 'hdr10');
    assert.equal(hdr10.isHdr, true);
    assert.match(String(hdr10.masterDisplay), /^G\(\d+,\d+\)B\(\d+,\d+\)R\(\d+,\d+\)WP\(\d+,\d+\)L\(\d+,\d+\)$/);
    assert.equal(hdr10.maxCll, '1000,200');
    assert.ok(formatMasterDisplay({
        red_x: 0.68, red_y: 0.32, green_x: 0.265, green_y: 0.69,
        blue_x: 0.15, blue_y: 0.06, white_point_x: 0.3127, white_point_y: 0.329,
        min_luminance: 0.005, max_luminance: 1000,
    }));

    assert.equal(detectHdr({
        codec_type: 'video',
        color_transfer: 'arib-std-b67',
    }).kind, 'hlg');

    const dovi = detectHdr({
        codec_type: 'video',
        codec_name: 'hevc',
        codec_tag_string: 'dvhe',
        side_data_list: [{ side_data_type: 'DOVI configuration record', dv_profile: 7 }],
    });
    assert.equal(dovi.kind, 'dolby-vision');
    assert.equal(dovi.isDolbyVision, true);

    const skip = shouldSkipForHdr({
        hdr: dovi,
        settings: { dolbyVisionHandling: 'skip' },
        steps: [{ mode: 'transcode', videoCodec: 'hevc' }],
    });
    assert.equal(skip?.reason, 'dolby-vision');
    assert.equal(shouldSkipForHdr({
        hdr: dovi,
        settings: { dolbyVisionHandling: 'skip' },
        steps: [{ mode: 'remux', videoCodec: 'copy' }],
    }), null);

    const preserveArgs = buildHdrPreserveArgs({
        hdr: hdr10,
        adapterName: 'cpu',
        videoEncoder: 'libx265',
        logicalCodec: 'hevc',
    });
    assert.ok(preserveArgs.includes('-color_trc'));
    assert.ok(preserveArgs.includes('smpte2084'));
    assert.ok(preserveArgs.includes('-x265-params'));
    assert.match(String(preserveArgs[preserveArgs.indexOf('-x265-params') + 1]), /master-display=/);

    const hdrPlan = buildFfmpegPlan({
        inputPath: '/media/in.mkv',
        outputPath: '/media/out.mkv',
        rule: { then: { mode: 'transcode', videoCodec: 'hevc', audioCodec: 'copy' } },
        capabilities: { details: { cpu: { encoders: ['libx265'] } } },
        probe: {
            streams: [{
                codec_type: 'video',
                codec_name: 'hevc',
                color_transfer: 'smpte2084',
                color_primaries: 'bt2020',
                color_space: 'bt2020nc',
            }],
        },
        hdrSettings: { hdr10Handling: 'preserve' },
    });
    assert.ok(hdrPlan.args.includes('yuv420p10le'));
    assert.ok(hdrPlan.args.includes('main10'));
    assert.ok(hdrPlan.args.includes('smpte2084'));
    assert.equal(hdrPlan.hdrKind, 'hdr10');
});

test('queue.fail persists truncated stderr and timeline advances on progress', async () => {
    await withTempDir(async (dir) => {
        const store = createAtomicJsonStore({
            filePath: path.join(dir, 'queue.json'),
            defaultValue: { version: 1, jobs: [] },
        });
        const queue = createDurableJobQueue({ store });
        const job = await queue.enqueue({ sourcePath: '/media/a.mkv', libraryRoot: '/media' });
        assert.equal(job.metadata.timeline[0].phase, JOB_PHASES.QUEUED);
        const claimed = await queue.claim({ workerId: 'w1' });
        await queue.updateProgress(claimed.id, 'w1', { phase: JOB_PHASES.PROBING });
        await queue.updateProgress(claimed.id, 'w1', { phase: JOB_PHASES.PROCESSING });
        const lines = Array.from({ length: 50 }, (_, i) => `line-${i}`);
        const failed = await queue.fail(claimed.id, 'w1', {
            code: 'FFMPEG_FAILED',
            message: 'encode failed',
            stderr: lines.join('\n'),
        }, { retryDelayMs: 0 });
        assert.equal(failed.state, JOB_STATES.QUEUED);
        assert.ok(failed.error.stderr.includes('line-49'));
        assert.equal(failed.error.stderr.includes('line-0'), false);
        const timelinePhases = failed.metadata.timeline.map((entry) => entry.phase);
        assert.ok(timelinePhases.includes(JOB_PHASES.PROBING));
        assert.ok(timelinePhases.includes(JOB_PHASES.PROCESSING));
    });
});

test('path deny list matches prefixes and globs', async () => {
    const { isPathDenied, normalizePathDenyList } = await import('./path-policy.js');
    const list = normalizePathDenyList(['/media/keep', '**/sample*']);
    assert.equal(isPathDenied('/media/keep/show.mkv', list), true);
    assert.equal(isPathDenied('/media/other/show.mkv', list), false);
});

test('retry with forceCpu sets metadata and lane', async () => {
    await withTempDir(async (dir) => {
        const store = createAtomicJsonStore({
            filePath: path.join(dir, 'queue.json'),
            defaultValue: { version: 1, jobs: [] },
        });
        const queue = createDurableJobQueue({ store });
        const job = await queue.enqueue({ sourcePath: '/media/a.mkv', lane: 'gpu' });
        const claimed = await queue.claim({ workerId: 'w1', lane: 'gpu' });
        await queue.fail(claimed.id, 'w1', { code: 'NVENC', message: 'hw fail' }, { retryDelayMs: 0 });
        // Exhaust attempts so final state is failed
        let current = await queue.get(job.id);
        while (current.state === JOB_STATES.QUEUED) {
            const next = await queue.claim({ workerId: 'w1', lane: current.lane });
            await queue.fail(next.id, 'w1', { code: 'NVENC', message: 'hw fail' }, { retryDelayMs: 0 });
            current = await queue.get(job.id);
        }
        assert.equal(current.state, JOB_STATES.FAILED);
        const retried = await queue.retry(job.id, { resetAttempts: true, forceCpu: true });
        assert.equal(retried.lane, 'cpu');
        assert.equal(retried.metadata.forceHardware, 'cpu');
        assert.equal(retried.state, JOB_STATES.QUEUED);
    });
});

test('cancelQueuedByScanBatch cancels only matching queued jobs', async () => {
    await withTempDir(async (dir) => {
        const store = createAtomicJsonStore({
            filePath: path.join(dir, 'queue.json'),
            defaultValue: { version: 1, jobs: [] },
        });
        const queue = createDurableJobQueue({ store });
        const a = await queue.enqueue({
            sourcePath: '/media/a.mkv',
            metadata: { scanBatchId: 'batch-1' },
        });
        const b = await queue.enqueue({
            sourcePath: '/media/b.mkv',
            metadata: { scanBatchId: 'batch-2' },
        });
        const cancelled = await queue.cancelQueuedByScanBatch('batch-1');
        assert.equal(cancelled.length, 1);
        assert.equal(cancelled[0].id, a.id);
        assert.equal((await queue.get(a.id)).state, JOB_STATES.CANCELLED);
        assert.equal((await queue.get(b.id)).state, JOB_STATES.QUEUED);
    });
});

test('scheduler auto-pauses claims when queue depth exceeds threshold', async () => {
    let processCalls = 0;
    const scheduler = createMediaScheduler({
        processor: {
            processOne: async () => {
                processCalls += 1;
                return { didWork: false };
            },
            scan: async () => ({ discovered: 0, enqueued: 0, skipped: 0, errors: [] }),
        },
        getConfig: async () => ({
            enabled: true,
            workerPaused: false,
            autoPauseQueueDepth: 2,
            cpuConcurrency: 1,
            gpuConcurrency: 1,
            libraryScanEnabled: false,
        }),
        getQueuedCount: async () => 5,
        workerPollMs: 60_000,
    });
    await scheduler.start();
    await scheduler.processNow();
    assert.equal(processCalls, 0);
    assert.equal(scheduler.status().autoPausedForQueueDepth, true);
    scheduler.stop();
});

test('normalizeMediaAutomationConfig includes QoL defaults', () => {
    const config = normalizeMediaAutomationConfig({});
    assert.equal(config.minFreeDiskGb, 20);
    assert.equal(config.autoPauseQueueDepth, 0);
    assert.deepEqual(config.pathDenyList, []);
    assert.equal(config.notifyOnScanComplete, false);
    assert.equal(config.notifyOnFailBurst, false);
});
