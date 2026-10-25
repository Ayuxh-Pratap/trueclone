// Workflow B: convert a finished HTML clone into a maintainable Next.js application, a separate, later request. Like
// status for the clone, it works out from the files alone where the conversion stands and the one thing to do next,
// and it ends the conversion itself by its exit code. It never reads, writes or changes the clone's outcome
// (compare/outcome.json, REPORT.md): the conversion has its own (compare-nextjs/outcome.json, REPORT.nextjs.md).
//
//   trueclone convert <name>          the first call is the request: from a Verified HTML clone (current), it records
//                                     the request and its baseline, and creates a conventional empty Next.js project in
//                                     sites/<name>/nextjs/ (only files that are missing: work is never overwritten).
//                                     Every later call: where the conversion stands and the next step
//   ... --from-incomplete "<words>"   the user chose to convert a clone whose run ended Incomplete: their words are
//                                     recorded and its limitations disclosed in REPORT.nextjs.md
//   trueclone convert <name> --verify install, typecheck, lint and build the app, serve the production build (it must
//                                     identify itself and serve every route of the scope), measure it against the
//                                     original reference with every check the clone had (compare-nextjs/), and shoot
//                                     its review frames
//
// The order: the request; the project; the conversion written (the placeholder page gone, every route a page); its
// automated source checks (conversion.mjs); the build; every required result measured on the app against the
// reference; the app's own review frames, each with a verdict under "## Review: app"; differences worked as objectives
// (loop.mjs, compare-nextjs/loop.json); the review criteria answered under "## Conversion review [<token>]"; the outcome.
//
// Exit codes (docs/policy.md "Outcomes"), for the conversion only:
//   0  Verified     the app builds, passes its source checks and review criteria, and every required result passes on it
//   1  work left    the next step is printed; do it and run convert again
//   2  Blocked      the conversion cannot proceed (no finished clone, the tool or the environment): cause and owner printed
//   3  Incomplete   every item is accounted for; differences or criteria not met are listed
//
// usage: trueclone convert <name> [--from-incomplete "<the user's words>"] | [--verify]
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, siteDir, APP_COMPARE, APP_REPORT } from './lib.mjs';
import { evaluate, unitName, REVIEW_HEADING, reviewDirs } from './verdict.mjs';
import { refIdOf, toolVersion, subjectHash } from './identity.mjs';
import { loadLoop, saveLoop, observe, nextObjective, recordActivity } from './loop.mjs';
import { readJournal, runsOf, runningNow, inputsDigest, trackStep, declaredCannot, LIMITS } from './progress.mjs';
import { account } from './accounting.mjs';
import { errorOwner, failureLine } from './failures.mjs';
import { routeUrl } from './routes.mjs';
import { capturedPaths, scopeLine } from './scope.mjs';
import { APP_DIR, REQUEST_FILE, BUILD_FILE, OUTCOME_FILE, REVIEW_TITLE, CRITERIA, reviewToken, scaffold, evaluateConversion, conversionItems } from './conversion.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) { console.error('usage: trueclone convert <name> [--from-incomplete "<the user\'s words>"] | [--verify]'); process.exit(1); }
const root = siteDir(name);
const app = path.join(root, APP_DIR);
const T = (s) => `npx trueclone ${s}`;
const json = (p, d = null) => fs.readFile(path.join(root, p), 'utf8').then(JSON.parse).catch(() => d);
const ENV = { ...process.env, TC_COMPARE: APP_COMPARE, TC_REPORT: APP_REPORT };
const meta = await json('reference/meta.json');
if (!meta) { console.log(`trueclone convert: ${name}\n\nBlocked (owner: run): sites/${name} has no clone to convert. A conversion starts from a finished HTML clone: clone the site first (its own request: capture, then the status loop), then ask for the conversion.`); process.exit(2); }

// npm/npx are .cmd files on Windows and need a shell; Node warns (DEP0190) when a shell gets separate arguments, so
// one quoted command line there instead
const spawnCmd = (cmd, args, opts = {}) => (process.platform === 'win32'
  ? spawn([cmd, ...args].map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' '), { ...opts, shell: true })
  : spawn(cmd, args, opts));

