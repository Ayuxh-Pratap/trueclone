// The contracts between trueclone's components, each a mechanism the RC6 runs showed broken (docs/rc7-notes.md):
// status, verdict, report, score, the journal and the identity cache, run as a user runs them, across their boundaries.
//   - a repeated measurement error is classified and ends Blocked (or becomes clone work), never "Incomplete" unlisted
//   - the interaction plan is scheduled; every required item is accounted for at any terminal outcome (sets equal)
//   - the clone's and the app's review verdicts are separate, whatever their order and tokens
//   - a lint finding renders in REPORT (no crash), a failed REPORT fails score, tool-generated content is never clone work
//   - a step that ran without effect, or is named again and again with nothing changing, is bounded; a running step is
//     waited for and never counted
//   - the hash cache survives concurrent writers; a dead process's timing lock is taken over at once
import { test, after } from 'node:test';
after(() => { process.exitCode = 0; });
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeUnits } from '../scripts/results.mjs';
import { startIdentity, contentHash } from '../scripts/identity.mjs';
import { failureLine, errorOwner } from '../scripts/failures.mjs';
import { lintSubject, reviewVerdicts, loadsOrigin } from '../scripts/verdict.mjs';
import { withMachineLock, timingLockFile, timingLockHolder } from '../scripts/lib.mjs';
import { tmpProject, makeSite, measureAll, reviewAll, verifiedSite, status, report, edit, readJson, notesWith, SCRIPTS, TOKENS } from './helpers/site.mjs';

const tick = () => new Promise((r) => setTimeout(r, 15));
const errorUnit = async (site, check, reason, extra = {}) => {
  const vps = check === 'behaviour' ? ['desktop', 'mobile'] : ['mobile', 'tablet', 'desktop', 'laptop', 'wide'];
  await tick();
  await writeUnits(site.root, 'compare', check, vps.map((v) => (v === 'desktop' ? { route: '', viewport: v, value: null, error: reason, ...extra } : { route: '', viewport: v, value: check === 'behaviour' ? 100 : 99.5, ...(check === 'behaviour' ? { members: [{ id: 'move@700', y: 700, value: 100 }] } : {}) })), await startIdentity(site.root, check));
};

// ---- failures.mjs: the line that says why, and whose it is ----
test('failureLine: the error, not the Node banner under a CRLF stack (RC6 heybhaskar lost "SyntaxError")', () => {
  const out = 'running states\r\nfile:///C:/x/identity.mjs:32\r\n  const cache = JSON.parse(...);\r\n                     ^\r\n\r\nSyntaxError: Unexpected end of JSON input\r\n    at JSON.parse (<anonymous>)\r\n    at contentHash (file:///C:/x/identity.mjs:32:22)\r\n    at async startIdentity (file:///C:/x/identity.mjs:130:18)\r\n\r\nNode.js v24.19.0\r\n';
  assert.equal(failureLine(out), 'SyntaxError: Unexpected end of JSON input');
  assert.match(failureLine('x\nTIMEOUT after 20 min (the step\'s limit for the units it measures)\n'), /^TIMEOUT/);
});
test('errorOwner: environment, clone and tool, by what the failure says', () => {
  assert.equal(errorOwner({ error: 'layout exit 1: page.goto: net::ERR_NAME_NOT_RESOLVED at https://www.example.com/' }), 'environment');
  assert.equal(errorOwner({ error: 'layout exit 1: page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at http://127.0.0.1:5768/Landing%20Page.html' }), 'tool');
  assert.equal(errorOwner({ error: 'states exit 1: Target crashed' }), 'clone');
  assert.equal(errorOwner({ error: 'behaviour timeout: TIMEOUT after 20 min', errorKind: 'timeout' }), 'tool');
  assert.equal(errorOwner({ error: 'page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:5000/' }), 'tool');
});

