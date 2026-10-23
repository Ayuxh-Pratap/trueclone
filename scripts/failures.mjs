// What a failed measurement says, and whose it is (docs/policy.md "Failures and recovery").
//
// Every error unit carries the failing step's first error line, how it failed (errorKind: timeout, crash) and its log.
// Status classifies it before choosing a recovery, the same way every time:
//   environment  the network, DNS, the browser or the sandbox (the live reference did not load): retried once, then
//                Blocked (environment), with what to check
//   clone        a page of the clone that loads but crashes or hangs (its own script): retried once, then clone work
//                (an objective), counted and concluded like any other
//   tool         anything else: a step that crashed or ran out of time, a page the seed wrote that the clone server
//                cannot serve, an exception in trueclone: retried once (alone, so a race cannot repeat), then Blocked
//                (tool), with the error and its log
// RC6: status used to match a few words ("reference", "HTTP <digit>") and left every other repeated error unscheduled,
// unlisted, and the run "Incomplete" with nothing named.

// The line that says why a step failed: the first error (a JS error with its message, a browser net:: error, a
// timeout), never the last line of output, which on Windows is usually the Node version banner under a stack
export function failureLine(out) {
  const lines = String(out || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const pick = lines.find((l) => /^TIMEOUT\b/.test(l))
    || lines.find((l) => /^(\w*Error|Error)\b[:[]|^\w+Error:|net::ERR_|\bERR_[A-Z_]{4,}|^Unhandled|EPERM|ENOENT|EACCES|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/.test(l))
    || lines.filter((l) => !/^Node\.js v\d|^at\s|^\^+$|^file:\/\/|^node:internal/.test(l)).at(-1) || '';
  return pick.slice(0, 300);
}

const ENVIRONMENT = /ENOTFOUND|EAI_AGAIN|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_ACCESS_DENIED|ERR_NETWORK_CHANGED|ERR_PROXY|ERR_CONNECTION_(REFUSED|RESET|CLOSED|TIMED_OUT)(?![^]*127\.0\.0\.1)|ERR_TIMED_OUT(?![^]*127\.0\.0\.1)|live (site|reference|page)[^.]*(not|did not|does not|could not) load|reference (did not|does not|could not) load|browserType\.launch|Executable doesn't exist|Failed to launch|spawn .*chrome/i;
// the clone's own page (served on localhost) that crashed or never finished loading: its script's doing, as a rule
const CLONE = /(Target|Page) crashed|page\.goto: Timeout [\d,]+ms exceeded[^]*127\.0\.0\.1|Navigation timeout[^]*127\.0\.0\.1|net::ERR_ABORTED[^]*127\.0\.0\.1/i;

export function errorOwner(rec) {
  const text = `${rec?.error || rec?.reason || ''}`;
  if (rec?.errorKind === 'timeout') return 'tool';
  if (ENVIRONMENT.test(text)) return 'environment';
  if (CLONE.test(text)) return 'clone';
  return 'tool';
}
