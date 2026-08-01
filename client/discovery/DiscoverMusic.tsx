import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Music, Search } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { discoveryTheme } from './discoveryThemeClasses';
import { enrichDiscoverItemsWithAvailability } from './discoverAvailabilityEnrich';
import { useDiscoverI18n } from './i18n';

type ArtistHit = {
    mbid: string;
    id: string;
    name: string;
    title: string;
    disambiguation?: string | null;
    posterPath?: string | null;
    overview?: string;
};

export const DiscoverMusic: React.FC<{
    navigate: (path: string) => void;
    formatItem?: (item: any) => any;
    onSelect?: (item: any) => void;
}> = ({ navigate, formatItem, onSelect }) => {
    const { t } = useDiscoverI18n();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ArtistHit[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const seqRef = useRef(0);

    const runSearch = useCallback(async (q: string) => {
        const trimmed = q.trim();
        if (trimmed.length < 2) {
            setResults([]);
            setError(null);
            setLoading(false);
            return;
        }
        const seq = ++seqRef.current;
        setLoading(true);
        setError(null);
        try {
            const res = await apiFetch(`/api/discovery/music/search?q=${encodeURIComponent(trimmed)}`);
            if (seq !== seqRef.current) return;
            const raw = Array.isArray(res?.results) ? res.results : [];
            const enriched = await enrichDiscoverItemsWithAvailability(raw);
            if (seq !== seqRef.current) return;
            setResults(enriched);
        } catch (e: any) {
            if (seq !== seqRef.current) return;
            setResults([]);
            setError(e?.message || t('music.searchFailed'));
        } finally {
            if (seq === seqRef.current) setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void runSearch(query);
        }, 350);
        return () => window.clearTimeout(timer);
    }, [query, runSearch]);

    return (
        <div className="flex flex-col gap-5 px-1 pb-8">
            <div className="px-2">
                <p className={discoveryTheme.personalEyebrow}>{t('music.eyebrow')}</p>
                <h2 className="text-lg sm:text-xl font-black text-text mt-1">{t('music.title')}</h2>
                <p className="text-sm text-muted mt-1">{t('music.subtitle')}</p>
            </div>

            <div className="relative px-2">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('music.searchPlaceholder')}
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-white/5 text-sm focus:outline-none focus:ring-2 focus:ring-plex/40"
                />
            </div>

            {loading && (
                <div className="py-12 flex justify-center text-muted">
                    <Loader2 className="w-6 h-6 animate-spin" />
                </div>
            )}

            {error && !loading && (
                <p className="px-3 text-sm text-red-400">{error}</p>
            )}

            {!loading && !error && query.trim().length >= 2 && results.length === 0 && (
                <p className="px-3 text-sm text-muted">{t('music.noResults')}</p>
            )}

            {!loading && results.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 px-2">
                    {results.map((artist) => {
                        const formatted = formatItem ? formatItem(artist) : artist;
                        const poster = formatted.thumbUrl || formatted.posterPath || formatted.posterUrl;
                        return (
                        <button
                            key={artist.mbid || artist.id}
                            type="button"
                            onClick={() => (onSelect ? onSelect(formatted) : navigate(`/discovery/music/artist/${encodeURIComponent(artist.mbid || artist.id)}`))}
                            className="group text-left rounded-xl border border-border/60 bg-white/[0.02] overflow-hidden hover:border-plex/40 transition-colors relative"
                        >
                            {formatted.overlay && (
                                <div className="absolute top-2 left-2 z-10">{formatted.overlay}</div>
                            )}
                            <div className="aspect-square bg-white/5 relative">
                                {poster ? (
                                    <img
                                        src={poster}
                                        alt=""
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-muted">
                                        <Music className="w-10 h-10 opacity-40" />
                                    </div>
                                )}
                            </div>
                            <div className="p-2.5">
                                <p className="font-bold text-sm leading-tight line-clamp-2 group-hover:text-plex transition-colors">
                                    {formatted.name || formatted.title}
                                </p>
                                {artist.disambiguation && (
                                    <p className="text-[11px] text-muted mt-1 line-clamp-2">{artist.disambiguation}</p>
                                )}
                            </div>
                        </button>
                        );
                    })}
                </div>
            )}

            {query.trim().length < 2 && !loading && (
                <div className={`${discoveryTheme.emptyState} mx-2`}>
                    <div className="w-10 h-10 rounded-full bg-plex/15 text-plex flex items-center justify-center mx-auto">
                        <Music className="w-5 h-5" />
                    </div>
                    <p className={discoveryTheme.emptyTitle}>{t('music.startTitle')}</p>
                    <p className={discoveryTheme.emptyBody}>{t('music.startBody')}</p>
                </div>
            )}
        </div>
    );
};
