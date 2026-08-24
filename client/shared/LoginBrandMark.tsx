import React from 'react';
import { logoUrl } from './basePath';

const CIRCLE_FRAME_CLASS = 'rounded-full border-2 border-plex/40 shadow-[0_0_40px_rgba(229,160,13,0.25)] bg-black/25 flex items-center justify-center overflow-hidden';

type LoginBrandMarkProps = {
    src?: string | null;
    size?: 'md' | 'lg';
    className?: string;
};

/**
 * Login / invite brand mark: circular frame with object-contain so wide logos
 * scale inside the circle instead of being cropped by object-cover.
 */
export const LoginBrandMark: React.FC<LoginBrandMarkProps> = ({ src, size = 'md', className = '' }) => {
    const boxClass = size === 'lg' ? 'w-32 h-32' : 'w-28 h-28 sm:w-32 sm:h-32';
    const padClass = size === 'lg' ? 'p-4' : 'p-3 sm:p-4';

    if (!src) {
        return (
            <img
                src={logoUrl()}
                alt="Server Logo"
                className={`${boxClass} object-cover rounded-full border-2 border-plex/40 shadow-[0_0_40px_rgba(229,160,13,0.25)] relative z-10 ${className}`}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
        );
    }

    return (
        <div className={`relative z-10 ${boxClass} ${CIRCLE_FRAME_CLASS} ${padClass} ${className}`}>
            <img
                src={src}
                alt="Server Logo"
                className="max-w-full max-h-full w-auto h-auto object-contain"
                onError={(e) => {
                    e.currentTarget.src = logoUrl();
                    e.currentTarget.className = 'max-w-full max-h-full w-auto h-auto object-contain';
                }}
            />
        </div>
    );
};
