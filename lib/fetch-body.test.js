import assert from 'node:assert/strict';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import {
    PROXY_IMAGE_MAX_BYTES,
    discardFetchBody,
    pipeFetchBodyToResponse,
    sendFetchImage,
} from './fetch-body.js';

test('discardFetchBody cancels a web stream body', async () => {
    let cancelled = false;
    const body = {
        cancel: async () => {
            cancelled = true;
        },
    };
    discardFetchBody({ bodyUsed: false, body });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(cancelled, true);
});

test('discardFetchBody is a no-op when the body was already used', () => {
    let cancelled = false;
    discardFetchBody({
        bodyUsed: true,
        body: {
            cancel: () => {
                cancelled = true;
            },
        },
    });
    assert.equal(cancelled, false);
});

test('pipeFetchBodyToResponse streams a node body without buffering the whole payload', async () => {
    const source = Readable.from([Buffer.from('abc'), Buffer.from('def')]);
    const dest = new PassThrough();
    const chunks = [];
    dest.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    const done = new Promise((resolve, reject) => {
        dest.on('finish', resolve);
        dest.on('error', reject);
    });
    await pipeFetchBodyToResponse({ body: source }, dest, { maxBytes: 64 });
    await done;
    assert.equal(Buffer.concat(chunks).toString(), 'abcdef');
});

test('pipeFetchBodyToResponse aborts when the body exceeds maxBytes', async () => {
    const source = Readable.from([Buffer.alloc(32, 1), Buffer.alloc(32, 2)]);
    const dest = new PassThrough();
    dest.resume();
    await assert.rejects(
        () => pipeFetchBodyToResponse({ body: source }, dest, { maxBytes: 40 }),
        (error) => error.code === 'FETCH_BODY_TOO_LARGE',
    );
});

test('sendFetchImage discards non-ok responses and does not pipe them', async () => {
    let cancelled = false;
    const res = {
        headersSent: false,
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        send(body) {
            this.body = body;
            return this;
        },
        setHeader() {},
    };
    const ok = await sendFetchImage(res, {
        ok: false,
        status: 404,
        bodyUsed: false,
        body: {
            cancel: async () => {
                cancelled = true;
            },
        },
        headers: { get: () => 'image/jpeg' },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(ok, false);
    assert.equal(res.statusCode, 404);
    assert.equal(cancelled, true);
});

test('PROXY_IMAGE_MAX_BYTES stays at 8MB', () => {
    assert.equal(PROXY_IMAGE_MAX_BYTES, 8 * 1024 * 1024);
});
