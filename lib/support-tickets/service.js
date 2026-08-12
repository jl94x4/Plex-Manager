import {
    SUPPORT_TICKET_STATUS,
    SUPPORT_CATEGORY_IDS,
    supportStatusLabel,
    supportCategoryLabel,
    parseSupportStatus,
} from './constants.js';
import { createSupportTicketStore } from './store.js';

const mapComment = (comment = {}) => ({
    id: comment.id != null ? Number(comment.id) : null,
    message: String(comment.message || ''),
    createdAt: comment.createdAt || null,
    user: {
        id: comment.userId || comment.user?.id || null,
        displayName: comment.displayName || comment.user?.displayName || 'Member',
        avatar: comment.avatar || comment.user?.avatar || '',
        isAdmin: !!comment.isAdmin,
    },
});

export const mapSupportTicketToDto = (record, user = {}) => {
    const comments = Array.isArray(record?.comments) ? record.comments.map(mapComment) : [];
    return {
        id: Number(record?.id),
        subject: record?.subject || 'Support ticket',
        category: record?.category || 'other',
        categoryLabel: supportCategoryLabel(record?.category),
        status: Number(record?.status) || SUPPORT_TICKET_STATUS.OPEN,
        statusLabel: supportStatusLabel(record?.status),
        createdAt: record?.createdAt || null,
        updatedAt: record?.updatedAt || null,
        unreadForUser: !!record?.unreadForUser,
        unreadForAdmin: !!record?.unreadForAdmin,
        createdBy: {
            id: record?.userId || user?.id || null,
            displayName: user?.username || user?.email || record?.meta?.createdByName || 'Member',
            email: user?.email || record?.meta?.createdByEmail || null,
            avatar: user?.thumb || user?.avatar || '',
        },
        comments,
        commentCount: comments.length,
    };
};

const filterByTab = (dto, filter) => {
    const status = Number(dto?.status);
    if (!filter || filter === 'all') return true;
    if (filter === 'open') return status === SUPPORT_TICKET_STATUS.OPEN;
    if (filter === 'resolved') return status === SUPPORT_TICKET_STATUS.RESOLVED;
    if (filter === 'closed') return status === SUPPORT_TICKET_STATUS.CLOSED;
    return true;
};

