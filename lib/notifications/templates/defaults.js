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
};

export const DEFAULT_NOTIFY_TEMPLATES = {
    available: {
        emailSubject: '[{server_name}] {title} is now available',
        emailHeadline: 'Your request is available',
        emailBody: 'Good news — the {media_type} you requested is ready to watch on the server.',
        pushTitle: '{title} is available',
        pushBody: 'Your request is ready to watch.',
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
        pushTitle: '{title} approved',
        pushBody: 'Your request was approved.',
        ntfyTitle: '{title} approved',
        ntfyBody: 'Your request was approved.',
        webhookBody: '',
    },
    declined: {
        emailSubject: '[{server_name}] Your request was declined: {title}',
        emailHeadline: 'Your request was declined',
        emailBody: 'An admin declined your request.{decline_reason}',
        pushTitle: '{title} declined',
        pushBody: 'Your request was declined.',
        ntfyTitle: '{title} declined',
        ntfyBody: 'Your request was declined.{decline_reason}',
        webhookBody: '',
    },
    season: {
        emailSubject: '[{server_name}] {season} of {title} is available',
        emailHeadline: 'A season is available',
        emailBody: '{season} of the series you requested is ready to watch.',
        pushTitle: '{season} of {title} is available',
        pushBody: 'A requested season is ready to watch.',
        ntfyTitle: '{season} of {title} is available',
        ntfyBody: 'A requested season is ready to watch.',
        webhookBody: '',
    },
    episode: {
        emailSubject: '[{server_name}] New episode: {title}',
        emailHeadline: 'New episode available',
        emailBody: 'New episode(s) arrived for a series you requested.',
        pushTitle: 'New episode: {title}',
        pushBody: 'New episode(s) arrived for your series.',
        ntfyTitle: 'New episode: {title}',
        ntfyBody: 'New episode(s) arrived for your series.',
        webhookBody: '',
    },
    admin_pending: {
        pushTitle: 'New media request',
        pushBody: '{user} requested {media_type}: {title}',
        gotifyTitle: 'New media request',
        gotifyBody: '{user} requested {media_type}: {title}',
        ntfyTitle: 'New media request',
        ntfyBody: '{user} requested {media_type}: {title}',
        webhookBody: '',
    },
};

export default DEFAULT_NOTIFY_TEMPLATES;
