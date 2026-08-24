import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/conversations', () => ({
  getConversationWithMessages: vi.fn(),
  groupMessagesByModel: vi.fn(),
}));

import { auth } from '@/auth';
import { getConversationWithMessages, groupMessagesByModel } from '@/lib/conversations';
import { GET } from '@/app/api/conversations/[id]/route';

beforeEach(() => {
  vi.mocked(auth).mockReset();
  vi.mocked(getConversationWithMessages).mockReset();
  vi.mocked(groupMessagesByModel).mockReset();
});

describe('GET /api/conversations/[id]', () => {
  it('returns 401 without a session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'c1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 when the conversation is not found or not owned', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(getConversationWithMessages).mockResolvedValue(null);
    const res = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'c1' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns the grouped conversation on success', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(getConversationWithMessages).mockResolvedValue({
      id: 'c1',
      title: 'Hi',
      messages: [],
    } as never);
    vi.mocked(groupMessagesByModel).mockReturnValue([{ modelId: 'a', messages: [] }]);

    const res = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'c1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groupedColumns).toEqual([{ modelId: 'a', messages: [] }]);
  });
});
