'use client';

import { useImperativeHandle, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import type { ModelDefinition } from '@/lib/models';
import { getMessageText } from '@/lib/chat/message-text';

export interface ChatColumnHandle {
  sendMessage: (text: string, conversationId: string) => void;
}

export function ChatColumn({
  model,
  initialMessages,
  ref,
}: {
  model: ModelDefinition;
  initialMessages?: UIMessage[];
  ref: React.Ref<ChatColumnHandle>;
}) {
  const conversationIdRef = useRef<string | null>(null);

  const { messages, sendMessage, status, stop } = useChat({
    messages: initialMessages,
    onFinish: ({ message }) => {
      const conversationId = conversationIdRef.current;
      if (!conversationId) {
        return;
      }
      fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'assistant',
          modelId: model.id,
          content: getMessageText(message as UIMessage),
        }),
      });
    },
  });

  useImperativeHandle(ref, () => ({
    sendMessage: (text: string, conversationId: string) => {
      conversationIdRef.current = conversationId;
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
