import { useEffect, useState } from 'react';
import {
    DEFAULT_UPGRADER_GRID_SIZE,
    normalizeUpgraderGridSize,
    type UpgraderGridSize,
} from '../shared/portalLayout';

export const DISCOVERY_GRID_SIZE_STORAGE_KEY = 'discoveryGridSize.v2';

export const useDiscoverGridSize = () => {
    const [gridSize, setGridSize] = useState<UpgraderGridSize>(() => {
        if (typeof window === 'undefined') return DEFAULT_UPGRADER_GRID_SIZE;
        return normalizeUpgraderGridSize(window.localStorage.getItem(DISCOVERY_GRID_SIZE_STORAGE_KEY));
    });

    useEffect(() => {
        window.localStorage.setItem(DISCOVERY_GRID_SIZE_STORAGE_KEY, gridSize);
    }, [gridSize]);

    return [gridSize, setGridSize] as const;
};
