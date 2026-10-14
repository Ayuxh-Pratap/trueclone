// One command for all scores, with a time limit per step and a summary at the end.
//   --quick   layout (all viewports) + live states (desktop) + interactions: the fast loop while building
//   (full)    layout + states (all) + motion curves (desktop/tablet/mobile) + interactions + hovers + detail
//   --url <clone url>  score another build (e.g. the Next.js app); --refresh-ref re-measures the reference
// A step that runs past its limit is killed and reported as TIMEOUT; the rest still run.
// Steps run in three parallel groups (layout+states, the three curve viewports, interact+hovers+detail): each
// tool mostly waits on smooth scroll and settling, so running them side by side costs little. --serial runs
// one at a time (for debugging a flaky score).
//
// A check whose inputs are unchanged since its last run is reported from its last result instead of re-measured
// (--fresh re-measures). --only detail,load runs those checks alone; --viewport tablet narrows every check to one width.
//
// usage: node scripts/score.mjs <name> [--quick] [--only <checks>] [--viewport <vp>] [--fresh] [--url <clone url>] [--refresh-ref] [--step-minutes 20] [--serial]
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs, COMPARE, siteDir } from './lib.mjs';

// steps are the sibling scripts of this file, wherever the package is installed; sites/ is in the current folder
const HERE = path.dirname(fileURLToPath(import.meta.url));

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: npm run score -- <name> [--quick] [--url <clone url>] [--refresh-ref] [--serial]');
  process.exit(1);
}
const url = typeof flags.url === 'string' ? flags.url : null;
const refresh = flags['refresh-ref'] ? ['--refresh-ref'] : [];
const limitMs = Number(flags['step-minutes'] || 20) * 60 * 1000;
const withUrl = (args) => (url ? [...args, '--url', url] : args);

// --viewport desktop narrows every check that can run per width; --only detail,load runs those checks alone
const vpOnly = typeof flags.viewport === 'string' ? flags.viewport : null;
const vpList = vpOnly ? [vpOnly] : ['desktop', 'tablet', 'mobile'];
const only = typeof flags.only === 'string' ? flags.only.split(',').map((s) => s.trim()).filter(Boolean) : null;
const allSteps = [
  // first and alone: has the live page changed since the capture? (the live-measured checks are then marked stale)
  ...(flags.quick ? [] : [{ group: 0, label: 'drift', args: ['scripts/drift.mjs', name, ...(vpOnly ? ['--viewport', vpOnly] : [])], pick: /(\w+): live (\d+)px/g, unit: 'live px', live: true }]),
  { group: 1, label: 'layout', args: withUrl(['scripts/diff.mjs', name, '--structure']), pick: /│ \d+\s+│ '(\w+)'\s+│ ([\d.]+)/g, unit: 'layout %' },
  { group: 1, label: 'states', args: ['scripts/states.mjs', name, '--clone', ...(url ? [url] : []), '--structure', ...(flags.quick || vpOnly ? ['--viewports', vpOnly || 'desktop'] : [])], pick: /│ \d+\s+│ '(\w+)'\s+│ ([\d.]+)/g, unit: 'states %' },
  ...(flags.quick ? [] : vpList.map((v) => ({ group: 2, label: `curves ${v}`, args: withUrl(['scripts/curves.mjs', name, '--viewport', v, ...refresh]), pick: /motion score \((\w+)\): ([\d.]+)%/g, unit: 'motion %' }))),
  { group: 3, label: 'interact', args: withUrl(['scripts/interact.mjs', name, ...refresh]), pick: /│ \d+\s+│ '([^']+)'\s+│ ([\d.]+)/g, unit: 'interaction %', fail: /FAIL/g },
  ...(flags.quick ? [] : [
    { group: 3, label: 'hovers', args: withUrl(['scripts/hovers.mjs', name, ...refresh]), pick: /hover match \((\w+)\): ([\d.]+)%/g, unit: 'hover %' },
    { group: 3, label: 'detail', args: withUrl(['scripts/detail.mjs', name, '--viewport', vpOnly || 'all', ...refresh]), pick: /(\w+): detail match ([\d.]+)%/g, unit: 'detail %' },
    // alone, last: the load sequence is a timing measurement, and the other checks must not be starved by it either
    { group: 4, label: 'load', args: withUrl(['scripts/load.mjs', name, ...(vpOnly ? ['--viewport', vpOnly] : []), ...refresh]), pick: /(\w+): load match ([\d.]+)%/g, unit: 'load %' },
  ]),
];
const steps = only ? allSteps.filter((st) => only.some((o) => st.label === o || st.label.startsWith(`${o} `))) : allSteps;
if (!steps.length) {
  console.error(`--only matched no check; checks: ${[...new Set(allSteps.map((st) => st.label.split(' ')[0]))].join(', ')}`);
  process.exit(1);
}

