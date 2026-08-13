import React, { useMemo, useState } from 'react';
import { SettingFieldLabel, SettingHint } from './SettingHint';

const EVENT_LABELS: Record<string, string> = {
    available: 'Request available',
    approved: 'Request approved',
    declined: 'Request declined',
    season: 'Season available',
    episode: 'New episode',
    admin_pending: 'Admin — new pending request',
    not_released: 'Not released yet',
    collexions_failed: 'Admin — ColleXions failed',
    scanner_failed: 'Admin — Scanner failed',
    status_down: 'Admin — Status check down',
    status_up: 'Admin — Status check recovered',
    media_job_failed: 'Admin — Media Automation job failed',
    media_job_completed: 'Admin — Media Automation job finished',
};

const FIELD_LABELS: Record<string, string> = {
    emailSubject: 'Email subject',
    emailHeadline: 'Email headline',
    emailBody: 'Email body',
    pushTitle: 'Push / in-app title',
    pushBody: 'Push / in-app body',
    discordContent: 'Discord message',
    discordEmbedTitle: 'Discord embed title',
    discordEmbedDescription: 'Discord embed description',
    gotifyTitle: 'Gotify title',
    gotifyBody: 'Gotify body',
    ntfyTitle: 'ntfy title',
    ntfyBody: 'ntfy body',
    webhookBody: 'Webhook JSON body (optional template)',
};

type Props = {
    notificationTemplates: Record<string, Record<string, string>>;
    setNotificationTemplates: (next: Record<string, Record<string, string>>) => void;
    defaults: Record<string, Record<string, string>>;
    events: string[];
    eventFields: Record<string, string[]>;
    getSettingsSectionElementId: (id: string) => string;
};

export const NotificationTemplatesPanel: React.FC<Props> = ({
    notificationTemplates,
    setNotificationTemplates,
    defaults,
    events,
    eventFields,
    getSettingsSectionElementId,
}) => {
    const eventList = events?.length ? events : Object.keys(EVENT_LABELS);
    const [activeEvent, setActiveEvent] = useState(eventList[0] || 'available');
    const fields = eventFields?.[activeEvent] || [];

    const effectiveValue = (field: string) => {
        const override = notificationTemplates?.[activeEvent]?.[field];
        if (override != null && String(override).trim()) return String(override);
        return String(defaults?.[activeEvent]?.[field] || '');
    };

    const isOverridden = (field: string) => {
        const override = notificationTemplates?.[activeEvent]?.[field];
        return override != null && String(override).trim() !== '';
    };

    const setField = (field: string, value: string) => {
        const nextEvent = { ...(notificationTemplates?.[activeEvent] || {}) };
        const trimmed = value.trim();
        const defaultValue = String(defaults?.[activeEvent]?.[field] || '');
        if (!trimmed || trimmed === defaultValue) {
            delete nextEvent[field];
        } else {
            nextEvent[field] = value;
        }
        const nextAll = { ...notificationTemplates };
        if (Object.keys(nextEvent).length) nextAll[activeEvent] = nextEvent;
        else delete nextAll[activeEvent];
        setNotificationTemplates(nextAll);
    };

    const resetEvent = () => {
        const nextAll = { ...notificationTemplates };
        delete nextAll[activeEvent];
        setNotificationTemplates(nextAll);
    };

    const variableHint = useMemo(
        () => '{title} {user} {media_type} {status} {portal_url} {year} {season} {server_name} {decline_reason} {release_date} {release_type}',
        [],
    );

    return (
        <div id={getSettingsSectionElementId('notifications-templates')} className="scroll-mt-24 space-y-3">
            <h4 className="text-sm font-bold text-text uppercase tracking-wider">Notification templates</h4>
            <SettingHint>
                Customize copy per event. Leave a field on the default (or clear it) to use the built-in text.
                Variables: <code className="text-[11px]">{variableHint}</code>
            </SettingHint>

            <div className="flex flex-wrap gap-2">
                {eventList.map((event) => (
                    <button
                        key={event}
                        type="button"
                        onClick={() => setActiveEvent(event)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-colors ${
                            activeEvent === event
                                ? 'bg-plex text-background border-plex'
                                : 'bg-background border-border text-muted hover:text-text'
                        }`}
                    >
                        {EVENT_LABELS[event] || event}
                    </button>
                ))}
            </div>

            <div className="rounded-xl border border-border bg-background/40 p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-text">{EVENT_LABELS[activeEvent] || activeEvent}</p>
                    <button
                        type="button"
                        onClick={resetEvent}
                        className="text-xs font-semibold text-muted hover:text-plex"
                    >
                        Reset event to defaults
                    </button>
                </div>

                {fields.map((field) => (
                    <div key={field}>
                        <SettingFieldLabel htmlFor={`notify-tpl-${activeEvent}-${field}`}>
                            {FIELD_LABELS[field] || field}
                            {isOverridden(field) ? (
                                <span className="ml-2 text-[10px] uppercase tracking-wider text-plex">custom</span>
                            ) : null}
                        </SettingFieldLabel>
                        {field.toLowerCase().includes('body') || field.toLowerCase().includes('content') || field.toLowerCase().includes('description') ? (
                            <textarea
                                id={`notify-tpl-${activeEvent}-${field}`}
                                className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all min-h-[88px]"
                                value={effectiveValue(field)}
                                onChange={(e) => setField(field, e.target.value)}
                            />
                        ) : (
                            <input
                                id={`notify-tpl-${activeEvent}-${field}`}
                                className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all"
                                value={effectiveValue(field)}
                                onChange={(e) => setField(field, e.target.value)}
                            />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default NotificationTemplatesPanel;