// ---- RC6-04: a repeated error ends Blocked with every unit named; never "Incomplete" with nothing listed ----
const REPEATS = [
  ['tool', 'layout', 'layout exit 1: page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at http://127.0.0.1:52011/Landing%20Page.html', { errorKind: 'crash', errorLog: 'logs/score-x-layout.log' }],
  ['tool', 'behaviour', 'behaviour timeout: TIMEOUT after 20 min', { errorKind: 'timeout' }],
  ['tool', 'scroll', 'states exit 1: SyntaxError: Unexpected end of JSON input', { errorKind: 'crash' }],
  ['environment', 'layout', 'layout exit 1: page.goto: net::ERR_NAME_NOT_RESOLVED at https://www.example.com/', { errorKind: 'crash' }],
];
for (const [owner, check, reason, extra] of REPEATS) {
  test(`RC6-04: the same ${owner} error twice on the same clone (${check}) ends Blocked, owner ${owner}, the unit named (not exit 3)`, async () => {
    const p = await tmpProject();
    const site = await verifiedSite(p, 'e');
    await errorUnit(site, check, reason, extra);
    let r = status(p, 'e');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, new RegExp(`next: npx trueclone score e --only ${check === 'scroll' ? 'states' : check}`));
    assert.match(r.out, /measured once more; the same failure again/);
    // a status call alone is not a second measurement: still the retry
    r = status(p, 'e');
    assert.equal(r.code, 1, r.out);
    // measured again on the same content, the same failure
    await errorUnit(site, check, reason, extra);
    r = status(p, 'e');
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, new RegExp(`Blocked \\(owner: ${owner}\\)`));
    const out = await readJson(site, 'compare/outcome.json');
    assert.equal(out.outcome, 'blocked');
    assert.equal(out.owner, owner);
    assert.ok(out.units.some((u) => /desktop/.test(u.unit)), JSON.stringify(out.units));
    assert.ok(out.accounting.counts.blocked >= 1, JSON.stringify(out.accounting.counts));
    const rep = await fs.readFile(path.join(site.root, 'REPORT.md'), 'utf8');
    assert.match(rep, /\*\*Blocked\*\* \(owner: /);
  });
}
test('RC6-04: the clone\'s own page that crashes twice is clone work (an objective), not Blocked', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'c');
  await errorUnit(site, 'layout', 'layout exit 1: page.goto: Target crashed', { errorKind: 'crash' });
  assert.equal(status(p, 'c').code, 1);
  await errorUnit(site, 'layout', 'layout exit 1: page.goto: Target crashed', { errorKind: 'crash' });
  const r = status(p, 'c');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /Layout \(structure\) desktop/);
  assert.match(r.out, /the page does not load/);
});

// ---- RC6-04b: the interaction plan is scheduled (missing, and stale after a tool upgrade) ----
test('RC6-04b: an interaction plan never measured is scheduled (score --only interact), never left for a terminal outcome', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'i', 'doc', { interactions: ['menu opens'] });
  await fs.rm(path.join(site.root, 'compare', 'results', 'interact.json'));
  const r = status(p, 'i');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /next: npx trueclone score i --only interact/);
  assert.match(r.out, /the interaction plan/);
});
test('RC6-04b: a stale plan (measured by an older version of the check) is measured again', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'sp', 'doc', { interactions: ['menu opens'] });
  const f = path.join(site.root, 'compare', 'results', 'interact.json');
  const j = JSON.parse(await fs.readFile(f, 'utf8'));
  for (const u of Object.values(j.units)) u.identity.codeHash = 'rc5rc5rc5rc5';
  await fs.writeFile(f, JSON.stringify(j));
  const r = status(p, 'sp');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /--only interact/);
});

// ---- the accounting invariant: every required item has a disposition; the ids are the evaluated set ----
test('accounting: a verified run accounts for every required item; an Incomplete one lists exactly the items not passed', async () => {
  const p = await tmpProject();
  await verifiedSite(p, 'v', 'doc', { routes: ['/about'], interactions: ['menu'] });
  assert.equal(status(p, 'v').code, 0);
  const out = await readJson({ root: path.join(p, 'sites', 'v') }, 'compare/outcome.json');
  assert.equal(out.accounting.items.length, 0);
  assert.equal(out.accounting.counts.passed, out.accounting.total);
  assert.equal(new Set(out.accounting.ids).size, out.accounting.total);
  // the evaluated items, recomputed: units of both sides, frames, written checks
  const { evaluate } = await import('../scripts/verdict.mjs');
  const root = path.join(p, 'sites', 'v');
  const ids = new Set();
  for (const side of ['clone', 'app']) {
    const ev = await evaluate(root, { side, readOnly: true });
    for (const u of ev.units) ids.add(`${side}:unit:${u.check}|${u.route || ''}|${u.viewport || ''}|${u.state || ''}`);
    for (const f of ev.review.frames) ids.add(`${side}:frame:${f.dir}|${f.id}`);
  }
  const recorded = new Set(out.accounting.ids.filter((i) => !/:written:/.test(i)));
  assert.deepEqual([...recorded].sort(), [...ids].sort());
});

