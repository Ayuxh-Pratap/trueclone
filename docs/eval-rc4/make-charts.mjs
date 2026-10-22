// Builds the RC4 accuracy-over-time charts from the measured series (projects/<run>.series.json).
// x = active hours since the run's start: wall time minus the gaps with no agent activity (host pause / overnight),
// cut out and marked. Every dot is a value the tool printed or a file recorded; the step line holds the last measured
// value until the next one (no interpolation, no estimates). Output: charts/*.svg (self-contained, light + dark) and
// charts.html (the same charts with hover titles and a table per chart).
// usage: node make-charts.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'charts');
fs.mkdirSync(OUT, { recursive: true });
const series = (run) => JSON.parse(fs.readFileSync(path.join(here, 'projects', `${run}.series.json`), 'utf8'));
const T = (s) => Date.parse(s);

// run starts and gaps (UTC), from the Codex session timelines (docs/eval-rc4/data, projects/*.md section 5)
const RUNS = {
  astro: { start: '2026-10-20T21:17:32Z', end: '2026-10-20T22:38:59Z', gaps: [] },
  bhaskar: { start: '2026-10-20T20:59:55Z', end: '2026-10-20T23:24:35Z', gaps: [] },
  varsity: { start: '2026-10-20T21:08:31Z', end: '2026-10-21T08:36:37Z', gaps: [['2026-10-21T00:27:25Z', '2026-10-21T04:04:34Z']] },
  allbirds: { start: '2026-10-20T21:30:47Z', end: '2026-10-21T07:37:10Z', gaps: [['2026-10-21T00:27:22Z', '2026-10-21T04:04:41Z']] },
  zero: { start: '2026-10-20T20:47:09Z', end: '2026-10-22T04:59:40Z', gaps: [['2026-10-21T00:27:22Z', '2026-10-21T04:07:17Z'], ['2026-10-21T20:50:51Z', '2026-10-22T04:40:56Z']] },
};
const activeH = (run, t) => {
  const r = RUNS[run];
  let ms = T(t) - T(r.start);
  for (const [a, b] of r.gaps) { if (T(t) >= T(b)) ms -= T(b) - T(a); else if (T(t) > T(a)) ms -= T(t) - T(a); }
  return ms / 3600000;
};
const gapMarks = (run) => RUNS[run].gaps.map(([a, b]) => ({ x: activeH(run, a), label: `${((T(b) - T(a)) / 3600000).toFixed(1)} h idle cut` }));

