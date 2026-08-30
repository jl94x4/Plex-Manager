import React from 'react';

type Props = {
    children: React.ReactNode;
    /** Match settings-panel horizontal padding so the bar spans the card edge-to-edge. */
    flushPanel?: boolean;
};

export const StickySaveBar: React.FC<Props> = ({ children, flushPanel = false }) => (
    <div
        className={`sticky bottom-20 z-30 mt-6 border-t border-white/10 bg-card/85 py-3 backdrop-blur-xl md:bottom-0 ${
            flushPanel
                ? '-mx-5 px-5 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8 lg:-mx-10 lg:px-10'
                : ''
        }`}
    >
        <div className="flex flex-col-reverse items-stretch justify-end gap-3 sm:flex-row sm:items-center">
            {children}
        </div>
    </div>
);
