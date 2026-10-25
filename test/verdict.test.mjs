// The evaluator (scripts/verdict.mjs): every required result has a state, and nothing absent, partial, stale, invalid
// or failed is ever read as a pass. Each test names the RC4 finding it guards (docs/eval-rc4, docs/plan-rc5/PLAN.md).
import { test, after } from 'node:test';
// the golden cases record failed measurements in this process (results.mjs then sets exit code 1, as a check would)
after(() => { process.exitCode = 0; });
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { evaluate } from '../scripts/verdict.mjs';
import { writeUnits } from '../scripts/results.mjs';
import { startIdentity } from '../scripts/identity.mjs';
import { tmpProject, makeSite, measureAll, reviewAll, verifiedSite, edit, notesWith, scriptEdit } from './helpers/site.mjs';

const states = (ev, check) => ev.units.filter((u) => u.check === check && !u.plan).map((u) => u.status);

test('a complete, passing site is verified (true pass: the rules are not over-strict)', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'ok', 'doc', { routes: ['/about'], interactions: ['menu opens'], curves: true });
  const ev = await evaluate(site.root);
  assert.equal(ev.verified, true, JSON.stringify(ev.counts));
  // a conversion measured and reviewed the same way is verified on its side (its own source checks are conversion.mjs)
  await fs.mkdir(path.join(site.root, 'nextjs', 'app'), { recursive: true });
  await edit(site, 'nextjs/app/page.tsx', 'export default function Page() { return null; }\n');
  await measureAll(site, 'app');
  await reviewAll(site, 'app');
  const evApp = await evaluate(site.root, { side: 'app' });
  assert.equal(evApp.verified, true, JSON.stringify(evApp.counts));
  assert.deepEqual(evApp.written, {}, 'the clone\'s notes and coverage are never the conversion\'s checks');
});

test('a canvas app with its journey measured and reviewed is verified', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'app', 'app');
  assert.equal((await evaluate(site.root)).verified, true);
});

test('P1 / VAR-4: a check whose results are missing is missing, never absent', async () => {
  const p = await tmpProject();
  const site = await makeSite(p, 'missing');
  await measureAll(site, 'clone', { skip: ['detail', 'load'] });
  await reviewAll(site);
  const ev = await evaluate(site.root);
  assert.equal(ev.verified, false);
  assert.deepEqual([...new Set(states(ev, 'detail'))], ['missing']);
  assert.deepEqual([...new Set(states(ev, 'load'))], ['missing']);
});

test('P2 / P3 / VAR-3: a run that measured one width leaves the other widths missing, held-out sizes included', async () => {
  const p = await tmpProject();
  const site = await makeSite(p, 'partial');
  await measureAll(site, 'clone', { onlyVps: ['desktop'] });
  await reviewAll(site);
  const ev = await evaluate(site.root);
  assert.equal(ev.verified, false);
  const scroll = ev.units.filter((u) => u.check === 'scroll');
  assert.equal(scroll.find((u) => u.viewport === 'desktop').status, 'pass');
  for (const v of ['tablet', 'mobile', 'laptop', 'wide']) assert.equal(scroll.find((u) => u.viewport === v).status, 'missing', v);
});

test('a partial re-measure merges: units it did not measure keep their own result', async () => {
  const p = await tmpProject();
  const site = await makeSite(p, 'merge');
  await measureAll(site);
  await writeUnits(site.root, 'compare', 'scroll', [{ route: '', viewport: 'mobile', value: 50, members: [] }], await startIdentity(site.root, 'scroll'));
  const ev = await evaluate(site.root);
  const scroll = ev.units.filter((u) => u.check === 'scroll' && !u.route);
  assert.equal(scroll.find((u) => u.viewport === 'mobile').status, 'fail');
  assert.equal(scroll.find((u) => u.viewport === 'desktop').status, 'pass');
  assert.equal(scroll.length, 5);
});

