import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { CustomSelect } from '../shared/ui';
import {
    normalizeUpgraderGridSize,
    UPGRADER_GRID_SIZE_OPTIONS,
    upgraderPosterGridClass,
    upgraderPosterGridStyle,
    type UpgraderGridSize,
} from '../shared/portalLayout';
import { posterSetsApi } from './api';
import {
    libraryItemPosterSrc,
    normalizeLibraryItems,
    type LibraryBrowseSort,
    type LibraryRecentItem,
    type LibrarySection,
} from './libraryRecent';

const buttonClass = 'inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs font-semibold text-text transition hover:border-plex/40 hover:bg-white/5 disabled:pointer-events-none disabled:opacity-40 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm';

const BROWSE_PAGE_SIZE = 60;
const SORT_OPTIONS = [
    { value: 'titleAsc', label: 'Title A–Z' },
    { value: 'titleDesc', label: 'Title Z–A' },
    { value: 'yearDesc', label: 'Year (newest)' },
    { value: 'yearAsc', label: 'Year (oldest)' },
    { value: 'addedDesc', label: 'Recently added' },
    { value: 'addedAsc', label: 'Oldest added' },
];

function LibraryMediaCard({
    item,
    disabled,
    onOpen,
}: {
    item: LibraryRecentItem;
    disabled?: boolean;
    onOpen: (item: LibraryRecentItem) => void;
}) {
    const label = item.year ? `${item.title} (${item.year})` : item.title;
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={() => onOpen(item)}
            className="group flex w-full min-w-0 flex-col overflow-hidden rounded-md border border-white/10 bg-black/20 text-left transition hover:border-plex/40 disabled:opacity-50"
        >
            <div className="relative aspect-[2/3] w-full shrink-0 overflow-hidden bg-black">
                {libraryItemPosterSrc(item) ? (
                    <img
                        src={libraryItemPosterSrc(item)}
                        alt={item.title}
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                    />
                ) : (
                    <div className="absolute inset-0 bg-black/40" />
                )}
                <span className="absolute left-2 top-2 rounded-full border border-white/15 bg-black/55 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                    {item.mediaType === 'movie' ? 'Movie' : 'TV'}
                </span>
            </div>
            <div className="min-w-0 px-2 py-2 text-left">
                <p className="line-clamp-2 text-[11px] font-semibold leading-snug text-text sm:text-xs" title={label}>
                    {item.title}
                </p>
                {item.librarySection ? (
                    <p className="mt-0.5 truncate text-[10px] text-muted">{item.librarySection}</p>
                ) : null}
            </div>
        </button>
    );
}

export type PosterSetsLibraryBrowseProps = {
    disabled?: boolean;
    gridSize: UpgraderGridSize;
    onGridSizeChange: (size: UpgraderGridSize) => void;
    onOpenItem: (item: LibraryRecentItem) => void;
};

