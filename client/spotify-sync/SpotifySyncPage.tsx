import React, { useMemo, useState } from 'react';
import { Music, RefreshCw } from 'lucide-react';
import { portalUrl } from '../shared/basePath';
import { DashboardHero, DashboardPageShell } from '../shared/dashboard/DashboardChrome';

const EMBED_PATH = '/api/spotify-to-plex-embed/app/';

export const SpotifySyncPage: React.FC = () => {
    const iframeSrc = useMemo(() => portalUrl(EMBED_PATH), []);
    const [iframeKey, setIframeKey] = useState(0);

    return (
        <DashboardPageShell className="flex min-h-0 flex-1 flex-col">
            <DashboardHero
                accent="plex"
                eyebrow="Spotify Sync"
                title="Playlist sync for Plex"
                description="Manage Spotify-to-Plex playlists, matching, and scheduled sync from the embedded spotify-to-plex UI."
                icon={<Music className="h-3.5 w-3.5" />}
                secondaryBlob
            />
            <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-background/40 overflow-hidden">
                <div className="flex shrink-0 items-center justify-end gap-2 border-b border-border px-3 py-2">
                    <button
                        type="button"
                        onClick={() => setIframeKey((value) => value + 1)}
                        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:border-plex hover:text-plex"
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Reload UI
                    </button>
                </div>
                <iframe
                    key={iframeKey}
                    title="Spotify Sync"
                    src={iframeSrc}
                    className="min-h-[min(72vh,900px)] w-full flex-1 border-0 bg-background md:min-h-[calc(100dvh-14rem)]"
                    allow="clipboard-read; clipboard-write"
                />
            </div>
        </DashboardPageShell>
    );
};
