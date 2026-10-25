// Loop control: when to keep working on something, when to change strategy, and when to conclude. docs/plan-rc5/PLAN.md
// section 3 and R3; the policy and its evidence are in docs/policy.md ("Loop control").
//
// An OBJECTIVE is one failing required result: a check at a route and a size (journey desktop, scroll states /about
// mobile, load wide), one interaction scenario, one review frame marked "differs". Its key never names the worst frame
// or checkpoint inside it, so fixing one frame while another becomes the worst cannot reset anything (RC4 zero: 56
// cycles keyed by "the current worst checkpoint", never set aside).
//
// Its SHORTFALL is how far it is from passing, in points: the mean's gap to its bar plus every frame or checkpoint below
// its floor (verdict.mjs shortfallOf). Lifting one checkpoint while dropping another leaves it unchanged.
//
// An ATTEMPT counts only when the objective was issued, the clone (or app) content changed after that, and the
// objective's own results were measured again on the new content. A report, a re-score of unchanged content, or work on
// something else counts for nothing.
//
// PROGRESS is a new best on one of its pass conditions (verdict.mjs conditionsOf), each tracked on its own: the mean's
// gap to its bar, or the summed gaps of the frames below their floors, lower than their best so far by more than the
// objective's noise (eps); or fewer frames below their floors than ever. A rise in a noisy number, a return to an
// earlier level, or a frame lifted while another drops (the floors' sum unchanged) is not progress; and an attempt that
// broke a result that passed is never progress. One noisy frame cannot hide a steadily rising mean (a single summed
// shortfall did, in the RC4 zero replay: docs/policy.md).
//
// After 2 attempts without progress the objective asks for a change of strategy (one entry under "## Attempts" in
// notes.md naming the objective and a diagnostic artifact made since the last attempt). After `concludeAfter` without
// progress, the last one after that change, it is CONCLUDED (unresolved, listed with its best and current values).
// Independently, the RUN concludes every open objective when `runWindow` counted attempts in a row, on any objectives,
// brought progress on none (failures rotating between objectives, or work that keeps trading one result for another:
// each new best has to beat every earlier level, so trading back and forth runs out).
//
// The parameters are evidence-informed defaults (docs/policy.md shows the replay of the RC4 histories), stored in the
// loop file so a run is explained by the values it used.
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { ORDER, unitName, conditionsOf, TARGETS } from './verdict.mjs';
import { writeAtomic } from './identity.mjs';

// concludeAfter 4: the RC4 zero replay (test/replay.test.mjs, docs/policy.md) stops at 80 on mobile with 3, and at >= 97% of the
// run's eventual gain with 4, half an hour after it levelled off
export const DEFAULTS = { strategyAfter: 2, concludeAfter: 4, runWindow: 4, eps: 0.5 };

export const objectiveKey = (side, u) => `${side}:${u.check}:${u.route || ''}:${u.viewport || ''}:${u.scenario || u.frame || ''}`;

