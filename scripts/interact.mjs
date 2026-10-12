// Interaction tests: run the same scripted scenario on the reference and the clone (hover, cursor paths,
// drag, click, keys, waits), screenshot named moments, and compare them. Each scenario can also assert that
// an element actually changed (moved, faded, resized, new text, state attribute or canvas pixels) on both sides, so "the button exists but does nothing"
// fails even when screenshots happen to look alike.
//
// sites/<name>/interactions.json:
// [{ "name": "media slider drags", "viewport": "desktop",
//    "at": { "ref": "div.section_media", "clone": ".media", "offset": 0 },        // scroll this element to the top first
//    "steps": [ { "drag": { "from": [0.7, 0.62], "to": [0.25, 0.62] } }, { "wait": 1500 }, { "shot": "after-drag" } ],
//    "expectChange": { "ref": "div.swiper-wrapper", "clone": ".media-track" },
//    "compare": "structure" }]                                                     // or "visual"
// Step kinds: move [x,y] (fractions of the viewport), hover [x,y], path [[x,y],...], drag {from,to}, down/up [x,y],
// click {ref,clone} selector or [x,y], key "Escape", wait ms, shot "label".
// usage: node scripts/interact.mjs <name> [--only "<text>"]   |   node scripts/interact.mjs <name> --draft
import fs from 'node:fs/promises';
import path from 'node:path';
import { VIEWPORTS, parseArgs, openBrowser, newPage, serve, warmUp, waitStill, wheelTo, maskToggle, matchPct, PNG, cached, readCache } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: npm run interact -- <name> [--only text] | --draft');
  process.exit(1);
}
const root = path.resolve('sites', name);
const ref = path.join(root, 'reference');
const meta = JSON.parse(await fs.readFile(path.join(ref, 'meta.json'), 'utf8'));

// ---------- Draft scenarios from the motion inventory ----------
if (flags.draft) {
  const motion = JSON.parse(await fs.readFile(path.join(ref, 'motion.desktop.json'), 'utf8'));
  const drafts = [];
  for (const s of motion.swipers) {
    drafts.push({ name: `slider drag ${s.el.sel}`, viewport: 'desktop', at: { ref: s.el.section || s.el.sel, clone: 'TODO', offset: 0 },
      steps: [{ drag: { from: [0.7, 0.6], to: [0.25, 0.6] } }, { wait: 1500 }, { shot: 'after-drag' }], expectChange: { ref: `${s.el.sel} .swiper-wrapper`, clone: 'TODO' }, compare: 'structure' });
  }
  const pointerTargets = [...new Set(motion.pointer.map((p) => p.target.sel))];
  for (const sel of pointerTargets) {
    drafts.push({ name: `cursor follow ${sel}`, viewport: 'desktop', at: { ref: 'body', clone: 'body', offset: 0 },
      steps: [{ move: [0.3, 0.4] }, { wait: 1500 }, { shot: 'left' }, { path: [[0.3, 0.4], [0.5, 0.5], [0.7, 0.6]] }, { wait: 1500 }, { shot: 'right' }], expectChange: { ref: sel, clone: 'TODO' }, compare: 'structure' });
  }
  drafts.push({ name: 'menu opens', viewport: 'desktop', at: { ref: 'body', clone: 'body', offset: 0 }, steps: [{ click: { ref: 'TODO', clone: 'TODO' } }, { wait: 1200 }, { shot: 'open' }, { key: 'Escape' }, { wait: 1200 }], compare: 'structure' });
  const out = path.join(root, 'interactions.draft.json');
  await fs.writeFile(out, JSON.stringify(drafts, null, 2));
  console.log(`${drafts.length} scenarios -> ${path.relative(process.cwd(), out)}. Fill in the TODOs, then save as interactions.json.`);
  process.exit(0);
}

