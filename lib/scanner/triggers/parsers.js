import path from 'path';
import { createRewriter } from '../rewrite.js';

const posixDir = (...parts) => {
    const joined = path.posix.join(...parts.map((p) => String(p || '').replace(/\\/g, '/')));
    return joined;
};

const collectSonarrEpisodeFiles = (event = {}) => ([
    ...(Array.isArray(event.episodeFiles) ? event.episodeFiles : []),
    ...(Array.isArray(event.EpisodeFiles) ? event.EpisodeFiles : []),
    ...(event.episodeFile ? [event.episodeFile] : []),
    ...(event.EpisodeFile ? [event.EpisodeFile] : []),
    ...(Array.isArray(event.deletedFiles) ? event.deletedFiles : []),
    ...(Array.isArray(event.DeletedFiles) ? event.DeletedFiles : []),
]);

/**
 * @param {object} event Sonarr webhook body
 * @returns {string[]} folder paths (before rewrite)
 */
export const pathsFromSonarrEvent = (event) => {
    const type = String(event?.eventType || event?.EventType || '');
    if (/^test$/i.test(type)) return [];

    const seriesPath = event?.series?.path || event?.series?.Path;
    const destinationPath = event?.destinationPath || event?.DestinationPath;

    if (/^(Download|EpisodeFileDelete)$/i.test(type)) {
        const folders = collectSonarrEpisodeFiles(event)
            .map((file) => {
                const fullPath = file?.path || file?.Path;
                if (fullPath) return path.posix.dirname(String(fullPath).replace(/\\/g, '/'));
                const rel = file?.relativePath || file?.RelativePath;
                if (rel && seriesPath) return path.posix.dirname(posixDir(seriesPath, rel));
                return '';
            })
            .filter(Boolean);
        if (folders.length) return [...new Set(folders)];
        // Sonarr v4 "On Import Complete" / batch payloads use episodeFiles[].
        // Fall back to destination or series path so a valid import is never dropped.
        if (destinationPath) return [String(destinationPath).replace(/\\/g, '/')];
        if (seriesPath) return [String(seriesPath).replace(/\\/g, '/')];
        throw Object.assign(new Error('Required fields missing'), { status: 400 });
    }
    if (/^SeriesDelete$/i.test(type)) {
        if (!seriesPath) throw Object.assign(new Error('Required fields missing'), { status: 400 });
        return [String(seriesPath).replace(/\\/g, '/')];
    }
    if (/^Rename$/i.test(type)) {
        if (!seriesPath) throw Object.assign(new Error('Required fields missing'), { status: 400 });
        const renamed = event?.renamedEpisodeFiles || event?.RenamedEpisodeFiles || [];
        const seen = new Set();
        const paths = [];
        for (const file of renamed) {
            const previousPath = file.previousPath || file.PreviousPath;
            const relativePath = file.relativePath || file.RelativePath;
            const currentPath = file.path || file.Path;
            if (previousPath) {
                const prev = path.posix.dirname(String(previousPath).replace(/\\/g, '/'));
                if (!seen.has(prev)) { seen.add(prev); paths.push(prev); }
            }
            if (currentPath) {
                const cur = path.posix.dirname(String(currentPath).replace(/\\/g, '/'));
                if (!seen.has(cur)) { seen.add(cur); paths.push(cur); }
            } else if (relativePath) {
                const cur = path.posix.dirname(posixDir(seriesPath, relativePath));
                if (!seen.has(cur)) { seen.add(cur); paths.push(cur); }
            }
        }
        if (paths.length) return paths;
        return [String(seriesPath).replace(/\\/g, '/')];
    }
    return [];
};

/**
 * @param {object} event Radarr webhook body
 */
