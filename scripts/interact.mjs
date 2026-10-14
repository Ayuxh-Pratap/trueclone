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
// Points are [x, y] fractions of the viewport (0-1); move and hover also take an element: "selector@n" or { ref, clone }.
// "selector@n" in at/click/expectChange picks the n-th match, counting from 0 (mind hidden duplicates: a mobile menu
// button is often the first match). A scenario passes when the change happens on both sides and the shots after it
// match the reference's (≥ 95).
// usage: node scripts/interact.mjs <name> [--only "<text>"]   |   node scripts/interact.mjs <name> --draft
import fs from 'node:fs/promises';
import path from 'node:path';
import { VIEWPORTS, parseArgs, openBrowser, newPage, serve, warmUp, waitStill, wheelTo, maskToggle, matchPct, PNG, cached, readCache, COMPARE, siteDir } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: trueclone interact <name> [--only "<scenario text>"] | trueclone interact <name> --draft   (scenario format: the comment at the top of scripts/interact.mjs, and SKILL.md)');
  process.exit(1);
}
const root = siteDir(name);
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

// --auto: find what a visitor can operate on the live reference (older captures, or after the site changed)
const autoFile = path.join(ref, 'interactions.auto.json');
if (flags.auto) {
  const { detectInPage } = await import('./interactions-auto.mjs');
  const browser = await openBrowser(flags.cdp);
  const found = [];
  try {
    for (const vp of VIEWPORTS) {
      const { context, page } = await newPage(browser, vp, { reducedMotion: 'no-preference' });
      await page.goto(meta.url, { waitUntil: 'load', timeout: 60000 });
      await waitStill(page, { timeout: 15000, interval: 200 });
      await page.evaluate(() => scrollTo(0, 0));
      found.push(...await page.evaluate(detectInPage, [vp.name, meta.mode === 'exact' ? 'visual' : 'structure', 10]));
      await context.close();
    }
  } finally { if (!flags.cdp) await browser.close(); }
  await fs.writeFile(autoFile, JSON.stringify(found, null, 2));
  console.log(`${found.length} scenario(s) found on the reference -> ${path.relative(process.cwd(), autoFile)}`);
  process.exit(0);
}

// The scenarios: the agent's (interactions.json) and the ones the capture found (reference/interactions.auto.json).
// The agent's win by name; { "name": "...", "skip": "<why>" } retires one, and the reason is reported.
const own = JSON.parse(await fs.readFile(path.join(root, 'interactions.json'), 'utf8').catch(() => '[]'));
const auto = JSON.parse(await fs.readFile(autoFile, 'utf8').catch(() => '[]'));
const ownNames = new Set(own.map((s) => s.name));
const skipped = own.filter((s) => s.skip);
let scenarios = [...own.filter((s) => !s.skip), ...auto.filter((s) => !ownNames.has(s.name))];
if (!scenarios.length) {
  console.log('interactions: none (no interactions.json, and the capture found nothing to operate; trueclone interact <name> --auto re-checks the live page)');
  process.exit(0);
}
if (skipped.length) console.log(`retired by the agent: ${skipped.map((s) => `${s.name} (${s.skip})`).join('; ')}`);
if (typeof flags.only === 'string') scenarios = scenarios.filter((s) => s.name.includes(flags.only));
const outDir = path.join(root, COMPARE, 'interact');
await fs.mkdir(outDir, { recursive: true });

const stateOf = (page, selector) => page.evaluate((sel) => {
  const [s, idx] = sel.split('@');
  const el = document.querySelectorAll(s)[Number(idx || 0)];
  if (!el) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  // Besides geometry and visibility: text, state attributes and canvas pixels, so a button that changes its label,
  // a tab that flips aria-pressed or a game that redraws its canvas counts as a change too.
  const attrs = ['class', 'aria-pressed', 'aria-current', 'aria-expanded', 'aria-selected', 'data-state', 'open', 'hidden', 'disabled']
    .map((a) => (el.hasAttribute(a) ? `${a}=${el.getAttribute(a)}` : '')).join(',') // boolean attributes are "" + (el.value !== undefined ? `,${el.value}` : '');
  const text = el.textContent.replace(/\s+/g, ' ').trim().slice(0, 200);
  let pixels = '';
  if (el.tagName === 'CANVAS') {
    try { const d = el.toDataURL(); let h = 0; for (let i = 0; i < d.length; i += 7) h = (h * 31 + d.charCodeAt(i)) | 0; pixels = String(h); } catch { /* tainted canvas */ }
  }
  return `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}|${Math.round(el.scrollLeft)},${Math.round(el.scrollTop)}|${cs.transform}|${cs.opacity}|${cs.visibility}|${cs.clipPath}|${attrs}|${text}|${pixels}`;
}, selector);

