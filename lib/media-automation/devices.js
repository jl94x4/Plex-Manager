import fs from 'fs/promises';
import path from 'path';

const CUDA_CANDIDATES = Object.freeze([
    '/usr/lib/x86_64-linux-gnu/libcuda.so.1',
    '/usr/lib64/libcuda.so.1',
    '/usr/lib/libcuda.so.1',
    '/usr/local/nvidia/lib64/libcuda.so.1',
    '/usr/local/nvidia/lib/libcuda.so.1',
]);

const accessible = async (target, mode = fs.constants.R_OK) => {
    try {
        await fs.access(target, mode);
        return true;
    } catch {
        return false;
    }
};

const exists = async (target) => {
    try {
        await fs.stat(target);
        return true;
    } catch {
        return false;
    }
};

/** Probe host GPU device visibility inside the container (Intel/AMD /dev/dri + NVIDIA). */
export const probeHardwareDevices = async ({
    vaapiDevice = '/dev/dri/renderD128',
} = {}) => {
    const configured = String(vaapiDevice || '/dev/dri/renderD128').trim() || '/dev/dri/renderD128';
    let renderNodes = [];
    let cardNodes = [];
    let driPresent = false;
    try {
        const entries = await fs.readdir('/dev/dri');
        driPresent = true;
        renderNodes = entries
            .filter((name) => /^renderD\d+$/.test(name))
            .map((name) => path.posix.join('/dev/dri', name))
            .sort();
        cardNodes = entries
            .filter((name) => /^card\d+$/.test(name))
            .map((name) => path.posix.join('/dev/dri', name))
            .sort();
    } catch {
        driPresent = false;
    }

    const deviceExists = await exists(configured);
    const deviceReadable = deviceExists ? await accessible(configured, fs.constants.R_OK) : false;

    let cudaLib = null;
    for (const candidate of CUDA_CANDIDATES) {
        if (await accessible(candidate)) {
            cudaLib = candidate;
            break;
        }
    }

    return {
        dri: {
            present: driPresent,
            renderNodes,
            cardNodes,
            device: configured,
            exists: deviceExists,
            readable: deviceReadable,
        },
        nvidia: {
            device: await exists('/dev/nvidia0'),
            cudaLib,
            visibleDevices: process.env.NVIDIA_VISIBLE_DEVICES || null,
            driverCapabilities: process.env.NVIDIA_DRIVER_CAPABILITIES || null,
            runtimeHint: process.env.NVIDIA_VISIBLE_DEVICES
                ? null
                : 'Set NVIDIA_VISIBLE_DEVICES and --runtime=nvidia for NVENC',
        },
    };
};

export default probeHardwareDevices;
