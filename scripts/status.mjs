// Where a clone stands and the one thing to do next, worked out from the files in sites/<name>/ alone, so any agent
// (any model) follows the same path: capture and its reads, design, seed, a brief per section, behaviours written
// with the site's file:line, script.js, scores (re-measured whenever the clone changed), the failing checks in the
// skill's fix order (each with the command to look closer and the one-size rescore), the review, the Next.js app.
// Exit code 0 only when every gate passes.
//
// usage: trueclone status <name>
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, siteDir } from './lib.mjs';

const { pos } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) { console.error('usage: trueclone status <name>'); process.exit(1); }
const root = siteDir(name);
const T = (s) => `npx trueclone ${s}`;
const stat = (p) => fs.stat(path.join(root, p)).catch(() => null);
const json = (p, d = null) => fs.readFile(path.join(root, p), 'utf8').then(JSON.parse).catch(() => d);
const text = (p) => fs.readFile(path.join(root, p), 'utf8').catch(() => '');
const newest = async (dir) => {
  let t = 0;
  const walk = async (d) => {
    for (const e of await fs.readdir(d, { withFileTypes: true }).catch(() => [])) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!['node_modules', 'patches-cache'].includes(e.name)) await walk(p); } else t = Math.max(t, (await fs.stat(p)).mtimeMs);
    }
  };
  await walk(path.join(root, dir));
  return t;
};

const done = [];
const setAside = []; // steps that did not move after three scored tries (section 6)
const next = (cmd, why, then = []) => {
  console.log(`trueclone status: ${name}${meta?.mode ? ` (${meta.mode})` : ''}`);
  if (done.length) console.log(`done: ${done.join(', ')}`);
  console.log(`\nnext: ${cmd}\n  why: ${why}`);
  for (const t of then) console.log(`  then: ${t}`);
  if (setAside.length) console.log(`\nset aside (no gain after three scored tries; write what blocks each under ## Findings in notes.md): ${setAside.join(', ')}`);
  console.log(`\nWork is left. Do the next step, then run \`${T(`status ${name}`)}\` again. Do not end your turn or ask whether to continue while status says work is left; only a real blocker stops you (then write it under ## Findings in notes.md, with what you tried, and say so).`);
  process.exit(1);
};

// ---- 1. capture and what it reads ----
const meta = await json('reference/meta.json');
if (!meta) next(T(`capture <url> ${name}`), 'nothing captured yet (add --mode exact --permission "<owner>" only with the owner\'s permission)');
done.push('capture');
const mode = meta.mode || 'template';
const reads = [
  ['reference/states/desktop.summary.json', `states ${name}`, 'the live scroll states at every size'],
  [`reference/motion.desktop.json`, `motion ${name}`, 'the animation runtime (triggers, tweens, Lenis)'],
  ['reference/desktop.spec.json', `spec ${name}`, 'measured boxes and the typography'],
  ['reference/reveals.desktop.json', `reveals ${name}`, 'one-shot reveals, scroll curves and class changes'],
  ['reference/widgets.desktop.json', `widgets ${name}`, 'tab, menu and dialog states'],
];
const missing = [];
for (const [f, cmd, why] of reads) if (!(await stat(f))) missing.push([cmd, why]);
if (missing.length) next(T(missing[0][0]), `${missing[0][1]} not read yet`, missing.slice(1).map(([c]) => `${T(c)} (the reads can run one after another in the background)`));
done.push('reads');

// ---- 2. design and seed (each re-run when its inputs are newer) ----
const spec = await stat('reference/desktop.spec.json');
const tokens = await stat('design-tokens.json');
if (!tokens || !(await stat('DESIGN.md'))) next(T(`design ${name}`), 'no design system drafted yet (DESIGN.md, globals.css)');
done.push('design');
const seeded = await stat('clone/index.html');
const seedInputs = await Promise.all(['reference/reveals.desktop.json', 'reference/widgets.desktop.json', 'reference/inline-styles.json'].map(stat));
if (!seeded) next(T(`seed ${name}`), 'no clone yet');
if (seedInputs.some((s) => s && s.mtimeMs > seeded.mtimeMs + 1000)) next(T(`seed ${name} --force`), 'reveals, widgets or the capture are newer than the clone\'s markup (clone/script.js and clone/patches/ are kept)');
done.push('seed');

