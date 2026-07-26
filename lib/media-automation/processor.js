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
    mediaDuration,
} from './output.js';
import { BUILTIN_PLUGIN_IDS, createMediaPluginRegistry } from './plugins.js';
import { buildStepPlan, executeStepPlan } from './steps.js';
import { spawnCommand } from './spawn.js';
import { JOB_PHASES, buildJobDedupeKey, fingerprintSourceFile } from './models.js';
import { deliverCompletedMedia } from './delivery.js';
import { buildNamingContext } from './naming.js';

const planCommandText = (plan) => {
    if (!plan) return '';
    if (plan.kind === 'move') return `move ${plan.inputPath} -> ${plan.outputPath}`;
    const executable = plan.executable || 'ffmpeg';
    const args = Array.isArray(plan.args) ? plan.args.map(String) : [];
    return [executable, ...args].join(' ');
};

const FFMPEG_STEP_MODES = new Set([
    'transcode',
    'remux',
    'subtitle-strip',
    'subtitle-extract',
    'subtitle-keep-lang',
    'keep-first-audio',
    'drop-commentary',
    'audio-normalize',
    'audio-stereo',
    'commercial-strip',
]);

const errorWithCode = (message, code) => Object.assign(new Error(message), { code });

const normalizeTags = (value) => [...new Set(
    (Array.isArray(value) ? value : String(value || '').split(/[,\s]+/))
        .map((entry) => String(entry || '').trim().toLowerCase())
        .filter((entry) => entry && entry.length <= 40)
        .slice(0, 24),
)];

const parseEpisodeHint = (filePath = '') => {
    const base = path.basename(String(filePath || ''));
    const match = /[Ss](\d{1,2})[Ee](\d{1,3})/.exec(base)
        || /(\d{1,2})x(\d{1,3})/.exec(base);
    if (!match) return { seasonNumber: null, episodeNumber: null };
    return {
        seasonNumber: Number(match[1]),
        episodeNumber: Number(match[2]),
    };
};

