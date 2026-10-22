// The one evaluation every conclusion is drawn from: status (the next step and the exit code), REPORT.md and
// REPORT.next.md, and the Next.js app's verification all call evaluate(). docs/plan-rc5/PLAN.md R1, R4.
//
// It enumerates every result the site REQUIRES (each check x route x viewport, each interaction scenario, each journey
// viewport, each review frame) and gives each one state:
//   pass      measured, on what is there now, at or above its bar
//   accepted  below target but above the floor, with an evidence record in notes.md (never when stale)
//   fail      measured, on what is there now, below its bar
//   missing   never measured (or its file is gone)
//   stale     measured, but on a clone/app that has changed since, or by code that has changed since
//   invalid   measured against another reference or visit profile, with another instrument configuration, or by a
//             modified instrument: it describes nothing that exists now
//   error     the measurement itself failed (a crashed or timed-out check, a reference that did not load)
//   tool      the tool cannot measure it here (the reference does not match itself, a scenario it cannot run on the
//             reference): not the clone's work, and never a pass
//   na        nothing to measure (no hover effect on the reference): satisfied, and listed
// Only pass, accepted and na count towards "verified". Nothing absent is ever read as a pass.
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { SCORED } from './lib.mjs';
import { readAll, parseKey } from './results.mjs';
import { subjectHash, refIdOf, configHash, codeHash } from './identity.mjs';
import { hamming, TOKEN_BITS } from './measure.mjs';

// behaviour: every member passes or fails on its own tolerance (behaviour.mjs TOL), so all of them must pass
export const TARGETS = { layout: 98, 'layout-real': 98, reduced: 98, scroll: 95, canvas: 90, curves: 95, detail: 95, hovers: 90, load: 95, journey: 95, interact: 95, behaviour: 100 };
// floors under every single frame or checkpoint, whatever the mean (a 91% average with one frame at 17% is not a copy)
export const FLOORS = { scroll: 80, journey: 80, canvas: 75, behaviour: 100 };
// Template mode (decision D4): a canvas scene is the clone's own art, judged on composition (S-comp, measure.mjs) at the
// bar less this stated allowance, for bar and floor alike. Derived in research/metrics.md 2a: the reference holds 92-94
// against itself on S-comp, a faithful port with its own art about 80; a different framing (RC4 zero step-10) 31.8.
export const TEMPLATE_ALLOWANCE = 15;
// an accepted difference explains the last few points, never a broken page
export const ACCEPT_FLOOR = 95;
export const LABELS = { layout: 'Layout (structure)', 'layout-real': 'Layout (real pixels)', reduced: 'Reduced motion (layout)', behaviour: 'Behaviour (what changes by itself)', scroll: 'Scroll states', canvas: 'Canvases', curves: 'Motion curves', detail: 'Detail (styles)', hovers: 'Hovers', load: 'Load sequence', interact: 'Interactions', journey: 'Journey', review: 'Review (by eye)', lint: 'Clone lint', notes: 'Notes (behaviours)', coverage: 'Coverage (site code)' };
// the order failing checks are worked in (status) and listed in (REPORT)
export const ORDER = ['journey', 'layout', 'layout-real', 'scroll', 'canvas', 'behaviour', 'interact', 'load', 'detail', 'hovers', 'curves', 'reduced'];
const SEED_VPS = ['desktop', 'tablet', 'mobile'];
const VPS = SCORED.map((v) => v.name);

const readJson = (p, d = null) => fs.readFile(p, 'utf8').then(JSON.parse, () => d);

