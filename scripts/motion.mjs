// Motion inventory from the live runtime: what moves, what drives it, with what parameters.
// Reads library state after the intro finishes, so the numbers are the site's real settings, not guesses:
//   - GSAP: every ScrollTrigger (trigger, start/end, scrub, pin, toggleActions) with its full timeline,
//     pointer-driven tweens (gsap.quickTo), endless loops, other standalone tweens
//   - Lenis options (constructor intercepted), Swiper params, CSS animations/transitions
//   - a pointer probe: which elements move or change when the cursor moves
// Records parameters only (targets, ranges, durations, easing); the site's code itself is never saved.
//
// usage: node scripts/motion.mjs <name> [--viewport desktop|tablet|mobile]
import fs from 'node:fs/promises';
import path from 'node:path';
import { VIEWPORTS, parseArgs, openBrowser, newPage, waitStill, statesInPage } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: npm run motion -- <name> [--viewport desktop]');
  process.exit(1);
}
const ref = path.resolve('sites', name, 'reference');
const meta = JSON.parse(await fs.readFile(path.join(ref, 'meta.json'), 'utf8'));
const vp = VIEWPORTS.find((v) => v.name === (flags.viewport || 'desktop'));

// Runs before any page script: intercept constructors whose options are not reachable afterwards.
const INIT = () => {
  const wrap = (globalName, store) => {
    let value;
    Object.defineProperty(window, globalName, {
      configurable: true,
      get() { return value; },
      set(v) {
        value = typeof v !== 'function' ? v : new Proxy(v, {
          construct(target, args) {
            const safe = JSON.parse(JSON.stringify(args[0] || {}, (k, x) => (typeof x === 'function' ? `[function ${x.name || 'anonymous'}]` : x instanceof Element ? `[element ${x.tagName.toLowerCase()}.${x.className}]` : x)));
            (window[store] = window[store] || []).push(safe);
            return Reflect.construct(target, args);
          },
        });
      },
    });
  };
  wrap('Lenis', '__labLenis');
};

// The animation runtimes wherever the site keeps them, found by what they are, not by their global name: a site may
// bundle its own GSAP (window.VARSITY.gsap), never expose Lenis, or only mark its three.js canvases (data-engine).
// Sets window.__labGsap / __labST for the other probes; returns what was found and where.
function findRuntimes() {
  const found = { gsap: null, gsapAt: null, st: null, stAt: null, lenis: [], three: null };
  const isGsap = (v) => v && typeof v === 'object' && typeof v.to === 'function' && typeof v.timeline === 'function' && v.globalTimeline;
  const isST = (v) => v && typeof v === 'function' && typeof v.getAll === 'function' && typeof v.refresh === 'function' && typeof v.create === 'function';
  const isLenis = (v) => v && typeof v === 'object' && typeof v.raf === 'function' && typeof v.scrollTo === 'function' && v.options && typeof v.options === 'object';
  const seen = new Set();
  const visit = (v, at, depth) => {
    if (!v || (typeof v !== 'object' && typeof v !== 'function') || seen.has(v) || v === window) return;
    seen.add(v);
    // anything here may be hostile to read: a cross-origin frame's window, a getter that throws, a Proxy
    try {
      if (v instanceof Node) return;
      if (!found.gsap && isGsap(v)) { found.gsap = v; found.gsapAt = at; }
      if (!found.st && isST(v)) { found.st = v; found.stAt = at; }
      if (isLenis(v) && found.lenis.length < 4) found.lenis.push({ at, options: JSON.parse(JSON.stringify(v.options, (k, x) => (typeof x === 'function' ? `[function ${x.name || 'anonymous'}]` : x instanceof Node ? `[element ${x.nodeName.toLowerCase()}]` : x === window ? '[window]' : x))) });
    } catch { return; }
    if (depth >= 2) return;
    let keys = [];
    try { keys = Object.keys(v).slice(0, 400); } catch { return; }
    for (const k of keys) { let x; try { x = v[k]; } catch { continue; } visit(x, `${at}.${k}`, depth + 1); }
  };
  for (const k of Object.keys(window)) { if (/^(webkit|on)|^(document|navigator|location|history|localStorage|sessionStorage|caches|crypto|performance|chrome|frames|parent|top|self|opener)$/.test(k)) continue; let v; try { v = window[k]; } catch { continue; } visit(v, `window.${k}`, 0); }
  // a ScrollTrigger registered on the GSAP found, even if never exposed itself
  if (!found.st && found.gsap?.core?.globals) { const g = found.gsap.core.globals(); if (isST(g?.ScrollTrigger)) { found.st = g.ScrollTrigger; found.stAt = `${found.gsapAt}.core.globals().ScrollTrigger`; } }
  const engines = [...new Set([...document.querySelectorAll('canvas[data-engine]')].map((c) => c.getAttribute('data-engine')))];
  found.three = window.THREE?.REVISION || window.__THREE__ || engines.find((e) => /three/i.test(e)) || null;
  window.__labGsap = found.gsap;
  window.__labST = found.st;
  return { gsapAt: found.gsapAt, gsapVersion: found.gsap?.version || null, stAt: found.stAt, lenis: found.lenis, three: found.three, engines };
}

