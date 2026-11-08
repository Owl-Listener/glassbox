// test/accessible-stream.test.js
//
// Each test hands the check a tiny fake project and asserts what it
// should conclude. Run with: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAccessibleStream } from '../shared/checks/accessible-stream.js';
import { findElements, hasAttr } from '../shared/jsx.js';

// A streaming chat component. `body` is the JSX inside it.
const chat = (body) => [{
  path: 'Chat.tsx',
  content: `const { messages, stop } = useChat();\nreturn (\n${body}\n);`,
}];

// --- The JSX reader ------------------------------------------------

test('reads attributes even when they contain "=>"', () => {
  const [el] = findElements(`<button onClick={() => stop()} aria-label="Stop"><StopIcon /></button>`, /^button$/);
  assert.match(el.attrs, /onClick/);
  assert.ok(hasAttr(el.attrs, 'aria-label'));
  assert.equal(el.children, '<StopIcon />');
});

test('reads self-closing elements and dotted names like motion.div', () => {
  const els = findElements(`<motion.div onClick={go} /><input />`, /^(motion\.div|input)$/);
  assert.deepEqual(els.map((e) => [e.tag, e.children]), [['motion.div', null], ['input', null]]);
});

// --- Applicability -------------------------------------------------

test('not applicable when nothing streams', () => {
  const r = checkAccessibleStream([{ path: 'Page.tsx', content: '<button>Save</button>' }]);
  assert.equal(r.applicable, false);
  assert.match(r.reason, /no streaming/);
});

test('not applicable when there is no UI code', () => {
  const r = checkAccessibleStream([{ path: 'route.ts', content: 'streamText({ model })' }]);
  assert.equal(r.applicable, false);
  assert.match(r.reason, /no UI/);
});

// --- 1. Live region ------------------------------------------------

test('a chat with no live region loses 40 points', () => {
  const r = checkAccessibleStream(chat(`<div>{messages.map(m => <p>{m.text}</p>)}</div>`));
  assert.equal(r.score, 60);
  assert.match(r.issues[0].message, /No live region/);
});

test('role="log" counts as a live region', () => {
  const r = checkAccessibleStream(chat(`<div role="log">{messages.map(m => <p>{m.text}</p>)}</div>`));
  assert.equal(r.score, 100);
});

// --- 2. Clickable non-buttons -------------------------------------

