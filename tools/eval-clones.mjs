// Score several finished clones (folders) against one capture, one after another, keeping each REPORT.md.
// usage: node tools/eval-clones.mjs <site name> <label>=<clone folder> [...] [--only layout,states]
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, parseArgs } from '../scripts/lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name, ...pairs] = pos;
const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'trueclone.mjs');
const root = path.resolve('sites', name);
const run = (args) => new Promise((resolve) => {
  const child = spawn(process.execPath, [BIN, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  child.on('close', () => resolve(out));
});
for (const pair of pairs) {
  const [label, dir] = pair.split('=');
  const server = await serve(path.resolve(dir));
  const t0 = Date.now();
  const out = await run(['score', name, '--url', `${server.url}index.html`, '--fresh', ...(typeof flags.only === 'string' ? ['--only', flags.only] : [])]);
  server.close();
  await fs.copyFile(path.join(root, 'REPORT.md'), path.join(root, `REPORT.${label}.md`));
  for (const f of ['report.mask.json', 'states/report.mask.json', 'hovers.desktop.json', 'load.json', 'detail.json']) {
    await fs.copyFile(path.join(root, 'compare', f), path.join(root, 'compare', `${label}.${f.replace('/', '-')}`)).catch(() => {});
  }
  console.log(`== ${label} (${((Date.now() - t0) / 60000).toFixed(1)} min)\n${out.split('\n').filter((l) => /ok in|EXIT|TIMEOUT|FAIL|below|meets/.test(l)).join('\n')}`);
}
