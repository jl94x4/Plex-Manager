import assert from 'node:assert/strict';
import {
    appletPresetLogoPath,
    isAppletPresetLogoUrl,
    matchAppletPresetLogo,
    parseAppletPresetLogoUrl,
} from './applet-preset-logos.js';

assert.equal(appletPresetLogoPath('sonarr'), '/static/applets/sonarr.png');
assert.equal(appletPresetLogoPath('sonarr-4k'), '/static/applets/sonarr-4k.png');
assert.equal(appletPresetLogoPath('../evil'), '');
assert.equal(appletPresetLogoPath('missing-service'), '');
assert.equal(parseAppletPresetLogoUrl('/static/applets/radarr.png'), 'radarr');
assert.equal(parseAppletPresetLogoUrl('/static/applets/radarr-4k.png'), 'radarr-4k');
assert.equal(isAppletPresetLogoUrl('/static/applets/radarr.png?v=1'), true);
assert.equal(isAppletPresetLogoUrl('/static/applets/../logo.png'), false);
assert.equal(isAppletPresetLogoUrl('/api/branding/custom-tab/abc'), false);

assert.equal(matchAppletPresetLogo('Radarr', '').id, 'radarr');
assert.equal(matchAppletPresetLogo('Sonarr', '').id, 'sonarr');
assert.equal(matchAppletPresetLogo('Sonarr 4K', '').id, 'sonarr-4k');
assert.equal(matchAppletPresetLogo('Radarr 4K', '').id, 'radarr-4k');
assert.equal(matchAppletPresetLogo('4K Sonarr', '').id, 'sonarr-4k');
assert.equal(matchAppletPresetLogo('Movies 4K', 'https://radarr-4k.example.com').id, 'radarr-4k');
assert.equal(matchAppletPresetLogo('Photos', 'https://immich.example.com').id, 'immich');
assert.equal(matchAppletPresetLogo('BitTorrent', '').id, 'qbittorrent');
assert.equal(matchAppletPresetLogo('Vaultwarden', 'https://vault.example.com').id, 'bitwarden');
assert.equal(matchAppletPresetLogo('Jellyseerr', 'https://overseerr.example.com').id, 'jellyseerr');
assert.equal(matchAppletPresetLogo('Games', 'https://games.example.com'), null);

console.log('applet preset logos ok');
