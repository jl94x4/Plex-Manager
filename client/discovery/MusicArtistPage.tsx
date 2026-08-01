import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Music } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { NoPosterPlaceholder } from '../shared/NoPosterPlaceholder';
import { MusicRequestModal } from './MusicRequestModal';
import { discoveryTheme } from './discoveryThemeClasses';
import { useDiscoverI18n } from './i18n';

export const MusicArtistPage: React.FC<{
    mbid: string;
    onBack: () => void;
    pushToast?: (msg: string, type: 'success' | 'error') => void;
}> = ({ mbid, onBack, pushToast }) => {
    const { t } = useDiscoverI18n();
    const [loading, setLoading] = useState(true);
    const [artist, setArtist] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [requestOpen, setRequestOpen] = useState(false);

    const loadArtist = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await apiFetch(`/api/discovery/music/artist/${encodeURIComponent(mbid)}`);
            setArtist(data);
        } catch (e: any) {
            setArtist(null);
            setError(e?.message || t('music.loadFailed'));
        } finally {
            setLoading(false);
        }
    }, [mbid, t]);

    useEffect(() => {
        loadArtist();
    }, [loadArtist]);

    const toast = pushToast || (() => {});

    if (loading) {
        return (
            <div className="py-16 flex justify-center text-muted">
                <Loader2 className="w-7 h-7 animate-spin" />
            </div>
        );
    }

    if (error || !artist) {
        return (
            <div className="px-4 py-8 flex flex-col gap-4">
                <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-text">
                    <ArrowLeft className="w-4 h-4" /> {t('music.back')}
                </button>
                <p className="text-red-400">{error || t('music.notFound')}</p>
            </div>
        );
    }

    const posterUrl = artist.posterUrl || artist.posterPath || null;

    return (
        <div className="px-2 sm:px-4 pb-10 flex flex-col gap-5">
            <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-text self-start">
                <ArrowLeft className="w-4 h-4" /> {t('music.back')}
            </button>

            <div className="rounded-2xl border border-border/60 bg-white/[0.02] overflow-hidden">
                <div className="flex flex-col sm:flex-row gap-4 p-4 sm:p-6">
                    <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-2xl overflow-hidden bg-white/5 shrink-0 mx-auto sm:mx-0">
                        {posterUrl ? (
                            <img src={posterUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted">
                                <Music className="w-12 h-12 opacity-40" />
                            </div>
                        )}
                    </div>
                    <div className="min-w-0 flex-1 text-center sm:text-left">
                        <p className={discoveryTheme.personalEyebrow}>{t('music.artist')}</p>
                        <h1 className="text-2xl sm:text-3xl font-black text-text mt-1">{artist.name || artist.title}</h1>
                        {artist.disambiguation && (
                            <p className="text-sm text-muted mt-1">{artist.disambiguation}</p>
                        )}
                        {artist.overview && (
                            <p className="text-sm text-muted mt-3 leading-relaxed">{artist.overview}</p>
                        )}
                        {Array.isArray(artist.tags) && artist.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-4 justify-center sm:justify-start">
                                {artist.tags.map((tag: string) => (
                                    <span key={tag} className="px-2 py-1 rounded-full bg-white/5 border border-border/60 text-[11px] font-bold text-muted">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() => setRequestOpen(true)}
                            className="mt-5 px-5 py-2.5 rounded-xl bg-plex text-black font-black hover:bg-plex-hover transition-colors"
                        >
                            {t('music.requestArtist')}
                        </button>
                    </div>
                </div>
            </div>

            <MusicRequestModal
                open={requestOpen}
                mbid={mbid}
                title={artist.name || artist.title}
                posterUrl={posterUrl}
                overview={artist.overview}
                onClose={() => setRequestOpen(false)}
                onSuccess={(msg) => toast(msg, 'success')}
                onError={(msg) => toast(msg, 'error')}
            />
        </div>
    );
};
