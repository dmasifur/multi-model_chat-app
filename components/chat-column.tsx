'use client';

import { useImperativeHandle } from 'react';
import { useChat } from '@ai-sdk/react';
import type { ModelDefinition } from '@/lib/models';

export interface ChatColumnHandle {
  sendMessage: (text: string) => void;
}

export function ChatColumn({
  model,
  ref,
}: {
  model: ModelDefinition;
  ref: React.Ref<ChatColumnHandle>;
}) {
  const { messages, sendMessage, status, stop } = useChat();

  useImperativeHandle(ref, () => ({
    sendMessage: (text: string) => {
      sendMessage({ text }, { body: { modelId: model.id } });
    },
  }));

  return (
    <div className="flex min-w-[280px] flex-1 flex-col gap-2 rounded border p-3">
      <h2 className="font-semibold">{model.label}</h2>
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
      {(status === 'submitted' || status === 'streaming') && (
        <button
          type="button"
          onClick={() => stop()}
          className="self-start rounded border px-2 py-1 text-sm"
        >
          Stop
        </button>
      )}
    </div>
  );
}
