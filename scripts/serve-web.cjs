const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '../dist/web');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const port = Number(process.env.PORT || 5056);

http.createServer(async (request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
        const filename = path.resolve(root, relative);
        if (!filename.startsWith(root + path.sep) || !['GET', 'HEAD'].includes(request.method)) {
            response.writeHead(403).end();
            return;
        }
        const body = await fs.readFile(filename);
        response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'text/plain', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
        response.writeHead(404).end('Not found');
    }
}).listen(port, '127.0.0.1', () => console.log(`Packaged web preview: http://127.0.0.1:${port}`));
