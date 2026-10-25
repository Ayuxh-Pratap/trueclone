// Development and test campaigns: an independent read of one run, from its files, for one workflow at a time. It
// recomputes the evaluation (verdict.mjs) read-only and checks what the run claims against it:
//   cloning (default): the HTML clone, compare/outcome.json and REPORT.md
//   --conversion:      a Next.js conversion, compare-nextjs/outcome.json and REPORT.nextjs.md (its source checks, project
//                      checks and review criteria recomputed too, conversion.mjs)
// The checks:
//   - the run ended: the outcome is terminal (verified, incomplete, blocked), decided on the content there now (a run
//     that stopped at "in progress", or whose outcome describes other content, is a finding)
//   - every required item is accounted for: the set of ids in the outcome's accounting equals the set recomputed here
//     (units, the interaction plan, review frames and folders; a conversion's own items), by identity, not by count;
//     nothing is "pending" at any terminal outcome, Blocked included; Verified has no item not passed; Incomplete lists
//     only differences the loop concluded, criteria judged not met and results the tool cannot verify; Blocked names
//     its owner, and so does every item it blocks
//   - the workflows stay apart: the clone's outcome holds nothing of a conversion; a conversion's names its baseline
//   - the scope is stated: the outcome records it, REPORT has its Scope section, and a site capture that reached its
//     route cap never reads as the whole site
//   - the console, the outcome and REPORT agree: the last status output (logs/status.log) says the outcome recorded,
//     and REPORT's headline says it too; REPORT's Scores header follows the sizes it shows
//   - REPORT's result counts are the recomputed ones; the lint; results measured by a modified instrument
// Read-only: it writes nothing anywhere in the site folder (evaluate readOnly: the hash caches are not written).
// Exit 0 when nothing is found, 1 otherwise.
// usage: node tools/audit-run.mjs <path to sites/<name>> [--conversion] [--json]
import fs from 'node:fs/promises';
import path from 'node:path';
import { evaluate } from '../scripts/verdict.mjs';
import { SCORED } from '../scripts/lib.mjs';
import { scopeOf } from '../scripts/scope.mjs';

