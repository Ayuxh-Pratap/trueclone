#!/usr/bin/env node
// trueclone CLI: one entry point for every step. Steps run in the current folder: everything about a site lives
// in ./sites/<name>/ (reference capture, HTML clone, design system, scores; a Next.js conversion when one is asked for).
// Two workflows, each with its own outcome: cloning (capture, then the `status` loop) delivers the HTML/CSS/JS clone;
// converting a finished clone into a Next.js application is a separate, later request (`convert`).
//
//   npx @trueclone/cli init         set up this folder for a coding agent (skill, AGENTS.md, REA MCP, .gitignore) and
//                                   install trueclone as a dev dependency, so `npx trueclone <step>` works from then on
//   trueclone <url> [name]          capture a site (template mode) and draft its design system: the agent's first step
//   trueclone <step> <name> [...]   run one step (see `trueclone help`)
//   trueclone rea <args>            REA (Reverse Engineer Anything), bundled: `trueclone rea mcp`, `trueclone rea doctor`
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = path.join(PKG, 'scripts');
const require = createRequire(import.meta.url);
const { name, version } = JSON.parse(await fs.readFile(path.join(PKG, 'package.json'), 'utf8'));

const STEPS = {
  status: ['status.mjs', 'cloning: where the HTML clone stands and the one next step, from the files alone (exit 0 only when every gate passes)'],
  convert: ['convert.mjs', 'converting (a separate, later request): turn the finished HTML clone into a maintainable Next.js app in nextjs/; run again for its status and next step; --verify builds and measures it'],
  brief: ['brief.mjs', 'one section\'s evidence: the site\'s handlers (file:line + code), recorded motion, script-owned values, what a visitor operates, scores'],
  vendor: ['vendor.mjs', 'the site\'s libraries at the site\'s versions (GSAP + plugins, Lenis, three.js, Swiper) into clone/patches/'],
  serve: ['serve.mjs', 'open the HTML clone on a free port'],
  capture: ['capture.mjs', 'capture a live page at 5 sizes (3 to build from, 2 held out), its scripts, assets, rendered HTML, inline values at extra sizes'],
  seed: ['seed.mjs', 'clone/ from the script-free mirror: structure, viewport functions, pins, reveals (--patches: re-apply clone/patches/ only)'],
  design: ['design.mjs', 'design-tokens.json -> DESIGN.md (linted), shadcn globals.css, clone/tokens.css'],
  motion: ['motion.mjs', 'motion inventory from the live runtime (GSAP/ScrollTrigger, Lenis, Swiper, CSS animations)'],
  understand: ['understand.mjs', 'optional, rarely needed: REA code evidence -> reference/code.md (capture already saves every script, ranked, in reference/scripts/)'],
  reveals: ['reveals.mjs', 'record one-shot scroll reveals frame by frame, so seed can replay them (any library)'],
  widgets: ['widgets.mjs', 'record every tab and menu state by clicking it, so seed can replay them (template mode)'],
  'record-bundle': ['record-bundle.mjs', 'own bundle (exact mode): record every captured page and every file the capture saved into reference/bundle/, without capturing again'],
  journey: ['journey.mjs', 'app mode (a canvas app): --draft finds the journey (gates, wheel, holds) on the live page; then the reference checkpoints (frames, three.js scene, shaders); --clone scores the clone through it'],
  reads: ['reads.mjs', 'every read of the live page the clone is built from (states, motion, spec, widgets side by side, then reveals alone); only the missing ones'],
  calibrate: ['calibrate.mjs', 'the reference against itself: two more loads through the same checks -> reference/noise.json, the bar of every frame'],
  behaviour: ['behaviour.mjs', 'what changes by itself on both live pages: loop speed and direction, carousel intervals, a startup shuffle'],
  states: ['states.mjs', 'live scroll states at every scored size; --clone scores the rebuild step by step (canvases too)'],
  curves: ['curves.mjs', 'motion score: sampled property curves, reference vs clone (motion-map.json)'],
  interact: ['interact.mjs', 'interaction tests: click/hover/drag/key scenarios on both sides (interactions.json)'],
  detail: ['detail.mjs', 'style diff at matching points: font, size, weight, line height, colour, background, radius'],
  hovers: ['hovers.mjs', 'hover every control and every element with a hover listener on both sides; the outcome must match'],
  load: ['load.mjs', 'load sequence: how settled each side is 0.25/0.5/1/2/4 s after navigation, cold cache, same network'],
  drift: ['drift.mjs', 'has the live page changed since the capture? (page height and sections per width vs meta.json)'],
  owned: ['owned.mjs', 'which sections of the clone script.js rebuilds at boot (load with scripts blocked vs running)'],
  rules: ['rules.mjs', 'every CSS rule matching an element on the reference (+ ::before/::after, @media); --clone for the clone'],
  review: ['review.mjs', 'reference and clone side by side at a held-out size: load, every section, hover; verdicts go in notes.md'],
  explain: ['explain.mjs', 'one place on the page: what layout, states, detail and hovers saw there, plus a reference|clone|diff crop'],
  textshape: ['textshape.mjs', 'template mode: placeholder words with the reference word widths, so lines break the same'],
  diff: ['diff.mjs', 'full-page pixel diff per viewport and section (--structure masks text and media)'],
  spec: ['spec.mjs', 'measured boxes and styles of the live page (--clone for the rebuild)'],
  tiles: ['tiles.mjs', 'the full-page shots cut into one tile per screen: tiles <name> [--size wide] [--clone], or tiles <file.png>'],
  score: ['score.mjs', 'every score in parallel groups, time limit per step, writes REPORT.md'],
  report: ['report.mjs', 'REPORT.md from the latest scores: every number, every gap, what cannot be copied'],
};

