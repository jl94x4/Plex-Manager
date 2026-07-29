import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { probeHardwareDevices } from './devices.js';

const runCommand = (command, args, { timeoutMs = 4_000 } = {}) => new Promise((resolve) => {
    let settled = false;
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
        resolve({ ok: false, stdout, stderr, error: 'timeout' });
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, stdout, stderr, error: error.message });
    });
    child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ok: code === 0, code, stdout, stderr });
    });
});

const coreTimesSnapshot = () => {
    const cpus = os.cpus() || [];
    return cpus.map((cpu, index) => {
        const times = cpu.times || {};
        const total = Object.values(times).reduce((sum, value) => sum + Number(value || 0), 0);
        return {
            index,
            idle: Number(times.idle || 0),
            total,
            model: cpu.model || null,
        };
    });
};

const sumCpuTimes = () => {
    const cores = coreTimesSnapshot();
    let idle = 0;
    let total = 0;
    for (const core of cores) {
        idle += core.idle;
        total += core.total;
    }
    return { idle, total, count: cores.length, cores };
};

let lastCpuSample = null;
let lastCpuCoreSamples = null;
let lastCpuTimes = null;

const sampleCpuUsage = async () => {
    const current = sumCpuTimes();
    if (!lastCpuTimes) {
        lastCpuTimes = current;
        await new Promise((resolve) => setTimeout(resolve, 120));
        return sampleCpuUsage();
    }

    const idleDelta = current.idle - lastCpuTimes.idle;
    const totalDelta = current.total - lastCpuTimes.total;
    let usedPercent = lastCpuSample;
    if (totalDelta > 0) {
        usedPercent = Math.max(0, Math.min(100, (1 - (idleDelta / totalDelta)) * 100));
        lastCpuSample = usedPercent;
    }

    const prevCores = lastCpuTimes.cores || [];
    const cores = current.cores.map((core, index) => {
        const prev = prevCores[index] || prevCores[0] || core;
        const coreIdleDelta = core.idle - prev.idle;
        const coreTotalDelta = core.total - prev.total;
        let coreUsed = lastCpuCoreSamples?.[index]?.usedPercent ?? null;
        if (coreTotalDelta > 0) {
            coreUsed = Math.max(0, Math.min(100, (1 - (coreIdleDelta / coreTotalDelta)) * 100));
        }
        return {
            index: core.index,
            usedPercent: coreUsed,
            model: core.model,
        };
    });
    lastCpuCoreSamples = cores;
    lastCpuTimes = current;

    return {
        usedPercent: usedPercent == null ? null : usedPercent,
        cores,
    };
};

const parseNvidiaSmi = (stdout) => {
    const lines = String(stdout || '').trim().split(/\r?\n/).filter(Boolean);
    return lines.map((line, index) => {
        const parts = line.split(',').map((part) => part.trim());
        const [name, util, memUsed, memTotal, temp] = parts;
        return {
            index,
            name: name || `GPU ${index}`,
            utilizationPercent: Number(util),
            memoryUsedMb: Number(memUsed),
            memoryTotalMb: Number(memTotal),
            temperatureC: Number(temp),
            vendor: 'nvidia',
        };
    }).filter((gpu) => Number.isFinite(gpu.utilizationPercent) || gpu.name);
};

const collectNvidiaGpus = async () => {
    const result = await runCommand('nvidia-smi', [
        '--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu',
        '--format=csv,noheader,nounits',
    ]);
    if (!result.ok) {
        return {
            available: false,
            error: result.error || result.stderr?.trim() || 'nvidia-smi unavailable',
            gpus: [],
        };
    }
    const gpus = parseNvidiaSmi(result.stdout);
    return {
        available: gpus.length > 0,
        gpus,
        error: gpus.length ? null : 'No NVIDIA GPUs reported',
    };
};

const readMilliC = async (filePath) => {
    try {
        const raw = Number(String(await fs.readFile(filePath, 'utf8')).trim());
        if (!Number.isFinite(raw)) return null;
        // hwmon/thermal usually report millidegrees; some devices already report °C.
        const celsius = raw > 200 ? raw / 1000 : raw;
        if (!Number.isFinite(celsius) || celsius < 0 || celsius > 150) return null;
        return celsius;
    } catch {
        return null;
    }
};

const SENSOR_PRIORITY = [
    /package|x86_pkg|tctl|tdie|cpu[_ -]?temp|soc/i,
    /core/i,
];

const rankSensorLabel = (label = '') => {
    const text = String(label || '');
    const idx = SENSOR_PRIORITY.findIndex((pattern) => pattern.test(text));
    return idx === -1 ? SENSOR_PRIORITY.length : idx;
};

