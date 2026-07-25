import { spawnCommand } from './spawn.js';

const adapter = (name, label, encoderDefinitions, {
    inputArgs = () => [],
    outputArgs = () => [],
    syntheticArgs = () => [],
    filter = () => null,
} = {}) => {
    const encoderCandidates = Object.fromEntries(
        Object.entries(encoderDefinitions).map(([codec, values]) => [codec, Array.isArray(values) ? values : [values]]),
    );
    const encoders = Object.fromEntries(
        Object.entries(encoderCandidates).map(([codec, values]) => [codec, values[0]]),
    );
    return Object.freeze({
        name,
        label,
        encoders: Object.freeze(encoders),
        encoderCandidates: Object.freeze(encoderCandidates),
        videoEncoder: encoders.h264,
        inputArgs,
        outputArgs,
        syntheticArgs,
        filter,
    });
};

export const CPU_ADAPTER = adapter('cpu', 'CPU', {
    h264: 'libx264',
    hevc: 'libx265',
    av1: ['libsvtav1', 'libaom-av1', 'librav1e'],
}, {
    outputArgs: ({ codec, preset }) => {
        if (codec === 'av1') return ['-preset', '8', '-crf', '28'];
        const selected = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow']
            .includes(String(preset || '').toLowerCase())
            ? String(preset).toLowerCase()
            : 'medium';
        return ['-preset', selected, '-crf', '20'];
    },
    filter: ({ maxWidth }) => maxWidth ? `scale=w='min(iw,${maxWidth})':h=-2` : null,
});
export const NVENC_ADAPTER = adapter('nvenc', 'NVIDIA NVENC', {
    h264: 'h264_nvenc',
    hevc: 'hevc_nvenc',
    av1: 'av1_nvenc',
}, {
    outputArgs: ({ preset }) => {
        const normalized = String(preset || '').toLowerCase();
        const selected = /^p[1-7]$/.test(normalized)
            ? normalized
            : ({ fast: 'p3', medium: 'p5', slow: 'p7' }[normalized] || 'p5');
        return ['-preset', selected, '-cq', '20'];
    },
    filter: ({ maxWidth }) => maxWidth ? `scale=w='min(iw,${maxWidth})':h=-2` : null,
});
export const QSV_ADAPTER = adapter('qsv', 'Intel QSV', {
    h264: 'h264_qsv',
    hevc: 'hevc_qsv',
    av1: 'av1_qsv',
}, {
    inputArgs: () => ['-init_hw_device', 'qsv=hw', '-filter_hw_device', 'hw', '-hwaccel', 'qsv', '-hwaccel_output_format', 'qsv'],
    outputArgs: ({ preset }) => {
        const normalized = String(preset || '').toLowerCase();
        const selected = ['veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'].includes(normalized)
            ? normalized
            : 'medium';
        return ['-preset', selected, '-global_quality', '20'];
    },
    syntheticArgs: () => ['-init_hw_device', 'qsv=hw', '-filter_hw_device', 'hw'],
    filter: ({ maxWidth, synthetic }) => synthetic
        ? 'format=nv12,hwupload=extra_hw_frames=64'
        : (maxWidth ? `scale_qsv=w=${maxWidth}:h=-2` : null),
});
const vaapiImpl = {
    inputArgs: ({ device }) => [
        '-vaapi_device', device || '/dev/dri/renderD128',
        '-hwaccel', 'vaapi',
        '-hwaccel_device', device || '/dev/dri/renderD128',
        '-hwaccel_output_format', 'vaapi',
    ],
    outputArgs: () => ['-qp', '20'],
    syntheticArgs: ({ device }) => ['-vaapi_device', device || '/dev/dri/renderD128'],
    filter: ({ maxWidth, synthetic }) => synthetic
        ? 'format=nv12,hwupload'
        : (maxWidth ? `scale_vaapi=w=${maxWidth}:h=-2` : null),
};

export const INTEL_VAAPI_ADAPTER = adapter('intel-vaapi', 'Intel VAAPI', {
    h264: 'h264_vaapi',
    hevc: 'hevc_vaapi',
    av1: 'av1_vaapi',
}, vaapiImpl);

export const VAAPI_ADAPTER = adapter('vaapi', 'AMD VAAPI', {
    h264: 'h264_vaapi',
    hevc: 'hevc_vaapi',
    av1: 'av1_vaapi',
}, vaapiImpl);

export const MEDIA_ADAPTERS = Object.freeze({
    cpu: CPU_ADAPTER,
    nvenc: NVENC_ADAPTER,
    qsv: QSV_ADAPTER,
    'intel-vaapi': INTEL_VAAPI_ADAPTER,
    vaapi: VAAPI_ADAPTER,
});

