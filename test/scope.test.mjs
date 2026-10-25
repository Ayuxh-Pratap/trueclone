// The scope a cloning request asks for (scripts/scope.mjs) and where every link of the clone goes (seed: siteLinks; the
// own bundle and embedded documents: bundle.mjs). RC8: a landing page captured alone kept its links to the site's other
// pages as local paths nothing in the clone answered, and every re-capture command dropped --routes 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { requestedScope, notCapturedWhy, scopeOf, scopeLine, scopeArgs, siteLinks, registrableDomain, sameSite, inScope } from '../scripts/scope.mjs';

const META = (over = {}) => ({ url: 'https://jam.test/', routes: [{ path: '/', slug: '', dir: 'reference' }], routesNotCaptured: [], ...over });

test('the scope a capture asks for: one page, a list, the bounded site; never widened', () => {
  assert.deepEqual(requestedScope('1', null), { kind: 'page', requested: null, cap: 1 });
  assert.deepEqual(requestedScope(undefined, null), { kind: 'site', requested: null, cap: 12 });
  assert.deepEqual(requestedScope('30', null), { kind: 'site', requested: null, cap: 30 });
  assert.deepEqual(requestedScope('/,/pricing', ['/', '/pricing']), { kind: 'list', requested: ['/', '/pricing'], cap: 2 });
  assert.equal(notCapturedWhy({ kind: 'page' }), 'outside the requested scope (this page only)');
  assert.match(notCapturedWhy({ kind: 'site', cap: 12 }), /^beyond the cap of 12 routes/);
});

test('what was captured and left out is stated: the cap reached is never the whole site; a page scope is that page', () => {
  const site = META({ scope: { kind: 'site', cap: 2, requested: null }, routes: [{ path: '/', slug: '' }, { path: '/a', slug: 'a' }], routesFound: [{ path: '/' }, { path: '/a' }, { path: '/b' }], routesNotCaptured: [{ path: '/b', why: 'beyond the cap of 2 routes (--routes <n> for more)' }] });
  const s = scopeOf(site);
  assert.equal(s.capReached, true);
  assert.match(scopeLine(site), /the cap was reached: 1 more page found and not captured, not verified \(not the whole site\)/);
  assert.match(s.discovery, /sitemap\.xml/);
  const page = META({ scope: { kind: 'page', cap: 1 }, routesNotCaptured: [{ path: '/pricing', why: 'outside the requested scope (this page only)' }, { path: '/x.html', failed: true, why: 'capture failed at every size: boom' }] });
  assert.match(scopeLine(page), /^this page only \(\/\); 1 requested page failed to capture and is not verified \(\/x\.html\); 1 other page of the site is outside it, linked to the live site$/);
  assert.equal(scopeArgs(page), ' --routes 1');
  // an earlier capture's records imply its scope (no meta.scope)
  assert.equal(scopeOf(META({ routesNotCaptured: [{ path: '/b', why: 'not in the --routes list' }] })).kind, 'list');
});

test('siteLinks: a page in scope is the clone\'s path; every other page or file of the site its live address, query and fragment kept', () => {
  const meta = META({ routes: [{ path: '/', slug: '' }, { path: '/about', slug: 'about' }] });
  const hrefs = ['/', 'about', '/pricing?plan=pro#faq', 'https://www.jam.test/docs/intro', 'docs/start#top', '/brand.pdf', 'https://other.test/x', '#hero', 'mailto:hi@jam.test', 'tel:+1', '/about?ref=nav#team'];
  const r = siteLinks(hrefs, 'https://jam.test/', meta);
  const to = Object.fromEntries(r.pairs);
  assert.equal(to.about, '/about');
  assert.equal(to['/about?ref=nav#team'], undefined, 'already the local path, kept as written');
  assert.equal(to['/pricing?plan=pro#faq'], 'https://jam.test/pricing?plan=pro#faq');
  assert.equal(to['https://www.jam.test/docs/intro'], undefined, 'an absolute live link stays absolute (never a local 404)');
  assert.equal(to['docs/start#top'], 'https://jam.test/docs/start#top');
  assert.equal(to['/brand.pdf'], 'https://jam.test/brand.pdf');
  for (const h of ['https://other.test/x', '#hero', 'mailto:hi@jam.test', 'tel:+1', '/']) assert.equal(to[h], undefined, h);
  assert.deepEqual(r.live.sort(), ['https://jam.test/brand.pdf', 'https://jam.test/docs/start#top', 'https://jam.test/pricing?plan=pro#faq', 'https://www.jam.test/docs/intro'].sort());
  // a relative link on a route page is the site's, resolved against that page's live address
  const onAbout = Object.fromEntries(siteLinks(['team', '../'], 'https://jam.test/about/', META({ routes: [{ path: '/', slug: '' }, { path: '/about', slug: 'about' }] })).pairs);
  assert.equal(onAbout.team, 'https://jam.test/about/team');
  assert.equal(onAbout['../'], '/');
  assert.ok(inScope(meta, '/about/') && inScope(meta, '/About%20') === false);
});

