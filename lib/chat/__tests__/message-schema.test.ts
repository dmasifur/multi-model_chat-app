import { describe, it, expect } from 'vitest';
import {
  chatRequestSchema,
  MAX_MESSAGES_PER_REQUEST,
  MAX_TOTAL_MESSAGE_LENGTH,
} from '@/lib/chat/message-schema';
import { MAX_MESSAGE_LENGTH } from '@/lib/chat/message-length';

function userMessage(text: string) {
  return { id: 'm1', role: 'user', parts: [{ type: 'text', text }] };
}

describe('chatRequestSchema', () => {
  it('accepts a valid single-message request', () => {
    const result = chatRequestSchema.safeParse({
      modelId: 'groq-llama-3.3-70b',
      messages: [userMessage('hi')],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a message with no parts key', () => {
    const result = chatRequestSchema.safeParse({
      modelId: 'groq-llama-3.3-70b',
      messages: [{ role: 'user' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a message that is null', () => {
    const result = chatRequestSchema.safeParse({
      modelId: 'groq-llama-3.3-70b',
      messages: [null],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a text part whose text is a number', () => {
    const result = chatRequestSchema.safeParse({
      modelId: 'groq-llama-3.3-70b',
      messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 12345 }] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a role other than user or assistant', () => {
    const result = chatRequestSchema.safeParse({
      modelId: 'groq-llama-3.3-70b',
      messages: [{ id: 'm1', role: 'system', parts: [{ type: 'text', text: 'hi' }] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a single message over the per-message length cap', () => {
    const result = chatRequestSchema.safeParse({
      modelId: 'groq-llama-3.3-70b',
      messages: [userMessage('a'.repeat(MAX_MESSAGE_LENGTH + 1))],
    });
    expect(result.success).toBe(false);
  });

  it('rejects the newly-sent (last) message when it exceeds the per-message cap', () => {
    const result = chatRequestSchema.safeParse({
      modelId: 'groq-llama-3.3-70b',
      messages: [userMessage('hi'), userMessage('a'.repeat(MAX_MESSAGE_LENGTH + 1))],
    });
    expect(result.success).toBe(false);
  });

  it('accepts history containing a message over the per-message cap, as long as it is not the last one', () => {
    // Regression: assistant replies run up to MAX_OUTPUT_TOKENS and can
    // legitimately exceed MAX_MESSAGE_LENGTH. The cap must apply only to the
    // newly-sent message, or the first long reply permanently breaks the
    // column - every later send in it would be rejected forever.
    function assistantMessage(text: string) {
      return { id: 'm0', role: 'assistant', parts: [{ type: 'text', text }] };
    }
    const result = chatRequestSchema.safeParse({
      modelId: 'groq-llama-3.3-70b',
      messages: [assistantMessage('a'.repeat(MAX_MESSAGE_LENGTH + 1)), userMessage('hi')],
    });
    expect(result.success).toBe(true);
  });

  it('rejects more than MAX_MESSAGES_PER_REQUEST messages', () => {
    const messages = Array.from({ length: MAX_MESSAGES_PER_REQUEST + 1 }, () => userMessage('x'));
    const result = chatRequestSchema.safeParse({ modelId: 'groq-llama-3.3-70b', messages });
    expect(result.success).toBe(false);
  });

  it('rejects a total conversation length over the budget even when each message is individually under the per-message cap', () => {
    const messageCount = 20;
    const perMessage = Math.ceil(MAX_TOTAL_MESSAGE_LENGTH / messageCount) + 100;
    expect(perMessage).toBeLessThan(MAX_MESSAGE_LENGTH);

    const messages = Array.from({ length: messageCount }, () =>
      userMessage('a'.repeat(perMessage)),
    );
    const result = chatRequestSchema.safeParse({ modelId: 'groq-llama-3.3-70b', messages });
    expect(result.success).toBe(false);
  });
});
