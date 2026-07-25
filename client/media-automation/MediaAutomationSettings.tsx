import React from 'react';
import { Cpu, FolderSearch, Gauge, Radar, ShieldCheck } from 'lucide-react';
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
    const globalDryRun = config.fallback.outputMode === 'dry-run';

    return (
        <div className="mb-8 animate-fade-in space-y-6">
            <div>
                <h3 className="text-xl font-bold text-plex mb-2 border-b border-border pb-2">Media Automation</h3>
                <p className="text-sm text-muted max-w-3xl">
                    Configure the native FFmpeg worker, library scan/watch discovery, safe fallbacks, and dashboard visibility.
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
                    <p className="text-xs text-muted">Used by Sonarr, Radarr, and Lidarr webhook callers via HTTP Basic Auth at <code className="text-plex">/triggers/media-automation/*</code>.</p>
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
                    {globalDryRun && (
                        <div className="rounded-lg border border-amber-500/40 bg-amber-500/15 p-3 text-xs text-amber-50">
                            <p className="font-bold">Global dry-run override is ON</p>
                            <p className="mt-1 text-amber-100/90">
                                Every Media Automation job is forced to dry-run, even when a pipeline is set to Copy or Replace. Change Safe fallback to Copy or Replace and save before any real writes.
                            </p>
                        </div>
                    )}
                </div>
            </section>

            <section className="glass-card-sm p-5 space-y-3">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-plex" />
                    <h4 className="font-bold text-text">Custom command allowlist</h4>
                </div>
                <p className="text-sm text-muted">
                    Pipeline <span className="font-semibold text-text">custom-command</span> steps may only run these executable basenames or absolute paths. No shell is used.
                </p>
                <textarea
                    className={`${fieldClass} min-h-28 font-mono text-xs`}
                    value={(config.customCommandAllowlist || []).join('\n')}
                    placeholder={'ffmpeg\nffprobe'}
                    onChange={(event) => update({
                        customCommandAllowlist: [...new Set(
                            event.target.value
                                .split(/\r?\n/)
                                .map((entry) => entry.trim())
                                .filter(Boolean)
                                .slice(0, 32),
                        )],
                    })}
                />
                <p className="text-xs text-muted">One entry per line. Defaults: ffmpeg, ffprobe. Absolute paths must match exactly.</p>
            </section>

            <section className="glass-card-sm p-5 space-y-3">
                <div className="flex items-center gap-2">
                    <FolderSearch className="w-5 h-5 text-plex" />
                    <h4 className="font-bold text-text">ARR path rewrite</h4>
                </div>
                <p className="text-sm text-muted">
                    Sonarr / Radarr / Lidarr webhooks reuse the same path rewrite rules as Scanner triggers. If ARR reports a host path that differs from the container mount, map it there so Media Automation can resolve files under library roots.
                </p>
                <p className="text-xs text-muted">
                    Configure under <span className="font-semibold text-text">Settings → Scanner</span> on the matching trigger (e.g. <code className="text-plex">sonarr</code> / <code className="text-plex">radarr</code>). Media Automation looks up rewrite by trigger name from the webhook query/body, then falls back to the first trigger for that ARR type.
                </p>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="glass-card-sm p-5 space-y-4">
                    <div className="flex items-center gap-2">
                        <FolderSearch className="w-5 h-5 text-plex" />
                        <h4 className="font-bold text-text">Library scan</h4>
                    </div>
                    <SettingsToggleRow
                        title="Enable scheduled library scans"
                        description="Periodically discover media under configured library roots and enqueue matching files."
                        checked={config.libraryScanEnabled !== false}
                        onChange={(libraryScanEnabled) => update({ libraryScanEnabled })}
                        border={false}
                    />
                    <label className="block text-xs uppercase tracking-wide font-bold text-muted" htmlFor="media-automation-scan-interval">
                        Scan interval (minutes)
                        <input
                            id="media-automation-scan-interval"
                            className={`${fieldClass} mt-2`}
                            type="number"
                            min={15}
                            max={10080}
                            disabled={config.libraryScanEnabled === false}
                            value={config.libraryScanIntervalMinutes}
                            onChange={(event) => update({
                                libraryScanIntervalMinutes: Math.min(10080, Math.max(15, Number(event.target.value) || 360)),
                            })}
                        />
                    </label>
                </div>
                <div className="glass-card-sm p-5 space-y-4">
                    <div className="flex items-center gap-2">
                        <Radar className="w-5 h-5 text-plex" />
                        <h4 className="font-bold text-text">Filesystem watcher</h4>
                    </div>
                    <SettingsToggleRow
                        title="Watch library folders"
                        description="Enqueue new or changed media files as they appear under enabled library roots."
                        checked={config.libraryWatchEnabled !== false}
                        onChange={(libraryWatchEnabled) => update({ libraryWatchEnabled })}
                        border={false}
                    />
                    <label className="block text-xs uppercase tracking-wide font-bold text-muted" htmlFor="media-automation-watch-debounce">
                        Watch debounce (ms)
                        <input
                            id="media-automation-watch-debounce"
                            className={`${fieldClass} mt-2`}
                            type="number"
                            min={500}
                            max={120000}
                            disabled={config.libraryWatchEnabled === false}
                            value={config.libraryWatchDebounceMs}
                            onChange={(event) => update({
                                libraryWatchDebounceMs: Math.min(120000, Math.max(500, Number(event.target.value) || 5000)),
                            })}
                        />
                    </label>
                </div>
            </section>

            <p className="text-xs text-muted">
                Save Settings below to apply changes. Use Scan now on the Media Automation dashboard for an immediate library pass.
            </p>
        </div>
    );
};
