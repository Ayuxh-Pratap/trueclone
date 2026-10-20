// A canvas app in the shape of why.zero.university (a fixture for trueclone's app mode, our own code): a WebGL scene
// that fills the window, a page that never scrolls, a loader, a gesture gate, stages moved by a lerped virtual scroll,
// a hold button, a data fetch and a tracking call. Random particles, so a seeded Math.random matters.
const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl2');
const $ = (id) => document.getElementById(id);

const config = await fetch('/api/config.json').then((r) => r.json());
navigator.sendBeacon?.('https://tracker.example.invalid/collect', 'load');
// data from another origin (a CDN) and a write to a backend: the clone must serve the first and never send the second
const cdn = await fetch('http://localhost:5602/extra.json').then((r) => r.json()).catch(() => ({ label: 'The end (CDN missing)' }));
fetch('https://api.example.invalid/save', { method: 'POST', body: 'visited' }).catch(() => {});
const { stageShader } = await import('./stages.js');

const vert = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
const program = (frag) => {
  const pr = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vert], [gl.FRAGMENT_SHADER, frag]]) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); gl.attachShader(pr, s);
  }
  gl.linkProgram(pr);
  return pr;
};
const programs = config.stages.map((st) => program(stageShader(st)));
const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
const dots = Array.from({ length: 24 }, () => [Math.random(), Math.random()]);

let mode = 'loading', loaded = 0, target = 0, pos = 0, holdT = 0, holding = false;
const STAGES = config.stages.length;
const LERP = 0.08;
const resize = () => { canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio; gl.viewport(0, 0, canvas.width, canvas.height); };
addEventListener('resize', resize); resize();

// loader: counts to 100, then the gate
const t0 = performance.now();
// the gate: a circle drawn with the pointer (enough points, around a centre, closing on itself)
let stroke = [];
addEventListener('pointerdown', (e) => { if (mode === 'gate') stroke = [[e.clientX, e.clientY]]; });
addEventListener('pointermove', (e) => { if (mode === 'gate' && stroke.length) stroke.push([e.clientX, e.clientY]); });
addEventListener('pointerup', () => {
  if (mode !== 'gate' || stroke.length < 20) { stroke = []; return; }
  const cx = stroke.reduce((s, p) => s + p[0], 0) / stroke.length, cy = stroke.reduce((s, p) => s + p[1], 0) / stroke.length;
  const r = stroke.map((p) => Math.hypot(p[0] - cx, p[1] - cy));
  const mean = r.reduce((s, x) => s + x, 0) / r.length;
  const spread = Math.sqrt(r.reduce((s, x) => s + (x - mean) ** 2, 0) / r.length) / mean;
  const closes = Math.hypot(stroke[0][0] - stroke.at(-1)[0], stroke[0][1] - stroke.at(-1)[1]) < mean * 0.6;
  stroke = [];
  if (mean > 40 && spread < 0.25 && closes) { mode = 'stages'; $('gate').hidden = true; $('stage-label').hidden = false; }
});
// the virtual scroll: wheel and touch move a target, the position follows it
addEventListener('wheel', (e) => { if (mode === 'stages') target = Math.max(0, Math.min(STAGES - 1, target + e.deltaY / 1200)); }, { passive: true });
let touchY = null;
addEventListener('touchstart', (e) => { touchY = e.touches[0].clientY; }, { passive: true });
addEventListener('touchmove', (e) => { if (mode === 'stages' && touchY !== null) { target = Math.max(0, Math.min(STAGES - 1, target + (touchY - e.touches[0].clientY) / 600)); touchY = e.touches[0].clientY; } }, { passive: true });
// the hold button: 1.5 s pressed at the last stage
$('hold').addEventListener('pointerdown', () => { holding = true; });
addEventListener('pointerup', () => { holding = false; });

const frame = (now) => {
  const t = (now - t0) / 1000;
  if (mode === 'loading') {
    loaded = Math.min(100, Math.floor(t * 60));
    $('count').textContent = loaded;
    if (loaded >= 100) { mode = 'gate'; $('loader').hidden = true; $('gate').hidden = false; }
  }
  pos += (target - pos) * LERP;
  const k = Math.max(0, Math.min(STAGES - 1, Math.round(pos)));
  $('stage-n').textContent = k + 1;
  $('hold').hidden = !(mode === 'stages' && k === STAGES - 1 && Math.abs(pos - target) < 0.05);
  if (holding && mode === 'stages') { holdT += 1 / 60; if (holdT > 1.5) { mode = 'final'; $('hold').hidden = true; $('stage-label').hidden = true; $('final').hidden = false; $('final').textContent = cdn.label; } } else holdT = 0;
  const pr = programs[mode === 'final' ? STAGES - 1 : k];
  gl.useProgram(pr);
  const loc = gl.getAttribLocation(pr, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.uniform1f(gl.getUniformLocation(pr, 'uTime'), mode === 'final' ? 0 : t * 0);
  gl.uniform1f(gl.getUniformLocation(pr, 'uMix'), mode === 'loading' ? loaded / 100 : mode === 'gate' ? 0.15 : pos - Math.floor(pos));
  gl.uniform2f(gl.getUniformLocation(pr, 'uRes'), canvas.width, canvas.height);
  gl.uniform2fv(gl.getUniformLocation(pr, 'uDots'), dots.flat());
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
