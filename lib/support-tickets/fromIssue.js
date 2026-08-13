import { isSupportTicketsEnabled } from './constants.js';
import { createSupportTicketService } from './service.js';

const issueEngine = (issue = {}) => {
    if (issue.engine) return String(issue.engine);
    if (issue.seerrUrl) return 'seerr';
    return 'portal';
};

const seasonLabel = (issue = {}) => {
    const season = Number(issue.problemSeason);
    const episode = Number(issue.problemEpisode);
    if (issue.type !== 'tv' || !(season > 0)) return '';
    if (episode > 0) return `S${season}E${episode}`;
    return `Season ${season}`;
};

export const buildMediaIssueTicketDraft = (issue = {}, message = '') => {
    const title = String(issue.title || 'Unknown title').trim() || 'Unknown title';
    const typeLabel = String(issue.issueTypeLabel || 'Other').trim() || 'Other';
    const year = issue.year ? String(issue.year).trim() : '';
    const location = seasonLabel(issue);
    const extras = [year, location].filter(Boolean);
    const subject = `${typeLabel} issue: ${title}`.slice(0, 160);
    const reported = String(message || '').trim()
        || String(issue.comments?.[0]?.message || '').trim();
    const header = `Reported a ${typeLabel.toLowerCase()} issue with “${title}”${extras.length ? ` (${extras.join(' · ')})` : ''}.`;
    return {
        subject,
        category: 'media',
        message: reported ? `${header}\n\n${reported}` : header,
        meta: {
            source: 'media_issue',
            linkedIssueId: issue.id != null ? String(issue.id) : null,
            issueEngine: issueEngine(issue),
            mediaTitle: title,
            mediaType: issue.type === 'tv' ? 'tv' : 'movie',
            tmdbId: Number(issue.tmdbId) > 0 ? Number(issue.tmdbId) : null,
            posterUrl: issue.posterUrl || '',
            issueTypeLabel: typeLabel,
            problemSeason: issue.problemSeason ?? null,
            problemEpisode: issue.problemEpisode ?? null,
        },
    };
};

export const createSupportTicketFromMediaIssue = async ({
    config,
    dataDir,
    resolveUser,
    actor,
    issue,
    message,
    log = () => {},
} = {}) => {
    if (!isSupportTicketsEnabled(config)) return null;
    if (!actor?.id || issue?.id == null) return null;
    try {
        const service = createSupportTicketService({ dataDir, resolveUser });
        const engine = issueEngine(issue);
        const existing = await service.findTicketForIssue(issue.id, engine);
        if (existing) return existing;
        const draft = buildMediaIssueTicketDraft(issue, message);
        return await service.createTicket(actor, draft);
    } catch (error) {
        log(`[support] ticket from media issue failed: ${error?.message || error}`);
        return null;
    }
};

export const attachTicketIdsToIssues = async ({
    config,
    dataDir,
    issues,
    engine = 'portal',
} = {}) => {
    const list = Array.isArray(issues) ? issues : [];
    if (!list.length || !isSupportTicketsEnabled(config) || !dataDir) return list;
    try {
        const service = createSupportTicketService({ dataDir });
        const map = await service.listLinkedIssueTicketIds();
        return list.map((issue) => {
            const id = issue?.id;
            if (id == null) return { ...issue, ticketId: null };
            const ticketId = map[`${engine}:${id}`]
                || map[`portal:${id}`]
                || map[`seerr:${id}`]
                || null;
            return { ...issue, ticketId };
        });
    } catch {
        return list.map((issue) => ({ ...issue, ticketId: issue?.ticketId || null }));
    }
};