// ---- 3. a brief per section, behaviours written from the site's code ----
const sections = await json('reference/desktop.sections.json', []);
const briefs = [];
for (let i = 1; i <= sections.length; i++) if (await stat(`compare/brief/desktop-${i}.md`)) briefs.push(i);
const unbriefed = sections.map((_, i) => i + 1).filter((i) => !briefs.includes(i));
if (unbriefed.length) next(T(`brief ${name} ${unbriefed[0]}`), `section ${unbriefed[0]} of ${sections.length} has not been read yet: its brief lists the site's handlers (file:line), recorded motion and what a visitor operates there`, [`one section at a time, then write its behaviours in notes.md (## Behaviours, each citing a file:line from the brief)`, `${T(`brief ${name}`)} lists every section and its evidence`]);
done.push(`briefs ${briefs.length}/${sections.length}`);
const notes = await text('notes.md');
const sectionOf = (h) => (notes.split(/^## /m).find((s) => s.toLowerCase().startsWith(h.toLowerCase())) || '').replace(/<!--[\s\S]*?-->/g, '').split('\n').slice(1).join('\n').trim();
const scripts = await json('reference/scripts/scripts.json', { listeners: [] });
const behaviours = sectionOf('Behaviours');
const cites = (behaviours.match(/[\w.-]+\.js:\d+/g) || []).length;
if (!behaviours || (scripts.listeners.length && !cites)) next('write ## Behaviours in notes.md', 'one line per behaviour (element, trigger, property, range, timing) with the file:line of the rule in reference/scripts/ (from the briefs); this is the plan script.js is written from', [`${T(`brief ${name} <n>`)} for any section you have not read`]);
if (!sectionOf('Stack')) next('write ## Stack in notes.md', 'what the site is built with (reference/motion.desktop.md lists the libraries and where they live)');
done.push(`behaviours (${cites} cited)`);

// ---- 4. script.js ----
const script = await text('clone/script.js');
const ownLines = script.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//')).length;
if (ownLines < 5 && (behaviours.split('\n').filter((l) => l.trim().startsWith('-')).length > 0)) next('write clone/script.js', 'the behaviours in notes.md are not built yet: one scene at a time, each ported from its file:line, computed from the viewport; tcOwn(\'<selector>\') first for anything the recorded players drive', [T(`score ${name} --only layout,states --viewport desktop`)]);
done.push('script.js');

// ---- 5. scores, fresh ----
const verdict = await json('compare/verdict.json');
const changed = Math.max(await newest('clone'), (await stat('interactions.json'))?.mtimeMs || 0);
const failingChecks = (verdict?.checks || []).filter((c) => !c.pass && c.key !== 'review');
if (!verdict) next(T(`score ${name}`), 'not scored yet: every check at every size (the first full score takes a while; later ones re-measure only what changed)');
if (Date.parse(verdict.at) < changed - 1000) {
  if (failingChecks.length) {
    // what each failing check is measured by (routes by layout and states; notes and coverage are read, not measured)
    const keys = [...new Set(failingChecks.flatMap((c) => ({ layout: ['layout'], scroll: ['states'], canvases: ['states'], routes: ['layout', 'states'], interactions: ['interact'], hovers: ['hovers'], detail: ['detail'], load: ['load'], motion: ['curves'], notes: [], coverage: [] }[c.key] || [c.key])))];
    // test what was built: a change to the clone's behaviour is checked by operating it (the interaction scenarios),
    // whatever else is re-measured, so a dead accordion or a drag that sticks shows up the moment it is written
    if (!keys.includes('interact') && (await stat('reference/interactions.auto.json') || await stat('interactions.json'))) keys.push('interact');
    const vp = failingChecks[0].failing.find((f) => f.viewport)?.viewport;
    if (keys.length) next(T(`score ${name} --only ${keys.join(',')}${vp && ['layout', 'states'].includes(keys[0]) ? ` --viewport ${vp}` : ''}`), 'the clone changed since the last score: re-measure what was failing (one size while iterating)', [`when that passes: ${T(`score ${name}`)} (every check, every size)`]);
  }
  next(T(`score ${name}`), 'the clone changed since the last score');
}
// a check measured before the clone's last change (REPORT.md marks it stale) is re-measured before anything is fixed
const staleChecks = failingChecks.filter((c) => c.stale);
if (staleChecks.length) {
  const keys = [...new Set(staleChecks.map((c) => ({ layout: 'layout', scroll: 'states', canvases: 'states', interactions: 'interact', hovers: 'hovers', detail: 'detail', load: 'load', motion: 'curves' }[c.key] || c.key)))];
  next(T(`score ${name} --only ${keys.join(',')}`), `${staleChecks.map((c) => c.check).join(', ')} ${staleChecks.length > 1 ? 'were' : 'was'} measured before the clone's last change`);
}
done.push('scored');

// ---- 6. the failing checks in the skill's fix order, and the review as soon as the layout holds ----
// Every step left is a candidate, in order; the first one not set aside is the next step. A done or accepted check is
// never a candidate (it passes). A step that does not move is set aside: issued again after a new score with no gain,
// three times (compare/status-steps.json), it gives way to the next candidate, and what blocks it belongs under
// ## Findings. So status always moves on, and never repeats one step forever.
const layout = await json('compare/report.mask.json');
const statesRep = await json('compare/states/report.mask.json');
const memory = await json('compare/status-steps.json', {});
const candidates = [];
const add = (key, value, run, track = true) => candidates.push({ key, value, run, track });
const sectionAt = (vp) => {
  const v = layout?.viewports?.find((x) => x.viewport === vp);
  const s = v?.worstSections?.slice().sort((a, b) => a.match - b.match)[0];
  return s ? { n: s.index + 1, y: s.y, label: String(s.label).slice(0, 40), match: s.match } : null;
};
// the section a page position falls in, at that size (scroll frames are positions)
const sectionOfY = async (vp, y) => {
  const secs = await json(`reference/${vp}.sections.json`, []);
  const i = secs.findIndex((s) => y >= s.y && y < s.y + s.height);
  return i < 0 ? null : { n: i + 1, label: String(secs[i].label || secs[i].tag || '').slice(0, 40) };
};
const order = ['layout', 'coverage', 'scroll', 'canvases', 'routes', 'interactions', 'load', 'detail', 'hovers', 'motion'];
const heldOut = (f) => ['laptop', 'wide'].includes(f.viewport);
const sorted = failingChecks.slice().sort((a, b) => (order.indexOf(a.key) - order.indexOf(b.key)) || (Number(b.failing.some(heldOut)) - Number(a.failing.some(heldOut))));
const reviewCheck = (verdict.checks || []).find((c) => c.key === 'review');
const differs = (reviewCheck?.failing || []).filter((f) => f.verdict && !/^same\b/i.test(f.verdict) && f.verdict !== 'not done');
for (const f of differs) {
  add(`review:${f.viewport}:${f.frame}`, null, () => next(`fix review frame ${f.frame} (${f.viewport}): "${String(f.verdict).slice(0, 80)}"`, 'a frame you marked as different is the first thing to fix (what a visitor sees beats any number)', [T(`brief ${name} <section of that frame> --viewport ${f.viewport === 'wide' || f.viewport === 'laptop' ? 'desktop' : f.viewport}`), `then ${T(`review ${name} --size ${f.viewport}`)} and update its verdict`]));
}
const layoutCheck = sorted.find((c) => c.key === 'layout');
if (layoutCheck) {
  const f = layoutCheck.failing.find(heldOut) || layoutCheck.failing[0] || {};
  const vp = f.viewport || 'desktop';
  const s = sectionAt(vp);
  add(`layout:${vp}:${s?.n ?? ''}`, s?.match ?? f.value, () => next(T(`explain ${name} ${s?.y ?? 0} --viewport ${vp}`), `${layoutCheck.check} ${vp} is ${f.value}${s ? `; its worst section is ${s.n} "${s.label}" (${s.match})` : ''}`, [s ? T(`brief ${name} ${s.n} --viewport ${['laptop', 'wide'].includes(vp) ? 'desktop' : vp}`) : T(`brief ${name}`), `after the fix: ${T(`score ${name} --only layout --viewport ${vp}`)}`]));
}
{
  // once the layout holds (or its step is set aside), the clone is looked at by eye, at every size, not only once every
  // number passes: what the eye finds comes first (see above)
  for (const size of ['wide', 'laptop', 'tablet', 'mobile']) if (!(await stat(`compare/review/${size}/frames.json`))) add(`review-size:${size}`, null, () => next(T(`review ${name} --size ${size}`), `no side-by-side frames at ${size} yet: the clone is judged by eye at every size`, ['give every frame a verdict under ## Review in notes.md ("- <frame> <size>: same" or "differs: <what>")']), false);
  for (const r of (meta.routes || []).filter((x) => x.slug)) {
    for (const size of ['wide', 'mobile']) if (!(await stat(`compare/review/routes/${r.slug}/${size}/frames.json`))) add(`review-route:${r.slug}:${size}`, null, () => next(T(`review ${name} --route ${r.path} --size ${size}`), `route ${r.path} has not been looked at side by side at ${size}`, ['its frames are named "' + r.slug + '/<frame>": verdicts under ## Review as for the others']), false);
  }
}
for (const c of sorted.filter((x) => x.key !== 'layout')) {
  // scroll frames and canvases are routed by their own worst frame, at a size the clone is built from when one fails
  const f = (['scroll', 'canvases'].includes(c.key) ? c.failing.find((x) => !heldOut(x)) : null) || c.failing.find(heldOut) || c.failing[0] || {};
  const vp = f.viewport || 'desktop';
  const briefVp = ['laptop', 'wide'].includes(vp) ? 'desktop' : vp;
  const sv = statesRep?.viewports?.find((x) => x.viewport === vp);
  if (c.key === 'scroll') {
    const w = (sv?.worst || []).slice().sort((a, b) => a.match - b.match)[0];
    const s = w ? await sectionOfY(vp, w.y) : null;
    add(`scroll:${vp}:${w?.y ?? ''}`, w?.match ?? f.value, () => next(T(`explain ${name} ${w?.y ?? 0} --viewport ${vp}`), `${c.check} at ${vp} is ${f.value}%${w ? `; the worst frame is y ${w.y} at ${w.match}%${s ? `, in section ${s.n} "${s.label}"` : ''}` : ''}: what a visitor sees there while scrolling`, [s ? T(`brief ${name} ${s.n} --viewport ${vp}`) : T(`brief ${name}`), `compare/states/ has that frame side by side; after the fix: ${T(`score ${name} --only states --viewport ${vp}`)}`]));
  } else if (c.key === 'canvases') {
    const w = (sv?.canvasWorst || []).slice().sort((a, b) => a.similarity - b.similarity)[0];
    const s = w ? await sectionOfY(vp, w.y) : null;
    add(`canvas:${vp}:${w?.y ?? ''}`, w?.similarity ?? f.value, () => next(`port the canvas scene at y ${w?.y ?? '?'} (${vp}): it draws ${w?.similarity ?? f.value}% like the reference`, 'a canvas is drawn by the site\'s own code, never captured: find its scene code (the brief lists the canvas and the handlers there; reference/scripts/INDEX.md ranks the scripts that ran), vendor the engine at the site\'s version, and port the scene with its parameters (camera, geometry, colours, timing) computed from the viewport (skill: "Canvases")', [T(`vendor ${name}`), s ? T(`brief ${name} ${s.n} --viewport ${briefVp}`) : T(`brief ${name}`), `after the fix: ${T(`score ${name} --only states --viewport ${vp}`)}`]));
  } else if (c.key === 'coverage') {
    // the site's code nobody opened: each script read and its behaviour ported (cited in Behaviours), or named under
    // Findings with why it is not (an app, a polyfill); each recorded curve likewise
    const first = c.failing[0] || {};
    const what = first.script ? `reference/scripts/${first.script.replace(/\.js$/, '.pretty.js')} (or ${first.script})` : `the scroll curve on .${String(first.curve || '').split('.')[0]} (reference/reveals.desktop.json, path ${first.path})`;
    add(`coverage:${first.script || first.curve || ''}`, -c.failing.length, () => next(`read ${what}`, `${c.failing.length} piece(s) of the site's own code are not accounted for: port what each does (a line under ## Behaviours citing its file:line) or say under ## Findings why it is not ported`, [T(`brief ${name}`) + ' shows which section uses it', `then ${T(`report ${name}`)}`]));
  } else if (c.key === 'routes') {
    // the worst route first: look at it side by side, then its sections' evidence
    const w = c.failing[0];
    const size = w.viewport || 'desktop';
    add(`routes:${w.route}:${size}:${w.check}`, w.value, () => next(w.value === null ? T(`score ${name} --only layout,states`) : T(`review ${name} --route ${w.route} --size ${size}`), w.value === null ? `route ${w.route} has not been scored yet` : `route ${w.route} is the furthest from the original: ${w.check} at ${size} is ${w.value}`, [T(`brief ${name} --route ${w.route}`), `after the fix: ${T(`score ${name} --only layout,states`)}`]));
  } else if (c.key === 'interactions') {
    const rep = await json('compare/interact/report.json', { scenarios: [] });
    const bad = rep.scenarios.find((s) => !s.notBehaviour && s.expect && !s.expect.pass);
    add(`interactions:${bad?.name || ''}`, bad?.score ?? null, () => next(`make "${bad?.name || 'the failing interaction'}" behave like the reference`, bad ? (bad.expect.ref && bad.expect.clone === false ? 'it changes on the reference and does nothing on the clone' : `the clone ends in a different state (${bad.score}% like the reference)`) : 'interactions below target', [T(`brief ${name}`) + ' (find the section it is in; its brief has the handler file:line)', `after the fix: ${T(`score ${name} --only interact`)}`]));
  } else {
    add(`${c.key}:${vp}`, f.value ?? null, () => next(`fix ${c.check} at ${vp} (${f.value ?? 'below target'})`, `${c.check} is below its target; REPORT.md "Fix first" lists where`, [T(`explain ${name} <y> --viewport ${vp}`), `after the fix: ${T(`score ${name} --only ${{ hovers: 'hovers', detail: 'detail', load: 'load', motion: 'curves' }[c.key] || c.key}`)}`]));
  }
}
if (reviewCheck && !reviewCheck.pass) {
  const open = reviewCheck.failing.filter((f) => !f.verdict);
  if (open.length) add('review-verdicts', -open.length, () => next(`write review verdicts in notes.md for ${open.length} frame(s) (${open.slice(0, 3).map((f) => `${f.frame} ${f.viewport}`).join(', ')}…)`, 'every frame needs a verdict; "differs" is fixed, "same" closes it', [`look at compare/review/<size>/index.md`, T(`report ${name}`)]));
}
for (const s of candidates) {
  if (s.track) {
    const m = memory[s.key];
    if (!m) memory[s.key] = { at: verdict.at, value: s.value, count: 1 };
    else if (m.at !== verdict.at) {
      const gained = typeof s.value === 'number' && typeof m.value === 'number' && s.value > m.value + 0.5;
      memory[s.key] = gained ? { at: verdict.at, value: s.value, count: 1 } : { ...m, at: verdict.at, value: s.value, count: m.count + 1 };
    }
    if (memory[s.key].count >= 3) { setAside.push(s.key); continue; }
  }
  await fs.writeFile(path.join(root, 'compare', 'status-steps.json'), JSON.stringify(memory, null, 2));
  s.run();
}
await fs.writeFile(path.join(root, 'compare', 'status-steps.json'), JSON.stringify(memory, null, 2));
if (!setAside.length) done.push('checks pass', 'review');

// ---- 8. the Next.js app ----
const nextVerdict = await json('compare-next/verdict.json');
if (!nextVerdict || Date.parse(nextVerdict.at) < Date.parse(verdict.at)) next(T(`next ${name} --verify`), `the HTML clone ${setAside.length ? 'has done all it can' : 'passes'}: generate the Next.js app and score it the same way (REPORT.next.md)`);
// worse than the HTML clone: a check the clone passes and the app does not (what the clone itself still fails is the
// clone's work, above)
const worse = (nextVerdict.checks || []).filter((c) => !c.pass && c.key !== 'review' && (verdict.checks || []).find((x) => x.key === c.key)?.pass);
if (worse.length) next(`make the Next.js app match the HTML clone: ${worse.map((c) => c.check).join(', ')}`, 'the app must equal the HTML clone within a point; change clone/ (never next/), then regenerate', [T(`next ${name} --verify`)]);
done.push('next.js');

if (setAside.length) {
  console.log(`trueclone status: ${name} (${mode})\ndone: ${done.join(', ')}\n\nEvery step left did not move after three scored tries: ${setAside.join(', ')}.\nEach one goes under ## Findings in notes.md (what blocks it, what you tried, the evidence); then hand the clone over with REPORT.md as it stands.`);
  process.exit(3);
}
console.log(`trueclone status: ${name} (${mode})\ndone: ${done.join(', ')}\n\nEvery gate passes: the deliverable is sites/${name}/REPORT.md (and REPORT.next.md). Hand it over with the clone.`);
