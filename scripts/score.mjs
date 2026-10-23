// One command for all scores, with a time limit per step and a summary at the end.
//   (full)    every check the site requires (verdict.mjs requiredUnits), at every size
//   --only detail,load   those checks alone;  --viewport tablet   narrowed to one width where the check can be
//   --url <app url>      score another build (the Next.js app: next --verify sets TC_COMPARE=compare-next)
//   --fresh              re-measure even what is already current;  --refresh-ref re-measures the reference too
// A step that runs past its limit is killed and reported as TIMEOUT; the rest still run. Steps run in parallel groups
// (layout + states, the curve viewports, interact + hovers + detail; load alone, last: it is timed). A step's limit
// grows with the units it measures (RC6 heybhaskar: behaviour over 8 routes needs ~22 min on a first run and was
// killed at a fixed 20), never under 20 minutes; --step-minutes sets one limit for every step instead. Each step's whole output is kept in sites/<name>/logs/, and a
// failed step's error units carry its first error line, how it failed (timeout, crash) and that log (RC6: "states exit
// 1: Node.js v24.19.0" was all that was left of a stack). If REPORT.md cannot be written, score fails too.
//
// What is current is decided by identity (identity.mjs, results.mjs): a step is skipped only when every unit it owns is
// already measured on the clone (or app) as it is now, against this capture, with this configuration and this code.
// Nothing is reused by file times. A step that fails or times out leaves error units for what it did not measure, and
// this command exits non-zero, so a failed measurement is never read as a pass. A modified instrument (code preloaded
// with NODE_OPTIONS, an edited package) is refused before anything is measured.
//
// usage: node scripts/score.mjs <name> [--only <checks>] [--viewport <vp>] [--fresh] [--url <url>] [--refresh-ref] [--step-minutes 20] [--serial]
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, COMPARE, siteDir, releaseTimingLockOf } from './lib.mjs';
import { envIdentity, startIdentity } from './identity.mjs';
import { evaluate } from './verdict.mjs';
import { writeErrors } from './results.mjs';
import { failureLine } from './failures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: trueclone score <name> [--only <checks>] [--viewport <vp>] [--fresh] [--url <url>]');
  process.exit(1);
}
const env = envIdentity();
if (env.instrumentModified) {
  console.error(`trueclone score: the instrument is modified in this environment, so nothing it measured could be trusted:\n  ${env.reasons.join('\n  ')}\nRemove the modification (unset NODE_OPTIONS, reinstall the package) and score again.`);
  process.exit(2);
}
const root = siteDir(name);
const url = typeof flags.url === 'string' ? flags.url : null;
const side = COMPARE === 'compare-next' ? 'app' : 'clone';
const refresh = flags['refresh-ref'] ? ['--refresh-ref'] : [];
const minLimitMs = Number(flags['step-minutes'] || 20) * 60 * 1000;
// seconds per unit on a first run (nothing cached), from the RC6 runs' step times; a step's limit is 2.5x its estimate
const PER_UNIT_S = { layout: 40, 'layout-real': 40, reduced: 40, scroll: 90, canvas: 0, behaviour: 100, load: 60, detail: 45, hovers: 300, curves: 150, interact: 40, journey: 900 };
const withUrl = (args) => (url ? [...args, '--url', url] : args);
const vpOnly = typeof flags.viewport === 'string' ? flags.viewport : null;
const vpArg = vpOnly ? ['--viewport', vpOnly] : [];
const only = typeof flags.only === 'string' ? flags.only.split(',').map((s) => s.trim()).filter(Boolean) : null;
const meta = JSON.parse(await fs.readFile(path.join(root, 'reference', 'meta.json'), 'utf8').catch(() => 'null'));
if (!meta) { console.error(`no capture for ${name}: trueclone capture <url> ${name}`); process.exit(1); }
const appMode = Boolean(meta.canvasApp);
const curveVps = vpOnly ? [vpOnly] : ['desktop', 'tablet', 'mobile'];

