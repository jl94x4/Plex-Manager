import { spawnCommand } from './spawn.js';

/** Parse ffmpeg -progress clock fields into microseconds. */
export const parseProgressOutTimeUs = (snapshot = {}) => {
    const fromUs = Number(snapshot.out_time_us);
    if (Number.isFinite(fromUs) && fromUs >= 0) return fromUs;
    // Historically named *_ms but documented as microseconds.
    const fromMsAlias = Number(snapshot.out_time_ms);
    if (Number.isFinite(fromMsAlias) && fromMsAlias >= 0) return fromMsAlias;
    const match = String(snapshot.out_time || '').trim().match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
    if (!match) return null;
    const seconds = (Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3]);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000_000 : null;
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
        const duration = Number(durationSeconds);
        const hasDuration = Number.isFinite(duration) && duration > 0;
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
                    const outTimeUs = parseProgressOutTimeUs(snapshot);
                    const speedRaw = String(snapshot.speed || '').replace(/x$/i, '');
                    const speed = Number.parseFloat(speedRaw);
                    const speedValue = Number.isFinite(speed) && speed > 0 ? speed : null;
                    const elapsedSeconds = outTimeUs == null ? null : outTimeUs / 1_000_000;
                    const percent = hasDuration && elapsedSeconds != null
                        ? Math.min(100, Math.max(0, (elapsedSeconds / duration) * 100))
                        : null;
                    const etaSeconds = hasDuration && percent != null && speedValue
                        ? Math.max(0, (duration - elapsedSeconds) / speedValue)
                        : null;
                    onProgress?.({
                        ...snapshot,
                        outTimeUs,
                        percent,
                        etaSeconds,
                        speed: speedValue,
                        fps: Number.parseFloat(snapshot.fps) || null,
                        durationSeconds: hasDuration ? duration : null,
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