// ---------------- the request ----------------
// A conversion starts from a finished HTML clone: Verified on the clone as it is now, or Incomplete when the user says
// to convert it anyway. Anything else (no outcome, in progress, Blocked, or an outcome of earlier content) is no
// baseline: refused, with nothing written.
async function request() {
  const have = await json(REQUEST_FILE);
  if (have) return have;
  const html = await json('compare/outcome.json');
  const cloneHash = await subjectHash(root, 'clone');
  const refuse = (why, what) => { console.log(`trueclone convert: ${name}\n\nBlocked (owner: clone): ${why}\nWhat to do: ${what}\nNothing was created; the HTML clone and its outcome are unchanged.`); process.exit(2); };
  if (!html || !['verified', 'incomplete'].includes(html.outcome)) refuse(`the HTML clone is not finished (its outcome: ${html?.outcome || 'none'}). A conversion starts from a finished clone.`, `finish the cloning workflow first: ${T(`status ${name}`)} until it exits 0 (Verified) or 3 (Incomplete); then ask for the conversion again`);
  if (html.subjectHash !== cloneHash) refuse(`the HTML clone changed after its outcome (${html.outcome}) was decided: that outcome describes earlier content.`, `${T(`status ${name}`)} decides the clone's outcome again; then ask for the conversion again`);
  const fromIncomplete = typeof flags['from-incomplete'] === 'string' && flags['from-incomplete'].trim() ? flags['from-incomplete'].trim() : null;
  if (html.outcome === 'incomplete' && !fromIncomplete) refuse(`the HTML clone ended Incomplete: ${html.why || ''}. A conversion normally starts from a Verified clone.`, `finish the clone (the differences are listed in REPORT.md), or, if the user wants the conversion anyway, run ${T(`convert ${name} --from-incomplete "<the user's words>"`)}: the clone's limitations are then recorded and disclosed in the conversion's report`);
  const limitations = html.outcome === 'incomplete' ? (html.accounting?.items || []).map((i) => `${i.label}: ${i.disposition}${i.reason ? ` (${String(i.reason).slice(0, 140)})` : ''}`) : [];
  const req = { requestedAt: new Date().toISOString(), tool: toolVersion(), baseline: { outcome: html.outcome, subjectHash: cloneHash, refId: refIdOf(meta), decidedAt: html.at || null, scope: scopeLine(meta), ...(fromIncomplete ? { accepted: fromIncomplete } : {}), limitations } };
  await fs.mkdir(path.join(root, APP_COMPARE), { recursive: true });
  await fs.writeFile(path.join(root, REQUEST_FILE), JSON.stringify(req, null, 1));
  console.log(`conversion requested: from the HTML clone ${html.outcome === 'verified' ? 'Verified' : `Incomplete (converted anyway: "${fromIncomplete}")`} on content ${cloneHash} (${scopeLine(meta)})`);
  return req;
}

if (flags.verify) await verify();
else await statusLoop();

