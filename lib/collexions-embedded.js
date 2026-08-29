import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

export const COLLEXIONS_EMBEDDED_PORT = Number(process.env.COLLEXIONS_EMBEDDED_PORT || 15755) || 15755;
export const COLLEXIONS_BUNDLED_URL = `http://127.0.0.1:${COLLEXIONS_EMBEDDED_PORT}`;
/** Gunicorn worker timeout — keep in sync with portal BFF long-op proxy budget. */
export const COLLEXIONS_EMBEDDED_GUNICORN_TIMEOUT_SEC = 600;
export const COLLEXIONS_LONG_PROXY_MS = COLLEXIONS_EMBEDDED_GUNICORN_TIMEOUT_SEC * 1000;

let workerChild = null;
let startingPromise = null;
let stoppingIntentionally = false;
let unexpectedExitHandler = null;

export const setCollexionsUnexpectedExitHandler = (fn) => {
    unexpectedExitHandler = typeof fn === 'function' ? fn : null;
};

const candidates = () => {
    const fromEnv = String(process.env.COLLEXIONS_APP_DIR || '').trim();
    return [
        fromEnv,
        path.join(REPO_ROOT, 'collexions'),
        '/app/collexions',
    ].filter(Boolean);
};

export const resolveCollexionsAppDir = () => {
    for (const dir of candidates()) {
        if (fs.existsSync(path.join(dir, 'server.py')) && fs.existsSync(path.join(dir, 'ColleXions.py'))) {
            return dir;
        }
    }
    return '';
};

const resolvePythonBin = (appDir) => {
    const venvUnix = '/opt/collexions-venv/bin/python';
    const venvWin = path.join(appDir, '.venv', 'Scripts', 'python.exe');
    if (fs.existsSync(venvUnix)) return venvUnix;
    if (fs.existsSync(venvWin)) return venvWin;
    if (process.env.COLLEXIONS_PYTHON) return process.env.COLLEXIONS_PYTHON;
    return process.platform === 'win32' ? 'python' : 'python3';
};

export const isCollexionsBundledAvailable = () => !!resolveCollexionsAppDir();

export const getCollexionsDataDir = (configDir) => path.join(configDir, 'collexions');

const COLLEXIONS_IN_PROGRESS_RE = /^(?:\[dry-run\]\s*)?(running|processing)\b/i;
const DEFAULT_PINNING_INTERVAL_MINUTES = 180;

/**
 * Read worker status.json + pinning_interval so the portal can skip a pinning
 * run on restart when the last cycle is still inside its window.
 */
export const readCollexionsRunHints = async (configDir) => {
    const dataDir = getCollexionsDataDir(configDir);
    let pinningMinutes = DEFAULT_PINNING_INTERVAL_MINUTES;
    try {
        const raw = await fs.promises.readFile(path.join(dataDir, 'config', 'config.json'), 'utf8');
        const cfg = JSON.parse(raw);
        const n = Number(cfg?.pinning_interval);
        if (Number.isFinite(n) && n >= 1) pinningMinutes = n;
    } catch {
        // first install / missing worker config
    }

    let lastRunAt = null;
    let lastStartedAt = null;
    let status = '';
    let nextRunTs = null;
    try {
        const raw = await fs.promises.readFile(path.join(dataDir, 'data', 'status.json'), 'utf8');
        const st = JSON.parse(raw);
        lastRunAt = st?.last_run_at || null;
        lastStartedAt = st?.last_run_started_at || null;
        status = String(st?.status || '').trim();
        const ts = Number(st?.next_run_timestamp);
        if (Number.isFinite(ts) && ts > 0) nextRunTs = ts;
    } catch {
        // no status yet
    }

    return {
        intervalMs: pinningMinutes * 60 * 1000,
        lastCompletedAt: lastRunAt,
        lastStartedAt,
        nextRunTs,
        status,
        interrupted: COLLEXIONS_IN_PROGRESS_RE.test(status),
    };
};

