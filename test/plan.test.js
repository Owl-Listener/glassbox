// test/plan.test.js
//
// Each test hands the check a tiny fake project and asserts what it
// should conclude. Run with: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPlan } from '../shared/checks/plan.js';

const agent = (tools = '', extra = '') => ({
  path: 'lib/agent.ts',
  content: `export const agent = streamText({ model, stopWhen: stepCountIs(10), tools: {${tools}} });\n${extra}`,
});
const todoTool = (opts = '') => `
  todoWrite: tool({ description: 'Write the plan', inputSchema: s, ${opts} execute: async ({ todos }) => ({ todos }) }),`;
const ui = (content) => ({ path: 'components/Chat.tsx', content });

test('not applicable for a single-step chat', () => {
  const r = checkPlan([{ path: 'route.ts', content: 'streamText({ model, messages })' }]);
  assert.equal(r.applicable, false);
  assert.match(r.reason, /not a multi-step agent/);
});

test('a multi-step agent with no plan scores 0', () => {
  const r = checkPlan([agent(`search: tool({ execute: async () => [] }),`)]);
  assert.equal(r.score, 0);
  assert.match(r.issues[0].message, /reveal-after-the-fact/);
});

test('a plan tool that is never shown scores 40', () => {
  const r = checkPlan([agent(todoTool())]);
  assert.equal(r.score, 40);
  assert.match(r.issues[0].message, /never shows it/);
});

test('a plan shown in the UI but not approvable scores 70', () => {
  const r = checkPlan([agent(todoTool()), ui(`{part.type === 'tool-todoWrite' && <TodoList todos={part.input.todos} />}`)]);
  assert.equal(r.score, 70);
  assert.match(r.issues[0].message, /progress log/);
});

test('a plan tool with needsApproval counts as approved first', () => {
  const r = checkPlan([agent(todoTool('needsApproval: true,')), ui(`<Plan steps={part.input.todos} />`)]);
  assert.equal(r.score, 100);
});

test('an "Approve plan" button counts', () => {
  const r = checkPlan([agent(todoTool()), ui(`<Steps items={todos} /><button onClick={go}>Approve plan</button>`)]);
  assert.equal(r.score, 100);
});

test('a prompt that asks to confirm the plan before starting counts', () => {
  const r = checkPlan([
    agent(todoTool(), 'const system = `Always present your plan to the user and wait for them to confirm before you begin.`;'),
    ui(`{todos.map((t) => <li key={t.id}>{t.text}</li>)}`),
  ]);
  assert.equal(r.score, 100);
});

test('long step limits, computed limits and agent frameworks count as multi-step', () => {
  assert.equal(checkPlan([{ path: 'a.ts', content: 'streamText({ model, maxSteps: 12 })' }]).applicable, true);
  assert.equal(checkPlan([{ path: 'a.ts', content: 'streamText({ model, stopWhen: isStepCount(maxSteps) })' }]).applicable, true);
  assert.equal(checkPlan([{ path: 'a.ts', content: 'const a = new ToolLoopAgent({ model })' }]).applicable, true);
});

test('a short tool loop (up to 5 steps) is not applicable, like a chat that calls a tool then answers', () => {
  const r = checkPlan([{ path: 'route.ts', content: 'streamText({ model, stopWhen: isStepCount(5), tools })' }]);
  assert.equal(r.applicable, false);
  assert.match(r.reason, /short tool loop \(up to 5 steps, route\.ts:1\)/);
});

test('a short loop with a planning tool is still applicable', () => {
  const r = checkPlan([{ path: 'route.ts', content: `streamText({ model, stopWhen: stepCountIs(3), tools: {\n  writePlan: tool({ execute: async () => 1 }) } })` }]);
  assert.equal(r.applicable, true);
});