const scenarioText = await fs.readFile(path.join(root, 'interactions.json'), 'utf8').catch(() => null);
if (scenarioText === null) {
  console.log('interactions: skipped, no interactions.json (run --draft, or write the scenarios by hand)');
  process.exit(0);
}
let scenarios = JSON.parse(scenarioText);
if (typeof flags.only === 'string') scenarios = scenarios.filter((s) => s.name.includes(flags.only));
const outDir = path.join(root, 'compare', 'interact');
await fs.mkdir(outDir, { recursive: true });

const stateOf = (page, selector) => page.evaluate((sel) => {
  const [s, idx] = sel.split('@');
  const el = document.querySelectorAll(s)[Number(idx || 0)];
  if (!el) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  // Besides geometry and visibility: text, state attributes and canvas pixels, so a button that changes its label,
  // a tab that flips aria-pressed or a game that redraws its canvas counts as a change too.
  const attrs = ['class', 'aria-pressed', 'aria-current', 'aria-expanded', 'open', 'hidden', 'disabled']
    .map((a) => (el.hasAttribute(a) ? `${a}=${el.getAttribute(a)}` : '')).join(',') // boolean attributes are "" + (el.value !== undefined ? `,${el.value}` : '');
  const text = el.textContent.replace(/\s+/g, ' ').trim().slice(0, 200);
  let pixels = '';
  if (el.tagName === 'CANVAS') {
    try { const d = el.toDataURL(); let h = 0; for (let i = 0; i < d.length; i += 7) h = (h * 31 + d.charCodeAt(i)) | 0; pixels = String(h); } catch { /* tainted canvas */ }
  }
  return `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}|${cs.transform}|${cs.opacity}|${cs.visibility}|${cs.clipPath}|${attrs}|${text}|${pixels}`;
}, selector);

async function runSide(url, side, list) {
  if (!list.length) return [];
  const browser = await openBrowser(flags.cdp);
  const results = [];
  try {
    for (const sc of list) {
      const vp = VIEWPORTS.find((v) => v.name === (sc.viewport || 'desktop'));
      const { context, page } = await newPage(browser, vp, { reducedMotion: 'no-preference' });
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      await page.mouse.move(5, vp.height - 5);
      await waitStill(page, { timeout: 15000, interval: 200 });
      await warmUp(page);
      const atSel = sc.at?.[side];
      if (atSel && atSel !== 'body') {
        const y = await page.evaluate((s) => { const el = document.querySelector(s); return el ? el.getBoundingClientRect().top + scrollY : 0; }, atSel);
        await wheelTo(page, Math.max(0, Math.round(y + (sc.at.offset || 0))), vp);
      } else {
        await wheelTo(page, sc.at?.offset || 0, vp);
      }
      await waitStill(page, { timeout: 3000 });
      const px = ([x, y]) => [Math.round(x * vp.width), Math.round(y * vp.height)];
      const expectSel = sc.expectChange?.[side];
      const before = expectSel ? await stateOf(page, expectSel) : null;
      const shots = {};
      const states = [];
      const shot = async (label) => {
        if (expectSel) states.push(await stateOf(page, expectSel));
        const file = path.join(outDir, `${sc.name.replace(/[^a-z0-9]+/gi, '-')}.${label}.${side}${sc.compare === 'structure' ? '.mask' : ''}.png`);
        if (sc.compare === 'structure') await maskToggle(page, true);
        await page.screenshot({ path: file });
        if (sc.compare === 'structure') await maskToggle(page, false);
        shots[label] = file;
      };
      await shot('before');
      for (const st of sc.steps) {
        if (st.move || st.hover) await page.mouse.move(...px(st.move || st.hover), { steps: 15 });
        else if (st.path) for (const p of st.path) await page.mouse.move(...px(p), { steps: 20 });
        else if (st.drag) {
          await page.mouse.move(...px(st.drag.from), { steps: 5 });
          await page.mouse.down();
          await page.mouse.move(...px(st.drag.to), { steps: 25 });
          await page.mouse.up();
        } else if (st.down) { await page.mouse.move(...px(st.down)); await page.mouse.down(); }
        else if (st.up) { await page.mouse.move(...px(st.up), { steps: 20 }); await page.mouse.up(); }
        else if (st.click) {
          const target = Array.isArray(st.click) ? st.click : st.click[side];
          if (Array.isArray(target)) await page.mouse.click(...px(target));
          else await page.click(target, { timeout: 5000 }).catch((e) => results.push({ name: sc.name, error: `click ${target}: ${e.message.split('\n')[0]}` }));
        } else if (st.key) await page.keyboard.press(st.key);
        else if (st.wait) await page.waitForTimeout(st.wait);
        else if (st.shot) await shot(st.shot);
      }
      const after = expectSel ? await stateOf(page, expectSel) : null;
      const changed = expectSel ? before !== null && [...states, after].some((s) => s !== null && s !== before) : null;
      results.push({ name: sc.name, shots, changed, before, after });
      await context.close();
    }
  } finally {
    if (!flags.cdp) await browser.close();
  }
  return results;
}

