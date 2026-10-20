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
// App mode: a canvas app (capture: meta.canvasApp) is not a document. Its states are the checkpoints of a journey
// (journey.json: the input a visitor makes, gates included), read on the reference and scored on the clone. In exact
// mode with the owner's permission the clone is the site's own bundle (meta.bundle: nothing to port); in template mode
// the agent ports the scenes stage by stage from the recorded scene graph, shaders and the site's code.
const app = Boolean(meta.canvasApp);
const ownBundle = Boolean(meta.bundle);
if (app && !(await stat('journey.json'))) next(T(`journey ${name} --draft`), `this site is a canvas app (${meta.canvasApp.canvas}${meta.canvasApp.engine ? `, ${meta.canvasApp.engine}` : ''}): a visitor reaches its states by input (wheel, touch, a gesture, holding a button), not by scrolling a page; the draft finds that journey on the live site, gates included`, ['then read journey.json: every checkpoint a state you saw on the live site; a gate the draft could not pass, write by hand (the steps are listed at the top of scripts/journey.mjs)']);
// a dialog over the page at load (capture's warning, meta.overlays): every check would compare the clone with it, so
// it is hidden by a re-capture first; one a visitor always sees stays when Findings names it (and why)
const notesNow = await text('notes.md');
const overlays = (meta.overlays || []).filter((o) => !notesNow.includes(o.sel));
if (overlays.length) next(T(`capture ${meta.url} ${name}${meta.mode === 'exact' ? ` --mode exact --permission "${meta.permission}"` : ''}${meta.routes?.length === 1 ? ' --routes 1' : ''} --hide "${[...(meta.hide || []), ...overlays.map((o) => o.sel)].join(',')}"`), `the capture saw ${overlays.map((o) => `\`${o.sel}\` (${o.share}% of the window)`).join(', ')} over the page at load: hidden, every check compares the page itself. If visitors always see it, say so under ## Findings in notes.md naming it, and status moves on`);
done.push('capture');
const mode = meta.mode || 'template';
const reads = app ? [
  [`reference/motion.desktop.json`, `motion ${name}`, 'the animation runtime (GSAP, three.js)'],
  ['reference/journey/journey.json', `journey ${name}`, 'the reference\'s checkpoints along the journey (frames, the three.js scene, its shaders)'],
] : [
  ['reference/states/desktop.summary.json', `states ${name}`, 'the live scroll states at every size'],
  [`reference/motion.desktop.json`, `motion ${name}`, 'the animation runtime (triggers, tweens, Lenis)'],
  ['reference/desktop.spec.json', `spec ${name}`, 'measured boxes and the typography'],
  ['reference/reveals.desktop.json', `reveals ${name}`, 'one-shot reveals, scroll curves and class changes'],
  ['reference/widgets.desktop.json', `widgets ${name}`, 'tab, menu and dialog states'],
];
const missing = [];
// a read made before the current capture describes another page (a re-capture after the site changed): read again
const capturedAt = Date.parse(meta.capturedAt || 0) || 0;
for (const [f, cmd, why] of reads) {
  const st = await stat(f);
  if (!st) missing.push([cmd, why]);
  else if (st.mtimeMs < capturedAt - 1000) missing.push([cmd, `${why.replace(/^the /, 'the ')} (read before the current capture of ${meta.capturedAt.slice(0, 16).replace('T', ' ')})`]);
}
// the reference journey read again when journey.json changed after it
if (app && !missing.length) { const j = await stat('journey.json'), r = await stat('reference/journey/journey.json'); if (j && r && j.mtimeMs > r.mtimeMs + 1000) missing.push([`journey ${name}`, 'journey.json changed after the reference journey was read']); }
// the scroll states of every other route too: a read that stopped half-way (a slow route) is not done
if (!missing.length && !app) {
  const routesWithoutStates = [];
  for (const r of (meta.routes || []).filter((x) => x.slug)) if (!(await stat(`${r.dir}/states/desktop.summary.json`))) routesWithoutStates.push(r.path);
  if (routesWithoutStates.length) missing.push([`states ${name}`, `the scroll states of ${routesWithoutStates.slice(0, 3).join(', ')}${routesWithoutStates.length > 3 ? '…' : ''} are missing (the read stopped before them)`]);
}
if (missing.length) next(T(`reads ${name}`), `${missing.map(([c, why]) => `${c.split(' ')[0]}: ${why}`).join('; ')} (not read yet): the reads that only look run side by side, the reveals alone after them; only the missing ones run`, ['while it runs (in the background), read reference/scripts/INDEX.md: the site\'s scripts, ranked by what ran']);
done.push('reads');

