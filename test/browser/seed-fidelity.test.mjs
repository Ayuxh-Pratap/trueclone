// RC6 seed defects (rc.7), real browser, offline: seed runs on hand-made reference folders shaped like the RC6 ones.
//   - RC6-05: the capture's exclusion stylesheet (no marker in captures before rc.7) and excluded widgets' elements (by
//     selector, and by the excluded origin's data-tc-origin mark) are not in the clone; nothing else is removed
//   - RC6-22: a live frame inside a declarative shadow root becomes about:blank in template mode
//   - ALLBIRDS-7 (D5): a lazy cut-out image below the fold becomes its silhouette, not an opaque box
//   - RC6-15: positional inline-style keys that shifted between sizes (allbirds' pixel container) are never applied to
//     another element; the container keeps height:0 and the page its height
//   - elise (A6): exact mode makes a same-host frame of a captured route local (query kept); one of an uncaptured page
//     is left, warned and recorded in clone/.seed.json
//   - the seed's own browser pass never loads a frame from the site (it did, before the frames were made local/blank)
//   - reveal and widget records: a position that a late body child moved onto another element is never marked (RC6
//     allbirds 0/8 reveals, 0/3 widgets); a record's stable id (rc.7) finds its own element
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';

const SCRIPTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts');
const put = async (root, rel, data) => { const p = path.join(root, rel); await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data, null, 2)); };
const seed = (project, name) => spawnSync(process.execPath, [path.join(SCRIPTS, 'seed.mjs'), name, '--force'], { cwd: project, encoding: 'utf8', timeout: 180000 });
// a 200x200 product shot cut out of a transparent background (its right half transparent)
const cutout = () => { const p = new PNG({ width: 200, height: 200 }); for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) { const i = (y * 200 + x) * 4; p.data[i] = 30; p.data[i + 1] = 90; p.data[i + 2] = 200; p.data[i + 3] = x < 100 ? 255 : 0; } return PNG.sync.write(p); };
const SIZES = [[390, 844], [600, 900], [768, 1024], [1024, 768], [1280, 720], [1440, 900], [1920, 1080]];
const meta = (url, extra = {}) => ({ url, name: 'fx', mode: 'template', hide: [], routes: [], unroll: 'y', capturedAt: '2026-10-22T00:00:00.000Z', complete: true, ...extra });

