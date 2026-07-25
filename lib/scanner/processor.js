import { parseDurationMs } from './rewrite.js';
import { claimDueScan, appendLog, upsertScans, getQueueStats, listLog } from './queue.js';
import { createPlexTarget } from './targets/plex.js';
import { createJellyfinTarget, createEmbyTarget } from './targets/jellyfin.js';

const DEFAULT_SCANNER = {
    minimumAge: '1m',
    verifyPathExists: false,
    authUsername: '',
    authPassword: '',
    triggers: {
        sonarr: [{ name: 'sonarr', priority: 1, rewrite: [] }],
        radarr: [{ name: 'radarr', priority: 1, rewrite: [] }],
        lidarr: [{ name: 'lidarr', priority: 1, rewrite: [] }],
    },
    targets: {
        plex: [{ enabled: true, usePortalCredentials: true, url: '', token: '', rewrite: [] }],
        jellyfin: [{ enabled: false, usePortalCredentials: true, url: '', apiKey: '', rewrite: [] }],
        emby: [{ enabled: false, usePortalCredentials: true, url: '', apiKey: '', rewrite: [] }],
    },
};

export const getDefaultScannerConfig = () => JSON.parse(JSON.stringify(DEFAULT_SCANNER));

export const normalizeScannerConfig = (incoming, existing = {}) => {
    const base = { ...getDefaultScannerConfig(), ...(existing || {}) };
    const src = incoming && typeof incoming === 'object' ? incoming : {};
    const mergeTriggerList = (key) => {
        const list = Array.isArray(src.triggers?.[key]) ? src.triggers[key] : base.triggers[key];
        return (list || []).map((t, i) => ({
            name: String(t?.name || key).trim() || `${key}${i || ''}`,
            priority: Number(t?.priority) || 0,
            rewrite: Array.isArray(t?.rewrite)
                ? t.rewrite.map((r) => ({ from: String(r?.from || ''), to: String(r?.to || '') })).filter((r) => r.from)
                : [],
        }));
    };
    const mergeTargetList = (key) => {
        const list = Array.isArray(src.targets?.[key]) ? src.targets[key] : base.targets[key];
        const defaultEnabled = key === 'plex';
        return (list || []).map((t) => {
            const row = {
                enabled: t?.enabled !== undefined ? !!t.enabled : defaultEnabled,
                usePortalCredentials: t?.usePortalCredentials !== false,
                url: String(t?.url || ''),
                rewrite: Array.isArray(t?.rewrite)
                    ? t.rewrite.map((r) => ({ from: String(r?.from || ''), to: String(r?.to || '') })).filter((r) => r.from)
                    : [],
            };
            if (key === 'plex') {
                // Always use Settings → Plex for URL/token; Scanner only stores rewrites.
                row.usePortalCredentials = true;
                row.url = '';
                row.token = '';
            } else {
                row.apiKey = String(t?.apiKey || t?.token || '');
            }
            return row;
        });
    };

    return {
        minimumAge: String(src.minimumAge ?? base.minimumAge ?? '1m'),
        // Always off — portal containers rarely mount media paths, so disk checks block the queue.
        verifyPathExists: false,
        authUsername: String(src.authUsername ?? base.authUsername ?? ''),
        authPassword: String(src.authPassword ?? base.authPassword ?? ''),
        triggers: {
            sonarr: mergeTriggerList('sonarr'),
            radarr: mergeTriggerList('radarr'),
            lidarr: mergeTriggerList('lidarr'),
        },
        targets: {
            plex: mergeTargetList('plex'),
            jellyfin: mergeTargetList('jellyfin'),
            emby: mergeTargetList('emby'),
        },
    };
};

export const maskScannerConfigForApi = (scanner, secretMask) => {
    if (!scanner || typeof scanner !== 'object') return getDefaultScannerConfig();
    const clone = JSON.parse(JSON.stringify(scanner));
    if (clone.authPassword) clone.authPassword = secretMask;
    for (const t of clone.targets?.plex || []) {
        if (t.token) t.token = secretMask;
    }
    for (const t of clone.targets?.jellyfin || []) {
        if (t.apiKey) t.apiKey = secretMask;
    }
    for (const t of clone.targets?.emby || []) {
        if (t.apiKey) t.apiKey = secretMask;
    }
    return clone;
};

export const resolveScannerSecrets = (incoming, existing, secretMask) => {
    const resolve = (next, prev) => {
        if (next === secretMask) return prev || '';
        if (next === undefined || next === null) return prev || '';
        if (next === '' && prev) return prev;
        return String(next);
    };
    const out = normalizeScannerConfig(incoming, existing);
    out.authPassword = resolve(incoming?.authPassword, existing?.authPassword);
    const resolveTargetSecrets = (key, field) => {
        const nextList = incoming?.targets?.[key] || [];
        const prevList = existing?.targets?.[key] || [];
        out.targets[key] = (out.targets[key] || []).map((t, i) => ({
            ...t,
            [field]: resolve(nextList[i]?.[field] ?? nextList[i]?.token, prevList[i]?.[field] || prevList[i]?.token),
        }));
    };
    resolveTargetSecrets('plex', 'token');
    resolveTargetSecrets('jellyfin', 'apiKey');
    resolveTargetSecrets('emby', 'apiKey');
    return out;
};

