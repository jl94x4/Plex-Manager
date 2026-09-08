import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

const isPng = (buffer) => (
    Buffer.isBuffer(buffer)
    && buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
);

const isJpeg = (buffer) => (
    Buffer.isBuffer(buffer)
    && buffer.length >= 3
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff
);

const decodeRaster = (buffer) => {
    if (isPng(buffer)) {
        const png = PNG.sync.read(buffer);
        return { width: png.width, height: png.height, data: png.data };
    }
    if (isJpeg(buffer)) {
        const decoded = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 64 });
        return { width: decoded.width, height: decoded.height, data: Buffer.from(decoded.data) };
    }
    return null;
};

/**
 * Cover-crop source into a circular badge, then scale the whole badge down on a
 * transparent square canvas (circle + contents shrink together).
 *
 * @param {Buffer} inputBuffer
 * @param {number} [size=192]
 * @param {{ badgeScale?: number }} [options] `badgeScale` 0.78 pads PWA launcher
 *   icons; 1 fills the canvas (favicons / in-app tab icon).
 */
export const makeCircularPwaIconPng = (inputBuffer, size = 192, { badgeScale = 0.78 } = {}) => {
    const s = Math.max(64, Math.min(1024, Number(size) || 192));
    const decoded = decodeRaster(inputBuffer);
    if (!decoded?.width || !decoded?.height || !decoded?.data?.length) {
        throw new Error('Unsupported image for circular PWA icon');
    }

    const scaleFactor = Math.max(0.5, Math.min(1, Number(badgeScale) || 0.78));
    const badgeSize = Math.max(32, Math.round(s * scaleFactor));
    const badgeOffset = Math.floor((s - badgeSize) / 2);

    const { width: srcW, height: srcH, data: src } = decoded;
    const scale = Math.max(badgeSize / srcW, badgeSize / srcH);
    const sampleW = srcW * scale;
    const sampleH = srcH * scale;
    const offsetX = (sampleW - badgeSize) / 2;
    const offsetY = (sampleH - badgeSize) / 2;

    const out = Buffer.alloc(s * s * 4);
    const radius = badgeSize / 2;
    const cx = badgeOffset + radius - 0.5;
    const cy = badgeOffset + radius - 0.5;

    for (let y = 0; y < s; y += 1) {
        for (let x = 0; x < s; x += 1) {
            const outIdx = (y * s + x) * 4;
            const dx = x - cx;
            const dy = y - cy;
            const dist = Math.sqrt((dx * dx) + (dy * dy));
            if (dist > radius) {
                out[outIdx] = 0;
                out[outIdx + 1] = 0;
                out[outIdx + 2] = 0;
                out[outIdx + 3] = 0;
                continue;
            }

            const localX = x - badgeOffset;
            const localY = y - badgeOffset;
            const srcXf = (localX + offsetX) / scale;
            const srcYf = (localY + offsetY) / scale;
            const x0 = Math.max(0, Math.min(srcW - 1, Math.floor(srcXf)));
            const y0 = Math.max(0, Math.min(srcH - 1, Math.floor(srcYf)));
            const x1 = Math.max(0, Math.min(srcW - 1, x0 + 1));
            const y1 = Math.max(0, Math.min(srcH - 1, y0 + 1));
            const xWeight = srcXf - Math.floor(srcXf);
            const yWeight = srcYf - Math.floor(srcYf);

            const sample = (sx, sy) => {
                const idx = (sy * srcW + sx) * 4;
                return [src[idx], src[idx + 1], src[idx + 2], src[idx + 3]];
            };

            const c00 = sample(x0, y0);
            const c10 = sample(x1, y0);
            const c01 = sample(x0, y1);
            const c11 = sample(x1, y1);

            for (let channel = 0; channel < 4; channel += 1) {
                const top = (c00[channel] * (1 - xWeight)) + (c10[channel] * xWeight);
                const bottom = (c01[channel] * (1 - xWeight)) + (c11[channel] * xWeight);
                out[outIdx + channel] = Math.round((top * (1 - yWeight)) + (bottom * yWeight));
            }

            if (dist > radius - 1) {
                const edge = Math.max(0, Math.min(1, radius - dist));
                out[outIdx + 3] = Math.round(out[outIdx + 3] * edge);
            }
        }
    }

    const png = new PNG({ width: s, height: s });
    out.copy(png.data);
    return PNG.sync.write(png);
};

