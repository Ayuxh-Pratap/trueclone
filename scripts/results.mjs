// Result units: one record per (check, route, viewport, state), each with the identity of what was measured
// (identity.mjs). docs/plan-rc5/PLAN.md R1.
//
// compare/results/<check>.json   { "units": { "<route>|<viewport>|<state>": record } }
//
// A check run writes only the units it measured: a run narrowed to one viewport or route leaves every other unit as it
// was, with its own identity, so a partial re-measure can never erase, or silently pass for, the rest. Writes are
// atomic (a temp file renamed into place) under a per-file lock, so checks running side by side never lose each other's
// units. A measurement that fails is recorded too (state "error", with the reason): a missing number is never a pass.
import fs from 'node:fs/promises';
import path from 'node:path';
import { writeAtomic } from './identity.mjs';

export const unitKey = (route, viewport, state = '') => `${route || ''}|${viewport || ''}|${state || ''}`;
export const parseKey = (k) => { const [route, viewport, state] = k.split('|'); return { route, viewport, state }; };

const resultsDir = (root, compare = 'compare') => path.join(root, compare, 'results');
const fileOf = (root, compare, check) => path.join(resultsDir(root, compare), `${check}.json`);

async function withFileLock(file, fn) {
  const lock = `${file}.lock`;
  for (let waited = 0; ; waited += 50) {
    try { await fs.writeFile(lock, String(process.pid), { flag: 'wx' }); break; } catch {
      // a lock left by a process that died is taken over after 30 s
      const st = await fs.stat(lock).catch(() => null);
      if (st && Date.now() - st.mtimeMs > 30000) { await fs.rm(lock, { force: true }); continue; }
      if (waited > 120000) throw new Error(`results lock ${lock} held for over 2 minutes`);
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  try { return await fn(); } finally { await fs.rm(lock, { force: true }); }
}

export async function readCheck(root, compare, check) {
  return JSON.parse(await fs.readFile(fileOf(root, compare, check), 'utf8').catch(() => '{"units":{}}'));
}

export async function readAll(root, compare = 'compare') {
  const out = {};
  for (const f of await fs.readdir(resultsDir(root, compare)).catch(() => [])) {
    if (!f.endsWith('.json')) continue;
    out[f.replace(/\.json$/, '')] = JSON.parse(await fs.readFile(path.join(resultsDir(root, compare), f), 'utf8').catch(() => '{"units":{}}'));
  }
  return out;
}

// units: [{ route, viewport, state?, value, pass?, members?, ...extra }] measured under `identity` (startIdentity)
export async function writeUnits(root, compare, check, units, identity, { replaceRoutes = null } = {}) {
  const file = fileOf(root, compare, check);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const endedAt = new Date().toISOString();
  await withFileLock(file, async () => {
    const cur = await readCheck(root, compare, check);
    // a plan unit (the list of what the check must measure, e.g. the interaction scenarios) replaces the units it no
    // longer lists: a retired scenario does not linger as a pass
    if (replaceRoutes) for (const k of Object.keys(cur.units)) if (replaceRoutes(parseKey(k))) delete cur.units[k];
    for (const u of units) {
      const { route = '', viewport = '', state = '', ...rest } = u;
      cur.units[unitKey(route, viewport, state)] = { route, viewport, state, ...rest, identity: { ...identity, endedAt } };
    }
    await writeAtomic(file, JSON.stringify(cur, null, 1));
  });
  // a check that recorded a failed measurement exits non-zero, whichever check it is (score and its callers see the
  // failure from the exit code; RC4 load.mjs exited 0 after a reference that never loaded)
  if (units.some((u) => u.error)) process.exitCode = 1;
}

// The per-check aggregate files (compare/report.mask.json, compare/states/report.mask.json, compare/detail.json, …) are
// diagnostics read by brief, explain and the report's detail sections. A run narrowed to some viewports or routes merges
// into them (by viewport, and by route path) instead of replacing them, so they never show a partial page as the whole.
export async function mergeAggregate(file, report) {
  const cur = JSON.parse(await fs.readFile(file, 'utf8').catch(() => 'null'));
  if (cur && Array.isArray(cur.viewports) && Array.isArray(report.viewports)) {
    const byVp = new Map(cur.viewports.map((v) => [v.viewport, v]));
    for (const v of report.viewports) byVp.set(v.viewport, v);
    report.viewports = [...byVp.values()];
  }
  if (cur && Array.isArray(cur.routes) && Array.isArray(report.routes)) {
    const byPath = new Map(cur.routes.map((r) => [r.path, r]));
    for (const r of report.routes) {
      const old = byPath.get(r.path);
      if (old && Array.isArray(old.viewports) && Array.isArray(r.viewports)) {
        const m = new Map(old.viewports.map((v) => [v.viewport, v]));
        for (const v of r.viewports) m.set(v.viewport, v);
        byPath.set(r.path, { ...r, viewports: [...m.values()] });
      } else byPath.set(r.path, r);
    }
    report.routes = [...byPath.values()];
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await writeAtomic(file, JSON.stringify(report, null, 2));
  return report;
}

// A measurement that could not be made: recorded per unit, so the evaluator reports "error: <reason>", never a pass.
// `extra`: how it failed (errorKind: timeout | crash | load, from the step that ran it) and where its whole output is
// (errorLog), so status can classify it and a person can read it.
export async function writeErrors(root, compare, check, keys, identity, reason, extra = {}) {
  await writeUnits(root, compare, check, keys.map((k) => ({ ...k, error: String(reason).slice(0, 500), value: null, ...extra })), identity);
}

// Is a recorded unit a measurement of exactly this (the same subject, reference, configuration and code)? A check that
// resumes after an interruption skips such units instead of measuring them again (behaviour, calibrate).
export const isCurrent = (rec, identity) => Boolean(rec && !rec.error && rec.identity && rec.identity.subjectHash === identity.subjectHash && rec.identity.refId === identity.refId && rec.identity.configHash === identity.configHash && rec.identity.codeHash === identity.codeHash);
