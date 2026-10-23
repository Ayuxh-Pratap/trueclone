// One route rule (scripts/routes.mjs, RC6-07): a route's identity is its encoded pathname, its folder the decoded name
// made safe, its address the encoded form again; and the bundled server reads with the rule the seed writes with.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { canonicalPath, decodePath, decodeSegments, safeSegment, routeDir, routeUrl, samePath, routeKey, slugOf, uniqueSlugs, dirKey, appDir } from '../scripts/routes.mjs';
import { serve } from '../scripts/lib.mjs';

// link name -> [meta path (identity), clone folder, clone address on a base below a folder]
const CASES = {
  'plain-page.html': ['/plain-page.html', 'plain-page.html', 'http://h/c/plain-page.html'],
  'Landing Page.html': ['/Landing%20Page.html', 'Landing Page.html', 'http://h/c/Landing%20Page.html'],
  'NASA (Draft).html': ['/NASA%20(Draft).html', 'NASA (Draft).html', 'http://h/c/NASA%20(Draft).html'],
  'café.html': ['/caf%C3%A9.html', 'café.html', 'http://h/c/caf%C3%A9.html'],
  'naïve/日本.html': ['/na%C3%AFve/%E6%97%A5%E6%9C%AC.html', 'naïve/日本.html', 'http://h/c/na%C3%AFve/%E6%97%A5%E6%9C%AC.html'],
  '50%25off.html': ['/50%25off.html', '50%off.html', 'http://h/c/50%25off.html'],
  'q%3Fx.html': ['/q%3Fx.html', 'q_x.html', 'http://h/c/q%3Fx.html'],
  'h%23x.html': ['/h%23x.html', 'h#x.html', 'http://h/c/h%23x.html'],
  'a%2Fb.html': ['/a%2Fb.html', 'a_b.html', 'http://h/c/a%2Fb.html'],
  '100%.html': ['/100%.html', '100%.html', 'http://h/c/100%.html'],
  'a+b.html': ['/a+b.html', 'a+b.html', 'http://h/c/a+b.html'],
  "it's.html": ["/it's.html", "it's.html", "http://h/c/it's.html"],
};

test('a link becomes one identity, one folder and one address, whatever its characters', () => {
  for (const [link, [id, dir, addr]] of Object.entries(CASES)) {
    // the identity is what capture stores: the browser's own pathname for the link
    assert.equal(canonicalPath(new URL(link, 'https://site.test/').pathname), id, link);
    assert.equal(routeDir(id), dir, link);
    assert.equal(routeUrl(id, 'http://h/c/'), addr, link);
    // the same route written decoded (a command line) has the same identity and folder
    if (!/%(?![0-9a-f]{2})/i.test(link) && !/%2F|%3F|%23|%25/i.test(link)) assert.equal(canonicalPath(`/${decodeURIComponent(link)}`), id, link);
  }
  assert.equal(routeUrl('/about', 'https://site.test/x/', true), 'https://site.test/about');
  assert.equal(routeUrl('/a:b', 'http://h/'), 'http://h/a:b', 'a colon is never read as a scheme');
  assert.equal(routeUrl('/', 'http://h/c/'), 'http://h/c/');
});

test('decoding never throws: a malformed escape keeps its segment, or is refused when asked to be strict', () => {
  assert.deepEqual(decodeSegments('/100%/a%20b'), ['100%', 'a b']);
  assert.equal(decodeSegments('/100%/a%20b', true), null);
  assert.equal(decodePath('/50%25off.html'), '/50%off.html');
  assert.equal(decodePath('/'), '/');
});

test('trailing slashes, index.html and spelling are one route', () => {
  assert.equal(canonicalPath('/about/'), '/about');
  assert.equal(canonicalPath('about'), '/about');
  assert.equal(canonicalPath('//evil.test/x'), '/evil.test/x', 'never a host');
  assert.equal(canonicalPath(''), '/');
  assert.ok(samePath('/x/index.html', '/x/'));
  assert.ok(samePath('/index.html', '/'));
  assert.ok(samePath('/caf%c3%a9.html', '/café.html'));
  assert.ok(!samePath('/a%2Fb', '/a/b'), 'an escaped slash is part of a name, not a separator');
  assert.notEqual(routeKey('/x/index.html'), routeKey('/x'), 'dedup by canonical path keeps index.html (capture always did)');
});

