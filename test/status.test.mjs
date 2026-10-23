// status (scripts/status.mjs), run as a user runs it. The golden false-pass suite: every way RC4 (and the RC5 pipeline
// audit, docs/plan-rc5/research/pipeline.md) found to reach exit 0 without a verified clone must now end elsewhere, and a
// verified site must still reach exit 0 (exit codes: 0 verified, 1 work left, 2 blocked, 3 incomplete).
import { test, after } from 'node:test';
// the golden cases record failed measurements in this process (results.mjs then sets exit code 1, as a check would)
after(() => { process.exitCode = 0; });
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { writeUnits } from '../scripts/results.mjs';
import { startIdentity } from '../scripts/identity.mjs';
import { tmpProject, makeSite, measureAll, reviewAll, verifiedSite, status, report, edit, readJson, scriptEdit } from './helpers/site.mjs';

test('true pass: a verified site (clone and app) exits 0 and says Verified', async () => {
  const p = await tmpProject();
  await verifiedSite(p, 'ok', 'doc', { routes: ['/about'], interactions: ['menu'] });
  const r = status(p, 'ok');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Verified/);
  const out = await readJson({ root: path.join(p, 'sites', 'ok') }, 'compare/outcome.json');
  assert.equal(out.outcome, 'verified');
});

test('true pass: a verified canvas app exits 0', async () => {
  const p = await tmpProject();
  await verifiedSite(p, 'app', 'app');
  const r = status(p, 'app');
  assert.equal(r.code, 0, r.out);
});

const golden = [
  ['P1 missing result files', async (s) => { await fs.rm(path.join(s.root, 'compare', 'results', 'detail.json')); await fs.rm(path.join(s.root, 'compare', 'results', 'load.json')); }],
  ['P2/P3 one width measured, the rest gone', async (s) => { await fs.rm(path.join(s.root, 'compare', 'results', 'scroll.json')); await writeUnits(s.root, 'compare', 'scroll', [{ route: '', viewport: 'desktop', value: 99 }], await startIdentity(s.root, 'scroll')); }],
  ['VAR-1 the app fails a check the clone passes', async (s) => { await writeUnits(s.root, 'compare-next', 'scroll', [{ route: '', viewport: 'desktop', value: 99, members: [{ id: '17', y: 7650, value: 50 }] }], await startIdentity(s.root, 'scroll', 'app')); }],
  ['A11 the app edited after it was verified', async (s) => { await edit(s, 'next/app/page.tsx', 'export default function Page() { return <main/>; }\n'); }],
  ['A11 an app result missing', async (s) => { await fs.rm(path.join(s.root, 'compare-next', 'results', 'load.json')); }],
  ['VAR-4/A14 a measurement that failed', async (s) => { await writeUnits(s.root, 'compare', 'load', [{ viewport: 'wide', value: null, error: 'load timed out' }], await startIdentity(s.root, 'load')); }],
  ['P6/P7 the clone edited after everything was measured and reviewed', async (s) => { await edit(s, 'clone/script.js', scriptEdit('z05uq')); }],
  ['P4 the live site changed since the capture (drift)', async (s) => { const meta = JSON.parse(await fs.readFile(path.join(s.root, 'reference', 'meta.json'), 'utf8')); const { refIdOf } = await import('../scripts/identity.mjs'); await fs.writeFile(path.join(s.root, 'compare', 'drift.json'), JSON.stringify({ refId: refIdOf(meta), stale: true, unreachable: [], viewports: [{ viewport: 'desktop', stale: true }] })); }],
  ['P8 the motion map edited after measuring', async (s) => { await edit(s, 'motion-map.json', JSON.stringify([{ name: 'hero', ref: '.hero', clone: '.x', props: ['ty'] }])); }],
  ['ALLBIRDS-2 a new --hide (new visit profile)', async (s) => { const meta = JSON.parse(await fs.readFile(path.join(s.root, 'reference', 'meta.json'), 'utf8')); await edit(s, 'reference/meta.json', JSON.stringify({ ...meta, hide: ['#geo'] })); }],
  ['A18 a capture that did not finish', async (s) => { const meta = JSON.parse(await fs.readFile(path.join(s.root, 'reference', 'meta.json'), 'utf8')); await edit(s, 'reference/meta.json', JSON.stringify({ ...meta, complete: false })); }],
  ['ASTRO-4 a seed that did not complete', async (s) => { await fs.rm(path.join(s.root, 'clone', '.seed.json')); }],
  ['ALLBIRDS-8 review closed by "tool" without frame evidence', async (s) => { const n = await fs.readFile(path.join(s.root, 'notes.md'), 'utf8'); await edit(s, 'notes.md', n.replace(/: same$/gm, ': tool: varies; evidence: notes.md')); }],
  // rc.5 Stage 3
  ['R6 the reference never measured against itself (no noise.json)', async (s) => { await fs.rm(path.join(s.root, 'reference', 'noise.json')); }],
  ['R6 a calibration from an earlier capture', async (s) => { const n = JSON.parse(await fs.readFile(path.join(s.root, 'reference', 'noise.json'), 'utf8')); await edit(s, 'reference/noise.json', JSON.stringify({ ...n, refId: 'older' })); }],
  ['R5 a reference captured before symmetric measurement (no seed, clock, motion record)', async (s) => { const meta = JSON.parse(await fs.readFile(path.join(s.root, 'reference', 'meta.json'), 'utf8')); delete meta.stabilise; await edit(s, 'reference/meta.json', JSON.stringify(meta)); }],
  ['D1 a stopped marquee (behaviour fails while every still passes)', async (s) => { await writeUnits(s.root, 'compare', 'behaviour', [{ route: '', viewport: 'desktop', value: 50, members: [{ id: 'move@745', y: 745, value: 0, reason: 'does not move: the reference moves leftwards at 52.3 px/s' }, { id: 'cycle@849', y: 849, value: 100 }] }], await startIdentity(s.root, 'behaviour')); }],
  ['D2 the reduced-motion page never measured', async (s) => { await fs.rm(path.join(s.root, 'compare', 'results', 'reduced.json')); }],
  ['R9 a verdict given to an earlier picture (perceptual token far away)', async (s) => { const f = path.join(s.root, 'compare', 'review', 'wide', 'frames.json'); const fr = JSON.parse(await fs.readFile(f, 'utf8')); fr.frames[0].token = '0f0f0f0f0f0f0f0f'; await fs.writeFile(f, JSON.stringify(fr)); }],
];
for (const [label, mutate] of golden) {
  test(`golden false-pass: ${label} never exits 0`, async () => {
    const p = await tmpProject();
    const site = await verifiedSite(p, 'g', 'doc', { curves: true });
    await mutate(site);
    const r = status(p, 'g');
    assert.notEqual(r.code, 0, `${label}: exited 0\n${r.out}`);
  });
}

