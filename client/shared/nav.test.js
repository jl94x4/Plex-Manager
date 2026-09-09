import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const loadNav = async () => {
    const result = await build({
        entryPoints: [path.join(__dirname, 'nav.ts')],
        bundle: true,
        format: 'cjs',
        platform: 'node',
        write: false,
    });
    const module = { exports: {} };
    vm.runInNewContext(result.outputFiles[0].text, {
        module,
        exports: module.exports,
        require,
        console,
    });
    return module.exports;
};

test('normalizeNavHiddenKeys keeps custom applet keys when tabs are supplied', async () => {
    const { normalizeNavHiddenKeys, normalizeMemberNavHiddenKeys } = await loadNav();
    const tabs = [
        { id: 'retro', enabled: true },
        { id: 'disabled-tab', enabled: false },
        { id: 'member-ok', enabled: true, adminOnly: false },
        { id: 'admin-only', enabled: true, adminOnly: true },
    ];

    assert.equal(
        JSON.stringify(normalizeNavHiddenKeys(['custom:retro', 'analytics', 'home'], tabs)),
        JSON.stringify(['custom:retro', 'analytics']),
    );
    assert.equal(
        JSON.stringify(normalizeNavHiddenKeys(['custom:retro', 'analytics'], [])),
        JSON.stringify(['analytics']),
    );
    assert.equal(
        JSON.stringify(normalizeMemberNavHiddenKeys(['custom:member-ok', 'custom:admin-only', 'about'], tabs)),
        JSON.stringify(['custom:member-ok', 'about']),
    );
});
