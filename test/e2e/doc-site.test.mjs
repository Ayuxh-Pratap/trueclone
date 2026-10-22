// End to end, real browser, real pipeline (about 8 minutes): the doc-site fixture (tools/fixtures/doc-site: a startup
// shuffle, a marquee, an autoplay carousel, an intro that starts before load, a third-party widget, a second page with
// inline scripts) captured, read, calibrated, and scored against a faithful clone and a broken one.
//   - the third-party widget is found and excluded on both sides (D3)
//   - the reference matches itself (calibration) at >= 99 on every key: symmetric measurement (R5) leaves nothing to
//     tolerate on a page that changes by itself under the same rules
//   - the faithful clone passes layout, scroll states, reduced motion and behaviour everywhere (D1, D2: no
//     over-strictness)
//   - the broken clone (stopped marquee, another shuffle rule, a slower carousel) fails, each where it should
//   - a clone that keeps the excluded widget fails the clone lint
// Needs the fixture servers (started here when they are not running). usage: npm run test:e2e
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluate, lintSubject } from '../../scripts/verdict.mjs';
import { FIXTURE, VARIANTS } from '../helpers/doc-variants.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPTS = path.join(REPO, 'scripts');
const URL_ = 'http://127.0.0.1:5603/';
const run = (cwd, args, env = {}) => new Promise((resolve) => {
  const c = spawn(process.execPath, [path.join(SCRIPTS, args[0]), ...args.slice(1)], { cwd, env: { ...process.env, NODE_OPTIONS: '', ...env } });
  let out = '';
  c.stdout.on('data', (d) => { out += d; });
  c.stderr.on('data', (d) => { out += d; });
  c.on('close', (code) => resolve({ code, out }));
});
const up = () => fetch(URL_).then((r) => r.ok, () => false);

test('doc-site end to end: exclusion, calibration, a faithful clone passes, a broken one fails where it breaks', { timeout: 30 * 60 * 1000 }, async () => {
  let fixtures = null;
  if (!(await up())) {
    fixtures = spawn(process.execPath, [path.join(REPO, 'tools', 'fixtures', 'serve-fixtures.mjs')], { stdio: 'ignore' });
    for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 200));
  }
  try {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-e2e-'));
    const site = path.join(project, 'sites', 'docfx');
    let r = await run(project, ['capture.mjs', URL_, 'docfx']);
    assert.equal(r.code, 0, r.out);
    const meta = JSON.parse(await fs.readFile(path.join(site, 'reference', 'meta.json'), 'utf8'));
    assert.ok((meta.ignore || []).some((i) => i.sel === '#ads-agent-host' && i.auto), JSON.stringify(meta.ignore));
    assert.ok(meta.stabilise?.seed && meta.complete === true);

    r = await run(project, ['states.mjs', 'docfx']);
    assert.equal(r.code, 0, r.out);
    r = await run(project, ['calibrate.mjs', 'docfx']);
    assert.equal(r.code, 0, r.out);
    const noise = JSON.parse(await fs.readFile(path.join(site, 'reference', 'noise.json'), 'utf8'));
    const low = Object.entries(noise.entries).filter(([, e]) => e.self < 99);
    assert.deepEqual(low, [], 'the reference differs from itself where nothing is random under the controls');

    const checks = ['layout', 'scroll', 'reduced', 'behaviour'];
    const score = async () => { const s = await run(project, ['score.mjs', 'docfx', '--only', 'layout,states,reduced,behaviour']); assert.ok(s.code === 0 || s.code === 1, s.out); return evaluate(site, { side: 'clone' }); };

    // the faithful clone: the site's own files, without the excluded widget
    await fs.cp(FIXTURE, path.join(site, 'clone'), { recursive: true, force: true });
    const index = path.join(site, 'clone', 'index.html');
    await fs.writeFile(index, (await fs.readFile(index, 'utf8')).split(/\r?\n/).filter((l) => !/widget/.test(l)).join('\n'));
    let ev = await score();
    const notPassing = ev.units.filter((u) => checks.includes(u.check) && !['pass', 'na'].includes(u.status));
    assert.deepEqual(notPassing.map((u) => `${u.check} ${u.route} ${u.viewport} ${u.status} ${u.value}`), []);
    assert.equal(ev.lint.findings.length, 0, JSON.stringify(ev.lint));

    // review (R9): perceptual tokens, the reference against itself per frame, and nothing only the clone shows
    r = await run(project, ['review.mjs', 'docfx', '--size', 'wide']);
    assert.equal(r.code, 0, r.out);
    const framesFile = path.join(site, 'compare', 'review', 'wide', 'frames.json');
    let frames = JSON.parse(await fs.readFile(framesFile, 'utf8')).frames;
    assert.ok(frames.every((f) => /^[0-9a-f]{16}$/.test(f.token) && typeof f.refSelf === 'number' && !f.cloneOnly), JSON.stringify(frames.slice(0, 3)));
    // a box only the clone shows is flagged on every frame it is in, whatever the pixel match
    await fs.writeFile(index, (await fs.readFile(index, 'utf8')).replace('</footer>', '</footer><div class="promo" style="position:fixed;left:12px;bottom:12px;width:120px;height:44px;background:red;color:white">Sale today only</div>'));
    r = await run(project, ['review.mjs', 'docfx', '--size', 'wide']);
    frames = JSON.parse(await fs.readFile(framesFile, 'utf8')).frames;
    const sectionFrames = frames.filter((f) => !f.id.includes('load-'));
    assert.ok(sectionFrames.length && sectionFrames.every((f) => /div at 12,/.test(f.cloneOnly || '')), JSON.stringify(sectionFrames.map((f) => [f.id, f.pct, f.cloneOnly])));
    await fs.writeFile(index, (await fs.readFile(index, 'utf8')).replace(/<div class="promo"[^>]*>Sale today only<\/div>/, ''));

    // broken: three rules of change
    for (const n of ['marquee-stopped', 'order-other-rule', 'carousel-slow']) {
      const v = VARIANTS[n];
      const f = path.join(site, 'clone', v.file);
      const t = (await fs.readFile(f, 'utf8')).replace(/\r\n/g, '\n');
      await fs.writeFile(f, t.replace(v.from, v.to));
    }
    ev = await score();
    const failed = (check) => ev.units.filter((u) => u.check === check && u.route === '' && u.status === 'fail');
    assert.ok(failed('layout').length >= 3, 'another shuffle rule shows in the layout');
    const beh = failed('behaviour').flatMap((u) => u.membersBelow || []).map((m) => m.reason || '');
    assert.ok(beh.some((x) => /does not move/.test(x)), beh.join('\n'));
    assert.ok(beh.some((x) => /changes every 4\.\d s: the reference every (2\.9|3\.0|3\.1) s/.test(x)), beh.join('\n'));
    // matched although the broken gallery moved the carousel down at mobile: never "missing" plus "extra"
    assert.ok(!beh.some((x) => /where the reference does not/.test(x)), beh.join('\n'));

    // the excluded widget kept in the clone
    await fs.writeFile(index, `${await fs.readFile(index, 'utf8')}\n<script src="http://localhost:5602/widget.js" async></script>\n`);
    const lint = await lintSubject(site, meta, 'clone');
    assert.ok(lint.findings.some((f) => /keeps #ads-agent-host/.test(f.what)), JSON.stringify(lint));
  } finally {
    fixtures?.kill();
  }
});
