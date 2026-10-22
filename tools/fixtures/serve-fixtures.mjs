// Development only: serves the test fixtures, all our own code:
//   http://127.0.0.1:5601/  canvas-app, an app in the shape of a canvas experience (app mode)
//   http://localhost:5602/  its "CDN" on another origin (CORS), and a third-party widget script (widget.js)
//   http://127.0.0.1:5603/  doc-site, a document with every kind of change RC4 met (tools/fixtures/README.md)
// usage: node tools/fixtures/serve-fixtures.mjs
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { serve } from '../../scripts/lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = await serve(path.join(here, 'canvas-app'), 5601);
const doc = await serve(path.join(here, 'doc-site'), 5603);
http.createServer(async (req, res) => {
  const file = path.join(here, 'canvas-app-cdn', decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const type = file.endsWith('.js') ? 'text/javascript' : 'application/json';
  try { const body = await fs.readFile(file); res.writeHead(200, { 'content-type': type, 'access-control-allow-origin': '*' }).end(body); }
  catch { res.writeHead(404, { 'access-control-allow-origin': '*' }).end(); }
}).listen(5602, 'localhost');
console.log(`fixtures: ${app.url} (canvas app), its CDN and widget http://localhost:5602/, ${doc.url} (document)`);
