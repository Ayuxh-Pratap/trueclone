// REPORT.md (the HTML clone) or REPORT.next.md (the Next.js app, TC_COMPARE=compare-next): the evaluation every
// conclusion comes from (verdict.mjs), rendered for a person. It reads only: running it any number of times changes
// nothing, counts as no attempt, and never refreshes a result (docs/plan-rc5/PLAN.md R1).
//
// The outcome at the top is status's (compare/outcome.json): Verified, Incomplete, Blocked, or In progress. Every
// required result is listed with its state: pass / accepted / fail / missing / stale / invalid / error / tool / na.
//
// usage: trueclone report <name>
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, COMPARE, REPORT_FILE, siteDir, SCORED } from './lib.mjs';
import { evaluate, LABELS, ORDER, TARGETS, FLOORS, unitName, notesSection } from './verdict.mjs';

const { pos } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) { console.error('usage: trueclone report <name>'); process.exit(1); }
const root = siteDir(name);
const read = (rel) => fs.readFile(path.join(root, rel), 'utf8').then(JSON.parse, () => null);
const side = COMPARE === 'compare-next' ? 'app' : 'clone';
const ev = await evaluate(root, { side });
if (ev.missingCapture) { console.error(`no capture for ${name}: run trueclone capture <url> ${name} first`); process.exit(1); }
const meta = ev.meta;
const VPS = SCORED.map((v) => v.name);
const outcome = await read('compare/outcome.json');
const loop = await read('compare/loop.json');
const times = await read(`${COMPARE}/score-times.json`);
const drift = await read(`${COMPARE}/drift.json`);
const notes = await fs.readFile(path.join(root, 'notes.md'), 'utf8').catch(() => '');

const MARK = { pass: 'pass', accepted: 'accepted', na: 'n/a', fail: '**fail**', missing: '**missing**', stale: '**stale**', invalid: '**invalid**', error: '**error**', tool: '**not verifiable**' };
const fmt = (u) => (!u ? '–' : u.status === 'pass' || u.status === 'fail' || u.status === 'accepted' ? `${u.value ?? '–'}${u.status === 'pass' ? '' : u.status === 'accepted' ? ' (acc.)' : ' ✗'}` : u.status === 'na' ? 'n/a' : u.status);

// ---- the summary table: one row per check, one column per size (the start page) ----
// The columns are the sizes in SCORED order, and the header is built from that same list (RC6: a hard-coded header put
// every desktop value under "Mobile 390" and every mobile value under "Desktop 1440")
const SIZE_LABEL = Object.fromEntries(SCORED.map((v) => [v.name, `${v.name[0].toUpperCase()}${v.name.slice(1)} ${v.width}${v.heldOut ? ' °' : ''}`]));
const rows = [];
// checks with units only: review, notes, coverage and the clone lint have rows of their own below (RC6 allbirds: the
// lint check has no units and crashed this loop)
for (const c of ev.checks.filter((x) => Array.isArray(x.units))) {
  const main = c.units.filter((u) => !u.route);
  const cell = (v) => fmt(main.find((u) => u.viewport === v));
  const other = c.units.filter((u) => u.route);
  const bad = c.units.filter((u) => !['pass', 'accepted', 'na'].includes(u.status));
  const target = c.key === 'interact' ? `${c.units.filter((u) => ['pass', 'na'].includes(u.status)).length}/${c.units.length} scenarios` : `target ≥ ${TARGETS[c.key] ?? '–'}${FLOORS[c.key] ? `, every frame ≥ ${FLOORS[c.key]}` : ''}`;
  const why = bad.slice(0, 4).map((u) => `${unitName(u).replace(`${LABELS[u.check]} `, '')}: ${u.status}${u.reason ? ` (${u.reason.slice(0, 90)})` : u.membersBelow?.length ? ` (${u.membersBelow.slice(0, 3).map((m) => `${m.name || m.id}${m.y !== undefined ? ` y ${m.y}` : ''} ${m.value}`).join(', ')})` : ''}`).join('; ');
  const cells = c.key === 'interact' ? [`${c.units.filter((u) => u.status === 'pass').length}/${c.units.filter((u) => u.status !== 'na').length}`, ...VPS.slice(1).map(() => '')] : VPS.map(cell);
  rows.push(`| ${c.label} | ${cells.join(' | ')} | ${MARK[c.status] || c.status} | ${target}${other.length ? `; ${new Set(other.map((u) => u.route)).size} other route(s), see Routes` : ''}${why ? `. ${why}${bad.length > 4 ? ` (+${bad.length - 4} more)` : ''}` : ''} |`);
}
const rv = ev.review;
const sizes = [...new Set(rv.frames.map((f) => f.size))];
const openFrames = rv.frames.filter((f) => f.state !== 'closed');
const reviewNote = rv.missingDirs.length ? `not shot yet: ${rv.missingDirs.slice(0, 3).map((d) => d.dir.replace(/^compare(-next)?\/review\//, '')).join(', ')}`
  : rv.status === 'stale' ? 'frames shot of an earlier clone: review again'
    : rv.toolHeavy.length ? `"tool" closes most frames at ${rv.toolHeavy.map((t) => `${t.dir.split('/').pop()} (${t.tool}/${t.of})`).join(', ')}: look again`
      : openFrames.length ? `${openFrames.length} frame(s) not closed (${[...new Set(openFrames.map((f) => f.state))].join(', ')}): listed under Review below`
        : `every frame closed: "same" by eye, or "tool" with evidence for that frame${side === 'app' ? ' (verdicts under "## Review: app")' : ''}`;