export const pathsFromRadarrEvent = (event) => {
    const type = String(event?.eventType || event?.EventType || '');
    if (/^test$/i.test(type)) return [];

    const folder = event?.movie?.folderPath || event?.movie?.FolderPath || event?.movie?.path || event?.movie?.Path;
    if (/^(Download|MovieFileDelete)$/i.test(type)) {
        const files = [
            ...(Array.isArray(event.movieFiles) ? event.movieFiles : []),
            ...(Array.isArray(event.MovieFiles) ? event.MovieFiles : []),
            ...(event.movieFile ? [event.movieFile] : []),
            ...(event.MovieFile ? [event.MovieFile] : []),
            ...(Array.isArray(event.deletedFiles) ? event.deletedFiles : []),
            ...(Array.isArray(event.DeletedFiles) ? event.DeletedFiles : []),
        ];
        const folders = files
            .map((file) => {
                const fullPath = file?.path || file?.Path;
                if (fullPath) return path.posix.dirname(String(fullPath).replace(/\\/g, '/'));
                const rel = file?.relativePath || file?.RelativePath;
                if (rel && folder) return path.posix.dirname(posixDir(folder, rel));
                return '';
            })
            .filter(Boolean);
        if (folders.length) return [...new Set(folders)];
        if (folder) return [String(folder).replace(/\\/g, '/')];
        throw Object.assign(new Error('Required fields missing'), { status: 400 });
    }
    if (/^(MovieDelete|Rename)$/i.test(type)) {
        if (!folder) throw Object.assign(new Error('Required fields missing'), { status: 400 });
        return [String(folder).replace(/\\/g, '/')];
    }
    return [];
};

/**
 * Lidarr webhook — mirror Autoscan: track folder from artist + track file.
 * @param {object} event
 */
export const pathsFromLidarrEvent = (event) => {
    const type = String(event?.eventType || event?.EventType || '');
    if (/^test$/i.test(type)) return [];

    if (/^(Download|AlbumDownload|TrackFileDelete|Retag|TrackRetag)$/i.test(type)) {
        const artistPath = event?.artist?.path || event?.artist?.Path;
        const files = [
            ...(Array.isArray(event?.trackFiles) ? event.trackFiles : []),
            ...(Array.isArray(event?.TrackFiles) ? event.TrackFiles : []),
            ...(event?.trackFile ? [event.trackFile] : []),
            ...(event?.TrackFile ? [event.TrackFile] : []),
            ...(Array.isArray(event?.deletedFiles) ? event.deletedFiles : []),
            ...(Array.isArray(event?.DeletedFiles) ? event.DeletedFiles : []),
        ];
        const folders = files
            .map((file) => {
                const fullPath = file?.path || file?.Path;
                if (fullPath) return path.posix.dirname(String(fullPath).replace(/\\/g, '/'));
                const rel = file?.relativePath || file?.RelativePath;
                if (rel && artistPath) return path.posix.dirname(posixDir(artistPath, rel));
                return '';
            })
            .filter(Boolean);
        if (folders.length) return [...new Set(folders)];
        // Current Lidarr imports normally include trackFiles[].path. Fall back to
        // the artist folder for older payloads so a valid import is never dropped.
        if (artistPath) return [String(artistPath).replace(/\\/g, '/')];
        throw Object.assign(new Error('Required Lidarr path fields missing'), { status: 400 });
    }
    if (/^(ArtistDelete|AlbumDelete|Rename)$/i.test(type)) {
        const artistPath = event?.artist?.path || event?.artist?.Path;
        if (!artistPath) throw Object.assign(new Error('Required fields missing'), { status: 400 });
        return [String(artistPath).replace(/\\/g, '/')];
    }
    return [];
};

/**
 * Classify an ARR webhook into a human-readable reason for queue/activity UI.
 * @param {'sonarr'|'radarr'|'lidarr'|string} kind
 * @param {object} event
 */
