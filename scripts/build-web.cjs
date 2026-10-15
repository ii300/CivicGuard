const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourceFiles = ['index.html', 'styles.css', 'console-core.js', 'script.js'];
const contentSecurityPolicy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://server.arcgisonline.com",
    "connect-src 'self' https://services.arcgis.com https://services5.arcgis.com https://services7.arcgis.com",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
].join('; ');

async function buildWeb(output = path.join(root, 'dist', 'web')) {
    await fs.rm(output, { recursive: true, force: true });
    await fs.mkdir(output, { recursive: true });
    for (const filename of sourceFiles) {
        await fs.copyFile(path.join(root, filename), path.join(output, filename));
    }
    let html = await fs.readFile(path.join(output, 'index.html'), 'utf8');
    html = html.replace(/\s*<link rel="preconnect" href="https:\/\/unpkg.com"\s*\/>/, '');
    html = html.replace(/<link\s+rel="stylesheet"\s+href="https:\/\/unpkg.com\/leaflet@1\.9\.4\/dist\/leaflet\.css"[\s\S]*?\/>/, '<link rel="stylesheet" href="vendor/leaflet/leaflet.css" />');
    html = html.replace(/<script\s+src="https:\/\/unpkg.com\/leaflet@1\.9\.4\/dist\/leaflet\.js"[\s\S]*?<\/script>/, '<script src="vendor/leaflet/leaflet.js"></script>');
    if (html.includes('unpkg.com')) throw new Error('A CDN dependency remains in the packaged app.');
    html = html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n        <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}" />`);
    await fs.writeFile(path.join(output, 'index.html'), html);
    const leafletRoot = path.dirname(require.resolve('leaflet/package.json'));
    await fs.cp(path.join(leafletRoot, 'dist'), path.join(output, 'vendor', 'leaflet'), { recursive: true });
    // Source maps are for development only and are not needed by the shipped UI.
    for (const filename of ['leaflet.js.map', 'leaflet-src.js', 'leaflet-src.js.map', 'leaflet-src.esm.js', 'leaflet-src.esm.js.map']) {
        await fs.rm(path.join(output, 'vendor', 'leaflet', filename), { force: true });
    }
    await fs.copyFile(path.join(leafletRoot, 'LICENSE'), path.join(output, 'vendor', 'leaflet', 'LICENSE'));
    return output;
}

if (require.main === module) {
    buildWeb().then((output) => console.log(`Bundled app assets: ${output}`)).catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = { buildWeb, contentSecurityPolicy };
