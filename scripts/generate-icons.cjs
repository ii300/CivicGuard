// Render the project's simple vector mark to PNG without build-time image dependencies.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const shield = [[18, 13], [50, 5], [82, 13], [82, 48], [74, 68], [63, 81], [50, 92], [37, 81], [26, 68], [18, 48]];
const flame = [[51, 23], [62, 38], [58, 48], [66, 44], [69, 57], [64, 69], [52, 75], [40, 71], [32, 60], [33, 47], [43, 34], [42, 47], [49, 41]];
const core = [[51, 51], [59, 61], [57, 68], [50, 71], [44, 66], [45, 60]];

function contains(polygon, x, y) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const name = Buffer.from(type), size = Buffer.alloc(4), crc = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
    return Buffer.concat([size, name, data, crc]);
}

function writeIcon(size, filename) {
    const pixels = Buffer.alloc(size * (1 + size * 3));
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const color = [0, 0, 0];
            for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
                const px = (x + (sx + 0.5) / 2) * 100 / size;
                const py = (y + (sy + 0.5) / 2) * 100 / size;
                const sample = contains(core, px, py) ? [255, 207, 109]
                    : contains(flame, px, py) ? [209, 74, 61]
                    : contains(shield, px, py) ? [255, 253, 248] : [29, 66, 96];
                sample.forEach((value, channel) => { color[channel] += value / 4; });
            }
            color.forEach((value, channel) => { pixels[y * (1 + size * 3) + 1 + x * 3 + channel] = Math.round(value); });
        }
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]));
}

if (require.main === module) {
    const root = path.resolve(__dirname, '..');
    writeIcon(1024, path.join(root, 'resources/icon.png'));
    const polygon = (points, fill) => `<polygon points="${points.map((point) => point.join(',')).join(' ')}" fill="${fill}"/>`;
    fs.writeFileSync(path.join(root, 'resources/icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#1d4260"/>${polygon(shield, '#fffdf8')}${polygon(flame, '#d14a3d')}${polygon(core, '#ffcf6d')}</svg>\n`);
}

module.exports = { writeIcon };
