// What a measurement was taken of, so a result can never be read for something else (docs/plan-rc5/PLAN.md, R2).
//
// Every result unit trueclone records carries an identity block:
//   subjectHash  the content of what was measured: clone/ for the HTML clone, nextjs/ for a Next.js conversion. A content hash
//                (sha1 of every file), never mtimes or a git commit, so uncommitted edits count and a copy or touch
//                that changes nothing does not. Computed at the START of the measurement: an edit made while a check
//                runs leaves the result stale.
//   refId        the reference it was compared with: the capture (time, address, mode, routes) and the visit profile
//                (hide, cookies, locale, unroll). A re-capture or a new --hide makes every earlier result invalid.
//   configHash   the instrument's own configuration for that check (journey.json, motion-map.json, interactions.json):
//                an edit invalidates that check's results.
//   codeHash     the check's own code and the shared library: a tool upgrade re-measures what changed.
//   env          whether the instrument was modified in this process (code loaded with NODE_OPTIONS / --import, or a
//                packaged script that no longer matches the package's manifest): such results cannot pass.
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const sha1 = (data) => crypto.createHash('sha1').update(data).digest('hex');

// Folders that are never part of what a visitor gets: dependencies, build caches, the verify token
const SKIP_DIRS = new Set(['node_modules', '.next', 'out', '.turbo', 'patches-cache', '.git']);
const SKIP_FILES = new Set(['.seed-pass.html', '.index.tmp.html', 'next-env.d.ts', 'tsconfig.tsbuildinfo', 'trueclone-build.txt']);

// The content hash of a folder. File contents are hashed once and remembered by (size, mtime) in a cache beside the
// folder, so a large clone costs one full read, then only what changed; the cache is a speed-up, never the source of
// truth (a file whose size or mtime moved is read again).
// Several checks of one score start together and all hash the same folder (RC6 heybhaskar: four processes within 70 ms;
// one read the cache while another was rewriting it in place, and JSON.parse of the half-written file killed the
// states step). So the cache is read tolerantly (unreadable means empty) and written to a temporary file renamed into
// place. `readOnly` (the auditor) never writes it.
const readCache = async (file) => { try { const c = JSON.parse(await fs.readFile(file, 'utf8')); return c && typeof c === 'object' ? c : {}; } catch { return {}; } };
export async function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  await fs.writeFile(tmp, text);
  // Windows refuses a rename over a file another process has open for a moment (EPERM, EBUSY): try again briefly
  for (let i = 0; ; i++) {
    try { await fs.rename(tmp, file); return; } catch (e) {
      if (i >= 20 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) { await fs.rm(tmp, { force: true }); throw e; }
      await new Promise((r) => setTimeout(r, 25 + i * 10));
    }
  }
}
export async function contentHash(dir, cacheFile, { readOnly = false, skip = null } = {}) {
  const cache = cacheFile ? await readCache(cacheFile) : {};
  const next = {};
  const h = crypto.createHash('sha1');
  let files = 0;
  const walk = async (d) => {
    const entries = (await fs.readdir(d, { withFileTypes: true }).catch(() => [])).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) await walk(p); continue; }
      if (!e.isFile() || SKIP_FILES.has(e.name)) continue;
      const rel = path.relative(dir, p).split(path.sep).join('/');
      if (skip && skip(rel)) continue;
      // a file removed while the folder is walked (a seed's temporary page) is not part of what was measured
      const st = await fs.stat(p).catch(() => null);
      if (!st) continue;
      const c = cache[rel];
      let digest = c && c.size === st.size && c.mtimeMs === st.mtimeMs ? c.sha1 : null;
      if (!digest) { const data = await fs.readFile(p).catch(() => null); if (!data) continue; digest = sha1(data); }
      next[rel] = { size: st.size, mtimeMs: st.mtimeMs, sha1: digest };
      h.update(`${rel}\0${digest}\n`);
      files++;
    }
  };
  await walk(dir);
  if (cacheFile && !readOnly) await writeAtomic(cacheFile, JSON.stringify(next)).catch(() => {});
  return files ? h.digest('hex').slice(0, 16) : null;
}

// side: 'clone' (the HTML clone, workflow A) or 'app' (the Next.js conversion's project, nextjs/, workflow B). The
// conversion's documentation (*.md) is never served, so editing it leaves its measurements current.
export const subjectDir = (root, side) => path.join(root, side === 'app' ? 'nextjs' : 'clone');
export async function subjectHash(root, side = 'clone', { readOnly = false } = {}) {
  const dir = subjectDir(root, side);
  if (!fsSync.existsSync(dir)) return null;
  return contentHash(dir, path.join(root, side === 'app' ? '.tc-hash-nextjs.json' : '.tc-hash-clone.json'), { readOnly, skip: side === 'app' ? (rel) => /\.md$/i.test(rel) : null });
}

