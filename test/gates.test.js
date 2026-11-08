// test/gates.test.js
//
// Each test hands the check a tiny fake project and asserts what it
// should conclude. Run with: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkGates, riskReason } from '../shared/checks/gates.js';
import { findTools, nameWords } from '../shared/tools.js';

const app = (content, path = 'route.ts') => [{ path, content }];

// A Vercel AI SDK tool, written the way the docs write it.
const sdkTool = (name, { gate = '', execute = true, description = 'Does a thing' } = {}) => `
  ${name}: tool({
    description: '${description}',
    inputSchema: z.object({ id: z.string() }),
    ${gate}
    ${execute ? 'execute: async ({ id }) => { return { ok: true }; },' : ''}
  }),`;

const route = (...tools) => `const result = streamText({ model, tools: {${tools.join('')}\n} });`;

// --- Finding tools -------------------------------------------------

test('finds AI SDK tools with their name and line', () => {
  const tools = findTools(app(route(sdkTool('sendEmail'), sdkTool('getWeather'))));
  assert.deepEqual(tools.map((t) => t.name), ['sendEmail', 'getWeather']);
  assert.equal(tools[0].line, 2);
});

test('finds plain schema tools (Anthropic / OpenAI style)', () => {
  const tools = findTools(app(`
    const tools = [
      { name: 'send_email', description: 'Send an email', input_schema: { type: 'object' } },
      { name: 'Alice', role: 'admin' },
    ];`));
  assert.deepEqual(tools.map((t) => t.name), ['send_email']); // "Alice" isn't a tool
});

test('splits tool names into words', () => {
  assert.deepEqual(nameWords('sendEmail'), ['send', 'email']);
  assert.deepEqual(nameWords('delete_user_file'), ['delete', 'user', 'file']);
});

// --- Deciding what's consequential ----------------------------------

test('a read verb at the start makes a tool safe', () => {
  assert.equal(riskReason({ name: 'searchEmails', body: '' }), null);
  assert.equal(riskReason({ name: 'getPayments', body: '' }), null);
  assert.match(riskReason({ name: 'sendEmail', body: '' }), /send/);
});

test('falls back to the description when the name says nothing', () => {
  const tool = { name: 'runAction', body: `{ description: 'Sends a payment to a vendor' }` };
  assert.match(riskReason(tool), /Sends/);
});

// --- Scoring --------------------------------------------------------

test('not applicable when there are no tools', () => {
  const r = checkGates(app(`streamText({ model, prompt })`));
  assert.equal(r.applicable, false);
  assert.match(r.reason, /no agent tools/);
});

test('not applicable when no tool is consequential', () => {
  const r = checkGates(app(route(sdkTool('getWeather'), sdkTool('searchDocs'))));
  assert.equal(r.applicable, false);
  assert.match(r.reason, /none consequential/);
});

test('ungated sendEmail scores 0 with a critical issue pointing at it', () => {
  const r = checkGates(app(route(sdkTool('sendEmail'))));
  assert.equal(r.score, 0);
  assert.equal(r.issues[0].severity, 'critical');
  assert.match(r.issues[0].message, /"sendEmail" \(route\.ts:2\)/);
});

test('needsApproval: true counts as a gate', () => {
  const r = checkGates(app(route(sdkTool('sendEmail', { gate: 'needsApproval: true,' }))));
  assert.equal(r.score, 100);
  assert.deepEqual(r.issues, []);
});

test('a tool with no execute counts as gated, and the agent is asked to confirm', () => {
  const r = checkGates(app(route(sdkTool('deleteFile', { execute: false }))));
  assert.equal(r.score, 100);
  assert.ok(r.judge.some((q) => /onToolCall/.test(q)));
});

test('one gated, one not: 50', () => {
  const r = checkGates(app(route(
    sdkTool('sendEmail', { gate: 'needsApproval: true,' }),
    sdkTool('deleteFile'),
    sdkTool('getWeather'),
  )));
  assert.equal(r.score, 50);
  assert.equal(r.issues.length, 1);
  assert.match(r.issues[0].message, /deleteFile/);
});

test('"Gate everywhere": a gated read-only tool costs 10 points', () => {
  const r = checkGates(app(route(
    sdkTool('sendEmail', { gate: 'needsApproval: true,' }),
    sdkTool('getWeather', { gate: 'needsApproval: true,' }),
  )));
  assert.equal(r.score, 90);
  assert.match(r.issues[0].message, /Gate everywhere/);
});

test('schema tools count as gated when the product has an approval UI', () => {
  const tools = `const tools = [{ name: 'send_email', input_schema: {} }];`;
  assert.equal(checkGates(app(tools)).score, 0);
  const withUi = [
    { path: 'tools.ts', content: tools },
    { path: 'Approve.tsx', content: `<ToolCall name="Send email" reversible={false} onApprove={run} />` },
  ];
  assert.equal(checkGates(withUi).score, 100);
});

test('a "}" inside a string does not break tool detection', () => {
  const r = checkGates(app(route(sdkTool('sendEmail', { description: 'Sends {templated} mail }' }))));
  assert.equal(r.evidence.length, 1);
  assert.equal(r.score, 0);
});

// --- Patterns found in real apps (vercel/ai-chatbot, miurla/morphic) ---

test('finds tools assigned to a const: export const getWeather = tool(...)', () => {
  const tools = findTools(app(`export const getWeather = tool({ description: 'Weather', execute: async () => 1 });`));
  assert.deepEqual(tools.map((t) => t.name), ['getWeather']);
});

test('finds tools built by factory functions, named after the factory', () => {
  const tools = findTools(app(`
    export const createDocument = ({ session, dataStream }: Props) =>
      tool({ description: 'Create a document', execute: async () => 1 });

    export function createSendEmailTool(options?: { from: string }) {
      const retries = 3;
      return tool({ description: 'Email', execute: async () => 1 });
    }`));
  assert.deepEqual(tools.map((t) => t.name), ['createDocument', 'createSendEmailTool']);
});

test('factory wrapping does not hide or invent risk', () => {
  assert.match(riskReason({ name: 'createSendEmailTool', body: '' }), /send/);
  assert.equal(riskReason({ name: 'createSearchTool', body: '' }), null);
  assert.equal(riskReason({ name: 'createDocument', body: '' }), null);
});

test('"tool (" inside a prompt string is not a tool', () => {
  const tools = findTools(app('const prompt = `For URLs: start with the fetch tool (skip search entirely)`;'));
  assert.deepEqual(tools, []);
});

test('look-alike calls are not tools: callTool(), mcp.tool()', () => {
  const tools = findTools(app(`await client.callTool(name, input); server.tool('x', handler);`));
  assert.deepEqual(tools, []);
});

test('runtime (MCP) tools are mentioned even when nothing else is risky', () => {
  const r = checkGates(app(`
    export function createDynamicTool(name, description, handler) {
      return dynamicTool({ description, inputSchema: s, execute: handler });
    }`));
  assert.equal(r.applicable, false);
  assert.match(r.reason, /created at runtime/);
});
