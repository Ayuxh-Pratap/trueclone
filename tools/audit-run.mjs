// Development and test campaigns (docs/test-plan-0.5-rc7.md): an independent read of one run, from its files. It
// recomputes the evaluation (verdict.mjs) for the clone and the app, read-only, and checks what the run claims against it:
//   - the run ended: compare/outcome.json holds a terminal outcome (verified, incomplete, blocked), decided on the
//     content there now (a run that stopped at "in progress", or whose outcome describes other content, is a finding)
//   - every required item is accounted for: the set of ids in the outcome's accounting equals the set recomputed here
//     (units of both sides, the interaction plan, review frames and folders), by identity, not by count; nothing is
//     "pending" at any terminal outcome, Blocked included; Verified has no item not passed; Incomplete lists only
//     differences the loop concluded and results the tool cannot verify; Blocked names its owner, and so does every
//     item it blocks
//   - the console, the outcome and REPORT.md agree: the last status output (logs/status.log) says the outcome recorded,
//     and REPORT's headline says it too; REPORT's Scores header follows the sizes it shows
//   - REPORT.md's result counts are the recomputed ones; the clone lint; results measured by a modified instrument
// Read-only: it writes nothing anywhere in the site folder (evaluate readOnly: the hash caches are not written).
// Exit 0 when nothing is found, 1 otherwise.
// usage: node tools/audit-run.mjs <path to sites/<name>> [--json]
import fs from 'node:fs/promises';
import path from 'node:path';
import { evaluate } from '../scripts/verdict.mjs';
import { SCORED } from '../scripts/lib.mjs';

