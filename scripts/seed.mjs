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
import { codeHash, toolVersion } from './identity.mjs';
import { routeDir, routeKey, decodeEach, canonicalPath } from './routes.mjs';

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
      // a captured canvas (an empty element: a canvas keeps no pixels in HTML) gives way to the scene the clone's
      // script mounts: the moment a canvas of the script's own appears beside or inside its host, it is removed, so
      // the two never stack (a script that draws into the captured canvas itself keeps it)
      for (const c of [el, ...el.querySelectorAll('canvas[data-tc-runtime="canvas"]')].filter((x) => x.matches('canvas[data-tc-runtime="canvas"]'))) {
        const host = c.parentElement;
        if (!host) continue;
        new MutationObserver((records, mo) => {
          for (const r of records) for (const n of r.addedNodes) {
            if (n.nodeType === 1 && (n.matches('canvas:not([data-tc-runtime])') || n.querySelector('canvas:not([data-tc-runtime])'))) { c.remove(); mo.disconnect(); return; }
          }
        }).observe(host, { childList: true, subtree: true });
      }
    }
  };
  // tcBoot.hold() returns its own release (call it when ready); a hold never released is released after 5 s with a
  // warning, so a script that forgets can never leave the page hidden
  const pending = [];
  const drop = () => { if (--boot.holds <= 0) requestAnimationFrame(() => document.documentElement.classList.remove('tc-boot')); };
  const boot = window.tcBoot = {
    holds: 1,
    hold() {
      this.holds++;
      const h = { done: false };
      const free = () => { if (h.done) return; h.done = true; clearTimeout(h.timer); pending.splice(pending.indexOf(h), 1); drop(); };
      h.timer = setTimeout(() => { if (!h.done) { console.warn('trueclone: a tcBoot.hold() was not released within 5 s; released'); free(); } }, 5000);
      pending.push(h);
      h.free = free;
      return free;
    },
    // release() without a hold's own function frees the oldest hold still open (or the boot's own first hold)
    release() { if (pending.length) pending[0].free(); else drop(); },
  };
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
const routePage = typeof flags['route-page'] === 'string' ? (meta.routes || []).find((r) => routeKey(r.path) === routeKey(routeArg(flags['route-page']))) : null;
// where a route's page is written under clone/: the one rule the bundled server reads with (routes.mjs routeDir:
// "/Landing%20Page.html" is clone/Landing Page.html/index.html, RC6-07), and its depth for re-basing
const pageParts = (p) => routeDir(p).split('/').filter(Boolean);
if (typeof flags['route-page'] === 'string' && !routePage) { console.error(`no separate page ${flags['route-page']} in this capture`); process.exit(1); }
// the browser pass works on a temporary page, never on clone/index.html: a pass that crashes leaves no index.html that
// looks seeded (the completion record clone/.seed.json is written only at the very end)
const passFile = routePage ? `.page-${routePage.slug}.html` : '.seed-pass.html';
const t0 = Date.now();
const step = (msg) => console.log(`seed ${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s  ${msg}`);
// The captured page lives at the clone's root and at its own address too (/products/x, /en/getting-started):
// a link or Back to it, or a reload there, finds the same page, as on the site.
const startParts = (() => { try { return pageParts(new URL(meta.finalUrl || meta.url).pathname); } catch { return []; } })();
const writeStartAlias = async (doc) => {
  if (!startParts.length) return;
  await fs.mkdir(path.join(clone, ...startParts), { recursive: true });
  await fs.writeFile(path.join(clone, ...startParts, 'index.html'), rebaseHtml(doc, startParts.length));
};
// --patches: re-apply clone/patches/ onto the last seed output in a second, without seeding again
if (flags.patches) {
  const base = await fs.readFile(path.join(clone, '.seed-base.html'), 'utf8').catch(() => null);
  if (base === null) { console.error(`no seed output to patch in ${path.relative(process.cwd(), clone)}: run trueclone seed ${name} first`); process.exit(1); }
  const { html: patched, applied } = await applyPatches(base);
  await fs.writeFile(path.join(clone, 'index.html'), patched);
  await writeStartAlias(patched);
  for (const r of (meta.routes || []).filter((x) => x.slug && !x.sameDocument)) {
    const pageBase = await fs.readFile(path.join(clone, `.seed-base-${r.slug}.html`), 'utf8').catch(() => null);
    if (pageBase === null) continue;
    await fs.mkdir(path.join(clone, ...pageParts(r.path)), { recursive: true });
    await fs.writeFile(path.join(clone, ...pageParts(r.path), 'index.html'), rebaseHtml((await applyPatches(pageBase)).html, pageParts(r.path).length));
  }
  console.log(`patches re-applied onto the last seed (no re-seed): ${applied.join(', ') || 'none in clone/patches/'}`);
  process.exit(0);
}
// App mode with the site's own bundle (exact mode, a canvas app, capture kept reference/bundle/): the clone is the
// site's own code on its recorded files (scripts/bundle.mjs), not a rebuilt document. Seeding again is safe: nothing
// in it is the agent's (patches/ are kept).
if (meta.bundle && !routePage) {
  const { seedBundle } = await import('./bundle.mjs');
  const r = await seedBundle(root, meta);
  // a captured route the bundle has no page for would be a 404 in the clone and an HTTP error in every check on it
  // (RC8 elise: 5 of 9 routes, found only after an hour of scoring): no completion record, the routes named
  if (r.missingRoutes.length) {
    console.error(`the bundle has no page for ${r.missingRoutes.length} captured route(s): ${r.missingRoutes.join(', ')}. The clone would answer them 404. Record them into the bundle: npx trueclone record-bundle ${name}, then seed again (status names both)`);
    process.exit(1);
  }
  // notes.md: the review's verdicts, findings and accepted differences (nothing to plan: the code is the site's own)
  const notesFile = path.join(root, 'notes.md');
  if (!(await fs.stat(notesFile).then(() => true, () => false))) {
    await fs.writeFile(notesFile, `# ${name}: clone notes\n\nReference: ${meta.url}. Mode: exact (permission: ${meta.permission}), app mode with the site's own bundle. Captured ${meta.capturedAt}.\nKeep every section; the report reads them back. One line per entry, no prose.\n\n## Review\n\n<!-- one line per journey frame of compare/review/journey-<size>/index.md, with its token: "- journey/03-step-2 desktop [token]: same" -->\n\n## Accepted differences\n\n<!-- "- <check> <size> <where>: <why>; evidence: <file>" -->\n\n## Findings\n\n<!-- what the bundle could not carry (a backend answer it stubs, a file never recorded), with evidence -->\n`);
  }
  // the same completion record as a rebuilt document's (capture, time, the seed's code and the tool's version)
  await fs.writeFile(path.join(clone, '.seed.json'), JSON.stringify({ capturedAt: meta.capturedAt, at: new Date().toISOString(), pages: r.documents, bundle: true, code: codeHash('seed'), tool: toolVersion() }, null, 2));
  console.log(`seeded ${path.relative(process.cwd(), clone)} from the site's own bundle: ${r.files} files from ${r.hosts} host(s), ${r.documents} document(s), served through clone/tc-sw.js (offline: tracking answered empty, writes never sent, anything not recorded a 404)`);
  console.log(`next: npx trueclone status ${name}`);
  process.exit(0);
}
const exists = await fs.stat(path.join(clone, 'index.html')).then(() => true, () => false);
// a seed that did not finish (no completion record for this capture) is simply run again, without --force
const completed = JSON.parse(await fs.readFile(path.join(clone, '.seed.json'), 'utf8').catch(() => 'null'))?.capturedAt === meta.capturedAt;
if (exists && completed && !flags.force && !routePage) {
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
  const clean = decodeEach(rel.split(/[?#]/)[0]); // a malformed escape (a bare %) is kept, never a crash
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
// merged across widths by the element's stable id (reveals since rc.7, with its fp), else its position path; an element
// that is not the same one in every width's record (another fp, or for a positional path another first class) is
// ambiguous and never marked (RC6-15's rule, applied to reveals)
const firstCls = (c) => String(c || '').split(/[.\s]+/)[0];
const byPath = (key) => {
  const m = new Map();
  for (const [v, r] of Object.entries(recs)) for (const x of r[key] || []) {
    const k = x.id != null ? `id:${x.id}` : `path:${x.path}`;
    if (!m.has(k)) m.set(k, { path: x.path, id: x.id, fp: x.fp, cls: x.cls });
    const e = m.get(k);
    if (x.id != null ? x.fp !== e.fp : firstCls(x.cls) !== firstCls(e.cls)) e.ambiguous = true;
    e[v] = x;
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
let liveFrames = [], find = null;
({ html, marked, classMarked, scrubMarked, widgets, runtime, liveFrames, find } = await browserPass(!exact, recorded, classChanges, widgetGroups, scrubbed));
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
// What capture hid (--hide: a region popup, a cookie banner a visitor dismisses) is hidden in the clone too: the saved
// page still holds it, and every check compares against the page without it
if ((meta.hide || []).length) html = html.replace(/<\/head>/i, () => `<style id="tc-hide">/* trueclone seed: hidden at capture (--hide) */${meta.hide.join(',')}{display:none!important}</style>\n</head>`);
html = html.replace(/<\/head>/i, () => `<style id="tc-boot-styles">/* trueclone seed: boot contract */@keyframes tc-boot-failsafe{to{visibility:visible}}html.tc-boot [data-tc-boot-hide]{visibility:hidden;animation:tc-boot-failsafe 0s 3s forwards}</style>\n<script id="tc-runtime">${RUNTIME}</script>\n</head>`);
// the clone's own behaviour script, loaded once the DOM is parsed
if (!/<script[^>]+src="script\.js"/.test(html)) html = html.replace(/<\/body>/i, '<script src="script.js" defer></script>\n</body>');
// the seed's own output, kept so `seed --patches` can re-apply clone/patches/ onto it in a second
await fs.writeFile(path.join(clone, routePage ? `.seed-base-${routePage.slug}.html` : '.seed-base.html'), html);
const { html: patchedHtml, applied: patches } = await applyPatches(html);
html = patchedHtml;
if (routePage) {
  const parts = pageParts(routePage.path);
  await fs.mkdir(path.join(clone, ...parts), { recursive: true });
  await fs.writeFile(path.join(clone, ...parts, 'index.html'), rebaseHtml(html, parts.length));
  await fs.rm(path.join(clone, passFile), { force: true });
  if (liveFrames.length) console.log(`live frames: ${JSON.stringify(liveFrames)}`); // read by the main seed (.seed.json)
  console.log(`seeded ${routePage.path}: clone/${parts.join('/')}/index.html (a separate page of the site)`);
  process.exit(0);
}
// written whole and then moved into place: a reader never sees half a page
await fs.writeFile(path.join(clone, '.index.tmp.html'), html);
await fs.rename(path.join(clone, '.index.tmp.html'), path.join(clone, 'index.html'));
await fs.rm(path.join(clone, passFile), { force: true });
await writeStartAlias(html);
step(`index.html written${startParts.length ? ` (and at its own address, clone/${startParts.join('/')}/index.html)` : ''}`);

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
// what was not found (no element at that key) or not the element recorded (its fp or class differs): left unmarked
const findNote = (f) => (f ? [f.missing ? `${f.missing} element(s) not found in the saved page` : '', f.unmatched ? `${f.unmatched} whose key finds another element` : '', f.ambiguous ? `${f.ambiguous} not the same element at every size` : ''].filter(Boolean).join(', ') || 'none found' : 'not found');
if (recorded.length || classChanges.length) console.log(`replayed by trueclone-reveals.js: ${marked}/${recorded.length} one-shot scroll reveals, ${classMarked}/${classChanges.length} scroll class changes (${Object.keys(recs).join(', ') || 'no'} sizes recorded)${marked < recorded.length || classMarked < classChanges.length ? ` (the rest not marked: ${findNote(find?.reveals)})` : ''}`);
if (recordedScrubs.length) console.log(`not replayed: ${recordedScrubs.length} scroll-linked curve(s) (parallax, scrubbed fades): evidence in reference/reveals.<size>.json; script.js reproduces the rule behind them`);
if (runtime) {
  const pins = runtime.pins.map((p) => `${p.el} pinned for ${p.distance}px${p.axis ? ' (sideways: left to script.js)' : ''}`).join(', ');
  console.log(`runtime artefacts cleaned: ${runtime.pins.length} GSAP pin(s) made sticky${pins ? ` (${pins}; data-tc-pin on each)` : ''}, ${runtime.canvases} canvas(es) marked data-tc-runtime="canvas"${runtime.gsap ? `, ${runtime.gsap} GSAP-written transform(s) marked data-tc-gsap (tcOwn() clears them for script.js${runtime.gsapState ? `, except ${runtime.gsapState} closed state(s) marked data-tc-gsap="state", which stay` : ''})` : ''}`);
  if (runtime.viewport) console.log(`viewport values: ${runtime.viewport.fitted} value(s) a script computes from the screen size carried as functions of it (read at ${runtime.viewport.sizes} sizes, site breakpoints ${runtime.viewport.breakpoints.join('/') || 'none'})${runtime.viewport.dropped ? `; ${runtime.viewport.dropped} fit no such function and are left to script.js (data-tc-script-owned, reference/script-owned.json)` : ''}`);
  // RC6-15: what was not applied because the element could not be told apart (left as captured, never given another's)
  const vv = runtime.viewport;
  if (vv && (vv.ambiguous || vv.unmatched || vv.missing)) console.log(`viewport values left as captured: ${vv.ambiguous} element(s) not the same element at every size, ${vv.unmatched} whose key finds another element in the saved page, ${vv.missing} not found in it (keys by ${vv.keys === 'id-path' ? 'id and path' : 'position: a capture before rc.7; capture again for keys that survive late third-party elements'})`);
  if (runtime.hidden) console.log(`boot contract: ${runtime.hidden} element(s) hidden until the clone's scripts have run (data-tc-boot-hide)`);
}
const sameState = (widgetRec?.groups || []).length - widgetGroups.length;
if (widgetGroups.length || sameState) console.log(`replayed by trueclone-widgets.js: ${widgets?.groups.filter(Boolean).length || 0}/${widgetGroups.length} widgets (${widgets?.states || 0} recorded states)${sameState ? `; ${sameState} left out (one recorded state: nothing to replay)` : ''}${widgetRec?.portals?.length ? `; not replayed (portal popovers): ${widgetRec.portals.join(', ')}` : ''}${find?.widgets && (find.widgets.missing || find.widgets.unmatched) ? `; not wired: ${findNote(find.widgets)}` : ''}`);
if (patches.length) console.log(`patches applied from clone/patches/: ${patches.join(', ')}`);
// every separate page of the site, by the same pipeline (one child run each)
const ownPages = (meta.routes || []).filter((r) => r.slug && !r.sameDocument && fsSync.existsSync(path.join(mirror, 'routes', `${r.slug}.html`)));
for (const r of ownPages) {
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), name, '--route-page', r.path, ...(typeof flags['hide-until-boot'] === 'string' ? ['--hide-until-boot', flags['hide-until-boot']] : [])], { cwd: process.cwd(), encoding: 'utf8' });
  const ok = (child.stdout || '').split('\n').filter((l) => l.startsWith('seeded ')).join('\n');
  console.log(ok || `WARNING ${r.path} not seeded: ${(child.stderr || '').split('\n')[0]}`);
  if (!ok) { console.error(`seed incomplete: the separate page ${r.path} did not seed; run trueclone seed ${name} again`); process.exit(1); }
  const frames = (child.stdout || '').split('\n').find((l) => l.startsWith('live frames: '));
  if (frames) { const f = JSON.parse(frames.slice('live frames: '.length)); console.warn(`WARNING ${r.path}: ${f.length} frame(s) still load the live site (not captured): ${f.join(', ')}`); liveFrames.push(...f); }
}
// the completion record: every page of the seed is written (status requires it, so a seed that crashed is redone).
// code: the seed's code (identity.mjs codeHash), so a clone seeded by older seed code is seeded again after an upgrade
// (status); liveFrames: frames that still load the live site (RC6 elise), for the report
await fs.writeFile(path.join(clone, '.seed.json'), JSON.stringify({ capturedAt: meta.capturedAt, at: new Date().toISOString(), pages: 1 + ownPages.length, code: codeHash('seed'), tool: toolVersion(), ...(liveFrames.length ? { liveFrames: [...new Set(liveFrames)] } : {}) }, null, 2));
console.log(`next: write clone/script.js (behaviour), then npx trueclone score ${name}`);

// ---------- One browser pass over the seeded page: placeholders (template mode) and reveal marks ----------
// the names (ids, classes) the site's own scripts mention: an SVG holding one of them is moved by a script and keeps its
// shapes in template mode (placeholdersInPage)
async function scriptNames() {
  const dir = path.join(ref, 'scripts');
  const text = (await Promise.all((await fs.readdir(dir).catch(() => [])).filter((f) => /\.js$/.test(f) && !/\.pretty\.js$/.test(f)).map((f) => fs.readFile(path.join(dir, f), 'utf8').catch(() => '')))).join('\n');
  return [...new Set(text.match(/['"`][#.]?[a-zA-Z][\w-]{2,40}['"`]/g) || [])].map((t) => t.slice(1, -1).replace(/^[#.]/, ''));
}

async function browserPass(template, reveals, classes, groups = [], scrubs = []) {
  const scriptedNames = template ? await scriptNames() : [];
  // served from sites/<name>/ so the pass can reach reference/assets (see `forPass`)
  const server = await serve(root);
  const browser = await openBrowser(flags.cdp);
  try {
    // the clone's own files are made here: no evaluation control (seed, clock) may run while they are written
    const { page } = await newPage(browser, VIEWPORTS.find((v) => v.name === 'desktop'), { stabilise: false });
    // no frame of this pass opens a page off the local server: the saved page still points its frames at the site (the
    // elise shell's three, allbirds' shop.app one), and the pass would load the live site before they are made local
    // or blank. Their boxes are the frame elements' own, so nothing measured here changes.
    await page.route('**/*', (r) => (r.request().resourceType() === 'document' && r.request().frame() !== page.mainFrame() && !r.request().url().startsWith(server.url) && !/^(about|data|blob):/.test(r.request().url()) ? r.abort() : r.continue()));
    await page.goto(`${server.url}clone/${passFile}`, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    // inline styles a script set (viewport-fit.mjs): every planned key is found and checked on the mirror exactly as
    // saved, before this pass changes anything (a pin's tail, a removed <source>, a reveal's class, an excluded widget
    // all move positions), and marked; the plan is applied to the marked elements at the end. A key that finds no
    // element, or one that is not the element recorded (RC6-15), is left alone and counted.
    const inlineStyles = routePage ? null : JSON.parse(await fs.readFile(path.join(ref, 'inline-styles.json'), 'utf8').catch(() => 'null'));
    const fit = inlineStyles ? planInlineStyles(inlineStyles, VIEWPORTS) : null;
    const planned = fit ? Object.entries(fit.plan) : [];
    const found = fit ? await page.evaluate(markInlinePlanInPage, [planned.map(([p, e]) => [p, e.check]), fit.keys]) : null;
    // the site's own links point at the clone's routes: an address on the site's host becomes a path (/about), in
    // both modes, so a visitor of the clone stays in the clone (the local server and the Next app answer every route)
    const siteHost = new URL(meta.finalUrl || meta.url).host;
    const localised = await page.evaluate(localLinksInPage, siteHost);
    if (localised) console.log(`links: ${localised} link(s) to the site's own pages now point at the clone's routes`);
    // Frames of the site's own pages (exact mode; template mode blanks every frame): a frame whose route was captured
    // opens the clone's page of it, query kept (elise's shell framed https://www.elise-ux.com/Landing%20Page.html?shell=1
    // from every clone page, RC6 A6: the clone showed the live site). One whose route was not captured cannot be made
    // local: it is left as it is, warned here and recorded in clone/.seed.json (liveFrames).
    let liveFrames = [];
    if (!template) {
      const srcs = await page.evaluate(sameHostFramesInPage, siteHost);
      const captured = new Map((meta.routes?.length ? meta.routes : [{ path: new URL(meta.finalUrl || meta.url).pathname }]).map((r) => [routeKey(r.path), canonicalPath(r.path)]));
      const to = [];
      for (const s of srcs) {
        const u = new URL(s.abs);
        const local = captured.get(routeKey(u.pathname));
        if (local) to.push([s.src, `${local}${u.search}${u.hash}`]); else liveFrames.push(s.abs);
      }
      const n = to.length ? await page.evaluate(setFrameSrcInPage, to) : 0;
      if (n) console.log(`frames: ${n} frame(s) of the site's own pages now open the clone's routes (${to.map((t) => t[1]).join(', ')})`);
      if (liveFrames.length) console.warn(`WARNING ${liveFrames.length} frame(s) still load the live site: their pages were not captured, so the clone has no page for them (capture --routes with them to localise): ${liveFrames.join(', ')}`);
    }
    await page.evaluate(installFindInPage);
    const counts = reveals.length || classes.length || scrubs.length ? await page.evaluate(markRevealsInPage, [reveals, classes, scrubs]) : [0, 0, 0, { missing: 0, unmatched: 0, ambiguous: 0 }];
    let widgetFind = null;
    // widgets: mark regions and triggers, then give every recorded state the same placeholders as the page by
    // placing it into its region (so it is laid out and measured for real) and reading it back
    let widgets = null;
    if (groups.length) {
      step(`widgets: ${groups.length} recorded, placing each state`);
      const { ok, missing, unmatched } = await page.evaluate(markWidgetsInPage, groups);
      widgetFind = { missing, unmatched };
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
      // ALLBIRDS-7 (D5): a lazy image out of view never loads in this pass, so the alpha test below saw no pixels and
      // made a cut-out product shot an opaque grey box (allbirds' floating_img / floating-img). Every image is loaded and
      // decoded first (loading="lazy" kept on the element: only this pass loads it early), at most 15 s.
      const lazy = await page.evaluate(loadImagesInPage, 15000).catch(() => 0);
      if (lazy) step(`${lazy} lazy image(s) loaded for the placeholder test`);
      step('template placeholders: measuring every text run (the longest part on a big page)');
      await page.evaluate(placeholdersInPage, [LOREM, null, scriptedNames]);
      step('placeholders done');
    }
    // Excluded third-party widgets (meta.ignore, decision D3: "the clone must not contain them") are removed from the
    // page, with the capture's own exclusion stylesheet (RC6-05: it was saved into rendered.html and copied into every
    // clone page, and both it and a marked 0x0 Impact iframe tripped the clone lint on allbirds).
    // by origin only where nothing of that origin was kept (page content, a widget kept with --include; a kept <script>
    // does not count: the mirror has no scripts)
    const keptOrigins = new Set((meta.thirdParty || []).filter((t) => !String(t.decision || '').startsWith('excluded') && t.label !== 'script').map((t) => t.origin));
    const dropOrigins = [...new Set((meta.ignore || []).map((i) => i.origin).filter((o) => o && !keptOrigins.has(o)))];
    const dropped = await page.evaluate(dropExcludedInPage, [(meta.ignore || []).map((i) => i.sel), dropOrigins]);
    if (dropped.elements || dropped.styles) console.log(`excluded widgets: ${dropped.elements} element(s) removed (meta.ignore${dropped.byOrigin ? `; ${dropped.byOrigin} by their excluded origin` : ''})${dropped.styles ? `, and the capture's exclusion stylesheet` : ''}`);
    // last, because the recorded paths above were taken on the live page, pin-spacers included
    const runtime = await page.evaluate(cleanRuntimeInPage);
    // regions the clone's script builds at boot, hidden until it has run (see the boot contract below)
    runtime.hidden = typeof flags['hide-until-boot'] === 'string'
      ? await page.evaluate((sels) => { let n = 0; for (const s of sels) for (const el of document.querySelectorAll(s)) { el.setAttribute('data-tc-boot-hide', ''); n++; } return n; }, flags['hide-until-boot'].split(',').map((s) => s.trim()).filter(Boolean))
      : 0;
    // inline styles that differ between widths (script-computed sizes and offsets) become media-query rules
    // inline styles a script set: functions of the viewport where they are, left to script.js where they aren't
    // (read on the captured page only: its keys mean nothing in another document)
    if (fit) {
      const { owned, fitted, sizes, breakpoints, ambiguous } = fit;
      const applied = await page.evaluate(applyInlineStylePlanInPage, planned.map(([, e]) => e));
      runtime.viewport = { fitted, sizes, breakpoints, elements: applied.elements, dropped: applied.dropped, keys: fit.keys, ambiguous: ambiguous.length, unmatched: found.unmatched.length, missing: found.missing };
      await fs.writeFile(path.join(ref, 'script-owned.json'), JSON.stringify({ note: 'inline values a script computes that are not a function of the screen size: script.js must compute them, as the site does', owned: owned.filter((o) => applied.droppedKeys.some((i) => planned[i][0] === o.path)).map(({ pos, ...o }) => (pos ? { ...o, key: o.path, path: pos } : o)) }, null, 2)); // path: the position brief.mjs places by; key: the stable key
    }
    // getHTML keeps the declarative shadow roots the capture serialised (outerHTML would drop them); it is the inner
    // HTML, so the <html> tag and its attributes (font classes, dark mode, lang) are written back around it
    const out = await page.evaluate(() => {
      const el = document.documentElement;
      const inner = el.getHTML ? el.getHTML({ serializableShadowRoots: true }) : el.innerHTML;
      const attrs = [...el.attributes].map((a) => ` ${a.name}="${a.value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`).join('');
      return `<html${attrs}>${inner}</html>`;
    });
    return { html: `<!DOCTYPE html>\n${out}`, marked: counts[0], classMarked: counts[1], scrubMarked: counts[2], widgets, runtime, liveFrames, find: { reveals: counts[3], widgets: widgetFind } };
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
// Widget scopes and triggers by their recorded identity (installFindInPage): a stable id checked by its fp (widgets.mjs
// since rc.7), else the position path, a trigger checked by its recorded label. A group any of whose elements is
// missing or not the one recorded is not wired (counted), never wired to whatever holds that place.
function markWidgetsInPage(groups) {
  const ok = {};
  const tally = { missing: 0, unmatched: 0 };
  for (const g of groups) {
    const find = (rec, sig) => { const r = window.__tcFindRec(rec, sig); if (!r.el) tally[r.why]++; return r.el; };
    const label = (t) => (t.label !== undefined && t.label !== '' ? { label: t.label } : {});
    const triggers = g.triggers.map((t) => find({ id: t.id, fp: t.fp, path: t.path }, label(t)));
    // a dialog or listbox (kind "portal") gets an empty host of its own at the end of <body>: the recorded element is
    // shown there when its trigger is clicked
    let scope;
    if (g.kind === 'portal') {
      if (triggers.some((t) => !t)) continue;
      scope = document.createElement('div');
      scope.setAttribute('data-tc-portal', String(g.i));
      document.body.appendChild(scope);
    } else scope = g.scopePath || g.scopeId != null ? find({ id: g.scopeId, fp: g.scopeFp, path: g.scopePath }, {}) : null;
    if (!scope || triggers.some((t) => !t)) continue;
    const ids = (scope.getAttribute('data-tc-scope') || '').split(' ').filter(Boolean);
    ids.push(String(g.i));
    scope.setAttribute('data-tc-scope', ids.join(' '));
    triggers.forEach((t, j) => t.setAttribute('data-tc-trigger', `${g.i}:${j}`));
    ok[g.i] = true;
  }
  return { ok, ...tally };
}

// window.__tcFindRec(rec, sig) -> { el } or { el: null, why: "missing" | "unmatched" }: the element a reveal, class change
// or widget record names in the mirror as saved. rec.id (rc.7 records): #id (unique) then tag[n] steps (n-th child of
// that tag), checked against rec.fp, the tag.first-class chain of the steps. Else rec.path: tag:n among all children
// from <body> (script-like tags skipped), the rule before rc.7, checked by what the record has: sig.cls (first class
// tokens it may have) or sig.label (a trigger's text). RC6 allbirds: a late body child moved every position, so 0 of 8
// reveals and 0 of 3 widgets were found; a position that finds another element is never used.
function installFindInPage() {
  const SKIP = new Set(['SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'STYLE', 'LINK', 'META']);
  const first = (n) => String(n.getAttribute('class') || '').trim().split(/\s+/)[0];
  const labelOf = (n) => (n.getAttribute('aria-label') || n.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  window.__tcFindRec = (rec, sig = {}) => {
    let el = null;
    if (rec.id != null) {
      const steps = String(rec.id).split('>').filter(Boolean);
      el = document.body;
      let i = 0;
      const fp = [];
      if (steps[0]?.startsWith('#')) {
        const all = document.querySelectorAll(`#${CSS.escape(decodeURIComponent(steps[0].slice(1)))}`);
        el = all.length === 1 ? all[0] : null;
        i = 1;
      }
      for (; el && i < steps.length; i++) {
        const m = /^(.+)\[(\d+)\]$/.exec(steps[i]);
        el = m ? [...el.children].filter((c) => c.tagName.toLowerCase() === m[1])[Number(m[2]) - 1] || null : null;
        if (el) fp.push(`${m[1]}.${first(el)}`);
      }
      if (!el || el === document.body) return { el: null, why: 'missing' };
      if (rec.fp != null && fp.join('>') !== rec.fp) return { el: null, why: 'unmatched' };
      return { el };
    }
    el = document.body;
    for (const part of String(rec.path || '').split('>')) {
      const [tag, n] = part.split(':');
      el = [...el.children].filter((c) => !SKIP.has(c.tagName))[Number(n) - 1];
      if (!el || el.tagName.toLowerCase() !== tag) return { el: null, why: 'missing' };
    }
    if (sig.cls && !sig.cls.includes(first(el))) return { el: null, why: 'unmatched' };
    if (sig.label !== undefined && labelOf(el) !== sig.label) return { el: null, why: 'unmatched' };
    return { el };
  };
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
  // every record found (installFindInPage) before any mark or class is written: a class change's starting class would
  // otherwise change the first class another record is checked by. An ambiguous record (byPath) is never marked.
  const tally = { missing: 0, unmatched: 0, ambiguous: 0 };
  const firstOf = (c) => String(c ?? '').trim().split(/[.s]+/)[0];
  const find = (rec, cls) => {
    if (rec.ambiguous) { tally.ambiguous++; return null; }
    const r = window.__tcFindRec({ id: rec.id, fp: rec.fp, path: rec.path }, { cls });
    if (!r.el) tally[r.why]++;
    return r.el;
  };
  const revealEls = reveals.map((r) => find(r, [firstOf(r.cls)]));
  // a class change: the element's class now may be any of its recorded states
  const classEls = classes.map((c) => find(c, [c.from, c.to, c.back].map(firstOf)));
  const scrubEls = scrubs.map((s) => find(s, [firstOf(s.cls)]));
  // each reveal's starting state is a rule on its mark (no flash before the player runs; the player then applies the
  // visitor's width); script.js hands an element over by removing the mark, which releases the state with it
  const rules = [];
  let count = 0;
  reveals.forEach((r, i) => {
    const el = revealEls[i];
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
    const el = classEls[i];
    if (!el) return;
    el.setAttribute('data-tc-class', String(i));
    if (c.from !== null && c.from !== undefined) el.setAttribute('class', c.from);
    classCount++;
  });
  let scrubCount = 0;
  scrubs.forEach((s, i) => {
    const el = scrubEls[i];
    if (!el) return;
    el.setAttribute('data-tc-scrub', String(i));
    scrubCount++;
  });
  return [count, classCount, scrubCount, tally];
}

// The plan from viewport-fit.mjs, applied to the page: fitted values replace the captured constants inline; per-range
// values become media rules whose selector is stacked to the precedence an inline style had over the stylesheets
// (without !important, so a value script.js writes inline later still wins); values no function fits are removed and
// left to script.js. A pin spacer's distance becomes its --tc-pin. Motion properties of elements the reveal player
// drives, and the pin geometry the seed removed, are left alone.
// The plan's entries are in the order markInlinePlanInPage marked them (data-tc-wk); the marks go when it is done.
function applyInlineStylePlanInPage(plan) {
  const marked = new Map([...document.querySelectorAll('[data-tc-wk]')].map((e) => [Number(e.getAttribute('data-tc-wk')), e]));
  for (const e of marked.values()) e.removeAttribute('data-tc-wk');
  const MOTION = new Set(['transform', 'translate', 'rotate', 'scale', 'opacity', 'filter']);
  const PIN = new Set(['translate', 'rotate', 'scale', 'inset', 'top', 'left', 'right', 'bottom', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'max-width', 'width', 'max-height', 'height', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'box-sizing', 'position', 'transform', 'flex-basis']);
  // the bottom (or right) length of a padding shorthand, calc() kept whole
  const splitTop = (v) => { const out = []; let depth = 0, cur = ''; for (const ch of String(v)) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ' ' && !depth) { if (cur) out.push(cur); cur = ''; } else cur += ch; } if (cur) out.push(cur); return out; };
  const pinOf = (prop, v) => { if (prop === 'padding-bottom') return v; if (prop !== 'padding') return null; const t = splitTop(v); return t[2] ?? t[0]; };
  const rules = [];
  const sel = (i) => `[data-tc-w="${i}"]`.repeat(8); // (0,8,0): above any ordinary author rule, below inline
  let count = 0, dropped = 0;
  const droppedKeys = [];
  for (const [p, entry] of plan.entries()) {
    const el = marked.get(p);
    if (!el || !el.isConnected) continue;
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
    if (lost.length) { dropped += lost.length; droppedKeys.push(p); el.setAttribute('data-tc-script-owned', lost.join(' ')); }
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
  return { elements: marked.size, rules: rules.length, dropped, droppedKeys };
}

// Finds each planned key's element on the mirror as saved, checks it is the element the capture recorded (check from
// viewport-fit.mjs) and marks it data-tc-wk="<index>" for applyInlineStylePlanInPage. keys "id-path": #id, then tag[n]
// (n-th child of that tag); "position" (captures before rc.7): tag:n among all children, script-like tags skipped.
// RC6-15: a positional key that found another element (the allbirds pixel container's styles on the geofencing
// section) is never applied: unmatched. Returns { marked, missing, unmatched: [keys] }.
function markInlinePlanInPage([items, keys]) {
  const SKIP = new Set(['SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'STYLE', 'LINK', 'META']);
  const first = (n) => String(n.getAttribute('class') || '').trim().split(/\s+/)[0];
  const resolve = (p) => {
    const steps = p.split('>');
    if (keys !== 'id-path') {
      let el = document.body;
      for (const part of steps) {
        const [tag, n] = part.split(':');
        el = [...el.children].filter((c) => !SKIP.has(c.tagName))[Number(n) - 1];
        if (!el || el.tagName.toLowerCase() !== tag) return null;
      }
      return { el, fp: null };
    }
    let el = document.body, i = 0;
    const fp = [];
    if (steps[0].startsWith('#')) {
      const id = decodeURIComponent(steps[0].slice(1));
      const all = document.querySelectorAll(`[id="${CSS.escape(id)}"]`);
      if (all.length !== 1) return null; // no element, or two: not the one recorded
      el = all[0];
      i = 1;
    }
    for (; i < steps.length; i++) {
      const m = /^(.+)\[(\d+)\]$/.exec(steps[i]);
      if (!m) return null;
      el = [...el.children].filter((c) => c.tagName.toLowerCase() === m[1])[Number(m[2]) - 1];
      if (!el) return null;
      fp.push(`${m[1]}.${first(el)}`);
    }
    return { el, fp: fp.join('>') };
  };
  let marked = 0, missing = 0;
  const unmatched = [];
  items.forEach(([p, check], i) => {
    const r = resolve(p);
    if (!r) { missing++; return; }
    const ok = !check ? true
      : keys === 'id-path' ? r.fp === check.fp
        : check.styled ? r.el.hasAttribute('style') && first(r.el) === check.cls : !r.el.hasAttribute('style');
    if (!ok) { unmatched.push(p); return; }
    r.el.setAttribute('data-tc-wk', String(i));
    marked++;
  });
  return { marked, missing, unmatched };
}

// Elements of excluded third-party widgets (meta.ignore) and the capture's own exclusion stylesheet, removed from the
// page, open shadow roots included. Elements: those its selectors match, and those capture marked as inserted by an
// excluded origin's script (data-tc-origin; allbirds' Impact iframe had no src, so its selector matched nothing).
// The stylesheet: marked data-tc-ignore since rc.7; before, recognised by its exact shape (one "<sel>{display:none!
// important}" line per excluded selector, nothing else). Nothing else is touched.
function dropExcludedInPage([sels, origins]) {
  const out = { elements: 0, byOrigin: 0, styles: 0 };
  const lines = new Set(sels.map((s) => `${s}{display:none!important}`));
  const roots = [document];
  for (let k = 0; k < roots.length; k++) for (const el of roots[k].querySelectorAll('*')) if (el.shadowRoot) roots.push(el.shadowRoot);
  for (const r of roots) {
    for (const st of r.querySelectorAll('style')) {
      const rows = st.textContent.split('\n').map((l) => l.trim()).filter(Boolean);
      const own = st.hasAttribute('data-tc-ignore') || (rows.length > 0 && rows.every((l) => lines.has(l)));
      if (own) { st.remove(); out.styles++; }
    }
    for (const s of sels) { let found = []; try { found = [...r.querySelectorAll(s)]; } catch { /* not a selector here */ } for (const el of found) if (el.isConnected) { el.remove(); out.elements++; } }
    for (const el of [...r.querySelectorAll('[data-tc-origin]')]) if (el.isConnected && origins.includes(el.getAttribute('data-tc-origin'))) { el.remove(); out.elements++; out.byOrigin++; }
  }
  return out;
}

// Same-host frames (exact mode): their src as written and as an absolute address, once each
function sameHostFramesInPage(siteHost) {
  const host = String(siteHost).replace(/^www\./, '');
  const out = new Map();
  for (const f of document.querySelectorAll('iframe[src]')) {
    const src = f.getAttribute('src');
    let u;
    try { u = new URL(src, location.href); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || u.host.replace(/^www\./, '') !== host || !/^https?:\/\//i.test(src.trim()) && !src.trim().startsWith('//')) continue;
    out.set(src, { src, abs: u.href });
  }
  return [...out.values()];
}
function setFrameSrcInPage(pairs) {
  const to = new Map(pairs);
  let n = 0;
  for (const f of document.querySelectorAll('iframe[src]')) if (to.has(f.getAttribute('src'))) { f.setAttribute('src', to.get(f.getAttribute('src'))); n++; }
  return n;
}

// Every image loaded and decoded (lazy ones too, the attribute put back), at most `max` ms; the count of lazy ones
async function loadImagesInPage(max) {
  const imgs = [...document.images];
  const lazy = imgs.filter((i) => i.loading === 'lazy');
  for (const i of lazy) i.loading = 'eager';
  await Promise.race([Promise.all(imgs.map((i) => (i.complete && i.naturalWidth ? i.decode().catch(() => {}) : new Promise((r) => { i.addEventListener('load', () => i.decode().then(r, r), { once: true }); i.addEventListener('error', r, { once: true }); if (i.complete) r(); })))), new Promise((r) => setTimeout(r, max))]);
  for (const i of lazy) i.setAttribute('loading', 'lazy');
  return lazy.length;
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
    // and by the value itself, which holds at every size: an element with no box at this size (a phone menu at desktop
    // width) has no geometry to judge, but scale 0 on an axis, or a full-size move (±100%), is a closed state anywhere
    let byValue = /translate[XY3d]*\([^)]*-?100%/.test(t);
    try { const m = new DOMMatrixReadOnly(t); byValue ||= Math.abs(m.a) < 1e-3 || Math.abs(m.d) < 1e-3; } catch { /* a % translate: read above */ }
    const state = flat || away || byValue;
    el.setAttribute('data-tc-gsap', state ? 'state' : '');
    if (state) log.gsapState = (log.gsapState || 0) + 1;
    log.gsap++;
  }
  return log;
}


function placeholdersInPage([lorem, rootSel, scripted = []]) {
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
  // An image with transparency (a cut-out product shot, a logo) becomes its silhouette in the same grey: its shape,
  // not a box (a box would cover what showed around and through it). Read from the image itself, shrunk to 256 px.
  const silhouette = (img) => {
    try {
      if (!img.complete || !img.naturalWidth) return null;
      const k = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, c.width, c.height);
      const d = g.getImageData(0, 0, c.width, c.height);
      let clear = 0;
      for (let i = 3; i < d.data.length; i += 4) if (d.data[i] < 250) clear++;
      if (clear < d.data.length / 4 * 0.02) return null; // opaque: a box is its shape
      for (let i = 0; i < d.data.length; i += 4) { d.data[i] = 140; d.data[i + 1] = 140; d.data[i + 2] = 140; }
      g.putImageData(d, 0, 0);
      return c.toDataURL('image/png');
    } catch { return null; } // a cross-origin image cannot be read: the box
  };
  for (const img of root.querySelectorAll('img')) {
    const r = img.getBoundingClientRect();
    img.setAttribute('src', silhouette(img) || box(img.naturalWidth || r.width, img.naturalHeight || r.height));
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
  // inline SVG: small ones are interface icons and stay; large ones (logos, illustrations) become a same-size box,
  // except a drawing the site's scripts move (an id or class inside it that a script names: rings, a motion path):
  // its shapes stay, recoloured grey, so the clone's script has the same elements to animate
  for (const svg of root.querySelectorAll('svg')) {
    if (svg.parentElement?.closest('svg')) continue;
    const r = svg.getBoundingClientRect();
    if (r.width <= 48 && r.height <= 48) continue;
    const named = [...svg.querySelectorAll('[id], [class]')].flatMap((n) => [n.id, ...String(n.getAttribute('class') || '').split(/\s+/)]).filter((t) => t && t.length > 2);
    if (named.some((t) => scripted.includes(t))) {
      for (const n of svg.querySelectorAll('*')) {
        for (const a of ['fill', 'stroke', 'stop-color']) if (n.getAttribute(a) && !/^(none|transparent|currentColor)$/i.test(n.getAttribute(a)) && !/^url\(/.test(n.getAttribute(a))) n.setAttribute(a, '#8c8c8c');
        if (n.tagName.toLowerCase() === 'text' || n.tagName.toLowerCase() === 'tspan') n.textContent = n.textContent.replace(/\S/g, 'x');
      }
      continue;
    }
    if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${Math.round(r.width) || 16} ${Math.round(r.height) || 16}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    const [, , w, h] = svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
    svg.innerHTML = `<rect width="${w || 16}" height="${h || 16}" fill="#8c8c8c"/>`;
  }
  for (const el of root.querySelectorAll('[style*="url("]')) el.setAttribute('style', el.getAttribute('style').replace(/url\((['"]?)(?!data:)[^)'"]+\1\)/g, 'url("assets/placeholder.svg")'));

  // links, forms and brand metadata
  // the site's own routes stay links (made local by localLinksInPage); links elsewhere go nowhere
  root.querySelectorAll('a[href]').forEach((a) => { const h = a.getAttribute('href'); if (!h.startsWith('#') && !(h.startsWith('/') && !h.startsWith('//'))) a.setAttribute('href', '#'); });
  root.querySelectorAll('form').forEach((f) => f.setAttribute('action', '#'));
  // Open shadow roots (the capture's declarative <template shadowrootmode>, parsed into real ones here): the same
  // rules for frames, media and links, which querySelectorAll above does not reach. RC6-22: allbirds' shop-cart-sync
  // root kept a live <iframe src="https://shop.app/pay/hop?..."> in a template-mode clone.
  const shadows = [];
  for (const el of root.querySelectorAll('*')) if (el.shadowRoot) shadows.push(el.shadowRoot);
  for (let k = 0; k < shadows.length; k++) {
    const sr = shadows[k];
    for (const el of sr.querySelectorAll('*')) if (el.shadowRoot) shadows.push(el.shadowRoot);
    for (const f of sr.querySelectorAll('iframe, embed, object')) f.setAttribute(f.tagName === 'OBJECT' ? 'data' : 'src', 'about:blank');
    for (const img of sr.querySelectorAll('img')) {
      const r = img.getBoundingClientRect();
      img.setAttribute('src', silhouette(img) || box(img.naturalWidth || r.width, img.naturalHeight || r.height));
      for (const a of ['srcset', 'sizes', 'data-src', 'data-srcset']) img.removeAttribute(a);
    }
    sr.querySelectorAll('picture source, video source, audio source, track').forEach((s) => s.remove());
    for (const v of sr.querySelectorAll('video')) { v.removeAttribute('src'); v.setAttribute('poster', box(v.videoWidth || 16, v.videoHeight || 16)); v.setAttribute('preload', 'none'); }
    sr.querySelectorAll('a[href]').forEach((a) => { const h = a.getAttribute('href'); if (!h.startsWith('#') && !(h.startsWith('/') && !h.startsWith('//'))) a.setAttribute('href', '#'); });
    sr.querySelectorAll('form').forEach((f) => f.setAttribute('action', '#'));
  }
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