// the page as the mirror holds it: an element that arrived after the inline styles were read (first), two sections, the
// pixel container (height 0, holding a 150 px frame), an excluded origin's srcless frame, an excluded widget, a kept
// third-party badge, a shadow host with a live frame, a lazy cut-out far below
const MIRROR = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>fx</title>
<style type="text/css">#chat-host{display:none!important}
iframe[src^="https://px.example"]{display:none!important}</style>
<style>body{margin:0} .sec{height:400px;background:#eee} .keep{height:10px}</style>
</head><body>
<div id="late"></div>
<div class="sec">one</div>
<div class="sec">two</div>
<div id="pixels" style="height: 0px; position: fixed; overflow: hidden;"><iframe src="about:blank" style="display:block;height:150px;border:0"></iframe></div>
<iframe data-tc-origin="https://px.example" width="0" height="0" style="border:0;display:block"></iframe>
<div id="chat-host" data-tc-origin="https://chat.example">chat</div>
<div class="badge keep" data-tc-origin="https://kept.example">badge</div>
<cart-sync data-tc-shadow=""><template shadowrootmode="open" shadowrootserializable=""><iframe src="https://shop.example/pay/hop?trace=1" style="display:none"></iframe></template></cart-sync>
<div style="height:5000px"></div>
<img class="cut" loading="lazy" src="../assets/image/cut.png" width="200" height="200">
</body></html>`;

test('template seed: no exclusion stylesheet or excluded widget, no live frame in a shadow root, lazy cut-outs as silhouettes, shifted inline-style keys left alone', { timeout: 300000 }, async () => {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-seedfx-'));
  const root = path.join(project, 'sites', 'fx');
  await put(root, 'reference/meta.json', meta('http://127.0.0.1:9/', {
    ignore: [
      { sel: '#chat-host', why: 'third-party widget from https://chat.example', origin: 'https://chat.example', auto: true },
      { sel: 'iframe[src^="https://px.example"]', why: 'third-party widget from https://px.example', origin: 'https://px.example', auto: true },
    ],
    thirdParty: [{ sel: null, origin: 'https://kept.example', label: 'div', kind: 'element', core: false, decision: 'kept: no stable selector' }],
  }));
  await put(root, 'reference/mirror/index.html', MIRROR);
  await put(root, 'reference/assets/image/cut.png', cutout());
  // inline styles read before #late arrived, by position (rc.6 keys): the container is div:3 at most sizes and div:4
  // at the two narrow ones (a late child came first there), as allbirds' was div:10 / div:11
  await put(root, 'reference/inline-styles.json', { breakpoints: [767], sizes: SIZES.map(([w, h]) => `${w}x${h}`), styles: Object.fromEntries(SIZES.map(([w, h]) => [`${w}x${h}`, { w, h, styles: { [w < 700 ? 'div:4' : 'div:3']: ['height: 0px; position: fixed; overflow: hidden;', ''] } }])) });
  const r = seed(project, 'fx');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const html = await fs.readFile(path.join(root, 'clone', 'index.html'), 'utf8');
  const base = await fs.readFile(path.join(root, 'clone', '.seed-base.html'), 'utf8');
  for (const h of [html, base]) {
    // RC6-05: the tool's stylesheet and the excluded widgets are gone, by selector and by origin
    assert.ok(!h.includes('{display:none!important}'), 'the capture\'s exclusion stylesheet reached the clone');
    assert.ok(!h.includes('chat-host') && !h.includes('px.example'), 'an excluded widget reached the clone');
    // nothing else: the page's own stylesheet, the kept badge
    assert.ok(h.includes('.keep{height:10px}') && h.includes('kept.example'), 'more than the excluded widgets was removed');
    // RC6-22: the shadow root's frame
    assert.ok(!h.includes('shop.example'), 'a live frame inside a shadow root survived template mode');
    assert.match(h, /<template shadowrootmode="open"[^>]*><iframe src="about:blank"/);
  }
  // ALLBIRDS-7 D5: the lazy cut-out is its silhouette (a PNG), not the opaque grey box (an SVG rect)
  assert.match(html, /<img class="cut" loading="lazy" src="data:image\/png/);
  // RC6-15: open the clone and measure: the container keeps its style, no section got the container's rules
  const { chromium } = await import('playwright');
  const lib = await import(pathToFileURL(path.join(SCRIPTS, 'lib.mjs')).href);
  const server = await lib.serve(path.join(root, 'clone'));
  const browser = await chromium.launch();
  try {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.route('**/*', (q) => (q.request().url().startsWith(server.url) || q.request().url().startsWith('data:') || q.request().url() === 'about:blank' ? q.continue() : q.abort()));
      await page.goto(server.url, { waitUntil: 'load' });
      const m = await page.evaluate(() => ({ pixels: document.getElementById('pixels').getBoundingClientRect().height, pixelsStyle: document.getElementById('pixels').getAttribute('style'), secs: [...document.querySelectorAll('.sec')].map((s) => s.getBoundingClientRect().height), widthMarks: document.querySelectorAll('[data-tc-w]').length }));
      assert.equal(m.pixels, 0, `${w}: the pixel container lost its height:0 (${m.pixelsStyle})`);
      assert.deepEqual(m.secs, [400, 400], `${w}: a section got another element's styles`);
      assert.equal(m.widthMarks, 0, `${w}: a rule was applied to an element the key did not name`);
      await page.close();
    }
  } finally { await browser.close(); server.close(); }
  assert.match(r.stdout, /viewport values left as captured: .*2 whose key finds another element/);
});

test('exact seed: a same-host frame of a captured route opens the clone\'s page (query kept); an uncaptured one is recorded', { timeout: 300000 }, async () => {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-seedfx-'));
  const root = path.join(project, 'sites', 'fx');
  await put(root, 'reference/meta.json', meta('https://www.site.example/', { mode: 'exact', permission: 'test', routes: [{ path: '/', slug: '', dir: 'reference' }, { path: '/Landing%20Page.html', slug: 'Landing_20Page_html', dir: 'reference/routes/Landing_20Page_html', sameDocument: true }] }));
  await put(root, 'reference/mirror/index.html', `<!DOCTYPE html><html><head><title>shell</title></head><body><nav>nav</nav>
<iframe id="a" src="https://www.site.example/Landing%20Page.html?shell=1"></iframe>
<iframe id="b" src="https://site.example/Other.html?shell=1"></iframe>
<iframe id="c" src="https://player.example/embed/1"></iframe>
<a href="https://www.site.example/Landing%20Page.html">landing</a></body></html>`);
  const r = seed(project, 'fx');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const html = await fs.readFile(path.join(root, 'clone', 'index.html'), 'utf8');
  assert.match(html, /<iframe id="a" src="\/Landing%20Page\.html\?shell=1">/, 'the captured route\'s frame still loads the live site');
  // not captured: left as it was, said, and recorded for the report
  assert.match(html, /<iframe id="b" src="https:\/\/site\.example\/Other\.html\?shell=1">/);
  assert.match(html, /<iframe id="c" src="https:\/\/player\.example\/embed\/1">/); // another site's: not the seed's to change
  assert.match(r.stderr, /1 frame\(s\) still load the live site/);
  const rec = JSON.parse(await fs.readFile(path.join(root, 'clone', '.seed.json'), 'utf8'));
  assert.deepEqual(rec.liveFrames, ['https://site.example/Other.html?shell=1']);
  // the completion record says which seed code made it (status re-seeds after an upgrade)
  assert.match(rec.code, /^[0-9a-f]{12}$/);
  assert.ok(rec.tool);
});

