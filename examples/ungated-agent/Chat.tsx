// The ungated agent's chat screen, and the most common mistake: it only
// renders text. When the agent emails a customer or issues a refund,
// nothing appears on screen. The user finds out later, or never.
'use client';

import { useChat } from '@ai-sdk/react';

export default function Chat() {
  const { messages, sendMessage } = useChat();

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>
          {m.parts.map((part, i) =>
            part.type === 'text' ? <p key={i}>{part.text}</p> : null,
          )}
        </div>
      ))}
    </div>
  );
}