// ---- 2. design and seed (each re-run when its inputs are newer) ----
const spec = await stat('reference/desktop.spec.json');
const tokens = await stat('design-tokens.json');
// (a canvas app has no document typography to draft a design system from: its look is the scene)
if (!app && (!tokens || !(await stat('DESIGN.md')))) next(T(`design ${name}`), 'no design system drafted yet (DESIGN.md, globals.css)');
done.push('design');
const seeded = await stat('clone/index.html');
const seedInputs = await Promise.all(['reference/reveals.desktop.json', 'reference/widgets.desktop.json', 'reference/inline-styles.json'].map(stat));
if (!seeded) next(T(`seed ${name}`), ownBundle ? 'no clone yet: the seed builds it from the site\'s own bundle (exact mode)' : 'no clone yet');
if (ownBundle && seeded && (await stat('reference/bundle/manifest.json'))?.mtimeMs > seeded.mtimeMs + 1000) next(T(`seed ${name}`), 'the reference journey recorded more of the site\'s files since the clone was built');
if (seedInputs.some((s) => s && s.mtimeMs > seeded.mtimeMs + 1000)) next(T(`seed ${name} --force`), 'reveals, widgets or the capture are newer than the clone\'s markup (clone/script.js and clone/patches/ are kept)');
done.push('seed');

// ---- 3. a brief per section, behaviours written from the site's code ----
// (a canvas app has no sections: its stages are the journey's checkpoints, and an own-bundle clone has nothing to port)
const sections = app ? [] : await json('reference/desktop.sections.json', []);
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
if (app && !ownBundle && !behaviours) next('write ## Behaviours in notes.md, one stage of the journey at a time', 'each checkpoint of journey.json (compare its frame in reference/journey/<size>/) and what draws it: the scene objects (reference/scene/<checkpoint>.json), the shader programs (reference/shaders/INDEX.md), the input that moves it, and the file:line of the site\'s code that builds it (reference/scripts/INDEX.md)', [`${T(`vendor ${name}`)} (three.js at the site's revision)`]);
if (!ownBundle && !app && (!behaviours || (scripts.listeners.length && !cites))) next('write ## Behaviours in notes.md', 'one line per behaviour (element, trigger, property, range, timing) with the file:line of the rule in reference/scripts/ (from the briefs); this is the plan script.js is written from', [`${T(`brief ${name} <n>`)} for any section you have not read`]);
if (!ownBundle && !sectionOf('Stack')) next('write ## Stack in notes.md', 'what the site is built with (reference/motion.desktop.md lists the libraries and where they live)');
done.push(`behaviours (${cites} cited)`);

// ---- 4. script.js ----
const script = await text('clone/script.js');
const ownLines = script.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//')).length;
if (!ownBundle && ownLines < 5 && (behaviours.split('\n').filter((l) => l.trim().startsWith('-')).length > 0)) next('write clone/script.js', app ? 'the stages in notes.md are not built yet: the renderer, then one stage at a time (its scene, its shaders, the input that moves it), ported from the site\'s code, sized from the window; the captured canvas gives way to yours' : 'the behaviours in notes.md are not built yet: one scene at a time, each ported from its file:line, computed from the viewport; tcOwn(\'<selector>\') first for anything the recorded players drive', [T(app ? `score ${name} --only journey` : `score ${name} --only layout,states --viewport desktop`)]);
done.push('script.js');

