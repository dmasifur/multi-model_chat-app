import { describe, it, expect, vi, beforeEach } from 'vitest';
import { simulateReadableStream, type UIMessage } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/models', () => ({
  isModelAvailable: vi.fn(),
  getModel: vi.fn(),
}));

import { auth } from '@/auth';
import { isModelAvailable, getModel } from '@/lib/models';
import { POST } from '@/app/api/chat/route';

function userMessage(text: string): UIMessage {
  return { id: 'msg-1', role: 'user', parts: [{ type: 'text', text }] };
}

function chatRequest(body: unknown): Request {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(auth).mockReset();
  vi.mocked(isModelAvailable).mockReset();
  vi.mocked(getModel).mockReset();
});

describe('POST /api/chat', () => {
  it('returns 401 when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const response = await POST(
      chatRequest({ modelId: 'groq-llama-3.3-70b', messages: [userMessage('hi')] }),
    );

    expect(response.status).toBe(401);
  });

  it('returns 400 when the model id is missing or unavailable', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(isModelAvailable).mockReturnValue(false);

    const response = await POST(
      chatRequest({ modelId: 'not-configured', messages: [userMessage('hi')] }),
    );

    expect(response.status).toBe(400);
  });

  it('returns 400 when messages are missing or empty', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(isModelAvailable).mockReturnValue(true);

    const response = await POST(chatRequest({ modelId: 'groq-llama-3.3-70b', messages: [] }));

    expect(response.status).toBe(400);
  });

  it('returns 400 when the last message exceeds the length cap', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(isModelAvailable).mockReturnValue(true);

    const response = await POST(
      chatRequest({
        modelId: 'groq-llama-3.3-70b',
        messages: [userMessage('a'.repeat(4001))],
      }),
    );

    expect(response.status).toBe(400);
  });

  it('streams a response for a valid authenticated request', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(isModelAvailable).mockReturnValue(true);
    vi.mocked(getModel).mockReturnValue(
      new MockLanguageModelV4({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: 'text-start', id: 'text-1' },
              { type: 'text-delta', id: 'text-1', delta: 'Hello' },
              { type: 'text-end', id: 'text-1' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: undefined },
                logprobs: undefined,
                usage: {
                  inputTokens: {
                    total: 3,
                    noCache: 3,
                    cacheRead: undefined,
                    cacheWrite: undefined,
                  },
                  outputTokens: { total: 1, text: 1, reasoning: undefined },
                },
              },
            ],
          }),
        }),
      }) as never,
    );

    const response = await POST(
      chatRequest({ modelId: 'groq-llama-3.3-70b', messages: [userMessage('hi')] }),
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('Hello');
  });
});
