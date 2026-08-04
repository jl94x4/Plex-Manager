import React, { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, Star, Calendar, Film, ChevronDown } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { DiscoverPosterCard } from '../screens';
import { filterHiddenAvailableItems, useDiscoveryPreferences } from './useDiscoveryPreferences';
import { upgraderPosterGridClass, upgraderPosterGridStyle } from '../shared/portalLayout';
import { useDiscoverI18n } from './i18n';

const splitBiography = (bio: string) => {
    const trimmed = bio.trim();
    if (!trimmed) return { first: '', rest: '', hasMore: false };

    const paragraphs = trimmed.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
    if (paragraphs.length <= 1) {
        return { first: paragraphs[0] || trimmed, rest: '', hasMore: false };
    }

    return {
        first: paragraphs[0],
        rest: paragraphs.slice(1).join('\n\n'),
        hasMore: true,
    };
};

export const PersonDetailsPage: React.FC<{
    personId: number;
    onBack: () => void;
    onSelect: (item: any) => void;
    formatItem: (item: any) => any;
}> = ({ personId, onBack, onSelect, formatItem }) => {
    const { locale } = useDiscoverI18n();
    const { preferences } = useDiscoveryPreferences();
    const [person, setPerson] = useState<any>(null);
    const [credits, setCredits] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [bioExpanded, setBioExpanded] = useState(false);

    useEffect(() => {
        const fetchPerson = async () => {
            setLoading(true);
            try {
                // Fetch person details
                const personData = await apiFetch(`/api/discovery/proxy/person/${personId}`);
                if (personData) setPerson(personData);

                // Fetch person combined credits
                const creditsData = await apiFetch(`/api/discovery/proxy/person/${personId}/combined_credits`);
                if (creditsData && creditsData.cast) {
                    // Sort by popularity or release date
                    const sorted = creditsData.cast
                        .filter((c: any) => c.posterPath)
                        .sort((a: any, b: any) => b.popularity - a.popularity)
                        .slice(0, 50);
                    setCredits(sorted);
                }
            } catch (err) {
                console.error(err);
            }
            setLoading(false);
        };
        fetchPerson();
    }, [personId, locale]);

    useEffect(() => {
        setBioExpanded(false);
    }, [personId]);

    if (loading) {
        return (
            <div className="w-full flex justify-center py-32">
                <Loader2 className="w-12 h-12 text-plex animate-spin" />
            </div>
        );
    }

    if (!person) return null;

    const profileUrl = person.profilePath ? `https://image.tmdb.org/t/p/h632${person.profilePath}` : '';
    const age = person.birthday ? new Date().getFullYear() - new Date(person.birthday).getFullYear() : null;
    const visibleCredits = filterHiddenAvailableItems(credits, preferences.hideAvailableMedia);
    const biography = person.biography || `We do not have a biography for ${person.name}.`;
    const { first: bioFirst, rest: bioRest, hasMore: bioHasMore } = splitBiography(biography);

    return (
        <div className="w-full flex flex-col gap-8 pb-12 animate-fade-in relative z-10 mt-4">
            <button 
                onClick={onBack}
                className="flex items-center gap-2 text-muted hover:text-text font-medium transition-colors w-fit"
            >
                <ArrowLeft className="w-5 h-5" /> Back to Discovery
            </button>

            <div className="flex flex-col md:flex-row gap-8">
                {/* Profile Image */}
                <div className="w-full md:w-1/3 max-w-[350px] flex-shrink-0">
                    {profileUrl ? (
                        <img 
                            src={profileUrl} 
                            alt={person.name}
                            className="w-full rounded-2xl object-cover aspect-[2/3] border border-border"
                        />
                    ) : (
                        <div className="w-full rounded-2xl bg-white/5 border border-border aspect-[2/3] flex items-center justify-center">
                            <span className="text-muted text-2xl font-bold">No Photo</span>
                        </div>
                    )}
                </div>

                {/* Profile Info */}
                <div className="flex-1 flex flex-col gap-6">
                    <h1 className="text-4xl sm:text-6xl font-black text-text tracking-tight">
                        {person.name}
                    </h1>

                    <div className="flex flex-wrap gap-4 text-sm font-bold text-muted uppercase tracking-widest">
                        {person.knownForDepartment && (
                            <span className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full border border-white/5">
                                <Star className="w-4 h-4 text-plex" /> {person.knownForDepartment}
                            </span>
                        )}
                        {person.birthday && (
                            <span className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full border border-white/5">
                                <Calendar className="w-4 h-4 text-plex" /> {person.birthday} {age ? `(${age} years old)` : ''}
                            </span>
                        )}
                        {person.placeOfBirth && (
                            <span className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full border border-white/5">
                                {person.placeOfBirth}
                            </span>
                        )}
                    </div>

                    <div className="flex flex-col gap-3 mt-4">
                        <h2 className="text-2xl font-bold text-text">Biography</h2>
                        <div className="text-muted text-lg leading-relaxed whitespace-pre-line space-y-4">
                            <p>{bioFirst}</p>
                            {bioHasMore && bioExpanded && <p>{bioRest}</p>}
                        </div>
                        {bioHasMore && (
                            <button
                                type="button"
                                onClick={() => setBioExpanded((expanded) => !expanded)}
                                className="inline-flex items-center gap-1.5 text-sm font-bold text-plex hover:text-plex-hover transition-colors w-fit"
                            >
                                {bioExpanded ? 'Show less' : 'Read more'}
                                <ChevronDown className={`w-4 h-4 transition-transform ${bioExpanded ? 'rotate-180' : ''}`} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Known For Grid */}
            {visibleCredits.length > 0 && (
                <div className="flex flex-col gap-4 mt-12 border-t border-border pt-10">
                    <h2 className="text-2xl font-black text-text flex items-center gap-3">
                        <Film className="w-6 h-6 text-plex" /> Known For
                    </h2>
                    <div className={upgraderPosterGridClass('large')} style={upgraderPosterGridStyle('large')}>
                        {visibleCredits.map((rawItem, idx) => {
                            const formatted = formatItem(rawItem);
                            return (
                                <DiscoverPosterCard
                                    key={`${formatted.id}-${idx}`}
                                    item={formatted}
                                    overlay={formatted.overlay}
                                    showQualityBadges={false}
                                    onPosterClick={() => onSelect(formatted)}
                                    footer={(
                                        <div className="text-[11px] font-medium line-clamp-2 leading-tight text-text text-center mt-1 px-0.5">
                                            {formatted.title}
                                        </div>
                                    )}
                                />
                            );
                        })}
                    </div>
                </div>
            )}

        </div>
    );
};
