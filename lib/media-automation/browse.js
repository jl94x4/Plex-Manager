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

const MAX_ENTRIES = 500;

const canonical = (value) => (process.platform === 'win32' ? String(value).toLowerCase() : String(value));

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
        };
    }

    const allowedExtensions = normalizeBrowseExtensions(extensions);
    const dirents = await fs.readdir(resolved.path, { withFileTypes: true });
    const entries = [];
    for (const dirent of dirents) {
        if (entries.length >= MAX_ENTRIES) break;
        const name = dirent.name;
        if (!name || name === '.' || name === '..') continue;
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
    entries.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' || a.type === 'root' ? -1 : 1;
        return a.name.localeCompare(b.name);
    });

    return {
        path: resolved.path,
        parent: resolved.parent,
        root: resolved.root,
        roots,
        includeFiles: !!includeFiles,
        entries,
    };
};

export default listBrowseDirectory;
