'use client';

import { useRef, useState } from 'react';
import type { ModelAvailability } from '@/lib/models';
import type { GroupedColumn } from '@/lib/conversations';
import { ChatColumn, type ChatColumnHandle } from '@/components/chat-column';

export function ChatPage({
  allModels,
  conversationId: initialConversationId,
  initialColumns,
}: {
  allModels: ModelAvailability[];
  conversationId?: string;
  initialColumns?: GroupedColumn[];
}) {
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>(() => {
    if (initialColumns && initialColumns.length > 0) {
      return initialColumns.map((column) => column.modelId);
    }
    const firstAvailable = allModels.find((model) => model.available);
    return firstAvailable ? [firstAvailable.id] : [];
  });
  const [conversationId, setConversationId] = useState<string | undefined>(initialConversationId);
  const [input, setInput] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const columnRefs = useRef<Record<string, ChatColumnHandle | null>>({});

  if (allModels.length === 0) {
    return <p>No models are configured. Set at least one provider API key to start chatting.</p>;
  }

  function toggleModel(id: string) {
    const model = allModels.find((m) => m.id === id);
    if (!model?.available) {
      return;
    }
    setSelectedModelIds((current) =>
      current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id],
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || selectedModelIds.length === 0) {
      return;
    }
    setSubmitError(null);

    let activeConversationId = conversationId;
    if (!activeConversationId) {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      });
      // A non-2xx body here is plain text (401/429/503, see the route), not
      // JSON - parsing it as JSON would throw. Stop before sending anything
      // to a model and leave the input intact so the user can retry.
      if (!response.ok) {
        setSubmitError('Could not start a new conversation. Please try again.');
        return;
      }
      const conversation = (await response.json()) as { id: string };
      activeConversationId = conversation.id;
      setConversationId(activeConversationId);
    }

    const messageResponse = await fetch(`/api/conversations/${activeConversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'user', modelId: null, content: trimmed }),
    });
    if (!messageResponse.ok) {
      setSubmitError('Could not save your message. Please try again.');
      return;
    }

    for (const modelId of selectedModelIds) {
      columnRefs.current[modelId]?.sendMessage(trimmed, activeConversationId);
    }
    setInput('');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4">
      <fieldset className="flex flex-wrap gap-3">
        <legend className="sr-only">Models to compare</legend>
        {allModels.map((model) => (
          <label
            key={model.id}
            className="flex items-center gap-1"
            title={model.available ? undefined : `${model.provider} is not configured`}
          >
            <input
              type="checkbox"
              checked={selectedModelIds.includes(model.id)}
              disabled={!model.available}
              onChange={() => toggleModel(model.id)}
            />
            {model.label}
            {!model.available && <span className="text-xs text-gray-400"> (unavailable)</span>}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-1 flex-wrap gap-4">
        {selectedModelIds.map((modelId) => {
          const model = allModels.find((m) => m.id === modelId);
          if (!model) {
            return null;
          }
          const initial = initialColumns?.find((column) => column.modelId === modelId);
          return (
            <ChatColumn
              key={model.id}
              model={model}
              initialMessages={
                initial
                  ? initial.messages.map((message) => ({
                      id: crypto.randomUUID(),
                      role: message.role,
                      parts: [{ type: 'text' as const, text: message.content }],
                    }))
                  : undefined
              }
              ref={(handle) => {
                columnRefs.current[model.id] = handle;
              }}
            />
          );
        })}
      </div>
      {submitError && (
        <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {submitError}
        </p>
      )}
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
