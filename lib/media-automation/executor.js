import { spawnCommand } from './spawn.js';

const parseClockUs = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

export const createLocalMediaExecutor = ({
    ffmpegPath = 'ffmpeg',
    runner = spawnCommand,
    timeoutMs = 6 * 60 * 60 * 1000,
} = {}) => ({
    async execute(plan, {
        signal,
        onProgress,
        timeoutMs: overrideTimeout,
        durationSeconds,
    } = {}) {
        if (!plan?.args || !Array.isArray(plan.args)) throw new Error('A valid FFmpeg plan is required');
        let pending = '';
        let snapshot = {};
        const consume = (chunk) => {
            pending += chunk;
            const lines = pending.split(/\r?\n/);
            pending = lines.pop() || '';
            for (const line of lines) {
                const separator = line.indexOf('=');
                if (separator < 1) continue;
                const key = line.slice(0, separator);
                const value = line.slice(separator + 1);
                snapshot[key] = value;
                if (key === 'progress') {
                    const outTimeUs = parseClockUs(snapshot.out_time_us ?? snapshot.out_time_ms);
                    const speed = Number.parseFloat(snapshot.speed) || null;
                    const elapsedSeconds = outTimeUs == null ? null : outTimeUs / 1_000_000;
                    const duration = Number(durationSeconds);
                    const percent = Number.isFinite(duration) && duration > 0 && elapsedSeconds != null
                        ? Math.min(100, Math.max(0, elapsedSeconds / duration * 100))
                        : null;
                    const etaSeconds = percent != null && speed > 0
                        ? Math.max(0, (duration - elapsedSeconds) / speed)
                        : null;
                    onProgress?.({
                        ...snapshot,
                        outTimeUs,
                        percent,
                        etaSeconds,
                        speed,
                        fps: Number.parseFloat(snapshot.fps) || null,
                        complete: value === 'end',
                    });
                    snapshot = {};
                }
            }
        };
        const startedAt = Date.now();
        const result = await runner(ffmpegPath, plan.args.map(String), {
            signal,
            timeoutMs: overrideTimeout ?? timeoutMs,
            onStdout: consume,
        });
        return {
            code: result.code,
            durationMs: Date.now() - startedAt,
            stderr: result.stderr,
            outputPath: plan.outputPath,
        };
    },
});

export default createLocalMediaExecutor;