// dir: the workflow's own folder (compare/ for the HTML clone, compare-nextjs/ for a conversion): each keeps its own
// loop, so the two never share objectives, step counters or report digests
export async function loadLoop(root, refId, { dir = 'compare' } = {}) {
  const file = path.join(root, dir, 'loop.json');
  const cur = JSON.parse(await fs.readFile(file, 'utf8').catch(() => 'null'));
  if (cur && cur.refId === refId) return cur;
  // a new reference: results against the old one are not comparable; the old loop is kept for the record
  if (cur) await fs.rename(file, path.join(root, dir, `loop.${cur.refId || 'old'}.json`)).catch(() => {});
  return { refId, ...(dir !== 'compare' ? { dir } : {}), params: { ...DEFAULTS }, startedAt: new Date().toISOString(), objectives: {}, pending: null, run: { bestShortfall: null, sinceBest: 0, attempts: 0 }, passing: {}, regressions: [], errors: {}, events: [], activity: [] };
}
export async function saveLoop(root, loop) {
  const file = path.join(root, loop.dir || 'compare', 'loop.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await writeAtomic(file, JSON.stringify(loop, null, 1));
}

const unitId = (side, u) => `${side}:${u.check}:${u.route || ''}:${u.viewport || ''}:${u.state || ''}`;

// The failing results of an evaluation as objectives (current shortfall and member values), keyed stably. A page of the
// clone that does not load (an error status has retried once and classified as the clone's: failures.mjs) is clone
// work too: its shortfall is the whole bar until it can be measured.
export function objectivesOf(ev) {
  const out = [];
  for (const u of ev.units) {
    if (u.cloneError && !u.plan) {
      const bar = TARGETS[u.check] ?? 100;
      out.push({ key: objectiveKey(ev.side, u), side: ev.side, kind: 'unit', check: u.check, route: u.route, viewport: u.viewport, scenario: u.scenario, label: `${ev.side === 'app' ? 'Next.js app: ' : ''}${unitName(u)}`, shortfall: bar, conditions: { mean: bar, floors: 0, below: 0 }, value: null, bar, members: [], below: [{ id: 'page', name: `the page does not load: ${String(u.reason || '').slice(0, 120)}`, value: 0, bar }], eps: DEFAULTS.eps });
      continue;
    }
    if (u.plan || u.status !== 'fail') continue;
    out.push({ key: objectiveKey(ev.side, u), side: ev.side, kind: 'unit', check: u.check, route: u.route, viewport: u.viewport, scenario: u.scenario, label: `${ev.side === 'app' ? 'Next.js app: ' : ''}${unitName(u)}`, shortfall: u.shortfall, conditions: conditionsOf(u), value: u.value, bar: u.bar, members: (u.record?.members || []).map((m) => ({ id: m.id, value: m.value })), below: (u.membersBelow || []).length ? u.membersBelow : lowestOf(u.record?.members), eps: Math.max(DEFAULTS.eps, u.calibration?.spread || 0) });
  }
  for (const f of ev.review.frames.filter((x) => x.state === 'differs')) {
    out.push({ key: `${ev.side}:review:${f.dir}:${f.id}`, side: ev.side, kind: 'review', check: 'review', viewport: f.size, frame: f.id, dir: f.dir, label: `${ev.side === 'app' ? 'Next.js app: ' : ''}review frame ${f.id} (${f.size})`, shortfall: 1, conditions: { mean: 1, floors: 0, below: 0 }, below: [], value: f.pct, verdict: f.verdict, why: f.why, eps: 0 });
  }
  return out;
}

// no frame below its floor (the mean is what fails): the lowest frames, so the step points somewhere useful
const lowestOf = (members) => (members || []).filter((m) => typeof m.value === 'number').sort((a, b) => a.value - b.value).slice(0, 3).map((m) => ({ id: m.id, name: m.name, y: m.y, value: m.value, bar: null }));

// Has the pending objective been measured again on new content? (its units, or its review frame, current again)
function measuredAgain(ev, pending) {
  if (ev.subjectHash === pending.subjectHash) return false;
  if (pending.kind === 'review') {
    const f = ev.review.frames.find((x) => `${ev.side}:review:${x.dir}:${x.id}` === pending.key);
    return Boolean(f && f.state !== 'stale');
  }
  const us = ev.units.filter((u) => !u.plan && objectiveKey(ev.side, u) === pending.key);
  // an error on the new content is a measurement of it too (the page still does not load): an attempt
  return us.length > 0 && us.every((u) => ['pass', 'fail', 'accepted', 'na', 'tool', 'error'].includes(u.status));
}

// Update the loop with a new evaluation (one side). Returns what happened, for the step text.
export function observe(loop, ev, notesText, root, now = new Date()) {
  const p = loop.params;
  const current = new Map(objectivesOf(ev).map((o) => [o.key, o]));
  const events = [];
  // regressions: a result that passed on earlier content and fails, freshly measured, on this one
  for (const u of ev.units) {
    if (u.plan) continue;
    const id = unitId(ev.side, u);
    if (u.status === 'pass' || u.status === 'accepted') loop.passing[id] = ev.subjectHash;
    else if (u.status === 'fail' && loop.passing[id] && loop.passing[id] !== ev.subjectHash) {
      if (!loop.regressions.some((r) => r.unit === id && r.failedAt === ev.subjectHash)) {
        loop.regressions.push({ unit: id, key: objectiveKey(ev.side, u), label: unitName(u), passedAt: loop.passing[id], failedAt: ev.subjectHash, at: now.toISOString() });
        events.push(`regression: ${unitName(u)} passed on clone ${loop.passing[id]} and fails on ${ev.subjectHash}`);
      }
      delete loop.passing[id];
    }
  }
  // the attempt on the pending objective, once its results are measured again on the changed content
  const pend = loop.pending;
  if (pend && pend.side === ev.side && measuredAgain(ev, pend)) {
    const o = loop.objectives[pend.key] || seed(pend);
    const now_ = current.get(pend.key);
    const shortfall = now_ ? now_.shortfall : 0;
    const causedRegression = loop.regressions.some((r) => r.failedAt === ev.subjectHash && r.key !== pend.key);
    const eps = now_?.eps ?? o.eps ?? p.eps;
    const cond = now_ ? now_.conditions : { mean: 0, floors: 0, below: 0 };
    const best = o.best || { mean: Infinity, floors: Infinity, below: Infinity };
    const gained = [cond.mean < best.mean - eps && 'mean', cond.floors < best.floors - eps && 'floors', cond.below < best.below && 'frames below'].filter(Boolean);
    const progress = !causedRegression && (gained.length > 0 || shortfall === 0);
    o.attempts++;
    o.history.push({ at: now.toISOString(), subjectHash: ev.subjectHash, shortfall, conditions: cond, value: now_?.value ?? null, members: now_?.members?.slice(0, 80) || [], focus: pend.focus || null, progress, ...(gained.length ? { gained } : {}), ...(causedRegression ? { regressed: loop.regressions.filter((r) => r.failedAt === ev.subjectHash).map((r) => r.label) } : {}) });
    o.lastShortfall = shortfall; o.lastValue = now_?.value ?? null; o.lastAt = now.toISOString();
    // each condition keeps its own best (an attempt that broke something that passed sets none)
    if (!causedRegression) o.best = { mean: Math.min(best.mean, cond.mean), floors: Math.min(best.floors, cond.floors), below: Math.min(best.below, cond.below) };
    if (progress) { o.bestShortfall = Math.min(o.bestShortfall ?? Infinity, shortfall); o.bestValue = Math.max(o.bestValue ?? -Infinity, now_?.value ?? -Infinity); o.bestAt = ev.subjectHash; o.noProgress = 0; o.strategyDue = false; } else o.noProgress++;
    if (shortfall === 0 && !now_) { o.state = 'passed'; events.push(`${o.label}: passes now (attempt ${o.attempts})`); } else events.push(`${o.label}: attempt ${o.attempts}, shortfall ${shortfall} (best ${o.bestShortfall})${progress ? `, progress (${gained.join(', ') || 'passes'})` : ', no progress'}${causedRegression ? ', and it broke something that passed' : ''}`);
    // the run: the attempt brought progress on its objective, or not
    loop.run.attempts++;
    const total = [...current.values()].reduce((n, x) => n + x.shortfall, 0);
    if (loop.run.bestShortfall === null || total < loop.run.bestShortfall) loop.run.bestShortfall = +total.toFixed(2);
    if (progress) loop.run.sinceBest = 0; else loop.run.sinceBest++;
    loop.objectives[pend.key] = o;
    loop.pending = null;
  }
  // every current failing result is an objective (new ones open; ones that were passing and came back reopen)
  for (const [k, cur] of current) {
    const o = loop.objectives[k] || seed(cur);
    if (o.state === 'passed' || o.state === 'retired') { o.state = 'open'; o.noProgress = 0; delete o.retiredWhy; events.push(`${o.label}: fails again`); }
    Object.assign(o, { label: cur.label, check: cur.check, route: cur.route, viewport: cur.viewport, scenario: cur.scenario, frame: cur.frame, dir: cur.dir, kind: cur.kind, side: cur.side, eps: cur.eps });
    if (o.bestShortfall === null || o.bestShortfall === undefined) { o.bestShortfall = cur.shortfall; o.bestValue = cur.value; o.bestAt = ev.subjectHash; }
    if (!o.best) o.best = { ...cur.conditions };
    o.lastShortfall = cur.shortfall; o.lastValue = cur.value;
    o.current = { value: cur.value, bar: cur.bar, below: (cur.below || []).slice(0, 5), verdict: cur.verdict, why: cur.why };
    loop.objectives[k] = o;
  }
  // objectives no longer failing on this side (measured and passing, or no longer required) are passed; a concluded
  // one that later passes is passed too (a conclusion is never kept over a result that now passes)
  for (const o of Object.values(loop.objectives)) {
    if (o.side !== ev.side || !['open', 'concluded'].includes(o.state) || current.has(o.key)) continue;
    const still = ev.units.some((u) => !u.plan && objectiveKey(ev.side, u) === o.key && ['missing', 'stale', 'invalid', 'error'].includes(u.status));
    // one whose result the tool can no longer verify is retired as such, never counted as passed (RC6 zero: the RC5
    // journey objectives read "passed, best 1.11" once their units became "not verifiable")
    if (!still && o.kind !== 'review' && ev.units.some((u) => !u.plan && objectiveKey(ev.side, u) === o.key && u.status === 'tool')) { o.state = 'retired'; o.retiredWhy = 'not verifiable by the tool here'; continue; }
    // a review frame passes only when it is looked at again and closed: one whose picture went stale, or whose folder is
    // not shot yet, is not passed (RC5 zero: 55 "differs" frames before a re-seed)
    const frame = o.kind === 'review' && (ev.review?.frames || []).find((f) => `${ev.side}:review:${f.dir}:${f.id}` === o.key);
    // (a frame the new shots no longer have is retired, like any result no longer required)
    const unseen = o.kind === 'review' && (frame ? frame.state !== 'closed' : (ev.review?.missingDirs || []).some((d) => d.dir === o.dir));
    if (!still && !unseen) { o.state = 'passed'; o.lastShortfall = 0; }
  }
  // change of strategy, then conclusion; and the run-level plateau
  for (const o of Object.values(loop.objectives)) {
    if (o.state !== 'open' || o.side !== ev.side) continue;
    if (o.noProgress === 0) o.streakStrategy = false;
    if (o.noProgress >= p.strategyAfter && !o.streakStrategy) {
      if (strategyRecorded(notesText, o, root)) { o.strategies = (o.strategies || 0) + 1; o.streakStrategy = true; o.strategyDue = false; o.strategyAsks = 0; events.push(`${o.label}: change of strategy recorded`); } else o.strategyDue = true;
    }
    // asked twice for a change of strategy and none was recorded: nothing new is being tried
    if (o.strategyDue && (o.strategyAsks || 0) >= 2) conclude(o, `no progress in ${o.noProgress} attempts and no change of strategy recorded when asked`, events);
    else if (o.noProgress >= p.concludeAfter && o.streakStrategy) conclude(o, `no progress in ${o.noProgress} attempts in a row, the last after a change of strategy`, events);
  }
  if (loop.run.sinceBest >= p.runWindow) {
    for (const o of Object.values(loop.objectives)) if (o.state === 'open') conclude(o, `the run made no progress in ${loop.run.sinceBest} attempts in a row on any result (best total shortfall ${loop.run.bestShortfall})`, events);
  }
  loop.events.push(...events.map((e) => ({ at: now.toISOString(), e })));
  loop.events = loop.events.slice(-400);
  return events;
}

function seed(o) {
  return { key: o.key, label: o.label, side: o.side, kind: o.kind, check: o.check, route: o.route, viewport: o.viewport, scenario: o.scenario, frame: o.frame, dir: o.dir, state: 'open', attempts: 0, noProgress: 0, bestShortfall: o.shortfall ?? null, bestValue: o.value ?? null, lastShortfall: o.shortfall ?? null, lastValue: o.value ?? null, eps: o.eps ?? DEFAULTS.eps, history: [] };
}
function conclude(o, why, events) {
  o.state = 'concluded';
  o.concludedWhy = why;
  o.owner = o.owner || 'clone';
  events.push(`${o.label}: concluded (${why})`);
}

// A change of strategy is recorded when notes.md "## Attempts" has a line naming the objective (its label or key) and an
// artifact made after the objective's last attempt (an explain crop, a brief, a probe's output): new evidence, and what
// the next attempt does differently. The tool checks that it exists and is new; the next measured attempt judges it.
export function strategyRecorded(notesText, o, root) {
  const m = /^## Attempts[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(notesText || '');
  if (!m) return false;
  const lastAt = Date.parse(o.history.at(-1)?.at || 0);
  for (const line of m[1].split('\n')) {
    if (!line.includes(o.label) && !line.includes(o.key)) continue;
    const ev = /evidence:\s*([^\s;,)]+)/i.exec(line);
    if (!ev || !root) continue;
    try {
      const st = fsSync.statSync(path.resolve(root, ev[1]), { throwIfNoEntry: false });
      if (st && st.mtimeMs > lastAt) return true;
    } catch { /* missing */ }
  }
  return false;
}

