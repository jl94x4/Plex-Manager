import assert from 'node:assert/strict';
import test from 'node:test';
import {
    classifyArrEvent,
    extractArrReleaseFilename,
    extractArrWebhookArtwork,
    isPublicArtworkUrl,
    isScannerActivityNotifyEnabled,
    formatScannerNotifyTitle,
    scannerActivityNotifyEvent,
} from './triggers/parsers.js';

test('classifyArrEvent maps download, upgrade, grab, and deletes', () => {
    assert.equal(classifyArrEvent('radarr', { eventType: 'Download', movie: { title: 'Dune', year: 2021 } }).action, 'import');
    assert.equal(classifyArrEvent('radarr', {
        eventType: 'Download',
        isUpgrade: true,
        movie: { title: 'Dune', year: 2021 },
    }).action, 'upgrade');
    assert.equal(classifyArrEvent('sonarr', {
        eventType: 'Grab',
        series: { title: 'The Office' },
        release: { releaseTitle: 'The.Office.S03E01.1080p.WEB.x264-GROUP', quality: { quality: { name: 'WEBDL-1080p' } } },
        episodes: [{ seasonNumber: 3, episodeNumber: 1, title: 'Gay Witch Hunt' }],
    }).action, 'grab');
    assert.equal(classifyArrEvent('sonarr', { eventType: 'EpisodeFileDelete', series: { title: 'Office' } }).action, 'file-delete');
    assert.equal(classifyArrEvent('radarr', { eventType: 'MovieFileDelete', movie: { title: 'Dune' } }).action, 'file-delete');
});

test('classifyArrEvent grab includes the Arr release filename', () => {
    const meta = classifyArrEvent('radarr', {
        eventType: 'Grab',
        movie: { title: 'Dune', year: 2021 },
        release: {
            releaseTitle: 'Dune.2021.2160p.WEB.DDP5.1.Atmos.H.265-GROUP',
            quality: { quality: { name: 'WEBDL-2160p' } },
        },
    });
    assert.equal(meta.action, 'grab');
    assert.equal(meta.reason, 'Grab');
    assert.equal(meta.filename, 'Dune.2021.2160p.WEB.DDP5.1.Atmos.H.265-GROUP');
    assert.equal(meta.quality, 'WEBDL-2160p');
    assert.equal(extractArrReleaseFilename({
        Release: { ReleaseTitle: 'Show.S01E01.1080p.WEB-GROUP' },
    }), 'Show.S01E01.1080p.WEB-GROUP');
});

test('scannerActivityNotifyEvent covers grab, import, upgrade, and deletes', () => {
    assert.equal(scannerActivityNotifyEvent('import'), 'scanner_import');
    assert.equal(scannerActivityNotifyEvent('grab'), 'scanner_grab');
    assert.equal(scannerActivityNotifyEvent('upgrade'), 'scanner_upgrade');
    assert.equal(scannerActivityNotifyEvent('file-delete'), 'scanner_deleted');
    assert.equal(scannerActivityNotifyEvent('series-delete'), 'scanner_deleted');
    assert.equal(scannerActivityNotifyEvent('movie-delete'), 'scanner_deleted');
    assert.equal(scannerActivityNotifyEvent('artist-delete'), 'scanner_deleted');
    assert.equal(scannerActivityNotifyEvent('album-delete'), 'scanner_deleted');
    assert.equal(scannerActivityNotifyEvent('rename'), null);
    assert.equal(scannerActivityNotifyEvent('test'), null);
});

test('extractArrWebhookArtwork prefers Sonarr poster remoteUrl', () => {
    const artwork = extractArrWebhookArtwork('sonarr', {
        eventType: 'EpisodeFileDelete',
        series: {
            title: 'The Office',
            tvdbId: 73244,
            tmdbId: 2316,
            images: [
                { coverType: 'banner', remoteUrl: 'https://artworks.thetvdb.com/banners/graphical/73244-g.jpg' },
                { coverType: 'poster', url: '/MediaCover/1/poster.jpg', remoteUrl: 'https://artworks.thetvdb.com/banners/posters/73244-1.jpg' },
            ],
        },
    });
    assert.equal(artwork.mediaType, 'tv');
    assert.equal(artwork.tmdbId, 2316);
    assert.equal(artwork.tvdbId, 73244);
    assert.equal(artwork.posterUrl, 'https://artworks.thetvdb.com/banners/posters/73244-1.jpg');
});