// ---- RC6-01: the clone's and the app's review verdicts, separate ----
test('RC6-01: different clone and app tokens, verdicts in either order, both reviews close (exit 0)', async () => {
  for (const order of ['clone-first', 'app-first']) {
    const p = await tmpProject();
    const site = await verifiedSite(p, 'r', 'app');
    const notes = await fs.readFile(path.join(site.root, 'notes.md'), 'utf8');
    if (order === 'app-first') {
      const m = /## Review: app\n[\s\S]*$/.exec(notes)[0];
      await edit(site, 'notes.md', notes.replace(m, '').replace('## Review\n', `${m.trim()}\n\n## Review\n`));
    }
    const r = status(p, 'r');
    assert.equal(r.code, 0, `${order}\n${r.out}`);
  }
});
test('RC6-01: an app verdict written under the clone\'s heading does not close the app frame (and says where it goes)', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'w', 'app');
  const notes = await fs.readFile(path.join(site.root, 'notes.md'), 'utf8');
  await edit(site, 'notes.md', notes.replace(/## Review: app\n/, ''));
  const r = status(p, 'w');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /write review verdicts for the Next\.js app's \d+ frame\(s\) under "## Review: app"/);
  assert.equal(reviewVerdicts('## Review\n- a wide [x]: same\n## Review: app\n- a wide [y]: same\n', 'app')[0], 'a wide [y]: same');
  assert.equal(reviewVerdicts('## Review\n- a wide [x]: same\n## Review: app\n- a wide [y]: same\n', 'clone')[0], 'a wide [x]: same');
});

// ---- RC6-05 / RC6-06: lint, report, score exit ----
const ORIGIN = 'https://utt.impactcdn.com';
const IGN = [{ sel: `iframe[src^="${ORIGIN}"]`, why: 'third-party widget', origin: ORIGIN, auto: true }];
// a verified site whose clone the seed made (its own record of what it generated, .seed-base.html, in place before
// anything was measured, as in a run)
async function seededSite(p, name, opts, base) {
  const site = await makeSite(p, name, 'doc', opts);
  await fs.writeFile(path.join(site.root, 'clone', '.seed-base.html'), base);
  await measureAll(site, 'clone'); await reviewAll(site, 'clone'); await measureAll(site, 'app'); await reviewAll(site, 'app');
  return site;
}
test('RC6-05: the exclusion\'s own CSS rule and an inert data-tc-origin placeholder are not "kept widgets"', async () => {
  const html = `<!doctype html><title>x</title><style>iframe[src^="${ORIGIN}"]{display:none!important}</style><body><h1>clone</h1><iframe height="0" width="0" data-tc-origin="${ORIGIN}" src="about:blank"></iframe><script src="script.js" defer></script></body>\n`;
  assert.equal(loadsOrigin(html, 'index.html', ORIGIN), false);
  assert.equal(loadsOrigin(`<script src="${ORIGIN}/t.js"></script>`, 'index.html', ORIGIN), true);
  assert.equal(loadsOrigin(`<script>fetch("${ORIGIN}/t")</script>`, 'index.html', ORIGIN), true);
  const p = await tmpProject();
  const site = await seededSite(p, 'l', { ignore: IGN, cloneHtml: html }, html);
  const lint = await lintSubject(site.root, site.meta, 'clone');
  assert.equal(lint.findings.length, 0, JSON.stringify(lint.findings));
  assert.equal(status(p, 'l').code, 0);
});
test('RC6-05: a widget the seed itself kept is the tool\'s (Blocked, never "fix the clone" in a generated page)', async () => {
  const html = `<!doctype html><title>x</title><body><h1>clone</h1><script src="${ORIGIN}/t.js" async></script><script src="script.js" defer></script></body>\n`;
  const p = await tmpProject();
  await seededSite(p, 'lt', { ignore: IGN, cloneHtml: html }, html);
  const r = status(p, 'lt');
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /Blocked \(owner: tool\)/);
  assert.doesNotMatch(r.out, /next: fix the clone/);
});
test('RC6-05: a widget a patch put back is the clone\'s: the step names the patch, never the generated page', async () => {
  const base = '<!doctype html><title>x</title><body><h1>clone</h1><script src="script.js" defer></script></body>\n';
  const html = base.replace('</body>', `<script src="${ORIGIN}/t.js" async></script></body>`);
  const p = await tmpProject();
  const site = await makeSite(p, 'lp', 'doc', { ignore: IGN, cloneHtml: html });
  await fs.writeFile(path.join(site.root, 'clone', '.seed-base.html'), base);
  await fs.mkdir(path.join(site.root, 'clone', 'patches'), { recursive: true });
  await fs.writeFile(path.join(site.root, 'clone', 'patches', 'body-widget.html'), `<script src="${ORIGIN}/t.js" async></script>`);
  await measureAll(site, 'clone'); await reviewAll(site, 'clone'); await measureAll(site, 'app'); await reviewAll(site, 'app');
  const r = status(p, 'lp');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /next: fix the clone: clone\/patches\/body-widget\.html/);
});
test('RC6-06: REPORT renders with a lint finding (a lint row, no crash); its columns follow the sizes (RC6-09)', async () => {
  const p = await tmpProject();
  const site = await makeSite(p, 'rp', 'doc', { ignore: [{ sel: '#w', origin: 'http://localhost:5602', why: 'widget', auto: true }], cloneHtml: '<!doctype html><title>x</title><body><script src="http://localhost:5602/w.js"></script></body>\n' });
  // a distinct value per size, so each column can be told from the others
  const V = { mobile: 91.1, tablet: 92.2, desktop: 93.3, laptop: 94.4, wide: 95.5 };
  await writeUnits(site.root, 'compare', 'layout', Object.entries(V).map(([viewport, value]) => ({ route: '', viewport, value })), await startIdentity(site.root, 'layout'));
  const r = report(p, 'rp');
  assert.equal(r.code, 0, r.out);
  const md = await fs.readFile(path.join(site.root, 'REPORT.md'), 'utf8');
  assert.match(md, /\| Clone lint \| 1 finding/);
  const header = md.split('\n').find((l) => l.startsWith('| Check |')).split('|').map((c) => c.trim());
  const row = md.split('\n').find((l) => l.startsWith('| Layout (structure) |')).split('|').map((c) => c.trim());
  for (const [vp, value] of Object.entries(V)) {
    const col = header.findIndex((c) => c.toLowerCase().startsWith(vp));
    assert.ok(col > 0, `${vp} column`);
    assert.match(row[col], new RegExp(`^${value}`), `${vp}: header and cell agree`);
  }
});
test('RC6-06: score fails when REPORT cannot be written (never exit 0 behind a missing report)', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'sf');
  await fs.mkdir(path.join(site.root, 'REPORT.md'), { recursive: true }); // a directory where the file goes
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, 'score.mjs'), 'sf', '--only', 'detail'], { cwd: p, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } });
  assert.notEqual(r.status, 0, `${r.stdout}${r.stderr}`);
  assert.match(`${r.stdout}${r.stderr}`, /REPORT could not be written/);
});

