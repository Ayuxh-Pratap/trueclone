#!/usr/bin/env node
// trueclone CLI: one entry point for every step. Steps run in the current folder: everything about a site lives
// in ./sites/<name>/ (reference capture, clone, Next.js app, design system, scores).
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
import { fileURLToPath } from 'node:url';

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = path.join(PKG, 'scripts');
const require = createRequire(import.meta.url);
const { name, version } = JSON.parse(await fs.readFile(path.join(PKG, 'package.json'), 'utf8'));

const STEPS = {
  status: ['status.mjs', 'where the clone stands and the one next step, from the files alone (exit 0 only when every gate passes)'],
  brief: ['brief.mjs', 'one section\'s evidence: the site\'s handlers (file:line + code), recorded motion, script-owned values, what a visitor operates, scores'],
  vendor: ['vendor.mjs', 'the site\'s libraries at the site\'s versions (GSAP + plugins, Lenis, three.js, Swiper) into clone/patches/'],
  serve: ['serve.mjs', 'open the clone (or --next, the built app) on a free port'],
  capture: ['capture.mjs', 'capture a live page at 5 sizes (3 to build from, 2 held out), its scripts, assets, rendered HTML, inline values at extra sizes'],
  seed: ['seed.mjs', 'clone/ from the script-free mirror: structure, viewport functions, pins, reveals (--patches: re-apply clone/patches/ only)'],
  design: ['design.mjs', 'design-tokens.json -> DESIGN.md (linted), shadcn globals.css, clone/tokens.css'],
  motion: ['motion.mjs', 'motion inventory from the live runtime (GSAP/ScrollTrigger, Lenis, Swiper, CSS animations)'],
  understand: ['understand.mjs', 'optional, rarely needed: REA code evidence -> reference/code.md (capture already saves every script, ranked, in reference/scripts/)'],
  reveals: ['reveals.mjs', 'record one-shot scroll reveals frame by frame, so seed can replay them (any library)'],
  widgets: ['widgets.mjs', 'record every tab and menu state by clicking it, so seed can replay them (template mode)'],
  journey: ['journey.mjs', 'app mode (a canvas app): --draft finds the journey (gates, wheel, holds) on the live page; then the reference checkpoints (frames, three.js scene, shaders); --clone scores the clone through it'],
  reads: ['reads.mjs', 'every read of the live page the clone is built from (states, motion, spec, widgets side by side, then reveals alone); only the missing ones'],
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
  next: ['next.mjs', 'Next.js + Tailwind v4 + shadcn app from the verified clone; --verify scores it'],
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

function help() {
  console.log(`trueclone ${version}: the exact same website, at every screen size

usage
  npx @trueclone/cli init            set up this folder for your coding agent (installs trueclone; --with-rea adds REA as MCP)
  trueclone <url> [name]             capture + design-system draft (template mode)
  trueclone <step> <name> [options]  run one step
  trueclone rea <args>               bundled REA (Reverse Engineer Anything), for the rare deep case
  trueclone doctor                   check Node and browsers

steps
${Object.entries(STEPS).map(([k, [, d]]) => `  ${k.padEnd(10)} ${d}`).join('\n')}

Then ask your agent: "clone <url> with trueclone". The skill walks it through capture, build, scores and report.`);
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
  const block = `<!-- trueclone:start -->\n## Cloning websites with trueclone\n\nTo clone or rebuild a website, read \`.claude/skills/trueclone/SKILL.md\` first. Then capture, and loop: run \`npx trueclone status <name>\`, do exactly the step it names, run it again. Do not end your turn or ask whether to continue while \`status\` says work is left (only a real blocker stops you: write it under Findings in notes.md). Done is \`status\` exiting 0 (every gate passes) or 3 (every step left is set aside, each written under Findings); \`sites/<name>/REPORT.md\` is the deliverable.\n\nRunning it: the steps open Chrome (Playwright) and load the live site, so they need network access and permission to start a browser (in Codex: full access, network on). Capture, reads, scores and \`next --verify\` take minutes each: give commands a timeout of at least 15 minutes, and never stop one because it is quiet. Several clones may run at once: timing checks (load, reveals, the journey) wait for each other by themselves.\n<!-- trueclone:end -->\n`;
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
  process.exitCode = ok ? 0 : 1;
}

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') help();
else if (cmd === '--version' || cmd === '-v') console.log(version);
else if (cmd === 'init') await init();
else if (cmd === 'doctor') await doctor();
else if (cmd === 'rea') process.exitCode = await run(path.join(path.dirname(require.resolve('rea-agents/package.json')), 'scripts', 'rea.mjs'), rest);
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
} else if (STEPS[cmd]) process.exitCode = await run(path.join(SCRIPTS, STEPS[cmd][0]), rest);
else {
  console.error(`unknown command: ${cmd}\n`);
  help();
  process.exitCode = 1;
}
