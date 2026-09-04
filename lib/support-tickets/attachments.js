import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import {
    SUPPORT_ATTACHMENT_MAX_BYTES,
    SUPPORT_ATTACHMENT_MAX_PER_MESSAGE,
    SUPPORT_ATTACHMENT_MIME_BY_EXT,
} from './constants.js';

export const getSupportAttachmentsDir = (dataDir, ticketId) => (
    path.join(String(dataDir || ''), 'attachments', String(ticketId || ''))
);

const detectImageMeta = (buffer) => {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        return { extension: 'png', mime: 'image/png' };
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return { extension: 'jpg', mime: 'image/jpeg' };
    }
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
        return { extension: 'gif', mime: 'image/gif' };
    }
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
        && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        return { extension: 'webp', mime: 'image/webp' };
    }
    return null;
};

const sanitizeFilename = (value = '') => {
    const base = path.basename(String(value || 'image')).replace(/[^\w.\-()+ ]+/g, '_').trim();
    return (base || 'image').slice(0, 120);
};

export const attachmentPublicUrl = (ticketId, attachmentId) => (
    `/api/support/tickets/${encodeURIComponent(String(ticketId))}/attachments/${encodeURIComponent(String(attachmentId))}`
);

export const normalizeAttachmentMeta = (raw, ticketId) => {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim();
    if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) return null;
    const extension = String(raw.extension || '').trim().toLowerCase().replace(/^jpeg$/, 'jpg');
    const mime = String(raw.mime || SUPPORT_ATTACHMENT_MIME_BY_EXT[extension] || '').trim().toLowerCase();
    if (!SUPPORT_ATTACHMENT_MIME_BY_EXT[extension] || !mime.startsWith('image/')) return null;
    return {
        id,
        filename: sanitizeFilename(raw.filename || `image.${extension}`),
        mime,
        extension,
        size: Math.max(0, Number(raw.size) || 0),
        url: attachmentPublicUrl(ticketId, id),
    };
};

export const mapAttachmentsForTicket = (attachments, ticketId) => {
    if (!Array.isArray(attachments)) return [];
    return attachments
        .map((item) => normalizeAttachmentMeta(item, ticketId))
        .filter(Boolean)
        .slice(0, SUPPORT_ATTACHMENT_MAX_PER_MESSAGE);
};

export const writeSupportAttachment = async (dataDir, ticketId, buffer, originalName = 'image') => {
    if (!Buffer.isBuffer(buffer) || !buffer.length) {
        const err = new Error('Image data is required');
        err.status = 400;
        throw err;
    }
    if (buffer.length > SUPPORT_ATTACHMENT_MAX_BYTES) {
        const err = new Error(`Image is too large (max ${Math.round(SUPPORT_ATTACHMENT_MAX_BYTES / (1024 * 1024))}MB).`);
        err.status = 400;
        throw err;
    }
    const detected = detectImageMeta(buffer);
    if (!detected) {
        const err = new Error('Invalid image format. Only JPEG, PNG, WebP, and GIF are accepted.');
        err.status = 400;
        throw err;
    }
    const id = randomUUID();
    const dir = getSupportAttachmentsDir(dataDir, ticketId);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${id}.${detected.extension}`);
    await fs.writeFile(filePath, buffer);
    return normalizeAttachmentMeta({
        id,
        filename: sanitizeFilename(originalName) || `image.${detected.extension}`,
        mime: detected.mime,
        extension: detected.extension,
        size: buffer.length,
    }, ticketId);
};

export const readSupportAttachment = async (dataDir, ticketId, attachmentId) => {
    const id = String(attachmentId || '').trim();
    if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) return null;
    const dir = getSupportAttachmentsDir(dataDir, ticketId);
    for (const extension of Object.keys(SUPPORT_ATTACHMENT_MIME_BY_EXT)) {
        const filePath = path.join(dir, `${id}.${extension}`);
        try {
            const buffer = await fs.readFile(filePath);
            if (!buffer.length) continue;
            return {
                buffer,
                mime: SUPPORT_ATTACHMENT_MIME_BY_EXT[extension],
                extension,
            };
        } catch {
            // try next extension
        }
    }
    return null;
};

export const assertAttachmentsExist = async (dataDir, ticketId, attachments = []) => {
    const normalized = mapAttachmentsForTicket(attachments, ticketId);
    if (normalized.length > SUPPORT_ATTACHMENT_MAX_PER_MESSAGE) {
        const err = new Error(`You can attach up to ${SUPPORT_ATTACHMENT_MAX_PER_MESSAGE} images per message.`);
        err.status = 400;
        throw err;
    }
    const resolved = [];
    for (const item of normalized) {
        const file = await readSupportAttachment(dataDir, ticketId, item.id);
        if (!file) {
            const err = new Error('One or more attachments could not be found. Upload them again.');
            err.status = 400;
            throw err;
        }
        resolved.push({
            ...item,
            mime: file.mime,
            extension: file.extension,
            size: item.size || file.buffer.length,
        });
    }
    return resolved;
};

export const deleteSupportTicketAttachments = async (dataDir, ticketId) => {
    const dir = getSupportAttachmentsDir(dataDir, ticketId);
    try {
        await fs.rm(dir, { recursive: true, force: true });
    } catch {
        // ignore missing dir
    }
};
