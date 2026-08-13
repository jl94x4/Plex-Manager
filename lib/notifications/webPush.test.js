import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveVapidSubject } from './webPush.js';

test('resolveVapidSubject prefers https public domain over localhost mailto', () => {
    assert.equal(
        resolveVapidSubject({ publicDomain: 'https://portal.example.com/' }, { subject: 'mailto:portal@localhost' }),
        'https://portal.example.com',
    );
});

test('resolveVapidSubject prefixes host-only publicDomain with https', () => {
    assert.equal(
        resolveVapidSubject({ publicDomain: 'portal.example.com' }),
        'https://portal.example.com',
    );
});

test('resolveVapidSubject uses smtp from when no public URL', () => {
    assert.equal(
        resolveVapidSubject({ smtpFrom: 'Server Portal <admin@myserver.com>' }),
        'mailto:admin@myserver.com',
    );
});

test('resolveVapidSubject ignores localhost mailto keys', () => {
    assert.equal(
        resolveVapidSubject({}, { subject: 'mailto:portal@localhost' }),
        'mailto:admin@example.com',
    );
});
