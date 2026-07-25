import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Search } from 'lucide-react';
import type { SettingsIndexEntry } from './settingsIndex';
import {
    getRecentSettingsEntries,
    searchSettingsIndex,
} from './settingsIndex';

export const SettingsSearchPanel: React.FC<{
    onSelect: (entry: SettingsIndexEntry) => void;
    activeEntryId?: string | null;
}> = ({ onSelect, activeEntryId }) => {
    const [query, setQuery] = useState('');
    const [recent, setRecent] = useState<SettingsIndexEntry[]>([]);
    const [isFocused, setIsFocused] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setRecent(getRecentSettingsEntries());
    }, []);

    const results = useMemo(() => searchSettingsIndex(query), [query]);
    const showResults = isFocused && query.trim().length > 0;
    const showRecent = isFocused && query.trim().length === 0 && recent.length > 0;

    useEffect(() => {
        const handleOutsideClick = (event: MouseEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) {
                setIsFocused(false);
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, []);

    const handleSelect = (entry: SettingsIndexEntry) => {
        onSelect(entry);
        setRecent(getRecentSettingsEntries());
        setQuery('');
        setIsFocused(false);
    };

    const renderEntryButton = (entry: SettingsIndexEntry, icon?: React.ReactNode) => (
        <button
            key={entry.id}
            type="button"
            onClick={() => handleSelect(entry)}
            className={`w-full text-left px-2.5 py-2 rounded-md text-sm transition-all ${
                activeEntryId === entry.id
                    ? 'nav-item-active'
                    : 'text-text hover:bg-white/5'
            }`}
        >
            <span className="flex items-start gap-2">
                {icon}
                <span className="min-w-0">
                    <span className="font-medium block truncate">{entry.label}</span>
                    <span className="text-[10px] text-muted block truncate">
                        {entry.sectionId ? `${entry.group} · ${SETTINGS_INDEX_TAB_LABEL(entry.tabId)}` : entry.group}
                    </span>
                </span>
            </span>
        </button>
    );

    return (
        <div ref={containerRef} className="shrink-0 relative">
            <label className="sr-only">Find Setting</label>
            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
                <input
                    type="search"
                    placeholder="Search settings..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => {
                        setIsFocused(true);
                        setRecent(getRecentSettingsEntries());
                    }}
                    className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-text focus:outline-none focus:border-plex transition-colors"
                />
            </div>

            {(showResults || showRecent) && (
                <div className="absolute z-30 left-0 right-0 mt-1.5 rounded-lg border border-border bg-card shadow-2xl overflow-hidden">
                    {showRecent && (
                        <div className="p-2">
                            <p className="text-[10px] uppercase tracking-wider font-bold text-muted px-2 py-1 flex items-center gap-1.5">
                                <Clock className="w-3 h-3" /> Recent
                            </p>
                            <div className="space-y-0.5">
                                {recent.map((entry) => renderEntryButton(entry))}
                            </div>
                        </div>
                    )}
                    {showResults && (
                        <div className="p-2">
                            <p className="text-[10px] uppercase tracking-wider font-bold text-muted px-2 py-1">Results</p>
                            {results.length === 0 ? (
                                <p className="text-xs text-muted px-2 py-2">No settings found.</p>
                            ) : (
                                <div className="space-y-0.5 max-h-64 overflow-y-auto custom-scrollbar">
                                    {results.map((entry) => renderEntryButton(entry))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const SETTINGS_INDEX_TAB_LABEL = (tabId: string) => {
    const labels: Record<string, string> = {
        plex: 'Media Player',
        'home-layout': 'Home Layout',
        'stream-rules': 'Stream Rules',
    };
    return labels[tabId] || tabId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};
