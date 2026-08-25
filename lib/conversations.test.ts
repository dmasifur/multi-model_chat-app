import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import {
  createConversation,
  listConversations,
  saveMessage,
  getConversationWithMessages,
  groupMessagesByModel,
  toUIMessages,
} from '@/lib/conversations';

async function makeTestUser() {
  const [user] = await db
    .insert(users)
    .values({ email: `test-${randomUUID()}@example.com` })
    .returning();
  return user;
}

describe('conversation persistence (live Postgres)', () => {
  it('creates a conversation owned by the given user', async () => {
    const user = await makeTestUser();
    const conversation = await createConversation(user.id, 'My first chat');
    expect(conversation.userId).toBe(user.id);
    expect(conversation.title).toBe('My first chat');
  });

  it("lists a user's conversations, newest first", async () => {
    const user = await makeTestUser();
    const first = await createConversation(user.id, 'First');
    const second = await createConversation(user.id, 'Second');
    const list = await listConversations(user.id);
    expect(list.map((c) => c.id)).toEqual([second.id, first.id]);
  });

  it('saves messages and reads them back grouped by model', async () => {
    const user = await makeTestUser();
    const conversation = await createConversation(user.id, 'Compare models');

    await saveMessage({
      userId: user.id,
      conversationId: conversation.id,
      role: 'user',
      modelId: null,
      content: 'Hello',
    });
    await saveMessage({
      userId: user.id,
      conversationId: conversation.id,
      role: 'assistant',
      modelId: 'groq-llama-3.3-70b',
      content: 'Hi from Groq',
    });
    await saveMessage({
      userId: user.id,
      conversationId: conversation.id,
      role: 'assistant',
      modelId: 'ollama-llama-3.1',
      content: 'Hi from Ollama',
    });

    const loaded = await getConversationWithMessages(user.id, conversation.id);
    expect(loaded?.messages).toHaveLength(3);

    const grouped = groupMessagesByModel(loaded!.messages);
    expect(grouped.map((g) => g.modelId).sort()).toEqual(
      ['groq-llama-3.3-70b', 'ollama-llama-3.1'].sort(),
    );
    const groqColumn = grouped.find((g) => g.modelId === 'groq-llama-3.3-70b')!;
    expect(groqColumn.messages.map((m) => m.content)).toEqual(['Hello', 'Hi from Groq']);
  });

  it('returns null when the conversation does not belong to the requesting user', async () => {
    const owner = await makeTestUser();
    const stranger = await makeTestUser();
    const conversation = await createConversation(owner.id, 'Private');
    const loaded = await getConversationWithMessages(stranger.id, conversation.id);
    expect(loaded).toBeNull();
  });

  it('refuses to save a message when the given userId does not own the conversation', async () => {
    const owner = await makeTestUser();
    const stranger = await makeTestUser();
    const conversation = await createConversation(owner.id, 'Private');

    const result = await saveMessage({
      userId: stranger.id,
      conversationId: conversation.id,
      role: 'user',
      modelId: null,
      content: 'Should not be written',
    });

    expect(result).toBeNull();
    const loaded = await getConversationWithMessages(owner.id, conversation.id);
    expect(loaded?.messages).toHaveLength(0);
  });
});

describe('groupMessagesByModel (pure)', () => {
  it('groups assistant messages by modelId, sharing user messages across groups', () => {
    const grouped = groupMessagesByModel([
      { role: 'user', modelId: null, content: 'Q1', createdAt: new Date(0) },
      { role: 'assistant', modelId: 'a', content: 'A1', createdAt: new Date(1) },
      { role: 'assistant', modelId: 'b', content: 'B1', createdAt: new Date(2) },
    ]);
    expect(grouped).toHaveLength(2);
    expect(grouped.find((g) => g.modelId === 'a')?.messages.map((m) => m.content)).toEqual([
      'Q1',
      'A1',
    ]);
    expect(grouped.find((g) => g.modelId === 'b')?.messages.map((m) => m.content)).toEqual([
      'Q1',
      'B1',
    ]);
  });

  it('returns an empty array when there are no assistant messages yet', () => {
    expect(
      groupMessagesByModel([
        { role: 'user', modelId: null, content: 'Q1', createdAt: new Date(0) },
      ]),
    ).toEqual([]);
  });
});

describe('toUIMessages (pure)', () => {
  it('converts stored messages into UIMessage shape with text parts', () => {
    const uiMessages = toUIMessages([
      { role: 'user', modelId: null, content: 'Hello', createdAt: new Date(0) },
    ]);
    expect(uiMessages[0].role).toBe('user');
    expect(uiMessages[0].parts).toEqual([{ type: 'text', text: 'Hello' }]);
    expect(typeof uiMessages[0].id).toBe('string');
  });
});