/** Validate/normalize custom JF/Emby target URLs (portal-credential targets keep empty URL). */
export const sanitizeScannerTargetUrls = (scanner, sanitizeUrl, existing = {}) => {
    if (!scanner || typeof scanner !== 'object') return scanner;
    const out = {
        ...scanner,
        targets: {
            plex: [...(scanner.targets?.plex || [])],
            jellyfin: [...(scanner.targets?.jellyfin || [])],
            emby: [...(scanner.targets?.emby || [])],
        },
    };
    for (const key of ['jellyfin', 'emby']) {
        const prevList = existing?.targets?.[key] || [];
        out.targets[key] = (out.targets[key] || []).map((t, i) => {
            if (!t || typeof t !== 'object') return t;
            if (t.usePortalCredentials) return { ...t, url: '' };
            const raw = String(t.url || '').trim();
            if (!raw) return { ...t, url: '' };
            const previous = String(prevList[i]?.url || '').trim();
            if (raw === previous) return { ...t, url: previous };
            return { ...t, url: sanitizeUrl(raw) };
        });
    }
    return out;
};

/**
 * Build live target clients from portal config + scanner config.
 */
export const explainMissingTargets = (portalConfig, scannerConfig) => {
    const mediaType = String(portalConfig?.mediaServerType || 'plex').toLowerCase();
    const plexRows = scannerConfig?.targets?.plex || [];
    const jfRows = scannerConfig?.targets?.jellyfin || [];
    const embyRows = scannerConfig?.targets?.emby || [];
    const plexEnabled = plexRows.some((t) => t.enabled);
    const jfEnabled = jfRows.some((t) => t.enabled);
    const embyEnabled = embyRows.some((t) => t.enabled);

    if (!plexEnabled && !jfEnabled && !embyEnabled) {
        return 'No scanner targets enabled. In Settings → Scanner, turn on Enable Plex (or Jellyfin/Emby), then Save.';
    }

    const hints = [];
    if (plexEnabled) {
        const url = String(portalConfig?.plexServerUrl || portalConfig?.plexUrl || '').trim();
        const token = String(portalConfig?.plexToken || '').trim();
        if (!url) {
            hints.push('Plex target needs a direct server URL in Settings → Plex (e.g. http://192.168.1.10:32400). plex.tv login alone is not enough for Scanner.');
        }
        if (!token) {
            hints.push('Plex token is missing in Settings → Plex.');
        }
        if (mediaType !== 'plex' && url && token) {
            hints.push(`Portal media server type is "${mediaType}" — ensure the Plex URL is still set if you scan Plex.`);
        }
    }
    if (jfEnabled) {
        const url = String(portalConfig?.jellyfinUrl || '').trim();
        const key = String(portalConfig?.jellyfinApiKey || '').trim();
        if (!url || !key) hints.push('Jellyfin target is enabled but Settings → Jellyfin URL/API key is incomplete.');
    }
    if (embyEnabled) {
        const url = String(portalConfig?.embyUrl || portalConfig?.jellyfinUrl || '').trim();
        const key = String(portalConfig?.embyApiKey || portalConfig?.jellyfinApiKey || '').trim();
        if (!url || !key) hints.push('Emby target is enabled but Settings → Emby URL/API key is incomplete.');
    }
    return hints.join(' ') || 'No enabled scanner targets configured.';
};

