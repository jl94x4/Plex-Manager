/**
 * Default notification templates (Phase 2 / #89).
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
];

/** Fields shown in the admin editor per event (admin_pending is Gotify-only). */
export const NOTIFY_EVENT_FIELDS = {
    available: [
        'emailSubject', 'emailHeadline', 'emailBody',
        'pushTitle', 'pushBody',
        'discordContent', 'discordEmbedTitle', 'discordEmbedDescription',
    ],
    approved: [
        'emailSubject', 'emailHeadline', 'emailBody',
        'pushTitle', 'pushBody',
    ],
    declined: [
        'emailSubject', 'emailHeadline', 'emailBody',
        'pushTitle', 'pushBody',
    ],
    season: [
        'emailSubject', 'emailHeadline', 'emailBody',
        'pushTitle', 'pushBody',
    ],
    episode: [
        'emailSubject', 'emailHeadline', 'emailBody',
        'pushTitle', 'pushBody',
    ],
    admin_pending: [
        'gotifyTitle', 'gotifyBody',
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
    },
    approved: {
        emailSubject: '[{server_name}] Your request was approved: {title}',
        emailHeadline: 'Your request was approved',
        emailBody: 'An admin approved your request. We will notify you again when it is available.',
        pushTitle: '{title} approved',
        pushBody: 'Your request was approved.',
    },
    declined: {
        emailSubject: '[{server_name}] Your request was declined: {title}',
        emailHeadline: 'Your request was declined',
        emailBody: 'An admin declined your request.{decline_reason}',
        pushTitle: '{title} declined',
        pushBody: 'Your request was declined.',
    },
    season: {
        emailSubject: '[{server_name}] {season} of {title} is available',
        emailHeadline: 'A season is available',
        emailBody: '{season} of the series you requested is ready to watch.',
        pushTitle: '{season} of {title} is available',
        pushBody: 'A requested season is ready to watch.',
    },
    episode: {
        emailSubject: '[{server_name}] New episode: {title}',
        emailHeadline: 'New episode available',
        emailBody: 'New episode(s) arrived for a series you requested.',
        pushTitle: 'New episode: {title}',
        pushBody: 'New episode(s) arrived for your series.',
    },
    admin_pending: {
        gotifyTitle: 'New media request',
        gotifyBody: '{user} requested {media_type}: {title}',
    },
};

export default DEFAULT_NOTIFY_TEMPLATES;
