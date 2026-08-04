/** Sort poster-set results so followed creators appear first (whitelist order). */

export const normalizeCreatorHandle = (value?: string | null) =>
    String(value || '').trim().replace(/^@+/, '').toLowerCase();

export const prioritizeSetsByFollowedCreators = <T extends { user?: string | null }>(
    sets: T[],
    creators?: string[] | null,
): T[] => {
    const list = Array.isArray(sets) ? sets : [];
    const ranks = new Map<string, number>();
    for (const [index, raw] of (Array.isArray(creators) ? creators : []).entries()) {
        const key = normalizeCreatorHandle(raw);
        if (key && !ranks.has(key)) ranks.set(key, index);
    }
    if (!ranks.size || list.length < 2) return list;

    return [...list].sort((a, b) => {
        const aKey = normalizeCreatorHandle(a?.user);
        const bKey = normalizeCreatorHandle(b?.user);
        const aRank = ranks.has(aKey) ? ranks.get(aKey)! : Number.POSITIVE_INFINITY;
        const bRank = ranks.has(bKey) ? ranks.get(bKey)! : Number.POSITIVE_INFINITY;
        return aRank - bRank;
    });
};
