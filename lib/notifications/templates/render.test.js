import test from 'node:test';
import assert from 'node:assert/strict';
import {
    renderNotifyTemplate,
    buildNotifyVars,
    normalizeNotificationTemplates,
    resolveEventTemplates,
    renderEventTemplates,
} from './render.js';

test('renderNotifyTemplate replaces known tokens and blanks unknown', () => {
    const out = renderNotifyTemplate('Hello {user}, {title}{year} {missing}', {
        user: 'Alex',
        title: 'Dune',
        year: ' (2021)',
    });
    assert.equal(out, 'Hello Alex, Dune (2021) ');
});

test('normalizeNotificationTemplates keeps sparse overrides only', () => {
    const normalized = normalizeNotificationTemplates({
        available: { emailSubject: '  Custom {title}  ', pushTitle: '', weird: 'nope' },
        nope: { emailSubject: 'x' },
    });
    assert.deepEqual(normalized, {
        available: { emailSubject: 'Custom {title}' },
    });
});

test('resolveEventTemplates merges overrides over defaults', () => {
    const resolved = resolveEventTemplates({
        notificationTemplates: {
            approved: { pushTitle: 'Yep: {title}' },
        },
    }, 'approved');
    assert.equal(resolved.pushTitle, 'Yep: {title}');
    assert.ok(resolved.emailSubject.includes('{title}'));
});

test('renderEventTemplates builds season + decline vars', () => {
    const { rendered } = renderEventTemplates({}, 'season', {
        title: 'The Expanse',
        username: 'Jordan',
        mediaType: 'tv',
        seasonNumber: 3,
        serverName: 'Home',
    });
    assert.equal(rendered.pushTitle, 'Season 3 of The Expanse is available');
    assert.equal(rendered.pushBody, 'Season 3 of The Expanse is ready to watch.');

    const declined = renderEventTemplates({}, 'declined', {
        title: 'Movie',
        username: 'A',
        declineReason: 'Duplicate',
    });
    assert.match(declined.rendered.emailBody, /Reason: Duplicate/);
});

test('approved push copy includes the media title', () => {
    const { rendered } = renderEventTemplates({}, 'approved', {
        title: 'Dune',
        username: 'Jordan',
        mediaType: 'movie',
    });
    assert.equal(rendered.pushTitle, 'Approved: Dune');
    assert.equal(rendered.pushBody, 'Your request for Dune has been approved.');
});

test('buildNotifyVars maps media types', () => {
    const vars = buildNotifyVars({ mediaType: 'music', title: 'Album' });
    assert.equal(vars.media_type, 'album/artist');
    assert.equal(vars.title, 'Album');
});
