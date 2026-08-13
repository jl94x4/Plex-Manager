import assert from 'node:assert/strict';
import test from 'node:test';
import { PNG } from 'pngjs';
import { makeCircularPwaIconPng } from './circular-icon.js';

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
