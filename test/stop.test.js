// test/stop.test.js
//
// Each test hands the check a tiny fake project and asserts what it
// should conclude. Run with: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkStop } from '../shared/checks/stop.js';

// Helper: one-file project.
const app = (content, path = 'Chat.tsx') => [{ path, content }];

test('not applicable when the product does not stream', () => {
  const r = checkStop(app(`export const add = (a, b) => a + b;`));
  assert.equal(r.applicable, false);
  assert.equal(r.score, null);
});

test('streaming with no way to cancel scores 0 with a critical issue', () => {
  const r = checkStop(app(`
    const { messages, handleSubmit } = useChat();
  `));
  assert.equal(r.score, 0);
  assert.equal(r.issues[0].severity, 'critical');
  assert.match(r.issues[0].message, /unstoppable stream/);
});

test('stop() is available but never wired to a control: 40', () => {
  const r = checkStop(app(`
    const { messages, stop } = useChat();
  `));
  assert.equal(r.score, 40);
  assert.match(r.issues[0].message, /Chat\.tsx:2/);
});

test('stop wired to a button but not tied to streaming state: 80', () => {
  const r = checkStop(app(`
    const controller = new AbortController();
    fetch('/api/chat', { signal: controller.signal, body: JSON.stringify({ stream: true }) });
    const handleStop = () => controller.abort();
    return <button onClick={handleStop}>Stop</button>;
  `));
  assert.equal(r.score, 80);
  assert.equal(r.issues[0].severity, 'moderate');
});

test('full pass: stop button shown while streaming', () => {
  const r = checkStop(app(`
    const { messages, status, stop } = useChat();
    {status === 'streaming' && <button onClick={() => stop()}>Stop</button>}
  `));
  assert.equal(r.score, 100);
  assert.deepEqual(r.issues, []);
});

test('recognises stop destructured across several lines', () => {
  const r = checkStop(app(`
    const {
      messages,
      isLoading,
      stop,
    } = useChat();
    {isLoading && <button onClick={stop}>Stop</button>}
  `));
  assert.equal(r.score, 100);
});

test('works when the stream and the button live in different files', () => {
  const r = checkStop([
    { path: 'api/chat.ts', content: `const result = streamText({ model, messages });` },
    {
      path: 'components/Composer.tsx',
      content: `const c = new AbortController();\n{isStreaming && <button onClick={() => c.abort()}>Stop</button>}`,
    },
  ]);
  assert.equal(r.score, 100);
});

test('evidence points at the right file and line', () => {
  const r = checkStop(app(`// line 1\n// line 2\nconst chat = useChat();`));
  const hook = r.evidence.find((e) => e.signal === 'Vercel AI SDK hook');
  assert.equal(hook.path, 'Chat.tsx');
  assert.equal(hook.line, 3);
  assert.equal(hook.text, 'const chat = useChat();');
});

test('stop() evidence points at the destructuring, not an earlier brace', () => {
  const r = checkStop(app(`export default function Chat() {\n  const { messages, stop } = useChat();\n}`));
  const stop = r.evidence.find((e) => e.signal === 'stop() from AI SDK hook');
  assert.equal(stop.line, 2);
});

test('always hands the agent questions to verify when applicable', () => {
  const r = checkStop(app(`const { stop, isLoading } = useChat();\n<button onClick={stop} />`));
  assert.ok(r.judge.length > 0);
});

test('a comment mentioning useChat() does not make a product "streaming"', () => {
  const r = checkStop(app(`// We might add useChat() later\nexport const x = 1;`));
  assert.equal(r.applicable, false);
});

test('URLs inside strings are not mistaken for comments', () => {
  const r = checkStop(app(`fetch("https://api.example.com"); const { stop, isLoading } = useChat();\n<button onClick={stop} />`));
  assert.equal(r.score, 100);
});

test('stopPropagation() is not a stop button', () => {
  const r = checkStop(app(`const { messages } = useChat();\n<div onClick={(e) => e.stopPropagation()} />`));
  assert.equal(r.score, 0); // nothing can cancel the stream
  assert.equal(r.evidence.filter((e) => e.signal.startsWith('Click')).length, 0);
});

test('the judge question warns about stop shown only while "submitted"', () => {
  const r = checkStop(app(`const { stop, status } = useChat();\n{status === 'submitted' && <button onClick={stop}>Stop</button>}`));
  assert.ok(r.judge.some((q) => /"submitted"/.test(q)));
});

test('useChat<ChatMessage>() with a TypeScript type counts as streaming', () => {
  const r = checkStop(app(`const { stop, status } = useChat<ChatMessage>({ id });\n{status === 'streaming' && <button onClick={stop}>Stop</button>}`));
  assert.equal(r.score, 100);
});