const fillSolid = (png, rgb) => {
    for (let i = 0; i < png.width * png.height; i += 1) {
        png.data[i * 4] = rgb[0];
        png.data[i * 4 + 1] = rgb[1];
        png.data[i * 4 + 2] = rgb[2];
        png.data[i * 4 + 3] = 255;
    }
};

const sampleCover = (decoded, localX, localY, sampleW, sampleH, offsetX, offsetY, scale) => {
    const { width: srcW, height: srcH, data: src } = decoded;
    const srcXf = (localX + offsetX) / scale;
    const srcYf = (localY + offsetY) / scale;
    const x0 = Math.max(0, Math.min(srcW - 1, Math.floor(srcXf)));
    const y0 = Math.max(0, Math.min(srcH - 1, Math.floor(srcYf)));
    const x1 = Math.max(0, Math.min(srcW - 1, x0 + 1));
    const y1 = Math.max(0, Math.min(srcH - 1, y0 + 1));
    const xWeight = srcXf - Math.floor(srcXf);
    const yWeight = srcYf - Math.floor(srcYf);
    const sample = (sx, sy) => {
        const idx = (sy * srcW + sx) * 4;
        return [src[idx], src[idx + 1], src[idx + 2], src[idx + 3]];
    };
    const c00 = sample(x0, y0);
    const c10 = sample(x1, y0);
    const c01 = sample(x0, y1);
    const c11 = sample(x1, y1);
    const out = [0, 0, 0, 0];
    for (let channel = 0; channel < 4; channel += 1) {
        const top = (c00[channel] * (1 - xWeight)) + (c10[channel] * xWeight);
        const bottom = (c01[channel] * (1 - xWeight)) + (c11[channel] * xWeight);
        out[channel] = Math.round((top * (1 - yWeight)) + (bottom * yWeight));
    }
    return out;
};

/**
 * Square launcher icon on an opaque background (application logo / maskable safe zone).
 */
export const makeSquarePaddedPwaIconPng = (inputBuffer, size = 192, { logoScale = 1.22, bg = [11, 15, 25] } = {}) => {
    const s = Math.max(64, Math.min(1024, Number(size) || 192));
    const decoded = decodeRaster(inputBuffer);
    if (!decoded?.width || !decoded?.height || !decoded?.data?.length) {
        throw new Error('Unsupported image for square PWA icon');
    }
    const draw = Math.max(32, Math.round(s * Math.max(0.5, Math.min(1.5, Number(logoScale) || 1.22))));
    const offset = Math.floor((s - draw) / 2);
    const { width: srcW, height: srcH } = decoded;
    const scale = Math.max(draw / srcW, draw / srcH);
    const sampleW = srcW * scale;
    const sampleH = srcH * scale;
    const offsetX = (sampleW - draw) / 2;
    const offsetY = (sampleH - draw) / 2;

    const png = new PNG({ width: s, height: s });
    fillSolid(png, bg);
    for (let y = 0; y < draw; y += 1) {
        for (let x = 0; x < draw; x += 1) {
            const [r, g, b, a] = sampleCover(decoded, x, y, sampleW, sampleH, offsetX, offsetY, scale);
            if (a <= 0) continue;
            const outIdx = ((y + offset) * s + (x + offset)) * 4;
            const alpha = a / 255;
            png.data[outIdx] = Math.round((r * alpha) + (bg[0] * (1 - alpha)));
            png.data[outIdx + 1] = Math.round((g * alpha) + (bg[1] * (1 - alpha)));
            png.data[outIdx + 2] = Math.round((b * alpha) + (bg[2] * (1 - alpha)));
            png.data[outIdx + 3] = 255;
        }
    }
    return PNG.sync.write(png);
};

/** Circular badge composited on an opaque launcher background (maskable). */
export const makeMaskablePwaIconPng = (inputBuffer, size = 512, { badgeScale = 0.88, bg = [11, 15, 25] } = {}) => {
    const circular = makeCircularPwaIconPng(inputBuffer, size, { badgeScale });
    const src = PNG.sync.read(circular);
    const out = new PNG({ width: size, height: size });
    fillSolid(out, bg);
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const idx = (y * size + x) * 4;
            const alpha = src.data[idx + 3] / 255;
            if (alpha <= 0) continue;
            out.data[idx] = Math.round((src.data[idx] * alpha) + (bg[0] * (1 - alpha)));
            out.data[idx + 1] = Math.round((src.data[idx + 1] * alpha) + (bg[1] * (1 - alpha)));
            out.data[idx + 2] = Math.round((src.data[idx + 2] * alpha) + (bg[2] * (1 - alpha)));
            out.data[idx + 3] = 255;
        }
    }
    return PNG.sync.write(out);
};

