// RC5 zero (2026-10-22): the own-bundle recorder saved nine textures and videos as 0-byte files. Cause: Chrome's
// DevTools protocol hands over an EMPTY body for a fetch the page consumes as a Blob, although the bytes arrived.
// A local page reproduces it and every neighbouring case: what must be recovered, what is legitimately empty, what a
// recovery must refuse (an error, an HTML page, a redirect), and that a late response is not cut off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openBrowser, newPage, recordBundle, bundleIntegrity, bodyVerdict, VIEWPORTS } from '../../scripts/lib.mjs';

const IMG = Buffer.alloc(150000, 7);
const JSONGZ = zlib.gzipSync(Buffer.from(JSON.stringify({ a: 'x'.repeat(40000) })));
const VIDEO = Buffer.alloc(80000, 3);
const hits = {};

function server() {
  return http.createServer((q, r) => {
    const p = new URL(q.url, 'http://x').pathname;
    hits[p] = (hits[p] || 0) + 1;
    const first = hits[p] === 1;
    const img = (buf = IMG, type = 'image/webp') => { r.writeHead(200, { 'content-type': type, 'content-length': buf.length }); r.end(buf); };
    if (p === '/blob.webp' || p === '/buf.webp' || p === '/late.webp') return img();
    if (p === '/gz.json') { r.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'gzip', 'content-length': JSONGZ.length }); return r.end(JSONGZ); }
    if (p === '/empty.bin') { r.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': 0 }); return r.end(); }
    // the browser gets the file; asked again, the server fails, answers a login page, or moves it
    if (p === '/flaky.webp') { if (first) return img(); r.writeHead(500).end('error'); return; }
    if (p === '/login.webp') { if (first) return img(); r.writeHead(200, { 'content-type': 'text/html' }).end('<html><body>Sign in</body></html>'); return; }
    if (p === '/moved.webp') { if (first) return img(); r.writeHead(302, { location: '/elsewhere.webp' }).end(); return; }
    if (p === '/elsewhere.webp') return img(Buffer.alloc(100, 1));
    if (p === '/v.mp4') {
      const m = /bytes=(\d+)-(\d*)/.exec(q.headers.range || '');
      if (m) { const s = +m[1], e = m[2] ? +m[2] : VIDEO.length - 1; r.writeHead(206, { 'content-type': 'video/mp4', 'content-range': `bytes ${s}-${e}/${VIDEO.length}`, 'content-length': e - s + 1, 'accept-ranges': 'bytes' }); return r.end(VIDEO.subarray(s, e + 1)); }
      r.writeHead(200, { 'content-type': 'video/mp4', 'content-length': VIDEO.length, 'accept-ranges': 'bytes' }); return r.end(VIDEO);
    }
    r.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><body><video src="/v.mp4" preload="auto" muted></video><script>
      const blob = (u) => fetch(u).then((x) => x.blob());
      blob('/blob.webp'); fetch('/buf.webp').then((x) => x.arrayBuffer()); blob('/gz.json'); blob('/empty.bin');
      blob('/flaky.webp'); blob('/login.webp'); blob('/moved.webp');
      window.later = () => blob('/late.webp');
    </script></body>`);
  });
}

test('the recorder recovers what the browser does not hand over, keeps what is legitimately empty, refuses impostors', { timeout: 120000 }, async () => {
  const srv = server();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const ref = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-bundle-'));
  const browser = await openBrowser();
  try {
    const { context, page } = await newPage(browser, VIEWPORTS[0], { stabilise: false });
    const done = recordBundle(page, ref);
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    // a texture requested just as the recording is being finished is still recorded whole
    await page.evaluate(() => window.later());
    await done();
    await context.close();
    const m = JSON.parse(await fs.readFile(path.join(ref, 'bundle', 'manifest.json'), 'utf8')).entries;
    const e = (p) => m[`${base}${p}`];
    const size = async (p) => (await fs.stat(path.join(ref, 'bundle', ...e(p).file.split('/')))).size;

    // the RC5 failure: a Blob-consumed fetch, lost by the browser, recovered whole
    assert.equal(e('/blob.webp').via, 'recovered', JSON.stringify(e('/blob.webp')));
    assert.equal(e('/blob.webp').recoveredFrom, 'lost');
    assert.equal(await size('/blob.webp'), IMG.length);
    // handed over normally: kept as the browser gave it
    assert.equal(e('/buf.webp').via, 'browser');
    assert.equal(await size('/buf.webp'), IMG.length);
    // content-encoded and lost: recovered (decoded), no length comparison across encodings
    assert.equal(e('/gz.json').via, 'recovered');
    assert.ok(JSON.parse(await fs.readFile(path.join(ref, 'bundle', ...e('/gz.json').file.split('/')), 'utf8')).a.length === 40000);
    // legitimately empty: kept, marked empty, not a problem
    assert.equal(e('/empty.bin').empty, true);
    assert.equal(await size('/empty.bin'), 0);
    // a range answer (the video element) is replaced by the whole file
    assert.equal(e('/v.mp4').via, 'recovered');
    assert.equal(e('/v.mp4').recoveredFrom, 'partial');
    assert.equal(await size('/v.mp4'), VIDEO.length);
    // recovery that cannot get the same resource is a recorded failure, with why, after a bounded number of tries
    assert.match(e('/flaky.webp').failed, /answered HTTP 500/);
    assert.equal(e('/flaky.webp').attempts, 2);
    assert.match(e('/login.webp').failed, /text\/html/);
    assert.match(e('/moved.webp').failed, /redirected/);
    assert.equal(e('/moved.webp').file, undefined);
    // the page's own document (served chunked) is kept as the browser handed it over
    assert.equal(e('/').via, 'browser', JSON.stringify(e('/')));
    // the late request
    assert.equal(await size('/late.webp'), IMG.length);

    const integrity = await bundleIntegrity(ref);
    assert.deepEqual(integrity.problems.map((p) => p.url.replace(base, '')).sort(), ['/flaky.webp', '/login.webp', '/moved.webp']);
  } finally {
    await browser.close();
    srv.close();
  }
});

test('bundleIntegrity reads the record, not the folder: an RC5 empty file is a problem, a recorded empty answer is not', async () => {
  const ref = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-integrity-'));
  const dir = path.join(ref, 'bundle', 'x.test');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'old.webp'), '');
  await fs.writeFile(path.join(dir, 'empty.bin'), '');
  await fs.writeFile(path.join(dir, 'short.webp'), 'abc');
  await fs.writeFile(path.join(ref, 'bundle', 'manifest.json'), JSON.stringify({ entries: {
    'https://x.test/old.webp': { file: 'x.test/old.webp', type: 'image/webp', kind: 'fetch' },
    'https://x.test/empty.bin': { file: 'x.test/empty.bin', bytes: 0, empty: true, via: 'browser' },
    'https://x.test/short.webp': { file: 'x.test/short.webp', bytes: 10, via: 'browser' },
    'https://x.test/gone.webp': { file: 'x.test/gone.webp', bytes: 10, via: 'browser' },
  } }));
  const { problems } = await bundleIntegrity(ref);
  assert.deepEqual(problems.map((p) => p.url.split('/').pop()).sort(), ['gone.webp', 'old.webp', 'short.webp']);
  assert.match(problems.find((p) => p.url.endsWith('old.webp')).why, /before rc\.6/);
});

test('bodyVerdict: what needs recovering, and what does not', () => {
  // the RC5 failure: nothing handed over although the body arrived
  assert.equal(bodyVerdict({ status: 200, bodyLength: 0, wireBytes: 150000, encoding: '', contentLength: 150000 }), 'lost');
  assert.equal(bodyVerdict({ status: 200, bodyLength: 0, wireBytes: 0, encoding: '' }), 'empty');
  assert.equal(bodyVerdict({ status: 200, bodyLength: 0, wireBytes: 5, encoding: '', contentLength: 0 }), 'empty');
  assert.equal(bodyVerdict({ status: 204, bodyLength: 0, wireBytes: null, encoding: '' }), 'empty');
  assert.equal(bodyVerdict({ status: 206, bodyLength: 5000, wireBytes: 5000, encoding: '' }), 'partial');
  assert.equal(bodyVerdict({ status: 200, bodyLength: 90000, wireBytes: 90000, encoding: '', contentLength: 150000 }), 'incomplete');
  // chunked: the bytes on the wire include the framing (44 for a 33-byte page); no declared length, nothing to compare
  assert.equal(bodyVerdict({ status: 200, bodyLength: 33, wireBytes: 44, encoding: '' }), 'ok');
  // encoded: the declared length is the encoded one; the decoded body is longer, and that is not a defect
  assert.equal(bodyVerdict({ status: 200, bodyLength: 50000, wireBytes: 83, encoding: 'gzip', contentLength: 83 }), 'ok');
  assert.equal(bodyVerdict({ status: 200, bodyLength: 150000, wireBytes: 150000, encoding: '', contentLength: 150000 }), 'ok');
});