rows.push(`| Review (by eye) | ${VPS.map((v) => (sizes.includes(v) ? `${rv.frames.filter((f) => f.size === v && f.state === 'closed').length}/${rv.frames.filter((f) => f.size === v).length}` : '–')).join(' | ')} | ${MARK[rv.status] || rv.status} | ${reviewNote} |`);
const wn = ev.written;
const blank = VPS.slice(1).map(() => '–').join(' | ');
if (wn.notes) rows.push(`| Notes (behaviours) | ${wn.notes.cites} cited | ${blank} | ${wn.notes.pass ? 'pass' : '**fail**'} | ${wn.notes.pass ? "notes.md Behaviours tie each behaviour to the site's code" : wn.notes.behaviours ? "Behaviours cite no file:line of the site's code" : 'no Behaviours yet'} |`);
if (wn.coverage) rows.push(`| Coverage (site code) | ${wn.coverage.scripts - wn.coverage.uncitedScripts.length}/${wn.coverage.scripts} scripts, ${wn.coverage.curves - wn.coverage.uncitedCurves.length}/${wn.coverage.curves} curves | ${blank} | ${wn.coverage.pass ? 'pass' : '**fail**'} | ${wn.coverage.pass ? 'every busy script and recorded curve is ported or explained' : `not cited: ${[...wn.coverage.uncitedScripts, ...wn.coverage.uncitedCurves.map((c) => `curve .${String(c.cls).split('.')[0]}`)].slice(0, 6).join(', ')}`} |`);
if (ev.lint?.findings.length) rows.push(`| Clone lint | ${ev.lint.findings.length} finding(s) | ${blank} | **fail** | ${ev.lint.findings.slice(0, 3).map((f) => `${f.file}: ${f.what}${f.owner === 'tool' ? ' (in what trueclone generated: a tool defect)' : ''}`).join('; ').slice(0, 300)} |`);

// ---- routes ----
const routePaths = [...new Set(ev.units.filter((u) => u.route).map((u) => u.route))];
const routeRows = routePaths.map((r) => {
  const lay = (v) => ev.units.find((u) => u.check === 'layout' && u.route === r && u.viewport === v);
  const st = (v) => ev.units.find((u) => u.check === 'scroll' && u.route === r && u.viewport === v);
  const all = ev.units.filter((u) => u.route === r);
  const worst = all.reduce((w, u) => (['pass', 'accepted', 'na'].includes(u.status) ? w : u.status), 'pass');
  return `| \`${r}\` | ${VPS.map((v) => `${fmt(lay(v))} / ${fmt(st(v))}`).join(' | ')} | ${MARK[worst] || worst} |`;
});

