// What a visitor can operate on the page, found on the live reference and written as interaction scenarios
// (reference/interactions.auto.json), so behaviour is scored even when nobody wrote a scenario for it: horizontal
// scrollers and carousels (dragged, and stepped with their next button), tab lists, accordions, header menus and
// dialog triggers. Selectors are "selector@n" taken from the reference's markup, which the seed keeps, so the same
// selector finds the same element in the clone. interactions.json (the agent's) overrides a scenario by name, or
// retires it with { "name": "...", "skip": "<why>" }.

// In the page: candidates at this viewport, as scenarios. Runs on a settled page scrolled to the top.
export function detectInPage([vpName, compare, max, captured = null]) {
  const W = innerWidth, H = innerHeight;
  // visible to a visitor: a box, not hidden by itself or an ancestor (checkVisibility), and not inside a closed
  // disclosure (content of a closed <details> keeps a box, but nothing in it can be operated until it is opened)
  const closedDetails = (el) => { const d = el.closest('details:not([open])'); return d && !(el.tagName === 'SUMMARY' && el.parentElement === d) && !el.closest('summary') ? d : null; };
  const visible = (el, { inClosed = false } = {}) => {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) <= 0.05) return false;
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    return inClosed || !closedDetails(el);
  };
  // An id is used only when it reads like a name a developer gave (letters first, words): component libraries mint
  // ids per load ("2qrqcsbptab1", ":r3:", "radix-…"), and a selector built on one finds nothing on the next load.
  // words only: an id with a digit anywhere ("qdvimntab1", "tab-2qrqc") may be minted per load, and the element's
  // classes and position find it as well
  const stableId = (id) => /^[a-z]+([-_][a-z]+)*$/i.test(id);
  const selOf = (el) => {
    if (el.id && stableId(el.id) && !/^(radix|headlessui|react|mui|chakra|aria|tab|panel)[-_]/i.test(el.id) && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) return `#${CSS.escape(el.id)}`;
    const cls = [...el.classList].filter((c) => !/^(is-|has-|active|open|current|w--|swiper-slide-(active|next|prev))/.test(c) && !/[[\]:/]/.test(c)).slice(0, 2);
    const base = `${el.tagName.toLowerCase()}${cls.map((c) => `.${CSS.escape(c)}`).join('')}`;
    const all = [...document.querySelectorAll(base)];
    const i = all.indexOf(el);
    return i > 0 ? `${base}@${i}` : base;
  };
  const docTop = (el) => el.getBoundingClientRect().top + scrollY;
  const out = [];
  const used = new Set();
  const OFFSET = Math.round(H * 0.2); // the element is scrolled to the top, then this much back down: in view, not under a header
  const at = (el) => ({ ref: selOf(el), clone: selOf(el), offset: -OFFSET });
  const add = (s) => { if (out.length < max && !used.has(s.key)) { used.add(s.key); delete s.key; out.push({ viewport: vpName, compare, auto: true, ...s }); } };
  // What an element is, besides where it sits: its tag, its text or label, and for a link where it goes. A build whose
  // markup differs (a Next.js conversion renames every class) finds the same control by it when the selector finds
  // nothing there (interact.mjs); the reference and the HTML clone always find it by the selector
  const descOf = (el) => { const d = { tag: el.tagName.toLowerCase(), text: (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) }; if (el.matches('a[href]')) { try { d.to = new URL(el.href).pathname.replace(/\/+$/, '') || '/'; } catch { /* no address */ } } return d; };
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 32) || selOf(el);
  const inHeader = (el) => Boolean(el.closest('header, nav, [role="banner"], [role="navigation"]'));
  // RC6-18: a control behind a closed disclosure at this size (a nav collapsed behind a menu button: display:none, or
  // clipped to max-height 0 so it keeps a box no click reaches): the visible control that opens it, kept with the
  // scenario as a hint. operable() opens it only when the control itself cannot be clicked, and then writes the opening
  // click as the scenario's first step, so both sides are replayed the same way. The one that names the hidden part
  // (aria-controls) first; then a closed <details>; then, in the same header or nav, the nearest closed toggle
  // (aria-expanded="false") or a button named like a menu.
  const openerOf = (el) => {
    const named = [...document.querySelectorAll('[aria-controls][aria-expanded="false"]')].find((b) => !b.contains(el) && visible(b) && b.getAttribute('aria-controls').split(/\s+/).some((id) => document.getElementById(id)?.contains(el)));
    if (named) return selOf(named);
    const summary = closedDetails(el)?.querySelector(':scope > summary');
    if (summary && visible(summary)) return selOf(summary);
    const box = el.closest('header, [role="banner"]') || el.closest('nav, [role="navigation"]');
    for (let p = el.parentElement; box && p && box.contains(p); p = p.parentElement) {
      const b = [...p.querySelectorAll('button, [role="button"]')].find((x) => !x.contains(el) && visible(x) && (x.getAttribute('aria-expanded') === 'false' || /menu|burger|hamburger|toggle/i.test(`${x.getAttribute('aria-label') || ''} ${x.className?.baseVal ?? x.className} ${x.id}`)));
      if (b) return selOf(b);
    }
    return null;
  };
  // an address compared decoded, as routes.mjs samePath does (this runs in the page: it imports nothing)
  const routeKey = (p) => p.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } }).join('/');
  const nextNear = (el) => {
    for (let p = el, d = 0; p && d < 4; p = p.parentElement, d++) {
      const b = [...p.querySelectorAll('button, [role="button"], a')].find((x) => visible(x) && /next|forward|right|›|→|chevron-right|arrow-right/i.test(`${x.getAttribute('aria-label') || ''} ${x.className?.baseVal ?? x.className} ${x.textContent || ''}`) && !/prev|back|left/i.test(x.getAttribute('aria-label') || ''));
      if (b) return b;
    }
    return null;
  };

  // horizontal scrollers and carousels: a box that scrolls sideways, or a frame holding a track much wider than itself
  const scrollers = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 160 || r.height < 60 || r.width > W * 1.05) continue;
    const s = getComputedStyle(el);
    const scrolls = /(auto|scroll)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 24;
    const track = !scrolls && /(hidden|clip)/.test(s.overflowX) && [...el.children].find((c) => c.scrollWidth > el.clientWidth * 1.3 && c.children.length >= 3);
    if (!scrolls && !track) continue;
    if (scrollers.some((x) => x.el.contains(el) || el.contains(x.el))) continue;
    // A wide track a visitor cannot drag is not a carousel: a CSS marquee runs forever on its own (an infinite
    // animation inside), and a track no script made draggable shows none of the signs a drag handler leaves (a grab
    // cursor, touch-action for the browser to leave the horizontal pan to it, a carousel library's classes, a next
    // button).
    if (track) {
      const marquee = el.getAnimations({ subtree: true }).some((a) => a.effect?.getTiming?.().iterations === Infinity);
      const parts = [el, track, ...track.children].slice(0, 12);
      const draggable = parts.some((p) => { const ps = getComputedStyle(p); return /grab/.test(ps.cursor) || /pan-y|none|pinch-zoom/.test(ps.touchAction); })
        || /swiper|slick|splide|flickity|glide|embla|keen-slider|carousel|slider|owl-/i.test(`${el.className?.baseVal ?? el.className} ${track.className?.baseVal ?? track.className}`)
        || Boolean(nextNear(el));
      if (marquee || !draggable) continue;
    }
    scrollers.push({ el, moving: scrolls ? el : track });
  }
  for (const { el, moving } of scrollers) {
    const r = el.getBoundingClientRect();
    const y = Math.min(0.95, (OFFSET + r.height / 2) / H);
    const x1 = Math.min(0.95, (r.left + r.width * 0.75) / W), x2 = Math.max(0.05, (r.left + r.width * 0.25) / W);
    const next = nextNear(el);
    // a box that scrolls natively moves on the wheel (a mouse drag does nothing there); a carousel track on a drag
    const native = moving === el;
    const steps = native
      ? [{ wheel: { at: [+((r.left + r.width / 2) / W).toFixed(3), +y.toFixed(3)], dx: Math.round(r.width * 0.6) } }, { wait: 1200 }, { shot: 'after-scroll' }]
      : [{ drag: { from: [+x1.toFixed(3), +y.toFixed(3)], to: [+x2.toFixed(3), +y.toFixed(3)] } }, { wait: 1200 }, { shot: 'after-drag' }];
    if (next) steps.push({ click: { ref: selOf(next), clone: selOf(next), desc: descOf(next) } }, { wait: 1200 }, { shot: 'after-next' });
    add({ key: `scroll:${selOf(el)}`, name: `${native ? 'scroll' : 'swipe'} ${label(el)} (${vpName})`, at: at(el), steps, expectChange: { ref: selOf(moving), clone: selOf(moving), desc: descOf(moving) } });
  }

  // tab lists: the second and third tab; a tab list inside a closed disclosure (a mobile table of contents) is opened
  // first, as a visitor would (RC4 astro: six scenarios clicked tabs inside a closed <details> and could not run)
  for (const list of document.querySelectorAll('[role="tablist"]')) {
    const tabs = [...list.querySelectorAll('[role="tab"]')].filter((t) => visible(t, { inClosed: true }));
    if (tabs.length < 2) continue;
    const steps = [];
    const disclosure = closedDetails(list);
    const summary = disclosure?.querySelector(':scope > summary');
    if (disclosure && (!summary || !visible(summary))) continue;
    if (summary) steps.push({ click: { ref: selOf(summary), clone: selOf(summary), desc: descOf(summary) } }, { wait: 600 });
    for (const [i, t] of tabs.slice(1, 3).entries()) steps.push({ click: { ref: selOf(t), clone: selOf(t), desc: descOf(t) } }, { wait: 900 }, { shot: `tab-${i + 2}` });
    add({ key: `tabs:${selOf(list)}`, name: `tabs ${label(tabs[1])} (${vpName})`, at: at(list), steps, expectChange: { ref: selOf(tabs[1]), clone: selOf(tabs[1]), desc: descOf(tabs[1]) } });
  }

  // accordions: a closed disclosure outside the header (details/summary, or a button that expands what it controls)
  let accordions = 0;
  for (const el of document.querySelectorAll('details > summary, button[aria-expanded="false"][aria-controls], [role="button"][aria-expanded="false"][aria-controls]')) {
    if (accordions >= 2 || !visible(el) || inHeader(el)) continue;
    const target = el.tagName === 'SUMMARY' ? el.parentElement : el;
    add({ key: `acc:${selOf(el)}`, name: `expand ${label(el)} (${vpName})`, at: at(el), steps: [{ click: { ref: selOf(el), clone: selOf(el), desc: descOf(el) } }, { wait: 900 }, { shot: 'open' }], expectChange: { ref: selOf(target), clone: selOf(target), desc: descOf(target) } });
    accordions++;
  }

  // dialogs (RC4 ALLBIRDS-5: the footer's policy links, <a role="button" aria-controls="modal-refund-policy"> naming a
  // role="dialog", had no scenario): a visible control that says it opens one (aria-haspopup="dialog") or names a
  // closed one, by aria-controls, an invoker (commandfor, popovertarget), an in-page link (href="#id") or a data
  // attribute holding its id ("modal-x" or "#modal-x"). Open, then Escape; operable() checks on the reference that the
  // dialog really closes, and when Escape leaves it open, the dialog's own close control (`closer`) closes it instead.
  // One scenario per dialog, and per kind of control that names none (a dozen "quick add" buttons are one behaviour).
  // Anywhere on the page, the header too: a dialog opener is no menu.
  const DIALOG = 'dialog, [role="dialog"], [role="alertdialog"]';
  const dialogsById = new Map([...document.querySelectorAll(DIALOG)].filter((d) => d.id).map((d) => [d.id, d]));
  const NOT_A_TARGET = new Set(['id', 'class', 'style', 'aria-labelledby', 'aria-describedby', 'aria-label', 'aria-owns', 'aria-details', 'for', 'form', 'name']);
  const dialogOf = (el) => {
    for (const a of el.attributes) {
      if (NOT_A_TARGET.has(a.name)) continue;
      for (const v of a.value.split(/\s+/)) {
        const d = dialogsById.get(v.replace(/^#/, ''));
        if (d && !d.contains(el)) return d;
      }
    }
    return null;
  };
  const closerIn = (d) => {
    const c = [...d.querySelectorAll('button, [role="button"], a, input[type="button"], input[type="submit"]')]
      .find((x) => x.matches('[data-dismiss], [data-bs-dismiss], [command="close"], [command="request-close"], form[method="dialog"] *')
        || /close|dismiss/i.test(`${x.getAttribute('aria-label') || ''} ${x.getAttribute('title') || ''} ${x.className?.baseVal ?? x.className}`)
        || /^(close|dismiss|[×✕✖x])$/i.test(x.textContent.trim()));
    return c ? selOf(c) : null;
  };
  const dialogOpeners = new Set();
  let dialogs = 0;
  for (const el of document.querySelectorAll('button, a, [role="button"], input[type="button"]')) {
    if (dialogs >= 4 || !visible(el)) continue;
    const target = dialogOf(el);
    const says = el.getAttribute('aria-haspopup') === 'dialog';
    if (!target && !says) continue;
    // an open dialog is not opened by its control (a consent dialog already on screen); the control is still no menu
    dialogOpeners.add(el);
    if (target && visible(target)) continue;
    const before = out.length;
    add({ key: target ? `dialog:#${target.id}` : `dialog:${selOf(el).split('@')[0]}`, name: `dialog ${label(el)} (${vpName})`, at: { ref: 'body', clone: 'body', offset: Math.max(0, Math.round(docTop(el) - OFFSET)) }, steps: [{ click: { ref: selOf(el), clone: selOf(el), desc: descOf(el) } }, { wait: 1000 }, { shot: 'open' }, { key: 'Escape' }, { wait: 900 }, { shot: 'closed' }], expectChange: target ? { ref: selOf(target), clone: selOf(target) } : { ref: selOf(el), clone: selOf(el) }, dialog: { named: Boolean(target), closer: target ? closerIn(target) : null } });
    if (out.length > before) dialogs++;
  }

  // disclosures outside the header that the accordions above do not take (ALLBIRDS-5: product details, buttons with
  // aria-expanded and no aria-controls, or ones that start open): clicked, then clicked again, which closes a disclosure
  // (operable() checks on the reference that the second click puts it back as it was)
  let toggles = 0;
  for (const el of document.querySelectorAll('button[aria-expanded], [role="button"][aria-expanded]')) {
    if (toggles >= 3 || !visible(el) || inHeader(el) || dialogOpeners.has(el)) continue;
    if (el.getAttribute('aria-expanded') === 'false' && el.hasAttribute('aria-controls')) continue; // an accordion above
    const open = el.getAttribute('aria-expanded') === 'true';
    const before = out.length;
    add({ key: `toggle:${selOf(el)}`, name: `${open ? 'collapse' : 'expand'} ${label(el)} (${vpName})`, at: at(el), steps: [{ click: { ref: selOf(el), clone: selOf(el), desc: descOf(el) } }, { wait: 900 }, { shot: open ? 'collapsed' : 'open' }, { click: { ref: selOf(el), clone: selOf(el), desc: descOf(el) } }, { wait: 900 }, { shot: open ? 'open' : 'closed' }], expectChange: { ref: selOf(el), clone: selOf(el), desc: descOf(el) }, toggle: true });
    if (out.length > before) toggles++;
  }

  // navigation: every visible link to another route of the site (same host, not a file): click it, the address and the
  // view must be the reference's; then Back, and they must be again. The address is compared at every shot.
  // Addresses are compared decoded (/caf%C3%A9 is /café); a scenario names its route as the capture recorded it.
  // Visible links first; then links hidden at this size behind a menu a visitor can open (openerOf), a hidden link to a
  // route already drafted being another way to it (alts: a mobile drawer often repeats the desktop nav, hidden).
  const here = routeKey(location.pathname);
  const seenRoutes = new Map();
  let navs = 0;
  const links = [...document.querySelectorAll('a[href]')].map((a) => ({ a, shown: visible(a) }));
  for (const { a, shown } of [...links.filter((l) => l.shown), ...links.filter((l) => !l.shown)]) {
    let u;
    try { u = new URL(a.href); } catch { continue; }
    const raw = u.pathname.replace(/\/+$/, '') || '/';
    const k = routeKey(raw);
    if (u.host.replace(/^www\./, '') !== location.host.replace(/^www\./, '') || k === here || /\.(pdf|png|jpe?g|svg|webp|zip|mp4|xml|txt)$/i.test(raw) || a.target === '_blank') continue;
    // links to the captured routes when the caller names them (filtered before the cap, so a sidebar of uncaptured
    // pages never uses it up: RC4 astro had no desktop navigation from its start page), otherwise every route link
    const to = captured ? captured.find((c) => routeKey(c) === k) : raw;
    if (!to) continue;
    const opener = openerOf(a);
    if (!shown && !opener) continue;
    if (seenRoutes.has(k)) { const s = seenRoutes.get(k); if (!shown && s && (s.alts ||= []).length < 3) s.alts.push(selOf(a)); continue; }
    if (navs >= (captured ? 8 : 300)) { seenRoutes.set(k, null); continue; }
    navs++;
    const s = { key: `nav:${to}`, name: `go to ${to} (${vpName})`, at: { ref: 'body', clone: 'body', offset: Math.max(0, Math.round(docTop(a) - OFFSET)) }, steps: [{ click: { ref: selOf(a), clone: selOf(a), desc: descOf(a) } }, { wait: 1500 }, { shot: 'arrived' }, { back: true }, { wait: 1200 }, { shot: 'back' }], navigation: true, ...(opener ? { opener } : {}) };
    const had = out.length;
    add(s);
    seenRoutes.set(k, out.length > had ? out.at(-1) : null);
  }

  // header menus: a trigger that opens something, then Escape (dialog openers are the dialogs' above). A header toggle
  // that names nothing it controls (a mobile menu button: aria-expanded, no aria-controls, RC6-18) is closed as a
  // visitor closes it, by a second click: such menus rarely listen for Escape.
  let menus = 0;
  for (const el of document.querySelectorAll('[aria-haspopup]:not([aria-haspopup="false"]), [aria-expanded][aria-controls], button[aria-expanded="false"]:not([aria-controls]), [role="button"][aria-expanded="false"]:not([aria-controls])')) {
    if (menus >= 3 || !visible(el) || !inHeader(el) || dialogOpeners.has(el) || el.getAttribute('aria-haspopup') === 'dialog') continue;
    const toggle = !el.hasAttribute('aria-controls') && !el.hasAttribute('aria-haspopup');
    add({ key: `menu:${selOf(el)}`, name: `menu ${label(el)} (${vpName})`, at: { ref: 'body', clone: 'body', offset: Math.max(0, Math.round(docTop(el) - OFFSET)) }, steps: [{ click: { ref: selOf(el), clone: selOf(el), desc: descOf(el) } }, { wait: 1000 }, { shot: 'open' }, toggle ? { click: { ref: selOf(el), clone: selOf(el), desc: descOf(el) } } : { key: 'Escape' }, { wait: 900 }, { shot: 'closed' }], expectChange: { ref: selOf(el), clone: selOf(el), desc: descOf(el) } });
    menus++;
  }
  return out;
}

// On the live page the scenarios were found on (same size, scrolled to the top): keep a scenario only if the element
// its first click needs can actually be operated there (a trial click: visible, enabled, not covered, stable). RC4
// heybhaskar: two desktop links could not be clicked on either side and failed every score. The dropped ones are
// returned with the reason, never silently lost.
// RC6-18: an element hidden at this size behind a menu (the detection's `opener` hint) is tried again with the menu
// opened; when that works, the opening click becomes the scenario's first step (and a hidden twin of the link that
// works, `alts`, its click), so reference and clone are operated the same way. The menu is closed again after.
const OPEN_WAIT = 800; // a collapsed menu's transition (max-height, a slide) is over before its link is clicked
export async function operable(page, scenarios) {
  const kept = [], dropped = [];
  const el = (ref) => { const [sel, i] = ref.split('@'); return page.locator(sel).nth(Number(i || 0)); };
  const reason = (e) => String(e.message).split('\n')[0].slice(0, 120);
  for (const { opener, alts, dialog, toggle, ...s } of scenarios) {
    const step = (s.steps || []).find((st) => st.click && typeof st.click === 'object');
    const first = step?.click?.ref;
    if (!first) { kept.push(s); continue; }
    let why;
    try {
      await el(first).click({ trial: true, timeout: 2500 });
      why = null;
    } catch (e) { why = `its element ${first} cannot be clicked on the reference (${reason(e)})`; }
    if (!why) {
      const c = dialog || toggle ? await closes(page, el, s, first, dialog) : { s };
      if (c.why) dropped.push({ name: s.name, viewport: s.viewport, why: c.why }); else kept.push(c.s);
      continue;
    }
    let opened = null;
    if (opener) {
      try {
        await el(opener).click({ timeout: 2500 });
        await page.waitForTimeout(OPEN_WAIT);
        for (const ref of [first, ...(alts || [])]) {
          try {
            await el(ref).click({ trial: true, timeout: 1500 });
            opened = { ...s, steps: [{ click: { ref: opener, clone: opener } }, { wait: OPEN_WAIT }, ...s.steps.map((st) => (st === step ? { click: { ref, clone: ref } } : st))], opens: opener };
            break;
          } catch { /* not this one */ }
        }
        // closed again for the next scenario: a second click on a toggle that says it is open, or on a summary
        if (await el(opener).evaluate((b) => b.getAttribute('aria-expanded') === 'true' || (b.tagName === 'SUMMARY' && b.parentElement.open)).catch(() => false)) {
          await el(opener).click({ timeout: 2500 }).catch(() => {});
          await page.waitForTimeout(OPEN_WAIT);
        }
      } catch (e) { why += `; its menu ${opener} could not be opened (${reason(e)})`; }
      if (!opened && !/could not be opened/.test(why)) why += `; still not operable with its menu ${opener} opened`;
    }
    if (opened) kept.push(opened);
    else dropped.push({ name: s.name, viewport: s.viewport, why });
  }
  await page.evaluate(() => scrollTo(0, 0)).catch(() => {});
  return { kept, dropped };
}

// A scenario that opens something closes it again, or its last shot (and, here, every trial after it) starts from a
// page the reference never showed. Tried for real on the reference, as a visitor would: a dialog opened, then Escape;
// when Escape leaves it open, the dialog's own close control (`closer`) is clicked and that click replaces the Escape
// step, on both sides alike. A disclosure clicked twice is back as it was. A control that opens nothing here is kept
// (the check sets it aside: the reference does not react); one that cannot be closed is dropped with the reason, and the
// page is loaded again for the next trial.
// the dialogs on screen, each as a selector ("#id" when the id reads as a developer's name, else "<list>@n")
const DIALOGS = 'dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"]';
const openDialogs = (list) => [...document.querySelectorAll(list)].map((d, i) => {
  const r = d.getBoundingClientRect(), s = getComputedStyle(d);
  const shown = r.width >= 8 && r.height >= 8 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.05 && (!d.checkVisibility || d.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
  return shown ? (/^[a-z]+([-_][a-z]+)*$/i.test(d.id) ? `#${d.id}` : `${list}@${i}`) : null;
}).filter(Boolean);
async function closes(page, el, s, first, dialog) {
  const waits = s.steps.filter((st) => st.wait).map((st) => st.wait);
  const fresh = async () => { await page.reload({ waitUntil: 'load', timeout: 30000 }).catch(() => {}); await page.waitForTimeout(1500); };
  try {
    if (dialog) {
      const shown = () => page.evaluate(openDialogs, DIALOGS);
      const base = await shown();
      await el(first).click({ timeout: 2500 });
      await page.waitForTimeout(waits[0] || 1000);
      // nothing that reads as a dialog opened: kept as it is (Escape anyway, for whatever did open)
      const opened = (await shown()).filter((d) => !base.includes(d));
      if (!opened.length) { await page.keyboard.press('Escape'); return { s }; }
      // a control that names no dialog: the change expected is the dialog it opened (the control itself does not
      // change when a modal covers it: such a scenario read as "the reference does not react")
      if (!dialog.named) s = { ...s, expectChange: { ref: opened[0], clone: opened[0] } };
      await page.keyboard.press('Escape');
      await page.waitForTimeout(waits[1] || 900);
      if ((await shown()).length <= base.length) return { s };
      if (dialog.closer) {
        await el(dialog.closer).click({ timeout: 2500 }).catch(() => {});
        await page.waitForTimeout(waits[1] || 900);
        if ((await shown()).length <= base.length) return { s: { ...s, steps: s.steps.map((st) => (st.key === 'Escape' ? { click: { ref: dialog.closer, clone: dialog.closer } } : st)) } };
      }
      await fresh();
      return { why: `opens a dialog that neither Escape nor a close control in it${dialog.closer ? ` (${dialog.closer})` : ''} closes on the reference` };
    }
    const state = () => el(first).getAttribute('aria-expanded');
    const was = await state();
    await el(first).click({ timeout: 2500 });
    await page.waitForTimeout(waits[0] || 900);
    if ((await state()) === was) return { s };
    await el(first).click({ timeout: 2500 });
    await page.waitForTimeout(waits[1] || 900);
    if ((await state()) === was) return { s };
    await fresh();
    return { why: `a second click on ${first} does not put it back as it was on the reference (aria-expanded ${was})` };
  } catch (e) {
    await fresh();
    return { why: `could not be tried on the reference (${String(e.message).split('\n')[0].slice(0, 120)})` };
  }
}
