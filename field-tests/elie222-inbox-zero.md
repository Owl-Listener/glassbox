## Glassbox review: elie222/inbox-zero (gates only)

*Commit `47f9b44` (2026-11-08) · 2,584 source files · reviewed by reading the code, not by running the app*

**Scope:** this review covers the `gates` check only. The other checks ran, but their evidence wasn't verified by hand, so their scores aren't reported here.

inbox-zero is an AI email assistant. Its chat agent can send, reply to, forward, trash and unsubscribe from email on the user's behalf: exactly the kind of actions `gates` exists for.

| Tool | What it can do | Asks first? |
|---|---|---|
| `sendEmailTool`, `replyEmailTool`, `forwardEmailTool` (`apps/web/utils/ai/assistant/chat-inbox-tools.ts:1291`, `:1335`, `:1382`) | Send email as the user | ✓ The tool only prepares the email ("This does NOT send immediately — it returns a confirmation payload for the user to approve") and the chat UI shows it as pending until the user confirms (`apps/web/components/assistant-chat/tools.tsx:591`) |
| `deleteRuleTool` (`.../tools/rules/delete-rule-tool.ts:15`) | Delete an automation rule | ✓ `requiresConfirmation` |
| `buildManageInboxTool` (`chat-inbox-tools.ts:1084`) | Trash threads, unsubscribe from senders, archive | ✗ Trashes and unsubscribes immediately (`:1241`, `:1142`) |
| `updateRuleTool` (`.../tools/rules/update-rule-tool.ts:37`) | Change an automation rule's conditions and actions | ✗ No confirmation, though creating and deleting rules both ask |

**gates: 67/100** (4 of 6 consequential tools ask first; scan and judgment agree).

### Worth fixing

1. **Unsubscribing happens without asking** (`chat-inbox-tools.ts:1141`). An unsubscribe request goes to the sender and can't be taken back. Trashing (`:1240`) is recoverable from the trash folder, so a lighter gate, or an undo, would be proportional there.
   **Fix:** route `unsubscribe_senders` and `trash_threads` through the same pending-confirmation flow the email tools already use.
2. **Editing a rule doesn't ask, but creating and deleting one do** (`update-rule-tool.ts:37`). A rule acts on future email automatically, so a changed rule can do as much as a new one.
   **Fix:** return `requiresConfirmation` from `updateRuleTool`, as `create-rule-tool.ts:72` does.

### Fine as is

- **The pending-action pattern for email is excellent.** The model prepares; the person sends. It's the clearest real-world example of heuristic #8 we've found, and glassbox didn't recognise it at first (see below).
- Creating a rule and saving a memory also ask first (`requiresConfirmation`). That's sensible caution for things that change future behaviour, not "gate everywhere".
