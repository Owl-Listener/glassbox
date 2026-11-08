// test/tools-visible.test.js
//
// Each test hands the check a tiny fake project and asserts what it
// should conclude. Run with: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkToolsVisible } from '../shared/checks/tools-visible.js';

// A server route with two tools, reused by most tests.
const route = {
  path: 'app/api/chat/route.ts',
  content: `streamText({ model, tools: {
    searchWeb: tool({ description: 'Search', inputSchema: s, execute: async () => [] }),
    sendEmail: tool({ description: 'Send', inputSchema: s, execute: async () => ({}) }),
  } });`,
};
const ui = (content) => [route, { path: 'app/Chat.tsx', content }];

test('not applicable when the agent has no tools', () => {
  const r = checkToolsVisible([{ path: 'Chat.tsx', content: 'const { messages } = useChat();' }]);
  assert.equal(r.applicable, false);
  assert.match(r.reason, /no agent tools/);
});

test('not applicable when there is no UI code to check', () => {
  const r = checkToolsVisible([route]);
  assert.equal(r.applicable, false);
  assert.match(r.reason, /no UI code/);
});

test('UI that only renders text scores 0 and names the hidden tools', () => {
  const r = checkToolsVisible(ui(`
    {m.parts.map((part) => part.type === 'text' ? <p>{part.text}</p> : null)}
  `));
  assert.equal(r.score, 0);
  assert.equal(r.issues[0].severity, 'high');
  assert.match(r.issues[0].message, /searchWeb, sendEmail/);
  assert.match(r.issues[0].message, /Silent ingestion/);
});

test('tool calls shown by name only: 50', () => {
  const r = checkToolsVisible(ui(`
    {part.type.startsWith('tool-') && <span>Using a tool…</span>}
  `));
  assert.equal(r.score, 50);
  assert.equal(r.issues.length, 2); // no inputs, no outcome
});

test('tool calls with inputs and outcome: 100', () => {
  const r = checkToolsVisible(ui(`
    {part.type === 'tool-sendEmail' && (
      <div>To: {part.input.to} · {part.state === 'output-available' ? 'Sent' : 'Sending…'}</div>
    )}
  `));
  assert.equal(r.score, 100);
  assert.deepEqual(r.issues, []);
});

test('felt-ui <ToolCall> with args and status counts fully', () => {
  const r = checkToolsVisible(ui(`
    <ToolCall
      name="Send email"
      args={{ to: email }}
      status="done"
    />
  `));
  assert.equal(r.score, 100);
});

test('the older toolInvocations API counts too', () => {
  const r = checkToolsVisible(ui(`
    {m.toolInvocations?.map((toolInvocation) => (
      <pre>{JSON.stringify(toolInvocation.args)} → {JSON.stringify(toolInvocation.result)}</pre>
    ))}
  `));
  assert.equal(r.score, 100);
});

test('evidence points at the first line that handles tool calls', () => {
  const r = checkToolsVisible(ui(`// line 1\n{part.type.startsWith('tool-') && <Tool part={part} />}`));
  assert.equal(r.evidence[0].path, 'app/Chat.tsx');
  assert.equal(r.evidence[0].line, 2);
});

test('a comment that only mentions <ToolCall> does not count', () => {
  const r = checkToolsVisible(ui(`
    // TODO: show tool calls with felt-ui's <ToolCall> and part.input
    /* toolInvocations would go here */
    {part.type === 'text' && <p>{part.text}</p>}
  `));
  assert.equal(r.score, 0);
});
