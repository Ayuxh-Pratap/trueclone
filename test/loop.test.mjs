// The loop controller (scripts/loop.mjs): it must end an unproductive loop, never mistake real slow progress or noise,
// and never let a report or a re-score count as an attempt. RC4: zero ran 56 cycles because the retry key named the
// current worst checkpoint and was deleted whenever another checkpoint became the worst (ZERO-2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { observe, nextObjective, DEFAULTS } from '../scripts/loop.mjs';
import { shortfallOf } from '../scripts/verdict.mjs';

const fresh = () => ({ refId: 'r', params: { ...DEFAULTS }, startedAt: new Date().toISOString(), objectives: {}, pending: null, run: { bestShortfall: null, sinceBest: 0, attempts: 0 }, passing: {}, regressions: [], errors: {}, events: [], activity: [] });

// an evaluation with one journey unit per viewport; members: [{id, value}]
function ev(hash, perVp) {
  const units = Object.entries(perVp).map(([vp, members]) => {
    const value = +(members.reduce((n, m) => n + m.value, 0) / members.length).toFixed(2);
    const below = members.filter((m) => m.value < 80).map((m) => ({ id: m.id, name: m.id, value: m.value, bar: 80 }));
    const status = value >= 95 && !below.length ? 'pass' : 'fail';
    const u = { check: 'journey', route: '', viewport: vp, state: '', status, value, bar: 95, membersBelow: below, record: { members } };
    u.shortfall = shortfallOf({ ...u, state: status });
    return u;
  });
  return { side: 'clone', subjectHash: hash, units, review: { frames: [] } };
}
// one status cycle: observe, pick, mark pending (what status does), with a new content hash per attempt
function cycle(loop, e, notes = '', root = os.tmpdir()) {
  observe(loop, e, notes, root);
  const pick = nextObjective(loop, 'clone');
  if (pick && !loop.objectives[pick.key].strategyDue) loop.pending = { key: pick.key, kind: pick.kind, side: 'clone', check: pick.check, subjectHash: e.subjectHash };
  if (pick && loop.objectives[pick.key].strategyDue) loop.objectives[pick.key].strategyAsks = (loop.objectives[pick.key].strategyAsks || 0) + 1;
  return pick;
}

test('ZERO-2: failures rotating between checkpoints (mean flat) conclude; the objective key never names the worst checkpoint', async () => {
  const loop = fresh();
  let concludedAt = null;
  for (let i = 0; i < 20 && !concludedAt; i++) {
    // fixing one checkpoint drops another: shortfall stays the same
    const a = i % 2 ? 70 : 90, b = i % 2 ? 90 : 70;
    cycle(loop, ev(`h${i}`, { desktop: [{ id: 'step-1', value: a }, { id: 'step-2', value: b }, { id: 'step-3', value: 99 }] }));
    const o = Object.values(loop.objectives)[0];
    if (o.state === 'concluded') concludedAt = i;
  }
  assert.ok(concludedAt !== null, 'never concluded');
  assert.ok(concludedAt <= 8, `concluded too late: cycle ${concludedAt}`);
  assert.equal(Object.keys(loop.objectives).length, 1, 'one objective (keyed by check and size), not one per worst checkpoint');
  assert.match(Object.values(loop.objectives)[0].concludedWhy, /no (progress|change of strategy)/);
});

test('genuine slow progress (beyond noise) is never mistaken for a dead loop', async () => {
  const loop = fresh();
  for (let i = 0; i < 25; i++) {
    const v = 60 + i * 1.2; // +1.2 points per attempt, as zero's real rise
    cycle(loop, ev(`h${i}`, { desktop: [{ id: 'a', value: v }, { id: 'b', value: v + 2 }] }));
  }
  const o = Object.values(loop.objectives)[0];
  assert.notEqual(o.state, 'concluded', o.concludedWhy);
  assert.ok(o.attempts >= 20);
});

test('noise is not progress: a wobble smaller than eps does not reset the count', async () => {
  const loop = fresh();
  const seq = [80, 80.3, 79.9, 80.4, 80.1, 80.2, 79.8];
  for (const [i, v] of seq.entries()) cycle(loop, ev(`h${i}`, { desktop: [{ id: 'a', value: v }, { id: 'b', value: v }] }));
  const o = Object.values(loop.objectives)[0];
  assert.ok(o.history.filter((h) => h.progress).length <= 1, JSON.stringify(o.history.map((h) => h.progress)));
  assert.ok(o.noProgress >= 2 || o.state === 'concluded');
});

test('a report or a re-score on unchanged content is not an attempt (idempotent)', async () => {
  const loop = fresh();
  const e = ev('same', { desktop: [{ id: 'a', value: 70 }, { id: 'b', value: 70 }] });
  for (let i = 0; i < 6; i++) cycle(loop, e);
  assert.equal(Object.values(loop.objectives)[0].attempts, 0);
  assert.equal(loop.run.attempts, 0);
});

test('a change is an attempt only once its own results are measured again (stale results do not count)', async () => {
  const loop = fresh();
  cycle(loop, ev('h0', { desktop: [{ id: 'a', value: 70 }, { id: 'b', value: 70 }] }));
  const stale = ev('h1', { desktop: [{ id: 'a', value: 70 }, { id: 'b', value: 70 }] });
  stale.units[0].status = 'stale';
  observe(loop, stale, '', os.tmpdir());
  assert.equal(Object.values(loop.objectives)[0].attempts, 0);
  observe(loop, ev('h1', { desktop: [{ id: 'a', value: 75 }, { id: 'b', value: 75 }] }), '', os.tmpdir());
  assert.equal(Object.values(loop.objectives)[0].attempts, 1);
});

