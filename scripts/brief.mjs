// One section's work packet: everything the capture knows about that part of the page, in one place, so the agent
// never has to discover the evidence: the site's own handlers there (file:line and the code at that point), the
// recorded motion (pins, reveals, scroll curves, class changes), the values its scripts compute there, what a visitor
// operates there (the interaction scenarios), the canvases, and the current scores of that section at this size.
//
// usage: trueclone brief <name>                  the sections, with how much evidence and how far each is
//        trueclone brief <name> <n> [--viewport desktop]   section n (1-based) -> compare/brief/<vp>-<n>.md
import fs from 'node:fs/promises';
import path from 'node:path';
import { VIEWPORTS, parseArgs, openBrowser, newPage, serve, COMPARE, siteDir, unroll } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name, nArg] = pos;
if (!name) {
  console.error('usage: trueclone brief <name> [<section number>] [--viewport desktop]');
  process.exit(1);
}
const root = siteDir(name);
const ref = path.join(root, 'reference');
const vp = VIEWPORTS.find((v) => v.name === (flags.viewport || 'desktop')) || VIEWPORTS.find((v) => v.name === 'desktop');
const read = (p, fallback = null) => fs.readFile(path.join(root, p), 'utf8').then(JSON.parse).catch(() => fallback);
// --route "/about": another route of the site (meta.routes): its own sections, the clone opened at its address
const meta = await read('reference/meta.json', {});
const route = typeof flags.route === 'string' ? (meta.routes || []).find((x) => x.path === flags.route.replace(/\/+$/, '') || (flags.route === '/' && !x.slug)) : null;
if (typeof flags.route === 'string' && !route) { console.error(`no route ${flags.route} in this capture: ${(meta.routes || []).map((x) => x.path).join(', ') || 'one page only'}`); process.exit(1); }
const sections = await read(`${route?.dir || 'reference'}/${vp.name}.sections.json`, []);
if (!sections.length) { console.error(`no ${route?.dir || 'reference'}/${vp.name}.sections.json: run capture first`); process.exit(1); }
const scripts = await read('reference/scripts/scripts.json', { listeners: [] });
const reveals = await read(`reference/reveals.${vp.name}.json`, {});
const owned = (await read('reference/script-owned.json', { owned: [] })).owned || [];
const auto = await read('reference/interactions.auto.json', []);
const own = await read('interactions.json', []);
const motion = await read(`reference/motion.${vp.name}.json`, { triggers: [] });
const layout = await read(`${COMPARE}/report.mask.json`);
const states = await read(`${COMPARE}/states/report.mask.json`);
const hovers = await read(`${COMPARE}/hovers.${vp.name}.json`);
const interact = await read(`${COMPARE}/interact/report.json`);
const labelOf = (s) => (s.label || `${s.tag}${s.classes ? `.${String(s.classes).split(/\s+/).slice(0, 2).join('.')}` : ''}`).replace(/\s+/g, ' ').slice(0, 60);

