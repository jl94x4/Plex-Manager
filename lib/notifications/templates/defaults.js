/**
 * Default notification templates (Phase 2–3 / #89).
 * Placeholders: {title} {user} {media_type} {status} {portal_url} {year}
 * {season} {server_name} {decline_reason}
 */

export const NOTIFY_EVENTS = [
    'available',
    'approved',
    'declined',
    'season',
    'episode',
    'admin_pending',
    'not_released',
    'collexions_failed',
    'scanner_failed',
    'status_down',
    'status_up',
    'media_job_failed',
    'media_job_completed',
];

export const NOTIFY_TEMPLATE_FIELDS = [
    'emailSubject',
    'emailHeadline',
    'emailBody',
    'pushTitle',
    'pushBody',
    'discordContent',
    'discordEmbedTitle',
    'discordEmbedDescription',
    'gotifyTitle',
    'gotifyBody',
    'ntfyTitle',
    'ntfyBody',
    'webhookBody',
];

/** Fields shown in the admin editor per event. */
export const NOTIFY_EVENT_FIELDS = {
    available: [
        'emailSubject', 'emailHeadline', 'emailBody',
        'pushTitle', 'pushBody',
        'discordContent', 'discordEmbedTitle', 'discordEmbedDescription',
        'ntfyTitle', 'ntfyBody',
        'webhookBody',
    ],
    approved: [
        'emailSubject', 'emailHeadline', 'emailBody',
        'pushTitle', 'pushBody',
        'ntfyTitle', 'ntfyBody',
        'webhookBody',
    ],
    declined: [
        'emailSubject', 'emailHeadline', 'emailBody',
        'pushTitle', 'pushBody',
        'ntfyTitle', 'ntfyBody',
        'webhookBody',
    ],
    season: [
        'emailSubject', 'emailHeadline', 'emailBody',
        'pushTitle', 'pushBody',
        'ntfyTitle', 'ntfyBody',
        'webhookBody',
    ],
    episode: [
        'emailSubject', 'emailHeadline', 'emailBody',
        'pushTitle', 'pushBody',
        'ntfyTitle', 'ntfyBody',
        'webhookBody',
    ],
    admin_pending: [
        'pushTitle', 'pushBody',
        'gotifyTitle', 'gotifyBody',
        'ntfyTitle', 'ntfyBody',
        'webhookBody',
    ],
    not_released: [
        'emailSubject', 'emailHeadline', 'emailBody',
        'pushTitle', 'pushBody',
    ],
    collexions_failed: [
        'pushTitle', 'pushBody',
        'ntfyTitle', 'ntfyBody',
        'webhookBody',
    ],
    scanner_failed: [
        'pushTitle', 'pushBody',
        'ntfyTitle', 'ntfyBody',
        'webhookBody',
    ],
    status_down: [
        'pushTitle', 'pushBody',
        'ntfyTitle', 'ntfyBody',
        'webhookBody',
    ],
    status_up: [
        'pushTitle', 'pushBody',
        'ntfyTitle', 'ntfyBody',
        'webhookBody',
    ],
    media_job_failed: [
        'pushTitle', 'pushBody',
        'ntfyTitle', 'ntfyBody',
        'webhookBody',
    ],
    media_job_completed: [
        'pushTitle', 'pushBody',
        'ntfyTitle', 'ntfyBody',
        'webhookBody',
    ],
};

