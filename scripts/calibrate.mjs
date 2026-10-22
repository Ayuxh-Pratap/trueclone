// Calibrate: how far the reference is from itself, measured the way the clone is measured (docs/plan-rc5/PLAN.md R6,
// research/metrics.md §4). The live reference is loaded again DRAWS times (2 by default: with the capture, N = 3) and
// put through the same checks as a clone (diff, states, the journey in app mode), each draw into its own folder,
// reference/calib/<k>/. From the draws against the capture, reference/noise.json holds, per check, route, viewport and
// frame (the exact key: a desktop number is never read for mobile):
//   self    the lowest the reference scored against its own capture
//   spread  the highest minus the lowest
// verdict.mjs sets each bar at min(target, self - max(1, spread)), never below the check's hard floor: a frame below
// it is one the reference itself varies on, judged by its envelope (the nearest draw and the colour-presence range,
// measure.mjs) and by behaviour, never passed by being declared noisy.
// noise.json carries the capture's id: a new capture makes it invalid, and status asks for calibrate again.
//
// usage: node scripts/calibrate.mjs <name> [--draws 2]
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, siteDir } from './lib.mjs';
import { refIdOf, codeHash } from './identity.mjs';
import { readCheck } from './results.mjs';
import { HARD_FLOOR } from './verdict.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) { console.error('usage: trueclone calibrate <name> [--draws 2]'); process.exit(1); }
const root = siteDir(name);
const meta = JSON.parse(await fs.readFile(path.join(root, 'reference', 'meta.json'), 'utf8'));
const DRAWS = Math.max(2, Number(flags.draws || 2));
const here = path.dirname(fileURLToPath(import.meta.url));
const refUrl = meta.finalUrl || meta.url;
const app = Boolean(meta.canvasApp);

const run = (args, compare) => new Promise((resolve) => {
  const c = spawn(process.execPath, [path.join(here, args[0]), ...args.slice(1)], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, TC_COMPARE: compare, TC_CALIBRATE: '1' } });
  let out = '';
  c.stdout.on('data', (d) => { out += d; });
  c.stderr.on('data', (d) => { out += d; });
  c.on('close', (code) => resolve({ code, out }));
});

const checks = app
  ? [['journey', ['journey.mjs', name, '--clone', '--url', refUrl]]]
  : [
    ['layout', ['diff.mjs', name, '--structure', '--url', refUrl]],
    ...(meta.mode === 'exact' ? [['layout-real', ['diff.mjs', name, '--url', refUrl]]] : []),
    ['scroll', ['states.mjs', name, '--clone', refUrl, '--structure']],
  ];

const drawDirs = [];
for (let k = 1; k <= DRAWS; k++) {
  const compare = path.join('reference', 'calib', String(k)).split(path.sep).join('/');
  await fs.rm(path.join(root, compare), { recursive: true, force: true });
  drawDirs.push(compare);
  for (const [check, args] of checks) {
    const t0 = Date.now();
    const r = await run(args, compare);
    console.log(`draw ${k} ${check}: ${r.code === 0 ? 'done' : `failed (exit ${r.code})`} in ${Math.round((Date.now() - t0) / 1000)}s`);
    if (r.code !== 0) console.log(r.out.split('\n').filter((l) => /WARNING|Error|error/.test(l)).slice(0, 5).join('\n'));
  }
}

// each draw's units against the capture: per unit and per member, the values across the draws
const entries = {};
const add = (key, v) => { if (typeof v !== 'number') return; (entries[key] ||= { values: [] }).values.push(v); };
const measured = app ? ['journey'] : ['layout', ...(meta.mode === 'exact' ? ['layout-real'] : []), 'scroll', 'canvas'];
for (const compare of drawDirs) {
  for (const check of measured) {
    const file = await readCheck(root, compare, check);
    for (const [key, u] of Object.entries(file?.units || {})) {
      const [route, viewport] = key.split('|');
      add(`${check}|${route}|${viewport}|`, u.value);
      for (const m of u.members || []) add(`${check}|${route}|${viewport}|${m.id}`, m.value);
    }
  }
}
for (const e of Object.values(entries)) {
  e.self = Math.min(...e.values);
  e.spread = +(Math.max(...e.values) - e.self).toFixed(2);
  e.draws = e.values.length + 1; // with the capture
}
const noise = { refId: refIdOf(meta), at: new Date().toISOString(), draws: DRAWS, drawDirs, codeHash: Object.fromEntries(measured.map((c) => [c, codeHash(c)])), entries };
await fs.writeFile(path.join(root, 'reference', 'noise.json'), JSON.stringify(noise, null, 1));
const unstable = Object.entries(entries).filter(([k, e]) => { const c = k.split('|')[0]; return e.self < (HARD_FLOOR[c] ?? 0); });
console.log(`noise.json: ${Object.keys(entries).length} keys over ${DRAWS} draws (+ the capture); ${unstable.length} the reference varies on beyond its hard floor${unstable.length ? `: ${unstable.slice(0, 8).map(([k, e]) => `${k} (${e.self})`).join(', ')}${unstable.length > 8 ? '…' : ''}` : ''}`);
if (!Object.keys(entries).length) { console.error('no draw produced a result: the live reference did not load (check the network), nothing calibrated'); process.exit(1); }
