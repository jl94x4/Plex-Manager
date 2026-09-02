/**
 * Automated email template render + resolve.
 */

import {
    DEFAULT_EMAIL_TEMPLATES,
    EMAIL_EVENT_FIELDS,
    EMAIL_TEMPLATE_EVENTS,
    EMAIL_TEMPLATE_FIELDS,
} from './defaults.js';

const TOKEN_RE = /\{([a-z_]+)\}/gi;

export const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const renderEmailTemplate = (template, vars = {}) => {
    const source = template == null ? '' : String(template);
    return source.replace(TOKEN_RE, (_, key) => {
        const value = vars[key];
        if (value == null) return '';
        return String(value);
    });
};

const daysLabel = (days) => {
    const n = Number(days);
    if (!Number.isFinite(n)) return '';
    return `${n} day${n === 1 ? '' : 's'}`;
};

export const buildEmailVars = ({
    username = '',
    email = '',
    days = null,
    expiryDate = '',
    newExpiryDate = '',
    timeRemaining = '',
    status = '',
    serverName = 'Plex Server',
    contactUrl = '',
    contactEmail = '',
    contactWhatsApp = '',
    inviteUrl = '',
    durationDays = '',
    announcement = '',
    html = true,
} = {}) => {
    const wrap = html ? escapeHtml : (value) => String(value == null ? '' : value);
    const daysValue = days == null || days === '' ? '' : String(Number(days));
    return {
        username: wrap(username || 'there'),
        email: wrap(email || ''),
        days: wrap(daysValue),
        days_label: wrap(daysLabel(days)),
        expiry_date: wrap(expiryDate || ''),
        new_expiry_date: wrap(newExpiryDate || expiryDate || 'Unlimited'),
        time_remaining: wrap(timeRemaining || daysLabel(days)),
        status: wrap(status || ''),
        server_name: wrap(serverName || 'Plex Server'),
        contact_url: wrap(contactUrl || ''),
        contact_email: wrap(contactEmail || ''),
        contact_whatsapp: wrap(contactWhatsApp || ''),
        invite_url: wrap(inviteUrl || ''),
        duration_days: wrap(durationDays == null ? '' : String(durationDays)),
        announcement: wrap(announcement || ''),
    };
};

export const normalizeEmailTemplates = (raw = {}) => {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const event of EMAIL_TEMPLATE_EVENTS) {
        const incoming = raw[event];
        if (!incoming || typeof incoming !== 'object') continue;
        const allowed = new Set(EMAIL_EVENT_FIELDS[event] || EMAIL_TEMPLATE_FIELDS);
        const fields = {};
        for (const key of EMAIL_TEMPLATE_FIELDS) {
            if (!allowed.has(key)) continue;
            if (incoming[key] == null) continue;
            const value = String(incoming[key]).trim();
            if (!value) continue;
            fields[key] = value.slice(0, key === 'body' || key === 'intro' ? 4000 : 2000);
        }
        if (Object.keys(fields).length) out[event] = fields;
    }
    return out;
};

export const resolveEmailEventTemplates = (config = {}, event = 'expiry_warning') => {
    const defaults = DEFAULT_EMAIL_TEMPLATES[event] || {};
    const overrides = config?.emailTemplates?.[event] || {};
    const allowed = EMAIL_EVENT_FIELDS[event] || EMAIL_TEMPLATE_FIELDS;
    const merged = {};
    for (const key of allowed) {
        const override = overrides[key];
        if (override != null && String(override).trim()) {
            merged[key] = String(override);
        } else if (defaults[key] != null) {
            merged[key] = String(defaults[key]);
        }
    }
    return merged;
};

export const renderEmailEventTemplates = (config, event, varsInput = {}) => {
    const templates = resolveEmailEventTemplates(config, event);
    const plainVars = buildEmailVars({ ...varsInput, html: false });
    const htmlVars = buildEmailVars({ ...varsInput, html: true });
    const rendered = {};
    for (const [key, value] of Object.entries(templates)) {
        const vars = key === 'subject' ? plainVars : htmlVars;
        rendered[key] = renderEmailTemplate(value, vars);
    }
    return { templates, plainVars, htmlVars, rendered };
};

export default {
    renderEmailTemplate,
    buildEmailVars,
    normalizeEmailTemplates,
    resolveEmailEventTemplates,
    renderEmailEventTemplates,
    escapeHtml,
};
