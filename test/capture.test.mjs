// Reference collection rules that need no browser (scripts-evidence.mjs, identity.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isInlineScript } from '../scripts/scripts-evidence.mjs';
import { contentHash, refIdOf, envIdentity } from '../scripts/identity.mjs';

test('ASTRO-5: an inline script of a route served with a trailing slash is inline (not a file named by the page)', () => {
  const docs = new Set(['https://docs.astro.build/en/tutorial/0-introduction']);
  assert.equal(isInlineScript('https://docs.astro.build/en/tutorial/0-introduction/', docs), true);
  assert.equal(isInlineScript('https://docs.astro.build/en/tutorial/0-introduction/#x', docs), true);
  assert.equal(isInlineScript('https://docs.astro.build/_astro/page.js', docs), false);
});

test('the content hash follows content, not file times', async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-hash-'));
  await fs.writeFile(path.join(d, 'a.js'), 'one');
  const h1 = await contentHash(d, path.join(d, '..', `${path.basename(d)}.cache.json`));
  const t = new Date(Date.now() + 60000);
  await fs.utimes(path.join(d, 'a.js'), t, t);
  assert.equal(await contentHash(d, path.join(d, '..', `${path.basename(d)}.cache.json`)), h1);
  await fs.writeFile(path.join(d, 'a.js'), 'two');
  assert.notEqual(await contentHash(d, path.join(d, '..', `${path.basename(d)}.cache.json`)), h1);
});

test('the reference identity changes with the capture and the visit profile, not with the completion mark', () => {
  const m = { url: 'https://x.test/', capturedAt: '2026-10-22T00:00:00Z', mode: 'template', routes: [], hide: [] };
  assert.equal(refIdOf({ ...m, complete: true }), refIdOf(m));
  assert.notEqual(refIdOf({ ...m, hide: ['#geo'] }), refIdOf(m));
  assert.notEqual(refIdOf({ ...m, capturedAt: '2026-10-23T00:00:00Z' }), refIdOf(m));
});

test('VAR-5: the motion map draft has unique names and only ranges that can be measured', async () => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const scripts = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts');
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-curves-'));
  const ref = path.join(project, 'sites', 'm', 'reference');
  await fs.mkdir(ref, { recursive: true });
  await fs.writeFile(path.join(ref, 'meta.json'), JSON.stringify({ url: 'https://x.test/', capturedAt: '2026-10-22T00:00:00Z' }));
  const trig = (start, end, startPx, endPx) => ({ scrub: 1, start, end, startPx, endPx, trigger: { sel: '.cords', section: 'manifesto' }, animation: { type: 'tween', targets: [{ sel: '.cord' }], vars: { y: 100 } } });
  const trig2 = (start, end, startPx, endPx) => ({ ...trig(start, end, startPx, endPx), animation: { type: 'tween', targets: [{ sel: '.cord' }], vars: { opacity: 0 } } });
  await fs.writeFile(path.join(ref, 'motion.desktop.json'), JSON.stringify({ triggers: [trig('top bottom', 'bottom top', 0, 900), trig2('+=5600', 'undefined', 1200, 6800), trig2('function', 'function', NaN, NaN)], onScroll: [], swipers: [], pointer: [] }));
  const r = spawnSync(process.execPath, [path.join(scripts, 'curves.mjs'), 'm', '--draft'], { cwd: project, encoding: 'utf8' });
  const draft = JSON.parse(await fs.readFile(path.join(project, 'sites', 'm', 'motion-map.draft.json'), 'utf8'));
  assert.equal(new Set(draft.map((e) => e.name)).size, draft.length, r.stdout + r.stderr);
  for (const e of draft) assert.ok(e.scroll.of || (Number.isFinite(e.scroll.from) && Number.isFinite(e.scroll.to)), JSON.stringify(e));
  assert.equal(draft.length, 2, 'the unresolvable trigger is left out, not drafted with a range that measures nothing');
});

test('envIdentity reports no modification in a clean process', () => {
  assert.equal(envIdentity().instrumentModified, false);
});
