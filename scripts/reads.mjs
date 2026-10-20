// Every read of the live reference a clone is built from, in one step, as fast as accuracy allows: the reads that only
// look (scroll states, the motion runtime, measured boxes, widget states) side by side, then the scroll reveals alone,
// because they time frames and must not share the machine. Only the reads missing (or older than the capture) run.
//
// usage: trueclone reads <name> [--all]
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, siteDir } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) { console.error('usage: trueclone reads <name> [--all]'); process.exit(1); }
const root = siteDir(name);
const meta = JSON.parse(await fs.readFile(path.join(root, 'reference', 'meta.json'), 'utf8').catch(() => 'null'));
if (!meta) { console.error(`no capture for ${name}: trueclone capture <url> ${name} first`); process.exit(1); }
const capturedAt = Date.parse(meta.capturedAt || 0) || 0;
const fresh = async (rel) => { const st = await fs.stat(path.join(root, rel)).catch(() => null); return Boolean(st && st.mtimeMs >= capturedAt - 1000); };
// a canvas app (app mode) is read along its journey: the motion runtime, then the reference's checkpoints (frames,
// the three.js scene, its shaders, and in an own-bundle capture what each stage loads); a document by its scroll
const READS = meta.canvasApp ? [
  { step: 'motion', out: 'reference/motion.desktop.json' },
  { step: 'journey', out: 'reference/journey/journey.json', alone: true, after: 'journey.json' },
] : [
  { step: 'states', out: 'reference/states/desktop.summary.json' },
  { step: 'motion', out: 'reference/motion.desktop.json' },
  { step: 'spec', out: 'reference/desktop.spec.json' },
  { step: 'widgets', out: 'reference/widgets.desktop.json' },
  { step: 'reveals', out: 'reference/reveals.desktop.json', alone: true },
];
if (meta.canvasApp && !(await fs.stat(path.join(root, 'journey.json')).catch(() => null))) { console.error(`a canvas app is read along its journey: trueclone journey ${name} --draft first`); process.exit(1); }
// a read older than what it reads (journey.json changed after the reference journey ran) is read again
const newerInput = async (r) => { if (!r.after) return false; const a = await fs.stat(path.join(root, r.after)).catch(() => null), b = await fs.stat(path.join(root, r.out)).catch(() => null); return Boolean(a && b && a.mtimeMs > b.mtimeMs + 1000); };
const todo = [];
for (const r of READS) if (flags.all || !(await fresh(r.out)) || (await newerInput(r))) todo.push(r);
if (!todo.length) { console.log('reads: all current (--all to read again)'); process.exit(0); }
const dir = path.dirname(fileURLToPath(import.meta.url));
const run = (r) => new Promise((resolve) => {
  const t0 = Date.now();
  const child = spawn(process.execPath, [path.join(dir, `${r.step}.mjs`), name], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  child.on('close', (code) => {
    const tail = out.trim().split('\n').slice(-3).join('\n    ');
    console.log(`  ${r.step.padEnd(8)} ${code === 0 ? 'ok' : `EXIT ${code}`} in ${Math.round((Date.now() - t0) / 1000)}s\n    ${tail}`);
    resolve(code);
  });
});
console.log(`reads: ${todo.map((r) => r.step).join(', ')}`);
const codes = await Promise.all(todo.filter((r) => !r.alone).map(run));
for (const r of todo.filter((x) => x.alone)) codes.push(await run(r));
process.exit(codes.some((c) => c !== 0) ? 1 : 0);