// ---- 5. scores, fresh ----
const verdict = await json('compare/verdict.json');
const changed = Math.max(await newest('clone'), (await stat('interactions.json'))?.mtimeMs || 0);
const failingChecks = (verdict?.checks || []).filter((c) => !c.pass && c.key !== 'review');
if (!verdict) next(T(`score ${name}`), 'not scored yet: every check at every size (the first full score takes a while; later ones re-measure only what changed)');
if (Date.parse(verdict.at) < changed - 1000) {
  if (failingChecks.length) {
    // what each failing check is measured by (routes by layout and states; notes and coverage are read, not measured)
    const keys = [...new Set(failingChecks.flatMap((c) => ({ journey: ['journey'], layout: ['layout'], scroll: ['states'], canvases: ['states'], routes: ['layout', 'states'], interactions: ['interact'], hovers: ['hovers'], detail: ['detail'], load: ['load'], motion: ['curves'], notes: [], coverage: [] }[c.key] || [c.key])))];
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
const order = ['journey', 'layout', 'coverage', 'scroll', 'canvases', 'routes', 'interactions', 'load', 'detail', 'hovers', 'motion'];
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
  // (a canvas app's frames are its journey's checkpoints, shot by every score: compare/review/journey-<size>/)
  if (!app) for (const size of ['wide', 'laptop', 'desktop', 'tablet', 'mobile']) if (!(await stat(`compare/review/${size}/frames.json`))) add(`review-size:${size}`, null, () => next(T(`review ${name} --size ${size}`), `no side-by-side frames at ${size} yet: the clone is judged by eye at every size`, ['look at every sheet and give every frame a verdict under ## Review in notes.md, with its token from index.md ("- <frame> <size> [<token>]: same" or "... : differs: <what>")']), false);
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
  } else if (c.key === 'journey') {
    // the worst checkpoint of the journey: its frames side by side, then what draws it
    const rep = await json('compare/journey/report.json', { viewports: [] });
    const w = (rep.viewports || []).map((v) => ({ vp: v.viewport, ...(v.worst || {}) })).filter((x) => x.name).sort((a, b) => a.match - b.match)[0];
    const file = w ? `compare/review/journey-${w.vp}/${String(w.i).padStart(2, '0')}-${String(w.name).replace(/[^a-z0-9-]+/gi, '-').slice(0, 40)}.png` : null;
    add(`journey:${w?.vp || ''}:${w?.name || ''}`, w?.match ?? f.value, () => next(w ? `make checkpoint "${w.name}" (${w.vp}) look like the reference: ${file}` : 'make the journey match the reference', ownBundle
      ? `the site's own code shows something else here (${w?.match ?? '-'}%): a file it asked for was not recorded (a 404 in the browser console, compare/journey/), or it depends on what the bundle stubs (a backend answer, the time); look at the frame, then record the missing stage again with ${T(`journey ${name}`)} and ${T(`seed ${name}`)}`
      : `${w?.match ?? '-'}% like the reference (canvas ${w?.canvas ?? '-'}%, pixels ${w?.pixels ?? '-'}%): the scene at this stage is reference/scene/ ${w ? `(the checkpoint's file)` : ''}, its programs reference/shaders/INDEX.md`, [`after the fix: ${T(`score ${name} --only journey`)}`]));
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
    // every failing route, worst first, one step each (keyed by the route: its worst size can change between scores)
    const byRoute = new Map();
    for (const w of c.failing) if (!byRoute.has(w.route)) byRoute.set(w.route, w);
    for (const w of byRoute.values()) {
      const size = w.viewport || 'desktop';
      add(`routes:${w.route}`, w.value, () => next(w.value === null ? T(`score ${name} --only layout,states`) : T(`review ${name} --route ${w.route} --size ${size}`), w.value === null ? `route ${w.route} has not been scored yet` : `route ${w.route}: ${w.check} at ${size} is ${w.value}${byRoute.size > 1 ? ` (${byRoute.size} routes below target: ${[...byRoute.keys()].join(', ')})` : ''}`, [T(`brief ${name} --route ${w.route}`), `after the fix: ${T(`score ${name} --only layout,states`)}`]));
    }
  } else if (c.key === 'interactions') {
    // every failing scenario is its own step (one key per scenario), worst first; a scenario that failed only because
    // the instrument could not run it is not the clone's work: it goes to Findings with the error
    const rep = await json('compare/interact/report.json', { scenarios: [] });
    const bad = rep.scenarios.filter((s) => !s.notBehaviour && s.expect && !s.expect.pass).sort((a, b) => (a.score ?? -1) - (b.score ?? -1));
    const names = bad.map((s) => s.name);
    for (const s of bad) {
      const toolOnly = s.broken || (s.errors || []).length > 0 && (s.errors || []).every((e) => /^reference:/.test(e));
      if (toolOnly) add(`interactions:${s.name}`, null, () => next(`write under ## Findings in notes.md why "${s.name}" cannot be measured, or rewrite it in interactions.json`, `the scenario could not run on the reference (${(s.errors || []).slice(0, 2).join('; ')}): an instrument problem, not the clone's; a scenario of yours with the same name replaces it, and { "name": "${s.name}", "skip": "<why>" } retires it`, [`then ${T(`score ${name} --only interact`)}`]));
      else add(`interactions:${s.name}`, s.score ?? null, () => next(`make "${s.name}" behave like the reference`, `${s.expect.ref && s.expect.clone === false ? 'it changes on the reference and does nothing on the clone' : `the clone ends in a different state (${s.score ?? '-'}% like the reference)`}${(s.errors || []).length ? `; ${s.errors.slice(0, 2).join('; ')}` : ''}${names.length > 1 ? ` (${names.length} scenarios failing: ${names.slice(0, 5).join(', ')}${names.length > 5 ? '…' : ''})` : ''}`, [T(`brief ${name}`) + ' (find the section it is in; its brief has the handler file:line)', `after the fix: ${T(`score ${name} --only interact`)}`]));
    }
  } else {
    add(`${c.key}:${vp}`, f.value ?? null, () => next(`fix ${c.check} at ${vp} (${f.value ?? 'below target'})`, `${c.check} is below its target; REPORT.md "Fix first" lists where`, [T(`explain ${name} <y> --viewport ${vp}`), `after the fix: ${T(`score ${name} --only ${{ hovers: 'hovers', detail: 'detail', load: 'load', motion: 'curves' }[c.key] || c.key}`)}`]));
  }
}
// scroll curves recorded on the reference are motion to score: a map pairs them with the clone's elements (in a
// seeded clone the same ones, so the draft is the map)
const curvesRecorded = ((await json('reference/reveals.desktop.json'))?.scrubs || []).length;
if (curvesRecorded && !(await stat('motion-map.json'))) add('motion-map', null, () => next(T(`curves ${name} --draft`), `${curvesRecorded} scroll curve(s) were recorded on the reference and none is scored yet: the map pairs each with the clone's element`, [`then ${T(`score ${name} --only curves`)}`]), false);
if (reviewCheck && !reviewCheck.pass) {
  const open = reviewCheck.failing.filter((f) => !f.verdict);
  if (open.length) add('review-verdicts', -open.length, () => next(`write review verdicts in notes.md for ${open.length} frame(s) (${open.slice(0, 3).map((f) => `${f.frame} ${f.viewport}`).join(', ')}…)`, 'every frame needs a verdict; "differs" is fixed, "same" closes it', [`look at compare/review/<size>/index.md`, T(`report ${name}`)]));
}
// A try is the step status issued last, worked on (the clone changed after it was issued) and measured again (a newer
// score): only then is it counted, as a gain (its count starts over) or not. Re-scoring an unchanged clone, or work
// on another step, counts for nothing, so a step is set aside only after three real attempts at it.
const last = memory.__last;
if (last && !last.key.startsWith('next:') && last.at !== verdict.at && changed > last.cloneAt + 1000) {
  const nowStep = candidates.find((c) => c.key === last.key);
  if (!nowStep) delete memory[last.key]; // fixed
  else {
    const m = memory[last.key] || { count: 0, value: last.value };
    const gained = typeof nowStep.value === 'number' && typeof m.value === 'number' && nowStep.value > m.value + 0.5;
    memory[last.key] = gained ? { count: 0, value: nowStep.value } : { count: (m.count || 0) + 1, value: nowStep.value };
  }
  delete memory.__last;
}
const saveMemory = () => fs.writeFile(path.join(root, 'compare', 'status-steps.json'), JSON.stringify(memory, null, 2));
for (const s of candidates) {
  if (s.track && (memory[s.key]?.count || 0) >= 3) { setAside.push(s.key); continue; }
  memory.__last = s.track ? { key: s.key, at: verdict.at, cloneAt: changed, value: s.value } : undefined;
  await saveMemory();
  s.run();
}
delete memory.__last;
await saveMemory();
if (!setAside.length) done.push('checks pass', 'review');

// ---- 8. the Next.js app ----
const nextVerdict = await json('compare-next/verdict.json');
// the app is stale when the clone changed after it was verified (notes.md, Findings and verdicts do not count)
if (!nextVerdict || Date.parse(nextVerdict.at) < changed - 1000) next(T(`next ${name} --verify`), `the HTML clone ${setAside.length ? 'has done all it can' : 'passes'}: generate the Next.js app and score it the same way (REPORT.next.md), and look at it next to the original`);
// The app equals the clone within a point: every check at every size, every route, every scenario, every review frame
// the verify shot of the app. A random route (meta.routes[].unstable) cannot be compared draw for draw and is left out.
const gaps = [];
const pair = (what, a, b, slack = 1) => { if (typeof a === 'number' && typeof b === 'number' && b < a - slack) gaps.push(`${what}: app ${b} vs clone ${a}`); };
const unstableRoutes = new Set((meta.routes || []).filter((r) => r.unstable).map((r) => r.path));
for (const [file, label] of [['report.mask.json', 'layout'], ['states/report.mask.json', 'scroll states']]) {
  const a = await json(`compare/${file}`), b = await json(`compare-next/${file}`);
  for (const v of a?.viewports || []) pair(`${label} ${v.viewport}`, v.match, b?.viewports?.find((x) => x.viewport === v.viewport)?.match);
  for (const r of a?.routes || []) if (!unstableRoutes.has(r.path)) for (const v of r.viewports || []) pair(`${label} ${r.path} ${v.viewport}`, v.match, b?.routes?.find((x) => x.path === r.path)?.viewports?.find((x) => x.viewport === v.viewport)?.match);
}
{
  const a = await json('compare/detail.json'), b = await json('compare-next/detail.json');
  for (const v of a?.viewports || []) pair(`detail ${v.viewport}`, v.score, b?.viewports?.find((x) => x.viewport === v.viewport)?.score);
  const ha = await json('compare/hovers.desktop.json'), hb = await json('compare-next/hovers.desktop.json');
  pair('hovers desktop', ha?.score, hb?.score);
  const la = await json('compare/load.json'), lb = await json('compare-next/load.json');
  for (const v of la?.viewports || []) pair(`load ${v.viewport}`, v.score, lb?.viewports?.find((x) => x.viewport === v.viewport)?.score, 2);
  const ia = await json('compare/interact/report.json'), ib = await json('compare-next/interact/report.json');
  for (const s of ia?.scenarios || []) {
    if (s.notBehaviour || (s.path && unstableRoutes.has(s.path))) continue;
    const t = ib?.scenarios?.find((x) => x.name === s.name);
    if (s.expect?.pass && t && !t.expect?.pass) gaps.push(`"${s.name}": passes on the clone, fails on the app (${(t.errors || []).slice(0, 1).join('') || `${t.score}%`})`);
    else pair(`"${s.name}"`, s.score, t?.score);
  }
  // the app's own review frames (next --verify shoots them against the original): a frame where the app is further
  // from the original than the clone is shows something the clone does not
  for (const size of ['wide', 'mobile']) {
    const fa = await json(`compare/review/${size}/frames.json`), fb = await json(`compare-next/review/${size}/frames.json`);
    for (const f of fb?.frames || []) pair(`review frame ${f.id} ${size}`, fa?.frames?.find((x) => x.id === f.id)?.pct, f.pct, 2);
  }
}
// a try at the app: issued last, the clone changed after, the app verified again
if (last?.key === 'next:equal' && nextVerdict.at !== last.at && changed > last.cloneAt + 1000) memory['next:equal'] = { count: (memory['next:equal']?.count || 0) + 1 };
if (!gaps.length) delete memory['next:equal'];
await saveMemory();
if (gaps.length) {
  const key = 'next:equal';
  const m = memory[key];
  if ((m?.count || 0) < 3) {
    memory.__last = { key, at: nextVerdict.at, cloneAt: changed, value: null };
    await saveMemory();
    next(`make the Next.js app match the HTML clone: ${gaps.slice(0, 4).join('; ')}${gaps.length > 4 ? ` (+${gaps.length - 4} more)` : ''}`, 'the app must equal the HTML clone within a point, everywhere; a difference only the app has is fixed in clone/ (never next/) or, when it is the generator\'s, written under ## Findings with evidence', [T(`next ${name} --verify`), 'compare-next/review/<size>/ shows the app next to the original']);
  }
  setAside.push(key);
}
done.push('next.js');

if (setAside.length) {
  console.log(`trueclone status: ${name} (${mode})\ndone: ${done.join(', ')}\n\nEvery step left did not move after three scored tries: ${setAside.join(', ')}.\nEach one goes under ## Findings in notes.md (what blocks it, what you tried, the evidence); then hand the clone over with REPORT.md as it stands.`);
  process.exit(3);
}
console.log(`trueclone status: ${name} (${mode})\ndone: ${done.join(', ')}\n\nEvery gate passes: the deliverable is sites/${name}/REPORT.md (and REPORT.next.md). Hand it over with the clone.`);
