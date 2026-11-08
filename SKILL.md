---
name: glassbox
version: 0.1.0
description: "Review the code of an AI product (a chatbot, copilot, or agent) for the trust patterns its users need: can they stop the agent mid-answer, does it ask before taking consequential actions like sending, paying, or deleting, can they see what the agent did, do failures say what went wrong and how to recover, do refusals explain why and offer an alternative, and does it work with screen readers, keyboards, and reduced-motion settings. Use when building or reviewing an AI chat or agent interface, when adding tools to an agent, before shipping an AI feature, or when the user asks whether their AI product is trustworthy, transparent, safe, or user-friendly. Triggers on: useChat, streamText, agent tools, tool calling, function calling, human-in-the-loop, approval step, AI UX review, agent UX, trust, stop button."
---

# Glassbox

*By MC Dean · v0.1.0 · Requires Node 20+ for the scan (no dependencies)*

Glassbox finds where an AI product is a black box to its users. It reads
the product's code, checks it against research-backed trust patterns from
[agent-design-primer](https://github.com/Owl-Listener/agent-design-primer),
and points to fixes, often a component from
[felt-ui](https://github.com/Owl-Listener/felt-ui).

It works in two layers:

1. **A scan** (`glassbox.js`) finds code signals with certainty, such as
   "this tool sends email and has no approval step," and cites the file and line.
2. **Your judgment.** Each result includes `judge` questions that only a
   reader can answer. You answer them by reading the code, and you confirm
   or correct the scan before reporting.

## When to use

- The user asks for a review of their AI chat, copilot, or agent
- The user is adding tools (actions) to an agent, especially ones that send, pay, delete, publish, or deploy
- Before shipping an AI feature
- The user asks "is this safe / trustworthy / good UX?" about an AI product
- You're building an AI chat UI and want to get the trust patterns right the first time

## Install

Place this repository in your agent's skills directory:

- **Claude Code:** `.claude/skills/glassbox/`
- **Cursor:** `.cursor/skills/glassbox/`
- **Gemini CLI:** `.gemini/skills/glassbox/`
- **Codex:** `.agents/skills/glassbox/`

The scan skips these folders, so Glassbox never reports its own example apps.

## What v0.1 checks

| Check | Question | Impact |
|---|---|---|
| `stop` | Can the user stop the agent mid-answer? | critical |
| `gates` | Do consequential actions ask the user first? | critical |
| `tools-visible` | Can the user see what the agent did: what it sent, what came back? | high |
| `failure` | When something fails, does the user learn what failed, why, and how to retry? | high |
| `refusal` | When the product says no, does it give a reason and a way forward? | moderate |
| `accessible-stream` | Do screen readers hear the answer? Can keyboards reach every control? Do icon buttons have names? Is motion respectful? | high |

Two more checks are planned (see `CHECKS.md`). **Never imply the product
passes checks that haven't run.** Always say which areas weren't assessed.

## Instructions

### Step 1: Run the scan

From the project root, run the script in this skill's folder:

```bash
node <path-to-this-skill>/glassbox.js . --json
```

The output is `{ folder, files, score, results }`. Each result has:

- `applicable`: `false` (with a `reason`) when the check doesn't apply, e.g. no agent tools
- `score`: 0–100, and `issues` with a `severity`
- `evidence`: the file, line, and code that counted as a signal
- `judge`: questions for you to answer
- `fix` and `source`: what to do, and the primer chapter that explains why

If Node isn't available, do the review by reading the code against the
rules in `CHECKS.md`, and say clearly that you did it without the scan.

### Step 2: Judge

The scan matches patterns; it doesn't understand the code. For every
applicable check:

1. **Open each evidence location** and confirm it means what the scan
   thinks. A handler called `cancelEdit` isn't a stop button.
2. **Answer every `judge` question** with a quote from the code.
3. **Look for what the scan can't see.** For `gates`, read the full tool
   list: a tool called `runAction` might move money.
4. **Correct the score if you have evidence.** Say what you changed and
   why, for example "Scan: 100. Adjusted to 50: `onToolCall` auto-approves
   `deleteFile`, so the user is never asked (Chat.tsx:41)."

### Step 3: Report

Use this structure. Lead with what can hurt users. Keep it short.

```markdown
## Glassbox review: <project>

**Overall: <score>/100** · <n> checks applied · not yet assessed: plan, sources

| Check | Score | Verdict |
|---|---|---|
| stop: user can stop the agent | 0 | ✗ Responses stream with no way to cancel |
| gates: risky actions ask first | 50 | ✗ refundOrder runs without approval |
| tools-visible: user sees what it did | 50 | ✗ Tool calls shown without their inputs or results |

### Fix first
1. **<problem in plain words>** (`file:line`)
   Why it matters: <one sentence, naming the anti-pattern>.
   Fix: <concrete change>. Source: <primer chapter link>

### Fine as is
- <what passed, with evidence>
```

Write for the person who owns the product. Name the user harm ("a customer
could be refunded twice and nobody approved it"), not just the code pattern.

### Step 4: Offer fixes; don't apply them unasked

Offer to make the changes. Apply them only when the user agrees. Preferred fixes:

- **stop:** show a stop button from the first token to the last, wired to the
  request's abort. With the Vercel AI SDK, that's `stop` from `useChat()`,
  rendered while `status` is `'streaming'` or `'submitted'`.
- **gates:** add `needsApproval: true` to consequential tools (Vercel AI SDK),
  and render the approval with felt-ui's `<ToolCall>`. Use
  `reversible={false}` for actions that can't be undone, which adds a second
  confirmation step. Don't gate read-only tools: needless confirmations
  train people to click through the ones that matter.
- **tools-visible:** render every tool call in the conversation with a
  human-readable label, its inputs, and its outcome. felt-ui's `<ToolCall>`
  does all three (`name`, `args`, `status`).
- **failure:** read `error` from `useChat` and show it with what failed and
  what to do next, plus a Try again button that calls `regenerate()`. Don't
  swallow errors in AI code with empty or log-only `catch` blocks; if one is
  safe to ignore, say why in a comment.
- **refusal:** in the system prompt, pair every "decline X" with "briefly
  explain why and suggest what you can help with instead". In refusal
  messages written into the code, include a reason and a next step
  ("…because that needs identity checks. You can reset it at…").
- **accessible-stream:** wrap the message list in `role="log"` (or render it
  inside a component that does), give every icon-only button an
  `aria-label` that says what it does, replace clickable `div`s with
  `<button>`, and respect `prefers-reduced-motion` (`motion-reduce:`
  classes, or framer-motion's `<MotionConfig reducedMotion="user">`).

After fixing, run the scan again and show the before and after scores.

## Examples

### "Review my AI app"
Run the scan, judge each check, and report with the template.

### "Add a tool that lets the agent send invoices"
Before writing the tool, note that it's consequential. Build it with an
approval step, then run the scan to confirm `gates` passes.

### "Why do users say they don't trust our assistant?"
Run the scan. Then explain the findings as trust problems: an agent that
can't be stopped, or acts without asking, feels unaccountable. Link the
primer chapter for each finding.