test('P6 / P7 / A9: results measured before a clone edit are stale, and so are the review frames', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'stale');
  await edit(site, 'clone/script.js', scriptEdit('8l1yt'));
  const ev = await evaluate(site.root);
  assert.equal(ev.verified, false);
  assert.ok(ev.units.filter((u) => !u.plan).every((u) => ['stale', 'na'].includes(u.status) || u.check === 'hovers'), JSON.stringify(ev.counts));
  assert.equal(ev.review.status, 'stale');
});

test('a stale result keeps what it said about the earlier content (prior) without counting as either', async () => {
  const p = await tmpProject();
  const site = await makeSite(p, 'prior');
  await measureAll(site, 'clone', { value: 90 });
  await edit(site, 'clone/script.js', scriptEdit('c9ylx'));
  const ev = await evaluate(site.root);
  const u = ev.units.find((x) => x.check === 'layout' && x.viewport === 'desktop');
  assert.equal(u.status, 'stale');
  assert.equal(u.prior, 'fail');
});

test('a copy that changes nothing (touch) does not make results stale: content, not times', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'touch');
  const f = path.join(site.root, 'clone', 'script.js');
  const t = new Date();
  await fs.utimes(f, t, t);
  assert.equal((await evaluate(site.root)).verified, true);
});

test('ALLBIRDS-2 / -3: a new capture or visit profile (--hide) invalidates every earlier result', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'refchange');
  const meta = JSON.parse(await fs.readFile(path.join(site.root, 'reference', 'meta.json'), 'utf8'));
  await edit(site, 'reference/meta.json', JSON.stringify({ ...meta, hide: ['#geo'] }));
  const ev = await evaluate(site.root);
  assert.equal(ev.verified, false);
  assert.ok(ev.units.filter((u) => !u.plan).every((u) => u.status === 'invalid'));
});

test('P8 / ALLBIRDS-14: editing the motion map after measuring invalidates the motion results', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'map', 'doc', { curves: true });
  await edit(site, 'motion-map.json', JSON.stringify([{ name: 'hero', ref: '.hero', clone: '.hero', props: ['ty', 'opacity'] }]));
  const ev = await evaluate(site.root);
  assert.deepEqual([...new Set(states(ev, 'curves'))], ['invalid']);
  assert.equal(ev.verified, false);
});

test('ALLBIRDS-3: results measured by a modified instrument are invalid', async () => {
  const p = await tmpProject();
  const site = await makeSite(p, 'modified');
  await measureAll(site);
  await reviewAll(site);
  const ident = await startIdentity(site.root, 'layout');
  await writeUnits(site.root, 'compare', 'layout', [{ route: '', viewport: 'desktop', value: 100 }], { ...ident, env: { instrumentModified: true, reasons: ['NODE_OPTIONS loads code'] } });
  const ev = await evaluate(site.root);
  assert.equal(ev.units.find((u) => u.check === 'layout' && u.viewport === 'desktop' && !u.route).status, 'invalid');
  assert.equal(ev.verified, false);
});

test('VAR-4 / A14: a measurement that failed is an error, never a pass', async () => {
  const p = await tmpProject();
  const site = await makeSite(p, 'err');
  await measureAll(site);
  await reviewAll(site);
  await writeUnits(site.root, 'compare', 'load', [{ viewport: 'wide', value: null, error: 'load timeout' }], await startIdentity(site.root, 'load'));
  const ev = await evaluate(site.root);
  assert.equal(ev.units.find((u) => u.check === 'load' && u.viewport === 'wide').status, 'error');
  assert.equal(ev.verified, false);
});

test('P5: an accepted difference never covers a stale result', async () => {
  const p = await tmpProject();
  const site = await makeSite(p, 'accepted');
  await measureAll(site, 'clone', { value: 99.5 });
  await writeUnits(site.root, 'compare', 'layout', [{ route: '', viewport: 'desktop', value: 96 }], await startIdentity(site.root, 'layout'));
  await fs.writeFile(path.join(site.root, 'evidence.png'), 'x');
  await edit(site, 'notes.md', notesWith([], '\n## Accepted differences\n- layout desktop hero: a font hinting difference; evidence: evidence.png\n'));
  let ev = await evaluate(site.root);
  assert.equal(ev.units.find((u) => u.check === 'layout' && u.viewport === 'desktop' && !u.route).status, 'accepted');
  await edit(site, 'clone/script.js', scriptEdit('qfsvu'));
  ev = await evaluate(site.root);
  assert.equal(ev.units.find((u) => u.check === 'layout' && u.viewport === 'desktop' && !u.route).status, 'stale');
});