// ---- RC6-03: a step bounded when it ran without effect, or is named with nothing changing; a running step waited for ----
const journal = async (site, entries) => { await fs.mkdir(path.join(site.root, 'logs'), { recursive: true }); await fs.appendFile(path.join(site.root, 'logs', 'commands.jsonl'), entries.map((e) => `${JSON.stringify(e)}\n`).join('')); };
test('RC6-03: a step that ran and changed nothing, twice, ends Blocked (owner tool), naming the step', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 's');
  await fs.rm(path.join(site.root, 'compare', 'review', 'wide'), { recursive: true });
  let r = status(p, 's');
  assert.match(r.out, /next: npx trueclone review s --size wide/);
  for (let i = 0; i < 3 && r.code === 1; i++) {
    const t = new Date(Date.now() + 5).toISOString();
    await journal(site, [{ event: 'start', step: 'review', args: ['s', '--size', 'wide'], pid: 999999990 + i, startedAt: t }, { event: 'end', step: 'review', pid: 999999990 + i, startedAt: t, endedAt: t, exit: 0 }]);
    await tick();
    r = status(p, 's');
  }
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /ran \d+ times and changed nothing/);
});
// A requested route that failed to capture is dropped from what is measured (capture.mjs), but it stays required: the
// run is Incomplete with it named, never Verified as if the request had been the routes that loaded. A page the request
// left out (not in a --routes list) is not a required item.
test('RC7-E2b: a requested route that failed to capture keeps the run from Verified (Incomplete, the route not verifiable, named)', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'rf');
  assert.equal(status(p, 'rf').code, 0);
  const mf = path.join(site.root, 'reference', 'meta.json');
  const meta = JSON.parse(await fs.readFile(mf, 'utf8'));
  meta.routesNotCaptured = [
    { path: '/NASA%20(Draft).html', from: null, failed: true, why: 'capture failed at every size: the live page did not load (nothing arrived for 30s after 95s): https://example.test/NASA%20(Draft).html' },
    { path: '/later.html', from: '/', why: 'not in the --routes list' },
  ];
  await fs.writeFile(mf, JSON.stringify(meta, null, 2));
  const r = status(p, 'rf');
  assert.equal(r.code, 3, r.out);
  const out = await readJson(site, 'compare/outcome.json');
  assert.equal(out.outcome, 'incomplete');
  for (const side of ['clone', 'app']) {
    const item = out.accounting.items.find((i) => i.id === `${side}:unit:route|/NASA%20(Draft).html||`);
    assert.equal(item?.disposition, 'not-verifiable', `${side}: ${JSON.stringify(out.accounting.items)}`);
    assert.equal(item.owner, 'environment');
    assert.match(item.reason, /^not captured: capture failed at every size/);
  }
  assert.ok(!out.accounting.items.some((i) => /later\.html/.test(i.id)), 'a page not asked for is not a required item');
  const rep = await fs.readFile(path.join(site.root, 'REPORT.md'), 'utf8');
  assert.match(rep, /\*\*Requested, not captured, not verified\*\*: 1 route\(s\)[^\n]*NASA%20\(Draft\)\.html[^\n]*covers the 1 route\(s\) captured, not the request/);
  assert.match(rep, /\*\*Not captured, not verified\*\*: 1 page\(s\)[^\n]*later\.html/);
  await fs.rm(path.join(site.root, '.tc-hash-clone.json'), { force: true });
  await fs.rm(path.join(site.root, '.tc-hash-next.json'), { force: true });
  const a = audit(site.root);
  assert.equal(a.status, 0, `${a.stdout}${a.stderr}`);
});
// The Blocked outcome above says to run status again once a fixed version is installed: under another trueclone version
// the inputs differ, so the step that failed twice is named and run again instead of re-blocked on the old count.
test('RC7-E5: a step failed twice under one trueclone version is run again under another (the Blocked resume holds)', async () => {
  const { inputsDigest, trackStep } = await import('../scripts/progress.mjs');
  const p = await tmpProject();
  const site = await verifiedSite(p, 'rv');
  const cmd = 'npx trueclone reads rv';
  const at = (s) => new Date(Date.parse('2026-10-24T00:00:00Z') + s * 1000);
  const run = (s) => ({ step: 'reads', args: ['rv'], startedAt: at(s).toISOString(), endedAt: at(s + 1).toISOString(), exit: 1 });
  const d1 = await inputsDigest(site.root, { tool: '0.5.0-rc.7' });
  assert.equal(await inputsDigest(site.root, { tool: '0.5.0-rc.7' }), d1, 'the same version, the same inputs');
  const loop = {};
  trackStep(loop, cmd, d1, [], at(0));
  trackStep(loop, cmd, d1, [run(10)], at(20));
  const s = trackStep(loop, cmd, d1, [run(10), run(30)], at(40));
  assert.equal(s.failed, 2, JSON.stringify(s));
  const d2 = await inputsDigest(site.root, { tool: '0.5.0-rc.8' });
  assert.notEqual(d2, d1);
  assert.equal(trackStep(loop, cmd, d2, [run(10), run(30)], at(50)).failed, 0, 'a new version resets the count: the step runs again');
});
// RC7 elise: `reads` failed twice and the run ended Blocked with 323 items "pending", none blocked, and the auditor
// called it consistent. Every item a Blocked outcome did not reach is blocked by its cause, with its owner.
test('RC7-E3/E4: a step that failed twice ends Blocked with nothing pending (unreached items blocked by the cause); the auditor rejects pending at Blocked', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'fb');
  await fs.rm(path.join(site.root, 'compare', 'review', 'wide'), { recursive: true });
  let r = status(p, 'fb');
  assert.match(r.out, /next: npx trueclone review fb --size wide/);
  for (let i = 0; i < 3 && r.code === 1; i++) {
    const t = new Date(Date.now() + 5).toISOString();
    await journal(site, [{ event: 'start', step: 'review', args: ['fb', '--size', 'wide'], pid: 999999980 + i, startedAt: t }, { event: 'end', step: 'review', pid: 999999980 + i, startedAt: t, endedAt: t, exit: 1 }]);
    await tick();
    r = status(p, 'fb');
  }
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /Blocked \(owner: tool\)/);
  const out = await readJson(site, 'compare/outcome.json');
  assert.equal(out.outcome, 'blocked');
  assert.equal(out.accounting.counts.pending, 0, JSON.stringify(out.accounting.counts));
  const unreached = out.accounting.items.filter((i) => i.notReached);
  assert.ok(unreached.length >= 1, JSON.stringify(out.accounting.items));
  for (const i of unreached) { assert.equal(i.disposition, 'blocked'); assert.equal(i.owner, 'tool'); assert.match(i.reason, /^not reached: the run is Blocked \(/); }
  assert.ok(out.accounting.items.some((i) => i.kind === 'review-dir' && i.notReached), 'the review never shot is blocked by the failed step');
  await fs.rm(path.join(site.root, '.tc-hash-clone.json'), { force: true });
  await fs.rm(path.join(site.root, '.tc-hash-next.json'), { force: true });
  let a = audit(site.root);
  assert.equal(a.status, 0, `${a.stdout}${a.stderr}`);
  // the outcome as rc.7 wrote it (unreached items left pending): a finding
  const old = structuredClone(out);
  for (const i of old.accounting.items) if (i.notReached) { i.disposition = 'pending'; i.owner = null; delete i.notReached; }
  old.accounting.counts.pending = unreached.length; old.accounting.counts.blocked -= unreached.length;
  await fs.writeFile(path.join(site.root, 'compare', 'outcome.json'), JSON.stringify(old, null, 2));
  a = audit(site.root);
  assert.equal(a.status, 1, a.stdout);
  assert.match(a.stdout, new RegExp(`${unreached.length} item\\(s\\) are still pending at a blocked outcome`));
  // a Blocked with required items and no accounting at all: a finding too
  delete old.accounting;
  await fs.writeFile(path.join(site.root, 'compare', 'outcome.json'), JSON.stringify(old, null, 2));
  a = audit(site.root);
  assert.equal(a.status, 1, a.stdout);
  assert.match(a.stdout, /the blocked outcome has no accounting of the \d+ required items/);
});
test('RC6-03: a work step named again and again with nothing changing asks once for a Finding, which ends the run with it named', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'id');
  // the clone's verdicts gone: "write review verdicts" is work only the agent can do
  await edit(site, 'notes.md', (await fs.readFile(path.join(site.root, 'notes.md'), 'utf8')).replace(/^- 01-top \w+ \[tok01\]: same\n/gm, ''));
  let r;
  for (let i = 0; i < 4; i++) r = status(p, 'id');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /next: write review verdicts under "## Review"/);
  assert.match(r.out, /named this step 4 times and nothing it depends on changed/);
  assert.match(r.out, /- cannot: write review verdicts \(HTML clone\)/);
  await edit(site, 'notes.md', `${await fs.readFile(path.join(site.root, 'notes.md'), 'utf8')}\n## Findings\n- cannot: write review verdicts (HTML clone): the frames show a page trueclone did not render (a tool defect), evidence: compare/review/wide/00-load-300.png\n`);
  r = status(p, 'id');
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /as recorded under ## Findings/);
  assert.match(r.out, /Blocked \(owner: tool\)/);
});
test('RC6-03: a trueclone command named again and again but never run is "run it", never a declaration; never run at all, Blocked (owner run)', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'nr');
  await fs.rm(path.join(site.root, 'compare', 'review', 'wide'), { recursive: true });
  let r;
  for (let i = 0; i < 4; i++) r = status(p, 'nr');
  assert.match(r.out, /has not been run: run it exactly as written/);
  assert.doesNotMatch(r.out, /write one line under ## Findings/);
  for (let i = 0; i < 6 && r.code === 1; i++) r = status(p, 'nr');
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /Blocked \(owner: run\)/);
});
test('RC6-03: an objective stuck on unchanged content concludes when its Finding says why; the run ends Incomplete with it listed', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'ob');
  await writeUnits(site.root, 'compare', 'scroll', [{ route: '', viewport: 'mobile', value: 92, members: [{ id: '3', y: 1688, value: 92 }] }], await startIdentity(site.root, 'scroll'));
  let r;
  for (let i = 0; i < 4; i++) r = status(p, 'ob');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /- cannot: Scroll states mobile/);
  const notes = await fs.readFile(path.join(site.root, 'notes.md'), 'utf8');
  await edit(site, 'notes.md', `${notes}\n## Findings\n- cannot: Scroll states mobile: the frame needs markup the seed generates (a tool defect), evidence: compare/states/mobile/03.png\n`);
  r = status(p, 'ob');
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /Scroll states mobile: a difference left.*declared not achievable/);
});
test('RC6-03: status while a step runs says "waiting", and never counts it as a repeat', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'run');
  await fs.rm(path.join(site.root, 'compare', 'review', 'wide'), { recursive: true });
  const sleeper = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)']);
  try {
    await journal(site, [{ event: 'start', step: 'review', args: ['run', '--size', 'wide'], pid: sleeper.pid, startedAt: new Date().toISOString() }]);
    for (let i = 0; i < 5; i++) { const r = status(p, 'run'); assert.equal(r.code, 1, r.out); assert.match(r.out, /waiting: `review run --size wide`/); }
    const loop = await readJson(site, 'compare/loop.json');
    assert.equal(Object.keys(loop.steps || {}).length, 0);
  } finally { sleeper.kill(); }
});