test('a regression (passed before, fails now) is recorded, comes first, and the attempt that caused it is not progress', async () => {
  const loop = fresh();
  cycle(loop, ev('h0', { desktop: [{ id: 'a', value: 70 }, { id: 'b', value: 70 }], mobile: [{ id: 'a', value: 99 }, { id: 'b', value: 99 }] }));
  // the fix lifts desktop but breaks mobile
  const pick = cycle(loop, ev('h1', { desktop: [{ id: 'a', value: 90 }, { id: 'b', value: 90 }], mobile: [{ id: 'a', value: 60 }, { id: 'b', value: 60 }] }));
  assert.equal(loop.regressions.length, 1);
  const desk = Object.values(loop.objectives).find((o) => o.viewport === 'desktop');
  assert.equal(desk.history.at(-1).progress, false);
  assert.ok(pick.regressed && pick.viewport === 'mobile', 'the regression is issued first');
});

test('run-level plateau: work that keeps trading one result for another concludes everything open', async () => {
  const loop = fresh();
  for (let i = 0; i < 16; i++) {
    const up = i % 2 === 0;
    cycle(loop, ev(`h${i}`, { desktop: [{ id: 'a', value: up ? 90 : 70 }, { id: 'b', value: 90 }], mobile: [{ id: 'a', value: up ? 70 : 90 }, { id: 'b', value: 90 }] }));
  }
  const open = Object.values(loop.objectives).filter((o) => o.state === 'open');
  assert.equal(open.length, 0, JSON.stringify(Object.values(loop.objectives).map((o) => [o.state, o.attempts])));
});

test('a change of strategy is asked for after 2 attempts without progress; asked twice and never recorded, the objective concludes', async () => {
  const loop = fresh();
  for (let i = 0; i < 12; i++) cycle(loop, ev(`h${i}`, { desktop: [{ id: 'a', value: 70 }, { id: 'b', value: 70 }] }));
  const o = Object.values(loop.objectives)[0];
  assert.equal(o.state, 'concluded');
  assert.match(o.concludedWhy, /no change of strategy recorded/);
});

test('a recorded change of strategy (named, with new evidence) is accepted, and the objective concludes only after a further attempt without progress', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-loop-'));
  const loop = fresh();
  for (let i = 0; i < 3; i++) cycle(loop, ev(`h${i}`, { desktop: [{ id: 'a', value: 70 }, { id: 'b', value: 70 }] }), '', dir);
  const o = Object.values(loop.objectives)[0];
  assert.equal(o.strategyDue, true);
  await new Promise((r) => setTimeout(r, 20));
  await fs.writeFile(path.join(dir, 'crop.png'), 'x');
  const notes = `## Attempts\n- ${o.label}: the camera framing differs, not the colours; next: port the camera path; evidence: crop.png\n`;
  cycle(loop, ev('h2', { desktop: [{ id: 'a', value: 70 }, { id: 'b', value: 70 }] }), notes, dir);
  assert.equal(o.strategyDue, false);
  assert.equal(o.strategies, 1);
  assert.equal(o.state, 'open');
  // concluded once DEFAULTS.concludeAfter attempts in a row brought no progress, not before
  for (let i = 3; o.noProgress < DEFAULTS.concludeAfter; i++) {
    assert.equal(o.state, 'open', `concluded after ${o.noProgress} attempts`);
    cycle(loop, ev(`h${i}`, { desktop: [{ id: 'a', value: 70 }, { id: 'b', value: 70 }] }), notes, dir);
  }
  assert.equal(o.state, 'concluded');
});

test('a concluded objective that later passes is counted as passed', async () => {
  const loop = fresh();
  for (let i = 0; i < 12; i++) cycle(loop, ev(`h${i}`, { desktop: [{ id: 'a', value: 70 }, { id: 'b', value: 70 }] }));
  assert.equal(Object.values(loop.objectives)[0].state, 'concluded');
  observe(loop, ev('hpass', { desktop: [{ id: 'a', value: 99 }, { id: 'b', value: 99 }] }), '', os.tmpdir());
  assert.equal(Object.values(loop.objectives)[0].state, 'passed');
});

// rc.6: a review frame marked "differs" whose picture is gone stale (the clone changed; RC5 zero after its re-seed) is
// not passed: it waits to be shot and looked at again. Only a fresh frame with a closing verdict passes it.
test('a "differs" review frame that went stale is not counted as passed', async () => {
  const loop = fresh();
  const frame = (state) => ({ side: 'clone', subjectHash: 'h', units: [], review: { frames: [{ dir: 'compare/review/journey-mobile', id: 'journey/04-step-3', size: 'mobile', state, pct: 40, verdict: 'differs: asset error' }], missingDirs: [] } });
  observe(loop, frame('differs'), '', os.tmpdir());
  const o = Object.values(loop.objectives)[0];
  assert.equal(o.kind, 'review');
  assert.equal(o.state, 'open');
  observe(loop, { ...frame('stale'), subjectHash: 'h2' }, '', os.tmpdir());
  assert.equal(o.state, 'open', 'a stale picture is not a pass');
  observe(loop, { ...frame('closed'), subjectHash: 'h2' }, '', os.tmpdir());
  assert.equal(o.state, 'passed');
});
