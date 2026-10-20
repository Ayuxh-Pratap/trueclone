// Review: the reference and the clone side by side, the way a person looks at a website, at a size the clone was never
// built from (default: the held-out 1920x1080). Frames: the load at 0.3, 1.5 and 4.5 s, then every section (and every
// screen of a tall one) after scrolling to it with the wheel, each also with the pointer resting on the control nearest
// the middle of the screen. Each frame is one image, reference left, clone right, in compare/review/<size>/, listed in
// compare/review/<size>/index.md with its pixel match.
//
// The agent looks at every frame and writes a verdict per frame in notes.md under "## Review":
//   - 03-section-2 wide: same
//   - 07-section-4-hover wide: differs: the panel opens on the wrong card
// REPORT.md counts the frames signed off; "differs" and frames without a verdict are listed as open.
//
// usage: node scripts/review.mjs <name> [--size wide|laptop|desktop|tablet|mobile] [--url <clone url>]
import fs from 'node:fs/promises';
import path from 'node:path';
import { SCORED, parseArgs, openBrowser, newPage, serve, matchPct, PNG, COMPARE, siteDir, unroll } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: trueclone review <name> [--size wide] [--url <clone url>]');
  process.exit(1);
}
const root = siteDir(name);
const ref = path.join(root, 'reference');
const meta = JSON.parse(await fs.readFile(path.join(ref, 'meta.json'), 'utf8'));
const vp = SCORED.find((v) => v.name === (flags.size || 'wide'));
if (!vp) { console.error(`unknown size ${flags.size}: ${SCORED.map((v) => v.name).join(', ')}`); process.exit(1); }
// --route "/about": another route of the site (meta.routes), opened at its own address on both sides; its frames go to
// compare/review/routes/<slug>/<size>/ and their ids carry the route ("about/03-section-2"), so verdicts never collide
const route = typeof flags.route === 'string' ? (meta.routes || []).find((r) => r.path === flags.route.replace(/\/+$/, '') || (flags.route === '/' && !r.slug)) : null;
if (typeof flags.route === 'string' && !route) { console.error(`no route ${flags.route} in this capture: ${(meta.routes || []).map((r) => r.path).join(', ') || 'one page only'}`); process.exit(1); }
const prefix = route?.slug ? `${route.slug}/` : '';
const refDir = route ? path.join(root, route.dir) : ref;
const server = typeof flags.url === 'string' ? null : await serve(path.join(root, 'clone'));
const cloneBase = server ? server.url : flags.url;
const cloneUrl = route?.slug ? new URL(route.path.replace(/^\//, ''), cloneBase).href : server ? `${server.url}index.html` : flags.url;
const refUrl = route?.slug ? new URL(route.path, meta.finalUrl || meta.url).href : meta.url;
const outDir = route?.slug ? path.join(root, COMPARE, 'review', 'routes', route.slug, vp.name) : path.join(root, COMPARE, 'review', vp.name);
// A review of the clone as it is now is not shot again (its verdicts stand): only when the clone or the capture is
// newer than the frames, or with --force. The app (--url) is always shot.
if (!flags.url && !flags.force) {
  const last = JSON.parse(await fs.readFile(path.join(outDir, 'frames.json'), 'utf8').catch(() => 'null'));
  let newest = Date.parse(meta.capturedAt || 0) || 0;
  const walk = async (d) => { for (const e of await fs.readdir(d, { withFileTypes: true }).catch(() => [])) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules') await walk(p); } else newest = Math.max(newest, (await fs.stat(p)).mtimeMs); } };
  await walk(path.join(root, 'clone'));
  if (last?.at && Date.parse(last.at) > newest + 1000) {
    console.log(`review (${vp.name}${route?.slug ? `, ${route.path}` : ''}): current, nothing changed since ${last.at.slice(0, 16).replace('T', ' ')} (${last.frames.length} frames in ${path.relative(process.cwd(), path.join(outDir, 'index.md'))}; --force shoots it again)`);
    process.exit(0);
  }
}
await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

// the frame plan comes from the reference at this size: section tops, and a frame per screen in tall sections
const sections = JSON.parse(await fs.readFile(path.join(refDir, `${vp.name}.sections.json`), 'utf8').catch(() => 'null'));
if (!sections) { console.error(`no capture at ${vp.name} (${vp.width}x${vp.height}): re-capture with trueclone 0.4+`); process.exit(1); }
const plan = [];
sections.forEach((s, i) => {
  const top = Math.max(0, s.y);
  const screens = Math.max(1, Math.min(4, Math.round((s.height || s.h || vp.height) / vp.height)));
  for (let k = 0; k < screens; k++) plan.push({ label: `section-${i + 1}${screens > 1 ? `-${k + 1}` : ''}`, y: top + k * vp.height });
});
// The page between and below the sections too: a block the section finder did not take for one (a component in a
// shadow root, a script-built island) is still part of what a visitor scrolls past, and is looked at.
const pageHeight = (route?.slug ? route.viewports : meta.viewports)?.find((v) => v.viewport === vp.name)?.pageHeight || 0;
const spans = sections.map((s) => [Math.max(0, s.y), Math.max(0, s.y) + (s.height || s.h || 0)]).sort((a, b) => a[0] - b[0]);
let reached = 0, gap = 0;
for (const [top, bottom] of [...spans, [pageHeight, pageHeight]]) {
  if (top - reached > vp.height * 0.4) {
    gap++;
    for (let y = reached, k = 0; y < top - vp.height * 0.2 && k < 4; y += vp.height, k++) plan.push({ label: `between-${gap}${k ? `-${k + 1}` : ''}`, y });
  }
  reached = Math.max(reached, bottom);
}
const frames = plan.sort((a, b) => a.y - b.y).slice(0, 40);

// the control nearest the middle of the screen: links, buttons, pointer-cursor elements, cards with a hover listener
function hoverPoint() {
  let best = null;
  for (const el of document.querySelectorAll('a, button, [role="button"], [role="tab"], summary, *')) {
    const s = getComputedStyle(el);
    if (s.cursor !== 'pointer' && !['A', 'BUTTON', 'SUMMARY'].includes(el.tagName)) continue;
    const r = el.getBoundingClientRect();
    if (r.width * r.height < 1500 || r.bottom < 60 || r.top > innerHeight - 20 || r.width > innerWidth * 0.9) continue;
    const cx = r.left + r.width / 2, cy = Math.min(Math.max(r.top + r.height / 2, 70), innerHeight - 20);
    const d = Math.hypot(cx - innerWidth / 2, cy - innerHeight / 2);
    if (!best || d < best.d) best = { x: Math.round(cx), y: Math.round(cy), d };
  }
  return best;
}

async function shoot(url, side) {
  const { context, page } = await newPage(await browserP, vp, { reducedMotion: 'no-preference' });
  const shots = {};
  try {
    // the load frames count from each side's own load event, not from navigation: the reference comes over the
    // network, the clone from disk, and an intro that starts when its page has loaded must be compared phase to phase
    await page.goto(url, { waitUntil: 'load', timeout: 60000 }).catch(() => null);
    const t0 = Date.now();
    for (const t of [300, 1500, 4500]) {
      const wait = t0 + t - Date.now();
      if (wait > 0) await page.waitForTimeout(wait);
      shots[`load-${t}`] = await page.screenshot().catch(() => null);
    }
    // lazy media loaded before any scrolling: a page that grows while it is being scrolled (images arriving) stops
    // short of where it was sent, by a different amount on each side
    await page.evaluate(async () => {
      for (const img of document.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager';
      await Promise.race([Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; })))), new Promise((r) => setTimeout(r, 8000))]);
    }).catch(() => {});
    await page.waitForTimeout(1500);
    await unroll(page); // an app shell scrolls like a document (lib.mjs), the same on both sides
    const scrollTo = async (y) => {
      // with the wheel, the way a visitor scrolls: scroll-linked scenes and smooth scrolling follow wheel input; then
      // checked: the frame is taken where it was meant (within 2px), the wheel turned again if it fell short
      await page.mouse.move(Math.round(vp.width * 0.98), Math.round(vp.height * 0.5));
      const target = Math.min(y, await page.evaluate(() => document.documentElement.scrollHeight - innerHeight));
      for (let tries = 0; tries < 3; tries++) {
        const now = await page.evaluate(() => scrollY);
        if (Math.abs(now - target) <= 2) break;
        const n = Math.max(1, Math.ceil(Math.abs(target - now) / 400));
        for (let i = 0; i < n; i++) { await page.mouse.wheel(0, (target - now) / n); await page.waitForTimeout(60); }
        await page.waitForTimeout(tries ? 900 : 1600);
      }
      return page.evaluate(() => Math.round(scrollY));
    };
    for (const f of frames) {
      positions[side][f.label] = await scrollTo(f.y);
      shots[f.label] = await page.screenshot();
      const at = side === 'ref' ? await page.evaluate(hoverPoint) : hoverPoints[f.label];
      if (side === 'ref') hoverPoints[f.label] = at;
      if (at) {
        await page.mouse.move(at.x - 30, at.y, { steps: 4 });
        await page.mouse.move(at.x, at.y, { steps: 6 });
        await page.waitForTimeout(1100);
        shots[`${f.label}-hover`] = await page.screenshot();
        await page.mouse.move(Math.round(vp.width * 0.98), Math.round(vp.height * 0.5));
      }
    }
  } finally {
    await context.close();
  }
  return shots;
}

