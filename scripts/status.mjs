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
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, siteDir, bundleIntegrity, MASK_VERSION } from './lib.mjs';
import { evaluate, unitName, ORDER, REVIEW_HEADING, lintSubject } from './verdict.mjs';
import { envIdentity, refIdOf, toolVersion, subjectHash, codeHash } from './identity.mjs';
import { loadLoop, saveLoop, observe, nextObjective, recordActivity, objectiveKey } from './loop.mjs';
import { readJournal, runsOf, runningNow, inputsDigest, trackStep, declaredCannot, LIMITS } from './progress.mjs';
import { account } from './accounting.mjs';
import { errorOwner, failureLine } from './failures.mjs';

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
let runs = [];
let digestP = null;
// What status decides on, once per call (progress.mjs): the step counters and the report's freshness hang on it
const digest = () => (digestP ||= (async () => inputsDigest(root, { subject: await subjectHash(root, 'clone'), appSubject: await subjectHash(root, 'app') }))());
// Name the next step (exit 1). Every named step is counted (progress.mjs): one that failed twice, ran twice without
// effect, or was named again and again while nothing changed ends the run Blocked with what was tried, instead of
// being named for ever (RC6 astro, allbirds). `opts.owner` is who the step is for (clone work or a tool step).
const next = async (cmd, why, then = [], opts = {}) => {
  if (loopRef) {
    const s = trackStep(loopRef, cmd, await digest(), runs, new Date(), { work: Boolean(opts.objective) });
    const tried = s.lastRun ? ` The last run: \`${s.lastRun.step} ${(s.lastRun.args || []).join(' ')}\` (${s.lastRun.exit === 'died' ? 'ended without finishing: killed or crashed' : `exit ${s.lastRun.exit}`})${s.lastRun.log ? `, its whole output in sites/${name}/${s.lastRun.log}` : ''}.` : '';
    if (s.failed >= LIMITS.failed) {
      const logText = s.lastRun?.log ? await fs.readFile(path.join(root, s.lastRun.log), 'utf8').catch(() => '') : '';
      const line = failureLine(logText);
      const owner = errorOwner({ error: line });
      await blockedEarly(`the step \`${cmd}\` failed ${s.failed} times on the same inputs${line ? `: ${line}` : ''}.${tried}`, owner === 'environment' ? 'check the network and the browser (npx trueclone doctor), then run status again' : 'this is a defect in trueclone (or in its environment): report it with the log named above; run status again once a fixed version is installed', { owner, log: s.lastRun?.log || null, step: cmd });
    }
    if (s.ineffective >= LIMITS.ineffective) await blockedEarly(`the step \`${cmd}\` ran ${s.ineffective + 1} times and changed nothing that status decides on: the step and status disagree, which is a defect in trueclone.${tried}`, 'report it with compare/loop.json (steps) and the log; nothing in the clone can resolve it', { owner: 'tool', step: cmd });
    if (s.idle >= LIMITS.idleEscalate) {
      // an objective's declaration concludes it (pickObjective); any other work step's ends the run Blocked, named; a
      // trueclone command is never declared, it is run
      const d = opts.objective || /^npx trueclone /.test(cmd) ? null : declaredCannot(await text('notes.md'), opts.label || cmd);
      if (d) await blockedEarly(`the step \`${cmd}\` cannot be done within the permitted edits, as recorded under ## Findings: ${d.why}`, d.tool ? 'a defect in trueclone: report it with the Finding and its evidence' : 'the step needs a change outside clone/script.js, clone/patches/ and notes.md: decide with the user', { owner: d.tool ? 'tool' : 'clone', step: cmd, declared: true });
      const isCommand = /^npx trueclone /.test(cmd) && !opts.objective;
      if (s.idle >= LIMITS.idleBlock) await blockedEarly(`status named the step \`${cmd}\` ${s.idle + 1} times; nothing it depends on changed and ${isCommand ? 'the step was never run' : 'no step ran in between'}: the run is not progressing`, isCommand ? `run \`${cmd}\` (through npx trueclone, so it is recorded), then status` : `do the step, or if it cannot be done within clone/script.js, clone/patches/ or notes.md, write under ## Findings "- cannot: ${opts.label || cmd}: <why>"; then run status`, { owner: 'run', step: cmd });
      // a trueclone command is run, not declared: status counts it once it has run (and ends Blocked if it fails or does nothing)
      why = isCommand ? `${why}. Status has named this step ${s.idle + 1} times and it has not been run: run it exactly as written (through npx trueclone, so it is recorded); if it fails or changes nothing, status decides what follows` : `${why}. Status has named this step ${s.idle + 1} times and nothing it depends on changed. If it cannot be done within clone/script.js, clone/patches/ or notes.md, do not work around it: write one line under ## Findings, "- cannot: ${opts.label || cmd}: <why>" (say "tool" when trueclone's own output is at fault), and run status; it decides what follows`;
    }
  }
  console.log(`trueclone status: ${name}${meta?.mode ? ` (${meta.mode})` : ''}`);
  if (done.length) console.log(`done: ${done.join(', ')}`);
  console.log(`\nnext: ${cmd}\n  why: ${why}`);
  for (const t of then) console.log(`  then: ${t}`);
  await writeOutcome({ outcome: 'in-progress', next: cmd, why, owner: opts.owner || null }).catch(() => {});
  if (loopRef) await saveLoop(root, loopRef);
  await refreshReport();
  console.log(`\nWork is left. Do the next step, then run \`${T(`status ${name}`)}\` again. Do not end your turn or ask whether to continue while status says work is left. Status names only steps that can be done in clone/script.js, clone/patches/, notes.md or with a trueclone command; what the tool or the environment cannot do it ends as Blocked (exit 2) or lists in Incomplete (exit 3), never as clone work. If a step cannot be done within those, write it under ## Findings ("- cannot: <step>: <why>") instead of working around it, and run status.`);
  process.exit(1);
};
const outcomeFile = path.join(root, 'compare', 'outcome.json');
const writeOutcome = async (o) => { await fs.mkdir(path.dirname(outcomeFile), { recursive: true }); await fs.writeFile(outcomeFile, JSON.stringify({ ...o, tool: toolVersion(), at: new Date().toISOString() }, null, 2)); };
// REPORT.md (and REPORT.next.md) rendered whenever what they describe changed since the last render, on every status
// exit (RC6 astro: REPORT predated every verdict), and its failure is never silent (RC6 allbirds: report.mjs crashed and
// no REPORT.md existed). Returns null when rendered (or current), else the error.
const renderReport = () => {
  const r = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'report.mjs'), name], { encoding: 'utf8', env: { ...process.env, TC_LOG: '' } });
  return r.status === 0 ? null : failureLine(`${r.stdout || ''}\n${r.stderr || ''}`) || `report exited ${r.status}`;
};
const refreshReport = async ({ force = false } = {}) => {
  const d = await digest();
  if (!force && loopRef?.reportDigest === d) return null;
  const err = renderReport();
  if (loopRef) { loopRef.reportDigest = err ? null : d; await saveLoop(root, loopRef).catch(() => {}); }
  if (err) console.log(`\n(REPORT.md could not be rendered: ${err}. A defect in trueclone; the results are kept.)`);
  return err;
};
let elapsedRef = null;
let evsRef = null; // the clone's and the app's evaluations, once made: a Blocked outcome then accounts for every item
let blockedUnitsRef = new Map(); // the units a Blocked outcome names (accounting.mjs: their disposition is "blocked")
// Blocked (exit 2): the cause, who owns it (tool, environment, clone, run), what was tried and what to do; everything
// done so far is kept, and `status` resumes once the cause is fixed
const blockedEarly = async (why, what, data = {}) => {
  // every required item of both sides, accounted for: what is blocked, and what was not reached (pending)
  let accounting = null;
  try {
    const evs = [evsRef?.[0] || await evaluate(root, { side: 'clone' }), evsRef?.[1] || await evaluate(root, { side: 'app' })];
    accounting = account({ evs, loop: loopRef, blockedUnits: blockedUnitsRef });
  } catch { /* no capture yet: nothing to account for */ }
  await writeOutcome({ outcome: 'blocked', owner: data.owner || 'tool', why, next: what, resume: `fix the cause, then ${T(`status ${name}`)} (everything done so far is kept)`, subjectHash: await subjectHash(root, 'clone'), appSubjectHash: await subjectHash(root, 'app'), elapsed: elapsedRef, ...(accounting && accounting.total ? { accounting } : {}), ...data });
  if (loopRef) await saveLoop(root, loopRef);
  const err = await refreshReport({ force: true });
  console.log(`trueclone status: ${name}${meta?.mode ? ` (${meta.mode})` : ''}${done.length ? `\ndone: ${done.join(', ')}` : ''}\n\nBlocked (owner: ${data.owner || 'tool'}): ${why}\nWhat to do: ${what}\nEverything done so far is kept (${err ? `REPORT.md could not be rendered: ${err}; compare/outcome.json has the details` : 'REPORT.md and compare/outcome.json have the details'}); after fixing the cause, run ${T(`status ${name}`)} again to resume.`);
  process.exit(2);
};

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
// the loop record from the first status call on (its activity is the run's time), and the steps that ran (the journal)
loopRef = await loadLoop(root, refIdOf(meta));
elapsedRef = recordActivity(loopRef);
runs = runsOf(await readJournal(root));
// a step still running on this site: wait for it. Never counted as a repeat, never a reason to name it again
const busy = runningNow(runs);
if (busy.length) {
  await saveLoop(root, loopRef);
  console.log(`trueclone status: ${name} (${meta.mode || 'template'})\n\nwaiting: ${busy.map((r) => `\`${r.step} ${(r.args || []).join(' ')}\` (pid ${r.pid}, running since ${String(r.startedAt).slice(11, 19)}${r.log ? `, output in sites/${name}/${r.log}` : ''})`).join('; ')} is still running on this site. Let it finish (a quiet step is still working), then run \`${T(`status ${name}`)}\` again. Work is left.`);
  process.exit(1);
}
// a capture that did not finish (no completion mark) is not a reference: it is captured again (capture.mjs)
// capture again with the site's own settings (an exact-mode site stays exact, with its permission; its hide list,
// cookies, locale, routes and hand-made exclusions and inclusions are kept)
// (quotes inside a recorded value never reach the command line: RC6 varsity's launcher recorded the permission as `"site`)
const unq = (s) => String(s ?? '').replace(/["`]/g, '').trim();
const recapture = () => T(`capture ${meta.url} ${name}${meta.mode === 'exact' ? ` --mode exact --permission "${unq(meta.permission)}"` : ''}${(meta.hide || []).length ? ` --hide "${meta.hide.join(',')}"` : ''}${(meta.cookies || []).length ? ` --cookie "${meta.cookies.map((c) => `${c.name}=${c.value}`).join('; ')}"` : ''}${meta.locale && meta.locale !== 'en-US' ? ` --locale ${meta.locale}` : ''}${(meta.routes || []).length > 1 ? ` --routes ${meta.routes.length}` : ''}${(meta.ignore || []).filter((i) => !i.auto).length ? ` --ignore "${meta.ignore.filter((i) => !i.auto).map((i) => i.sel).join(',')}"` : ''}${(meta.thirdParty || []).filter((t) => /--include/.test(t.decision || '')).length ? ` --include "${meta.thirdParty.filter((t) => /--include/.test(t.decision || '')).map((t) => t.sel).join(',')}"` : ''}${meta.bundle && !meta.canvasApp ? ' --bundle' : ''}`);
if (meta.complete === false) await next(recapture(), 'the last capture did not finish (crashed or stopped part-way): a partial reference is never measured against');
// a reference captured before symmetric measurement (rc.5: the same seed, clock and motion setting on both sides, loops
// held at an equal non-zero time) was shot under other conditions than every clone measurement now: captured again
if (!meta.stabilise) await next(recapture(), 'the reference was captured before symmetric measurement (rc.5: the same seed, clock and motion setting on both sides): every comparison with it would be uneven');
// the reference's masked shots were taken with another structure mask than the one the clone is measured with (rc.7
// shows iframes as boxes): every structure comparison with them would be uneven (the rc.7 replay of RC6 elise: its
// start page 5.33); captured again, the clone, notes and patches kept
if (meta.maskVersion !== MASK_VERSION) await next(recapture(), `the reference's masked shots were taken with ${meta.maskVersion ? 'another' : 'an earlier'} structure mask than this version of trueclone measures the clone with (rc.7 shows iframes as boxes instead of hiding them): every structure comparison with them would be uneven. Captured again (the clone, notes.md and clone/patches/ are kept; the results are measured again)`);
// App mode: a canvas app (capture: meta.canvasApp) is not a document. Its states are the checkpoints of a journey
// (journey.json: the input a visitor makes, gates included), read on the reference and scored on the clone.
const app = Boolean(meta.canvasApp);
const ownBundle = Boolean(meta.bundle);
if (app && !(await stat('journey.json'))) await next(T(`journey ${name} --draft`), `this site is a canvas app (${meta.canvasApp.canvas}${meta.canvasApp.engine ? `, ${meta.canvasApp.engine}` : ''}): a visitor reaches its states by input (wheel, touch, a gesture, holding a button), not by scrolling a page; the draft finds that journey on the live site, gates included`, ['then read journey.json: every checkpoint a state you saw on the live site; a gate the draft could not pass, write by hand (the steps are listed at the top of scripts/journey.mjs)']);
// a dialog over the page at load (capture's warning, meta.overlays): every check would compare the clone with it, so
// it is hidden by a re-capture first; one a visitor always sees stays when Findings names it (and why)
const notesNow = await text('notes.md');
const overlays = (meta.overlays || []).filter((o) => !notesNow.includes(o.sel));
if (overlays.length) await next(T(`capture ${meta.url} ${name}${meta.mode === 'exact' ? ` --mode exact --permission "${unq(meta.permission)}"` : ''}${meta.routes?.length === 1 ? ' --routes 1' : ''} --hide "${[...(meta.hide || []), ...overlays.map((o) => o.sel)].join(',')}"`), `the capture saw ${overlays.map((o) => `\`${o.sel}\` (${o.share}% of the window)`).join(', ')} over the page at load: hidden, every check compares the page itself. If visitors always see it, say so under ## Findings in notes.md naming it, and status moves on`);
// third-party widgets found at capture that differ between loads (an assistant, a chat): excluded on both sides by
// default (docs/policy.md); one the user wants in the clone is included with capture --include "<selector>"
// Pages the site links to that the capture left out at its --routes cap are not verified. The goal is the whole site
// the user asked for: once, before any work, capture again with them, or say under ## Findings why they are out of
// scope (REPORT lists them either way). RC6 elise: 6 of 8 project pages were left out, silently.
{
  const capped = (meta.routesNotCaptured || []).filter((r) => /beyond the cap/i.test(r.why || ''));
  const named = capped.some((r) => notesNow.includes(typeof r === 'string' ? r : r.path)) || /^## Findings[\s\S]*\broutes?\b[^\n]*(out of scope|not captured|left out)/im.test(notesNow);
  if (capped.length && !named && loopRef && !(loopRef.events || []).some((e) => e.e === 'routes-not-captured')) {
    (loopRef.events ||= []).push({ at: new Date().toISOString(), e: 'routes-not-captured' });
    const total = (meta.routes || []).length + capped.length;
    await next(T(`capture ${meta.url} ${name}${meta.mode === 'exact' ? ` --mode exact --permission "${String(meta.permission ?? '').replace(/["`]/g, '').trim()}"` : ''} --routes ${total}`), `the site links to ${capped.length} page(s) the capture left out at its route cap (${capped.slice(0, 6).map((r) => r.path || r).join(', ')}${capped.length > 6 ? '…' : ''}): not captured, they are not verified. Capture again with them (${total} routes; calibration and every check grow with them), or, if they are out of the scope the user asked for, say so under ## Findings naming them ("- routes out of scope: <paths>: <why>") and run status. This is asked once`, [], { label: 'routes not captured' });
  }
}
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
// reveals and widgets recorded before rc.7 name their elements by position only: the seed cannot find them safely (a
// late body child shifts every position: RC6 allbirds, 0 of 8 reveals found), so they are read again with stable keys
if (!app) for (const [f, cmd] of [['reference/reveals.desktop.json', `reveals ${name}`], ['reference/widgets.desktop.json', `widgets ${name}`]]) {
  const rec = await json(f);
  if (rec && rec.keys !== 'id-path' && !missing.some(([c]) => c === cmd)) missing.push([cmd, 'recorded before rc.7, by position only: read again so the seed can find each element by a stable key']);
}
// the scroll states of every route at every size: a read that stopped half-way is not done
if (!missing.length && !app) {
  const gaps = [];
  for (const r of meta.routes?.length ? meta.routes : [{ path: '/', slug: '', dir: 'reference' }]) for (const v of ['desktop', 'tablet', 'mobile', 'laptop', 'wide']) if (!(await stat(`${r.dir || 'reference'}/states/${v}.json`))) gaps.push(`${r.path} ${v}`);
  if (gaps.length) missing.push([`states ${name}`, `the scroll states of ${gaps.slice(0, 3).join(', ')}${gaps.length > 3 ? '…' : ''} are missing (the read stopped before them)`]);
}
if (missing.length) await next(T(`reads ${name}`), `${missing.map(([c, why]) => `${c.split(' ')[0]}: ${why}`).join('; ')} (not read yet): the reads that only look run side by side, the reveals alone after them; only the missing ones run`, ['while it runs (in the background), read reference/scripts/INDEX.md: the site\'s scripts, ranked by what ran']);
done.push('reads');
// the site's own files, whole (own bundle: the clone runs them). A file the recorder could not get is recorded as failed
// (lib.mjs recordBundle); a bundle from rc.5 may hold empty files. The reference journey records every file again, once;
// a file still missing after that cannot be fixed by the clone's work: Blocked, the files named, the work kept. Before
// the calibration: recording again re-reads the reference journey, which the calibration replays
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
    // the one Blocked path (owner, cause, accounting, REPORT), like every other
    await blockedEarly(`${integrity.problems.length} of the site's own files could not be recorded, after the reference journey recorded them again: ${list}`, `the clone cannot run without them (no change to the clone can supply them). Check that the site serves them to this machine (open one of the addresses in a browser); if it does, report this with sites/${name}/reference/bundle/manifest.json. ${T(`journey ${name}`)} then ${T(`status ${name}`)} resumes`, { owner: 'tool', problems: integrity.problems });
  }
  await fs.rm(path.join(root, 'compare', 'bundle-rerecord.json'), { force: true });
  done.push(`bundle (${integrity.entries} files whole)`);
}
// the reference against itself, before any clone work (PLAN.md 5.4 validity gate): every bar is set from it, and a
// frame the reference varies on is known before the loop spends time on it. The reference's own reads that the
// calibration replays (its states, an app's reference journey) read again after it was made: it describes reference
// frames that are gone (RC5 zero: the journey re-recorded to complete the bundle)
const noiseRec = await json('reference/noise.json');
// the reads it replays, by content (rc.7; a copy of the folder that changes file times is not a new read, RC6-26);
// a calibration from before rc.7 has no record of them and is judged by file times as before
const readsFile = app ? 'reference/journey/journey.json' : 'reference/states/desktop.json';
const readsSha = await fs.readFile(path.join(root, readsFile)).then((b) => crypto.createHash('sha1').update(b).digest('hex').slice(0, 16), () => null);
const noiseOld = noiseRec && (noiseRec.reads?.sha1 ? noiseRec.reads.sha1 !== readsSha : Date.parse(noiseRec.at || 0) < ((await stat(readsFile))?.mtimeMs || 0) - 1000);
if (!noiseRec || noiseRec.refId !== refIdOf(meta) || noiseOld) {
  // a calibration that failed: resumed once (it keeps every check it finished), then Blocked with its error and log
  const failedCal = await json('reference/calib/failed.json');
  const fails = failedCal?.refId === refIdOf(meta) ? failedCal.count || 1 : 0;
  if (fails >= 2) await blockedEarly(`calibrate failed ${fails} times on this capture: ${failedCal.error}`, errorOwner({ error: failedCal.error }) === 'environment' ? 'check the network and the browser (npx trueclone doctor), then run status again' : `a defect in trueclone or its environment: report it with ${failedCal.log || 'reference/calib/log.txt'}; status resumes the calibration once it is fixed`, { owner: errorOwner({ error: failedCal.error }), log: failedCal.log || 'reference/calib/log.txt' });
  // How long: the work it does, from what RC6's calibrations took. Per draw, each route x size is shot once per pixel
  // check (about 45 s), and the scroll check visits every half screen of the page with a still at a fixed page age
  // (about 8 s a step). RC6 measured 0.4-13.5 s a step and 8-60 s a shot (astro 3 min, varsity ~160 min), so the range
  // is wide; calibrate prints its own estimate after its first check.
  const routes = (meta.routes?.length ? meta.routes : [{ viewports: meta.viewports }]);
  const VP_H = { mobile: 844, tablet: 1024, desktop: 900, laptop: 720, wide: 1080 };
  const steps = app ? 0 : routes.reduce((n, r) => n + (r.viewports || meta.viewports || []).reduce((m, v) => m + Math.ceil((v.pageHeight || VP_H[v.viewport] || 900) / ((VP_H[v.viewport] || 900) / 2)) + 1, 0), 0);
  const shots = app ? 0 : routes.length * 5 * (meta.mode === 'exact' ? 2 : 1);
  const perDrawS = app ? 600 : shots * 45 + steps * 8;
  const est = [Math.max(2, Math.round((perDrawS * 2 * 0.1) / 60)), Math.round((perDrawS * 2 * 2) / 60)];
  const progress = await json('reference/calib/progress.json');
  await next(T(`calibrate ${name}`), `${noiseOld ? 'the reference was read again after the calibration' : noiseRec ? 'the calibration belongs to an earlier capture' : fails ? `the last calibration stopped: ${failedCal.error} (whole output: ${failedCal.log || 'reference/calib/log.txt'}); it resumes from the ${progress?.done?.length || 0} check(s) it finished` : 'the reference has not been measured against itself yet'}: two more loads of the live page through the same checks set the bar of every frame (reference/noise.json), once per capture. ${app ? `Expect ${est[0]}-${est[1]} minutes (the journey at each size, x 2 draws)` : `For ${routes.length} route(s) x 5 sizes (${shots} pixel shots and ${steps} scroll steps per draw, x 2 draws), expect about ${Math.round((perDrawS * 2) / 60)} minutes, possibly ${est[0]}-${est[1]}`}; it prints each check's time and what is left as it goes (sites/${name}/logs/ and reference/calib/log.txt). Give it no time limit shorter than ${est[1]} minutes, or run it in the background and run status (it says "waiting" while calibrate runs); never stop it because it is quiet`, ['while it runs, read reference/scripts/INDEX.md']);
}
done.push('calibrated');

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
// a clone seeded by other seed code: what the seed generates changed (rc.7 fixed seed defects RC6 met: styles keyed by
// position, excluded widgets kept, encoded route folders), so the generated markup is made again; script.js and
// patches are kept. A record from before rc.7 has no code: seeded again once.
if (seedRecord && seedRecord.code !== codeHash('seed')) await next(T(`seed ${name} --force`), `the clone was seeded by ${seedRecord.tool ? `trueclone ${seedRecord.tool}` : 'an earlier version of trueclone'}, whose seed generates other markup: seeding again regenerates the clone's pages (clone/script.js and clone/patches/ are kept)`);
if (ownBundle && seeded && (await stat('reference/bundle/manifest.json'))?.mtimeMs > seeded.mtimeMs + 1000) await next(T(`seed ${name}`), 'the reference journey recorded more of the site\'s files since the clone was built');
if (seedInputs.some((s) => s && s.mtimeMs > seeded.mtimeMs + 1000)) await next(T(`seed ${name} --force`), 'reveals, widgets or the capture are newer than the clone\'s markup (clone/script.js and clone/patches/ are kept)');
// A clone lint finding in what the seed itself wrote is trueclone's defect: no permitted edit can remove it (patches only
// add), so it ends Blocked now, before any work is built on the clone (RC6 allbirds: "fix the clone:
// clone/.seed-base.html", a file the agent may not edit, named as clone work and never resolvable)
const seedLint = (await lintSubject(root, meta, 'clone')).findings.filter((f) => f.owner === 'tool');
if (seedLint.length) await blockedEarly(`the clone as trueclone generated it fails trueclone's own lint: ${seedLint.slice(0, 3).map((f) => `${f.file}: ${f.what}`).join('; ')}`, 'a defect in trueclone (the seed): report it with the files named. Nothing in clone/script.js or clone/patches/ can remove it; do not edit the generated pages', { owner: 'tool', lint: seedLint });
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
const loop = loopRef;
evsRef = [ev];
const blocked = (why, what, data = {}) => blockedEarly(why, what, data);
// Errors (failures.mjs): each one is remeasured once. Seen again on the same content, measured again (not just named
// again), it is classified: the environment's or the tool's ends Blocked with every such unit, its owner and its log;
// the clone's (its own page does not load) becomes an objective like any failing result. RC6: a repeated error whose
// words did not match a short pattern fell out of every list and the run ended "Incomplete" with nothing named.
const unitIdOf = (u) => `${u.check}:${u.route || ''}:${u.viewport || ''}:${u.state || ''}`;
const accountId =(side, u) => `${side}:unit:${u.check}|${u.route || ''}|${u.viewport || ''}|${u.state || ''}`;
const errorLedger = (e, side) => {
  const blockedNow = [];
  for (const u of e.units.filter((x) => x.status === 'error')) {
    const id = `${side === 'app' ? 'app:' : ''}${unitIdOf(u)}`;
    const at = u.record?.identity?.endedAt || null;
    const seen = loop.errors[id];
    // an entry from before rc.7 (no measurement time) counted the step being named, not a measurement: one, now
    if (!seen || seen.subjectHash !== e.subjectHash || seen.at === undefined) loop.errors[id] = { subjectHash: e.subjectHash, at, count: 1 };
    else if (seen.at !== at) loop.errors[id] = { ...seen, at, count: seen.count + 1 };
    u.errorCount = loop.errors[id].count;
    // the interaction plan is the instrument's list of what to measure: its failure is never the clone's work
    u.errorOwner = u.plan && errorOwner(u.record) === 'clone' ? 'tool' : errorOwner(u.record);
    if (u.errorCount >= 2) { if (u.errorOwner === 'clone') u.cloneError = true; else blockedNow.push(u); }
  }
  // an error that is gone (measured since) leaves the ledger; the drift and app-build counters are kept
  const prefix = side === 'app' ? 'app:' : '';
  const live = new Set(e.units.filter((u) => u.status === 'error').map((u) => `${prefix}${unitIdOf(u)}`));
  for (const k of Object.keys(loop.errors)) if (['drift', 'next-verify-errors'].includes(k) ? false : (side === 'app') === k.startsWith('app:') && !live.has(k)) delete loop.errors[k];
  return blockedNow;
};
const blockOnErrors = async (list, side) => {
  if (!list.length) return;
  const owner = list.every((u) => u.errorOwner === 'environment') ? 'environment' : 'tool';
  const logs = [...new Set(list.map((u) => u.record?.errorLog).filter(Boolean))];
  blockedUnitsRef = new Map(list.map((u) => [accountId(side, u), u.errorOwner]));
  await blocked(`${list.length} required result(s)${side === 'app' ? ' of the Next.js app' : ''} cannot be measured: the same error on the same content after a second measurement: ${list.slice(0, 4).map((u) => `${unitName(u)}: ${String(u.reason || '').slice(0, 160)}`).join('; ')}${list.length > 4 ? '…' : ''}`, owner === 'environment' ? `check the network and that ${meta.url} opens in a browser here (a sandbox without network access cannot reach it; npx trueclone doctor), then run status again` : `a defect in trueclone: report it with ${logs.length ? logs.map((l) => `sites/${name}/${l}`).join(', ') : 'the error above'}; nothing in the clone can resolve it. status measures these again once a fixed version is installed`, { owner, units: list.map((u) => ({ unit: unitName(u), reason: u.reason, kind: u.record?.errorKind || null, log: u.record?.errorLog || null })), log: logs[0] || null });
};
await blockOnErrors(errorLedger(ev, 'clone'), 'clone');
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
{
  const toolLint = (ev.lint?.findings || []).filter((f) => f.owner === 'tool');
  if (toolLint.length) await blocked(`what trueclone generated fails its own lint: ${toolLint.slice(0, 3).map((f) => `${f.file}: ${f.what}`).join('; ')}`, 'a defect in trueclone: report it with the files named; do not edit the generated pages', { owner: 'tool', lint: toolLint });
  // the clone's own: named by the file to change (script.js or the patch that put it there), never a generated page
  const cloneLint = (ev.lint?.findings || []).filter((f) => f.owner !== 'tool');
  if (cloneLint.length) await next(`fix the clone: ${cloneLint[0].fix || cloneLint[0].file}`, cloneLint.map((f) => `${f.file}${f.fix && f.fix !== f.file ? ` (from ${f.fix})` : ''}: ${f.what}`).join('; '), [T(`seed ${name} --patches`) + ' when you changed a patch', T(`status ${name}`)], { label: `fix the clone: ${cloneLint[0].fix || cloneLint[0].file}` });
}

