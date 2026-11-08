// The ungated agent's chat screen, with the most common mistakes:
// - it only renders text, so tool calls (emails, refunds) are invisible
// - nothing tells a screen reader that a new answer is arriving
// - the send button is just an icon, so a screen reader says "button"
// - the suggestion chips are clickable divs a keyboard can't reach
'use client';

import { useChat } from '@ai-sdk/react';
import { SendIcon } from 'lucide-react';

export default function Chat() {
  const { messages, input, setInput, sendMessage } = useChat();

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>
          {m.parts.map((part, i) =>
            part.type === 'text' ? <p key={i}>{part.text}</p> : null,
          )}
        </div>
      ))}
      <div className="chip" onClick={() => sendMessage({ text: 'Where is my order?' })}>
        Where is my order?
      </div>
      <form onSubmit={(e) => { e.preventDefault(); sendMessage({ text: input }); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} />
        <button type="submit">
          <SendIcon />
        </button>
      </form>
    </div>
  );
}
