// RC7 elise: the start page is a shell whose view iframes load ~21 MB of video and photos; at ~300 KB/s its load event
// came at 46-57 s alone and later when reads shared the link, so every read with a fixed 60 s load limit failed
// ("a request that never finishes", when every request was finishing). Readiness is now the load event, waited for
// while the page keeps loading, failing only on silence or at a ceiling (lib.mjs gotoLoaded, openUrl, loadLive).
// A local server stands in for the link: a response trickled in chunks (slow, progressing), one that stops (stalled),
// one that never ends (still loading at the ceiling). Small limits keep it fast.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts');
const html = (body) => `<!doctype html><html><body><h1>page</h1>${body}</body></html>`;

function site(pngStart) {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    // a stylesheet holds the load event until its last byte (an image that does not decode would not), and the page
    // still parses, as a heavy photo or video does on elise
    if (u.pathname === '/slow') return res.writeHead(200, { 'content-type': 'text/html' }).end(html('<link rel="stylesheet" href="/trickle">'));
    if (u.pathname === '/shell') return res.writeHead(200, { 'content-type': 'text/html' }).end(html('<iframe src="/slow"></iframe>'));
    // an image whose response stops after its first bytes: the load event waits for it, the parse does not
    if (u.pathname === '/hang') return res.writeHead(200, { 'content-type': 'text/html' }).end(html('<img src="/stops">'));
    if (u.pathname === '/stops') return res.writeHead(200, { 'content-type': 'image/png' }).write(pngStart); // then nothing, ever
    if (u.pathname === '/endless') return res.writeHead(200, { 'content-type': 'text/html' }).end(html('<link rel="stylesheet" href="/drip">'));
    const chunk = (n) => Buffer.from(`/*${'x'.repeat(n)}*/\n`);
    res.writeHead(200, { 'content-type': 'text/css' });
    if (u.pathname === '/trickle') { let n = 0; const t = setInterval(() => { res.write(chunk(2048)); if (++n === 8) { clearInterval(t); res.end(); } }, 400); return; } // 3.2 s, a chunk every 0.4 s
    if (u.pathname === '/drip') { const t = setInterval(() => res.write(chunk(256)), 200); req.on('close', () => clearInterval(t)); }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

test('load readiness: slow but progressing is waited for (the load event still required); silence and the ceiling are told apart', { timeout: 180000 }, async () => {
  const { gotoLoaded, openUrl, loadLive, PNG } = await import(pathToFileURL(path.join(SCRIPTS, 'lib.mjs')).href);
  const { errorOwner } = await import(pathToFileURL(path.join(SCRIPTS, 'failures.mjs')).href);
  const { chromium } = await import('playwright');
  const server = await site(PNG.sync.write(new PNG({ width: 64, height: 64 })).subarray(0, 64));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const fresh = async () => { const context = await browser.newContext(); return { context, page: await context.newPage() }; };
  const opts = { stall: 1500, ceiling: 20000 };
  try {
    // the old rule: a fixed limit shorter than a slow page's load fails it although every request finishes
    let { context, page } = await fresh();
    await assert.rejects(page.goto(`${base}/slow`, { waitUntil: 'load', timeout: 2000 }), /Timeout/);
    await context.close();

    // slow and progressing, behind an iframe as on elise: waited for, and the load event did come
    ({ context, page } = await fresh());
    let r = await gotoLoaded(page, `${base}/shell`, opts);
    assert.equal(r.loaded, true, JSON.stringify(r));
    assert.ok(r.ms >= 3000, `loaded at ${r.ms} ms, before the trickle ended`);
    assert.equal(await page.evaluate(() => document.readyState), 'complete');
    await context.close();

    // a request that stops: silence, not slowness
    ({ context, page } = await fresh());
    r = await gotoLoaded(page, `${base}/hang`, opts);
    assert.deepEqual([r.loaded, r.stalled], [false, true], JSON.stringify(r));
    assert.ok(r.ms >= 1500 && r.ms < 10000, `${r.ms} ms`);
    await context.close();

    // still receiving at the ceiling: not a stall
    ({ context, page } = await fresh());
    r = await gotoLoaded(page, `${base}/endless`, { stall: 1500, ceiling: 2500 });
    assert.deepEqual([r.loaded, r.stalled], [false, false], JSON.stringify(r));
    await context.close();

    // a read: on a stall, measured from the parsed page, and it says so
    ({ context, page } = await fresh());
    const warned = [];
    const warn = console.warn;
    console.warn = (m) => warned.push(String(m));
    try { r = await openUrl(page, `${base}/hang`, opts); } finally { console.warn = warn; }
    assert.equal(r.loaded, false);
    assert.equal(await page.textContent('h1'), 'page');
    assert.match(warned.join('\n'), /no load event: nothing arrived for 1\.5s \(a request that never finishes\); measured from the parsed page/);
    await context.close();

    // a capture: the load event is required; a stall is the live page not loading, owned by the environment
    ({ context, page } = await fresh());
    const err = await loadLive(page, `${base}/hang`, opts).then(() => null, (e) => e);
    assert.match(err?.message || '', /^the live page did not load \(nothing arrived for 1\.5s/);
    assert.equal(errorOwner({ error: `capture exit 1: ${err.message}` }), 'environment');
    await context.close();
    ({ context, page } = await fresh());
    assert.equal((await loadLive(page, `${base}/shell`, opts)).loaded, true);
    await context.close();
  } finally {
    await browser.close();
    server.closeAllConnections();
    server.close();
  }
});
