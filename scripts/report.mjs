// REPORT.md for a clone: every score against its target, the weakest spots, and what was not (or cannot be)
// copied. Reads the latest score files under sites/<name>/compare and the capture under sites/<name>/reference;
// `trueclone score` writes it at the end of every run.
//
// usage: node scripts/report.mjs <name>
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from './lib.mjs';

const { pos } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: trueclone report <name>');
  process.exit(1);
}
const root = path.resolve('sites', name);
const read = (rel) => fs.readFile(path.join(root, rel), 'utf8').then(JSON.parse, () => null);
const meta = await read('reference/meta.json');
if (!meta) {
  console.error(`no capture for ${name}: run trueclone capture <url> ${name} first`);
  process.exit(1);
}

// Targets a clone has to meet (the same ones the skill gives the agent).
const T = { layout: 98, statesGap: 5, motion: 95, detail: 95, hovers: 90, load: 95 };
const mark = (ok) => (ok === null ? '–' : ok ? 'pass' : '**below target**');
const pct = (v) => (v === undefined || v === null ? '–' : `${v}%`);
const VPS = ['desktop', 'tablet', 'mobile'];

const layout = await read('compare/report.mask.json');
const visual = await read('compare/report.json');
const states = await read('compare/states/report.mask.json');
const curves = Object.fromEntries(await Promise.all(VPS.map(async (v) => [v, await read(`compare/curves.${v}.json`)])));
const interact = await read('compare/interact/report.json');
const hovers = await read('compare/hovers.desktop.json');
const detail = await read('compare/detail.json');
const load = await read('compare/load.json');
const motionInv = await read('reference/motion.desktop.json');

const byVp = (rep, key = 'match') => Object.fromEntries((rep?.viewports || []).map((v) => [v.viewport, v[key] ?? v.score]));
const L = byVp(layout), V = byVp(visual), S = byVp(states), D = byVp(detail, 'score');
const C = Object.fromEntries(VPS.map((v) => [v, curves[v]?.score]));

const rows = [];
const row = (check, values, ok, note = '') => rows.push(`| ${check} | ${VPS.map((v) => pct(values[v])).join(' | ')} | ${mark(ok)} | ${note} |`);
const present = (vals) => VPS.filter((v) => vals[v] !== undefined && vals[v] !== null);
const all = (vals, test) => (present(vals).length ? present(vals).every((v) => test(vals[v], v)) : null);
row(`Layout (structure)`, L, all(L, (x) => x >= T.layout), `target ≥ ${T.layout}%; text and media masked`);
if (meta.mode === 'exact') row('Layout (real pixels)', V, all(V, (x) => x >= T.layout), 'exact mode: same text and media');
row('Scroll states', S, all(S, (x, v) => L[v] === undefined || x >= L[v] - T.statesGap), `within ${T.statesGap} points of layout`);
row('Motion curves', C, all(C, (x) => x >= T.motion), present(C).length ? `target ≥ ${T.motion}%` : 'no motion map (no scroll or time animation to score)');
row('Detail (styles)', D, all(D, (x) => x >= T.detail), `target ≥ ${T.detail}%; font, size, weight, line height, colour, boxes`);
row('Hovers', { desktop: hovers?.score }, hovers ? hovers.score >= T.hovers : null, `target ≥ ${T.hovers}% of the reference hover effects`);
const LD = byVp(load, 'score');
const tts = (side) => VPS.map((v) => load?.viewports.find((x) => x.viewport === v)?.[side]?.settledAt).filter((x) => x !== undefined);
row('Load sequence', LD, all(LD, (x) => x >= T.load), present(LD).length ? `target ≥ ${T.load}%; how settled each side is at 0.25 to 4 s, cold cache, same network (settled: reference ${tts('ref').map((x) => `${x}ms`).join('/') || '–'}, clone ${tts('clone').map((x) => `${x}ms`).join('/') || '–'})` : 'not measured (trueclone load <name>)');
const scenarios = interact?.scenarios || [];
const failed = scenarios.filter((s) => s.expect && !s.expect.pass);
row('Interactions', { desktop: scenarios.length ? +(scenarios.reduce((n, s) => n + (s.score || 0), 0) / scenarios.length).toFixed(2) : undefined }, scenarios.length ? failed.length === 0 : null,
  scenarios.length ? `${scenarios.length - failed.length}/${scenarios.length} scenarios change something on both sides` : 'no interactions.json');

const failing = rows.filter((r) => r.includes('below target')).length;
const verdict = failing ? `${failing} check(s) below target` : 'every scored check meets its target';

