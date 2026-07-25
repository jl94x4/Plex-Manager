import path from 'path';
import { CPU_ADAPTER, resolveAdapterEncoder } from './adapters.js';

const AUDIO_ENCODERS = new Set(['copy', 'aac', 'ac3', 'eac3', 'libopus', 'flac']);

const safeEncoder = (value, allowed, fallback) => allowed.has(String(value || '')) ? String(value) : fallback;

export const buildFfmpegPlan = ({
    inputPath,
    outputPath,
    rule = {},
    adapter = CPU_ADAPTER,
    capabilities = {},
    vaapiDevice,
    overwrite = true,
} = {}) => {
    if (!inputPath || !outputPath) throw new Error('inputPath and outputPath are required');
    if (path.resolve(inputPath) === path.resolve(outputPath)) throw new Error('FFmpeg output must differ from input');
    const action = rule.then && typeof rule.then === 'object' ? rule.then : rule.action || {};
    const mode = String(action.mode || 'remux').toLowerCase();
    if (!['remux', 'transcode'].includes(mode)) throw new Error(`Unsupported FFmpeg mode: ${mode}`);
    const args = ['-hide_banner', '-nostdin', '-loglevel', 'warning', '-progress', 'pipe:1'];
    if (overwrite) args.push('-y');
    else args.push('-n');
    if (mode === 'transcode') args.push(...adapter.inputArgs({ device: vaapiDevice }));
    args.push('-i', String(inputPath), '-map', '0', '-map_metadata', '0', '-map_chapters', '0');

    if (mode === 'remux') {
        args.push('-c', 'copy');
    } else {
        const logicalCodec = String(action.videoCodec || 'h264').toLowerCase();
        const audioEncoder = safeEncoder(action.audioCodec, AUDIO_ENCODERS, 'copy');
        if (logicalCodec === 'copy') {
            args.push('-c:v', 'copy');
        } else {
            const videoEncoder = resolveAdapterEncoder(adapter, logicalCodec, capabilities);
            args.push('-c:v', videoEncoder, ...adapter.outputArgs({
                codec: logicalCodec,
                preset: action.preset,
                crf: action.crf,
                videoBitrateKbps: action.videoBitrateKbps,
            }));
        }
        args.push('-c:a', audioEncoder);
        if (action.subtitleCodec === 'drop') args.push('-sn');
        else args.push('-c:s', safeEncoder(action.subtitleCodec, new Set(['copy', 'srt', 'webvtt']), 'copy'));
        if (Number.isFinite(Number(action.audioBitrateKbps)) && audioEncoder !== 'copy') {
            args.push('-b:a', `${Math.max(32, Math.min(1536, Math.round(Number(action.audioBitrateKbps))))}k`);
        }
        if (Number.isFinite(Number(action.maxWidth)) && Number(action.maxWidth) > 0) {
            const width = Math.max(2, Math.round(Number(action.maxWidth) / 2) * 2);
            const filter = adapter.filter({ maxWidth: width, device: vaapiDevice });
            if (filter) args.push('-vf', filter);
        }
    }
    args.push('-max_muxing_queue_size', '4096', String(outputPath));
    return {
        executable: 'ffmpeg',
        args,
        mode,
        adapter: mode === 'transcode' ? adapter.name : null,
        adapterLabel: mode === 'transcode' ? adapter.label : null,
        inputPath: String(inputPath),
        outputPath: String(outputPath),
    };
};

export default buildFfmpegPlan;
