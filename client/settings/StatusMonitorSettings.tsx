import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Copy, ChevronUp, ChevronDown } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { appConfirm } from '../shared/confirm';
import { CustomSelect } from '../shared/ui';
import type { User, AuditEntry, DeletedUser } from '../shared/types';
import { formatDateTime, formatEventName, hexToRgb, getDaysUntilExpiry, addMonths, addYears, formatDate } from '../shared/format';
export const StatusMonitorSettings: React.FC<{ config: any; onChange: (cfg: any) => void; appConfirm: (msg: string, cb: () => void) => void; fetchConfig: () => void; addToast: (msg: string, type?: 'success' | 'error') => void }> = ({ config, onChange, appConfirm, fetchConfig, addToast }) => {
    const [localConfig, setLocalConfig] = useState<any>({ groups: [], services: [] });

    useEffect(() => {
        if (config) {
            setLocalConfig({
                groups: config.groups || [],
                services: config.services || []
            });
        }
    }, [config]);

    const addGroup = () => {
        const id = `group-${Date.now()}`;
        const newConfig = { ...localConfig, groups: [...localConfig.groups, { id, name: 'New Group', order: localConfig.groups.length }] };
        setLocalConfig(newConfig);
        onChange(newConfig);
    };

    const addService = () => {
        const id = `service-${Date.now()}`;
        const newService = {
            id,
            name: 'New Service',
            url: '',
            category: 'web',
            type: 'http',
            groupId: null,
            isCritical: true,
            visibleToUsers: true,
            description: ''
        };
        const newConfig = { ...localConfig, services: [...localConfig.services, newService] };
        setLocalConfig(newConfig);
        onChange(newConfig);
    };

    const updateGroup = (id: string, field: string, value: any) => {
        const newConfig = {
            ...localConfig,
            groups: localConfig.groups.map((g: any) => g.id === id ? { ...g, [field]: value } : g)
        };
        setLocalConfig(newConfig);
        onChange(newConfig);
    };

    const updateService = (id: string, field: string, value: any) => {
        const newConfig = {
            ...localConfig,
            services: localConfig.services.map((s: any) => s.id === id ? { ...s, [field]: value } : s)
        };
        setLocalConfig(newConfig);
        onChange(newConfig);
    };

    const removeGroup = async (id: string) => {
        const groupName = localConfig.groups.find((g: any) => g.id === id)?.name || 'this group';
        appConfirm(`Remove group "${groupName}"? Services inside it won't be deleted but will lose their group.`, () => {
            const newConfig = {
                ...localConfig,
                groups: localConfig.groups.filter((g: any) => g.id !== id),
                services: localConfig.services.map((s: any) => s.groupId === id ? { ...s, groupId: null } : s)
            };
            setLocalConfig(newConfig);
            onChange(newConfig);
        });
    };

    const removeService = async (id: string) => {
        appConfirm(`Remove service ${id}?`, () => {
            const newConfig = {
                ...localConfig,
                services: localConfig.services.filter((s: any) => s.id !== id)
            };
            setLocalConfig(newConfig);
            onChange(newConfig);
        });
    };

    const handleResetStats = () => {
        appConfirm('Are you sure you want to reset all uptime statistics? This will delete all historical status data including hourly samples, latency history, and incidents.', async () => {
            try {
                const res = await apiFetch('/api/status/reset', { method: 'POST' });
                if (res.error) throw new Error(res.error);
                addToast('Status statistics reset successfully.', 'success');
            } catch (e: any) {
                addToast(e.message || 'Failed to reset statistics.', 'error');
            }
        });
    };

    return (
        <div className="flex flex-col gap-8 w-full">
            <div>
                <div className="flex justify-between items-center mb-4 border-b border-border pb-3">
                    <h4 className="font-bold text-xl text-text">Service Groups</h4>
                    <button onClick={addGroup} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-text rounded-md text-sm font-bold transition-colors">Add Group</button>
                </div>
                {localConfig.groups.map((group: any) => (
                    <div key={group.id} className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
                        <input
                            type="text"
                            value={group.name}
                            onChange={(e) => updateGroup(group.id, 'name', e.target.value)}
                            className="flex-1 w-full p-3 rounded-lg bg-background border border-border focus:border-plex outline-none text-sm"
                            placeholder="Group Name"
                        />
                        <button type="button" onClick={() => removeGroup(group.id)} className="px-4 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-md text-xs font-bold transition-colors flex-shrink-0 sm:w-[5.75rem]">Remove</button>
                    </div>
                ))}
                {localConfig.groups.length === 0 && <p className="text-muted text-sm italic py-2">No groups defined. Create one to organize your services.</p>}
            </div>

            <div>
                <div className="flex justify-between items-center mb-4 border-b border-border pb-3">
                    <h4 className="font-bold text-xl text-text">Monitored Services</h4>
                    <button onClick={addService} className="px-4 py-2 bg-plex text-background hover:bg-plex-hover rounded-md text-sm font-bold transition-colors shadow-lg">Add Service</button>
                </div>
                <p className="text-xs text-muted mb-4">
                    Use <span className="text-text font-semibold">Users: Visible / Hidden</span> to control whether a service appears on the member or public Status page. Admins always see every service. New *arr and download clients default to Hidden.
                </p>
                <div className="flex flex-col gap-6">
                    {localConfig.services.map((service: any) => (
                        <div key={service.id} className="flex flex-col gap-3 pb-6 border-b border-border/40 last:border-b-0 last:pb-0">
                            <div>
                                <label className="block text-sm text-muted mb-1">Service Name</label>
                                <input
                                    type="text"
                                    value={service.name}
                                    onChange={(e) => updateService(service.id, 'name', e.target.value)}
                                    className="w-full p-3 rounded-lg bg-background border border-border focus:border-plex outline-none text-sm font-bold"
                                    placeholder="Service Name"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-muted mb-1">Service URL</label>
                                <input
                                    type="text"
                                    value={service.url}
                                    onChange={(e) => updateService(service.id, 'url', e.target.value)}
                                    className="w-full p-3 rounded-lg bg-background border border-border focus:border-plex outline-none text-sm font-mono"
                                    placeholder="Service URL (e.g. https://...)"
                                />
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                                <div className="flex items-center gap-2">
                                    <span className="text-muted">Group:</span>
                                    <div className="w-48">
                                        <CustomSelect
                                            value={service.groupId || ''}
                                            onChange={(val) => updateService(service.id, 'groupId', val || null)}
                                            options={[
                                                { label: 'None', value: '' },
                                                ...localConfig.groups.map((g: any) => ({ label: g.name, value: g.id }))
                                            ]}
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0 ml-auto flex-wrap justify-end">
                                    <button
                                        type="button"
                                        onClick={() => updateService(service.id, 'visibleToUsers', service.visibleToUsers === false)}
                                        className={`px-3 py-1.5 rounded text-xs font-bold transition-colors flex items-center gap-2 ${service.visibleToUsers !== false ? 'bg-plex/20 text-plex hover:bg-plex/30' : 'bg-white/10 text-muted hover:bg-white/20'}`}
                                        title={service.visibleToUsers !== false ? 'Shown on the member/public Status page' : 'Admin-only — hidden from members and the public Status page'}
                                    >
                                        Users: {service.visibleToUsers !== false ? 'Visible' : 'Hidden'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => updateService(service.id, 'isCritical', !service.isCritical)}
                                        className={`px-3 py-1.5 rounded text-xs font-bold transition-colors flex items-center gap-2 ${service.isCritical ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-white/10 text-muted hover:bg-white/20'}`}
                                    >
                                        Critical: {service.isCritical ? 'Yes' : 'No'}
                                    </button>
                                    <button type="button" onClick={() => removeService(service.id)} className="px-4 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-md text-xs font-bold transition-colors w-[5.75rem]">Remove</button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                {localConfig.services.length === 0 && <p className="text-muted text-sm italic py-2">No services defined. Add some services to monitor.</p>}
            </div>

            <div className="border-t border-border/40 pt-6 mt-2">
                <h4 className="font-bold text-xl text-text mb-2">Reset Statistics</h4>
                <p className="text-sm text-muted mb-4">Resetting the status statistics will clear all historical uptime, hourly samples, latency, and incident data for all monitored services. This action cannot be undone.</p>
                <button
                    type="button"
                    onClick={handleResetStats}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-bold transition-colors shadow-lg"
                >
                    Reset Uptime Data
                </button>
            </div>
        </div>
    );
};