export const classifyArrEvent = (kind, event = {}) => {
    const eventType = String(event?.eventType || event?.EventType || '');
    const isUpgrade = !!(event?.isUpgrade ?? event?.IsUpgrade);
    let action = 'refresh';
    let reason = eventType || 'Library refresh';

    if (/^(Download|AlbumDownload)$/i.test(eventType)) {
        if (isUpgrade) {
            action = 'upgrade';
            reason = 'Upgrade';
        } else {
            action = 'import';
            reason = 'Import';
        }
    } else if (/^(EpisodeFileDelete|MovieFileDelete|TrackFileDelete)$/i.test(eventType)) {
        action = 'file-delete';
        reason = 'File deleted';
    } else if (/^SeriesDelete$/i.test(eventType)) {
        action = 'series-delete';
        reason = 'Series deleted';
    } else if (/^MovieDelete$/i.test(eventType)) {
        action = 'movie-delete';
        reason = 'Movie deleted';
    } else if (/^ArtistDelete$/i.test(eventType)) {
        action = 'artist-delete';
        reason = 'Artist deleted';
    } else if (/^AlbumDelete$/i.test(eventType)) {
        action = 'album-delete';
        reason = 'Album deleted';
    } else if (/^Rename$/i.test(eventType)) {
        action = 'rename';
        reason = 'Rename';
    } else if (/^(Retag|TrackRetag)$/i.test(eventType)) {
        action = 'retag';
        reason = 'Track retagged';
    } else if (/^Test$/i.test(eventType)) {
        action = 'test';
        reason = 'Test';
    }

    let title = '';
    const k = String(kind || '').toLowerCase();
    if (k === 'sonarr') {
        title = String(event?.series?.title || event?.series?.Title || '').trim();
        const ep = event?.episodes?.[0] || event?.Episodes?.[0];
        if (ep) {
            const sn = ep.seasonNumber ?? ep.SeasonNumber;
            const en = ep.episodeNumber ?? ep.EpisodeNumber;
            const epTitle = ep.title || ep.Title;
            if (sn != null && en != null) {
                title = `${title || 'Episode'} · S${String(sn).padStart(2, '0')}E${String(en).padStart(2, '0')}${epTitle ? ` — ${epTitle}` : ''}`;
            }
        }
    } else if (k === 'radarr') {
        title = String(event?.movie?.title || event?.movie?.Title || '').trim();
        const year = event?.movie?.year || event?.movie?.Year;
        if (title && year) title = `${title} (${year})`;
    } else if (k === 'lidarr') {
        title = String(event?.artist?.name || event?.artist?.Name || '').trim();
        const album = event?.album?.title || event?.albums?.[0]?.title;
        if (title && album) title = `${title} · ${album}`;
    }

    const firstEpisodeFile = event?.episodeFiles?.[0] || event?.EpisodeFiles?.[0] || event?.episodeFile || event?.EpisodeFile;
    const firstMovieFile = event?.movieFiles?.[0] || event?.MovieFiles?.[0] || event?.movieFile || event?.MovieFile;
    const quality =
        firstEpisodeFile?.quality?.quality?.name
        || firstEpisodeFile?.quality
        || firstEpisodeFile?.Quality
        || firstMovieFile?.quality?.quality?.name
        || firstMovieFile?.quality
        || firstMovieFile?.Quality
        || event?.trackFile?.quality?.quality?.name
        || event?.trackFiles?.[0]?.quality
        || event?.TrackFiles?.[0]?.Quality
        || event?.trackFile?.quality
        || event?.TrackFile?.Quality
        || firstEpisodeFile?.quality?.Quality?.Name
        || firstMovieFile?.quality?.Quality?.Name
        || '';

    return {
        eventType,
        action,
        reason,
        isUpgrade,
        title: title || undefined,
        quality: quality ? String(quality) : undefined,
    };
};

export const buildScansFromPaths = (paths, {
    priority = 0,
    source = 'trigger',
    rewrite = [],
    eventType,
    action,
    reason,
    title,
    quality,
    isUpgrade,
} = {}) => {
    const rewriter = createRewriter(rewrite);
    const now = new Date().toISOString();
    return (paths || [])
        .map((p) => String(p || '').trim())
        .filter(Boolean)
        .map((folder) => ({
            folder: rewriter(folder),
            priority: Number(priority) || 0,
            time: now,
            source,
            eventType: eventType || undefined,
            action: action || undefined,
            reason: reason || undefined,
            title: title || undefined,
            quality: quality || undefined,
            isUpgrade: !!isUpgrade || undefined,
        }));
};
