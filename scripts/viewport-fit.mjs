// Inline styles a script set, read at many screen sizes (capture), turned into what the clone may carry:
// - a value that is the same at every size stays as it is;
// - a value that is a function of the viewport (a·width + b·height + c, in px) becomes that function as a CSS calc(),
//   for all sizes when one function fits them all, or per range of the site's own breakpoints;
// - a value that fits no such function (it depends on content, time, a container, randomness) is NOT carried: the
//   clone's script must compute it, the way the site does. It is listed as script-owned.
// Nothing here is ever exact at the captured sizes only: that is the point.

const MODELS = [
  { name: 'c', cols: () => [1] },
  { name: 'w', cols: (w) => [w] },
  { name: 'h', cols: (w, h) => [h] },
  { name: 'w+c', cols: (w) => [w, 1] },
  { name: 'h+c', cols: (w, h) => [h, 1] },
  { name: 'w+h', cols: (w, h) => [w, h] },
  { name: 'w+h+c', cols: (w, h) => [w, h, 1] },
];

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-9) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

// points: [{ w, h, v }] -> { model, coef } or null. A model needs one point more than it has parameters, so every fit
// is checked on a point it was not determined by.
export function fitPoints(points, shaped = true) {
  for (const m of MODELS) {
    const k = m.cols(1, 1).length;
    if (points.length < k + 1) continue;
    const X = points.map((p) => m.cols(p.w, p.h));
    const A = Array.from({ length: k }, () => new Array(k).fill(0));
    const b = new Array(k).fill(0);
    points.forEach((p, i) => { for (let r = 0; r < k; r++) { b[r] += X[i][r] * p.v; for (let c = 0; c < k; c++) A[r][c] += X[i][r] * X[i][c]; } });
    const coef = solve(A, b);
    if (!coef) continue;
    const tol = Math.max(0.75, 0.003 * Math.max(...points.map((p) => Math.abs(p.v))));
    if (points.every((p, i) => Math.abs(X[i].reduce((s, x, j) => s + x * coef[j], 0) - p.v) <= tol)) return { model: m.name, coef };
  }
  return shaped ? fitTwoLines(points) : null;
}

// The smaller or larger of two lines: min(L1, L2) / max(L1, L2), each L = a·w + b·h + c. This is what a script
// computes for "cover" (max(100vw, 177.8vh)), "contain", a cover image centred (min((w - 1.778·h) / 2, 0)), a tile
// of it, a size clamped at a limit. Which line applies switches at an aspect ratio, a width or a height: the points
// are split on each of those in turn, each side must fit one line on its own (checked as usual), and then every point
// must be the min (or max) of both lines. Eight points at least, so two short lines never fit noise.
function fitTwoLines(points) {
  if (points.length < 8) return null;
  const tol = Math.max(0.75, 0.003 * Math.max(...points.map((p) => Math.abs(p.v))));
  for (const key of [(p) => p.w / p.h, (p) => p.w, (p) => p.h]) {
    const sorted = [...points].sort((p, q) => key(p) - key(q));
    for (let s = 2; s <= sorted.length - 2; s++) {
      if (key(sorted[s - 1]) === key(sorted[s])) continue;
      const lo = fitPoints(sorted.slice(0, s), false), hi = lo && fitPoints(sorted.slice(s), false);
      if (!lo || !hi) continue;
      for (const model of ['min', 'max']) {
        const f = model === 'min' ? Math.min : Math.max;
        if (points.every((p) => Math.abs(f(lineAt(lo, p.w, p.h), lineAt(hi, p.w, p.h)) - p.v) <= tol)) return { model, lines: [lo, hi] };
      }
    }
  }
  return null;
}
const lineAt = ({ model, coef }, w, h) => {
  let i = 0, v = 0;
  for (const t of model.split('+')) v += coef[i++] * (t === 'w' ? w : t === 'h' ? h : 1);
  return v;
};

