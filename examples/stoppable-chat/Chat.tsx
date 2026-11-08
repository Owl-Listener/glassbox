// The same chat, fixed: a stop button that appears while the agent is
// responding and cancels the request. Also accessible: new messages are
// announced to screen readers (aria-live), which check 8 will look for.
'use client';

import { useChat } from '@ai-sdk/react';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, status, stop } = useChat();
  const isResponding = status === 'streaming' || status === 'submitted';

  return (
    <div>
      <div aria-live="polite">
        {messages.map((m) => (
          <p key={m.id}>{m.content}</p>
        ))}
      </div>
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
        {isResponding ? (
          <button type="button" onClick={() => stop()}>
            Stop
          </button>
        ) : (
          <button type="submit">Send</button>
        )}
      </form>
    </div>
  );
}