test('folder names are legal everywhere: Windows-illegal characters, reserved names, dots', () => {
  assert.equal(safeSegment('a<b>c:d"e|f?g*h\\i/j'), 'a_b_c_d_e_f_g_h_i_j');
  assert.equal(safeSegment('x\u0001y'), 'x_y');
  for (const n of ['CON', 'prn', 'Aux', 'NUL', 'COM1', 'lpt9']) assert.equal(safeSegment(n), `${n}_`);
  assert.equal(safeSegment('con.html'), 'con_.html');
  assert.equal(safeSegment('console.html'), 'console.html');
  assert.equal(safeSegment('a. '), 'a');
  for (const n of ['.', '..', '', '...']) assert.equal(safeSegment(n), '_');
  assert.equal(routeDir('/%2e%2e/%2E%2E/x'), 'x', 'dot segments never step out of clone/');
  assert.equal(routeDir('/'), '');
  assert.equal(dirKey('/About.html'), dirKey('/about.html'), 'one folder on a case-insensitive file system');
});

test('slugs: the old rule, made unique in order', () => {
  assert.equal(slugOf('/about'), 'about');
  assert.equal(slugOf('/Landing%20Page.html'), 'Landing_20Page_html', 'existing captures keep their slug');
  assert.equal(slugOf('/docs/intro'), 'docs__intro');
  const m = uniqueSlugs(['/', '/a.b', '/a_b', '/A_b', '/a_b-2', '/about'], '/');
  assert.deepEqual([...m.values()], ['', 'a_b', 'a_b-2', 'A_b-3', 'a_b-2-2', 'about']);
  assert.equal(new Set([...m.values()].map((s) => s.toLowerCase())).size, m.size, 'no two routes share a slug');
  assert.deepEqual([...uniqueSlugs(['/a_b', '/a.b'], '/').values()], ['a_b', 'a_b-2'], 'deterministic: the first in order keeps it');
});

test('Next.js folders: the encoded segment, or none for route syntax and illegal names', () => {
  assert.equal(appDir('/Landing%20Page.html'), 'Landing%20Page.html');
  assert.equal(appDir('/caf%C3%A9.html'), 'caf%C3%A9.html');
  assert.equal(appDir('/docs/intro'), 'docs/intro');
  for (const p of ['/(group)', '/_private', '/[id]', '/@slot', '/a:b', '/CON', '/a.']) assert.equal(appDir(p), null, p);
});

test('the bundled server reads with the seed\'s rule: every route answers 200, a bare % 400, never a crash', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-routes-'));
  for (const [, [id]] of Object.entries(CASES)) {
    await fs.mkdir(path.join(dir, routeDir(id)), { recursive: true });
    await fs.writeFile(path.join(dir, routeDir(id), 'index.html'), `<p>${id}</p>`);
  }
  await fs.writeFile(path.join(dir, 'index.html'), '<p>home</p>');
  const server = await serve(dir);
  try {
    for (const [link, [id]] of Object.entries(CASES)) {
      if (link === '100%.html') continue; // a bare % is no address a browser can ask for
      for (const u of [routeUrl(id, server.url), `${routeUrl(id, server.url)}/`]) {
        const r = await fetch(u);
        assert.equal(r.status, 200, `${link}: ${u}`);
        assert.equal(await r.text(), `<p>${id}</p>`, u);
      }
    }
    assert.equal((await fetch(`${server.url}100%.html`)).status, 400);
    assert.equal((await fetch(`${server.url}a%E0%A4%A.html`)).status, 400);
    assert.equal((await fetch(server.url)).status, 200);
    // dot segments resolve inside the folder (here the app fallback answers: no meta, so not a site of pages)
    assert.equal(await (await fetch(`${server.url}%2e%2e/%2e%2e/etc/hosts`)).text(), '<p>home</p>');
    assert.equal((await fetch(`${server.url}nope.html`)).status, 404);
  } finally { server.close(); }
});
