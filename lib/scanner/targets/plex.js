import fetch from 'node-fetch';
import { createRewriter, ensureTrailingSlash, joinUrl } from '../rewrite.js';

const plexHeaders = (token) => ({
    Accept: 'application/json',
    'X-Plex-Token': token,
    'X-Plex-Product': 'Server-Manager-Portal-Scanner',
    'X-Plex-Client-Identifier': 'portal-scanner',
});

/**
 * @param {{ url: string, token: string, rewrite?: { from: string, to: string }[] }} cfg
 */
export const createPlexTarget = (cfg) => {
    const baseURL = String(cfg.url || '').replace(/\/+$/, '');
    const token = String(cfg.token || '');
    const rewrite = createRewriter(cfg.rewrite || []);
    let librariesCache = null;
    let librariesAt = 0;

    const loadLibraries = async (force = false) => {
        if (!force && librariesCache && Date.now() - librariesAt < 60_000) return librariesCache;
        const res = await fetch(joinUrl(baseURL, 'library', 'sections'), {
            headers: plexHeaders(token),
        });
        if (!res.ok) {
            const err = new Error(`Plex libraries HTTP ${res.status}`);
            err.code = res.status === 401 ? 'FATAL' : 'UNAVAILABLE';
            throw err;
        }
        const data = await res.json();
        const dirs = data?.MediaContainer?.Directory || [];
        const libraries = [];
        for (const lib of dirs) {
            const locations = lib.Location || [];
            for (const loc of locations) {
                libraries.push({
                    id: Number(lib.key),
                    name: String(lib.title || ''),
                    path: ensureTrailingSlash(loc.path || ''),
                });
            }
        }
        librariesCache = libraries;
        librariesAt = Date.now();
        return libraries;
    };

    return {
        type: 'plex',
        available: async () => {
            const res = await fetch(baseURL + '/', { headers: plexHeaders(token) });
            if (!res.ok) {
                const err = new Error(`Plex unavailable HTTP ${res.status}`);
                err.code = 'UNAVAILABLE';
                throw err;
            }
        },
        scan: async (folder) => {
            const sourceFolder = String(folder || '');
            const scanFolder = rewrite(sourceFolder);
            const libraries = await loadLibraries();
            // Match against both sides of a container-path rewrite. Plex may
            // advertise the mounted library root (/music) while requiring the
            // resolved host path for a partial refresh (/srv/media/music/...).
            const matches = libraries.filter((lib) => (
                scanFolder.startsWith(lib.path)
                || ensureTrailingSlash(scanFolder).startsWith(lib.path)
                || sourceFolder.startsWith(lib.path)
                || ensureTrailingSlash(sourceFolder).startsWith(lib.path)
            ));
            if (!matches.length) {
                return { skipped: true, reason: 'no matching library', path: scanFolder, sourcePath: sourceFolder };
            }
            const results = [];
            for (const lib of matches) {
                const url = new URL(joinUrl(baseURL, 'library', 'sections', String(lib.id), 'refresh'));
                url.searchParams.set('path', scanFolder);
                const res = await fetch(url.toString(), { headers: plexHeaders(token) });
                if (!res.ok) {
                    const err = new Error(`Plex scan HTTP ${res.status}`);
                    err.code = [404, 500, 502, 503, 504].includes(res.status) ? 'UNAVAILABLE' : 'FATAL';
                    throw err;
                }
                results.push({ library: lib.name, id: lib.id, path: scanFolder });
            }
            return { skipped: false, results };
        },
    };
};
