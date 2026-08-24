'use client';

import { useRef, useState } from 'react';
import type { ModelDefinition } from '@/lib/models';
import { ChatColumn, type ChatColumnHandle } from '@/components/chat-column';

export function ChatPage({ availableModels }: { availableModels: ModelDefinition[] }) {
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>(
    availableModels[0] ? [availableModels[0].id] : [],
  );
  const [input, setInput] = useState('');
  const columnRefs = useRef<Record<string, ChatColumnHandle | null>>({});

  if (availableModels.length === 0) {
    return <p>No models are configured. Set at least one provider API key to start chatting.</p>;
  }

  function toggleModel(id: string) {
    setSelectedModelIds((current) =>
      current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id],
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || selectedModelIds.length === 0) {
      return;
    }
    for (const modelId of selectedModelIds) {
      columnRefs.current[modelId]?.sendMessage(trimmed);
    }
    setInput('');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4">
      <fieldset className="flex flex-wrap gap-3">
        <legend className="sr-only">Models to compare</legend>
        {availableModels.map((model) => (
          <label key={model.id} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={selectedModelIds.includes(model.id)}
              onChange={() => toggleModel(model.id)}
            />
            {model.label}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-1 flex-wrap gap-4">
        {selectedModelIds.map((modelId) => {
          const model = availableModels.find((m) => m.id === modelId);
          if (!model) {
            return null;
          }
          return (
            <ChatColumn
              key={model.id}
              model={model}
              ref={(handle) => {
                columnRefs.current[model.id] = handle;
              }}
            />
          );
        })}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Type a message..."
          className="flex-1 rounded border px-3 py-2"
        />
        <button
          type="submit"
          disabled={selectedModelIds.length === 0}
          className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </main>
  );
}