const r4 = (x) => +x.toFixed(4);
// a fitted px value as CSS: width terms use --tc-vw (1% of the layout width, scrollbar excluded, set by the seed)
export function cssOf({ model, coef, lines }) {
  if (lines) return `${model}(${lines.map((l) => cssOf(l).replace(/^calc\((.*)\)$/, '$1')).join(', ')})`;
  const parts = model.split('+');
  let a = 0, b = 0, c = 0;
  parts.forEach((p, i) => { if (p === 'w') a = coef[i]; else if (p === 'h') b = coef[i]; else c = coef[i]; });
  const terms = [];
  if (Math.abs(a) > 1e-6) terms.push([a * 100, (x) => `${r4(Math.abs(x))} * var(--tc-vw, 1vw)`]);
  if (Math.abs(b) > 1e-6) terms.push([b * 100, (x) => `${r4(Math.abs(x))}vh`]);
  if (Math.abs(c) > 0.005 || !terms.length) terms.push([c, (x) => `${+Math.abs(x).toFixed(2)}px`]);
  if (terms.length === 1 && model === 'c') return `${+c.toFixed(2)}px`;
  return `calc(${terms.map(([x, f], i) => `${i === 0 ? (x < 0 ? '-1 * ' : '') : x < 0 ? '- ' : '+ '}${f(x)}`).join(' ')})`;
}

const PX = /-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?px/gi; // 5.68434e-14px is a number too (a script's float noise)
// one spelling per meaning, so a library that writes translate3d(0px, 0px, 0px) at one size and translate(0px, 0px)
// at another is not mistaken for a value that changes
const normalise = (v) => v
  .replace(/translate3d\(\s*([^,()]+),\s*([^,()]+),\s*0(?:px)?\s*\)/g, 'translate($1, $2)')
  .replace(/translateX\(\s*([^,()]+)\)/g, 'translate($1, 0px)')
  .replace(/translateY\(\s*([^,()]+)\)/g, 'translate(0px, $1)')
  .replace(/translate\(\s*([^,()]+)\)/g, 'translate($1, 0px)')
  .replace(/(^|[\s(,])0(?=[\s),]|$)/g, '$10px');
const parseDecls = (text) => {
  const map = new Map();
  for (const d of String(text || '').split(/;(?![^(]*\))/)) {
    const i = d.indexOf(':');
    if (i < 0) continue;
    const k = d.slice(0, i).trim(), v = d.slice(i + 1).trim().replace(/\s*!important$/i, '');
    if (k) map.set(k, /transform|translate/.test(k) ? normalise(v) : v);
  }
  return map;
};

// values: [{ w, h, v: string }] -> CSS value string, or null when no viewport function fits
function fitValue(values) {
  const tmpl = values[0].v.replace(PX, '§');
  if (values.some((x) => x.v.replace(PX, '§') !== tmpl)) return null; // keywords or unitless numbers change: not a function of size
  if (values.every((x) => x.v === values[0].v)) return values[0].v;
  const nums = values.map((x) => (x.v.match(PX) || []).map(parseFloat));
  const out = [];
  for (let t = 0; t < nums[0].length; t++) {
    const fit = fitPoints(values.map((x, i) => ({ w: x.w, h: x.h, v: nums[i][t] })));
    if (!fit) return null;
    out.push(cssOf(fit));
  }
  let k = 0;
  return tmpl.replace(/§/g, () => out[k++]);
}

