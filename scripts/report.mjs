// REPORT.md for a clone: every score against its target, the weakest spots, and what was not (or cannot be)
// copied. Reads the latest score files under sites/<name>/compare and the capture under sites/<name>/reference;
// `trueclone score` writes it at the end of every run.
//
// usage: node scripts/report.mjs <name>
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, COMPARE, REPORT_FILE, siteDir } from './lib.mjs';

const { pos } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: trueclone report <name>');
  process.exit(1);
}
const root = siteDir(name);
const read = (rel) => fs.readFile(path.join(root, rel), 'utf8').then(JSON.parse, () => null);
const meta = await read('reference/meta.json');
if (!meta) {
  console.error(`no capture for ${name}: run trueclone capture <url> ${name} first`);
  process.exit(1);
}

// Targets a clone has to meet (the same ones the skill gives the agent).
const T = { layout: 98, states: 95, canvas: 90, motion: 95, detail: 95, hovers: 90, load: 95, journey: 95 };
// a canvas app's journey (journey.mjs): every checkpoint must reach this too, whatever the mean
const JOURNEY_FLOOR = 80;
// an accepted difference never covers a value below this, and needs evidence (a file it names that exists)
const ACCEPT_FLOOR = 95;
// the scroll-states gate on the worst single frame, besides the mean
const FRAME_FLOOR = 80;
// the same for canvases, lower: a scene's frames vary more (time, physics, random seeds)
const CANVAS_FLOOR = 60;
const mark = (ok, acceptedNote) => (ok === null ? '–' : ok ? 'pass' : acceptedNote ? `accepted (${acceptedNote})` : '**below target**');
const pct = (v) => (v === undefined || v === null ? '–' : `${v}%`);
// the seed sizes, then the held-out sizes (captured and scored, never used to build the clone)
const VPS = ['desktop', 'tablet', 'mobile', 'laptop', 'wide'];
const HELD = new Set(['laptop', 'wide']);

