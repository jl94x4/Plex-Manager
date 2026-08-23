import assert from 'node:assert/strict';
import {
    customNavTabKey,
    isCustomNavTabKey,
    normalizeCustomNavTabs,
    parseCustomNavTabKey,
    pruneNavOrderCustomKeys,
} from './custom-nav-tabs.js';

const tabs = normalizeCustomNavTabs([
    {
        id: 'games',
        name: 'Games',
        url: 'https://games.example.com',
        icon: 'Gamepad2',
        openMode: 'embed',
        adminOnly: true,
        enabled: true,
    },
    {
        id: 'docs',
        name: 'Docs',
        url: 'https://docs.example.com',
        icon: 'BookOpen',
        openMode: 'newTab',
        enabled: true,
    },
    {
        id: 'bad',
        name: 'Bad',
        url: 'javascript:alert(1)',
        enabled: true,
    },
]);

assert.equal(tabs.length, 2);
assert.equal(tabs[0].openMode, 'embed');
assert.equal(customNavTabKey('games'), 'custom:games');
assert.equal(parseCustomNavTabKey('custom:games'), 'games');
assert.equal(isCustomNavTabKey('custom:games'), true);

const pruned = pruneNavOrderCustomKeys(
    ['home', 'custom:games', 'custom:missing', 'settings'],
    tabs,
);
assert.deepEqual(pruned, ['home', 'custom:games', 'settings']);

console.log('custom nav tabs ok');