// notes.md sections (bullets only)
export function notesSection(notes, title) {
  const m = new RegExp(`^## ${title}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(notes);
  return m ? m[1].replace(/<!--[\s\S]*?-->/g, '').split('\n').map((l) => l.trim()).filter((l) => /^[-*]\s+\S/.test(l)).map((l) => l.replace(/^[-*]\s+/, '')) : [];
}

// Calibrated bars (docs/plan-rc5 R6): reference/noise.json holds how far the reference is from itself, per route,
// viewport, check and frame. A tolerance applies only to the exact key it was measured for (a desktop number is never
// read for mobile), and never below the hard floor. Without an entry the fixed target applies.
export async function loadNoise(root, refId) {
  const n = await readJson(path.join(root, 'reference', 'noise.json'), null);
  return n && n.refId === refId ? n : null;
}
export const HARD_FLOOR = { layout: 90, 'layout-real': 85, scroll: 90, canvas: 85, journey: 85, load: 85 };
export function barFor(noise, check, route, viewport, frame = '') {
  const target = TARGETS[check];
  const e = noise?.entries?.[`${check}|${route || ''}|${viewport}|${frame}`];
  if (!e || typeof e.self !== 'number') return { bar: target, calibrated: false };
  const margin = Math.max(1, e.spread || 0);
  const bar = Math.min(target, e.self - margin);
  if (bar < (HARD_FLOOR[check] ?? 0)) return { bar: null, calibrated: true, unstable: true, self: e.self, draws: e.draws };
  return { bar: +bar.toFixed(2), calibrated: true, self: e.self, draws: e.draws };
}

export async function requiredUnits(root, meta, side = 'clone') {
  const app = Boolean(meta.canvasApp);
  const routes = ['', ...(meta.routes || []).filter((r) => r.slug).map((r) => r.path)];
  const req = [];
  const add = (check, route, viewport, state = '') => req.push({ check, route, viewport, state });
  if (app) {
    const journey = await readJson(path.join(root, 'journey.json'), null);
    for (const v of journey?.viewports || ['desktop', 'mobile']) add('journey', '', v);
    for (const v of VPS) add('load', '', v);
  } else {
    for (const r of routes) for (const v of VPS) { add('layout', r, v); add('scroll', r, v); }
    // D1 and D2: what changes by itself, and the reduced-motion page, at desktop and mobile on every route
    for (const r of routes) for (const v of ['desktop', 'mobile']) { add('behaviour', r, v); add('reduced', r, v); }
    if (meta.mode === 'exact') for (const v of VPS) add('layout-real', '', v);
    for (const v of SEED_VPS) add('detail', '', v);
    add('hovers', '', 'desktop');
    for (const v of VPS) add('load', '', v);
    const curves = ((await readJson(path.join(root, 'reference', 'reveals.desktop.json'), null))?.scrubs || []).length;
    if (curves || fsSync.existsSync(path.join(root, 'motion-map.json'))) for (const v of SEED_VPS) add('curves', '', v);
  }
  // interactions: the scenarios the last interact run planned (it records its plan with the configuration it read);
  // required whenever the site has scenarios at all
  if (fsSync.existsSync(path.join(root, 'interactions.json')) || fsSync.existsSync(path.join(root, 'reference', 'interactions.auto.json'))) add('interact', '', '', '_plan');
  return req;
}

// the ids of the review frames that must carry a verdict, by folder
export function reviewDirs(meta, side = 'clone') {
  const base = side === 'app' ? 'compare-next/review' : 'compare/review';
  if (meta.canvasApp) return ['desktop', 'mobile'].map((s) => ({ dir: `${base}/journey-${s}`, size: s, route: '' }));
  const sizes = side === 'app' ? ['wide', 'mobile'] : ['wide', 'laptop', 'desktop', 'tablet', 'mobile'];
  const out = sizes.map((s) => ({ dir: `${base}/${s}`, size: s, route: '' }));
  for (const r of (meta.routes || []).filter((x) => x.slug)) for (const s of ['wide', 'mobile']) out.push({ dir: `${base}/routes/${r.slug}/${s}`, size: s, route: r.path });
  return out;
}

const STATE_RANK = ['error', 'invalid', 'missing', 'stale', 'fail', 'tool', 'accepted', 'pass', 'na'];
export const worstState = (states) => states.reduce((w, s) => (STATE_RANK.indexOf(s) < STATE_RANK.indexOf(w) ? s : w), 'na');

// How far a failing unit is from passing, in points: the mean's gap plus every frame or checkpoint below its floor
// (a fix that lifts one frame while dropping another moves nothing). Used by the loop (loop.mjs) to tell progress from
// rotation.
// The pass conditions of a failing unit, each as a distance (loop.mjs tracks a best for each): the mean's gap to its
// bar, the summed gaps of the frames or checkpoints below their floors, and how many are below. Progress on any one is
// progress toward passing; one noisy frame cannot hide a mean that rises steadily (RC4 zero: its worst checkpoint swung
// by 20 points from one score to the next while the mean rose 22 points over the run)
export function conditionsOf(u) {
  const mean = typeof u.bar === 'number' && typeof u.value === 'number' ? Math.max(0, u.bar - u.value) : (u.bar ?? 100);
  const below = u.membersBelow || [];
  return { mean: +mean.toFixed(2), floors: +below.reduce((n, m) => n + Math.max(0, m.bar - m.value), 0).toFixed(2), below: below.length };
}
export function shortfallOf(u) {
  if (!['fail'].includes(u.state)) return 0;
  let s = 0;
  if (typeof u.bar === 'number' && typeof u.value === 'number') s += Math.max(0, u.bar - u.value);
  else if (u.value === null || u.value === undefined) s += u.bar ?? 100;
  for (const m of u.membersBelow || []) s += Math.max(0, m.bar - m.value);
  return +s.toFixed(2);
}

export async function evaluate(root, { side = 'clone' } = {}) {
  const compare = side === 'app' ? 'compare-next' : 'compare';
  const meta = await readJson(path.join(root, 'reference', 'meta.json'), null);
  if (!meta) return { side, missingCapture: true, units: [], checks: [], verified: false };
  const refId = refIdOf(meta);
  const subject = await subjectHash(root, side);
  const results = await readAll(root, compare);
  const noise = await loadNoise(root, refId);
  const notes = await fs.readFile(path.join(root, 'notes.md'), 'utf8').catch(() => '');
  const accepted = notesSection(notes, 'Accepted differences');
  const hasEvidence = (a) => { const m = /evidence:\s*([^\s;,)]+)/i.exec(a); return Boolean(m && fsSync.existsSync(path.resolve(root, m[1]))); };
  const acceptedFor = (check, vp) => accepted.filter((a) => hasEvidence(a) && new RegExp(`\\b${check}\\b`, 'i').test(a) && (!vp || new RegExp(`\\b${vp}\\b`, 'i').test(a) || !/\b(desktop|tablet|mobile|laptop|wide)\b/i.test(a)));
  const configs = {};
  for (const c of ['journey', 'curves', 'interact']) configs[c] = await configHash(root, c);

  const required = await requiredUnits(root, meta, side);
  // the interaction plan expands into one required unit per planned scenario
  const plan = results.interact?.units?.['||_plan'];
  if (plan && Array.isArray(plan.scenarios)) for (const n of plan.scenarios) required.push({ check: 'interact', route: '', viewport: '', state: n });
  // canvases: wherever the reference draws a canvas at that route and size (recorded with the scroll unit)
  for (const [k, rec] of Object.entries(results.scroll?.units || {})) if (rec.refCanvas) { const p = parseKey(k); required.push({ check: 'canvas', route: p.route, viewport: p.viewport, state: '' }); }

  const units = [];
  for (const r of required) {
    const rec = results[r.check]?.units?.[`${r.route}|${r.viewport}|${r.state}`];
    const u = { check: r.check, route: r.route, viewport: r.viewport, state: r.state, scenario: r.check === 'interact' ? r.state : undefined, value: rec?.value ?? null, record: rec || null };
    const id = rec?.identity;
    if (!rec) u.status = 'missing';
    else if (rec.error) { u.status = 'error'; u.reason = rec.error; }
    else if (id?.refId !== refId) { u.status = 'invalid'; u.reason = 'measured against another capture or visit profile'; }
    else if (id?.env?.instrumentModified) { u.status = 'invalid'; u.reason = `measured by a modified instrument: ${(id.env.reasons || []).join('; ')}`; }
    else if (configs[r.check] !== undefined && configs[r.check] !== null && id?.configHash !== configs[r.check]) { u.status = 'invalid'; u.reason = `${r.check === 'interact' ? 'interactions.json' : r.check === 'curves' ? 'motion-map.json' : 'journey.json'} changed after it was measured`; }
    else if (r.state !== '_plan' && id?.subjectHash !== subject) { u.status = 'stale'; u.reason = `the ${side === 'app' ? 'app' : 'clone'} changed after it was measured`; }
    else if (id?.codeHash !== codeHash(r.check === 'canvas' ? 'canvas' : r.check)) { u.status = 'stale'; u.reason = 'measured by an older version of the check'; }
    else if (rec.na) { u.status = 'na'; u.reason = rec.na; }
    else if (rec.tool) { u.status = 'tool'; u.reason = rec.tool; }
    else u.status = null; // judged below
    if (r.state === '_plan') { u.plan = true; if (!u.status) u.status = 'pass'; units.push(u); continue; }
    if (!u.status) judge(u, rec, noise);
    // a stale result keeps what it said about the earlier content (status re-measures stale failures first and leaves
    // stale passes for the final sweep); it never counts as either
    else if (u.status === 'stale' && rec && !rec.error && !rec.na && !rec.tool) { const t = { check: u.check, route: u.route, viewport: u.viewport }; judge(t, rec, noise); u.prior = t.status; }
    if (u.status === 'fail' && !['interact'].includes(u.check) && typeof u.value === 'number' && u.value >= ACCEPT_FLOOR && !(u.membersBelow || []).length && acceptedFor(u.check, u.viewport).length) { u.status = 'accepted'; u.accepted = acceptedFor(u.check, u.viewport)[0]; }
    u.shortfall = shortfallOf({ ...u, state: u.status });
    units.push(u);
  }

  // the review: every frame shot of what is there now, each with a verdict given to that picture
  const review = await evaluateReview(root, meta, side, subject, notes);
  // the written plan and the coverage of the site's code (read from files, never stale)
  const written = await evaluateNotes(root, meta, notes);

  const byCheck = new Map();
  for (const u of units.filter((x) => !x.plan)) { if (!byCheck.has(u.check)) byCheck.set(u.check, []); byCheck.get(u.check).push(u); }
  const checks = [...byCheck].map(([key, us]) => ({ key, label: LABELS[key] || key, status: worstState(us.map((u) => u.status)), units: us }));
  const plans = units.filter((u) => u.plan);
  for (const p of plans) if (p.status !== 'pass') checks.push({ key: p.check, label: LABELS[p.check], status: p.status, units: [p] });
  checks.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  checks.push({ key: 'review', label: LABELS.review, status: review.status, review });
  if (written.notes) checks.push({ key: 'notes', label: LABELS.notes, status: written.notes.pass ? 'pass' : 'fail', notes: written.notes });
  if (written.coverage) checks.push({ key: 'coverage', label: LABELS.coverage, status: written.coverage.pass ? 'pass' : 'fail', coverage: written.coverage });
  const counts = {};
  for (const u of units.filter((x) => !x.plan)) counts[u.status] = (counts[u.status] || 0) + 1;
  const lint = await lintSubject(root, meta, side);
  if (lint.findings.length) checks.push({ key: 'lint', label: LABELS.lint, status: 'fail', lint });
  const ok = new Set(['pass', 'accepted', 'na']);
  const verified = units.every((u) => ok.has(u.status)) && review.status === 'pass' && (!written.notes || written.notes.pass) && (!written.coverage || written.coverage.pass) && !lint.findings.length;
  return { side, compare, at: new Date().toISOString(), subjectHash: subject, refId, meta, units, checks, counts, review, written, lint, verified, noise: Boolean(noise) };
}

// The clone lint: what the measurement controls and the exclusions must never be turned into (docs/policy.md).
//   - an excluded widget (meta.ignore) kept in the clone: hidden on both sides while measuring, it would otherwise
//     pass unseen
//   - the controls written into the clone's own code: Math.random, Date.now, performance.now or requestAnimationFrame
//     replaced (a clone that fixes its own randomness or time shows one state on every load)
//   - more animations stopped (animation: none, animation-play-state: paused) outside a prefers-reduced-motion rule
//     than the reference's own CSS stops: a clone that freezes what the site animates
const LINT_EXT = /\.(html?|m?js|jsx|tsx?|css)$/i;
const LINT_SKIP = new Set(['node_modules', '.next', '.git', 'patches-cache', 'assets', 'bundle', 'vendor']);
async function filesOf(dir, out = [], depth = 0) {
  for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (e.isDirectory()) { if (!LINT_SKIP.has(e.name) && depth < 6) await filesOf(path.join(dir, e.name), out, depth + 1); } else if (LINT_EXT.test(e.name)) out.push(path.join(dir, e.name));
  }
  return out;
}
// a stylesheet's text without its @media (prefers-reduced-motion …) blocks (balanced braces)
export function withoutReducedMotion(css) {
  let out = '', i = 0;
  const re = /@media[^{]*prefers-reduced-motion[^{]*\{/g;
  for (let m; (m = re.exec(css));) {
    out += css.slice(i, m.index);
    let depth = 1, j = re.lastIndex;
    while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    i = j;
    re.lastIndex = j;
  }
  return out + css.slice(i);
}
const STOPS = /animation(?:-name)?\s*:\s*none\b|animation-play-state\s*:\s*paused\b/gi;
export const countStops = (text) => (withoutReducedMotion(text).match(STOPS) || []).length;
const OVERRIDE = /\b(Math\.random|Date\.now|performance\.now|(?:window\.)?requestAnimationFrame)\s*=(?!=)/;
export async function lintSubject(root, meta, side = 'clone') {
  const dir = path.join(root, side === 'app' ? 'next' : 'clone');
  const findings = [];
  const files = await filesOf(dir);
  let stops = 0;
  for (const f of files) {
    const text = await fs.readFile(f, 'utf8').catch(() => '');
    const rel = path.relative(root, f).split(path.sep).join('/');
    for (const i of meta.ignore || []) {
      const id = /^#([\w-]+)$/.exec(i.sel)?.[1];
      if ((i.origin && text.includes(i.origin)) || (id && new RegExp(`id=["']${id}["']|getElementById\\(["']${id}["']\\)`).test(text))) findings.push({ file: rel, what: `keeps ${i.sel} (${i.why || 'excluded'}), which is excluded on both sides: remove it from the ${side === 'app' ? 'app' : 'clone'}, or capture again with --include "${i.sel}" to clone it` });
    }
    const line = text.split('\n').findIndex((l) => OVERRIDE.test(l));
    if (line >= 0 && /\.(m?js|jsx|tsx?|html?)$/i.test(f)) findings.push({ file: `${rel}:${line + 1}`, what: `replaces ${OVERRIDE.exec(text.split('\n')[line])[1]}: the measurement's controls must not be built into the clone (its randomness and time are the site's rule, ported)` });
    stops += countStops(text);
  }
  // the reference's own stops: its rendered page and its stylesheets
  let refStops = countStops(await fs.readFile(path.join(root, 'reference', 'rendered.html'), 'utf8').catch(() => ''));
  for (const f of await fs.readdir(path.join(root, 'reference', 'assets', 'stylesheet')).catch(() => [])) refStops += countStops(await fs.readFile(path.join(root, 'reference', 'assets', 'stylesheet', f), 'utf8').catch(() => ''));
  if (stops > refStops) findings.push({ file: side === 'app' ? 'next/' : 'clone/', what: `stops ${stops - refStops} more animation(s) (animation: none, animation-play-state: paused) than the reference's own CSS, outside a prefers-reduced-motion rule: what the site animates must run` });
  return { pass: !findings.length, findings, stops, refStops };
}

