import type { CSSProperties } from 'react';

export const activityStreamColumnCount = () => 3;

export const activityStreamGridClass = () => 'discover-activity-grid';

/** Auto-wrapping poster grid sized to the content area, not the viewport. */
export const discoverPosterGridClass = 'discover-poster-grid';

export type UpgraderGridSize = 'small' | 'medium' | 'large' | 'xlarge' | 'list';

export const DEFAULT_UPGRADER_GRID_SIZE: UpgraderGridSize = 'large';

export const UPGRADER_GRID_SIZE_OPTIONS: Array<{ value: UpgraderGridSize; label: string }> = [
    { value: 'small', label: 'Grid: Small' },
    { value: 'medium', label: 'Grid: Medium' },
    { value: 'large', label: 'Grid: Large' },
    { value: 'xlarge', label: 'Grid: Extra large' },
    { value: 'list', label: 'List view' },
];

export const upgraderPosterGridClass = (size: UpgraderGridSize) => size === 'list' ? 'flex flex-col gap-3' : `upgrader-poster-grid upgrader-poster-grid--${size}`;

/** Minimum poster column width per density preset (used with auto-fill). */
export const UPGRADER_GRID_MIN_WIDTH: Record<UpgraderGridSize, string> = {
    small: '5rem',
    medium: '7rem',
    large: '9.5rem',
    xlarge: '13rem',
    list: '100%',
};

/** Wider columns for landscape title-card packs (roughly 16:9 vs 2:3 posters). */
export const UPGRADER_LANDSCAPE_GRID_MIN_WIDTH: Record<UpgraderGridSize, string> = {
    small: '10rem',
    medium: '14rem',
    large: '18rem',
    xlarge: '22rem',
    list: '100%',
};

/** Match discover-poster-grid @container breakpoints (width in px). */
export const discoverPosterGridColumnsAtWidth = (containerWidth: number): number => {
    if (containerWidth >= 896) return 10;
    if (containerWidth >= 768) return 8;
    if (containerWidth >= 480) return 5;
    if (containerWidth >= 384) return 4;
    return 3;
};

/** Approximate main content width (sidebar-aware). */
export const estimatePortalContentWidth = (): number => {
    if (typeof window === 'undefined') return 1200;
    const isDesktop = window.matchMedia('(min-width: 768px)').matches;
    const sidebar = isDesktop ? 288 : 0;
    const padding = isDesktop ? 64 : 8;
    return Math.max(320, window.innerWidth - sidebar - padding);
};

export const posterGridSkeletonCount = (rows = 2, containerWidth = estimatePortalContentWidth()): number => (
    discoverPosterGridColumnsAtWidth(containerWidth) * rows
);

export const carouselRowSkeletonCount = (containerWidth = estimatePortalContentWidth()): number => {
    const cardWidth = containerWidth >= 640 ? 160 : 140;
    return Math.max(4, Math.ceil(containerWidth / (cardWidth + 16)));
};

export const upgraderPosterGridStyle = (size: UpgraderGridSize): CSSProperties => size === 'list' ? {} : ({
    gridTemplateColumns: `repeat(auto-fill, minmax(${UPGRADER_GRID_MIN_WIDTH[size]}, 1fr))`,
});

export const upgraderLandscapeGridStyle = (size: UpgraderGridSize): CSSProperties => size === 'list' ? {} : ({
    gridTemplateColumns: `repeat(auto-fill, minmax(${UPGRADER_LANDSCAPE_GRID_MIN_WIDTH[size]}, 1fr))`,
});

/** Fixed carousel poster widths for Discover home rails (mirrors Movies/Series grid density). */
export const DISCOVER_ROW_CARD_WIDTH_CLASS: Record<UpgraderGridSize, string> = {
    small: 'w-[100px] sm:w-[112px]',
    medium: 'w-[140px] sm:w-[160px]',
    large: 'w-[170px] sm:w-[196px]',
    xlarge: 'w-[204px] sm:w-[236px]',
    list: 'w-[140px] sm:w-[160px]',
};

export const discoverRowCardWidthClass = (size: UpgraderGridSize) => DISCOVER_ROW_CARD_WIDTH_CLASS[size] || DISCOVER_ROW_CARD_WIDTH_CLASS[DEFAULT_UPGRADER_GRID_SIZE];

/** Square album/artist card widths for Discover music rails. */
export const DISCOVER_MUSIC_ROW_CARD_WIDTH_CLASS: Record<UpgraderGridSize, string> = {
    small: 'w-[112px] sm:w-[128px]',
    medium: 'w-[140px] sm:w-[160px]',
    large: 'w-[168px] sm:w-[188px]',
    xlarge: 'w-[196px] sm:w-[220px]',
    list: 'w-[140px] sm:w-[160px]',
};

export const discoverMusicRowCardWidthClass = (size: UpgraderGridSize) => (
    DISCOVER_MUSIC_ROW_CARD_WIDTH_CLASS[size] || DISCOVER_MUSIC_ROW_CARD_WIDTH_CLASS[DEFAULT_UPGRADER_GRID_SIZE]
);

export const UPGRADER_GRID_SIZE_STORAGE_KEY = 'upgraderGridSize.v2';

export const normalizeUpgraderGridSize = (value: unknown): UpgraderGridSize => {
    if (value === 'small' || value === 'medium' || value === 'large' || value === 'xlarge' || value === 'list') return value;
    return DEFAULT_UPGRADER_GRID_SIZE;
};