// The reference identity: what a result was compared against. Only the fields that change what is measured.
export function refIdOf(meta) {
  if (!meta) return null;
  const visit = { hide: meta.hide || [], ignore: meta.ignore || [], cookies: (meta.cookies || []).map((c) => c.name), locale: meta.locale || null, unroll: meta.unroll || 'xy' };
  return sha1(JSON.stringify({ url: meta.finalUrl || meta.url, capturedAt: meta.capturedAt, mode: meta.mode || 'template', stabilise: meta.stabilise || null, routes: (meta.routes || []).map((r) => r.path), visit })).slice(0, 16);
}
export async function refId(root) {
  const meta = JSON.parse(await fs.readFile(path.join(root, 'reference', 'meta.json'), 'utf8').catch(() => 'null'));
  return refIdOf(meta);
}

// The instrument configuration each check reads besides the capture (an edit invalidates that check's results)
// the journey's results are compared with the reference's own run of it (its frames): read again, they are measured again
export const CONFIG_FILES = { journey: ['journey.json', 'reference/journey/journey.json'], curves: ['motion-map.json'], interact: ['interactions.json', 'reference/interactions.auto.json'] };
export async function configHash(root, check) {
  const files = CONFIG_FILES[check];
  if (!files) return null;
  const parts = await Promise.all(files.map((f) => fs.readFile(path.join(root, f), 'utf8').catch(() => '')));
  return sha1(parts.join('\0')).slice(0, 12);
}

// The check's code: its script, the shared library and the result plumbing
const CODE_OF = { layout: 'diff.mjs', 'layout-real': 'diff.mjs', reduced: 'diff.mjs', scroll: 'states.mjs', canvas: 'states.mjs', curves: 'curves.mjs', interact: 'interact.mjs', hovers: 'hovers.mjs', detail: 'detail.mjs', load: 'load.mjs', journey: 'journey.mjs', drift: 'drift.mjs', review: 'review.mjs', behaviour: 'behaviour.mjs' };
const codeCache = new Map();
export function codeHash(check) {
  if (codeCache.has(check)) return codeCache.get(check);
  const files = [CODE_OF[check] || `${check}.mjs`, 'lib.mjs', 'identity.mjs', 'results.mjs', 'measure.mjs'];
  const h = crypto.createHash('sha1');
  for (const f of files) { try { h.update(fsSync.readFileSync(path.join(HERE, f))); } catch { /* not present */ } }
  const v = h.digest('hex').slice(0, 12);
  codeCache.set(check, v);
  return v;
}

export function toolVersion() {
  try { return JSON.parse(fsSync.readFileSync(path.join(HERE, '..', 'package.json'), 'utf8')).version; } catch { return null; }
}

// Was the instrument modified in this process? Code preloaded into node (NODE_OPTIONS --import/--require/--loader, or
// the same on the command line), or a packaged script whose content no longer matches the manifest written when the
// package was built (scripts/MANIFEST.json; a development checkout has none and is not checked).
const PRELOAD = /(^|\s)(--import|--require|-r|--loader|--experimental-loader)(=|\s|$)/;
let envCache = null;
export function envIdentity() {
  if (envCache) return envCache;
  const reasons = [];
  if (PRELOAD.test(process.env.NODE_OPTIONS || '')) reasons.push(`NODE_OPTIONS loads code into trueclone (${String(process.env.NODE_OPTIONS).trim().slice(0, 120)})`);
  if (process.execArgv.some((a) => PRELOAD.test(` ${a} `))) reasons.push(`node was started with ${process.execArgv.join(' ').slice(0, 120)}`);
  try {
    const manifest = JSON.parse(fsSync.readFileSync(path.join(HERE, 'MANIFEST.json'), 'utf8'));
    for (const [f, digest] of Object.entries(manifest.files || {})) {
      let actual = null;
      try { actual = sha1(fsSync.readFileSync(path.join(HERE, '..', f))); } catch { /* removed */ }
      if (actual !== digest) reasons.push(`${f} differs from the published package`);
    }
  } catch { /* no manifest: a development checkout */ }
  envCache = { instrumentModified: reasons.length > 0, ...(reasons.length ? { reasons } : {}) };
  return envCache;
}

// The identity of a measurement of `check` on `side`, taken at its start
export async function startIdentity(root, check, side = 'clone', extra = {}) {
  const meta = JSON.parse(await fs.readFile(path.join(root, 'reference', 'meta.json'), 'utf8').catch(() => 'null'));
  return {
    startedAt: new Date().toISOString(),
    side,
    subjectHash: await subjectHash(root, side),
    refId: refIdOf(meta),
    configHash: await configHash(root, check),
    codeHash: codeHash(check),
    tool: toolVersion(),
    env: envIdentity(),
    ...extra,
  };
}