test('a mean above target with one frame below its floor fails (the floor is per frame)', async () => {
  const p = await tmpProject();
  const site = await makeSite(p, 'floor');
  await measureAll(site, 'clone', { value: 96, members: [{ id: '0', y: 0, value: 99 }, { id: '7', y: 7650, value: 50 }] });
  const ev = await evaluate(site.root);
  const u = ev.units.find((x) => x.check === 'scroll' && x.viewport === 'desktop');
  assert.equal(u.status, 'fail');
  assert.equal(u.membersBelow[0].y, 7650);
  assert.ok(u.shortfall >= 30);
});

test('interactions: every planned scenario is required; a retired one is not; one never run is missing', async () => {
  const p = await tmpProject();
  const site = await makeSite(p, 'interact', 'doc', { interactions: ['menu opens', 'tab 2'] });
  await measureAll(site);
  await writeUnits(site.root, 'compare', 'interact', [{ state: 'menu opens', value: 99, score: 99, pass: true }, { state: '_plan', scenarios: ['menu opens', 'tab 2', 'swipe'] }], await startIdentity(site.root, 'interact'), { replaceRoutes: (k) => k.state === 'tab 2' });
  const ev = await evaluate(site.root);
  const it = ev.units.filter((u) => u.check === 'interact' && !u.plan);
  assert.equal(it.find((u) => u.scenario === 'menu opens').status, 'pass');
  assert.equal(it.find((u) => u.scenario === 'tab 2').status, 'missing');
  assert.equal(it.find((u) => u.scenario === 'swipe').status, 'missing');
});

test('BHASKAR-1 class: a scenario the tool could not run is the tool\'s (not verified), never a pass', async () => {
  const p = await tmpProject();
  const site = await makeSite(p, 'toolonly', 'doc', { interactions: ['tabs'] });
  await measureAll(site);
  await reviewAll(site);
  await writeUnits(site.root, 'compare', 'interact', [{ state: 'tabs', value: null, pass: false, toolOnly: 'could not run on the reference' }, { state: '_plan', scenarios: ['tabs'] }], await startIdentity(site.root, 'interact'));
  const ev = await evaluate(site.root);
  assert.equal(ev.units.find((u) => u.scenario === 'tabs').status, 'tool');
  assert.equal(ev.verified, false);
});

test('ALLBIRDS-8: "tool" verdicts need evidence for that frame; a clone-only element is a difference; most frames "tool" reopens the review', async () => {
  const p = await tmpProject();
  const site = await makeSite(p, 'review');
  await measureAll(site);
  await reviewAll(site, 'clone', { verdict: 'tool: the assistant varies; evidence: shared.json' });
  await fs.writeFile(path.join(site.root, 'shared.json'), '{}');
  let ev = await evaluate(site.root);
  assert.equal(ev.review.status, 'fail');
  assert.ok(ev.review.frames.every((f) => f.state === 'open'));
  // a clone-only element recorded by the review on a frame closed "same" is a difference
  await reviewAll(site, 'clone', { verdict: 'same' });
  const fj = path.join(site.root, 'compare', 'review', 'wide', 'frames.json');
  const fr = JSON.parse(await fs.readFile(fj, 'utf8'));
  fr.frames[0].cloneOnly = '#ads-agent-host';
  await fs.writeFile(fj, JSON.stringify(fr));
  ev = await evaluate(site.root);
  assert.equal(ev.review.frames.find((f) => f.size === 'wide').state, 'differs');
});

test('hovers with nothing to compare are n/a (satisfied, listed), not a pass of something unmeasured', async () => {
  const p = await tmpProject();
  const site = await verifiedSite(p, 'hovers');
  const ev = await evaluate(site.root);
  assert.equal(ev.units.find((u) => u.check === 'hovers').status, 'na');
});