// ---- the outcome ----
const counts = Object.entries(ev.counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(', ');
const unresolved = (loop?.objectives ? Object.values(loop.objectives) : []).filter((o) => o.state === 'concluded');
const toolUnits = ev.units.filter((u) => u.status === 'tool');
// The outcome's words are fixed (docs/policy.md "Outcomes", decision D5). An outcome describes the content it was
// decided on: for other content (the clone or the app changed since) this report says "in progress".
const current = Boolean(outcome?.outcome) && (side === 'app' ? outcome.appSubjectHash === ev.subjectHash : outcome.subjectHash === ev.subjectHash);
const acc = current ? outcome.accounting : null;
const n = (k) => acc?.counts?.[k] ?? 0;
const headline = current
  ? { verified: `**Verified**: every required result passes on the clone and on the Next.js app as they are now`, incomplete: `**Incomplete**: ${acc ? n('unresolved') : unresolved.length} difference(s) remain (listed), ${acc ? n('not-verifiable') : toolUnits.length} item(s) not verifiable by the tool (listed)`, blocked: `**Blocked** (owner: ${outcome.owner || 'tool'}): ${acc ? `${n('blocked')} required result(s) cannot be measured; ${n('pending')} not reached` : 'the tool or the environment cannot measure what is required'} (the blocker, what was tried and what you can do are below)`, 'in-progress': '**In progress**' }[outcome.outcome] || outcome.outcome
  : ev.verified ? '**Every required result passes** (run `trueclone status` for the outcome)' : '**In progress**: not verified';
const owner = (u) => (u.status === 'tool' ? 'tool' : ['error', 'invalid'].includes(u.status) ? 'tool/environment' : 'clone');
const DISPOSITION = { unresolved: 'difference left (the loop concluded)', 'not-verifiable': 'not verifiable by the tool here', blocked: 'cannot be measured (blocked)', pending: 'not measured or not looked at yet' };

const outcomeSection = [
  `## Outcome\n`,
  `${headline}.${outcome?.why && current ? ` ${outcome.why}` : ''}`,
  '',
  `Results: ${counts || 'none yet'}.`,
  outcome?.next && current ? `\nNext useful action: ${outcome.next}` : '',
  outcome?.resume && current ? `\nTo resume: ${outcome.resume}` : '',
  outcome?.error && current ? `\nThe error, whole: \`compare/outcome.json\` (error)${outcome.log ? `, and ${outcome.log}` : ''}.` : '',
  // every required result that is not verified, by what happened to it (status's accounting: the same set it decided on)
  acc && acc.items?.length ? `\n### Not verified (${acc.items.length} of ${acc.total} required)\n\n| Result | Side | State | What happened | Owner | Detail |\n|---|---|---|---|---|---|\n${acc.items.slice(0, 120).map((i) => `| ${i.label} | ${i.side} | ${i.state} | ${DISPOSITION[i.disposition] || i.disposition} | ${i.owner || '–'} | ${String(i.reason || '').replace(/\|/g, '/').slice(0, 160)} |`).join('\n')}${acc.items.length > 120 ? `\n\n…and ${acc.items.length - 120} more (compare/outcome.json).` : ''}` : '',
  !acc && unresolved.length ? `\n### Unresolved after the loop concluded\n\n| Objective | Owner | Best (at) | Current | Attempts | Why it stopped |\n|---|---|---|---|---|---|\n${unresolved.map((o) => `| ${o.label} | ${o.owner || 'clone'} | ${o.bestShortfall === 0 ? 'passed' : `${o.bestValue ?? '–'} (shortfall ${o.bestShortfall})`} | ${o.lastValue ?? '–'} (shortfall ${o.lastShortfall ?? '–'}) | ${o.attempts} (${o.strategies || 0} strategy change${o.strategies === 1 ? '' : 's'}) | ${o.concludedWhy || ''} |`).join('\n')}` : '',
  acc && unresolved.length ? `\n### How the loop got there\n\n| Objective | Owner | Best (at) | Current | Attempts | Why it stopped |\n|---|---|---|---|---|---|\n${unresolved.map((o) => `| ${o.label} | ${o.owner || 'clone'} | ${o.bestShortfall === 0 ? 'passed' : `${o.bestValue ?? '–'} (shortfall ${o.bestShortfall})`} | ${o.lastValue ?? '–'} (shortfall ${o.lastShortfall ?? '–'}) | ${o.attempts} (${o.strategies || 0} strategy change${o.strategies === 1 ? '' : 's'}) | ${o.concludedWhy || ''} |`).join('\n')}` : '',
  !acc && toolUnits.length ? `\n### Not verifiable by the tool here\n\n${toolUnits.slice(0, 30).map((u) => `- ${unitName(u)}: ${u.reason}`).join('\n')}` : '',
].filter((x) => x !== '').join('\n');

// ---- open items (not passing), in fix order ----
// the interaction plan too: unmeasured, no scenario of it is required yet, so it is the one line that says so (RC6:
// interactions were never measured and nothing in REPORT said it)
const open = ev.units.filter((u) => !['pass', 'accepted', 'na'].includes(u.status)).sort((a, b) => ORDER.indexOf(a.check) - ORDER.indexOf(b.check));
const openSection = open.length ? `## Not passing\n\n| Result | State | Value / bar | Owner | Detail |\n|---|---|---|---|---|\n${open.slice(0, 60).map((u) => `| ${unitName(u)}${u.plan ? ' (the plan: which scenarios to run)' : ''} | ${u.status} | ${u.value ?? '–'}${typeof u.bar === 'number' ? ` / ${u.bar}${u.calibration ? ' (calibrated)' : ''}` : ''} | ${owner(u)} | ${(u.reason || (u.membersBelow || []).slice(0, 4).map((m) => `${m.name || m.id}${m.y !== undefined ? ` (y ${m.y})` : ''}: ${m.value} < ${m.bar}`).join('; ') || '').slice(0, 160)} |`).join('\n')}${open.length > 60 ? `\n\n…and ${open.length - 60} more.` : ''}\n` : '';
const reviewOpen = rv.frames.filter((f) => f.state !== 'closed');
const reviewSection = reviewOpen.length ? `## Review: open frames\n\n${reviewOpen.slice(0, 50).map((f) => `- ${f.id} ${f.size}: ${f.why || f.verdict || 'no verdict yet'} (${f.dir}/${f.id.split('/').pop()}.png)`).join('\n')}${reviewOpen.length > 50 ? `\n- …and ${reviewOpen.length - 50} more` : ''}\n` : '';

// ---- what template mode does not claim (D4), the stabilisation used, exclusions (D3) ----
const template = meta.mode !== 'exact';
const ignored = meta.ignore || [];
const seedRec = await read('clone/.seed.json');
const claims = [
  template ? '- **Media replaced** (template mode): text and media are placeholders of the same size and position. Structure, behaviour and timing are verified; the original images, video and art are not copied, and no pixel score here claims they are.' : `- **Exact mode**: the site's own text and media. Permission: ${meta.permission}.${/^["'`]|["'`]$|^.{0,2}$/.test(String(meta.permission || '').trim()) ? ' **The recorded permission looks truncated** (a launcher\'s quoting): record who authorised the copy in full with a new capture (`--permission "<who>"`).' : ''}`,
  meta.canvasApp && template ? '- **Canvas app, template mode**: the scenes are judged by spatial composition and behaviour against the reference\'s own variation, minus a stated template allowance (docs/policy.md); a colour histogram is shown for diagnosis only, never as a pass.' : '',
  ignored.length ? `- **Excluded on both sides** (third-party content, docs/policy.md): ${ignored.map((i) => `\`${i.sel}\`${i.why ? ` (${i.why})` : ''}`).join(', ')}. The clone must not contain them; one that does is a difference.` : '',
  meta.stabilise ? `- **Measured under control** (both sides alike, evaluation only, never in the delivered site; docs/policy.md): ${typeof meta.stabilise === 'object' ? Object.entries(meta.stabilise).map(([k, v]) => `${k} ${v}`).join(', ') : meta.stabilise}.` : '',
  ev.lint?.findings.length ? `- **Clone lint**: ${ev.lint.findings.map((f) => `${f.file} ${f.what}`).join('; ')}` : '',
  // pages the site links to that were not captured are not verified, and are named (RC6 elise: 6 of 8 views, silently)
  // errors the live page threw while it was captured (the reference is what it is; they are named, never hidden: RC6
  // allbirds threw ~70 that no file kept)
  (meta.pageErrors || []).some((e) => e?.count) ? `- **The live page threw errors while it was captured**: ${meta.pageErrors.filter((e) => e?.count).map((e) => `${e.route || '/'}: ${e.count} (${(e.first || []).slice(0, 2).map((m) => `"${String(m).slice(0, 80)}"`).join(', ')})`).join('; ')}. They are the site's own; the reference was measured as it loaded.` : '',
  // frames of the clone that still load the live site (pages that were not captured: seed could not point them at a local page)
  (seedRec?.liveFrames || []).length ? `- **Frames that still load the live site**: ${seedRec.liveFrames.slice(0, 6).map((f) => `\`${typeof f === 'string' ? f : f.src || f.url || JSON.stringify(f)}\``).join(', ')}: their pages were not captured, so the clone shows the live page there; not verified.` : '',
  (meta.routesNotCaptured || []).length ? `- **Not captured, not verified**: ${meta.routesNotCaptured.length} page(s) the site links to: ${meta.routesNotCaptured.slice(0, 20).map((r) => `\`${typeof r === 'string' ? r : r.path}\`${r.why ? ` (${r.why})` : ''}`).join(', ')}${meta.routesNotCaptured.length > 20 ? '…' : ''}. Capture them with \`--routes\` to verify them.` : '',
].filter(Boolean).join('\n');

