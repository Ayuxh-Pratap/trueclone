// Development only: serves the canvas-app fixture (http://127.0.0.1:5601/, an app of our own in the shape of a canvas
// experience) and its "CDN" on another origin (http://localhost:5602/, with CORS), for testing trueclone's app mode.
// usage: node tools/fixtures/serve-fixtures.mjs
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { serve } from '../../scripts/lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = await serve(path.join(here, 'canvas-app'), 5601);
http.createServer(async (req, res) => {
  const file = path.join(here, 'canvas-app-cdn', decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try { const body = await fs.readFile(file); res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }).end(body); }
  catch { res.writeHead(404, { 'access-control-allow-origin': '*' }).end(); }
}).listen(5602, 'localhost');
console.log(`fixture ${app.url}, its CDN http://localhost:5602/`);