// Incremental: a check whose inputs have not changed since its last run (the clone's files, the capture, the
// options) is not re-measured; its last result is reported again. --fresh re-measures everything. Scoring another
// build (--url) is always measured, since its files are not the clone's.
const root = siteDir(name);
const metaJson = await fs.readFile(path.join(root, 'reference', 'meta.json'), 'utf8').then(JSON.parse).catch(() => ({}));
const capturedAt = metaJson.capturedAt || null;
// every step asks the live page in the capture's language and region (lib.mjs LOCALE)
const stepEnv = { ...process.env, ...(metaJson.locale ? { TC_LOCALE: metaJson.locale } : {}) };
async function cloneHash() {
  const h = crypto.createHash('sha1');
  const walk = async (dir) => {
    for (const e of (await fs.readdir(dir, { withFileTypes: true }).catch(() => [])).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') await walk(p); continue; }
      const st = await fs.stat(p);
      h.update(`${path.relative(root, p)}:${st.size}:${Math.round(st.mtimeMs)}\n`);
    }
  };
  await walk(path.join(root, 'clone'));
  for (const f of ['interactions.json', 'motion-map.json']) h.update(`${f}:${await fs.readFile(path.join(root, f), 'utf8').catch(() => '')}\n`);
  // reference measurements other steps produce (live scroll states, reveals, motion, cached probe reads) are inputs too
  for (const e of (await fs.readdir(path.join(root, 'reference'), { withFileTypes: true }).catch(() => [])).sort((a, b) => a.name.localeCompare(b.name))) {
    if (['assets', 'mirror', 'load', 'tiles'].includes(e.name)) continue;
    const p = path.join(root, 'reference', e.name);
    if (e.isDirectory()) await walk(p); else { const st = await fs.stat(p); h.update(`reference/${e.name}:${st.size}:${Math.round(st.mtimeMs)}\n`); }
  }
  return h.digest('hex');
}
const stampsFile = path.join(root, COMPARE, '.stamps.json');
const stamps = url ? {} : await fs.readFile(stampsFile, 'utf8').then(JSON.parse).catch(() => ({}));
const inputs = url ? null : { hash: await cloneHash(), capturedAt, args: null };
// the step's own code is an input too: a changed check must re-measure, never report its old number
const codeHash = async (file) => crypto.createHash('sha1').update(await fs.readFile(path.join(HERE, path.basename(file)), 'utf8').catch(() => '')).update(await fs.readFile(path.join(HERE, 'lib.mjs'), 'utf8').catch(() => '')).digest('hex').slice(0, 12);
const codeHashes = Object.fromEntries(await Promise.all(steps.map(async (st) => [st.label, await codeHash(st.args[0])])));
const stampKey = (step) => JSON.stringify({ hash: inputs?.hash, capturedAt, args: step.args, code: codeHashes[step.label] });
const reusable = (step) => !step.live && !url && !flags.fresh && !flags['refresh-ref'] && stamps[step.label]?.key === stampKey(step) && stamps[step.label].values !== undefined;