export const createSupportTicketService = ({
    dataDir,
    resolveUser = async () => null,
} = {}) => {
    const store = createSupportTicketStore({ dataDir });

    const enrich = async (record) => {
        const user = await resolveUser(record?.userId).catch(() => null);
        return mapSupportTicketToDto(record, user || {});
    };

    const createTicket = async (user, body = {}) => {
        const subject = String(body.subject || '').trim();
        const message = String(body.message || '').trim();
        const category = SUPPORT_CATEGORY_IDS.includes(String(body.category || ''))
            ? String(body.category)
            : 'other';
        if (subject.length < 3) {
            const err = new Error('Please add a short subject (at least 3 characters).');
            err.status = 400;
            throw err;
        }
        if (message.length < 3) {
            const err = new Error('Please describe the issue (at least 3 characters).');
            err.status = 400;
            throw err;
        }
        const now = new Date().toISOString();
        const record = await store.create({
            userId: String(user?.id || ''),
            subject,
            category,
            unreadForAdmin: true,
            unreadForUser: false,
            comments: [{
                id: 1,
                message,
                createdAt: now,
                userId: String(user?.id || ''),
                displayName: user?.username || user?.email || 'Member',
                avatar: user?.thumb || user?.avatar || '',
                isAdmin: false,
            }],
            meta: {
                createdByName: user?.username || user?.email || null,
                createdByEmail: user?.email || null,
            },
        });
        return enrich(record);
    };

    const listTickets = async ({ userId = null, filter = 'all', take = 40, skip = 0 } = {}) => {
        const records = await store.list(userId ? { userId } : {});
        const dtos = [];
        for (const record of records) dtos.push(await enrich(record));
        const filtered = dtos.filter((item) => filterByTab(item, filter));
        return {
            results: filtered.slice(skip, skip + take),
            pageInfo: { total: filtered.length, take, skip },
        };
    };

    const getCounts = async ({ userId = null, isAdmin = false } = {}) => {
        const records = await store.list(userId && !isAdmin ? { userId } : {});
        let open = 0;
        let resolved = 0;
        let closed = 0;
        let unread = 0;
        for (const record of records) {
            const status = Number(record.status);
            if (status === SUPPORT_TICKET_STATUS.RESOLVED) resolved += 1;
            else if (status === SUPPORT_TICKET_STATUS.CLOSED) closed += 1;
            else open += 1;
            if (isAdmin ? record.unreadForAdmin : record.unreadForUser) unread += 1;
        }
        return { open, resolved, closed, unread, total: records.length };
    };

    const getTicket = async (ticketId) => {
        const record = await store.get(ticketId);
        if (!record) {
            const err = new Error('Ticket not found');
            err.status = 404;
            throw err;
        }
        return { record, dto: await enrich(record) };
    };

    const assertCanAccess = async (user, ticketId, { isAdmin = false } = {}) => {
        const { record, dto } = await getTicket(ticketId);
        if (!isAdmin && String(record.userId) !== String(user?.id || '')) {
            const err = new Error('You can only view your own tickets.');
            err.status = 403;
            throw err;
        }
        return { record, dto };
    };

    const markRead = async (ticketId, { isAdmin = false } = {}) => {
        const record = await store.get(ticketId);
        if (!record) return null;
        const patch = isAdmin ? { unreadForAdmin: false } : { unreadForUser: false };
        const updated = await store.update(ticketId, patch);
        return enrich(updated);
    };

    const addComment = async (ticketId, message, actor = null, { isAdmin = false } = {}) => {
        const record = await store.get(ticketId);
        if (!record) {
            const err = new Error('Ticket not found');
            err.status = 404;
            throw err;
        }
        if (Number(record.status) === SUPPORT_TICKET_STATUS.CLOSED) {
            const err = new Error('This ticket is closed.');
            err.status = 400;
            throw err;
        }
        const text = String(message || '').trim();
        if (text.length < 1) {
            const err = new Error('Message is required');
            err.status = 400;
            throw err;
        }
        const now = new Date().toISOString();
        const comments = Array.isArray(record.comments) ? [...record.comments] : [];
        const nextId = comments.reduce((max, c) => Math.max(max, Number(c.id) || 0), 0) + 1;
        comments.push({
            id: nextId,
            message: text,
            createdAt: now,
            userId: String(actor?.id || ''),
            displayName: actor?.username || actor?.email || (isAdmin ? 'Admin' : 'Member'),
            avatar: actor?.thumb || actor?.avatar || '',
            isAdmin,
        });
        const updated = await store.update(ticketId, {
            comments,
            status: Number(record.status) === SUPPORT_TICKET_STATUS.RESOLVED && !isAdmin
                ? SUPPORT_TICKET_STATUS.OPEN
                : record.status,
            unreadForAdmin: !isAdmin,
            unreadForUser: !!isAdmin,
        });
        return enrich(updated);
    };

    const updateStatus = async (ticketId, status) => {
        const record = await store.get(ticketId);
        if (!record) {
            const err = new Error('Ticket not found');
            err.status = 404;
            throw err;
        }
        const nextStatus = parseSupportStatus(status);
        const updated = await store.update(ticketId, {
            status: nextStatus,
            unreadForUser: nextStatus !== SUPPORT_TICKET_STATUS.OPEN,
        });
        return enrich(updated);
    };

    const deleteTicket = async (ticketId) => {
        const removed = await store.remove(ticketId);
        if (!removed) {
            const err = new Error('Ticket not found');
            err.status = 404;
            throw err;
        }
        return true;
    };

    return {
        store,
        createTicket,
        listTickets,
        getCounts,
        getTicket,
        assertCanAccess,
        markRead,
        addComment,
        updateStatus,
        deleteTicket,
    };
};

export default createSupportTicketService;
