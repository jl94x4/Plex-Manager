import assert from 'node:assert/strict';
import test from 'node:test';
import {
    classifyArrEvent,
    extractArrWebhookArtwork,
    isPublicArtworkUrl,
    isScannerActivityNotifyEnabled,
    scannerActivityNotifyEvent,
} from './triggers/parsers.js';

test('classifyArrEvent maps download, upgrade, and deletes', () => {
    assert.equal(classifyArrEvent('radarr', { eventType: 'Download', movie: { title: 'Dune', year: 2021 } }).action, 'import');
    assert.equal(classifyArrEvent('radarr', {
        eventType: 'Download',
        isUpgrade: true,
        movie: { title: 'Dune', year: 2021 },
    }).action, 'upgrade');
    assert.equal(classifyArrEvent('sonarr', { eventType: 'EpisodeFileDelete', series: { title: 'Office' } }).action, 'file-delete');
    assert.equal(classifyArrEvent('radarr', { eventType: 'MovieFileDelete', movie: { title: 'Dune' } }).action, 'file-delete');
});

test('scannerActivityNotifyEvent only covers import, upgrade, and deletes', () => {
    assert.equal(scannerActivityNotifyEvent('import'), 'scanner_import');
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

test('isScannerActivityNotifyEnabled is opt-in per event', () => {
    assert.equal(isScannerActivityNotifyEnabled({}, 'scanner_deleted'), false);
    assert.equal(isScannerActivityNotifyEnabled({ scannerNotifyDeleted: true }, 'scanner_deleted'), true);
    assert.equal(isScannerActivityNotifyEnabled({ scannerNotifyUpgrade: true }, 'scanner_upgrade'), true);
    assert.equal(isScannerActivityNotifyEnabled({ scannerNotifyImport: true }, 'scanner_import'), true);
    assert.equal(isScannerActivityNotifyEnabled({ scannerNotifyDeleted: true }, 'scanner_import'), false);
});
