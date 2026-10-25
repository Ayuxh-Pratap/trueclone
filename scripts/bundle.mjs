// Own-bundle clone (app mode, exact mode, with the owner's permission): the site's own documents, code and files, as
// capture and the reference journey recorded them (reference/bundle/), served from the clone, offline:
// - every recorded address written in the bundle's text (HTML, JS, CSS, JSON) points at the clone's copy: the site's
//   own host at the clone's root, another host under clone/_ext/<host>/;
// - a network guard runs first in each document: a request the code makes at run time (fetch, XHR, a beacon) to a
//   recorded address is served from the copy, a write (POST, PUT) is answered without being sent, tracking is answered
//   empty, anything never recorded is a 404, never fetched from the live site;
// - a service worker (registered in the background, so the first visit is the page itself, without a reload) does the
//   same for later visits, for requests the page makes by markup too.
import fs from 'node:fs/promises';
import path from 'node:path';
import { isDocumentEntry, capturedRoutes } from './bundle-complete.mjs';
import { routeKey } from './routes.mjs';

const TRACKING = /google-analytics|googletagmanager|doubleclick|facebook\.(com|net)|hotjar|segment\.(io|com)|plausible|cloudflareinsights|clarity\.ms|sentry|datadog|mixpanel|amplitude|posthog|intercom|hubspot|linkedin\.com\/px|tiktok|bat\.bing|vercel-insights|vitals\.vercel/i;
const TEXT = /\.(html?|m?js|css|json|svg|txt|xml|webmanifest)$/i;

// in the page, before any of the site's scripts: the code's own requests stay in the clone
const GUARD = (map, site, tracking) => `(() => {
  const MAP = ${JSON.stringify(map)};
  const SITE = ${JSON.stringify(site)};
  const TRACKING = ${tracking};
  const route = (input, method) => {
    let u;
    try { u = new URL(typeof input === 'string' ? input : input.url, location.href); } catch { return { keep: true }; }
    if (u.origin === location.origin) return { keep: true };
    if (TRACKING.test(u.href)) return { stub: '', status: 204 };
    if (method && method !== 'GET') return { stub: '{}', status: 200 };
    const local = MAP[u.origin + u.pathname + u.search] || MAP[u.origin + u.pathname] || (u.host === SITE ? u.pathname : null);
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
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/tc-sw.js', { scope: '/' }).catch(() => {});
})();`;

// the worker, for later visits (requests by markup too)
const WORKER = (map, docs, site, tracking) => `// trueclone own-bundle service worker (generated): the site's own code runs on its recorded files, offline.
const SITE = ${JSON.stringify(site)};
const MAP = ${JSON.stringify(map)};
const DOCS = ${JSON.stringify(docs)};
const TRACKING = ${tracking};
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const u = new URL(req.url);
  if (u.origin === self.location.origin) {
    if (req.mode === 'navigate') { const p = u.pathname.replace(/\\/+$/, '') || '/'; if (DOCS[p]) return e.respondWith(fetch(DOCS[p])); }
    return;
  }
  if (req.method !== 'GET') return e.respondWith(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  if (TRACKING.test(u.href)) return e.respondWith(new Response(null, { status: 204 }));
  const local = MAP[u.origin + u.pathname + u.search] || MAP[u.origin + u.pathname] || (u.host === SITE ? u.pathname : null);
  if (local) return e.respondWith(fetch(local + (u.host === SITE ? u.search : '')));
  return e.respondWith(new Response('', { status: 404, statusText: 'not recorded' }));
});
`;