test('golden false-pass: the instrument modified (NODE_OPTIONS preload) is Blocked (exit 2), never measured', async () => {
  const p = await tmpProject();
  await verifiedSite(p, 'mod');
  // a preload like RC4 allbirds' warm-profile.mjs: harmless here, but code loaded into the instrument all the same
  const preload = path.join(p, 'warm-profile.mjs');
  await fs.writeFile(preload, '// preloaded into node\n');
  const r = status(p, 'mod', { NODE_OPTIONS: `--import=${new URL(`file:///${preload.replace(/\\/g, '/')}`).href}` });
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /Blocked/);
});

test('report is idempotent: running it repeatedly changes no loop state and counts no attempt (A16)', async () => {
  const p = await tmpProject();
  const site = await makeSite(p, 'idem');
  await measureAll(site, 'clone', { value: 90 });
  await reviewAll(site);
  status(p, 'idem');
  const before = await readJson(site, 'compare/loop.json');
  for (let i = 0; i < 3; i++) report(p, 'idem');
  status(p, 'idem');
  const after = await readJson(site, 'compare/loop.json');
  const a = (l) => Object.values(l.objectives).reduce((n, o) => n + o.attempts, 0);
  assert.equal(a(after), a(before));
  assert.equal(a(after), 0);
});

test('a failing clone gets an objective step (work left, exit 1), keyed by check and size', async () => {
  const p = await tmpProject();
  const site = await makeSite(p, 'fail');
  await measureAll(site, 'clone', { value: 99.5 });
  await writeUnits(site.root, 'compare', 'scroll', [{ route: '', viewport: 'mobile', value: 92, members: [{ id: '3', y: 1688, value: 92 }] }], await startIdentity(site.root, 'scroll'));
  await reviewAll(site);
  const r = status(p, 'fail');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /Scroll states mobile/);
  const loop = await readJson(site, 'compare/loop.json');
  assert.ok(Object.keys(loop.objectives).includes('clone:scroll::mobile:'));
});

test('ZERO-3: the review comes right after the first score, before any fix', async () => {
  const p = await tmpProject();
  const site = await makeSite(p, 'rev', 'app');
  await measureAll(site, 'clone', { value: 80, members: [{ id: 'load', value: 80 }, { id: 'step-1', value: 80 }] });
  const r = status(p, 'rev');
  assert.equal(r.code, 1);
  assert.match(r.out, /journey|review/i);
  assert.doesNotMatch(r.out, /make checkpoint/);
});

