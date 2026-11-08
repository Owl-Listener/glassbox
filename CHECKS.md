# Glassbox: the checks (draft v0.1)

> Glassbox reads the code of an AI product and tells you where the agent is a black box to its user.
> Each check is one heuristic from the [agent-design-primer](https://github.com/Owl-Listener/agent-design-primer/blob/main/appendices/heuristics.md),
> looks for one named anti-pattern, and points to one fix (a [felt-ui](https://github.com/Owl-Listener/felt-ui) component where one exists).

## How a check works

Every check has two layers:

- **Code signals.** Things a script can find with certainty: is there an `aria-live` region around streamed text? Is there an `AbortController` wired to a button? Each signal is a clue, not a verdict.
- **Judgment.** Things only a reader can decide: is this refusal message actually helpful? The skill tells the coding agent exactly what to look at and what "pass" means, and asks it to quote the code it's judging.

Each check scores 0–100 and has an impact weight, the same model as agent-ready, so the two tools feel like siblings.

| Impact | Weight | Meaning |
|---|---|---|
| critical | 5 | Can cause real harm or lock the user out |
| high | 3 | Breaks trust or comprehension |
| moderate | 2 | Degrades the experience |

---

## 1. `stop` · The user can stop the agent
**Impact:** critical · **Heuristic:** streaming (L2) · **Anti-pattern:** *The unstoppable stream*

**Rule:** a visible stop control exists from the first token to the last, and actually cancels the request.

**Code signals**
- An `AbortController`, `abort()`, `stop()` (Vercel AI SDK `useChat`), or a cancel handler on the streaming call
- That handler is wired to a rendered button while `isLoading` / `status === "streaming"`

**Judgment:** is the control visible while streaming, or hidden in a menu?

**Fix:** `<Message>` + `<Composer>` (felt-ui, planned) · Source: `chapters/L2-streaming.md`

## 2. `gates` · Consequential actions ask first
**Impact:** critical · **Heuristic:** #8 Reversibility is proportional to consequence · **Anti-patterns:** *Soft gate for a hard action*, *Gate everywhere*

**Rule:** tools that send, pay, delete, publish, or deploy need human approval before running. Irreversible ones need a stronger confirmation than reversible ones.

**Code signals**
- Tool definitions whose names or descriptions match `send|email|pay|charge|refund|transfer|delete|remove|publish|post|deploy|purchase|book`
- Whether those tools run straight away inside the model loop (`execute:` called directly) or are routed through an approval step (`needsApproval`, a confirm state, human-in-the-loop interrupt)

**Judgment:** does the gate's strength match the stakes? Flag both missing gates and gates on trivial actions.

**Fix:** `<ToolCall reversible={false}>` (felt-ui, ✅ available) · Source: `chapters/L4-high-stakes-gates.md`

## 3. `tools-visible` · The user can see what the agent did
**Impact:** high · **Heuristic:** #10 Tool use is surfaced · **Anti-pattern:** *Silent ingestion*

**Rule:** when the agent calls a tool, the UI shows it, including what was sent and what came back.

**Code signals**
- Tool-call / tool-result message parts (`toolInvocations`, `tool_use`, `parts.type === "tool-*"`) exist in the data
- …and are rendered, not filtered out before display

**Judgment:** can a user tell "searching the web" from "sending an email"?

**Fix:** `<ToolCall>` (felt-ui, ✅ available) · Source: `chapters/L3-tool-use.md`

## 4. `plan` · The plan comes before the work
**Impact:** high · **Heuristic:** #2 The plan is the contract · **Anti-pattern:** *The reveal-after-the-fact*

**Rule:** for multi-step tasks, the user sees the steps before they run and can adjust them.

**Code signals**
- A plan / steps / todo structure in agent state or messages
- Rendered *before* execution starts, with an approve or edit affordance

**Judgment:** is it a contract (shown first, editable) or a receipt (shown after)? Single-step chat apps can mark this "not applicable".

**Fix:** `<Plan>` / `<Steps>` (felt-ui, planned) · Source: `chapters/L3-plan-visibility.md`

## 5. `failure` · Failure is legible
**Impact:** high · **Heuristic:** #12 Failure is legible · **Anti-pattern:** *Silent retry*

**Rule:** when something fails, the user learns what failed, why, and what they can do next.

**Code signals**
- Empty `catch {}` blocks or `catch` that only `console.log`s around model / tool calls
- Automatic retry loops with no user-visible message
- Generic copy: `"Something went wrong"`, `"An error occurred"`, `"Error"`

**Judgment:** does each error message have a *what*, a *why*, and a *next step*?

**Fix:** `<ToolCall status="failed" onRetry>` · Source: `chapters/L3-error-recovery.md`

## 6. `refusal` · Refusals give a reason and a way forward
**Impact:** moderate · **Heuristic:** #6 Refusals carry reasons and paths forward · **Anti-patterns:** *The cold wall*, *The fake refusal*

**Rule:** when the product (or system prompt) declines a request, it says why and offers an alternative.

**Code signals**
- Refusal instructions in the system prompt: do they require a reason and a redirect?
- Hard-coded refusal strings in the UI or guardrail layer

**Judgment:** read the refusal copy. Is it a wall or a door?

**Fix:** `<Refusal>` (felt-ui, planned) · Source: `chapters/L2-refusal.md`

## 7. `sources` · Verifiable claims show their sources
**Impact:** moderate · **Heuristic:** #4 Sources are required for verifiable claims · **Anti-patterns:** *Decorative citations*, *Phantom citations*

**Rule:** if the product retrieves documents (RAG, web search), answers link to the sources they used, and the links work.

**Code signals**
- A retrieval step exists (vector store, search tool, `sources` in the response)
- Source data reaches the rendered message as clickable links

**Judgment:** applies only when retrieval exists. Are citations attached to claims, or dumped at the bottom?

**Fix:** `<Citation>` (felt-ui, planned) · Source: `chapters/L2-citations.md`

## 8. `accessible-stream` · Streaming works for everyone
**Impact:** high · **Heuristic:** #15 Accessibility is the lens, not the addendum · **Anti-pattern:** *Visual-only confidence signals*

**Rule:** screen readers hear new agent output, motion respects user settings, and status isn't conveyed by colour alone.

**Code signals**
- `aria-live="polite"` (or `role="log"` / `role="status"`) on the message container
- `prefers-reduced-motion` respected for typing animations and spinners
- Icon-only buttons (stop, send, approve) have an accessible name
- Status pills use text, not just colour

**Judgment:** would a screen-reader user know the agent is thinking, done, or waiting for them?

**Fix:** `<Message>` (felt-ui, planned) · Source: `chapters/L4-accessibility.md`

---

## Deliberately left out of v0.1

These heuristics matter but are hard to detect reliably in code. They're candidates for v0.2:
confidence (#5), memory visibility (#9), handoffs (#11), long-running tasks (#13), multi-agent visibility (#14), artefact vs chat (#7), structure before content (#3).

## Decisions so far

- **Eight checks for v0.1**, the list above. Swaps welcome as we learn from real codebases.
- **`stop` and `gates` are the only critical checks**, because they're the two failures that can actually hurt someone.
- **First target stack: React + Vercel AI SDK**, the most common shape for AI apps and the one felt-ui already targets. Signals for other stacks (LangChain, plain `fetch` streaming, Python backends) come later.
