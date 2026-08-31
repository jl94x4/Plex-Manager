import assert from 'node:assert/strict';
import { focalFromFaces, formatBackgroundPosition } from './imageFocalPoint.ts';

const box = (x, y, width, height) => ({ boundingBox: { x, y, width, height } });

// Single face in upper third → focal sits near eye-line, not chin.
{
    const focal = focalFromFaces([box(400, 80, 120, 140)], 1000, 562);
    assert.ok(focal);
    assert.ok(focal.y < 28, `expected upper bias, got y=${focal.y}`);
    assert.ok(focal.y >= 6);
    assert.ok(focal.x > 40 && focal.x < 55);
}

// Tiny noise face should not dominate a large subject.
{
    const focal = focalFromFaces([
        box(100, 40, 180, 200),
        box(800, 400, 20, 24),
    ], 1000, 562);
    assert.ok(focal);
    assert.ok(focal.x < 40, `expected left subject, got x=${focal.x}`);
    assert.ok(focal.y < 30);
}

// Covered/lower secondary face should not pull crop down too far.
{
    const focal = focalFromFaces([
        box(200, 60, 150, 170),
        box(520, 90, 140, 160),
    ], 1000, 562);
    assert.ok(focal);
    assert.ok(focal.y <= 32);
}

assert.equal(formatBackgroundPosition({ x: 40, y: 18 }), '40% 18%');
assert.equal(formatBackgroundPosition(), '50% 22%');

console.log('image focal point ok');
