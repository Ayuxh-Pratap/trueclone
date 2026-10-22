// Where a clone stands and the one thing to do next, worked out from the files in sites/<name>/ alone, so any agent
// (any model) follows the same path: capture and its reads, design, seed, a brief per section, behaviours written
// with the site's file:line, script.js, then the measured loop: every required result (verdict.mjs) measured on the
// clone as it is now, the failing ones worked as objectives (loop.mjs) until each passes or is concluded, the review
// by eye, and the Next.js app verified as the delivered artifact.
//
// Exit codes (docs/policy.md "Outcomes"):
//   0  Verified     every required result passes on the clone and on the Next.js app as they are now
//   1  work left    the next step is printed; do it and run status again
//   2  Blocked      the tool or the environment cannot measure what is required (the cause and what to do are printed)
//   3  Incomplete   the loop concluded with differences left: each is listed with its best and current values
// Running status is idempotent: it never counts as an attempt, and it can be run any number of times.
//
// usage: trueclone status <name>
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, siteDir, bundleIntegrity } from './lib.mjs';
import { evaluate, unitName, ORDER } from './verdict.mjs';
import { envIdentity, refIdOf, toolVersion } from './identity.mjs';
import { loadLoop, saveLoop, observe, nextObjective, recordActivity, objectiveKey } from './loop.mjs';

const { pos } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) { console.error('usage: trueclone status <name>'); process.exit(1); }
const root = siteDir(name);
const T = (s) => `npx trueclone ${s}`;
const stat = (p) => fs.stat(path.join(root, p)).catch(() => null);
const json = (p, d = null) => fs.readFile(path.join(root, p), 'utf8').then(JSON.parse).catch(() => d);
const text = (p) => fs.readFile(path.join(root, p), 'utf8').catch(() => '');

const done = [];
let loopRef = null;
const next = async (cmd, why, then = []) => {
  console.log(`trueclone status: ${name}${meta?.mode ? ` (${meta.mode})` : ''}`);
  if (done.length) console.log(`done: ${done.join(', ')}`);
  console.log(`\nnext: ${cmd}\n  why: ${why}`);
  for (const t of then) console.log(`  then: ${t}`);
  if (loopRef) await saveLoop(root, loopRef);
  console.log(`\nWork is left. Do the next step, then run \`${T(`status ${name}`)}\` again. Do not end your turn or ask whether to continue while status says work is left. A suspected tool defect is never a reason to stop: status routes what the tool cannot measure itself (exit 2 or 3), never to you as clone work.`);
  process.exit(1);
};
const outcomeFile = path.join(root, 'compare', 'outcome.json');
const writeOutcome = async (o) => { await fs.mkdir(path.dirname(outcomeFile), { recursive: true }); await fs.writeFile(outcomeFile, JSON.stringify({ ...o, at: new Date().toISOString() }, null, 2)); };
const renderReport = () => spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'report.mjs'), name], { stdio: 'ignore' });

// status never ends in a crash. A failure of trueclone itself (a bug in a check's bookkeeping, a file it cannot read)
// is Blocked, owned by the tool, with the error and how to resume: Node's own crash exits 1, which an agent reads as
// "work left" and would answer by re-running status forever (RC5 zero: loop.mjs failed on a review frame)
let crashing = false;
const crashed = async (e) => {
  if (crashing) process.exit(2);
  crashing = true;
  const msg = String(e?.stack || e).split('\n').slice(0, 3).join(' | ');
  await writeOutcome({ outcome: 'blocked', owner: 'tool', why: `trueclone itself failed: ${msg}`, error: String(e?.stack || e), tool: toolVersion(), next: 'report this error to the trueclone maintainers with sites/<name>/compare/outcome.json; do not edit the installed package. Once a fixed version is installed, run status again', resume: `${T(`status ${name}`)} (everything done so far is kept)` }).catch(() => {});
  renderReport();
  console.log(`trueclone status: ${name}\n\nBlocked: trueclone itself failed (a defect in the tool, not in the clone):\n  ${msg}\nNothing more can be done in this run until trueclone is fixed; everything done so far is kept. Report this error (it is in sites/${name}/compare/outcome.json and REPORT.md), and once a fixed version is installed run \`${T(`status ${name}`)}\` again to resume. Do not edit the installed package.`);
  process.exit(2);
};
process.on('uncaughtException', crashed);
process.on('unhandledRejection', crashed);