async function runSide(url, side, list) {
  if (!list.length) return [];
  const browser = await openBrowser(flags.cdp);
  const results = [];
  // three scenarios at a time, each in its own browser context (a page load is most of a scenario's time)
  const queue = [...list];
  const one = async (sc) => {
    {
      const vp = VIEWPORTS.find((v) => v.name === (sc.viewport || 'desktop'));
      const { context, page } = await newPage(browser, vp, { reducedMotion: 'no-preference' });
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      await page.mouse.move(5, vp.height - 5);
      await waitStill(page, { timeout: 15000, interval: 200 });
      await warmUp(page);
      const atSel = sc.at?.[side];
      if (atSel && atSel !== 'body') {
        const y = await page.evaluate((sel) => { const [s, idx] = sel.split('@'); const el = document.querySelectorAll(s)[Number(idx || 0)]; return el ? el.getBoundingClientRect().top + scrollY : 0; }, atSel);
        await wheelTo(page, Math.max(0, Math.round(y + (sc.at.offset || 0))), vp);
      } else {
        await wheelTo(page, sc.at?.offset || 0, vp);
      }
      await waitStill(page, { timeout: 3000 });
      // the first frame only once the screen itself has stopped changing (a slow intro fade outlasts the page-level
      // wait, and a "before" caught halfway through it is compared against forever): two shots in a row the same
      for (let t0 = Date.now(), last = null; Date.now() - t0 < 6000;) {
        const buf = await page.screenshot();
        if (last && (buf.equals(last) || matchPct(PNG.sync.read(last), PNG.sync.read(buf)).pct >= 99.8)) break;
        last = buf;
        await page.waitForTimeout(250);
      }
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
        if (st.move || st.hover) {
          // a point [x, y], or an element to put the pointer on: "selector@n" or { ref, clone }
          const t = st.move || st.hover;
          const sel = Array.isArray(t) ? null : typeof t === 'string' ? t : t[side];
          if (!sel) await page.mouse.move(...px(t), { steps: 15 });
          else {
            const [s, idx] = sel.split('@');
            const box = await page.locator(s).nth(Number(idx || 0)).boundingBox().catch(() => null);
            if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 });
            else results.push({ name: sc.name, error: `hover ${sel}: no such element on the ${side === 'ref' ? 'reference' : 'clone'}` });
          }
        }
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
          else {
            // selector@n: the n-th match, as everywhere else in the scenario file
            const [s, idx] = target.split('@');
            await page.locator(s).nth(Number(idx || 0)).click({ timeout: 5000 }).catch((e) => results.push({ name: sc.name, error: `click ${target}: ${e.message.split('\n')[0]}` }));
          }
        } else if (st.wheel) {
          // a wheel turn over a point: how a desktop visitor scrolls a sideways scroller (dx) or a panel (dy)
          await page.mouse.move(...px(st.wheel.at || [0.5, 0.5]), { steps: 5 });
          for (let i = 0, n = 6; i < n; i++) { await page.mouse.wheel((st.wheel.dx || 0) / n, (st.wheel.dy || 0) / n); await page.waitForTimeout(40); }
        } else if (st.key) await page.keyboard.press(st.key);
        else if (st.wait) await page.waitForTimeout(st.wait);
        else if (st.shot) await shot(st.shot);
      }
      const after = expectSel ? await stateOf(page, expectSel) : null;
      const changed = expectSel ? before !== null && [...states, after].some((s) => s !== null && s !== before) : null;
      results.push({ name: sc.name, shots, changed, before, after });
      await context.close();
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
      for (let sc = queue.shift(); sc; sc = queue.shift()) {
        await one(sc).catch((e) => results.push({ name: sc.name, error: e.message.split('\n')[0] }));
      }
    }));
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
const refKey = (sc) => ({ tool: 'interact', v: 2, name: sc.name, viewport: sc.viewport, at: sc.at, steps: sc.steps, expect: sc.expectChange?.ref, compare: sc.compare, click: JSON.stringify(sc.steps) });
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
const END_STATE_MIN = 95; // the shots after the action must match this well
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
  // a scenario passes when the change happens on both sides AND the clone ends up where the reference does: a wrong
  // panel opening is a change too
  const endOk = score !== null && score >= END_STATE_MIN;
  // a scenario the capture found, where the reference itself does not react, is not a behaviour of the site
  // (a scroller that only scrolls by touch, a disclosure a script never wires): set aside, not failed
  if (sc.auto && a && a.changed === false) { report.scenarios.push({ name: sc.name, auto: true, notBehaviour: true, score: null, shots, expect: { ref: false, clone: b?.changed ?? null, endState: score, pass: true }, errors }); continue; }
  const expect = sc.expectChange
    ? { ref: a?.changed, clone: b?.changed, endState: score, pass: a?.changed === true && b?.changed === true && endOk }
    : { ref: null, clone: null, endState: score, pass: endOk };
  report.scenarios.push({ name: sc.name, ...(sc.auto ? { auto: true } : {}), score, shots, expect, errors });
}
report.skipped = skipped.map((s) => ({ name: s.name, why: s.skip }));
await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
const notBehaviour = report.scenarios.filter((s) => s.notBehaviour);
if (notBehaviour.length) console.log(`set aside (found by the capture, but the reference does not react): ${notBehaviour.map((s) => s.name).join('; ')}`);
console.table(report.scenarios.filter((s) => !s.notBehaviour).map((s) => ({
  scenario: s.name,
  'match %': s.score,
  shots: Object.entries(s.shots).map(([k, v]) => `${k} ${v}`).join('  '),
  'changes (ref/clone)': s.expect.ref === null ? '-' : `${s.expect.ref ? 'yes' : 'NO'} / ${s.expect.clone ? 'yes' : 'NO'}`,
  'end state': `${s.score ?? '-'}${s.expect.pass ? '' : '  FAIL'}`,
  errors: s.errors.join('; ') || '',
})));
console.log(`-> ${path.relative(process.cwd(), path.join(outDir, 'report.json'))}`);
