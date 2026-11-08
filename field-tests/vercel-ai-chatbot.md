## Glassbox review: vercel/ai-chatbot

*Commit `a8989b5` (2026-11-03) · 147 source files · reviewed by reading the code, not by running the app*

**Overall: 51/100 after judgment** (scan: 77) · 4 of 8 checks applied · not applicable: gates (no consequential tools), plan (a short tool loop), refusal (none defined), sources (no retrieval)

| Check | Scan | Judged | Verdict |
|---|---|---|---|
| stop: user can stop the agent | 100 | **40** | ✗ The main chat input has no working stop control while the answer streams |
| gates: risky actions ask first | n/a | n/a | 5 tools, all reversible in-app document actions or reads |
| tools-visible: user sees what it did | 100 | 100 | ✓ Tool calls render with inputs and status |
| plan: shown before the work | n/a | n/a | `isStepCount(5)` is a short tool loop (call a tool, then answer), not a long-running agent |
| failure: errors are legible | 90 | **70** | ✗ Errors show as a toast, but there's no retry, and most say "Oops, an error occurred!" |
| refusal: says why and what instead | n/a | n/a | No refusal behaviour defined in the prompts, so the model's defaults apply |
| sources: claims show sources | n/a | n/a | No search or retrieval |
| accessible-stream: works for everyone | 3 | 3 | ✗ Answers aren't announced; most icon buttons are unnamed; motion ignores user settings |

### Fix first

1. **Users can't stop an answer from the chat box once it starts streaming** (`components/chat/multimodal-input.tsx:559`)

   The stop button only renders while `status === "submitted"`, the moment between sending and the first token:

   ```tsx
   {status === "submitted" ? (
     <StopButton setMessages={setMessages} stop={stop} />
   ) : (
     <PromptInputSubmit … status={status} disabled={!input.trim() || …}>
   ```

   As soon as text starts streaming, it's swapped for the send button. That button supports stopping via an `onStop` prop (`components/ai-elements/prompt-input.tsx:1118`), but none is passed, and it's disabled because the input is empty after sending. The only stop control during streaming is in the artifact toolbar (`components/chat/toolbar.tsx:465`), which exists only when a document panel is open, and is a `motion.div`, not a button, so keyboard and screen-reader users can't reach it.

   **Why it matters:** this is the anti-pattern "The unstoppable stream". Users watch output they can already see going wrong, and pay for it.
   **Fix:** show the stop control for `status === "submitted" || status === "streaming"`, or pass `onStop={stop}` to `PromptInputSubmit` and don't disable it while generating. Make the toolbar control a `<button>` with an accessible name.
   Source: [agent-design-primer, L2 streaming](https://github.com/Owl-Listener/agent-design-primer/blob/main/chapters/L2-streaming.md)

   **Score adjusted from 100 to 40:** a cancel mechanism exists (`stop` from `useChat`, `hooks/use-active-chat.tsx:100`), but the scan's "wired to a visible control during streaming" evidence was the artifact toolbar, not the main conversation.

2. **Screen-reader users don't hear the answer** (`components/chat/messages.tsx`)

   The message list isn't inside a live region. The only live regions announce a submit status (`components/chat/submit-button.tsx:33`) and a spinner (`components/ui/spinner.tsx:6`). There is a `role="log"` in the bundled AI Elements `Conversation` component (`components/ai-elements/conversation.tsx:18`), but the app never renders `<Conversation>`.

   **Why it matters:** a blind user sends a message and hears nothing as the answer streams in, and doesn't know when it's finished.
   **Fix:** wrap the message list in `role="log"`, or render it inside `<Conversation>`.

3. **12 of 14 icon-only buttons have no name** (e.g. `components/chat/chat-header.tsx:28`, the sidebar toggle, which is just `<PanelLeftIcon />`)

   A screen reader announces each as "button". **Fix:** add an `aria-label` to each, e.g. `aria-label="Toggle sidebar"`.

4. **Toolbar controls are clickable `motion.div`s** (`components/chat/toolbar.tsx:124`, `:234`, `:455` and 2 more), so keyboards can't reach them. This includes the stop control from finding 1. **Fix:** use `<button>`.

5. **Motion ignores the reduced-motion setting.** The UI uses framer-motion and `animate-*` classes, and nothing checks `prefers-reduced-motion`. **Fix:** wrap the app in `<MotionConfig reducedMotion="user">` and add `motion-reduce:` variants.

   Source for 2–5: [agent-design-primer, L4 accessibility](https://github.com/Owl-Listener/agent-design-primer/blob/main/chapters/L4-accessibility.md)

6. **After an error there's no way to retry, and the message is generic** (`hooks/use-active-chat.tsx:120`, `app/(chat)/api/chat/route.ts:400`)

   Chat errors reach the user as a toast (`onError`, `use-active-chat.tsx:120`), which is good. But the server sends `"Oops, an error occurred!"` for every error except a missing credit card (`route.ts:400`), and the client falls back to the same text (`use-active-chat.tsx:127`). There's no retry action after a failure either: `regenerate()` is only called after editing a message (`components/chat/message-editor.tsx:32`), so the user has to retype or edit to try again.

   **Score adjusted from 90 to 70:** the scan credits recovery because `regenerate` exists, but nothing offers it after an error.
   **Fix:** say what failed ("The model didn't respond", "Rate limit reached, try again in a minute"), and show a Try again button that calls `regenerate()` when `status === "error"`.
   Source: [agent-design-primer, L3 error recovery](https://github.com/Owl-Listener/agent-design-primer/blob/main/chapters/L3-error-recovery.md)

### Fine as is

- **tools-visible:** tool calls render as message parts with their input (`components/chat/message.tsx:230`, `<ToolInput input={part.input} />`) and a status label per state (`components/ai-elements/tool.tsx:53`, `"output-available": "Completed"`).
- **accessible-stream, not counted against it:** two click targets are deliberate mouse shortcuts hidden from assistive tech (`suggestion.tsx:31`, a backdrop with an Escape key handler, and `document-preview.tsx:190`, a hitbox). Two icon buttons in AI Elements components pass `{...props}` through, so their names depend on where they're used.
- **failure, deliberate:** two empty `catch` blocks are commented `/* non-fatal */` and `/* non-critical */` (`route.ts:343`, chat title generation, and `route.ts:420`, resumable streams). Neither failure stops the answer, so staying quiet is reasonable.
- **gates:** the tools are `createDocument`, `editDocument`, `updateDocument`, `requestSuggestions` and `getWeather`. None sends, pays, deletes or publishes outside the app.

### How the overall was calculated

Weighted average of the checks that applied, the same formula the scan uses: stop (critical, weight 5) at 40, tools-visible (high, 3) at 100, failure (high, 3) at 70, and accessible-stream (high, 3) at 3 gives (5 × 40 + 3 × 100 + 3 × 70 + 3 × 3) / 14 = 51.4, rounded to **51**. The scan alone gives 77, because it scores stop at 100 and failure at 90.
