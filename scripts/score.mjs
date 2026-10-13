// One command for all scores, with a time limit per step and a summary at the end.
//   --quick   layout (all viewports) + live states (desktop) + interactions: the fast loop while building
//   (full)    layout + states (all) + motion curves (desktop/tablet/mobile) + interactions + hovers + detail
//   --url <clone url>  score another build (e.g. the Next.js app); --refresh-ref re-measures the reference
// A step that runs past its limit is killed and reported as TIMEOUT; the rest still run.
// Steps run in three parallel groups (layout+states, the three curve viewports, interact+hovers+detail): each
// tool mostly waits on smooth scroll and settling, so running them side by side costs little. --serial runs
// one at a time (for debugging a flaky score).
//
// usage: node scripts/score.mjs <name> [--quick] [--url <clone url>] [--refresh-ref] [--step-minutes 20] [--serial]
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib.mjs';

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

const steps = [
  { group: 1, label: 'layout', args: withUrl(['scripts/diff.mjs', name, '--structure']), pick: /│ \d+\s+│ '(\w+)'\s+│ ([\d.]+)/g, unit: 'layout %' },
  { group: 1, label: 'states', args: ['scripts/states.mjs', name, '--clone', ...(url ? [url] : []), '--structure', ...(flags.quick ? ['--viewports', 'desktop'] : [])], pick: /│ \d+\s+│ '(\w+)'\s+│ ([\d.]+)/g, unit: 'states %' },
  ...(flags.quick ? [] : ['desktop', 'tablet', 'mobile'].map((v) => ({ group: 2, label: `curves ${v}`, args: withUrl(['scripts/curves.mjs', name, '--viewport', v, ...refresh]), pick: /motion score \((\w+)\): ([\d.]+)%/g, unit: 'motion %' }))),
  { group: 3, label: 'interact', args: withUrl(['scripts/interact.mjs', name, ...refresh]), pick: /│ \d+\s+│ '([^']+)'\s+│ ([\d.]+)/g, unit: 'interaction %', fail: /FAIL/g },
  ...(flags.quick ? [] : [
    { group: 3, label: 'hovers', args: withUrl(['scripts/hovers.mjs', name, ...refresh]), pick: /hover match \((\w+)\): ([\d.]+)%/g, unit: 'hover %' },
    { group: 3, label: 'detail', args: withUrl(['scripts/detail.mjs', name, '--viewport', 'all', ...refresh]), pick: /(\w+): detail match ([\d.]+)%/g, unit: 'detail %' },
    { group: 3, label: 'load', args: withUrl(['scripts/load.mjs', name, ...refresh]), pick: /(\w+): load match ([\d.]+)%/g, unit: 'load %' },
  ]),
];

const runStep = (step) => new Promise((resolve) => {
  const started = Date.now();
  const [file, ...args] = step.args;
  const child = spawn(process.execPath, [path.join(HERE, path.basename(file)), ...args], { cwd: process.cwd() });
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
};
const groups = flags.serial
  ? steps.map((st) => [st])
  : [...new Set(steps.map((st) => st.group))].map((g) => steps.filter((st) => st.group === g));
for (const group of groups) {
  console.log(`running: ${group.map((st) => st.label).join(', ')}`);
  await Promise.all(group.map(async (step) => finish(step, await runStep(step))));
}
summary.sort((x, y) => steps.findIndex((st) => st.label === x.step) - steps.findIndex((st) => st.label === y.step));
console.log(`\n${flags.quick ? 'quick' : 'full'} score for ${name}${url ? ` (${url})` : ''} in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
console.table(summary.map((s) => ({ step: s.step, status: s.status, 's': s.seconds, result: Object.entries(s).find(([k]) => k.endsWith('%'))?.[1] })));
// REPORT.md: every score against its target, what to fix first, and what was not copied
const report = await runStep({ args: ['report.mjs', name] });
console.log(report.out.trim());
