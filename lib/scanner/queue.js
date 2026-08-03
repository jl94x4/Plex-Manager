import fs from 'fs/promises';
import path from 'path';
import { CONFIG_DIR } from '../data-paths.js';

export const SCANNER_DIR = path.join(CONFIG_DIR, 'scanner');
export const QUEUE_PATH = path.join(SCANNER_DIR, 'queue.json');
export const LOG_PATH = path.join(SCANNER_DIR, 'log.json');

const MAX_LOG = 500;

const ensureDir = async () => {
    await fs.mkdir(SCANNER_DIR, { recursive: true });
};

const readJson = async (filePath, fallback) => {
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
};

const writeJson = async (filePath, data) => {
    await ensureDir();
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
};

/**
 * @typedef {{
 *   folder: string,
 *   priority: number,
 *   time: string,
 *   source?: string,
 *   eventType?: string,
 *   action?: string,
 *   reason?: string,
 *   title?: string,
 *   quality?: string,
 *   isUpgrade?: boolean,
 * }} ScanItem
 */

const pickMeta = (item = {}) => ({
    source: item.source || 'unknown',
    eventType: item.eventType || undefined,
    action: item.action || undefined,
    reason: item.reason || undefined,
    title: item.title || undefined,
    quality: item.quality || undefined,
    isUpgrade: item.isUpgrade ? true : undefined,
});

export const listQueue = async () => {
    const data = await readJson(QUEUE_PATH, { scans: [] });
    return Array.isArray(data.scans) ? data.scans : [];
};

export const getQueueStats = async () => {
    const scans = await listQueue();
    const log = await readJson(LOG_PATH, { entries: [], processed: 0 });
    return {
        remaining: scans.length,
        processed: Number(log.processed) || 0,
        scans,
    };
};

/**
 * Upsert scans by folder. Higher priority wins; same priority keeps older time (Autoscan-like).
 * @param {ScanItem[]} items
 */
export const upsertScans = async (items = []) => {
    if (!items.length) return await listQueue();
    const scans = await listQueue();
    const byFolder = new Map(scans.map((s) => [s.folder, s]));

    for (const item of items) {
        const folder = String(item.folder || '').trim();
        if (!folder) continue;
        const next = {
            folder,
            priority: Number(item.priority) || 0,
            time: item.time || new Date().toISOString(),
            ...pickMeta(item),
        };
        const existing = byFolder.get(folder);
        if (!existing) {
            byFolder.set(folder, next);
            continue;
        }
        if (next.priority > existing.priority) {
            byFolder.set(folder, next);
        } else if (next.priority === existing.priority) {
            // Keep earlier time so minimum-age still applies from first sighting,
            // but refresh reason metadata so the UI shows the latest ARR event.
            const existingMs = Date.parse(existing.time) || 0;
            const nextMs = Date.parse(next.time) || 0;
            const time = nextMs < existingMs ? next.time : existing.time;
            byFolder.set(folder, { ...existing, ...pickMeta(next), time, priority: existing.priority });
        } else {
            // Lower priority still updates why we care about this folder.
            byFolder.set(folder, { ...existing, ...pickMeta(next) });
        }
    }

    const out = [...byFolder.values()].sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return (Date.parse(a.time) || 0) - (Date.parse(b.time) || 0);
    });
    await writeJson(QUEUE_PATH, { scans: out });
    return out;
};

/**
 * Claim the next scan that is older than minimumAgeMs.
 * @param {number} minimumAgeMs
 * @param {{ verifyPathExists?: boolean }} opts
 * @returns {Promise<ScanItem|null>}
 */
export const claimDueScan = async (minimumAgeMs, opts = {}) => {
    const scans = await listQueue();
    if (!scans.length) return null;
    const now = Date.now();
    const minAge = Math.max(0, Number(minimumAgeMs) || 0);

    for (let i = 0; i < scans.length; i++) {
        const scan = scans[i];
        const age = now - (Date.parse(scan.time) || 0);
        if (age < minAge) continue;

        if (opts.verifyPathExists) {
            try {
                await fs.stat(scan.folder);
            } catch {
                // Not ready yet — leave in queue and try next.
                continue;
            }
        }

        const remaining = [...scans.slice(0, i), ...scans.slice(i + 1)];
        await writeJson(QUEUE_PATH, { scans: remaining });
        return scan;
    }
    return null;
};

export const appendLog = async (entry, { countProcessed = true } = {}) => {
    const data = await readJson(LOG_PATH, { entries: [], processed: 0 });
    const entries = Array.isArray(data.entries) ? data.entries : [];
    entries.unshift({
        ...entry,
        at: entry.at || new Date().toISOString(),
    });
    while (entries.length > MAX_LOG) entries.pop();
    const processed = (Number(data.processed) || 0) + (entry.ok && countProcessed ? 1 : 0);
    await writeJson(LOG_PATH, { entries, processed });
};

export const listLog = async (limit = 50) => {
    const data = await readJson(LOG_PATH, { entries: [], processed: 0 });
    const entries = Array.isArray(data.entries) ? data.entries : [];
    return {
        processed: Number(data.processed) || 0,
        entries: entries.slice(0, Math.max(1, limit)),
    };
};