test('the seed\'s browser pass never opens a frame on the site itself (template and exact mode)', { timeout: 300000 }, async () => {
  const hits = [];
  const live = http.createServer((req, res) => { hits.push(req.url); res.writeHead(200, { 'content-type': 'text/html' }).end('<p>live</p>'); });
  await new Promise((r) => live.listen(0, '127.0.0.1', r));
  const site = `http://127.0.0.1:${live.address().port}/`;
  try {
    for (const mode of ['template', 'exact']) {
      const project = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-seedfx-'));
      const root = path.join(project, 'sites', 'fx');
      await put(root, 'reference/meta.json', meta(site, mode === 'exact' ? { mode, permission: 'test' } : {}));
      await put(root, 'reference/mirror/index.html', `<!DOCTYPE html><html><head><title>shell</title></head><body><iframe src="${site}Other.html?shell=1"></iframe></body></html>`);
      // async: this process's server must stay able to answer (a hit would be counted, not hang the pass)
      const r = await new Promise((resolve) => { const c = spawn(process.execPath, [path.join(SCRIPTS, 'seed.mjs'), 'fx', '--force'], { cwd: project }); let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; }); c.on('close', (code) => resolve({ code, out })); });
      assert.equal(r.code, 0, r.out);
    }
    assert.deepEqual(hits, [], 'the seed loaded the live site');
  } finally { live.close(); }
});

// Reveal and widget records by position (before rc.7) and by stable id (rc.7), on a mirror where an element arrived
// before the others after they were recorded (#late, as allbirds' redo-container): every position moved by one.
test('reveals and widgets: a position that now finds another element is never marked; a stable id finds its own', { timeout: 300000 }, async () => {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-seedfx-'));
  const root = path.join(project, 'sites', 'fx');
  await put(root, 'reference/meta.json', meta('http://127.0.0.1:9/'));
  await put(root, 'reference/mirror/index.html', `<!DOCTYPE html><html><head><title>fx</title><style>body{margin:0} div{min-height:20px}</style></head><body>
<div id="late" class="late"></div>
<div class="hero">hero</div>
<div class="foot"><button aria-expanded="false">Menu</button><div class="panel">closed</div></div>
<div id="page"><div class="card">card</div><nav class="nav"><button aria-expanded="false" class="t2">More</button></nav></div>
</body></html>`);
  const reveal = (extra) => ({ from: { o: 0, tx: 0, ty: 40, s: 1, blur: 0, clip: 'none' }, to: { o: 1, tx: 0, ty: 0, s: 1, blur: 0, clip: 'none' }, trigger: 0.8, duration: 600, frames: [{ t: 0, o: 0, tx: 0, ty: 40, s: 1, blur: 0, clip: 'none' }, { t: 600, o: 1, tx: 0, ty: 0, s: 1, blur: 0, clip: 'none' }], ...extra });
  await put(root, 'reference/reveals.desktop.json', { reveals: [
    // recorded before #late arrived: the footer was div:2, which is now the hero (same tag, another class)
    reveal({ path: 'div:2', cls: 'foot' }),
    // rc.7: its id; its old position (div:3>div:1) is now the footer's panel
    reveal({ path: 'div:3>div:1', id: '#page>div[1]', fp: 'div.card', cls: 'card' }),
  ], scrubs: [], pins: [], classes: [] });
  await put(root, 'reference/widgets.desktop.json', { groups: [
    // before rc.7: the footer's menu at div:2 (now the hero, which has no button): not wired
    { i: 0, kind: 'expand', scopePath: 'div:2', triggers: [{ path: 'div:2>button:1', label: 'Menu' }], initial: -1, states: ['<button aria-expanded="true">Menu</button><div class="panel">open</div>'], closed: '<button aria-expanded="false">Menu</button><div class="panel">closed</div>' },
    // rc.7: by id; its old position (div:3>nav:2) no longer exists
    { i: 1, kind: 'expand', scopePath: 'div:3>nav:2', scopeId: '#page>nav[1]', scopeFp: 'nav.nav', triggers: [{ path: 'div:3>nav:2>button:1', id: '#page>nav[1]>button[1]', fp: 'nav.nav>button.t2', label: 'More' }], initial: -1, states: ['<button aria-expanded="true" class="t2">More</button><ul><li>open</li></ul>'], closed: '<button aria-expanded="false" class="t2">More</button>' },
  ] });
  const r = seed(project, 'fx');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const html = await fs.readFile(path.join(root, 'clone', 'index.html'), 'utf8');
  // the class of every element carrying the attribute
  const tagOf = (attr) => [...html.matchAll(/<\w[\w-]*\s([^>]*)>/g)].map((m) => m[1]).filter((at) => at.includes(`${attr}=`)).map((at) => /class="([^"]*)"/.exec(at)?.[1]);
  assert.deepEqual(tagOf('data-tc-reveal'), ['card'], 'a reveal was marked on another element');
  assert.deepEqual(tagOf('data-tc-scope'), ['nav'], 'a widget region was wired on another element');
  assert.deepEqual(tagOf('data-tc-trigger'), ['t2']);
  assert.match(r.stdout, /1\/2 one-shot scroll reveals.*1 whose key finds another element/);
  assert.match(r.stdout, /1\/2 widgets.*not wired: 1 element\(s\) not found/);
});
