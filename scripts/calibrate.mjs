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
// Durable (rc.7; RC6 varsity: 98 minutes of sound measurements, then exit 1 with the error lost, and a rerun would have
// deleted the finished draws). Each finished check of each draw is recorded in reference/calib/progress.json and kept:
// a calibration that stops (killed, a crash, a check that fails) resumes where it stopped, for the same capture and
// the same check code. Every check's whole output is in reference/calib/log.txt. A check that fails leaves no
// noise.json (a calibration from fewer draws than asked is not written as if it were complete): the failure is
// recorded in reference/calib/failed.json, which status reads (one resume, then Blocked with this error and log).
// Progress and the time left are printed after each check.
//
// usage: node scripts/calibrate.mjs <name> [--draws 2] [--fresh]
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, siteDir } from './lib.mjs';
import { refIdOf, codeHash, writeAtomic } from './identity.mjs';
import { readCheck } from './results.mjs';
import { HARD_FLOOR } from './verdict.mjs';
import { failureLine } from './failures.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) { console.error('usage: trueclone calibrate <name> [--draws 2] [--fresh]'); process.exit(1); }
const root = siteDir(name);
const meta = JSON.parse(await fs.readFile(path.join(root, 'reference', 'meta.json'), 'utf8'));
const DRAWS = Math.max(2, Number(flags.draws || 2));
const here = path.dirname(fileURLToPath(import.meta.url));
const refUrl = meta.finalUrl || meta.url;
const app = Boolean(meta.canvasApp);
const calibDir = path.join(root, 'reference', 'calib');
const logFile = path.join(calibDir, 'log.txt');
const progressFile = path.join(calibDir, 'progress.json');
const failedFile = path.join(calibDir, 'failed.json');
const readJson = (f) => fs.readFile(f, 'utf8').then(JSON.parse, () => null);
const log = async (line) => { await fs.appendFile(logFile, `${line}\n`).catch(() => {}); };
const say = async (line) => { console.log(line); await log(`${new Date().toISOString()} ${line}`); };

const run = (args, compare) => new Promise((resolve) => {
  const c = spawn(process.execPath, [path.join(here, args[0]), ...args.slice(1)], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, TC_COMPARE: compare, TC_CALIBRATE: '1' } });
  let out = '';
  c.stdout.on('data', (d) => { out += d; });
  c.stderr.on('data', (d) => { out += d; });
  c.on('error', (e) => resolve({ code: -1, out: `${out}\n${e?.stack || e}` }));
  c.on('close', (code) => resolve({ code, out }));
});

const checks = app
  ? [['journey', ['journey.mjs', name, '--clone', '--url', refUrl]]]
  : [
    ['layout', ['diff.mjs', name, '--structure', '--url', refUrl]],
    ...(meta.mode === 'exact' ? [['layout-real', ['diff.mjs', name, '--url', refUrl]]] : []),
    ['scroll', ['states.mjs', name, '--clone', refUrl, '--structure']],
  ];
const refId = refIdOf(meta);
const codes = Object.fromEntries(checks.map(([c]) => [c, codeHash(c)]));
// the reads the calibration replays (status compares their content, not their file times: RC6-26)
const readsFile = app ? 'reference/journey/journey.json' : 'reference/states/desktop.json';
const readsSha = await fs.readFile(path.join(root, readsFile)).then((b) => crypto.createHash('sha1').update(b).digest('hex').slice(0, 16), () => null);