// pass/fail of a measured unit against its (calibrated) bar, with its frames or checkpoints against their floors
function judge(u, rec, noise) {
  const { check } = u;
  if (check === 'interact') {
    u.value = rec.score ?? null;
    u.bar = TARGETS.interact;
    u.status = rec.pass ? 'pass' : 'fail';
    if (!rec.pass && rec.toolOnly) { u.status = 'tool'; u.reason = rec.toolOnly; }
    return;
  }
  const b = barFor(noise, check, u.route, u.viewport);
  if (b.unstable) {
    // the reference does not match itself here: pixels cannot judge it; the envelope (measure.mjs) or a behaviour check
    // must, and the record carries that verdict when it was made
    u.bar = null;
    u.calibration = b;
    if (rec.envelope) { u.status = rec.envelope.pass ? 'pass' : 'fail'; u.reason = rec.envelope.reason; }
    else { u.status = 'tool'; u.reason = `the reference differs from itself here (${b.self}% over ${b.draws} loads): judged by its envelope and behaviour, which were not measured`; }
    return;
  }
  const allowance = rec.template && check === 'canvas' ? TEMPLATE_ALLOWANCE : 0;
  u.bar = +(b.bar - allowance).toFixed(2);
  if (allowance) u.allowance = allowance;
  u.calibration = b.calibrated ? b : undefined;
  const value = rec.value;
  if (typeof value !== 'number') { u.status = 'error'; u.reason = rec.reason || 'no value recorded'; return; }
  // frames / checkpoints, each against its floor (calibrated per frame when noise.json has it)
  const floor = FLOORS[check] != null ? FLOORS[check] - allowance : null;
  const below = [];
  for (const m of rec.members || []) {
    if (typeof m.value !== 'number') continue;
    const fb = barFor(noise, check, u.route, u.viewport, String(m.id));
    let mbar = floor;
    // a calibrated frame is held to its own bar (research/metrics.md §3: the fixed floor is 10-17 points looser than
    // what the reference achieves against itself); an uncalibrated one to the fixed floor
    if (fb.calibrated && !fb.unstable) mbar = +(fb.bar - allowance).toFixed(2);
    if (fb.unstable) { if (m.envelope && !m.envelope.pass) below.push({ id: m.id, y: m.y, value: m.value, bar: 0, envelope: m.envelope }); continue; }
    if (typeof mbar === 'number' && m.value < mbar) below.push({ id: m.id, y: m.y, name: m.name, value: m.value, bar: mbar, ...(m.reason ? { reason: m.reason } : {}) });
  }
  u.membersBelow = below;
  u.status = value >= u.bar && !below.length ? 'pass' : 'fail';
}