// The next objective to work on: regressions first, then review differences, then the checks in fix order, largest
// shortfall first. Concluded objectives are never issued again.
export function nextObjective(loop, side) {
  const open = Object.values(loop.objectives).filter((o) => o.state === 'open' && o.side === side);
  const regressed = new Set(loop.regressions.filter((r) => !loop.objectives[r.key] || loop.objectives[r.key].state === 'open').map((r) => r.key));
  const rank = (o) => (regressed.has(o.key) ? -2 : o.kind === 'review' ? -1 : ORDER.indexOf(o.check) < 0 ? 99 : ORDER.indexOf(o.check));
  open.sort((a, b) => rank(a) - rank(b) || (b.lastShortfall ?? 0) - (a.lastShortfall ?? 0));
  return open[0] ? { ...open[0], regressed: regressed.has(open[0].key) } : null;
}

// Activity (status calls): wall time and active time (gaps over 15 minutes with no status call are left out)
export function recordActivity(loop, now = new Date()) {
  loop.activity.push(now.toISOString());
  loop.activity = loop.activity.slice(-2000);
  const t = loop.activity.map(Date.parse);
  let active = 0;
  for (let i = 1; i < t.length; i++) { const d = t[i] - t[i - 1]; if (d < 15 * 60000) active += d; }
  return { wallMin: Math.round((t.at(-1) - Date.parse(loop.startedAt)) / 60000), activeMin: Math.round(active / 60000) };
}
