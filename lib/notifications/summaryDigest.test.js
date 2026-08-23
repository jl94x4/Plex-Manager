import assert from 'node:assert/strict';
import test from 'node:test';
import {
    collectUptimeMetrics,
    computeServiceUptimePct,
    formatSummaryTeaser,
    normalizeSummaryConfig,
    resolveSummaryPeriod,
    shouldSendSummaryNow,
} from './summaryDigest.js';

test('normalizeSummaryConfig applies defaults', () => {
    const config = normalizeSummaryConfig({
        summaryNotifyEnabled: true,
        summaryNotifyFrequency: 'weekly',
        summaryNotifyDay: 1,
        summaryNotifyTime: '23:30',
    });
    assert.equal(config.enabled, true);
    assert.equal(config.frequency, 'weekly');
    assert.equal(config.time, '23:30');
    assert.equal(config.inApp, true);
});

test('resolveSummaryPeriod labels scale with frequency', () => {
    const daily = resolveSummaryPeriod({ summaryNotifyFrequency: 'daily' });
    assert.equal(daily.periodLabel, 'Today');
    const monthly = resolveSummaryPeriod({ summaryNotifyFrequency: 'monthly' });
    assert.equal(monthly.periodLabel, 'This month');
});

test('computeServiceUptimePct reads daily history', () => {
    const now = Date.parse('2026-08-23T23:00:00.000Z');
    const service = {
        dailyHistory: {
            '2026-08-22': { up: 90, total: 100 },
            '2026-08-23': { up: 95, total: 100 },
        },
    };
    const pct = computeServiceUptimePct(service, 7 * 24 * 60 * 60 * 1000, now);
    assert.ok(pct != null && pct > 90);
});

test('collectUptimeMetrics finds named services', () => {
    const metrics = collectUptimeMetrics({
        healthData: {
            plex: {
                uptimePercentage: 99.87,
                dailyHistory: { '2026-08-23': { up: 9987, total: 10000 } },
            },
            sonarr: {
                uptimePercentage: 99,
                dailyHistory: { '2026-08-23': { up: 9900, total: 10000 } },
            },
        },
        statusConfig: {
            services: [
                { id: 'plex', name: 'Plex' },
                { id: 'sonarr', name: 'Sonarr' },
            ],
        },
        periodMs: 24 * 60 * 60 * 1000,
        now: Date.parse('2026-08-23T23:00:00.000Z'),
    });
    assert.equal(metrics.plex?.label, 'Plex');
    assert.ok((metrics.plex?.uptimePct || 0) > 99);
});

test('shouldSendSummaryNow respects schedule and last sent date', () => {
    const config = {
        summaryNotifyEnabled: true,
        summaryNotifyFrequency: 'daily',
        summaryNotifyTime: '08:00',
        lastSummarySent: '2026-08-23',
    };
    const dueMorning = new Date('2026-08-24T09:00:00');
    assert.equal(shouldSendSummaryNow(config, dueMorning), true);
    const alreadySent = new Date('2026-08-23T23:00:00');
    assert.equal(shouldSendSummaryNow(config, alreadySent), false);
});

test('formatSummaryTeaser builds compact body', () => {
    const teaser = formatSummaryTeaser({
        metrics: {
            uptime: { plex: { uptimePct: 99.87 } },
            requests: { made: 4, approved: 2 },
            scannerImports: 1,
        },
    });
    assert.match(teaser, /Plex 99\.87%/);
    assert.match(teaser, /approved/);
});
