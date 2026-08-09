/**
 * Persistent ratingKey → genre tags cache for achievements enrichment.
 */

import fs from 'fs/promises';
import { ACHIEVEMENTS_GENRE_CACHE_PATH } from '../data-paths.js';

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
let memory = null; // { updatedAt, entries: { [ratingKey]: { tags: string[], at: number } } }
let writeTimer = null;

const empty = () => ({ updatedAt: null, entries: {} });

export const loadGenreCache = async () => {
    if (memory) return memory;
    try {
        const raw = await fs.readFile(ACHIEVEMENTS_GENRE_CACHE_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        memory = {
            updatedAt: parsed?.updatedAt || null,
            entries: parsed?.entries && typeof parsed.entries === 'object' ? parsed.entries : {},
        };
    } catch {
        memory = empty();
    }
    return memory;
};

const schedulePersist = () => {
    if (writeTimer) return;
    writeTimer = setTimeout(async () => {
        writeTimer = null;
        try {
            const state = memory || empty();
            state.updatedAt = new Date().toISOString();
            await fs.mkdir(ACHIEVEMENTS_GENRE_CACHE_PATH.replace(/[/\\][^/\\]+$/, ''), { recursive: true });
            await fs.writeFile(ACHIEVEMENTS_GENRE_CACHE_PATH, JSON.stringify(state), 'utf8');
        } catch {
            /* ignore disk errors */
        }
    }, 1500);
    if (typeof writeTimer.unref === 'function') writeTimer.unref();
};

export const getCachedGenreTags = async (ratingKey) => {
    const key = String(ratingKey || '').trim();
    if (!key) return null;
    const state = await loadGenreCache();
    const hit = state.entries[key];
    if (!hit || !Array.isArray(hit.tags)) return null;
    const age = Date.now() - (Number(hit.at) || 0);
    if (age > CACHE_TTL_MS) return null;
    return hit.tags;
};

export const setCachedGenreTags = async (ratingKey, tags) => {
    const key = String(ratingKey || '').trim();
    if (!key) return;
    const state = await loadGenreCache();
    state.entries[key] = {
        tags: Array.isArray(tags) ? tags.map(String).filter(Boolean) : [],
        at: Date.now(),
    };
    schedulePersist();
};