test('extractArrWebhookArtwork skips local MediaCover paths', () => {
    const artwork = extractArrWebhookArtwork('sonarr', {
        series: {
            tmdbId: 2316,
            images: [{ coverType: 'poster', url: '/MediaCover/1/poster.jpg', remoteUrl: 'http://127.0.0.1:8989/MediaCover/1/poster.jpg' }],
        },
    });
    assert.equal(artwork.posterUrl, undefined);
    assert.equal(artwork.tmdbId, 2316);
    assert.equal(isPublicArtworkUrl('http://sonarr.lan:8989/MediaCover/12/poster.jpg'), false);
    assert.equal(isPublicArtworkUrl('https://artworks.thetvdb.com/banners/posters/73244-1.jpg'), true);
});

test('classifyArrEvent includes series poster for scanner notifications', () => {
    const meta = classifyArrEvent('sonarr', {
        eventType: 'Download',
        series: {
            title: 'The Office',
            tmdbId: 2316,
            images: [{ coverType: 'poster', remoteUrl: 'https://image.tmdb.org/t/p/original/office.jpg' }],
        },
        episodes: [{ seasonNumber: 3, episodeNumber: 1, title: 'Gay Witch Hunt' }],
    });
    assert.equal(meta.action, 'import');
    assert.equal(meta.posterUrl, 'https://image.tmdb.org/t/p/original/office.jpg');
    assert.equal(meta.tmdbId, 2316);
    assert.equal(meta.mediaType, 'tv');
});

test('classifyArrEvent uses a hyphen between episode code and title', () => {
    const meta = classifyArrEvent('sonarr', {
        eventType: 'Download',
        isUpgrade: true,
        series: { title: 'Big Brother (US)' },
        episodes: [{ seasonNumber: 28, episodeNumber: 21, title: 'Episode 21' }],
        episodeFile: { quality: { quality: { name: 'HDTV-1080p' } } },
    });
    assert.equal(meta.title, 'Big Brother (US) · S28E21 - Episode 21');
    assert.equal(meta.quality, 'HDTV-1080p');
});

test('formatScannerNotifyTitle puts quality in brackets', () => {
    assert.equal(
        formatScannerNotifyTitle({
            title: 'Big Brother (US) · S28E21 - Episode 21',
            quality: 'HDTV-1080p',
        }),
        'Big Brother (US) · S28E21 - Episode 21 [HDTV-1080p]',
    );
    assert.equal(
        formatScannerNotifyTitle({ title: 'The Shards · S01E05 — Murder on the Dancefloor', quality: 'WEBDL-1080p' }),
        'The Shards · S01E05 - Murder on the Dancefloor [WEBDL-1080p]',
    );
    assert.equal(formatScannerNotifyTitle({ title: 'Dune (2021)' }), 'Dune (2021)');
    assert.equal(formatScannerNotifyTitle({}, { folder: '/tv/Show' }), '/tv/Show');
});

test('isScannerActivityNotifyEnabled is opt-in per event', () => {
    assert.equal(isScannerActivityNotifyEnabled({}, 'scanner_deleted'), false);
    assert.equal(isScannerActivityNotifyEnabled({ scannerNotifyDeleted: true }, 'scanner_deleted'), true);
    assert.equal(isScannerActivityNotifyEnabled({ scannerNotifyUpgrade: true }, 'scanner_upgrade'), true);
    assert.equal(isScannerActivityNotifyEnabled({ scannerNotifyImport: true }, 'scanner_import'), true);
    assert.equal(isScannerActivityNotifyEnabled({ scannerNotifyGrab: true }, 'scanner_grab'), true);
    assert.equal(isScannerActivityNotifyEnabled({}, 'scanner_grab'), false);
    assert.equal(isScannerActivityNotifyEnabled({ scannerNotifyDeleted: true }, 'scanner_import'), false);
});
