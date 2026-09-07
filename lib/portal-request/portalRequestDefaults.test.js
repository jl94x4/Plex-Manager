import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getPortalRequestDefaults,
    pickPortalRequestDefaultsForSave,
    portalRequestDefaultsForClient,
} from './portalRequestDefaults.js';

test('request tags default on and can be disabled', () => {
    assert.equal(getPortalRequestDefaults({}).allowRequestTags, true);
    assert.equal(getPortalRequestDefaults({ portalAllowRequestTags: false }).allowRequestTags, false);
    assert.equal(portalRequestDefaultsForClient({}).portalAllowRequestTags, true);
    assert.equal(
        pickPortalRequestDefaultsForSave({ portalAllowRequestTags: false }, {}).portalAllowRequestTags,
        false,
    );
    assert.equal(
        pickPortalRequestDefaultsForSave({}, { portalAllowRequestTags: false }).portalAllowRequestTags,
        false,
    );
});
