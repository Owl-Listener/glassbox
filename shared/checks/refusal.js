// shared/checks/refusal.js
//
// Check 6 · refusal · "Refusals give a reason and a way forward"
//
// Heuristic #6 (agent-design-primer): "A refusal without a reason feels
// arbitrary. A refusal without a redirect feels like a wall. The strong
// refusal carries both."
// Anti-patterns: "The cold wall", "The fake refusal"
//
// A product says no in two places, and we look at both:
//
//   1. Its system prompt tells the model what to decline. Does it also
//      tell the model to explain why and offer something else?
//   2. Its code has refusal messages written in, e.g. a guardrail that
//      returns "I can't help with that". Does each give a reason and a
//      way forward?
//
// Every refusal "site" scores half for a reason and half for a way
// forward; the check's score is the average. A product that defines no
// refusal behaviour is not applicable: the model's own defaults apply,
// and those aren't in the product's code.

import { stripComments } from '../signals.js';

const MODEL_CALL = /\buse(Chat|Completion|Assistant|Object)\s*(?:<[^>()]*>)?\s*\(|\b(stream|generate)(Text|Object|UI)\s*\(|\.stream\s*\(|\bmessages\.create\s*\(|\bcompletions\.create\s*\(|\bresponses\.create\s*\(/;

// --- 1. Prompts --------------------------------------------------------
// A prompt is a long string written to the model ("You are...", "Do not...").
const looksLikePrompt = (s) => s.length >= 120 && /\b(you|your)\b/i.test(s);

// Instructions to say no. Deliberately narrow, both found in a real app
// (field-tests/):
//  - "Do NOT answer questions from memory; search first" is about method,
//    not refusing the user, so plain "do not answer" doesn't count.
//  - "Skip suggestions in cases where you could not answer (refusal, …)"
//    mentions refusals without asking for one, so the noun "refusal"
//    doesn't count. Only verbs do: decline, refuse, refusing.
const REFUSE_INSTRUCTION = /\b(declin(e|ing)|refus(e|ing)|off[- ]topic|outside (of )?(your|the|this) (scope|domain|purpose)|unrelated (questions|requests|topics)|(do not|don't|never) (help|assist) with)\b/i;
// What a good instruction asks for, in the same sentence or the two after it.
const ASKS_FOR_REASON = /\b(explain|why|reason|because|say what|tell (them|the user) (what|that))\b/i;
const ASKS_FOR_PATH = /\b(instead|suggest|alternative|redirect|offer|point (them|the user)|what you can|recommend|help (them )?with|next step|where (they|to))\b/i;

// --- 2. Refusal messages in code -----------------------------------------
const REFUSAL_MESSAGE = /\b(I can(?:'|’|no)t (help|assist|do|answer|provide|respond)|I(?:'|’)m (sorry|afraid)\b[^"'`]{0,40}\b(can(?:'|’|no)t|cannot|unable)|I am unable to|I(?:'|’)m (not able|unable) to|(This|Your) (request|message|prompt|content) (violates|was blocked|is not allowed|isn(?:'|’)t allowed|cannot be processed))/i;
const HAS_REASON = /\b(because|since|policy|policies|only (help|answer|work)|outside|not (designed|built|set up) to|limited to|isn(?:'|’)t something|safety|privacy)\b/i;
const HAS_PATH = /\b(instead|try|you (can|could|might)|contact|here(?:'|’)s|reach out|ask (me )?about|visit|support team|happy to help with|I can help with)\b/i;

// Guardrails and moderation: worth a judge question about what users see.
// "content filter" only counts as the model's finish reason: a scraper's
// content_filter setting (it strips HTML clutter) is unrelated. (Found in
// a real app, field-tests/.)
const MODERATION = /\bmoderations?\.create\s*\(|\bflagged\b|\bguardrails?\b|\bfinish_?reason\b[^;\n]{0,20}['"]content[-_]filter['"]/i;

/** Every string literal and every bit of JSX text in the code, with where it starts. */
export function findTexts(code) {
  const out = [];
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < code.length && code[j] !== ch) {
        if (code[j] === '\n' && ch !== '`') break; // not a string after all (e.g. an apostrophe in JSX text)
        j += code[j] === '\\' ? 2 : 1;
      }
      if (code[j] === ch) {
        out.push({ value: code.slice(i + 1, j), index: i });
        i = j;
      }
    }
  }
  for (const m of code.matchAll(/>([^<>{}]{12,})</g)) out.push({ value: m[1].trim(), index: m.index + 1 });
  return out;
}

/**
 * @param {{path: string, content: string}[]} files
 * @returns {object} a CheckResult
 */
export function checkRefusal(files) {
  const result = {
    id: 'refusal',
    label: 'Refusals give a reason and a way forward',
    impact: 'moderate',
    weight: 2,
    applicable: true,
    reason: null,
    score: 0,
    issues: [],
    evidence: [],
    judge: [],
    fix: 'Every refusal says why ("I only help with billing questions") and what the user can do instead ("for account security, contact support at…"). In the system prompt: "If you decline, briefly explain why and suggest what you can help with instead."',
    source: 'https://github.com/Owl-Listener/agent-design-primer/blob/main/chapters/L2-refusal.md',
  };

  const code = files.map((f) => ({ ...f, content: stripComments(f.content) }));
  if (!code.some((f) => MODEL_CALL.test(f.content))) {
    return { ...result, applicable: false, score: null, reason: 'no AI model calls found' };
  }
  const lineAt = (f, index) => f.content.slice(0, index).split('\n').length;

  const sites = []; // { kind, path, line, text, reason: bool, path: bool }
  for (const f of code) {
    for (const t of findTexts(f.content)) {
      // A first-person "I can't…" is a message to the user, even when it's
      // long and says "you", so check for that before treating text as a prompt.
      if (t.value.length < 300 && REFUSAL_MESSAGE.test(t.value)) {
        sites.push({
          kind: 'Refusal message in code',
          path: f.path,
          line: lineAt(f, t.index),
          text: t.value.trim().slice(0, 140),
          hasReason: HAS_REASON.test(t.value),
          hasPath: HAS_PATH.test(t.value),
        });
      } else if (looksLikePrompt(t.value)) {
        // Split the prompt into sentences and look at each instruction to refuse.
        const sentences = t.value.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim());
        sentences.forEach((sentence, k) => {
          if (!REFUSE_INSTRUCTION.test(sentence)) return;
          const window = sentences.slice(k, k + 3).join(' ');
          const offset = t.value.indexOf(sentence);
          sites.push({
            kind: 'Prompt tells the model to refuse',
            path: f.path,
            line: lineAt(f, t.index + 1 + Math.max(0, offset)),
            text: sentence.trim().slice(0, 140),
            hasReason: ASKS_FOR_REASON.test(window),
            hasPath: ASKS_FOR_PATH.test(window),
          });
        });
      }
    }
  }

  const moderation = code.find((f) => MODERATION.test(f.content));
  if (sites.length === 0) {
    const note = moderation ? `; a moderation or guardrail step exists (${moderation.path}), so check what users see when it blocks something` : '';
    return { ...result, applicable: false, score: null, reason: `no refusal behaviour defined, so the model's own defaults apply${note}` };
  }

  // Score: half for a reason, half for a way forward, averaged over sites.
  const total = sites.reduce((sum, s) => sum + (s.hasReason ? 50 : 0) + (s.hasPath ? 50 : 0), 0);
  result.score = Math.round(total / sites.length);

  for (const s of sites.slice(0, 8)) {
    const verdict = s.hasReason && s.hasPath ? 'reason + way forward' : s.hasReason ? 'reason, no way forward' : s.hasPath ? 'way forward, no reason' : 'no reason, no way forward';
    result.evidence.push({ signal: `${s.kind}: ${verdict}`, path: s.path, line: s.line, text: s.text });
  }
  const at = (list) => list.slice(0, 3).map((s) => `${s.path}:${s.line}`).join(', ') + (list.length > 3 ? ` and ${list.length - 3} more` : '');
  const walls = sites.filter((s) => !s.hasReason && !s.hasPath);
  const noPath = sites.filter((s) => s.hasReason && !s.hasPath);
  const noReason = sites.filter((s) => !s.hasReason && s.hasPath);
  if (walls.length) {
    result.issues.push({
      severity: 'moderate',
      message: `${walls.length} refusal(s) give neither a reason nor a way forward: ${at(walls)}. Users feel stonewalled and start rephrasing until something gets through (anti-pattern: "The cold wall").`,
    });
  }
  if (noPath.length) {
    result.issues.push({ severity: 'moderate', message: `${noPath.length} refusal(s) explain why but offer nothing else to do: ${at(noPath)}.` });
  }
  if (noReason.length) {
    result.issues.push({ severity: 'moderate', message: `${noReason.length} refusal(s) redirect the user without saying why: ${at(noReason)}. A redirect without a reason feels arbitrary.` });
  }

  if (moderation) {
    result.judge.push(`A moderation or guardrail step exists (${moderation.path}). When it blocks something, what does the user see, and does it explain why?`);
  }
  result.judge.push(
    'Read each refusal as the user would: is it a wall or a door?',
    'Does the product ever say no but quietly do a reduced version anyway, or say yes and then not do it? (anti-pattern: "The fake refusal")',
    'Do refusals look different from errors? A refusal styled like a crash makes users retry instead of rephrasing.',
  );

  return result;
}
