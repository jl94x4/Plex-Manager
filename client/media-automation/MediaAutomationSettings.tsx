import React from 'react';
import { Cpu, Gauge, ShieldCheck } from 'lucide-react';
import { CustomSelect, SettingsToggleRow } from '../shared/ui';
import type { HardwareMode, MediaAutomationSettingsConfig, OutputMode } from './types';

type Props = {
    enabled: boolean;
    onEnabledChange: (enabled: boolean) => void;
    homeWidgetEnabled: boolean;
    onHomeWidgetEnabledChange: (enabled: boolean) => void;
    config: MediaAutomationSettingsConfig;
    onConfigChange: (config: MediaAutomationSettingsConfig) => void;
};

const fieldClass = 'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-text outline-none transition focus:border-plex focus:ring-1 focus:ring-plex';

export const MediaAutomationSettings: React.FC<Props> = ({
    enabled,
    onEnabledChange,
    homeWidgetEnabled,
    onHomeWidgetEnabledChange,
    config,
    onConfigChange,
}) => {
    const update = (patch: Partial<MediaAutomationSettingsConfig>) => onConfigChange({ ...config, ...patch });

    return (
        <div className="mb-8 animate-fade-in space-y-6">
            <div>
                <h3 className="text-xl font-bold text-plex mb-2 border-b border-border pb-2">Media Automation</h3>
                <p className="text-sm text-muted max-w-3xl">
                    Configure the native FFmpeg worker, safe fallbacks, and dashboard visibility. Keep dry-run enabled while validating new pipelines.
                </p>
            </div>

            <section className="glass-card-sm p-5 space-y-2">
                <SettingsToggleRow
                    title="Enable Media Automation"
                    description="Show the admin dashboard and allow native media jobs to run."
                    checked={enabled}
                    onChange={(next) => {
                        onEnabledChange(next);
                        update({ enabled: next });
                        if (!next) onHomeWidgetEnabledChange(false);
                    }}
                    border={false}
                />
                <SettingsToggleRow
                    title="Show home status widget"
                    description="Display a compact worker and queue summary on the admin home dashboard when supported."
                    checked={homeWidgetEnabled}
                    onChange={onHomeWidgetEnabledChange}
                    disabled={!enabled}
                    border={false}
                />
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="glass-card-sm p-5 space-y-4">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-plex" />
                        <h4 className="font-bold text-text">Webhook Basic Auth</h4>
                    </div>
                    <input
                        className={fieldClass}
                        value={config.auth.username}
                        placeholder="Webhook username"
                        autoComplete="username"
                        onChange={(event) => update({ auth: { ...config.auth, username: event.target.value } })}
                    />
                    <input
                        className={fieldClass}
                        type="password"
                        value={config.auth.password}
                        placeholder="Leave blank to retain saved password"
                        autoComplete="new-password"
                        onChange={(event) => update({ auth: { ...config.auth, password: event.target.value } })}
                    />
                    <p className="text-xs text-muted">Used by Sonarr, Radarr, and Lidarr webhook callers via HTTP Basic Auth at <code className="text-plex">/triggers/media-automation/*</code>. Path rewrites can reuse Scanner trigger rewrite rules when ARR and container paths differ.</p>
                </div>

                <div className="glass-card-sm p-5 space-y-4">
                    <div className="flex items-center gap-2">
                        <Gauge className="w-5 h-5 text-plex" />
                        <h4 className="font-bold text-text">Concurrency</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <label className="block text-xs uppercase tracking-wide font-bold text-muted" htmlFor="media-automation-cpu-concurrency">
                            CPU jobs
                            <input
                                id="media-automation-cpu-concurrency"
                                className={`${fieldClass} mt-2`}
                                type="number"
                                min={1}
                                max={32}
                                value={config.concurrency.cpu}
                                onChange={(event) => update({ concurrency: { ...config.concurrency, cpu: Math.min(32, Math.max(1, Number(event.target.value) || 1)) } })}
                            />
                        </label>
                        <label className="block text-xs uppercase tracking-wide font-bold text-muted" htmlFor="media-automation-gpu-concurrency">
                            GPU jobs
                            <input
                                id="media-automation-gpu-concurrency"
                                className={`${fieldClass} mt-2`}
                                type="number"
                                min={1}
                                max={16}
                                value={config.concurrency.gpu}
                                onChange={(event) => update({ concurrency: { ...config.concurrency, gpu: Math.min(16, Math.max(1, Number(event.target.value) || 1)) } })}
                            />
                        </label>
                    </div>
                    <p className="text-xs text-muted">CPU and hardware-accelerated queues are limited independently.</p>
                </div>

                <div className="glass-card-sm p-5 space-y-4">
                    <div className="flex items-center gap-2">
                        <Cpu className="w-5 h-5 text-plex" />
                        <h4 className="font-bold text-text">Safe fallback</h4>
                    </div>
                    <CustomSelect
                        value={config.fallback.hardware}
                        onChange={(hardware) => update({ fallback: { ...config.fallback, hardware: hardware as HardwareMode } })}
                        options={[
                            { value: 'cpu', label: 'CPU' },
                            { value: 'auto', label: 'Auto detect' },
                            { value: 'nvenc', label: 'NVIDIA NVENC' },
                            { value: 'qsv', label: 'Intel Quick Sync' },
                            { value: 'intel-vaapi', label: 'Intel VAAPI' },
                            { value: 'vaapi', label: 'AMD VAAPI' },
                        ]}
                    />
                    <CustomSelect
                        value={config.fallback.outputMode}
                        onChange={(outputMode) => update({ fallback: { ...config.fallback, outputMode: outputMode as OutputMode } })}
                        options={[
                            { value: 'dry-run', label: 'Dry run (safest)' },
                            { value: 'copy', label: 'Copy beside source' },
                            { value: 'replace', label: 'Replace source' },
                        ]}
                    />
                </div>
            </section>

            <p className="text-xs text-muted">
                Save Settings below to apply changes. The dashboard degrades gracefully until the media automation API is installed and reachable.
            </p>
        </div>
    );
};
