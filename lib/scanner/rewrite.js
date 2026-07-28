/**
 * Autoscan-compatible path rewrite: first matching regexp `from` is replaced with `to`.
 * @param {{ from: string, to: string }[]} rules
 * @returns {(input: string) => string}
 */
export const createRewriter = (rules = []) => {
    const compiled = [];
    for (const rule of rules) {
        const from = String(rule?.from || '');
        if (!from) continue;
        try {
            compiled.push({ re: new RegExp(from), to: String(rule?.to ?? '') });
        } catch {
            // Skip invalid patterns rather than failing startup.
        }
    }
    return (input) => {
        const value = String(input || '');
        for (const { re, to } of compiled) {
            if (re.test(value)) return value.replace(re, to);
        }
        return value;
    };
};

/**
 * Undo one Autoscan-style from→to rewrite when `input` sits under a rule's `to`.
 * Used only as one candidate among several — never as the sole path strategy.
 *
 * @param {string} input
 * @param {{ from: string, to: string }[]} rules
 * @returns {string}
 */
export const invertPathRewrites = (input, rules = []) => {
    const value = String(input || '');
    if (!value || !Array.isArray(rules) || !rules.length) return value;

    const literalFrom = (from) => String(from || '')
        .replace(/^\^/, '')
        .replace(/\$$/, '')
        .replace(/\\([.^$*+?()[\]{}|\\/])/g, '$1');

    const candidates = [];
    for (const rule of rules) {
        const from = String(rule?.from || '');
        const to = String(rule?.to ?? '');
        if (!from || !to) continue;
        if (value !== to && !value.startsWith(to)) continue;
        candidates.push({
            score: to.length,
            next: `${literalFrom(from)}${value.slice(to.length)}`,
        });
    }
    if (!candidates.length) return value;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].next;
};

/**
 * Expand a path across rewrite directions so Plex/Jellyfin matching works whether
 * the queued folder is a host path (Sonarr), container path (Media Automation),
 * or either side of a custom mount map — without assuming Vik's Unraid layout.
 *
 * @param {string} input
 * @param {{ from: string, to: string }[]} rules
 * @returns {string[]}
 */
export const expandPathRewriteCandidates = (input, rules = []) => {
    const value = String(input || '').trim();
    if (!value) return [];
    const list = Array.isArray(rules) ? rules : [];
    const forward = createRewriter(list);
    const out = new Set([value]);

    const add = (candidate) => {
        const next = String(candidate || '').trim();
        if (next) out.add(next);
    };

    add(forward(value));
    add(invertPathRewrites(value, list));
    // Per-rule variants cover mixed Sonarr/Plex rewrite lists.
    for (const rule of list) {
        add(createRewriter([rule])(value));
        add(invertPathRewrites(value, [rule]));
    }
    return [...out];
};

/** True when `candidate` is the library root or a path under it. */
export const pathMatchesLibraryRoot = (candidate, libraryPath) => {
    const value = String(candidate || '');
    const root = ensureTrailingSlash(libraryPath);
    if (!value || !root) return false;
    return value === root.slice(0, -1)
        || value === root
        || value.startsWith(root)
        || ensureTrailingSlash(value).startsWith(root);
};

/**
 * Collect unique from→to mount maps from Scanner triggers and/or targets.
 * Media Automation and Arr webhooks may store the same Unraid map on either side.
 */
export const collectMountRewrites = (...groups) => {
    const seen = new Set();
    const rules = [];
    for (const rows of groups) {
        for (const row of rows || []) {
            for (const rule of Array.isArray(row?.rewrite) ? row.rewrite : []) {
                const from = String(rule?.from || '').trim();
                if (!from) continue;
                const to = String(rule?.to || '');
                const key = `${from}\0${to}`;
                if (seen.has(key)) continue;
                seen.add(key);
                rules.push({ from, to });
            }
        }
    }
    return rules;
};

/**
 * Parse durations like "30s", "1m", "5m", "1h" into milliseconds.
 * @param {string|number} value
 * @param {number} fallbackMs
 */
export const parseDurationMs = (value, fallbackMs = 60_000) => {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return fallbackMs;
    const match = raw.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/);
    if (!match) return fallbackMs;
    const n = Number(match[1]);
    const unit = match[2] || 'ms';
    const mult = unit === 'ms' ? 1
        : unit === 's' ? 1000
            : unit === 'm' ? 60_000
                : unit === 'h' ? 3_600_000
                    : 86_400_000;
    return Math.max(0, Math.round(n * mult));
};

export const ensureTrailingSlash = (p) => {
    const s = String(p || '');
    if (!s) return s;
    return s.endsWith('/') || s.endsWith('\\') ? s : `${s}/`;
};

export const joinUrl = (base, ...parts) => {
    const root = String(base || '').replace(/\/+$/, '');
    const rest = parts
        .map((p) => String(p || '').replace(/^\/+|\/+$/g, ''))
        .filter(Boolean)
        .join('/');
    return rest ? `${root}/${rest}` : root;
};
