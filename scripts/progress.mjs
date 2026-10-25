// Is the run moving? (docs/policy.md "Failures and recovery", "Repeated steps"). status calls this for every step it
// names, so a step that cannot change anything is never named for ever (RC6 astro: `review --size wide` four times,
// "current, nothing changed" each time, no counter moved; RC6 allbirds: "fix the clone" in a file no edit may touch).
//
// The journal (sites/<name>/logs/commands.jsonl, written by bin/trueclone.mjs and lib.mjs) says which trueclone steps
// ran, when, and how they ended. For each step status names, it keeps:
//   failed       the step ran and failed (exit != 0, or it died without an end record) since it was last named
//   ineffective  the step ran and succeeded, and status names it again with nothing it depends on changed
//   idle         status named it again, nothing changed, and nothing ran (polling, or an agent that is stuck)
// A step still running is never counted (status says so and waits). Repeated read-only status calls only ever add to
// "idle", which never consumes an attempt and never blocks before many calls: a status call is not work.
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pidAlive } from './lib.mjs';

// steps that change or measure the site (a running one means "wait"); viewers and readers are left out
const WORK_STEPS = new Set(['capture', 'reads', 'calibrate', 'seed', 'design', 'journey', 'score', 'review', 'convert', 'behaviour', 'states', 'diff', 'load', 'interact', 'hovers', 'detail', 'curves', 'drift', 'motion', 'reveals', 'widgets', 'spec', 'vendor', 'brief']);
export const LIMITS = { failed: 2, ineffective: 2, idleEscalate: 3, idleBlock: 8 };

export async function readJournal(root) {
  const text = await fs.readFile(path.join(root, 'logs', 'commands.jsonl'), 'utf8').catch(() => '');
  return text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

// every run: its start, its end (or none), and whether it is alive now
export function runsOf(journal) {
  const runs = new Map();
  for (const e of journal) {
    const k = `${e.pid}|${e.startedAt}`;
    const r = runs.get(k) || { pid: e.pid, startedAt: e.startedAt, step: e.step };
    if (e.event === 'start') Object.assign(r, { args: e.args, log: e.log });
    if (e.event === 'end') Object.assign(r, { endedAt: e.endedAt, exit: e.exit });
    runs.set(k, r);
  }
  // a run with no end record whose process id is alive is running, unless it started more than 8 hours ago: Windows
  // reuses process ids, and no trueclone step runs that long (the longest RC6 step, a calibration, about 160 minutes)
  const MAX_RUN_MS = 8 * 3600 * 1000;
  return [...runs.values()].map((r) => { const alive = !r.endedAt && pidAlive(r.pid) && Date.now() - Date.parse(r.startedAt || 0) < MAX_RUN_MS; return { ...r, running: alive, died: !r.endedAt && !alive }; });
}

// a trueclone step on this site that is running now (status, viewers and this process excluded). Each workflow waits
// for its own steps: `only` the steps that count (convert waits for its own runs and for what changes the reference),
// `ignore` the steps that never do (cloning never waits for a conversion: its status cannot depend on one)
export const runningNow = (runs, { only = null, ignore = [] } = {}) => runs.filter((r) => r.running && WORK_STEPS.has(r.step) && r.pid !== process.pid && (!only || only.includes(r.step)) && !ignore.includes(r.step));

// "npx trueclone score x --only a,b --viewport desktop" -> { step, pos, flags }
export function parseStep(cmd) {
  const m = /^npx trueclone (\S+)(.*)$/.exec(String(cmd || '').trim());
  if (!m) return null;
  const args = (m[2].match(/"[^"]*"|\S+/g) || []).map((a) => a.replace(/^"|"$/g, ''));
  const flags = {}, pos = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) { const k = args[i].slice(2); flags[k] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true; } else pos.push(args[i]);
  }
  return { step: m[1], pos, flags };
}
// did a run do what the named step asks? The same step on the same site; for score, every check named and the size
const covers = (run, want) => {
  if (run.step !== want.step) return false;
  const p = parseStep(`npx trueclone ${run.step} ${(run.args || []).join(' ')}`);
  if (!p || p.pos[0] !== want.pos[0]) return false;
  if (want.step === 'score') {
    const need = String(want.flags.only || '').split(',').filter(Boolean);
    const had = p.flags.only ? String(p.flags.only).split(',') : null;
    if (had && need.some((c) => !had.includes(c))) return false;
    if (p.flags.viewport && p.flags.viewport !== want.flags.viewport) return false;
    return true;
  }
  return ['route', 'size'].every((k) => !want.flags[k] || p.flags[k] === want.flags[k]);
};

