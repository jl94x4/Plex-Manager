import assert from 'node:assert/strict';
import test from 'node:test';
import { createSwrCache } from './swr-cache.js';

test('createSwrCache returns fresh value within freshMs', async () => {
    let calls = 0;
    const cache = createSwrCache({ name: 'fresh' });
    const first = await cache.get('k', async () => {
        calls += 1;
        return { n: calls };
    }, { freshMs: 50, staleMs: 200 });
    assert.equal(first.stale, false);
    assert.equal(first.value.n, 1);

    const second = await cache.get('k', async () => {
        calls += 1;
        return { n: calls };
    }, { freshMs: 50, staleMs: 200 });
    assert.equal(second.stale, false);
    assert.equal(second.value.n, 1);
    assert.equal(calls, 1);
});

test('createSwrCache serves stale and revalidates in background', async () => {
    let calls = 0;
    const cache = createSwrCache({ name: 'stale' });
    await cache.get('k', async () => {
        calls += 1;
        return { n: calls };
    }, { freshMs: 5, staleMs: 500 });

    await new Promise((resolve) => setTimeout(resolve, 10));
    const stale = await cache.get('k', async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        calls += 1;
        return { n: calls };
    }, { freshMs: 5, staleMs: 500 });

    assert.equal(stale.stale, true);
    assert.equal(stale.value.n, 1);
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(calls, 2);
    assert.equal(cache.peek('k')?.value?.n, 2);
});

test('createSwrCache put warms without fetcher', async () => {
    const cache = createSwrCache({ name: 'put' });
    cache.put('sessions', { ok: true });
    const hit = await cache.get('sessions', async () => ({ ok: false }), { freshMs: 1000, staleMs: 5000 });
    assert.equal(hit.value.ok, true);
    assert.equal(hit.stale, false);
});