const collectCpuTemperature = async () => {
    const readings = [];

    try {
        const hwmonRoot = '/sys/class/hwmon';
        const entries = await fs.readdir(hwmonRoot);
        for (const entry of entries) {
            const dir = path.posix.join(hwmonRoot, entry);
            let chip = entry;
            try {
                chip = String(await fs.readFile(path.posix.join(dir, 'name'), 'utf8')).trim() || entry;
            } catch {
                // ignore
            }
            let files = [];
            try {
                files = await fs.readdir(dir);
            } catch {
                continue;
            }
            for (const file of files) {
                const match = /^temp(\d+)_input$/.exec(file);
                if (!match) continue;
                const id = match[1];
                const temperatureC = await readMilliC(path.posix.join(dir, file));
                if (temperatureC == null) continue;
                let label = `temp${id}`;
                try {
                    label = String(await fs.readFile(path.posix.join(dir, `temp${id}_label`), 'utf8')).trim() || label;
                } catch {
                    // ignore
                }
                readings.push({
                    temperatureC,
                    label: `${chip}:${label}`,
                    source: 'hwmon',
                });
            }
        }
    } catch {
        // hwmon unavailable (common on Windows / locked-down containers)
    }

    if (!readings.length) {
        try {
            const thermalRoot = '/sys/class/thermal';
            const entries = await fs.readdir(thermalRoot);
            for (const entry of entries) {
                if (!/^thermal_zone\d+$/.test(entry)) continue;
                const dir = path.posix.join(thermalRoot, entry);
                let type = entry;
                try {
                    type = String(await fs.readFile(path.posix.join(dir, 'type'), 'utf8')).trim() || entry;
                } catch {
                    // ignore
                }
                const temperatureC = await readMilliC(path.posix.join(dir, 'temp'));
                if (temperatureC == null) continue;
                readings.push({
                    temperatureC,
                    label: type,
                    source: 'thermal',
                });
            }
        } catch {
            // thermal sysfs unavailable
        }
    }

    if (!readings.length) {
        return {
            available: false,
            temperatureC: null,
            maxC: null,
            label: null,
            source: null,
            note: 'CPU temperature sensors are not exposed to this container.',
        };
    }

    readings.sort((a, b) => {
        const rankDelta = rankSensorLabel(a.label) - rankSensorLabel(b.label);
        if (rankDelta !== 0) return rankDelta;
        return b.temperatureC - a.temperatureC;
    });
    const best = readings[0];
    const maxC = Math.max(...readings.map((entry) => entry.temperatureC));
    return {
        available: true,
        temperatureC: Math.round(best.temperatureC * 10) / 10,
        maxC: Math.round(maxC * 10) / 10,
        label: best.label,
        source: best.source,
        note: null,
    };
};

/**
 * Host + process resource snapshot for Media Automation System tab.
 */
export const collectHostMetrics = async ({
    vaapiDevice = '/dev/dri/renderD128',
    activeEncodes = { cpu: 0, gpu: 0 },
} = {}) => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = Math.max(0, totalMem - freeMem);
    const proc = process.memoryUsage();
    const load = os.loadavg();
    const cpuSnapshot = sumCpuTimes();
    const [cpuUsage, cpuTemp, nvidia, devices] = await Promise.all([
        sampleCpuUsage(),
        collectCpuTemperature(),
        collectNvidiaGpus(),
        probeHardwareDevices({ vaapiDevice }).catch(() => null),
    ]);

    const intelOrAmd = {
        available: !!(devices?.dri?.present),
        dri: devices?.dri || null,
        vendors: devices?.dri?.vendors || [],
        note: devices?.dri?.present
            ? 'Intel/AMD utilization requires host tools (e.g. intel_gpu_top) — showing device map + active GPU encodes.'
            : '/dev/dri is not mapped into this container.',
    };

    return {
        at: new Date().toISOString(),
        host: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        uptimeSec: Math.round(os.uptime()),
        process: {
            pid: process.pid,
            rssBytes: proc.rss,
            heapUsedBytes: proc.heapUsed,
            heapTotalBytes: proc.heapTotal,
            externalBytes: proc.external,
        },
        memory: {
            totalBytes: totalMem,
            freeBytes: freeMem,
            usedBytes: usedMem,
            usedPercent: totalMem > 0 ? (usedMem / totalMem) * 100 : null,
        },
        cpu: {
            cores: cpuSnapshot.count,
            model: os.cpus()?.[0]?.model || null,
            load1: load[0],
            load5: load[1],
            load15: load[2],
            usedPercent: cpuUsage?.usedPercent ?? null,
            perCore: cpuUsage?.cores || [],
            temperatureC: cpuTemp?.temperatureC ?? null,
            temperatureMaxC: cpuTemp?.maxC ?? null,
            temperatureLabel: cpuTemp?.label || null,
            temperatureAvailable: cpuTemp?.available === true,
            temperatureNote: cpuTemp?.note || null,
        },
        gpu: {
            nvidia,
            intelOrAmd,
            activeEncodes: {
                cpu: Number(activeEncodes.cpu) || 0,
                gpu: Number(activeEncodes.gpu) || 0,
            },
        },
    };
};

export default collectHostMetrics;
