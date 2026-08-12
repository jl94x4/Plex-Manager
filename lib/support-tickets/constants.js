export const SUPPORT_TICKET_STATUS = {
    OPEN: 1,
    RESOLVED: 2,
    CLOSED: 3,
};

export const SUPPORT_TICKET_CATEGORIES = [
    { id: 'media', label: 'Media request / problem' },
    { id: 'account', label: 'Account / access' },
    { id: 'server', label: 'Server / service' },
    { id: 'general', label: 'General question' },
    { id: 'other', label: 'Other' },
];

export const SUPPORT_CATEGORY_IDS = SUPPORT_TICKET_CATEGORIES.map((c) => c.id);

export const supportStatusLabel = (status) => {
    const value = Number(status);
    if (value === SUPPORT_TICKET_STATUS.RESOLVED) return 'resolved';
    if (value === SUPPORT_TICKET_STATUS.CLOSED) return 'closed';
    return 'open';
};

export const parseSupportStatus = (raw) => {
    const value = String(raw || '').toLowerCase();
    if (value === 'resolved') return SUPPORT_TICKET_STATUS.RESOLVED;
    if (value === 'closed') return SUPPORT_TICKET_STATUS.CLOSED;
    return SUPPORT_TICKET_STATUS.OPEN;
};

export const supportCategoryLabel = (id) => {
    const hit = SUPPORT_TICKET_CATEGORIES.find((c) => c.id === String(id || ''));
    return hit?.label || 'Other';
};

export const isSupportTicketsEnabled = (config = {}) => config.supportTicketsEnabled !== false;
