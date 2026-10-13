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
import { parseArgs, openBrowser, newPage, serve, VIEWPORTS } from './lib.mjs';

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

// The player's width classes (see PLAYER) as media queries: the same three widths the reference was captured at.
const WIDTH_MEDIA = { desktop: '(min-width: 1100px)', tablet: '(min-width: 600px) and (max-width: 1099px)', mobile: '(max-width: 599px)' };

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
  const vpName = innerWidth >= 1100 ? 'desktop' : innerWidth >= 600 ? 'tablet' : 'mobile';
  const pick = (entry) => (entry && (entry.desktop || entry.tablet || entry.mobile) ? entry[vpName] || entry.desktop || entry.tablet || entry.mobile : entry);

  // class changes are state, not motion: they apply with reduced motion too
  let scrolled = false;
  const pinned = [];
  for (const el of document.querySelectorAll('[data-tc-class]')) {
    const c = classData[Number(el.dataset.tcClass)];
    if (!c) continue;
    if (c.sticky) { pinned.push([el, c]); continue; }
    const line = Math.max(0, Math.min(1, c.trigger ?? 1));
    // an element without a box (display: contents) never intersects: watch its first descendant that has one
    const watched = el.getBoundingClientRect().height ? el : [...el.querySelectorAll('*')].find((d) => d.getBoundingClientRect().height) || el;
    new IntersectionObserver(([e], io) => {
      if (e.isIntersecting) { el.setAttribute('class', c.to); if (!c.reverts) io.disconnect(); }
      else if (c.reverts && el.getAttribute('class') === c.to) el.setAttribute('class', c.back ?? c.from);
    }, { rootMargin: \`0px 0px -\${((1 - line) * 100).toFixed(1)}% 0px\` }).observe(watched);
  }
  const applyPinned = () => {
    if (scrollY > 0) scrolled = true;
    for (const [el, c] of pinned) {
      const past = scrollY >= (c.threshold ?? 1);
      if (past) el.setAttribute('class', c.to);
      else if (c.reverts && scrolled) el.setAttribute('class', c.back ?? c.from);
    }
  };
  if (pinned.length) {
    let queued = false;
    addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; applyPinned(); }); } }, { passive: true });
    applyPinned();
  }
  const style = (f) => ({ opacity: f.o, transform: \`translate(\${f.tx}px, \${f.ty}px) scale(\${f.s})\`, filter: f.blur ? \`blur(\${f.blur}px)\` : 'none' });
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
      if (!x.ready || !x.el.hasAttribute('data-tc-scrub')) continue;
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
  const play = (el, r) => {
    const frames = r.frames.map((f) => ({ ...style(f), offset: r.duration ? Math.min(1, f.t / r.duration) : 1 }));
    const anim = el.animate(frames, { duration: r.duration, fill: 'forwards', easing: 'linear' });
    anim.onfinish = () => { settle(el, r); anim.cancel(); };
  };
  for (const el of document.querySelectorAll('[data-tc-reveal]')) {
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
        if (el.hasAttribute('data-tc-reveal')) play(el, r);
      }
    }, { rootMargin: \`0px 0px -\${((1 - line) * 100).toFixed(1)}% 0px\` });
    io.observe(el);
  }
  // boot contract: the page shows once every clone script has run (DOMContentLoaded comes after the deferred ones;
  // the Next app's injector releases after its last script) and every hold is released. script.js holds the boot
  // while it prepares what a visitor must not see half-built (an intro waiting for its image): tcBoot.hold() at the
  // top, tcBoot.release() when ready.
  const boot = window.tcBoot = { holds: 1, hold() { this.holds++; }, release() { if (--this.holds <= 0) requestAnimationFrame(() => document.documentElement.classList.remove('tc-boot')); } };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', () => boot.release()); else if (!window.__tcInjected) boot.release();
})();
`;

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: trueclone seed <name> [--force] [--hide-until-boot "<selectors a script rebuilds at boot>"]');
  process.exit(1);
}
const root = path.resolve('sites', name);
const ref = path.join(root, 'reference');
const meta = JSON.parse(await fs.readFile(path.join(ref, 'meta.json'), 'utf8'));
const exact = meta.mode === 'exact' && Boolean(meta.permission);
const mirror = path.join(ref, 'mirror');
if (!(await fs.stat(path.join(mirror, 'index.html')).then(() => true, () => false))) {
  console.error(`no mirror yet: run trueclone capture ${meta.url} ${name} --mirror-only`);
  process.exit(1);
}
const clone = path.join(root, 'clone');
const exists = await fs.stat(path.join(clone, 'index.html')).then(() => true, () => false);
if (exists && !flags.force) {
  console.error(`${path.relative(process.cwd(), clone)} already has an index.html; add --force to overwrite it`);
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
const rewrite = async (text, prefix, replacement, forPass = false) => {
  // saved asset names are [a-z0-9._-]; `&` ends a path inside a style attribute (url(&quot;../assets/x.webp&quot;))
  const re = new RegExp(prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + 'assets/([^"\')\\s&]+)', 'g');
  for (const m of text.matchAll(re)) if (exact || isFont(m[1])) await pull(m[1]);
  return text.replace(re, (all, rel) => (exact || isFont(rel) ? `${replacement}assets/${rel}` : forPass ? `${REF_ASSETS}${rel}` : `${replacement}${PLACEHOLDER}`));
};

for (const file of await fs.readdir(path.join(mirror, 'css')).catch(() => [])) {
  const css = await fs.readFile(path.join(mirror, 'css', file), 'utf8');
  let out = await rewrite(css, '../../', '../');
  // template mode: images the capture never downloaded still point at the site (url("https://…/bg.avif"));
  // every non-font url() becomes a transparent placeholder (CSS backgrounds are mostly decorative: noise, grids,
  // glows), so the clone never loads the site's media. url(#id) points inside the page (SVG paint) and stays.
  if (!exact) out = out.replace(/url\(\s*(['"]?)(?!data:)([^'")]+)\1\s*\)/g, (all, q, u) => (isFont(u) || u.trim().startsWith('#') ? all : `url("../${PLACEHOLDER_BG}")`));
  await fs.writeFile(path.join(clone, 'css', file), out);
}
let html = await fs.readFile(path.join(mirror, 'index.html'), 'utf8');
html = await rewrite(html, '../', '', !exact);
await fs.writeFile(path.join(clone, 'index.html'), html);

if (!exact) {
  // a neutral box that reads on light and dark pages
  await fs.mkdir(path.join(clone, 'assets'), { recursive: true });
  await fs.writeFile(path.join(clone, PLACEHOLDER), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" preserveAspectRatio="none"><rect width="16" height="16" fill="#8884"/></svg>\n');
  await fs.writeFile(path.join(clone, PLACEHOLDER_BG), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"/>\n');
}
// Scroll reveals recorded on the reference (trueclone reveals): mark the elements, start them in their recorded
// starting state, and replay the recorded curves with a small player when they scroll into view.
// One file per width when `reveals` ran at every width: elements are matched by path (the same DOM at every width)
// and the player uses the record for the visitor's width, so phone offsets are phone offsets, not desktop pixels.
const recs = {};
for (const v of ['desktop', 'tablet', 'mobile']) {
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
const scrubbed = byPath('scrubs');
const classChanges = primary?.classes || [];
// Widget states recorded on the reference (trueclone widgets): tabs, menus. Template mode only for now: the snapshots
// are placeholdered like the page; exact-mode snapshots would still point at the site's media.
const widgetRec = exact ? null : JSON.parse(await fs.readFile(path.join(ref, 'widgets.desktop.json'), 'utf8').catch(() => 'null'));
const widgetGroups = widgetRec?.groups || [];
let marked = 0, classMarked = 0, scrubMarked = 0, widgets = null, runtime = null;
({ html, marked, classMarked, scrubMarked, widgets, runtime } = await browserPass(!exact, recorded, classChanges, widgetGroups, scrubbed));
if (!exact) html = html.split(REF_ASSETS).join('__tc_ref__').replace(/__tc_ref__[^"')\s]+/g, PLACEHOLDER);
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
    scrubs: scrubbed.map((r) => perWidth(r, (x) => ({ key: x.key, samples: x.samples }))),
    classes: classChanges.map(({ from, to, back, sticky, reverts, threshold, trigger }) => ({ from, to, back, sticky, reverts, threshold, trigger })),
  });
  html = html.replace(/<\/body>/i, `<script type="application/json" id="tc-reveals">${data}</script>\n<script src="trueclone-reveals.js" defer></script>\n</body>`);
}
// Boot contract: <html class="tc-boot"> from the first byte until every clone script has run (the reveal player drops
// it after DOMContentLoaded; the Next app after its last script). Regions a script builds or re-lays out at boot
// (--hide-until-boot "<selectors>") stay invisible meanwhile, so a visitor never sees their captured, pre-script state;
// a 3 s failsafe shows everything if no script ever runs.
html = html.replace(/<html\b([^>]*)>/i, (all, attrs) => (/\bclass=/.test(attrs) ? `<html${attrs.replace(/\bclass=(["'])([^"']*)\1/, (m, q, v) => `class=${q}${v.trim() ? `${v.trim()} ` : ''}tc-boot${q}`)}>` : `<html${attrs} class="tc-boot">`));
html = html.replace(/<\/head>/i, '<style id="tc-boot-styles">/* trueclone seed: boot contract */@keyframes tc-boot-failsafe{to{visibility:visible}}html.tc-boot [data-tc-boot-hide]{visibility:hidden;animation:tc-boot-failsafe 0s 3s forwards}</style>\n</head>');
// the clone's own behaviour script, loaded once the DOM is parsed
if (!/<script[^>]+src="script\.js"/.test(html)) html = html.replace(/<\/body>/i, '<script src="script.js" defer></script>\n</body>');
// Patches: what a clone needs on top of the seed lives in clone/patches/ and is applied here on every seed, so the
// generated index.html is never edited by hand and a re-seed never loses a fix. In name order:
//   head-*.html  inserted before </head>        (meta, extra stylesheet links)
//   *.css        linked before </head>          (after the site's stylesheets, so they win ties)
//   body-*.html  inserted before the clone's own <script src="script.js"> (vendor libraries, a hand-over prelude)
//   *.js         <script src defer> before script.js (runs after the players, before script.js)
const patchDir = path.join(clone, 'patches');
const patches = (await fs.readdir(patchDir).catch(() => [])).filter((f) => /\.(html|css|js)$/i.test(f)).sort();
const beforeScript = (s) => (/<script[^>]+src="script\.js"/.test(html) ? html.replace(/<script[^>]+src="script\.js"[^>]*><\/script>/i, (tag) => `${s}\n${tag}`) : html.replace(/<\/body>/i, `${s}\n</body>`));
for (const f of patches) {
  if (/^head-.*\.html$/i.test(f)) html = html.replace(/<\/head>/i, `${await fs.readFile(path.join(patchDir, f), 'utf8')}\n</head>`);
  else if (/\.css$/i.test(f)) html = html.replace(/<\/head>/i, `<link rel="stylesheet" href="patches/${f}">\n</head>`);
  else if (/\.html$/i.test(f)) html = beforeScript(await fs.readFile(path.join(patchDir, f), 'utf8'));
  else if (/\.js$/i.test(f)) html = beforeScript(`<script src="patches/${f}" defer></script>`);
}
await fs.writeFile(path.join(clone, 'index.html'), html);

const scriptFile = path.join(clone, 'script.js');
if (!(await fs.stat(scriptFile).then(() => true, () => false))) {
  await fs.writeFile(scriptFile, `// ${meta.url} - clone behaviour (your own code). Markup and styles come from the mirror${exact ? '' : ' (placeholder content)'}.\n// Rebuild every interaction and reveal from the reference's parameters; verify with npx trueclone score ${name}.\n`);
}
console.log(`seeded ${path.relative(process.cwd(), clone)} from the mirror (${exact ? 'exact: the site\'s own content' : 'template: placeholder text and media'}): index.html, ${(await fs.readdir(path.join(clone, 'css'))).length} stylesheet(s), ${copied.size} asset(s)${exact ? '' : ' (fonts only)'}`);
if (recorded.length || classChanges.length || scrubbed.length) console.log(`replayed by trueclone-reveals.js: ${marked}/${recorded.length} scroll reveals, ${scrubMarked}/${scrubbed.length} scroll-linked curves, ${classMarked}/${classChanges.length} scroll class changes (${Object.keys(recs).join(', ') || 'no'} widths recorded)${marked < recorded.length || classMarked < classChanges.length || scrubMarked < scrubbed.length ? ' (the rest did not resolve to an element in the mirror)' : ''}`);
if (runtime) {
  const pins = runtime.pins.map((p) => `${p.el} pinned for ${p.distance}px`).join(', ');
  console.log(`runtime artefacts cleaned: ${runtime.pins.length} GSAP pin(s) made sticky${pins ? ` (${pins}; data-tc-pin on each)` : ''}, ${runtime.canvases} canvas(es) marked data-tc-runtime="canvas"`);
  if (runtime.widthStyled) console.log(`per-width inline styles: ${runtime.widthStyled} element(s) sized or placed differently by the site's scripts at tablet/mobile, now media-query rules (data-tc-w)`);
  if (runtime.hidden) console.log(`boot contract: ${runtime.hidden} element(s) hidden until the clone's scripts have run (data-tc-boot-hide)`);
}
if (widgetGroups.length) console.log(`replayed by trueclone-widgets.js: ${widgets?.groups.length || 0}/${widgetGroups.length} widgets (${widgets?.states || 0} recorded states)${widgetRec?.portals?.length ? `; not replayed (portal popovers): ${widgetRec.portals.join(', ')}` : ''}`);
if (patches.length) console.log(`patches applied from clone/patches/: ${patches.join(', ')}`);
console.log(`next: write clone/script.js (behaviour), then npx trueclone score ${name}`);

// ---------- One browser pass over the seeded page: placeholders (template mode) and reveal marks ----------
async function browserPass(template, reveals, classes, groups = [], scrubs = []) {
  // served from sites/<name>/ so the pass can reach reference/assets (see `forPass`)
  const server = await serve(root);
  const browser = await openBrowser(flags.cdp);
  try {
    const { page } = await newPage(browser, VIEWPORTS.find((v) => v.name === 'desktop'), {});
    await page.goto(`${server.url}clone/index.html`, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    const counts = reveals.length || classes.length || scrubs.length ? await page.evaluate(markRevealsInPage, [reveals, classes, scrubs]) : [0, 0, 0];
    // widgets: mark regions and triggers, then give every recorded state the same placeholders as the page by
    // placing it into its region (so it is laid out and measured for real) and reading it back
    let widgets = null;
    if (groups.length) {
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
    if (template) await page.evaluate(placeholdersInPage, [LOREM, null]);
    // last, because the recorded paths above were taken on the live page, pin-spacers included
    const runtime = await page.evaluate(cleanRuntimeInPage);
    // regions the clone's script builds at boot, hidden until it has run (see the boot contract below)
    runtime.hidden = typeof flags['hide-until-boot'] === 'string'
      ? await page.evaluate((sels) => { let n = 0; for (const s of sels) for (const el of document.querySelectorAll(s)) { el.setAttribute('data-tc-boot-hide', ''); n++; } return n; }, flags['hide-until-boot'].split(',').map((s) => s.trim()).filter(Boolean))
      : 0;
    // inline styles that differ between widths (script-computed sizes and offsets) become media-query rules
    const inlineStyles = JSON.parse(await fs.readFile(path.join(ref, 'inline-styles.json'), 'utf8').catch(() => 'null'));
    runtime.widthStyled = inlineStyles ? await page.evaluate(widthStylesInPage, [inlineStyles, WIDTH_MEDIA]) : 0;
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
    const scope = resolve(g.scopePath);
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
  const show = (i, html) => { const r = regionOf(i); if (r && html != null && r.innerHTML !== html) r.innerHTML = html; };
  const parse = (t) => t.dataset.tcTrigger.split(':').map(Number);
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tc-trigger]');
    if (!t) return;
    const [i, j] = parse(t);
    const g = data.groups[i];
    if (!g) return;
    e.preventDefault();
    if (g.kind === 'tabs') show(i, g.states[j]);
    else show(i, t.getAttribute('aria-expanded') === 'true' ? g.closed : g.states[j]);
  });
  const hoverMenu = (t) => t.closest('header, nav') && data.groups[parse(t)[0]]?.kind === 'expand';
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest('[data-tc-trigger]');
    if (!t || !hoverMenu(t) || t.getAttribute('aria-expanded') === 'true') return;
    const [i, j] = parse(t);
    show(i, data.groups[i].states[j]);
  });
  document.addEventListener('pointerout', (e) => {
    for (const [i, g] of data.groups.entries()) {
      if (!g || g.kind !== 'expand') continue;
      const r = regionOf(i);
      if (!r || !r.contains(e.target) || r.contains(e.relatedTarget)) continue;
      if (r.querySelector(`[data-tc-trigger^="${i}:"][aria-expanded="true"]`)) show(i, g.closed);
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
    rules.push(`[data-tc-reveal="${i}"]{opacity:${rec.from.o};transform:translate(${rec.from.tx}px, ${rec.from.ty}px) scale(${rec.from.s})${rec.from.blur ? `;filter:blur(${rec.from.blur}px)` : ''}}`);
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

// Inline styles the capture read at every width, by element path. A declaration with the same value at every width
// stays inline; one that differs (a height a script computed from the container, an offset, a custom property)
// moves into a media-query rule per width, so each width gets exactly what the site showed there. The rule's
// selector is stacked to the precedence an inline style had over the stylesheets, without !important, so a value
// script.js writes inline later still wins. Motion properties of elements the reveal player drives, and the pin
// geometry the seed removed, are left out.
function widthStylesInPage([styles, media]) {
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
  const decls = (text) => {
    const map = new Map();
    for (const d of String(text || '').split(/;(?![^(]*\))/)) {
      const i = d.indexOf(':');
      if (i < 0) continue;
      const k = d.slice(0, i).trim(), v = d.slice(i + 1).trim().replace(/\s*!important$/i, '');
      if (k) map.set(k, v);
    }
    return map;
  };
  const MOTION = new Set(['transform', 'translate', 'rotate', 'scale', 'opacity', 'filter']);
  const PIN = new Set(['translate', 'rotate', 'scale', 'inset', 'top', 'left', 'right', 'bottom', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'max-width', 'width', 'max-height', 'height', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'box-sizing', 'position', 'transform', 'flex-basis']);
  const widths = Object.keys(styles).filter((w) => media[w]);
  const paths = new Set(widths.flatMap((w) => Object.keys(styles[w])));
  const rules = [];
  const sel = (i) => `[data-tc-w="${i}"]`.repeat(8); // (0,8,0): above any ordinary author rule, below inline
  let count = 0;
  for (const p of paths) {
    const per = Object.fromEntries(widths.map((w) => [w, decls(styles[w][p])]));
    const all = new Set(widths.flatMap((w) => [...per[w].keys()]));
    const differs = [...all].filter((k) => widths.some((w) => per[w].get(k) !== per[widths[0]].get(k)));
    if (!differs.length) continue;
    const el = resolve(p);
    if (!el) continue;
    // a pin spacer keeps only its pin distance per width (the site computes it from the viewport height); GSAP writes
    // it as the padding shorthand (padding: 0px 0px 5600px)
    const spacer = el.hasAttribute('data-tc-pin-spacer');
    if (spacer) {
      const horizontal = /^padding-right|^padding:\s*0(px)?\s+[1-9]/.test(styles[widths[0]][p] || '');
      const distance = (m) => { if (m.has(horizontal ? 'padding-right' : 'padding-bottom')) return parseFloat(m.get(horizontal ? 'padding-right' : 'padding-bottom')); const v = (m.get('padding') || '').trim().split(/\s+/); return parseFloat(horizontal ? v[1] ?? v[0] : v[2] ?? v[0]) || 0; };
      const d = Object.fromEntries(widths.map((w) => [w, Math.round(distance(per[w]))]));
      if (widths.every((w) => d[w] === d[widths[0]])) continue;
      const i = count++;
      el.setAttribute('data-tc-w', String(i));
      for (const w of widths) {
        el.firstElementChild?.setAttribute(`data-tc-pin-${w}`, String(d[w]));
        rules.push(`@media ${media[w]} { ${sel(i)} { ${horizontal ? 'padding-right' : 'padding-bottom'}: ${d[w]}px } }`);
      }
      continue;
    }
    const skip = (k) => (el.hasAttribute('data-tc-runtime') && (PIN.has(k) || k === 'width' || k === 'height')) || ((el.hasAttribute('data-tc-reveal') || el.hasAttribute('data-tc-scrub')) && MOTION.has(k));
    const moved = differs.filter((k) => !skip(k));
    if (!moved.length) continue;
    const i = count++;
    el.setAttribute('data-tc-w', String(i));
    // the inline attribute keeps what is the same everywhere (as the desktop mirror had it)
    const current = decls(el.getAttribute('style'));
    for (const k of moved) current.delete(k);
    const inline = [...current].map(([k, v]) => `${k}: ${v}`).join('; ');
    if (inline) el.setAttribute('style', inline); else el.removeAttribute('style');
    for (const w of widths) {
      const body = moved.filter((k) => per[w].has(k)).map((k) => `${k}: ${per[w].get(k)}`).join('; ');
      if (body) rules.push(`@media ${media[w]} { ${sel(i)} { ${body} } }`);
    }
  }
  if (rules.length) {
    const style = document.createElement('style');
    style.id = 'tc-width-styles';
    style.textContent = `/* trueclone seed: inline styles the site's scripts set per width (captured at desktop, tablet and mobile) */\n${rules.join('\n')}\n`;
    document.head.appendChild(style);
  }
  return count;
}

// The mirror is a snapshot taken after the site's scripts ran, so it carries what they left in the DOM: GSAP's
// pin-spacer wrappers and the pin's inline geometry (fixed desktop pixels that break every other width), and canvas
// buffer sizes set for one viewport. A pin is a sticky element inside a spacer, which CSS does natively: the seed
// keeps the spacer as a plain block with the pin distance as padding (`data-tc-pin-spacer`), makes the element
// sticky, and records the distance on it (`data-tc-pin`), so layout and scroll states hold without a script. The
// clone's script may take the pin over (unwrap the spacer, drop the sticky style) and draws the marked canvases.
function cleanRuntimeInPage() {
  const log = { pins: [], canvases: 0 };
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
    pinned.style.position = 'sticky';
    pinned.style.top = '0px';
    pinned.setAttribute('data-tc-runtime', 'pin');
    pinned.setAttribute('data-tc-pin', String(distance));
    const keep = [...spacer.style].filter((p) => SPACER_KEEP.has(p)).map((p) => `${p}: ${spacer.style.getPropertyValue(p)}`);
    spacer.removeAttribute('class');
    spacer.setAttribute('style', `${keep.join('; ')}${keep.length ? '; ' : ''}${horizontal ? 'padding-right' : 'padding-bottom'}: ${distance}px`);
    spacer.setAttribute('data-tc-pin-spacer', String(distance));
    log.pins.push({ el: label(pinned), distance });
  }
  // a canvas keeps its buffer size: with only a CSS width, the height follows the buffer's aspect ratio, and the
  // clone's own scene sets the buffer it needs; the mark says a script draws here
  for (const c of document.querySelectorAll('canvas')) {
    c.setAttribute('data-tc-runtime', 'canvas');
    log.canvases++;
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
  const meter = document.createElement('span');
  meter.style.cssText = 'position:absolute;left:-99999px;top:0;white-space:pre;contain:layout style paint;visibility:hidden';
  document.body.appendChild(meter);
  const PROPS = ['fontStyle', 'fontWeight', 'fontSize', 'fontFamily', 'fontStretch', 'fontVariant', 'fontFeatureSettings', 'fontKerning', 'letterSpacing', 'wordSpacing', 'textTransform'];
  let current = null;
  const cache = new Map();
  const widthIn = (s, word) => {
    const key = PROPS.map((p) => s[p]).join('|');
    let words = cache.get(key);
    if (!words) cache.set(key, (words = new Map()));
    if (!words.has(word)) {
      if (current !== key) { for (const p of PROPS) meter.style[p] = s[p]; current = key; }
      meter.textContent = word;
      words.set(word, meter.getBoundingClientRect().width);
    }
    return words.get(word);
  };
  const RUN = /([\p{L}\p{N}]+)/u;
  const pick = (s, run, refWidth, state) => {
    if (/^\p{N}+$/u.test(run)) return /^(19|20)\d\d$/.test(run) ? run : run.replace(/\d/g, (d) => String((Number(d) + 3) % 10));
    const caps = run.length > 1 && run === run.toUpperCase() && /\p{L}/u.test(run);
    const cap = !caps && /\p{Lu}/u.test(run[0]);
    const cased = (w) => (caps ? w.toUpperCase() : cap ? w[0].toUpperCase() + w.slice(1) : w);
    const target = refWidth + state.drift;
    let best = null, bestGap = Infinity;
    state.seed = (state.seed * 31 + run.length) % 9973;
    for (let i = 0; i < lorem.length; i++) {
      const w = cased(lorem[(i + state.seed) % lorem.length]);
      const gap = Math.abs(widthIn(s, w) - target);
      if (gap < bestGap) { best = w; bestGap = gap; }
    }
    // No single word close enough (a 2px miss moves a line break): try two lorem words joined into one. Still one
    // word, so the break opportunities stay the reference's, but there are ~10^5 widths to choose from.
    if (bestGap > 0.75 && target > 30) {
      const sorted = lorem.map((w) => [widthIn(s, cased(w)), w]).sort((a, b) => a[0] - b[0]);
      const tail = (w) => (caps ? w.toUpperCase() : w); // only the first part carries the capital
      const tries = [];
      for (const [wa, a] of sorted) {
        const need = target - wa;
        if (need < 6) break;
        let lo = 0, hi = sorted.length - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid][0] < need) lo = mid + 1; else hi = mid; }
        for (const k of [lo - 1, lo]) if (sorted[k]) tries.push([Math.abs(wa + sorted[k][0] - target), cased(a) + tail(sorted[k][1])]);
      }
      tries.sort((x, y) => x[0] - y[0]);
      for (const [, word] of tries.slice(0, 12)) { // estimates; measure the real compound (kerning at the join)
        const gap = Math.abs(widthIn(s, word) - target);
        if (gap < bestGap) { best = word; bestGap = gap; }
      }
    }
    state.drift = target - widthIn(s, best);
    return best;
  };
  // for attributes (alt, aria-label...): no layout to match, the element's own font is enough
  const shaper = (el) => {
    const s = getComputedStyle(el || document.body);
    const state = { drift: 0, seed: 7 };
    return (text) => text.split(RUN).map((run) => (RUN.test(run) && !/^[^\p{L}\p{N}]*$/u.test(run) ? pick(s, run, widthIn(s, run), state) : run)).join('');
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
    plan.push({ n, parts, widths, style: getComputedStyle(n.parentElement) });
  }
  // then choose the words (writes go to the isolated box only), then write all the text
  const states = new Map();
  for (const item of plan) {
    const state = states.get(item.n.parentElement) || { drift: 0, seed: 7 };
    states.set(item.n.parentElement, state);
    item.text = item.parts.map((part, i) => {
      if (!/[\p{L}\p{N}]/u.test(part)) return part;
      return pick(item.style, part, item.widths[i] ?? widthIn(item.style, part), state);
    }).join('');
  }
  for (const item of plan) item.n.textContent = item.text;
  meter.remove();
  // text in attributes people read or hear
  for (const el of root.querySelectorAll('[alt], [title], [aria-label], [placeholder], input[value], [data-text]')) {
    for (const a of ['alt', 'title', 'aria-label', 'placeholder', 'data-text']) if (el.hasAttribute(a) && el.getAttribute(a).trim()) el.setAttribute(a, shaper(el)(el.getAttribute(a)));
    if (el.tagName === 'INPUT' && ['text', 'email', 'search', 'url', 'tel', ''].includes(el.type) && el.value) el.setAttribute('value', shaper(el)(el.value));
  }

  // media: same box, placeholder content
  const box = (w, h) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w) || 16}" height="${Math.round(h) || 16}" viewBox="0 0 16 16" preserveAspectRatio="none"><rect width="16" height="16" fill="#8884"/></svg>`)}`;
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
  root.querySelectorAll('a[href]').forEach((a) => { if (!a.getAttribute('href').startsWith('#')) a.setAttribute('href', '#'); });
  root.querySelectorAll('form').forEach((f) => f.setAttribute('action', '#'));
  if (root !== document.body) return root.innerHTML;
  document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"], meta[name="description"], meta[name="keywords"], meta[name="author"], meta[name="application-name"], meta[name="generator"], meta[name="apple-mobile-web-app-title"], link[rel="author"], link[rel="preconnect"], link[rel="dns-prefetch"], link[rel="preload"][as="image"], link[rel="prefetch"], link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"], link[rel="canonical"], link[rel="alternate"], script[type="application/ld+json"]').forEach((m) => m.remove());
  document.title = shaper(null)(document.title);
  return document.documentElement.outerHTML;
}
