// RC6 capture defects (rc.7), end to end on a local page (capture, then seed; no live site): a page whose body children
// reorder between sizes, a site script that throws, and a third-party script that adds a widget and two srcless frames.
//   - RC6-15: inline styles are keyed by id / id-anchored path, so the pixel container keeps height:0 at every size and
//     the clone is as tall as the reference at desktop and on a phone
//   - RC6-05: the capture's exclusion stylesheet is marked and kept out of rendered.html
//   - RC6-22: a srcless frame gets a selector that matches it (its title), or none with why; never iframe[src^=…]
//   - page errors are recorded in meta.pageErrors (count, first messages) without failing the capture
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts');
const run = (cwd, args) => new Promise((resolve) => {
  const c = spawn(process.execPath, [path.join(SCRIPTS, args[0]), ...args.slice(1)], { cwd, env: { ...process.env, NODE_OPTIONS: '' } });
  let out = '';
  c.stdout.on('data', (d) => { out += d; });
  c.stderr.on('data', (d) => { out += d; });
  c.on('close', (code) => resolve({ code, out }));
});
const listen = (server, host) => new Promise((r) => server.listen(0, host, () => r(server.address().port)));

test('capture keys inline styles by identity, keeps its exclusion stylesheet out, names srcless frames, records page errors', { timeout: 20 * 60 * 1000 }, async () => {
  // the third party, on another site (localhost is not 127.0.0.1's site): a chat widget and two 0x0 frames with no src
  const widget = `(() => {
    const host = document.createElement('div'); host.id = 'chat-host'; host.style.cssText = 'position:fixed;right:10px;bottom:10px;width:60px;height:60px;background:#08f'; document.body.appendChild(host);
    const a = document.createElement('iframe'); a.title = 'tracker'; a.width = 0; a.height = 0; a.style.cssText = 'border:0;display:block'; document.body.appendChild(a);
    const b = document.createElement('iframe'); b.width = 0; b.height = 0; b.style.cssText = 'border:0;display:block'; document.body.appendChild(b);
  })();`;
  const tp = http.createServer((req, res) => res.writeHead(200, { 'content-type': 'text/javascript' }).end(widget));
  const tpPort = await listen(tp, 'localhost');
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>reorder</title><style>
body{margin:0;font:16px sans-serif} main section{height:300px;background:#eee} main section+section{background:#ccc}
@media (min-width: 768px){main section{height:400px}} @media (min-width: 768px){footer{height:80px}} footer{height:40px;background:#333}
</style></head><body>
<main id="content"><section class="hero">hero</section><section class="body">body</section></main>
<footer>footer</footer>
<div id="pixels" style="height: 0px; width: 0px; position: fixed; visibility: hidden; overflow: hidden;"><iframe src="about:blank" style="display:block;height:150px;border:0"></iframe></div>
<script>
  // a script sizes the hero from the window: a function of the viewport the seed carries
  const fit = () => { document.querySelector('.hero').style.height = Math.round(innerWidth / 4) + 'px'; }; fit(); addEventListener('resize', fit);
  // on narrow screens a body child arrives late, before everything: positions among <body>'s children shift there
  if (innerWidth < 700) setTimeout(() => { const d = document.createElement('div'); d.className = 'late'; d.style.cssText = 'height: 0px;'; document.body.prepend(d); }, 200);
</script>
<script>/* the site's own error, as allbirds' chunk loader threw ~70 times */ const m = {}; m.x.call();</script>
<script src="http://localhost:${tpPort}/widget.js"></script>
</body></html>`;
  const site = http.createServer((req, res) => (new URL(req.url, 'http://x').pathname === '/' ? res.writeHead(200, { 'content-type': 'text/html' }).end(page) : res.writeHead(404).end()));
  const port = await listen(site, '127.0.0.1');
  try {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-e2e-fid-'));
    const root = path.join(project, 'sites', 'fid');
    let r = await run(project, ['capture.mjs', `http://127.0.0.1:${port}/`, 'fid', '--routes', '1']);
    assert.equal(r.code, 0, r.out);
    const meta = JSON.parse(await fs.readFile(path.join(root, 'reference', 'meta.json'), 'utf8'));
    // page errors: kept, per route, the capture complete all the same
    assert.equal(meta.complete, true);
    const pe = (meta.pageErrors || []).find((e) => e.route === '/');
    assert.ok(pe && pe.count >= 1 && pe.first.some((m) => /reading 'call'/.test(m)), JSON.stringify(meta.pageErrors) + r.out);
    // third parties: the widget by id, the titled frame by its title, the bare frame kept with why (never iframe[src^=…])
    const sels = (meta.ignore || []).map((i) => i.sel);
    assert.ok(sels.includes('#chat-host'), JSON.stringify(meta.ignore) + r.out);
    assert.ok(sels.includes('iframe[title="tracker"]'), JSON.stringify(meta.ignore));
    assert.ok(!sels.some((s) => /src\^=/.test(s)), JSON.stringify(meta.ignore));
    const bare = (meta.thirdParty || []).find((t) => t.kind === 'frame' && !t.sel);
    assert.ok(bare && /no address, id, class, name or title/.test(bare.decision), JSON.stringify(meta.thirdParty));
    // RC6-05: the exclusion stylesheet is the tool's, not the page's
    const rendered = await fs.readFile(path.join(root, 'reference', 'rendered.html'), 'utf8');
    assert.ok(!rendered.includes('data-tc-ignore') && !rendered.includes('{display:none!important}'), 'the exclusion stylesheet was saved with the page');
    // RC6-15: keys by identity
    const inline = JSON.parse(await fs.readFile(path.join(root, 'reference', 'inline-styles.json'), 'utf8'));
    assert.equal(inline.keys, 'id-path');
    const at = (w, h) => inline.styles[`${w}x${h}`].styles;
    assert.ok(at(1440, 900)['#pixels'] && at(390, 844)['#pixels'], 'the container is not keyed by its id');
    assert.equal(at(390, 844)['#content>section[1]']?.[2], 'section.hero');

    r = await run(project, ['seed.mjs', 'fid']);
    assert.equal(r.code, 0, r.out);
    const html = await fs.readFile(path.join(root, 'clone', 'index.html'), 'utf8');
    assert.ok(!html.includes('chat-host') && !html.includes('title="tracker"'), 'an excluded widget reached the clone');
    // the clone, opened offline, as tall as the reference at each seed size; the container still has no height
    const lib = await import(pathToFileURL(path.join(SCRIPTS, 'lib.mjs')).href);
    const { chromium } = await import('playwright');
    const server = await lib.serve(path.join(root, 'clone'));
    const browser = await chromium.launch();
    try {
      for (const vp of lib.VIEWPORTS) {
        const p = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        await p.route('**/*', (q) => (q.request().url().startsWith(server.url) || /^(data|about):/.test(q.request().url()) ? q.continue() : q.abort()));
        await p.goto(server.url, { waitUntil: 'load' });
        const m = await p.evaluate(() => ({ h: document.documentElement.scrollHeight, pixels: document.getElementById('pixels').getBoundingClientRect().height }));
        const want = meta.viewports.find((v) => v.viewport === vp.name).pageHeight;
        assert.equal(m.pixels, 0, `${vp.name}: the pixel container lost its height:0`);
        assert.ok(Math.abs(m.h - want) <= 1, `${vp.name}: clone ${m.h} px, reference ${want} px`);
        await p.close();
      }
    } finally { await browser.close(); server.close(); }
  } finally { site.close(); tp.close(); }
});