export const createMediaProcessor = ({
    queue,
    getConfig,
    probe = probeMedia,
    detectCapabilities = detectFfmpegCapabilities,
    runner = spawnCommand,
    libraries,
    pipelines,
    registry = createMediaPluginRegistry(),
    activity,
    scanHistory,
    resolveDeliveryNaming,
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
        if (!rule) {
            const videoCodec = String(media?.streams?.find?.((stream) => stream.codec_type === 'video')?.codec_name
                || media?.videoCodec
                || '')
                .toLowerCase();
            const reason = videoCodec && candidateRules.some((entry) => {
                const conditions = entry?.when?.conditions || entry?.conditions || [];
                return conditions.some((condition) => (
                    condition?.field === 'videoCodec'
                    && condition?.operator === 'notEquals'
                    && String(condition?.value || '').toLowerCase() === videoCodec
                ));
            })
                ? 'already-matches-target'
                : 'no-matching-rule';
            return { enqueued: false, reason, filePath: safePath, probe: { videoCodec } };
        }
        const action = rule.then || rule.action || {};
        const selectedPipelineId = pipeline?.id ?? pipelineId ?? rule.pipelineId ?? null;
        const selectedPipeline = pipeline
            || (selectedPipelineId == null ? null : await pipelines?.get?.(selectedPipelineId));
        const pipelineSteps = Array.isArray(selectedPipeline?.steps) && selectedPipeline.steps.length
            ? selectedPipeline.steps
            : [action];
        const hardware = String(
            action.hardwareAcceleration
            || library?.hardware
            || selectedPipeline?.hardware
            || selectedPipeline?.hardwareAcceleration
            || settings.hardwareAcceleration
        );
        const lane = pipelineSteps.some((step) => String(step.type || step.mode) === 'transcode')
            && hardware !== 'cpu'
            ? 'gpu'
            : 'cpu';
        const selectedRuleId = rule.id ?? rule.name ?? ruleId ?? rule._index;
        const dedupeKey = buildJobDedupeKey({
            sourcePath: safePath,
            fingerprint,
            pipelineId: selectedPipelineId,
            ruleId: selectedRuleId,
        });
        const activeJobs = await queue.list();
        const duplicate = activeJobs.find((entry) => {
            if (['succeeded', 'failed', 'cancelled', 'canceled', 'completed'].includes(String(entry.state || ''))) {
                return false;
            }
            if (entry.dedupeKey && entry.dedupeKey === dedupeKey) return true;
            return !!(
                fingerprint
                && entry.fingerprint === fingerprint
                && entry.sourcePath === safePath
                && String(entry.pipelineId || '') === String(selectedPipelineId || '')
            );
        });
        if (duplicate) {
            return {
                enqueued: false,
                reason: 'already-queued',
                filePath: safePath,
                job: duplicate,
            };
        }
        const tags = normalizeTags(library?.tags);
        const job = await queue.enqueue({
            sourcePath: safePath,
            fingerprint,
            libraryRoot: root,
            libraryId: library?.id ?? libraryId,
            pipelineId: selectedPipelineId,
            dedupeKey,
            ruleId: selectedRuleId,
            lane,
            priority: Number(rule.priority ?? 0) + (Number(library?.priorityBoost) || 0) + (Number(priority) || 0),
            maxAttempts: settings.maxAttempts,
            metadata: {
                probe: media,
                rule,
                tags,
                pipeline: selectedPipeline
                    ? {
                        ...selectedPipeline,
                        hardware: library?.hardware || selectedPipeline.hardware,
                        outputMode: library?.outputMode || selectedPipeline.outputMode,
                    }
                    : selectedPipeline,
                libraryPolicy: library
                    ? {
                        hardware: library.hardware || null,
                        outputMode: library.outputMode || null,
                        quarantinePath: library.quarantinePath || null,
                        deliveryTargetId: library.deliveryTargetId || null,
                        tags,
                    }
                    : null,
                probePluginId: probePlugin.id,
                sourceFileMetadata,
                fingerprint,
                deliveryTargetId: library?.deliveryTargetId || selectedPipeline?.deliveryTargetId || null,
            },
        });
        await recordActivity({
            type: 'job.enqueued',
            jobId: job.id,
            message: `Queued ${path.basename(safePath)}`,
            data: { lane, pipelineId: selectedPipelineId, ruleId: selectedRuleId, tags },
        });
        return { enqueued: true, job };
    };

    const scan = async ({ signal } = {}) => {
        const settings = await config();
        const results = {
            discovered: 0,
            enqueued: 0,
            skipped: 0,
            errors: [],
            skippedDetails: [],
        };
        const startedAt = new Date().toISOString();
        const publishProgress = async (currentPath = null) => {
            try {
                await scanHistory?.setProgress?.({
                    ...results,
                    errors: results.errors.length,
                    currentPath,
                    startedAt,
                });
            } catch {
                // Progress is best-effort.
            }
        };
        await publishProgress();
        const catalogLibraries = await libraries?.list?.() || [];
        const roots = [
            ...settings.libraryRoots.map((rootPath) => ({ rootPath })),
            ...catalogLibraries,
        ];
        const pushSkip = (detail) => {
            results.skipped += 1;
            if (results.skippedDetails.length < 50) results.skippedDetails.push(detail);
        };
        try {
            for (const library of roots) {
                const root = library.rootPath || library.path;
                if (!root || library.enabled === false) continue;
                try {
                    for await (const filePath of discoverMediaFiles(root, { extensions: settings.extensions, signal })) {
                        results.discovered += 1;
                        if (results.discovered === 1 || results.discovered % 10 === 0) {
                            await publishProgress(filePath);
                        }
                        try {
                            const result = await enqueuePath(filePath, {
                                libraryId: library.id,
                                libraryRoot: root,
                                pipelineId: library.pipelineId,
                            });
                            if (result.enqueued) results.enqueued += 1;
                            else {
                                pushSkip({
                                    filePath: result.filePath || filePath,
                                    reason: result.reason || 'skipped',
                                    videoCodec: result.probe?.videoCodec || null,
                                });
                            }
                        } catch (error) {
                            results.errors.push({ filePath, message: error.message, code: error.code });
                        }
                    }
                } catch (error) {
                    results.errors.push({ root, message: error.message, code: error.code });
                }
            }
        } finally {
            await publishProgress();
        }
        return results;
    };

    const maybeDeliver = async ({ job, result, media, settings }) => {
        if (result?.dryRun) return result;
        const finalPath = result?.output?.finalPath;
        if (!finalPath) return result;
        const targetId = job.metadata?.deliveryTargetId
            || job.metadata?.libraryPolicy?.deliveryTargetId
            || null;
        if (!targetId) return result;
        const targets = Array.isArray(settings.deliveryTargets) ? settings.deliveryTargets : [];
        const target = targets.find((entry) => entry.enabled !== false && String(entry.id) === String(targetId));
        if (!target?.path) return result;
        try {
            const episodeHint = parseEpisodeHint(job.sourcePath || finalPath);
            let namingConfig = null;
            let namingContext = buildNamingContext({
                probe: media,
                sourcePath: job.sourcePath || finalPath,
                ...episodeHint,
            });
            if (target.namingMode === 'sonarr-pattern' && typeof resolveDeliveryNaming === 'function') {
                const resolved = await resolveDeliveryNaming({
                    target,
                    sourcePath: job.sourcePath || finalPath,
                    finalPath,
                    probe: media,
                }).catch(() => null);
                if (resolved?.namingConfig) namingConfig = resolved.namingConfig;
                if (resolved?.namingContext) namingContext = { ...namingContext, ...resolved.namingContext };
            }
            const delivery = await deliverCompletedMedia({
                sourcePath: finalPath,
                target,
                probe: media,
                namingContext,
                namingConfig,
            });
            return { ...result, delivery };
        } catch (error) {
            logger.warn?.(`[media-automation] delivery failed: ${error.message}`);
            return {
                ...result,
                delivery: {
                    targetId: target.id,
                    targetName: target.name,
                    error: error.message,
                    failed: true,
                },
            };
        }
    };

    const processOne = async ({ lane, tags, priorityBias = 0, workerGroupId = null } = {}) => {
        const settings = await config();
        await queue.recoverExpired();
        const job = await queue.claim({
            workerId,
            leaseMs: settings.leaseMs,
            lane,
            tags,
            priorityBias,
            workerGroupId,
        });
        if (!job) return { didWork: false };
        const controller = new AbortController();
        activeControllers.set(job.id, controller);
        await recordActivity({
            type: 'job.started',
            jobId: job.id,
            message: `Started ${path.basename(job.sourcePath)}`,
            data: { lane: job.lane, attempt: job.attempts, workerGroupId },
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
            const jobLibrary = job.libraryId == null ? null : await libraries?.get?.(job.libraryId);
            const libraryHardware = String(jobLibrary?.hardware || job.metadata?.libraryPolicy?.hardware || '').toLowerCase();
            const libraryOutputMode = String(jobLibrary?.outputMode || job.metadata?.libraryPolicy?.outputMode || '').toLowerCase();
            const configuredSteps = Array.isArray(jobPipeline?.steps) && jobPipeline.steps.length
                ? jobPipeline.steps
                : [action];
            const steps = configuredSteps.map((step) => ({
                ...action,
                ...step,
                mode: String(step.mode || step.type || action.mode || 'remux').toLowerCase(),
                hardwareAcceleration: step.hardwareAcceleration
                    || (['auto', 'cpu', 'nvenc', 'qsv', 'intel-vaapi', 'vaapi'].includes(libraryHardware) ? libraryHardware : null)
                    || jobPipeline?.hardware
                    || action.hardwareAcceleration
                    || settings.hardwareAcceleration,
            }));
            const finalStep = steps[steps.length - 1];
            // Pipeline UI is authoritative. Global Safe fallback (settings.outputMode/dryRun) can still force dry-run.
            // Per-library outputMode overrides pipeline when set.
            const pipelineOutputMode = String(jobPipeline?.outputMode || '').toLowerCase();
            const actionOutputMode = String(action.outputMode || '').toLowerCase();
            const settingsOutputMode = String(settings.outputMode || 'dry-run').toLowerCase();
            const libraryForcesMode = ['copy', 'replace', 'dry-run'].includes(libraryOutputMode)
                ? libraryOutputMode
                : null;
            const requestedOutputMode = libraryForcesMode
                || (['copy', 'replace', 'dry-run'].includes(pipelineOutputMode)
                    ? pipelineOutputMode
                    : (['copy', 'replace', 'dry-run'].includes(actionOutputMode)
                        ? actionOutputMode
                        : settingsOutputMode));
            const globalForcesDryRun = !!(settings.dryRun || settingsOutputMode === 'dry-run');
            const outputMode = globalForcesDryRun || requestedOutputMode === 'dry-run'
                ? 'dry-run'
                : (['copy', 'replace'].includes(requestedOutputMode) ? requestedOutputMode : 'dry-run');
            const dryRunReason = outputMode !== 'dry-run'
                ? null
                : (globalForcesDryRun
                    ? 'global-safe-fallback'
                    : (requestedOutputMode === 'dry-run' ? 'pipeline-output-mode' : 'default'));
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
            const needsCapabilities = steps.some((step) => (
                step.mode === 'transcode' && String(step.videoCodec || '').toLowerCase() !== 'copy'
            ));
            if (needsCapabilities) {
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
            const libraryList = typeof libraries?.list === 'function' ? await libraries.list() : [];
            const libraryRoots = [
                ...new Set(
                    (Array.isArray(libraryList) ? libraryList : [])
                        .map((entry) => entry?.rootPath || entry?.path)
                        .filter(Boolean)
                        .map((root) => path.resolve(root)),
                ),
            ];
            if (job.libraryRoot) libraryRoots.unshift(path.resolve(job.libraryRoot));
            const plans = [];
            let currentInput = sourcePath;
            let hardwareFallback = null;
            let selectedAdapterName = null;
            let selectedAdapterLabel = null;
            for (let index = 0; index < steps.length; index += 1) {
                const step = steps[index];
                const mode = String(step.mode || step.type || 'remux').toLowerCase();
                const transcode = mode === 'transcode';
                const logicalCodec = String(step.videoCodec || 'h264').toLowerCase();
                let adapter;
                if (FFMPEG_STEP_MODES.has(mode)) {
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
                        hardwareFallback = {
                            requested: String(step.hardwareAcceleration || 'auto'),
                            reason: String(error.message || 'adapter unavailable'),
                            step: index + 1,
                        };
                        await recordActivity({
                            type: 'job.hardware-fallback',
                            jobId: job.id,
                            message: `Fell back to CPU for step ${index + 1}: ${error.message}`,
                            data: { requested: step.hardwareAcceleration, step: index + 1 },
                        });
                    }
                    if (adapter && (!selectedAdapterName || (transcode && logicalCodec !== 'copy'))) {
                        selectedAdapterName = adapter.name;
                        selectedAdapterLabel = adapter.label;
                    }
                }
                let outputPath = '';
                if (mode === 'move') {
                    outputPath = '';
                } else if (mode === 'subtitle-extract') {
                    outputPath = path.join(path.dirname(currentInput), `${path.parse(currentInput).name}.srt`);
                } else if (mode === 'custom-command') {
                    outputPath = index === steps.length - 1 ? (prepared.workPath || '') : '';
                } else if (index === steps.length - 1) {
                    outputPath = prepared.workPath;
                } else {
                    outputPath = path.join(
                        path.dirname(prepared.workPath),
                        `.${path.parse(prepared.workPath).name}.${job.id}.step-${index + 1}.${step.container || 'mkv'}`,
                    );
                }
                if (outputPath && index < steps.length - 1 && mode !== 'subtitle-extract' && mode !== 'move') {
                    intermediatePaths.push(outputPath);
                }
                const plan = buildStepPlan({
                    step: { ...step, mode },
                    inputPath: currentInput,
                    outputPath,
                    libraryRoot: job.libraryRoot,
                    adapter,
                    capabilities,
                    vaapiDevice: settings.vaapiDevice,
                    allowlist: settings.customCommandAllowlist,
                    probe: media,
                    namingContext: buildNamingContext({
                        probe: media,
                        sourcePath,
                        ...parseEpisodeHint(sourcePath),
                    }),
                });
                plans.push(plan);
                if (!(plan.skipMediaFinalize && plan.stepType === 'subtitle-extract')) {
                    currentInput = plan.outputPath || currentInput;
                }
            }
            await queue.updateProgress(job.id, workerId, {
                phase: JOB_PHASES.PLANNED,
                plan: plans,
                progress: {
                    stepCount: plans.length,
                    command: planCommandText(plans[0]),
                    adapter: selectedAdapterName || plans[0]?.adapter || null,
                    adapterLabel: selectedAdapterLabel || plans[0]?.adapterLabel || null,
                    hardwareFallback: !!hardwareFallback,
                    requestedHardware: hardwareFallback?.requested
                        || String(steps[0]?.hardwareAcceleration || jobPipeline?.hardware || settings.hardwareAcceleration || ''),
                },
            });
            if (outputMode === 'dry-run') {
                const sourceBytes = Number(sourceFileMetadata?.size || media?.format?.size || 0) || 0;
                const result = {
                    dryRun: true,
                    outputMode,
                    dryRunReason,
                    requestedOutputMode,
                    adapter: selectedAdapterName || plans[0]?.adapter || null,
                    adapterLabel: selectedAdapterLabel || plans[0]?.adapterLabel || null,
                    hardwareFallback,
                    plans,
                    sourceBytes,
                    outputBytes: 0,
                    bytesSaved: 0,
                    durationMs: Math.max(0, Date.now() - Date.parse(job.startedAt || job.createdAt || Date.now())),
                };
                await queue.complete(job.id, workerId, result);
                await recordActivity({
                    type: 'job.completed',
                    jobId: job.id,
                    message: dryRunReason === 'global-safe-fallback'
                        ? `Dry-run planned ${path.basename(sourcePath)} (global Safe fallback is Dry run)`
                        : `Dry-run planned ${path.basename(sourcePath)} (pipeline output mode is Dry run)`,
                    data: { dryRun: true, dryRunReason, requestedOutputMode },
                });
                return { didWork: true, job, result };
            }
            const executions = [];
            for (let index = 0; index < plans.length; index += 1) {
                const plan = plans[index];
                const commandText = planCommandText(plan);
                await queue.updateProgress(job.id, workerId, {
                    phase: JOB_PHASES.PROCESSING,
                    plan: plans,
                    progress: {
                        step: index + 1,
                        stepCount: plans.length,
                        command: commandText,
                        currentCommand: commandText,
                        adapter: plan.adapter || selectedAdapterName || null,
                        adapterLabel: plan.adapterLabel || selectedAdapterLabel || null,
                        hardwareFallback: !!hardwareFallback,
                        requestedHardware: hardwareFallback?.requested
                            || String(steps[0]?.hardwareAcceleration || jobPipeline?.hardware || settings.hardwareAcceleration || ''),
                    },
                });
                let progressWrite = Promise.resolve();
                let lastProgressWrite = 0;
                const durationSeconds = mediaDuration(media);
                const execution = await executeStepPlan(plan, {
                    signal: controller.signal,
                    timeoutMs: settings.jobTimeoutMs,
                    ffmpegPath: settings.ffmpegPath,
                    ffprobePath: settings.ffprobePath,
                    durationSeconds,
                    libraryRoots,
                    runner,
                    onProgress: (progress) => {
                        const now = Date.now();
                        if (!progress.complete && now - lastProgressWrite < 1000) return;
                        lastProgressWrite = now;
                        const stepFraction = progress.percent == null
                            ? null
                            : Number(progress.percent) / 100;
                        const totalPercent = stepFraction == null
                            ? null
                            : ((index + stepFraction) / plans.length) * 100;
                        progressWrite = progressWrite
                            .then(() => queue.updateProgress(job.id, workerId, {
                                phase: progress.complete && index === plans.length - 1
                                    ? JOB_PHASES.VERIFYING
                                    : JOB_PHASES.PROCESSING,
                                progress: {
                                    ...(totalPercent == null
                                        ? {}
                                        : { percent: Math.min(100, Math.max(0, totalPercent)) }),
                                    outTimeUs: progress.outTimeUs,
                                    etaSeconds: progress.etaSeconds,
                                    speed: progress.speed,
                                    fps: progress.fps,
                                    durationSeconds: progress.durationSeconds ?? durationSeconds,
                                    step: index + 1,
                                    stepCount: plans.length,
                                    command: commandText,
                                    currentCommand: commandText,
                                },
                            }))
                            .catch((error) => controller.abort(error));
                    },
                });
                await progressWrite;
                executions.push(execution);
                if (index > 0 && FFMPEG_STEP_MODES.has(plans[index].stepType || plans[index].mode)) {
                    const consumedIntermediate = plans[index].inputPath;
                    if (consumedIntermediate && consumedIntermediate !== sourcePath) {
                        await fs.rm(consumedIntermediate, { force: true }).catch(() => {});
                        const consumedIndex = intermediatePaths.indexOf(consumedIntermediate);
                        if (consumedIndex >= 0) intermediatePaths.splice(consumedIndex, 1);
                    }
                }
            }
            const finalPlan = plans[plans.length - 1];
            const skipFinalize = finalPlan?.kind === 'move' || !!finalPlan?.skipMediaFinalize;
            if (skipFinalize) {
                const finalPath = executions[executions.length - 1]?.outputPath || finalPlan.outputPath || sourcePath;
                const sourceBytes = Number(sourceFileMetadata?.size || media?.format?.size || 0) || 0;
                const durationMs = executions.reduce((sum, entry) => sum + (Number(entry.durationMs) || 0), 0)
                    || Math.max(0, Date.now() - Date.parse(job.startedAt || job.createdAt || Date.now()));
                let result = {
                    plans,
                    executions,
                    output: { finalPath, skippedFinalize: true },
                    sourceBytes,
                    outputBytes: sourceBytes,
                    bytesSaved: 0,
                    durationMs,
                    adapter: selectedAdapterName || finalPlan?.adapter || null,
                    adapterLabel: selectedAdapterLabel || finalPlan?.adapterLabel || null,
                    hardwareFallback,
                };
                result = await maybeDeliver({ job, result, media, settings });
                await queue.complete(job.id, workerId, result);
                await recordActivity({
                    type: 'job.completed',
                    jobId: job.id,
                    message: `Completed ${path.basename(sourcePath)}`,
                    data: { output: result.delivery?.deliveredPath || finalPath, delivery: result.delivery || null },
                });
                return { didWork: true, job, result };
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
                    expectedStreamCounts: action.subtitleCodec === 'drop' || finalStep.mode === 'subtitle-strip'
                        ? { subtitle: 0 }
                        : undefined,
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
                expectedStreamCounts: action.subtitleCodec === 'drop' || finalStep.mode === 'subtitle-strip'
                    ? { subtitle: 0 }
                    : undefined,
                durationToleranceSeconds: action.durationToleranceSeconds,
                durationToleranceRatio: action.durationToleranceRatio,
                sourceFileMetadata,
            });
            if (verification) output.verification = verification;
            const sourceBytes = Number(sourceFileMetadata?.size || media?.format?.size || 0) || 0;
            const outputBytes = Number(verification?.size || output?.verification?.size || 0) || 0;
            const durationMs = executions.reduce((sum, entry) => sum + (Number(entry.durationMs) || 0), 0)
                || Math.max(0, Date.now() - Date.parse(job.startedAt || job.createdAt || Date.now()));
            const resultBase = {
                plans,
                executions,
                output,
                sourceBytes,
                outputBytes,
                bytesSaved: Math.max(0, sourceBytes - outputBytes),
                durationMs,
                adapter: selectedAdapterName || plans[plans.length - 1]?.adapter || null,
                adapterLabel: selectedAdapterLabel || plans[plans.length - 1]?.adapterLabel || null,
                hardwareFallback,
            };
            const result = await maybeDeliver({ job, result: resultBase, media, settings });
            await queue.complete(job.id, workerId, result);
            await recordActivity({
                type: 'job.completed',
                jobId: job.id,
                message: `Completed ${path.basename(sourcePath)}`,
                data: {
                    output: result.delivery?.deliveredPath || output.finalPath,
                    quarantinedPath: output.quarantinedPath || null,
                    sourceBytes,
                    outputBytes,
                    bytesSaved: result.bytesSaved,
                    durationMs,
                    delivery: result.delivery || null,
                },
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
