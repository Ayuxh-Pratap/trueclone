// Start the clone from the reference mirror instead of an empty folder. The mirror is the rendered page with every
// script and inline handler removed and its stylesheets and media saved locally, so the seeded clone has the site's
// structure and styles at the right paths. What it lacks is behaviour: write that in clone/script.js (your own
// code, using the parameters you read from the site), then verify with the usual scores.
//
// exact mode (the site's own content, with recorded permission): markup, text, styles and media as they are.
// template mode: the same markup and styles, but every text becomes lorem words of the same rendered width (so lines
// break where the reference's break), every image, video, large SVG and iframe a same-size placeholder, every link
// "#", and brand metadata is dropped. No text or media of the site ends up in clone/. Fonts stay for local study:
// swap licensed fonts before reusing the result.
//
// usage: node scripts/seed.mjs <name> [--force]   (--force overwrites an existing clone/)
import fs from 'node:fs/promises';
import path from 'node:path';
import fsSync from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, openBrowser, newPage, serve, VIEWPORTS, siteDir, routeArg } from './lib.mjs';
import { planInlineStyles } from './viewport-fit.mjs';

// placeholder vocabulary, wide enough to match most word widths
const LOREM_TEXT = `lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore
magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute
irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt
culpa qui officia deserunt mollit anim id est laborum curabitur pretium tincidunt lacus nunc vitae faucibus porta felis
mauris viverra diam vel augue blandit nibh sapien rhoncus massa feugiat tellus integer vulputate morbi risus quam varius
orci nam libero justo laoreet sem lectus mattis praesent semper ante gravida eget fermentum turpis sodales neque arcu
egestas phasellus volutpat donec pharetra aenean placerat lobortis primis cras tortor iaculis lacinia suspendisse potenti
vivamus ultricies posuere cubilia curae maecenas ligula proin accumsan quisque ornare urna pellentesque habitant tristique
senectus netus malesuada fames ac a at nec mi ne te se eu per
abeo absum accedo accipio acer acies actus addo adeo adhuc aditus adsum aequor aequus aer aetas ager agito agmen ago
aio alacer albus alias alius alo alter altus amicus amo amor amplus anima animus annus ante antea aperio apud aqua arbor
arcus ardeo argentum arma ars artus arx asper astrum atque atrox audax audio aureus auris aurum aut autem auxilium avis
bellum bene bonus bos brevis cado caecus caelum calamus campus candidus canis cano capio caput carmen carus castra causa
cedo celer cena certus cervus ceteri cibus cinis circa cito civis clamo clarus claudo clavis coepi cogito cognosco cohors
colo color comes communis concilium condo confero coniunx consilium constat contra copia cor corpus cras credo creo cresco
crimen cubo culpa cum cunctus cupio cur cura curro cursus custos damnum de debeo decet decus deinde denique dens desino
deus dexter dico dies dignus diligo discipulus diu diversus divus do doceo dolor domus donum dorsum dubius duco dulcis dum
durus dux ecce edo effero ego emo eo epistula equus ergo erro et etiam excito exemplum exeo exerceo exitus expedio facies
facilis facio factum fallo fama fames fatum faveo felix femina fere fero ferrum fessus fides filius finis fio flamma flecto
fleo flos flumen fluo foedus folium fons fores forma fortis fortuna forum frango frater frons fructus frustra fuga fugio
fundo fundus genus gens gero gladius gloria gradus gratia gravis habeo haud herba heri hic hiems hodie homo honor hora
hortus hostis humus iaceo iam ianua ibi idem ignis ille imago imber imperium impero incipio inde ingens inimicus initium
iniuria inquam insula inter interea ipse ira iter iubeo iungo ius iuvenis labor lacrima laetus lapis late latus laudo laus
lectus legio lego lenis levis lex liber libertas licet limen lingua littera litus locus longus loquor luceo ludus lumen
luna lux magister maior malus maneo manus mare mater medius memoria mens mensa mereo metus meus miles mirus miser mitto
modo modus moenia moneo mons mora morbus morior mors mos moveo mox mulier multus munus murus muto narro nascor natura navis
nemo nemus nescio niger nihil nimis nisi nobilis noceo nomen nos noster novus nox nullus numen numerus nunquam nuntius
oculus odium officium olim omnis onus opera oppidum ops optimus opus ora orbis ordo orior os otium pando par parens paro
pars parvus pater patior patria pauci pax pectus pecunia pello pendeo pereo periculum pes peto pietas placeo plenus
plurimus poena pono pons populus porta posco possum post potens praeda praemium premo pretium primus princeps prior pro
procul prope propter proximus puella puer pugna pulcher puto qualis quando quantus quare quasi quidem quies quinque quoque
rapio ratio recipio reddo redeo refero regio regnum rego relinquo res respondeo rex rideo ripa rogo ruo rursus sacer
saepe saevus salus sanguis sapiens satis saxum scelus scio scribo secundus securus sedeo semel senex sensus sentio sermo
servo servus sic sidus signum silva similis simul sine socius sol soleo solus somnus sonus soror spatium species spero
spes spiritus statim statuo sto studium sub subito summus super surgo suus tacitus talis tam tamen tandem tango tantus
tectum tellus telum templum tempus teneo tener terra terreo tertius timeo tollo totus traho trans tristis tu tum turba
tutus tuus ubi ullus umbra umquam unda unde unus urbs usus uxor vaco valeo vallis varius vates veho vel venio ventus
verbum vereor vero verto verus vester veto vetus via video vinco vinum vir virgo virtus vis vita vito vivo vix voco volo
voluntas vos votum vox vulnus vultus`;
const LOREM = LOREM_TEXT.split(/\s+/).filter(Boolean);


