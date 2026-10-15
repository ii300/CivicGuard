const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { buildWeb } = require('../scripts/build-web.cjs');

test('app bundle contains local UI dependencies without backend secrets or generated data', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'civicguard-web-'));
    try {
        await buildWeb(directory);
        const files = await fs.readdir(directory);
        assert.deepEqual(files.sort(), ['console-core.js', 'index.html', 'script.js', 'styles.css', 'vendor']);
        const html = await fs.readFile(path.join(directory, 'index.html'), 'utf8');
        assert.ok(!html.includes('unpkg.com'));
        assert.match(html, /src="vendor\/leaflet\/leaflet.js"/);
        assert.match(html, /href="vendor\/leaflet\/leaflet.css"/);
        assert.match(html, /Content-Security-Policy/);
        assert.match(html, /script-src 'self'/);
        assert.ok((await fs.stat(path.join(directory, 'vendor/leaflet/leaflet.js'))).size > 1000);
        assert.ok((await fs.readFile(path.join(directory, 'vendor/leaflet/LICENSE'), 'utf8')).includes('Copyright'));
        // Rebuilding also removes stale files, so secrets cannot survive an older build.
        await fs.writeFile(path.join(directory, '.env'), 'not-a-real-secret');
        await buildWeb(directory);
        await assert.rejects(fs.stat(path.join(directory, '.env')), { code: 'ENOENT' });
    } finally {
        await fs.rm(directory, { recursive: true, force: true });
    }
});