// ---- RC6-21: the auditor is read-only, and finds a run that did not end ----
const audit = (root) => spawnSync(process.execPath, [fileURLToPath(new URL('../tools/audit-run.mjs', import.meta.url)), root], { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } });
const snapshot = async (dir) => { const out = []; const walk = async (d) => { for (const e of await fs.readdir(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) await walk(p); else { const st = await fs.stat(p); out.push(`${path.relative(dir, p)}|${st.size}|${st.mtimeMs}`); } } }; await walk(dir); return out.sort().join('\n'); };
test('RC6-21: the auditor writes nothing; a verified run is clean; a run left at "in progress" is a finding', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'au', 'doc', { interactions: ['menu'] });
  assert.equal(status(p, 'au').code, 0);
  await fs.rm(path.join(site.root, '.tc-hash-clone.json'), { force: true });
  await fs.rm(path.join(site.root, '.tc-hash-next.json'), { force: true });
  const before = await snapshot(site.root);
  let r = audit(site.root);
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  assert.equal(await snapshot(site.root), before, 'nothing written');
  // the clone changed after the outcome, and status was run once (exit 1): the run has not ended
  await edit(site, 'clone/script.js', '// changed\nconst a = 1;\nconst b = 2;\nconst c = 3;\nconst d = 4;\nconsole.log(a + b + c + d);\n');
  assert.equal(status(p, 'au').code, 1);
  r = audit(site.root);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /the run did not end/);
});