export const requestCollexionsPinningRun = async ({ serviceKey, baseUrl, log = () => {} } = {}) => {
    const key = String(serviceKey || '').trim();
    const base = String(baseUrl || '').replace(/\/+$/, '');
    if (!key || !base) return { ok: false, skipped: true, reason: 'missing-url-or-key' };
    try {
        const res = await fetch(`${base}/api/run`, {
            method: 'POST',
            headers: {
                'X-Collexions-Service-Key': key,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: '{}',
        });
        if (!res.ok) {
            const detail = await res.text().catch(() => '');
            throw new Error(detail || `HTTP ${res.status}`);
        }
        log('[collexions] Requested pinning run');
        return { ok: true };
    } catch (error) {
        log(`[collexions] Pinning run request failed: ${error.message}`);
        return { ok: false, error: error.message };
    }
};

const ensureDataDirs = (dataDir) => {
    fs.mkdirSync(path.join(dataDir, 'config'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true });
};

/**
 * When bundled worker is available, enable-only is enough:
 * fill localhost URL + generate a service key if missing.
 */
export const applyCollexionsBundledDefaults = (config, { configDir, log = () => {} } = {}) => {
    const next = { ...(config || {}) };
    if (!next.collexionsEnabled) return { config: next, changed: false };

    if (!isCollexionsBundledAvailable()) {
        return { config: next, changed: false };
    }

    let changed = false;
    const currentUrl = String(next.collexionsInternalUrl || '').trim();
    const looksExternalSidecar = /^https?:\/\/collexions(?::\d+)?\/?$/i.test(currentUrl);
    if (!currentUrl || looksExternalSidecar) {
        next.collexionsInternalUrl = COLLEXIONS_BUNDLED_URL;
        changed = true;
        log(`[collexions] Using bundled worker at ${COLLEXIONS_BUNDLED_URL}`);
    }

    if (!String(next.collexionsServiceKey || '').trim()) {
        next.collexionsServiceKey = crypto.randomBytes(32).toString('hex');
        changed = true;
        log('[collexions] Generated embedded service key');
    }

    if (configDir) ensureDataDirs(getCollexionsDataDir(configDir));
    return { config: next, changed };
};

const stopWorker = (log = () => {}) => {
    if (!workerChild || workerChild.killed) {
        workerChild = null;
        stoppingIntentionally = false;
        return;
    }
    stoppingIntentionally = true;
    try {
        workerChild.kill('SIGTERM');
        log('[collexions] Stopped embedded worker');
    } catch (e) {
        log(`[collexions] Failed to stop worker: ${e.message}`);
        stoppingIntentionally = false;
    }
    workerChild = null;
};

const startWorker = async ({ configDir, serviceKey, autostart = false, clientId = '', log = () => {} }) => {
    const appDir = resolveCollexionsAppDir();
    if (!appDir) {
        throw new Error('Bundled Collexions worker files not found.');
    }
    const dataDir = getCollexionsDataDir(configDir);
    ensureDataDirs(dataDir);
    const pythonBin = resolvePythonBin(appDir);
    const weakSecrets = new Set(['portal-collexions', 'dev-secret-key-replace-me-in-production']);
    const secretCandidates = [
        process.env.COLLEXIONS_SECRET_KEY,
        process.env.JWT_SECRET,
        serviceKey,
    ].map((value) => String(value || '').trim()).filter(Boolean);
    const secret = (secretCandidates.find((value) => !weakSecrets.has(value)) || '').slice(0, 128);
    if (!secret) {
        throw new Error(
            'Collexions secret missing or weak. Set COLLEXIONS_SERVICE_KEY (or COLLEXIONS_SECRET_KEY / JWT_SECRET).',
        );
    }
    const plexClientId = String(clientId || process.env.PLEX_CLIENT_IDENTIFIER || process.env.CLIENT_ID || '').trim();

    // Prefer gunicorn when installed in the venv; fall back to Flask for local/dev.
    const gunicornBin = process.platform === 'win32'
        ? path.join(path.dirname(pythonBin), 'gunicorn.exe')
        : path.join(path.dirname(pythonBin), 'gunicorn');
    const useGunicorn = fs.existsSync(gunicornBin);

    const env = {
        ...process.env,
        COLLEXIONS_DATA_DIR: dataDir,
        COLLEXIONS_PORTAL_MODE: 'true',
        COLLEXIONS_SERVICE_KEY: serviceKey,
        COLLEXIONS_SECRET_KEY: secret,
        COLLEXIONS_AUTOSTART: autostart ? 'true' : 'false',
        PYTHONUNBUFFERED: '1',
        // Portal callback for Overlays restamp when a managed collection updates.
        PORTAL_CALLBACK_BASE: String(
            process.env.PORTAL_CALLBACK_BASE
            || `http://127.0.0.1:${Number(process.env.PORT || 2121) || 2121}`,
        ).replace(/\/+$/, ''),
        // plexapi reads PLEXAPI_HEADER_* at import time — set before the worker starts.
        PLEXAPI_HEADER_PRODUCT: 'Server Manager Portal',
        PLEXAPI_HEADER_DEVICE: 'Server',
        PLEXAPI_HEADER_DEVICE_NAME: 'Server Manager Portal',
        PLEXAPI_HEADER_PLATFORM: 'Server Manager Portal',
        ...(plexClientId ? {
            PLEX_CLIENT_IDENTIFIER: plexClientId,
            CLIENT_ID: plexClientId,
            PLEXAPI_HEADER_IDENTIFIER: plexClientId,
        } : {}),
    };

    const args = useGunicorn
        ? [
            '-m', 'gunicorn',
            '--bind', `127.0.0.1:${COLLEXIONS_EMBEDDED_PORT}`,
            '--workers', '1',
            '--threads', '8',
            '--timeout', String(COLLEXIONS_EMBEDDED_GUNICORN_TIMEOUT_SEC),
            '--access-logfile', '-',
            '--error-logfile', '-',
            'server:app',
        ]
        : ['-c', `from server import app; app.run(host='127.0.0.1', port=${COLLEXIONS_EMBEDDED_PORT}, threaded=True, use_reloader=False)`];

    stopWorker(log);

    workerChild = spawn(pythonBin, args, {
        cwd: appDir,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });

    workerChild.stdout?.on('data', (buf) => {
        const line = String(buf).trim();
        if (line) log(`[collexions] ${line}`);
    });
    workerChild.stderr?.on('data', (buf) => {
        const line = String(buf).trim();
        if (line) log(`[collexions] ${line}`);
    });
    workerChild.on('exit', (code, signal) => {
        log(`[collexions] Embedded worker exited (code=${code}, signal=${signal || 'none'})`);
        const unexpected = !stoppingIntentionally
            && code !== 0
            && signal !== 'SIGTERM'
            && signal !== 'SIGINT';
        stoppingIntentionally = false;
        if (workerChild?.pid) workerChild = null;
        if (unexpected && typeof unexpectedExitHandler === 'function') {
            try {
                const result = unexpectedExitHandler({ code, signal });
                if (result && typeof result.then === 'function') result.catch(() => {});
            } catch {
                // ignore
            }
        }
    });

    // Wait briefly for listen readiness.
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        if (!workerChild || workerChild.exitCode != null) {
            throw new Error('Collexions embedded worker failed to start. Check portal logs.');
        }
        try {
            const res = await fetch(`http://127.0.0.1:${COLLEXIONS_EMBEDDED_PORT}/api/auth/status`, {
                headers: { 'X-Collexions-Service-Key': serviceKey },
            });
            if (res.ok) {
                log(`[collexions] Embedded worker ready on ${COLLEXIONS_BUNDLED_URL}`);
                return;
            }
        } catch {
            // still starting
        }
        await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error('Collexions embedded worker did not become ready in time.');
};

/**
 * Start or stop the in-process Collexions Flask worker to match config.
 */
export const syncCollexionsEmbeddedWorker = async (config, { configDir, log = () => {}, autostartRun } = {}) => {
    if (!config?.collexionsEnabled) {
        stopWorker(log);
        return { running: false, bundled: isCollexionsBundledAvailable() };
    }

    if (!isCollexionsBundledAvailable()) {
        return { running: false, bundled: false };
    }

    const serviceKey = String(config.collexionsServiceKey || process.env.COLLEXIONS_SERVICE_KEY || '').trim();
    const internalUrl = String(config.collexionsInternalUrl || '').trim();
    const usingBundled = !internalUrl || internalUrl.replace(/\/+$/, '') === COLLEXIONS_BUNDLED_URL;
    const wantAutostart = autostartRun != null ? !!autostartRun : !!config.collexionsAutostart;

    // External sidecar URL — do not start local worker.
    if (!usingBundled) {
        stopWorker(log);
        if (wantAutostart && serviceKey && internalUrl) {
            await requestCollexionsPinningRun({
                serviceKey,
                baseUrl: internalUrl,
                log,
            });
        }
        return { running: false, bundled: true, external: true, autostart: wantAutostart };
    }

    if (!serviceKey) {
        throw new Error('Collexions service key missing for embedded worker.');
    }

    // Restart when already running so COLLEXIONS_AUTOSTART / env updates apply on Save.
    if (workerChild && !workerChild.killed && workerChild.exitCode == null) {
        try {
            await fetch(`http://127.0.0.1:${COLLEXIONS_EMBEDDED_PORT}/api/stop`, {
                method: 'POST',
                headers: {
                    'X-Collexions-Service-Key': serviceKey,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: '{}',
            });
        } catch {
            // Worker may be mid-restart; continue with process stop.
        }
        stopWorker(log);
        await new Promise((r) => setTimeout(r, 500));
    }

    // Wait out any in-flight start, then (re)start with *this* config — never return a stale start.
    if (startingPromise) {
        try { await startingPromise; } catch { /* ignore prior start failure */ }
    }

    // If a prior wait left the worker running, restart so env (service key / autostart) matches.
    if (workerChild && !workerChild.killed && workerChild.exitCode == null) {
        try {
            await fetch(`http://127.0.0.1:${COLLEXIONS_EMBEDDED_PORT}/api/stop`, {
                method: 'POST',
                headers: {
                    'X-Collexions-Service-Key': serviceKey,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: '{}',
            });
        } catch {
            // continue
        }
        stopWorker(log);
        await new Promise((r) => setTimeout(r, 500));
    }

    startingPromise = startWorker({
        configDir,
        serviceKey,
        autostart: wantAutostart,
        clientId: String(config.clientId || process.env.CLIENT_ID || '').trim(),
        log,
    })
        .then(() => {
            if (wantAutostart) log('[collexions] Pinning service auto-start enabled');
            return { running: true, bundled: true, autostart: wantAutostart };
        })
        .finally(() => { startingPromise = null; });

    return startingPromise;
};

export const getCollexionsEmbeddedStatus = () => ({
    bundledAvailable: isCollexionsBundledAvailable(),
    bundledUrl: COLLEXIONS_BUNDLED_URL,
    running: !!(workerChild && !workerChild.killed && workerChild.exitCode == null),
    pid: workerChild?.pid || null,
});