/**
 * Android Chrome status-bar icons (`Notification.badge`) are an alpha mask:
 * only white-on-transparent shapes render. Color circular PWA icons become a
 * solid disc. Build a silhouette from the configured logo instead.
 */
export const makeNotificationBadgePng = (inputBuffer, size = 96) => {
    const s = Math.max(48, Math.min(256, Number(size) || 96));
    const decoded = decodeRaster(inputBuffer);
    if (!decoded?.width || !decoded?.height || !decoded?.data?.length) {
        throw new Error('Unsupported image for notification badge');
    }

    const { width: srcW, height: srcH } = decoded;
    const fitScale = Math.min(s / srcW, s / srcH);
    const drawW = Math.max(1, Math.round(srcW * fitScale));
    const drawH = Math.max(1, Math.round(srcH * fitScale));
    const offX = Math.floor((s - drawW) / 2);
    const offY = Math.floor((s - drawH) / 2);

    const rgba = Buffer.alloc(s * s * 4);
    for (let y = 0; y < drawH; y += 1) {
        for (let x = 0; x < drawW; x += 1) {
            const [r, g, b, a] = sampleCover(decoded, x, y, srcW * fitScale, srcH * fitScale, 0, 0, fitScale);
            const idx = ((y + offY) * s + (x + offX)) * 4;
            rgba[idx] = r;
            rgba[idx + 1] = g;
            rgba[idx + 2] = b;
            rgba[idx + 3] = a;
        }
    }

    const at = (x, y) => {
        const idx = (y * s + x) * 4;
        return [rgba[idx], rgba[idx + 1], rgba[idx + 2], rgba[idx + 3]];
    };

    let transparent = 0;
    let opaque = 0;
    for (let y = offY; y < offY + drawH; y += 1) {
        for (let x = offX; x < offX + drawW; x += 1) {
            if (at(x, y)[3] < 40) transparent += 1;
            else opaque += 1;
        }
    }
    const useSourceAlpha = opaque > 0 && transparent / (transparent + opaque) > 0.08;

    const out = new PNG({ width: s, height: s });
    const writeWhite = (idx, alpha) => {
        out.data[idx] = 255;
        out.data[idx + 1] = 255;
        out.data[idx + 2] = 255;
        out.data[idx + 3] = alpha;
    };

    if (useSourceAlpha) {
        for (let i = 0; i < s * s; i += 1) {
            const a = rgba[i * 4 + 3];
            writeWhite(i * 4, a < 40 ? 0 : 255);
        }
        return PNG.sync.write(out);
    }

    const clamp = (value, max) => Math.max(0, Math.min(max, value));
    const corners = [
        at(offX, offY),
        at(clamp(offX + drawW - 1, s - 1), offY),
        at(offX, clamp(offY + drawH - 1, s - 1)),
        at(clamp(offX + drawW - 1, s - 1), clamp(offY + drawH - 1, s - 1)),
    ].filter((pixel) => pixel[3] > 40);
    const bg = corners.length
        ? corners.reduce((acc, pixel) => [
            acc[0] + pixel[0],
            acc[1] + pixel[1],
            acc[2] + pixel[2],
        ], [0, 0, 0]).map((channel) => channel / corners.length)
        : [0, 0, 0];
    const dist = (pixel) => Math.sqrt(
        ((pixel[0] - bg[0]) ** 2) + ((pixel[1] - bg[1]) ** 2) + ((pixel[2] - bg[2]) ** 2),
    );

    let kept = 0;
    const knockout = Buffer.alloc(s * s);
    for (let i = 0; i < s * s; i += 1) {
        const a = rgba[i * 4 + 3];
        const pixel = [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2], a];
        const keep = a >= 40 && dist(pixel) >= 48;
        knockout[i] = keep ? 1 : 0;
        if (keep) kept += 1;
    }

    if (kept < Math.max(16, Math.round(s * s * 0.08))) {
        for (let i = 0; i < s * s; i += 1) {
            writeWhite(i * 4, rgba[i * 4 + 3] >= 40 ? 255 : 0);
        }
        return PNG.sync.write(out);
    }

    for (let i = 0; i < s * s; i += 1) {
        writeWhite(i * 4, knockout[i] ? 255 : 0);
    }
    return PNG.sync.write(out);
};

