import { z } from 'zod';
import { MAX_MESSAGE_LENGTH, getMessageTextLength } from './message-length';
import type { UIMessage } from 'ai';

export const MAX_MESSAGES_PER_REQUEST = 100;
export const MAX_TOTAL_MESSAGE_LENGTH = 50_000;

const messagePartSchema = z
  .object({ type: z.string(), text: z.string().optional() })
  .passthrough()
  .superRefine((part, ctx) => {
    if (part.type === 'text' && typeof part.text !== 'string') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'text parts must include a string "text" field',
        path: ['text'],
      });
    }
  });

const uiMessageSchema = z
  .object({
    id: z.string().optional(),
    role: z.enum(['user', 'assistant']),
    parts: z.array(messagePartSchema).min(1),
  })
  .passthrough();

export const chatRequestSchema = z
  .object({
    modelId: z.string().min(1),
    messages: z.array(uiMessageSchema).min(1).max(MAX_MESSAGES_PER_REQUEST),
  })
  .superRefine((data, ctx) => {
    let total = 0;
    for (const [index, message] of data.messages.entries()) {
      // Safe: uiMessageSchema above validates that every 'text' part has a string `text`.
      const length = getMessageTextLength(message as UIMessage);
      total += length;
      if (length > MAX_MESSAGE_LENGTH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Message ${index} exceeds ${MAX_MESSAGE_LENGTH} characters`,
          path: ['messages', index],
        });
      }
    }
    if (total > MAX_TOTAL_MESSAGE_LENGTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Conversation exceeds ${MAX_TOTAL_MESSAGE_LENGTH} characters total`,
        path: ['messages'],
      });
    }
  });

export type ChatRequest = z.infer<typeof chatRequestSchema>;
