// End to end, real browser, real capture (a few minutes). RC7 elise: /NASA%20(Draft).html failed to load at all five
// sizes, yet the capture listed it in meta.routes, printed "each captured at 5 sizes", counted it among "8 separate
// page(s) mirrored" after saying it was not mirrored, and left routesNotCaptured empty. A route is captured only when
// every size is: one that fails anywhere is listed as not captured, with why, and nothing is drafted on or to it.
//   - /broken.html: the connection closes on every browser load (fails at every size)
//   - /phone-stall.html: at phone width its <picture> source stops after its first bytes, so the load event never
//     comes there (fails at mobile only, through the capture's load readiness: silence, not a fixed limit)
// usage: npm run test:e2e
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PNG } from '../../scripts/lib.mjs';

const SCRIPTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts');
const run = (cwd, args) => new Promise((resolve) => {
  const c = spawn(process.execPath, [path.join(SCRIPTS, args[0]), ...args.slice(1)], { cwd, env: { ...process.env, NODE_OPTIONS: '' } });
  let out = '';
  c.stdout.on('data', (d) => { out += d; });
  c.stderr.on('data', (d) => { out += d; });
  c.on('close', (code) => resolve({ code, out }));
});
const page = (title, body = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;font:16px sans-serif}section{height:600px;border-top:1px solid #ccc}</style></head><body><nav><a href="/a.html">A</a> <a href="/broken.html">Broken</a> <a href="/phone-stall.html">Stall</a></nav><h1>${title}</h1>${body}<section></section></body></html>`;

test('a route that fails at any size is not captured: listed with why, not counted, not mirrored, no scenario on or to it', { timeout: 30 * 60 * 1000 }, async () => {
  const png = PNG.sync.write(new PNG({ width: 64, height: 64 }));
  const host = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    const browser = /Chrome/.test(req.headers['user-agent'] || '');
    if (p === '/broken.html' && browser) { req.socket.destroy(); return; }
    if (p === '/ok.png') { res.writeHead(200, { 'content-type': 'image/png' }).end(png); return; }
    if (p === '/stall.png') { res.writeHead(200, { 'content-type': 'image/png' }).write(png.subarray(0, 64)); return; } // then nothing
    const picture = '<picture><source media="(max-width: 500px)" srcset="/stall.png"><img src="/ok.png" width="64" height="64" alt=""></picture>';
    const body = { '/': page('Home'), '/a.html': page('Page A', '<p>a</p>'), '/broken.html': page('Broken'), '/phone-stall.html': page('Stall', picture) }[p];
    if (!body) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body);
  });
  await new Promise((r) => host.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${host.address().port}/`;
  try {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-e2e-failed-route-'));
    const site = path.join(project, 'sites', 'failfx');
    const r = await run(project, ['capture.mjs', url, 'failfx', '--routes', '/,/a.html,/broken.html,/phone-stall.html', '--mode', 'exact', '--permission', 'trueclone test fixture (our own pages)']);
    assert.equal(r.code, 0, r.out);
    const meta = JSON.parse(await fs.readFile(path.join(site, 'reference', 'meta.json'), 'utf8'));
    assert.equal(meta.complete, true);
    assert.deepEqual(meta.routes.map((x) => x.path), ['/', '/a.html'], r.out);
    const nc = Object.fromEntries(meta.routesNotCaptured.map((x) => [x.path, x.why]));
    assert.match(nc['/broken.html'] || '', /^capture failed at every size: /, JSON.stringify(meta.routesNotCaptured));
    assert.match(nc['/phone-stall.html'] || '', /^capture failed at mobile: the live page did not load \(nothing arrived for 30s/, JSON.stringify(meta.routesNotCaptured));
    // what the console says agrees with meta.json
    assert.match(r.out, /WARNING route \/broken\.html not captured \(capture failed at every size/);
    assert.match(r.out, /routes: 2 \(pages\): \/, \/a\.html; each captured at 5 sizes/);
    assert.match(r.out, /mirror: 1 of 1 separate page\(s\) mirrored in reference\/mirror\/routes\/ \(\/a\.html\)/);
    assert.doesNotMatch(r.out, /mirrored[^\n]*(broken|stall)/);
    assert.match(r.out, /routes not captured: 2 that failed to capture/);
    // nothing drafted on a route that was not captured, and no navigation to one
    const auto = JSON.parse(await fs.readFile(path.join(site, 'reference', 'interactions.auto.json'), 'utf8'));
    const bad = auto.filter((s) => /broken|stall/.test(`${s.path || ''} ${s.name}`));
    assert.deepEqual(bad.map((s) => s.name), [], 'scenarios on or to a route not captured');
    // they stay required: not verifiable, so this capture can never be Verified as a request for these routes
    const { evaluate } = await import('../../scripts/verdict.mjs');
    const ev = await evaluate(site, { side: 'clone', readOnly: true });
    const routeUnits = ev.units.filter((u) => u.check === 'route');
    assert.deepEqual(routeUnits.map((u) => [u.route, u.status]).sort(), [['/broken.html', 'tool'], ['/phone-stall.html', 'tool']], JSON.stringify(routeUnits));
    assert.equal(routeUnits.find((u) => u.route === '/phone-stall.html').owner, 'environment');
    assert.equal(ev.verified, false);
  } finally { host.closeAllConnections(); host.close(); }
});