// Where every piece of evidence is on the clone at this size: the seed's marks sit on the same elements, and the
// recorded paths and selectors resolve the same way they did on the reference.
const server = await serve(path.join(root, 'clone'));
const browser = await openBrowser();
let placed;
try {
  const { page } = await newPage(browser, vp, {});
  await page.goto(route?.slug ? new URL(route.path.replace(/^\//, ''), server.url).href : server.url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(800);
  await unroll(page); // positions as the capture measured them (an app shell's pane unrolled, lib.mjs)
  placed = await page.evaluate(([curves, ownedList, scenarios, triggers, handlerLabels]) => {
    const SKIP = new Set(['SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'STYLE', 'LINK', 'META']);
    const byPath = (p) => {
      let n = document.body;
      for (const part of String(p).split('>')) {
        const [tag, i] = part.split(':');
        n = n && [...n.children].filter((c) => !SKIP.has(c.tagName))[Number(i) - 1];
        if (!n || n.tagName.toLowerCase() !== tag) return null;
      }
      return n;
    };
    const bySel = (s) => { if (!s) return null; const [q, i] = String(s).split('@'); try { return document.querySelectorAll(q)[Number(i || 0)] || null; } catch { return null; } };
    const y = (el) => (el ? Math.round(el.getBoundingClientRect().top + scrollY) : null);
    const label = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.classList.length ? `.${[...el.classList].slice(0, 2).join('.')}` : ''}`;
    const marks = (attr) => [...document.querySelectorAll(`[${attr}]`)].map((el) => ({ y: y(el), el: label(el), v: el.getAttribute(attr) }));
    return {
      reveals: marks('data-tc-reveal'),
      classes: marks('data-tc-class'),
      pins: marks('data-tc-pin'),
      gsap: marks('data-tc-gsap'),
      canvases: [...document.querySelectorAll('canvas')].map((c) => ({ y: y(c), el: label(c), w: c.width, h: c.height, engine: c.getAttribute('data-engine') || '' })),
      // a curve sits where its element was on the reference when it was sampled (scroll position + its place in the
      // window), not where its path lands in the clone: a wrapper or a fixed layer would put it in another section
      curves: curves.map((s) => ({ y: s.samples?.[0]?.v !== undefined ? Math.round(s.samples[0].y + s.samples[0].v) : y(byPath(s.path)), path: s.path, cls: s.cls, key: s.key, n: (s.samples || []).length, from: s.samples?.[0], to: s.samples?.at(-1) })),
      owned: ownedList.map((o) => ({ y: y(byPath(o.path)), ...o })),
      scenarios: scenarios.map((s) => ({ y: y(bySel(s.at?.clone || s.at?.ref)) ?? (s.at?.offset || 0), name: s.name, auto: Boolean(s.auto) })),
      triggers: triggers.map((t) => ({ y: y(bySel(t.trigger?.sel)), sel: t.trigger?.sel, start: t.start, end: t.end, scrub: t.scrub, pin: t.pin?.sel || null })),
      // every handler's elements, found on this page by the label the capture recorded (tag#id.class.class): where
      // they are visible here (another view of a single-page app included), not only where they were at capture
      handlerYs: handlerLabels.map((labels) => labels.flatMap((l) => {
        const m = /^([a-z][\w-]*)(#[^.\s]+)?((?:\.[^.\s]+)*)$/i.exec(l);
        if (!m) return [];
        let q = m[1] + (m[2] ? `#${CSS.escape(m[2].slice(1))}` : '') + (m[3] ? m[3].split('.').filter(Boolean).map((c) => `.${CSS.escape(c)}`).join('') : '');
        try { return [...document.querySelectorAll(q)].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).slice(0, 12).map(y); } catch { return []; }
      })),
      pageHeight: document.documentElement.scrollHeight,
    };
  }, [reveals.scrubs || [], owned, [...own, ...auto.filter((a) => a.viewport === vp.name && (!route?.slug || a.path === route.path))], motion.triggers || [], (scripts.listeners || []).map((l) => l.elements || [])]);
} finally {
  await browser.close();
  server.close();
}

const ranges = sections.map((s, i) => ({ i, s, from: s.y, to: s.y + s.height }));
const inRange = (r, y) => y !== null && y !== undefined && y >= r.from && y < r.to;
const evidenceOf = (r) => ({
  handlers: (scripts.listeners || []).filter((l, i) => (placed.handlerYs[i]?.length ? placed.handlerYs[i] : (route?.slug ? [] : l.ys || [])).some((y) => inRange(r, y))),
  reveals: placed.reveals.filter((x) => inRange(r, x.y)),
  classes: placed.classes.filter((x) => inRange(r, x.y)),
  pins: placed.pins.filter((x) => inRange(r, x.y)),
  curves: placed.curves.filter((x) => inRange(r, x.y)),
  owned: placed.owned.filter((x) => inRange(r, x.y)),
  scenarios: placed.scenarios.filter((x) => inRange(r, x.y)),
  canvases: placed.canvases.filter((x) => inRange(r, x.y)),
  triggers: placed.triggers.filter((x) => inRange(r, x.y)),
  gsap: placed.gsap.filter((x) => inRange(r, x.y)),
});
const layoutViewports = route?.slug ? layout?.routes?.find((x) => x.path === route.path)?.viewports : layout?.viewports;
const layoutOf = (r) => layoutViewports?.find((v) => v.viewport === vp.name)?.worstSections?.find((s) => s.index === r.s.index)?.match ?? null;

// ---- the list ----
if (!nArg) {
  console.log(`# ${name}: sections at ${vp.name} (${vp.width}x${vp.height})\n`);
  console.log('| # | section | y | handlers | motion | operated | canvases | layout |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const r of ranges) {
    const e = evidenceOf(r);
    const motionCount = e.reveals.length + e.classes.length + e.pins.length + e.curves.length + e.triggers.length;
    console.log(`| ${r.i + 1} | ${labelOf(r.s)} | ${r.from}-${r.to} | ${e.handlers.length} | ${motionCount} | ${e.scenarios.length} | ${e.canvases.length} | ${layoutOf(r) ?? '–'} |`);
  }
  console.log(`\nnext: trueclone brief ${name} <n> for a section's evidence, one section at a time`);
  process.exit(0);
}

