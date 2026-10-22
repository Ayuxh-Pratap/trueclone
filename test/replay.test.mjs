// HISTORICAL REPLAY, separate from the synthetic loop tests (test/loop.test.mjs): RC4 zero's measured journey series
// (57 scores over 31 hours, docs/eval-rc4/projects/zero.series.json) through the loop controller as status would have
// run it. Approximate (test/helpers/replay.mjs says how): per-checkpoint values were not kept by RC4. Acceptance
// (docs/plan-rc5/PLAN.md 3.4): the controller concludes no earlier than where the run had 95% of its eventual gain,
// and not long after it levelled off, which RC4 did not (it ran on for 11 more hours until the user stopped it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zeroScores, replay } from './helpers/replay.mjs';
import { DEFAULTS } from '../scripts/loop.mjs';

const SERIES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'eval-rc4', 'projects', 'zero.series.json');
const scores = zeroScores(SERIES);
const gainAt = (vp, i) => { const first = scores[0][vp], best = Math.max(...scores.map((s) => s[vp])), sofar = Math.max(...scores.slice(0, i + 1).map((s) => s[vp])); return (sofar - first) / (best - first); };

test('RC4 zero replay: the defaults conclude after >= 95% of the run\'s eventual gain, soon after it levelled off', () => {
  assert.ok(scores.length >= 50, `${scores.length} scores`);
  const r = replay(scores);
  const ends = Object.entries(r.concluded);
  assert.equal(ends.length, 2, 'both journey objectives conclude (the run does not go on for ever)');
  for (const [key, c] of ends) {
    const vp = key.split(':')[3];
    assert.ok(gainAt(vp, c.i) >= 0.95, `${vp} concluded at score ${c.i} with ${(gainAt(vp, c.i) * 100).toFixed(1)}% of the eventual gain`);
    // the plateau begins at the last new best beyond eps (0.5); concluded within 5 scores of it when it began before
    // (on this run about 2 h of wall time: PLAN.md 3.4 asked for 1.5 h, which a 4-attempt window over attempts of ~25 min
    // cannot meet; 3 attempts meets it and stops mobile at 80: accuracy first, docs/policy.md records the trade-off)
    let plateau = 0, top = -Infinity;
    scores.forEach((s, i) => { if (s[vp] > top + 0.5) { top = s[vp]; plateau = i; } else top = Math.max(top, s[vp]); });
    if (plateau < c.i) assert.ok(c.i - plateau <= 5, `${vp}: concluded ${c.i - plateau} scores after its plateau began (score ${plateau})`);
    assert.ok(c.i < scores.length - 5, `${vp}: concluded at score ${c.i} of ${scores.length}, not at the end of the data`);
  }
});

test('RC4 zero replay: the evidence for the window: 3 attempts stops too early, 4 does not', () => {
  const three = replay(scores, { concludeAfter: 3 });
  const early = Object.entries(three.concluded).some(([key, c]) => gainAt(key.split(':')[3], c.i) < 0.95);
  assert.ok(early, '3 attempts concludes an objective before 95% of its gain (the rule the user saw stop zero too early)');
  assert.equal(DEFAULTS.concludeAfter, 4);
});

test('RC4 zero replay: one summed shortfall (mean gap + floor gaps) would have stopped it at ~71; per-condition progress does not', () => {
  const r = replay(scores);
  for (const c of Object.values(r.concluded)) assert.ok(c.value > 85, `concluded at ${c.value}`);
});