// each step owns the units of one check (`check`); `label` is what --only names
const appSteps = [
  { group: 1, label: 'journey', check: 'journey', args: ['journey.mjs', name, '--clone', ...(url ? ['--url', url] : [])], pick: /journey \((\w+)\): ([\d.]+)%/g },
  { group: 3, label: 'interact', check: 'interact', args: withUrl(['interact.mjs', name, ...refresh]), pick: /│ \d+\s+│ '([^']+)'\s+│ ([\d.]+)/g },
  { group: 4, label: 'load', check: 'load', args: withUrl(['load.mjs', name, ...vpArg, ...refresh]), pick: /(\w+): load match ([\d.]+)%/g },
];
const docSteps = [
  // first and alone: has the live page changed since the capture? (status then asks for a re-capture)
  { group: 0, label: 'drift', check: null, args: ['drift.mjs', name, ...vpArg], pick: /(\w+): live (\d+)px/g, always: true },
  { group: 1, label: 'layout', check: 'layout', args: withUrl(['diff.mjs', name, '--structure', ...vpArg]), pick: /│ \d+\s+│ '(\w+)'\s+│ ([\d.]+)/g },
  ...(meta.mode === 'exact' ? [{ group: 1, label: 'layout-real', check: 'layout-real', args: withUrl(['diff.mjs', name, ...vpArg]), pick: /│ \d+\s+│ '(\w+)'\s+│ ([\d.]+)/g }] : []),
  // the reduced-motion page, its own check (decision D2)
  { group: 1, label: 'reduced', check: 'reduced', args: withUrl(['diff.mjs', name, '--reduce', ...vpArg]), pick: /│ \d+\s+│ '(\w+)'\s+│ ([\d.]+)/g },
  { group: 1, label: 'states', check: 'scroll', args: ['states.mjs', name, '--clone', ...(url ? [url] : []), '--structure', ...(vpOnly ? ['--viewports', vpOnly] : [])], pick: /│ \d+\s+│ '(\w+)'\s+│ ([\d.]+)/g },
  ...curveVps.map((v) => ({ group: 2, label: `curves ${v}`, check: 'curves', vp: v, args: withUrl(['curves.mjs', name, '--viewport', v, ...refresh]), pick: /motion score \((\w+)\): ([\d.]+)%/g })),
  { group: 3, label: 'interact', check: 'interact', args: withUrl(['interact.mjs', name, ...refresh]), pick: /│ \d+\s+│ '([^']+)'\s+│ ([\d.]+)/g },
  { group: 3, label: 'hovers', check: 'hovers', args: withUrl(['hovers.mjs', name, ...refresh]), pick: /hover match \((\w+)\): ([\d.]+)%/g },
  { group: 3, label: 'detail', check: 'detail', args: withUrl(['detail.mjs', name, '--viewport', vpOnly || 'all', ...refresh]), pick: /(\w+): detail match ([\d.]+)%/g },
  // alone, last: the load sequence and what changes by itself (behaviour) are timing measurements
  { group: 4, label: 'load', check: 'load', args: withUrl(['load.mjs', name, ...vpArg, ...refresh]), pick: /(\w+): load match ([\d.]+)%/g },
  // behaviour keeps the units it already measured on this clone (a rerun after a kill does only what is left): --fresh
  // passes on, so a fresh score measures everything again
  { group: 5, label: 'behaviour', check: 'behaviour', args: withUrl(['behaviour.mjs', name, ...vpArg, ...refresh, ...(flags.fresh ? ['--fresh'] : [])]), pick: /(\w+): behaviour ([\d.]+)/g },
];
const allSteps = appMode ? appSteps : docSteps;
const wantsCheck = (st) => !only || only.some((o) => st.label === o || st.label.startsWith(`${o} `) || st.check === o || (o === 'states' && st.check === 'scroll') || (o === 'curves' && st.check === 'curves') || (o === 'canvas' && st.check === 'scroll'));
const steps = allSteps.filter(wantsCheck);
if (!steps.length) {
  console.error(`--only matched no check; checks: ${[...new Set(allSteps.map((st) => st.label.split(' ')[0]))].join(', ')}`);
  process.exit(1);
}