// Weakest spots, to fix first.
const weak = [];
for (const v of VPS) for (const s of (layout?.viewports.find((x) => x.viewport === v)?.worstSections || []).slice(0, 2)) if (s.match < 99) weak.push(`- Layout ${v}: section "${String(s.label).slice(0, 50)}" at y ${s.y} is ${s.match}%`);
for (const v of VPS) for (const e of (curves[v]?.entries || []).filter((x) => x.score < 90).slice(0, 3)) weak.push(`- Motion ${v}: "${e.name}" ${e.score}%${e.note ? ` (${e.note})` : ''}`);
for (const s of failed) weak.push(`- Interaction "${s.name}": the expected change happened on ${s.expect.ref ? 'the reference' : 'neither side'}${s.expect.clone ? '' : ', not on the clone'}`);
for (const v of (load?.viewports || []).filter((x) => x.score < T.load)) {
  const worst = Object.entries(v.gap || {}).sort((a, b) => b[1] - a[1])[0];
  if (worst) weak.push(`- Load ${v.viewport}: at ${worst[0]}ms the clone is ${v.clone.curve[worst[0]]}% settled, the reference ${v.ref.curve[worst[0]]}% (settled at ${v.clone.settledAt ?? '>4000'}ms vs ${v.ref.settledAt ?? '>4000'}ms)`);
}
for (const v of detail?.viewports || []) {
  const groups = new Map();
  for (const it of v.issues || []) { const k = it.props[0].split(' ').slice(0, 1)[0]; groups.set(k, (groups.get(k) || 0) + 1); }
  const top = [...groups].sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (top.length) weak.push(`- Detail ${v.viewport}: ${top.map(([k, n]) => `${n}× ${k === 'no' ? 'missing element' : k}`).join(', ')}`);
}

// What the clone does not copy: server-side behaviour, tracking, and the original's data/API calls.
let calls = [];
try {
  const har = JSON.parse(await fs.readFile(path.join(root, 'reference', 'desktop.har'), 'utf8'));
  calls = har.log.entries.filter((e) => ['xhr', 'fetch'].includes(e._resourceType)).map((e) => ({ method: e.request.method, url: e.request.url, status: e.response.status, type: e.response.content.mimeType || '' }));
} catch { /* no HAR */ }
const TRACKING = /google-analytics|googletagmanager|doubleclick|facebook\.(com|net)|hotjar|segment\.(io|com)|plausible|cloudflareinsights|clarity\.ms|sentry|datadog|mixpanel|amplitude|posthog|intercom|hubspot|linkedin\.com\/px|tiktok|challenges\.cloudflare|cdn-cgi\/rum|recaptcha|hcaptcha|turnstile/i;
const tracking = calls.filter((c) => TRACKING.test(c.url));
const data = calls.filter((c) => !TRACKING.test(c.url));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
const uniq = (list) => [...new Map(list.map((c) => [`${c.method} ${c.url.split('?')[0]}`, c])).values()];

const libs = motionInv ? Object.entries(motionInv.libs || {}).filter(([, v]) => v).map(([k]) => k) : [];
const md = `# trueclone report: ${name}

| | |
|---|---|
| Reference | ${meta.url} |
| Mode | ${meta.mode === 'exact' ? `exact (the site's own text and media). Permission: ${meta.permission}` : 'template (structure, motion and behaviour; placeholder text and media)'} |
| Captured | ${meta.capturedAt} |
| Scored | ${layout?.at || '–'}${layout?.clone && !/127\.0\.0\.1:\d+\/$/.test(layout.clone) ? ` against ${layout.clone}` : ''} |
| Verdict | **${verdict}** |

## Scores

| Check | Desktop | Tablet | Mobile | Status | Notes |
|---|---|---|---|---|---|
${rows.join('\n')}

${weak.length ? `## Fix first\n\n${weak.join('\n')}\n` : '## Fix first\n\nNothing below 99% on layout, 90% on motion or failing.\n'}
## Motion found on the reference

${motionInv ? `Libraries: ${libs.length ? libs.join(', ') : 'none (no GSAP, Lenis, Swiper or similar)'}. ScrollTriggers: ${motionInv.triggers?.length ?? 0}. Tweens created while scrolling: ${motionInv.onScroll?.length ?? 0}. CSS animations: ${(motionInv.css || []).length}.` : 'Not inventoried yet (trueclone motion <name>).'}

## Not copied

- **Server-side behaviour** is never visible from the outside: databases, accounts, payments, search indexes. The clone reproduces the client.
- **Tracking, analytics and bot protection** are left out on purpose${tracking.length ? `: ${[...new Set(tracking.map((c) => { try { const u = new URL(c.url); return `${u.host}${u.pathname.split('/').slice(0, 3).join('/')}`; } catch { return host(c.url); } }))].join(', ')}` : ''}.
${data.length ? `- **Data and API calls** the reference makes (${uniq(data).length}), which the clone does not call; their captured responses are in reference/desktop.har:\n${uniq(data).slice(0, 15).map((c) => `  - \`${c.method} ${c.url.split('?')[0].slice(0, 110)}\` → ${c.status} ${c.type.split(';')[0]}`).join('\n')}` : '- **Data and API calls**: none seen during the capture (static content).'}
`;
await fs.writeFile(path.join(root, 'REPORT.md'), md);
console.log(`${verdict} -> ${path.relative(process.cwd(), path.join(root, 'REPORT.md'))}`);
