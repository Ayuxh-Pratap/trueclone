// Code-level evidence about the reference, with REA (Reverse Engineer Anything, bundled) doing the reading and
// trueclone owning the browser: which scripts actually run while a visitor scrolls and hovers (V8 coverage), which
// handler each interactive element has and where its code is (CDP listeners, with the source around it), which
// endpoints exist in the code (fired during the capture or not), original sources when the site publishes source
// maps. Written to reference/code.md (for the agent) and reference/code.json. The capture already knows what the
// page looks like and does; this says which code does it, so script.js copies rules instead of guessing them.
//
// usage: node scripts/understand.mjs <name> [--elements 40] [--observe-ms 20000]
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { VIEWPORTS, parseArgs, newPage, settle, wheelTo, withTimeout, siteDir } from './lib.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
const [name] = pos;
if (!name) {
  console.error('usage: trueclone understand <name> [--elements 40] [--observe-ms 20000]');
  process.exit(1);
}
const root = siteDir(name);
const ref = path.join(root, 'reference');
const meta = JSON.parse(await fs.readFile(path.join(ref, 'meta.json'), 'utf8'));
const MAX_ELEMENTS = Number(flags.elements || 40);
const OBSERVE_MS = Number(flags['observe-ms'] || 20000);
const vp = VIEWPORTS.find((v) => v.name === 'desktop');
const require = createRequire(import.meta.url);
const REA = path.join(path.dirname(require.resolve('rea-agents/package.json')), 'scripts', 'rea.mjs');
const reaVersion = JSON.parse(await fs.readFile(require.resolve('rea-agents/package.json'), 'utf8')).version;

// REA attaches to a loopback CDP endpoint it does not own: trueclone launches Chrome with a debugging port
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const port = await freePort();
const endpoint = `http://127.0.0.1:${port}`;
const launch = async () => {
  const args = [`--remote-debugging-port=${port}`];
  if (process.env.LAB_BROWSER !== 'chromium') { try { return await chromium.launch({ channel: 'chrome', args }); } catch { /* no Chrome */ } }
  return chromium.launch({ args });
};
const rea = (args, { timeout = 90000, onProgress } = {}) => new Promise((resolve) => {
  const child = spawn(process.execPath, [REA, ...args, '--format', 'json'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; if (onProgress) for (const line of String(d).split('\n')) if (line.includes('rea_progress')) onProgress(line); });
  const timer = setTimeout(() => { try { child.kill(); } catch { /* gone */ } }, timeout);
  child.on('close', (code) => {
    clearTimeout(timer);
    let json = null;
    try { json = JSON.parse(out); } catch { /* not JSON: an error */ }
    const errText = err.split('\n').filter((l) => l && !l.includes('rea_progress')).join('\n').slice(0, 600);
    resolve({ code, json, result: json?.normalized_result || null, err: errText || (json ? '' : `exit ${code}: ${out.slice(0, 400)}`) });
  });
});

// origins whose scripts count: the page's own and every origin that served a script during the capture
const har = await fs.readFile(path.join(ref, 'desktop.har'), 'utf8').then(JSON.parse).catch(() => null);
const harEntries = har?.log?.entries || [];
const origins = new Set([new URL(meta.url).origin]);
for (const e of harEntries) if (e._resourceType === 'script') { try { origins.add(new URL(e.request.url).origin); } catch { /* data: */ } }
const originArgs = [...origins].flatMap((o) => ['--allowed-origins', o]); // one flag per origin
const fired = new Set(harEntries.map((e) => e.request.url.split('?')[0]));

