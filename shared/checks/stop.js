// shared/checks/stop.js
//
// Check 1 · stop · "The user can stop the agent"
//
// Heuristic: agent-design-primer, chapters/L2-streaming.md
//   "Make abort visible at all times. A stream the user cannot stop is
//    a stream the user cannot trust."
// Anti-pattern: "The unstoppable stream"
//
// The check asks three questions, in order. Each one only matters if
// the one before it is true:
//
//   0. Does this product stream responses at all?    (if not: not applicable)
//   1. Is there code that can cancel a stream?        40 points
//   2. Is that cancel wired to something clickable?   40 points
//   3. Is the control tied to the "streaming" state,  20 points
//      so it's actually on screen while the agent talks?
//
// Score = points earned out of 100.

import { findSignals } from '../signals.js';

// --- 0. Signs the product streams responses -------------------------
// We look for the common ways AI apps stream, starting with the
// Vercel AI SDK (our first target stack) and then plain SDK / browser
// streaming so other apps aren't wrongly marked "not applicable".
const STREAMING = [
  { name: 'Vercel AI SDK hook', pattern: /\buse(Chat|Completion|Assistant|Object)\s*(?:<[^>()]*>)?\s*\(/ },
  { name: 'Vercel AI SDK server stream', pattern: /\bstream(Text|Object|UI)\s*\(/ },
  { name: 'SDK streaming option', pattern: /\bstream\s*:\s*true\b/ },
  { name: 'SDK .stream() call', pattern: /\.stream\s*\(/ },
  { name: 'Server-sent events', pattern: /\bnew\s+EventSource\s*\(/ },
  { name: 'Reading a fetch stream', pattern: /\.getReader\s*\(\s*\)/ },
];

// --- 1. Signs something can cancel a stream -------------------------
const CANCEL = [
  { name: 'AbortController', pattern: /\bnew\s+AbortController\s*\(/ },
  { name: 'abort() call', pattern: /\.abort\s*\(/ },
  // `const { messages, stop } = useChat()`. The [^}]* lets the
  // destructuring span several lines. Anchoring on const/let/var
  // matters: without it the match can start at an earlier `{` (like
  // a function body) and the evidence points at the wrong line.
  {
    name: 'stop() from AI SDK hook',
    pattern: /\b(const|let|var)\s*\{[^}]*\bstop\b[^}]*\}\s*=\s*use(Chat|Completion|Assistant|Object)\b/,
  },
  { name: '.stop() call', pattern: /\.stop\s*\(/ },
];

// --- 2. Signs the cancel is wired to a control ----------------------
// An onClick / onPress whose handler mentions stop, abort or cancel:
//   onClick={stop}   onClick={() => stop()}   onClick={handleStop}
// "cancel" can also mean "cancel editing", so the agent is asked to
// confirm this one in the judgment step.
const WIRED = [
  {
    name: 'Click handler that stops',
    // stopPropagation() is a browser detail, not a stop button.
    pattern: /\bon(Click|Press)\s*=\s*\{[^}]*?(stop(?!(Immediate)?Propagation)|abort|cancel)/i,
  },
];

// --- 3. Signs the control follows the streaming state ---------------
const STREAM_STATE = /\b(isLoading|isStreaming|isGenerating|isPending)\b|\bstatus\s*===?\s*['"](streaming|submitted)['"]/;

/**
 * @param {{path: string, content: string}[]} files  the product's source files
 * @returns {object} a CheckResult (shape documented in CHECKS.md)
 */
export function checkStop(files) {
  const result = {
    id: 'stop',
    label: 'The user can stop the agent',
    impact: 'critical',
    weight: 5,
    applicable: true,
    score: 0,
    issues: [],
    evidence: [],
    judge: [],
    fix: 'Show a stop button from the first token to the last, wired to the request\'s abort. felt-ui <Message> + <Composer> (planned).',
    source: 'https://github.com/Owl-Listener/agent-design-primer/blob/main/chapters/L2-streaming.md',
  };

  // 0. Does it stream?
  const streaming = findSignals(files, STREAMING);
  if (streaming.length === 0) {
    result.applicable = false;
    result.score = null;
    result.reason = 'no streaming found';
    return result;
  }
  result.evidence.push(...streaming);

  // 1. Can anything cancel?
  const cancel = findSignals(files, CANCEL);
  result.evidence.push(...cancel);
  if (cancel.length === 0) {
    result.issues.push({
      severity: 'critical',
      message:
        'Responses stream, but nothing in the code can cancel them. Users are stuck watching output they can already see going wrong (anti-pattern: "The unstoppable stream").',
    });
    result.judge.push('Confirm there is no other way to cancel a response, e.g. a custom hook or a library this scan does not recognise.');
    return result; // 0 points; the later questions don't apply
  }
  result.score += 40;

  // 2. Is it wired to a control?
  const wired = findSignals(files, WIRED);
  result.evidence.push(...wired);
  if (wired.length === 0) {
    const where = `${cancel[0].path}:${cancel[0].line}`;
    result.issues.push({
      severity: 'critical',
      message: `The code can cancel a stream (${where}), but no button or control calls it, so the user has no way to stop the agent.`,
    });
    result.judge.push('Look for a stop control wired some other way (keyboard shortcut, custom component prop) before reporting this.');
    return result;
  }
  result.score += 40;

  // 3. Does the control follow the streaming state? We look in the same
  // files as the control, since that's where the show/hide logic lives.
  const controlFiles = new Set(wired.map((w) => w.path));
  const tiedToState = files.some(
    (f) => controlFiles.has(f.path) && STREAM_STATE.test(f.content),
  );
  if (tiedToState) {
    result.score += 20;
  } else {
    result.issues.push({
      severity: 'moderate',
      message:
        'A stop control exists, but its file never refers to a streaming/loading state, so it may not be on screen while the agent is responding.',
    });
  }

  // These need a human-level read whatever the score.
  result.judge.push(
    'Is the stop control visible from the first token to the last, without opening a menu? Read the condition that shows it: a control shown only while status is "submitted" disappears as soon as text starts streaming.',
    'Is the main stop control in the chat input? A stop control that only lives in a side panel or toolbar doesn\'t count for the main conversation.',
    'Does it actually cancel the request (abort), or just hide the output while the model keeps generating and billing?',
    'If the handler is named "cancel…", is it really cancelling the response and not something else, like cancelling an edit?',
  );

  return result;
}
