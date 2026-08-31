export type OpenAppletSession = {
    id: string;
    embedPath: string;
};

export const upsertOpenApplet = (
    prev: OpenAppletSession[],
    id: string,
    embedPath = '',
): OpenAppletSession[] => {
    const nextId = String(id || '').trim();
    if (!nextId) return prev;
    const path = String(embedPath || '');
    const rest = prev.filter((session) => session.id !== nextId);
    return [...rest, { id: nextId, embedPath: path }];
};

export const closeOpenApplet = (prev: OpenAppletSession[], id: string): OpenAppletSession[] => (
    prev.filter((session) => session.id !== id)
);

export const nextAppletAfterClose = (
    prev: OpenAppletSession[],
    closedId: string,
): OpenAppletSession | null => {
    const next = closeOpenApplet(prev, closedId);
    return next[next.length - 1] || null;
};
