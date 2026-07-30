/**
 * Merge MediUX + ThePosterDB catalog results and collapse near-duplicates.
 * Preference decides which provider stays primary when titles/sets look the same.
 */

const stripDiacritics = (value) => String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');

/** Normalize title/user text for fuzzy equality (case, punctuation, year suffix). */
export const normalizePosterMatchKey = (value) => {
    let text = stripDiacritics(value).toLowerCase().trim();
    text = text.replace(/\(\s*(?:\d{4}|n\/a)\s*\)\s*$/i, '');
    text = text.replace(/\b(set|poster set|posters|title cards?|collection)\b/g, ' ');
    text = text.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
    return text;
};

export const normalizeDupePreference = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'mediux' || raw === 'mediaux') return 'mediux';
    return 'posterdb';
};

const providerRank = (provider, preferred) => {
    const value = String(provider || '').toLowerCase();
    if (value === preferred) return 0;
    if (value === 'posterdb' || value === 'tpdb' || value === 'theposterdb') return preferred === 'posterdb' ? 0 : 1;
    if (value === 'mediux') return preferred === 'mediux' ? 0 : 1;
    return 2;
};

const titleMatchKey = (title) => {
    const name = normalizePosterMatchKey(title?.title || '');
    const year = title?.year != null && Number.isFinite(Number(title.year))
        ? String(Number(title.year))
        : '';
    return `${name}|${year}`;
};

const setMatchKey = (set) => {
    const title = normalizePosterMatchKey(set?.title || '');
    const user = normalizePosterMatchKey(set?.user || '');
    // Prefer title+creator when both sides have a user; fall back to title-only.
    return user ? `${title}|${user}` : `${title}|`;
};

const asSource = (title) => ({
    provider: String(title?.provider || '').toLowerCase() === 'mediux' ? 'mediux' : 'posterdb',
    id: String(title?.id || ''),
    url: String(title?.url || ''),
    mediaType: title?.mediaType || null,
    year: title?.year ?? null,
    thumbUrl: title?.thumbUrl || '',
});

/**
 * @param {Array<object>} titles
 * @param {'mediux'|'posterdb'} preferred
 */
export const mergePosterSearchTitles = (titles = [], preferred = 'posterdb') => {
    const pref = normalizeDupePreference(preferred);
    const buckets = new Map();
    for (const title of Array.isArray(titles) ? titles : []) {
        if (!title?.title) continue;
        const key = titleMatchKey(title);
        if (!key.startsWith('|') && !normalizePosterMatchKey(title.title)) continue;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(title);
    }

    const merged = [];
    let dupesCollapsed = 0;
    for (const group of buckets.values()) {
        const sorted = [...group].sort((a, b) => (
            providerRank(a.provider, pref) - providerRank(b.provider, pref)
        ));
        const primary = sorted[0];
        const sources = [];
        const seenProviders = new Set();
        for (const item of sorted) {
            const source = asSource(item);
            if (!source.id || seenProviders.has(source.provider)) continue;
            seenProviders.add(source.provider);
            sources.push(source);
        }
        if (sources.length > 1) dupesCollapsed += sources.length - 1;
        merged.push({
            ...primary,
            provider: asSource(primary).provider,
            sources,
            alsoOn: sources.filter((source) => source.provider !== asSource(primary).provider),
        });
    }

    merged.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' }));
    return { titles: merged, dupesCollapsed };
};

/**
 * @param {Array<object>} sets
 * @param {'mediux'|'posterdb'} preferred
 * @param {{ preserveOrder?: boolean }} [options]
 */
export const mergePosterSearchSets = (sets = [], preferred = 'posterdb', options = {}) => {
    const pref = normalizeDupePreference(preferred);
    const preserveOrder = Boolean(options?.preserveOrder);
    const exact = new Map();
    const titleOnly = new Map();
    const inputOrder = [];

    const consider = (set) => {
        if (!set?.setId || !set?.url) return;
        const provider = String(set.provider || '').toLowerCase() === 'mediux' ? 'mediux' : 'posterdb';
        const normalized = {
            ...set,
            provider,
            setId: String(set.setId),
            title: String(set.title || `Set ${set.setId}`),
            url: String(set.url),
            user: set.user || null,
            thumbUrl: set.thumbUrl || '',
            posterCount: set.posterCount ?? null,
        };
        const keyed = setMatchKey(normalized);
        const map = keyed.endsWith('|') ? titleOnly : exact;
        if (!map.has(keyed)) map.set(keyed, []);
        map.get(keyed).push(normalized);
        inputOrder.push({ keyed, map, normalized });
    };

    for (const set of Array.isArray(sets) ? sets : []) consider(set);

    // Promote title-only groups into exact buckets when a matching titled+user group exists.
    for (const [key, group] of [...titleOnly.entries()]) {
        const titlePart = key.slice(0, -1);
        let folded = false;
        for (const [exactKey, exactGroup] of exact.entries()) {
            if (exactKey.startsWith(`${titlePart}|`) && exactKey !== key) {
                exactGroup.push(...group);
                folded = true;
                break;
            }
        }
        if (!folded) exact.set(key, group);
    }

    const resolveKey = (keyed, map) => {
        if (exact.has(keyed)) return keyed;
        if (map === titleOnly) {
            const titlePart = keyed.slice(0, -1);
            for (const exactKey of exact.keys()) {
                if (exactKey.startsWith(`${titlePart}|`) && exactKey !== keyed) return exactKey;
            }
        }
        return keyed;
    };

    const buildMerged = (group) => {
        const byProvider = new Map();
        for (const item of group) {
            if (!byProvider.has(item.provider)) byProvider.set(item.provider, item);
        }
        const unique = [...byProvider.values()].sort((a, b) => providerRank(a.provider, pref) - providerRank(b.provider, pref));
        const primary = unique[0];
        if (!primary) return null;
        return {
            item: {
                ...primary,
                alsoOn: unique.slice(1).map((entry) => ({
                    provider: entry.provider,
                    setId: entry.setId,
                    url: entry.url,
                    title: entry.title,
                    user: entry.user,
                    thumbUrl: entry.thumbUrl,
                })),
            },
            dupeExtra: Math.max(0, unique.length - 1),
        };
    };

    const merged = [];
    let dupesCollapsed = 0;

    if (preserveOrder) {
        // Keep scrape order (creator pages are newest-first on MediUX / ThePosterDB).
        const seen = new Set();
        for (const entry of inputOrder) {
            const key = resolveKey(entry.keyed, entry.map);
            if (seen.has(key)) continue;
            const group = exact.get(key);
            if (!group) continue;
            seen.add(key);
            const built = buildMerged(group);
            if (!built) continue;
            dupesCollapsed += built.dupeExtra;
            merged.push(built.item);
        }
    } else {
        for (const group of exact.values()) {
            const built = buildMerged(group);
            if (!built) continue;
            dupesCollapsed += built.dupeExtra;
            merged.push(built.item);
        }
        merged.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' }));
    }

    return { sets: merged, dupesCollapsed };
};
