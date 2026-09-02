import assert from 'node:assert/strict';
import test from 'node:test';
import {
    normalizeEmailTemplates,
    renderEmailEventTemplates,
    buildExpiryWarningEmail,
    buildAccessExpiredEmail,
    buildInviteEmail,
    buildAnnouncementEmail,
    buildWelcomeEmail,
    buildAutomatedEmailPreview,
    DEFAULT_EMAIL_TEMPLATES,
} from './index.js';

test('normalizeEmailTemplates keeps sparse overrides and drops unknown events', () => {
    const normalized = normalizeEmailTemplates({
        expiry_warning: {
            subject: '  Custom subject {days_label}  ',
            body: '',
            unknown: 'nope',
        },
        not_a_real_event: { subject: 'x' },
    });
    assert.deepEqual(normalized, {
        expiry_warning: { subject: 'Custom subject {days_label}' },
    });
});

test('renderEmailEventTemplates substitutes tokens and preserves default HTML', () => {
    const { rendered } = renderEmailEventTemplates(
        {
            emailTemplates: {
                expiry_warning: {
                    subject: '[{server_name}] Expires in {days_label}',
                },
            },
        },
        'expiry_warning',
        {
            username: 'Vik <admin>',
            days: 3,
            expiryDate: 'September 5, 2026',
            serverName: 'BKFTV',
        },
    );
    assert.equal(rendered.subject, '[BKFTV] Expires in 3 days');
    assert.match(rendered.intro, /Vik &lt;admin&gt;/);
    assert.equal(rendered.headline, DEFAULT_EMAIL_TEMPLATES.expiry_warning.headline);
});

test('buildExpiryWarningEmail uses custom CTA and subject', () => {
    const mail = buildExpiryWarningEmail({
        config: {
            emailTemplates: {
                expiry_warning: {
                    subject: 'Hey {username} — {days_label} left',
                    ctaLabel: 'Renew now',
                },
            },
            contactUrl: 'https://example.com/help',
        },
        username: 'Alex',
        expiryDate: 'September 10, 2026',
        days: 1,
        serverName: 'Demo Server',
    });
    assert.equal(mail.subject, 'Hey Alex — 1 day left');
    assert.match(mail.html, /Renew now/);
    assert.match(mail.html, /September 10, 2026/);
    assert.match(mail.html, /https:\/\/example\.com\/help/);
});

test('buildAccessExpiredEmail includes contact block when configured', () => {
    const mail = buildAccessExpiredEmail({
        config: {
            contactEmail: 'owner@example.com',
            contactWhatsApp: '+1 555 0100',
        },
        username: 'Alex',
        expiryDate: 'September 1, 2026',
        serverName: 'Demo',
    });
    assert.match(mail.subject, /expired/i);
    assert.match(mail.html, /owner@example\.com/);
    assert.match(mail.html, /wa\.me\/15550100/);
});

test('buildInviteEmail and announcement use templates', () => {
    const invite = buildInviteEmail({
        config: {
            emailTemplates: {
                invite: { headline: 'Join {server_name}' },
            },
        },
        serverName: 'Cinema Club',
        inviteUrl: 'https://portal.example/invite/abc',
        durationDays: 7,
    });
    assert.match(invite.subject, /Cinema Club/);
    assert.match(invite.html, /Join Cinema Club/);
    assert.match(invite.html, /7 days/);

    const announcement = buildAnnouncementEmail({
        config: {
            emailTemplates: {
                announcement: { subject: 'News from {server_name}' },
            },
        },
        serverName: 'Cinema Club',
        announcementText: 'Library expanded <3',
    });
    assert.equal(announcement.subject, 'News from Cinema Club');
    assert.match(announcement.html, /Library expanded &lt;3/);
});

test('buildWelcomeEmail uses portal CTA from templates', () => {
    const mail = buildWelcomeEmail({
        config: {
            emailTemplates: {
                welcome: { headline: 'Hi from {server_name}' },
            },
        },
        username: 'Sam',
        serverName: 'Cinema Club',
        portalUrl: 'https://portal.example',
    });
    assert.match(mail.subject, /Cinema Club/);
    assert.match(mail.html, /Hi from Cinema Club/);
    assert.match(mail.html, /https:\/\/portal\.example/);
});

test('buildAutomatedEmailPreview merges draft fields', () => {
    const mail = buildAutomatedEmailPreview(
        { contactUrl: 'https://example.com/help' },
        'expiry_warning',
        { subject: 'Draft subject for {username}' },
    );
    assert.equal(mail.subject, 'Draft subject for Alex');
});