// Reveal player shipped with the clone (trueclone's own code): replays each recorded curve with the Web Animations
// API once the element's top crosses the recorded trigger line; with reduced motion it shows the end state.
const PLAYER = `// trueclone reveal player: replays what was recorded on the reference while scrolling (trueclone reveals): one-shot
// reveals frame by frame, scroll-linked curves (parallax, scrubbed fades) by scroll position, and class changes (a
// header that gets its backdrop past 12px, an "is-visible" toggle). Records exist per width; the one for the
// visitor's width is used (desktop from 1100px, tablet from 600px, otherwise mobile).
(() => {
  const raw = JSON.parse(document.getElementById('tc-reveals')?.textContent || '{}');
  const data = Array.isArray(raw) ? raw : raw.reveals || [];
  const classData = Array.isArray(raw) ? [] : raw.classes || [];
  const scrubData = Array.isArray(raw) ? [] : raw.scrubs || [];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // the record for the visitor's width: a recorded size in the same range of the site's own breakpoints (the nearest
  // one), otherwise the nearest recorded size
  const bps = raw.breakpoints || [];
  const rangeOf = (w) => bps.filter((b) => w > b).length;
  const seedSizes = raw.sizes || [{ name: 'mobile', width: 390 }, { name: 'tablet', width: 768 }, { name: 'desktop', width: 1440 }];
  const W = document.documentElement.clientWidth;
  const sameRange = seedSizes.filter((x) => rangeOf(x.width) === rangeOf(W));
  const vpName = (sameRange.length ? sameRange : seedSizes).reduce((a, b) => (Math.abs(b.width - W) < Math.abs(a.width - W) ? b : a)).name;
  const pick = (entry) => (entry && (entry.desktop || entry.tablet || entry.mobile) ? entry[vpName] || entry.desktop || entry.tablet || entry.mobile : entry);

  // Hand-over: script.js takes elements from every player with tcOwn("selector") (the head runtime, RUNTIME below;
  // or data-tc-own on the element or an ancestor, or by removing its data-tc-* mark); the players never touch them again.
  const owned = (el) => Boolean(el.closest('[data-tc-own]'));

  // class changes are state, not motion: they apply with reduced motion too. Only the recorded difference is applied
  // (the classes added and removed between the two recorded states), so classes anything else sets are kept.
  const tokens = (s) => String(s || '').split(/\\s+/).filter(Boolean);
  const shift = (el, from, to) => {
    if (owned(el)) return;
    const a = tokens(from), b = tokens(to);
    el.classList.remove(...a.filter((t) => !b.includes(t)));
    el.classList.add(...b.filter((t) => !a.includes(t)));
  };
  let scrolled = false;
  const pinned = [];
  for (const el of document.querySelectorAll('[data-tc-class]')) {
    const c = classData[Number(el.dataset.tcClass)];
    if (!c) continue;
    if (c.sticky) { pinned.push([el, c, false]); continue; }
    const line = Math.max(0, Math.min(1, c.trigger ?? 1));
    // an element without a box (display: contents) never intersects: watch its first descendant that has one
    const watched = el.getBoundingClientRect().height ? el : [...el.querySelectorAll('*')].find((d) => d.getBoundingClientRect().height) || el;
    let on = false;
    new IntersectionObserver(([e], io) => {
      if (!el.hasAttribute('data-tc-class')) { io.disconnect(); return; }
      if (e.isIntersecting && !on) { shift(el, c.from, c.to); on = true; if (!c.reverts) io.disconnect(); }
      else if (!e.isIntersecting && c.reverts && on) { shift(el, c.to, c.back ?? c.from); on = false; }
    }, { rootMargin: \`0px 0px -\${((1 - line) * 100).toFixed(1)}% 0px\` }).observe(watched);
  }
  const applyPinned = () => {
    if (scrollY > 0) scrolled = true;
    for (const p of pinned) {
      const [el, c, on] = p;
      if (!el.hasAttribute('data-tc-class')) continue;
      const past = scrollY >= (c.threshold ?? 1);
      if (past && !on) { shift(el, c.from, c.to); p[2] = true; }
      else if (!past && on && c.reverts && scrolled) { shift(el, c.to, c.back ?? c.from); p[2] = false; }
    }
  };
  if (pinned.length) {
    let queued = false;
    addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; applyPinned(); }); } }, { passive: true });
    applyPinned();
  }
  // clip-path where it was recorded (a wipe); records made before it was, without
  const style = (f) => ({ opacity: f.o, transform: \`translate(\${f.tx}px, \${f.ty}px) scale(\${f.s})\`, filter: f.blur ? \`blur(\${f.blur}px)\` : 'none', ...(f.clip !== undefined ? { clipPath: f.clip } : {}) });
  // scroll-linked curves: the recorded state at the two nearest scroll positions, interpolated. An element that also
  // plays a one-shot reveal follows its curve once the reveal has finished.
  // A curve is keyed by the element's own position in the viewport (key "v": its layout box top, translate taken
  // out, the way a ScrollTrigger on the element sees it, so any viewport height gives the same curve) or, for an
  // element inside a pinned stage, by the scroll position (key "y").
  const scrubs = [];
  for (const el of document.querySelectorAll('[data-tc-scrub]')) {
    const rec = pick(scrubData[Number(el.dataset.tcScrub)]);
    const s = Array.isArray(rec) ? rec : rec && rec.samples;
    if (!s || s.length < 2) continue;
    const key = !Array.isArray(rec) && rec.key === 'v' && s[0].v !== undefined ? 'v' : 'y';
    scrubs.push({ el, key, s: key === 'v' ? [...s].sort((p, q) => p.v - q.v) : s, ty: 0, ready: !el.hasAttribute('data-tc-reveal') });
  }
  const at = (s, key, pos) => {
    if (pos <= s[0][key]) return s[0];
    for (let i = 1; i < s.length; i++) {
      if (pos > s[i][key]) continue;
      const a = s[i - 1], b = s[i], k = (pos - a[key]) / ((b[key] - a[key]) || 1);
      const L = (p) => a[p] + (b[p] - a[p]) * k;
      return { o: L('o'), tx: L('tx'), ty: L('ty'), s: L('s'), blur: L('blur') };
    }
    return s[s.length - 1];
  };
  // script.js takes an element over by removing its data-tc-scrub / data-tc-reveal mark: the player then leaves it alone
  const applyScrubs = () => {
    for (const x of scrubs) {
      if (!x.ready || !x.el.hasAttribute('data-tc-scrub') || owned(x.el)) continue;
      const pos = x.key === 'v' ? x.el.getBoundingClientRect().top - x.ty : scrollY;
      const f = at(x.s, x.key, pos);
      x.ty = f.ty;
      Object.assign(x.el.style, style(f));
    }
  };
  if (scrubs.length) {
    let queued = false;
    addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; applyScrubs(); }); } }, { passive: true });
    applyScrubs();
  }
  const release = (el) => { const x = scrubs.find((q) => q.el === el); if (x) { x.ready = true; applyScrubs(); } };
  const settle = (el, r) => { Object.assign(el.style, style(r.to)); release(el); };
  // A reveal taken over (tcOwn, data-tc-own) settles where it ends, never at its start state (opacity 0): its mark and
  // the inline state the player wrote go, so the page's own CSS applies; where that still differs from the recorded
  // end (a fade the site's script brought to 1, a resting offset), the end value is set inline.
  window.__tcSettle = (el) => {
    const r = pick(data[Number(el.dataset.tcReveal)]);
    for (const a of el.getAnimations()) a.cancel();
    el.removeAttribute('data-tc-reveal');
    for (const p of ['opacity', 'transform', 'filter', 'clip-path']) el.style.removeProperty(p);
    if (!r || !r.to) return;
    if (Math.abs(parseFloat(getComputedStyle(el).opacity) - r.to.o) > 0.01) el.style.opacity = String(r.to.o);
    if (r.to.tx || r.to.ty || (r.to.s ?? 1) !== 1) el.style.transform = style(r.to).transform;
    if (r.to.blur) el.style.filter = style(r.to).filter;
  };
  const play = (el, r) => {
    const frames = r.frames.map((f) => ({ ...style(f), offset: r.duration ? Math.min(1, f.t / r.duration) : 1 }));
    const anim = el.animate(frames, { duration: r.duration, fill: 'forwards', easing: 'linear' });
    anim.onfinish = () => { settle(el, r); anim.cancel(); };
  };
  for (const el of document.querySelectorAll('[data-tc-reveal]')) {
    if (owned(el)) { window.__tcSettle(el); continue; }
    const r = pick(data[Number(el.dataset.tcReveal)]);
    if (!r) { release(el); continue; }
    if (r.from) Object.assign(el.style, style(r.from)); // this width's starting state (the seed inlined the desktop one)
    if (reduce) { settle(el, r); continue; }
    // the recorded trigger is where the element's top was (as a share of the window height) when it started
    const line = Math.max(0, Math.min(1, r.trigger ?? 1));
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.disconnect();
        if (el.hasAttribute('data-tc-reveal') && !owned(el)) play(el, r);
      }
    }, { rootMargin: \`0px 0px -\${((1 - line) * 100).toFixed(1)}% 0px\` });
    io.observe(el);
  }
})();
`;

// The head runtime, in every clone whatever the seed wrote (inline in <head>, so it exists before any script runs):
// - tcOwn("selector") hands elements to script.js. It marks them (data-tc-own: the players never touch them again),
//   clears the transforms GSAP had written as motion on them and their descendants (data-tc-gsap="": script.js
//   starts from the page as it was before any script ran, as the site's own script did; a state transform, such as a
//   closed menu's scale(1, 0), is data-tc-gsap="state" and stays), and settles their scroll reveals at the end.
// - tcBoot, the boot contract: <html class="tc-boot"> until every clone script has run (DOMContentLoaded comes after
//   the deferred ones; the Next app's injector releases after its last script) and every hold is released. script.js
//   holds the boot while it prepares what a visitor must not see half-built: tcBoot.hold() at the top,
//   tcBoot.release() when ready.
const RUNTIME = `(() => {
  window.tcOwn = (sel) => {
    for (const el of document.querySelectorAll(sel)) {
      el.setAttribute('data-tc-own', '');
      for (const g of [el, ...el.querySelectorAll('[data-tc-gsap]')]) {
        if (g.getAttribute('data-tc-gsap') !== '') continue;
        for (const p of ['transform', 'translate', 'rotate', 'scale']) g.style.removeProperty(p);
        g.removeAttribute('data-tc-gsap');
      }
      for (const r of [el, ...el.querySelectorAll('[data-tc-reveal]')]) if (r.hasAttribute('data-tc-reveal')) (window.__tcSettle || ((x) => x.removeAttribute('data-tc-reveal')))(r);
    }
  };
  const boot = window.tcBoot = { holds: 1, hold() { this.holds++; }, release() { if (--this.holds <= 0) requestAnimationFrame(() => document.documentElement.classList.remove('tc-boot')); } };
  if (!window.__tcInjected) { if (document.readyState === 'loading') addEventListener('DOMContentLoaded', () => boot.release()); else boot.release(); }
})();`;

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: trueclone seed <name> [--force] [--hide-until-boot "<selectors a script rebuilds at boot>"]');
  process.exit(1);
}
const root = siteDir(name);
const ref = path.join(root, 'reference');
const meta = JSON.parse(await fs.readFile(path.join(ref, 'meta.json'), 'utf8'));
const exact = meta.mode === 'exact' && Boolean(meta.permission);
const mirror = path.join(ref, 'mirror');
if (!(await fs.stat(path.join(mirror, 'index.html')).then(() => true, () => false))) {
  console.error(`no mirror yet: run trueclone capture ${meta.url} ${name} --mirror-only`);
  process.exit(1);
}
const clone = path.join(root, 'clone');
// --route-page "/privacy": a separate page of the site (its own document, captured as reference/mirror/routes/<slug>.html),
// seeded by the same pipeline at the clone's root (so every relative path holds), then written to clone/<route>/index.html
// with its relative references re-based for the depth. The captured page's recordings (reveals, widgets, inline values)
// belong to another document and are not used. The main seed runs one of these per separate page.
const routePage = typeof flags['route-page'] === 'string' ? (meta.routes || []).find((r) => r.path === routeArg(flags['route-page'])) : null;
if (typeof flags['route-page'] === 'string' && !routePage) { console.error(`no separate page ${flags['route-page']} in this capture`); process.exit(1); }
const passFile = routePage ? `.page-${routePage.slug}.html` : 'index.html';
const t0 = Date.now();
const step = (msg) => console.log(`seed ${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s  ${msg}`);
// --patches: re-apply clone/patches/ onto the last seed output in a second, without seeding again
if (flags.patches) {
  const base = await fs.readFile(path.join(clone, '.seed-base.html'), 'utf8').catch(() => null);
  if (base === null) { console.error(`no seed output to patch in ${path.relative(process.cwd(), clone)}: run trueclone seed ${name} first`); process.exit(1); }
  const { html: patched, applied } = await applyPatches(base);
  await fs.writeFile(path.join(clone, 'index.html'), patched);
  for (const r of (meta.routes || []).filter((x) => x.slug && !x.sameDocument)) {
    const pageBase = await fs.readFile(path.join(clone, `.seed-base-${r.slug}.html`), 'utf8').catch(() => null);
    if (pageBase === null) continue;
    await fs.mkdir(path.join(clone, ...r.path.split('/').filter(Boolean)), { recursive: true });
    await fs.writeFile(path.join(clone, ...r.path.split('/').filter(Boolean), 'index.html'), rebaseHtml((await applyPatches(pageBase)).html, r.path.split('/').filter(Boolean).length));
  }
  console.log(`patches re-applied onto the last seed (no re-seed): ${applied.join(', ') || 'none in clone/patches/'}`);
  process.exit(0);
}
const exists = await fs.stat(path.join(clone, 'index.html')).then(() => true, () => false);
if (exists && !flags.force && !routePage) {
  console.error(`${path.relative(process.cwd(), clone)} already has an index.html: add --force to seed again (your script.js, patches/ and notes.md are kept), or --patches to only re-apply clone/patches/`);
  process.exit(1);
}
await fs.mkdir(path.join(clone, 'css'), { recursive: true });

