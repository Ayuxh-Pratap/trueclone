// The scope a cloning request asked for, and what the capture did with it: one rule read by capture (what to record),
// seed and the own bundle (where a link goes), status (what to ask, what to say), REPORT and the auditor (what is
// claimed). A request is one of:
//   page   one page (capture --routes 1): that page only, never expanded into the site
//   list   the pages named (capture --routes "/,/pricing"): those, and only those
//   site   the site, bounded (the default, or --routes <n>): the pages found from the start page's links, each captured
//          page's links and sitemap.xml, breadth first, up to the cap (12 unless --routes <n>)
// Every page the capture found and did not capture is outside what was cloned: listed, never verified, and a link to
// it opens the live site (its absolute address, query and fragment kept), never a local 404 or "#".
import { canonicalPath, routeKey } from './routes.mjs';

export const DEFAULT_CAP = 12;
// How the site's pages are found, and what that cannot find: stated wherever a whole-site result is claimed
export const DISCOVERY = 'pages are found from the links on the start page and on each captured page (read after it loads, at desktop) and from /sitemap.xml; pages reached only through a form, a login, a search or a script without a link cannot be found';

// capture: the scope its flags ask for. routesFlag: the --routes value (undefined, true, "1", "5", "/,/a"); explicit:
// the canonical paths of a list, or null
export function requestedScope(routesFlag, explicit) {
  if (explicit) return { kind: 'list', requested: explicit, cap: explicit.length };
  if (routesFlag !== undefined && routesFlag !== true) {
    const n = Math.max(1, Number(routesFlag) || 1);
    return n === 1 ? { kind: 'page', requested: null, cap: 1 } : { kind: 'site', requested: null, cap: n };
  }
  return { kind: 'site', requested: null, cap: DEFAULT_CAP };
}

// capture: why a page found was not captured, for this scope
export function notCapturedWhy(scope) {
  if (scope.kind === 'page') return 'outside the requested scope (this page only)';
  if (scope.kind === 'list') return 'outside the requested scope (not in the --routes list)';
  return `beyond the cap of ${scope.cap} route${scope.cap === 1 ? '' : 's'} (--routes <n> for more)`;
}

const startPathOf = (meta) => { try { return canonicalPath(new URL(meta.finalUrl || meta.url).pathname); } catch { return '/'; } };
export const capturedPaths = (meta) => ((meta.routes || []).length ? meta.routes.map((r) => r.path) : [startPathOf(meta)]);
const isFailed = (r) => Boolean(r.failed) || /^capture failed|rendered page was not saved/.test(r.why || '');

// The scope as recorded (meta.scope), or as an earlier capture's records imply it; with what was captured and left out
export function scopeOf(meta) {
  const notCaptured = (meta.routesNotCaptured || []).map((r) => (typeof r === 'string' ? { path: r } : r));
  let s = meta.scope;
  if (!s) {
    const whys = notCaptured.map((r) => r.why || '').join('\n');
    if (/not in the --routes list/.test(whys)) s = { kind: 'list', requested: null, cap: null };
    else if (/beyond the cap of 1 route\b|this page only/.test(whys)) s = { kind: 'page', requested: null, cap: 1 };
    else { const m = /beyond the cap of (\d+) route/.exec(whys); s = { kind: 'site', requested: null, cap: m ? Number(m[1]) : DEFAULT_CAP }; }
  }
  const failed = notCaptured.filter(isFailed);
  const outside = notCaptured.filter((r) => !isFailed(r));
  const captured = capturedPaths(meta);
  const capReached = s.kind === 'site' && outside.some((r) => /beyond the cap/.test(r.why || ''));
  return { kind: s.kind, cap: s.cap ?? null, requested: s.requested || null, captured, failed: failed.map((r) => ({ path: r.path, why: r.why || null })), outside: outside.map((r) => ({ path: r.path, why: r.why || null, from: r.from || null })), capReached, discovered: (meta.routesFound || []).length || captured.length + notCaptured.length, sitemap: s.sitemap ?? null, discovery: s.kind === 'site' ? DISCOVERY : null };
}

