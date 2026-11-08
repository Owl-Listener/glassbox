// shared/checks/failure.js
//
// Check 5 · failure · "Failure is legible"
//
// Heuristic #12 (agent-design-primer): "When the agent fails, the user
// should know what failed, why, and what to do next. Silent retries
// teach over-trust. Failure made visible builds trust."
// Anti-pattern: "Silent retry"
//
// Applies when the product calls an AI model. Four questions:
//
//   1. Do errors reach the user?                         40 points
//   2. Is there a way to recover (retry / regenerate)?   20 points
//   3. Are errors in AI code handled, not swallowed?     20 points
//   4. Is the error copy specific, not "Something went   20 points
//      wrong"?

import { stripComments } from '../signals.js';
import { matchingBracket } from '../tools.js';

// Signs the product talks to a model at all.
const MODEL_CALL = /\buse(Chat|Completion|Assistant|Object)\s*(?:<[^>()]*>)?\s*\(|\b(stream|generate)(Text|Object|UI)\s*\(|\.stream\s*\(|\bmessages\.create\s*\(|\bcompletions\.create\s*\(|\bresponses\.create\s*\(/;

// Files where a swallowed error would hide an AI failure from the user:
// they call a model, define tools, or run the chat UI.
const AI_FILE = /\buse(Chat|Completion|Assistant)\s*(?:<[^>()]*>)?\s*\(|\b(stream|generate)(Text|Object|UI)\s*\(|(?<![\w.$])(tool|dynamicTool)\s*\(|\bmessages\.create\s*\(|\bcompletions\.create\s*\(/;

const isUiFile = (f) => /\.(tsx|jsx)$/.test(f.path);

// Chat-related code: AI files plus UI that renders messages or tool
// calls. Generic copy on a login form is real, but it isn't an AI
// failure, so it's out of scope here.
const isChatFile = (f) => AI_FILE.test(f.content) || /\bmessages\b|<\w*Message\b|\.parts\b|ToolUIPart|toolInvocation/.test(f.content);

// 1. The UI reads the error. The Vercel AI SDK's useChat returns
//    `error` and a `status` that becomes 'error'. Toasts, setError and
//    role="alert" cover hand-written chats.
const ERROR_UI = [
  // Anchored on const/let so evidence points at the destructuring, not
  // an earlier "{" such as the component's function body.
  { name: 'Error from chat hook', pattern: /\b(const|let|var)\s*\{[^}]*\berror\b[^}]*\}\s*=\s*use(Chat|Completion|Assistant|Object)\b/ },
  { name: 'Error status', pattern: /\bstatus\s*===?\s*['"]error['"]/ },
  { name: 'Chat error', pattern: /\bchat\.error\b/ },
  { name: 'Error toast or state', pattern: /\btoast\.error\s*\(|\bsetError\s*\(|\bonError\s*:\s*\(?\s*\w*\s*\)?\s*=>/ },
  { name: 'Alert role', pattern: /\brole\s*=\s*["']alert["']/ },
];

// 2. A way to try again.
const RECOVERY = /\b(reload|regenerate|retry|onRetry|handleRetry)\s*\(|\bonClick\s*=\s*\{\s*(reload|regenerate|retry|onRetry|handleRetry)\b|>\s*(Try again|Retry|Regenerate)\b/i;

// 3. catch blocks. We find `catch (e) {` and `.catch(` and look inside.
const CATCH_BLOCK = /\bcatch\s*(\([^)]*\))?\s*\{/g;
const CATCH_CALL = /\.catch\s*\(/g;

/**
 * Does this code do nothing except log? Removes each console.x(…) /
 * logger.x(…) call by matching its brackets (so code without semicolons,
 * or with nested calls, is handled), then checks nothing is left.
 * "console.error(e); toast.error(msg)" is NOT only logging.
 */
export function onlyLogs(body) {
  let rest = body;
  for (;;) {
    const m = rest.match(/\b(console|logger)\.\w+\s*\(|(?<![\w.])log\s*\(/);
    if (!m) break;
    const open = m.index + m[0].length - 1;
    const close = matchingBracket(rest, open);
    if (close === -1) break;
    rest = rest.slice(0, m.index) + rest.slice(close + 1);
  }
  return rest.replace(/[;\s]/g, '') === '';
}

// 4. Copy that names no cause and no next step. Case-sensitive on
//    purpose: 'error' in lowercase is usually a status value in code
//    (status === 'error'), while "Error" is text a person reads.
//    A bare "Error" is usually a label (a heading above the real error
//    text), so it only counts as visible JSX text on its own: >Error<
const GENERIC = /(["'`]|>)\s*([Ss]omething went wrong|An? (unexpected |unknown )?error (has )?occurred|Unknown error|Oops[^"'`<]*|Request failed)[.!]?\s*(["'`]|<)|(>)\s*(Error)[.!]?\s*(<)/g;

/**
 * @param {{path: string, content: string}[]} files
 * @returns {object} a CheckResult
 */
export function checkFailure(files) {
  const result = {
    id: 'failure',
    label: 'Failure is legible',
    impact: 'high',
    weight: 3,
    applicable: true,
    reason: null,
    score: 0,
    issues: [],
    evidence: [],
    judge: [],
    fix: 'Show the chat\'s error state in the UI with what failed, why, and a Retry action. With the Vercel AI SDK: read `error` from useChat and call regenerate(). felt-ui <ToolCall status="failed" onRetry> covers failed tool calls.',
    source: 'https://github.com/Owl-Listener/agent-design-primer/blob/main/chapters/L3-error-recovery.md',
  };

  const code = files.map((f) => ({ ...f, content: stripComments(f.content) }));
  if (!code.some((f) => MODEL_CALL.test(f.content))) {
    return { ...result, applicable: false, score: null, reason: 'no AI model calls found' };
  }
  // UI files, with the ones that run the chat first, so evidence points
  // at the real chat error path rather than an unrelated toast.
  const runsChat = (f) => /\buse(Chat|Completion|Assistant)\s*(?:<[^>()]*>)?\s*\(/.test(f.content);
  const ui = code.filter((f) => isUiFile(f) || runsChat(f)).sort((a, b) => runsChat(b) - runsChat(a));
  const originals = new Map(files.map((f) => [f.path, f.content]));
  const lines = new Map(files.map((f) => [f.path, f.content.split('\n')]));
  const at = (f, index) => {
    const line = f.content.slice(0, index).split('\n').length;
    return { path: f.path, line, text: lines.get(f.path)[line - 1].trim() };
  };
  const firstHit = (set, signal, pattern) => {
    for (const f of set) {
      const m = f.content.match(pattern);
      if (m) return { signal, ...at(f, m.index) };
    }
    return null;
  };
  const list = (items) => {
    const shown = items.slice(0, 3).map((i) => `${i.path}:${i.line}`).join(', ');
    return items.length > 3 ? `${shown} and ${items.length - 3} more` : shown;
  };

  // --- 1. Errors reach the user --------------------------------------
  const shown = ERROR_UI.map(({ name, pattern }) => firstHit(ui, name, pattern)).filter(Boolean);
  if (shown.length) {
    result.score += 40;
    result.evidence.push(...shown.slice(0, 3));
  } else {
    result.issues.push({
      severity: 'high',
      message: 'Nothing in the UI reads the chat\'s error state. When the model or a tool fails, the answer just stops, or never starts, and the user is left guessing.',
    });
  }

  // --- 2. A way to recover -------------------------------------------
  const recovery = firstHit(ui, 'Retry or regenerate', RECOVERY);
  if (recovery) {
    result.score += 20;
    result.evidence.push(recovery);
  } else {
    result.issues.push({
      severity: 'moderate',
      message: 'There\'s no retry or regenerate action, so after a failure the user has to retype their message to try again.',
    });
  }

  // --- 3. Swallowed errors in AI code --------------------------------
  const catches = [];
  const swallowed = [];
  const deliberate = [];
  for (const f of code.filter((file) => AI_FILE.test(file.content))) {
    for (const m of f.content.matchAll(CATCH_BLOCK)) {
      const open = m.index + m[0].length - 1;
      const close = matchingBracket(f.content, open);
      if (close === -1) continue;
      catches.push(m);
      if (!onlyLogs(f.content.slice(open + 1, close))) continue;
      // An empty catch with a comment (/* non-fatal */) is a documented
      // decision, not an accident. The judge decides if it's right.
      const original = originals.get(f.path).slice(open + 1, close);
      if (/\/\/|\/\*/.test(original) && onlyLogs(original.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))) {
        deliberate.push(at(f, m.index));
      } else {
        swallowed.push(at(f, m.index));
      }
    }
    for (const m of f.content.matchAll(CATCH_CALL)) {
      const open = m.index + m[0].length - 1;
      const close = matchingBracket(f.content, open);
      if (close === -1) continue;
      catches.push(m);
      // .catch(() => {}), .catch(console.error), .catch((e) => console.log(e))
      const handler = f.content.slice(open + 1, close).trim();
      const body = handler.replace(/^(async\s*)?\(?\s*\w*\s*\)?\s*=>\s*/, '').replace(/^\{([\s\S]*)\}$/, '$1');
      if (handler === '' || /^(console|logger)\.\w+$/.test(handler) || onlyLogs(body)) swallowed.push(at(f, m.index));
    }
  }
  if (catches.length === 0) {
    result.score += 20;
  } else {
    result.score += Math.round((20 * (catches.length - swallowed.length)) / catches.length);
    for (const s of swallowed.slice(0, 5)) result.evidence.push({ signal: 'Error swallowed (empty or log-only)', ...s });
    if (swallowed.length) {
      result.issues.push({
        severity: 'moderate',
        message: `${swallowed.length} of ${catches.length} error handler(s) in AI code are empty or only log to the console: ${list(swallowed)}. The developer sees the failure; the user never does.`,
      });
    }
  }

  // --- 4. Generic error copy -----------------------------------------
  const generic = [];
  for (const f of code.filter(isChatFile)) {
    for (const m of f.content.matchAll(GENERIC)) generic.push({ ...at(f, m.index), copy: m[2] || m[7] });
  }
  if (generic.length === 0) {
    result.score += 20;
  } else {
    result.score += generic.length <= 2 ? 10 : 0;
    for (const g of generic.slice(0, 5)) result.evidence.push({ signal: `Generic error copy: "${g.copy}"`, path: g.path, line: g.line, text: g.text });
    result.issues.push({
      severity: 'moderate',
      message: `${generic.length} generic error message(s) like "${generic[0].copy}": ${list(generic)}. They don't say what failed or what to do next.`,
    });
  }

  // --- Judge -----------------------------------------------------------
  const retries = firstHit(code, 'Automatic retries', /\bmaxRetries\s*:|\bp-retry\b|\bfor\s*\(\s*let\s+(attempt|retry|tries)\b/);
  if (retries) {
    result.evidence.push(retries);
    result.judge.push('The product retries automatically. When a retry finally succeeds or gives up, is the user told? Silent retries make the system look more reliable than it is (anti-pattern: "Silent retry").');
  }
  if (deliberate.length) {
    result.judge.push(`${deliberate.length} error handler(s) are empty on purpose, with a comment saying why (${list(deliberate)}). Check each: is it really safe for the user not to know?`);
  }
  result.judge.push(
    'Read each error message the user can see: does it say what failed, why, and what they can do next?',
    'When one tool call fails mid-answer, does the UI show which step failed, or does the whole answer just stop?',
    'Are error messages announced to screen readers (role="alert" or a live region)?',
  );

  return result;
}
