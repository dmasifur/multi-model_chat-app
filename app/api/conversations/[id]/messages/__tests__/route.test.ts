import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/conversations', () => ({
  getConversationWithMessages: vi.fn(),
  saveMessage: vi.fn(),
}));

import { auth } from '@/auth';
import { getConversationWithMessages, saveMessage } from '@/lib/conversations';
import { POST } from '@/app/api/conversations/[id]/messages/route';

function req(body: unknown) {
  return new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.mocked(auth).mockReset();
  vi.mocked(getConversationWithMessages).mockReset();
  vi.mocked(saveMessage).mockReset();
});

describe('POST /api/conversations/[id]/messages', () => {
  it('returns 401 without a session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(req({}), { params: Promise.resolve({ id: 'c1' }) });
    expect(res.status).toBe(401);
  });

  it('returns 404 when the conversation is not owned', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(getConversationWithMessages).mockResolvedValue(null);
    const res = await POST(req({ role: 'user', content: 'hi' }), {
      params: Promise.resolve({ id: 'c1' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid role or empty content', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(getConversationWithMessages).mockResolvedValue({ id: 'c1' } as never);
    const res = await POST(req({ role: 'system', content: 'hi' }), {
      params: Promise.resolve({ id: 'c1' }),
    });
    expect(res.status).toBe(400);
  });

  it('saves a valid message', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(getConversationWithMessages).mockResolvedValue({ id: 'c1' } as never);
    vi.mocked(saveMessage).mockResolvedValue({ id: 'm1' } as never);

    const res = await POST(
      req({ role: 'assistant', modelId: 'groq-llama-3.3-70b', content: 'Hi' }),
      { params: Promise.resolve({ id: 'c1' }) },
    );

    expect(res.status).toBe(201);
    expect(saveMessage).toHaveBeenCalledWith({
      conversationId: 'c1',
      role: 'assistant',
      modelId: 'groq-llama-3.3-70b',
      content: 'Hi',
    });
  });
});
