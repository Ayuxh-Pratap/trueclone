// Recorded files served by the clone, offline: the site's own bundle (an own-bundle clone: app mode or capture --bundle,
// exact mode with the owner's permission) and the first-party documents a page embeds (capture.mjs meta.dependencies,
// exact mode), each from what capture recorded (reference/bundle/, reference/dependencies/bundle/):
// - every recorded address written in the recorded text (HTML, JS, CSS, JSON) points at the clone's copy: for the own
//   bundle the site's own host at the clone's root and another host under clone/_ext/<host>/; for an embedded document
//   every host under clone/_dep/<host>/ (a root-relative address in its markup and stylesheets too);
// - a network guard runs first in each recorded document: a request the code makes at run time (fetch, XHR, a beacon)
//   to a recorded address is served from the copy, a write (POST, PUT) is answered without being sent, tracking is
//   answered empty, anything never recorded is a 404, never fetched from the live site;
// - a link to a page of the site outside the scope the user asked for opens that page on the live site, its query and
//   fragment kept (its address written absolute in the markup, and the guard and the worker send a navigation there),
//   never a local 404: a navigation is not a missing file of the clone;
// - a service worker (own bundle; registered in the background, so the first visit is the page itself, without a
//   reload) does the same for later visits, for requests the page makes by markup too.
import fs from 'node:fs/promises';
import path from 'node:path';
import { isDocumentEntry, capturedRoutes } from './bundle-complete.mjs';
import { routeKey, canonicalPath } from './routes.mjs';
import { inScope } from './scope.mjs';

