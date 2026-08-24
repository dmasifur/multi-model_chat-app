'use client';

import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import type { ModelDefinition } from '@/lib/models';

export function ChatPage({ availableModels }: { availableModels: ModelDefinition[] }) {
  const [modelId, setModelId] = useState(availableModels[0]?.id ?? '');
  const [input, setInput] = useState('');
  const { messages, sendMessage, status } = useChat();

  if (availableModels.length === 0) {
    return <p>No models are configured. Set at least one provider API key to start chatting.</p>;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }
    sendMessage({ text: trimmed }, { body: { modelId } });
    setInput('');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-4">
      <select
        value={modelId}
        onChange={(event) => setModelId(event.target.value)}
        aria-label="Model"
        className="rounded border px-3 py-2"
      >
        {availableModels.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label}
          </option>
        ))}
      </select>
      <div className="flex-1 space-y-2 overflow-y-auto">
        {messages.map((message) => (
          <div key={message.id}>
            <strong>{message.role === 'user' ? 'You' : 'AI'}:</strong>{' '}
            {message.parts.map((part, index) =>
              part.type === 'text' ? <span key={index}>{part.text}</span> : null,
            )}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Type a message..."
          disabled={status !== 'ready'}
          className="flex-1 rounded border px-3 py-2"
        />
        <button
          type="submit"
          disabled={status !== 'ready'}
          className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </main>
  );
}
