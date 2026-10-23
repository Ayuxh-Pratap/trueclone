// End to end, real browser, real pipeline (a few minutes): a local site whose page names need encoding (RC6-07) and
// whose pages are only linked from a second-level page (RC6-17), with a nav collapsed behind a menu button at phone size
// (RC6-18).
//   - capture follows links found on captured routes: "Landing Page.html", "NASA (Draft).html", "café.html" and
//     "50%25off.html", linked only from hub.html, are captured; a page beyond --routes is listed as not captured
//   - the seed writes each to its decoded folder, the bundled server answers every one (200), a bare % with 400
//   - diff --structure measures every route at every size (no error unit)
//   - the mobile navigation behind the menu button is a scenario that opens the menu first, and replays on reference
//     and clone
// usage: npm run test:e2e
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serve, SCORED } from '../../scripts/lib.mjs';
import { readCheck } from '../../scripts/results.mjs';
import { routeDir, routeUrl } from '../../scripts/routes.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPTS = path.join(REPO, 'scripts');
const run = (cwd, args) => new Promise((resolve) => {
  const c = spawn(process.execPath, [path.join(SCRIPTS, args[0]), ...args.slice(1)], { cwd, env: { ...process.env, NODE_OPTIONS: '' } });
  let out = '';
  c.stdout.on('data', (d) => { out += d; });
  c.stderr.on('data', (d) => { out += d; });
  c.on('close', (code) => resolve({ code, out }));
});