const TRACKING = /google-analytics|googletagmanager|doubleclick|facebook\.(com|net)|hotjar|segment\.(io|com)|plausible|cloudflareinsights|clarity\.ms|sentry|datadog|mixpanel|amplitude|posthog|intercom|hubspot|linkedin\.com\/px|tiktok|bat\.bing|vercel-insights|vitals\.vercel/i;
const TEXT = /\.(html?|m?js|css|json|svg|txt|xml|webmanifest)$/i;
const SKIP_LINK = /^(#|mailto:|tel:|javascript:|data:|blob:|about:)/i;

// in the page, before any of the site's scripts: the code's own requests stay in the clone; a navigation to a page
// outside the scope goes to the live site. HOME: an embedded document's own prefix (/_dep/<host>), so a root-relative
// request it makes at run time finds its copy.
const GUARD = ({ map, site, tracking, live, pages, home = null }) => `(() => {
  const MAP = ${JSON.stringify(map)};
  const FILES = new Set(Object.values(MAP));
  const PAGES = new Set(${JSON.stringify(pages)});
  const SITE = ${JSON.stringify(site)};
  const LIVE = ${JSON.stringify(live)};
  const HOME = ${JSON.stringify(home)};
  const TRACKING = ${tracking};
  const route = (input, method) => {
    let u;
    try { u = new URL(typeof input === 'string' ? input : input.url, location.href); } catch { return { keep: true }; }
    if (u.origin === location.origin) return HOME && !u.pathname.startsWith('/_dep/') && !u.pathname.startsWith('/_ext/') ? { url: HOME + u.pathname + u.search } : { keep: true };
    if (TRACKING.test(u.href)) return { stub: '', status: 204 };
    if (method && method !== 'GET') return { stub: '{}', status: 200 };
    const local = MAP[u.origin + u.pathname + u.search] || MAP[u.origin + u.pathname] || (u.host === SITE && !HOME ? u.pathname : null);
    return local ? { url: local + (u.host === SITE ? u.search : '') } : { stub: '', status: 404 };
  };
  const ofetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const r = route(input, (init && init.method) || (typeof input === 'object' && input.method) || 'GET');
    if (r.keep) return ofetch(input, init);
    if (r.url) return ofetch(r.url, init && { ...init, mode: 'same-origin', credentials: 'same-origin' });
    return Promise.resolve(new Response(r.status === 204 ? null : r.stub, { status: r.status, headers: { 'content-type': 'application/json' } }));
  };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    const r = route(url, String(method || 'GET').toUpperCase());
    return open.call(this, r.keep || r.url ? method : 'GET', r.keep ? url : r.url || ('data:application/json,' + encodeURIComponent(r.stub || '')), ...rest);
  };
  if (navigator.sendBeacon) navigator.sendBeacon = () => true;
  // a link to a page of the site this clone does not have (outside the requested scope) opens it on the live site,
  // before the site's own router can try to load it here
  addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a || e.button !== 0) return;
    let u;
    try { u = new URL(a.getAttribute('href'), location.href); } catch { return; }
    if (u.origin !== location.origin) return;
    const p = u.pathname.replace(/\\/+$/, '') || '/';
    if (PAGES.has(p) || FILES.has(u.pathname)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const to = LIVE + u.pathname + u.search + u.hash;
    if (a.target === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey) window.open(to, '_blank', 'noopener'); else location.assign(to);
  }, true);
  if (!HOME && 'serviceWorker' in navigator) navigator.serviceWorker.register('/tc-sw.js', { scope: '/' }).catch(() => {});
})();`;

// the worker, for later visits (requests by markup too); a top-level navigation to a page the clone does not have goes
// to the live site; a frame's never-recorded document is a 404
const WORKER = ({ map, docs, site, tracking, live }) => `// trueclone own-bundle service worker (generated): the site's own code runs on its recorded files, offline.
const SITE = ${JSON.stringify(site)};
const LIVE = ${JSON.stringify(live)};
const MAP = ${JSON.stringify(map)};
const FILES = new Set(Object.values(MAP));
const DOCS = ${JSON.stringify(docs)};
const TRACKING = ${tracking};
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const u = new URL(req.url);
  if (u.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      const p = u.pathname.replace(/\\/+$/, '') || '/';
      if (DOCS[p]) return e.respondWith(fetch(DOCS[p]));
      if (!FILES.has(u.pathname) && req.destination === 'document') return e.respondWith(Response.redirect(LIVE + u.pathname + u.search, 302));
    }
    return;
  }
  if (req.method !== 'GET') return e.respondWith(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  if (TRACKING.test(u.href)) return e.respondWith(new Response(null, { status: 204 }));
  const local = MAP[u.origin + u.pathname + u.search] || MAP[u.origin + u.pathname] || (u.host === SITE ? u.pathname : null);
  if (local) return e.respondWith(fetch(local + (u.host === SITE ? u.search : '')));
  return e.respondWith(new Response('', { status: 404, statusText: 'not recorded' }));
});
`;

// A link that opens the live site is written with a marker while the recorded origins are rewritten (which would turn
// https://site/pricing, or //site/pricing, back into a local /pricing), then restored. The marker has no "//": no
// origin rewrite can match it
const LIVE_MARK = { 'https:': 'tclive-s:', 'http:': 'tclive-p:' };
const unmark = (t) => t.replace(/tclive-(s|p):/g, (m, s) => (s === 's' ? 'https://' : 'http://'));

// Each recorded file into the clone at its local address (prefixOf(host) + its path), the recorded addresses in the text
// files pointing at the copies; each recorded HTML document's links first through `links(html, its live address,
// isRecorded)`. Returns what was placed and the map (recorded address -> local address).
async function placeRecorded(refBundle, clone, site, prefixOf, links = null) {
  const manifest = JSON.parse(await fs.readFile(path.join(refBundle, 'manifest.json'), 'utf8'));
  const recorded = (u) => { const e = manifest.entries[`${u.origin}${u.pathname}${u.search && u.host !== site.host ? u.search : ''}`]; return Boolean(e && !e.failed && e.file); };
  const map = {}, hosts = new Set();
  const placed = [];
  for (const [abs, entry] of Object.entries(manifest.entries)) {
    // a file that could not be recorded has no copy: the clone answers it 404, and status reports it (lib.mjs
    // bundleIntegrity) instead of a clone that pretends to have it
    if (entry.failed || !entry.file) continue;
    const u = new URL(abs);
    const [, ...rest] = entry.file.split('/');
    const local = `${prefixOf(u.host)}${rest.join('/')}`;
    const to = path.join(clone, ...local.split('/').filter(Boolean));
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(path.join(refBundle, ...entry.file.split('/')), to);
    map[abs] = local;
    hosts.add(u.origin);
    placed.push({ to, local, entry, u });
  }
  // an address of another host recorded with its query (lib.mjs bundleKey) has a file of its own: written in full in the
  // text (as is, with &amp; in markup, JSON-escaped, protocol-relative), it points at that file before any origin is
  // rewritten below (RC8 elise: four Google Fonts stylesheets were one file, typed application/octet-stream)
  const exact = placed.filter((p) => p.u.search && p.u.host !== site.host)
    .flatMap((p) => { const k = p.u.href; const rel = k.replace(/^https?:/, ''); return [[k, p.local], [k.replace(/&/g, '&amp;'), p.local], [k.replace(/\//g, '\\/'), p.local.replace(/\//g, '\\/')], [rel, p.local], [rel.replace(/&/g, '&amp;'), p.local]]; })
    .sort((a, b) => b[0].length - a[0].length);
  // every recorded origin written in the text points at the clone's copies: "https://cdn.x.com/a.glb" and its JSON-escaped
  // form "https:\/\/cdn.x.com\/a.glb" become "<prefix>a.glb"
  const prefixes = [...hosts].map((origin) => {
    const host = new URL(origin).host;
    const to = prefixOf(host);
    return [[`${origin}/`, to], [`//${host}/`, to], [`${origin.replace(/\//g, '\\/')}\\/`, to.replace(/\//g, '\\/')]];
  }).flat().sort((a, b) => b[0].length - a[0].length);
  const isText = (p) => TEXT.test(p.to) || /text|javascript|json|xml|svg/.test(p.entry.type || '');
  const isHtml = (p) => isDocumentEntry(p.entry) && /html/i.test(`${p.entry.type || ''} ${p.to}`);
  const outOfScope = new Set();
  for (const p of placed) {
    if (!isText(p)) continue;
    let t = await fs.readFile(p.to, 'utf8');
    const before = t;
    if (links && isHtml(p)) { const r = links(t, p.u.href, recorded); t = r.text; r.out.forEach((l) => outOfScope.add(l)); }
    for (const [from, to] of exact) t = t.split(from).join(to);
    for (const [from, to] of prefixes) t = t.split(from).join(to);
    t = unmark(t);
    if (t !== before) await fs.writeFile(p.to, t);
  }
  return { map, placed, hosts, isText, isHtml, outOfScope: [...outOfScope] };
}

// The links (<a href>) of one recorded document whose live address is `docUrl`. A page of the site in scope stays a link
// to the clone's page (its address made root-relative when `rootLocal`: an embedded document lives under /_dep/); a
// recorded file stays local; anything else opens on the live site, its address absolute, query and fragment kept (a
// relative link of an embedded document would otherwise resolve inside the clone's copy of it). The site's pages sent
// to the live site are returned (REPORT lists them).
function scopeLinks(meta, site, { rootLocal = false } = {}) {
  const host = site.host.replace(/^www\./, '');
  return (html, docUrl, recorded) => {
    const out = [];
    const text = html.replace(/(<a\b[^>]*?\shref\s*=\s*)(["'])([^"']*)\2/gi, (all, pre, q, h) => {
      if (!h || SKIP_LINK.test(h.trim())) return all;
      let u;
      try { u = new URL(h.replace(/&amp;/g, '&'), docUrl); } catch { return all; }
      if (!/^https?:$/.test(u.protocol)) return all;
      const own = u.host.replace(/^www\./, '') === host;
      const esc = (s) => s.replace(/&(?!amp;)/g, '&amp;');
      if (own && inScope(meta, u.pathname)) return rootLocal ? `${pre}${q}${esc(`${canonicalPath(u.pathname)}${u.search}${u.hash}`)}${q}` : all;
      if (recorded(u)) return all;
      if (own) out.push(u.href);
      return `${pre}${q}${esc(`${LIVE_MARK[u.protocol]}${u.host}${u.pathname}${u.search}${u.hash}`)}${q}`;
    });
    return { text, out };
  };
}

export async function seedBundle(root, meta) {
  const ref = path.join(root, 'reference', 'bundle');
  const clone = path.join(root, 'clone');
  const site = new URL(meta.finalUrl || meta.url);
  // the clone folder holds the bundle only (patches stay)
  for (const e of await fs.readdir(clone).catch(() => [])) if (e !== 'patches') await fs.rm(path.join(clone, e), { recursive: true, force: true });
  await fs.mkdir(clone, { recursive: true });
  // links outside the scope the user asked for open the live site (scopeLinks), written before the origins are rewritten
  const { map, placed, hosts, isHtml, outOfScope } = await placeRecorded(ref, clone, site, (host) => (host === site.host ? '/' : `/_ext/${host.replace(/[:]/g, '_')}/`), scopeLinks(meta, site));
  const docs = {};
  const pages = [...new Set(capturedRoutes(meta).map((r) => (r.path === '/' ? canonicalPath(site.pathname) : canonicalPath(r.path))).concat('/'))];
  const guard = GUARD({ map, site: site.host, tracking: TRACKING.toString(), live: site.origin, pages });
  // each recorded page: its document with the guard first in <head>, noindex. A page is any frame's document (a view an
  // app shell loads in an iframe is a page of its own at its address too) or HTML recorded another way
  // (bundle-complete.mjs isDocumentEntry); RC8 elise counted only the start page's. A frame's document of another host (an
  // embedded first-party document) gets the guard too.
  for (const p of placed.filter(isHtml)) {
    let html = await fs.readFile(p.to, 'utf8');
    // another host's document (a frame of it) lives under /_ext/<host>/: its root-relative addresses are its host's
    const home = p.u.host === site.host ? null : `/_ext/${p.u.host.replace(/[:]/g, '_')}`;
    if (home) html = rootRelative(html, home);
    html = html.replace(/<head([^>]*)>/i, (m) => `${m}\n<meta name="robots" content="noindex,nofollow"><!-- trueclone own-bundle clone of ${site.href} (exact mode, authorised by: ${String(meta.permission).replace(/--/g, '-')}). Local only. -->\n<script id="tc-net">${home ? GUARD({ map, site: site.host, tracking: TRACKING.toString(), live: site.origin, pages, home }) : guard}</script>`);
    await fs.writeFile(p.to, html);
    if (p.u.host === site.host && p.local.startsWith('/') && !p.local.startsWith('/_ext/')) docs[p.u.pathname.replace(/\/+$/, '') || '/'] = p.local;
  }
  // the start page at the clone's root too (/products/x answers at / and at its own address)
  const startPath = site.pathname.replace(/\/+$/, '') || '/';
  if (startPath !== '/' && docs[startPath]) {
    await fs.copyFile(path.join(clone, ...docs[startPath].split('/').filter(Boolean)), path.join(clone, 'index.html'));
    docs['/'] = '/index.html';
  }
  await fs.writeFile(path.join(clone, 'tc-sw.js'), WORKER({ map, docs, site: site.host, tracking: TRACKING.toString(), live: site.origin }));
  // every captured route has its page in the clone, or the seed says which do not (seed.mjs fails on them)
  const served = new Set(Object.keys(docs).map((p) => routeKey(p)));
  const missingRoutes = capturedRoutes(meta).filter((r) => !served.has(r.path === '/' ? routeKey(startPath) : routeKey(r.path))).map((r) => r.path);
  return { files: placed.length, documents: Object.keys(docs).length, hosts: hosts.size, missingRoutes, outOfScope };
}

// A document kept under its host's folder (home: /_dep/<host> or /_ext/<host>): root-relative addresses in its markup
// are its host's ("/assets/app.js" on recorder.jam.dev), so they point into that folder. A link (<a>) is left to
// scopeLinks (a page in scope is the clone's own page, at the root).
function rootRelative(html, home) {
  return html.replace(/<([a-z][\w-]*)\b[^>]*>/gi, (tag, tagName) => (tagName.toLowerCase() === 'a' ? tag : tag.replace(/(\s(?:src|href|poster|action|data|srcset)\s*=\s*["'])\/(?!\/|_dep\/|_ext\/)/gi, `$1${home}/`)));
}

// ---------- embedded first-party documents (a rebuilt clone, exact mode) ----------
const depPrefix = (host) => `/_dep/${host.replace(/[:]/g, '_')}/`;
// where the clone keeps each recorded embedded document (its recorded address, and its src with a query, -> local
// address with that query): what seed points the frames at
export async function dependencyMap(root, meta) {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'reference', 'dependencies', 'bundle', 'manifest.json'), 'utf8').catch(() => 'null'));
  if (!manifest) return {};
  const site = new URL(meta.finalUrl || meta.url);
  const out = {};
  for (const d of (meta.dependencies || []).filter((x) => x.recorded)) {
    const u = new URL(d.src);
    const key = `${u.origin}${u.pathname}${u.search && u.host !== site.host ? u.search : ''}`;
    const e = manifest.entries[key];
    if (!e || e.failed || !e.file) continue;
    const [, ...rest] = e.file.split('/');
    out[d.src] = `${depPrefix(u.host)}${rest.join('/')}${u.host === site.host ? u.search : ''}${u.hash}`;
  }
  return out;
}
// Each recorded embedded document and its files into clone/_dep/<host>/, served by the clone's own server: its
// recorded addresses point at the copies, a root-relative address in its markup and stylesheets at its own folder,
// links outside the scope at the live site, and its guard keeps every run-time request local
export async function placeDependencies(root, meta) {
  const refBundle = path.join(root, 'reference', 'dependencies', 'bundle');
  const clone = path.join(root, 'clone');
  await fs.rm(path.join(clone, '_dep'), { recursive: true, force: true });
  if (!(await fs.stat(path.join(refBundle, 'manifest.json')).catch(() => null))) return { files: 0, documents: 0, outOfScope: [] };
  const site = new URL(meta.finalUrl || meta.url);
  const { map, placed, isText, isHtml, outOfScope } = await placeRecorded(refBundle, clone, site, depPrefix, scopeLinks(meta, site, { rootLocal: true }));
  let documents = 0;
  for (const p of placed) {
    if (!isText(p)) continue;
    const home = depPrefix(p.u.host).replace(/\/$/, '');
    let t = await fs.readFile(p.to, 'utf8');
    const before = t;
    const html = isHtml(p);
    if (html) {
      t = rootRelative(t, home);
      t = t.replace(/<head([^>]*)>/i, (m) => `${m}\n<meta name="robots" content="noindex,nofollow">\n<script id="tc-net">${GUARD({ map, site: site.host, tracking: TRACKING.toString(), live: site.origin, pages: [], home })}</script>`);
      documents++;
    }
    if (/\.css$/i.test(p.to) || /text\/css/.test(p.entry.type || '') || html) t = t.replace(/url\(\s*(["']?)\/(?!\/|_dep\/)/gi, `url($1${home}/`);
    if (/\.m?js$/i.test(p.to) || /javascript/.test(p.entry.type || '')) t = t.replace(/(\bfrom\s*|\bimport\s*\(\s*)(["'])\/(?!\/|_dep\/)/g, `$1$2${home}/`);
    if (t !== before) await fs.writeFile(p.to, t);
  }
  return { files: placed.length, documents, outOfScope, map };
}
