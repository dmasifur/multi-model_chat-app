import { describe, it, expect } from 'vitest';
import type { UIMessage } from 'ai';
import { getMessageText } from '@/lib/chat/message-text';

describe('getMessageText', () => {
  it('returns the text of a single text part', () => {
    const message: UIMessage = { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] };
    expect(getMessageText(message)).toBe('hi');
  });

  it('joins text across multiple text parts with no separator', () => {
    const message: UIMessage = {
      id: 'm1',
      role: 'user',
      parts: [
        { type: 'text', text: 'hello ' },
        { type: 'text', text: 'world' },
      ],
    };
    expect(getMessageText(message)).toBe('hello world');
  });

  it('ignores non-text parts', () => {
    const message: UIMessage = {
      id: 'm1',
      role: 'user',
      parts: [{ type: 'step-start' }, { type: 'text', text: 'hi' }],
    };
    expect(getMessageText(message)).toBe('hi');
  });

  it('returns an empty string when there are no text parts', () => {
    const message: UIMessage = { id: 'm1', role: 'user', parts: [{ type: 'step-start' }] };
    expect(getMessageText(message)).toBe('');
  });
});