// data: inline-styles.json ({ breakpoints, sizes, styles: { "WxH": { w, h, styles: { path: [style, class] } } } }), or
// the 0.3 shape ({ desktop: { path: style }, ... }). Returns, per element path: the declarations to set inline, the
// per-range rules, and the properties left to the clone's script.
export function planInlineStyles(data, viewports) {
  let breakpoints = [], sizes = [];
  if (data?.styles) {
    breakpoints = data.breakpoints || [];
    sizes = Object.values(data.styles).map((s) => ({ w: s.w, h: s.h, styles: Object.fromEntries(Object.entries(s.styles).map(([p, v]) => [p, Array.isArray(v) ? v[0] : v])) }));
  } else if (data) {
    sizes = Object.entries(data).map(([name, styles]) => { const vp = viewports.find((v) => v.name === name); return vp ? { w: vp.width, h: vp.height, styles } : null; }).filter(Boolean);
  }
  const edges = [0, ...breakpoints, 100000];
  const ranges = edges.slice(0, -1).map((lo, i) => ({ lo: i === 0 ? 0 : lo + 1, hi: edges[i + 1] }));
  const mediaOf = (r) => (r.lo === 0 ? `(max-width: ${r.hi}px)` : r.hi >= 100000 ? `(min-width: ${r.lo}px)` : `(min-width: ${r.lo}px) and (max-width: ${r.hi}px)`);
  const plan = {};
  const owned = [];
  let fitted = 0, constant = 0;
  const paths = new Set(sizes.flatMap((s) => Object.keys(s.styles)));
  for (const p of paths) {
    const per = sizes.map((s) => ({ w: s.w, h: s.h, d: parseDecls(s.styles[p]) }));
    const props = new Set(per.flatMap((x) => [...x.d.keys()]));
    const entry = { inline: {}, rules: [], dropped: [] };
    for (const k of props) {
      const vals = per.map((x) => ({ w: x.w, h: x.h, v: x.d.get(k) }));
      if (vals.every((x) => x.v !== undefined && x.v === vals[0].v)) { constant++; continue; } // same everywhere: as captured
      // one function for every size
      if (vals.every((x) => x.v !== undefined)) {
        const css = fitValue(vals);
        if (css !== null) { entry.inline[k] = css; fitted++; continue; }
      }
      // per range of the site's breakpoints. Neighbouring ranges one function fits are one group (fewer rules, more
      // points behind each fit); a range no captured size fell in joins its neighbour rather than losing the value.
      const joins = (a, b) => {
        if (!a.length || !b.length) return true;
        const all = [...a, ...b];
        const unset = all.filter((x) => x.v === undefined).length;
        return unset === all.length || (!unset && fitValue(all) !== null);
      };
      const groups = [];
      for (const r of ranges.length > 1 ? ranges : []) {
        const inR = vals.filter((x) => x.w >= r.lo && x.w <= r.hi);
        const last = groups[groups.length - 1];
        if (last && joins(last.pts, inR)) { last.hi = r.hi; last.pts.push(...inR); } else groups.push({ lo: r.lo, hi: r.hi, pts: [...inR] });
      }
      let anyDrop = !groups.length;
      const rules = [];
      for (const g of groups) {
        if (g.pts.every((x) => x.v === undefined)) continue; // the script doesn't set it at these sizes
        // a fit needs a point it was not determined by; a group with unset and set sizes is not a function of size
        if (g.pts.length < 2 || g.pts.some((x) => x.v === undefined)) { anyDrop = true; continue; }
        const css = fitValue(g.pts);
        if (css === null) { anyDrop = true; continue; }
        rules.push({ media: mediaOf(g), prop: k, value: css });
      }
      // all or nothing: a property the clone's script must compute at some sizes is the script's at every size
      // (half carried by the seed, half computed, the two would fight at the edges)
      const anyRule = !anyDrop && rules.length > 0;
      if (anyRule) entry.rules.push(...rules);
      entry.inline[k] = null; // the captured constant no longer applies
      if (anyRule) fitted++;
      if (anyDrop || !anyRule) { entry.dropped.push(k); owned.push({ path: p, prop: k, samples: vals.slice(0, 5).map((x) => `${x.w}x${x.h}: ${x.v ?? '(unset)'}`) }); }
    }
    if (Object.keys(entry.inline).length || entry.rules.length || entry.dropped.length) plan[p] = entry;
  }
  return { plan, owned, fitted, constant, breakpoints, sizes: sizes.length };
}
