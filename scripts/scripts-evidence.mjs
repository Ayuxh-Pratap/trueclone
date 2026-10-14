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
    scripts.set(e.scriptId, { url: e.url, inline: e.url.split('#')[0] === pageUrl.split('#')[0], start: e.startLine });
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
      ({ listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId, depth: -1, pierce: true }));
    } catch { /* no listeners readable */ }
    const labels = new Map();
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
      if (!groups.has(key)) groups.set(key, { type: l.type, file: f?.file || null, url: f?.url || null, line: l.lineNumber + 1, column: l.columnNumber, elements: [] });
      const g = groups.get(key);
      if (g.elements.length < 6) g.elements.push(await labelOf(l.backendNodeId));
      else g.more = (g.more || 0) + 1;
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
