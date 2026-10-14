// Cut a tall full-page screenshot into viewport-sized tiles you can actually read.
// usage: node scripts/tiles.mjs <name> [--size desktop] [--clone]   -> sites/<name>/reference/tiles/<size>-01.png ...
//        node scripts/tiles.mjs <png> [tileHeight=1200]              -> <png-dir>/tiles/<png-name>-01.png ...
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { SCORED, parseArgs, COMPARE } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [target, h] = pos;
if (!target) {
  console.error('usage: trueclone tiles <name> [--size desktop|tablet|mobile|laptop|wide] [--clone]   or   trueclone tiles <file.png> [tileHeight]');
  process.exit(1);
}
let files;
let tileH = Number(h || 1200);
if (/\.png$/i.test(target)) files = [path.resolve(target)];
else {
  // a site name: the reference's full-page shots (or the clone's last layout shots with --clone)
  const root = path.resolve('sites', target);
  const sizes = flags.size ? [flags.size] : SCORED.map((v) => v.name);
  files = sizes.map((s) => (flags.clone ? path.join(root, COMPARE, `${s}.mask.clone.png`) : path.join(root, 'reference', `${s}.png`)));
  if (!h) tileH = 0; // one tile per screen of that size
}
for (const file of files) {
  const src = await fs.readFile(file).then((b) => PNG.sync.read(b), () => null);
  if (!src) { console.log(`skipped (not found): ${path.relative(process.cwd(), file)}`); continue; }
  const size = SCORED.find((v) => path.basename(file).startsWith(`${v.name}.`));
  const th = tileH || size?.height || 1200;
  const dir = path.join(path.dirname(file), 'tiles');
  await fs.mkdir(dir, { recursive: true });
  const base = path.basename(file, '.png');
  let n = 0;
  for (let y = 0; y < src.height; y += th) {
    const hh = Math.min(th, src.height - y);
    const out = new PNG({ width: src.width, height: hh });
    PNG.bitblt(src, out, 0, y, src.width, hh, 0, 0);
    await fs.writeFile(path.join(dir, `${base}-${String(++n).padStart(2, '0')}.png`), PNG.sync.write(out));
  }
  console.log(`${n} tiles of ${th}px -> ${path.relative(process.cwd(), dir)} (${base}-NN.png)`);
}