const layout = await read(`${COMPARE}/report.mask.json`);
const visual = await read(`${COMPARE}/report.json`);
const states = await read(`${COMPARE}/states/report.mask.json`);
const curves = Object.fromEntries(await Promise.all(VPS.map(async (v) => [v, await read(`${COMPARE}/curves.${v}.json`)])));
const interact = await read(`${COMPARE}/interact/report.json`);
const hovers = await read(`${COMPARE}/hovers.desktop.json`);
const detail = await read(`${COMPARE}/detail.json`);
const load = await read(`${COMPARE}/load.json`);
const times = await read(`${COMPARE}/score-times.json`);
const drift = await read(`${COMPARE}/drift.json`);
const motionInv = await read('reference/motion.desktop.json');
// notes.md: the agent's "Accepted differences" and "Findings" come into the report; an accepted entry that names a
// check (and optionally a width) turns that check's "below target" into "accepted"
const notes = await fs.readFile(path.join(root, 'notes.md'), 'utf8').catch(() => '');
const notesSection = (title) => {
  const m = new RegExp(`^## ${title}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(notes);
  return m ? m[1].replace(/<!--[\s\S]*?-->/g, '').split('\n').map((l) => l.trim()).filter((l) => /^[-*]\s+\S/.test(l)).map((l) => l.replace(/^[-*]\s+/, '')) : [];
};
const accepted = notesSection('Accepted differences');
// review: the frames trueclone review wrote, and the verdict the agent gave each in notes.md
const reviewVerdicts = notesSection('Review');
const reviewFrames = [];
// the captured page's frames, and each other route's (compare/review/routes/<slug>/<size>, ids "about/03-section-2")
// and a canvas app's journey checkpoints (compare/review/journey-<size>, ids "journey/03-step-2")
for (const [dir, size] of [...['wide', 'laptop', 'desktop', 'tablet', 'mobile'].flatMap((s) => [[`compare/review/${s}`, s], ...(meta.routes || []).filter((r) => r.slug).map((r) => [`compare/review/routes/${r.slug}/${s}`, s])]), ...(meta.canvasApp ? ['desktop', 'mobile'].map((s) => [`compare/review/journey-${s}`, s]) : [])]) {
  const fr = await read(`${dir}/frames.json`);
  for (const x of fr?.frames || []) {
    // "<frame> <size> [<token>]: <verdict>": the token names the picture judged (review writes it per frame); a frame
    // shot again that looks different has a new token, and the old verdict no longer holds for it
    const at = new RegExp(`^${x.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} ${size}(?:\\s*\\[([a-z0-9]+)\\])?\\s*:`, 'i');
    const v = reviewVerdicts.find((l) => at.test(l));
    const token = v ? at.exec(v)[1] || null : null;
    reviewFrames.push({ size, id: x.id, pct: x.pct, token: x.token || null, verdict: v ? v.slice(v.indexOf(':', v.search(/\]|:/)) + 1).trim() : null, stale: Boolean(v && x.token && token !== x.token) });
  }
}
// A frame is closed when it is "same" (with the reason, below SAME_REASON pixel match), or "tool: <why>; evidence:
// <file>" with the file there and made to prove it (a crop, a measurement: not one of the site's stylesheets or
// scripts); "differs", frames without a verdict, and verdicts given to another picture of the frame are open.
const SAME_REASON = 85;
const evidenceOk = (v) => { const m = /evidence:\s*([^\s;,)]+)/i.exec(v); return Boolean(m && !/\.(css|m?js)$/i.test(m[1]) && fsSync.existsSync(path.resolve(root, m[1]))); };
const reviewClosed = (x) => Boolean(x.verdict) && !x.stale && ((/^same\b/i.test(x.verdict) && (x.pct === undefined || x.pct >= SAME_REASON || x.verdict.replace(/^same\b[\s:,-]*/i, '').length >= 12)) || (/^tool\b/i.test(x.verdict) && evidenceOk(x.verdict)));
const reviewOpen = reviewFrames.filter((x) => !reviewClosed(x));
// findings under any heading that says so ("## Findings", "## Progress / findings", "## Tool findings")
const findings = [...notes.matchAll(/^## [^\n]*finding[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/gim)]
  .flatMap((m) => m[1].replace(/<!--[\s\S]*?-->/g, '').split('\n').map((l) => l.trim()).filter((l) => /^[-*]\s+\S/.test(l)).map((l) => l.replace(/^[-*]\s+/, '')));
// an entry needs `evidence: <file>` naming a file in the site folder (a crop, a measurement): a reason without proof
// is a gap, not a decision
const hasEvidence = (a) => { const m = /evidence:\s*([^\s;,)]+)/i.exec(a); return Boolean(m && fsSync.existsSync(path.resolve(root, m[1]))); };
const acceptedFor = (check, vp) => accepted.filter((a) => hasEvidence(a) && new RegExp(`\\b${check}\\b`, 'i').test(a) && (!vp || new RegExp(`\\b${vp}\\b`, 'i').test(a) || !/\b(desktop|tablet|mobile|laptop|wide)\b/i.test(a)));
const unproven = accepted.filter((a) => !hasEvidence(a));

const byVp = (rep, key = 'match') => Object.fromEntries((rep?.viewports || []).map((v) => [v.viewport, v[key] ?? v.score]));
const L = byVp(layout), V = byVp(visual), S = byVp(states), D = byVp(detail, 'score');
const C = Object.fromEntries(VPS.map((v) => [v, curves[v]?.score]));

const rows = [];
// `test` is a per-width predicate (value, width) => boolean, or a ready boolean/null for single-value checks
// When each check was last measured, against when the clone last changed: a number measured before the change
// describes a clone that no longer exists, so it is shown as stale and cannot pass (score again).
const cloneChanged = (() => {
  let t = 0;
  // the app's sources, not what the running server writes into its build folder (.next/cache) or the verify token
  const walk = (d) => { for (const e of fsSync.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!['node_modules', '.next'].includes(e.name)) walk(p); } else if (e.name !== 'trueclone-app.txt') t = Math.max(t, fsSync.statSync(p).mtimeMs); } };
  try { walk(path.join(root, COMPARE === 'compare' ? 'clone' : 'next')); } catch { /* no clone */ }
  return t;
})();
const measuredAt = { layout: layout?.at, scroll: states?.at, canvases: states?.at, detail: detail?.at, hovers: hovers?.at, load: load?.at, interactions: interact?.at, motion: Object.values(curves).map((c) => c?.at).filter(Boolean).sort()[0] };
// a mean hides a broken frame (a 91% average with frames at 17%): every frame must reach FRAME_FLOOR too
const worstFrame = (v) => { const w = (states?.viewports || []).find((x) => x.viewport === v)?.worst || []; return w.length ? w.reduce((a, b) => (b.match < a.match ? b : a)) : null; };
const isStale = (key) => Boolean(measuredAt[key]) && Date.parse(measuredAt[key]) < cloneChanged - 1000;
const row = (check, values, test, note = '') => {
  const key0 = check.split(' ')[0].toLowerCase();
  if (isStale(key0)) note = `**stale: measured ${String(measuredAt[key0]).slice(0, 16).replace('T', ' ')}, before the clone's last change; score again** ${note}`;
  const ok = isStale(key0) ? false : typeof test === 'function' ? all(values, test) : test;
  // below target, but every failing width has an accepted entry in notes.md: the decision is recorded, not hidden
  const key = check.split(' ')[0].toLowerCase();
  const failing = typeof test === 'function' ? present(values).filter((v) => !test(values[v], v)) : ok === false ? present(values) : [];
  // never below the floor: an accepted difference explains the last few points, not a broken page
  const covered = failing.length && failing.every((v) => (typeof values[v] !== 'number' || values[v] >= ACCEPT_FLOOR) && !(key === 'scroll' && (worstFrame(v)?.match ?? 100) < FRAME_FLOOR) && acceptedFor(key, v).length);
  const stale = drift?.stale && ['detail', 'hovers', 'motion', 'load', 'interactions'].includes(key) ? ' **stale capture**' : '';
  rows.push(`| ${check} | ${VPS.map((v) => pct(values[v])).join(' | ')} | ${mark(ok, covered ? acceptedFor(key)[0].slice(0, 60) : null)}${stale} | ${note} |`);
  // the same verdict, machine-readable (verdict.json), for trueclone status
  if (ok !== null && ok !== undefined) checks.push({ check, key, pass: ok === true || Boolean(covered), accepted: Boolean(covered), stale: isStale(key0), failing: covered ? [] : failing.map((v) => ({ viewport: v, value: values[v] })) });
};
const checks = [];
const present = (vals) => VPS.filter((v) => vals[v] !== undefined && vals[v] !== null);
const all = (vals, test) => (present(vals).length ? present(vals).every((v) => test(vals[v], v)) : null);
row(`Layout (structure)`, L, (x) => x >= T.layout, `target ≥ ${T.layout}%; text and media masked`);
if (meta.mode === 'exact') row('Layout (real pixels)', V, (x) => x >= T.layout, 'exact mode: same text and media');
const frameNotes = VPS.map((v) => [v, worstFrame(v)]).filter(([, f]) => f && f.match < FRAME_FLOOR).map(([v, f]) => `${v} y ${f.y}: ${f.match}%`);
// A canvas app's states: the checkpoints of its journey, both sides through the same input (journey.mjs)
const journeyRep = await read(`${COMPARE}/journey/report.json`);
if (journeyRep) {
  const J = Object.fromEntries((journeyRep.viewports || []).map((v) => [v.viewport, v.match]));
  const worstCp = (v) => (journeyRep.viewports || []).find((x) => x.viewport === v)?.worst || null;
  const lows = VPS.map((v) => [v, worstCp(v)]).filter(([, w]) => w && w.match < JOURNEY_FLOOR).map(([v, w]) => `${v} ${w.name}: ${w.match}%`);
  row('Journey', J, (x, v) => x >= T.journey && !((worstCp(v)?.match ?? 100) < JOURNEY_FLOOR), `target ≥ ${T.journey}% and no checkpoint below ${JOURNEY_FLOOR}%: both sides through the same input (journey.json), ${journeyRep.mode === 'exact' ? 'by pixels and by what the canvas draws' : 'by what the canvas draws (template mode)'}${lows.length ? `; checkpoints below: ${lows.join(', ')}` : ''}`);
}
row('Scroll states', S, (x, v) => x >= T.states && !((worstFrame(v)?.match ?? 100) < FRAME_FLOOR), `target ≥ ${T.states}% and no frame below ${FRAME_FLOOR}%${frameNotes.length ? `; frames below: ${frameNotes.slice(0, 4).join(', ')}` : ''}`);
const CV = byVp(states, 'canvas');
// as for the scroll states, a mean hides a scene that is wrong at one point of the page (a 96% average with a frame at
// 38%): every canvas frame must reach CANVAS_FLOOR too
const worstCanvas = (v) => { const w = (states?.viewports || []).find((x) => x.viewport === v)?.canvasWorst || []; return w.length ? w.reduce((a, b) => (b.similarity < a.similarity ? b : a)) : null; };
const canvasNotes = VPS.map((v) => [v, worstCanvas(v)]).filter(([, f]) => f && f.similarity < CANVAS_FLOOR).map(([v, f]) => `${v} y ${f.y}: ${f.similarity}%`);
if (present(CV).length) row('Canvases', CV, (x, v) => x >= T.canvas && !((worstCanvas(v)?.similarity ?? 100) < CANVAS_FLOOR), `target ≥ ${T.canvas}% and no frame below ${CANVAS_FLOOR}%; what each scene draws, compared in the scroll-state frames (colours and coverage)${canvasNotes.length ? `; frames below: ${canvasNotes.slice(0, 4).join(', ')}` : ''}`);
// recorded scroll curves with no map to score them: not "nothing to score", but not measured yet
const recordedCurves = ((await read('reference/reveals.desktop.json'))?.scrubs || []).length;
row('Motion curves', C, (x) => x >= T.motion, present(C).length ? `target ≥ ${T.motion}%` : recordedCurves ? `not measured: ${recordedCurves} scroll curve(s) recorded on the reference and no motion map (trueclone curves ${name} --draft)` : 'no motion map (no scroll or time animation to score)');
row('Detail (styles)', D, (x) => x >= T.detail, `target ≥ ${T.detail}%; font, size, weight, line height, colour, boxes`);
row('Hovers', { desktop: hovers?.score }, hovers && hovers.score !== null && hovers.score !== undefined ? hovers.score >= T.hovers : null, hovers && hovers.score === null ? `not measurable: no hover effect to compare${hovers.blocked ? `; the reference is covered by \`${hovers.blocked}\` (capture again with --hide)` : ''}` : `target ≥ ${T.hovers}% of the reference hover effects`);
const LD = byVp(load, 'score');
const tts = (side) => VPS.map((v) => load?.viewports.find((x) => x.viewport === v)).filter(Boolean).map((x) => (x[side]?.settledAt === null ? '>4000' : x[side]?.settledAt)).filter((x) => x !== undefined);
row('Load sequence', LD, (x) => x >= T.load, present(LD).length ? `target ≥ ${T.load}%; how settled each side is at 0.25 to 4 s, cold cache, same network (settled at: reference ${tts('ref').map((x) => `${x}ms`).join(' / ') || '–'}, clone ${tts('clone').map((x) => `${x}ms`).join(' / ') || '–'})` : 'not measured (trueclone load <name>)');
if (reviewFrames.length) {
  const sizes = [...new Set(reviewFrames.map((x) => x.size))];
  rows.push(`| Review (by eye) | ${VPS.map((v) => (sizes.includes(v) ? `${reviewFrames.filter((x) => x.size === v && reviewClosed(x)).length}/${reviewFrames.filter((x) => x.size === v).length}` : '–')).join(' | ')} | ${reviewOpen.length ? '**below target**' : 'pass'} | frames closed in notes.md: "same", or "tool" with an evidence file (trueclone review) |`);
} else rows.push(`| Review (by eye) | – | – | – | – | – | **below target** | not done: run trueclone review <name> and give every frame a verdict in notes.md |`);
// the written plan: behaviours in notes.md, each tied to the site's own code (file:line) when the site has handlers
const behaviours = notesSection('Behaviours').join('\n');
const cites = (behaviours.match(/[\w.-]+\.js:\d+/g) || []).length;
const siteListeners = ((await read('reference/scripts/scripts.json'))?.listeners || []).length;
// an own-bundle clone (app mode, exact) runs the site's own code: there is no plan of behaviours to write, nothing ported
const ownBundle = Boolean(meta.bundle);
const notesOk = ownBundle || (Boolean(behaviours) && (!siteListeners || cites > 0));
if (!ownBundle) rows.push(`| Notes (behaviours) | ${cites} cited | – | – | – | – | ${notesOk ? 'pass' : '**below target**'} | ${notesOk ? 'notes.md Behaviours tie each behaviour to the site\'s code' : behaviours ? 'notes.md Behaviours cite no file:line of the site\'s code (trueclone brief lists them per section)' : 'notes.md has no Behaviours yet (trueclone brief <name> <n>, one section at a time)'} |`);
if (!ownBundle) checks.push({ check: 'Notes (behaviours)', key: 'notes', pass: notesOk, failing: notesOk ? [] : [{ viewport: null, value: cites }] });
// Coverage: nothing the site does is left out by estimate. Every script of the site's own that ran (not a library,
// not tracking) is cited by name in Behaviours, or named under Findings with why it is not ported; every scroll curve
// recorded on the reference is named the same way (by its class) or driven by script.js.
const LIBRARY = /(^|[\W_])(gsap|tweenmax|flip|scrolltrigger|splittext|customease|jquery|lenis|swiper|three|webflow|lottie|hls|polyfill|modernizr|lodash|react|vue|next|nuxt|webpack|runtime|vendor|framework|chunk)([\W_]|$)/i;
const covText = `${behaviours}\n${findings.join('\n')}`;
const scriptJs = await fs.readFile(path.join(root, 'clone', 'script.js'), 'utf8').catch(() => '');
// the site's own code that does the most: its eight busiest scripts by functions run (a big page also loads a dozen
// apps, each named in one Findings line if not ported), and every inline script that handles an event
const evidence = await read('reference/scripts/scripts.json');
const own = (evidence?.scripts || []).filter((s) => s.functionsRan > 0 && !s.tracking && s.bytes >= 200 && !LIBRARY.test(`${s.file} ${s.url || ''}`));
const listened = new Set((evidence?.listeners || []).map((l) => String(l.file || '').replace(/\.pretty\.js$/, '.js')));
const ran = [...new Set([...own.slice().sort((a, b) => b.functionsRan - a.functionsRan).slice(0, 8), ...own.filter((s) => /^inline-/.test(s.file) && listened.has(s.file))])];
const uncitedScripts = ran.filter((s) => !covText.includes(s.file.replace(/\.js$/, '')));
const curvesRec = ((await read('reference/reveals.desktop.json'))?.scrubs || []).filter((c) => c.cls);
const uncitedCurves = curvesRec.filter((c) => { const k = String(c.cls).split('.')[0]; return k && !covText.includes(k) && !scriptJs.includes(k); });
if (!ownBundle && (ran.length || curvesRec.length)) {
  const covOk = !uncitedScripts.length && !uncitedCurves.length;
  rows.push(`| Coverage (site code) | ${ran.length - uncitedScripts.length}/${ran.length} scripts, ${curvesRec.length - uncitedCurves.length}/${curvesRec.length} curves | – | – | – | – | ${covOk ? 'pass' : '**below target**'} | ${covOk ? 'every script of the site that ran and every recorded scroll curve is ported (cited in Behaviours or driven by script.js) or explained under Findings' : `not cited in notes.md (Behaviours, or Findings with why not): ${[...uncitedScripts.map((s) => s.file), ...uncitedCurves.map((c) => `curve .${String(c.cls).split('.')[0]}`)].slice(0, 6).join(', ')}${uncitedScripts.length + uncitedCurves.length > 6 ? '…' : ''}`} |`);
  checks.push({ check: 'Coverage (site code)', key: 'coverage', pass: covOk, failing: [...uncitedScripts.map((s) => ({ viewport: null, script: s.file })), ...uncitedCurves.map((c) => ({ viewport: null, curve: c.cls, path: c.path }))] });
}
// scenarios the capture found where the reference itself does not react are not behaviour: not counted
// and those on a route the reference draws differently every load are not scored either (interact.mjs: unstable)
const scenarios = (interact?.scenarios || []).filter((s) => !s.notBehaviour && !s.unstable);
const unstableScenarios = (interact?.scenarios || []).filter((s) => s.unstable);
const brokenScenarios = scenarios.filter((s) => s.broken);
const failed = scenarios.filter((s) => s.expect && !s.expect.pass);
const autoCount = scenarios.filter((s) => s.auto).length;
const retired = interact?.skipped || [];
// the value is the share of scenarios that pass, the number the verdict rests on (an average end-state match next to
// "0/28 pass" reads as a contradiction)
row('Interactions', { desktop: scenarios.length ? +(100 * (scenarios.length - failed.length) / scenarios.length).toFixed(1) : undefined }, scenarios.length ? failed.length === 0 : null,
  scenarios.length ? `${scenarios.length - failed.length}/${scenarios.length} scenarios pass: they change on both sides and end in the reference's state (≥ 95)${autoCount ? `; ${autoCount} found by the capture` : ''}${brokenScenarios.length ? `; ${brokenScenarios.length} could not run on the reference (see Findings)` : ''}${unstableScenarios.length ? `; ${unstableScenarios.length} on a route random on every load, not scored` : ''}${failed.length ? `; failing: ${failed.slice(0, 4).map((s) => s.name).join(', ')}${failed.length > 4 ? '…' : ''}` : ''}${retired.length ? `; retired: ${retired.map((s) => `${s.name} (${s.why})`).join(', ')}` : ''}` : 'no scenarios (interactions.json, or reference/interactions.auto.json from capture)');

// The site's other routes (meta.routes): layout and scroll states of each, at each size, worst route first. One
// route below target fails the check: exact means every page, not the one captured first.
const routeRows = [];
const routeFailing = [];
for (const r of (meta.routes || []).filter((x) => x.slug)) {
  const lay = layout?.routes?.find((x) => x.path === r.path)?.viewports || [];
  const st = states?.routes?.find((x) => x.path === r.path)?.viewports || [];
  const cell = (list, v) => list.find((x) => x.viewport === v)?.match;
  const lows = [];
  // a route that differs from itself between two loads (capture: meta.routes[].unstable) is held to its own match,
  // less a point: no copy can be closer to the reference than the reference is to itself
  const bar = (target) => (r.unstable ? Math.min(target, r.unstable.match - 1) : target);
  for (const v of VPS) {
    if (typeof cell(lay, v) === 'number' && cell(lay, v) < bar(T.layout)) lows.push({ route: r.path, viewport: v, check: 'layout', value: cell(lay, v) });
    if (typeof cell(st, v) === 'number' && cell(st, v) < bar(T.states)) lows.push({ route: r.path, viewport: v, check: 'states', value: cell(st, v) });
  }
  const measured = lay.length > 0;
  if (!measured) lows.push({ route: r.path, viewport: null, check: 'layout', value: null });
  routeFailing.push(...lows);
  const worst = Math.min(...[...lay, ...st].map((x) => x.match).filter((x) => typeof x === 'number'), 100);
  routeRows.push({ worst: measured ? worst : -1, line: `| \`${r.path}\` | ${VPS.map((v) => `${cell(lay, v) ?? '–'} / ${cell(st, v) ?? '–'}`).join(' | ')} | ${!measured ? '**not scored**' : lows.length ? '**below target**' : 'pass'}${r.unstable ? ` (random on the reference: ${r.unstable.match}% like itself, held to ${bar(T.layout)})` : ''} |` });
}
if (routeRows.length) {
  rows.push(`| Routes | ${VPS.map(() => '').join(' | ')} | ${routeFailing.length ? '**below target**' : 'pass'} | ${routeRows.length} other route(s): layout ≥ ${T.layout} and scroll states ≥ ${T.states} at every size (see Routes below) |`);
  checks.push({ check: 'Routes', key: 'routes', pass: !routeFailing.length, failing: routeFailing.sort((a, b) => (a.value ?? -1) - (b.value ?? -1)) });
}
checks.push({ check: 'Review (by eye)', key: 'review', pass: reviewFrames.length > 0 && !reviewOpen.length, failing: reviewFrames.length ? reviewOpen.map((x) => ({ viewport: x.size, frame: x.id, token: x.token, verdict: x.stale ? `given to an earlier picture of this frame: look again (token ${x.token})` : x.verdict && /^same/i.test(x.verdict) ? `same, without the reason a ${x.pct}% frame needs` : x.verdict && /^tool/i.test(x.verdict) ? `tool, without evidence made to prove it` : x.verdict })) : [{ viewport: null, frame: null, verdict: 'not done' }] });
await fs.mkdir(path.join(root, COMPARE), { recursive: true });
// a report regenerated only to follow the notes (TC_KEEP_AT, below) keeps the time its scores were taken
const priorAt = process.env.TC_KEEP_AT ? (await read(`${COMPARE}/verdict.json`))?.at : null;
await fs.writeFile(path.join(root, COMPARE, 'verdict.json'), JSON.stringify({ at: priorAt || new Date().toISOString(), drift: Boolean(drift?.stale), checks }, null, 2));
const failing = rows.filter((r) => r.includes('below target')).length;
const acceptedCount = rows.filter((r) => r.includes('| accepted (')).length;
const verdict = (failing ? `${failing} check(s) below target` : 'every scored check meets its target') + (acceptedCount ? ` (${acceptedCount} accepted with a reason in notes.md)` : '') + (drift?.stale ? '; the live site has changed since the capture: re-capture before trusting the live-measured checks' : '');

// Weakest spots, to fix first.
const weak = [];
for (const v of VPS) for (const s of (layout?.viewports.find((x) => x.viewport === v)?.worstSections || []).slice(0, 2)) if (s.match < 99) weak.push(`- Layout ${v}: section "${String(s.label).slice(0, 50)}" at y ${s.y} is ${s.match}%`);
for (const v of VPS) for (const e of (curves[v]?.entries || []).filter((x) => x.score < 90).slice(0, 3)) weak.push(`- Motion ${v}: "${e.name}" ${e.score}%${e.note ? ` (${e.note})` : ''}`);
for (const s of failed) weak.push(s.expect.ref !== null && !(s.expect.ref && s.expect.clone)
  ? `- Interaction "${s.name}": the expected change happened on ${s.expect.ref ? 'the reference' : 'neither side'}${s.expect.clone ? '' : ', not on the clone'}`
  : `- Interaction "${s.name}": the clone ends in a different state (${s.score}% like the reference's)`);
for (const v of (load?.viewports || []).filter((x) => typeof x.score === 'number' && x.score < T.load)) { // a size not scored (unstable) has nothing to fix
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
// the calls the clone's own code makes too (script.js and patches name their address): ported, not left out
const ownCode = [await fs.readFile(path.join(root, 'clone', 'script.js'), 'utf8').catch(() => ''), ...await Promise.all((await fs.readdir(path.join(root, 'clone', 'patches')).catch(() => [])).filter((f) => /\.(m?js|html)$/.test(f)).map((f) => fs.readFile(path.join(root, 'clone', 'patches', f), 'utf8').catch(() => '')))].join('\n');
const calledByClone = (c) => { try { const u = new URL(c.url); return ownCode.includes(u.host + u.pathname.split('/').slice(0, 3).join('/')) || (u.pathname.length > 8 && ownCode.includes(u.pathname)); } catch { return false; } };
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
const uniq = (list) => [...new Map(list.map((c) => [`${c.method} ${c.url.split('?')[0]}`, c])).values()];

// the libraries by name: a list of runtimes (gsaps, engines) or where one was found (…At) is not one
const libs = motionInv ? Object.entries(motionInv.libs || {}).filter(([k, v]) => v && !Array.isArray(v) && !/At$/.test(k)).map(([k, v]) => (v === true ? k : `${k} ${v}`)) : [];
const md = `# trueclone report: ${name}${COMPARE === 'compare' ? '' : ' (Next.js app; the review is the HTML clone\'s, which the app is generated from)'}

| | |
|---|---|
| Reference | ${meta.url} |
| Mode | ${meta.mode === 'exact' ? `exact (the site's own text and media). Permission: ${meta.permission}` : 'template (structure, motion and behaviour; placeholder text and media)'} |
| Captured | ${meta.capturedAt} |
| Scored | ${layout?.at || '–'}${layout?.clone && !/127\.0\.0\.1:\d+\/$/.test(layout.clone) ? ` against ${layout.clone}` : ''} |
| Verdict | **${verdict}** |
${times ? `| Scoring time | ${times.totalMin} min (${times.kind}${times.only ? `, only ${times.only.join(',')}` : ''}): ${Object.entries(times.steps).filter(([, s]) => s.seconds).map(([k, s]) => `${k} ${s.seconds}s`).join(', ')}${Object.values(times.steps).some((s) => /kept/.test(s.status)) ? '; unchanged checks kept from their last run' : ''} |` : ''}
${(detail?.viewports || []).some((v) => v.unstable) || hovers?.unstable || (load?.viewports || []).some((v) => v.unstable) ? `| Not scored | ${(detail?.viewports || []).filter((v) => v.unstable).map((v) => `${v.unstable} detail probe${v.unstable > 1 ? 's' : ''} (${v.viewport})`).concat(hovers?.unstable ? [`${hovers.unstable} hover${hovers.unstable > 1 ? 's' : ''}`] : [], (load?.viewports || []).filter((v) => v.unstable).map((v) => `load ${v.viewport} (±${v.ref?.noise ?? v.noise} between two runs)`)).join(', ')}: unstable on the reference itself (random motion, timing), excluded from the scores above |` : ''}
${(load?.viewports || []).some((v) => v.cloneUnstable) ? `| Clone loads inconsistently | ${load.viewports.filter((v) => v.cloneUnstable).map((v) => `${v.viewport} (±${v.clone.noise} between two runs)`).join(', ')}: the clone's own load differs from one run to the next; scored by its worse run, since a visitor can get either |` : ''}

## Scores

| Check | Desktop 1440 | Tablet 768 | Mobile 390 | Laptop 1280 ° | Wide 1920 ° | Status | Notes |
|---|---|---|---|---|---|---|---|
${rows.join('\n')}

° held out: captured and scored, never used to build the clone. A clone right at the seed sizes and wrong here is fitted to those sizes, not a copy of the site.
${routeRows.length ? `\n## Routes\n\nThe captured page is the table above (\`${meta.routes?.find((r) => !r.slug)?.path || '/'}\`); every other route of the site (${meta.app || 'pages'}), opened at its own address. Layout / scroll states, worst route first.\n\n| Route | ${VPS.map((v) => v[0].toUpperCase() + v.slice(1)).join(' | ')} | Status |\n|---|${VPS.map(() => '---').join('|')}|---|\n${routeRows.sort((a, b) => a.worst - b.worst).map((r) => r.line).join('\n')}\n` : ''}${unproven.length ? `\n${unproven.length} accepted difference(s) in notes.md name no evidence file and are not applied: ${unproven.map((a) => `"${a.slice(0, 50)}…"`).join('; ')}\n` : ''}
${drift?.stale ? `## Stale capture\n\nThe live page differs from the capture of ${meta.capturedAt}: ${drift.viewports.filter((v) => v.stale).map((v) => `${v.viewport} ${v.livePageHeight}px tall vs ${v.capturedPageHeight}px captured, ${v.liveSections} vs ${v.capturedSections} sections`).join('; ')}. Layout and states score against the captured screenshots; detail, hovers, motion, interactions and load measure the live page and are marked stale above. Re-capture (\`trueclone capture\`, then \`states\`, \`reveals\`, \`seed --force\`) before reading them.\n\n` : ''}${accepted.length ? `## Accepted differences\n\nRecorded in notes.md with a reason; a check below target that is covered here is marked "accepted" in the table.\n\n${accepted.map((a) => `- ${a}`).join('\n')}\n\n` : ''}${reviewOpen.length ? `## Review: open frames\n\n${reviewOpen.slice(0, 40).map((x) => `- ${x.id} ${x.size}: ${x.verdict || 'no verdict yet'} (compare/review/${x.size}/${x.id}.png)`).join('\n')}\n\n` : ''}${weak.length ? `## Fix first\n\n${weak.join('\n')}\n` : '## Fix first\n\nNothing below 99% on layout, 90% on motion or failing.\n'}
${findings.length ? `## Findings (tool defects met on this site)\n\n${findings.map((f) => `- ${f}`).join('\n')}\n\n` : ''}## Motion found on the reference

${motionInv ? `Libraries: ${libs.length ? libs.join(', ') : 'none (no GSAP, Lenis, Swiper or similar)'}. ScrollTriggers: ${motionInv.triggers?.length ?? 0}. Tweens created while scrolling: ${motionInv.onScroll?.length ?? 0}. CSS animations: ${(motionInv.css || []).length}.` : 'Not inventoried yet (trueclone motion <name>).'}

## Not copied

- **Server-side behaviour** is never visible from the outside: databases, accounts, payments, search indexes. The clone reproduces the client.
- **Tracking, analytics and bot protection** are left out on purpose${tracking.length ? `: ${[...new Set(tracking.map((c) => { try { const u = new URL(c.url); return `${u.host}${u.pathname.split('/').slice(0, 3).join('/')}`; } catch { return host(c.url); } }))].join(', ')}` : ''}.
${data.length ? `- **Data and API calls** the reference makes (${uniq(data).length})${uniq(data).some(calledByClone) ? `; the clone calls ${uniq(data).filter(calledByClone).length} of them itself (marked), the others not` : ', which the clone does not call'}; their captured responses are in reference/desktop.har:\n${uniq(data).slice(0, 15).map((c) => `  - \`${c.method} ${c.url.split('?')[0].slice(0, 110)}\` → ${c.status} ${c.type.split(';')[0]}${calledByClone(c) ? ' (called by the clone too)' : ''}`).join('\n')}` : '- **Data and API calls**: none seen during the capture (static content).'}
`;
// rows left out of the summary table (an empty optional row) must not leave a blank line that splits it
const [head, ...rest] = md.split('\n## Scores');
await fs.writeFile(path.join(root, REPORT_FILE), [head.replace(/(\|[^\n]*)\n(?:\n)+(?=\|)/g, '$1\n'), ...rest].join('\n## Scores'));
console.log(`${verdict} -> ${path.relative(process.cwd(), path.join(root, REPORT_FILE))}`);
// The Next.js app's report reads the same notes (review verdicts, accepted differences, findings): regenerated with
// this one so it never shows stale counts. Its scores are not re-run, and its verdict keeps the time they were taken
// (status still asks for a new verify when the HTML clone changed after it).
if (COMPARE === 'compare' && fsSync.existsSync(path.join(root, 'compare-next', 'verdict.json'))) {
  spawnSync(process.execPath, [fileURLToPath(import.meta.url), name], { stdio: 'inherit', env: { ...process.env, TC_COMPARE: 'compare-next', TC_REPORT: 'REPORT.next.md', TC_KEEP_AT: '1' } });
}