// npm/npx are .cmd files on Windows and need a shell; Node warns (DEP0190) when a shell gets separate arguments, so
// build one quoted command line there instead
const spawnCmd = (cmd, args, opts = {}) => (process.platform === 'win32'
  ? spawn([cmd, ...args].map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' '), { ...opts, shell: true })
  : spawn(cmd, args, opts));
const run = (file, args) => new Promise((resolve) => {
  const child = spawn(process.execPath, [file, ...args], { stdio: 'inherit' });
  child.on('close', (code) => resolve(code ?? 1));
});

// Every step on a site is journaled and its whole output kept (sites/<name>/logs/): a failure's cause is never lost
// with a terminal or a launcher (RC6: varsity's calibrate error and heybhaskar's states stack existed only in pipes that
// were gone). The step itself writes its log and its end record (lib.mjs, TC_LOG / TC_JOURNAL), so a launcher killed
// on a timeout takes nothing with it. logs/commands.jsonl: a "start" line written here, an "end" line written by the
// step as it exits (none if it was killed). status reads it to tell a step that ran without effect from one that was
// never run, and a step still running from one that died.
const siteOf = (step, args) => { const pos = args.filter((a) => !a.startsWith('--')); return step === 'capture' ? pos[1] : pos[0]; };
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
async function runLogged(step, file, args) {
  const site = siteOf(step, args);
  const siteRoot = site && /^[\w.-]+$/.test(site) ? path.join(process.cwd(), 'sites', site) : null;
  if (!siteRoot || (step !== 'capture' && !(await exists(siteRoot)))) return run(file, args);
  const dir = path.join(siteRoot, 'logs');
  await fs.mkdir(dir, { recursive: true });
  // status runs often and says little: one rolling file; every other step its own
  const logRel = step === 'status' ? 'status.log' : `${stamp()}-${step}.log`;
  const startedAt = new Date().toISOString();
  await fs.appendFile(path.join(dir, logRel), `\n# ${startedAt} trueclone ${step} ${args.join(' ')} (trueclone ${version})\n`);
  return new Promise((resolve) => {
    const env = { ...process.env, TC_LOG: path.join(dir, logRel), TC_JOURNAL: path.join(dir, 'commands.jsonl'), TC_STEP: step, TC_STEP_STARTED: startedAt, TC_LAUNCHER_PID: String(process.pid) };
    const child = spawn(process.execPath, [file, ...args], { stdio: 'inherit', env });
    fs.appendFile(env.TC_JOURNAL, `${JSON.stringify({ event: 'start', step, args, pid: child.pid, startedAt, log: `logs/${logRel}`, tool: version })}\n`).catch(() => {});
    child.on('close', (code) => resolve(code ?? 1));
  });
}