const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/audit-run.mjs <sites/<name> folder> [--conversion] [--json]'); process.exit(1); }
const conversionRun = process.argv.includes('--conversion');
const side = conversionRun ? 'app' : 'clone';
const compare = conversionRun ? 'compare-nextjs' : 'compare';
const root = path.resolve(dir);
const read = (f) => fs.readFile(path.join(root, f), 'utf8').then(JSON.parse, () => null);
const ev = await evaluate(root, { side, readOnly: true });
const conv = conversionRun ? await (await import('../scripts/conversion.mjs')).evaluateConversion(root, { readOnly: true }) : null;
const outcome = await read(`${compare}/outcome.json`);
const loop = await read(`${compare}/loop.json`);
const times = await read(`${compare}/score-times.json`);
const report = await fs.readFile(path.join(root, conversionRun ? 'REPORT.nextjs.md' : 'REPORT.md'), 'utf8').catch(() => '');
const statusLog = conversionRun ? '' : await fs.readFile(path.join(root, 'logs', 'status.log'), 'utf8').catch(() => '');
const counts = (e) => Object.entries(e.counts || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(', ');
const findings = [];
const TERMINAL = ['verified', 'incomplete', 'blocked'];

// the run ended, on this content
if (!outcome) findings.push(`no outcome: ${conversionRun ? 'convert' : 'status'} never recorded a decision (${compare}/outcome.json is missing)`);
else if (!TERMINAL.includes(outcome.outcome)) findings.push(`the run did not end: the last outcome is "${outcome.outcome}"${outcome.next ? ` (next: ${outcome.next})` : ''}`);
if (outcome && TERMINAL.includes(outcome.outcome) && outcome.subjectHash && outcome.subjectHash !== ev.subjectHash) findings.push(`${compare}/outcome.json was decided on other ${conversionRun ? 'app' : 'clone'} content (${outcome.subjectHash} vs ${ev.subjectHash} now)`);
// the workflows stay apart
if (!conversionRun && outcome && (outcome.appSubjectHash || /next\.?js app/i.test(outcome.why || ''))) findings.push('the HTML clone\'s outcome describes a Next.js app: cloning and conversion are separate workflows');
if (conversionRun && outcome && !outcome.baseline) findings.push('the conversion\'s outcome names no baseline (the HTML clone it started from)');
if (conversionRun && !conv?.request) findings.push('no conversion request recorded (compare-nextjs/request.json): a conversion is started only by its own request');

// every required item accounted for, by identity
const required = new Set();
if (!ev.missingCapture) {
  for (const u of ev.units) required.add(`${side}:unit:${u.check}|${u.route || ''}|${u.viewport || ''}|${u.state || ''}`);
  for (const f of ev.review?.frames || []) required.add(`${side}:frame:${f.dir}|${f.id}`);
  for (const d of ev.review?.missingDirs || []) required.add(`${side}:review-dir:${d.dir}`);
}
if (conv) for (const i of (await import('../scripts/conversion.mjs')).conversionItems(conv)) required.add(i.id);
const acc = outcome?.accounting;
// a Blocked outcome accounts for every item too (RC7 elise: 323 items pending at Blocked, accepted). The one exception
// is trueclone itself crashing (outcome.error): status could not evaluate anything then
if (outcome && TERMINAL.includes(outcome.outcome) && !acc && (outcome.outcome !== 'blocked' || (required.size && !outcome.error))) findings.push(`the ${outcome.outcome} outcome has no accounting of the ${required.size} required items`);
if (acc) {
  const recorded = new Set((acc.ids || []).filter((i) => /:(unit|frame|review-dir|build|source|criterion):/.test(i)));
  const missing = [...required].filter((i) => !recorded.has(i));
  const extra = [...recorded].filter((i) => !required.has(i));
  if (missing.length) findings.push(`${missing.length} required item(s) are in no disposition of the outcome: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? '…' : ''}`);
  if (extra.length) findings.push(`${extra.length} item(s) accounted for are not required now: ${extra.slice(0, 6).join(', ')}${extra.length > 6 ? '…' : ''}`);
  const pending = (acc.items || []).filter((i) => i.disposition === 'pending');
  if (TERMINAL.includes(outcome.outcome) && pending.length) findings.push(`${pending.length} item(s) are still pending at a ${outcome.outcome} outcome: ${pending.slice(0, 4).map((i) => i.label).join('; ')}`);
  // a Blocked run keeps what it measured: a result measured below its bar is "failing", never "not reached";
  // "failing" belongs only to a Blocked outcome (Incomplete lists concluded differences)
  const relabelled = (acc.items || []).filter((i) => i.notReached && ['fail', 'differs', 'error'].includes(i.state));
  if (relabelled.length) findings.push(`${relabelled.length} measured result(s) reported as not reached: ${relabelled.slice(0, 4).map((i) => `${i.label} (${i.state})`).join('; ')}`);
  const failing = (acc.items || []).filter((i) => i.disposition === 'failing');
  if (failing.length && outcome.outcome !== 'blocked') findings.push(`${failing.length} item(s) "failing" at a ${outcome.outcome} outcome`);
  const ownerless = (acc.items || []).filter((i) => ['blocked', 'failing'].includes(i.disposition) && !i.owner);
  if (ownerless.length) findings.push(`${ownerless.length} blocked or failing item(s) without an owner: ${ownerless.slice(0, 4).map((i) => i.label).join('; ')}`);
  if (acc.counts && Object.values(acc.counts).reduce((a, b) => a + b, 0) !== acc.total) findings.push(`the accounting's counts add up to ${Object.values(acc.counts).reduce((a, b) => a + b, 0)}, not its total ${acc.total}`);
  if (outcome.outcome === 'verified' && (acc.items || []).length) findings.push(`Verified with ${(acc.items || []).length} item(s) not passed`);
  if (outcome.outcome === 'incomplete' && (acc.items || []).some((i) => !['unresolved', 'not-verifiable'].includes(i.disposition))) findings.push('Incomplete lists an item that is neither a concluded difference nor a result the tool cannot verify');
  if (outcome.outcome === 'incomplete' && !(acc.items || []).length) findings.push('Incomplete with nothing listed');
  if (outcome.outcome === 'incomplete' && (outcome.unresolved || []).length !== (acc.items || []).length) findings.push(`${conversionRun ? 'convert' : 'status'} listed ${(outcome.unresolved || []).length} item(s), the accounting ${(acc.items || []).length}`);
}
const convOk = !conv || (conv.buildCurrent && BUILD_OK(conv) && !conv.lint.length && conv.criteria.every((c) => c.state === 'met'));
function BUILD_OK(c) { return ['install', 'typecheck', 'lint', 'build', 'serve'].every((s) => c.build?.steps?.[s]?.ok); }
if (outcome?.outcome === 'verified' && !(ev.verified && convOk)) findings.push(`outcome says Verified but the recomputed evaluation does not verify the ${conversionRun ? 'conversion' : 'clone'}`);
if (outcome?.outcome === 'blocked' && !outcome.owner) findings.push('Blocked without an owner');

// the scope, stated
if (!ev.missingCapture && !conversionRun) {
  const scope = scopeOf(ev.meta);
  if (outcome && ['verified', 'incomplete'].includes(outcome.outcome) && !outcome.scope) findings.push('the outcome does not record the scope it covers');
  if (report && !/^## Scope\b/m.test(report)) findings.push('REPORT.md has no Scope section');
  if (scope.capReached && report && !/cap of \d+ routes was reached|cap was reached/i.test(report)) findings.push('the capture reached its route cap and REPORT.md does not say so');
  if (scope.capReached && /whole site (is )?verified/i.test(`${report}\n${outcome?.why || ''}`)) findings.push('a capture that reached its route cap is called the whole site');
}

// the console, the outcome and REPORT agree
const lastStatus = statusLog.split(/\n# \d{4}-\d\d-\d\dT[^\n]*trueclone status/).at(-1) || '';
const said = /\n(Verified|Incomplete|Blocked)\b/.exec(lastStatus)?.[1]?.toLowerCase() || (/\nnext: /.test(lastStatus) || /\nwaiting: /.test(lastStatus) ? 'in-progress' : null);
if (statusLog && said && outcome?.outcome && said !== outcome.outcome) findings.push(`the last status output says "${said}", outcome.json "${outcome.outcome}"`);
const headline = /\| Outcome \| \*\*([A-Za-z ]+)\*\*/.exec(report)?.[1]?.toLowerCase() || null;
if (outcome && TERMINAL.includes(outcome.outcome) && !report) findings.push(`a ${outcome.outcome} outcome without ${conversionRun ? 'REPORT.nextjs.md' : 'REPORT.md'}`);
if (report && outcome && TERMINAL.includes(outcome.outcome) && headline && !headline.startsWith(outcome.outcome)) findings.push(`the report says "${headline}", outcome.json "${outcome.outcome}"`);
const header = report.split('\n').find((l) => l.startsWith('| Check |'));
if (header) { const cols = header.split('|').map((c) => c.trim().split(' ')[0].toLowerCase()).filter((c) => SCORED.some((v) => v.name === c)); if (cols.join(',') !== SCORED.map((v) => v.name).join(',')) findings.push(`the report's Scores header is not in the order of its cells: ${cols.join(', ')}`); }
const reportCounts = /Results: ([^\n.]+)\./.exec(report)?.[1];
if (reportCounts && reportCounts !== counts(ev)) findings.push(`the report says "${reportCounts}", recomputed "${counts(ev)}"`);
if (ev.lint?.findings.length && !['blocked', 'incomplete'].includes(outcome?.outcome)) findings.push(`lint: ${ev.lint.findings.map((f) => `${f.file}: ${f.what}`).join('; ')}`);
const modified = ev.units.filter((u) => u.record?.identity?.env?.instrumentModified);
if (modified.length) findings.push(`${modified.length} result(s) measured by a modified instrument`);

const objectives = Object.values(loop?.objectives || {}).map((o) => ({ label: o.label, state: o.state, attempts: o.attempts, strategies: o.strategies || 0, best: o.bestValue, last: o.lastValue, why: o.concludedWhy || o.retiredWhy || '', history: (o.history || []).map((h) => `${h.at?.slice(5, 16)} ${h.value ?? '–'}${h.progress ? '+' : ''}`).join(' ') }));
const steps = Object.entries(loop?.steps || {}).filter(([, s]) => s.failed || s.ineffective || s.idle >= 2).map(([k, s]) => `${k.slice(0, 90)}: named ${s.named}, failed ${s.failed}, ineffective ${s.ineffective}, idle ${s.idle}`);
const active = (() => { const a = (loop?.activity || []).map(Date.parse).sort((x, y) => x - y); let s = 0; for (let i = 1; i < a.length; i++) { const g = a[i] - a[i - 1]; if (g < 15 * 60000) s += g; } return { wallH: a.length ? +((a.at(-1) - a[0]) / 3600000).toFixed(2) : 0, activeH: +(s / 3600000).toFixed(2) }; })();
const lockWait = (times?.history || []).reduce((n, h) => n + Object.values(h.steps || {}).reduce((m, s) => m + (s.lockWaitSeconds || 0), 0), 0);
const out = { site: path.basename(root), workflow: conversionRun ? 'conversion' : 'cloning', outcome: outcome?.outcome || 'none', owner: outcome?.owner || null, accounting: acc ? { total: acc.total, counts: acc.counts } : null, required: required.size, [side]: { verified: ev.verified, counts: counts(ev) }, review: ev.review?.status, time: { ...active, lockWaitMin: +(lockWait / 60).toFixed(1) }, objectives, steps, thirdParty: ev.meta?.thirdParty || [], calibrated: Boolean(ev.noise), findings };
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 2));
else {
  console.log(`${out.site} (${out.workflow}): outcome ${out.outcome}${out.owner ? ` (owner ${out.owner})` : ''}; ${side} ${ev.verified ? 'verified' : 'not verified'} (${counts(ev)}); review ${out.review}`);
  if (acc) console.log(`accounting: ${acc.total} required item(s): ${Object.entries(acc.counts).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', ')} (recomputed here: ${required.size})`);
  console.log(`time: ${out.time.wallH} h wall, ${out.time.activeH} h active, ${out.time.lockWaitMin} min waiting for the timing lock; calibrated: ${out.calibrated}`);
  for (const o of objectives) console.log(`- ${o.label}: ${o.state}, ${o.attempts} attempt(s), ${o.strategies} strategy change(s), best ${o.best ?? '–'}, last ${o.last ?? '–'}${o.why ? `; ${o.why}` : ''}\n    ${o.history}`);
  for (const s of steps) console.log(`step: ${s}`);
  for (const t of out.thirdParty) console.log(`third-party: ${t.sel || t.label} from ${t.origin}: ${t.decision}`);
  console.log(findings.length ? `AUDIT FINDINGS:\n${findings.map((f) => `  - ${f}`).join('\n')}` : 'audit: the run ended, and its claims match its files');
}
process.exitCode = findings.length ? 1 : 0;
