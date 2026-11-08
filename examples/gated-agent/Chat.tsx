// The UI for the gated agent. A stop button while it responds (check 1),
// and felt-ui's <ToolCall> to approve or deny each gated action, with a
// "can't be undone" second step for refunds (check 2). When the model
// fails, it says what happened and offers Try again (check: failure).
'use client';

import { useChat } from '@ai-sdk/react';
import { ToolCall } from '@felt-ui/react';

export default function Chat() {
  const { messages, status, error, stop, regenerate, addToolApprovalResponse } = useChat();
  const isResponding = status === 'streaming' || status === 'submitted';

  return (
    <div aria-live="polite">
      {messages.flatMap((m) =>
        m.parts.map((part, i) =>
          part.state === 'approval-requested' ? (
            <ToolCall
              key={`${m.id}-${i}`}
              name={part.type === 'tool-refundOrder' ? 'Refund order' : 'Email customer'}
              args={part.input}
              reversible={false}
              onApprove={() => addToolApprovalResponse({ id: part.approval.id, approved: true })}
              onDeny={() => addToolApprovalResponse({ id: part.approval.id, approved: false })}
            />
          ) : part.type === 'text' ? (
            <p key={`${m.id}-${i}`}>{part.text}</p>
          ) : null,
        ),
      )}
      {error && (
        <div role="alert">
          <p>The assistant couldn't finish that answer. Your message is saved.</p>
          <button type="button" onClick={() => regenerate()}>
            Try again
          </button>
        </div>
      )}
      {isResponding && (
        <button type="button" onClick={() => stop()}>
          Stop
        </button>
      )}
    </div>
  );
}
