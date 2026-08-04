import { type DiscoverView } from '../urlState';

export type TabId = 'apply' | 'browse' | 'library' | 'queue' | 'watches' | 'recent' | 'history' | 'settings';
export type PrimaryTabId = 'library' | 'discover' | 'queue' | 'watches' | 'settings';
export type HistoryFilter = 'all' | 'running' | 'succeeded' | 'failed' | 'audit';

export const DISCOVER_SUB_NAV: Array<{ id: DiscoverView; label: string; internalTab: TabId }> = [
    { id: 'search', label: 'Search', internalTab: 'apply' },
    { id: 'browse', label: 'Browse', internalTab: 'browse' },
    { id: 'recent', label: 'Recent', internalTab: 'recent' },
    { id: 'history', label: 'History', internalTab: 'history' },
];

export const isDiscoverInternalTab = (id: TabId) => (
    id === 'apply' || id === 'browse' || id === 'recent' || id === 'history'
);
export type SetProvider = 'mediux' | 'posterdb';
export type SearchProvider = 'both' | SetProvider;
