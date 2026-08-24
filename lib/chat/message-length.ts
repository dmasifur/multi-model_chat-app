import type { UIMessage } from 'ai';

export const MAX_MESSAGE_LENGTH = 4000;

export function getMessageTextLength(message: UIMessage): number {
  return message.parts
    .filter((part) => part.type === 'text')
    .reduce((total, part) => total + part.text.length, 0);
}

export function exceedsMaxLength(message: UIMessage): boolean {
  return getMessageTextLength(message) > MAX_MESSAGE_LENGTH;
}