test('incomplete: when the loop concludes with differences left, status exits 3 with best and current values, and the run is resumable', async () => {
  const p = await tmpProject();
  const site = await makeSite(p, 'inc');
  await measureAll(site, 'app');
  const ident = async () => startIdentity(site.root, 'scroll');
  // the same failure on every new content: attempts without progress until the objective concludes
  for (let i = 0; i < 12; i++) {
    await edit(site, 'clone/script.js', scriptEdit(i));
    await measureAll(site, 'clone', { value: 99.5 });
    await writeUnits(site.root, 'compare', 'scroll', [{ route: '', viewport: 'mobile', value: 92, members: [{ id: '3', y: 1688, value: 92 }] }], await ident());
    await reviewAll(site);
    const r = status(p, 'inc');
    if (r.code === 3) {
      assert.match(r.out, /Incomplete/);
      assert.match(r.out, /best 92 \(shortfall 3\), now 92/);
      const out = await readJson(site, 'compare/outcome.json');
      assert.equal(out.outcome, 'incomplete');
      assert.match(out.resume, /status/);
      const rep = await fs.readFile(path.join(site.root, 'REPORT.md'), 'utf8');
      assert.match(rep, /Incomplete/);
      // every item not verified, by what happened to it (accounting.mjs), and how the loop got there
      assert.match(rep, /### Not verified \(1 of \d+ required\)[\s\S]*Scroll states mobile \| clone \| fail \| difference left/);
      assert.match(rep, /How the loop got there/);
      assert.equal(out.accounting.counts.unresolved, 1);
      assert.equal(out.accounting.counts.pending, 0);
      return;
    }
    if (/next: record a change of strategy/.test(r.out)) continue; // the strategy step, never recorded here
    assert.equal(r.code, 1, r.out);
    // after the clone verifies on the app side, status would ask for next --verify: keep the app measured
    if (/next \S+ --verify/.test(r.out)) { await measureAll(site, "app"); await reviewAll(site, "app"); }
  }
  assert.fail('never reached exit 3');
});

// D3 and the evaluation-only controls: the clone lint (verdict.mjs lintSubject)
const WIDGET = [{ sel: '#ads-agent-host', why: 'third-party widget from http://localhost:5602', origin: 'http://localhost:5602', auto: true }];
const lintCases = [
  ['the clone keeps an excluded third-party widget', { ignore: WIDGET, cloneHtml: '<!doctype html><title>x</title><body><h1>clone</h1><script src="http://localhost:5602/widget.js" async></script><script src="script.js" defer></script></body>\n' }, /keeps #ads-agent-host/],
  ['the clone fixes its own randomness', { cloneScript: 'Math.random = () => 0.5;\nconst a = 1;\nconst b = 2;\nconst c = 3;\nconst d = 4;\nconsole.log(a + b + c + d);\n' }, /replaces Math\.random/],
  ['the clone stops an animation the reference runs', { cloneHtml: '<!doctype html><title>x</title><style>.track{animation: none}</style><body><h1>clone</h1><script src="script.js" defer></script></body>\n' }, /stops 1 animation\(s\) the reference's own CSS does not/],
];
for (const [label, opts, want] of lintCases) {
  test(`golden false-pass (lint): ${label} never exits 0`, async () => {
    const p = await tmpProject();
    await verifiedSite(p, 'l', 'doc', opts);
    const r = status(p, 'l');
    assert.notEqual(r.code, 0, r.out);
    assert.match(r.out, want);
  });
}
test('true pass (D3): a widget excluded on both sides and left out of the clone; a stop inside prefers-reduced-motion is the site\'s own rule', async () => {
  const p = await tmpProject();
  await verifiedSite(p, 'tp', 'doc', { ignore: WIDGET, cloneHtml: '<!doctype html><title>x</title><style>@media (prefers-reduced-motion: reduce) { .track { animation: none } }</style><body><h1>clone</h1><script src="script.js" defer></script></body>\n' });
  const r = status(p, 'tp');
  assert.equal(r.code, 0, r.out);
});

// RC5 zero (2026-10-22): a review frame marked "differs" crashed status in loop.mjs (a review objective had no member
// list), and the crash exited 1, which an agent reads as "work left". It must be a step; and any failure of status
// itself must end Blocked (exit 2) with the cause, never as work left.
test('a review frame marked "differs" is a step (exit 1, the frame named), not a crash', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'rv', 'app');
  const n = await fs.readFile(path.join(site.root, 'notes.md'), 'utf8');
  await edit(site, 'notes.md', n.replace(/(journey\/00-load desktop \[[^\]]+\]): same/, '$1: differs: the clone shows a loader where the reference shows the scene'));
  const r = status(p, 'rv');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /review frame journey\/00-load/);
  assert.doesNotMatch(r.out, /TypeError/);
});