export const buildTargets = (portalConfig, scannerConfig) => {
    const targets = [];
    const mediaType = String(portalConfig?.mediaServerType || 'plex').toLowerCase();

    for (const t of scannerConfig?.targets?.plex || []) {
        if (!t.enabled) continue;
        // Always prefer portal Plex integration token; optional override only when
        // usePortalCredentials is explicitly false.
        const usePortal = t.usePortalCredentials !== false;
        const url = usePortal
            ? (portalConfig.plexServerUrl || portalConfig.plexUrl || '')
            : (t.url || portalConfig.plexServerUrl || portalConfig.plexUrl || '');
        const token = usePortal
            ? (portalConfig.plexToken || '')
            : (t.token || portalConfig.plexToken || '');
        if (!url || !token) continue;
        if (mediaType !== 'plex' && usePortal && !(t.url || portalConfig.plexServerUrl)) continue;
        targets.push(createPlexTarget({ url, token, rewrite: t.rewrite || [] }));
    }

    for (const t of scannerConfig?.targets?.jellyfin || []) {
        if (!t.enabled) continue;
        const url = t.usePortalCredentials ? (portalConfig.jellyfinUrl || '') : (t.url || portalConfig.jellyfinUrl || '');
        const apiKey = t.usePortalCredentials ? (portalConfig.jellyfinApiKey || '') : (t.apiKey || portalConfig.jellyfinApiKey || '');
        if (!url || !apiKey) continue;
        targets.push(createJellyfinTarget({ url, apiKey, rewrite: t.rewrite || [] }));
    }

    for (const t of scannerConfig?.targets?.emby || []) {
        if (!t.enabled) continue;
        const url = t.usePortalCredentials
            ? (portalConfig.embyUrl || portalConfig.jellyfinUrl || '')
            : (t.url || portalConfig.embyUrl || '');
        const apiKey = t.usePortalCredentials
            ? (portalConfig.embyApiKey || portalConfig.jellyfinApiKey || '')
            : (t.apiKey || portalConfig.embyApiKey || '');
        if (!url || !apiKey) continue;
        targets.push(createEmbyTarget({ url, apiKey, rewrite: t.rewrite || [] }));
    }

    return targets;
};

export const findTriggerByName = (scannerConfig, name) => {
    const needle = String(name || '').toLowerCase();
    for (const kind of ['sonarr', 'radarr', 'lidarr']) {
        for (const t of scannerConfig?.triggers?.[kind] || []) {
            if (String(t.name || '').toLowerCase() === needle) {
                return { kind, ...t };
            }
        }
    }
    return null;
};

let workerTimer = null;
let workerBusy = false;
let getConfigFn = null;

export const enqueueScans = async (scans) => upsertScans(scans);

export const processOne = async (portalConfig, scannerConfig) => {
    const minAgeMs = parseDurationMs(scannerConfig?.minimumAge, 60_000);
    const scan = await claimDueScan(minAgeMs, { verifyPathExists: false });
    if (!scan) return { didWork: false };

    const targets = buildTargets(portalConfig, scannerConfig);
    if (!targets.length) {
        const detail = explainMissingTargets(portalConfig, scannerConfig);
        console.warn(`[scanner] No enabled targets for ${scan.folder} — ${detail}`);
        await appendLog({
            ok: false,
            folder: scan.folder,
            source: scan.source,
            eventType: scan.eventType,
            action: scan.action,
            reason: scan.reason,
            title: scan.title,
            quality: scan.quality,
            isUpgrade: scan.isUpgrade,
            error: detail,
        });
        // Re-queue so enabling a target later can pick it up
        await upsertScans([scan]);
        return { didWork: false, error: 'no targets' };
    }

    try {
        for (const target of targets) {
            await target.available();
        }
        const results = [];
        for (const target of targets) {
            const result = await target.scan(scan.folder);
            results.push({ type: target.type, ...result });
            if (result?.skipped) {
                console.warn(`[scanner] ${target.type} skipped ${scan.folder}: ${result.reason || 'no matching library'}`);
            } else {
                console.log(`[scanner] ${target.type} scanned ${scan.folder}`);
            }
        }
        await appendLog({
            ok: true,
            folder: scan.folder,
            source: scan.source,
            priority: scan.priority,
            eventType: scan.eventType,
            action: scan.action,
            reason: scan.reason,
            title: scan.title,
            quality: scan.quality,
            isUpgrade: scan.isUpgrade,
            results,
        });
        return { didWork: true, scan, results };
    } catch (err) {
        console.warn(`[scanner] Process failed for ${scan.folder}: ${err?.message || err}`);
        // Put back on queue if target temporarily unavailable
        await upsertScans([scan]);
        await appendLog({
            ok: false,
            folder: scan.folder,
            source: scan.source,
            eventType: scan.eventType,
            action: scan.action,
            reason: scan.reason,
            title: scan.title,
            quality: scan.quality,
            isUpgrade: scan.isUpgrade,
            error: err?.message || String(err),
            code: err?.code,
        });
        return { didWork: false, error: err?.message };
    }
};

export const startScannerWorker = (getConfig) => {
    getConfigFn = getConfig;
    if (workerTimer) return;
    workerTimer = setInterval(async () => {
        if (workerBusy || !getConfigFn) return;
        workerBusy = true;
        try {
            const config = await getConfigFn();
            if (!config?.scannerEnabled) return;
            const scanner = normalizeScannerConfig(config.scanner, getDefaultScannerConfig());
            await processOne(config, scanner);
        } catch {
            // swallow — next tick retries
        } finally {
            workerBusy = false;
        }
    }, 8_000);
    if (typeof workerTimer.unref === 'function') workerTimer.unref();
};

export const stopScannerWorker = () => {
    if (workerTimer) clearInterval(workerTimer);
    workerTimer = null;
};

export { getQueueStats, listLog, upsertScans };
