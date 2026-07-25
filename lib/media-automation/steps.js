import path from 'path';
import fs from 'fs/promises';
import { buildFfmpegPlan } from './ffmpeg-plan.js';
import { resolveContainedPath } from './files.js';
import { spawnCommand } from './spawn.js';

export const STEP_TYPES = Object.freeze([
    'transcode',
    'remux',
    'subtitle-strip',
    'subtitle-extract',
    'move',
    'custom-command',
]);

const PLACEHOLDER_RE = /\{(input|output|dir|name|ext|basename|libraryRoot)\}/g;

export const renderStepTemplate = (template, vars = {}) => String(template || '').replace(PLACEHOLDER_RE, (_, key) => {
    const value = vars[key];
    return value == null ? '' : String(value);
});

export const buildStepVars = ({
    inputPath,
    outputPath = '',
    libraryRoot = '',
} = {}) => {
    const resolvedInput = path.resolve(String(inputPath || ''));
    const parsed = path.parse(resolvedInput);
    return {
        input: resolvedInput,
        output: outputPath ? path.resolve(String(outputPath)) : '',
        dir: parsed.dir,
        name: parsed.name,
        ext: parsed.ext,
        basename: parsed.base,
        libraryRoot: libraryRoot ? path.resolve(String(libraryRoot)) : '',
    };
};

const assertSafeRelative = (value, label) => {
    const text = String(value || '');
    if (!text) throw new Error(`${label} is required`);
    if (text.includes('\0') || text.includes('..')) {
        throw new Error(`${label} must not contain null bytes or '..'`);
    }
    return text;
};

export const resolveAllowlistedExecutable = (executable, allowlist = ['ffmpeg', 'ffprobe']) => {
    const requested = String(executable || '').trim();
    if (!requested) throw new Error('Executable is required');
    if (requested.includes('\0') || requested.includes('..')) {
        throw new Error('Executable path is invalid');
    }
    const allowed = (Array.isArray(allowlist) ? allowlist : [])
        .map((entry) => String(entry || '').trim())
        .filter(Boolean);
    const basenames = new Set(allowed.map((entry) => path.basename(entry).toLowerCase()));
    const absoluteAllowed = new Set(allowed.filter((entry) => path.isAbsolute(entry)).map((entry) => path.resolve(entry)));
    if (path.isAbsolute(requested)) {
        const resolved = path.resolve(requested);
        if (!absoluteAllowed.has(resolved) && !basenames.has(path.basename(resolved).toLowerCase())) {
            throw new Error(`Executable is not allowlisted: ${requested}`);
        }
        return resolved;
    }
    if (!basenames.has(requested.toLowerCase())) {
        throw new Error(`Executable is not allowlisted: ${requested}`);
    }
    return requested;
};

