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

// Reveal player shipped with the clone (trueclone's own code): replays each recorded curve with the Web Animations
// API once the element's top crosses the recorded trigger line; with reduced motion it shows the end state.
const PLAYER = `// trueclone reveal player: replays what was recorded on the reference while scrolling (trueclone reveals): one-shot
// reveals frame by frame, and class changes (a header that gets its backdrop past 12px, an "is-visible" toggle).
(() => {
  const raw = JSON.parse(document.getElementById('tc-reveals')?.textContent || '{}');
  const data = Array.isArray(raw) ? raw : raw.reveals || [];
  const classData = Array.isArray(raw) ? [] : raw.classes || [];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // class changes are state, not motion: they apply with reduced motion too
  let scrolled = false;
  const pinned = [];
  for (const el of document.querySelectorAll('[data-tc-class]')) {
    const c = classData[Number(el.dataset.tcClass)];
    if (!c) continue;
    if (c.sticky) { pinned.push([el, c]); continue; }
    const line = Math.max(0, Math.min(1, c.trigger ?? 1));
    new IntersectionObserver(([e], io) => {
      if (e.isIntersecting) { el.setAttribute('class', c.to); if (!c.reverts) io.disconnect(); }
      else if (c.reverts && el.getAttribute('class') === c.to) el.setAttribute('class', c.back ?? c.from);
    }, { rootMargin: \`0px 0px -\${((1 - line) * 100).toFixed(1)}% 0px\` }).observe(el);
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
  const settle = (el, r) => Object.assign(el.style, style(r.to));
  const play = (el, r) => {
    const frames = r.frames.map((f) => ({ ...style(f), offset: r.duration ? Math.min(1, f.t / r.duration) : 1 }));
    const anim = el.animate(frames, { duration: r.duration, fill: 'forwards', easing: 'linear' });
    anim.onfinish = () => { settle(el, r); anim.cancel(); };
  };
  for (const el of document.querySelectorAll('[data-tc-reveal]')) {
    const r = data[Number(el.dataset.tcReveal)];
    if (!r) continue;
    if (reduce) { settle(el, r); continue; }
    // the recorded trigger is where the element's top was (as a share of the window height) when it started
    const line = Math.max(0, Math.min(1, r.trigger ?? 1));
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.disconnect();
        play(el, r);
      }
    }, { rootMargin: \`0px 0px -\${((1 - line) * 100).toFixed(1)}% 0px\` });
    io.observe(el);
  }
})();
`;

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: trueclone seed <name> [--force]');
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
  const re = new RegExp(prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + 'assets/([^"\')\\s]+)', 'g');
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
const recording = JSON.parse(await fs.readFile(path.join(ref, 'reveals.desktop.json'), 'utf8').catch(() => 'null'));
const recorded = recording?.reveals || [];
const classChanges = recording?.classes || [];
let marked = 0, classMarked = 0;
if (!exact || recorded.length || classChanges.length) ({ html, marked, classMarked } = await browserPass(!exact, recorded, classChanges));
if (!exact) html = html.split(REF_ASSETS).join('__tc_ref__').replace(/__tc_ref__[^"')\s]+/g, PLACEHOLDER);
if (marked || classMarked) {
  await fs.writeFile(path.join(clone, 'trueclone-reveals.js'), PLAYER);
  const data = JSON.stringify({
    reveals: recorded.map(({ trigger, duration, frames, to }) => ({ trigger, duration, frames, to })),
    classes: classChanges.map(({ from, to, back, sticky, reverts, threshold, trigger }) => ({ from, to, back, sticky, reverts, threshold, trigger })),
  });
  html = html.replace(/<\/body>/i, `<script type="application/json" id="tc-reveals">${data}</script>\n<script src="trueclone-reveals.js" defer></script>\n</body>`);
}
// the clone's own behaviour script, loaded once the DOM is parsed
if (!/<script[^>]+src="script\.js"/.test(html)) html = html.replace(/<\/body>/i, '<script src="script.js" defer></script>\n</body>');
await fs.writeFile(path.join(clone, 'index.html'), html);

const scriptFile = path.join(clone, 'script.js');
if (!(await fs.stat(scriptFile).then(() => true, () => false))) {
  await fs.writeFile(scriptFile, `// ${meta.url} - clone behaviour (your own code). Markup and styles come from the mirror${exact ? '' : ' (placeholder content)'}.\n// Rebuild every interaction and reveal from the reference's parameters; verify with npx trueclone score ${name}.\n`);
}
console.log(`seeded ${path.relative(process.cwd(), clone)} from the mirror (${exact ? 'exact: the site\'s own content' : 'template: placeholder text and media'}): index.html, ${(await fs.readdir(path.join(clone, 'css'))).length} stylesheet(s), ${copied.size} asset(s)${exact ? '' : ' (fonts only)'}`);
if (recorded.length || classChanges.length) console.log(`replayed by trueclone-reveals.js: ${marked}/${recorded.length} scroll reveals, ${classMarked}/${classChanges.length} scroll class changes${marked < recorded.length || classMarked < classChanges.length ? ' (the rest did not resolve to an element in the mirror)' : ''}`);
console.log(`next: write clone/script.js (behaviour), then npx trueclone score ${name}`);

// ---------- One browser pass over the seeded page: placeholders (template mode) and reveal marks ----------
async function browserPass(template, reveals, classes) {
  // served from sites/<name>/ so the pass can reach reference/assets (see `forPass`)
  const server = await serve(root);
  const browser = await openBrowser(flags.cdp);
  try {
    const { page } = await newPage(browser, VIEWPORTS.find((v) => v.name === 'desktop'), {});
    await page.goto(`${server.url}clone/index.html`, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    const counts = reveals.length || classes.length ? await page.evaluate(markRevealsInPage, [reveals, classes]) : [0, 0];
    if (template) await page.evaluate(placeholdersInPage, LOREM);
    const out = await page.evaluate(() => document.documentElement.outerHTML);
    return { html: `<!DOCTYPE html>\n${out}`, marked: counts[0], classMarked: counts[1] };
  } finally {
    if (!flags.cdp) await browser.close();
    server.close();
  }
}

// The path of element children recorded by reveals.mjs (script/style/meta-like tags skipped) resolves to the same
// element in the script-free mirror. Each reveal gets data-tc-reveal and its recorded starting state inline; each
// scroll class change gets data-tc-class and its starting classes (the page as it is before any scroll).
function markRevealsInPage([reveals, classes]) {
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
  let count = 0;
  reveals.forEach((r, i) => {
    const el = resolve(r.path);
    if (!el) return;
    el.setAttribute('data-tc-reveal', String(i));
    el.style.opacity = String(r.from.o);
    el.style.transform = `translate(${r.from.tx}px, ${r.from.ty}px) scale(${r.from.s})`;
    if (r.from.blur) el.style.filter = `blur(${r.from.blur}px)`;
    count++;
  });
  let classCount = 0;
  classes.forEach((c, i) => {
    const el = resolve(c.path);
    if (!el) return;
    el.setAttribute('data-tc-class', String(i));
    if (c.from !== null && c.from !== undefined) el.setAttribute('class', c.from);
    classCount++;
  });
  return [count, classCount];
}


function placeholdersInPage(lorem) {
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
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
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
  for (const el of document.querySelectorAll('[alt], [title], [aria-label], [placeholder], input[value], [data-text]')) {
    for (const a of ['alt', 'title', 'aria-label', 'placeholder', 'data-text']) if (el.hasAttribute(a) && el.getAttribute(a).trim()) el.setAttribute(a, shaper(el)(el.getAttribute(a)));
    if (el.tagName === 'INPUT' && ['text', 'email', 'search', 'url', 'tel', ''].includes(el.type) && el.value) el.setAttribute('value', shaper(el)(el.value));
  }

  // media: same box, placeholder content
  const box = (w, h) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w) || 16}" height="${Math.round(h) || 16}" viewBox="0 0 16 16" preserveAspectRatio="none"><rect width="16" height="16" fill="#8884"/></svg>`)}`;
  for (const img of document.querySelectorAll('img')) {
    const r = img.getBoundingClientRect();
    img.setAttribute('src', box(img.naturalWidth || r.width, img.naturalHeight || r.height));
    for (const a of ['srcset', 'sizes', 'data-src', 'data-srcset']) img.removeAttribute(a);
  }
  document.querySelectorAll('picture source, video source, audio source, track').forEach((s) => s.remove());
  for (const v of document.querySelectorAll('video')) {
    const r = v.getBoundingClientRect();
    v.removeAttribute('src');
    v.setAttribute('poster', box(v.videoWidth || r.width, v.videoHeight || r.height));
    v.setAttribute('preload', 'none');
  }
  for (const f of document.querySelectorAll('iframe, embed, object')) f.setAttribute(f.tagName === 'OBJECT' ? 'data' : 'src', 'about:blank');
  // inline SVG: small ones are interface icons and stay; large ones (logos, illustrations) become a same-size box
  for (const svg of document.querySelectorAll('svg')) {
    if (svg.parentElement?.closest('svg')) continue;
    const r = svg.getBoundingClientRect();
    if (r.width <= 48 && r.height <= 48) continue;
    if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${Math.round(r.width) || 16} ${Math.round(r.height) || 16}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    const [, , w, h] = svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
    svg.innerHTML = `<rect width="${w || 16}" height="${h || 16}" fill="#8884"/>`;
  }
  for (const el of document.querySelectorAll('[style*="url("]')) el.setAttribute('style', el.getAttribute('style').replace(/url\((['"]?)(?!data:)[^)'"]+\1\)/g, 'url("assets/placeholder.svg")'));

  // links, forms and brand metadata
  document.querySelectorAll('a[href]').forEach((a) => { if (!a.getAttribute('href').startsWith('#')) a.setAttribute('href', '#'); });
  document.querySelectorAll('form').forEach((f) => f.setAttribute('action', '#'));
  document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"], meta[name="description"], meta[name="keywords"], meta[name="author"], meta[name="application-name"], meta[name="generator"], meta[name="apple-mobile-web-app-title"], link[rel="author"], link[rel="preconnect"], link[rel="dns-prefetch"], link[rel="preload"][as="image"], link[rel="prefetch"], link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"], link[rel="canonical"], link[rel="alternate"], script[type="application/ld+json"]').forEach((m) => m.remove());
  document.title = shaper(null)(document.title);
  return document.documentElement.outerHTML;
}
