// Every required result, accounted for (docs/policy.md "Outcomes"). status calls this before any terminal outcome and
// writes it into compare/outcome.json; REPORT lists it; tools/audit-run.mjs recomputes the required set on its own and
// checks that the two sets of ids are equal.
//
// An item is a required unit (check, route, size, state; the interaction plan included), a review frame, a review
// folder not shot yet, a written check (notes, coverage) or a clone lint finding, on the clone or on the app. Each has
// exactly one disposition:
//   passed          pass, accepted with evidence, or nothing to measure; a review frame closed by eye
//   unresolved      a difference the loop worked and concluded (its best and current values are in loop.json)
//   failing         Blocked outcomes only: measured below its bar, the clone's, still open when the run stopped
//   not-verifiable  the tool cannot measure it here (the reference does not match itself, a scenario it cannot run)
//   blocked         it cannot be measured after its bounded recovery (an error owned by the tool or the environment),
//                   or what trueclone generated is at fault (a lint finding in the seed's own output)
//   pending         anything else: missing, stale, invalid, an error not yet retried, a failing result still being
//                   worked, a frame without a verdict. Never part of a terminal outcome: status schedules it, and if it
//                   cannot, that is itself a defect (Blocked, owner tool)
// RC6: an error seen twice and an interaction plan never run were in none of these; status said "Incomplete … the clone
// and the app are verified as they are" with nothing listed.
import { unitName } from './verdict.mjs';
import { objectiveKey } from './loop.mjs';
import { errorOwner } from './failures.mjs';

export const itemId = (side, kind, rest) => `${side}:${kind}:${rest}`;