const browser = await launch();
const out = { name, url: meta.url, at: new Date().toISOString(), rea: reaVersion, scripts: [], handlers: [], endpoints: [], sourceMaps: [], unknowns: [], notes: [] };
try {
  const { page } = await newPage(browser, vp, { reducedMotion: 'no-preference' });
  await page.goto(meta.url, { waitUntil: 'load', timeout: 60000 });
  await settle(page, meta.hide || []);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  const targets = await rea(['list-browser-targets', endpoint, ...originArgs]);
  const target = (targets.result?.targets || []).find((t) => (t.url || '').startsWith(meta.url.replace(/\/$/, ''))) || (targets.result?.targets || [])[0];
  if (!target) throw new Error(`REA found no page target at ${endpoint}: ${targets.err || 'no output'}`);
  const tid = target.target_id;

  // 1. the bundle: scripts, chunk edges, endpoints and routes in the code, source maps when published
  const bundle = await rea(['analyze-web-bundle', endpoint, tid, '--fetch-source-maps', '--observation-ms', '1500', ...originArgs], { timeout: 180000 });
  const obs = bundle.result?.observations || {};
  const nodes = obs.chunks?.nodes || [];
  const byKey = new Map(nodes.map((n) => [n.script_key, n]));
  // an endpoint is a URL or a path; a `.get("EXT_blend_minmax")` on a WebGL context is not one
  const TRACKING = /google-analytics|googletagmanager|doubleclick|facebook\.(com|net)|hotjar|segment\.(io|com)|plausible|cloudflareinsights|clarity\.ms|sentry|datadog|mixpanel|amplitude|posthog|intercom|hubspot|challenges\.cloudflare|recaptcha|hcaptcha|turnstile/i;
  const urlish = (v) => /^(https?:)?\/\/[^\s]+$/.test(v) || /^\.{0,2}\/[\w./-]+/.test(v) || /^wss?:\/\//.test(v);
  out.endpoints = (obs.endpoints || []).filter((e) => typeof e.value === 'string' && urlish(e.value.trim()) && !/^(call:.*\.get|call:.*\.request)$/.test(e.mechanism || '') || /fetch|xhr|websocket|axios|beacon/i.test(e.mechanism || '') && urlish(String(e.value)))
    .map((e) => ({ value: e.value, mechanism: e.mechanism, script: byKey.get(e.location?.script_key)?.url || e.location?.script_key, line: e.location?.line, fired: fired.has(String(e.value).split('?')[0]), tracking: TRACKING.test(e.value) }));
  out.routes = (obs.routes || []).map((r) => r.value || r.path || JSON.stringify(r)).slice(0, 40);
  out.sourceMaps = (obs.source_maps?.items || []).map((m) => ({ script: byKey.get(m.script_key)?.url || m.script_key, status: m.status, sources: (m.sources || m.original_sources || []).slice(0, 20) }));
  out.unknowns.push(...(bundle.result?.unknowns || []).map((u) => `${u.dimension}: ${u.reason}`));
  if (!bundle.result) out.notes.push(`analyze-web-bundle gave no result: ${bundle.err}`);

  // 2. what ran: coverage while trueclone scrolls through the page and hovers what a visitor hovers
  const interactive = await page.evaluate((max) => {
    const SEL = 'a[href], button, [role="button"], [role="tab"], summary, input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const uniq = (el) => {
      if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) return `#${CSS.escape(el.id)}`;
      const parts = [];
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const i = [...n.parentElement.children].indexOf(n) + 1;
        parts.unshift(`${n.tagName.toLowerCase()}:nth-child(${i})`);
      }
      return `body > ${parts.join(' > ')}`;
    };
    const seen = new Set();
    const list = [];
    // a plain link navigates; it only has behaviour when it is wired to something (a hash, no real href, aria/data hooks)
    const behaves = (el) => el.tagName !== 'A' || /^(#|javascript:|$)/.test((el.getAttribute('href') || '').trim()) || [...el.attributes].some((a) => /^(data-|aria-controls|aria-expanded|role)/.test(a.name));
    for (const el of document.querySelectorAll(SEL)) {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.top + scrollY < 0 || !el.checkVisibility?.() || !behaves(el)) continue;
      const sig = `${el.tagName}.${el.className}`;
      if (seen.has(sig) && list.length > max / 2) continue; // repeated rows share handlers: a few of each is enough
      seen.add(sig);
      list.push({ selector: uniq(el), label: `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).trim().split(/\s+/).slice(0, 2).join('.')}` : ''}`, text: (el.textContent || '').trim().slice(0, 40), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + scrollY + r.height / 2) });
      if (list.length >= max) break;
    }
    // delegated handlers live on the roots: a click on any row is handled here
    for (const sel of ['body', 'html']) list.push({ selector: sel, label: sel, text: '', x: 2, y: 2, root: true });
    return list;
  }, MAX_ELEMENTS);

  let armed = false;
  const observing = rea(['observe-web-execution', endpoint, tid, '--observation-ms', String(OBSERVE_MS), ...originArgs], { timeout: OBSERVE_MS + 60000, onProgress: (l) => { if (l.includes('armed')) armed = true; } });
  for (let i = 0; i < 50 && !armed; i++) await page.waitForTimeout(100);
  const t0 = Date.now();
  const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const step = Math.round(vp.height / 2);
  for (let y = step; y <= max && Date.now() - t0 < OBSERVE_MS * 0.6; y += step) { await wheelTo(page, y, vp); await page.waitForTimeout(150); }
  for (const el of interactive.filter((e) => !e.root).slice(0, 12)) {
    if (Date.now() - t0 > OBSERVE_MS * 0.9) break;
    await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - innerHeight / 2)), el.y);
    await page.waitForTimeout(120);
    const vy = el.y - (await page.evaluate(() => scrollY));
    await page.mouse.move(el.x, vy, { steps: 4 }).catch(() => {});
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  const exec = await observing;
  const cov = exec.result?.coverage || {};
  const sourceText = new Map();
  for (const s of exec.result?.sources || []) if (s.source?.text) sourceText.set(String(s.script_id), { url: s.url, text: s.source.text });
  // scripts without a URL are the page's inline <script> blocks, or the automation's own helpers: only the former count
  const rendered = await fs.readFile(path.join(ref, 'rendered.html'), 'utf8').catch(() => '');
  const inlineIndex = new Map();
  const labelOf = (s) => {
    if (s.reported_url) return s.reported_url;
    const text = sourceText.get(String(s.script_id))?.text || '';
    const head = text.trim().slice(0, 80);
    if (!head || !rendered.includes(head)) return null;
    if (!inlineIndex.has(head)) inlineIndex.set(head, inlineIndex.size + 1);
    return `inline <script> #${inlineIndex.get(head)} ("${head.slice(0, 40).replace(/\s+/g, ' ')}…")`;
  };
  out.scripts = (cov.scripts || []).map((s) => {
    const url = labelOf(s);
    if (!url) return null;
    const fns = s.functions || [];
    const ran = fns.filter((f) => f.ranges?.some((r) => r.count > 0)).map((f) => f.name).filter(Boolean);
    return { url, functionsRan: ran.length, functions: fns.length, bytes: sourceText.get(String(s.script_id))?.text.length || null, ranNames: ran.slice(0, 12) };
  }).filter(Boolean).sort((a, b) => b.functionsRan - a.functionsRan);
  if (!exec.result) out.notes.push(`observe-web-execution gave no result: ${exec.err}`);

  // 3. handlers: the listener on each interactive element and the code around it
  // readable source: lines around the handler; in a minified one-line bundle, a window of characters around the column
  const excerpt = (text, line, column = 0, before = 3, after = 22) => {
    const lines = text.split('\n');
    const at = lines[line] || '';
    if (at.length > 400) {
      const from = Math.max(0, column - 500), to = Math.min(at.length, column + 900);
      return `${line + 1}:${column}  (minified, ${at.length} chars on this line; ${from}-${to} shown)\n${at.slice(from, to).replace(/;/g, ';\n')}`;
    }
    const from = Math.max(0, line - before);
    return lines.slice(from, Math.min(lines.length, line + after)).map((l, i) => `${String(from + i + 1).padStart(5)}  ${l.length > 160 ? `${l.slice(0, 160)}…` : l}`).join('\n');
  };
  const seenLoc = new Map();
  for (const el of interactive) {
    const r = await rea(['inspect-web-event-listeners', endpoint, tid, el.selector, ...originArgs], { timeout: 60000 });
    const listeners = r.result?.listeners || [];
    for (const s of r.result?.sources || []) if (s.source?.text && !sourceText.has(String(s.script_id))) sourceText.set(String(s.script_id), { url: s.url, text: s.source.text });
    const entry = { selector: el.selector, label: el.label, text: el.text, y: el.y, listeners: [] };
    for (const l of listeners) {
      const loc = l.location || {};
      const key = `${loc.url}:${loc.line_number}:${loc.column_number}`;
      const src = sourceText.get(String(loc.script_id));
      const listener = { type: l.type, url: loc.url, line: (loc.line_number ?? 0) + 1, column: loc.column_number, fn: loc.function_name || null, sharedWith: seenLoc.get(key) || null, code: !seenLoc.has(key) && src ? excerpt(src.text, loc.line_number ?? 0, loc.column_number ?? 0) : null };
      if (!seenLoc.has(key)) seenLoc.set(key, el.label);
      entry.listeners.push(listener);
    }
    if (!listeners.length && r.result?.selected_node?.match === 'found') entry.note = 'no direct listener: delegated (an ancestor, a framework root) or CSS-only';
    if (!r.result) entry.note = `not inspected: ${r.err.split('\n')[0] || 'no output'}`;
    out.handlers.push(entry);
  }
} finally {
  await browser.close();
}

