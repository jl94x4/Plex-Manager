/** Hash routing for Poster Sets: `/poster-sets#browse`, `#browse/rail`, `#apply?url=…` */

export const POSTER_SETS_TABS = [
    'apply',
    'browse',
    'queue',
    'watches',
    'recent',
    'history',
    'settings',
] as const;

export type PosterSetsTabId = (typeof POSTER_SETS_TABS)[number];

export type PosterSetsUrlState = {
    tab: PosterSetsTabId;
    /** Browse “See all” rail id, e.g. mediux_title_cards */
    rail: string | null;
    /** Apply deep-link: set URL to preview */
    setUrl: string | null;
    /** Restrict MediUX preview/apply to title_card assets only */
    titleCardsOnly: boolean;
};

const isTab = (value: string): value is PosterSetsTabId =>
    (POSTER_SETS_TABS as readonly string[]).includes(value);

const emptyState = (): PosterSetsUrlState => ({
    tab: 'apply',
    rail: null,
    setUrl: null,
    titleCardsOnly: false,
});

export function parsePosterSetsUrl(hash = typeof window !== 'undefined' ? window.location.hash : ''): PosterSetsUrlState {
    const raw = String(hash || '').replace(/^#/, '').trim();
    if (!raw) return emptyState();

    const qIndex = raw.indexOf('?');
    const pathPart = (qIndex >= 0 ? raw.slice(0, qIndex) : raw).trim();
    const queryPart = qIndex >= 0 ? raw.slice(qIndex + 1) : '';
    const segments = pathPart.split('/').filter(Boolean).map((part) => {
        try {
            return decodeURIComponent(part);
        } catch {
            return part;
        }
    });

    const tabRaw = String(segments[0] || 'apply').trim().toLowerCase();
    const tab: PosterSetsTabId = isTab(tabRaw) ? tabRaw : 'apply';
    const rail = tab === 'browse' && segments[1] ? String(segments[1]).trim() || null : null;

    const params = new URLSearchParams(queryPart);
    const setUrlRaw = tab === 'apply' ? String(params.get('url') || '').trim() : '';
    const setUrl = setUrlRaw || null;
    const assets = String(params.get('assets') || '').trim().toLowerCase();
    const titleCardsOnly = tab === 'apply' && Boolean(setUrl) && (
        assets === 'title_cards'
        || assets === 'title_card'
        || assets === 'titlecards'
    );

    return { tab, rail, setUrl, titleCardsOnly };
}

export function buildPosterSetsHash(state: PosterSetsUrlState): string {
    let hash = `#${state.tab}`;
    if (state.tab === 'browse' && state.rail) {
        hash += `/${encodeURIComponent(state.rail)}`;
    }
    if (state.tab === 'apply' && state.setUrl) {
        const params = new URLSearchParams();
        params.set('url', state.setUrl);
        if (state.titleCardsOnly) params.set('assets', 'title_cards');
        hash += `?${params.toString()}`;
    }
    return hash;
}

export function writePosterSetsUrl(state: PosterSetsUrlState, mode: 'push' | 'replace' = 'push') {
    if (typeof window === 'undefined') return;
    const desired = buildPosterSetsHash(state);
    const current = window.location.hash || '';
    if (current === desired) return;
    // Treat bare /poster-sets the same as #apply for replace-only normalize.
    if (mode === 'replace' && !current && desired === '#apply') {
        const next = `${window.location.pathname}${window.location.search}${desired}`;
        window.history.replaceState({ posterSets: true }, '', next);
        return;
    }
    if (!current && desired === '#apply' && mode === 'push') return;

    const next = `${window.location.pathname}${window.location.search}${desired}`;
    if (mode === 'push') {
        window.history.pushState({ posterSets: true }, '', next);
    } else {
        window.history.replaceState({ posterSets: true }, '', next);
    }
}

export function posterSetsUrlEquals(a: PosterSetsUrlState, b: PosterSetsUrlState): boolean {
    return a.tab === b.tab
        && (a.rail || null) === (b.rail || null)
        && (a.setUrl || null) === (b.setUrl || null)
        && Boolean(a.titleCardsOnly) === Boolean(b.titleCardsOnly);
}