const encoderAvailable = (output, encoder) => new RegExp(`\\b${encoder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(output);

export const resolveAdapterEncoder = (selected, codec = 'h264', capabilities = {}) => {
    const logical = String(codec || 'h264').toLowerCase();
    if (!['h264', 'hevc', 'av1'].includes(logical)) throw new Error(`Unsupported logical video codec: ${logical}`);
    const candidates = selected?.encoderCandidates?.[logical] || [];
    const advertised = capabilities?.details?.[selected?.name]?.encoders || [];
    const encoder = advertised.length
        ? candidates.find((candidate) => advertised.includes(candidate))
        : candidates[0];
    if (!encoder) {
        throw new Error(`${selected?.label || selected?.name} does not support ${logical.toUpperCase()}`);
    }
    return encoder;
};

export const runSyntheticHardwareTest = async (selected, {
    ffmpegPath = 'ffmpeg',
    runner = spawnCommand,
    timeoutMs = 30_000,
    device,
    codec = 'h264',
} = {}) => {
    const encoder = selected.encoders[codec];
    const filter = selected.filter({ synthetic: true });
    const args = [
        '-hide_banner', '-loglevel', 'error',
        ...selected.syntheticArgs({ device }),
        '-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=1',
        '-frames:v', '1',
        ...(filter ? ['-vf', filter] : []),
        '-c:v', encoder,
        '-f', 'null', '-',
    ];
    try {
        await runner(ffmpegPath, args, { timeoutMs });
        return true;
    } catch {
        return false;
    }
};

export const detectFfmpegCapabilities = async ({
    ffmpegPath = 'ffmpeg',
    runner = spawnCommand,
    syntheticOutput,
    testAdapter,
    runSyntheticTests = syntheticOutput == null,
    vaapiDevice = '/dev/dri/renderD128',
    timeoutMs = 30_000,
} = {}) => {
    const listing = syntheticOutput == null
        ? await runner(ffmpegPath, ['-hide_banner', '-encoders'], { timeoutMs })
        : { stdout: String(syntheticOutput), stderr: '' };
    const output = `${listing.stdout || ''}\n${listing.stderr || ''}`;
    const capabilities = { details: {} };
    for (const [name, selected] of Object.entries(MEDIA_ADAPTERS)) {
        const encoders = Object.values(selected.encoderCandidates)
            .flat()
            .filter((encoder) => encoderAvailable(output, encoder));
        let available = encoders.length > 0;
        if (available && name !== 'cpu' && (runSyntheticTests || typeof testAdapter === 'function')) {
            const tester = testAdapter || ((candidate, context) => {
                const codec = Object.entries(candidate.encoderCandidates)
                    .find(([, candidates]) => candidates.some((encoder) => context.encoders.includes(encoder)))?.[0] || 'h264';
                return runSyntheticHardwareTest(candidate, {
                    ffmpegPath,
                    runner,
                    timeoutMs,
                    device: vaapiDevice,
                    codec,
                });
            });
            available = !!(await tester(selected, { encoders, ffmpegPath, runner, timeoutMs, vaapiDevice }));
        }
        capabilities[name] = available;
        capabilities.details[name] = { label: selected.label, encoders, syntheticTested: name !== 'cpu' && runSyntheticTests };
    }
    return capabilities;
};

export const selectMediaAdapter = (preference = 'auto', capabilities = {}, codec = 'h264') => {
    const requested = String(preference || 'auto').toLowerCase();
    const logicalCodec = String(codec || 'h264').toLowerCase();
    const detected = !!capabilities.details;
    const supportsCodec = (name) => {
        if (!detected) return true;
        const advertised = capabilities.details[name]?.encoders || [];
        return (MEDIA_ADAPTERS[name]?.encoderCandidates?.[logicalCodec] || [])
            .some((encoder) => advertised.includes(encoder));
    };
    if (requested !== 'auto') {
        if (!MEDIA_ADAPTERS[requested]) throw new Error(`Unknown media adapter: ${requested}`);
        if (detected && !capabilities[requested]) throw new Error(`Media adapter is unavailable: ${requested}`);
        if (!supportsCodec(requested)) throw new Error(`${MEDIA_ADAPTERS[requested].label} does not support ${logicalCodec.toUpperCase()}`);
        return MEDIA_ADAPTERS[requested];
    }
    for (const name of ['nvenc', 'qsv', 'intel-vaapi', 'vaapi', 'cpu']) {
        if ((capabilities[name] || (!detected && name === 'cpu')) && supportsCodec(name)) return MEDIA_ADAPTERS[name];
    }
    throw new Error('No supported FFmpeg video encoder is available');
};

export const createSyntheticAdapterTest = (availability = {}) => async (selected) => availability[selected.name] !== false;
