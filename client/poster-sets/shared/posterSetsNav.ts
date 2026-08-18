import { type DiscoverView } from '../urlState';

export type TabId = 'apply' | 'browse' | 'library' | 'collections' | 'queue' | 'watches' | 'recent' | 'paste' | 'history' | 'settings';
export type PrimaryTabId = 'library' | 'collections' | 'discover' | 'queue' | 'watches' | 'logs' | 'paste' | 'settings';
export type HistoryFilter = 'all' | 'running' | 'succeeded' | 'failed' | 'audit';

export const DISCOVER_SUB_NAV: Array<{ id: DiscoverView; label: string; internalTab: TabId }> = [
    { id: 'search', label: 'Search', internalTab: 'apply' },
    { id: 'browse', label: 'Browse', internalTab: 'browse' },
    { id: 'recent', label: 'Recent', internalTab: 'recent' },
];

export const isDiscoverInternalTab = (id: TabId) => (
    id === 'apply' || id === 'browse' || id === 'recent'
);
export type SetProvider = 'mediux' | 'posterdb';
export type SearchProvider = 'both' | SetProvider;