// ---- RC6-17: pages the site links to, left out at the route cap, are named once and listed in REPORT ----
test('RC6-17: pages left out at the route cap: status asks once (capture again with them, or say why out of scope); REPORT lists them', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'rt', 'doc', { routes: ['/about'] });
  const meta = JSON.parse(await fs.readFile(path.join(site.root, 'reference', 'meta.json'), 'utf8'));
  meta.routesNotCaptured = [{ path: '/NASA%20(Draft).html', from: '/Landing%20Page.html', why: 'beyond the cap of 2 routes (--routes <n> for more)' }];
  await fs.writeFile(path.join(site.root, 'reference', 'meta.json'), JSON.stringify(meta));
  // meta changed: everything was measured against it (the route list is the reference's identity: unchanged here)
  let r = status(p, 'rt');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /next: npx trueclone capture \S+ rt --routes 3/);
  r = status(p, 'rt');
  assert.doesNotMatch(r.out, /--routes 3/, 'asked once');
  report(p, 'rt');
  assert.match(await fs.readFile(path.join(site.root, 'REPORT.md'), 'utf8'), /Not captured, not verified\*\*: 1 page\(s\)[^\n]*NASA%20\(Draft\)\.html/);
});

// ---- RC7-37: reference masks taken with another structure mask are taken again (never compared unevenly) ----
test('RC7-37: a reference masked with an earlier structure mask is captured again before anything is measured against it', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'mk', 'doc', { exact: true });
  const meta = JSON.parse(await fs.readFile(path.join(site.root, 'reference', 'meta.json'), 'utf8'));
  delete meta.maskVersion;
  await fs.writeFile(path.join(site.root, 'reference', 'meta.json'), JSON.stringify(meta));
  const r = status(p, 'mk');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /next: npx trueclone capture \S+ mk --mode exact --permission "test"/);
  assert.match(r.out, /structure mask/);
});