// ---- one section ----
const r = ranges[Number(nArg) - 1];
if (!r) { console.error(`no section ${nArg} (1-${ranges.length})`); process.exit(1); }
const e = evidenceOf(r);
// the scroll class changes the seed replays (indexed as the seed marked them: the desktop record)
const classRec = (await read('reference/reveals.desktop.json', {})).classes || [];
// the site's own scripts (readable copies), without the libraries it loads (GSAP, Flip, jQuery…), with the lines where
// a GSAP Flip starts: Flip.getState / Flip.from, or a bundled one (x.getState() then x.from(state, { absolute… }))
let scriptCache = null;
const siteScripts = async () => {
  if (scriptCache) return scriptCache;
  const dir = path.join(ref, 'scripts');
  const names = (await fs.readdir(dir).catch(() => [])).filter((f) => f.endsWith('.pretty.js') && !/(^|[\W_])(gsap|flip|scrolltrigger|splittext|jquery|lenis|swiper|three|webflow\.schunk)([\W_]|$)/i.test(f));
  scriptCache = [];
  for (const n of names) {
    const lines = (await fs.readFile(path.join(dir, n), 'utf8').catch(() => '')).split('\n');
    const flips = [];
    lines.forEach((l, i) => {
      if (/\bFlip\.(getState|from|fit)\s*\(/.test(l)) flips.push(i);
      else if (/\.getState\(/.test(l)) {
        const next = lines.slice(i, i + 40).join('\n');
        if (/\.from\(/.test(next) && (/\b(absolute|nested|prune|simple|targets|toggleClass)\s*:/.test(next) || /\bFlip\b/.test(lines.join('\n')))) flips.push(i);
      }
    });
    scriptCache.push({ name: n, lines, flips });
  }
  return scriptCache;
};
const sources = new Map();
const excerpt = async (l) => {
  if (!l.file) return '';
  if (!sources.has(l.file)) sources.set(l.file, (await fs.readFile(path.join(ref, 'scripts', l.file), 'utf8').catch(() => '')).split('\n'));
  const line = sources.get(l.file)[l.line - 1] || '';
  return (line.length > 200 ? line.slice(Math.max(0, l.column - 60), l.column + 160) : line.trim()).replace(/\|/g, '\\|').replace(/`/g, "'");
};
const out = [];
const P = (s = '') => out.push(s);
P(`# ${name}${route?.slug ? ` ${route.path}` : ''}, section ${r.i + 1}: ${labelOf(r.s)} (${vp.name}, y ${r.from}-${r.to})`);
P();
P('Port the rule, never the code: read each handler at its line, write the behaviour in `clone/script.js` computed from the viewport, and one line per behaviour in notes.md Behaviours citing the file:line. If your script drives this section, `tcOwn(\'<selector>\')` at the top of script.js first.');
P();
P('## Scores here');
P();
P(`- layout (${vp.name}): ${layoutOf(r) ?? 'not scored yet'}`);
const steps = states?.viewports?.find((v) => v.viewport === vp.name)?.worst?.filter((s) => inRange(r, s.y)) || [];
P(`- scroll states in this range: ${steps.length ? steps.map((s) => `y ${s.y}: ${s.match}%`).join(', ') : 'none among the worst (or not scored yet)'}`);
const hv = (hovers?.rows || []).filter((h) => inRange(r, h.y) && !['ok', 'static', 'unstable'].includes(h.status));
P(`- hovers failing here: ${hv.length ? hv.map((h) => `${h.ref} ${h.status} (${h.outcome ?? '-'})`).join('; ') : 'none'}`);
const sc = (interact?.scenarios || []).filter((s) => e.scenarios.some((x) => x.name === s.name) && !s.notBehaviour);
P(`- interactions here: ${sc.length ? sc.map((s) => `${s.name}: ${s.expect?.pass ? 'pass' : `FAIL (${s.expect?.ref ? 'reference changes' : ''}${s.expect?.clone === false ? ', clone does not' : ''}; end state ${s.score ?? '-'})`}`).join('; ') : 'none scored'}`);
P();
P(`## The site's code for this section (${e.handlers.length} handler(s))`);
P();
if (e.handlers.length) {
  P('| event | handler | on | code at the handler |');
  P('|---|---|---|---|');
  for (const l of e.handlers.slice(0, 40)) P(`| ${l.type} | \`${l.file}:${l.line}:${l.column}\` | ${l.elements.slice(0, 3).join(', ')} | \`${await excerpt(l)}\` |`);
} else P('No listener sits on an element in this range. Its behaviour, if any, is driven from elsewhere: the scroll triggers and recorded motion below, or a handler on document/window (reference/scripts/INDEX.md).');
P();
P('## Motion here (recorded on the reference: evidence of what the code does)');
P();
for (const t of e.triggers) P(`- ScrollTrigger on \`${t.sel}\`: start "${t.start}", end "${t.end}"${t.scrub !== false ? `, scrub ${t.scrub}` : ''}${t.pin ? `, pins \`${t.pin}\`` : ''}`);
for (const p of e.pins) P(`- pin: \`${p.el}\` for ${p.v}px (sticky in the seed; data-tc-pin)`);
if (e.reveals.length) P(`- ${e.reveals.length} one-shot reveal(s) replayed by the seed's player (${e.reveals.slice(0, 4).map((x) => `\`${x.el}\``).join(', ')}${e.reveals.length > 4 ? '…' : ''}); tcOwn takes them over`);
if (e.classes.length) {
  P(`- ${e.classes.length} scroll class change(s) replayed by the player (${e.classes.slice(0, 4).map((x) => `\`${x.el}\``).join(', ')}): the player swaps the classes; any motion between the two states is yours`);
  // where the site's own code sets each added class, and whether a GSAP Flip animates the change there: a replayed
  // swap is then a jump (cards that slide into their new places on the original snap in the clone)
  const added = [...new Set(e.classes.flatMap((x) => { const c = classRec[Number(x.v)]; if (!c) return []; const from = String(c.from || '').split(/\s+/); return String(c.to || '').split(/\s+/).filter((t) => t && !from.includes(t)); }))];
  const files = await siteScripts();
  for (const t of added.slice(0, 6)) {
    const re = new RegExp(`['"\`.\\s]${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`\\s,)]`);
    const at = [];
    for (const f of files) f.lines.forEach((l, i) => { if (at.length < 3 && re.test(l)) at.push(`${f.name}:${i + 1}`); });
    if (at.length) P(`  - \`${t}\` is set by the site's code at ${at.map((x) => `\`${x}\``).join(', ')}`);
  }
}
// A GSAP Flip that moves this section's elements (cards that slide into new places when a class or their order
// changes): found by the classes of the elements recorded moving here, near a Flip call in the site's code. The player's
// replay (a reveal, a class swap) is then not the site's motion: the Flip is, and it is yours to port.
{
  const tokens = [...new Set([...e.reveals, ...e.classes].flatMap((x) => String(x.el).split('.').slice(1)).filter((t) => t.length > 2 && !/^(w-|is-|active$)/.test(t)))];
  const hits = [];
  // a script of the site's own with a Flip in it that names one of these elements' classes (the module that runs the
  // section: a bundle keeps one section's code together)
  for (const f of tokens.length ? await siteScripts() : []) {
    if (!f.flips.length) continue;
    const all = f.lines.join('\n');
    const t = tokens.find((x) => all.includes(x));
    if (t && hits.length < 4) hits.push(`\`${f.name}:${f.flips[0] + 1}\` (the file names .${t})`);
  }
  if (hits.length) P(`- **a GSAP Flip moves elements here**: ${hits.join(', ')}. On the original they slide to their new places; the player's replay only swaps states (a jump). Port the Flip with the site's duration and ease (\`npx trueclone vendor ${name}\` vendors Flip), and \`tcOwn\` the elements first`);
}
for (const c of e.curves.slice(0, 12)) P(`- scroll curve (not replayed, yours to write): \`${c.cls || c.path}\` ${c.n} samples from ${JSON.stringify(c.from)} to ${JSON.stringify(c.to)}`);
if (e.gsap.length) P(`- ${e.gsap.length} element(s) with GSAP-written transforms (data-tc-gsap): tcOwn clears them before your script animates`);
if (!e.triggers.length && !e.pins.length && !e.reveals.length && !e.classes.length && !e.curves.length) P('- none recorded');
P();
P('## Values its scripts compute here (script-owned: removed from the seed, yours to compute)');
P();
if (e.owned.length) for (const o of e.owned.slice(0, 20)) P(`- \`${o.path}\` ${o.prop}: ${o.samples.join(' | ')}`);
else P('- none');
P();
P('## What a visitor operates here (scored by the interaction check)');
P();
if (e.scenarios.length) for (const s of e.scenarios) P(`- ${s.name}${s.auto ? ' (found by the capture)' : ''}`);
else P('- nothing found');
P();
if (e.canvases.length) {
  P('## Canvases here (scored: what each draws)');
  P();
  for (const c of e.canvases) P(`- \`${c.el}\` ${c.w}x${c.h}${c.engine ? ` (${c.engine})` : ''}`);
  P();
}
P('## Check after each change');
P();
P(`\`npx trueclone score ${name} --only layout,states${e.scenarios.length ? ',interact' : ''}${hv.length ? ',hovers' : ''} --viewport ${vp.name}\`, then \`npx trueclone review ${name} --size wide\` once this section looks right.`);
const file = path.join(root, COMPARE, 'brief', `${route?.slug ? `${route.slug}-` : ''}${vp.name}-${r.i + 1}.md`);
await fs.mkdir(path.dirname(file), { recursive: true });
await fs.writeFile(file, out.join('\n') + '\n');
console.log(out.join('\n'));
console.log(`\n-> ${path.relative(process.cwd(), file)}`);