// One line for a person: what was asked, what was captured, what was left out
export function scopeLine(meta) {
  const s = scopeOf(meta);
  const n = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
  const failed = s.failed.length ? `; ${n(s.failed.length, 'requested page')} failed to capture and ${s.failed.length === 1 ? 'is' : 'are'} not verified (${s.failed.slice(0, 4).map((r) => r.path).join(', ')})` : '';
  const outside = s.outside.length ? `; ${n(s.outside.length, 'other page')} of the site ${s.outside.length === 1 ? 'is' : 'are'} outside it, linked to the live site` : '';
  if (s.kind === 'page') return `this page only (${s.captured[0] || '/'})${failed}${outside}`;
  if (s.kind === 'list') return `the ${n((s.requested || s.captured).length + (s.requested ? 0 : s.failed.length), 'page')} asked for, ${s.captured.length} captured (${s.captured.slice(0, 6).join(', ')}${s.captured.length > 6 ? '…' : ''})${failed}${outside}`;
  const beyond = s.outside.filter((r) => /beyond the cap/.test(r.why || ''));
  return `the site, bounded at ${s.cap ?? DEFAULT_CAP} routes: ${n(s.captured.length, 'route')} captured${s.capReached ? `; the cap was reached: ${n(beyond.length, 'more page')} found and not captured, not verified (not the whole site)` : '; every page found was captured'}${failed}${outside && !beyond.length ? outside : ''}`;
}

// The capture arguments that keep this scope when capturing again: one page stays one page, a list that list
export function scopeArgs(meta) {
  const s = scopeOf(meta);
  if (s.kind === 'page') return ' --routes 1';
  if (s.kind === 'list') {
    const list = s.requested || [...s.captured, ...s.failed.map((r) => r.path)];
    return ` --routes "${list.join(',')}"`;
  }
  return s.cap && s.cap !== DEFAULT_CAP ? ` --routes ${s.cap}` : '';
}

// The links of one page of a rebuilt clone (seed.mjs), decided against the page's live address: a page in scope (a
// captured route) becomes its path in the clone; any other page or file of the site its absolute live address, query
// and fragment kept; links to other sites, fragments, mail and phone links stay as written. Returns the changes (as
// written -> new), the live addresses made and how many became local.
export function siteLinks(hrefs, pageLive, meta) {
  const host = new URL(meta.finalUrl || meta.url).host.replace(/^www\./, '');
  const pairs = [], live = [];
  let local = 0;
  for (const h of hrefs) {
    if (/^(#|mailto:|tel:|sms:|javascript:|data:|blob:|about:)/i.test(String(h).trim())) continue;
    let u;
    try { u = new URL(h, pageLive); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || u.host.replace(/^www\./, '') !== host) continue;
    const page = inScope(meta, u.pathname) && !/\.(pdf|png|jpe?g|gif|svg|webp|zip|mp4|xml|txt)$/i.test(u.pathname);
    const to = page ? `${canonicalPath(u.pathname)}${u.search}${u.hash}` : u.href;
    if (page) local++; else live.push(u.href);
    if (to !== h) pairs.push([h, to]);
  }
  return { pairs, live: [...new Set(live)], local };
}

// Is a path one of the captured routes (the clone has a page for it)?
export function inScope(meta, p) {
  const k = routeKey(p);
  return capturedPaths(meta).some((c) => routeKey(c) === k);
}

// The registrable domain of a host (its "site"): what first-party means for an embedded document. The last two labels,
// or three under a two-label public suffix (co.uk, com.au) or a hosting platform whose subdomains belong to different
// owners (github.io, vercel.app, framer.website). An IP address or localhost is its own; *.localhost is localhost (the
// browser resolves it to this machine, which the tests use for subdomains).
const MULTI = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.jp', 'co.in', 'co.za', 'com.br', 'com.mx', 'com.cn', 'com.tr', 'com.sg', 'com.hk', 'co.kr', 'com.ar', 'co.id', 'com.my', 'com.ph', 'com.vn',
  'github.io', 'vercel.app', 'netlify.app', 'pages.dev', 'framer.website', 'framer.app', 'framer.ai', 'webflow.io', 'herokuapp.com', 'web.app', 'firebaseapp.com', 'wixsite.com', 'squarespace.com', 'myshopify.com', 'carrd.co', 'notion.site', 'glitch.me', 'onrender.com', 'fly.dev', 'surge.sh', 'gitlab.io', 'azurewebsites.net', 'cloudfront.net', 'amazonaws.com', 'blogspot.com', 'wordpress.com', 'super.site', 'readme.io', 'gitbook.io']);
export function registrableDomain(host) {
  const h = String(host || '').toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!h) return '';
  if (/^\d+(\.\d+){3}$/.test(h) || h.includes(':')) return h;
  if (h === 'localhost' || h.endsWith('.localhost')) return 'localhost';
  const parts = h.split('.');
  if (parts.length <= 2) return h;
  return MULTI.has(parts.slice(-2).join('.')) ? parts.slice(-3).join('.') : parts.slice(-2).join('.');
}
export const sameSite = (a, b) => Boolean(a && b) && registrableDomain(a) === registrableDomain(b);