// what is already current (verdict.mjs): a step whose units are all measured on what is there now is not run again
const before = await evaluate(root, { side });
const unitsOf = (st) => before.units.filter((u) => !u.plan && (u.check === st.check || (st.check === 'scroll' && u.check === 'canvas')) && (!vpOnly || !u.viewport || u.viewport === vpOnly) && (!st.vp || u.viewport === st.vp));
const CURRENT = new Set(['pass', 'fail', 'accepted', 'na', 'tool']);
const current = (st) => {
  if (flags.fresh || flags['refresh-ref'] || st.always || url) return false;
  const us = unitsOf(st);
  if (st.check === 'interact') { const plan = before.units.find((u) => u.check === 'interact' && u.plan); if (!plan || plan.status !== 'pass') return false; }
  return us.length > 0 && us.every((u) => CURRENT.has(u.status));
};

// a step's time limit: 2.5x the estimate for the units it measures, never under 20 minutes; --step-minutes sets it
const limitOf = (step) => {
  if (flags['step-minutes']) return minLimitMs;
  const units = before.units.filter((u) => (u.check === step.check || (step.check === 'scroll' && u.check === 'canvas')) && (!vpOnly || !u.viewport || u.viewport === vpOnly) && (!step.vp || u.viewport === step.vp));
  const est = units.reduce((s, u) => s + (PER_UNIT_S[u.check] ?? 60), 0);
  return Math.max(minLimitMs, Math.round(est * 2.5) * 1000);
};
const logsDir = path.join(root, 'logs');
const stampOf = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const runStep = (step, limitMs = minLimitMs) => new Promise((resolve) => {
  const started = Date.now();
  const [file, ...args] = step.args;
  const child = spawn(process.execPath, [path.join(HERE, file), ...args], { cwd: process.cwd(), env: { ...process.env, ...(meta.locale ? { TC_LOCALE: meta.locale } : {}) } });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    out += `\nTIMEOUT after ${Math.round(limitMs / 60000)} min (the step's limit for the units it measures)`;
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    else child.kill('SIGKILL');
  }, limitMs);
  child.on('close', async (code) => {
    clearTimeout(timer);
    // a killed step never ran its `finally`: the machine's timing lock it held is released here (RC6 heybhaskar)
    if (timedOut) await releaseTimingLockOf(child.pid).catch(() => {});
    resolve({ code, out, ms: Date.now() - started, timedOut, limitMs });
  });
});