// ---- RC7-27: a unit the reference varies on is judged frame by frame (envelope where it varies, bar elsewhere) ----
test('RC7-27: a journey the reference varies on passes within its envelope, fails a stable checkpoint below its bar, and stays "not verifiable" without an envelope', async () => {
  const { evaluate } = await import('../scripts/verdict.mjs');
  const { refIdOf } = await import('../scripts/identity.mjs');
  const cases = [
    ['within its envelope', { value: 70, envelope: { pass: true, value: 71, bar: 60, reason: 'nearest draw 71' } }, 99, 'pass'],
    ['a stable checkpoint below its bar', { value: 70, envelope: { pass: true, value: 71, bar: 60, reason: 'nearest draw 71' } }, 60, 'fail'],
    ['outside its envelope', { value: 40, envelope: { pass: false, value: 41, bar: 60, reason: 'below every draw' } }, 99, 'fail'],
    ['no envelope measured', { value: 70 }, 99, 'tool'],
  ];
  for (const [label, varying, stable, want] of cases) {
    const p = await tmpProject();
    const site = await verifiedSite(p, 'j', 'app');
    // the reference varies on itself at desktop (the unit, and checkpoint "step-1"), not at "load"
    const noise = JSON.parse(await fs.readFile(path.join(site.root, 'reference', 'noise.json'), 'utf8'));
    noise.refId = refIdOf(site.meta);
    noise.entries = { 'journey||desktop|': { self: 80, spread: 5, draws: 3 }, 'journey||desktop|step-1': { self: 50, spread: 16, draws: 3 }, 'journey||desktop|load': { self: 100, spread: 0, draws: 3 } };
    await fs.writeFile(path.join(site.root, 'reference', 'noise.json'), JSON.stringify(noise));
    await writeUnits(site.root, 'compare', 'journey', [{ viewport: 'desktop', value: 80, members: [{ id: 'load', value: stable }, { id: 'step-1', ...varying }] }, { viewport: 'mobile', value: 99.5, members: [{ id: 'load', value: 99.5 }, { id: 'step-1', value: 99.5 }] }], await startIdentity(site.root, 'journey'));
    const ev = await evaluate(site.root, { side: 'clone' });
    const u = ev.units.find((x) => x.check === 'journey' && x.viewport === 'desktop');
    assert.equal(u.status, want, `${label}: ${u.status} ${u.reason}`);
  }
});