// Assets the mirror points at (../assets/... from the page, ../../assets/... from mirror/css) are copied into
// clone/assets and the paths rewritten, so clone/ is self-contained. Template mode only takes fonts; every other
// asset reference becomes the placeholder.
const PLACEHOLDER = 'assets/placeholder.svg';
const PLACEHOLDER_BG = 'assets/placeholder-bg.svg'; // transparent: for CSS backgrounds
const copied = new Set();
const isFont = (rel) => /\.(woff2?|ttf|otf|eot)([?#]|$)/i.test(rel) || /^font\//.test(rel);
const pull = async (rel) => {
  const clean = decodeURIComponent(rel.split(/[?#]/)[0]);
  if (copied.has(clean)) return;
  copied.add(clean);
  const to = path.join(clone, 'assets', clean);
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.copyFile(path.join(ref, 'assets', clean), to).catch(() => console.warn(`WARNING missing asset ${clean}`));
};
// `forPass`: the page's media point at the original files in reference/ for the browser pass only, so images keep
// their intrinsic size (an image laid out by its aspect ratio needs it); the pass replaces them with same-size
// placeholders and a final sweep guarantees no reference path survives.
const REF_ASSETS = '../reference/assets/';
// each url() of a stylesheet, token by token: a quoted value is read whole, so a url(%23n) inside a data: URI is never
// taken for one of its own; @import url() and data: URIs are left as they are
const cssUrlsOf = (css, fn) => css.replace(/(@import\s+)?url\(\s*(?:"([^"]*)"|'([^']*)'|([^'")\s]*))\s*\)/g, (all, imp, d, q, u) => {
  const v = d ?? q ?? u;
  return imp || !v || /^\s*data:/i.test(v) ? all : fn(all, v);
});
const rewrite = async (text, prefix, replacement, forPass = false) => {
  // saved asset names are [a-z0-9._-]; `&` ends a path inside a style attribute (url(&quot;../assets/x.webp&quot;))
  const re = new RegExp(prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + 'assets/([^"\')\\s&]+)', 'g');
  for (const m of text.matchAll(re)) if (exact || isFont(m[1])) await pull(m[1]);
  return text.replace(re, (all, rel) => (exact || isFont(rel) ? `${replacement}assets/${rel}` : forPass ? `${REF_ASSETS}${rel}` : `${replacement}${PLACEHOLDER}`));
};

for (const file of routePage ? [] : await fs.readdir(path.join(mirror, 'css')).catch(() => [])) { // a separate page shares the stylesheets the main seed copied
  const css = await fs.readFile(path.join(mirror, 'css', file), 'utf8');
  let out = await rewrite(css, '../../', '../');
  // template mode: images the capture never downloaded still point at the site (url("https://…/bg.avif"));
  // every non-font url() becomes a transparent placeholder (CSS backgrounds are mostly decorative: noise, grids,
  // glows), so the clone never loads the site's media. url(#id) points inside the page (SVG paint) and stays.
  // An @import keeps its stylesheet (a font's CSS), and a data: URI is read whole: an SVG filter's url(%23n) inside it
  // is part of the image, not a reference.
  if (!exact) out = cssUrlsOf(out, (all, u) => (isFont(u) || u.trim().startsWith('#') ? all : `url("../${PLACEHOLDER_BG}")`));
  await fs.writeFile(path.join(clone, 'css', file), out);
}
step(`stylesheets copied (${exact ? 'exact' : 'template'} mode)`);
let html = await fs.readFile(routePage ? path.join(mirror, 'routes', `${routePage.slug}.html`) : path.join(mirror, 'index.html'), 'utf8');
html = await rewrite(html, '../', '', !exact);
await fs.writeFile(path.join(clone, passFile), html);