async function evaluateReview(root, meta, side, subject, notes) {
  const verdicts = notesSection(notes, 'Review');
  const frames = [];
  const missingDirs = [];
  for (const d of reviewDirs(meta, side)) {
    const fr = await readJson(path.join(root, d.dir, 'frames.json'), null);
    if (!fr) { missingDirs.push(d); continue; }
    const stale = fr.subjectHash ? fr.subjectHash !== subject : true;
    for (const x of fr.frames || []) {
      const at = new RegExp(`^${x.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} ${d.size}(?:\\s*\\[([a-z0-9]+)\\])?\\s*:`, 'i');
      const v = verdicts.find((l) => at.test(l));
      const token = v ? at.exec(v)[1] || null : null;
      const verdict = v ? v.slice(v.indexOf(':', v.search(/\]|:/)) + 1).trim() : null;
      // a verdict holds for the picture it was given to: the token (a perceptual hash, measure.mjs) within TOKEN_BITS
      const moved = x.token && token ? hamming(token, x.token) > Math.max(TOKEN_BITS, x.refBits ?? 0) : Boolean(x.token && token !== x.token);
      frames.push({ dir: d.dir, size: d.size, route: d.route, id: x.id, pct: x.pct, token: x.token || null, refSelf: x.refSelf ?? null, cloneOnly: x.cloneOnly || null, verdict, frameStale: stale, verdictStale: Boolean(v && x.token && moved) });
    }
  }
  const SAME_REASON = 85;
  const evidenceOk = (v) => { const m = /evidence:\s*([^\s;,)]+)/i.exec(v); return Boolean(m && !/\.(css|m?js)$/i.test(m[1]) && fsSync.existsSync(path.resolve(root, m[1]))); };
  for (const f of frames) {
    f.state = f.frameStale ? 'stale' : !f.verdict ? 'open' : f.verdictStale ? 'open' : /^same\b/i.test(f.verdict) ? (f.cloneOnly ? 'differs' : f.pct === undefined || f.pct >= SAME_REASON || f.verdict.replace(/^same\b[\s:,-]*/i, '').length >= 12 ? 'closed' : 'open') : /^tool\b/i.test(f.verdict) ? toolVerdict(f, evidenceOk) : 'differs';
    f.why = f.state === 'stale' ? 'shot of an earlier clone: review again' : f.state === 'differs' ? (f.cloneOnly && /^same|^tool/i.test(f.verdict || '') ? `the clone shows ${f.cloneOnly} that no reference load shows: that is a difference` : f.verdict) : f.state === 'open' ? (!f.verdict ? 'no verdict yet' : f.verdictStale ? `verdict given to an earlier picture of this frame (token ${f.token})` : /^tool/i.test(f.verdict) ? f.toolWhy : `same, without the reason a ${f.pct}% frame needs`) : null;
  }
  // a size where most frames are closed as "tool" is a review not done (allbirds RC4: 103 of 105): looked at again
  const bySize = new Map();
  for (const f of frames) { const k = `${f.dir}`; if (!bySize.has(k)) bySize.set(k, []); bySize.get(k).push(f); }
  const toolHeavy = [];
  for (const [dir, fs_] of bySize) { const t = fs_.filter((f) => f.state === 'closed' && /^tool/i.test(f.verdict || '')).length; if (fs_.length >= 5 && t / fs_.length > 0.2) toolHeavy.push({ dir, tool: t, of: fs_.length }); }
  const open = frames.filter((f) => f.state !== 'closed');
  const status = missingDirs.length ? 'missing' : frames.some((f) => f.state === 'stale') ? 'stale' : open.length || toolHeavy.length ? 'fail' : 'pass';
  return { status, frames, open, missingDirs, toolHeavy };
}

