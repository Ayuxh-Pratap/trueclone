// The reference's own code, as evidence for the agent (never copied into the clone): every script the page ran, saved
// as shipped and as a readable copy, ranked by how much of it actually ran while the page loaded and was scrolled
// through (V8 precise coverage), with every element's event listeners pointing at file:line:col. This is what lets an
// agent port a scene's algorithm (a grid computed from the viewport, a spring, a scroll scene) instead of copying the
// numbers it produced at one screen size. Read through Chrome's DevTools protocol; no extra tool needed.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const TRACKING = /google-analytics|googletagmanager|gtag|doubleclick|facebook\.(com|net)|fbevents|hotjar|segment\.(io|com)|plausible|cloudflareinsights|clarity\.ms|sentry|datadog|mixpanel|amplitude|posthog|intercom|hubspot|hs-scripts|linkedin|licdn|tiktok|twitter|ads-twitter|redditstatic|marketo|munchkin|challenges\.cloudflare|recaptcha|hcaptcha|turnstile|cdn-cgi\/rum|debugbear/i;

// Before navigation: start collecting. Returns finish(), to call once the page has loaded and been scrolled through.
export async function startScriptEvidence(page, pageUrl) {
  const cdp = await page.context().newCDPSession(page);
  const scripts = new Map(); // scriptId -> { url, inline }
  cdp.on('Debugger.scriptParsed', (e) => {
    if (!e.executionContextAuxData?.isDefault) return; // the page's own world, not tooling
    if (!e.url) return; // eval'd code
    scripts.set(e.scriptId, { url: e.url, inline: e.url.split('#')[0] === pageUrl.split('#')[0], start: e.startLine, startColumn: e.startColumn });
  });
  await cdp.send('Debugger.enable');
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: false });

  return async function finish(outDir) {
    const { result: coverage } = await cdp.send('Profiler.takePreciseCoverage');
    await cdp.send('Profiler.stopPreciseCoverage').catch(() => {});
    // listeners anywhere in the document, with the element they sit on
    let listeners = [];
    try {
      const { result } = await cdp.send('Runtime.evaluate', { expression: 'document', objectGroup: 'tc' });
      ({ listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId, depth: -1, pierce: true, objectGroup: 'tc' }));
    } catch { /* no listeners readable */ }
    // Where a function really is: error trackers and frameworks wrap handlers (Sentry's __sentry_original__, zone.js,
    // rrweb), so the listener's own location is the wrapper's, the same line for every handler on the page. The
    // innermost original function is followed and its location used.
    const UNWRAP = `function () {
      const keys = ['__sentry_original__', '__zone_symbol__OriginalDelegate', '__rrweb_original__', '__original__', '__originalFunction', '__wrapped__', '_original', 'originalHandler', '__raven__'];
      let f = this, n = 0;
      for (; n < 6; n++) { let o = null; for (const k of keys) { try { if (typeof f[k] === 'function') { o = f[k]; break; } } catch {} } if (!o) break; f = o; }
      return n ? f : null;
    }`;
    const locationOf = async (objectId) => {
      const { internalProperties = [] } = await cdp.send('Runtime.getProperties', { objectId, ownProperties: true });
      return internalProperties.find((p) => p.name === '[[FunctionLocation]]')?.value?.value || null;
    };
    let unwrapped = 0;
    for (const l of listeners.slice(0, 3000)) {
      if (!l.handler?.objectId) continue;
      try {
        const { result } = await cdp.send('Runtime.callFunctionOn', { objectId: l.handler.objectId, functionDeclaration: UNWRAP, objectGroup: 'tc' });
        if (!result?.objectId) continue;
        const loc = await locationOf(result.objectId);
        if (loc) { Object.assign(l, { scriptId: loc.scriptId, lineNumber: loc.lineNumber, columnNumber: loc.columnNumber, unwrapped: true }); unwrapped++; }
      } catch { /* gone */ }
    }
    // React keeps one listener per event at its root; the handlers a visitor triggers live on each element's props
    // (__reactProps$…): onClick, onPointerDown, onScroll… Each is located like a listener and listed with its element.
    try {
      const { result } = await cdp.send('Runtime.evaluate', { objectGroup: 'tc', expression: `(() => {
        const out = [];
        for (const el of document.querySelectorAll('*')) {
          const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
          if (!key) continue;
          const props = el[key] || {};
          for (const [k, v] of Object.entries(props)) if (/^on[A-Z]/.test(k) && typeof v === 'function') out.push([el, k.slice(2).toLowerCase(), v]);
          if (out.length >= 400) break;
        }
        return out;
      })()` });
      if (result?.objectId) {
        const { result: items } = await cdp.send('Runtime.getProperties', { objectId: result.objectId, ownProperties: true });
        for (const it of items.filter((p) => /^\d+$/.test(p.name))) {
          const { result: parts } = await cdp.send('Runtime.getProperties', { objectId: it.value.objectId, ownProperties: true });
          const [el, type, fn] = ['0', '1', '2'].map((i) => parts.find((p) => p.name === i)?.value);
          if (!fn?.objectId) continue;
          const loc = await locationOf(fn.objectId);
          if (!loc) continue;
          const { node } = await cdp.send('DOM.describeNode', { objectId: el.objectId }).catch(() => ({}));
          listeners.push({ type: `${type.value} (React)`, scriptId: loc.scriptId, lineNumber: loc.lineNumber, columnNumber: loc.columnNumber, backendNodeId: node?.backendNodeId });
        }
      }
    } catch { /* not React, or not readable */ }
    if (unwrapped) console.log(`scripts: ${unwrapped} listener(s) traced past a wrapper (error tracking, zone.js) to the handler itself`);
    const labels = new Map();
    // where an element is on the page (desktop, document y), so a section's brief can list the handlers inside it
    const ys = new Map();
    const yOf = async (backendNodeId) => {
      if (!backendNodeId) return null;
      if (ys.has(backendNodeId)) return ys.get(backendNodeId);
      let y = null;
      try {
        const { object } = await cdp.send('DOM.resolveNode', { backendNodeId, objectGroup: 'tc' });
        const { result } = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: 'function () { if (!this.getBoundingClientRect) return null; const r = this.getBoundingClientRect(); return r.width || r.height ? Math.round(r.top + scrollY) : null; }', returnByValue: true });
        y = result.value ?? null;
      } catch { /* detached */ }
      ys.set(backendNodeId, y);
      return y;
    };
    const labelOf = async (backendNodeId) => {
      if (!backendNodeId) return 'window';
      if (labels.has(backendNodeId)) return labels.get(backendNodeId);
      let label = '?';
      try {
        const { node } = await cdp.send('DOM.describeNode', { backendNodeId });
        const attrs = {};
        for (let i = 0; i < (node.attributes || []).length; i += 2) attrs[node.attributes[i]] = node.attributes[i + 1];
        label = node.nodeName === '#document' ? 'document' : `${node.localName}${attrs.id ? `#${attrs.id}` : ''}${attrs.class ? `.${attrs.class.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}`;
      } catch { /* detached */ }
      labels.set(backendNodeId, label);
      return label;
    };

    await fs.rm(outDir, { recursive: true, force: true });
    await fs.mkdir(outDir, { recursive: true });
    const beautify = require('js-beautify').js;
    const files = new Map(); // scriptId -> record
    let n = 0;
    for (const [scriptId, s] of scripts) {
      let source = '';
      try { ({ scriptSource: source } = await cdp.send('Debugger.getScriptSource', { scriptId })); } catch { continue; }
      if (!source || source.length < 40) continue;
      const base = s.inline ? `inline-${++n}` : `${String(++n).padStart(2, '0')}-${(new URL(s.url).pathname.split('/').pop() || 'script').replace(/[^a-z0-9._-]/gi, '_').replace(/\.m?js$/i, '').slice(-60)}`;
      const file = `${base}.js`;
      await fs.writeFile(path.join(outDir, file), source);
      // a readable copy when the code is minified (long lines); line numbers in INDEX.md refer to the original
      const lines = source.split('\n');
      const minified = source.length / Math.max(1, lines.length) > 200;
      let pretty = null;
      if (minified && source.length < 3_000_000) {
        try { pretty = `${base}.pretty.js`; await fs.writeFile(path.join(outDir, pretty), beautify(source, { indent_size: 2, max_preserve_newlines: 1 })); } catch { pretty = null; }
      }
      const cov = coverage.find((c) => c.scriptId === scriptId);
      const fns = cov?.functions || [];
      const ran = fns.filter((f) => f.ranges?.[0]?.count > 0);
      files.set(scriptId, { file, pretty, url: s.inline ? `${s.url} (inline)` : s.url, bytes: source.length, functions: fns.length, functionsRan: ran.length, ranNames: [...new Set(ran.map((f) => f.functionName).filter(Boolean))].slice(0, 14), tracking: TRACKING.test(s.url) && !s.inline, source, start: s.start });
    }

    // listeners grouped by handler location
    const groups = new Map();
    for (const l of listeners) {
      const f = files.get(l.scriptId);
      const key = `${l.type}|${l.scriptId}|${l.lineNumber}|${l.columnNumber}`;
      // positions in the saved file: an inline script's are reported in the page (its first line starts at the
      // <script> tag's column), its file starts at line 1, column 0
      const s = scripts.get(l.scriptId) || {};
      const fileLine = l.lineNumber - (s.start || 0);
      const fileCol = fileLine === 0 ? l.columnNumber - (s.startColumn || 0) : l.columnNumber;
      if (!groups.has(key)) groups.set(key, { type: l.type, file: f?.file || null, url: f?.url || null, line: fileLine + 1, column: fileCol, elements: [], ys: [] });
      const g = groups.get(key);
      if (g.elements.length < 6) g.elements.push(await labelOf(l.backendNodeId));
      else g.more = (g.more || 0) + 1;
      if (g.ys.length < 40) { const y = await yOf(l.backendNodeId); if (y !== null) g.ys.push(y); }
    }
    const excerpt = (f, line, col) => {
      const text = f?.source.split('\n')[line - 1 - (f.inline ? 0 : 0)] || '';
      return text.length > 160 ? text.slice(Math.max(0, col - 40), col + 140) : text.trim();
    };
    const ranked = [...files.values()].sort((a, b) => b.functionsRan - a.functionsRan);
    const listenerRows = [...groups.values()].filter((g) => g.file && !files.get([...files.entries()].find(([, v]) => v.file === g.file)?.[0])?.tracking)
      .sort((a, b) => (a.file || '').localeCompare(b.file || '') || a.line - b.line);
    const md = [
      `# The reference's scripts (evidence, never copied)`,
      '',
      `Saved as the page shipped them (\`NN-name.js\`) and, when minified, as a readable copy (\`.pretty.js\`). Ranked by how much of each ran while the page loaded and was scrolled through. Read the algorithm, then write your own code: a value a script computes from the screen size must be computed again, not copied.`,
      '',
      '| file | ran | functions | size | from | names that ran |',
      '|---|---|---|---|---|---|',
      ...ranked.map((f) => `| [${f.file}](${f.file})${f.pretty ? ` ([readable](${f.pretty}))` : ''} | ${f.functionsRan} | ${f.functions} | ${Math.round(f.bytes / 1024)} KB | ${f.tracking ? 'tracking (never copy)' : f.url.slice(0, 90)} | ${f.ranNames.join(', ')} |`),
      '',
      '## Event listeners, by handler',
      '',
      'Line and column refer to the original file. Elements that share one handler are listed together; a handler on `document` or `window` usually serves every matching element below it (delegation).',
      '',
      '| event | handler | on | code at the handler |',
      '|---|---|---|---|',
      ...listenerRows.map((g) => { const f = [...files.values()].find((x) => x.file === g.file); return `| ${g.type} | ${g.file}:${g.line}:${g.column} | ${g.elements.join(', ')}${g.more ? ` +${g.more}` : ''} | \`${excerpt(f, g.line, g.column).replace(/\|/g, '\\|').replace(/`/g, "'")}\` |`; }),
      '',
    ].join('\n');
    await fs.writeFile(path.join(outDir, 'INDEX.md'), md);
    await fs.writeFile(path.join(outDir, 'scripts.json'), JSON.stringify({ scripts: ranked.map(({ source, ...r }) => r), listeners: listenerRows }, null, 2));
    await cdp.send('Debugger.disable').catch(() => {});
    await cdp.detach().catch(() => {});
    return { scripts: ranked.length, ran: ranked.filter((f) => f.functionsRan).length, listeners: listenerRows.length };
  };
}