export function PosterSetsLibraryBrowse({
    disabled,
    gridSize,
    onGridSizeChange,
    onOpenItem,
}: PosterSetsLibraryBrowseProps) {
    const [sections, setSections] = useState<LibrarySection[]>([]);
    const [sectionKey, setSectionKey] = useState('');
    const [mediaType, setMediaType] = useState<'movie' | 'show' | ''>('');
    const [sort, setSort] = useState<LibraryBrowseSort>('titleAsc');
    const [page, setPage] = useState(0);
    const [items, setItems] = useState<LibraryRecentItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [sectionsLoading, setSectionsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const loadGenRef = useRef(0);

    const posterGridClass = upgraderPosterGridClass(gridSize);
    const posterGridStyle = upgraderPosterGridStyle(gridSize);

    useEffect(() => {
        let cancelled = false;
        setSectionsLoading(true);
        void posterSetsApi.librarySections()
            .then((response) => {
                if (cancelled) return;
                const next = (response.sections || [])
                    .map((section) => ({
                        key: String(section.key || ''),
                        title: String(section.title || ''),
                        type: section.type === 'show' ? 'show' as const : 'movie' as const,
                        count: Number(section.count) || 0,
                    }))
                    .filter((section) => section.key && section.title);
                setSections(next);
                if (next.length && !sectionKey) {
                    setSectionKey(next[0].key);
                }
            })
            .catch((err) => {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load library sections');
            })
            .finally(() => {
                if (!cancelled) setSectionsLoading(false);
            });
        return () => { cancelled = true; };
    }, []);

    const loadBrowse = useCallback(async () => {
        const generation = ++loadGenRef.current;
        setLoading(true);
        setError(null);
        try {
            const response = await posterSetsApi.libraryBrowse({
                section: sectionKey || undefined,
                type: mediaType || undefined,
                sort,
                start: page * BROWSE_PAGE_SIZE,
                limit: BROWSE_PAGE_SIZE,
            });
            if (generation !== loadGenRef.current) return;
            setItems(normalizeLibraryItems(response.items || []));
            setTotal(Number(response.total) || 0);
        } catch (err) {
            if (generation !== loadGenRef.current) return;
            setError(err instanceof Error ? err.message : 'Failed to browse library');
            setItems([]);
            setTotal(0);
        } finally {
            if (generation === loadGenRef.current) setLoading(false);
        }
    }, [sectionKey, mediaType, sort, page]);

    useEffect(() => {
        if (sectionsLoading) return;
        void loadBrowse();
    }, [loadBrowse, sectionsLoading]);

    const pageCount = Math.max(1, Math.ceil(total / BROWSE_PAGE_SIZE));
    const sectionOptions = useMemo(() => sections.map((section) => ({
        value: section.key,
        label: `${section.title} (${section.count || 0})`,
    })), [sections]);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-center gap-2">
                <CustomSelect
                    value={sectionKey}
                    onChange={(value) => {
                        setSectionKey(value);
                        setPage(0);
                    }}
                    options={sectionOptions.length ? sectionOptions : [{ value: '', label: 'No libraries' }]}
                    className="w-full min-w-[160px] sm:w-auto"
                    compact
                    disabled={sectionsLoading || !sectionOptions.length}
                />
                <div className="flex flex-wrap gap-1.5">
                    {([
                        ['', 'All'],
                        ['movie', 'Movies'],
                        ['show', 'TV'],
                    ] as const).map(([id, label]) => (
                        <button
                            key={id || 'all'}
                            type="button"
                            className={`${buttonClass} ${mediaType === id ? 'border-plex/40 bg-plex/15 text-plex' : ''}`}
                            onClick={() => {
                                setMediaType(id);
                                setPage(0);
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <CustomSelect
                    value={sort}
                    onChange={(value) => {
                        setSort(value as LibraryBrowseSort);
                        setPage(0);
                    }}
                    options={SORT_OPTIONS}
                    className="w-full min-w-[140px] sm:w-auto"
                    compact
                />
                <CustomSelect
                    value={gridSize === 'list' ? 'medium' : gridSize}
                    onChange={(value) => onGridSizeChange(normalizeUpgraderGridSize(value))}
                    options={UPGRADER_GRID_SIZE_OPTIONS.filter((option) => option.value !== 'list')}
                    className="w-full min-w-[120px] sm:w-auto"
                    compact
                />
                <button type="button" className={buttonClass} disabled={loading || disabled} onClick={() => void loadBrowse()}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </button>
            </div>

            {error ? <p className="text-center text-xs text-amber-200">{error}</p> : null}

            {loading && !items.length ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading library…
                </div>
            ) : null}

            {!loading && !items.length && !sectionsLoading ? (
                <p className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-muted">
                    No titles found for this library section and filter.
                </p>
            ) : null}

            {items.length ? (
                <>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
                        <h3 className="text-sm font-bold text-text">Browse library</h3>
                        <span className="text-[11px] text-muted">
                            {total ? `${page * BROWSE_PAGE_SIZE + 1}–${Math.min(total, (page + 1) * BROWSE_PAGE_SIZE)} of ${total}` : `${items.length} titles`}
                        </span>
                    </div>
                    <div className={posterGridClass} style={posterGridStyle}>
                        {items.map((item) => (
                            <LibraryMediaCard
                                key={`browse-${item.mediaType}-${item.id}`}
                                item={item}
                                disabled={disabled}
                                onOpen={onOpenItem}
                            />
                        ))}
                    </div>
                    {pageCount > 1 ? (
                        <div className="flex items-center justify-center gap-2 pt-1">
                            <button
                                type="button"
                                className={buttonClass}
                                disabled={page <= 0 || loading}
                                onClick={() => setPage((current) => Math.max(0, current - 1))}
                            >
                                <ChevronLeft className="h-4 w-4" />
                                Prev
                            </button>
                            <span className="text-xs text-muted">Page {page + 1} / {pageCount}</span>
                            <button
                                type="button"
                                className={buttonClass}
                                disabled={page + 1 >= pageCount || loading}
                                onClick={() => setPage((current) => current + 1)}
                            >
                                Next
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    ) : null}
                </>
            ) : null}
        </div>
    );
}