// What a workflow's status decides on, as one digest: what it measures (content), the reference and its records, every
// result and review frame of that workflow (`dirs`: compare/ for the HTML clone, compare-nextjs/ for a conversion), the
// instrument's configuration, and the notes sections that count (not an agent's own run log). File sizes and times
// stand for contents (a touch counts as a change: a missed repeat, never a false one). `extra` adds a workflow's own
// inputs (the conversion's request and build records). The installed trueclone version is an input too: a Blocked run
// says "run status again once a fixed version is installed", and under a new version a step that failed twice is run
// again, never re-blocked on the old count.
const NOTE_SECTIONS = /^(review|behaviours|stack|attempts|findings|accepted differences|conversion review)\b/i;
export async function inputsDigest(root, { subject = null, appSubject = null, tool = null, dirs = ['compare', 'reference'], extra = [] } = {}) {
  const h = crypto.createHash('sha1');
  h.update(`${subject}|${appSubject}|${tool}\n`);
  const notes = await fs.readFile(path.join(root, 'notes.md'), 'utf8').catch(() => '');
  // a "- cannot:" declaration is an answer to the counters, never a change that resets them
  for (const m of notes.matchAll(/^## ([^\n]*)\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)) {
    if (!NOTE_SECTIONS.test(m[1].trim())) continue;
    const body = m[2].replace(/<!--[\s\S]*?-->/g, '').split('\n').filter((l) => l.trim() && !/^\s*[-*]\s*cannot:/i.test(l)).join('\n');
    if (body) h.update(`${m[1].trim()}\n${body}\n`);
  }
  const walk = (d, depth = 0) => {
    let entries = [];
    try { entries = fsSync.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 4 && !/^(bundle|assets|scripts|scene|shaders|states|brief|explain|routes|calib)$/.test(e.name)) walk(p, depth + 1); continue; }
      // status's own records change on every call: never an input
      if (!/\.json$/.test(e.name) || /\.tmp$|\.lock$/.test(e.name) || /^(loop|outcome|verdict|score-times|bundle-rerecord)(\.[\w-]+)?\.json$/.test(e.name)) continue;
      try { const st = fsSync.statSync(p); h.update(`${path.relative(root, p)}|${st.size}|${st.mtimeMs}\n`); } catch { /* gone */ }
    }
  };
  for (const d of dirs) walk(path.join(root, d));
  for (const f of ['journey.json', 'interactions.json', 'motion-map.json', 'clone/.seed.json', 'reference/calib/failed.json', 'reference/bundle/manifest.json', ...extra]) {
    try { const st = fsSync.statSync(path.join(root, f)); h.update(`${f}|${st.size}|${st.mtimeMs}\n`); } catch { /* absent */ }
  }
  return h.digest('hex').slice(0, 16);
}

// Count the step status is about to name. Returns the step's record: { failed, ineffective, idle, lastRun }.
// `work`: the step is clone work (an objective), even when it starts with a command to look closer (explain, brief):
// running that command is investigation, never "a run without effect"; only the clone changing counts
export function trackStep(loop, cmd, digest, runs, now = new Date(), { work = false } = {}) {
  loop.steps ||= {};
  const key = String(cmd).slice(0, 240);
  const s = loop.steps[key] || { named: 0, failed: 0, ineffective: 0, idle: 0, digest: null, namedAt: null };
  const want = work ? null : parseStep(cmd);
  const since = s.namedAt ? Date.parse(s.namedAt) : Infinity;
  const ran = want ? runs.filter((r) => Date.parse(r.startedAt) >= since && covers(r, want) && !r.running) : [];
  const last = ran.at(-1) || null;
  if (s.digest !== null && s.digest === digest) {
    if (last && (last.died || (last.exit ?? 0) !== 0)) s.failed++;
    else if (last) s.ineffective++;
    else s.idle++;
  } else if (last && (last.died || (last.exit ?? 0) !== 0)) {
    // failed, and something else changed meanwhile (its own partial output, an agent's edit): still a failure
    s.failed++; s.ineffective = 0; s.idle = 0;
  } else { s.ineffective = 0; s.idle = 0; if (!last || (last.exit ?? 0) === 0) s.failed = 0; }
  s.named++;
  s.digest = digest;
  s.namedAt = now.toISOString();
  s.lastRun = last ? { step: last.step, args: last.args, startedAt: last.startedAt, endedAt: last.endedAt || null, exit: last.died ? 'died' : last.exit, log: last.log || null } : s.lastRun || null;
  loop.steps[key] = s;
  // keep the record small: the 200 most recently named steps
  const keys = Object.keys(loop.steps);
  if (keys.length > 200) for (const k of keys.sort((a, b) => Date.parse(loop.steps[a].namedAt) - Date.parse(loop.steps[b].namedAt)).slice(0, keys.length - 200)) delete loop.steps[k];
  return s;
}

// What the agent may write when a step cannot be done within its permitted edits (offered only after the step was named
// LIMITS.idleEscalate times with nothing changed): under ## Findings, "- cannot: <the step or objective>: <why>"
export function declaredCannot(notes, label) {
  const m = /^## Findings[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/im.exec(notes || '');
  if (!m) return null;
  for (const l of m[1].split('\n')) {
    const x = /^\s*[-*]\s*cannot:\s*(.+?):\s*(.+)$/i.exec(l);
    if (x && label && (x[1].trim() === label.trim() || label.includes(x[1].trim()) || x[1].includes(label.slice(0, 60)))) return { why: x[2].trim(), tool: /\btool\b|trueclone|generated|seed/i.test(x[2]) };
  }
  return null;
}
