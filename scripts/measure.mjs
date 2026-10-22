// The similarity measures every check shares (docs/plan-rc5/PLAN.md 5.3, research/metrics.md §3). Each one is spatial:
// none of them can be passed by the right colours in the wrong places.
//   S-dom   masked pixel match (lib.mjs matchPct on the structure masks): layout, scroll frames, UI layers
//   S-comp  composition: Pearson r x 100 of luminance box-downscaled to ~32 px wide. Ignores palette (a recoloured scene
//           keeps it), tolerates a 2 px shift, falls on a different framing or geometry. Needs content: a region whose
//           luminance hardly varies is "sparse" (null), never a free pass
//   A-grid  appearance with position: mean colour of each cell of a 16 x 10 grid, 100 - 4 x mean |delta| / 255 x 100
//   E       envelope, for a frame the reference itself varies on: the candidate's nearest reference draw, against the
//           draws' own leave-one-out minimum
// The colour histogram (lib.mjs canvasSimilarity) is kept as a diagnostic only: it has no spatial term (RC4 zero
// step-10, a different camera framing of the same palette, scored 93.88 on it and 31.8 on S-comp).
// Also here: dHash (a 64-bit perceptual hash for review verdict tokens) and the absolute empty-page floor.
import { PNG } from './lib.mjs';

// luminance (Rec. 601), box-downscaled so the width is about tw
export function gray(img, tw) {
  const f = Math.max(1, Math.round(img.width / tw));
  const W = Math.max(1, Math.floor(img.width / f)), H = Math.max(1, Math.floor(img.height / f));
  const g = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0, n = 0;
    for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) {
      const yy = y * f + dy, xx = x * f + dx;
      if (yy >= img.height || xx >= img.width) continue;
      const i = (yy * img.width + xx) * 4;
      s += 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
      n++;
    }
    g[y * W + x] = n ? s / n : 0;
  }
  return { g, W, H };
}

const std = ({ g }) => { let s = 0; for (const v of g) s += v; const m = s / g.length; let q = 0; for (const v of g) q += (v - m) ** 2; return Math.sqrt(q / g.length); };
export const SPARSE_STD = 8;

// S-comp. Returns null when both regions are sparse (nothing to compose: judged by S-dom and A-grid instead); a sparse
// region against one with content scores 0 (a blank canvas where the reference draws a scene)
export function sComp(a, b, tw = 32) {
  const A = gray(a, tw), B = gray(b, tw);
  const sa = std(A), sb = std(B);
  if (sa < SPARSE_STD && sb < SPARSE_STD) return null;
  if (sa < SPARSE_STD || sb < SPARSE_STD) return 0;
  const W = Math.min(A.W, B.W), H = Math.min(A.H, B.H), n = W * H;
  let ma = 0, mb = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { ma += A.g[y * A.W + x]; mb += B.g[y * B.W + x]; }
  ma /= n; mb /= n;
  let c = 0, va = 0, vb = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = A.g[y * A.W + x] - ma, q = B.g[y * B.W + x] - mb; c += p * q; va += p * p; vb += q * q; }
  return va > 1e-6 && vb > 1e-6 ? +Math.max(0, (100 * c) / Math.sqrt(va * vb)).toFixed(2) : 0;
}

// A-grid
export function aGrid(a, b, gx = 16, gy = 10) {
  const cells = (img) => {
    const o = [];
    for (let cy = 0; cy < gy; cy++) for (let cx = 0; cx < gx; cx++) {
      let r = 0, g = 0, bl = 0, n = 0;
      const x0 = Math.floor((cx * img.width) / gx), x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * img.width) / gx));
      const y0 = Math.floor((cy * img.height) / gy), y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * img.height) / gy));
      for (let y = y0; y < Math.min(y1, img.height); y += 2) for (let x = x0; x < Math.min(x1, img.width); x += 2) { const i = (y * img.width + x) * 4; r += img.data[i]; g += img.data[i + 1]; bl += img.data[i + 2]; n++; }
      o.push(n ? [r / n, g / n, bl / n] : [0, 0, 0]);
    }
    return o;
  };
  const A = cells(a), B = cells(b);
  // a difference of up to 2 levels per channel is encoding noise, not a colour (flat 127 against flat 128 scores 100)
  const dc = (p, q) => Math.max(0, Math.abs(p - q) - 2);
  let d = 0;
  for (let k = 0; k < A.length; k++) d += dc(A[k][0], B[k][0]) + dc(A[k][1], B[k][1]) + dc(A[k][2], B[k][2]);
  return +Math.max(0, 100 - (100 * 4 * d) / A.length / 765).toFixed(2);
}

// A region's score, by mode: in exact mode the clone's media are the site's own, so both its composition and its colours
// must match (the lower of the two); in template mode the media are the clone's own (D4: "media replaced"), so only the
// composition gates and A-grid is reported. A sparse pair falls back to A-grid in both modes.
export function regionScore(a, b, { template = false } = {}) {
  const s = sComp(a, b), g = aGrid(a, b);
  const value = s === null ? g : template ? s : Math.min(s, g);
  return { value, sComp: s, aGrid: g, gate: s === null ? 'aGrid (sparse)' : template ? 'sComp' : 'min(sComp, aGrid)' };
}