// ---------------- convert --verify: build, serve, measure ----------------
async function verify() {
  if (!(await json(REQUEST_FILE))) { console.error(`no conversion requested for ${name}: ${T(`convert ${name}`)} first (the request)`); process.exit(1); }
  if (!fsSync.existsSync(path.join(app, 'package.json'))) { console.error(`no Next.js project in sites/${name}/${APP_DIR}/: ${T(`convert ${name}`)} creates it`); process.exit(1); }
  const logDir = path.join(root, APP_COMPARE, 'logs');
  await fs.mkdir(logDir, { recursive: true });
  const runStep = (step, cmd, args) => new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawnCmd(cmd, args, { cwd: app, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_OPTIONS: '', NEXT_TELEMETRY_DISABLED: '1' } });
    let out = '';
    p.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
    p.stderr.on('data', (d) => { out += d; process.stderr.write(d); });
    p.on('close', async (code) => {
      const log = path.join(logDir, `${step}.log`);
      await fs.writeFile(log, `# ${cmd} ${args.join(' ')} (exit ${code}, ${Math.round((Date.now() - t0) / 1000)}s)\n${out}`);
      resolve({ ok: code === 0, exit: code, seconds: Math.round((Date.now() - t0) / 1000), log: path.relative(root, log).split(path.sep).join('/'), ...(code === 0 ? {} : { error: failureLine(out) || out.trim().split('\n').slice(-3).join(' | ').slice(0, 300) }) });
    });
  });
  const steps = {};
  const record = async (subject) => { await fs.writeFile(path.join(root, BUILD_FILE), JSON.stringify({ subjectHash: subject, at: new Date().toISOString(), tool: toolVersion(), steps, ...(routesServed.length ? { routes: routesServed } : {}) }, null, 1)); };
  const routesServed = [];
  // install when the dependencies are absent or the manifest changed since the last install
  const manifestNow = ['package.json', 'package-lock.json'].map((f) => { try { return fsSync.readFileSync(path.join(app, f), 'utf8'); } catch { return ''; } }).join('\0');
  const prev = await json(BUILD_FILE);
  const installed = fsSync.existsSync(path.join(app, 'node_modules', 'next', 'package.json')) && prev?.manifest === manifestHash(manifestNow);
  steps.install = installed ? { ok: true, exit: 0, kept: true } : await runStep('install', 'npm', ['install', '--no-audit', '--no-fund']);
  // what is built and measured: the source after the install (it writes package-lock.json)
  let subject = await subjectHash(root, 'app');
  const finish = async (code, msg) => { await record(subject); const b = await json(BUILD_FILE); b.manifest = manifestHash(['package.json', 'package-lock.json'].map((f) => { try { return fsSync.readFileSync(path.join(app, f), 'utf8'); } catch { return ''; } }).join('\0')); await fs.writeFile(path.join(root, BUILD_FILE), JSON.stringify(b, null, 1)); renderReport(); if (msg) console.log(msg); process.exit(code); };
  if (!steps.install.ok) await finish(1, `npm install failed: ${steps.install.error} (${steps.install.log}); ${T(`convert ${name}`)} names what to do`);
  const pkg = JSON.parse(await fs.readFile(path.join(app, 'package.json'), 'utf8'));
  steps.typecheck = await runStep('typecheck', 'npx', ['tsc', '--noEmit']);
  steps.lint = pkg.scripts?.lint ? await runStep('lint', 'npm', ['run', 'lint']) : { ok: false, exit: null, error: 'no "lint" script in package.json' };
  steps.build = await runStep('build', 'npx', ['next', 'build']);
  // next build may complete tsconfig.json or next-env.d.ts: what is measured is the source as it is after the build
  subject = await subjectHash(root, 'app');
  if (!steps.typecheck.ok || !steps.lint.ok || !steps.build.ok) await finish(1, `the app does not ${!steps.build.ok ? 'build' : !steps.typecheck.ok ? 'type-check' : 'lint'}: ${(steps.build.ok ? steps.typecheck.ok ? steps.lint : steps.typecheck : steps.build).error}; ${T(`convert ${name}`)} names what to fix`);
  // serve the production build on a port free on every interface; the page served must be this build
  const port = await freePort(3100);
  const token = `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await fs.mkdir(path.join(app, 'public'), { recursive: true });
  const tokenFile = path.join(app, 'public', 'trueclone-build.txt');
  await fs.writeFile(tokenFile, token);
  const server = spawnCmd('npx', ['next', 'start', '-p', String(port)], { cwd: app, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_OPTIONS: '' } });
  let serverLog = '';
  server.stdout.on('data', (d) => { serverLog += d; });
  server.stderr.on('data', (d) => { serverLog += d; });
  // synchronous: the process may exit right after, and an async taskkill can lose the race (a server left behind)
  const stop = () => { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); else server.kill(); fsSync.rmSync(tokenFile, { force: true }); };
  const base = `http://127.0.0.1:${port}/`;
  let ours = false;
  for (let i = 0; i < 60 && !ours; i++) {
    try { ours = (await (await fetch(`${base}trueclone-build.txt`)).text()).trim() === token; } catch { /* starting */ }
    if (!ours) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ours) { stop(); steps.serve = { ok: false, exit: null, error: `the production build did not come up as itself on ${base} within 60 s: ${failureLine(serverLog) || serverLog.trim().split('\n').slice(-2).join(' | ')}` }; await finish(1, steps.serve.error); }
  // every route of the scope, served (a 404 is a route the conversion has not made)
  for (const p of capturedPaths(meta)) {
    const r = await fetch(routeUrl(p, base, true), { redirect: 'manual' }).catch((e) => ({ status: `error: ${e.message}` }));
    routesServed.push({ path: p, status: r.status });
  }
  const bad = routesServed.filter((r) => r.status !== 200);
  steps.serve = bad.length ? { ok: false, exit: null, error: `route(s) not served (200 expected): ${bad.map((r) => `${r.path} ${r.status}`).join(', ')}` } : { ok: true, exit: 0 };
  await record(subject);
  try {
    // every check the clone had, measured on the app against the original reference (results already current on this
    // app content are kept: score re-measures what is missing or stale); then the app's own review frames
    if (steps.serve.ok) {
      spawnSync(process.execPath, [path.join(HERE, 'score.mjs'), name, '--url', base], { cwd: process.cwd(), stdio: 'inherit', env: ENV });
      if (!meta.canvasApp) for (const d of reviewDirs(meta, 'app')) spawnSync(process.execPath, [path.join(HERE, 'review.mjs'), name, '--size', d.size, '--url', base, ...(d.route ? ['--route', d.route] : [])], { cwd: process.cwd(), stdio: 'inherit', env: ENV });
    }
  } finally { stop(); }
  await finish(steps.serve.ok ? 0 : 1, steps.serve.ok ? `measured: the Next.js app against the reference (${APP_COMPARE}/); ${T(`convert ${name}`)} says what is next. The HTML clone's outcome and REPORT.md are unchanged.` : `${steps.serve.error}; ${T(`convert ${name}`)} names what to do`);
}
function manifestHash(text) { let h = 0; for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0; return String(h >>> 0); }
async function freePort(start) {
  const freeOn = (p, h) => new Promise((resolve) => { const t = net.createServer().once('error', () => resolve(false)).once('listening', () => t.close(() => resolve(true))).listen(p, h); });
  for (let p = start; p < start + 50; p++) if ((await freeOn(p, '127.0.0.1')) && (await freeOn(p, '0.0.0.0')) && (await freeOn(p, '::').catch(() => true))) return p;
  throw new Error('no free port');
}
function renderReport() {
  const r = spawnSync(process.execPath, [path.join(HERE, 'report.mjs'), name], { encoding: 'utf8', env: { ...ENV, TC_LOG: '' } });
  return r.status === 0 ? null : failureLine(`${r.stdout || ''}\n${r.stderr || ''}`) || `report exited ${r.status}`;
}

