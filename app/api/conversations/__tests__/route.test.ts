import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/conversations', () => ({
  createConversation: vi.fn(),
  listConversations: vi.fn(),
}));

import { auth } from '@/auth';
import { createConversation, listConversations } from '@/lib/conversations';
import { POST, GET } from '@/app/api/conversations/route';

beforeEach(() => {
  vi.mocked(auth).mockReset();
  vi.mocked(createConversation).mockReset();
  vi.mocked(listConversations).mockReset();
});

describe('POST /api/conversations', () => {
  it('returns 401 without a session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(
      new Request('http://localhost/api/conversations', { method: 'POST', body: '{}' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 without a title', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    const res = await POST(
      new Request('http://localhost/api/conversations', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for a malformed JSON body instead of crashing', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    const res = await POST(
      new Request('http://localhost/api/conversations', {
        method: 'POST',
        body: 'not valid json',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for a title over 200 characters', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    const res = await POST(
      new Request('http://localhost/api/conversations', {
        method: 'POST',
        body: JSON.stringify({ title: 'a'.repeat(201) }),
      }),
    );
    expect(res.status).toBe(400);
    expect(createConversation).not.toHaveBeenCalled();
  });

  it('creates a conversation for the authed user', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(createConversation).mockResolvedValue({
      id: 'c1',
      userId: 'user-1',
      title: 'Hi',
      createdAt: new Date(),
    } as never);

    const res = await POST(
      new Request('http://localhost/api/conversations', {
        method: 'POST',
        body: JSON.stringify({ title: 'Hi' }),
      }),
    );

    expect(res.status).toBe(201);
    expect(createConversation).toHaveBeenCalledWith('user-1', 'Hi');
  });
});

describe('GET /api/conversations', () => {
  it('returns 401 without a session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("lists the authed user's conversations", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(listConversations).mockResolvedValue([{ id: 'c1' } as never]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(listConversations).toHaveBeenCalledWith('user-1');
  });
});
