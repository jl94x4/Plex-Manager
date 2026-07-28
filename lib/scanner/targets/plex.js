import path from 'path';
import fetch from 'node-fetch';
import { createRewriter, ensureTrailingSlash, joinUrl } from '../rewrite.js';

const plexHeaders = (token) => ({
    Accept: 'application/json',
    'X-Plex-Token': token,
    'X-Plex-Product': 'Server-Manager-Portal-Scanner',
    'X-Plex-Client-Identifier': 'portal-scanner',
});

const normalizePlexPath = (value) => String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/');

const pathsMatch = (left, right) => {
    const a = normalizePlexPath(left).toLowerCase();
    const b = normalizePlexPath(right).toLowerCase();
    return !!a && !!b && (a === b || a.endsWith(b) || b.endsWith(a));
};

const collectMetadataNodes = (payload) => {
    const nodes = [];
    const root = payload?.MediaContainer || payload || {};
    if (Array.isArray(root.Metadata)) nodes.push(...root.Metadata);
    for (const hub of Array.isArray(root.Hub) ? root.Hub : []) {
        if (Array.isArray(hub?.Metadata)) nodes.push(...hub.Metadata);
    }
    return nodes;
};

const ratingKeysMatchingFile = (nodes, candidates, { trustWithoutParts = false } = {}) => {
    const keys = new Set();
    for (const meta of nodes) {
        const ratingKey = String(meta?.ratingKey || '').trim();
        if (!ratingKey) continue;
        const parts = [];
        for (const media of Array.isArray(meta.Media) ? meta.Media : []) {
            for (const part of Array.isArray(media?.Part) ? media.Part : []) {
                parts.push(part?.file);
            }
        }
        if (!parts.length) {
            // `/all?file=` often returns Metadata without Part.file — still trust Plex's filter.
            if (trustWithoutParts) keys.add(ratingKey);
            continue;
        }
        if (parts.some((file) => candidates.some((candidate) => pathsMatch(file, candidate)))) {
            keys.add(ratingKey);
        }
    }
    return [...keys];
};

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

    const matchingLibraries = async (sourceFile) => {
        const rewritten = rewrite(sourceFile);
        const libraries = await loadLibraries();
        const folder = path.dirname(sourceFile);
        const rewrittenFolder = path.dirname(rewritten);
        return libraries.filter((lib) => (
            rewrittenFolder.startsWith(lib.path)
            || ensureTrailingSlash(rewrittenFolder).startsWith(lib.path)
            || folder.startsWith(lib.path)
            || ensureTrailingSlash(folder).startsWith(lib.path)
            || rewritten.startsWith(lib.path)
            || sourceFile.startsWith(lib.path)
        ));
    };

    const fetchJson = async (url) => {
        const res = await fetch(url.toString(), { headers: plexHeaders(token) });
        if (!res.ok) return null;
        return res.json().catch(() => null);
    };

    const addKeysFromPayload = (keys, payload, candidates, trustWithoutParts) => {
        for (const key of ratingKeysMatchingFile(collectMetadataNodes(payload), candidates, { trustWithoutParts })) {
            keys.add(key);
        }
    };

    const resolveRatingKeys = async (filePath) => {
        const sourceFile = String(filePath || '').trim();
        if (!sourceFile) return [];
        const rewritten = rewrite(sourceFile);
        const candidates = [...new Set([
            normalizePlexPath(sourceFile),
            normalizePlexPath(rewritten),
        ].filter(Boolean))];
        const basename = path.basename(sourceFile);
        const stem = basename.replace(/\.[^.]+$/, '');
        const keys = new Set();

        let libraries = await matchingLibraries(sourceFile);
        // Only trust ?file= hits without Part.file when we already scoped to matching library roots.
        // Broad "all sections" fallback requires Part.file verification.
        let trustFileFilter = libraries.length > 0;
        if (!libraries.length) {
            libraries = await loadLibraries();
            trustFileFilter = false;
        }

        for (const lib of libraries) {
            for (const fileCandidate of candidates) {
                for (const endpoint of ['all', 'allLeaves']) {
                    const byFile = new URL(joinUrl(baseURL, 'library', 'sections', String(lib.id), endpoint));
                    byFile.searchParams.set('file', fileCandidate);
                    const payload = await fetchJson(byFile);
                    addKeysFromPayload(keys, payload, candidates, trustFileFilter);
                }
            }
            // Some PMS builds prefer path= (file or parent folder) over file=.
            for (const pathCandidate of [...candidates, ...candidates.map((entry) => path.posix.dirname(entry))]) {
                if (!pathCandidate || pathCandidate === '/' || pathCandidate === '.') continue;
                const byPath = new URL(joinUrl(baseURL, 'library', 'sections', String(lib.id), 'allLeaves'));
                byPath.searchParams.set('path', pathCandidate);
                const pathPayload = await fetchJson(byPath);
                addKeysFromPayload(keys, pathPayload, candidates, false);
            }
        }

        if (!keys.size && (basename || stem)) {
            const queries = [...new Set([basename, stem].filter(Boolean))];
            for (const query of queries) {
                const searchUrl = new URL(joinUrl(baseURL, 'hubs', 'search'));
                searchUrl.searchParams.set('query', query);
                searchUrl.searchParams.set('limit', '50');
                const searchPayload = await fetchJson(searchUrl);
                const searchNodes = collectMetadataNodes(searchPayload);
                for (const meta of searchNodes.slice(0, 25)) {
                    const ratingKey = String(meta?.ratingKey || '').trim();
                    if (!ratingKey) continue;
                    if (ratingKeysMatchingFile([meta], candidates).length) {
                        keys.add(ratingKey);
                        continue;
                    }
                    const detailUrl = new URL(joinUrl(baseURL, 'library', 'metadata', ratingKey));
                    const detail = await fetchJson(detailUrl);
                    addKeysFromPayload(keys, detail, candidates, false);
                }
            }
        }

        return [...keys];
    };

    const analyzeRatingKey = async (ratingKey) => {
        const url = new URL(joinUrl(baseURL, 'library', 'metadata', String(ratingKey), 'analyze'));
        const res = await fetch(url.toString(), {
            method: 'PUT',
            headers: plexHeaders(token),
        });
        if (!res.ok) {
            const err = new Error(`Plex analyze HTTP ${res.status}`);
            err.code = [404, 500, 502, 503, 504].includes(res.status) ? 'UNAVAILABLE' : 'FATAL';
            throw err;
        }
        return { ratingKey: String(ratingKey) };
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
        /**
         * Force Plex to re-read media tech metadata for a file (codec/bitrate).
         * Needed after same-path Replace — folder refresh alone often leaves stale HEVC/H264 info.
         */
        analyzeFile: async (filePath, {
            retries = 4,
            retryDelayMs = 2500,
            initialDelayMs = 0,
        } = {}) => {
            const sourceFile = String(filePath || '').trim();
            if (!sourceFile) return { skipped: true, reason: 'missing-path', analyzed: [] };

            if (initialDelayMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, initialDelayMs));
            }

            let ratingKeys = await resolveRatingKeys(sourceFile);
            for (let attempt = 0; attempt < retries && !ratingKeys.length; attempt += 1) {
                await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
                ratingKeys = await resolveRatingKeys(sourceFile);
            }
            if (!ratingKeys.length) {
                return {
                    skipped: true,
                    reason: 'item-not-found',
                    path: rewrite(sourceFile),
                    sourcePath: sourceFile,
                    candidates: [...new Set([
                        normalizePlexPath(sourceFile),
                        normalizePlexPath(rewrite(sourceFile)),
                    ].filter(Boolean))],
                    analyzed: [],
                };
            }

            const analyzed = [];
            for (const ratingKey of ratingKeys) {
                analyzed.push(await analyzeRatingKey(ratingKey));
            }
            return {
                skipped: false,
                path: rewrite(sourceFile),
                sourcePath: sourceFile,
                analyzed,
            };
        },
    };
};