// ---- 6. every required result measured on the clone as it is now ----
const LABEL_OF = { layout: 'layout', 'layout-real': 'layout-real', scroll: 'states', canvas: 'states', curves: 'curves', interact: 'interact', hovers: 'hovers', detail: 'detail', load: 'load', journey: 'journey', behaviour: 'behaviour', reduced: 'reduced' };
// a retry after a step crashed runs its checks one at a time, so a collision between them cannot repeat (RC6 heybhaskar)
const scoreCmd = (us) => {
  const checks = [...new Set(us.map((u) => LABEL_OF[u.check] || u.check))];
  const vps = [...new Set(us.map((u) => u.viewport).filter(Boolean))];
  const serial = us.some((u) => u.status === 'error' && u.record?.errorKind === 'crash') && checks.length > 1;
  return T(`score ${name} --only ${checks.join(',')}${vps.length === 1 && checks.every((c) => !['interact', 'hovers'].includes(c)) ? ` --viewport ${vps[0]}` : ''}${serial ? ' --serial' : ''}`);
};
const real = ev.units.filter((u) => !u.plan);
const neverScored = real.length && real.every((u) => u.status === 'missing');
if (neverScored) await next(T(`score ${name}`), 'not scored yet: every required result, at every size (the first full score takes a while; later ones re-measure only what changed)');
// missing, invalid, and errors measured once so far; the interaction plan too (RC6: a plan left out of every re-measure
// meant 20 planned scenarios were never measured, and the run would have ended without them)
const toRemeasure = ev.units.filter((u) => ['missing', 'invalid', 'error'].includes(u.status) && !u.cloneError && !(u.status === 'error' && (u.errorCount || 0) >= 2));
const stalePlans = ev.units.filter((u) => u.plan && u.status === 'stale');
const pend = loop.pending;
const pendingUnits = pend && pend.side === 'clone' && pend.kind === 'unit' ? ev.units.filter((u) => !u.plan && u.check === pend.check && u.status === 'stale') : [];
// stale results that were failing (the work in progress) are re-measured now; stale results that were passing wait for
// the final sweep, so a change is not followed by re-measuring everything that never moves (docs/policy.md "Time")
const staleFailing = ev.units.filter((u) => !u.plan && u.status === 'stale' && u.prior === 'fail');
const measureNow = [...toRemeasure, ...stalePlans, ...pendingUnits, ...staleFailing];
if (measureNow.length) {
  const invalidWhy = measureNow.find((u) => u.status === 'invalid')?.reason;
  const errored = measureNow.filter((u) => u.status === 'error');
  await next(scoreCmd(measureNow), `${measureNow.length} required result(s) are not measured on the clone as it is now: ${[...new Set(measureNow.map((u) => `${u.status}${u.plan ? ' (the interaction plan)' : ''}${u.status === 'invalid' && invalidWhy ? ` (${invalidWhy})` : ''}`))].join(', ')} (${measureNow.slice(0, 3).map(unitName).join('; ')}${measureNow.length > 3 ? '…' : ''})${errored.length ? `. ${errored.length} failed to measure once (${String(errored[0].reason || '').slice(0, 140)}${errored[0].record?.errorLog ? `; sites/${name}/${errored[0].record.errorLog}` : ''}): measured once more; the same failure again on the same clone ends the run Blocked, never as clone work` : ''}`, pend ? [`it measures the last change to ${loop.objectives[pend.key]?.label || pend.key}`] : []);
}
done.push('measured');