test('a clickable motion.div is flagged, like the ai-chatbot toolbar', () => {
  const r = checkAccessibleStream(chat(`
    <div role="log">{text}</div>
    <motion.div animate={{ scale: 1.4 }} onClick={handleStop}><StopIcon /></motion.div>
  `));
  assert.ok(r.issues.some((i) => /aren't buttons/.test(i.message) && /Chat\.tsx:5/.test(i.message)));
});

test('a div with role, tabIndex and a key handler is fine', () => {
  const r = checkAccessibleStream(chat(`
    <div role="log">{text}</div>
    <div role="button" tabIndex={0} onKeyDown={onKey} onClick={go}>Go</div>
  `));
  assert.equal(r.score, 100);
});

test('onClick that only stops event bubbling is not a control', () => {
  const r = checkAccessibleStream(chat(`
    <div role="log">{text}</div>
    <div onClick={(e) => e.stopPropagation()}><Menu /></div>
  `));
  assert.equal(r.score, 100);
});

// --- 3. Icon-only buttons ------------------------------------------

test('an icon-only button without a name is flagged; a named one is not', () => {
  const r = checkAccessibleStream(chat(`
    <div role="log">{text}</div>
    <button onClick={() => stop()}><StopIcon size={14} /></button>
    <button aria-label="Send" type="submit"><ArrowUpIcon /></button>
  `));
  assert.equal(r.score, 90); // 40 + 20 + 10 (1 of 2 named) + 20
  assert.match(r.issues[0].message, /1 of 2 icon-only/);
});

test('a button with visible text is not icon-only', () => {
  const r = checkAccessibleStream(chat(`
    <div role="log">{text}</div>
    <button onClick={stop}><StopIcon /> Stop</button>
  `));
  assert.equal(r.score, 100);
});

// --- 4. Motion -----------------------------------------------------

test('animation without reduced-motion support loses 20 points', () => {
  const r = checkAccessibleStream(chat(`<div role="log" className="animate-pulse">{text}</div>`));
  assert.equal(r.score, 80);
  assert.match(r.issues[0].message, /reduced-motion/);
});

test('motion-reduce: classes count as respecting reduced motion', () => {
  const r = checkAccessibleStream(chat(`<div role="log" className="animate-pulse motion-reduce:animate-none">{text}</div>`));
  assert.equal(r.score, 100);
});

// --- Patterns found in real apps (field-tests/) -----------------------

test('a live region around a usage warning does not count; around messages it does', () => {
  const warningOnly = checkAccessibleStream(chat(`
    <p role="status" aria-live="polite">You're running low on monthly usage.</p>
    <div>{messages.map(m => <Message key={m.id} message={m} />)}</div>
  `));
  assert.equal(warningOnly.score, 60);
  assert.match(warningOnly.issues[0].message, /none wraps the messages/);

  const aroundMessages = checkAccessibleStream(chat(`
    <div aria-live="polite">{messages.map(m => <Message key={m.id} message={m} />)}</div>
  `));
  assert.equal(aroundMessages.score, 100);
});

test('a button whose icon is chosen by a condition is icon-only', () => {
  const r = checkAccessibleStream(chat(`
    <div role="log">{text}</div>
    <Button onClick={isLoading ? stop : undefined}>
      {isLoading ? (
        <Square className="size-4" />
      ) : (
        <ArrowUp className="size-4" />
      )}
    </Button>
  `));
  assert.match(r.issues[0].message, /1 of 1 icon-only/);
});

test('a title that is undefined in normal use does not name a button', () => {
  const r = checkAccessibleStream(chat(`
    <div role="log">{text}</div>
    <Button title={hasModels ? undefined : 'No model available'}><Square /></Button>
    <Button title="Stop generating"><Square /></Button>
  `));
  assert.match(r.issues[0].message, /1 of 2 icon-only/);
});

test('{label} next to an icon is visible text, not icon-only', () => {
  const r = checkAccessibleStream(chat(`
    <div role="log">{text}</div>
    <Button><PlusIcon /> {label}</Button>
  `));
  assert.equal(r.score, 100);
});

test('a live region inside a component nothing renders does not count', () => {
  const files = [
    { path: 'Chat.tsx', content: `const { messages } = useChat();\nreturn <div>{messages.map(m => <Message m={m} />)}</div>;` },
    { path: 'ui/conversation.tsx', content: `export const Conversation = ({ children }) => <div role="log">{children}</div>;` },
  ];
  assert.match(checkAccessibleStream(files).issues[0].message, /No live region/);

  files[0].content = `const { messages } = useChat();\nreturn <Conversation>{messages.map(m => <Message m={m} />)}</Conversation>;`;
  assert.equal(checkAccessibleStream(files).issues.length, 0);
});

test('icon buttons that pass props through are left to the judge', () => {
  const r = checkAccessibleStream(chat(`
    <div role="log">{text}</div>
    <Button onClick={copy} {...props}>{children ?? <CopyIcon />}</Button>
  `));
  assert.equal(r.score, 100);
  assert.ok(r.judge.some((q) => /\{\.\.\.props\}/.test(q)));
});

test('a default-exported page counts as rendered', () => {
  const r = checkAccessibleStream([{
    path: 'app/page.tsx',
    content: `export default function Chat() {\n  const { messages } = useChat();\n  return <div aria-live="polite">{messages.map(m => <p>{m.text}</p>)}</div>;\n}`,
  }]);
  assert.equal(r.score, 100);
});

test('an aria-hidden backdrop is a mouse shortcut for the judge, not a failure', () => {
  const r = checkAccessibleStream(chat(`
    <div role="log">{text}</div>
    <div aria-hidden="true" role="presentation" className="backdrop" onClick={onClose} />
  `));
  assert.equal(r.score, 100);
  assert.ok(r.judge.some((q) => /keyboard way/.test(q)));
});