export const buildStepPlan = ({
    step = {},
    inputPath,
    outputPath,
    libraryRoot,
    adapter,
    capabilities,
    vaapiDevice,
    allowlist,
} = {}) => {
    const mode = String(step.mode || step.type || 'remux').toLowerCase();
    const vars = buildStepVars({ inputPath, outputPath, libraryRoot });

    if (mode === 'transcode' || mode === 'remux') {
        const plan = buildFfmpegPlan({
            inputPath,
            outputPath,
            rule: { then: { ...step, mode } },
            adapter,
            capabilities,
            vaapiDevice,
        });
        return { ...plan, kind: 'ffmpeg', stepType: mode };
    }

    if (mode === 'subtitle-strip') {
        const args = [
            '-hide_banner', '-nostdin', '-loglevel', 'warning', '-progress', 'pipe:1', '-y',
            '-i', String(inputPath),
            '-map', '0', '-map', '-0:s', '-c', 'copy',
            String(outputPath),
        ];
        return {
            kind: 'ffmpeg',
            stepType: mode,
            executable: 'ffmpeg',
            args,
            mode: 'subtitle-strip',
            adapter: null,
            adapterLabel: null,
            inputPath: String(inputPath),
            outputPath: String(outputPath),
        };
    }

    if (mode === 'subtitle-extract') {
        const target = outputPath || path.join(vars.dir, `${vars.name}.srt`);
        const args = [
            '-hide_banner', '-nostdin', '-loglevel', 'warning', '-y',
            '-i', String(inputPath),
            '-map', '0:s:0?',
            '-c:s', 'srt',
            String(target),
        ];
        return {
            kind: 'ffmpeg',
            stepType: mode,
            executable: 'ffmpeg',
            args,
            mode: 'subtitle-extract',
            adapter: null,
            adapterLabel: null,
            inputPath: String(inputPath),
            outputPath: String(target),
            skipMediaFinalize: true,
        };
    }

    if (mode === 'move') {
        const template = assertSafeRelative(step.destination || step.destinationTemplate, 'Move destination');
        const rendered = renderStepTemplate(template, vars);
        if (!rendered) throw new Error('Move destination resolved empty');
        const absolute = path.isAbsolute(rendered)
            ? path.resolve(rendered)
            : path.resolve(libraryRoot || vars.dir, rendered);
        return {
            kind: 'move',
            stepType: mode,
            mode: 'move',
            inputPath: String(inputPath),
            outputPath: absolute,
            libraryRoot: libraryRoot ? path.resolve(libraryRoot) : '',
            adapter: null,
            adapterLabel: null,
            args: ['move', String(inputPath), '->', absolute],
        };
    }

    if (mode === 'custom-command') {
        const executable = resolveAllowlistedExecutable(step.executable || step.command, allowlist);
        const rawArgs = Array.isArray(step.args) ? step.args : [];
        if (!rawArgs.length) throw new Error('Custom command args are required');
        const args = rawArgs.map((entry) => renderStepTemplate(assertSafeRelative(entry, 'Command arg'), {
            ...vars,
            output: outputPath ? path.resolve(String(outputPath)) : vars.output,
        }));
        return {
            kind: 'command',
            stepType: mode,
            mode: 'custom-command',
            executable,
            args,
            inputPath: String(inputPath),
            outputPath: outputPath ? String(outputPath) : '',
            adapter: null,
            adapterLabel: null,
            skipMediaFinalize: !!step.skipMediaFinalize,
        };
    }

    throw new Error(`Unsupported pipeline step type: ${mode}`);
};

export const executeStepPlan = async (plan, {
    signal,
    timeoutMs,
    runner = spawnCommand,
    ffmpegPath = 'ffmpeg',
    onProgress,
    durationSeconds,
    libraryRoots = [],
} = {}) => {
    if (!plan?.kind) throw new Error('A valid step plan is required');

    if (plan.kind === 'ffmpeg') {
        const { createLocalMediaExecutor } = await import('./executor.js');
        const executor = createLocalMediaExecutor({ ffmpegPath, runner, timeoutMs });
        return executor.execute(plan, { signal, onProgress, durationSeconds, timeoutMs });
    }

    if (plan.kind === 'command') {
        const startedAt = Date.now();
        const result = await runner(plan.executable, plan.args.map(String), {
            signal,
            timeoutMs,
        });
        return {
            code: result.code,
            durationMs: Date.now() - startedAt,
            stderr: result.stderr,
            outputPath: plan.outputPath || null,
            command: [plan.executable, ...plan.args],
        };
    }

    if (plan.kind === 'move') {
        const roots = (libraryRoots || []).map((root) => path.resolve(root)).filter(Boolean);
        if (!roots.length && plan.libraryRoot) roots.push(path.resolve(plan.libraryRoot));
        if (!roots.length) throw new Error('Move requires a library root');
        const resolveUnderRoots = async (candidate, { mustExist = true } = {}) => {
            for (const root of roots) {
                try {
                    return await resolveContainedPath(root, candidate, { allowSymlinks: false, mustExist });
                } catch {
                    // try next root
                }
            }
            return null;
        };
        const sourcePath = await resolveUnderRoots(plan.inputPath, { mustExist: true });
        const destination = await resolveUnderRoots(plan.outputPath, { mustExist: false });
        if (!sourcePath || !destination) {
            throw Object.assign(new Error('Move paths must stay inside configured library roots'), { code: 'PATH_ESCAPE' });
        }
        await fs.mkdir(path.dirname(destination), { recursive: true });
        const startedAt = Date.now();
        try {
            await fs.rename(sourcePath, destination);
        } catch (error) {
            if (error.code !== 'EXDEV') throw error;
            await fs.copyFile(sourcePath, destination);
            await fs.rm(sourcePath, { force: true });
        }
        return {
            code: 0,
            durationMs: Date.now() - startedAt,
            stderr: '',
            outputPath: destination,
            moved: true,
        };
    }

    throw new Error(`Unsupported plan kind: ${plan.kind}`);
};

export default buildStepPlan;