// the site: files named as their links name them, decoded (a host serves "Landing Page.html" at /Landing%20Page.html)
const NAV = `<style>
body{margin:0;font:16px/1.4 sans-serif;color:#222}.nav{display:flex;justify-content:space-between;align-items:center;padding:12px 20px;position:relative;background:#f4f1ea}
.toggle{display:none;background:none;border:0;font-size:22px}.links{display:flex;gap:24px}main{padding:40px 20px}section{height:700px;border-top:1px solid #ccc}
@media (max-width:640px){.toggle{display:block}.links{position:absolute;top:100%;left:0;right:0;flex-direction:column;gap:0;max-height:0;overflow:hidden;background:#f4f1ea;transition:max-height .3s}.nav.open .links{max-height:200px}.links a{padding:14px 20px}}
</style><header><nav class="nav"><a class="mark" href="./">Studio</a><button class="toggle" type="button" aria-label="Menu" aria-expanded="false">&#9776;</button><div class="links"><a href="hub.html">Work</a><a href="./">Home</a></div></nav></header>`;
const TOGGLE = "const n=document.querySelector('.nav'),b=n&&n.querySelector('.toggle');if(b)b.addEventListener('click',()=>{const o=n.classList.toggle('open');b.setAttribute('aria-expanded',String(o));});";
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body>${NAV}<main><h1>${title}</h1>${body}<section></section></main><script>${TOGGLE}</script></body></html>`;
const FILES = {
  'index.html': page('Studio', '<p>Selected work is on the hub.</p>'),
  'hub.html': page('Hub', '<ul><li><a href="Landing Page.html">Landing</a></li><li><a href="NASA (Draft).html">NASA draft</a></li><li><a href="café.html">Café</a></li><li><a href="50%25off.html">Sale</a></li></ul>'),
  'Landing Page.html': page('Landing', '<p>Landing page.</p>'),
  'NASA (Draft).html': page('NASA (Draft)', '<p>A draft.</p>'),
  'café.html': page('Café', '<p>Coffee. <a href="deeper.html">Deeper</a></p>'),
  '50%off.html': page('Sale', '<p>Half off.</p>'),
  'deeper.html': page('Deeper', '<p>Three levels down.</p>'),
};
const ROUTES = ['/', '/hub.html', '/Landing%20Page.html', '/NASA%20(Draft).html', '/caf%C3%A9.html', '/50%25off.html'];

// the reference host: decodes each segment (a bare % is a 400), serves the file of that name
async function hostSite(dir) {
  const server = http.createServer(async (req, res) => {
    let parts;
    try { parts = new URL(req.url, 'http://x').pathname.split('/').filter(Boolean).map(decodeURIComponent); } catch { res.writeHead(400).end(); return; }
    const file = path.join(dir, ...(parts.length ? parts : ['index.html']));
    const body = await fs.readFile(file).catch(() => null);
    if (!body || !file.startsWith(dir)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }).end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return server;
}

test('encoded route names, routes found on captured routes, and a menu opened before its link', { timeout: 30 * 60 * 1000 }, async () => {
  const siteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-routes-site-'));
  for (const [f, html] of Object.entries(FILES)) await fs.writeFile(path.join(siteDir, f), html);
  const host = await hostSite(siteDir);
  const url = `http://127.0.0.1:${host.address().port}/`;
  try {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-e2e-routes-'));
    const site = path.join(project, 'sites', 'routesfx');
    // exact mode (our own fixture): the seed keeps the links' addresses (template mode makes them "#" for the agent)
    let r = await run(project, ['capture.mjs', url, 'routesfx', '--routes', '6', '--mode', 'exact', '--permission', 'trueclone test fixture (our own pages)']);
    assert.equal(r.code, 0, r.out);
    const meta = JSON.parse(await fs.readFile(path.join(site, 'reference', 'meta.json'), 'utf8'));
    // RC6-17: the four pages linked only from hub.html are captured, through the second level
    assert.deepEqual(meta.routes.map((x) => x.path), ROUTES, r.out);
    for (const p of ROUTES.slice(2)) assert.equal(meta.routesFound.find((f) => f.path === p)?.from, '/hub.html', p);
    assert.deepEqual(meta.routesNotCaptured.map((x) => x.path), ['/deeper.html']);
    assert.match(meta.routesNotCaptured[0].why, /beyond the cap of 6/);
    assert.equal(meta.routesNotCaptured[0].from, '/caf%C3%A9.html');
    assert.match(r.out, /routes not captured: 1 of the 7 pages found .*\/deeper\.html/);
    assert.equal(new Set(meta.routes.map((x) => x.slug)).size, ROUTES.length, 'every route has its own slug');

    // RC6-07: the seed writes every page to its decoded folder, and the bundled server answers each one
    r = await run(project, ['seed.mjs', 'routesfx']);
    assert.equal(r.code, 0, r.out);
    for (const p of ROUTES.slice(1)) assert.ok(await fs.stat(path.join(site, 'clone', routeDir(p), 'index.html')).catch(() => null), `clone/${routeDir(p)}/index.html (${r.out})`);
    assert.ok(!(await fs.stat(path.join(site, 'clone', 'Landing%20Page.html')).catch(() => null)), 'no encoded folder');
    // the clone's behaviour, as an agent writes it: the menu button opens the nav
    await fs.writeFile(path.join(site, 'clone', 'script.js'), TOGGLE);
    const server = await serve(path.join(site, 'clone'));
    try {
      for (const p of ROUTES) assert.equal((await fetch(routeUrl(p, server.url))).status, 200, p);
      assert.equal((await fetch(`${server.url}100%.html`)).status, 400);
    } finally { server.close(); }

    // every route measured at every size, none an error
    r = await run(project, ['diff.mjs', 'routesfx', '--structure']);
    assert.equal(r.code, 0, r.out);
    const units = Object.entries((await readCheck(site, 'compare', 'layout')).units || {});
    for (const p of ROUTES) {
      for (const vp of SCORED) {
        const u = units.find(([k]) => k === `${p === '/' ? '' : p}|${vp.name}|`)?.[1];
        assert.ok(u && typeof u.value === 'number' && !u.error, `${p} ${vp.name}: ${JSON.stringify(u)}\n${r.out.slice(-2000)}`);
      }
    }

    // RC6-18: the mobile link behind the menu button is a scenario that opens the menu first
    const auto = JSON.parse(await fs.readFile(path.join(site, 'reference', 'interactions.auto.json'), 'utf8'));
    const dropped = JSON.parse(await fs.readFile(path.join(site, 'reference', 'interactions.dropped.json'), 'utf8'));
    const nav = auto.find((s) => s.name === 'go to /hub.html (mobile)');
    assert.ok(nav, `no mobile navigation: ${auto.map((s) => s.name).join(', ')}; dropped: ${JSON.stringify(dropped)}`);
    assert.match(nav.steps[0].click.ref, /toggle/, JSON.stringify(nav.steps));
    assert.ok(!dropped.some((d) => d.name === 'go to /hub.html (mobile)'), JSON.stringify(dropped));
    r = await run(project, ['interact.mjs', 'routesfx', '--only', 'go to /hub.html (mobile)']);
    assert.ok(r.code === 0 || r.code === 1, r.out);
    const rep = JSON.parse(await fs.readFile(path.join(site, 'compare', 'interact', 'report.json'), 'utf8'));
    const sc = rep.scenarios.find((s) => s.name === 'go to /hub.html (mobile)');
    assert.ok(sc, r.out);
    assert.deepEqual(sc.errors, [], JSON.stringify(sc));
    assert.equal(sc.paths.ref.arrived, '/hub.html', JSON.stringify(sc.paths));
    assert.equal(sc.paths.clone.arrived, '/hub.html', JSON.stringify(sc.paths));
    assert.ok(sc.expect.pass, JSON.stringify(sc));
  } finally { host.close(); }
});