function inventory() {
  const runtimes = window.__labRuntimes;
  const gsap = window.__labGsap, ScrollTrigger = window.__labST;
  const pathOf = (el) => {
    const parts = [];
    for (let n = el; n && n !== document.body && n.parentElement; n = n.parentElement) parts.unshift(`${n.tagName.toLowerCase()}:${[...n.parentElement.children].indexOf(n) + 1}`);
    return parts.join('>');
  };
  const sel = (el) => (el instanceof Element ? `${el.tagName.toLowerCase()}${String(el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 3).map((c) => '.' + c).join('')}` : null);
  const section = (el) => {
    if (!(el instanceof Element)) return null;
    let n = el;
    while (n.parentElement && n.parentElement !== document.body && !['MAIN'].includes(n.parentElement.tagName) && n.parentElement.children.length === 1) n = n.parentElement;
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      if (/section|footer|header/i.test(p.tagName) || /(^|\s)section[_-]/.test(String(p.getAttribute('class') || ''))) return sel(p);
    }
    return null;
  };
  const target = (el) => (el instanceof Element ? { sel: sel(el), path: pathOf(el), section: section(el) } : { kind: typeof el });
  const easeName = (e) => (typeof e === 'string' ? e : typeof e === 'function' ? (e.custom ? 'CustomEase' : e.name || 'function') : e);
  const clean = (vars) => {
    const out = {};
    for (const [k, v] of Object.entries(vars || {})) {
      if (['scrollTrigger', 'onComplete', 'onUpdate', 'onStart', 'callbackScope', 'data', 'id', 'parent'].includes(k)) continue;
      if (k === 'ease') { out.ease = easeName(v); continue; }
      if (k === 'startAt') { out.startAt = clean(v); continue; }
      if (k === 'stagger' && v && typeof v === 'object') { out.stagger = clean(v); continue; }
      if (typeof v === 'function') { out[k] = '[function]'; continue; }
      if (v && typeof v === 'object') continue;
      out[k] = v;
    }
    return out;
  };
  const describe = (a, depth = 0) => {
    if (!a || depth > 6) return null;
    if (a.getChildren) {
      return {
        type: 'timeline', duration: +a.duration().toFixed(3), repeat: a.repeat(), vars: clean(a.vars), labels: a.labels,
        children: a.getChildren(false, true, true).map((c) => ({ start: +c.startTime().toFixed(3), ...describe(c, depth + 1) })),
      };
    }
    const targets = a.targets();
    const els = targets.filter((t) => t instanceof Element);
    return {
      type: 'tween', duration: +a.duration().toFixed(3), delay: a.delay(), repeat: a.repeat(), yoyo: a.yoyo(),
      from: Boolean(a.vars.runBackwards), vars: clean(a.vars),
      targets: els.slice(0, 6).map(target), targetCount: targets.length,
      split: els.some((e) => /(^|\s)(line|word|char|split)/i.test(String(e.getAttribute('class') || '')) || e.parentElement?.hasAttribute('aria-label')),
    };
  };

  const triggers = (ScrollTrigger ? ScrollTrigger.getAll() : []).map((st, i) => ({
    i,
    trigger: target(st.trigger),
    start: st.vars.start ?? 'top bottom', end: st.vars.end ?? 'bottom top',
    startPx: Math.round(st.start), endPx: Math.round(st.end),
    scrub: st.vars.scrub ?? false,
    pin: st.pin ? target(st.pin) : null, pinSpacing: st.vars.pinSpacing,
    toggleActions: st.vars.toggleActions, once: st.vars.once,
    snap: st.vars.snap ? JSON.stringify(st.vars.snap) : undefined,
    callbacks: Object.keys(st.vars).filter((k) => k.startsWith('on')),
    animation: st.animation ? describe(st.animation) : null,
  }));

  const standalone = gsap ? gsap.globalTimeline.getChildren(false, true, true).filter((a) => !a.scrollTrigger) : [];
  const isElTween = (a) => !a.getChildren && a.targets().some((t) => t instanceof Element);
  const quickTo = (a) => isElTween(a) && a.paused() && Object.values(a.vars).some((v) => v === '+=0.1');
  const pointer = standalone.filter(quickTo).map((a) => ({ target: target(a.targets()[0]), prop: Object.keys(a.vars).find((k) => a.vars[k] === '+=0.1'), duration: a.duration(), ease: easeName(a.vars.ease) }));
  const loops = standalone.filter((a) => a.repeat && a.repeat() === -1).map((a) => describe(a));
  const other = standalone.filter((a) => !quickTo(a) && !(a.repeat && a.repeat() === -1) && (a.getChildren || isElTween(a))).map((a) => describe(a));

  const swipers = [...document.querySelectorAll('*')].filter((e) => e.swiper).map((e) => {
    const p = e.swiper.params;
    const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, typeof o[k] === 'object' ? JSON.parse(JSON.stringify(o[k], (kk, v) => (v instanceof Element ? sel(v) : typeof v === 'function' ? '[function]' : v))) : o[k]]));
    return { el: target(e), slides: e.swiper.slides.length, params: pick(p, ['slidesPerView', 'spaceBetween', 'speed', 'loop', 'grabCursor', 'centeredSlides', 'freeMode', 'effect', 'direction', 'autoplay', 'breakpoints', 'navigation', 'pagination', 'simulateTouch', 'allowTouchMove', 'mousewheel', 'keyboard']) };
  });

  const css = document.getAnimations().map((a) => ({
    type: a.constructor.name, name: a.animationName || a.transitionProperty || null,
    target: a.effect?.target ? target(a.effect.target) : null,
    duration: a.effect?.getTiming().duration, iterations: a.effect?.getTiming().iterations, easing: a.effect?.getTiming().easing,
    keyframes: a.constructor.name === 'CSSAnimation' ? a.effect.getKeyframes().slice(0, 6) : undefined,
  }));
  const cssGrouped = Object.values(css.reduce((m, a) => { const k = `${a.type}|${a.name}|${a.target?.sel}`; (m[k] = m[k] || { ...a, count: 0 }).count++; return m; }, {}));

  window.__lab = { describe, target };
  return {
    libs: {
      gsap: gsap?.version, gsapAt: runtimes?.gsapAt, ScrollTrigger: Boolean(ScrollTrigger), ScrollTriggerAt: runtimes?.stAt,
      SplitText: Boolean(window.SplitText || gsap?.core?.globals?.()?.SplitText), CustomEase: Boolean(window.CustomEase || gsap?.core?.globals?.()?.CustomEase),
      Lenis: Boolean(window.Lenis) || Boolean(runtimes?.lenis?.length), Swiper: Boolean(window.Swiper), three: runtimes?.three || null, engines: runtimes?.engines || [],
      jquery: window.jQuery?.fn?.jquery, webflow: Boolean(window.Webflow), hls: Boolean(window.Hls), lottie: Boolean(window.lottie),
    },
    lenis: [...(window.__labLenis || []), ...(runtimes?.lenis || []).map((l) => ({ ...l.options, foundAt: l.at }))],
    triggers, pointer, loops, other, swipers, css: cssGrouped,
  };
}

