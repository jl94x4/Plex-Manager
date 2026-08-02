import { spawnCommand } from './spawn.js';

const HMS_TIME_RE = /^(\d+):(\d+):(\d+(?:\.\d+)?)$/;

/** Parse HH:MM:SS[.frac] into microseconds. */
export const parseTimeHmsToUs = (value) => {
    const match = String(value || '').trim().match(HMS_TIME_RE);
    if (!match) return null;
    const seconds = (Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3]);
    return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1_000_000) : null;
};

/** Parse the last `time=HH:MM:SS` token from ffmpeg stderr status lines. */
export const parseStderrTimeUs = (chunk = '') => {
    const matches = [...String(chunk).matchAll(/time=(\d+:\d+:\d+(?:\.\d+)?)/g)];
    if (!matches.length) return null;
    return parseTimeHmsToUs(matches[matches.length - 1][1]);
};

/** Parse ffmpeg -progress clock fields into microseconds. */
export const parseProgressOutTimeUs = (snapshot = {}) => {
    const fromUs = Number(snapshot.out_time_us);
    if (Number.isFinite(fromUs) && fromUs > 0) return fromUs;
    const fromOutTime = parseTimeHmsToUs(snapshot.out_time);
    if (fromOutTime != null && fromOutTime > 0) return fromOutTime;
    // Historically named *_ms but documented as microseconds.
    const fromMsAlias = Number(snapshot.out_time_ms);
    if (Number.isFinite(fromMsAlias) && fromMsAlias > 0) return fromMsAlias;
    if (Number.isFinite(fromUs) && fromUs === 0) return 0;
    return null;
};

/**
 * Resolve encoded position when mux timestamps are missing (common with NVENC).
 * Falls back to frame/fps and stderr `time=` when clock fields stay at zero.
 */
export const resolveProgressOutTimeUs = (snapshot = {}, stderrTimeUs = null) => {
    const clockUs = parseProgressOutTimeUs(snapshot);
    if (clockUs != null && clockUs > 0) return clockUs;

    const frame = Number(snapshot.frame);
    const fps = Number.parseFloat(snapshot.fps);
    if (Number.isFinite(frame) && frame > 0 && Number.isFinite(fps) && fps > 0) {
        return Math.round((frame / fps) * 1_000_000);
    }

    if (stderrTimeUs != null && stderrTimeUs > 0) return stderrTimeUs;

    return clockUs;
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
        let lastStderrTimeUs = null;
        let lastOutTimeUs = 0;
        const duration = Number(durationSeconds);
        const hasDuration = Number.isFinite(duration) && duration > 0;
        const emitProgress = (rawSnapshot, complete) => {
            const resolvedUs = resolveProgressOutTimeUs(rawSnapshot, lastStderrTimeUs);
            const outTimeUs = resolvedUs == null
                ? null
                : Math.max(lastOutTimeUs, resolvedUs);
            if (outTimeUs != null) lastOutTimeUs = outTimeUs;
            const speedRaw = String(rawSnapshot.speed || '').replace(/x$/i, '');
            const speed = Number.parseFloat(speedRaw);
            const speedValue = Number.isFinite(speed) && speed > 0 ? speed : null;
            const elapsedSeconds = outTimeUs == null ? null : outTimeUs / 1_000_000;
            const percent = hasDuration && elapsedSeconds != null
                ? Math.min(100, Math.max(0, (elapsedSeconds / duration) * 100))
                : null;
            const etaSeconds = hasDuration && elapsedSeconds != null && speedValue
                ? Math.max(0, (duration - elapsedSeconds) / speedValue)
                : null;
            onProgress?.({
                ...rawSnapshot,
                outTimeUs,
                percent,
                etaSeconds,
                speed: speedValue,
                fps: Number.parseFloat(rawSnapshot.fps) || null,
                durationSeconds: hasDuration ? duration : null,
                complete,
            });
        };
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
                    emitProgress(snapshot, value === 'end');
                    snapshot = {};
                }
            }
        };
        const consumeStderr = (chunk) => {
            const stderrTimeUs = parseStderrTimeUs(chunk);
            if (stderrTimeUs != null && stderrTimeUs > lastStderrTimeUs) {
                lastStderrTimeUs = stderrTimeUs;
            }
        };
        const startedAt = Date.now();
        const result = await runner(ffmpegPath, plan.args.map(String), {
            signal,
            timeoutMs: overrideTimeout ?? timeoutMs,
            onStdout: consume,
            onStderr: consumeStderr,
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
