# Field tests

Glassbox run on real, open-source AI apps, to learn where its patterns hold and where they break. Each review follows the report format in [SKILL.md](../SKILL.md): the scan's score, then what reading the code confirmed or corrected.

These are code reviews, not usability tests: the apps were read, not run. Each review names the exact commit it looked at, so later changes to the app may already have fixed things.

| App | Commit | Scan | After judgment | What it taught glassbox |
|---|---|---|---|---|
| [vercel/ai-chatbot](vercel-ai-chatbot.md) | `a8989b5` | 77 | **51** | Stop shown only while `"submitted"` disappears during streaming; a `role="log"` in an unused component |
| [miurla/morphic](miurla-morphic.md) | `be5846d` | 85 | 85 | Tools built by factory functions; live regions that wrap notices, not answers |

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

## What the first run got wrong, and what changed

The first scan of these two apps found **no tools in either**, so two checks silently didn't run. Fixed in the same pull request:

- **Tools are mostly written as constants or factories** (`export const getWeather = tool(...)`, `const createDocument = (props) => tool(...)`), not just `name: tool(...)`. Glassbox now finds every `tool(...)` and `dynamicTool(...)` call.
- **Prose in prompts looked like code.** "Start with the fetch tool (skip search)" matched `tool (`. Text inside quotes is now ignored when looking for tools.
- **Test files, evals and fixtures were scanned.** They describe how code *should* behave, with fake tools and streams. They're now skipped.
- **`e.stopPropagation()` counted as a stop button.** It no longer does.
