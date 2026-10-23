// RC6 fidelity and measurement defects (rc.7), without a browser: the layout metric and extra height (RC6-16), the
// inline-style plan's element identity (RC6-15), and a --permission cut by a launcher's quoting (RC6-20).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PNG, pad, match, matchPct, VIEWPORTS } from '../scripts/lib.mjs';
import { planInlineStyles } from '../scripts/viewport-fit.mjs';

const SCRIPTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts');
const flat = (w, h, [r, g, b]) => { const p = new PNG({ width: w, height: h }); for (let i = 0; i < w * h * 4; i += 4) { p.data[i] = r; p.data[i + 1] = g; p.data[i + 2] = b; p.data[i + 3] = 255; } return p; };

test('RC6-16: a clone 10% longer on a uniform near-white page scores below 98; the extra rows are drawn as differences', () => {
  // allbirds: the 750 px band was the body colour rgb(236,233,226), which white padding let through at 99.99
  const NEAR_WHITE = [236, 233, 226];
  const ref = flat(200, 1000, NEAR_WHITE), clone = flat(200, 1100, NEAR_WHITE);
  const { pct } = matchPct(ref, clone);
  assert.ok(pct < 98, `10% longer scored ${pct}`);
  assert.equal(pct, +(100 - (100 / 1100) * 100).toFixed(2)); // exactly the extra rows
  // the same the other way round (a shorter clone), and wider
  assert.ok(matchPct(clone, ref).pct < 98);
  assert.ok(matchPct(flat(200, 1000, NEAR_WHITE), flat(230, 1000, NEAR_WHITE)).pct < 98);
  // diff.mjs's path: pad, then match with a diff image; the padded rows are red there
  const w = 200, h = 1100, a = pad(ref, w, h), b = pad(clone, w, h), diff = new PNG({ width: w, height: h });
  assert.equal(match(a, b, diff), 200 * 100);
  const i = (1050 * w + 10) * 4;
  assert.deepEqual([...diff.data.subarray(i, i + 4)], [255, 0, 0, 255]);
});

test('RC6-16: the calibration path is unchanged: a reference against itself is 100, a same-size difference counts as before', () => {
  const ref = flat(200, 1000, [236, 233, 226]);
  assert.equal(matchPct(ref, flat(200, 1000, [236, 233, 226])).pct, 100);
  // same size: pixelmatch alone (threshold 0.1): white against the near-white body colour is still "the same"
  assert.equal(matchPct(ref, flat(200, 1000, [255, 255, 255])).pct, 100);
  assert.equal(matchPct(ref, flat(200, 1000, [20, 20, 20])).pct, 0);
});

// a capture in the rc.7 shape: one record per size, key -> [style, class, fp]
const sizes = (rec) => ({ keys: 'id-path', breakpoints: [767], styles: Object.fromEntries(rec.map(([w, h, styles]) => [`${w}x${h}`, { w, h, styles }])) });
const SIZES = [[390, 844], [600, 900], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]];

test('RC6-15: an element that is not the same one at every size gets no plan; a stable key is planned and carries its check', () => {
  const data = sizes(SIZES.map(([w, h]) => [w, h, {
    // the same element everywhere, its height a function of the width: fitted
    '#main>div[1]': [`height: ${w / 4}px;`, 'hero', 'div.hero'],
    // a key that names the pixel container at most sizes and another element at the narrow ones (a third-party child
    // arrived before it): ambiguous, never applied to either
    'div[2]': w < 700 ? [`height: ${w}px;`, 'section', 'div.section'] : ['height: 0px; position: fixed;', '', 'div.'],
  }]));
  const { plan, ambiguous, keys } = planInlineStyles(data, VIEWPORTS);
  assert.equal(keys, 'id-path');
  assert.deepEqual(ambiguous.map((a) => a.path), ['div[2]']);
  assert.ok(!plan['div[2]'], 'an ambiguous key is planned');
  assert.ok(plan['#main>div[1]'], 'the stable key is not planned');
  assert.match(plan['#main>div[1]'].inline.height, /calc|vw|\*/);
  assert.deepEqual(plan['#main>div[1]'].check, { fp: 'div.hero' });
});

test('RC6-15: a positional key (a capture before rc.7) carries what the seed checks at the mirror\'s size', () => {
  // allbirds' shape: the container is div:3 at most sizes and div:4 where a late body child came first
  const rec = SIZES.map(([w, h]) => [w, h, w < 700 ? { 'div:4': ['height: 0px; position: fixed;', ''] } : { 'div:3': ['height: 0px; position: fixed;', ''] }]);
  const data = { breakpoints: [767], styles: Object.fromEntries(rec.map(([w, h, styles]) => [`${w}x${h}`, { w, h, styles }])) };
  const { plan, keys } = planInlineStyles(data, VIEWPORTS);
  assert.equal(keys, 'position');
  // recorded with a style at 1440x900 (the mirror's size): the element the seed finds must have one, of that class
  assert.deepEqual(plan['div:3'].check, { styled: true, cls: '' });
  // not recorded at 1440x900: the element the seed finds must have no style (the mirror's div:4 is the container, styled)
  assert.deepEqual(plan['div:4'].check, { styled: false, cls: null });
});

test('RC6-20: a --permission cut by a launcher\'s quoting is refused before anything runs, with the full name asked for', async () => {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-perm-'));
  for (const bad of ['"site', 'site"', '  ', 'Jane "Doe', '“site']) {
    const r = spawnSync(process.execPath, [path.join(SCRIPTS, 'capture.mjs'), 'http://127.0.0.1:9/', 'perm', '--mode', 'exact', '--permission', bad], { cwd: project, encoding: 'utf8', timeout: 60000 });
    assert.equal(r.status, 1, `${JSON.stringify(bad)}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, bad.trim() ? /stray quote|unbalanced/ : /--permission/, bad);
    assert.match(r.stderr, /full name|Pass --permission/);
  }
  assert.equal(await fs.stat(path.join(project, 'sites')).then(() => true, () => false), false, 'the capture started');
});
