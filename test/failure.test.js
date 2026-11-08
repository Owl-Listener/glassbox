// test/failure.test.js
//
// Each test hands the check a tiny fake project and asserts what it
// should conclude. Run with: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFailure } from '../shared/checks/failure.js';

const chat = (content) => [{ path: 'Chat.tsx', content }];

// --- Applicability -------------------------------------------------

test('not applicable when the product never calls a model', () => {
  const r = checkFailure([{ path: 'Page.tsx', content: 'try { save() } catch {}' }]);
  assert.equal(r.applicable, false);
  assert.match(r.reason, /no AI model calls/);
});

// --- 1. Errors reach the user --------------------------------------

test('a chat that never reads its error state scores 60 and gets a high issue', () => {
  const r = checkFailure(chat(`const { messages, regenerate } = useChat();\n<button onClick={() => regenerate()}>Retry</button>`));
  assert.equal(r.score, 60); // 0 + 20 + 20 + 20
  assert.equal(r.issues[0].severity, 'high');
  assert.match(r.issues[0].message, /error state/);
});

test('error destructured from useChat across lines counts', () => {
  const r = checkFailure(chat(`
    const {
      messages,
      error,
      regenerate,
    } = useChat();
    {error && <p role="alert">Couldn't reach the model. <button onClick={() => regenerate()}>Try again</button></p>}
  `));
  assert.equal(r.score, 100);
});

test('status === "error" counts as reading the error', () => {
  const r = checkFailure(chat(`const { status, reload } = useChat();\n{status === 'error' && <button onClick={reload}>Retry</button>}`));
  assert.equal(r.score, 100);
});

// --- 2. Recovery ---------------------------------------------------

test('no retry or regenerate costs 20 points', () => {
  const r = checkFailure(chat(`const { error } = useChat();\n{error && <p>Couldn't reach the model.</p>}`));
  assert.equal(r.score, 80);
  assert.match(r.issues[0].message, /retry or regenerate/);
});

// --- 3. Swallowed errors -------------------------------------------

test('empty and log-only catch blocks in AI code are flagged', () => {
  const files = [
    ...chat(`const { error, regenerate } = useChat();\n{error && <button onClick={() => regenerate()}>Retry</button>}`),
    {
      path: 'app/api/chat/route.ts',
      content: `
        try { await streamText({ model }); } catch (e) { console.error(e); }
        try { await saveChat(); } catch {}
        try { await audit(); } catch (e) { return Response.json({ error: 'The model is busy, try again in a minute' }, { status: 503 }); }
      `,
    },
  ];
  const r = checkFailure(files);
  assert.equal(r.score, 40 + 20 + 7 + 20); // 1 of 3 handled → round(20/3) = 7
  assert.match(r.issues[0].message, /2 of 3 error handler/);
});

test('.catch(console.error) and .catch(() => {}) count as swallowed', () => {
  const files = [
    ...chat(`const { error, regenerate } = useChat();\n{error && <button onClick={() => regenerate()}>Retry</button>}`),
    { path: 'lib/ai.ts', content: `generateText({ model }).catch(console.error);\nstreamText({ model }).catch(() => {});` },
  ];
  const r = checkFailure(files);
  assert.match(r.issues[0].message, /2 of 2/);
});

test('catch blocks outside AI code are ignored', () => {
  const files = [
    ...chat(`const { error, regenerate } = useChat();\n{error && <button onClick={() => regenerate()}>Retry</button>}`),
    { path: 'lib/analytics.ts', content: `try { track() } catch {}` },
  ];
  assert.equal(checkFailure(files).score, 100);
});

// --- 4. Generic copy -----------------------------------------------

test('"Something went wrong" is flagged as generic copy', () => {
  const r = checkFailure(chat(`
    const { error, regenerate } = useChat();
    {error && <p>Something went wrong.</p>}
    <button onClick={() => regenerate()}>Retry</button>
  `));
  assert.equal(r.score, 90);
  assert.match(r.issues[0].message, /Something went wrong/);
});