// --url scores another build of the clone (e.g. the Next.js app) instead of serving clone/
const server = typeof flags.url === 'string' ? null : await serve(path.join(root, 'clone'));
const cloneUrl = server ? server.url : flags.url;
// Reference results are cached per scenario (reference side + viewport + capture time) as long as the shot
// files still exist; only new or edited scenarios touch the live site. --refresh-ref re-measures all.
const refKey = (sc) => ({ tool: 'interact', name: sc.name, viewport: sc.viewport, at: sc.at, steps: sc.steps, expect: sc.expectChange?.ref, compare: sc.compare, click: JSON.stringify(sc.steps) });
const refRes = [];
const missing = [];
for (const sc of scenarios) {
  const hit = flags['refresh-ref'] ? null : await readCache(root, refKey(sc));
  const filesOk = hit && (await Promise.all(Object.values(hit.shots || {}).map((f) => fs.access(f).then(() => true, () => false)))).every(Boolean);
  if (hit && filesOk) refRes.push(hit); else missing.push(sc);
}
if (missing.length) console.log(`measuring ${missing.length} reference scenario(s) (${scenarios.length - missing.length} cached)`);
for (const r of await runSide(meta.url, 'ref', missing)) {
  refRes.push(r);
  const sc = missing.find((m) => m.name === r.name);
  if (sc && r.shots) await cached(root, refKey(sc), async () => r, true);
}
const cloneRes = await runSide(cloneUrl, 'clone', scenarios);
server?.close();

const report = { name, at: new Date().toISOString(), scenarios: [] };
for (const sc of scenarios) {
  const a = refRes.find((r) => r.name === sc.name && r.shots), b = cloneRes.find((r) => r.name === sc.name && r.shots);
  const errors = [...refRes, ...cloneRes].filter((r) => r.name === sc.name && r.error).map((r) => r.error);
  const shots = {};
  for (const label of Object.keys(a?.shots || {})) {
    if (!b?.shots[label]) continue;
    shots[label] = matchPct(PNG.sync.read(await fs.readFile(a.shots[label])), PNG.sync.read(await fs.readFile(b.shots[label]))).pct;
  }
  const labels = Object.keys(shots).filter((l) => l !== 'before');
  const score = labels.length ? +(labels.reduce((n, l) => n + shots[l], 0) / labels.length).toFixed(2) : null;
  const expect = sc.expectChange ? { ref: a?.changed, clone: b?.changed, pass: a?.changed === true && b?.changed === true } : null;
  report.scenarios.push({ name: sc.name, score, shots, expect, errors });
}
await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.table(report.scenarios.map((s) => ({
  scenario: s.name,
  'match %': s.score,
  shots: Object.entries(s.shots).map(([k, v]) => `${k} ${v}`).join('  '),
  'changes (ref/clone)': s.expect ? `${s.expect.ref ? 'yes' : 'NO'} / ${s.expect.clone ? 'yes' : 'NO'}${s.expect.pass ? '' : '  FAIL'}` : '-',
  errors: s.errors.join('; ') || '',
})));
console.log(`-> ${path.relative(process.cwd(), path.join(outDir, 'report.json'))}`);
