import fs from 'fs/promises';
import path from 'path';
import { isPathContained } from './files.js';

export const DEFAULT_BROWSE_CANDIDATES = Object.freeze([
    '/media',
    '/movies',
    '/tv',
    '/music',
    '/downloads',
    '/completed',
    '/quarantine',
    '/media2',
    '/media3',
    '/data',
]);

/** Default page size for browse responses (large TV libraries exceed this easily). */
export const DEFAULT_BROWSE_LIMIT = 400;
/** Hard cap per request so a pathological directory cannot blow memory/JSON. */
export const MAX_BROWSE_LIMIT = 2000;

const canonical = (value) => (process.platform === 'win32' ? String(value).toLowerCase() : String(value));

const clampLimit = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return DEFAULT_BROWSE_LIMIT;
    return Math.min(MAX_BROWSE_LIMIT, Math.max(1, Math.round(number)));
};

const clampOffset = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return 0;
    return Math.min(1_000_000, Math.round(number));
};

export const collectBrowseRoots = async ({
    candidates = DEFAULT_BROWSE_CANDIDATES,
    extraRoots = [],
} = {}) => {
    const seen = new Set();
    const roots = [];
    for (const candidate of [...candidates, ...extraRoots]) {
        const raw = String(candidate || '').trim();
        if (!raw || raw.includes('\0')) continue;
        try {
            const resolved = path.resolve(raw);
            const real = await fs.realpath(resolved);
            const key = canonical(real);
            if (seen.has(key)) continue;
            const stat = await fs.stat(real);
            if (!stat.isDirectory()) continue;
            seen.add(key);
            roots.push(real);
        } catch {
            // skip missing mounts
        }
    }
    roots.sort((a, b) => a.localeCompare(b));
    return roots;
};

export const resolveBrowsePath = async (requestedPath, roots = []) => {
    if (!roots.length) {
        throw Object.assign(new Error('No browsable mount roots are available in the container'), {
            code: 'NO_BROWSE_ROOTS',
            status: 400,
        });
    }
    const raw = String(requestedPath || '').trim();
    if (!raw) {
        return { path: null, root: null, parent: null };
    }
    if (raw.includes('\0') || raw.includes('..')) {
        throw Object.assign(new Error('Path is invalid'), { code: 'INVALID_PATH', status: 400 });
    }
    const resolved = path.resolve(raw);
    let real;
    try {
        real = await fs.realpath(resolved);
    } catch (error) {
        throw Object.assign(new Error(`Path not found: ${resolved}`), {
            code: 'PATH_NOT_FOUND',
            status: 404,
            cause: error,
        });
    }
    const root = roots.find((entry) => isPathContained(entry, real));
    if (!root) {
        throw Object.assign(new Error('Path is outside allowed mount roots'), {
            code: 'PATH_ESCAPE',
            status: 400,
        });
    }
    const stat = await fs.lstat(real);
    if (stat.isSymbolicLink()) {
        throw Object.assign(new Error('Symbolic links are not browsable'), {
            code: 'SYMLINK_REJECTED',
            status: 400,
        });
    }
    if (!stat.isDirectory()) {
        throw Object.assign(new Error('Path is not a directory'), {
            code: 'NOT_DIRECTORY',
            status: 400,
        });
    }
    const parent = real === root ? null : path.dirname(real);
    return { path: real, root, parent };
};

const normalizeBrowseExtensions = (extensions = []) => new Set(
    (Array.isArray(extensions) ? extensions : [])
        .map((entry) => String(entry || '').trim().toLowerCase())
        .filter(Boolean)
        .map((entry) => (entry.startsWith('.') ? entry : `.${entry}`)),
);

export const listBrowseDirectory = async (directoryPath, {
    roots = [],
    includeFiles = false,
    extensions = [],
    limit = DEFAULT_BROWSE_LIMIT,
    offset = 0,
    query = '',
} = {}) => {
    const resolved = await resolveBrowsePath(directoryPath, roots);
    if (!resolved.path) {
        return {
            path: null,
            parent: null,
            root: null,
            roots,
            includeFiles: !!includeFiles,
            entries: roots.map((root) => ({
                name: root,
                path: root,
                type: 'root',
            })),
            total: roots.length,
            offset: 0,
            limit: roots.length,
            hasMore: false,
            query: '',
        };
    }

    const allowedExtensions = normalizeBrowseExtensions(extensions);
    const needle = String(query || '').trim().toLowerCase();
    const dirents = await fs.readdir(resolved.path, { withFileTypes: true });
    const entries = [];
    for (const dirent of dirents) {
        const name = dirent.name;
        if (!name || name === '.' || name === '..') continue;
        if (needle && !name.toLowerCase().includes(needle)) continue;
        const fullPath = path.join(resolved.path, name);
        try {
            if (dirent.isSymbolicLink()) continue;
            if (dirent.isDirectory()) {
                if (!isPathContained(resolved.root, fullPath)) continue;
                entries.push({ name, path: fullPath, type: 'directory' });
                continue;
            }
            if (includeFiles && dirent.isFile()) {
                const ext = path.extname(name).toLowerCase();
                if (allowedExtensions.size && !allowedExtensions.has(ext)) continue;
                entries.push({ name, path: fullPath, type: 'file' });
            }
        } catch {
            // skip unreadable
        }
    }
    // Sort the full set first — never truncate mid-readdir (FS order is not alphabetical).
    entries.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' || a.type === 'root' ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    const safeLimit = clampLimit(limit);
    const safeOffset = clampOffset(offset);
    const total = entries.length;
    const page = entries.slice(safeOffset, safeOffset + safeLimit);

    return {
        path: resolved.path,
        parent: resolved.parent,
        root: resolved.root,
        roots,
        includeFiles: !!includeFiles,
        entries: page,
        total,
        offset: safeOffset,
        limit: safeLimit,
        hasMore: safeOffset + page.length < total,
        query: String(query || '').trim(),
    };
};

export default listBrowseDirectory;