// ---- 1. capture and what it reads ----
const meta = await json('reference/meta.json');
if (!meta) await next(T(`capture <url> ${name}`), 'nothing captured yet (add --mode exact --permission "<owner>" only with the owner\'s permission)');
// a capture that did not finish (no completion mark) is not a reference: it is captured again (capture.mjs)
// capture again with the site's own settings (an exact-mode site stays exact, with its permission; its hide list,
// cookies, locale, routes and hand-made exclusions and inclusions are kept)
const recapture = () => T(`capture ${meta.url} ${name}${meta.mode === 'exact' ? ` --mode exact --permission "${meta.permission}"` : ''}${(meta.hide || []).length ? ` --hide "${meta.hide.join(',')}"` : ''}${(meta.cookies || []).length ? ` --cookie "${meta.cookies.map((c) => `${c.name}=${c.value}`).join('; ')}"` : ''}${meta.locale && meta.locale !== 'en-US' ? ` --locale ${meta.locale}` : ''}${(meta.routes || []).length > 1 ? ` --routes ${meta.routes.length}` : ''}${(meta.ignore || []).filter((i) => !i.auto).length ? ` --ignore "${meta.ignore.filter((i) => !i.auto).map((i) => i.sel).join(',')}"` : ''}${(meta.thirdParty || []).filter((t) => /--include/.test(t.decision || '')).length ? ` --include "${meta.thirdParty.filter((t) => /--include/.test(t.decision || '')).map((t) => t.sel).join(',')}"` : ''}${meta.bundle && !meta.canvasApp ? ' --bundle' : ''}`);
if (meta.complete === false) await next(recapture(), 'the last capture did not finish (crashed or stopped part-way): a partial reference is never measured against');
// a reference captured before symmetric measurement (rc.5: the same seed, clock and motion setting on both sides, loops
// held at an equal non-zero time) was shot under other conditions than every clone measurement now: captured again
if (!meta.stabilise) await next(recapture(), 'the reference was captured before symmetric measurement (rc.5: the same seed, clock and motion setting on both sides): every comparison with it would be uneven');
// App mode: a canvas app (capture: meta.canvasApp) is not a document. Its states are the checkpoints of a journey
// (journey.json: the input a visitor makes, gates included), read on the reference and scored on the clone.
const app = Boolean(meta.canvasApp);
const ownBundle = Boolean(meta.bundle);
if (app && !(await stat('journey.json'))) await next(T(`journey ${name} --draft`), `this site is a canvas app (${meta.canvasApp.canvas}${meta.canvasApp.engine ? `, ${meta.canvasApp.engine}` : ''}): a visitor reaches its states by input (wheel, touch, a gesture, holding a button), not by scrolling a page; the draft finds that journey on the live site, gates included`, ['then read journey.json: every checkpoint a state you saw on the live site; a gate the draft could not pass, write by hand (the steps are listed at the top of scripts/journey.mjs)']);
// a dialog over the page at load (capture's warning, meta.overlays): every check would compare the clone with it, so
// it is hidden by a re-capture first; one a visitor always sees stays when Findings names it (and why)
const notesNow = await text('notes.md');
const overlays = (meta.overlays || []).filter((o) => !notesNow.includes(o.sel));
if (overlays.length) await next(T(`capture ${meta.url} ${name}${meta.mode === 'exact' ? ` --mode exact --permission "${meta.permission}"` : ''}${meta.routes?.length === 1 ? ' --routes 1' : ''} --hide "${[...(meta.hide || []), ...overlays.map((o) => o.sel)].join(',')}"`), `the capture saw ${overlays.map((o) => `\`${o.sel}\` (${o.share}% of the window)`).join(', ')} over the page at load: hidden, every check compares the page itself. If visitors always see it, say so under ## Findings in notes.md naming it, and status moves on`);
// third-party widgets found at capture that differ between loads (an assistant, a chat): excluded on both sides by
// default (docs/policy.md); one the user wants in the clone is included with capture --include "<selector>"
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
  else if (st.mtimeMs < capturedAt - 1000) missing.push([cmd, `${why} (read before the current capture of ${meta.capturedAt.slice(0, 16).replace('T', ' ')})`]);
}
if (app && !missing.length) { const j = await stat('journey.json'), r = await stat('reference/journey/journey.json'); if (j && r && j.mtimeMs > r.mtimeMs + 1000) missing.push([`journey ${name}`, 'journey.json changed after the reference journey was read']); }
// the scroll states of every route at every size: a read that stopped half-way is not done
if (!missing.length && !app) {
  const gaps = [];
  for (const r of meta.routes?.length ? meta.routes : [{ path: '/', slug: '', dir: 'reference' }]) for (const v of ['desktop', 'tablet', 'mobile', 'laptop', 'wide']) if (!(await stat(`${r.dir || 'reference'}/states/${v}.json`))) gaps.push(`${r.path} ${v}`);
  if (gaps.length) missing.push([`states ${name}`, `the scroll states of ${gaps.slice(0, 3).join(', ')}${gaps.length > 3 ? '…' : ''} are missing (the read stopped before them)`]);
}
if (missing.length) await next(T(`reads ${name}`), `${missing.map(([c, why]) => `${c.split(' ')[0]}: ${why}`).join('; ')} (not read yet): the reads that only look run side by side, the reveals alone after them; only the missing ones run`, ['while it runs (in the background), read reference/scripts/INDEX.md: the site\'s scripts, ranked by what ran']);
done.push('reads');
// the reference against itself, before any clone work (PLAN.md 5.4 validity gate): every bar is set from it, and a
// frame the reference varies on is known before the loop spends time on it
const noiseRec = await json('reference/noise.json');
// the reference's own reads that the calibration replays (its states, an app's reference journey) read again after it
// was made: it describes reference frames that are gone (RC5 zero: the journey re-recorded to complete the bundle)
const readAfter = Math.max((await stat(app ? 'reference/journey/journey.json' : 'reference/states/desktop.json'))?.mtimeMs || 0, 0);
const noiseOld = noiseRec && Date.parse(noiseRec.at || 0) < readAfter - 1000;
if (!noiseRec || noiseRec.refId !== refIdOf(meta) || noiseOld) await next(T(`calibrate ${name}`), `${noiseOld ? 'the reference was read again after the calibration' : noiseRec ? 'the calibration belongs to an earlier capture' : 'the reference has not been measured against itself yet'}: two more loads of the live page through the same checks set the bar of every frame (reference/noise.json); about ${app ? '10' : '5-15'} minutes, once per capture`, ['while it runs (in the background), read reference/scripts/INDEX.md']);
done.push('calibrated');
// the site's own files, whole (own bundle: the clone runs them). A file the recorder could not get is recorded as failed
// (lib.mjs recordBundle); a bundle from rc.5 may hold empty files. The reference journey records every file again, once;
// a file still missing after that cannot be fixed by the clone's work: Blocked, the files named, the work kept
if (ownBundle) {
  const integrity = await bundleIntegrity(path.join(root, 'reference'));
  const tried = await json('compare/bundle-rerecord.json');
  const manifestAt = (await stat('reference/bundle/manifest.json'))?.mtimeMs || 0;
  if (integrity.problems.length) {
    const list = integrity.problems.slice(0, 8).map((p) => `${p.url.replace(/^https?:\/\//, '')} (${p.why})`).join('; ');
    if (!tried || Date.parse(tried.at) > manifestAt) {
      await fs.mkdir(path.join(root, 'compare'), { recursive: true });
      await fs.writeFile(path.join(root, 'compare', 'bundle-rerecord.json'), JSON.stringify({ at: new Date().toISOString(), problems: integrity.problems }, null, 1));
      await next(T(`journey ${name}`), `${integrity.problems.length} of the site's ${integrity.entries} recorded files are not whole: ${list}${integrity.problems.length > 8 ? '…' : ''}. The reference journey loads the app again and records every file it asks for (each checked, and recovered when the browser does not hand it over)`, [T(`status ${name}`)]);
    }
    await writeOutcome({ outcome: 'blocked', owner: 'tool', why: `${integrity.problems.length} of the site's own files could not be recorded, after the reference journey recorded them again: ${list}`, next: 'the clone cannot run without them (no change to the clone can supply them). Check that the site serves them to this machine (open one of the addresses in a browser); if it does, report this with sites/<name>/reference/bundle/manifest.json', resume: `${T(`journey ${name}`)}, then ${T(`status ${name}`)} (everything done so far is kept)`, problems: integrity.problems });
    renderReport();
    console.log(`trueclone status: ${name}\n\nBlocked: ${integrity.problems.length} of the site's own files could not be recorded, after a second recording: ${list}\nNo change to the clone can supply them. What to do: check that the site serves them to this machine; if it does, report it with sites/${name}/reference/bundle/manifest.json. Everything done so far is kept; ${T(`journey ${name}`)} then ${T(`status ${name}`)} resumes.`);
    process.exit(2);
  }
  await fs.rm(path.join(root, 'compare', 'bundle-rerecord.json'), { force: true });
  done.push(`bundle (${integrity.entries} files whole)`);
}