const summary = [];
let failed = 0;
const t0 = Date.now();
const finish = async (step, { code, out, ms, timedOut, limitMs }) => {
  const values = [...out.matchAll(step.pick)].map((m) => `${m[1]} ${m[2]}`);
  const waits = [...out.matchAll(/waited (\d+)s for another trueclone measurement/g)].reduce((n, m) => n + Number(m[1]), 0);
  const status = timedOut ? 'TIMEOUT' : code !== 0 ? `EXIT ${code}` : 'ok';
  console.log(`  ${step.label.padEnd(16)} ${status} in ${(ms / 1000).toFixed(0)}s${waits ? ` (${waits}s waiting for the machine's timing lock)` : ''}   ${values.join('  ')}`);
  for (const l of (out.match(/(PAGE ERROR|WARNING)[^\n]*/g) || []).slice(0, 3)) console.log(`    ${l}`);
  let logRel = null;
  if (status !== 'ok') {
    failed++;
    // the step's whole output, kept: the error units point at it
    logRel = `logs/score-${stampOf(t0)}-${step.label.replace(/\s+/g, '-')}.log`;
    await fs.mkdir(logsDir, { recursive: true });
    await fs.writeFile(path.join(root, logRel), `# trueclone score ${name}: ${step.args.join(' ')}\n# ${status} after ${Math.round(ms / 1000)}s (limit ${Math.round(limitMs / 60000)} min)\n${out}`).catch(() => { logRel = null; });
    const why = failureLine(out);
    console.log(`    ${why}${logRel ? `\n    (whole output: sites/${name}/${logRel})` : ''}`);
    // what the step did not get to measure is recorded as an error for this clone (never left looking current)
    if (step.check) {
      try {
        const after = await evaluate(root, { side });
        // the interaction plan too: a crashed interact leaves it unmeasured, recorded as this error
        const owned = before.units.filter((u) => (unitsOf(step).some((x) => x.check === u.check && x.route === u.route && x.viewport === u.viewport && x.state === u.state)) || (u.plan && u.check === step.check));
        const left = after.units.filter((u) => owned.some((x) => x.check === u.check && x.route === u.route && x.viewport === u.viewport && x.state === u.state) && ['missing', 'stale', 'invalid'].includes(u.status));
        if (left.length) {
          const ident = await startIdentity(root, step.check, side);
          for (const check of new Set(left.map((u) => u.check))) await writeErrors(root, COMPARE, check, left.filter((u) => u.check === check).map((u) => ({ route: u.route, viewport: u.viewport, state: u.state })), ident, `${step.label} ${status.toLowerCase()}: ${why}`, { errorKind: timedOut ? 'timeout' : 'crash', errorLog: logRel });
        }
      } catch (e) {
        // recording the failure failed too: say so; the units stay missing (never current), and status re-measures them
        console.log(`    (could not record the failure as error units: ${String(e?.message || e).split('\n')[0]})`);
      }
    }
  }
  summary.push({ step: step.label, status, seconds: Math.round(ms / 1000), lockWaitSeconds: waits, limitMinutes: Math.round(limitMs / 60000), result: values.join('  ') || '-', ...(logRel ? { log: logRel } : {}) });
};
const groups = flags.serial ? steps.map((st) => [st]) : [...new Set(steps.map((st) => st.group))].map((g) => steps.filter((st) => st.group === g));
for (const group of groups) {
  const todo = group.filter((st) => !current(st));
  for (const st of group.filter(current)) {
    console.log(`  ${st.label.padEnd(16)} current (every unit measured on the ${side} as it is now; --fresh re-measures)`);
    summary.push({ step: st.label, status: 'current', seconds: 0, result: '-' });
  }
  if (!todo.length) continue;
  console.log(`running: ${todo.map((st) => `${st.label}${limitOf(st) > minLimitMs ? ` (limit ${Math.round(limitOf(st) / 60000)} min)` : ''}`).join(', ')}`);
  await Promise.all(todo.map(async (step) => finish(step, await runStep(step, limitOf(step)))));
}
summary.sort((x, y) => steps.findIndex((st) => st.label === x.step) - steps.findIndex((st) => st.label === y.step));
const totalMin = +((Date.now() - t0) / 60000).toFixed(1);
console.log(`\nscore for ${name}${url ? ` (${url})` : ''} in ${totalMin} min${failed ? `: ${failed} step(s) failed` : ''}`);
console.table(summary.map((s) => ({ step: s.step, status: s.status, s: s.seconds, result: s.result })));
await fs.mkdir(path.join(root, COMPARE), { recursive: true });
// where the time went (REPORT.md shows it): per step, with the time spent waiting for the machine's timing lock
const timesFile = path.join(root, COMPARE, 'score-times.json');
const history = JSON.parse(await fs.readFile(timesFile, 'utf8').catch(() => 'null'));
const entry = { at: new Date(t0).toISOString(), kind: only ? 'partial' : 'full', only, viewport: vpOnly, url, totalMin, steps: Object.fromEntries(summary.map((s) => [s.step, { status: s.status, seconds: s.seconds, lockWaitSeconds: s.lockWaitSeconds || 0, limitMinutes: s.limitMinutes, ...(s.log ? { log: s.log } : {}) }])) };
await fs.writeFile(timesFile, JSON.stringify({ ...entry, history: [...(history?.history || []), entry].slice(-200) }, null, 2));
// REPORT.md: the evaluation (verdict.mjs), rendered. A report that cannot be written fails this command (RC6
// allbirds: report.mjs crashed and score still exited 0, leaving no REPORT.md behind an apparently good score)
const report = await runStep({ args: ['report.mjs', name] });
console.log(report.out.trim());
if (report.code !== 0) console.log(`\nscore: REPORT could not be written (report exited ${report.code}): ${failureLine(report.out)}. The measurements above are saved; this is a defect in trueclone.`);
if (failed || report.code !== 0) process.exitCode = 1;