function help() {
  console.log(`trueclone ${version}: the exact same website, at every screen size

usage
  npx @trueclone/cli init            set up this folder for your coding agent (installs trueclone; --with-rea adds REA as MCP)
  trueclone <url> [name]             capture + design-system draft (template mode)
  trueclone <step> <name> [options]  run one step
  trueclone rea <args>               bundled REA (Reverse Engineer Anything), for the rare deep case
  trueclone doctor                   check Node and browsers

steps
${Object.entries(STEPS).map(([k, [, d]]) => `  ${k.padEnd(13)} ${d}`).join('\n')}

Two workflows, two requests:
  1. "Clone <url> with trueclone"  ->  an HTML/CSS/JS clone (sites/<name>/clone/, REPORT.md), measured and reviewed
  2. later, separately: "Convert this clone into a proper Next.js application"  ->  sites/<name>/nextjs/, REPORT.nextjs.md
The skill walks your agent through each.`);
}

async function exists(file) { return fs.stat(file).then(() => true, () => false); }

async function init() {
  const cwd = process.cwd();
  // 1. the agent skill (Claude Code reads .claude/skills; other agents read AGENTS.md, which points at the same file)
  const skillDir = path.join(cwd, '.claude', 'skills', 'trueclone');
  await fs.mkdir(skillDir, { recursive: true });
  await fs.copyFile(path.join(PKG, 'skill', 'SKILL.md'), path.join(skillDir, 'SKILL.md'));
  // 2. AGENTS.md block for Codex, Cursor and other agents
  const agentsFile = path.join(cwd, 'AGENTS.md');
  const block = `<!-- trueclone:start -->\n## Cloning websites with trueclone\n\nTo clone or rebuild a website, read \`.claude/skills/trueclone/SKILL.md\` first. Two separate jobs, each asked for on its own: cloning delivers an HTML/CSS/JS clone; converting a finished clone into a Next.js application is a later, separate request (\`npx trueclone convert <name>\`, never started as part of cloning; if one request asks for both, clone first, hand over the clone, and wait for the conversion request). To clone: capture, and loop: run \`npx trueclone status <name>\`, do exactly the step it names, run it again. \`status\` ends the run itself, by its exit code: 0 Verified (every required result passes on the HTML clone as it is now, for the scope captured), 1 work left (do the step it names, then run it again: never end your turn or ask whether to continue on 1), 2 Blocked (the tool, the environment or a step that cannot be done stops it; it names the owner, the cause and its log: report it, resume with \`status\` once the cause is fixed), 3 Incomplete (every required result is accounted for; it lists each difference left and each result the tool cannot verify: hand over and say so). Exit 2 and 3 are status's decisions, never yours. If a step cannot be done within clone/script.js, clone/patches/ or notes.md, never work around it: write \`- cannot: <step>: <why>\` under ## Findings in notes.md and run status; it decides. Never change the instrument (no NODE_OPTIONS preloads, no edits under node_modules). \`sites/<name>/clone/\` with \`sites/<name>/REPORT.md\` is the deliverable. A conversion (only when asked for) has its own loop: run \`npx trueclone convert <name>\`, do the step it names, run it again; same exit codes, its own outcome and \`REPORT.nextjs.md\`, and it never changes the clone's.\n\nRunning it: the steps open Chrome (Playwright) and load the live site, so they need network access and permission to start a browser: in Codex, Full access, or approve each trueclone command to run outside the sandbox with network; \`npx trueclone doctor\` must say ok on every line in the same setup the steps run in. Steps can be long (status prints how long it expects calibrate to take: up to 2-3 hours for a large exact-mode site): never give a trueclone command a time limit shorter than that, and never stop one because it is quiet. If your tool cannot wait that long, run the step in the background and run \`status\`: it says "waiting" while a step is still running and never counts that against you. Every step's whole output is kept in sites/<name>/logs/. Several clones may run at once: timing checks (load, behaviour, reveals, the journey) wait for each other by themselves.\n<!-- trueclone:end -->\n`;
  let agents = (await exists(agentsFile)) ? await fs.readFile(agentsFile, 'utf8') : '';
  agents = agents.includes('<!-- trueclone:start -->') ? agents.replace(/<!-- trueclone:start -->[\s\S]*?<!-- trueclone:end -->\n?/, block) : `${agents}${agents && !agents.endsWith('\n\n') ? '\n' : ''}${block}`;
  await fs.writeFile(agentsFile, agents);
  // 3. REA as an MCP server only on request (--with-rea): the standard flow reads the site's own scripts from the
  // capture; REA is for the rare deep case and stays reachable as `npx trueclone rea` either way
  const withRea = process.argv.includes('--with-rea');
  if (withRea) {
    const mcpFile = path.join(cwd, '.mcp.json');
    const mcp = (await exists(mcpFile)) ? JSON.parse(await fs.readFile(mcpFile, 'utf8')) : {};
    mcp.mcpServers = { ...(mcp.mcpServers || {}), rea: { command: 'npx', args: ['-y', `${name}@${version}`, 'rea', 'mcp'] } };
    await fs.writeFile(mcpFile, `${JSON.stringify(mcp, null, 2)}\n`);
  }
  // 4. captures, clones and browser profiles stay local
  const ignoreFile = path.join(cwd, '.gitignore');
  let ignore = (await exists(ignoreFile)) ? await fs.readFile(ignoreFile, 'utf8') : '';
  const want = ['sites/', '.chrome-profile/', '*.har'].filter((line) => !ignore.split(/\r?\n/).includes(line));
  if (want.length) await fs.writeFile(ignoreFile, `${ignore}${ignore && !ignore.endsWith('\n') ? '\n' : ''}${want.join('\n')}\n`);
  // 5. the package itself as a dev dependency, pinned: afterwards `npx trueclone <step>` runs this version, offline
  let installed = 'skipped (--no-install)';
  if (!process.argv.includes('--no-install')) {
    if (!(await exists(path.join(cwd, 'package.json')))) await fs.writeFile(path.join(cwd, 'package.json'), `${JSON.stringify({ name: path.basename(cwd).toLowerCase().replace(/[^a-z0-9-]+/g, '-'), private: true }, null, 2)}\n`);
    const code = await new Promise((resolve) => {
      const child = spawnCmd('npm', ['install', '--save-dev', '--save-exact', `${name}@${version}`], { stdio: 'inherit' });
      child.on('close', (c) => resolve(c ?? 1));
    });
    installed = code === 0 ? `${name}@${version} (dev dependency: npx trueclone <step> now runs it)` : `failed: run npm install -D ${name}@${version} yourself`;
  }
  console.log(`trueclone set up in ${cwd}
  .claude/skills/trueclone/SKILL.md   the workflow your agent follows
  AGENTS.md                           points Codex, Cursor and others at the skill
${withRea ? '  .mcp.json                           REA as an MCP server\n' : ''}  .gitignore                          sites/ stays local
  package.json                        ${installed}
next: npx trueclone doctor, then ask your agent "clone <url> with trueclone"`);
}

