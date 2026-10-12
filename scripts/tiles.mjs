// Cut a tall full-page screenshot into viewport-sized tiles you can actually read.
// usage: node scripts/tiles.mjs <png> [tileHeight=1200]  -> <png-dir>/tiles/<name>-01.png ...
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';

const [file, h = '1200'] = process.argv.slice(2);
if (!file) {
  console.error('usage: npm run tiles -- <png> [tileHeight]');
  process.exit(1);
}
const tileH = Number(h);
const src = PNG.sync.read(await fs.readFile(file));
const dir = path.join(path.dirname(file), 'tiles');
await fs.mkdir(dir, { recursive: true });
const base = path.basename(file, '.png');
let n = 0;
for (let y = 0; y < src.height; y += tileH) {
  const th = Math.min(tileH, src.height - y);
  const out = new PNG({ width: src.width, height: th });
  PNG.bitblt(src, out, 0, y, src.width, th, 0, 0);
  const name = `${base}-${String(++n).padStart(2, '0')}.png`;
  await fs.writeFile(path.join(dir, name), PNG.sync.write(out));
}
console.log(`${n} tiles -> ${dir}`);