const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/audit-run.mjs <sites/<name> folder> [--json]'); process.exit(1); }
const root = path.resolve(dir);
const read = (f) => fs.readFile(path.join(root, f), 'utf8').then(JSON.parse, () => null);
const clone = await evaluate(root, { side: 'clone', readOnly: true });
const app = await evaluate(root, { side: 'app', readOnly: true });
const outcome = await read('compare/outcome.json');
const loop = await read('compare/loop.json');
const times = await read('compare/score-times.json');
const report = await fs.readFile(path.join(root, 'REPORT.md'), 'utf8').catch(() => '');
const statusLog = await fs.readFile(path.join(root, 'logs', 'status.log'), 'utf8').catch(() => '');
const counts = (ev) => Object.entries(ev.counts || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(', ');
const findings = [];
const TERMINAL = ['verified', 'incomplete', 'blocked'];

// the run ended, on this content
if (!outcome) findings.push('no outcome: status never recorded a decision (compare/outcome.json is missing)');
else if (!TERMINAL.includes(outcome.outcome)) findings.push(`the run did not end: the last outcome is "${outcome.outcome}"${outcome.next ? ` (next: ${outcome.next})` : ''}`);
if (outcome && TERMINAL.includes(outcome.outcome) && outcome.subjectHash && outcome.subjectHash !== clone.subjectHash) findings.push(`outcome.json was decided on other clone content (${outcome.subjectHash} vs ${clone.subjectHash} now)`);
if (outcome?.outcome && ['verified', 'incomplete'].includes(outcome.outcome) && outcome.appSubjectHash && outcome.appSubjectHash !== app.subjectHash) findings.push(`outcome.json was decided on another app (${outcome.appSubjectHash} vs ${app.subjectHash} now)`);

// every required item accounted for, by identity
const required = new Set();
for (const ev of [clone, app]) {
  if (!ev || ev.missingCapture) continue;
  for (const u of ev.units) required.add(`${ev.side}:unit:${u.check}|${u.route || ''}|${u.viewport || ''}|${u.state || ''}`);
  for (const f of ev.review?.frames || []) required.add(`${ev.side}:frame:${f.dir}|${f.id}`);
  for (const d of ev.review?.missingDirs || []) required.add(`${ev.side}:review-dir:${d.dir}`);
}
const acc = outcome?.accounting;
// a Blocked outcome accounts for every item too (RC7 elise: 323 items pending at Blocked, accepted). The one exception
// is trueclone itself crashing (outcome.error): status could not evaluate anything then
if (outcome && TERMINAL.includes(outcome.outcome) && !acc && (outcome.outcome !== 'blocked' || (required.size && !outcome.error))) findings.push(`the ${outcome.outcome} outcome has no accounting of the ${required.size} required items`);
if (acc) {
  const recorded = new Set((acc.ids || []).filter((i) => /:(unit|frame|review-dir):/.test(i)));
  const missing = [...required].filter((i) => !recorded.has(i));
  const extra = [...recorded].filter((i) => !required.has(i));
  if (missing.length) findings.push(`${missing.length} required item(s) are in no disposition of the outcome: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? '…' : ''}`);
  if (extra.length) findings.push(`${extra.length} item(s) accounted for are not required now: ${extra.slice(0, 6).join(', ')}${extra.length > 6 ? '…' : ''}`);
  const pending = (acc.items || []).filter((i) => i.disposition === 'pending');
  if (TERMINAL.includes(outcome.outcome) && pending.length) findings.push(`${pending.length} item(s) are still pending at a ${outcome.outcome} outcome: ${pending.slice(0, 4).map((i) => i.label).join('; ')}`);
  const ownerless = (acc.items || []).filter((i) => i.disposition === 'blocked' && !i.owner);
  if (ownerless.length) findings.push(`${ownerless.length} blocked item(s) without an owner: ${ownerless.slice(0, 4).map((i) => i.label).join('; ')}`);
  if (acc.counts && Object.values(acc.counts).reduce((a, b) => a + b, 0) !== acc.total) findings.push(`the accounting's counts add up to ${Object.values(acc.counts).reduce((a, b) => a + b, 0)}, not its total ${acc.total}`);
  if (outcome.outcome === 'verified' && (acc.items || []).length) findings.push(`Verified with ${(acc.items || []).length} item(s) not passed`);
  if (outcome.outcome === 'incomplete' && (acc.items || []).some((i) => !['unresolved', 'not-verifiable'].includes(i.disposition))) findings.push('Incomplete lists an item that is neither a concluded difference nor a result the tool cannot verify');
  if (outcome.outcome === 'incomplete' && !(acc.items || []).length) findings.push('Incomplete with nothing listed');
  if (outcome.outcome === 'incomplete' && (outcome.unresolved || []).length !== (acc.items || []).length) findings.push(`status listed ${(outcome.unresolved || []).length} item(s), the accounting ${(acc.items || []).length}`);
}
if (outcome?.outcome === 'verified' && !(clone.verified && app.verified)) findings.push('outcome says Verified but the recomputed evaluation does not verify the clone and the app');
if (outcome?.outcome === 'blocked' && !outcome.owner) findings.push('Blocked without an owner');

// the console, the outcome and REPORT agree
const lastStatus = statusLog.split(/\n# \d{4}-\d\d-\d\dT[^\n]*trueclone status/).at(-1) || '';
const said = /\n(Verified|Incomplete|Blocked)\b/.exec(lastStatus)?.[1]?.toLowerCase() || (/\nnext: /.test(lastStatus) || /\nwaiting: /.test(lastStatus) ? 'in-progress' : null);
if (statusLog && said && outcome?.outcome && said !== outcome.outcome) findings.push(`the last status output says "${said}", outcome.json "${outcome.outcome}"`);
const headline = /\| Outcome \| \*\*([A-Za-z ]+)\*\*/.exec(report)?.[1]?.toLowerCase() || null;
if (outcome && TERMINAL.includes(outcome.outcome) && !report) findings.push(`a ${outcome.outcome} outcome without REPORT.md`);
if (report && outcome && TERMINAL.includes(outcome.outcome) && headline && !headline.startsWith(outcome.outcome)) findings.push(`REPORT.md says "${headline}", outcome.json "${outcome.outcome}"`);
const header = report.split('\n').find((l) => l.startsWith('| Check |'));
if (header) { const cols = header.split('|').map((c) => c.trim().split(' ')[0].toLowerCase()).filter((c) => SCORED.some((v) => v.name === c)); if (cols.join(',') !== SCORED.map((v) => v.name).join(',')) findings.push(`REPORT's Scores header is not in the order of its cells: ${cols.join(', ')}`); }
const reportCounts = /Results: ([^\n.]+)\./.exec(report)?.[1];
if (reportCounts && reportCounts !== counts(clone)) findings.push(`REPORT.md says "${reportCounts}", recomputed "${counts(clone)}"`);
if (clone.lint?.findings.length && !['blocked', 'incomplete'].includes(outcome?.outcome)) findings.push(`clone lint: ${clone.lint.findings.map((f) => `${f.file}: ${f.what}`).join('; ')}`);
const modified = clone.units.filter((u) => u.record?.identity?.env?.instrumentModified);
if (modified.length) findings.push(`${modified.length} result(s) measured by a modified instrument`);

const objectives = Object.values(loop?.objectives || {}).map((o) => ({ label: o.label, state: o.state, attempts: o.attempts, strategies: o.strategies || 0, best: o.bestValue, last: o.lastValue, why: o.concludedWhy || o.retiredWhy || '', history: (o.history || []).map((h) => `${h.at?.slice(5, 16)} ${h.value ?? '–'}${h.progress ? '+' : ''}`).join(' ') }));
const steps = Object.entries(loop?.steps || {}).filter(([, s]) => s.failed || s.ineffective || s.idle >= 2).map(([k, s]) => `${k.slice(0, 90)}: named ${s.named}, failed ${s.failed}, ineffective ${s.ineffective}, idle ${s.idle}`);
const active = (() => { const a = (loop?.activity || []).map(Date.parse).sort((x, y) => x - y); let s = 0; for (let i = 1; i < a.length; i++) { const g = a[i] - a[i - 1]; if (g < 15 * 60000) s += g; } return { wallH: a.length ? +((a.at(-1) - a[0]) / 3600000).toFixed(2) : 0, activeH: +(s / 3600000).toFixed(2) }; })();
const lockWait = (times?.history || []).reduce((n, h) => n + Object.values(h.steps || {}).reduce((m, s) => m + (s.lockWaitSeconds || 0), 0), 0);
const out = { site: path.basename(root), outcome: outcome?.outcome || 'none', owner: outcome?.owner || null, accounting: acc ? { total: acc.total, counts: acc.counts } : null, required: required.size, clone: { verified: clone.verified, counts: counts(clone) }, app: { verified: app.verified, counts: counts(app) }, review: { clone: clone.review?.status, app: app.review?.status }, time: { ...active, lockWaitMin: +(lockWait / 60).toFixed(1) }, objectives, steps, thirdParty: clone.meta?.thirdParty || [], calibrated: Boolean(clone.noise), findings };
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 2));
else {
  console.log(`${out.site}: outcome ${out.outcome}${out.owner ? ` (owner ${out.owner})` : ''}; clone ${out.clone.verified ? 'verified' : 'not verified'} (${out.clone.counts}); app ${out.app.verified ? 'verified' : 'not verified'} (${out.app.counts}); review ${out.review.clone}/${out.review.app}`);
  if (acc) console.log(`accounting: ${acc.total} required item(s): ${Object.entries(acc.counts).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', ')} (recomputed here: ${required.size} units, frames and folders)`);
  console.log(`time: ${out.time.wallH} h wall, ${out.time.activeH} h active (from status runs), ${out.time.lockWaitMin} min waiting for the timing lock; calibrated: ${out.calibrated}`);
  for (const o of objectives) console.log(`- ${o.label}: ${o.state}, ${o.attempts} attempt(s), ${o.strategies} strategy change(s), best ${o.best ?? '–'}, last ${o.last ?? '–'}${o.why ? `; ${o.why}` : ''}\n    ${o.history}`);
  for (const s of steps) console.log(`step: ${s}`);
  for (const t of out.thirdParty) console.log(`third-party: ${t.sel || t.label} from ${t.origin}: ${t.decision}`);
  console.log(findings.length ? `AUDIT FINDINGS:\n${findings.map((f) => `  - ${f}`).join('\n')}` : 'audit: the run ended, and its claims match its files');
}
process.exitCode = findings.length ? 1 : 0;