// blockedBy ({ owner, why }): the outcome is Blocked. Every item still pending was not reached because of that cause, so
// it is "blocked", owned by the blocker's owner, its reason "not reached" with the cause: a terminal outcome never
// leaves an item pending (RC7 elise: a Blocked outcome recorded 323 items pending and none blocked).
export function account({ evs, loop, blockedUnits = new Set(), declared = {}, blockedBy = null }) {
  const all = [];
  for (const ev of evs) {
    if (!ev || ev.missingCapture) continue;
    const side = ev.side;
    for (const u of ev.units) {
      const id = itemId(side, 'unit', `${u.check}|${u.route || ''}|${u.viewport || ''}|${u.state || ''}`);
      const label = `${side === 'app' ? 'Next.js app: ' : ''}${unitName(u)}${u.plan ? ' (interaction plan)' : ''}`;
      const o = loop?.objectives?.[objectiveKey(side, u)];
      let disposition = 'pending', owner = null, reason = u.reason || null;
      if (['pass', 'accepted', 'na'].includes(u.status)) disposition = 'passed';
      else if (u.status === 'tool') { disposition = 'not-verifiable'; owner = u.owner || 'tool'; }
      else if (u.status === 'error' && blockedUnits.has(id)) { disposition = 'blocked'; owner = blockedUnits.get?.(id) || 'tool'; }
      else if (['fail', 'error'].includes(u.status) && o?.state === 'concluded') { disposition = 'unresolved'; owner = o.owner || 'clone'; reason = `${o.concludedWhy}; best ${o.bestValue ?? '–'}, now ${o.lastValue ?? '–'}`; }
      else if (u.status === 'fail') { owner = 'clone'; reason = `${u.value ?? '–'} against ${u.bar ?? '–'}${(u.membersBelow || []).length ? `; ${u.membersBelow.length} frame(s) below their floor` : ''}`; }
      all.push({ id, side, kind: 'unit', label, state: u.status, disposition, owner, reason });
    }
    const rv = ev.review || { frames: [], missingDirs: [] };
    for (const f of rv.frames) {
      const id = itemId(side, 'frame', `${f.dir}|${f.id}`);
      const o = loop?.objectives?.[`${side}:review:${f.dir}:${f.id}`];
      let disposition = 'pending', owner = null;
      if (f.state === 'closed') disposition = 'passed';
      else if (f.state === 'differs' && o?.state === 'concluded') { disposition = 'unresolved'; owner = o.owner || 'clone'; }
      else if (declared[id]) { disposition = declared[id].disposition; owner = declared[id].owner; }
      all.push({ id, side, kind: 'frame', label: `${side === 'app' ? 'Next.js app: ' : ''}review frame ${f.id} (${f.size})`, state: f.state, disposition, owner, reason: f.why || f.verdict || null });
    }
    for (const d of rv.missingDirs) all.push({ id: itemId(side, 'review-dir', d.dir), side, kind: 'review-dir', label: `${side === 'app' ? 'Next.js app: ' : ''}review at ${d.size}${d.route ? ` ${d.route}` : ''}`, state: 'missing', disposition: 'pending', owner: null, reason: 'not shot yet' });
    const w = ev.written || {};
    if (w.notes) all.push({ id: itemId(side, 'written', 'notes'), side, kind: 'written', label: 'Notes (behaviours)', state: w.notes.pass ? 'pass' : 'fail', disposition: w.notes.pass ? 'passed' : 'pending', owner: w.notes.pass ? null : 'clone', reason: w.notes.pass ? null : 'Behaviours cite none of the site\'s code' });
    if (w.coverage) all.push({ id: itemId(side, 'written', 'coverage'), side, kind: 'written', label: 'Coverage (site code)', state: w.coverage.pass ? 'pass' : 'fail', disposition: w.coverage.pass ? 'passed' : 'pending', owner: w.coverage.pass ? null : 'clone', reason: w.coverage.pass ? null : `not cited: ${[...w.coverage.uncitedScripts].slice(0, 4).join(', ')}` });
    for (const [k, f] of (ev.lint?.findings || []).entries()) all.push({ id: itemId(side, 'lint', `${f.file}|${k}`), side, kind: 'lint', label: `Clone lint: ${f.file}`, state: 'fail', disposition: f.owner === 'tool' ? 'blocked' : 'pending', owner: f.owner || 'clone', reason: f.what });
  }
  // the written checks are shared: the app's notes and coverage are the clone's (one notes.md)
  const seen = new Set();
  const items = all.filter((i) => { const k = i.kind === 'written' ? `written:${i.id.split(':').pop()}` : i.id; if (seen.has(k)) return false; seen.add(k); return true; });
  // A Blocked run keeps what it measured: a result below its bar (a frame that differs, a written check that fails, a
  // lint finding) is "failing", the clone's, as measured; an error not yet retried is a measurement error, owned by what
  // it says; only what was never measured on this content (missing, stale, invalid, no verdict yet) was not reached
  // because of the cause (RC8 elise: 63 measured failures were relabelled "not reached", owner tool, and REPORT said
  // "313 cannot be measured; 0 not reached")
  if (blockedBy) for (const i of items) {
    if (i.disposition !== 'pending') continue;
    if (i.state === 'fail' || i.state === 'differs') Object.assign(i, { disposition: 'failing', owner: i.owner || 'clone' });
    else if (i.state === 'error') Object.assign(i, { disposition: 'blocked', owner: errorOwner({ error: i.reason || '' }), reason: `measurement error, not retried before the run stopped: ${i.reason || 'no message'}` });
    else Object.assign(i, { disposition: 'blocked', owner: blockedBy.owner || 'tool', reason: `not reached: the run is Blocked (${String(blockedBy.why || '').slice(0, 200)})${i.reason ? `; was: ${i.reason}` : ''}`, notReached: true });
  }
  const counts = { passed: 0, unresolved: 0, 'not-verifiable': 0, failing: 0, blocked: 0, pending: 0 };
  for (const i of items) counts[i.disposition]++;
  return { total: items.length, counts, ids: items.map((i) => i.id), items: items.filter((i) => i.disposition !== 'passed') };
}
