import React, { useMemo } from 'react';
import { Music, RefreshCw } from 'lucide-react';
import { portalUrl } from '../shared/basePath';

const EMBED_PATH = '/api/spotify-to-plex-embed/app/';

export const SpotifySyncPage: React.FC = () => {
    const iframeSrc = useMemo(() => portalUrl(EMBED_PATH), []);
    const [iframeKey, setIframeKey] = React.useState(0);

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-6">
                <div className="flex items-center gap-2">
                    <Music className="h-5 w-5 text-plex" aria-hidden />
                    <h1 className="text-lg font-bold text-text">Spotify Sync</h1>
                </div>
                <button
                    type="button"
                    onClick={() => setIframeKey((value) => value + 1)}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:border-plex hover:text-plex"
                >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Reload
                </button>
            </div>
            <iframe
                key={iframeKey}
                title="Spotify Sync"
                src={iframeSrc}
                className="min-h-0 w-full flex-1 border-0 bg-background"
                allow="clipboard-read; clipboard-write"
            />
        </div>
    );
};
