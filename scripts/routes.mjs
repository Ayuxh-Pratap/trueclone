// One rule for a route of the site, wherever it becomes a file, an address or a comparison (RC6-07: a route named
// "Landing Page.html" was written to clone/Landing%20Page.html/ by the seed, looked for as clone/Landing Page.html/ by
// the server, and every check of it failed on an empty 404).
//   - identity: meta.routes[].path is the URL pathname as the browser writes it (WHATWG, percent-encoded:
//     /Landing%20Page.html, /caf%C3%A9.html, /50%25off.html). It is part of the reference id: never rewritten.
//   - on disk (clone/, the seed's pages, the bundled server): each segment decoded, then made a legal file name on every
//     system (routeDir). The writer and the server call the same function, so they cannot disagree.
//   - at an address: the encoded form again (routeUrl), relative to the base it is opened on.
//   - compared: by decoded segments (samePath), so two spellings of one address are one route.
//   - in a Next.js app: the encoded form as the folder name (appDir; see there for the probe behind it).

// one segment decoded; a malformed escape (a bare %) keeps the segment as written instead of throwing
const decodeSeg = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
export const segmentsOf = (p) => String(p ?? '').split('/').filter(Boolean);

// The canonical form of a route: the WHATWG pathname (a literal space or é from a command line is encoded the way a
// link's href is), without trailing slashes, as capture has always stored it.
export function canonicalPath(p) {
  // one leading slash: "//x" would be read as a host
  let s = `/${String(p ?? '').trim().replace(/^\/+/, '')}`;
  try { s = new URL(s, 'http://h').pathname; } catch { /* kept as given */ }
  return s.replace(/\/+$/, '') || '/';
}

// decoded segments; strict: null when a segment has a malformed escape (the server answers that with a 400)
export function decodeSegments(p, strict = false) {
  const out = [];
  for (const s of segmentsOf(p)) {
    try { out.push(decodeURIComponent(s)); } catch { if (strict) return null; out.push(s); }
  }
  return out;
}
// for reading and for messages: "/Landing Page.html" (a decoded %2F reads as a slash here; compare with samePath)
export const decodePath = (p) => `/${decodeSegments(p).join('/')}`;
// a path's separators kept, each piece decoded safely (asset references: "fonts/a%20b.woff2")
export const decodeEach = (p) => String(p ?? '').split('/').map(decodeSeg).join('/');

// A decoded segment as a file name every system accepts: Windows-illegal characters, a decoded slash and control
// characters become "_", trailing dots and spaces go (Windows drops them, so "a." and "a" would be one file), a
// reserved device name (CON, NUL, COM1, LPT1 ..., with or without an extension) gets "_" after it, "." and ".." and an
// empty name become "_" (never a step out of the folder).
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?=\.|$)/i;
export function safeSegment(s) {
  // eslint-disable-next-line no-control-regex
  const t = String(s ?? '').replace(/[<>:"|?*\\/\x00-\x1f\x7f]/g, '_').replace(/[. ]+$/, '');
  return (RESERVED.test(t) ? t.replace(RESERVED, '$1_') : t) || '_';
}

// where a route's page lives under clone/ (and where the bundled server looks for it): "" for the root,
// "Landing Page.html", "NASA (Draft).html", "café.html", "50%off.html", "q_x.html" (from /q%3Fx.html)
export const routeDir = (p) => decodeSegments(canonicalPath(p)).map(safeSegment).join('/');
// two routes whose folders would be one on a case-insensitive file system (Windows, macOS) collide
export const dirKey = (p) => routeDir(p).toLowerCase();

// The route's address on a base (the clone's server, the app, the live site): the canonical encoded path, relative to
// the base by default (a clone served below a folder keeps it), from the host's root with fromRoot. "./" first, so a
// segment with a colon is never read as a scheme.
export const routeUrl = (p, base, fromRoot = false) => {
  const c = canonicalPath(p);
  return new URL(fromRoot ? c : `./${c.replace(/^\//, '')}`, base).href;
};

// the same route, however it is spelled: decoded segments, trailing slashes and a final index.html aside (the clone
// serves /x/index.html for /x, so a browser can end up at either)
const keyOf = (p, index) => { const s = decodeSegments(canonicalPath(p)); if (index && s.at(-1)?.toLowerCase() === 'index.html') s.pop(); return s.join('\u0000'); };
export const routeKey = (p) => keyOf(p, false);
export const samePath = (a, b) => keyOf(a, true) === keyOf(b, true);

// The folder name of a route's own files (reference/routes/<slug>/, compare/routes/<slug>/, the app's route group):
// the rule capture has always used, on the encoded form ("/Landing%20Page.html" -> "Landing_20Page_html"), so existing
// captures keep theirs. It is not one-to-one ("/a.b" and "/a_b" are both "a_b"): uniqueSlugs makes every route's its own.
export const slugOf = (p) => canonicalPath(p).replace(/^\//, '').replace(/\//g, '__').replace(/[^a-z0-9_-]/gi, '_') || 'index';
// paths in order -> Map path -> slug: the home route's is "", the first route to want a slug gets it, a later one gets
// "-2", "-3" (compared without case: the folders live on one file system). Deterministic for the same order.
export function uniqueSlugs(paths, homePath = '/') {
  const out = new Map();
  const taken = new Set();
  for (const p of paths) {
    if (routeKey(p) === routeKey(homePath)) { out.set(p, ''); continue; }
    const base = slugOf(p);
    let s = base;
    for (let n = 2; taken.has(s.toLowerCase()); n++) s = `${base}-${n}`;
    taken.add(s.toLowerCase());
    out.set(p, s);
  }
  return out;
}

// A route's folder in a Next.js app (app/(<slug>)/<appDir>/page.tsx), or null when Next cannot serve it there.
// Probe (Next 16.4.0, next build + next start, static pages; RC7 routes report): a folder named with the decoded name
// ("Landing Page.html", "café.html") is NOT served at its encoded address (404), and a non-ASCII decoded name fails the
// build ("Invalid character" while prerendering); a folder named with the encoded segment ("Landing%20Page.html",
// "NASA%20(Draft).html", "caf%C3%A9.html", "x%25y.html", "%E6%97%A5%E6%9C%AC") is served at exactly that address (200).
// So the app keeps the encoded form. Left out (null): a segment that is route syntax to Next ((group), [param], @slot,
// _private) or that is no legal folder name on Windows (":", "|", "*", a trailing dot, a device name).
export function appDir(p) {
  const segs = segmentsOf(canonicalPath(p));
  if (segs.some((s) => /^[([@_]/.test(s) || safeSegment(s) !== s)) return null;
  return segs.join('/');
}