// ---- 7. the review by eye: right after the first full score, before fixing anything (what a person sees first) ----
const rv = ev.review;
for (const d of rv.missingDirs) {
  if (app) await next(T(`score ${name} --only journey`), 'the journey\'s review frames are made by its score');
  await next(T(`review ${name}${d.route ? ` --route ${d.route}` : ''} --size ${d.size}`), `no side-by-side frames at ${d.size}${d.route ? ` for ${d.route}` : ''} yet: the clone is judged by eye at every size`, [`look at every sheet and give every frame a verdict under "## ${REVIEW_HEADING.clone}" in notes.md, with its token from index.md ("- <frame> <size> [<token>]: same" or "... : differs: <what>")`]);
}
const unverdicted = rv.frames.filter((f) => f.state === 'open');
if (unverdicted.length) await next(`write review verdicts under "## ${REVIEW_HEADING.clone}" in notes.md for ${unverdicted.length} frame(s) of the HTML clone (${unverdicted.slice(0, 3).map((f) => `${f.id} ${f.size}`).join(', ')}${unverdicted.length > 3 ? '…' : ''})`, `every frame needs a verdict from looking at it: "same" (with the reason below 85%), "differs: <what>", or "tool: <why>" with evidence made for that frame (${unverdicted[0].why}). The Next.js app's frames get their own verdicts later, under "## ${REVIEW_HEADING.app}"`, ['look at compare/review/<size>/index.md and its sheets'], { label: 'write review verdicts (HTML clone)' });
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
  if (u.check === 'hovers' && /--hide/.test(u.reason || '')) { loop.events.push({ at: new Date().toISOString(), e: k }); await next(T(`capture ${meta.url} ${name}${meta.mode === 'exact' ? ` --mode exact --permission "${unq(meta.permission)}"` : ''} --hide "${[...(meta.hide || []), u.reason.match(/--hide "([^"]+)"/)?.[1]].filter(Boolean).join(',')}"`), u.reason); }
}
// The objective to work next. One the agent has declared cannot be done within its permitted edits (offered only after
// its step was named again and again with nothing changing: progress.mjs) is concluded with that reason and listed;
// the work goes on with the next (RC6 astro: an unfixable review frame was named first, and a real defect behind it,
// the tracker, was never reached)
const pickObjective = async (side) => {
  for (let pick = nextObjective(loop, side); pick; pick = nextObjective(loop, side)) {
    const o = loop.objectives[pick.key];
    const st = loop.steps?.[String(workStep(o, pick.regressed)[0]).slice(0, 240)];
    const d = st && st.idle >= LIMITS.idleEscalate ? declaredCannot(notes, o.label) : null;
    if (!d) return pick;
    Object.assign(o, { state: 'concluded', owner: d.tool ? 'tool' : 'clone', concludedWhy: `declared not achievable within the permitted edits: ${d.why}` });
    loop.events.push({ at: new Date().toISOString(), e: `${o.label}: concluded (${o.concludedWhy})` });
    if (loop.pending?.key === o.key) loop.pending = null;
  }
  return null;
};
const pick = await pickObjective('clone');
if (pick) {
  const o = loop.objectives[pick.key];
  if (o.strategyDue) {
    o.strategyAsks = (o.strategyAsks || 0) + 1;
    loop.pending = null;
    await next(`record a change of strategy for "${o.label}" under ## Attempts in notes.md`, `${o.attempts} attempt(s) without progress (best shortfall ${o.bestShortfall}, now ${o.lastShortfall}): ${o.history.slice(-2).map((h) => `${h.focus ? `${h.focus}: ` : ''}${h.shortfall}`).join(', ')}. Look at it differently before the next attempt: one line naming "${o.label}", what the evidence shows, what the next attempt does differently, and "evidence: <file>" made now (an explain crop, a brief, a measurement). The next attempt without progress concludes it`, [T(`explain ${name} <y> --viewport ${o.viewport || 'desktop'}`)], { label: o.label, objective: true });
  }
  loop.pending = { key: o.key, kind: o.kind, side: 'clone', check: o.check, subjectHash: ev.subjectHash, issuedAt: new Date().toISOString(), focus: o.current?.below?.[0]?.name || o.current?.below?.[0]?.id || null };
  const [cmd, why, then] = workStep(o, pick.regressed);
  await next(cmd, why, then, { label: o.label, objective: true });
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
evsRef = [ev, evApp];
await blockOnErrors(errorLedger(evApp, 'app'), 'app');
observe(loop, evApp, notes, root);
// the app's plan too, and its errors once (the second time on the same app is Blocked above)
const appUnmeasured = evApp.units.filter((u) => ['missing', 'stale', 'invalid', 'error'].includes(u.status) && !u.cloneError && !(u.status === 'error' && (u.errorCount || 0) >= 2));
const appReviewMissing = !app && evApp.review.missingDirs.length;
if (appUnmeasured.length || appReviewMissing || evApp.review.status === 'stale') {
  const errorsNow = appUnmeasured.filter((u) => u.status === 'error');
  await next(T(`next ${name} --verify`), `the HTML clone ${Object.values(loop.objectives).some((o) => o.state === 'concluded' && o.side === 'clone') ? 'has done what the loop could' : 'passes'}: generate the Next.js app and verify it as delivered (every check, REPORT.next.md), since the app is what the user gets${errorsNow.length ? `. ${errorsNow.length} of its results failed to measure once (${String(errorsNow[0].reason || '').slice(0, 140)}): measured once more; the same failure again on the same app ends the run Blocked` : ''}`);
}
{
  const toolLint = (evApp.lint?.findings || []).filter((f) => f.owner === 'tool');
  if (toolLint.length) await blocked(`the Next.js app trueclone generated fails its lint where the clone does not: ${toolLint.slice(0, 3).map((f) => `${f.file}: ${f.what}`).join('; ')}`, 'a defect in the app generator: report it with the files named; never edit next/', { owner: 'tool', lint: toolLint });
  const cloneLint = (evApp.lint?.findings || []).filter((f) => f.owner !== 'tool');
  if (cloneLint.length) await next(`fix the app in clone/ (then regenerate): ${cloneLint[0].fix || cloneLint[0].file}`, cloneLint.map((f) => `${f.file}: ${f.what}`).join('; '), [T(`next ${name} --verify`)], { label: `fix the app: ${cloneLint[0].fix || cloneLint[0].file}` });
}
const appUnverdicted = evApp.review.frames.filter((f) => f.state === 'open');
if (appUnverdicted.length) {
  // the app's frames have their own verdicts, under their own heading: a frame id and size are shared with the clone's
  // review, the picture is not (RC6 zero). Nothing is inherited: the app is what the user gets
  await next(`write review verdicts for the Next.js app's ${appUnverdicted.length} frame(s) under "## ${REVIEW_HEADING.app}" in notes.md (${appUnverdicted.slice(0, 3).map((f) => `${f.id} ${f.size}`).join(', ')}${appUnverdicted.length > 3 ? '…' : ''})`, `the app's frames are in compare-next/review/ (index.md has each frame's token): one line per frame, "- <frame> <size> [<token>]: same | differs: <what> | tool: <why>", under its own heading "## ${REVIEW_HEADING.app}", separate from the HTML clone's "## ${REVIEW_HEADING.clone}" (the same frame names, other pictures)`, ['look at compare-next/review/<size>/index.md and its sheets'], { label: 'write review verdicts (Next.js app)' });
}
const appPick = await pickObjective('app');
if (appPick) {
  const o = loop.objectives[appPick.key];
  if (o.strategyDue) { o.strategyAsks = (o.strategyAsks || 0) + 1; loop.pending = null; await next(`record a change of strategy for "${o.label}" under ## Attempts in notes.md`, `${o.attempts} attempt(s) without progress on the app: one line naming it, what the evidence shows, what the next attempt does differently, and "evidence: <file>" made now`, [], { label: o.label, objective: true }); }
  loop.pending = { key: o.key, kind: o.kind, side: 'app', check: o.check, subjectHash: evApp.subjectHash, issuedAt: new Date().toISOString() };
  const [cmd, why, then] = workStep(o, appPick.regressed);
  await next(cmd, `${why}. The app differs where the clone passes: fix it in clone/ (never in next/), or when the generator is at fault, show it with evidence under ## Findings`, [T(`next ${name} --verify`), ...(then || []).slice(1)], { label: o.label, objective: true });
}
done.push('next.js');

// ---- 11. the outcome: every required item accounted for (accounting.mjs) ----
await saveLoop(root, loop);
const acc = account({ evs: [ev, evApp], loop, blockedUnits: blockedUnitsRef });
// Nothing required may be pending at a terminal outcome. Reaching here with any is status's own defect (a result it
// never named a step for): Blocked, owner tool, with every such item, never "Incomplete" (RC6, reproduced: an error seen
// twice and an interaction plan never run ended "Incomplete" with nothing listed)
const pendingItems = acc.items.filter((i) => i.disposition === 'pending');
if (pendingItems.length) await blocked(`status reached its outcome with ${pendingItems.length} required item(s) it never scheduled: ${pendingItems.slice(0, 5).map((i) => `${i.label} (${i.state})`).join('; ')}${pendingItems.length > 5 ? '…' : ''}`, 'a defect in trueclone: report it with compare/outcome.json (accounting) and compare/loop.json', { owner: 'tool' });
const verified = acc.items.length === 0;
if (verified !== Boolean(ev.verified && evApp.verified)) await blocked(`the evaluation (${ev.verified && evApp.verified ? 'verified' : 'not verified'}) and the accounting of every required item (${acc.items.length} not passed) disagree`, 'a defect in trueclone: report it with compare/outcome.json', { owner: 'tool' });
if (verified) {
  await writeOutcome({ outcome: 'verified', why: 'every required result passes on the clone and on the Next.js app as they are now, and every review frame is closed by eye', subjectHash: ev.subjectHash, appSubjectHash: evApp.subjectHash, elapsed: elapsedRef, accounting: acc });
  const err = await refreshReport({ force: true });
  if (err) await blocked(`every required result passes, but REPORT.md could not be written: ${err}`, 'a defect in trueclone: report it; the results and compare/outcome.json are kept', { owner: 'tool' });
  console.log(`trueclone status: ${name} (${mode})\ndone: ${done.join(', ')}\n\nVerified: every required result passes on the clone and on the Next.js app as they are now (${acc.total} required items). The deliverable is sites/${name}/REPORT.md and REPORT.next.md; hand it over with the clone.`);
  process.exit(0);
}
// Incomplete: every item not passed, each with what happened to it (a difference the loop concluded, or a result the tool
// cannot verify here); the same list as compare/outcome.json and REPORT.md
const objOf = (i) => Object.values(loop.objectives).find((o) => o.state === 'concluded' && i.label.endsWith(o.label.replace(/^Next\.js app: /, '')) && (o.side === i.side));
const lines = acc.items.map((i) => { const o = i.disposition === 'unresolved' ? objOf(i) : null; return `${i.label}: ${i.disposition === 'unresolved' ? `a difference left${o ? `: best ${o.bestValue ?? '–'} (shortfall ${o.bestShortfall}), now ${o.lastValue ?? '–'} (shortfall ${o.lastShortfall}), ${o.attempts} attempt(s), ${o.strategies || 0} change(s) of strategy; ${o.concludedWhy}` : ''}` : `not verifiable by the tool here (${i.reason || 'tool'})`}`; });
const nU = acc.counts.unresolved, nT = acc.counts['not-verifiable'];
const nextAction = nU ? `the differences listed are the clone's to fix; after a change, run ${T(`status ${name}`)} (a concluded result that passes on new content is counted again)` : 'the items listed are the tool\'s limits on this site; nothing more for the clone';
await writeOutcome({ outcome: 'incomplete', why: `${nU} difference(s) remain after the loop concluded them, and ${nT} item(s) the tool cannot verify here; every other required item passes`, unresolved: lines, next: nextAction, resume: `${T(`status ${name}`)} resumes from here: every result, attempt and conclusion is kept in compare/loop.json`, subjectHash: ev.subjectHash, appSubjectHash: evApp.subjectHash, elapsed: elapsedRef, accounting: acc });
const err = await refreshReport({ force: true });
if (err) await blocked(`the run concluded Incomplete, but REPORT.md could not be written: ${err}`, 'a defect in trueclone: report it; the results and compare/outcome.json (the full list) are kept', { owner: 'tool' });
console.log(`trueclone status: ${name} (${mode})\ndone: ${done.join(', ')}\n\nIncomplete: ${nU} difference(s) remain (listed), ${nT} item(s) not verifiable by the tool (listed); the other ${acc.counts.passed} of ${acc.total} required items pass:\n${lines.map((l) => `  - ${l}`).join('\n')}\n\nEach is in REPORT.md (Outcome) with what happened to it. Hand over the clone with REPORT.md as it stands, and say it is incomplete.`);
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
  // a review frame changes only when the clone does: the step is the change (status shoots the frame again after it);
  // `review` on an unchanged clone does nothing ("current"), and naming it was a loop (RC6 astro)
  if (o.kind === 'review') { const r = /routes\/([^/]+)\//.exec(o.dir || '')?.[1]; const route = r ? (meta.routes || []).find((x) => x.slug === r)?.path : null; return [`fix review frame ${o.frame} (${o.viewport}${route ? `, ${route}` : ''}): "${String(o.current?.verdict || '').slice(0, 80)}"`, `${o.current?.why || 'marked as different'}: what a visitor sees comes first. Change clone/script.js or clone/patches/ so the clone shows what the reference shows there (${o.dir}/${String(o.frame).split('/').pop()}.png has both)`, [T(`brief ${name}${route ? ` --route ${route}` : ''} --viewport ${['laptop', 'wide'].includes(vp) ? 'desktop' : vp}`) + ' for the section\'s code', `after the change: ${T(`status ${name}`)} (it shoots the frame again; give the new picture its verdict)`]]; }
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