const runStep = (step) => new Promise((resolve) => {
  const started = Date.now();
  const [file, ...args] = step.args;
  const child = spawn(process.execPath, [path.join(HERE, path.basename(file)), ...args], { cwd: process.cwd(), env: stepEnv });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  const timer = setTimeout(() => {
    out += '\nTIMEOUT';
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    else child.kill('SIGKILL');
  }, limitMs);
  child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, ms: Date.now() - started }); });
});

const summary = [];
const t0 = Date.now();
const finish = (step, { code, out, ms }) => {
  const values = [...out.matchAll(step.pick)].map((m) => `${m[1]} ${m[2]}`);
  const fails = step.fail ? (out.match(step.fail) || []).length : 0;
  const timedOut = out.includes('\nTIMEOUT');
  const errors = (out.match(/PAGE ERROR[^\n]*/g) || []).slice(0, 2);
  const warnings = (out.match(/WARNING[^\n]*/g) || []).slice(0, 2);
  const status = timedOut ? 'TIMEOUT' : code !== 0 ? `EXIT ${code}` : fails ? `${fails} FAIL` : 'ok';
  console.log(`  ${step.label.padEnd(16)} ${status} in ${(ms / 1000).toFixed(0)}s   ${values.join('  ')}`);
  if (code !== 0 && !timedOut) console.log(out.split('\n').filter(Boolean).slice(-4).map((l) => `    ${l}`).join('\n'));
  [...errors, ...warnings].forEach((l) => console.log(`    ${l}`));
  summary.push({ step: step.label, status, seconds: Math.round(ms / 1000), [step.unit]: values.join('  ') || '-' });
  if (!url && (status === 'ok' || status.endsWith('FAIL'))) stamps[step.label] = { key: stampKey(step), status, values: values.join('  '), seconds: Math.round(ms / 1000), at: new Date().toISOString() };
};
const groups = flags.serial
  ? steps.map((st) => [st])
  : [...new Set(steps.map((st) => st.group))].map((g) => steps.filter((st) => st.group === g));
for (const group of groups) {
  const todo = group.filter((st) => !reusable(st));
  for (const st of group.filter(reusable)) {
    const s = stamps[st.label];
    console.log(`  ${st.label.padEnd(16)} ${s.status} (unchanged since ${s.at.slice(0, 16).replace('T', ' ')}, not re-measured; --fresh to re-run)   ${s.values}`);
    summary.push({ step: st.label, status: `${s.status} (kept)`, seconds: 0, [st.unit]: s.values || '-' });
  }
  if (!todo.length) continue;
  console.log(`running: ${todo.map((st) => st.label).join(', ')}`);
  await Promise.all(todo.map(async (step) => finish(step, await runStep(step))));
}
summary.sort((x, y) => steps.findIndex((st) => st.label === x.step) - steps.findIndex((st) => st.label === y.step));
const totalMin = +((Date.now() - t0) / 60000).toFixed(1);
console.log(`\n${flags.quick ? 'quick' : 'full'} score for ${name}${url ? ` (${url})` : ''} in ${totalMin} min`);
console.table(summary.map((s) => ({ step: s.step, status: s.status, 's': s.seconds, result: Object.entries(s).find(([k]) => k.endsWith('%') || k.endsWith('px'))?.[1] })));
await fs.mkdir(path.join(root, COMPARE), { recursive: true });
if (!url) await fs.writeFile(stampsFile, JSON.stringify(stamps, null, 2));
// where the time went, for REPORT.md and for choosing what to re-run
await fs.writeFile(path.join(root, COMPARE, 'score-times.json'), JSON.stringify({ at: new Date().toISOString(), kind: flags.quick ? 'quick' : 'full', only, viewport: vpOnly, url, totalMin, steps: Object.fromEntries(summary.map((s) => [s.step, { status: s.status, seconds: s.seconds }])) }, null, 2));
// REPORT.md: every score against its target, what to fix first, and what was not copied
const report = await runStep({ args: ['report.mjs', name] });
console.log(report.out.trim());
