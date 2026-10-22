// Development only (the retest, docs/test-plan-0.5-rc5.md): an independent read of one finished run, from its files.
// It recomputes the evaluation (verdict.mjs) for the clone and the app, and checks what the run claims against it:
// the outcome record (compare/outcome.json) is for the content there now; REPORT.md's result counts are the
// recomputed ones; every objective's history (compare/loop.json) and how the loop ended; time and lock waits.
// Read-only: it writes nothing into the site folder.
// usage: node tools/audit-run.mjs <path to sites/<name>> [--json]
import fs from 'node:fs/promises';
import path from 'node:path';
import { evaluate } from '../scripts/verdict.mjs';

const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/audit-run.mjs <sites/<name> folder> [--json]'); process.exit(1); }
const root = path.resolve(dir);
const read = (f) => fs.readFile(path.join(root, f), 'utf8').then(JSON.parse, () => null);
const clone = await evaluate(root, { side: 'clone' });
const app = await evaluate(root, { side: 'app' });
const outcome = await read('compare/outcome.json');
const loop = await read('compare/loop.json');
const times = await read('compare/score-times.json');
const report = await fs.readFile(path.join(root, 'REPORT.md'), 'utf8').catch(() => '');
const counts = (ev) => Object.entries(ev.counts || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(', ');
const findings = [];
if (outcome && outcome.subjectHash !== clone.subjectHash) findings.push(`outcome.json was decided on other clone content (${outcome.subjectHash} vs ${clone.subjectHash} now)`);
if (outcome?.outcome === 'verified' && !(clone.verified && app.verified)) findings.push('outcome says Verified but the recomputed evaluation does not verify the clone and the app');
const reportCounts = /Results: ([^\n.]+)\./.exec(report)?.[1];
if (reportCounts && reportCounts !== counts(clone)) findings.push(`REPORT.md says "${reportCounts}", recomputed "${counts(clone)}"`);
if (clone.lint?.findings.length) findings.push(`clone lint: ${clone.lint.findings.map((f) => f.what).join('; ')}`);
const modified = clone.units.filter((u) => u.record?.identity?.env?.instrumentModified);
if (modified.length) findings.push(`${modified.length} result(s) measured by a modified instrument`);
const objectives = Object.values(loop?.objectives || {}).map((o) => ({ label: o.label, state: o.state, attempts: o.attempts, strategies: o.strategies || 0, best: o.bestValue, last: o.lastValue, why: o.concludedWhy || '', history: (o.history || []).map((h) => `${h.at?.slice(5, 16)} ${h.value ?? '–'}${h.progress ? '+' : ''}`).join(' ') }));
const active = (() => { const a = (loop?.activity || []).map(Date.parse).sort((x, y) => x - y); let s = 0; for (let i = 1; i < a.length; i++) { const g = a[i] - a[i - 1]; if (g < 15 * 60000) s += g; } return { wallH: a.length ? +((a.at(-1) - a[0]) / 3600000).toFixed(2) : 0, activeH: +(s / 3600000).toFixed(2) }; })();
const lockWait = (times?.history || []).reduce((n, h) => n + Object.values(h.steps || {}).reduce((m, s) => m + (s.lockWaitSeconds || 0), 0), 0);
const out = { site: path.basename(root), outcome: outcome?.outcome || 'none', clone: { verified: clone.verified, counts: counts(clone) }, app: { verified: app.verified, counts: counts(app) }, review: { clone: clone.review?.status, app: app.review?.status }, time: { ...active, lockWaitMin: +(lockWait / 60).toFixed(1) }, objectives, thirdParty: clone.meta?.thirdParty || [], calibrated: Boolean(clone.noise), findings };
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 2));
else {
  console.log(`${out.site}: outcome ${out.outcome}; clone ${out.clone.verified ? 'verified' : 'not verified'} (${out.clone.counts}); app ${out.app.verified ? 'verified' : 'not verified'} (${out.app.counts}); review ${out.review.clone}/${out.review.app}`);
  console.log(`time: ${out.time.wallH} h wall, ${out.time.activeH} h active (from status runs), ${out.time.lockWaitMin} min waiting for the timing lock; calibrated: ${out.calibrated}`);
  for (const o of objectives) console.log(`- ${o.label}: ${o.state}, ${o.attempts} attempt(s), ${o.strategies} strategy change(s), best ${o.best ?? '–'}, last ${o.last ?? '–'}${o.why ? `; ${o.why}` : ''}\n    ${o.history}`);
  for (const t of out.thirdParty) console.log(`third-party: ${t.sel || t.label} from ${t.origin}: ${t.decision}`);
  console.log(findings.length ? `AUDIT FINDINGS:\n${findings.map((f) => `  - ${f}`).join('\n')}` : 'audit: the run\'s claims match its files');
}
