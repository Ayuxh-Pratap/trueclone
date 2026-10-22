// The shared measures (scripts/measure.mjs) on the cases research/metrics.md §2c used to choose them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from '../scripts/lib.mjs';
import { sComp, aGrid, regionScore, envelope, dHash, hamming, TOKEN_BITS, inkOf, isEmpty, presence, presenceInRange } from '../scripts/measure.mjs';

const W = 320, H = 200;
const img = (fn, w = W, h = H) => { const p = new PNG({ width: w, height: h }); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = fn(x, y); const i = (y * w + x) * 4; p.data[i] = r; p.data[i + 1] = g; p.data[i + 2] = b; p.data[i + 3] = 255; } return p; };
// a "scene": a dark disc and a red bar on a light ground, at a given offset
const scene = (dx = 0, dy = 0, swap = false) => img((x, y) => {
  const disc = (x - 110 - dx) ** 2 + (y - 90 - dy) ** 2 < 45 ** 2;
  const bar = x > 190 + dx && x < 290 + dx && y > 130 + dy && y < 160 + dy;
  const c = disc ? [30, 40, 60] : bar ? [210, 40, 40] : [235, 232, 225];
  return swap ? [c[2], c[0], c[1]] : c;
});
const tiles = (src, t = 40) => { const out = new PNG({ width: src.width, height: src.height }); const nx = src.width / t, ny = src.height / t; for (let k = 0; k < nx * ny; k++) { const j = (k * 7 + 3) % (nx * ny); PNG.bitblt(src, out, (j % nx) * t, Math.floor(j / nx) * t, t, t, (k % nx) * t, Math.floor(k / nx) * t); } return out; };
const flat = (v) => img(() => [v, v, v]);

test('S-comp keeps a 2 px shift and a recolour, and falls on a different arrangement of the same pixels', () => {
  const a = scene();
  assert.ok(sComp(a, scene(2, 2)) > 95, `shift ${sComp(a, scene(2, 2))}`);
  assert.ok(sComp(a, scene(0, 0, true)) > 60, `recolour ${sComp(a, scene(0, 0, true))}`);
  assert.ok(sComp(a, tiles(a)) < 50, `tiles ${sComp(a, tiles(a))}`);
  assert.ok(sComp(a, scene(60, 0)) < 70, `framing ${sComp(a, scene(60, 0))}`);
});

test('A-grid sees colour in its place; flat 127 against flat 128 is the same', () => {
  const a = scene();
  assert.ok(aGrid(a, scene(0, 0, true)) < 85, `recolour ${aGrid(a, scene(0, 0, true))}`);
  assert.ok(aGrid(a, tiles(a)) < 90, `tiles ${aGrid(a, tiles(a))}`);
  assert.ok(aGrid(flat(127), flat(128)) >= 99, `flat ${aGrid(flat(127), flat(128))}`);
  assert.equal(sComp(flat(127), flat(128)), null, 'two flat regions have no composition to compare');
  assert.ok(regionScore(flat(127), flat(128)).value >= 99);
});

test('a blank region where the reference draws a scene scores 0 on composition', () => {
  assert.equal(sComp(scene(), flat(235)), 0);
  assert.ok(regionScore(scene(), flat(235), { template: true }).value === 0);
});

test('template mode gates on composition only; exact mode on the lower of composition and colour', () => {
  const r = regionScore(scene(), scene(0, 0, true), { template: true });
  const e = regionScore(scene(), scene(0, 0, true));
  assert.equal(r.gate, 'sComp');
  assert.ok(e.value <= r.value && e.value === Math.min(e.sComp, e.aGrid));
});

test('the envelope: nearest draw against the draws\' own leave-one-out range', () => {
  const draws = [scene(0, 0), scene(4, 0), scene(8, 0)];
  const sim = (x, y) => sComp(x, y);
  assert.equal(envelope(scene(4, 2), draws, sim).pass, true);
  const bad = envelope(tiles(scene()), draws, sim);
  assert.equal(bad.pass, false);
  assert.match(bad.reason, /below the reference's own range/);
  assert.equal(envelope(scene(), [scene()], sim), null, 'one draw has no spread to judge by');
});

test('the colour-presence range catches a missing object the nearest draw would forgive', () => {
  const draws = [presence(scene(0, 0)), presence(scene(6, 0)), presence(scene(12, 0))];
  const noBar = img((x, y) => ((x - 110) ** 2 + (y - 90) ** 2 < 45 ** 2 ? [30, 40, 60] : [235, 232, 225]));
  const noObjects = flat(235);
  assert.equal(presenceInRange(presence(scene(3, 0)), draws).pass, true);
  assert.equal(presenceInRange(presence(noObjects), draws).pass, false);
  assert.ok(presence(noBar) < Math.min(...draws));
});

test('dHash: stable under a 1-level change and a 1 px shift, far for another picture', () => {
  const a = scene();
  const plus1 = img((x, y) => { const i = (y * W + x) * 4; return [Math.min(255, a.data[i] + 1), Math.min(255, a.data[i + 1] + 1), Math.min(255, a.data[i + 2] + 1)]; });
  assert.ok(hamming(dHash(a), dHash(plus1)) <= TOKEN_BITS);
  assert.ok(hamming(dHash(a), dHash(scene(1, 0))) <= TOKEN_BITS);
  assert.ok(hamming(dHash(a), dHash(tiles(a))) > TOKEN_BITS);
  assert.match(dHash(a), /^[0-9a-f]{16}$/);
  assert.equal(hamming('abc12', 'abc13'), 64, 'an old-style token is only equal to itself');
  assert.equal(hamming('abc12', 'abc12'), 0);
});

test('the empty-page floor: light cards on white are content (BHASKAR-4), a blank page is empty', () => {
  const cards = img((x, y) => (x % 100 > 10 && x % 100 < 90 && y > 40 && y < 160 ? [240, 240, 240] : [255, 255, 255]));
  assert.ok(inkOf(cards) > 0.3, `cards ink ${inkOf(cards)}`);
  assert.equal(isEmpty(cards), false);
  assert.equal(isEmpty(flat(255)), true);
});