test("lowercase 'error' in code is not error copy", () => {
  const r = checkFailure(chat(`const { status, error, regenerate } = useChat();\nif (status === 'error') log('error');\n<button onClick={() => regenerate()}>Retry</button>`));
  assert.equal(r.score, 100);
});

test('specific copy is fine', () => {
  const r = checkFailure(chat(`
    const { error, regenerate } = useChat();
    {error && <p>The model didn't respond in time. Your message is saved.</p>}
    <button onClick={() => regenerate()}>Retry</button>
  `));
  assert.equal(r.score, 100);
});

// --- Judge ---------------------------------------------------------

test('automatic retries raise the "Silent retry" judge question', () => {
  const files = [
    ...chat(`const { error, regenerate } = useChat();\n{error && <button onClick={() => regenerate()}>Retry</button>}`),
    { path: 'route.ts', content: `streamText({ model, maxRetries: 5 });` },
  ];
  const r = checkFailure(files);
  assert.ok(r.judge.some((q) => /Silent retry/.test(q)));
});

// --- Patterns found in real apps (field-tests/) -----------------------

test('onlyLogs: logging plus a toast is handled, even without semicolons', async () => {
  const { onlyLogs } = await import('../shared/checks/failure.js');
  assert.equal(onlyLogs(`console.error('Edit failed:', error)\n      toast.error(toPublicErrorPayload(error).error)`), false);
  assert.equal(onlyLogs(`console.error('API Error:', error)\n throw error instanceof Error ? error : new Error('x')`), false);
  assert.equal(onlyLogs(`console.error(\n  \`Error during reload \${id}:\`,\n  error\n)`), true);
  assert.equal(onlyLogs(''), true);
});

test('an empty catch with an explanatory comment is deliberate, for the judge', () => {
  const files = [
    ...chat(`const { error, regenerate } = useChat();\n{error && <button onClick={() => regenerate()}>Retry</button>}`),
    { path: 'route.ts', content: `streamText({ model });\ntry { await makeTitle(); } catch {\n  /* non-fatal */\n}` },
  ];
  const r = checkFailure(files);
  assert.equal(r.score, 100);
  assert.ok(r.judge.some((q) => /empty on purpose/.test(q) && /route\.ts:2/.test(q)));
});

test('generic copy on a login form is out of scope', () => {
  const files = [
    ...chat(`const { error, regenerate } = useChat();\n{error && <button onClick={() => regenerate()}>Retry</button>}`),
    { path: 'components/login-form.tsx', content: `setError(error instanceof Error ? error.message : 'An error occurred')` },
  ];
  assert.equal(checkFailure(files).score, 100);
});

test('useChat<ChatMessage>(...) with a TypeScript type is recognised', () => {
  const r = checkFailure(chat(`const { messages, error, regenerate } = useChat<ChatMessage>({ id });\n{error && <button onClick={() => regenerate()}>Retry</button>}`));
  assert.equal(r.applicable, true);
  assert.equal(r.score, 100);
});

test('error evidence points at the destructuring line, not the function', () => {
  const r = checkFailure(chat(`export default function Chat() {\n  const { error, regenerate } = useChat();\n  return <button onClick={() => regenerate()}>Retry</button>;\n}`));
  assert.equal(r.evidence.find((e) => e.signal === 'Error from chat hook').line, 2);
});

test('a bare "Error" label is not generic copy, but >Error< as the whole message is', () => {
  const base = `const { error, regenerate } = useChat();\n<button onClick={() => regenerate()}>Retry</button>\n`;
  assert.equal(checkFailure(chat(base + `const labels = { "output-error": "Error" };`)).score, 100);
  assert.equal(checkFailure(chat(base + `{error && <p>Error</p>}`)).score, 90);
});
