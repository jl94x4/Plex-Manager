import React from 'react';
import { PosterSetsDashboardContext } from './PosterSetsDashboardContext';
import { usePosterSetsDashboard } from './usePosterSetsDashboard';
import { PosterSetsShell } from './views/PosterSetsShell';

export const PosterSetsDashboard: React.FC = () => {
    const value = usePosterSetsDashboard();
    return (
        <PosterSetsDashboardContext.Provider value={value}>
            <PosterSetsShell />
        </PosterSetsDashboardContext.Provider>
    );
};

export default PosterSetsDashboard;
