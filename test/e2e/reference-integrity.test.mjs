// Stage 2, reference integrity, reproduced with the real scripts (about 2 minutes; needs the fixture servers, started
// here when they are not running):
//   ASTRO-4  a seed whose browser pass dies leaves no completion record and no half-written index.html, and status asks
//            for the seed again (no --force needed to recover)
//   A15      a reference that does not load (a closed port) is an error unit for the load check, never a cached
//            "reference" that any clone would then be scored against
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
const exists = (p) => fs.stat(p).then(() => true, () => false);

test('ASTRO-4: an interrupted seed leaves no completion record and no partial index.html; status asks for it again', { timeout: 10 * 60 * 1000 }, async () => {
  let fixtures = null;
  if (!(await up())) {
    fixtures = spawn(process.execPath, [path.join(REPO, 'tools', 'fixtures', 'serve-fixtures.mjs')], { stdio: 'ignore' });
    for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 200));
  }
  try {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-seed-'));
    const clone = path.join(project, 'sites', 'docfx', 'clone');
    assert.equal((await run(project, ['capture.mjs', URL_, 'docfx'])).code, 0);
    // the browser pass cannot start a browser: the seed dies after its markup pass, before the page is finished
    const dead = await run(project, ['seed.mjs', 'docfx'], { LAB_BROWSER: 'chromium', PLAYWRIGHT_BROWSERS_PATH: path.join(project, 'no-browsers') });
    assert.notEqual(dead.code, 0, dead.out);
    assert.equal(await exists(path.join(clone, '.seed.json')), false, 'no completion record after a failed pass');
    assert.equal(await exists(path.join(clone, 'index.html')), false, 'no index.html written before the pass completed');
    // (status reading a missing completion record as "seed again": test/status.test.mjs, golden ASTRO-4)
    // a plain seed recovers (no --force: there is no completed seed to protect)
    const ok = await run(project, ['seed.mjs', 'docfx']);
    assert.equal(ok.code, 0, ok.out);
    assert.equal(JSON.parse(await fs.readFile(path.join(clone, '.seed.json'), 'utf8')).capturedAt, JSON.parse(await fs.readFile(path.join(project, 'sites', 'docfx', 'reference', 'meta.json'), 'utf8')).capturedAt);
    assert.equal(await exists(path.join(clone, '.seed-pass.html')), false);

    // ALLBIRDS-12: drift sees the page's script origins, not only its height (an excluded widget's origin aside)
    const metaFile = path.join(project, 'sites', 'docfx', 'reference', 'meta.json');
    const meta = JSON.parse(await fs.readFile(metaFile, 'utf8'));
    assert.ok(meta.scriptOrigins?.includes('http://127.0.0.1:5603'), JSON.stringify(meta.scriptOrigins));
    let d = await run(project, ['drift.mjs', 'docfx', '--viewport', 'desktop']);
    assert.match(d.out, /drift: none/);
    await fs.writeFile(metaFile, JSON.stringify({ ...meta, scriptOrigins: meta.scriptOrigins.filter((o) => o !== 'http://127.0.0.1:5603') }));
    d = await run(project, ['drift.mjs', 'docfx', '--viewport', 'desktop']);
    assert.match(d.out, /scripts from \+http:\/\/127\.0\.0\.1:5603/);
    assert.equal(JSON.parse(await fs.readFile(path.join(project, 'sites', 'docfx', 'compare', 'drift.json'), 'utf8')).stale, true);
  } finally {
    fixtures?.kill();
  }
});

test('A15: a reference that does not load is an error unit for the load check, never cached', { timeout: 5 * 60 * 1000 }, async () => {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-load-'));
  const site = path.join(project, 'sites', 'gone');
  await fs.mkdir(path.join(site, 'reference'), { recursive: true });
  await fs.mkdir(path.join(site, 'clone'), { recursive: true });
  await fs.writeFile(path.join(site, 'clone', 'index.html'), '<!doctype html><title>x</title><h1>clone</h1>');
  // port 9 (discard): nothing answers there
  await fs.writeFile(path.join(site, 'reference', 'meta.json'), JSON.stringify({ url: 'http://127.0.0.1:9/', name: 'gone', capturedAt: '2026-10-22T00:00:00.000Z', complete: true, stabilise: { seed: 1 } }));
  const r = await run(project, ['load.mjs', 'gone', '--viewport', 'desktop']);
  assert.notEqual(r.code, 0, r.out);
  const res = JSON.parse(await fs.readFile(path.join(site, 'compare', 'results', 'load.json'), 'utf8'));
  const units = Object.values(res.units);
  assert.ok(units.length && units.every((u) => u.error && u.value === null), JSON.stringify(units));
  const cache = await fs.readdir(path.join(site, 'reference', 'cache')).catch(() => []);
  assert.deepEqual(cache, [], 'nothing cached as the reference');
});