const hoverPoints = {};
const positions = { ref: {}, clone: {} }; // where each side really was for each frame
const browserP = openBrowser(flags.cdp);
const browser = await browserP;
let refShots, cloneShots;
try {
  refShots = await shoot(refUrl, 'ref');
  cloneShots = await shoot(cloneUrl, 'clone');
} finally {
  if (!flags.cdp) await browser.close();
  server?.close();
}

// one image per frame: reference | clone, half size, with the frame's pixel match
const lines = [];
let n = 0;
// A frame's token: what the picture shows, coarsely (16x10 grey levels), so a verdict holds for the picture judged,
// not for a frame id: shot again and different, it needs a new look; shot again and alike, it keeps its verdict.
const tokenOf = (img) => {
  let h = 2166136261;
  for (let gy = 0; gy < 10; gy++) for (let gx = 0; gx < 16; gx++) {
    const x = Math.floor((gx + 0.5) * img.width / 16), y = Math.floor((gy + 0.5) * img.height / 10), i = (y * img.width + x) * 4;
    h = Math.imul(h ^ (((img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3) >> 5), 16777619) >>> 0;
  }
  return h.toString(36).slice(0, 5);
};
const SAME_REASON = 85; // below this pixel match, "same" says why
for (const label of Object.keys(refShots)) {
  const a = refShots[label] && PNG.sync.read(refShots[label]);
  const b = cloneShots[label] && PNG.sync.read(cloneShots[label]);
  if (!a || !b) continue;
  const scale = 0.5, w = Math.round(vp.width * scale), h = Math.round(vp.height * scale);
  const img = new PNG({ width: w * 2 + 12, height: h });
  img.data.fill(255);
  [a, b].forEach((src, k) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = Math.min(src.width - 1, Math.round(x / scale)), sy = Math.min(src.height - 1, Math.round(y / scale));
      const si = (sy * src.width + sx) * 4, di = (y * img.width + x + k * (w + 12)) * 4;
      img.data[di] = src.data[si]; img.data[di + 1] = src.data[si + 1]; img.data[di + 2] = src.data[si + 2]; img.data[di + 3] = 255;
    }
  });
  const file = `${String(n++).padStart(2, '0')}-${label}`;
  const id = `${prefix}${file}`; // a route's frames carry the route: "about/03-section-2"
  await fs.writeFile(path.join(outDir, `${file}.png`), PNG.sync.write(img));
  const pct = matchPct(a, b).pct;
  const base = label.replace(/-hover$/, '');
  lines.push({ id, file, pct, token: tokenOf(img), ...(positions.ref[base] !== undefined ? { y: { ref: positions.ref[base], clone: positions.clone[base] } } : {}), img });
}
// contact sheets: three frames per image, so the whole review is a few reads
const sheets = [];
for (let s = 0; s * 3 < lines.length; s++) {
  const group = lines.slice(s * 3, s * 3 + 3);
  const w = group[0].img.width, h = group[0].img.height, gap = 28;
  const sheet = new PNG({ width: w, height: group.length * (h + gap) });
  sheet.data.fill(255);
  group.forEach((l, k) => {
    for (let y = 0; y < h; y++) l.img.data.copy(sheet.data, ((k * (h + gap) + gap + y) * w) * 4, (y * w) * 4, ((y + 1) * w) * 4);
  });
  const file = `sheet-${String(s + 1).padStart(2, '0')}.png`;
  await fs.writeFile(path.join(outDir, file), PNG.sync.write(sheet));
  sheets.push({ file, frames: group.map((l) => l.id) });
}
for (const l of lines) delete l.img;
await fs.writeFile(path.join(outDir, 'index.md'), `# Review${route?.slug ? ` of ${route.path}` : ''} at ${vp.name} (${vp.width}x${vp.height}): reference left, clone right

Look at every frame (the sheets hold three frames each, in order). In notes.md under "## Review", one line per frame,
with the frame's token from the table below (a verdict holds for that picture only: a frame shot again that looks
different needs a new look): \`- <frame> ${vp.name} [<token>]: same\`, \`- <frame> ${vp.name} [<token>]: differs: <what you
see>\`, or, only when you proved the difference is the instrument's and not the clone's, \`- <frame> ${vp.name} [<token>]:
tool: <why>; evidence: <a crop or a measurement>\`. Below ${SAME_REASON}% pixel match, "same" says why
(\`same: the reference's photo arrives later\`). Pixel match is a hint, not the verdict: a 99% frame can hide a wrong
panel, and a 90% frame can be a random animation phase. Never write verdicts from pixel match alone.

Sheets: ${sheets.map((s) => `[${s.file}](${s.file}) (${s.frames.join(', ')})`).join(' · ')}

| frame | token | pixel match | scrolled to (reference / clone) |
|---|---|---|---|
${lines.map((l) => `| [${l.id}](${l.file}.png) | ${l.token} | ${l.pct}% | ${l.y ? `${l.y.ref} / ${l.y.clone}${Math.abs(l.y.ref - l.y.clone) > 2 ? ' **(not the same place)**' : ''}` : '–'} |`).join('\n')}
`);
// make sure notes.md has the section the verdicts go in
const notesFile = path.join(root, 'notes.md');
const notes = await fs.readFile(notesFile, 'utf8').catch(() => '');
if (!/^## Review/m.test(notes)) await fs.appendFile(notesFile, `\n## Review\n\n<!-- one line per frame of compare/review/<size>/index.md: "- <frame> <size>: same" or "- <frame> <size>: differs: <what>". REPORT.md counts them. -->\n`);
await fs.writeFile(path.join(outDir, 'frames.json'), JSON.stringify({ size: vp.name, at: new Date().toISOString(), frames: lines, sheets }, null, 2));
console.log(`review (${vp.name} ${vp.width}x${vp.height}): ${lines.length} frames -> ${path.relative(process.cwd(), path.join(outDir, 'index.md'))}; lowest pixel match: ${[...lines].sort((x, y) => x.pct - y.pct).slice(0, 4).map((l) => `${l.id} ${l.pct}%`).join(', ')}`);