// palette: reference categorical slots (light / dark), fixed order, validated adjacent-pairs
const SLOTS = [['#2a78d6', '#3987e5'], ['#eb6834', '#d95926'], ['#1baf7a', '#199e70'], ['#eda100', '#c98500'], ['#e87ba4', '#d55181']];
const STYLE = (n) => `
  .s{font:12px system-ui,-apple-system,Segoe UI,sans-serif}
  .bg{fill:#fcfcfb}.t1{fill:#0b0b0b}.t2{fill:#52514e}.t3{fill:#8a8984}
  .grid{stroke:#e6e5e1;stroke-width:1}.axis{stroke:#bdbcb6;stroke-width:1}.ref{stroke:#52514e;stroke-width:1;stroke-dasharray:4 4}
  .gap{stroke:#8a8984;stroke-width:1;stroke-dasharray:2 3}.shade{fill:#8a8984;opacity:.08}
  ${SLOTS.slice(0, n).map(([l], i) => `.c${i}{stroke:${l};fill:${l}}`).join('')}
  @media (prefers-color-scheme: dark){.bg{fill:#1a1a19}.t1{fill:#f0efec}.t2{fill:#c3c2b7}.t3{fill:#8f8e88}.grid{stroke:#2c2c2a}.axis{stroke:#4a4a46}.ref{stroke:#c3c2b7}.gap{stroke:#8f8e88}
  ${SLOTS.slice(0, n).map(([, d], i) => `.c${i}{stroke:${d};fill:${d}}`).join('')}}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// one chart: lines = [{ name, points: [{x, y, t, source}] }], one y axis
function chart(opts) {
  const { id, title, subtitle, yLabel, lines, yMin, yMax, refs = [], marks = [], shade = null, xMax, notes = [] } = opts;
  const W = 760, H = opts.H || 330, L = 56, R = 190, Tp = opts.small ? 34 : 58, B = opts.small && !opts.axisTitle ? 34 : 46;
  const pw = W - L - R, ph = H - Tp - B;
  const X = (x) => L + (x / xMax) * pw;
  const Y = (y) => Tp + ph - ((y - yMin) / (yMax - yMin)) * ph;
  const yTicks = [];
  const step = (yMax - yMin) / (opts.small ? 2 : 5);
  for (let v = yMin; v <= yMax + 1e-9; v += step) yTicks.push(+v.toFixed(2));
  const xStep = xMax > 16 ? 4 : xMax > 6 ? 2 : xMax > 3 ? 0.5 : 0.25;
  const xTicks = [];
  for (let v = 0; v <= xMax + 1e-9; v += xStep) xTicks.push(+v.toFixed(2));
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="s" role="img" aria-labelledby="${id}-t ${id}-d"><title id="${id}-t">${esc(title)}</title><desc id="${id}-d">${esc(subtitle)}</desc><style>${STYLE(lines.length)}</style>`;
  s += `<rect class="bg" width="${W}" height="${H}" rx="8"/>`;
  s += `<text class="t1" x="${L}" y="24" font-size="15" font-weight="600">${esc(title)}</text>${opts.small ? '' : `<text class="t2" x="${L}" y="42">${esc(subtitle)}</text>`}`;
  if (shade) s += `<rect class="shade" x="${X(shade[0])}" y="${Tp}" width="${X(shade[1]) - X(shade[0])}" height="${ph}"/><text class="t3" x="${X(shade[0]) + 4}" y="${Tp + 12}">${esc(shade[2])}</text>`;
  for (const v of yTicks) s += `<line class="grid" x1="${L}" x2="${L + pw}" y1="${Y(v)}" y2="${Y(v)}"/><text class="t2" x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
  for (const v of xTicks) s += `<text class="t2" x="${X(v)}" y="${Tp + ph + 18}" text-anchor="middle">${v}</text>`;
  s += `<line class="axis" x1="${L}" x2="${L + pw}" y1="${Tp + ph}" y2="${Tp + ph}"/>`;
  if (!opts.small || opts.axisTitle) s += `<text class="t2" x="${L + pw / 2}" y="${H - 8}" text-anchor="middle">active hours since start (idle gaps cut)</text>`;
  s += `<text class="t2" transform="translate(16 ${Tp + ph / 2}) rotate(-90)" text-anchor="middle">${esc(yLabel)}</text>`;
  for (const r of refs) s += `<line class="ref" x1="${L}" x2="${L + pw}" y1="${Y(r.y)}" y2="${Y(r.y)}"/><text class="t2" x="${L + 6}" y="${Y(r.y) - 5}">${esc(r.label)}</text>`;
  for (const m of marks) s += `<line class="gap" x1="${X(m.x)}" x2="${X(m.x)}" y1="${Tp}" y2="${Tp + ph}"/><text class="t3" x="${X(m.x) + 3}" y="${Tp + ph - 6}" font-size="11">${esc(m.label)}</text>`;
  const labelYs = [];
  lines.forEach((ln, i) => {
    const pts = ln.points.filter((p) => p.x <= xMax + 1e-9).sort((a, b) => a.x - b.x);
    if (!pts.length) return;
    let d = `M${X(pts[0].x)},${Y(pts[0].y)}`;
    for (let k = 1; k < pts.length; k++) d += `H${X(pts[k].x)}V${Y(pts[k].y)}`;
    s += `<path d="${d}" class="c${i}" fill="none" stroke-width="2" style="fill:none" stroke-linejoin="round"/>`;
    for (const p of pts) s += `<circle class="c${i}" cx="${X(p.x)}" cy="${Y(p.y)}" r="3.2" stroke="none"><title>${esc(`${ln.name}: ${p.y} at ${p.x.toFixed(2)} h active (${p.t})`)}</title></circle>`;
    const last = pts[pts.length - 1];
    let ly = Y(last.y) + 4;
    while (labelYs.some((v) => Math.abs(v - ly) < 14)) ly += 14;
    labelYs.push(ly);
    s += `<circle class="c${i}" cx="${L + pw + 10}" cy="${ly - 4}" r="4" stroke="none"/><text class="t1" x="${L + pw + 18}" y="${ly}">${esc(ln.name)} ${last.y}</text>`;
  });
  notes.forEach((n, k) => { s += `<text class="t3" x="${L}" y="${Tp - 4 + 0 * k}" font-size="11"></text>`; });
  s += '</svg>';
  fs.writeFileSync(path.join(OUT, `${id}.svg`), s);
  const table = `<table><thead><tr><th>series</th><th>active h</th><th>UTC</th><th>value</th><th>source</th></tr></thead><tbody>${lines.flatMap((ln) => ln.points.map((p) => `<tr><td>${esc(ln.name)}</td><td>${p.x.toFixed(2)}</td><td>${esc(p.t)}</td><td>${p.y}</td><td>${esc(String(p.source || '').slice(0, 120))}</td></tr>`)).join('')}</tbody></table>`;
  return { id, title, svg: s, table, notes };
}

const pts = (run, metric, f = (v) => v) => series(run).filter((p) => p.metric === metric && p.kind === 'measured').map((p) => ({ x: activeH(run, p.t), y: f(p.value), t: p.t, source: p.source }));
const endH = (run) => activeH(run, RUNS[run].end);

const charts = [];
// 1. cross-project: the framework's own verdict, checks below target, after every REPORT.md write
for (const [k, r] of ['astro', 'bhaskar', 'varsity', 'allbirds', 'zero'].entries()) charts.push(chart({
  id: `all-${r}`, small: true, H: k === 4 ? 162 : 150, axisTitle: k === 4, title: `${r}: checks below target`,
  subtitle: 'REPORT.md verdict after every score/report', yLabel: 'below target', yMin: 0, yMax: 12, xMax: 21, marks: gapMarks(r).map((m) => ({ ...m, label: '' })),
  lines: [{ name: r, points: pts(r, 'checks_below_target') }],
}));
// 2. zero: journey means
charts.push(chart({
  id: 'zero-journey', title: 'zero: journey match over time (template, canvas app)',
  subtitle: 'journey mean per score (template: canvas histogram); never reached 95; plateau from 13:58Z',
  yLabel: 'journey mean %', yMin: 60, yMax: 100, xMax: Math.ceil(endH('zero')),
  refs: [{ y: 95, label: 'target 95' }], marks: gapMarks('zero'),
  shade: [activeH('zero', '2026-10-21T13:58:00Z'), endH('zero'), 'plateau'],
  lines: [{ name: 'desktop', points: pts('zero', 'journey_desktop') }, { name: 'mobile', points: pts('zero', 'journey_mobile') }],
}));
// 3. varsity: the two productive loops (cords -> scroll states; boot fix -> load)
charts.push(chart({
  id: 'varsity-quality', title: 'varsity: desktop scroll states and load over time',
  subtitle: 'cord port lifted scroll states, boot fix lifted load; all HTML gates met at 05:40:59Z',
  yLabel: '% match', yMin: 60, yMax: 100, xMax: Math.ceil(endH('varsity')),
  refs: [{ y: 95, label: 'target 95' }], marks: gapMarks('varsity'),
  shade: [activeH('varsity', '2026-10-21T05:40:59Z'), endH('varsity'), 'after all HTML gates'],
  lines: [{ name: 'scroll desktop', points: pts('varsity', 'states_mean_desktop') }, { name: 'load desktop', points: pts('varsity', 'load_desktop') }],
}));
// 4. allbirds: the reference-profile race (desktop states) and the mobile oscillation
charts.push(chart({
  id: 'allbirds-quality', title: 'allbirds: scroll states (desktop, mobile) and load (wide) over time',
  subtitle: 'desktop 14-24% = the --hide race on the reference; mobile oscillated; load wide never a step',
  yLabel: '% match', yMin: 0, yMax: 100, xMax: Math.ceil(endH('allbirds')),
  refs: [{ y: 95, label: 'target 95' }], marks: gapMarks('allbirds'),
  lines: [{ name: 'scroll desktop', points: pts('allbirds', 'scroll_desktop') }, { name: 'scroll mobile', points: pts('allbirds', 'scroll_mobile') }, { name: 'load wide', points: pts('allbirds', 'load_wide') }],
}));
// 5. bhaskar: the route that stopped the run
charts.push(chart({
  id: 'bhaskar-route', title: 'bhaskar: /playground route value and an unstable interaction over time',
  subtitle: 'route step value vs its bar 95.57 (desktop self-match - 1, applied at every size)',
  yLabel: '% match', yMin: 75, yMax: 100, xMax: 2.5,
  refs: [{ y: 95.57, label: 'bar 95.57' }],
  lines: [{ name: '/playground step', points: pts('bhaskar', 'route_playground_status_value') }, { name: 'go to /about (mobile)', points: pts('bhaskar', 'interact_about_mobile') }],
}));
// 6. astro: the control
charts.push(chart({
  id: 'astro-checks', title: 'astro: checks below target and failing interactions over time',
  subtitle: 'control site: two by-eye fixes, 6 tool-broken scenarios rewritten, exit 0 at 1.31 h',
  yLabel: 'count', yMin: 0, yMax: 8, xMax: 1.5,
  lines: [{ name: 'checks below target', points: pts('astro', 'checks_below_target') }, { name: 'interactions failing', points: pts('astro', 'interactions_failing') }],
}));

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RC4 Accuracy Over Time</title>
<style>
:root{--bg:#fcfcfb;--fg:#0b0b0b;--fg2:#52514e;--line:#e6e5e1}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#1a1a19;--fg:#f0efec;--fg2:#c3c2b7;--line:#2c2c2a}}
:root[data-theme="dark"]{--bg:#1a1a19;--fg:#f0efec;--fg2:#c3c2b7;--line:#2c2c2a}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:820px;margin:0 auto;padding:24px 16px 64px}h1{font-size:22px;margin:0 0 4px}p{color:var(--fg2)}
figure{margin:28px 0}svg{width:100%;height:auto;display:block}details{margin-top:6px;color:var(--fg2)}
table{border-collapse:collapse;font-size:12px;width:100%;display:block;overflow-x:auto}td,th{border-bottom:1px solid var(--line);padding:3px 6px;text-align:left;white-space:nowrap}
</style></head><body><main>
<h1>RC4 accuracy over time</h1>
<p>The first five strips share one x scale (0-21 active hours) so the runs compare; spikes are stale checks counted after partial scores, not regressions. Every dot is a value trueclone printed or a file recorded during the run (no estimates). The step line holds the last measured value until the next measurement. x = active hours: wall time minus the gaps with no agent activity, cut and marked. Hover a dot for its time; each chart's data is in the table under it.</p>
${charts.map((c) => `<figure>${c.svg}<details><summary>Data (${c.title})</summary>${c.table}</details></figure>`).join('\n')}
</main></body></html>`;
fs.writeFileSync(path.join(here, 'charts.html'), html);
console.log(`${charts.length} charts -> ${OUT} and charts.html`);
for (const r of Object.keys(RUNS)) console.log(r, 'active h', endH(r).toFixed(2), 'wall h', ((T(RUNS[r].end) - T(RUNS[r].start)) / 3600000).toFixed(2));
