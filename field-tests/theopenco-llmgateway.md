## Glassbox review: theopenco/llmgateway (refusal only)

*Commit `525117a` (2026-11-08) · 2,863 source files · reviewed by reading the code, not by running the app*

**Scope:** this review covers the `refusal` check only. The other seven checks ran (scan overall: 88), but their evidence wasn't verified by hand, so their scores aren't reported here.

| Refusal | Where | Reason | Way forward | Score |
|---|---|---|---|---|
| Support chat prompt: *"If the question is unrelated to LLM Gateway, politely decline and invite a product question."* | `apps/api/src/routes/public-chat-support.ts:114` | ✗ | ✓ "invite a product question" | 50 |
| Content-filter message: *"This request was blocked by LLM Gateway's content filter. This is the gateway's own filter, not the model provider's. Please contact LLM Gateway support at contact@llmgateway.io…"* | `packages/shared/src/content-filter.ts:81` | ✓ names what blocked it | ✓ a contact | 100 |
| Compliance message: *"This request was blocked by your organization or API key provider compliance policy. No available provider for {model} meets the required certifications…"* | `apps/gateway/src/lib/compliance.ts:221` | ✓ the policy, and why no provider fits | ✓ contact your admin | 100 |

**refusal: 83/100** (scan and judgment agree).

### Worth fixing

**The support chat declines without saying why.** The model is told to decline and invite a product question, which is a good redirect. But it isn't told to say *why* it's declining, so users may read it as the bot failing rather than staying in scope.
**Fix:** "…politely decline, say that you only help with LLM Gateway, and invite a product question."

### Fine as is

- **Both gateway block messages** name what stopped the request and give a next step. The content-filter message also makes a useful distinction: it's the gateway's own filter, not the model provider's, so users know whom to contact. It doesn't say *what* in the request triggered the filter, which would help users fix it themselves.