test('a failure inside status itself ends Blocked (exit 2) with the cause and a resume line, never exit 1', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'crash');
  const { refIdOf } = await import('../scripts/identity.mjs');
  // a loop record status cannot read (objectives not an object)
  await fs.mkdir(path.join(site.root, 'compare'), { recursive: true });
  await fs.writeFile(path.join(site.root, 'compare', 'loop.json'), JSON.stringify({ refId: refIdOf(site.meta), objectives: 'broken', run: null }));
  const r = status(p, 'crash');
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /Blocked: trueclone itself failed/);
  const out = await readJson(site, 'compare/outcome.json');
  assert.equal(out.outcome, 'blocked');
  assert.equal(out.owner, 'tool');
  // the cause is kept whole (the error and where it happened), never hidden behind the safety net
  assert.match(out.error, /Error/);
  assert.match(out.error, /at /);
});

// rc.6: "capture again" keeps the site's own settings (rc.5 printed `capture <url> <name>`, which would have turned an
// exact-mode site into template mode)
test('a re-capture step keeps exact mode and its permission', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'z5', 'app', { exact: true });
  const meta = JSON.parse(await fs.readFile(path.join(site.root, 'reference', 'meta.json'), 'utf8'));
  await edit(site, 'reference/meta.json', JSON.stringify({ ...meta, complete: false }));
  const r = status(p, 'z5');
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes('next: npx trueclone capture http://127.0.0.1:9/ z5 --mode exact --permission "test"'), r.out);
});

// a reference journey read again (here: to complete the bundle) makes its calibration and the journey's results stale
test('reading the reference journey again calls for calibration again, and the journey results measured against the old run stop counting', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'zr', 'app');
  await new Promise((r) => setTimeout(r, 20));
  await edit(site, 'reference/journey/journey.json', JSON.stringify({ viewports: [], at: new Date().toISOString() }));
  const r = status(p, 'zr');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /next: npx trueclone calibrate zr/);
  assert.match(r.out, /read again after the calibration/);
  const { evaluate } = await import('../scripts/verdict.mjs');
  const ev = await evaluate(site.root, { side: 'clone' });
  assert.ok(ev.units.filter((u) => u.check === 'journey').every((u) => u.status === 'invalid'), JSON.stringify(ev.units.map((u) => [u.check, u.status])));
});

// RC5 zero: empty files in the own bundle. Re-recorded once by the reference journey; still not whole: Blocked
test('an own bundle with files that are not whole is recorded again once, then Blocked with the files named', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'zb', 'app', { exact: true });
  const meta = JSON.parse(await fs.readFile(path.join(site.root, 'reference', 'meta.json'), 'utf8'));
  await edit(site, 'reference/meta.json', JSON.stringify({ ...meta, bundle: true }));
  const { refIdOf } = await import('../scripts/identity.mjs');
  await edit(site, 'reference/noise.json', JSON.stringify({ refId: refIdOf({ ...meta, bundle: true }), at: '2026-10-22T02:00:00.000Z', entries: {}, drawDirs: [] }));
  await fs.mkdir(path.join(site.root, 'reference', 'bundle', 'x.test'), { recursive: true });
  await fs.writeFile(path.join(site.root, 'reference', 'bundle', 'x.test', 'frost.webp'), '');
  await fs.writeFile(path.join(site.root, 'reference', 'bundle', 'manifest.json'), JSON.stringify({ entries: { 'https://x.test/frost.webp': { file: 'x.test/frost.webp', type: 'image/webp', kind: 'fetch' } } }));
  let r = status(p, 'zb');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /next: npx trueclone journey zb/);
  assert.match(r.out, /frost\.webp/);
  // the journey ran (the manifest is written again) and the file is still empty
  await new Promise((res) => setTimeout(res, 30));
  await fs.writeFile(path.join(site.root, 'reference', 'bundle', 'manifest.json'), JSON.stringify({ entries: { 'https://x.test/frost.webp': { type: 'image/webp', kind: 'fetch', failed: 'lost body (0 of 145028 bytes), recovery answered HTTP 403', attempts: 2 } } }));
  r = status(p, 'zb');
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /Blocked \(owner: tool\): 1 of the site's own files could not be recorded/);
  assert.equal((await readJson(site, 'compare/outcome.json')).outcome, 'blocked');
});
