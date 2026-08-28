import React from 'react';
import { discoveryTheme } from './discoveryThemeClasses';

export const DiscoverSectionHeader: React.FC<{
    title: string;
    onViewAll?: () => void;
    viewAllLabel?: string;
    className?: string;
}> = ({ title, onViewAll, viewAllLabel, className = '' }) => (
    <div className={`flex items-center gap-3 min-w-0 pr-16 ${className}`.trim()}>
        {onViewAll ? (
            <button
                type="button"
                onClick={onViewAll}
                className={`${discoveryTheme.sectionTitle} truncate text-left hover:text-plex transition-colors`}
            >
                {title}
            </button>
        ) : (
            <h2 className={`${discoveryTheme.sectionTitle} truncate`}>{title}</h2>
        )}
        {onViewAll && viewAllLabel ? (
            <button
                type="button"
                onClick={onViewAll}
                className="shrink-0 text-xs font-bold text-plex hover:underline"
            >
                {viewAllLabel}
            </button>
        ) : null}
    </div>
);