export async function seedBundle(root, meta) {
  const ref = path.join(root, 'reference', 'bundle');
  const clone = path.join(root, 'clone');
  const manifest = JSON.parse(await fs.readFile(path.join(ref, 'manifest.json'), 'utf8'));
  const site = new URL(meta.finalUrl || meta.url);
  const siteDir = site.host.replace(/[:]/g, '_');
  // the clone folder holds the bundle only (patches stay)
  for (const e of await fs.readdir(clone).catch(() => [])) if (e !== 'patches') await fs.rm(path.join(clone, e), { recursive: true, force: true });
  await fs.mkdir(clone, { recursive: true });
  const map = {}, docs = {}, hosts = new Set();
  const placed = [];
  for (const [abs, entry] of Object.entries(manifest.entries)) {
    // a file that could not be recorded has no copy: the clone answers it 404, and status reports it (lib.mjs
    // bundleIntegrity) instead of a clone that pretends to have it
    if (entry.failed || !entry.file) continue;
    const u = new URL(abs);
    const [host, ...rest] = entry.file.split('/');
    const local = host === siteDir ? `/${rest.join('/')}` : `/_ext/${entry.file}`;
    const to = path.join(clone, ...local.split('/').filter(Boolean));
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(path.join(ref, ...entry.file.split('/')), to);
    map[abs] = local;
    hosts.add(u.origin);
    placed.push({ to, local, entry, u });
  }
  // an address of another host recorded with its query (lib.mjs bundleKey) has a file of its own: written in full in the
  // bundle's text (as is, with &amp; in markup, JSON-escaped, protocol-relative), it points at that file before any
  // origin is rewritten below (RC8 elise: four Google Fonts stylesheets were one file, typed application/octet-stream)
  const exact = placed.filter((p) => p.u.search && p.u.host !== site.host)
    .flatMap((p) => { const k = p.u.href; const rel = k.replace(/^https?:/, ''); return [[k, p.local], [k.replace(/&/g, '&amp;'), p.local], [k.replace(/\//g, '\\/'), p.local.replace(/\//g, '\\/')], [rel, p.local], [rel.replace(/&/g, '&amp;'), p.local]]; })
    .sort((a, b) => b[0].length - a[0].length);
  // every recorded origin written in the bundle's text points at the clone's copies: "https://cdn.x.com/a.glb" and its
  // JSON-escaped form "https:\/\/cdn.x.com\/a.glb" become "/_ext/cdn.x.com/a.glb"; the site's own origin becomes "/"
  const prefixes = [...hosts].map((origin) => {
    const host = new URL(origin).host;
    const to = host === site.host ? '/' : `/_ext/${host.replace(/[:]/g, '_')}/`;
    return [[`${origin}/`, to], [`//${host}/`, to], [`${origin.replace(/\//g, '\\/')}\\/`, to.replace(/\//g, '\\/')]];
  }).flat().sort((a, b) => b[0].length - a[0].length);
  let rewritten = 0;
  for (const p of placed) {
    if (!TEXT.test(p.to) && !/text|javascript|json|xml|svg/.test(p.entry.type || '')) continue;
    let t = await fs.readFile(p.to, 'utf8');
    const before = t;
    for (const [from, to] of exact) t = t.split(from).join(to);
    for (const [from, to] of prefixes) t = t.split(from).join(to);
    if (t !== before) { await fs.writeFile(p.to, t); rewritten++; }
  }
  // each recorded page: its document, with the guard first in <head> and noindex. A page is any frame's document (a
  // view an app shell loads in an iframe is a page of its own at its address too) or HTML recorded another way
  // (bundle-complete.mjs isDocumentEntry); RC8 elise counted only the start page's
  const guard = GUARD(map, site.host, TRACKING.toString());
  for (const p of placed.filter((x) => isDocumentEntry(x.entry) && x.u.host === site.host && x.local.startsWith('/') && !x.local.startsWith('/_ext/'))) {
    const html = (await fs.readFile(p.to, 'utf8')).replace(/<head([^>]*)>/i, (m) => `${m}\n<meta name="robots" content="noindex,nofollow"><!-- trueclone own-bundle clone of ${site.href} (exact mode, authorised by: ${String(meta.permission).replace(/--/g, '-')}). Local only. -->\n<script id="tc-net">${guard}</script>`);
    await fs.writeFile(p.to, html);
    const pagePath = p.u.pathname.replace(/\/+$/, '') || '/';
    docs[pagePath] = p.local;
  }
  // the start page at the clone's root too (/products/x answers at / and at its own address)
  const startPath = site.pathname.replace(/\/+$/, '') || '/';
  if (startPath !== '/' && docs[startPath]) {
    await fs.copyFile(path.join(clone, ...docs[startPath].split('/').filter(Boolean)), path.join(clone, 'index.html'));
    docs['/'] = '/index.html';
  }
  await fs.writeFile(path.join(clone, 'tc-sw.js'), WORKER(map, docs, site.host, TRACKING.toString()));
  // every captured route has its page in the clone, or the seed says which do not (seed.mjs fails on them)
  const served = new Set(Object.keys(docs).map((p) => routeKey(p)));
  const missingRoutes = capturedRoutes(meta).filter((r) => !served.has(r.path === '/' ? routeKey(startPath) : routeKey(r.path))).map((r) => r.path);
  return { files: placed.length, documents: Object.keys(docs).length, hosts: hosts.size, rewritten, missingRoutes };
}
