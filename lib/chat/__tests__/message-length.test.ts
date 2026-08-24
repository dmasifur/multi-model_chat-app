import { describe, it, expect } from 'vitest';
import type { UIMessage } from 'ai';
import { MAX_MESSAGE_LENGTH, exceedsMaxLength } from '@/lib/chat/message-length';

function textMessage(text: string): UIMessage {
  return {
    id: 'test-id',
    role: 'user',
    parts: [{ type: 'text', text }],
  };
}

describe('exceedsMaxLength', () => {
  it('returns false for a short message', () => {
    expect(exceedsMaxLength(textMessage('hello'))).toBe(false);
  });

  it('returns false for a message exactly at the limit', () => {
    expect(exceedsMaxLength(textMessage('a'.repeat(MAX_MESSAGE_LENGTH)))).toBe(false);
  });

  it('returns true for a message over the limit', () => {
    expect(exceedsMaxLength(textMessage('a'.repeat(MAX_MESSAGE_LENGTH + 1)))).toBe(true);
  });

  it('sums text across multiple text parts', () => {
    const message: UIMessage = {
      id: 'test-id',
      role: 'user',
      parts: [
        { type: 'text', text: 'a'.repeat(MAX_MESSAGE_LENGTH) },
        { type: 'text', text: 'a' },
      ],
    };
    expect(exceedsMaxLength(message)).toBe(true);
  });

  it('ignores non-text parts', () => {
    const message: UIMessage = {
      id: 'test-id',
      role: 'user',
      parts: [{ type: 'step-start' }, { type: 'text', text: 'hello' }],
    };
    expect(exceedsMaxLength(message)).toBe(false);
  });
});
