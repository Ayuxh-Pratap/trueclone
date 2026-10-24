// End to end, real browser, real capture, seed, server and check (a few minutes). RC8 elise (retry): an exact capture
// with --bundle recorded its bundle on one load of the start page; the clone (the bundle) had no page for 5 of the 9
// captured routes and none of 76 files the capture saved, and every check on those pages failed with HTTP errors on
// 127.0.0.1. The local site has the same shape: a shell start page whose view is an iframe (with a photo far below,
// lazy), and two pages of their own, one with an encoded name and its own script, one plain with its own photo.
//   - capture --mode exact --bundle: the bundle has a page for every captured route and every file the capture saved
//   - seed: a page for every route in the clone; served, each answers 200 and so does each photo; layout measures every
//     route at every size without an error
//   - the bundle as rc.8 left it (route pages and a photo missing): seed refuses it (no completion record, routes
//     named), record-bundle completes it without capturing again, the seed then writes every page
// usage: npm run test:e2e
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serve, SCORED, PNG } from '../../scripts/lib.mjs';
import { readCheck } from '../../scripts/results.mjs';
import { routeUrl } from '../../scripts/routes.mjs';
import { bundleCoverage } from '../../scripts/bundle-complete.mjs';

const SCRIPTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts');
const run = (cwd, args) => new Promise((resolve) => {
  const c = spawn(process.execPath, [path.join(SCRIPTS, args[0]), ...args.slice(1)], { cwd, env: { ...process.env, NODE_OPTIONS: '' } });
  let out = '';
  c.stdout.on('data', (d) => { out += d; });
  c.stderr.on('data', (d) => { out += d; });
  c.on('close', (code) => resolve({ code, out }));
});
const png = (r, g, b) => { const p = new PNG({ width: 64, height: 64 }); for (let i = 0; i < p.data.length; i += 4) p.data.set([r, g, b, 255], i); return PNG.sync.write(p); };
const head = (t) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t}</title><style>body{margin:0;font:16px sans-serif}nav{display:flex;gap:16px;padding:12px}main{padding:20px}.tall{height:1600px}</style></head>`;
const NAV = '<nav><a href="view.html">View</a> <a href="Case Study.html">Case study</a> <a href="plain.html">Plain</a></nav>';
const FILES = {
  'index.html': `${head('Shell')}<body>${NAV}<iframe src="view.html?shell=1" style="width:100%;height:600px;border:0" title="view"></iframe></body></html>`,
  'view.html': `${head('View')}<body><main><h1>The view</h1><img src="img/top.png" width="64" height="64" alt=""><div class="tall"></div><img loading="lazy" src="img/lazy.png" width="64" height="64" alt="lazy"></main></body></html>`,
  'Case Study.html': `${head('Case study')}<body>${NAV}<main><h1 id="t">Case study</h1><img src="img/case.png" width="64" height="64" alt=""><div class="tall"></div></main><script src="case.js"></script></body></html>`,
  'plain.html': `${head('Plain')}<body>${NAV}<main><h1>Plain</h1><img src="img/plain.png" width="64" height="64" alt=""><div class="tall"></div></main></body></html>`,
  'case.js': "document.getElementById('t').textContent = 'Case study (its own script ran)';",
};
const IMAGES = { 'img/top.png': png(200, 30, 30), 'img/lazy.png': png(30, 200, 30), 'img/case.png': png(30, 30, 200), 'img/plain.png': png(200, 200, 30) };
const ROUTES = ['/', '/view.html', '/Case%20Study.html', '/plain.html'];

test('own bundle: every captured route and file is in the clone, served and measured; an rc.8 bundle is completed without capturing again', { timeout: 30 * 60 * 1000 }, async () => {
  const host = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\//, '') || 'index.html'; } catch { res.writeHead(400).end(); return; }
    if (FILES[p] !== undefined) { res.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' }).end(FILES[p]); return; }
    if (IMAGES[p]) { res.writeHead(200, { 'content-type': 'image/png', 'content-length': IMAGES[p].length }).end(IMAGES[p]); return; }
    res.writeHead(404).end();
  });
  await new Promise((r) => host.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${host.address().port}/`;
  try {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-e2e-bundle-routes-'));
    const site = path.join(project, 'sites', 'bundlefx');
    const ref = path.join(site, 'reference');
    let r = await run(project, ['capture.mjs', url, 'bundlefx', '--routes', ROUTES.join(','), '--mode', 'exact', '--permission', 'trueclone test fixture (our own pages)', '--bundle']);
    assert.equal(r.code, 0, r.out);
    const meta = JSON.parse(await fs.readFile(path.join(ref, 'meta.json'), 'utf8'));
    assert.equal(meta.bundle, true);
    assert.deepEqual(meta.routes.map((x) => x.path), ROUTES, r.out);
    let cov = await bundleCoverage(ref, meta);
    assert.deepEqual([cov.routes.map((x) => x.path), cov.assets], [[], []], `the capture's bundle lacks: ${JSON.stringify(cov)}\n${r.out.slice(-1500)}`);

    // the clone: a page for every route, each served, each photo served (the lazy one far below in the iframed view too)
    r = await run(project, ['seed.mjs', 'bundlefx']);
    assert.equal(r.code, 0, r.out);
    const clone = path.join(site, 'clone');
    for (const f of ['index.html', 'view.html', 'Case Study.html', 'plain.html']) assert.ok(await fs.stat(path.join(clone, f)).catch(() => null), `clone/${f}\n${r.out}`);
    assert.ok(JSON.parse(await fs.readFile(path.join(clone, '.seed.json'), 'utf8')).pages >= 4);
    const server = await serve(clone);
    try {
      for (const p of ROUTES) assert.equal((await fetch(routeUrl(p, server.url))).status, 200, p);
      for (const f of Object.keys(IMAGES)) assert.equal((await fetch(`${server.url}${f}`)).status, 200, f);
      assert.match(await (await fetch(routeUrl('/Case%20Study.html', server.url))).text(), /<script id="tc-net">/, 'the page runs behind the bundle\'s network guard');
    } finally { server.close(); }

    // validation reaches every route at every size: no HTTP error on 127.0.0.1
    r = await run(project, ['diff.mjs', 'bundlefx', '--structure']);
    assert.equal(r.code, 0, r.out);
    const units = Object.entries((await readCheck(site, 'compare', 'layout')).units || {});
    for (const p of ROUTES) for (const vp of SCORED) {
      const u = units.find(([k]) => k === `${p === '/' ? '' : p}|${vp.name}|`)?.[1];
      assert.ok(u && typeof u.value === 'number' && !u.error, `${p} ${vp.name}: ${JSON.stringify(u)}`);
    }

    // the bundle as rc.8 recorded it: no page for two routes, the plain page's photo absent
    const mf = path.join(ref, 'bundle', 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(mf, 'utf8'));
    for (const k of Object.keys(manifest.entries)) if (/Case%20Study\.html$|plain\.(html|png)$/.test(k)) delete manifest.entries[k];
    await fs.writeFile(mf, JSON.stringify(manifest, null, 1));
    cov = await bundleCoverage(ref, meta);
    assert.deepEqual(cov.routes.map((x) => x.path), ['/Case%20Study.html', '/plain.html']);
    assert.ok(cov.assets.some((u) => /plain\.png$/.test(u)), JSON.stringify(cov.assets));
    r = await run(project, ['seed.mjs', 'bundlefx']);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /the bundle has no page for 2 captured route\(s\): \/Case%20Study\.html, \/plain\.html/);
    assert.ok(!(await fs.stat(path.join(clone, '.seed.json')).catch(() => null)), 'no completion record for a clone missing pages');
    // completed without capturing again: the reference is untouched
    const metaBefore = await fs.readFile(path.join(ref, 'meta.json'), 'utf8');
    r = await run(project, ['record-bundle.mjs', 'bundlefx']);
    assert.equal(r.code, 0, r.out);
    assert.equal(await fs.readFile(path.join(ref, 'meta.json'), 'utf8'), metaBefore);
    cov = await bundleCoverage(ref, meta);
    assert.deepEqual([cov.routes, cov.assets], [[], []], JSON.stringify(cov));
    r = await run(project, ['seed.mjs', 'bundlefx']);
    assert.equal(r.code, 0, r.out);
    for (const f of ['Case Study.html', 'plain.html', 'img/plain.png']) assert.ok(await fs.stat(path.join(clone, f)).catch(() => null), f);
  } finally { host.closeAllConnections(); host.close(); }
});