// ---- RC6-14: REPORT follows the notes ----
test('RC6-14: a verdict written after the last score shows in REPORT at the next status', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'f');
  await edit(site, 'notes.md', (await fs.readFile(path.join(site.root, 'notes.md'), 'utf8')).replace(/(01-top wide \[tok01\]): same/, '$1: differs: the hero is cut'));
  status(p, 'f');
  const md = await fs.readFile(path.join(site.root, 'REPORT.md'), 'utf8');
  assert.match(md, /the hero is cut/);
});

// ---- RC6-08: the hash cache under concurrent writers; RC6-13: a dead holder's lock ----
test('RC6-08: 8 processes hashing one folder at once, 25 rounds: no failure; a corrupted cache is read as empty', async () => {
  const p = await tmpProject();
  const dir = path.join(p, 'clone');
  await fs.mkdir(dir, { recursive: true });
  for (let i = 0; i < 300; i++) await fs.writeFile(path.join(dir, `f${i}.txt`), `file ${i} `.repeat(50));
  const cache = path.join(p, '.tc-hash-clone.json');
  const child = `import { contentHash } from ${JSON.stringify(new URL('../scripts/identity.mjs', import.meta.url).href)};\nconst h = await contentHash(${JSON.stringify(dir)}, ${JSON.stringify(cache)});\nprocess.stdout.write(h || 'null');\n`;
  const file = path.join(p, 'child.mjs');
  await fs.writeFile(file, child);
  let failures = 0;
  const hashes = new Set();
  for (let round = 0; round < 25; round++) {
    await fs.writeFile(cache, '');
    const outs = await Promise.all(Array.from({ length: 8 }, () => new Promise((resolve) => { const c = spawn(process.execPath, [file]); let o = ''; c.stdout.on('data', (d) => { o += d; }); c.on('close', (code) => resolve({ code, o })); })));
    for (const r of outs) { if (r.code !== 0) failures++; else hashes.add(r.o); }
  }
  assert.equal(failures, 0);
  assert.equal(hashes.size, 1);
  await fs.writeFile(cache, '{"f1.txt": {"size"');
  assert.equal(await contentHash(dir, cache), [...hashes][0]);
});
test('RC6-13: a timing lock held by a process that is gone is taken over at once', async () => {
  const lock = timingLockFile();
  const before = await fs.readFile(lock, 'utf8').catch(() => null);
  if (before) return; // another trueclone measurement is running on this machine: leave it alone
  await fs.writeFile(lock, `999999993:behaviour killed:${Date.now()}`);
  const h = await timingLockHolder();
  assert.equal(h.alive, false);
  const t0 = Date.now();
  await withMachineLock('test', async () => {});
  assert.ok(Date.now() - t0 < 1500, 'taken over without waiting');
  assert.equal(await fs.readFile(lock, 'utf8').catch(() => null), null);
});