async function doctor() {
  let ok = true;
  const [major, minor] = process.versions.node.split('.').map(Number);
  const nodeOk = (major === 22 && minor >= 19) || (major === 24 && minor >= 11) || major >= 26;
  console.log(`${nodeOk ? 'ok  ' : 'FAIL'} Node ${process.versions.node} (needs 22.19+, 24.11+ or 26+)`);
  ok &&= nodeOk;
  const { chromium } = await import('playwright');
  for (const [label, opts] of [['Chrome (captures; plays H.264/HLS video)', { channel: 'chrome' }], ['Playwright Chromium (fallback)', {}]]) {
    try { const b = await chromium.launch(opts); await b.close(); console.log(`ok   ${label}`); }
    catch { console.log(`warn ${label} not found${opts.channel ? ': install Google Chrome' : ': npx playwright install chromium'}`); }
  }
  try { require.resolve('rea-agents/package.json'); console.log('ok   REA bundled, for the rare deep case (trueclone rea doctor checks its decompilers)'); }
  catch { console.log('warn REA not installed (optional)'); }
  // what a run needs from this machine, checked before an agent spends hours finding out (RC4: a sandbox without DNS,
  // a timing lock left behind)
  const dns = await import('node:dns/promises');
  let sandboxed = false;
  try { await dns.lookup('example.com'); console.log('ok   DNS (the live site can be reached by name)'); }
  catch (e) { ok = false; sandboxed = true; console.log(`FAIL DNS: ${e.code || e.message} (no network here: captures and every live check would fail)`); }
  try {
    const http = await import('node:http');
    const server = http.createServer((q, r) => r.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>tc</title><p id=ok>ok</p>'));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const b = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
    try {
      const p = await b.newPage();
      await p.goto(`http://127.0.0.1:${server.address().port}/`, { timeout: 15000 });
      if ((await p.textContent('#ok')) !== 'ok') throw new Error('the page did not render');
    } finally { await b.close(); server.close(); }
    console.log('ok   a local page opens in the browser (the clone is served on localhost)');
  } catch (e) { ok = false; sandboxed = true; console.log(`FAIL a local page in the browser: ${String(e.message).split('\n')[0]} (the browser cannot reach localhost here: no clone can be measured)`); }
  // the timing lock: its holder's process id says whether a measurement is really running (a step killed on its time
  // limit leaves its lock behind: RC6, reported as "running" for 20 minutes)
  const { timingLockHolder, timingLockFile } = await import(pathToFileURL(path.join(SCRIPTS, 'lib.mjs')).href);
  const h = await timingLockHolder();
  if (!h) console.log('ok   timing lock free');
  else {
    const min = Math.round((Date.now() - h.since) / 60000);
    console.log(h.alive && min <= 20 ? `ok   timing lock held by "${h.label}" (pid ${h.pid}, ${min} min): another trueclone measurement is running; timing checks wait for it` : `ok   timing lock left by a stopped run ("${h.label}", pid ${h.pid}, ${min} min ago): the next measurement takes it over at once (or delete ${timingLockFile()})`);
  }
  // A sandbox without network (a coding agent's default): what trueclone needs, and how to get it. Every capture, read,
  // calibration and score opens the live site and a local page in Chrome.
  if (sandboxed) console.log(`\nThis environment has no network access (or the browser cannot open localhost). trueclone's steps need both: run them
with network access. In Codex: approve running trueclone commands outside the sandbox (escalated, with network) or use
Full access; in Claude Code: allow the command. Then run \`npx trueclone doctor\` again the same way: every line ok.`);
  process.exitCode = ok ? 0 : 1;
}

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') help();
else if (cmd === '--version' || cmd === '-v') console.log(version);
else if (cmd === 'init') await init();
else if (cmd === 'doctor') await doctor();
else if (cmd === 'next') {
  // the old app generator (the clone's HTML in a Next.js shell) is retired: a conversion is its own workflow
  console.error(`trueclone next is retired. It generated a Next.js shell around the HTML clone, which is not a maintainable application.\nTo turn a finished HTML clone into a Next.js application, ask for a conversion: npx trueclone convert <name> (see the skill, "Converting a clone to Next.js").`);
  process.exitCode = 1;
} else if (cmd === 'rea') process.exitCode = await run(path.join(path.dirname(require.resolve('rea-agents/package.json')), 'scripts', 'rea.mjs'), rest);
else if (/^https?:\/\//.test(cmd)) {
  // the first step for any site: capture it (template mode) and draft its design system
  const name = rest.find((a) => !a.startsWith('--')) || new URL(cmd).hostname.replace(/^www\./, '').replace(/\.[a-z]+$/, '').replace(/[^a-z0-9]+/gi, '-');
  let code = await run(path.join(SCRIPTS, 'capture.mjs'), [cmd, name, ...rest.filter((a) => a !== name)]);
  if (code === 0) code = await run(path.join(SCRIPTS, 'design.mjs'), [name]);
  if (code === 0) console.log(`\nnext: npx trueclone motion ${name}, then build sites/${name}/clone/ following .claude/skills/trueclone/SKILL.md`);
  process.exitCode = code;
} else if (STEPS[cmd] && rest.some((a) => a === '--help' || a === '-h')) {
  // a step's help is its usage lines (the script's header), never a run: `serve --help` would start a server
  const head = (await fs.readFile(path.join(SCRIPTS, STEPS[cmd][0]), 'utf8')).split('\n');
  const usage = head.filter((l, i) => l.startsWith('//') && head.slice(0, i + 1).every((x) => x.startsWith('//') || !x.trim())).map((l) => l.replace(/^\/\/ ?/, ''));
  console.log(`trueclone ${cmd}: ${STEPS[cmd][1]}\n\n${usage.join('\n').replace(/node scripts\/[\w-]+\.mjs|npm run \w+ --/g, `trueclone ${cmd}`)}`);
} else if (STEPS[cmd]) process.exitCode = await runLogged(cmd, path.join(SCRIPTS, STEPS[cmd][0]), rest);
else {
  console.error(`unknown command: ${cmd}\n`);
  help();
  process.exitCode = 1;
}
