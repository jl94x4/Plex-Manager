import React, { useState, useEffect } from 'react';
import { DiscoveryLogo } from './DiscoveryLogo';

type CompanyCardProps = {
    name: string;
    logoPath: string;
    onClick: () => void;
};

/** Overseerr-style duotone logo card for networks and studios. */
export const CompanyCard: React.FC<CompanyCardProps> = ({ name, logoPath, onClick }) => {
    const [failed, setFailed] = useState(false);

    return (
        <button
            type="button"
            onClick={onClick}
            className="company-card group relative w-[170px] sm:w-[200px] h-[100px] sm:h-[112px] flex-shrink-0 snap-start rounded-xl border border-border bg-card/80 overflow-hidden transition-all duration-300 hover:scale-[1.03] hover:border-plex/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-plex"
            aria-label={name}
        >
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] to-transparent pointer-events-none" />
            {!failed ? (
                <DiscoveryLogo
                    logoPath={logoPath}
                    alt={name}
                    width={780}
                    duotone
                    onError={() => setFailed(true)}
                    className="company-duotone-logo absolute inset-0 m-auto max-w-[78%] max-h-[58%] object-contain opacity-90 group-hover:opacity-100 transition-opacity"
                />
            ) : (
                <span className="absolute inset-0 flex items-center justify-center px-3 text-center text-sm font-bold text-text/90">
                    {name}
                </span>
            )}
        </button>
    );
};

type GenreCardProps = {
    name: string;
    gradient?: string;
    /** Seerr/Overseerr genre slider duotone backdrop URL */
    image?: string;
    onClick: () => void;
};

export const GenreCard: React.FC<GenreCardProps> = ({ name, gradient, image, onClick }) => {
    const [imageFailed, setImageFailed] = useState(false);
    const showImage = Boolean(image) && !imageFailed;

    useEffect(() => {
        setImageFailed(false);
    }, [image]);

    return (
        <button
            type="button"
            onClick={onClick}
            className={`relative w-[180px] sm:w-[216px] h-[106px] sm:h-[120px] flex-shrink-0 snap-start rounded-xl overflow-hidden px-4 flex items-center justify-center cursor-pointer hover:scale-[1.03] transition-transform border border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-plex ${
                showImage ? 'bg-card' : `bg-gradient-to-br ${gradient || 'from-card to-background'}`
            }`}
        >
            {showImage && (
                <>
                    <img
                        src={image}
                        alt=""
                        aria-hidden="true"
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                        onError={() => setImageFailed(true)}
                    />
                    <div className="absolute inset-0 bg-black/45 pointer-events-none" />
                </>
            )}
            <span className={`relative z-10 font-black text-center leading-tight text-sm sm:text-base ${showImage ? 'text-white light-on-media' : 'text-text'}`}>
                {name}
            </span>
        </button>
    );
};
