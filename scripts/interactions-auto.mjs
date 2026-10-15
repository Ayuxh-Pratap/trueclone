// What a visitor can operate on the page, found on the live reference and written as interaction scenarios
// (reference/interactions.auto.json), so behaviour is scored even when nobody wrote a scenario for it: horizontal
// scrollers and carousels (dragged, and stepped with their next button), tab lists, accordions, header menus and
// dialog triggers. Selectors are "selector@n" taken from the reference's markup, which the seed keeps, so the same
// selector finds the same element in the clone. interactions.json (the agent's) overrides a scenario by name, or
// retires it with { "name": "...", "skip": "<why>" }.

// In the page: candidates at this viewport, as scenarios. Runs on a settled page scrolled to the top.
export function detectInPage([vpName, compare, max]) {
  const W = innerWidth, H = innerHeight;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.05;
  };
  const selOf = (el) => {
    if (el.id && !/\d{3,}|[:]|^radix|^headlessui|^react/.test(el.id) && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) return `#${CSS.escape(el.id)}`;
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
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 32) || selOf(el);
  const inHeader = (el) => Boolean(el.closest('header, nav, [role="banner"], [role="navigation"]'));
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
    if (next) steps.push({ click: { ref: selOf(next), clone: selOf(next) } }, { wait: 1200 }, { shot: 'after-next' });
    add({ key: `scroll:${selOf(el)}`, name: `${native ? 'scroll' : 'swipe'} ${label(el)} (${vpName})`, at: at(el), steps, expectChange: { ref: selOf(moving), clone: selOf(moving) } });
  }

  // tab lists: the second and third tab
  for (const list of document.querySelectorAll('[role="tablist"]')) {
    const tabs = [...list.querySelectorAll('[role="tab"]')].filter(visible);
    if (tabs.length < 2) continue;
    const steps = [];
    for (const [i, t] of tabs.slice(1, 3).entries()) steps.push({ click: { ref: selOf(t), clone: selOf(t) } }, { wait: 900 }, { shot: `tab-${i + 2}` });
    add({ key: `tabs:${selOf(list)}`, name: `tabs ${label(tabs[1])} (${vpName})`, at: at(list), steps, expectChange: { ref: selOf(tabs[1]), clone: selOf(tabs[1]) } });
  }

  // accordions: a closed disclosure outside the header (details/summary, or a button that expands what it controls)
  let accordions = 0;
  for (const el of document.querySelectorAll('details > summary, button[aria-expanded="false"][aria-controls], [role="button"][aria-expanded="false"][aria-controls]')) {
    if (accordions >= 2 || !visible(el) || inHeader(el)) continue;
    const target = el.tagName === 'SUMMARY' ? el.parentElement : el;
    add({ key: `acc:${selOf(el)}`, name: `expand ${label(el)} (${vpName})`, at: at(el), steps: [{ click: { ref: selOf(el), clone: selOf(el) } }, { wait: 900 }, { shot: 'open' }], expectChange: { ref: selOf(target), clone: selOf(target) } });
    accordions++;
  }

  // navigation: every visible link to another route of the site (same host, not a file): click it, the address and the
  // view must be the reference's; then Back, and they must be again. The address is compared at every shot.
  const here = location.pathname.replace(/\/+$/, '') || '/';
  const seenRoutes = new Set();
  let navs = 0;
  for (const a of document.querySelectorAll('a[href]')) {
    if (navs >= 8 || !visible(a)) continue;
    let u;
    try { u = new URL(a.href); } catch { continue; }
    const to = u.pathname.replace(/\/+$/, '') || '/';
    if (u.host.replace(/^www\./, '') !== location.host.replace(/^www\./, '') || to === here || seenRoutes.has(to) || /\.(pdf|png|jpe?g|svg|webp|zip|mp4|xml|txt)$/i.test(to) || a.target === '_blank') continue;
    seenRoutes.add(to);
    navs++;
    add({ key: `nav:${to}`, name: `go to ${to} (${vpName})`, at: { ref: 'body', clone: 'body', offset: Math.max(0, Math.round(docTop(a) - OFFSET)) }, steps: [{ click: { ref: selOf(a), clone: selOf(a) } }, { wait: 1500 }, { shot: 'arrived' }, { back: true }, { wait: 1200 }, { shot: 'back' }], navigation: true });
  }

  // header menus and dialogs: a trigger that opens something, then Escape
  let menus = 0;
  for (const el of document.querySelectorAll('[aria-haspopup]:not([aria-haspopup="false"]), [aria-expanded][aria-controls]')) {
    if (menus >= 3 || !visible(el)) continue;
    const dialog = el.getAttribute('aria-haspopup') === 'dialog';
    if (!dialog && !inHeader(el)) continue;
    add({ key: `menu:${selOf(el)}`, name: `${dialog ? 'dialog' : 'menu'} ${label(el)} (${vpName})`, at: { ref: 'body', clone: 'body', offset: Math.max(0, Math.round(docTop(el) - OFFSET)) }, steps: [{ click: { ref: selOf(el), clone: selOf(el) } }, { wait: 1000 }, { shot: 'open' }, { key: 'Escape' }, { wait: 900 }, { shot: 'closed' }], expectChange: { ref: selOf(el), clone: selOf(el) } });
    menus++;
  }
  return out;
}
