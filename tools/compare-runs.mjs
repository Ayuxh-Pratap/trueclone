// one-off analysis: the reference and the three varsity clones at the same moments and landmarks, at a scored width
// (1440) and an unscored one (1920); montage per state in sites/_runs/<width>/
import fs from 'node:fs/promises';
import path from 'node:path';
import { openBrowser, newPage, serve, PNG } from '../scripts/lib.mjs';

const OUT = path.resolve('sites', '_runs');
const targets = [
  ['reference', 'https://www.varsity.vc/'],
  ['v1', 'C:/dev/test/clone-v1/sites/varsity/clone'],
  ['v2-noREA', 'C:/dev/test/clone-v2/sites/varsity/clone'],
  ['v3-REA', 'C:/dev/test/clone-v3/sites/varsity/clone'],
];
const widths = (process.argv[2] || '1440,1920').split(',').map(Number);
const servers = [];
const urls = {};
for (const [k, src] of targets) {
  if (src.startsWith('http')) { urls[k] = src; continue; }
  const s = await serve(path.resolve(src)); servers.push(s); urls[k] = `${s.url}index.html`;
}
// landmarks: [label, selector, offset as share of viewport height (scroll so the element top sits here), hover selector]
const MARKS = [
  ['hero-mid', null, 0.0],
  ['manifesto', '#manifesto', 0, null, 900],
  ['portfolio-hover', '.portfolio_row, .portfolio_item, [data-portfolio-row]', 0.35, true],
  ['team-hover', '.team_card', 0.25, true],
  ['stories', 'code-island, .vst-host', 0.05],
  ['talent-footer', 'footer, .section_footer', 0.6],
];
const browser = await openBrowser();
const facts = {};
try {
  for (const w of widths) {
    const vp = { name: `w${w}`, width: w, height: w >= 1900 ? 1080 : 900 };
    await fs.mkdir(path.join(OUT, String(w)), { recursive: true });
    for (const [k] of targets) {
      const { context, page } = await newPage(browser, vp, { reducedMotion: 'no-preference' });
      const shots = {};
      const t0 = Date.now();
      const nav = page.goto(urls[k], { waitUntil: 'load', timeout: 60000 }).catch(() => null);
      for (const t of [300, 1500, 4500]) {
        const wait = t0 + t - Date.now();
        if (wait > 0) await page.waitForTimeout(wait);
        shots[`load-${t}`] = await page.screenshot().catch(() => null);
      }
      await nav;
      await page.waitForTimeout(1500);
      const scrollTo = async (y) => {
        // wheel in steps, the way a visitor scrolls (scroll-linked scenes and smooth scroll follow wheel input)
        await page.mouse.move(Math.round(w * 0.5), 300);
        const now = await page.evaluate(() => scrollY);
        const steps = Math.max(1, Math.ceil(Math.abs(y - now) / 400));
        for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, (y - now) / steps); await page.waitForTimeout(60); }
        await page.waitForTimeout(1800);
      };
      await scrollTo(Math.round(vp.height * 1.6));
      shots['hero-mid'] = await page.screenshot();
      for (const [label, sel, at, hover, extra = 0] of MARKS.slice(1)) {
        const top = await page.evaluate((s) => { const el = s && document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return Math.round(r.top + scrollY); }, sel);
        if (top === null) { shots[label] = null; continue; }
        await scrollTo(Math.max(0, top - Math.round(vp.height * at) + extra));
        if (hover) {
          const box = await page.evaluate((s) => { const el = [...document.querySelectorAll(s)].find((e) => { const r = e.getBoundingClientRect(); return r.top > 40 && r.bottom < innerHeight; }); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 }; }, sel);
          if (box) { await page.mouse.move(box.x - 40, box.y, { steps: 5 }); await page.mouse.move(box.x, box.y, { steps: 8 }); await page.waitForTimeout(1200); }
        }
        shots[label] = await page.screenshot();
      }
      facts[`${w} ${k}`] = await page.evaluate(() => {
        const host = document.querySelector('code-island.vst-host');
        const canvas = host?.shadowRoot?.querySelector('.stories_canvas');
        return {
          pageHeight: document.documentElement.scrollHeight,
          storiesHeight: canvas ? Math.round(canvas.getBoundingClientRect().height) : null,
          heroItems: document.querySelectorAll('.hpx .zoom > .item, .hpx .item').length,
          canvases: [...document.querySelectorAll('canvas')].map((c) => `${c.width}x${c.height}`).join(' '),
        };
      });
      for (const [label, buf] of Object.entries(shots)) if (buf) await fs.writeFile(path.join(OUT, String(w), `${label}--${k}.png`), buf);
      await context.close();
      console.log(`${w} ${k} done`, JSON.stringify(facts[`${w} ${k}`]));
    }
    // montage per state: the four targets side by side, scaled
    const labels = ['load-300', 'load-1500', 'load-4500', ...MARKS.map((m) => m[0])];
    for (const label of labels) {
      const imgs = [];
      for (const [k] of targets) { try { imgs.push(PNG.sync.read(await fs.readFile(path.join(OUT, String(w), `${label}--${k}.png`)))); } catch { imgs.push(null); } }
      const scale = 0.3, cw = Math.round(vp.width * scale), ch = Math.round(vp.height * scale);
      const out = new PNG({ width: cw * 2 + 8, height: ch * 2 + 8 });
      out.data.fill(255);
      imgs.forEach((img, i) => {
        if (!img) return;
        const ox = (i % 2) * (cw + 8), oy = Math.floor(i / 2) * (ch + 8);
        for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
          const sx = Math.min(img.width - 1, Math.round(x / scale)), sy = Math.min(img.height - 1, Math.round(y / scale));
          const si = (sy * img.width + sx) * 4, di = ((oy + y) * out.width + ox + x) * 4;
          out.data[di] = img.data[si]; out.data[di + 1] = img.data[si + 1]; out.data[di + 2] = img.data[si + 2]; out.data[di + 3] = 255;
        }
      });
      await fs.writeFile(path.join(OUT, `${w}-${label}.png`), PNG.sync.write(out));
    }
  }
} finally {
  await browser.close();
  for (const s of servers) s.close();
}
await fs.writeFile(path.join(OUT, 'facts.json'), JSON.stringify(facts, null, 2));
console.log('montages in', OUT, '(top-left reference, top-right v1, bottom-left v2 no REA, bottom-right v3 REA)');