// ---- 2. design and seed (each re-run when its inputs are newer) ----
const tokens = await stat('design-tokens.json');
if (!app && (!tokens || !(await stat('DESIGN.md')))) await next(T(`design ${name}`), 'no design system drafted yet (DESIGN.md, globals.css)');
done.push('design');
const seeded = await stat('clone/index.html');
// a seed that did not finish (its browser pass crashed) leaves no completion record: the clone is not seeded
const seedRecord = await json('clone/.seed.json');
const seedInputs = await Promise.all(['reference/reveals.desktop.json', 'reference/widgets.desktop.json', 'reference/inline-styles.json'].map(stat));
if (!seeded) await next(T(`seed ${name}`), ownBundle ? 'no clone yet: the seed builds it from the site\'s own bundle (exact mode)' : 'no clone yet');
if (!ownBundle && (!seedRecord || seedRecord.capturedAt !== meta.capturedAt)) await next(T(`seed ${name} --force`), seedRecord ? 'the clone was seeded from an earlier capture' : 'the last seed did not complete (no clone/.seed.json): the clone\'s markup may be half-made; seeding again keeps clone/script.js and clone/patches/');
if (ownBundle && seeded && (await stat('reference/bundle/manifest.json'))?.mtimeMs > seeded.mtimeMs + 1000) await next(T(`seed ${name}`), 'the reference journey recorded more of the site\'s files since the clone was built');
if (seedInputs.some((s) => s && s.mtimeMs > seeded.mtimeMs + 1000)) await next(T(`seed ${name} --force`), 'reveals, widgets or the capture are newer than the clone\'s markup (clone/script.js and clone/patches/ are kept)');
done.push('seed');

