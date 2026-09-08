import assert from 'node:assert/strict';
import test from 'node:test';
import { PNG } from 'pngjs';
import { makeCircularPwaIconPng, makeNotificationBadgePng } from './circular-icon.js';

const solidPng = (width, height, r, g, b, a = 255) => {
    const png = new PNG({ width, height });
    for (let i = 0; i < width * height; i += 1) {
        png.data[i * 4] = r;
        png.data[i * 4 + 1] = g;
        png.data[i * 4 + 2] = b;
        png.data[i * 4 + 3] = a;
    }
    return PNG.sync.write(png);
};

const pixelAt = (png, x, y) => {
    const i = (y * png.width + x) * 4;
    return { r: png.data[i], g: png.data[i + 1], b: png.data[i + 2], a: png.data[i + 3] };
};

test('favicon badgeScale 1 fills the canvas and leaves transparent corners', () => {
    const out = makeCircularPwaIconPng(solidPng(80, 80, 220, 40, 40), 64, { badgeScale: 1 });
    const png = PNG.sync.read(out);
    assert.equal(png.width, 64);
    assert.equal(png.height, 64);
    assert.equal(pixelAt(png, 0, 0).a, 0);
    assert.equal(pixelAt(png, 63, 0).a, 0);
    assert.equal(pixelAt(png, 0, 63).a, 0);
    assert.equal(pixelAt(png, 63, 63).a, 0);
    const center = pixelAt(png, 32, 32);
    assert.ok(center.a > 200);
    assert.ok(center.r > 180);
});

test('default PWA badgeScale pads the circle inside the canvas', () => {
    const out = makeCircularPwaIconPng(solidPng(80, 80, 220, 40, 40), 64);
    const png = PNG.sync.read(out);
    assert.equal(pixelAt(png, 2, 32).a, 0);
    const center = pixelAt(png, 32, 32);
    assert.ok(center.a > 200);
});

test('notification badge uses source alpha as a white silhouette', () => {
    const png = new PNG({ width: 32, height: 32 });
    for (let i = 0; i < 32 * 32; i += 1) {
        png.data[i * 4] = 0;
        png.data[i * 4 + 1] = 90;
        png.data[i * 4 + 2] = 200;
        png.data[i * 4 + 3] = 0;
    }
    for (let y = 8; y < 24; y += 1) {
        for (let x = 8; x < 24; x += 1) {
            const i = (y * 32 + x) * 4;
            png.data[i] = 0;
            png.data[i + 1] = 90;
            png.data[i + 2] = 200;
            png.data[i + 3] = 255;
        }
    }
    const out = PNG.sync.read(makeNotificationBadgePng(PNG.sync.write(png), 64));
    assert.equal(pixelAt(out, 0, 0).a, 0);
    const center = pixelAt(out, 32, 32);
    assert.equal(center.r, 255);
    assert.equal(center.g, 255);
    assert.equal(center.b, 255);
    assert.equal(center.a, 255);
});
