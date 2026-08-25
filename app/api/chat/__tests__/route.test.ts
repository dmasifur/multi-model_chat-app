import { describe, it, expect, vi, beforeEach } from 'vitest';
import { simulateReadableStream, streamText, type UIMessage } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, streamText: vi.fn(actual.streamText) };
});

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/models', () => ({
  isModelAvailable: vi.fn(),
  getModel: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
}));

import { auth } from '@/auth';
import { isModelAvailable, getModel } from '@/lib/models';
import { checkRateLimit } from '@/lib/rate-limit';
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
  vi.mocked(checkRateLimit).mockReset();
  vi.mocked(checkRateLimit).mockResolvedValue(true);
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

  it('caps output tokens and forwards the request abort signal to the provider call', async () => {
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
                  inputTokens: { total: 3, noCache: 3, cacheRead: undefined, cacheWrite: undefined },
                  outputTokens: { total: 1, text: 1, reasoning: undefined },
                },
              },
            ],
          }),
        }),
      }) as never,
    );

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ modelId: 'groq-llama-3.3-70b', messages: [userMessage('hi')] }),
    });
    const response = await POST(request);
    await response.text();

    const call = vi.mocked(streamText).mock.calls[0][0];
    expect(call.maxOutputTokens).toBe(2048);
    expect(call.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('returns 400 for a malformed JSON body', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);

    const response = await POST(
      new Request('http://localhost/api/chat', { method: 'POST', body: 'not valid json' }),
    );

    expect(response.status).toBe(400);
  });

  it('returns 400 instead of crashing when a message has no parts', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(isModelAvailable).mockReturnValue(true);

    const response = await POST(
      chatRequest({ modelId: 'groq-llama-3.3-70b', messages: [{ role: 'user' }] }),
    );

    expect(response.status).toBe(400);
  });

  it('returns 400 instead of silently passing when a text part has a non-string text', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(isModelAvailable).mockReturnValue(true);

    const response = await POST(
      chatRequest({
        modelId: 'groq-llama-3.3-70b',
        messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 12345 }] }],
      }),
    );

    expect(response.status).toBe(400);
  });

  it('returns 429 when the user has exceeded the rate limit', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(isModelAvailable).mockReturnValue(true);
    vi.mocked(checkRateLimit).mockResolvedValue(false);

    const response = await POST(
      chatRequest({ modelId: 'groq-llama-3.3-70b', messages: [userMessage('hi')] }),
    );

    expect(response.status).toBe(429);
  });

  it('returns 400 for a large number of prior messages that together exceed the conversation budget, even though the last message is short', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(isModelAvailable).mockReturnValue(true);

    const priorMessages = Array.from({ length: 20 }, () => userMessage('a'.repeat(3000)));
    const response = await POST(
      chatRequest({
        modelId: 'groq-llama-3.3-70b',
        messages: [...priorMessages, userMessage('hi!')],
      }),
    );

    expect(response.status).toBe(400);
  });
});