const browser = await openBrowser(flags.cdp);
let result;
try {
  const { context, page } = await newPage(browser, vp, { reducedMotion: 'no-preference' });
  await page.addInitScript(INIT);
  const t0 = Date.now();
  await page.goto(meta.url, { waitUntil: 'load', timeout: 60000 });
  await page.mouse.move(5, vp.height - 5);
  const intro = await waitStill(page, { timeout: 15000, interval: 200 });
  const introMs = Date.now() - t0;
  await page.evaluate(`window.__labRuntimes = (${findRuntimes.toString()})()`);
  result = await page.evaluate(inventory);

  // Pointer probe at the top of the page: which elements react when the cursor moves?
  const probe = async (x, y) => { await page.mouse.move(x, y, { steps: 12 }); await page.waitForTimeout(1600); return page.evaluate(statesInPage); };
  const a = await probe(Math.round(vp.width * 0.3), Math.round(vp.height * 0.35));
  const b = await probe(Math.round(vp.width * 0.7), Math.round(vp.height * 0.65));
  const reactive = Object.keys(b).filter((k) => a[k] && (a[k].t !== b[k].t || a[k].o !== b[k].o || a[k].c !== b[k].c || a[k].f !== b[k].f || a[k].box.join() !== b[k].box.join()))
    .map((k) => ({ path: k, cls: b[k].cls, media: b[k].media, from: { t: a[k].t, o: a[k].o, c: a[k].c, f: a[k].f, box: a[k].box }, to: { t: b[k].t, o: b[k].o, c: b[k].c, f: b[k].f, box: b[k].box } }));
  reactive.sort((x, y) => x.path.length - y.path.length);
  const pruned = [];
  for (const r of reactive) if (!pruned.some((p) => r.path.startsWith(p.path + '>') && p.cls === r.cls)) pruned.push(r);
  // Scroll pass: callback-driven animations (onEnter reveals, SplitText) only exist once their trigger fires.
  // Record every tween/timeline that appears while scrolling, with the scroll position it appeared at.
  await page.mouse.move(5, vp.height - 5);
  await page.evaluate(() => {
    window.__labSeen = new WeakSet();
    if (window.__labGsap) window.__labGsap.globalTimeline.getChildren(true, true, true).forEach((a) => window.__labSeen.add(a));
  });
  const scan = () => page.evaluate(() => {
    const gsap = window.__labGsap;
    if (!gsap) return [];
    const out = [];
    for (const a of gsap.globalTimeline.getChildren(true, true, true)) {
      if (window.__labSeen.has(a)) continue;
      window.__labSeen.add(a);
      if (a.scrollTrigger || (a.parent && a.parent !== gsap.globalTimeline)) continue; // children are described with their parent
      const d = window.__lab.describe(a);
      const hasEls = d && (d.type === 'timeline' ? JSON.stringify(d).includes('"sel"') : d.targets.length);
      if (hasEls) out.push({ y: Math.round(scrollY), ...d });
    }
    return out;
  });
  const created = [];
  const maxY = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  for (let y = 0; y <= maxY + vp.height / 4; y += Math.round(vp.height / 4)) {
    await page.mouse.wheel(0, Math.round(vp.height / 4));
    for (let k = 0; k < 6; k++) { await page.waitForTimeout(100); created.push(...await scan()); }
  }
  // Collapse repeats (same targets + same vars) into one entry with every scroll position it fired at.
  const groups = new Map();
  for (const c of created) {
    const key = JSON.stringify({ ...c, y: 0 });
    const g = groups.get(key) || { ...c, firedAt: [] };
    g.firedAt.push(c.y);
    groups.set(key, g);
  }
  const onScroll = [...groups.values()].map(({ y, ...rest }) => rest);
  result = { url: meta.url, viewport: vp, capturedAt: new Date().toISOString(), intro: { ms: introMs, settled: intro.settled, continuousElements: intro.continuous || 0 }, ...result, pointerReactive: pruned.slice(0, 40), onScroll };
  await context.close();
} finally {
  if (!flags.cdp) await browser.close();
}