// code.md
const md = [];
md.push(`# ${name}: code evidence`, '', `Reference ${meta.url}, read ${out.at} with REA ${out.rea} through \`trueclone understand\` (trueclone owned the browser; REA observed, never clicked or evaluated). Observed facts only; what REA could not see is under Unknowns.`, '');
md.push('## Scripts, by how much of them ran while scrolling the page and hovering its controls', '', '| script | functions that ran | of | names |', '|---|---|---|---|');
for (const s of out.scripts) md.push(`| ${s.url} | ${s.functionsRan} | ${s.functions} | ${s.ranNames.join(', ')} |`);
if (!out.scripts.length) md.push('| (no coverage captured) | | | |');
md.push('', 'A script with nothing that ran is not needed for what the page does on a scroll-through; start from the ones at the top.', '');
md.push('## Handlers on interactive elements', '', 'What `script.js` has to reproduce, with the original code around each handler (read the rule, write your own). Elements that share one handler are listed once.', '');
for (const h of out.handlers) {
  const direct = h.listeners.filter((l) => !l.sharedWith);
  const shared = h.listeners.filter((l) => l.sharedWith);
  if (!h.listeners.length && !h.note) continue;
  md.push(`### \`${h.label}\`${h.text ? ` "${h.text}"` : ''} at y ${h.y}`, '', `selector: \`${h.selector}\``);
  if (h.note) md.push(`- ${h.note}`);
  for (const l of shared) md.push(`- ${l.type} → ${l.url}:${l.line} (same handler as \`${l.sharedWith}\`)`);
  for (const l of direct) {
    md.push(`- ${l.type} → ${l.url}:${l.line}${l.fn ? ` (${l.fn})` : ''}`);
    if (l.code) md.push('', '```js', l.code, '```');
  }
  md.push('');
}
md.push('## Endpoints in the code', '', '| endpoint | how | where | fired during the capture |', '|---|---|---|---|');
for (const e of out.endpoints) md.push(`| ${e.value} | ${e.mechanism}${e.tracking ? ' (tracking: never copied)' : ''} | ${e.script}:${e.line ?? '?'} | ${e.fired ? 'yes (response in desktop.har)' : 'no: a form, a later state or a condition the capture did not reach'} |`);
if (!out.endpoints.length) md.push('| (none found in the scripts) | | | |');
if (out.routes?.length) md.push('', `Routes in the code: ${out.routes.join(', ')}`);
md.push('', '## Source maps', '');
md.push(out.sourceMaps.length ? out.sourceMaps.map((m) => `- ${m.script}: ${m.status}${m.sources.length ? `; originals: ${m.sources.join(', ')}` : ''}`).join('\n') : '- none published: the scripts are read as shipped (minified where minified)');
md.push('', '## Unknowns', '');
md.push([...out.unknowns, ...out.notes].length ? [...out.unknowns, ...out.notes].map((u) => `- ${u}`).join('\n') : '- none reported');
md.push('', 'Deeper, by hand: `npx trueclone rea <command>` (REA\'s own CLI; `npx trueclone rea --help`).', '');
await fs.writeFile(path.join(ref, 'code.md'), md.join('\n'));
await fs.writeFile(path.join(ref, 'code.json'), JSON.stringify(out, null, 2));
console.log(`understand: ${out.scripts.length} script(s) with coverage (${out.scripts.filter((s) => s.functionsRan).length} ran), ${out.handlers.filter((h) => h.listeners.length).length}/${out.handlers.length} elements with a direct handler, ${out.endpoints.length} endpoint(s) in code (${out.endpoints.filter((e) => e.fired).length} fired), ${out.sourceMaps.length} source map(s)`);
console.log(`-> ${path.relative(process.cwd(), path.join(ref, 'code.md'))}`);