// E: the candidate against each reference draw; passes when its nearest draw is at least the draws' own leave-one-out
// minimum less a margin (one draw against its nearest other draw: what the reference achieves against itself)
export function envelope(candidate, draws, sim, { margin = 1 } = {}) {
  if (draws.length < 2) return null;
  const loo = draws.map((d, i) => Math.max(...draws.filter((_, j) => j !== i).map((o) => sim(d, o) ?? 0)));
  const nearest = Math.max(...draws.map((d) => sim(candidate, d) ?? 0));
  const bar = +(Math.min(...loo) - margin).toFixed(2);
  return { value: +nearest.toFixed(2), bar, pass: nearest >= bar, draws: draws.length, self: [Math.min(...loo), Math.max(...loo)].map((v) => +v.toFixed(2)), reason: nearest >= bar ? `nearest reference draw ${nearest.toFixed(1)} (the reference against itself: ${Math.min(...loo).toFixed(1)}-${Math.max(...loo).toFixed(1)})` : `${nearest.toFixed(1)} against every reference draw, below the reference's own range (${Math.min(...loo).toFixed(1)}-${Math.max(...loo).toFixed(1)})` };
}

// The stable property of a region the reference varies on (research/metrics.md 2b): the share of its pixels, in %, in
// strong colour (saturation > 0.35, or luminance < 60). A scene's objects move between loads; how much of the view they
// fill does not. The candidate must lie in [0.5 x min, 1.5 x max] of the draws, with 0.3 points of slack when the
// minimum is about 0 (an additive "± spread" was tried first and let "no cord in view" pass: research 2b)
export function presence(img) {
  let n = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if ((mx - mn) / (mx || 1) > 0.35 || 0.299 * r + 0.587 * g + 0.114 * b < 60) n++;
  }
  return +((100 * n) / (img.data.length / 4)).toFixed(2);
}
export function presenceInRange(value, drawValues) {
  if (!drawValues.length) return { pass: true };
  const lo = Math.min(...drawValues), hi = Math.max(...drawValues);
  const min = lo < 0.3 ? Math.max(0, lo * 0.5 - 0.3) : lo * 0.5, max = hi * 1.5 + (lo < 0.3 ? 0.3 : 0);
  const pass = value >= min && value <= max;
  return { pass, value, range: [+min.toFixed(2), +max.toFixed(2)], reason: pass ? null : `${value}% of the view in strong colour, outside every reference draw's range (${lo}-${hi}%, allowed ${min.toFixed(2)}-${max.toFixed(2)}): ${value < min ? 'something the reference draws is missing' : 'something the reference does not draw is there'}` };
}

// dHash: 9 x 8 grey, one bit per horizontal step. Survives a 1-level change and a 1 px shift (the review token it
// replaces changed on +1 RGB level in 20 of 20 zero frames); a different picture moves many bits
export function dHash(img) {
  const g = new Float64Array(72);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 9; x++) {
    const x0 = Math.floor((x * img.width) / 9), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.width) / 9));
    const y0 = Math.floor((y * img.height) / 8), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.height) / 8));
    let s = 0, n = 0;
    for (let yy = y0; yy < Math.min(y1, img.height); yy += 2) for (let xx = x0; xx < Math.min(x1, img.width); xx += 2) { const i = (yy * img.width + xx) * 4; s += 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]; n++; }
    g[y * 9 + x] = n ? s / n : 0;
  }
  let hex = '';
  for (let y = 0; y < 8; y++) {
    let byte = 0;
    // a step smaller than 2 grey levels is no step (flat areas would otherwise flip on a 1-level change)
    for (let x = 0; x < 8; x++) byte = (byte << 1) | (g[y * 9 + x + 1] - g[y * 9 + x] > 2 ? 1 : 0);
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}
export function hamming(h1, h2) {
  // a token that is not a 64-bit hash (an earlier version's) is only the same picture when it is the same token
  if (!/^[0-9a-f]{16}$/.test(h1 || '') || !/^[0-9a-f]{16}$/.test(h2 || '')) return h1 && h1 === h2 ? 0 : 64;
  let d = 0;
  for (let i = 0; i < h1.length; i += 2) { let x = parseInt(h1.slice(i, i + 2), 16) ^ parseInt(h2.slice(i, i + 2), 16); while (x) { d += x & 1; x >>= 1; } }
  return d;
}
// a verdict token still describes the picture when the hash moved less than the reference moves against itself
export const TOKEN_BITS = 6;

// The absolute empty-page floor (replaces the 0.3 ink ratio, which read light cards on white as "empty": BHASKAR-4).
// Ink is any pixel that differs from the image's own modal colour by more than a contrast relative to that background;
// a page is empty when less than 1% of it is ink.
export function inkOf(img) {
  const counts = new Map();
  const step = Math.max(1, Math.floor((img.width * img.height) / 40000));
  for (let p = 0; p < img.width * img.height; p += step) { const i = p * 4; const k = ((img.data[i] >> 3) << 10) | ((img.data[i + 1] >> 3) << 5) | (img.data[i + 2] >> 3); counts.set(k, (counts.get(k) || 0) + 1); }
  let mode = 0, best = -1;
  for (const [k, n] of counts) if (n > best) { best = n; mode = k; }
  const bg = [((mode >> 10) & 31) * 8 + 4, ((mode >> 5) & 31) * 8 + 4, (mode & 31) * 8 + 4];
  let ink = 0, n = 0;
  for (let p = 0; p < img.width * img.height; p += step) { const i = p * 4; n++; if (Math.abs(img.data[i] - bg[0]) + Math.abs(img.data[i + 1] - bg[1]) + Math.abs(img.data[i + 2] - bg[2]) > 24) ink++; }
  return n ? ink / n : 0;
}
export const EMPTY_INK = 0.01;
export const isEmpty = (img) => inkOf(img) < EMPTY_INK;

// a region of an image as its own PNG
export function region(img, [x0, y0, x1, y1]) {
  const w = Math.max(1, Math.min(x1, img.width) - x0), h = Math.max(1, Math.min(y1, img.height) - y0);
  const o = new PNG({ width: w, height: h });
  PNG.bitblt(img, o, x0, y0, w, h, 0, 0);
  return o;
}