const out = path.join(ref, `motion.${vp.name}.json`);
await fs.writeFile(out, JSON.stringify(result, null, 2));

// Human-readable digest, grouped by section, for building the clone.
const lines = [`# Motion inventory: ${meta.url} (${vp.name} ${vp.width}x${vp.height})`, '',
  `Libraries: ${Object.entries(result.libs).filter(([, v]) => v).map(([k, v]) => (v === true ? k : `${k} ${v}`)).join(', ')}`,
  `Intro: settled after ${(result.intro.ms / 1000).toFixed(1)} s${result.intro.settled ? '' : ' (did not fully settle)'}; ${result.intro.continuousElements} continuously animating elements.`,
  `Lenis: ${result.lenis.length ? JSON.stringify(result.lenis) : 'not constructed through the global'}`, ''];
const tweenLine = (t, indent = '') => {
  if (!t) return [];
  if (t.type === 'timeline') return [`${indent}timeline ${t.duration}s${t.repeat ? ` repeat ${t.repeat}` : ''}`, ...t.children.flatMap((c) => tweenLine({ ...c }, indent + '  ').map((l, i) => (i === 0 ? l.replace(/^(\s*)/, `$1@${c.start}s `) : l)))];
  const props = Object.entries(t.vars).filter(([k]) => !['duration', 'ease', 'delay', 'overwrite', 'immediateRender', 'lazy', 'inherit', 'paused', 'stagger', 'startAt', 'repeat', 'yoyo'].includes(k)).map(([k, v]) => `${k}:${v}`).join(' ');
  const start = t.vars.startAt ? ` from {${Object.entries(t.vars.startAt).map(([k, v]) => `${k}:${v}`).join(' ')}}` : '';
  return [`${indent}${t.from ? 'from' : 'to'} [${t.targets.map((x) => x.sel).join(', ')}${t.targetCount > t.targets.length ? ` +${t.targetCount - t.targets.length}` : ''}]${t.split ? ' (split text)' : ''} ${props}${start} | ${t.duration}s ${t.vars.ease || ''}${t.vars.stagger !== undefined ? ` stagger ${JSON.stringify(t.vars.stagger)}` : ''}${t.repeat ? ` repeat ${t.repeat}${t.yoyo ? ' yoyo' : ''}` : ''}`];
};
const bySection = {};
for (const st of result.triggers) (bySection[st.trigger.section || st.trigger.sel || '(no element)'] ||= []).push(st);
lines.push(`## Scroll-driven (${result.triggers.length} ScrollTriggers)`, '');
for (const [sec, list] of Object.entries(bySection)) {
  lines.push(`### ${sec}`, '');
  for (const st of list) {
    lines.push(`- trigger \`${st.trigger.sel}\` start "${st.start}" end "${st.end}"${st.scrub !== false ? ` scrub ${st.scrub}` : ''}${st.pin ? ` pin \`${st.pin.sel}\`` : ''}${st.toggleActions ? ` toggleActions "${st.toggleActions}"` : ''}${st.once ? ' once' : ''}${st.callbacks.length ? ` callbacks ${st.callbacks.join(',')}` : ''}`);
    tweenLine(st.animation, '    ').forEach((l) => lines.push(l));
  }
  lines.push('');
}
lines.push(`## Created while scrolling (callback-driven: reveals, SplitText, toggles) - ${result.onScroll.length} distinct`, '',
  ...result.onScroll.flatMap((t) => [`- first at scrollY ${t.firedAt[0]}${t.firedAt.length > 1 ? ` (x${t.firedAt.length})` : ''}`, ...tweenLine(t, '    ')]), '');
lines.push(`## Pointer-driven (gsap.quickTo)`, '', ...result.pointer.map((p) => `- \`${p.target.sel}\` ${p.prop} ${p.duration}s ${p.ease}`), '');
lines.push(`## Elements that react to the cursor (probe)`, '', ...result.pointerReactive.map((r) => `- \`${r.cls || r.path}\`${r.media ? ` (${r.media})` : ''}: ${['t', 'o', 'c', 'f'].filter((k) => r.from[k] !== r.to[k]).map((k) => ({ t: 'transform', o: 'opacity', c: 'clip-path', f: 'filter' })[k]).join(', ') || 'position'}`), '');
lines.push(`## Endless loops`, '', ...result.loops.flatMap((t) => tweenLine(t, '- ')), '');
lines.push(`## Other standalone tweens/timelines`, '', ...result.other.flatMap((t) => tweenLine(t, '- ')), '');
lines.push(`## Sliders (Swiper)`, '', ...result.swipers.map((s) => `- \`${s.el.sel}\` ${s.slides} slides ${JSON.stringify(s.params)}`), '');
lines.push(`## CSS animations / transitions`, '', ...result.css.map((c) => `- ${c.type} ${c.name} on \`${c.target?.sel}\` x${c.count} ${c.duration}ms ${c.easing}${c.iterations === Infinity ? ' infinite' : ''}`), '');
await fs.writeFile(path.join(ref, `motion.${vp.name}.md`), lines.join('\n'));
console.log(`libs: ${JSON.stringify(result.libs)}`);
console.log(`intro ${result.intro.ms}ms settled=${result.intro.settled} | triggers ${result.triggers.length} | created-on-scroll ${result.onScroll.length} | pointer ${result.pointer.length} | cursor-reactive ${result.pointerReactive.length} | loops ${result.loops.length} | other ${result.other.length} | swipers ${result.swipers.length} | css ${result.css.length} | lenis ${result.lenis.length}`);
console.log(`-> ${path.relative(process.cwd(), out)} and motion.${vp.name}.md`);
