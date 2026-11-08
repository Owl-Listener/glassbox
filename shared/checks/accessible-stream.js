// shared/checks/accessible-stream.js
//
// Check 8 · accessible-stream · "Streaming works for everyone"
//
// Heuristic #15 (agent-design-primer): Accessibility is the lens, not
// the addendum. "Every primitive has to work across sensory, motor,
// cognitive, and linguistic variation, in the main surface."
// Anti-patterns: "Accessibility as audit", "Visual-only confidence signals"
//
// Applies when the product streams responses and has UI code. Four
// questions, scored separately:
//
//   1. Do screen readers hear new output? (a live region)        40 points
//   2. Can every clickable thing be reached by keyboard?          20 points
//   3. Do icon-only buttons have a name?                          20 points
//   4. If the UI animates, does it respect reduced motion?        20 points
//
// Questions 2 and 3 score the share of elements that pass. When there
// are none to judge (no icon buttons, no animation), they score full.

import { stripComments } from '../signals.js';
import { findElements, hasAttr } from '../jsx.js';

// Same streaming signals the stop check uses. If nothing streams, the
// "new output arrives over time" problem doesn't exist.
const STREAMING = /\buse(Chat|Completion|Assistant|Object)\s*(?:<[^>()]*>)?\s*\(|\bstream(Text|Object|UI)\s*\(|\bstream\s*:\s*true\b|\.stream\s*\(|\bnew\s+EventSource\s*\(|\.getReader\s*\(\s*\)/;

const isUiFile = (f) => /\.(tsx|jsx)$/.test(f.path);

// 1. A live region: the browser reads changes inside it aloud.
//    role="log" exists for chat transcripts, so it counts on its own.
//    aria-live / role="status" only count when they wrap the messages:
//    a live region around a loading skeleton or a usage warning doesn't
//    help anyone hear the answer. (Found in a real app, field-tests/.)
const ANY_ELEMENT = /^[A-Za-z]/;
const LOG_ROLE = /\brole\s*=\s*["']log["']/;
const LIVE_ATTR = /\baria-live\s*=\s*["'{]|\brole\s*=\s*["']status["']/;
const RENDERS_MESSAGES = /\bmessages?\b|<\w*Message|\.parts\b|\{\s*children\s*\}/i;

// 2. Elements that aren't interactive by nature but get an onClick.
const NON_INTERACTIVE = /^(div|span|li|p|img|svg|section|article|motion\.(div|span|li))$/;
// A click handler that only stops event bubbling doesn't make the
// element a control: it's a wrapper detail, not something to reach.
const ONLY_STOPS_BUBBLING = /onClick\s*=\s*\{\s*\(?\s*\w*\s*\)?\s*=>\s*\w+\.stopPropagation\(\)\s*\}/;

// 3. Buttons. Icon-only means: the children are icons (self-closing
//    components like <StopIcon /> or an <svg>), possibly chosen by a
//    condition, {isLoading ? <Square /> : <ArrowUp />}, and no text.
const BUTTON = /^(button|Button)$/;
const ICON = /<[A-Z][\w.]*\b[^<]*?\/>|<svg\b[\s\S]*?<\/svg>/g;

export function isIconOnly(children) {
  if (children === null) return false;
  const rest = children.replace(ICON, '');
  if (rest === children || rest.includes('<')) return false; // no icon, or other elements
  // Whatever is left must be empty, apart from conditions in {braces}
  // that pick between icons. {label} on its own would render text.
  let outside = rest;
  for (const expr of rest.match(/\{[^{}]*\}/g) || []) {
    if (/["'`]/.test(expr) || !/\?|&&/.test(expr)) return false;
    outside = outside.replace(expr, '');
  }
  return outside.trim() === '';
}

// A name only counts if it's always there. title={ok ? undefined : 'x'}
// is empty in normal use, so it doesn't name the button.
const hasName = (attrs) =>
  hasAttr(attrs, 'aria-label') || hasAttr(attrs, 'aria-labelledby') ||
  /\btitle\s*=\s*(["']|\{\s*["'`])/.test(attrs);

// 4. Animation, and signs it respects the user's reduced-motion setting.
const ANIMATES = /<motion\.|\banimate\s*=\s*\{|\banimate-(spin|pulse|bounce|ping)\b|@keyframes\b|\btransition-all\b/;
const REDUCED_MOTION = /prefers-reduced-motion|\bmotion-(reduce|safe):|\buseReducedMotion\b|\breducedMotion\s*=/;

// Is the component containing position `index` rendered anywhere?
// Finds the nearest PascalCase component declared before it, then looks
// for <ThatName in any UI file. Default exports (pages) always count.
// If we can't tell, assume it is rendered.
function isRendered(file, index, ui) {
  const before = file.content.slice(0, index);
  let name = null;
  for (const m of before.matchAll(/(?:function|const|let)\s+([A-Z][A-Za-z0-9]*)\b/g)) name = m[1];
  if (!name) return true;
  // A default export is a page or an entry point: the framework renders
  // it, so nothing else in the code says <Name.
  if (new RegExp(`export\\s+default\\s+(function\\s+)?${name}\\b`).test(file.content)) return true;
  const used = new RegExp(`<${name}\\b`);
  return ui.some((f) => used.test(f.content.replace(new RegExp(`(function|const|let)\\s+${name}\\b`), '')));
}

/**
 * @param {{path: string, content: string}[]} files
 * @returns {object} a CheckResult
 */
export function checkAccessibleStream(files) {
  const result = {
    id: 'accessible-stream',
    label: 'Streaming works for everyone',
    impact: 'high',
    weight: 3,
    applicable: true,
    reason: null,
    score: 0,
    issues: [],
    evidence: [],
    judge: [],
    fix: 'Wrap the message list in role="log" (or aria-live="polite"), use real <button>s with accessible names for every control, and respect prefers-reduced-motion. felt-ui <Message> (planned) does all three.',
    source: 'https://github.com/Owl-Listener/agent-design-primer/blob/main/chapters/L4-accessibility.md',
  };

  const code = files.map((f) => ({ ...f, content: stripComments(f.content) }));
  if (!code.some((f) => STREAMING.test(f.content))) {
    return { ...result, applicable: false, score: null, reason: 'no streaming found' };
  }
  const ui = code.filter(isUiFile);
  if (ui.length === 0) {
    return { ...result, applicable: false, score: null, reason: 'no UI code to check' };
  }
  const original = new Map(files.map((f) => [f.path, f.content.split('\n')]));
  const where = (f, index) => {
    const line = f.content.slice(0, index).split('\n').length;
    return { path: f.path, line, text: original.get(f.path)[line - 1].trim() };
  };
  // Name a few offenders, then summarise the rest.
  const list = (items) => {
    const shown = items.slice(0, 3).map((i) => `${i.path}:${i.line}`).join(', ');
    return items.length > 3 ? `${shown} and ${items.length - 3} more` : shown;
  };

  // --- 1. Live region -----------------------------------------------
  const wrapsMessages = [];
  const elsewhere = [];
  for (const f of ui) {
    for (const el of findElements(f.content, ANY_ELEMENT)) {
      // A live region in a component nothing renders (e.g. an unused file
      // from a UI kit) helps nobody. (Found in a real app, field-tests/.)
      if ((LOG_ROLE.test(el.attrs) || LIVE_ATTR.test(el.attrs)) && !isRendered(f, el.index, ui)) continue;
      if (LOG_ROLE.test(el.attrs)) wrapsMessages.push({ signal: 'Chat log role', ...where(f, el.index) });
      else if (LIVE_ATTR.test(el.attrs)) {
        const target = RENDERS_MESSAGES.test(el.children ?? '') ? wrapsMessages : elsewhere;
        target.push({ signal: 'Live region', ...where(f, el.index) });
      }
    }
  }
  if (wrapsMessages.length) {
    result.score += 40;
    result.evidence.push(...wrapsMessages.slice(0, 3));
  } else if (elsewhere.length) {
    result.evidence.push(...elsewhere.slice(0, 3).map((e) => ({ ...e, signal: 'Live region, not around messages' })));
    result.issues.push({
      severity: 'high',
      message: `Live regions exist (${list(elsewhere)}), but none wraps the messages. Screen-reader users hear status notices, but not the answer as it streams in.`,
    });
  } else {
    result.issues.push({
      severity: 'high',
      message: 'No live region (aria-live or role="log") anywhere in the UI. Screen-reader users hear nothing while the answer streams in, and don\'t know when it\'s finished.',
    });
  }

  // --- 2. Clickable elements that keyboards can't reach --------------
  const clickable = [];
  const unreachable = [];
  let mouseShortcuts = 0;
  for (const f of ui) {
    for (const el of findElements(f.content, NON_INTERACTIVE)) {
      if (!/\bonClick\s*=/.test(el.attrs) || ONLY_STOPS_BUBBLING.test(el.attrs)) continue;
      // aria-hidden="true" marks a deliberate mouse shortcut: a backdrop
      // that closes a popup, or a hitbox over a card. Not a control to
      // reach, but there should be a keyboard way to do the same thing.
      if (/\baria-hidden\s*=\s*(["']true["']|\{\s*true\s*\})/.test(el.attrs)) { mouseShortcuts++; continue; }
      clickable.push(el);
      const keyboardOk = hasAttr(el.attrs, 'role') && hasAttr(el.attrs, 'tabIndex') && /\bonKey(Down|Up|Press)\s*=/.test(el.attrs);
      if (!keyboardOk) unreachable.push({ ...where(f, el.index), tag: el.tag });
    }
  }
  if (clickable.length === 0) {
    result.score += 20;
  } else {
    result.score += Math.round((20 * (clickable.length - unreachable.length)) / clickable.length);
    for (const u of unreachable.slice(0, 5)) result.evidence.push({ signal: `Clickable <${u.tag}>, not a button`, ...u });
    if (unreachable.length) {
      result.issues.push({
        severity: 'high',
        message: `${unreachable.length} clickable element(s) aren't buttons, so keyboard and screen-reader users can't reach them: ${list(unreachable)}. Use <button>, or add role, tabIndex and a key handler.`,
      });
    }
  }

  // --- 3. Icon-only buttons without a name ---------------------------
  const iconButtons = [];
  const unnamed = [];
  let passThrough = 0;
  for (const f of ui) {
    for (const el of findElements(f.content, BUTTON)) {
      if (!isIconOnly(el.children)) continue;
      // {...props} lets whoever uses this component pass aria-label, so
      // its name can't be judged here. A judge question covers these.
      if (/\{\s*\.\.\.\w+\s*\}/.test(el.attrs)) { passThrough++; continue; }
      iconButtons.push(el);
      if (!hasName(el.attrs)) unnamed.push(where(f, el.index));
    }
  }
  if (iconButtons.length === 0) {
    result.score += 20;
  } else {
    result.score += Math.round((20 * (iconButtons.length - unnamed.length)) / iconButtons.length);
    for (const u of unnamed.slice(0, 5)) result.evidence.push({ signal: 'Icon-only button with no name', ...u });
    if (unnamed.length) {
      result.issues.push({
        severity: 'high',
        message: `${unnamed.length} of ${iconButtons.length} icon-only button(s) have no accessible name, so a screen reader just says "button": ${list(unnamed)}. Add an aria-label that says what it does, e.g. "Send message" or "Stop generating".`,
      });
    }
  }

  // --- 4. Motion -------------------------------------------------------
  const animates = ui.some((f) => ANIMATES.test(f.content));
  const respects = code.some((f) => REDUCED_MOTION.test(f.content));
  if (!animates || respects) {
    result.score += 20;
  } else {
    result.issues.push({
      severity: 'moderate',
      message: 'The UI animates (motion components, animate-* classes or keyframes), but nothing respects the user\'s reduced-motion setting. Streaming text plus motion is a real cost for people with vestibular or attention conditions.',
    });
  }

  if (mouseShortcuts) {
    result.judge.push(`${mouseShortcuts} click target(s) are hidden from assistive tech on purpose (aria-hidden), like backdrops or card hitboxes. Is there a keyboard way to do the same thing (Escape to close, a focusable button)?`);
  }
  if (passThrough) {
    result.judge.push(`${passThrough} icon-only button(s) live in reusable components that pass props through ({...props}). Check where they're used: does each use give them an aria-label?`);
  }
  result.judge.push(
    'Does the live region wrap the streamed messages themselves (not just a toast)? Is it "polite"? "assertive" interrupts the user on every token.',
    'Are statuses (thinking, done, failed, waiting for approval) given in text, not only by colour or an icon?',
    'Where does keyboard focus go after sending a message, and after an approval dialog closes?',
  );

  return result;
}