async function main() {
  await fs.mkdir(calibDir, { recursive: true });
  // what is kept from an earlier, unfinished calibration: only for this capture, these reads and this check code
  let progress = flags.fresh ? null : await readJson(progressFile);
  const same = progress && progress.refId === refId && progress.reads === readsSha && progress.draws === DRAWS && checks.every(([c]) => progress.codes?.[c] === codes[c]);
  if (!same) {
    for (const e of await fs.readdir(calibDir).catch(() => [])) if (/^\d+$/.test(e)) await fs.rm(path.join(calibDir, e), { recursive: true, force: true });
    progress = { refId, reads: readsSha, draws: DRAWS, codes, done: [], seconds: {} };
    await fs.rm(logFile, { force: true });
  }
  const save = () => writeAtomic(progressFile, JSON.stringify(progress, null, 1));
  await save();
  const todo = [];
  for (let k = 1; k <= DRAWS; k++) for (const [check, args] of checks) todo.push({ k, check, args });
  const left = todo.filter((t) => !progress.done.includes(`${t.k}:${t.check}`));
  await say(`calibrate ${name}: ${todo.length} checks over ${DRAWS} draws${left.length < todo.length ? `; ${todo.length - left.length} already done (kept from the last run), ${left.length} left` : ''}`);
  const failures = [];
  for (const t of left) {
    const compare = path.join('reference', 'calib', String(t.k)).split(path.sep).join('/');
    const t0 = Date.now();
    const r = await run(t.args, compare);
    const s = Math.round((Date.now() - t0) / 1000);
    await log(`\n# draw ${t.k} ${t.check}: exit ${r.code} in ${s}s\n${r.out}`);
    if (r.code === 0) {
      progress.done.push(`${t.k}:${t.check}`);
      (progress.seconds[t.check] ||= []).push(s);
      await save();
    } else failures.push({ ...t, code: r.code, line: failureLine(r.out) });
    // what is left, at the times the checks took so far
    const rest = todo.filter((x) => !progress.done.includes(`${x.k}:${x.check}`) && !failures.some((f) => f.k === x.k && f.check === x.check));
    const avg = (c) => { const v = progress.seconds[c] || []; return v.length ? v.reduce((a, b) => a + b, 0) / v.length : s; };
    const eta = Math.round(rest.reduce((n, x) => n + avg(x.check), 0) / 60);
    await say(`draw ${t.k} ${t.check}: ${r.code === 0 ? 'done' : `FAILED (exit ${r.code}): ${failures.at(-1).line}`} in ${s}s; ${progress.done.length} of ${todo.length} done${rest.length ? `, about ${eta} min left` : ''}`);
  }
  if (failures.length) {
    const prev = await readJson(failedFile);
    const count = prev?.refId === refId ? (prev.count || 1) + 1 : 1;
    const error = `${failures.length} check(s) failed: ${failures.map((f) => `draw ${f.k} ${f.check} (exit ${f.code}): ${f.line}`).join('; ')}`.slice(0, 600);
    await writeAtomic(failedFile, JSON.stringify({ refId, at: new Date().toISOString(), count, error, log: 'reference/calib/log.txt', failures }, null, 1));
    await say(`calibrate: ${error}. The ${progress.done.length} finished check(s) are kept; run calibrate again to resume (whole output: reference/calib/log.txt). noise.json is not written from an incomplete calibration.`);
    process.exit(1);
  }

  // each draw's units against the capture: per unit and per member, the values across the draws
  const entries = {};
  const add = (key, v) => { if (typeof v !== 'number') return; (entries[key] ||= { values: [] }).values.push(v); };
  const measured = app ? ['journey'] : ['layout', ...(meta.mode === 'exact' ? ['layout-real'] : []), 'scroll', 'canvas'];
  const drawDirs = Array.from({ length: DRAWS }, (_, i) => path.join('reference', 'calib', String(i + 1)).split(path.sep).join('/'));
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
  if (!Object.keys(entries).length) {
    const error = 'no draw produced a result: the live reference did not load (check the network), nothing calibrated';
    const prev = await readJson(failedFile);
    await writeAtomic(failedFile, JSON.stringify({ refId, at: new Date().toISOString(), count: prev?.refId === refId ? (prev.count || 1) + 1 : 1, error, log: 'reference/calib/log.txt' }, null, 1));
    console.error(error);
    process.exit(1);
  }
  const noise = { refId, at: new Date().toISOString(), draws: DRAWS, drawDirs, reads: { file: readsFile, sha1: readsSha }, codeHash: Object.fromEntries(measured.map((c) => [c, codeHash(c)])), seconds: progress.seconds, entries };
  await writeAtomic(path.join(root, 'reference', 'noise.json'), JSON.stringify(noise, null, 1));
  await fs.rm(failedFile, { force: true });
  const unstable = Object.entries(entries).filter(([k, e]) => { const c = k.split('|')[0]; return e.self < (HARD_FLOOR[c] ?? 0); });
  await say(`noise.json: ${Object.keys(entries).length} keys over ${DRAWS} draws (+ the capture); ${unstable.length} the reference varies on beyond its hard floor${unstable.length ? `: ${unstable.slice(0, 8).map(([k, e]) => `${k} (${e.self})`).join(', ')}${unstable.length > 8 ? '…' : ''}` : ''}`);
}

// any failure of calibrate itself is recorded with its stack (and status resumes it once, then reports it), never lost
try { await main(); } catch (e) {
  const prev = await readJson(failedFile);
  const error = `calibrate itself failed: ${String(e?.message || e).split('\n')[0]}`;
  await log(`\n# ${new Date().toISOString()} ${e?.stack || e}`);
  await writeAtomic(failedFile, JSON.stringify({ refId, at: new Date().toISOString(), count: prev?.refId === refId ? (prev.count || 1) + 1 : 1, error, stack: String(e?.stack || e), log: 'reference/calib/log.txt' }, null, 1)).catch(() => {});
  console.error(`${error}\n${e?.stack || ''}`);
  process.exit(1);
}
