import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from './api';
import { usePoll } from './usePoll';

export const useDownloadCount = (enabled: boolean, pollSeconds = 15) => {
    const [downloadCount, setDownloadCount] = useState(0);
    const intervalMs = Math.min(30, Math.max(5, Math.round(Number(pollSeconds) || 15))) * 1000;

    const refresh = useCallback(async () => {
        if (!enabled) {
            setDownloadCount(0);
            return;
        }
        try {
            const data = await apiFetch('/api/downloads/status');
            setDownloadCount(Math.max(0, Number(data?.counts?.total) || 0));
        } catch {
            // Keep the last good count during short client outages.
        }
    }, [enabled]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    usePoll(refresh, enabled ? intervalMs : null);

    return { downloadCount, refresh };
};