// A "tool" verdict says the difference is the instrument's, not the clone's. It holds only with evidence made for that
// frame: the review's own reference-vs-reference measurement showing the reference differs from itself there, or an
// evidence file that names this frame. A shared file cited by many frames, or a clone-only element, never closes one.
function toolVerdict(f, evidenceOk) {
  if (f.cloneOnly) { f.toolWhy = `"tool" cannot excuse ${f.cloneOnly}, which only the clone shows`; return 'differs'; }
  if (typeof f.refSelf === 'number' && typeof f.pct === 'number' && f.refSelf < 95 && f.pct >= f.refSelf - 2) return 'closed';
  const m = /evidence:\s*([^\s;,)]+)/i.exec(f.verdict);
  if (m && evidenceOk(f.verdict) && m[1].includes(f.id.split('/').pop())) return 'closed';
  f.toolWhy = 'tool, without evidence made for this frame (the review\'s reference-vs-reference result, or a file named after the frame)';
  return 'open';
}

async function evaluateNotes(root, meta, notes) {
  if (meta.bundle) return {};
  const behaviours = notesSection(notes, 'Behaviours').join('\n');
  const cites = (behaviours.match(/[\w.-]+\.js:\d+/g) || []).length;
  const evidence = await readJson(path.join(root, 'reference', 'scripts', 'scripts.json'), null);
  const siteListeners = (evidence?.listeners || []).length;
  const notesOk = Boolean(behaviours) && (!siteListeners || cites > 0);
  const findings = [...notes.matchAll(/^## [^\n]*finding[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/gim)].flatMap((m) => m[1].replace(/<!--[\s\S]*?-->/g, '').split('\n').map((l) => l.trim()).filter((l) => /^[-*]\s+\S/.test(l)));
  const LIBRARY = /(^|[\W_])(gsap|tweenmax|flip|scrolltrigger|splittext|customease|jquery|lenis|swiper|three|webflow|lottie|hls|polyfill|modernizr|lodash|react|vue|next|nuxt|webpack|runtime|vendor|framework|chunk)([\W_]|$)/i;
  const covText = `${behaviours}\n${findings.join('\n')}`;
  const scriptJs = await fs.readFile(path.join(root, 'clone', 'script.js'), 'utf8').catch(() => '');
  // an excluded third-party widget's script (D3) is not the site's code to port
  const excludedOrigins = (meta.ignore || []).map((i) => i.origin).filter(Boolean);
  const own = (evidence?.scripts || []).filter((s) => s.functionsRan > 0 && !s.tracking && s.bytes >= 200 && !LIBRARY.test(`${s.file} ${s.url || ''}`) && !excludedOrigins.some((o) => String(s.url || '').startsWith(o)));
  const listened = new Set((evidence?.listeners || []).map((l) => String(l.file || '').replace(/\.pretty\.js$/, '.js')));
  const ran = [...new Set([...own.slice().sort((a, b) => b.functionsRan - a.functionsRan).slice(0, 8), ...own.filter((s) => /^inline-/.test(s.file) && listened.has(s.file))])];
  const uncitedScripts = ran.filter((s) => !covText.includes(s.file.replace(/\.js$/, '')));
  const curvesRec = ((await readJson(path.join(root, 'reference', 'reveals.desktop.json'), null))?.scrubs || []).filter((c) => c.cls);
  const uncitedCurves = curvesRec.filter((c) => { const k = String(c.cls).split('.')[0]; return k && !covText.includes(k) && !scriptJs.includes(k); });
  const coverage = ran.length || curvesRec.length ? { pass: !uncitedScripts.length && !uncitedCurves.length, scripts: ran.length, curves: curvesRec.length, uncitedScripts: uncitedScripts.map((s) => s.file), uncitedCurves: uncitedCurves.map((c) => ({ cls: c.cls, path: c.path })) } : null;
  return { notes: { pass: notesOk, cites, behaviours: Boolean(behaviours), siteListeners }, coverage, findings };
}

// How a unit is named to a person
export const unitName = (u) => `${LABELS[u.check] || u.check}${u.route ? ` ${u.route}` : ''}${u.viewport ? ` ${u.viewport}` : ''}${u.scenario ? ` "${u.scenario}"` : ''}`;