if (!exact) {
  // a neutral box that reads on light and dark pages, opaque like the image it stands for (text an image covers on
  // the original stays covered)
  await fs.mkdir(path.join(clone, 'assets'), { recursive: true });
  await fs.writeFile(path.join(clone, PLACEHOLDER), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" preserveAspectRatio="none"><rect width="16" height="16" fill="#8c8c8c"/></svg>\n');
  await fs.writeFile(path.join(clone, PLACEHOLDER_BG), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"/>\n');
}
// Scroll reveals recorded on the reference (trueclone reveals): mark the elements, start them in their recorded
// starting state, and replay the recorded curves with a small player when they scroll into view.
// One file per width when `reveals` ran at every width: elements are matched by path (the same DOM at every width)
// and the player uses the record for the visitor's width, so phone offsets are phone offsets, not desktop pixels.
const recs = {};
for (const v of routePage ? [] : ['desktop', 'tablet', 'mobile']) {
  const r = JSON.parse(await fs.readFile(path.join(ref, `reveals.${v}.json`), 'utf8').catch(() => 'null'));
  if (r) recs[v] = r;
}
const primary = recs.desktop || recs.tablet || recs.mobile || null;
const byPath = (key) => {
  const m = new Map();
  for (const [v, r] of Object.entries(recs)) for (const x of r[key] || []) {
    if (!m.has(x.path)) m.set(x.path, { path: x.path, cls: x.cls });
    m.get(x.path)[v] = x;
  }
  return [...m.values()];
};
const recorded = byPath('reveals');
// Scroll-linked curves (parallax, scrubbed fades) are recorded px at three sizes: replaying them would be right at those
// sizes only. They stay in reference/reveals.<size>.json as evidence; script.js reproduces the rule behind them.
const recordedScrubs = byPath('scrubs');
const scrubbed = [];
const classChanges = primary?.classes || [];
// Widget states recorded on the reference (trueclone widgets): tabs, menus. Template mode only for now: the snapshots
// are placeholdered like the page; exact-mode snapshots would still point at the site's media.
const widgetRec = exact || routePage ? null : JSON.parse(await fs.readFile(path.join(ref, 'widgets.desktop.json'), 'utf8').catch(() => 'null'));
// a group whose recorded states are all the same (an accordion whose click changed nothing the recorder could see)
// has nothing to replay: left out, so no trigger is captured by the player for nothing
const widgetGroups = (widgetRec?.groups || []).filter((g) => g.kind === 'portal' || new Set([...(g.states || []), ...(g.kind === 'expand' ? [g.closed] : [])].filter((s) => s != null)).size > 1);
let marked = 0, classMarked = 0, scrubMarked = 0, widgets = null, runtime = null;
step('browser pass: reveal marks, widgets, runtime clean-up' + (exact ? '' : ', placeholder text and media'));
({ html, marked, classMarked, scrubMarked, widgets, runtime } = await browserPass(!exact, recorded, classChanges, widgetGroups, scrubbed));
if (!exact) html = html.split(REF_ASSETS).join('__tc_ref__').replace(/__tc_ref__[^"')\s]+/g, PLACEHOLDER);
// template mode never loads the site's media: what still points at the network (a <template>'s images, a lazy
// loader's data-* source, a source the capture could not save) becomes the placeholder too
const REMOTE_MEDIA = /^(?:https?:)?\/\/[^\s"']+\.(?:png|jpe?g|gif|webp|avif|svg|bmp|ico|mp4|webm|mov|m4v)(?:[?#][^\s"']*)?$/i;
if (!exact) html = html.replace(/(\s(?:src|poster|srcset|data-[\w-]+))=("|')([^"']+)\2/gi, (all, a, q, v) => (v.split(',').some((part) => REMOTE_MEDIA.test(part.trim().split(/\s+/)[0])) ? `${a}=${q}${PLACEHOLDER}${q}` : all));
if (widgets?.groups.length) {
  // a plain script (not fetched JSON), so the clone also works opened from disk
  await fs.writeFile(path.join(clone, 'trueclone-widgets.js'), `// trueclone widget player: recorded states of the reference's tabs and menus (trueclone widgets), placeholdered.\nwindow.__tcWidgetData = ${JSON.stringify(widgets)};\n(${widgetPlayer.toString()})();\n`);
  html = html.replace(/<\/body>/i, '<script src="trueclone-widgets.js" defer></script>\n</body>');
}
if (marked || classMarked || scrubMarked) {
  await fs.writeFile(path.join(clone, 'trueclone-reveals.js'), PLAYER);
  const perWidth = (r, shape) => Object.fromEntries(['desktop', 'tablet', 'mobile'].filter((v) => r[v]).map((v) => [v, shape(r[v])]));
  const data = JSON.stringify({
    reveals: recorded.map((r) => perWidth(r, ({ trigger, duration, frames, to, from }) => ({ trigger, duration, frames, to, from }))),
    scrubs: [],
    breakpoints: JSON.parse(await fs.readFile(path.join(ref, 'inline-styles.json'), 'utf8').catch(() => '{}')).breakpoints || [],
    sizes: VIEWPORTS.map((v) => ({ name: v.name, width: v.width })),
    classes: classChanges.map(({ from, to, back, sticky, reverts, threshold, trigger }) => ({ from, to, back, sticky, reverts, threshold, trigger })),
  });
  html = html.replace(/<\/body>/i, `<script type="application/json" id="tc-reveals">${data}</script>\n<script src="trueclone-reveals.js" defer></script>\n</body>`);
}
// Boot contract: <html class="tc-boot"> from the first byte until every clone script has run (the reveal player drops
// it after DOMContentLoaded; the Next app after its last script). Regions a script builds or re-lays out at boot
// (--hide-until-boot "<selectors>") stay invisible meanwhile, so a visitor never sees their captured, pre-script state;
// a 3 s failsafe shows everything if no script ever runs.
html = html.replace(/<html\b([^>]*)>/i, (all, attrs) => (/\bclass=/.test(attrs) ? `<html${attrs.replace(/\bclass=(["'])([^"']*)\1/, (m, q, v) => `class=${q}${v.trim() ? `${v.trim()} ` : ''}tc-boot${q}`)}>` : `<html${attrs} class="tc-boot">`));
html = html.replace(/<\/head>/i, () => `<style id="tc-boot-styles">/* trueclone seed: boot contract */@keyframes tc-boot-failsafe{to{visibility:visible}}html.tc-boot [data-tc-boot-hide]{visibility:hidden;animation:tc-boot-failsafe 0s 3s forwards}</style>\n<script id="tc-runtime">${RUNTIME}</script>\n</head>`);
// the clone's own behaviour script, loaded once the DOM is parsed
if (!/<script[^>]+src="script\.js"/.test(html)) html = html.replace(/<\/body>/i, '<script src="script.js" defer></script>\n</body>');
// the seed's own output, kept so `seed --patches` can re-apply clone/patches/ onto it in a second
await fs.writeFile(path.join(clone, routePage ? `.seed-base-${routePage.slug}.html` : '.seed-base.html'), html);
const { html: patchedHtml, applied: patches } = await applyPatches(html);
html = patchedHtml;
if (routePage) {
  const parts = routePage.path.split('/').filter(Boolean);
  await fs.mkdir(path.join(clone, ...parts), { recursive: true });
  await fs.writeFile(path.join(clone, ...parts, 'index.html'), rebaseHtml(html, parts.length));
  await fs.rm(path.join(clone, passFile), { force: true });
  console.log(`seeded ${routePage.path}: clone/${parts.join('/')}/index.html (a separate page of the site)`);
  process.exit(0);
}
await fs.writeFile(path.join(clone, 'index.html'), html);
step('index.html written');

// notes.md: the agent's record, with the sections the report reads back (Findings, Accepted differences). Written once.
const notesFile = path.join(root, 'notes.md');
if (!(await fs.stat(notesFile).then(() => true, () => false))) {
  await fs.writeFile(notesFile, `# ${name}: clone notes

Reference: ${meta.url}. Mode: ${exact ? `exact (permission: ${meta.permission})` : 'template'}. Captured ${meta.capturedAt}.
Keep every section; the report reads "Findings" and "Accepted differences" back. One line per entry, no prose.

## Stack

<!-- what the reference is built with: platform, libraries and versions, fonts, breakpoints (from motion.*.md, reference/code.md, the HAR) -->

## Behaviours

<!-- the motion inventory and the interactions as a list: element, trigger, property, range, timing; one line each -->

## Own-code map

<!-- file -> behaviours it implements -> where its parameters came from (a motion entry, code.md, a measured value) -->

## Findings

<!-- defects in the tool, not in the site: symptom, cause if known, the workaround used. Listed in REPORT.md -->

## Accepted differences

<!-- what cannot or should not match, one per line: "<check> <width> <where>: <why>" (random motion, a live feed, a
     hover that lands by timing, a third-party embed). Listed first in REPORT.md; a check below target that is covered
     here is marked "accepted" there. Every entry needs the why. -->

## Unknowns

<!-- what you could not determine: a rule you could not read, a value you measured instead of derived -->
`);
}

const scriptFile = path.join(clone, 'script.js');
if (!(await fs.stat(scriptFile).then(() => true, () => false))) {
  await fs.writeFile(scriptFile, `// ${meta.url} - clone behaviour (your own code). Markup and styles come from the mirror${exact ? '' : ' (placeholder content)'}.\n// Rebuild every interaction and reveal from the reference's parameters; verify with npx trueclone score ${name}.\n`);
}
console.log(`seeded ${path.relative(process.cwd(), clone)} from the mirror (${exact ? 'exact: the site\'s own content' : 'template: placeholder text and media'}): index.html, ${(await fs.readdir(path.join(clone, 'css'))).length} stylesheet(s), ${copied.size} asset(s)${exact ? '' : ' (fonts only)'}`);
if (recorded.length || classChanges.length) console.log(`replayed by trueclone-reveals.js: ${marked}/${recorded.length} one-shot scroll reveals, ${classMarked}/${classChanges.length} scroll class changes (${Object.keys(recs).join(', ') || 'no'} sizes recorded)${marked < recorded.length || classMarked < classChanges.length ? ' (the rest did not resolve to an element in the mirror)' : ''}`);
if (recordedScrubs.length) console.log(`not replayed: ${recordedScrubs.length} scroll-linked curve(s) (parallax, scrubbed fades): evidence in reference/reveals.<size>.json; script.js reproduces the rule behind them`);
if (runtime) {
  const pins = runtime.pins.map((p) => `${p.el} pinned for ${p.distance}px${p.axis ? ' (sideways: left to script.js)' : ''}`).join(', ');
  console.log(`runtime artefacts cleaned: ${runtime.pins.length} GSAP pin(s) made sticky${pins ? ` (${pins}; data-tc-pin on each)` : ''}, ${runtime.canvases} canvas(es) marked data-tc-runtime="canvas"${runtime.gsap ? `, ${runtime.gsap} GSAP-written transform(s) marked data-tc-gsap (tcOwn() clears them for script.js${runtime.gsapState ? `, except ${runtime.gsapState} closed state(s) marked data-tc-gsap="state", which stay` : ''})` : ''}`);
  if (runtime.viewport) console.log(`viewport values: ${runtime.viewport.fitted} value(s) a script computes from the screen size carried as functions of it (read at ${runtime.viewport.sizes} sizes, site breakpoints ${runtime.viewport.breakpoints.join('/') || 'none'})${runtime.viewport.dropped ? `; ${runtime.viewport.dropped} fit no such function and are left to script.js (data-tc-script-owned, reference/script-owned.json)` : ''}`);
  if (runtime.hidden) console.log(`boot contract: ${runtime.hidden} element(s) hidden until the clone's scripts have run (data-tc-boot-hide)`);
}
const sameState = (widgetRec?.groups || []).length - widgetGroups.length;
if (widgetGroups.length || sameState) console.log(`replayed by trueclone-widgets.js: ${widgets?.groups.filter(Boolean).length || 0}/${widgetGroups.length} widgets (${widgets?.states || 0} recorded states)${sameState ? `; ${sameState} left out (one recorded state: nothing to replay)` : ''}${widgetRec?.portals?.length ? `; not replayed (portal popovers): ${widgetRec.portals.join(', ')}` : ''}`);
if (patches.length) console.log(`patches applied from clone/patches/: ${patches.join(', ')}`);
// every separate page of the site, by the same pipeline (one child run each)
const ownPages = (meta.routes || []).filter((r) => r.slug && !r.sameDocument && fsSync.existsSync(path.join(mirror, 'routes', `${r.slug}.html`)));
for (const r of ownPages) {
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), name, '--route-page', r.path, ...(typeof flags['hide-until-boot'] === 'string' ? ['--hide-until-boot', flags['hide-until-boot']] : [])], { cwd: process.cwd(), encoding: 'utf8' });
  console.log((child.stdout || '').split('\n').filter((l) => l.startsWith('seeded ')).join('\n') || `WARNING ${r.path} not seeded: ${(child.stderr || '').split('\n')[0]}`);
}
console.log(`next: write clone/script.js (behaviour), then npx trueclone score ${name}`);

// ---------- One browser pass over the seeded page: placeholders (template mode) and reveal marks ----------
async function browserPass(template, reveals, classes, groups = [], scrubs = []) {
  // served from sites/<name>/ so the pass can reach reference/assets (see `forPass`)
  const server = await serve(root);
  const browser = await openBrowser(flags.cdp);
  try {
    const { page } = await newPage(browser, VIEWPORTS.find((v) => v.name === 'desktop'), {});
    await page.goto(`${server.url}clone/${passFile}`, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    // the site's own links point at the clone's routes: an address on the site's host becomes a path (/about), in
    // both modes, so a visitor of the clone stays in the clone (the local server and the Next app answer every route)
    const localised = await page.evaluate(localLinksInPage, new URL(meta.finalUrl || meta.url).host);
    if (localised) console.log(`links: ${localised} link(s) to the site's own pages now point at the clone's routes`);
    const counts = reveals.length || classes.length || scrubs.length ? await page.evaluate(markRevealsInPage, [reveals, classes, scrubs]) : [0, 0, 0];
    // widgets: mark regions and triggers, then give every recorded state the same placeholders as the page by
    // placing it into its region (so it is laid out and measured for real) and reading it back
    let widgets = null;
    if (groups.length) {
      step(`widgets: ${groups.length} recorded, placing each state`);
      const ok = await page.evaluate(markWidgetsInPage, groups);
      await page.evaluate(`window.__tcPlaceholders = ${placeholdersInPage.toString()}`);
      widgets = { groups: [], states: 0 };
      for (const g of groups) {
        if (!ok[g.i]) continue;
        const shape = (stateHtml) => (stateHtml == null ? null : page.evaluate(([i, h, lorem, t]) => {
          const scope = document.querySelector(`[data-tc-scope~="${i}"]`);
          if (!scope) return null;
          const before = scope.innerHTML;
          scope.innerHTML = h;
          const out = t ? window.__tcPlaceholders([lorem, `[data-tc-scope~="${i}"]`]) : scope.innerHTML;
          scope.innerHTML = before;
          return out;
        }, [g.i, stateHtml, LOREM, template]));
        const states = [];
        for (const st of g.states) states.push(await shape(st));
        const closed = g.kind === 'expand' ? await shape(g.closed) : undefined;
        widgets.states += states.filter(Boolean).length;
        widgets.groups[g.i] = { kind: g.kind, states, closed };
      }
      widgets.groups = Array.from(widgets.groups, (x) => x || null);
    }
    if (template) {
      step('template placeholders: measuring every text run (the longest part on a big page)');
      await page.evaluate(placeholdersInPage, [LOREM, null]);
      step('placeholders done');
    }
    // last, because the recorded paths above were taken on the live page, pin-spacers included
    const runtime = await page.evaluate(cleanRuntimeInPage);
    // regions the clone's script builds at boot, hidden until it has run (see the boot contract below)
    runtime.hidden = typeof flags['hide-until-boot'] === 'string'
      ? await page.evaluate((sels) => { let n = 0; for (const s of sels) for (const el of document.querySelectorAll(s)) { el.setAttribute('data-tc-boot-hide', ''); n++; } return n; }, flags['hide-until-boot'].split(',').map((s) => s.trim()).filter(Boolean))
      : 0;
    // inline styles that differ between widths (script-computed sizes and offsets) become media-query rules
    // inline styles a script set: functions of the viewport where they are, left to script.js where they aren't
    const inlineStyles = JSON.parse(await fs.readFile(path.join(ref, 'inline-styles.json'), 'utf8').catch(() => 'null'));
    if (inlineStyles && !routePage) { // read on the captured page: its paths mean nothing in another document
      const { plan, owned, fitted, sizes, breakpoints } = planInlineStyles(inlineStyles, VIEWPORTS);
      const applied = await page.evaluate(applyInlineStylePlanInPage, plan);
      runtime.viewport = { fitted, sizes, breakpoints, elements: applied.elements, dropped: applied.dropped };
      await fs.writeFile(path.join(ref, 'script-owned.json'), JSON.stringify({ note: 'inline values a script computes that are not a function of the screen size: script.js must compute them, as the site does', owned: owned.filter((o) => applied.droppedPaths.includes(o.path)) }, null, 2));
    }
    // getHTML keeps the declarative shadow roots the capture serialised (outerHTML would drop them); it is the inner
    // HTML, so the <html> tag and its attributes (font classes, dark mode, lang) are written back around it
    const out = await page.evaluate(() => {
      const el = document.documentElement;
      const inner = el.getHTML ? el.getHTML({ serializableShadowRoots: true }) : el.innerHTML;
      const attrs = [...el.attributes].map((a) => ` ${a.name}="${a.value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`).join('');
      return `<html${attrs}>${inner}</html>`;
    });
    return { html: `<!DOCTYPE html>\n${out}`, marked: counts[0], classMarked: counts[1], scrubMarked: counts[2], widgets, runtime };
  } finally {
    if (!flags.cdp) await browser.close();
    server.close();
  }
}

// The path of element children recorded by reveals.mjs (script/style/meta-like tags skipped) resolves to the same
// element in the script-free mirror. Each reveal gets data-tc-reveal and its recorded starting state inline; each
// scroll class change gets data-tc-class and its starting classes (the page as it is before any scroll).
// Widget regions and triggers, resolved by the recorded paths in the mirror (which shows each widget's initial
// state). A region can serve several widgets (every menu of a nav): data-tc-scope holds a space-separated list.
function markWidgetsInPage(groups) {
  const SKIP = new Set(['SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'STYLE', 'LINK', 'META']);
  const resolve = (p) => {
    let el = document.body;
    for (const part of p.split('>')) {
      const [tag, n] = part.split(':');
      el = [...el.children].filter((c) => !SKIP.has(c.tagName))[Number(n) - 1];
      if (!el || el.tagName.toLowerCase() !== tag) return null;
    }
    return el;
  };
  const ok = {};
  for (const g of groups) {
    // a dialog or listbox (kind "portal") gets an empty host of its own at the end of <body>: the recorded element is
    // shown there when its trigger is clicked
    let scope;
    if (g.kind === 'portal') {
      scope = document.createElement('div');
      scope.setAttribute('data-tc-portal', String(g.i));
      document.body.appendChild(scope);
    } else scope = g.scopePath ? resolve(g.scopePath) : null;
    const triggers = g.triggers.map((t) => resolve(t.path));
    if (!scope || triggers.some((t) => !t)) continue;
    const ids = (scope.getAttribute('data-tc-scope') || '').split(' ').filter(Boolean);
    ids.push(String(g.i));
    scope.setAttribute('data-tc-scope', ids.join(' '));
    triggers.forEach((t, j) => t.setAttribute('data-tc-trigger', `${g.i}:${j}`));
    ok[g.i] = true;
  }
  return ok;
}

// Widget player shipped with the clone (trueclone's own code, serialised into clone/trueclone-widgets.js): a click on
// a trigger swaps its region to the recorded state; an expandable trigger toggles between its open and closed state;
// menus in a header or nav also open on hover and close when the pointer leaves their region, like the reference.
function widgetPlayer() {
  const data = window.__tcWidgetData || { groups: [] };
  const regionOf = (i) => document.querySelector(`[data-tc-scope~="${i}"]`);
  // a region script.js took over (tcOwn / data-tc-own), or one holding anything it took over, is never rewritten by
  // the recorded states: writing the region's markup would drop script.js's elements and their listeners
  const show = (i, html) => { const r = regionOf(i); if (r && !r.closest('[data-tc-own]') && !r.querySelector('[data-tc-own]') && html != null && r.innerHTML !== html) r.innerHTML = html; };
  const parse = (t) => t.dataset.tcTrigger.split(':').map(Number);
  // a dialog trigger says whether its dialog is open, as the original's does (aria-expanded, and data-state where
  // the component library uses it)
  const setOpen = (t, open) => {
    t.setAttribute('aria-expanded', String(open));
    if (t.hasAttribute('data-state')) t.setAttribute('data-state', open ? 'open' : 'closed');
  };
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tc-trigger]');
    // a click script.js already handled (it called preventDefault) is its own
    if (!t || e.defaultPrevented || t.closest('[data-tc-own]')) return;
    const [i, j] = parse(t);
    const g = data.groups[i];
    if (!g) return;
    e.preventDefault();
    if (g.kind === 'tabs') show(i, g.states[j]);
    else if (g.kind === 'portal') { const r = regionOf(i); setOpen(t, !(r && r.innerHTML)); show(i, r && r.innerHTML ? '' : g.states[0]); }
    else show(i, t.getAttribute('aria-expanded') === 'true' ? g.closed : g.states[j]);
  });
  // an open dialog closes like the original's: Escape, its close button, or a click on the backdrop around it
  const closePortals = () => {
    for (const [i, g] of data.groups.entries()) {
      if (!g || g.kind !== 'portal') continue;
      show(i, '');
      for (const t of document.querySelectorAll(`[data-tc-trigger^="${i}:"]`)) setOpen(t, false);
    }
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePortals(); });
  document.addEventListener('click', (e) => {
    const host = e.target.closest('[data-tc-portal]');
    if (!host || !host.innerHTML) return;
    const closeBtn = e.target.closest('[aria-label*="close" i], [aria-label*="dismiss" i], [data-dismiss], .close');
    if (closeBtn || !e.target.closest('[role="dialog"], [role="listbox"], dialog')) { e.preventDefault(); closePortals(); }
  });
  const hoverMenu = (t) => t.closest('header, nav') && data.groups[parse(t)[0]]?.kind === 'expand';
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest('[data-tc-trigger]');
    if (!t || !hoverMenu(t) || t.getAttribute('aria-expanded') === 'true') return;
    const [i, j] = parse(t);
    show(i, data.groups[i].states[j]);
  });
  // only a menu that opens on hover closes when the pointer leaves it; an accordion in the page stays as clicked
  document.addEventListener('pointerout', (e) => {
    for (const [i, g] of data.groups.entries()) {
      if (!g || g.kind !== 'expand') continue;
      const r = regionOf(i);
      if (!r || !r.contains(e.target) || r.contains(e.relatedTarget)) continue;
      const open = r.querySelector(`[data-tc-trigger^="${i}:"][aria-expanded="true"]`);
      if (open && hoverMenu(open)) show(i, g.closed);
    }
  });
}

function markRevealsInPage([reveals, classes, scrubs = []]) {
  const SKIP = new Set(['SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'STYLE', 'LINK', 'META']);
  const resolve = (p) => {
    let el = document.body;
    for (const part of p.split('>')) {
      const [tag, n] = part.split(':');
      const kids = [...el.children].filter((c) => !SKIP.has(c.tagName));
      el = kids[Number(n) - 1];
      if (!el || el.tagName.toLowerCase() !== tag) return null;
    }
    return el;
  };
  // each reveal's starting state is a rule on its mark (no flash before the player runs; the player then applies the
  // visitor's width); script.js hands an element over by removing the mark, which releases the state with it
  const rules = [];
  let count = 0;
  reveals.forEach((r, i) => {
    const el = resolve(r.path);
    if (!el) return;
    const rec = r.desktop || r.tablet || r.mobile || r;
    el.setAttribute('data-tc-reveal', String(i));
    rules.push(`[data-tc-reveal="${i}"]{opacity:${rec.from.o};transform:translate(${rec.from.tx}px, ${rec.from.ty}px) scale(${rec.from.s})${rec.from.blur ? `;filter:blur(${rec.from.blur}px)` : ''}${rec.from.clip && rec.from.clip !== 'none' ? `;clip-path:${rec.from.clip}` : ''}}`);
    count++;
  });
  if (rules.length) {
    document.getElementById('tc-reveal-styles')?.remove();
    const style = document.createElement('style');
    style.id = 'tc-reveal-styles';
    style.textContent = `/* trueclone seed: starting states of recorded scroll reveals (desktop); trueclone-reveals.js plays them */\n${rules.join('\n')}\n`;
    document.head.appendChild(style);
  }
  let classCount = 0;
  classes.forEach((c, i) => {
    const el = resolve(c.path);
    if (!el) return;
    el.setAttribute('data-tc-class', String(i));
    if (c.from !== null && c.from !== undefined) el.setAttribute('class', c.from);
    classCount++;
  });
  let scrubCount = 0;
  scrubs.forEach((s, i) => {
    const el = resolve(s.path);
    if (!el) return;
    el.setAttribute('data-tc-scrub', String(i));
    scrubCount++;
  });
  return [count, classCount, scrubCount];
}

// The plan from viewport-fit.mjs, applied to the page: fitted values replace the captured constants inline; per-range
// values become media rules whose selector is stacked to the precedence an inline style had over the stylesheets
// (without !important, so a value script.js writes inline later still wins); values no function fits are removed and
// left to script.js. A pin spacer's distance becomes its --tc-pin. Motion properties of elements the reveal player
// drives, and the pin geometry the seed removed, are left alone.
function applyInlineStylePlanInPage(plan) {
  const SKIP = new Set(['SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'STYLE', 'LINK', 'META']);
  const resolve = (p) => {
    let el = document.body;
    for (const part of p.split('>')) {
      const [tag, n] = part.split(':');
      const kids = [...el.children].filter((c) => !SKIP.has(c.tagName));
      el = kids[Number(n) - 1];
      if (!el || el.tagName.toLowerCase() !== tag) return null;
    }
    return el;
  };
  const MOTION = new Set(['transform', 'translate', 'rotate', 'scale', 'opacity', 'filter']);
  const PIN = new Set(['translate', 'rotate', 'scale', 'inset', 'top', 'left', 'right', 'bottom', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'max-width', 'width', 'max-height', 'height', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'box-sizing', 'position', 'transform', 'flex-basis']);
  // the bottom (or right) length of a padding shorthand, calc() kept whole
  const splitTop = (v) => { const out = []; let depth = 0, cur = ''; for (const ch of String(v)) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ' ' && !depth) { if (cur) out.push(cur); cur = ''; } else cur += ch; } if (cur) out.push(cur); return out; };
  const pinOf = (prop, v) => { if (prop === 'padding-bottom') return v; if (prop !== 'padding') return null; const t = splitTop(v); return t[2] ?? t[0]; };
  const rules = [];
  const sel = (i) => `[data-tc-w="${i}"]`.repeat(8); // (0,8,0): above any ordinary author rule, below inline
  let count = 0, dropped = 0;
  const droppedPaths = [];
  for (const [p, entry] of Object.entries(plan)) {
    const el = resolve(p);
    if (!el) continue;
    const i = count;
    let used = false;
    if (el.hasAttribute('data-tc-pin-spacer')) {
      // the spacer's padding was the pin distance: it is the tail's height now (--tc-pin)
      for (const [k, v] of Object.entries(entry.inline)) { const d = v && pinOf(k, v); if (d) { el.style.setProperty('--tc-pin', d); used = true; } }
      for (const r of entry.rules) { const d = pinOf(r.prop, r.value); if (d) { rules.push(`@media ${r.media} { ${sel(i)} { --tc-pin: ${d} } }`); used = true; } }
      if (used) { el.setAttribute('data-tc-w', String(i)); count++; }
      continue;
    }
    const skip = (k) => (el.hasAttribute('data-tc-runtime') && (PIN.has(k) || k === 'width' || k === 'height')) || ((el.hasAttribute('data-tc-reveal') || el.hasAttribute('data-tc-scrub')) && MOTION.has(k));
    for (const [k, v] of Object.entries(entry.inline)) {
      if (skip(k)) continue;
      el.style.removeProperty(k);
      if (v !== null) el.style.setProperty(k, v);
      used = true;
    }
    const mine = entry.rules.filter((r) => !skip(r.prop));
    for (const r of mine) rules.push(`@media ${r.media} { ${sel(i)} { ${r.prop}: ${r.value} } }`);
    const lost = entry.dropped.filter((k) => !skip(k));
    if (lost.length) { dropped += lost.length; droppedPaths.push(p); el.setAttribute('data-tc-script-owned', lost.join(' ')); }
    if (mine.length) { el.setAttribute('data-tc-w', String(i)); count++; }
    if (!el.getAttribute('style')) el.removeAttribute('style');
    if (used || mine.length || lost.length) { /* counted */ }
  }
  document.getElementById('tc-width-styles')?.remove();
  const style = document.createElement('style');
  style.id = 'tc-width-styles';
  // --tc-vw: 1% of the layout width with a classic scrollbar left out, as the site's scripts measure it; the
  // tc-vw script below keeps it exact, and 1vw stands in without it
  style.textContent = `/* trueclone seed: values the site's scripts compute from the screen size, as functions of it (viewport-fit) */\n:root { --tc-vw: 1vw }\n[data-tc-pin-tail] { height: var(--tc-pin, 0px) }\n${rules.join('\n')}\n`;
  document.head.appendChild(style);
  if (!document.getElementById('tc-vw')) {
    const s = document.createElement('script');
    s.id = 'tc-vw';
    s.textContent = "(()=>{const r=document.documentElement,set=()=>r.style.setProperty('--tc-vw',r.clientWidth/100+'px');set();new ResizeObserver(set).observe(r)})();";
    document.head.appendChild(s);
  }
  return { elements: Object.keys(plan).length, rules: rules.length, dropped, droppedPaths };
}


// The mirror is a snapshot taken after the site's scripts ran, so it carries what they left in the DOM: GSAP's
// pin-spacer wrappers and the pin's inline geometry (fixed desktop pixels that break every other width), and canvas
// buffer sizes set for one viewport. A pin is a sticky element inside a spacer, which CSS does natively: the seed
// keeps the spacer as a plain block with the pin distance as padding (`data-tc-pin-spacer`), makes the element
// sticky, and records the distance on it (`data-tc-pin`), so layout and scroll states hold without a script. The
// clone's script may take the pin over (unwrap the spacer, drop the sticky style) and draws the marked canvases.
// Links to the site's own pages (absolute on its host, or root-relative) become paths, so they open the clone's route.
function localLinksInPage(siteHost) {
  const host = String(siteHost).replace(/^www\./, '');
  let n = 0;
  for (const a of document.querySelectorAll('a[href]')) {
    const h = a.getAttribute('href');
    if (!/^https?:\/\//i.test(h) && !h.startsWith('//')) continue; // relative already
    let u;
    try { u = new URL(h, location.href); } catch { continue; }
    if (u.host.replace(/^www\./, '') !== host || /\.(pdf|png|jpe?g|gif|svg|webp|zip|mp4|xml|txt)$/i.test(u.pathname)) continue;
    a.setAttribute('href', `${u.pathname}${u.search}${u.hash}`);
    n++;
  }
  return n;
}

function cleanRuntimeInPage() {
  const log = { pins: [], canvases: 0, gsap: 0 };
  // the measuring unroll (lib.mjs) is the instruments', never the page's: a capture made before 0.5 kept its mark
  document.getElementById('tc-unroll')?.remove();
  for (const el of [document.documentElement, ...document.querySelectorAll('[data-tc-unroll]')]) el.removeAttribute('data-tc-unroll');
  const label = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.classList.length ? `.${[...el.classList].slice(0, 2).join('.')}` : ''}`;
  // what ScrollTrigger writes on the pinned element while pinning (its own values live in the stylesheet)
  const PIN_PROPS = ['translate', 'rotate', 'scale', 'inset', 'top', 'left', 'right', 'bottom', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'max-width', 'width', 'max-height', 'height', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'box-sizing', 'position', 'transform', 'flex-basis'];
  // what the spacer copied from the element so the parent's flex/grid layout holds: kept; its geometry: dropped
  const SPACER_KEEP = new Set(['order', 'place-self', 'grid-area', 'grid-column', 'grid-row', 'float', 'flex-shrink', 'flex-grow', 'flex-basis', 'display', 'align-self', 'justify-self']);
  for (const spacer of document.querySelectorAll('.pin-spacer')) {
    const pinned = spacer.firstElementChild;
    const horizontal = !spacer.style.paddingBottom && !!spacer.style.paddingRight;
    const distance = Math.round(parseFloat(horizontal ? spacer.style.paddingRight : spacer.style.paddingBottom) || 0);
    if (!pinned) { spacer.replaceWith(...spacer.childNodes); continue; }
    for (const p of PIN_PROPS) pinned.style.removeProperty(p);
    pinned.setAttribute('data-tc-runtime', 'pin');
    pinned.setAttribute('data-tc-pin', String(distance));
    const keep = [...spacer.style].filter((p) => SPACER_KEEP.has(p)).map((p) => `${p}: ${spacer.style.getPropertyValue(p)}`);
    spacer.removeAttribute('class');
    spacer.setAttribute('data-tc-pin-spacer', String(distance));
    if (horizontal) {
      // a sideways pin (a horizontal scroller) is script territory: the spacer keeps its layout role, script.js pins
      spacer.setAttribute('style', keep.join('; '));
      log.pins.push({ el: label(pinned), distance, axis: 'x' });
      continue;
    }
    // A sticky element travels within its parent's content box, never into its padding: the spacer holds the pinned
    // element and a tail block as tall as the pin distance (--tc-pin, a function of the viewport when the site's is),
    // so the element stays stuck for exactly that long and then scrolls away, like the original.
    pinned.style.position = 'sticky';
    pinned.style.top = '0px';
    spacer.setAttribute('style', `${keep.join('; ')}${keep.length ? '; ' : ''}--tc-pin: ${distance}px`);
    const tail = document.createElement('div');
    tail.setAttribute('data-tc-pin-tail', '');
    tail.setAttribute('aria-hidden', 'true');
    pinned.after(tail);
    log.pins.push({ el: label(pinned), distance });
  }
  // a canvas keeps its buffer size: with only a CSS width, the height follows the buffer's aspect ratio, and the
  // clone's own scene sets the buffer it needs; the mark says a script draws here
  for (const c of document.querySelectorAll('canvas')) {
    c.setAttribute('data-tc-runtime', 'canvas');
    log.canvases++;
  }
  // GSAP's signature: it writes translate/rotate/scale: none next to the transform it sets. That transform is the
  // animation's state, not the page's: GSAP in the clone has no record of having written it and reads it back as
  // pixels, so a script.js that animates the element again (xPercent: -50) would centre it twice. Marked (last, after
  // the pin clean-up removed what pinning wrote); tcOwn() clears it, so the clone's script starts from the page as it
  // was before any script ran.
  // Except a state: a transform that hides the element (a closed menu at scale(1, 0), a drawer moved out of the page or
  // out of the box that clips it, where it would show without the transform) is how the page looks closed, which the
  // site's script set at start; clearing it would open the menu over the page. Marked "state", never cleared.
  const clipOf = (el) => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (s.overflowX !== 'visible' || s.overflowY !== 'visible') return a.getBoundingClientRect(); } return null; };
  const meets = (r, b) => r.right > b.left && r.left < b.right && r.bottom > b.top && r.top < b.bottom;
  const pageBox = { left: -scrollX, top: -scrollY, right: document.documentElement.scrollWidth - scrollX, bottom: document.documentElement.scrollHeight - scrollY };
  for (const el of document.querySelectorAll('[style*="translate: none"][style*="rotate: none"][style*="scale: none"]')) {
    if (!/(^|;)\s*transform\s*:/.test(el.getAttribute('style'))) continue;
    const moved = el.getBoundingClientRect();
    const t = el.style.transform;
    el.style.transform = 'none';
    const home = el.getBoundingClientRect();
    el.style.transform = t;
    const clip = clipOf(el);
    const flat = (moved.width < 0.5 || moved.height < 0.5) && home.width >= 0.5 && home.height >= 0.5;
    const away = (!meets(moved, pageBox) && meets(home, pageBox)) || (clip && !meets(moved, clip) && meets(home, clip));
    el.setAttribute('data-tc-gsap', flat || away ? 'state' : '');
    if (flat || away) log.gsapState = (log.gsapState || 0) + 1;
    log.gsap++;
  }
  return log;
}


function placeholdersInPage([lorem, rootSel]) {
  // the whole page, or one region (a widget's recorded state placed into the page to be measured)
  const root = rootSel ? document.querySelector(rootSel) : document.body;
  if (!root) return null;
  // Each letter run becomes a lorem word of (nearly) the same laid-out width in the element's own font, keeping its
  // capitalisation; the running width is tracked across an element's text so line breaks land where the reference's
  // do (a 2px drift is enough to move a break on a full line). Digits keep their count (years stay), punctuation and
  // whitespace stay exactly as they were.
  //
  // Widths come from layout, not canvas: the reference words are measured with Ranges on the live text, candidates
  // in an isolated box that copies the text style (contain: layout, so measuring never re-lays out the page). All
  // reads happen before any text is written.
  //
  // Speed (a big page has tens of thousands of runs): an element's font is read from its computed style once, and
  // every word list is measured in one layout per font (one block per word), never one forced layout per word.
  const meter = document.createElement('div');
  meter.style.cssText = 'position:absolute;left:-99999px;top:0;white-space:pre;contain:layout style paint;visibility:hidden';
  document.body.appendChild(meter);
  const PROPS = ['fontStyle', 'fontWeight', 'fontSize', 'fontFamily', 'fontStretch', 'fontVariant', 'fontFeatureSettings', 'fontKerning', 'letterSpacing', 'wordSpacing', 'textTransform'];
  // key -> { key, vals, words: Map(word -> width), lists: Map(casing -> {words, widths, sorted}) }; kept on the page
  // across calls (every widget state is shaped by its own call)
  const fonts = window.__tcFonts || (window.__tcFonts = new Map());
  const fontOf = (s) => {
    const vals = PROPS.map((p) => s[p]);
    const key = vals.join('|');
    if (!fonts.has(key)) fonts.set(key, { key, vals, words: new Map(), lists: new Map() });
    return fonts.get(key);
  };
  const measure = (f, list) => { // widths of many words in this font, one layout for all of them
    const todo = [...new Set(list)].filter((w) => !f.words.has(w));
    if (todo.length) {
      meter.textContent = '';
      PROPS.forEach((p, i) => { meter.style[p] = f.vals[i]; });
      const frag = document.createDocumentFragment();
      const blocks = todo.map((w) => { const b = document.createElement('div'); b.style.cssText = 'width:max-content'; b.textContent = w; frag.appendChild(b); return b; });
      meter.appendChild(frag);
      blocks.forEach((b, i) => f.words.set(todo[i], b.getBoundingClientRect().width));
      meter.textContent = '';
    }
    return list.map((w) => f.words.get(w));
  };
  const widthIn = (f, word) => (f.words.has(word) ? f.words.get(word) : measure(f, [word])[0]);
  const casings = {
    caps: (w) => w.toUpperCase(),
    cap: (w) => w[0].toUpperCase() + w.slice(1),
    plain: (w) => w,
  };
  const listFor = (f, casing) => { // the vocabulary in one casing: words, widths, and the same sorted by width
    if (!f.lists.has(casing)) {
      const words = lorem.map(casings[casing]);
      const widths = measure(f, words);
      const sorted = words.map((w, i) => [widths[i], w, lorem[i]]).sort((a, b) => a[0] - b[0]);
      f.lists.set(casing, { words, widths, sorted });
    }
    return f.lists.get(casing);
  };
  const RUN = /([\p{L}\p{N}]+)/u;
  const pick = (f, run, refWidth, state) => {
    if (/^\p{N}+$/u.test(run)) return /^(19|20)\d\d$/.test(run) ? run : run.replace(/\d/g, (d) => String((Number(d) + 3) % 10));
    const caps = run.length > 1 && run === run.toUpperCase() && /\p{L}/u.test(run);
    const cap = !caps && /\p{Lu}/u.test(run[0]);
    const { words, widths, sorted } = listFor(f, caps ? 'caps' : cap ? 'cap' : 'plain');
    const target = refWidth + state.drift;
    let best = null, bestGap = Infinity;
    state.seed = (state.seed * 31 + run.length) % 9973;
    for (let i = 0; i < words.length; i++) {
      const k = (i + state.seed) % words.length;
      const gap = Math.abs(widths[k] - target);
      if (gap < bestGap) { best = words[k]; bestGap = gap; }
    }
    // No single word close enough (a 2px miss moves a line break): try two lorem words joined into one. Still one
    // word, so the break opportunities stay the reference's, but there are ~10^5 widths to choose from.
    if (bestGap > 0.75 && target > 30) {
      const tail = (w) => (caps ? w.toUpperCase() : w); // only the first part carries the capital
      const tries = [];
      for (const [wa, a] of sorted) {
        const need = target - wa;
        if (need < 6) break;
        let lo = 0, hi = sorted.length - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid][0] < need) lo = mid + 1; else hi = mid; }
        for (const k of [lo - 1, lo]) if (sorted[k]) tries.push([Math.abs(wa + sorted[k][0] - target), a + tail(sorted[k][2])]);
      }
      tries.sort((x, y) => x[0] - y[0]);
      const top = tries.slice(0, 12).map((t) => t[1]); // estimates; measure the real compounds (kerning at the join)
      measure(f, top).forEach((w, i) => {
        const gap = Math.abs(w - target);
        if (gap < bestGap) { best = top[i]; bestGap = gap; }
      });
    }
    state.drift = target - widthIn(f, best);
    return best;
  };
  // for attributes (alt, aria-label...): no layout to match, the element's own font is enough
  const shaper = (el) => {
    const f = fontOf(getComputedStyle(el || document.body));
    const state = { drift: 0, seed: 7 };
    return (text) => text.split(RUN).map((run) => (RUN.test(run) && !/^[^\p{L}\p{N}]*$/u.test(run) ? pick(f, run, widthIn(f, run), state) : run)).join('');
  };

  // text nodes: measure every original letter run first (reads only)
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const plan = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!/[\p{L}\p{N}]/u.test(n.textContent) || SKIP.has(n.parentElement?.tagName) || n.parentElement === meter) continue;
    const parts = n.textContent.split(RUN);
    let at = 0;
    const widths = parts.map((part) => {
      const start = at;
      at += part.length;
      if (!/[\p{L}\p{N}]/u.test(part)) return null;
      const r = document.createRange();
      r.setStart(n, start);
      r.setEnd(n, start + part.length);
      const rects = [...r.getClientRects()];
      return rects.reduce((sum, x) => sum + x.width, 0) || null; // a run hidden by display:none measures 0
    });
    plan.push({ n, parts, widths, font: fontOf(getComputedStyle(n.parentElement)) });
  }
  // then choose the words (writes go to the isolated box only), then write all the text
  const states = new Map();
  for (const item of plan) {
    const state = states.get(item.n.parentElement) || { drift: 0, seed: 7 };
    states.set(item.n.parentElement, state);
    item.text = item.parts.map((part, i) => {
      if (!/[\p{L}\p{N}]/u.test(part)) return part;
      return pick(item.font, part, item.widths[i] ?? widthIn(item.font, part), state);
    }).join('');
  }
  for (const item of plan) item.n.textContent = item.text;
  meter.remove();
  // text in attributes people read or hear
  for (const el of root.querySelectorAll('[alt], [title], [aria-label], [placeholder], input[value], [data-text]')) {
    for (const a of ['alt', 'title', 'aria-label', 'placeholder', 'data-text']) if (el.hasAttribute(a) && el.getAttribute(a).trim()) el.setAttribute(a, shaper(el)(el.getAttribute(a)));
    if (el.tagName === 'INPUT' && ['text', 'email', 'search', 'url', 'tel', ''].includes(el.type) && el.value) el.setAttribute('value', shaper(el)(el.value));
  }

  // media: same box, placeholder content, opaque like the image (text an image covers stays covered)
  const box = (w, h) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w) || 16}" height="${Math.round(h) || 16}" viewBox="0 0 16 16" preserveAspectRatio="none"><rect width="16" height="16" fill="#8c8c8c"/></svg>`)}`;
  for (const img of root.querySelectorAll('img')) {
    const r = img.getBoundingClientRect();
    img.setAttribute('src', box(img.naturalWidth || r.width, img.naturalHeight || r.height));
    for (const a of ['srcset', 'sizes', 'data-src', 'data-srcset']) img.removeAttribute(a);
  }
  root.querySelectorAll('picture source, video source, audio source, track').forEach((s) => s.remove());
  for (const v of root.querySelectorAll('video')) {
    const r = v.getBoundingClientRect();
    v.removeAttribute('src');
    v.setAttribute('poster', box(v.videoWidth || r.width, v.videoHeight || r.height));
    v.setAttribute('preload', 'none');
  }
  for (const f of root.querySelectorAll('iframe, embed, object')) f.setAttribute(f.tagName === 'OBJECT' ? 'data' : 'src', 'about:blank');
  // inline SVG: small ones are interface icons and stay; large ones (logos, illustrations) become a same-size box
  for (const svg of root.querySelectorAll('svg')) {
    if (svg.parentElement?.closest('svg')) continue;
    const r = svg.getBoundingClientRect();
    if (r.width <= 48 && r.height <= 48) continue;
    if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${Math.round(r.width) || 16} ${Math.round(r.height) || 16}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    const [, , w, h] = svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
    svg.innerHTML = `<rect width="${w || 16}" height="${h || 16}" fill="#8884"/>`;
  }
  for (const el of root.querySelectorAll('[style*="url("]')) el.setAttribute('style', el.getAttribute('style').replace(/url\((['"]?)(?!data:)[^)'"]+\1\)/g, 'url("assets/placeholder.svg")'));

  // links, forms and brand metadata
  // the site's own routes stay links (made local by localLinksInPage); links elsewhere go nowhere
  root.querySelectorAll('a[href]').forEach((a) => { const h = a.getAttribute('href'); if (!h.startsWith('#') && !(h.startsWith('/') && !h.startsWith('//'))) a.setAttribute('href', '#'); });
  root.querySelectorAll('form').forEach((f) => f.setAttribute('action', '#'));
  if (root !== document.body) return root.innerHTML;
  document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"], meta[name="description"], meta[name="keywords"], meta[name="author"], meta[name="application-name"], meta[name="generator"], meta[name="apple-mobile-web-app-title"], link[rel="author"], link[rel="preconnect"], link[rel="dns-prefetch"], link[rel="preload"][as="image"], link[rel="prefetch"], link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"], link[rel="canonical"], link[rel="alternate"], script[type="application/ld+json"]').forEach((m) => m.remove());
  document.title = shaper(null)(document.title);
  return document.documentElement.outerHTML;
}

// Patches: what a clone needs on top of the seed lives in clone/patches/ and is applied on every seed (and alone with
// `seed --patches`), so the generated index.html is never edited by hand and a re-seed never loses a fix. In name order:
//   head-*.html  inserted before </head>        (meta, preloads, extra stylesheet links)
//   *.css        linked before </head>          (after the site's stylesheets, so they win ties)
//   body-*.html  inserted before the clone's own <script src="script.js"> (vendor libraries, a hand-over prelude)
//   *.js         <script src defer> before script.js (runs after the players, before script.js)
async function applyPatches(html) {
  const patchDir = path.join(root, 'clone', 'patches');
  const applied = (await fs.readdir(patchDir).catch(() => [])).filter((f) => /\.(html|css|js)$/i.test(f)).sort();
  const beforeScript = (s) => (/<script[^>]+src="script\.js"/.test(html) ? html.replace(/<script[^>]+src="script\.js"[^>]*><\/script>/i, (tag) => `${s}\n${tag}`) : html.replace(/<\/body>/i, `${s}\n</body>`));
  for (const f of applied) {
    if (/^head-.*\.html$/i.test(f)) html = html.replace(/<\/head>/i, `${await fs.readFile(path.join(patchDir, f), 'utf8')}\n</head>`);
    else if (/\.css$/i.test(f)) html = html.replace(/<\/head>/i, `<link rel="stylesheet" href="patches/${f}">\n</head>`);
    else if (/\.html$/i.test(f)) html = beforeScript(await fs.readFile(path.join(patchDir, f), 'utf8'));
    else if (/\.js$/i.test(f)) html = beforeScript(`<script src="patches/${f}" defer></script>`);
  }
  return { html, applied };
}

// A page written below the clone's root (clone/privacy/index.html): its relative references (assets/x, css/x,
// script.js, patches/x) gain one "../" per level, so they reach the same files. Root-relative (/x), absolute, data:,
// and in-page (#x) references are left as they are.
function rebaseHtml(html, depth) {
  if (!depth) return html;
  const up = '../'.repeat(depth);
  const fix = (u) => (/^(?:[a-z][a-z0-9+.-]*:|\/|#|\?)/i.test(u.trim()) || !u.trim() ? u : up + u.trim());
  return html
    .replace(/\s(src|href|poster|data-src)=("|')([^"']*)\2/gi, (all, a, q, u) => ` ${a}=${q}${fix(u)}${q}`)
    .replace(/\s(srcset|data-srcset)=("|')([^"']*)\2/gi, (all, a, q, list) => ` ${a}=${q}${list.split(',').map((part) => { const [u, ...rest] = part.trim().split(/\s+/); return [fix(u), ...rest].join(' '); }).join(', ')}${q}`)
    .replace(/url\((['"]?|&quot;)([^'")&]+)\1\)/g, (all, q, u) => `url(${q}${fix(u)}${q})`);
}
