import { spawn } from 'child_process';

export const spawnCommand = (executable, args = [], {
    cwd,
    env,
    signal,
    timeoutMs = 0,
    stdin = 'ignore',
    onStdout,
    onStderr,
    maxBufferBytes = 10 * 1024 * 1024,
} = {}) => new Promise((resolve, reject) => {
    if (!executable || typeof executable !== 'string') return reject(new TypeError('executable is required'));
    if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
        return reject(new TypeError('args must be an array of strings'));
    }
    const child = spawn(executable, args, {
        cwd,
        env: env ? { ...process.env, ...env } : process.env,
        shell: false,
        windowsHide: true,
        stdio: [stdin, 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;

    const append = (current, chunk) => {
        const next = current + chunk.toString('utf8');
        if (Buffer.byteLength(next) > maxBufferBytes) {
            child.kill();
            throw Object.assign(new Error('Process output exceeded limit'), { code: 'MAX_BUFFER' });
        }
        return next;
    };

    const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        if (error) reject(error);
        else resolve(result);
    };
    const abort = () => {
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5_000).unref?.();
    };
    const timer = timeoutMs > 0 ? setTimeout(() => {
        timedOut = true;
        abort();
    }, timeoutMs) : null;
    timer?.unref?.();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();

    child.stdout.on('data', (chunk) => {
        try {
            stdout = append(stdout, chunk);
            onStdout?.(chunk.toString('utf8'));
        } catch (error) {
            finish(error);
        }
    });
    child.stderr.on('data', (chunk) => {
        try {
            stderr = append(stderr, chunk);
            onStderr?.(chunk.toString('utf8'));
        } catch (error) {
            finish(error);
        }
    });
    child.once('error', (error) => finish(error));
    child.once('close', (code, closeSignal) => {
        if (signal?.aborted) {
            return finish(Object.assign(new Error('Process cancelled'), { code: 'ABORT_ERR', stdout, stderr }));
        }
        if (timedOut) {
            return finish(Object.assign(new Error(`Process timed out after ${timeoutMs}ms`), { code: 'ETIMEDOUT', stdout, stderr }));
        }
        const result = { code, signal: closeSignal, stdout, stderr, pid: child.pid };
        if (code !== 0) {
            return finish(Object.assign(new Error(`Process exited with code ${code}`), result));
        }
        return finish(null, result);
    });
});

export default spawnCommand;