// ---- descriptive sections kept from earlier versions (weak spots, what is not copied, motion) ----
const motionInv = await read('reference/motion.desktop.json');
const libs = motionInv ? Object.entries(motionInv.libs || {}).filter(([k, v]) => v && !Array.isArray(v) && !/At$/.test(k)).map(([k, v]) => (v === true ? k : `${k} ${v}`)) : [];
// a library bundled into the site's own modules sets no global the runtime inventory can see (RC4/RC6 allbirds: GSAP and
// Swiper in its bundles, "Libraries: none"): the captured scripts are read for them too, by name and by signature
// each by what only that library writes: its banner, its constructor or registration, its package path
const LIB_SIGNS = { GSAP: /GreenSock|\bGSAP \d|gsap\.registerPlugin|\bgsap\.(to|from|timeline)\(/, ScrollTrigger: /ScrollTrigger\.create\(|registerPlugin\([^)]*ScrollTrigger/, Swiper: /\bSwiper \d+\.\d+|new Swiper\(|swiper-slide-active/, Lenis: /new Lenis\(|@studio-freight\/lenis|\blenis\.raf\(/, 'three.js': /three\.module|new \w+\.WebGLRenderer\(|REVISION\s*=\s*["']1\d\d/, Lottie: /bodymovin|lottie-web|\.loadAnimation\(/, 'Framer Motion': /framer-motion/, Splide: /new Splide\(|@splidejs/, Flickity: /new Flickity\(|Flickity v\d/, Embla: /EmblaCarousel|embla-carousel/ };
const inScripts = {};
{
  const sdir = path.join(root, 'reference', 'scripts');
  // the site's own scripts: not an excluded widget's (its libraries are not the site's)
  const excluded = (meta.ignore || []).map((i) => i.origin).filter(Boolean);
  const evidence = JSON.parse(await fs.readFile(path.join(sdir, 'scripts.json'), 'utf8').catch(() => 'null'));
  const foreign = new Set((evidence?.scripts || []).filter((s) => excluded.some((o) => String(s.url || '').startsWith(o)) || s.tracking).map((s) => s.file));
  for (const f of (await fs.readdir(sdir).catch(() => [])).filter((x) => /\.js$/.test(x) && !/\.pretty\.js$/.test(x) && !foreign.has(x)).slice(0, 400)) {
    const head = (await fs.readFile(path.join(sdir, f), 'utf8').catch(() => '')).slice(0, 400000);
    for (const [lib, re] of Object.entries(LIB_SIGNS)) if (re.test(head)) (inScripts[lib] ||= []).push(f);
  }
}
const scriptLibs = Object.entries(inScripts).filter(([lib]) => !libs.some((l) => l.toLowerCase().startsWith(lib.toLowerCase().split(' ')[0]))).map(([lib, files]) => `${lib} (in ${files.slice(0, 2).join(', ')}${files.length > 2 ? '…' : ''})`);
let calls = [];
try { const har = JSON.parse(await fs.readFile(path.join(root, 'reference', 'desktop.har'), 'utf8')); calls = har.log.entries.filter((e) => ['xhr', 'fetch'].includes(e._resourceType)).map((e) => ({ method: e.request.method, url: e.request.url, status: e.response.status, type: e.response.content.mimeType || '' })); } catch { /* no HAR */ }
const TRACKING = /google-analytics|googletagmanager|doubleclick|facebook\.(com|net)|hotjar|segment\.(io|com)|plausible|cloudflareinsights|clarity\.ms|sentry|datadog|mixpanel|amplitude|posthog|intercom|hubspot|linkedin\.com\/px|tiktok|challenges\.cloudflare|cdn-cgi\/rum|recaptcha|hcaptcha|turnstile/i;
const data = calls.filter((c) => !TRACKING.test(c.url));
const uniq = (list) => [...new Map(list.map((c) => [`${c.method} ${c.url.split('?')[0]}`, c])).values()];
const findings = wn.findings || [];
const accepted = notesSection(notes, 'Accepted differences');
const lockWait = times ? Object.values(times.steps || {}).reduce((n, s) => n + (s.lockWaitSeconds || 0), 0) : 0;
const elapsed = outcome?.elapsed ? `${outcome.elapsed.wallMin} min wall, ${outcome.elapsed.activeMin} min active (gaps over 15 min with no activity left out)` : null;

const md = `# trueclone report: ${name}${side === 'app' ? ' (the Next.js app, as delivered)' : ''}

| | |
|---|---|
| Reference | ${meta.url} |
| Mode | ${template ? 'template (structure, motion and behaviour; placeholder text and media)' : `exact (the site's own text and media). Permission: ${meta.permission}`} |
| Captured | ${meta.capturedAt} (reference ${ev.refId}) |
| Measured | the ${side === 'app' ? 'app' : 'clone'} with content ${ev.subjectHash || '–'} |
| Outcome | ${headline} |
| Rendered | ${new Date().toISOString()}, from the files as they were then (\`trueclone status\` renders it again whenever the clone, the app, notes.md or a result changes) |
${times ? `| Last scoring | ${times.totalMin} min (${times.kind}${times.only ? `: ${times.only.join(',')}` : ''})${lockWait ? `, of which ${lockWait}s waiting for the machine's timing lock` : ''} |` : ''}
${elapsed ? `| Run time | ${elapsed} |` : ''}
${drift?.stale && drift.refId === ev.refId ? '| Live site | **changed since the capture**: re-capture before trusting any result |' : ''}

${outcomeSection}

## Scores

| Check | ${VPS.map((v) => SIZE_LABEL[v]).join(' | ')} | State | Notes |
|---|${VPS.map(() => '---').join('|')}|---|---|
${rows.join('\n')}

° held out: captured and scored, never used to build the clone.
${routeRows.length ? `\n## Routes\n\nLayout / scroll states of every other route, at its own address.\n\n| Route | ${VPS.map((v) => v[0].toUpperCase() + v.slice(1)).join(' | ')} | State |\n|---|${VPS.map(() => '---').join('|')}|---|\n${routeRows.join('\n')}\n` : ''}
${openSection}
${reviewSection}
## What this report claims

${claims}

${accepted.length ? `## Accepted differences\n\n${accepted.map((a) => `- ${a}`).join('\n')}\n\n` : ''}${findings.length ? `## Findings\n\n${findings.join('\n')}\n\n` : ''}## Motion found on the reference

${motionInv ? `Libraries (running on the page): ${libs.length ? libs.join(', ') : 'none seen as globals'}${scriptLibs.length ? `; bundled in the site's scripts: ${scriptLibs.join(', ')}` : libs.length ? '' : ' or in its scripts (no GSAP, Lenis, Swiper or similar)'}. ScrollTriggers: ${motionInv.triggers?.length ?? 0}. CSS animations: ${(motionInv.css || []).length}.` : 'Not inventoried yet (trueclone motion <name>).'}

## Not copied

- **Server-side behaviour** is never visible from the outside: databases, accounts, payments, search. The clone reproduces the client.
- **Tracking, analytics and bot protection** are left out on purpose.
${data.length ? `- **Data and API calls** the reference makes (${uniq(data).length}); their captured responses are in reference/desktop.har:\n${uniq(data).slice(0, 15).map((c) => `  - \`${c.method} ${c.url.split('?')[0].slice(0, 110)}\` → ${c.status} ${c.type.split(';')[0]}`).join('\n')}` : '- **Data and API calls**: none seen during the capture.'}
`;
await fs.writeFile(path.join(root, REPORT_FILE), md.replace(/\n{3,}/g, '\n\n'));
// a cache of the evaluation for other tools to read (status recomputes it; nothing trusts this file's time)
await fs.mkdir(path.join(root, COMPARE), { recursive: true });
await fs.writeFile(path.join(root, COMPARE, 'verdict.json'), JSON.stringify({ evaluatedAt: ev.at, subjectHash: ev.subjectHash, refId: ev.refId, verified: ev.verified, counts: ev.counts, checks: ev.checks.map((c) => ({ key: c.key, label: c.label, status: c.status })) }, null, 2));
console.log(`${ev.verified ? 'every required result passes' : `not verified: ${counts}`} -> ${path.relative(process.cwd(), path.join(root, REPORT_FILE))}`);
// the app's report reads the same notes: regenerated with this one, so it never shows stale verdicts
if (COMPARE === 'compare' && fsSync.existsSync(path.join(root, 'compare-next', 'results'))) {
  spawnSync(process.execPath, [fileURLToPath(import.meta.url), name], { stdio: 'inherit', env: { ...process.env, TC_COMPARE: 'compare-next', TC_REPORT: 'REPORT.next.md' } });
}
