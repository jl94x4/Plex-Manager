import React from 'react';
import { Plus, Trash2, Star } from 'lucide-react';
import type { ArrInstance } from '../shared/types';
import { IntegrationTestButton } from '../shared/IntegrationTestButton';
import { SettingsSwitch } from '../shared/ui';

const SECRET_MASK = '••••••••';
type ArrAppType = ArrInstance['type'];

const ARR_ICON_URLS: Record<ArrAppType, string> = {
    sonarr: 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/sonarr.svg',
    radarr: 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/radarr.svg',
    lidarr: 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/lidarr.svg',
    bazarr: 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/bazarr.svg',
};

const ARR_APP_LABELS: Record<ArrAppType, string> = {
    sonarr: 'Sonarr',
    radarr: 'Radarr',
    lidarr: 'Lidarr',
    bazarr: 'Bazarr',
};

const ARR_APP_PLACEHOLDERS: Record<ArrAppType, { url: string; externalUrl: string }> = {
    sonarr: { url: 'http://localhost:8989', externalUrl: 'https://sonarr.yourdomain.com' },
    radarr: { url: 'http://localhost:7878', externalUrl: 'https://radarr.yourdomain.com' },
    lidarr: { url: 'http://localhost:8686', externalUrl: 'https://lidarr.yourdomain.com' },
    bazarr: { url: 'http://localhost:6767', externalUrl: 'https://bazarr.yourdomain.com' },
};

const hasCredentials = (
    instance: ArrInstance,
    saved?: ArrInstance,
) => {
    const effectiveUrl = String(instance.url || saved?.url || '').trim();
    const effectiveKey = String(instance.apiKey || saved?.apiKey || '').trim();
    return Boolean(effectiveUrl && effectiveKey && effectiveKey !== SECRET_MASK);
};

const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

export const createEmptyArrInstance = (type: ArrAppType, isDefault = false): ArrInstance => ({
    id: generateId(),
    type,
    name: ARR_APP_LABELS[type],
    url: '',
    externalUrl: '',
    apiKey: '',
    enabled: true,
    isDefault,
    is4k: false,
    plexLibraryIds: [],
});

type PlexLibrary = {
    id: string;
    title: string;
    type: string;
};

export type ArrInstancesPanelCopy = {
    addInstance: string;
    noInstances: (appName: string) => string;
    instanceLabel: (index: number) => string;
    defaultLabel: string;
    defaultInstanceTitle: string;
    setAsDefaultTitle: string;
    removeInstanceTitle: string;
    displayName: string;
    ultraHdInstance: string;
    ultraHdRoutingHint: string;
    url: string;
    externalUrl: string;
    externalUrlOptional: string;
    apiKey: string;
    apiKeyPlaceholder: string;
    plexLibraries: string;
    libraryMappingHint: string;
    assignedElsewhere: string;
    testConnection: string;
    connectionSuccessful: string;
    connectionFailed: string;
};

const DEFAULT_COPY: ArrInstancesPanelCopy = {
    addInstance: 'Add Instance',
    noInstances: (appName) => `No ${appName} instances configured.`,
    instanceLabel: (index) => `Instance ${index}`,
    defaultLabel: 'Default',
    defaultInstanceTitle: 'Default instance',
    setAsDefaultTitle: 'Set as default',
    removeInstanceTitle: 'Remove instance',
    displayName: 'Display Name',
    ultraHdInstance: '4K / UHD instance',
    ultraHdRoutingHint: 'Request modal routes Ultra HD requests here (can select HD + UHD together).',
    url: 'URL',
    externalUrl: 'External URL',
    externalUrlOptional: 'Optional, for UI links',
    apiKey: 'API Key',
    apiKeyPlaceholder: 'API key',
    plexLibraries: 'Plex Libraries',
    libraryMappingHint: 'Map libraries to this instance for maintenance routing. Unmapped libraries use the default instance.',
    assignedElsewhere: 'Assigned to another instance',
    testConnection: 'Test Connection',
    connectionSuccessful: 'Connection successful',
    connectionFailed: 'Connection failed',
};

type Props = {
    type: ArrAppType;
    title: string;
    subtitle: string;
    instances: ArrInstance[];
    savedInstances: ArrInstance[];
    libraries?: PlexLibrary[];
    allInstances?: ArrInstance[];
    onChange: (instances: ArrInstance[]) => void;
    onMessage: (message: string, success: boolean) => void;
    className?: string;
    copy?: Partial<ArrInstancesPanelCopy>;
};

