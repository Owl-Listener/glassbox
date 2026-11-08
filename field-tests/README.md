# Field tests

Glassbox run on real, open-source AI apps, to learn where its patterns hold and where they break. Each review follows the report format in [SKILL.md](../SKILL.md): the scan's score, then what reading the code confirmed or corrected.

These are code reviews, not usability tests: the apps were read, not run. Each review names the exact commit it looked at, so later changes to the app may already have fixed things.

| App | Commit | Scan | After judgment | What it taught glassbox |
|---|---|---|---|---|
| [vercel/ai-chatbot](vercel-ai-chatbot.md) | `a8989b5` | 77 | **51** | Stop shown only while `"submitted"` disappears during streaming; a `role="log"` in an unused component |
| [miurla/morphic](miurla-morphic.md) | `be5846d` | 85 | 85 | Tools built by factory functions; live regions that wrap notices, not answers |
| [theopenco/llmgateway](theopenco-llmgateway.md) | `525117a` | refusal 50 | refusal **83** | "invite a product question" is a way forward; numbered prompt items are separate instructions |
| [elysiajs/arona](elysiajs-arona.md) | `ed82fa1` | refusal 0 | refusal **0** | A genuine cold wall, confirmed |

The last two were reviewed for `refusal` only, because neither ai-chatbot nor Morphic defines any refusal behaviour.

## What accessible-stream learned from these apps

The first version of the check gave both apps full marks for live regions. Reading the code showed neither announces its answers, so the check now requires:

- **A live region that wraps the messages.** `aria-live` around a usage warning or a loading skeleton doesn't count. `role="log"`, made for chat transcripts, counts on its own.
- **A live region in a component that's actually rendered.** ai-chatbot's `role="log"` is in a bundled UI-kit component the app never uses.
- **Icons chosen by a condition** (`{isLoading ? <Square /> : <ArrowUp />}`) count as icon-only, and a `title` that's `undefined` in normal use doesn't count as a name.
- **Not counted against an app:** click targets marked `aria-hidden` (backdrops, hitboxes) and buttons in reusable components that pass `{...props}` through. Both go to the judge questions instead.

## What failure learned from these apps

- **Code without semicolons.** Morphic's handlers log and then show a toast, but the first version read `console.error(…)` plus everything after it as one call, and flagged handled errors as swallowed. Logging calls are now removed by matching their brackets.
- **Empty on purpose.** ai-chatbot's empty `catch` blocks carry comments like `/* non-fatal */`. A commented empty catch is a documented decision, so it goes to the judge instead of failing.
- **Scope.** Generic copy on login and password forms is real, but it isn't an AI failure. Only chat-related code counts.
- **`useChat<ChatMessage>(…)`.** A TypeScript type argument hid ai-chatbot's main chat hook from every check. Fixed everywhere.
- **"Error" is usually a label**, a heading above the real error text. Only a bare `>Error<` as the whole message counts as generic.

## What refusal learned from these apps

ai-chatbot and Morphic define no refusal behaviour, so the check is **not applicable** to both. Reading their prompts still sharpened it:

- **Method isn't refusal.** Morphic's "Do NOT answer informational questions based only on internal knowledge" means *search first*, not *say no*. Plain "do not answer" doesn't count as a refusal instruction.
- **Mentioning isn't instructing.** Morphic's "skip suggestions in cases where you could not answer (refusal, …)" uses the noun. Only the verbs (decline, refuse) count.
- **A scraper's `content_filter`** (it strips HTML clutter) isn't moderation. Only the model's `content-filter` finish reason counts.

## What plan and sources learned from these apps

- **A short tool loop isn't an agent.** ai-chatbot's `isStepCount(5)` lets the chat call a tool and then answer; it needs no plan. `plan` now applies only to agent frameworks, step limits above 5 (or computed ones), or products with a planning tool.
- **Type names aren't UI.** `createContext<CitationContextValue>` matched "a Citation component". Names ending in Props, Value, Type, Context or Data are now treated as types.
- **`[0]` isn't a citation.** `Parameters<typeof regenerate>[0]` matched a bracket-number pattern. Inline citations are now recognised by components and prompt instructions only.
- **Looking up your own data isn't retrieval.** A `lookupOrder` tool reads the shop's database, not a source a user needs to verify. "fetch", "lookup" and "get" now count only when the tool's description is about the web or documents.

Two more apps, chosen because their prompts *do* define refusals, tested it properly:

- **"Invite" is a way forward.** llmgateway's *"politely decline and invite a product question"* first scored 0. It's a redirect, so it now scores 50 (no reason given).
- **One instruction per line.** Prompts are often numbered lists. The check used to read the next two sentences as part of a refusal, which can cross into the next item, a different rule. It now stops at the end of the line.
- **"Blocked by X's content filter" is a reason.** It names what stopped the request, even if not what triggered it.
- **arona's cold wall held up.** *"Politely decline answer not related to Elysia…"* scored 0 before and after: no reason, no alternative.

## What the first run got wrong, and what changed

The first scan of these two apps found **no tools in either**, so two checks silently didn't run. Fixed in the same pull request:

- **Tools are mostly written as constants or factories** (`export const getWeather = tool(...)`, `const createDocument = (props) => tool(...)`), not just `name: tool(...)`. Glassbox now finds every `tool(...)` and `dynamicTool(...)` call.
- **Prose in prompts looked like code.** "Start with the fetch tool (skip search)" matched `tool (`. Text inside quotes is now ignored when looking for tools.
- **Test files, evals and fixtures were scanned.** They describe how code *should* behave, with fake tools and streams. They're now skipped.
- **`e.stopPropagation()` counted as a stop button.** It no longer does.
