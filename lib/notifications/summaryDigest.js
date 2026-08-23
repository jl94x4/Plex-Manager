/**
 * Smart summary digest — scheduled server snapshot for admins.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { SUMMARY_DIGEST_HISTORY_PATH } from '../data-paths.js';
import { createInAppNotification } from './inAppStore.js';
import { sendWebPushToUser } from './webPush.js';
import { resolvePortalPushIconUrl } from '../portal-branding.js';

const MAX_HISTORY = 30;
const FREQUENCIES = new Set(['disabled', 'daily', 'weekly', 'monthly']);
const PERIOD_MS = {
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000,
};

export const DEFAULT_SUMMARY_METRICS = {
    uptime: true,
    requests: true,
    scannerImports: true,
    collexionsRotations: true,
    mediaAutomationJobs: true,
    highlights: true,
};

export const normalizeSummaryFrequency = (value, fallback = 'disabled') => {
    const normalized = String(value || '').trim().toLowerCase();
    return FREQUENCIES.has(normalized) ? normalized : fallback;
};

export const normalizeSummaryTime = (value, fallback = '23:00') => {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return fallback;
    const hour = Math.min(23, Math.max(0, Number(match[1])));
    const minute = Math.min(59, Math.max(0, Number(match[2])));
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

export const normalizeSummaryMetrics = (value = {}) => ({
    ...DEFAULT_SUMMARY_METRICS,
    ...(value && typeof value === 'object' ? value : {}),
});

export const normalizeSummaryConfig = (config = {}) => ({
    enabled: config.summaryNotifyEnabled === true,
    frequency: normalizeSummaryFrequency(config.summaryNotifyFrequency),
    day: Math.max(0, Math.min(28, Number(config.summaryNotifyDay) || 0)),
    time: normalizeSummaryTime(config.summaryNotifyTime),
    inApp: config.summaryNotifyInApp !== false,
    webPush: config.summaryNotifyWebPush !== false,
    email: config.summaryNotifyEmail === true,
    metrics: normalizeSummaryMetrics(config.summaryMetrics),
});

const parseIsoMs = (value) => {
    const ms = Date.parse(String(value || ''));
    return Number.isFinite(ms) ? ms : 0;
};

const inPeriod = (iso, startMs, endMs) => {
    const ms = parseIsoMs(iso);
    return ms >= startMs && ms <= endMs;
};

export const resolveSummaryPeriod = (config = {}, now = new Date()) => {
    const { frequency } = normalizeSummaryConfig(config);
    const periodMs = PERIOD_MS[frequency] || PERIOD_MS.daily;
    const endMs = now.getTime();
    const startMs = endMs - periodMs;
    const labels = {
        daily: 'Today',
        weekly: 'This week',
        monthly: 'This month',
    };
    return {
        frequency,
        periodStart: new Date(startMs).toISOString(),
        periodEnd: new Date(endMs).toISOString(),
        periodMs,
        periodLabel: labels[frequency] || 'Summary',
    };
};

export const computeServiceUptimePct = (service = {}, periodMs = PERIOD_MS.daily, now = Date.now()) => {
    if (!service || typeof service !== 'object') return null;
    const cutoff = now - periodMs;
    let up = 0;
    let total = 0;
    if (periodMs <= PERIOD_MS.daily && service.hourlyHistory && typeof service.hourlyHistory === 'object') {
        for (const [key, stat] of Object.entries(service.hourlyHistory)) {
            const ts = Date.parse(key.includes('T') ? key : `${key}T00:00:00.000Z`);
            if (!Number.isFinite(ts) || ts < cutoff) continue;
            up += Number(stat?.up) || 0;
            total += Number(stat?.total) || 0;
        }
    }
    if (service.dailyHistory && typeof service.dailyHistory === 'object') {
        for (const [dateStr, stat] of Object.entries(service.dailyHistory)) {
            const ts = Date.parse(`${dateStr}T12:00:00.000Z`);
            if (!Number.isFinite(ts) || ts < cutoff - 86400000) continue;
            up += Number(stat?.up) || 0;
            total += Number(stat?.total) || 0;
        }
    }
    if (total <= 0) {
        const fallback = Number(service.uptimePercentage);
        return Number.isFinite(fallback) ? fallback : null;
    }
    return (up / total) * 100;
};

const matchServiceName = (name = '', patterns = []) => {
    const hay = String(name || '').toLowerCase();
    return patterns.some((pattern) => hay.includes(pattern));
};

export const collectUptimeMetrics = ({
    healthData = {},
    statusConfig = {},
    periodMs = PERIOD_MS.daily,
    now = Date.now(),
} = {}) => {
    const services = Array.isArray(statusConfig?.services) ? statusConfig.services : [];
    const byName = new Map(services.map((service) => [String(service.id), service]));
    const rows = [];
    for (const [serviceId, record] of Object.entries(healthData || {})) {
        if (serviceId === '_meta' || !record) continue;
        const meta = byName.get(String(serviceId));
        const label = meta?.name || serviceId;
        const pct = computeServiceUptimePct(record, periodMs, now);
        if (pct == null) continue;
        rows.push({ id: serviceId, label, uptimePct: pct });
    }
    rows.sort((a, b) => a.label.localeCompare(b.label));
    const pick = (patterns) => rows.find((row) => matchServiceName(row.label, patterns)) || null;
    return {
        services: rows.slice(0, 12),
        plex: pick(['plex', 'jellyfin', 'emby']),
        sonarr: pick(['sonarr']),
        radarr: pick(['radarr']),
        aggregatePct: rows.length
            ? rows.reduce((sum, row) => sum + row.uptimePct, 0) / rows.length
            : null,
    };
};

export const countRequestsInPeriod = async ({
    periodStart,
    periodEnd,
    listPortalRequests,
    countAuditEvents,
} = {}) => {
    const startMs = parseIsoMs(periodStart);
    const endMs = parseIsoMs(periodEnd);
    const counts = {
        made: 0,
        approved: 0,
        declined: 0,
        available: 0,
    };
    const highlights = [];

    if (typeof listPortalRequests === 'function') {
        const records = await listPortalRequests().catch(() => []);
        for (const record of records) {
            const createdAt = record?.createdAt || record?.updatedAt;
            const updatedAt = record?.updatedAt || record?.createdAt;
            const status = String(record?.status || '').toLowerCase();
            if (inPeriod(createdAt, startMs, endMs)) {
                counts.made += 1;
                if (highlights.length < 5) {
                    highlights.push({
                        kind: 'request',
                        title: record?.title || record?.mediaTitle || 'Request',
                        subtitle: status,
                        at: createdAt,
                        posterPath: record?.posterPath || record?.meta?.posterPath || null,
                        backdropPath: record?.backdropPath || record?.meta?.backdropPath || null,
                        mediaType: record?.mediaType || null,
                    });
                }
            }
            if (inPeriod(updatedAt, startMs, endMs)) {
                if (status === 'approved' || status === 'processing') counts.approved += 1;
                if (status === 'declined') counts.declined += 1;
                if (status === 'available' || status === 'completed') counts.available += 1;
            }
        }
    }

    if (typeof countAuditEvents === 'function') {
        const audit = await countAuditEvents({ startMs, endMs });
        counts.approved = Math.max(counts.approved, audit.request_approved || 0);
        counts.declined = Math.max(counts.declined, audit.request_declined || 0);
    }

    return { counts, highlights };
};

export const countScannerImportsInPeriod = async ({ periodStart, periodEnd, listScannerLog } = {}) => {
    const startMs = parseIsoMs(periodStart);
    const endMs = parseIsoMs(periodEnd);
    if (typeof listScannerLog !== 'function') return 0;
    const { entries = [] } = await listScannerLog(500).catch(() => ({ entries: [] }));
    return entries.filter((entry) => {
        const action = String(entry?.action || entry?.event || '').toLowerCase();
        if (!action.includes('import')) return false;
        return inPeriod(entry?.at || entry?.timestamp, startMs, endMs);
    }).length;
};

export const countCollexionsRotationsInPeriod = async ({
    periodStart,
    periodEnd,
    fetchCollexionsHistory,
} = {}) => {
    const startMs = parseIsoMs(periodStart);
    const endMs = parseIsoMs(periodEnd);
    if (typeof fetchCollexionsHistory !== 'function') return 0;
    const payload = await fetchCollexionsHistory(100).catch(() => ({ events: [] }));
    const events = Array.isArray(payload?.events) ? payload.events : [];
    return events.filter((event) => inPeriod(event?.timestamp || event?.at || event?.created_at, startMs, endMs)).length;
};

export const countMediaAutomationJobsInPeriod = async ({
    periodStart,
    periodEnd,
    listMediaAutomationActivity,
} = {}) => {
    const startMs = parseIsoMs(periodStart);
    const endMs = parseIsoMs(periodEnd);
    if (typeof listMediaAutomationActivity !== 'function') return 0;
    const entries = await listMediaAutomationActivity(500).catch(() => []);
    return entries.filter((entry) => {
        const type = String(entry?.type || '');
        if (!type.endsWith('.completed')) return false;
        return inPeriod(entry?.at || entry?.createdAt, startMs, endMs);
    }).length;
};

export const buildSummaryDigest = async (config = {}, deps = {}) => {
    const summaryConfig = normalizeSummaryConfig(config);
    const period = resolveSummaryPeriod(config);
    const metricsEnabled = summaryConfig.metrics;
    const digest = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        frequency: period.frequency,
        periodLabel: period.periodLabel,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        metrics: {},
        highlights: [],
    };

    if (metricsEnabled.uptime) {
        digest.metrics.uptime = collectUptimeMetrics({
            healthData: deps.healthData || {},
            statusConfig: deps.statusConfig || {},
            periodMs: period.periodMs,
        });
    }

    if (metricsEnabled.requests) {
        const { counts, highlights } = await countRequestsInPeriod({
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            listPortalRequests: deps.listPortalRequests,
            countAuditEvents: deps.countAuditEvents,
        });
        digest.metrics.requests = counts;
        if (metricsEnabled.highlights) digest.highlights.push(...highlights);
    }

    if (metricsEnabled.scannerImports) {
        digest.metrics.scannerImports = await countScannerImportsInPeriod({
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            listScannerLog: deps.listScannerLog,
        });
    }

    if (metricsEnabled.collexionsRotations) {
        digest.metrics.collexionsRotations = await countCollexionsRotationsInPeriod({
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            fetchCollexionsHistory: deps.fetchCollexionsHistory,
        });
    }

    if (metricsEnabled.mediaAutomationJobs) {
        digest.metrics.mediaAutomationJobs = await countMediaAutomationJobsInPeriod({
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            listMediaAutomationActivity: deps.listMediaAutomationActivity,
        });
    }

    return digest;
};

const emptyHistory = () => ({ version: 1, updatedAt: null, items: [] });

export const loadSummaryDigestHistory = async (filePath = SUMMARY_DIGEST_HISTORY_PATH) => {
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return emptyHistory();
        if (!Array.isArray(parsed.items)) parsed.items = [];
        return parsed;
    } catch {
        return emptyHistory();
    }
};

const writeHistoryAtomic = async (filePath, value) => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    try {
        await fs.rename(temporary, filePath);
    } finally {
        await fs.rm(temporary, { force: true }).catch(() => {});
    }
};

export const saveSummaryDigest = async (digest, filePath = SUMMARY_DIGEST_HISTORY_PATH) => {
    const state = await loadSummaryDigestHistory(filePath);
    state.items = [digest, ...state.items.filter((item) => item?.id !== digest.id)].slice(0, MAX_HISTORY);
    state.updatedAt = new Date().toISOString();
    await writeHistoryAtomic(filePath, state);
    return digest;
};

export const getLatestSummaryDigest = async (filePath = SUMMARY_DIGEST_HISTORY_PATH) => {
    const state = await loadSummaryDigestHistory(filePath);
    return state.items[0] || null;
};

export const getSummaryDigestById = async (id, filePath = SUMMARY_DIGEST_HISTORY_PATH) => {
    const state = await loadSummaryDigestHistory(filePath);
    return state.items.find((item) => String(item?.id) === String(id)) || null;
};

export const listSummaryDigestHistory = async (limit = 7, filePath = SUMMARY_DIGEST_HISTORY_PATH) => {
    const state = await loadSummaryDigestHistory(filePath);
    return state.items.slice(0, Math.max(1, Math.min(MAX_HISTORY, Number(limit) || 7)));
};

const formatPct = (value) => (value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(2)}%`);

export const formatSummaryTeaser = (digest = {}) => {
    const parts = [];
    const uptime = digest?.metrics?.uptime;
    if (uptime?.plex?.uptimePct != null) parts.push(`Plex ${formatPct(uptime.plex.uptimePct)}`);
    else if (uptime?.aggregatePct != null) parts.push(`Uptime ${formatPct(uptime.aggregatePct)}`);
    const requests = digest?.metrics?.requests;
    if (requests?.approved) parts.push(`${requests.approved} approved`);
    if (requests?.made) parts.push(`${requests.made} requests`);
    if (digest?.metrics?.scannerImports) parts.push(`${digest.metrics.scannerImports} imports`);
    if (digest?.metrics?.collexionsRotations) parts.push(`${digest.metrics.collexionsRotations} rotations`);
    if (digest?.metrics?.mediaAutomationJobs) parts.push(`${digest.metrics.mediaAutomationJobs} encodes`);
    return parts.slice(0, 4).join(' · ') || 'Tap to view your server summary';
};

export const shouldSendSummaryNow = (config = {}, now = new Date()) => {
    const summary = normalizeSummaryConfig(config);
    if (!summary.enabled || summary.frequency === 'disabled') return false;

    const [hourStr, minuteStr] = summary.time.split(':');
    const targetHour = Number(hourStr);
    const targetMinute = Number(minuteStr);
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    if (currentHour < targetHour || (currentHour === targetHour && currentMinute < targetMinute)) {
        return false;
    }

    const dateStr = now.toISOString().split('T')[0];
    if (config.lastSummarySent === dateStr) return false;

    const dayOfWeek = now.getDay();
    const dayOfMonth = now.getDate();
    if (summary.frequency === 'daily') return true;
    if (summary.frequency === 'weekly') return dayOfWeek === Number(summary.day);
    if (summary.frequency === 'monthly') return dayOfMonth === Number(summary.day);
    return false;
};

const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const generateSummaryDigestHtml = (digest = {}, config = {}, { publicBase = '' } = {}) => {
    const teaser = formatSummaryTeaser(digest);
    const uptimeRows = (digest?.metrics?.uptime?.services || [])
        .map((row) => `<tr><td style="padding:8px 0;color:#d1d5db;">${escapeHtml(row.label)}</td><td style="padding:8px 0;color:#22c55e;text-align:right;font-weight:700;">${formatPct(row.uptimePct)}</td></tr>`)
        .join('');
    const requests = digest?.metrics?.requests || {};
    const summaryUrl = publicBase ? `${publicBase.replace(/\/+$/, '')}/portal?summary=${encodeURIComponent(digest.id || 'latest')}` : '/portal?summary=latest';
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Server Summary</title></head>
<body style="margin:0;padding:0;background:#000;font-family:Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#000;"><tr><td align="center" style="padding:24px 12px;">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#0b0f19;border-radius:12px;overflow:hidden;">
      <tr><td style="padding:28px 24px;border-bottom:1px solid #1f2937;">
        <h1 style="margin:0;color:#eab308;font-size:22px;">${escapeHtml(digest.periodLabel || 'Server Summary')}</h1>
        <p style="margin:8px 0 0;color:#9ca3af;font-size:14px;">${escapeHtml(teaser)}</p>
      </td></tr>
      <tr><td style="padding:24px;">
        <h2 style="margin:0 0 12px;color:#eab308;font-size:14px;text-transform:uppercase;letter-spacing:1px;">Uptime</h2>
        <table width="100%" cellpadding="0" cellspacing="0">${uptimeRows || '<tr><td style="color:#9ca3af;">No uptime data</td></tr>'}</table>
        <h2 style="margin:24px 0 12px;color:#eab308;font-size:14px;text-transform:uppercase;letter-spacing:1px;">Activity</h2>
        <p style="margin:0;color:#fff;font-size:15px;"><strong>${Number(requests.made || 0)}</strong> requests made</p>
        <p style="margin:6px 0 0;color:#fff;font-size:15px;"><strong>${Number(requests.approved || 0)}</strong> approved · <strong>${Number(requests.available || 0)}</strong> available</p>
        <p style="margin:6px 0 0;color:#fff;font-size:15px;"><strong>${Number(digest?.metrics?.scannerImports || 0)}</strong> scanner imports · <strong>${Number(digest?.metrics?.collexionsRotations || 0)}</strong> ColleXions rotations</p>
        <p style="margin:6px 0 0;color:#fff;font-size:15px;"><strong>${Number(digest?.metrics?.mediaAutomationJobs || 0)}</strong> media automation jobs completed</p>
      </td></tr>
      <tr><td align="center" style="padding:20px 24px 28px;">
        <a href="${escapeHtml(summaryUrl)}" style="display:inline-block;background:#eab308;color:#111827;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px;">Open summary card</a>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
};

export const dispatchSummaryDigest = async ({
    config = {},
    digest,
    users = [],
    profile = {},
    log = () => {},
    createInApp = createInAppNotification,
    sendWebPush = sendWebPushToUser,
    sendEmail,
    publicBase = '',
} = {}) => {
    const summary = normalizeSummaryConfig(config);
    const href = `/portal?summary=${encodeURIComponent(digest.id)}`;
    const title = `${digest.periodLabel || 'Server'} summary`;
    const body = formatSummaryTeaser(digest);
    const iconUrl = resolvePortalPushIconUrl(config, profile, publicBase);
    const admins = (Array.isArray(users) ? users : []).filter((user) => user?.isAdmin && user?.id);
    let inAppCreated = 0;
    let webPushSent = 0;
    let emailSent = 0;

    for (const admin of admins) {
        if (admin.notifySummaryDigest === false) continue;
        if (summary.inApp) {
            try {
                const created = await createInApp({
                    userId: admin.id,
                    type: 'summary_digest',
                    title,
                    body,
                    href,
                    meta: {
                        digestId: digest.id,
                        periodLabel: digest.periodLabel,
                        skipWebPush: !summary.webPush,
                        dedupe: false,
                    },
                });
                if (created) inAppCreated += 1;
            } catch (error) {
                log(`[summary-digest] in-app failed for ${admin.id}: ${error?.message || error}`);
            }
        }
        if (summary.webPush && admin.notifyWebPush !== false) {
            try {
                const result = await sendWebPush(admin.id, {
                    title,
                    body,
                    href,
                    type: 'summary_digest',
                    tag: `summary-digest-${digest.id}`,
                    ...(iconUrl ? { icon: iconUrl } : {}),
                }, { config, user: admin, profile, log });
                if ((result?.sent || 0) > 0) webPushSent += 1;
            } catch (error) {
                log(`[summary-digest] web push failed for ${admin.id}: ${error?.message || error}`);
            }
        }
        if (summary.email && admin.email && typeof sendEmail === 'function') {
            try {
                const html = generateSummaryDigestHtml(digest, config, { publicBase });
                const sent = await sendEmail(config, admin.email, title, html);
                if (sent) emailSent += 1;
            } catch (error) {
                log(`[summary-digest] email failed for ${admin.email}: ${error?.message || error}`);
            }
        }
    }

    return { inAppCreated, webPushSent, emailSent };
};

export const runSummaryDigestCycle = async (config = {}, deps = {}) => {
    const summary = normalizeSummaryConfig(config);
    if ((!summary.enabled || summary.frequency === 'disabled') && !deps.force) {
        return { skipped: 'disabled' };
    }
    const now = deps.now instanceof Date ? deps.now : new Date();
    if (!deps.force && !shouldSendSummaryNow(config, now)) {
        return { skipped: 'not-due' };
    }

    const digest = await buildSummaryDigest(config, deps);
    await saveSummaryDigest(digest, deps.historyPath);
    const dispatch = await dispatchSummaryDigest({
        config,
        digest,
        users: deps.users || [],
        profile: deps.profile || {},
        log: deps.log,
        createInApp: deps.createInApp,
        sendWebPush: deps.sendWebPush,
        sendEmail: deps.sendEmail,
        publicBase: deps.publicBase || '',
    });

    return {
        digestId: digest.id,
        dispatch,
        markedSent: true,
    };
};