export const ArrInstancesPanel: React.FC<Props> = ({
    type,
    title,
    subtitle,
    instances,
    savedInstances,
    libraries = [],
    allInstances = [],
    onChange,
    onMessage,
    className = '',
    copy: copyOverrides = {},
}) => {
    const copy = { ...DEFAULT_COPY, ...copyOverrides } as ArrInstancesPanelCopy;
    const libraryType = type === 'radarr' ? 'movie' : 'show';
    const supportsLibraryMapping = type === 'sonarr' || type === 'radarr';
    const availableLibraries = supportsLibraryMapping
        ? libraries.filter((entry) => String(entry.type || '').toLowerCase() === libraryType)
        : [];
    const appName = ARR_APP_LABELS[type];

    const librariesAssignedElsewhere = (instanceId: string) => {
        const assigned = new Set<string>();
        allInstances
            .filter((entry) => entry.id !== instanceId && entry.type === type)
            .forEach((entry) => {
                (entry.plexLibraryIds || []).forEach((libraryId) => assigned.add(String(libraryId)));
            });
        return assigned;
    };

    const toggleLibrary = (instanceId: string, libraryId: string) => {
        const instance = instances.find((entry) => entry.id === instanceId);
        if (!instance) return;
        const current = new Set((instance.plexLibraryIds || []).map((entry) => String(entry)));
        if (current.has(libraryId)) current.delete(libraryId);
        else current.add(libraryId);
        updateInstance(instanceId, { plexLibraryIds: Array.from(current) });
    };
    const updateInstance = (id: string, patch: Partial<ArrInstance>) => {
        onChange(instances.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
    };

    const removeInstance = (id: string) => {
        const next = instances.filter((entry) => entry.id !== id);
        if (next.length > 0 && !next.some((entry) => entry.isDefault)) {
            next[0] = { ...next[0], isDefault: true };
        }
        onChange(next);
    };

    const setDefault = (id: string) => {
        onChange(instances.map((entry) => ({ ...entry, isDefault: entry.id === id })));
    };

    const addInstance = () => {
        onChange([
            ...instances,
            createEmptyArrInstance(type, instances.length === 0),
        ]);
    };

    return (
        <div className={className}>
            <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-start gap-3 min-w-0">
                    <span className="w-11 h-11 rounded-lg bg-background border border-border flex items-center justify-center overflow-hidden shrink-0">
                        <img
                            src={ARR_ICON_URLS[type]}
                            alt=""
                            className="w-8 h-8 object-contain"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                    </span>
                    <div className="min-w-0">
                        <h3 className="text-lg font-bold text-plex">{title}</h3>
                        <p className="text-sm text-muted mt-1">{subtitle}</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={addInstance}
                    className="px-3 py-2 rounded-lg border border-border text-sm font-medium text-text hover:bg-white/5 transition-colors flex items-center gap-2 shrink-0"
                >
                    <Plus className="w-4 h-4" />
                    {copy.addInstance}
                </button>
            </div>

            {instances.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted text-center">
                    {copy.noInstances(appName)}
                </div>
            ) : (
                <div className="space-y-4">
                    {instances.map((instance, index) => {
                        const saved = savedInstances.find((entry) => entry.id === instance.id);
                        const testPayload = {
                            [`${type}Url`]: instance.url,
                            [`${type}ApiKey`]: instance.apiKey,
                            instanceId: instance.id,
                        };

                        return (
                            <div key={instance.id} className="rounded-xl border border-border bg-background/40 p-4 space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <img
                                            src={ARR_ICON_URLS[type]}
                                            alt=""
                                            className="w-5 h-5 object-contain shrink-0"
                                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                        />
                                        <span className="text-xs uppercase tracking-wider font-bold text-muted">
                                            {copy.instanceLabel(index + 1)}
                                        </span>
                                        {instance.isDefault && (
                                            <span className="text-[10px] uppercase tracking-wider font-bold text-plex bg-plex/10 px-2 py-0.5 rounded-full">
                                                {copy.defaultLabel}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <SettingsSwitch
                                            checked={instance.enabled !== false}
                                            onChange={(enabled) => updateInstance(instance.id, { enabled })}
                                            className="!ml-0"
                                        />
                                        <button
                                            type="button"
                                            title={instance.isDefault ? copy.defaultInstanceTitle : copy.setAsDefaultTitle}
                                            onClick={() => setDefault(instance.id)}
                                            className={`p-2 rounded-lg transition-colors ${instance.isDefault ? 'text-plex bg-plex/10' : 'text-muted hover:text-text hover:bg-white/5'}`}
                                        >
                                            <Star className={`w-4 h-4 ${instance.isDefault ? 'fill-current' : ''}`} />
                                        </button>
                                        <button
                                            type="button"
                                            title={copy.removeInstanceTitle}
                                            onClick={() => removeInstance(instance.id)}
                                            className="p-2 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs text-muted uppercase tracking-wider font-bold mb-1 block">{copy.displayName}</label>
                                    <input
                                        className="w-full p-2.5 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all text-sm"
                                        type="text"
                                        value={instance.name}
                                        onChange={(e) => updateInstance(instance.id, { name: e.target.value })}
                                        placeholder={appName}
                                    />
                                </div>

                                {supportsLibraryMapping && (
                                    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-text">{copy.ultraHdInstance}</p>
                                            <p className="text-[11px] text-muted">
                                                {copy.ultraHdRoutingHint}
                                            </p>
                                        </div>
                                        <SettingsSwitch
                                            checked={!!instance.is4k}
                                            onChange={(is4k) => updateInstance(instance.id, { is4k })}
                                            className="!ml-0"
                                        />
                                    </div>
                                )}

                                <div>
                                    <label className="text-xs text-muted uppercase tracking-wider font-bold mb-1 block">{copy.url}</label>
                                    <input
                                        className="w-full p-2.5 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all text-sm"
                                        type="text"
                                        value={instance.url}
                                        onChange={(e) => updateInstance(instance.id, { url: e.target.value })}
                                        placeholder={ARR_APP_PLACEHOLDERS[type].url}
                                    />
                                </div>

                                <div>
                                    <label className="text-xs text-muted uppercase tracking-wider font-bold mb-1 flex items-center gap-2">
                                        {copy.externalUrl} <span className="text-[10px] font-normal normal-case text-muted/70">({copy.externalUrlOptional})</span>
                                    </label>
                                    <input
                                        className="w-full p-2.5 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all text-sm"
                                        type="text"
                                        value={instance.externalUrl || ''}
                                        onChange={(e) => updateInstance(instance.id, { externalUrl: e.target.value })}
                                        placeholder={ARR_APP_PLACEHOLDERS[type].externalUrl}
                                    />
                                </div>

                                <div>
                                    <label className="text-xs text-muted uppercase tracking-wider font-bold mb-1 block">{copy.apiKey}</label>
                                    <input
                                        className="w-full p-2.5 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all text-sm"
                                        type="password"
                                        value={instance.apiKey}
                                        onChange={(e) => updateInstance(instance.id, { apiKey: e.target.value })}
                                        placeholder={copy.apiKeyPlaceholder}
                                    />
                                </div>

                                {availableLibraries.length > 0 && (
                                    <div>
                                        <label className="text-xs text-muted uppercase tracking-wider font-bold mb-1 block">{copy.plexLibraries}</label>
                                        <p className="text-[11px] text-muted mb-2">
                                            {copy.libraryMappingHint}
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {availableLibraries.map((library) => {
                                                const libraryId = String(library.id);
                                                const selected = (instance.plexLibraryIds || []).includes(libraryId);
                                                const takenElsewhere = librariesAssignedElsewhere(instance.id).has(libraryId);
                                                return (
                                                    <button
                                                        key={`${instance.id}-${libraryId}`}
                                                        type="button"
                                                        disabled={takenElsewhere && !selected}
                                                        title={takenElsewhere && !selected ? copy.assignedElsewhere : library.title}
                                                        onClick={() => toggleLibrary(instance.id, libraryId)}
                                                        className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                                                            selected
                                                                ? 'bg-plex/15 border-plex/40 text-plex'
                                                                : takenElsewhere
                                                                    ? 'bg-background/20 border-border text-muted/50 cursor-not-allowed'
                                                                    : 'bg-background/30 border-border text-text hover:border-plex/40'
                                                        }`}
                                                    >
                                                        {library.title}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                <IntegrationTestButton
                                    type={type}
                                    payload={testPayload}
                                    disabled={!hasCredentials(instance, saved)}
                                    label={copy.testConnection}
                                    successFallback={copy.connectionSuccessful}
                                    failureFallback={copy.connectionFailed}
                                    onMessage={onMessage}
                                />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