test('first party: the registrable domain, never a hosting platform shared by different owners', () => {
  assert.ok(sameSite('recorder.jam.dev', 'jam.dev'));
  assert.ok(sameSite('www.jam.dev', 'cdn.jam.dev'));
  assert.ok(!sameSite('jam.dev', 'consent.cookiebot.com'));
  assert.ok(!sameSite('a.github.io', 'b.github.io'));
  assert.ok(!sameSite('jam.framer.website', 'other.framer.website'));
  assert.equal(registrableDomain('shop.example.co.uk'), 'example.co.uk');
  assert.ok(sameSite('embed.localhost:4100', 'localhost:4100'));
  assert.ok(!sameSite('127.0.0.1', 'localhost'));
});

// ---- the own bundle and embedded documents (bundle.mjs), from a synthetic recording ----
async function recordInto(dir, entries, siteHost) {
  const manifest = { entries: {} };
  for (const [url, { body, type = 'text/html', document = false, frameDocument = false, dependency }] of Object.entries(entries)) {
    const u = new URL(url);
    let rel = decodeURIComponent(u.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = `${u.host}${rel}`;
    await fs.mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await fs.writeFile(path.join(dir, file), body);
    manifest.entries[`${u.origin}${u.pathname}${u.search && u.host !== siteHost ? u.search : ''}`] = { type, kind: document || frameDocument ? 'document' : 'other', document, frameDocument, status: 200, file, bytes: body.length, sha1: crypto.createHash('sha1').update(body).digest('hex'), ...(dependency ? { dependency } : {}) };
  }
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
}

test('own bundle: links outside the scope open the live site (markup, guard and worker); in scope and recorded files stay local; an embedded first-party document keeps its requests local', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-scope-bundle-'));
  const meta = { url: 'https://jam.test/', mode: 'exact', permission: 'test', bundle: true, routes: [{ path: '/', slug: '' }, { path: '/about', slug: 'about' }] };
  const page = '<html><head><title>x</title></head><body><a href="/about">about</a><a href="/pricing?plan=pro#faq">pricing</a><a href="https://jam.test/docs">docs</a><a href="https://other.test/x">other</a><a href="/files/brand.pdf">pdf</a><iframe src="https://recorder.jam.test/capture"></iframe></body></html>';
  await recordInto(path.join(root, 'reference', 'bundle'), {
    'https://jam.test/': { body: page, document: true },
    'https://jam.test/about': { body: '<html><head></head><body><a href="/">home</a></body></html>', frameDocument: true },
    'https://jam.test/files/brand.pdf': { body: 'pdf', type: 'application/pdf' },
    'https://recorder.jam.test/capture': { body: '<html><head></head><body><script src="/app.js"></script><a href="/help">help</a></body></html>', frameDocument: true },
    'https://recorder.jam.test/app.js': { body: 'fetch("/state.json")', type: 'text/javascript' },
  }, 'jam.test');
  const { seedBundle } = await import('../scripts/bundle.mjs');
  const r = await seedBundle(root, meta);
  assert.deepEqual(r.missingRoutes, []);
  const home = await fs.readFile(path.join(root, 'clone', 'index.html'), 'utf8');
  assert.match(home, /href="\/about"/, 'a captured route stays the clone\'s page');
  assert.match(home, /href="https:\/\/jam\.test\/pricing\?plan=pro#faq"/, 'out of scope: the live address, query and fragment kept');
  assert.match(home, /href="https:\/\/jam\.test\/docs"/, 'an absolute live link is not rewritten to a local path');
  assert.match(home, /href="https:\/\/other\.test\/x"/);
  assert.match(home, /href="\/files\/brand\.pdf"/, 'a recorded file stays local');
  assert.match(home, /src="\/_ext\/recorder\.jam\.test\/capture"/, 'the embedded document is the clone\'s copy');
  assert.match(home, /addEventListener\('click'/, 'the guard sends navigations outside the scope to the live site');
  assert.deepEqual(r.outOfScope.sort(), ['https://jam.test/docs', 'https://jam.test/pricing?plan=pro#faq']);
  const sw = await fs.readFile(path.join(root, 'clone', 'tc-sw.js'), 'utf8');
  assert.match(sw, /Response\.redirect\(LIVE \+ u\.pathname \+ u\.search, 302\)/);
  assert.match(sw, /status: 404, statusText: 'not recorded'/, 'a missing file is still a 404, never fetched live');
  const rec = await fs.readFile(path.join(root, 'clone', '_ext', 'recorder.jam.test', 'capture'), 'utf8');
  assert.match(rec, /<script id="tc-net">[\s\S]*const HOME = "\/_ext\/recorder\.jam\.test"/, 'the embedded document has its guard, its root-relative requests kept in its folder');
  assert.match(rec, /<script src="\/_ext\/recorder\.jam\.test\/app\.js">/);
  assert.match(rec, /href="https:\/\/recorder\.jam\.test\/help"/, 'its unrecorded page opens live, never a local 404');
});

test('embedded documents of a rebuilt clone: copied into clone/_dep/, root-relative markup kept in their folder, frames pointed at them, links outside the scope live', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-scope-dep-'));
  const meta = { url: 'https://jam.test/', mode: 'exact', permission: 'test', routes: [{ path: '/', slug: '' }], dependencies: [{ src: 'https://recorder.jam.test/capture?v=2', page: '/', host: 'recorder.jam.test', recorded: true, files: 3 }, { src: 'https://jam.test/shell.html?x=1', page: '/', host: 'jam.test', recorded: true, files: 1 }, { src: 'https://cdn.jam.test/lost', page: '/', host: 'cdn.jam.test', recorded: false, why: 'gone' }] };
  await recordInto(path.join(root, 'reference', 'dependencies', 'bundle'), {
    'https://recorder.jam.test/capture?v=2': { body: '<html><head><link rel="stylesheet" href="/s.css"></head><body><script type="module" src="/app.js"></script><a href="/help">help</a><a href="https://jam.test/">home</a><a href="https://jam.test/pricing">pricing</a></body></html>', frameDocument: true, dependency: 'https://recorder.jam.test/capture?v=2' },
    'https://recorder.jam.test/s.css': { body: 'body{background:url(/bg.png)}', type: 'text/css', dependency: 'https://recorder.jam.test/capture?v=2' },
    'https://recorder.jam.test/app.js': { body: 'import x from "/lib.js"; import("/chunk.js")', type: 'text/javascript', dependency: 'https://recorder.jam.test/capture?v=2' },
    'https://jam.test/shell.html': { body: '<html><head></head><body>shell</body></html>', frameDocument: true, dependency: 'https://jam.test/shell.html?x=1' },
  }, 'jam.test');
  const { placeDependencies, dependencyMap } = await import('../scripts/bundle.mjs');
  const r = await placeDependencies(root, meta);
  assert.equal(r.documents, 2);
  const docFile = (await fs.readdir(path.join(root, 'clone', '_dep', 'recorder.jam.test'))).find((f) => /^capture/.test(f));
  const doc = await fs.readFile(path.join(root, 'clone', '_dep', 'recorder.jam.test', docFile), 'utf8');
  assert.match(doc, /href="\/_dep\/recorder\.jam\.test\/s\.css"/);
  assert.match(doc, /src="\/_dep\/recorder\.jam\.test\/app\.js"/);
  assert.match(doc, /href="https:\/\/recorder\.jam\.test\/help"/);
  assert.match(doc, /href="\/"/, 'a link to a page in scope is the clone\'s page, at the root');
  assert.match(doc, /href="https:\/\/jam\.test\/pricing"/);
  assert.match(doc, /const HOME = "\/_dep\/recorder\.jam\.test"/);
  assert.match(await fs.readFile(path.join(root, 'clone', '_dep', 'recorder.jam.test', 's.css'), 'utf8'), /url\(\/_dep\/recorder\.jam\.test\/bg\.png\)/);
  assert.match(await fs.readFile(path.join(root, 'clone', '_dep', 'recorder.jam.test', 'app.js'), 'utf8'), /from "\/_dep\/recorder\.jam\.test\/lib\.js"; import\("\/_dep\/recorder\.jam\.test\/chunk\.js"\)/);
  const map = await dependencyMap(root, meta);
  assert.match(map['https://recorder.jam.test/capture?v=2'], /^\/_dep\/recorder\.jam\.test\/capture/);
  assert.equal(map['https://jam.test/shell.html?x=1'], '/_dep/jam.test/shell.html?x=1', 'the site\'s own query kept');
  assert.equal(map['https://cdn.jam.test/lost'], undefined, 'an unrecorded document has no copy');
  // the unrecorded one is required and not verifiable: the page cannot be Verified as it is
  const { evaluate } = await import('../scripts/verdict.mjs');
  await fs.mkdir(path.join(root, 'reference'), { recursive: true });
  await fs.writeFile(path.join(root, 'reference', 'meta.json'), JSON.stringify({ ...meta, capturedAt: '2026-10-25T00:00:00.000Z', viewports: [] }));
  const ev = await evaluate(root, { readOnly: true });
  const dep = ev.units.find((u) => u.check === 'dependency');
  assert.equal(dep?.status, 'tool');
  assert.match(dep.reason, /embedded document https:\/\/cdn\.jam\.test\/lost not recorded: gone/);
  assert.equal(ev.verified, false);
});
