// Historical replay (docs/plan-rc5/PLAN.md 3.4): a measured RC4 series (docs/eval-rc4/projects/<run>.series.json) fed
// through the loop controller (scripts/loop.mjs) as if status had run after every score. Approximate by construction,
// and stated wherever its results are used:
//   - RC4 kept no per-checkpoint history: each score gives the mean per viewport, plus the one checkpoint status issued
//     after it (its worst) for one viewport. Each viewport's worst is carried forward until it is reported again (a
//     live run measures every checkpoint every time; taking the unreported viewport as having no checkpoint below its
//     floor made its shortfall jump by ~50 points from one score to the next, which is the data, not the loop); every
//     other checkpoint is taken as at or above its floor, so the shortfall here is a lower bound
//   - every score is taken as made on changed content (RC4 did not record content hashes)
//   - whenever the controller asks for a change of strategy, the agent is taken to record one at once, with evidence
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { observe, nextObjective, DEFAULTS } from '../../scripts/loop.mjs';
import { shortfallOf } from '../../scripts/verdict.mjs';

export function zeroScores(seriesFile) {
  const s = JSON.parse(fs.readFileSync(seriesFile, 'utf8')).filter((x) => x.kind === 'measured');
  const byT = new Map();
  for (const x of s) if (/^journey_(desktop|mobile)$/.test(x.metric)) { if (!byT.has(x.t)) byT.set(x.t, {}); byT.get(x.t)[x.metric.split('_')[1]] = x.value; }
  const issued = s.filter((x) => x.metric === 'status_issued_worst_checkpoint_pct').map((x) => ({ t: x.t, value: x.value, vp: /\((desktop|mobile) ([^)]+)\)/.exec(x.source)?.[1], id: /\((desktop|mobile) ([^)]+)\)/.exec(x.source)?.[2] }));
  const times = [...byT.keys()].sort();
  return times.filter((t) => byT.get(t).desktop !== undefined && byT.get(t).mobile !== undefined).map((t, i, all) => {
    const nextT = all[i + 1] || '9999';
    const worst = issued.find((w) => w.t > t && w.t < nextT && w.vp);
    return { t, desktop: byT.get(t).desktop, mobile: byT.get(t).mobile, worst };
  });
}

// active time: gaps under 15 minutes count (loop.mjs recordActivity)
export const activeHours = (times) => times.slice(1).reduce((n, t, i) => { const g = Date.parse(t) - Date.parse(times[i]); return n + (g < 15 * 60000 ? g : 0); }, 0) / 3600000;

export function replay(scores, params = {}) {
  const loop = { refId: 'r', params: { ...DEFAULTS, ...params }, startedAt: scores[0].t, objectives: {}, pending: null, run: { bestShortfall: null, sinceBest: 0, attempts: 0 }, passing: {}, regressions: [], errors: {}, events: [], activity: [] };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-replay-'));
  let notes = '## Attempts\n';
  const out = { concluded: {}, cycles: 0 };
  // each viewport's worst checkpoint, carried forward; before its first report, its first reported value
  const lastWorst = {};
  for (const sc of scores) if (sc.worst?.vp && !lastWorst[sc.worst.vp]) lastWorst[sc.worst.vp] = { id: sc.worst.id, value: sc.worst.value };
  scores.forEach((sc, i) => {
    const now = new Date(sc.t);
    if (sc.worst?.vp) lastWorst[sc.worst.vp] = { id: sc.worst.id, value: sc.worst.value };
    const units = ['desktop', 'mobile'].map((vp) => {
      const members = lastWorst[vp] ? [lastWorst[vp]] : [];
      const below = members.filter((m) => m.value < 80).map((m) => ({ ...m, name: m.id, bar: 80 }));
      const status = sc[vp] >= 95 && !below.length ? 'pass' : 'fail';
      const u = { check: 'journey', route: '', viewport: vp, state: '', status, value: sc[vp], bar: 95, membersBelow: below, record: { members } };
      u.shortfall = shortfallOf({ ...u, state: status });
      return u;
    });
    observe(loop, { side: 'clone', subjectHash: `h${i}`, units, review: { frames: [] } }, notes, root, now);
    out.cycles = i + 1;
    for (const o of Object.values(loop.objectives)) if (o.state === 'concluded' && !out.concluded[o.key]) out.concluded[o.key] = { i, t: sc.t, activeH: +activeHours(scores.slice(0, i + 1).map((x) => x.t)).toFixed(2), value: sc[o.key.split(':')[3]] ?? null, why: o.concludedWhy, attempts: o.attempts, best: o.bestShortfall };
    const pick = nextObjective(loop, 'clone');
    if (!pick) return;
    const o = loop.objectives[pick.key];
    if (o.strategyDue) {
      // the agent records a change of strategy with new evidence, then the next score is its attempt
      const ev = path.join(root, `evidence-${i}.txt`);
      fs.writeFileSync(ev, 'probe');
      fs.utimesSync(ev, new Date(Date.parse(sc.t) + 1000), new Date(Date.parse(sc.t) + 1000));
      notes += `- ${o.label}: what the last attempts showed and what changes now; evidence: ${path.basename(ev)}\n`;
      observe(loop, { side: 'clone', subjectHash: `h${i}`, units, review: { frames: [] } }, notes, root, new Date(Date.parse(sc.t) + 2000));
    }
    loop.pending = { key: pick.key, kind: pick.kind, side: 'clone', check: pick.check, subjectHash: `h${i}` };
  });
  out.loop = loop;
  return out;
}
