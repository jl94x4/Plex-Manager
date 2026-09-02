import React, { useMemo, useState } from 'react';
import { useDiscoverI18n } from '../discovery/i18n';
import { SettingFieldLabel, SettingHint } from './SettingHint';

const EVENT_LABEL_KEYS: Record<string, string> = {
    expiry_warning: 'settings.emailTemplates.events.expiry_warning',
    access_expired: 'settings.emailTemplates.events.access_expired',
    access_adjusted: 'settings.emailTemplates.events.access_adjusted',
    invite: 'settings.emailTemplates.events.invite',
    announcement: 'settings.emailTemplates.events.announcement',
};

const FIELD_LABEL_KEYS: Record<string, string> = {
    subject: 'settings.emailTemplates.fields.subject',
    headline: 'settings.emailTemplates.fields.headline',
    intro: 'settings.emailTemplates.fields.intro',
    body: 'settings.emailTemplates.fields.body',
    ctaLabel: 'settings.emailTemplates.fields.ctaLabel',
    renewTitle: 'settings.emailTemplates.fields.renewTitle',
    renewBody: 'settings.emailTemplates.fields.renewBody',
    footer: 'settings.emailTemplates.fields.footer',
    footerSecondary: 'settings.emailTemplates.fields.footerSecondary',
};

const EVENT_VARIABLE_HINTS: Record<string, string> = {
    expiry_warning: '{username} {days} {days_label} {expiry_date} {server_name} {contact_url}',
    access_expired: '{username} {expiry_date} {status} {server_name} {contact_email} {contact_whatsapp}',
    access_adjusted: '{username} {new_expiry_date} {days} {days_label} {time_remaining} {server_name}',
    invite: '{server_name} {invite_url} {duration_days}',
    announcement: '{server_name} {announcement}',
};

type Props = {
    emailTemplates: Record<string, Record<string, string>>;
    setEmailTemplates: (next: Record<string, Record<string, string>>) => void;
    defaults: Record<string, Record<string, string>>;
    events: string[];
    eventFields: Record<string, string[]>;
};

export const EmailAutomatedTemplatesPanel: React.FC<Props> = ({
    emailTemplates,
    setEmailTemplates,
    defaults,
    events,
    eventFields,
}) => {
    const { t } = useDiscoverI18n();
    const eventList = events?.length ? events : Object.keys(EVENT_LABEL_KEYS);
    const [activeEvent, setActiveEvent] = useState(eventList[0] || 'expiry_warning');
    const fields = eventFields?.[activeEvent] || [];
    const eventLabel = (event: string) => (EVENT_LABEL_KEYS[event] ? t(EVENT_LABEL_KEYS[event]) : event);
    const fieldLabel = (field: string) => (FIELD_LABEL_KEYS[field] ? t(FIELD_LABEL_KEYS[field]) : field);

    const effectiveValue = (field: string) => {
        const override = emailTemplates?.[activeEvent]?.[field];
        if (override != null && String(override).trim()) return String(override);
        return String(defaults?.[activeEvent]?.[field] || '');
    };

    const isOverridden = (field: string) => {
        const override = emailTemplates?.[activeEvent]?.[field];
        return override != null && String(override).trim() !== '';
    };

    const setField = (field: string, value: string) => {
        const nextEvent = { ...(emailTemplates?.[activeEvent] || {}) };
        const trimmed = value.trim();
        const defaultValue = String(defaults?.[activeEvent]?.[field] || '');
        if (!trimmed || trimmed === defaultValue) {
            delete nextEvent[field];
        } else {
            nextEvent[field] = value;
        }
        const nextAll = { ...emailTemplates };
        if (Object.keys(nextEvent).length) nextAll[activeEvent] = nextEvent;
        else delete nextAll[activeEvent];
        setEmailTemplates(nextAll);
    };

    const resetEvent = () => {
        const nextAll = { ...emailTemplates };
        delete nextAll[activeEvent];
        setEmailTemplates(nextAll);
    };

    const variableHint = useMemo(
        () => EVENT_VARIABLE_HINTS[activeEvent] || '{username} {server_name}',
        [activeEvent],
    );

    return (
        <div className="space-y-3">
            <SettingHint>
                {t('settings.emailTemplates.hint')}
                {' '}
                {t('settings.emailTemplates.variablesLabel')} <code className="text-[11px]">{variableHint}</code>
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
                        {eventLabel(event)}
                    </button>
                ))}
            </div>

            <div className="rounded-xl border border-border bg-background/40 p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-text">{eventLabel(activeEvent)}</p>
                    <button
                        type="button"
                        onClick={resetEvent}
                        className="text-xs font-semibold text-muted hover:text-plex"
                    >
                        {t('settings.emailTemplates.resetEvent')}
                    </button>
                </div>

                {fields.map((field) => (
                    <div key={field}>
                        <SettingFieldLabel htmlFor={`email-tpl-${activeEvent}-${field}`}>
                            {fieldLabel(field)}
                            {isOverridden(field) ? (
                                <span className="ml-2 text-[10px] uppercase tracking-wider text-plex">{t('settings.emailTemplates.customBadge')}</span>
                            ) : null}
                        </SettingFieldLabel>
                        {field === 'subject' || field === 'headline' || field === 'ctaLabel' || field === 'renewTitle' ? (
                            <input
                                id={`email-tpl-${activeEvent}-${field}`}
                                className="w-full appearance-none p-3 rounded-lg border border-border bg-background text-[16px] leading-5 text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all"
                                value={effectiveValue(field)}
                                onChange={(e) => setField(field, e.target.value)}
                            />
                        ) : (
                            <textarea
                                id={`email-tpl-${activeEvent}-${field}`}
                                className="w-full appearance-none p-3 rounded-lg border border-border bg-background text-[16px] leading-5 text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all min-h-[88px]"
                                value={effectiveValue(field)}
                                onChange={(e) => setField(field, e.target.value)}
                            />
                        )}
                    </div>
                ))}
            </div>
            <p className="text-xs text-muted">{t('settings.emailTemplates.saveHint')}</p>
        </div>
    );
};

export default EmailAutomatedTemplatesPanel;