// ---- 3. a brief per section, behaviours written from the site's code ----
const sections = app ? [] : await json('reference/desktop.sections.json', []);
const briefs = [];
for (let i = 1; i <= sections.length; i++) if (await stat(`compare/brief/desktop-${i}.md`)) briefs.push(i);
const unbriefed = sections.map((_, i) => i + 1).filter((i) => !briefs.includes(i));
if (unbriefed.length) await next(T(`brief ${name} ${unbriefed[0]}`), `section ${unbriefed[0]} of ${sections.length} has not been read yet: its brief lists the site's handlers (file:line), recorded motion and what a visitor operates there`, [`one section at a time, then write its behaviours in notes.md (## Behaviours, each citing a file:line from the brief)`, `${T(`brief ${name}`)} lists every section and its evidence`]);
done.push(`briefs ${briefs.length}/${sections.length}`);
const notes = await text('notes.md');
const sectionOf = (h) => (notes.split(/^## /m).find((s) => s.toLowerCase().startsWith(h.toLowerCase())) || '').replace(/<!--[\s\S]*?-->/g, '').split('\n').slice(1).join('\n').trim();
const scripts = await json('reference/scripts/scripts.json', { listeners: [] });
const behaviours = sectionOf('Behaviours');
const cites = (behaviours.match(/[\w.-]+\.js:\d+/g) || []).length;
if (app && !ownBundle && !behaviours) await next('write ## Behaviours in notes.md, one stage of the journey at a time', 'each checkpoint of journey.json (compare its frame in reference/journey/<size>/) and what draws it: the scene objects (reference/scene/<checkpoint>.json), the shader programs (reference/shaders/INDEX.md), the input that moves it, and the file:line of the site\'s code that builds it (reference/scripts/INDEX.md)', [`${T(`vendor ${name}`)} (three.js at the site's revision)`]);
if (!ownBundle && !app && (!behaviours || (scripts.listeners.length && !cites))) await next('write ## Behaviours in notes.md', 'one line per behaviour (element, trigger, property, range, timing) with the file:line of the rule in reference/scripts/ (from the briefs); this is the plan script.js is written from', [`${T(`brief ${name} <n>`)} for any section you have not read`]);
if (!ownBundle && !sectionOf('Stack')) await next('write ## Stack in notes.md', 'what the site is built with (reference/motion.desktop.md lists the libraries and where they live)');
done.push(`behaviours (${cites} cited)`);

// ---- 4. script.js ----
const script = await text('clone/script.js');
const ownLines = script.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//')).length;
if (!ownBundle && ownLines < 5 && (behaviours.split('\n').filter((l) => l.trim().startsWith('-')).length > 0)) await next('write clone/script.js', app ? 'the stages in notes.md are not built yet: the renderer, then one stage at a time (its scene, its shaders, the input that moves it), ported from the site\'s code, sized from the window; the captured canvas gives way to yours' : 'the behaviours in notes.md are not built yet: one scene at a time, each ported from its file:line, computed from the viewport; tcOwn(\'<selector>\') first for anything the recorded players drive', [T(app ? `score ${name} --only journey` : `score ${name} --only layout,states --viewport desktop`)]);
done.push('script.js');

// ---- 5. the reference and the instrument are valid (nothing is measured against a broken one) ----
const env = envIdentity();
const ev = await evaluate(root, { side: 'clone' });
const loop = await loadLoop(root, ev.refId);
loopRef = loop;
const elapsed = recordActivity(loop);
const blocked = async (why, what, data = {}) => {
  await writeOutcome({ outcome: 'blocked', why, next: what, resume: `fix the cause, then ${T(`status ${name}`)} (everything done so far is kept)`, subjectHash: ev.subjectHash, elapsed, ...data });
  await saveLoop(root, loop);
  renderReport();
  console.log(`trueclone status: ${name} (${mode})\ndone: ${done.join(', ')}\n\nBlocked: ${why}\nWhat to do: ${what}\nEverything done so far is kept (REPORT.md has the details); after fixing the cause, run ${T(`status ${name}`)} again to resume.`);
  process.exit(2);
};
if (env.instrumentModified) await blocked(`the instrument is modified in this environment (${env.reasons.join('; ')}): nothing measured here could be trusted`, 'unset NODE_OPTIONS (or remove the edited package files and reinstall @trueclone/cli), then run status again');
const drift = await json('compare/drift.json');
if (drift?.refId === ev.refId && drift.stale) await next(recapture(), 'the live site has changed since the capture (drift, seen on two loads): every result would compare the clone with a page that no longer exists; capture again (the clone, notes and patches are kept)');
if (drift?.refId === ev.refId && drift.unreachable?.length) {
  loop.errors.drift = (loop.errors.drift || 0) + 1;
  if (loop.errors.drift >= 2) await blocked(`the live site does not load (${drift.viewports.find((v) => v.unreachable)?.unreachable}) at ${drift.unreachable.join(', ')}: the reference cannot be measured`, `check the network and that ${meta.url} opens in a browser here (a sandbox with no network access cannot reach it), then run status again`);
  await next(T(`score ${name} --only drift`), 'the live site did not load the last time it was checked: checked once more before anything else');
} else delete loop.errors.drift;
observe(loop, ev, notes, root);
// the clone lint (verdict.mjs): an excluded widget kept, the measurement's controls built in, animations stopped that the
// site runs; read from the files, so it is fixed before anything is measured on them
if (ev.lint?.findings.length) { await saveLoop(root, loop); await next(`fix the clone: ${ev.lint.findings[0].file}`, ev.lint.findings.map((f) => `${f.file} ${f.what}`).join('; '), [T(`status ${name}`)]); }

// ---- 6. every required result measured on the clone as it is now ----
const LABEL_OF = { layout: 'layout', 'layout-real': 'layout-real', scroll: 'states', canvas: 'states', curves: 'curves', interact: 'interact', hovers: 'hovers', detail: 'detail', load: 'load', journey: 'journey' };
const unitIdOf = (u) => `${u.check}:${u.route}:${u.viewport}:${u.state}`;
const TOOL_ERR = /reference|live site|capture|did not load|HTTP \d|re-capture|reads/i;
const scoreCmd = (us) => {
  const checks = [...new Set(us.map((u) => LABEL_OF[u.check] || u.check))];
  const vps = [...new Set(us.map((u) => u.viewport).filter(Boolean))];
  return T(`score ${name} --only ${checks.join(',')}${vps.length === 1 && checks.every((c) => !['interact', 'hovers'].includes(c)) ? ` --viewport ${vps[0]}` : ''}`);
};
const real = ev.units.filter((u) => !u.plan);
const neverScored = real.length && real.every((u) => u.status === 'missing');
if (neverScored) await next(T(`score ${name}`), 'not scored yet: every required result, at every size (the first full score takes a while; later ones re-measure only what changed)');
// errors: measured once more; the same error again on the same content is the tool's or the environment's (a
// reference that does not load: Blocked) or the clone's (a clone page that does not load: an objective)
const errs = ev.units.filter((u) => u.status === 'error');
for (const u of errs) {
  const id = unitIdOf(u);
  const seen = loop.errors[id];
  if (seen?.subjectHash === ev.subjectHash && seen.count >= 1) {
    if (TOOL_ERR.test(u.reason || '')) await blocked(`${unitName(u)} cannot be measured: ${u.reason}`, /capture|re-capture|reads/i.test(u.reason) ? `${recapture()} (the reference is incomplete), then status` : 'check the network and the browser (npx trueclone doctor), then run status again');
  }
}
const toRemeasure = ev.units.filter((u) => !u.plan && ['missing', 'invalid', 'error'].includes(u.status) && !(u.status === 'error' && loop.errors[unitIdOf(u)]?.subjectHash === ev.subjectHash && loop.errors[unitIdOf(u)].count >= 1));
const pend = loop.pending;
const pendingUnits = pend && pend.side === 'clone' && pend.kind === 'unit' ? ev.units.filter((u) => !u.plan && u.check === pend.check && u.status === 'stale') : [];
// stale results that were failing (the work in progress) are re-measured now; stale results that were passing wait for
// the final sweep, so a change is not followed by re-measuring everything that never moves (docs/policy.md "Time")
const staleFailing = ev.units.filter((u) => !u.plan && u.status === 'stale' && u.prior === 'fail');
const measureNow = [...toRemeasure, ...pendingUnits, ...staleFailing];
if (measureNow.length) {
  for (const u of measureNow.filter((x) => x.status === 'error')) loop.errors[unitIdOf(u)] = { subjectHash: ev.subjectHash, count: (loop.errors[unitIdOf(u)]?.count || 0) + 1 };
  const invalidWhy = measureNow.find((u) => u.status === 'invalid')?.reason;
  await next(scoreCmd(measureNow), `${measureNow.length} required result(s) are not measured on the clone as it is now: ${[...new Set(measureNow.map((u) => `${u.status}${u.status === 'invalid' && invalidWhy ? ` (${invalidWhy})` : ''}`))].join(', ')} (${measureNow.slice(0, 3).map(unitName).join('; ')}${measureNow.length > 3 ? '…' : ''})`, pend ? [`it measures the last change to ${loop.objectives[pend.key]?.label || pend.key}`] : []);
}
done.push('measured');

// ---- 7. the review by eye: right after the first full score, before fixing anything (what a person sees first) ----
const rv = ev.review;
for (const d of rv.missingDirs) {
  if (app) await next(T(`score ${name} --only journey`), 'the journey\'s review frames are made by its score');
  await next(T(`review ${name}${d.route ? ` --route ${d.route}` : ''} --size ${d.size}`), `no side-by-side frames at ${d.size}${d.route ? ` for ${d.route}` : ''} yet: the clone is judged by eye at every size`, ['look at every sheet and give every frame a verdict under ## Review in notes.md, with its token from index.md ("- <frame> <size> [<token>]: same" or "... : differs: <what>")']);
}
const unverdicted = rv.frames.filter((f) => f.state === 'open');
if (unverdicted.length) await next(`write review verdicts in notes.md for ${unverdicted.length} frame(s) (${unverdicted.slice(0, 3).map((f) => `${f.id} ${f.size}`).join(', ')}${unverdicted.length > 3 ? '…' : ''})`, `every frame needs a verdict from looking at it: "same" (with the reason below 85%), "differs: <what>", or "tool: <why>" with evidence made for that frame (${unverdicted[0].why})`, ['look at compare/review/<size>/index.md and its sheets']);
for (const t of rv.toolHeavy) {
  const k = `toolHeavy:${t.dir}`;
  if (!loop.events.some((e) => e.e === k)) { loop.events.push({ at: new Date().toISOString(), e: k }); await next(`look again at the "tool" verdicts in ${t.dir}`, `${t.tool} of ${t.of} frames there are closed as "tool": a difference the clone shows is "differs", whatever its cause; "tool" holds only with evidence made for that frame`, ['change each verdict that is really a difference to "differs: <what>"']); }
}

// ---- 8. the loop: the failing results as objectives, worked until each passes or is concluded ----
// what the tool cannot measure is never issued as clone work; the ones with a tool action get that action once
for (const u of ev.units.filter((x) => x.status === 'tool')) {
  const k = `tool:${unitIdOf(u)}`;
  if (loop.events.some((e) => e.e === k)) continue;
  if (u.check === 'interact' && u.record?.toolOnly) { loop.events.push({ at: new Date().toISOString(), e: k }); await next(`rewrite or retire the scenario "${u.scenario}" in interactions.json`, `${u.record.toolOnly}: an instrument problem, not the clone's. A scenario of yours with the same name replaces it (open the disclosure first, use a stable selector), and { "name": "${u.scenario}", "skip": "<why>" } retires it; this is asked once`, [`then ${T(`score ${name} --only interact`)}`]); }
  if (u.check === 'hovers' && /--hide/.test(u.reason || '')) { loop.events.push({ at: new Date().toISOString(), e: k }); await next(T(`capture ${meta.url} ${name}${meta.mode === 'exact' ? ` --mode exact --permission "${meta.permission}"` : ''} --hide "${[...(meta.hide || []), u.reason.match(/--hide "([^"]+)"/)?.[1]].filter(Boolean).join(',')}"`), u.reason); }
}
const pick = nextObjective(loop, 'clone');
if (pick) {
  const o = loop.objectives[pick.key];
  if (o.strategyDue) {
    o.strategyAsks = (o.strategyAsks || 0) + 1;
    loop.pending = null;
    await next(`record a change of strategy for "${o.label}" under ## Attempts in notes.md`, `${o.attempts} attempt(s) without progress (best shortfall ${o.bestShortfall}, now ${o.lastShortfall}): ${o.history.slice(-2).map((h) => `${h.focus ? `${h.focus}: ` : ''}${h.shortfall}`).join(', ')}. Look at it differently before the next attempt: one line naming "${o.label}", what the evidence shows, what the next attempt does differently, and "evidence: <file>" made now (an explain crop, a brief, a measurement). The next attempt without progress concludes it`, [T(`explain ${name} <y> --viewport ${o.viewport || 'desktop'}`)]);
  }
  loop.pending = { key: o.key, kind: o.kind, side: 'clone', check: o.check, subjectHash: ev.subjectHash, issuedAt: new Date().toISOString(), focus: o.current?.below?.[0]?.name || o.current?.below?.[0]?.id || null };
  await next(...workStep(o, pick.regressed));
}
done.push('loop');

// ---- 9. the final sweep: every result re-measured on the clone as it is now, the review shot again ----
const stale = ev.units.filter((u) => !u.plan && u.status === 'stale');
if (stale.length) await next(scoreCmd(stale), `the final re-measure: ${stale.length} result(s) passed on earlier content and are measured once more on the clone as it is now (${stale.slice(0, 3).map(unitName).join('; ')}${stale.length > 3 ? '…' : ''})`);
const staleFrames = rv.frames.filter((f) => f.state === 'stale');
if (staleFrames.length) { const f = staleFrames[0]; await next(app ? T(`score ${name} --only journey`) : T(`review ${name}${f.route ? ` --route ${f.route}` : ''} --size ${f.size}`), `${staleFrames.length} review frame(s) show an earlier clone: shot again, then each verdict given to the new picture`); }
const writtenBad = ev.checks.filter((c) => ['notes', 'coverage'].includes(c.key) && c.status === 'fail');
for (const c of writtenBad) {
  if (c.key === 'notes') await next('write ## Behaviours in notes.md with the file:line of each rule', 'the Behaviours do not cite the site\'s code');
  const cov = c.coverage;
  const first = cov.uncitedScripts[0] ? `reference/scripts/${cov.uncitedScripts[0].replace(/\.js$/, '.pretty.js')}` : `the scroll curve on .${String(cov.uncitedCurves[0]?.cls || '').split('.')[0]}`;
  await next(`read ${first}`, `${cov.uncitedScripts.length + cov.uncitedCurves.length} piece(s) of the site's own code are not accounted for: port what each does (a line under ## Behaviours citing its file:line) or say under ## Findings why it is not ported`);
}
if (!ownBundle && !app && ((await json('reference/reveals.desktop.json'))?.scrubs || []).length && !(await stat('motion-map.json'))) await next(T(`curves ${name} --draft`), 'scroll curves were recorded on the reference and none is scored yet: the map pairs each with the clone\'s element');

// ---- 10. the Next.js app: the delivered artifact, verified as it is ----
const evApp = await evaluate(root, { side: 'app' });
observe(loop, evApp, notes, root);
const appUnmeasured = evApp.units.filter((u) => !u.plan && ['missing', 'stale', 'invalid', 'error'].includes(u.status));
const appReviewMissing = !app && evApp.review.missingDirs.length;
if (appUnmeasured.length || appReviewMissing || evApp.review.status === 'stale') {
  const k = 'next-verify-errors';
  const errorsNow = appUnmeasured.filter((u) => u.status === 'error');
  if (errorsNow.length) { loop.errors[k] = (loop.errors[k] || 0) + 1; if (loop.errors[k] > 2) await blocked(`the Next.js app cannot be measured: ${errorsNow[0].reason}`, `${T(`next ${name} --verify`)} by hand and read its output; fix what stops the build or the server, then status`); }
  await next(T(`next ${name} --verify`), `the HTML clone ${Object.values(loop.objectives).some((o) => o.state === 'concluded' && o.side === 'clone') ? 'has done what the loop could' : 'passes'}: generate the Next.js app and verify it as delivered (every check, REPORT.next.md), since the app is what the user gets`);
}
delete loop.errors['next-verify-errors'];
if (evApp.lint?.findings.length) { await saveLoop(root, loop); await next(`fix the app (in clone/, then regenerate): ${evApp.lint.findings[0].file}`, evApp.lint.findings.map((f) => `${f.file} ${f.what}`).join('; '), [T(`next ${name} --verify`)]); }
const appUnverdicted = evApp.review.frames.filter((f) => f.state === 'open');
if (appUnverdicted.length) {
  // a frame of the app's own review that matches the clone's frame as closely as it matches the original inherits
  // nothing: it is looked at like any other (the app is what the user gets)
  await next(`write review verdicts for the Next.js app's ${appUnverdicted.length} frame(s) (${appUnverdicted.slice(0, 3).map((f) => `${f.id} ${f.size}`).join(', ')}${appUnverdicted.length > 3 ? '…' : ''}) under ## Review in notes.md`, 'the app\'s frames are in compare-next/review/; give each the same kind of verdict (frame, size, token)');
}
const appPick = nextObjective(loop, 'app');
if (appPick) {
  const o = loop.objectives[appPick.key];
  if (o.strategyDue) { o.strategyAsks = (o.strategyAsks || 0) + 1; loop.pending = null; await next(`record a change of strategy for "${o.label}" under ## Attempts in notes.md`, `${o.attempts} attempt(s) without progress on the app: one line naming it, what the evidence shows, what the next attempt does differently, and "evidence: <file>" made now`); }
  loop.pending = { key: o.key, kind: o.kind, side: 'app', check: o.check, subjectHash: evApp.subjectHash, issuedAt: new Date().toISOString() };
  const [cmd, why, then] = workStep(o, appPick.regressed);
  await next(cmd, `${why}. The app differs where the clone passes: fix it in clone/ (never in next/), or when the generator is at fault, show it with evidence under ## Findings`, [T(`next ${name} --verify`), ...(then || []).slice(1)]);
}
done.push('next.js');

// ---- 11. the outcome ----
await saveLoop(root, loop);
const unresolved = Object.values(loop.objectives).filter((o) => o.state === 'concluded');
const toolUnits = [...ev.units, ...evApp.units].filter((u) => u.status === 'tool');
if (ev.verified && evApp.verified) {
  await writeOutcome({ outcome: 'verified', why: 'every required result passes on the clone and on the Next.js app as they are now, and every review frame is closed by eye', subjectHash: ev.subjectHash, appSubjectHash: evApp.subjectHash, elapsed });
  renderReport();
  console.log(`trueclone status: ${name} (${mode})\ndone: ${done.join(', ')}\n\nVerified: every required result passes on the clone and on the Next.js app as they are now. The deliverable is sites/${name}/REPORT.md and REPORT.next.md; hand it over with the clone.`);
  process.exit(0);
}
const lines = [
  ...unresolved.map((o) => `${o.label}: best ${o.bestValue ?? '–'} (shortfall ${o.bestShortfall}), now ${o.lastValue ?? '–'} (shortfall ${o.lastShortfall}), ${o.attempts} attempt(s), ${o.strategies || 0} change(s) of strategy; ${o.concludedWhy}`),
  ...toolUnits.map((u) => `${unitName(u)}: not verifiable by the tool here (${u.reason})`),
];
const nextAction = unresolved.length ? `the differences above are the clone's to fix; after a change, run ${T(`status ${name}`)} (a concluded result that passes on new content is counted again)` : 'the items above are the tool\'s limits on this site; nothing more for the clone';
await writeOutcome({ outcome: 'incomplete', why: `the loop concluded with ${unresolved.length} difference(s) unresolved${toolUnits.length ? ` and ${toolUnits.length} result(s) the tool cannot verify here` : ''}`, unresolved: lines, next: nextAction, resume: `${T(`status ${name}`)} resumes from here: every result, attempt and conclusion is kept in compare/loop.json`, subjectHash: ev.subjectHash, appSubjectHash: evApp.subjectHash, elapsed });
renderReport();
console.log(`trueclone status: ${name} (${mode})\ndone: ${done.join(', ')}\n\nIncomplete: the loop concluded with differences left. The clone and the Next.js app are verified as they are; what remains:\n${lines.map((l) => `  - ${l}`).join('\n')}\n\nEach is in REPORT.md (Outcome) with its best and current values. Hand over the clone with REPORT.md as it stands, and say it is incomplete.`);
process.exit(3);

// The step for an objective: what to look at and the command that re-measures it
function workStep(o, regressed) {
  const vp = o.viewport || 'desktop';
  const briefVp = ['laptop', 'wide'].includes(vp) ? 'desktop' : vp;
  const below = o.current?.below || [];
  const worst = below[0];
  const head = `${regressed ? 'restore ' : ''}${o.label}`;
  const why = `${regressed ? 'it passed on earlier content and fails since the last change (a regression comes first); ' : ''}${o.current?.value ?? '–'}% against ${o.current?.bar ?? '–'}${below.length ? `; below their floor: ${below.slice(0, 3).map((m) => `${m.name || m.id}${m.y !== undefined ? ` (y ${m.y})` : ''} ${m.value}`).join(', ')}` : ''}; attempt ${o.attempts + 1}, best shortfall ${o.bestShortfall}${o.attempts ? `, now ${o.lastShortfall}` : ''}`;
  const after = `after the fix: ${T(`score ${name} --only ${LABEL_OF[o.check] || o.check}${['layout', 'scroll', 'canvas', 'load', 'detail', 'journey'].includes(o.check) && o.viewport ? '' : ''}`)}`;
  if (o.kind === 'review') return [`fix review frame ${o.frame} (${o.viewport}): "${String(o.current?.verdict || '').slice(0, 80)}"`, `${o.current?.why || 'marked as different'}: what a visitor sees comes first`, [T(`review ${name} --size ${o.viewport}`), 'then give the new picture its verdict']];
  if (o.check === 'journey') return [`make checkpoint "${worst?.name || worst?.id || 'the journey'}" (${vp}) look like the reference: compare/review/journey-${vp}/`, `${head}: ${why}; its scene is reference/scene/, its programs reference/shaders/INDEX.md`, [after]];
  // a route's frames are looked at with review and brief at that route (explain looks at the captured page)
  const look = o.route ? T(`review ${name} --route ${o.route} --size ${vp}`) : T(`explain ${name} ${worst?.y ?? 0} --viewport ${vp}`);
  if (o.check === 'scroll' || o.check === 'canvas') return [look, `${head}: ${why}`, [T(`brief ${name}${o.route ? ` --route ${o.route}` : ''} --viewport ${briefVp}`), `compare/states/ has the frames side by side; ${after}`]];
  if (o.check === 'interact') return [`make "${o.scenario}" behave like the reference`, `${head}: ${why}`, [T(`brief ${name}`) + ' (its section\'s brief has the handler file:line)', after]];
  if (o.check === 'layout' || o.check === 'layout-real') return [look, `${head}: ${why}`, [T(`brief ${name}${o.route ? ` --route ${o.route}` : ''} --viewport ${briefVp}`), after]];
  // what changes by itself: each failing member says what the reference does (compare/behaviour.json has both sides)
  if (o.check === 'behaviour') return [`make ${worst?.id?.startsWith('random') ? 'the page\'s order follow the reference\'s rule' : `what changes by itself at y ${worst?.y ?? '?'}`} (${vp}${o.route ? `, ${o.route}` : ''}) behave like the reference`, `${head}: ${below.map((m) => m.reason || m.id).slice(0, 3).join('; ') || why}`, ['port the rule from the site\'s own code (reference/scripts/, its motion in reference/motion.desktop.json): the same loop speed and direction, the same interval, the same shuffle; never a fixed state', after]];
  if (o.check === 'reduced') return [`make the reduced-motion page (${vp}${o.route ? `, ${o.route}` : ''}) match the reference's`, `${head}: ${why}; the site's prefers-reduced-motion: reduce branch differs (compare/${vp}.reduce.mask.diff.png)`, ['port the site\'s own reduced-motion rules (its @media (prefers-reduced-motion) CSS and matchMedia checks); the animated page is checked separately', after]];
  return [`fix ${o.label}`, `${head}: ${why}`, [T(`explain ${name} <y> --viewport ${vp}`), after]];
}
