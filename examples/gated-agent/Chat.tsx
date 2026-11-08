// The UI for the gated agent. A stop button while it responds (check 1),
// and felt-ui's <ToolCall> to approve or deny each gated action, with a
// "can't be undone" second step for refunds (check 2).
'use client';

import { useChat } from '@ai-sdk/react';
import { ToolCall } from '@felt-ui/react';

export default function Chat() {
  const { messages, status, stop, addToolApprovalResponse } = useChat();
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
      {isResponding && (
        <button type="button" onClick={() => stop()}>
          Stop
        </button>
      )}
    </div>
  );
}