export const DEFAULT_NOTIFY_TEMPLATES = {
    available: {
        emailSubject: '[{server_name}] {title} is now available',
        emailHeadline: 'Your request is available',
        emailBody: 'Good news — the {media_type} you requested is ready to watch on the server.',
        pushTitle: '{title} is available',
        pushBody: 'Your request for {title} is ready to watch.',
        discordContent: '**{title}{year}** is now available — requested by **{user}**.',
        discordEmbedTitle: '{title}{year}',
        discordEmbedDescription: 'The {media_type} is ready to watch.',
        ntfyTitle: '{title} is available',
        ntfyBody: 'Requested by {user}. Ready to watch.',
        webhookBody: '',
    },
    approved: {
        emailSubject: '[{server_name}] Your request was approved: {title}',
        emailHeadline: 'Your request was approved',
        emailBody: 'An admin approved your request. We will notify you again when it is available.',
        pushTitle: 'Approved: {title}',
        pushBody: 'Your request for {title} has been approved.',
        ntfyTitle: 'Approved: {title}',
        ntfyBody: 'Your request for {title} has been approved.',
        webhookBody: '',
    },
    declined: {
        emailSubject: '[{server_name}] Your request was declined: {title}',
        emailHeadline: 'Your request was declined',
        emailBody: 'An admin declined your request.{decline_reason}',
        pushTitle: 'Declined: {title}',
        pushBody: 'Your request for {title} was declined.',
        ntfyTitle: 'Declined: {title}',
        ntfyBody: 'Your request for {title} was declined.{decline_reason}',
        webhookBody: '',
    },
    season: {
        emailSubject: '[{server_name}] {season} of {title} is available',
        emailHeadline: 'A season is available',
        emailBody: '{season} of the series you requested is ready to watch.',
        pushTitle: '{season} of {title} is available',
        pushBody: '{season} of {title} is ready to watch.',
        ntfyTitle: '{season} of {title} is available',
        ntfyBody: 'A requested season is ready to watch.',
        webhookBody: '',
    },
    episode: {
        emailSubject: '[{server_name}] New episode: {title}',
        emailHeadline: 'New episode available',
        emailBody: 'New episode(s) arrived for a series you requested.',
        pushTitle: 'New episode: {title}',
        pushBody: 'New episode(s) arrived for {title}.',
        ntfyTitle: 'New episode: {title}',
        ntfyBody: 'New episode(s) arrived for your series.',
        webhookBody: '',
    },
    admin_pending: {
        pushTitle: 'New media request',
        pushBody: '{user} has requested {media_type}: {title}',
        gotifyTitle: 'New media request',
        gotifyBody: '{user} has requested {media_type}: {title}',
        ntfyTitle: 'New media request',
        ntfyBody: '{user} has requested {media_type}: {title}',
        webhookBody: '',
    },
    not_released: {
        emailSubject: '[{server_name}] {title} isn’t released yet',
        emailHeadline: 'Not released yet',
        emailBody: 'Thanks for requesting {title}. It isn’t out yet — expected {release_type}: {release_date}. We’ll notify you when it’s available.',
        pushTitle: '{title} isn’t released yet',
        pushBody: '{release_type}: {release_date}. We’ll notify you when it’s available.',
    },
    collexions_failed: {
        pushTitle: 'ColleXions failed',
        pushBody: '{title}',
        ntfyTitle: 'ColleXions failed',
        ntfyBody: '{title}',
        webhookBody: '',
    },
    scanner_failed: {
        pushTitle: 'Scanner failed',
        pushBody: '{title}',
        ntfyTitle: 'Scanner failed',
        ntfyBody: '{title}',
        webhookBody: '',
    },
    status_down: {
        pushTitle: '{title} is down',
        pushBody: 'A health check has been down longer than the configured wait.',
        ntfyTitle: '{title} is down',
        ntfyBody: 'Health check has been down longer than the configured wait.',
        webhookBody: '',
    },
    status_up: {
        pushTitle: '{title} is back up',
        pushBody: 'The health check recovered.',
        ntfyTitle: '{title} is back up',
        ntfyBody: 'The health check recovered.',
        webhookBody: '',
    },
    media_job_failed: {
        pushTitle: 'Media Automation job failed',
        pushBody: '{title}',
        ntfyTitle: 'Media Automation job failed',
        ntfyBody: '{title}',
        webhookBody: '',
    },
    media_job_completed: {
        pushTitle: 'Media Automation job finished',
        pushBody: '{title}',
        ntfyTitle: 'Media Automation job finished',
        ntfyBody: '{title}',
        webhookBody: '',
    },
};

export default DEFAULT_NOTIFY_TEMPLATES;
