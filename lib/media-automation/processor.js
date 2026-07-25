import path from 'path';
import crypto from 'crypto';
import fs from 'fs/promises';
import { normalizeMediaAutomationConfig } from './config.js';
import { buildRuleContext, findMatchingRule } from './rules.js';
import { discoverMediaFiles, resolveContainedPath } from './files.js';
import { probeMedia } from './ffprobe.js';
import { detectFfmpegCapabilities, selectMediaAdapter } from './adapters.js';
import {
    captureSourceFileMetadata,
    prepareMediaOutput,
    verifyMediaOutput,
    finalizeMediaOutput,
    discardMediaOutput,
} from './output.js';
import { createLocalMediaExecutor } from './executor.js';
import { BUILTIN_PLUGIN_IDS, createMediaPluginRegistry } from './plugins.js';
import { JOB_PHASES, buildJobDedupeKey, fingerprintSourceFile } from './models.js';

const errorWithCode = (message, code) => Object.assign(new Error(message), { code });

export const createMediaProcessor = ({
    queue,
    getConfig,
    probe = probeMedia,
    detectCapabilities = detectFfmpegCapabilities,
    executorFactory = createLocalMediaExecutor,
    libraries,
    pipelines,
    registry = createMediaPluginRegistry(),
    activity,
    workerId = `${process.pid}-${crypto.randomUUID()}`,
    logger = console,
} = {}) => {
    if (!queue || typeof getConfig !== 'function') throw new Error('queue and getConfig are required');
    let capabilitiesPromise = null;
    const activeControllers = new Map();

    const config = async () => normalizeMediaAutomationConfig(await getConfig());
    const recordActivity = async (entry) => {
        try {
            return await activity?.append?.(entry);
        } catch (error) {
            logger.warn?.(`[media-automation] activity write failed: ${error.message}`);
            return null;
        }
    };

    const enqueuePath = async (filePath, {
        libraryId,
        libraryRoot,
        pipelineId,
        pipeline: pipelineOverride,
        ruleId,
        rule: ruleOverride,
        probeResult,
        priority = 0,
    } = {}) => {
        const settings = await config();
        const library = libraryId == null ? null : await libraries?.get?.(libraryId);
        if (libraryId != null && !library) throw errorWithCode(`Library not found: ${libraryId}`, 'LIBRARY_NOT_FOUND');
        const root = libraryRoot
            || library?.rootPath
            || library?.path
            || settings.libraryRoots.find((entry) => {
            const relative = path.relative(path.resolve(entry), path.resolve(filePath));
            return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
        });
        if (!root) throw errorWithCode('File is outside configured library roots', 'OUTSIDE_LIBRARY');
        const safePath = await resolveContainedPath(root, filePath, { allowSymlinks: false });
        const sourceFileMetadata = await captureSourceFileMetadata(safePath);
        const fingerprint = await fingerprintSourceFile(safePath);
        const probePlugin = registry.get(library?.probePluginId || BUILTIN_PLUGIN_IDS.PROBE_FFPROBE);
        if (!probePlugin?.probe) throw errorWithCode('Configured probe plugin is unavailable', 'PROBE_PLUGIN_NOT_FOUND');
        const probeFunction = probePlugin.id === BUILTIN_PLUGIN_IDS.PROBE_FFPROBE ? probe : probePlugin.probe;
        const media = probeResult || await probeFunction(safePath, { ffprobePath: settings.ffprobePath });
        const context = buildRuleContext({ filePath: safePath, libraryRoot: await resolveContainedPath(root, '.', { allowSymlinks: true }), probe: media });
        const pipeline = pipelineOverride || (pipelineId == null ? null : await pipelines?.get?.(pipelineId));
        if (pipelineId != null && !pipeline) throw errorWithCode(`Pipeline not found: ${pipelineId}`, 'PIPELINE_NOT_FOUND');
        const candidateRules = Array.isArray(pipeline?.compiledRules)
            ? pipeline.compiledRules
            : (Array.isArray(pipeline?.rules) ? pipeline.rules : settings.rules);
        const selectedById = ruleId == null
            ? null
            : candidateRules.find((entry) => String(entry.id ?? entry.name) === String(ruleId));
        if (ruleId != null && !selectedById && !ruleOverride) {
            throw errorWithCode(`Rule not found: ${ruleId}`, 'RULE_NOT_FOUND');
        }
        const rule = ruleOverride || selectedById || findMatchingRule(candidateRules, context);
        if (!rule) return { enqueued: false, reason: 'no-matching-rule', filePath: safePath };
        const action = rule.then || rule.action || {};
        const selectedPipelineId = pipeline?.id ?? pipelineId ?? rule.pipelineId ?? null;
        const selectedPipeline = pipeline
            || (selectedPipelineId == null ? null : await pipelines?.get?.(selectedPipelineId));
        const pipelineSteps = Array.isArray(selectedPipeline?.steps) && selectedPipeline.steps.length
            ? selectedPipeline.steps
            : [action];
        const hardware = String(
            action.hardwareAcceleration
            || selectedPipeline?.hardware
            || selectedPipeline?.hardwareAcceleration
            || settings.hardwareAcceleration
        );
        const lane = pipelineSteps.some((step) => String(step.type || step.mode) === 'transcode')
            && hardware !== 'cpu'
            ? 'gpu'
            : 'cpu';
        const selectedRuleId = rule.id ?? rule.name ?? ruleId ?? rule._index;
        const job = await queue.enqueue({
            sourcePath: safePath,
            fingerprint,
            libraryRoot: root,
            libraryId: library?.id ?? libraryId,
            pipelineId: selectedPipelineId,
            dedupeKey: buildJobDedupeKey({
                sourcePath: safePath,
                fingerprint,
                pipelineId: selectedPipelineId,
                ruleId: selectedRuleId,
            }),
            ruleId: selectedRuleId,
            lane,
            priority: Number(rule.priority ?? priority),
            maxAttempts: settings.maxAttempts,
            metadata: {
                probe: media,
                rule,
                pipeline: selectedPipeline,
                probePluginId: probePlugin.id,
                sourceFileMetadata,
                fingerprint,
            },
        });
        await recordActivity({
            type: 'job.enqueued',
            jobId: job.id,
            message: `Queued ${path.basename(safePath)}`,
            data: { lane, pipelineId: selectedPipelineId, ruleId: selectedRuleId },
        });
        return { enqueued: true, job };
    };

    const scan = async ({ signal } = {}) => {
        const settings = await config();
        const results = { discovered: 0, enqueued: 0, skipped: 0, errors: [] };
        const catalogLibraries = await libraries?.list?.() || [];
        const roots = [
            ...settings.libraryRoots.map((rootPath) => ({ rootPath })),
            ...catalogLibraries,
        ];
        for (const library of roots) {
            const root = library.rootPath || library.path;
            if (!root || library.enabled === false) continue;
            try {
                for await (const filePath of discoverMediaFiles(root, { extensions: settings.extensions, signal })) {
                    results.discovered += 1;
                    try {
                        const result = await enqueuePath(filePath, {
                            libraryId: library.id,
                            libraryRoot: root,
                            pipelineId: library.pipelineId,
                        });
                        if (result.enqueued) results.enqueued += 1;
                        else results.skipped += 1;
                    } catch (error) {
                        results.errors.push({ filePath, message: error.message, code: error.code });
                    }
                }
            } catch (error) {
                results.errors.push({ root, message: error.message, code: error.code });
            }
        }
        return results;
    };

    const processOne = async ({ lane } = {}) => {
        const settings = await config();
        await queue.recoverExpired();
        const job = await queue.claim({ workerId, leaseMs: settings.leaseMs, lane });
        if (!job) return { didWork: false };
        const controller = new AbortController();
        activeControllers.set(job.id, controller);
        await recordActivity({
            type: 'job.started',
            jobId: job.id,
            message: `Started ${path.basename(job.sourcePath)}`,
            data: { lane: job.lane, attempt: job.attempts },
        });
        const heartbeat = setInterval(async () => {
            try {
                const current = await queue.get(job.id);
                if (current?.cancelRequested) controller.abort(errorWithCode('Job cancelled', 'ABORT_ERR'));
                else await queue.heartbeat(job.id, workerId, settings.leaseMs);
            } catch (error) {
                logger.warn?.(`[media-automation] heartbeat failed for ${job.id}: ${error.message}`);
                controller.abort(error);
            }
        }, Math.min(settings.heartbeatMs, Math.floor(settings.leaseMs / 2)));
        heartbeat.unref?.();
        let prepared;
        const intermediatePaths = [];
        try {
            await queue.updateProgress(job.id, workerId, { phase: JOB_PHASES.PROBING });
            const sourcePath = await resolveContainedPath(job.libraryRoot, job.sourcePath, { allowSymlinks: false });
            const sourceFileMetadata = job.metadata?.sourceFileMetadata
                || await captureSourceFileMetadata(sourcePath);
            const probePlugin = registry.get(job.metadata?.probePluginId || BUILTIN_PLUGIN_IDS.PROBE_FFPROBE);
            const probeFunction = probePlugin?.id === BUILTIN_PLUGIN_IDS.PROBE_FFPROBE ? probe : probePlugin?.probe;
            if (!probeFunction) throw errorWithCode('Configured probe plugin is unavailable', 'PROBE_PLUGIN_NOT_FOUND');
            const media = job.metadata?.probe || await probeFunction(sourcePath, {
                ffprobePath: settings.ffprobePath,
                signal: controller.signal,
            });
            const context = buildRuleContext({ filePath: sourcePath, libraryRoot: job.libraryRoot, probe: media });
            const rule = job.metadata?.rule || findMatchingRule(settings.rules, context);
            if (!rule) throw errorWithCode('Job no longer matches a rule', 'RULE_NOT_FOUND');
            await queue.updateProgress(job.id, workerId, { phase: JOB_PHASES.PLANNING });
            const action = rule.then || rule.action || {};
            const jobPipeline = job.metadata?.pipeline
                || (job.pipelineId == null ? null : await pipelines?.get?.(job.pipelineId));
            const configuredSteps = Array.isArray(jobPipeline?.steps) && jobPipeline.steps.length
                ? jobPipeline.steps
                : [action];
            const steps = configuredSteps.map((step) => ({
                ...action,
                ...step,
                mode: String(step.mode || step.type || action.mode || 'remux').toLowerCase(),
                hardwareAcceleration: step.hardwareAcceleration
                    || jobPipeline?.hardware
                    || action.hardwareAcceleration
                    || settings.hardwareAcceleration,
            }));
            const finalStep = steps[steps.length - 1];
            const outputMode = settings.dryRun ? 'dry-run' : (action.outputMode || settings.outputMode);
            const jobLibrary = job.libraryId == null ? null : await libraries?.get?.(job.libraryId);
            const outputExtension = action.outputExtension
                || (finalStep.container ? `.${finalStep.container}` : settings.outputExtension);
            const sourceRelativePath = path.relative(job.libraryRoot, sourcePath);
            const copyDestination = action.copyDestination
                || (outputMode === 'copy' && jobLibrary?.outputPath
                    ? path.join(
                        jobLibrary.outputPath,
                        path.dirname(sourceRelativePath),
                        `${path.parse(sourceRelativePath).name}${outputExtension}`,
                    )
                    : '');
            prepared = prepareMediaOutput({
                sourcePath,
                mode: outputMode,
                extension: outputExtension,
                copyDestination,
            });
            if (!settings.dryRun && outputMode !== 'dry-run') {
                await fs.mkdir(path.dirname(prepared.workPath), { recursive: true });
            }
            let capabilities = {};
            if (steps.some((step) => step.mode === 'transcode')) {
                if (!capabilitiesPromise) {
                    capabilitiesPromise = detectCapabilities({
                        ffmpegPath: settings.ffmpegPath,
                        vaapiDevice: settings.vaapiDevice,
                    })
                        .catch((error) => {
                            capabilitiesPromise = null;
                            throw error;
                        });
                }
                capabilities = await capabilitiesPromise;
            }
            const plans = [];
            let currentInput = sourcePath;
            for (let index = 0; index < steps.length; index += 1) {
                const step = steps[index];
                const transcode = step.mode === 'transcode';
                const logicalCodec = String(step.videoCodec || 'h264').toLowerCase();
                let adapter;
                try {
                    adapter = !transcode || logicalCodec === 'copy'
                        ? selectMediaAdapter('cpu')
                        : selectMediaAdapter(
                            step.hardwareAcceleration,
                            capabilities,
                            logicalCodec,
                        );
                } catch (error) {
                    if (!transcode || logicalCodec === 'copy' || !settings.allowCpuFallback || step.hardwareAcceleration === 'cpu') throw error;
                    adapter = selectMediaAdapter('cpu', capabilities, logicalCodec);
                    await recordActivity({
                        type: 'job.hardware-fallback',
                        jobId: job.id,
                        message: `Fell back to CPU for step ${index + 1}: ${error.message}`,
                        data: { requested: step.hardwareAcceleration, step: index + 1 },
                    });
                }
                const pipelinePluginId = transcode
                    ? BUILTIN_PLUGIN_IDS.TRANSCODE_FFMPEG
                    : BUILTIN_PLUGIN_IDS.REMUX_FFMPEG;
                const pipelinePlugin = registry.get(pipelinePluginId);
                if (!pipelinePlugin?.plan) {
                    throw errorWithCode(`Pipeline plugin not found: ${pipelinePluginId}`, 'PIPELINE_PLUGIN_NOT_FOUND');
                }
                const outputPath = index === steps.length - 1
                    ? prepared.workPath
                    : path.join(
                        path.dirname(prepared.workPath),
                        `.${path.parse(prepared.workPath).name}.${job.id}.step-${index + 1}.${step.container || 'mkv'}`,
                    );
                if (index < steps.length - 1) intermediatePaths.push(outputPath);
                const stepRule = { ...rule, then: { ...step, mode: step.mode } };
                const plan = pipelinePlugin.plan({
                    inputPath: currentInput,
                    outputPath,
                    rule: stepRule,
                    adapter,
                    capabilities,
                    vaapiDevice: settings.vaapiDevice,
                });
                plans.push(plan);
                currentInput = outputPath;
            }
            await queue.updateProgress(job.id, workerId, { phase: JOB_PHASES.PLANNED, plan: plans });
            if (settings.dryRun || outputMode === 'dry-run') {
                const result = { dryRun: true, plans };
                await queue.complete(job.id, workerId, result);
                await recordActivity({
                    type: 'job.completed',
                    jobId: job.id,
                    message: `Dry-run planned ${path.basename(sourcePath)}`,
                    data: { dryRun: true },
                });
                return { didWork: true, job, result };
            }
            const executor = executorFactory({
                ffmpegPath: settings.ffmpegPath,
                timeoutMs: settings.jobTimeoutMs,
            });
            const executions = [];
            for (let index = 0; index < plans.length; index += 1) {
                const plan = plans[index];
                await queue.updateProgress(job.id, workerId, {
                    phase: JOB_PHASES.PROCESSING,
                    progress: {
                        step: index + 1,
                        stepCount: plans.length,
                    },
                });
                let progressWrite = Promise.resolve();
                let lastProgressWrite = 0;
                const execution = await executor.execute(plan, {
                    signal: controller.signal,
                    durationSeconds: Number(media.format?.duration),
                    onProgress: (progress) => {
                        const now = Date.now();
                        if (!progress.complete && now - lastProgressWrite < 1000) return;
                        lastProgressWrite = now;
                        const stepFraction = Number(progress.percent || 0) / 100;
                        const totalPercent = ((index + stepFraction) / plans.length) * 100;
                        progressWrite = progressWrite
                            .then(() => queue.updateProgress(job.id, workerId, {
                                phase: progress.complete && index === plans.length - 1
                                    ? JOB_PHASES.VERIFYING
                                    : JOB_PHASES.PROCESSING,
                                progress: {
                                    percent: Math.min(100, Math.max(0, totalPercent)),
                                    outTimeUs: progress.outTimeUs,
                                    etaSeconds: progress.etaSeconds,
                                    speed: progress.speed,
                                    fps: progress.fps,
                                    step: index + 1,
                                    stepCount: plans.length,
                                },
                            }))
                            .catch((error) => controller.abort(error));
                    },
                });
                await progressWrite;
                executions.push(execution);
                if (index > 0) {
                    const consumedIntermediate = plans[index].inputPath;
                    await fs.rm(consumedIntermediate, { force: true }).catch(() => {});
                    const consumedIndex = intermediatePaths.indexOf(consumedIntermediate);
                    if (consumedIndex >= 0) intermediatePaths.splice(consumedIndex, 1);
                }
            }
            await queue.updateProgress(job.id, workerId, { phase: JOB_PHASES.VERIFYING });
            let verification = null;
            if (settings.verifyOutput) {
                verification = await verifyMediaOutput(prepared.workPath, {
                    minimumBytes: settings.minimumOutputBytes,
                    ffprobePath: settings.ffprobePath,
                    probe: probeFunction,
                    signal: controller.signal,
                    sourceMetadata: media,
                    expectedStreamCounts: action.subtitleCodec === 'drop' ? { subtitle: 0 } : undefined,
                    durationToleranceSeconds: action.durationToleranceSeconds,
                    durationToleranceRatio: action.durationToleranceRatio,
                });
            }
            await queue.updateProgress(job.id, workerId, { phase: JOB_PHASES.COMMITTING });
            const output = await finalizeMediaOutput(prepared, {
                quarantineDir: jobLibrary?.quarantinePath || settings.quarantineDir,
                verify: false,
                minimumBytes: settings.minimumOutputBytes,
                ffprobePath: settings.ffprobePath,
                probe: probeFunction,
                signal: controller.signal,
                sourceMetadata: media,
                expectedStreamCounts: action.subtitleCodec === 'drop' ? { subtitle: 0 } : undefined,
                durationToleranceSeconds: action.durationToleranceSeconds,
                durationToleranceRatio: action.durationToleranceRatio,
                sourceFileMetadata,
            });
            if (verification) output.verification = verification;
            const result = { plans, executions, output };
            await queue.complete(job.id, workerId, result);
            await recordActivity({
                type: 'job.completed',
                jobId: job.id,
                message: `Completed ${path.basename(sourcePath)}`,
                data: { output: output.finalPath },
            });
            return { didWork: true, job, result };
        } catch (error) {
            await discardMediaOutput(prepared);
            await Promise.all(intermediatePaths.map((filePath) => fs.rm(filePath, { force: true }).catch(() => {})));
            const current = await queue.get(job.id);
            if (current?.cancelRequested || error?.code === 'ABORT_ERR') {
                await queue.cancelClaimed(job.id, workerId).catch(() => {});
            } else {
                await queue.fail(job.id, workerId, error, { retryDelayMs: settings.retryDelayMs }).catch(() => {});
            }
            await recordActivity({
                type: current?.cancelRequested || error?.code === 'ABORT_ERR' ? 'job.cancelled' : 'job.failed',
                jobId: job.id,
                message: String(error?.message || error),
                data: { code: error?.code },
            });
            return { didWork: true, job, error };
        } finally {
            clearInterval(heartbeat);
            activeControllers.delete(job.id);
        }
    };

    const cancel = async (id) => {
        activeControllers.get(String(id))?.abort(errorWithCode('Job cancelled', 'ABORT_ERR'));
        return queue.requestCancel(id);
    };

    return {
        workerId,
        enqueuePath,
        scan,
        processOne,
        cancel,
        activeJobIds: () => [...activeControllers.keys()],
    };
};

export default createMediaProcessor;
