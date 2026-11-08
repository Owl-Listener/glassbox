// test/refusal.test.js
//
// Each test hands the check a tiny fake project and asserts what it
// should conclude. Run with: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRefusal, findTexts } from '../shared/checks/refusal.js';

// A route with a system prompt. `prompt` is the prompt text.
const route = (prompt) => [{
  path: 'app/api/chat/route.ts',
  content: `const result = streamText({\n  model,\n  system: \`${prompt}\`,\n  messages,\n});`,
}];

const BASE = 'You are a helpful assistant for Acme, a company that sells running shoes and gear online.';

// --- Applicability -------------------------------------------------

test('not applicable without model calls', () => {
  const r = checkRefusal([{ path: 'a.ts', content: `const msg = "I can't help with that";` }]);
  assert.equal(r.applicable, false);
});

test('not applicable when no refusal behaviour is defined', () => {
  const r = checkRefusal(route(`${BASE} Answer questions about orders and products.`));
  assert.equal(r.applicable, false);
  assert.match(r.reason, /model's own defaults/);
});

test('a method instruction ("do not answer from memory") is not a refusal', () => {
  const r = checkRefusal(route(`${BASE} Do NOT answer informational questions based only on internal knowledge; search first and cite sources.`));
  assert.equal(r.applicable, false);
});

// --- 1. Prompt instructions ----------------------------------------

test('a prompt that only says "decline off-topic questions" scores 0', () => {
  const r = checkRefusal(route(`${BASE} Politely decline off-topic questions.`));
  assert.equal(r.score, 0);
  assert.match(r.issues[0].message, /cold wall/);
});

test('a prompt that asks for a reason and an alternative scores 100', () => {
  const r = checkRefusal(route(`${BASE} If a question is off-topic, decline it. Briefly explain why, and suggest what you can help with instead.`));
  assert.equal(r.score, 100);
  assert.deepEqual(r.issues, []);
});

test('reason without a way forward scores 50', () => {
  const r = checkRefusal(route(`${BASE} Refuse requests for medical advice and explain why.`));
  assert.equal(r.score, 50);
  assert.match(r.issues[0].message, /offer nothing else/);
});

// --- 2. Refusal messages in code -----------------------------------

test('"I can\'t help with that." is a cold wall', () => {
  const files = [...route(`${BASE} Help with orders.`), { path: 'lib/guard.ts', content: `if (blocked) return "I can't help with that.";` }];
  const r = checkRefusal(files);
  assert.equal(r.score, 0);
  assert.match(r.issues[0].message, /lib\/guard\.ts:1/);
});

test('a refusal message with a reason and a way forward scores 100', () => {
  const files = [...route(`${BASE} Help with orders.`), {
    path: 'lib/guard.ts',
    content: `return "I can't help with account passwords, because that needs identity checks. You can reset it at acme.com/reset or contact our support team.";`,
  }];
  assert.equal(checkRefusal(files).score, 100);
});

test('refusal text inside JSX counts', () => {
  const files = [...route(`${BASE} Help with orders.`), { path: 'Blocked.tsx', content: `<p>I'm sorry, but I can't respond to that request.</p>` }];
  assert.equal(checkRefusal(files).score, 0);
});

test('scores average across refusal sites', () => {
  const files = [
    ...route(`${BASE} Decline off-topic questions; explain why and suggest what you can help with instead.`),
    { path: 'lib/guard.ts', content: `return "I can't help with that.";` },
  ];
  assert.equal(checkRefusal(files).score, 50);
});

// --- Helpers and judge ---------------------------------------------

test('findTexts ignores apostrophes in JSX text', () => {
  const texts = findTexts(`<p>Don't worry, we'll sort it out together soon</p>\nconst a = "real string";`);
  assert.ok(texts.some((t) => t.value === 'real string'));
});

test('a moderation step without refusal copy is mentioned in the reason', () => {
  const r = checkRefusal([{ path: 'route.ts', content: `const mod = await openai.moderations.create({ input });\nstreamText({ model });` }]);
  assert.equal(r.applicable, false);
  assert.match(r.reason, /moderation or guardrail/);
});

test('the noun "refusal" in a list of cases is not an instruction to refuse', () => {
  const r = checkRefusal(route(`${BASE} SKIP the spec block entirely only in these cases:\n- Cases where you could not answer (refusal, clarification request, or empty result).`));
  assert.equal(r.applicable, false);
});

test("a scraper's content_filter setting is not moderation; the model's content-filter finish reason is", () => {
  const scraper = checkRefusal([{ path: 'fetch.ts', content: `streamText({ model });\ncrawl({ content_filter: { type: 'Pruning' } });` }]);
  assert.doesNotMatch(scraper.reason, /moderation/);
  const model = checkRefusal([{ path: 'route.ts', content: `const r = await generateText({ model });\nif (r.finishReason === 'content-filter') show();` }]);
  assert.match(model.reason, /moderation or guardrail/);
});

// --- Patterns found in real apps (field-tests/) -----------------------

test('"invite a product question" counts as a way forward', () => {
  const r = checkRefusal(route(`${BASE}\n4. If the question is unrelated to Acme, politely decline and invite a product question.`));
  assert.equal(r.score, 50); // way forward, but no reason
});

test('the next item in a numbered list is a different instruction', () => {
  const r = checkRefusal(route(`${BASE}\n4. If the question is off-topic, politely decline.\n5. If the docs do not answer the question, suggest contacting support.`));
  assert.equal(r.score, 0); // item 5's "suggest" belongs to a different rule
});

test('"blocked by X\'s content filter" counts as a reason', () => {
  const files = [...route(`${BASE} Help with orders.`), {
    path: 'filter.ts',
    content: `export const MSG = "This request was blocked by Acme's content filter. Please contact support at help@acme.com.";`,
  }];
  assert.equal(checkRefusal(files).score, 100);
});