// ---------------- convert: where the conversion stands, and the next step ----------------
async function statusLoop() {
  const req = await request();
  const loop = await loadLoop(root, refIdOf(meta), { dir: APP_COMPARE });
  const elapsed = recordActivity(loop);
  const runs = runsOf(await readJournal(root));
  const busy = runningNow(runs, { only: ['convert', 'capture', 'record-bundle'] });
  if (busy.length) { await saveLoop(root, loop); console.log(`trueclone convert: ${name}\n\nwaiting: ${busy.map((r) => `\`${r.step} ${(r.args || []).join(' ')}\` (pid ${r.pid})`).join('; ')} is still running on this site. Let it finish, then run \`${T(`convert ${name}`)}\` again. Work is left.`); process.exit(1); }
  for (const old of ['next', 'compare-next']) if (fsSync.existsSync(path.join(root, old))) { console.log(`note: sites/${name}/${old}/ is output of the retired Next.js generator: not part of this conversion, never read or measured.`); break; }
  const made = await scaffold(root, name, meta);
  if (made.created.length) console.log(`project: created ${made.created.length} file(s) in sites/${name}/${APP_DIR}/ (${made.created.join(', ')})${made.kept.length ? `; kept ${made.kept.length} that exist` : ''}`);
  const done = ['request', 'project'];
  const appHash = await subjectHash(root, 'app');
  const cloneHash = await subjectHash(root, 'clone');
  let blockedUnits = new Map();
  let lastEv = null, lastConv = null;
  const writeOutcome = async (o) => { await fs.mkdir(path.join(root, APP_COMPARE), { recursive: true }); await fs.writeFile(path.join(root, OUTCOME_FILE), JSON.stringify({ deliverable: 'nextjs', ...o, subjectHash: appHash, baseline: { outcome: req.baseline.outcome, subjectHash: req.baseline.subjectHash, ...(req.baseline.accepted ? { accepted: req.baseline.accepted } : {}), cloneChangedSince: Boolean(cloneHash && cloneHash !== req.baseline.subjectHash) }, elapsed, tool: toolVersion(), at: new Date().toISOString() }, null, 2)); };
  const digest = inputsDigest(root, { subject: appHash, appSubject: null, tool: toolVersion(), dirs: [APP_COMPARE, 'reference'] });
  const head = () => `trueclone convert: ${name} (Next.js conversion)${done.length ? `\ndone: ${done.join(', ')}` : ''}`;
  const accountAll = (blockedBy = null) => {
    const acc = account({ evs: lastEv ? [lastEv] : [], loop, blockedUnits, blockedBy });
    const extra = lastConv ? conversionItems(lastConv) : [];
    if (blockedBy) for (const i of extra) if (i.disposition === 'pending') Object.assign(i, { disposition: 'blocked', owner: blockedBy.owner, reason: `not reached: the conversion is Blocked (${String(blockedBy.why).slice(0, 160)})`, notReached: true });
    const counts = { ...acc.counts };
    for (const i of extra) counts[i.disposition] = (counts[i.disposition] || 0) + 1;
    return { total: acc.total + extra.length, counts, ids: [...acc.ids, ...extra.map((i) => i.id)], items: [...acc.items, ...extra.filter((i) => i.disposition !== 'passed')] };
  };
  const blocked = async (why, what, data = {}) => {
    const accounting = accountAll({ owner: data.owner || 'tool', why });
    await writeOutcome({ outcome: 'blocked', owner: data.owner || 'tool', why, next: what, resume: `fix the cause, then ${T(`convert ${name}`)}`, accounting, ...data });
    await saveLoop(root, loop);
    renderReport();
    console.log(`${head()}\n\nBlocked (owner: ${data.owner || 'tool'}): ${why}\nWhat to do: ${what}\nEverything done so far is kept; the HTML clone's outcome is unchanged. After fixing the cause, run ${T(`convert ${name}`)} again.`);
    process.exit(2);
  };
  const next = async (cmd, why, then = [], opts = {}) => {
    const s = trackStep(loop, cmd, await digest, runs, new Date(), { work: Boolean(opts.work) });
    if (s.failed >= LIMITS.failed) await blocked(`the step \`${cmd}\` failed ${s.failed} times on the same inputs${s.lastRun?.log ? ` (sites/${name}/${s.lastRun.log})` : ''}`, 'read its log: a failure of the environment (network, npm) is fixed there; one of trueclone is reported', { owner: 'tool', step: cmd });
    if (s.ineffective >= LIMITS.ineffective) await blocked(`the step \`${cmd}\` ran ${s.ineffective + 1} times and changed nothing convert decides on: a defect in trueclone`, `report it with sites/${name}/${APP_COMPARE}/loop.json`, { owner: 'tool', step: cmd });
    if (s.idle >= LIMITS.idleEscalate) {
      const d = /^npx trueclone /.test(cmd) ? null : declaredCannot(await fs.readFile(path.join(root, 'notes.md'), 'utf8').catch(() => ''), opts.label || cmd);
      if (d) await blocked(`the step \`${cmd}\` cannot be done, as recorded under ## Findings: ${d.why}`, d.tool ? 'a defect in trueclone: report it with the Finding' : 'decide with the user', { owner: d.tool ? 'tool' : 'app', step: cmd, declared: true });
      if (s.idle >= LIMITS.idleBlock) await blocked(`convert named the step \`${cmd}\` ${s.idle + 1} times and nothing it depends on changed: the conversion is not progressing`, `do the step, or if it cannot be done write under ## Findings "- cannot: ${opts.label || cmd}: <why>"; then run ${T(`convert ${name}`)}`, { owner: 'run', step: cmd });
      why = `${why}. Convert has named this step ${s.idle + 1} times and nothing it depends on changed: do it, or if it cannot be done write one line under ## Findings, "- cannot: ${opts.label || cmd}: <why>", and run convert`;
    }
    console.log(`${head()}\n\nnext: ${cmd}\n  why: ${why}`);
    for (const t of then) console.log(`  then: ${t}`);
    await writeOutcome({ outcome: 'in-progress', next: cmd, why });
    await saveLoop(root, loop);
    renderReport();
    console.log(`\nWork is left in the conversion. Do the next step, then run \`${T(`convert ${name}`)}\` again; do not end your turn while it says work is left. The HTML clone (clone/, compare/, REPORT.md) is the finished deliverable of the cloning request: change it only through that workflow.`);
    process.exit(1);
  };
  const conv = await evaluateConversion(root);
  lastConv = conv;
  // the conversion written: the placeholder page replaced, every route of the scope a page
  if (conv.placeholder) {
    const routes = capturedPaths(meta);
    await next(`convert the clone into sites/${name}/${APP_DIR}/`, `the project is a conventional empty Next.js app (App Router, TypeScript strict, Tailwind, ESLint); the conversion is written: ${routes.length} route(s) to build as App Router pages (${routes.slice(0, 6).join(', ')}${routes.length > 6 ? '…' : ''}), from the clone in sites/${name}/clone/ (its markup, styles, assets and script.js behaviour), DESIGN.md (the theme) and notes.md (## Behaviours). Follow the skill's "Converting a clone to Next.js": components with clear responsibilities, content in typed modules, Tailwind first, client components only where interaction needs them, every listener, observer, timer and animation cleaned up, a README that says where to change what. Replace app/page.tsx; never copy the clone into public/ as pages, frame it, or load its script.js globally`, [`${T(`convert ${name}`)} checks the source as you go`, `npm run dev in sites/${name}/${APP_DIR}/ to look at it`], { work: true, label: 'convert the clone' });
  }
  done.push('written');
  // the source checks, before anything is built on it; the README last (it describes what the work became)
  const fixSource = async (list) => {
    const f = list[0];
    await next(`fix the app's source: ${f.file}${f.line ? `:${f.line}` : ''}`, `${f.rule}: ${f.what}${list.length > 1 ? `. ${list.length - 1} more source finding(s): ${list.slice(1, 4).map((x) => `${x.file}${x.line ? `:${x.line}` : ''} (${x.rule})`).join('; ')}${list.length > 4 ? '…' : ''} (all in ${APP_REPORT})` : ''}`, [`${T(`convert ${name}`)}`], { work: true, label: `fix the app's source (${f.rule})` });
  };
  const codeFindings = conv.lint.filter((f) => f.rule !== 'docs');
  if (codeFindings.length) await fixSource(codeFindings);
  done.push('source checks');
  // built: install, typecheck, lint, build and serve, on the app as it is now
  if (!conv.buildCurrent) await next(T(`convert ${name} --verify`), conv.build ? 'the app changed since it was last built and measured: built, served and measured again (only what changed is re-measured)' : 'not built yet: install, typecheck, lint, build, serve the production build, then measure it against the original reference');
  const failedStep = ['install', 'typecheck', 'lint', 'build', 'serve'].find((s) => !conv.build.steps?.[s]?.ok);
  if (failedStep) {
    const r = conv.build.steps?.[failedStep];
    if (failedStep === 'install' || (failedStep === 'serve' && !/route\(s\) not served/.test(r?.error || ''))) await blocked(`${failedStep} failed: ${r?.error || 'not run'}`, `${failedStep === 'install' ? 'check the network and npm (the log names the package)' : 'the production server did not start: read the log'}, then ${T(`convert ${name} --verify`)}`, { owner: errorOwner({ error: r?.error || '' }) === 'environment' ? 'environment' : 'tool', log: r?.log || null });
    await next(`fix the ${failedStep} error in sites/${name}/${APP_DIR}/`, `${r?.error || `${failedStep} did not pass`}${r?.log ? ` (whole output: sites/${name}/${r.log})` : ''}`, [T(`convert ${name} --verify`)], { work: true, label: `fix the ${failedStep} error` });
  }
  done.push('built');
  // every required result measured on the app as it is now, against the original reference
  const ev = await evaluate(root, { side: 'app' });
  lastEv = ev;
  const errs = ev.units.filter((u) => u.status === 'error');
  loop.errors ||= {};
  for (const u of errs) {
    const id = `${u.check}:${u.route || ''}:${u.viewport || ''}:${u.state || ''}`;
    const at = u.record?.identity?.endedAt || null;
    const seen = loop.errors[id];
    loop.errors[id] = !seen || seen.subjectHash !== ev.subjectHash ? { subjectHash: ev.subjectHash, at, count: 1 } : seen.at !== at ? { ...seen, at, count: seen.count + 1 } : seen;
    u.errorCount = loop.errors[id].count;
    u.errorOwner = errorOwner(u.record) === 'clone' ? 'app' : errorOwner(u.record);
    if (u.errorCount >= 2 && u.errorOwner === 'app') u.cloneError = true;
  }
  const blockedNow = errs.filter((u) => u.errorCount >= 2 && u.errorOwner !== 'app');
  if (blockedNow.length) {
    blockedUnits = new Map(blockedNow.map((u) => [`app:unit:${u.check}|${u.route || ''}|${u.viewport || ''}|${u.state || ''}`, u.errorOwner]));
    await blocked(`${blockedNow.length} required result(s) of the app cannot be measured: the same error on the same app after a second measurement: ${blockedNow.slice(0, 3).map((u) => `${unitName(u)}: ${String(u.reason || '').slice(0, 140)}`).join('; ')}`, blockedNow.every((u) => u.errorOwner === 'environment') ? `check the network and that ${meta.url} opens in a browser here, then ${T(`convert ${name} --verify`)}` : 'a defect in trueclone: report it with the log', { owner: blockedNow.every((u) => u.errorOwner === 'environment') ? 'environment' : 'tool' });
  }
  const unmeasured = ev.units.filter((u) => ['missing', 'stale', 'invalid'].includes(u.status) || (u.status === 'error' && (u.errorCount || 0) < 2));
  if (unmeasured.length || ev.review.missingDirs.length || ev.review.status === 'stale') await next(T(`convert ${name} --verify`), `${unmeasured.length ? `${unmeasured.length} required result(s) not measured on the app as it is now (${unmeasured.slice(0, 3).map(unitName).join('; ')}${unmeasured.length > 3 ? '…' : ''})` : 'the app\'s review frames are not shot of the app as it is now'}: measured against the original reference`);
  done.push('measured');
  if (ev.lint?.findings.length) { const f = ev.lint.findings[0]; await next(`fix the app's source: ${f.fix || f.file}`, ev.lint.findings.map((x) => `${x.file}: ${x.what}`).join('; '), [T(`convert ${name} --verify`)], { work: true, label: `fix the app's source: ${f.fix || f.file}` }); }
  const open = ev.review.frames.filter((f) => f.state === 'open');
  if (open.length) await next(`write review verdicts for the Next.js app's ${open.length} frame(s) under "## ${REVIEW_HEADING.app}" in notes.md (${open.slice(0, 3).map((f) => `${f.id} ${f.size}`).join(', ')}${open.length > 3 ? '…' : ''})`, `the app's frames are in ${APP_COMPARE}/review/ (index.md has each frame's token): one line per frame, "- <frame> <size> [<token>]: same | differs: <what> | tool: <why>", under "## ${REVIEW_HEADING.app}", separate from the HTML clone's review (the same frame names, other pictures)`, [`look at ${APP_COMPARE}/review/<size>/index.md and its sheets`], { label: 'write review verdicts (Next.js app)' });
  done.push('reviewed');
  // the differences, as objectives: worked in the app's source until each passes or is concluded
  const notes = await fs.readFile(path.join(root, 'notes.md'), 'utf8').catch(() => '');
  observe(loop, ev, notes, root);
  for (let pick = nextObjective(loop, 'app'); pick; pick = nextObjective(loop, 'app')) {
    const o = loop.objectives[pick.key];
    const st = loop.steps?.[String(stepOf(o)[0]).slice(0, 240)];
    const d = st && st.idle >= LIMITS.idleEscalate ? declaredCannot(notes, o.label) : null;
    if (d) { Object.assign(o, { state: 'concluded', owner: d.tool ? 'tool' : 'app', concludedWhy: `declared not achievable: ${d.why}` }); if (loop.pending?.key === o.key) loop.pending = null; continue; }
    if (o.strategyDue) { o.strategyAsks = (o.strategyAsks || 0) + 1; loop.pending = null; await next(`record a change of strategy for "${o.label}" under ## Attempts in notes.md`, `${o.attempts} attempt(s) without progress: one line naming it, what the evidence shows, what the next attempt does differently, and "evidence: <file>" made now. The next attempt without progress concludes it`, [], { label: o.label, work: true }); }
    loop.pending = { key: o.key, kind: o.kind, side: 'app', check: o.check, subjectHash: ev.subjectHash, issuedAt: new Date().toISOString() };
    const [cmd, why, then] = stepOf(o);
    await next(cmd, why, then, { label: o.label, work: true });
  }
  done.push('loop');
  const docFindings = conv.lint.filter((f) => f.rule === 'docs');
  if (docFindings.length) await fixSource(docFindings);
  done.push('docs');
  // the review criteria, given to the source as it is now
  const crit = conv.criteria.filter((c) => ['missing', 'stale'].includes(c.state));
  if (crit.length) await next(`write "## ${REVIEW_TITLE} [${reviewToken(appHash)}]" in notes.md: ${crit.map((c) => c.id).join(', ')}`, `judge the source against each criterion by reading it, one line each: "- C<n> <key>: met: <evidence: the nextjs/ files that show it>" or "- C<n> <key>: not met: <why>" (${crit[0].id}: ${crit[0].why}). The criteria: ${CRITERIA.map(([id, k, t]) => `${id} ${k}: ${t}`).join('; ')}. The token in the heading is the app's content (${reviewToken(appHash)}): after a change to the app, the review is given again`, [], { label: 'write the conversion review' });
  done.push('criteria');
  // the outcome: every item of the conversion accounted for
  await saveLoop(root, loop);
  const acc = accountAll();
  const pending = acc.items.filter((i) => i.disposition === 'pending');
  if (pending.length) await blocked(`convert reached its outcome with ${pending.length} item(s) it never scheduled: ${pending.slice(0, 5).map((i) => `${i.label} (${i.state})`).join('; ')}`, `a defect in trueclone: report it with ${APP_COMPARE}/outcome.json`, { owner: 'tool' });
  const verified = acc.items.length === 0;
  const baseNote = `from the HTML clone ${req.baseline.outcome}${req.baseline.accepted ? ` (converted anyway: "${req.baseline.accepted}")` : ''}`;
  if (verified) {
    await writeOutcome({ outcome: 'verified', why: `the app builds and serves every route, passes its source checks and review criteria, and every required result passes on it against the original reference; ${baseNote}`, accounting: acc });
    renderReport();
    console.log(`${head()}\n\nVerified: the Next.js app in sites/${name}/${APP_DIR}/ builds, passes its source checks and the ${CRITERIA.length} review criteria, and every required result passes on it against the original reference (${acc.total} items; ${baseNote}).\nThe deliverable is sites/${name}/${APP_DIR}/ with sites/${name}/${APP_REPORT}. The HTML clone and its REPORT.md are unchanged.`);
    process.exit(0);
  }
  const lines = acc.items.map((i) => `${i.label}: ${i.disposition === 'unresolved' ? 'not met / a difference left' : i.disposition === 'not-verifiable' ? 'not verifiable by the tool here' : i.disposition}${i.reason ? ` (${String(i.reason).slice(0, 160)})` : ''}`);
  await writeOutcome({ outcome: 'incomplete', why: `${acc.counts.unresolved || 0} difference(s) or criteria not met, ${acc.counts['not-verifiable'] || 0} item(s) the tool cannot verify; every other item passes; ${baseNote}`, unresolved: lines, next: `the items listed are the conversion's to fix; after a change, run ${T(`convert ${name}`)}`, accounting: acc });
  renderReport();
  console.log(`${head()}\n\nIncomplete: the conversion's other ${acc.counts.passed || 0} of ${acc.total} items pass:\n${lines.map((l) => `  - ${l}`).join('\n')}\n\nEach is in ${APP_REPORT}. Hand over the app with ${APP_REPORT} as it stands, and say it is incomplete. The HTML clone and its REPORT.md are unchanged.`);
  process.exit(3);

  // the step for an objective of the app: what to change, and how it is measured again
  function stepOf(o) {
    if (o.kind === 'review') return [`fix the app's review frame ${o.frame} (${o.viewport}): "${String(o.verdict || '').slice(0, 80)}"`, `${o.why || 'marked as different'}: change the app's source (nextjs/) so it shows what the reference shows there (${o.dir}/${String(o.frame).split('/').pop()}.png has both); the HTML clone's frame of the same name shows how the clone does it`, [`after the change: ${T(`convert ${name} --verify`)}, then give the new picture its verdict`]];
    const below = (o.current?.below || []).slice(0, 3).map((m) => `${m.name || m.id}${m.y !== undefined ? ` (y ${m.y})` : ''} ${m.value}`).join(', ');
    return [`make ${o.label.replace(/^Next\.js app: /, '')} on the app match the reference`, `${o.current?.value ?? '–'}% against ${o.current?.bar ?? '–'}${below ? `; below their floor: ${below}` : ''}; attempt ${o.attempts + 1}. Compare with the HTML clone, where it passes (sites/${name}/clone/ and compare/), and change the app's source (nextjs/)`, [`after the change: ${T(`convert ${name} --verify`)}`]];
  }
}
