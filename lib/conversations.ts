import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, messages } from '@/lib/db/schema';

export interface StoredMessage {
  role: 'user' | 'assistant';
  modelId: string | null;
  content: string;
  createdAt: Date;
}

export interface GroupedColumn {
  modelId: string;
  messages: StoredMessage[];
}

export async function createConversation(userId: string, title: string) {
  const [conversation] = await db.insert(conversations).values({ userId, title }).returning();
  return conversation;
}

export async function listConversations(userId: string) {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.createdAt));
}

export async function saveMessage(input: {
  conversationId: string;
  role: 'user' | 'assistant';
  modelId: string | null;
  content: string;
}) {
  const [message] = await db.insert(messages).values(input).returning();
  return message;
}

export async function getConversationWithMessages(userId: string, conversationId: string) {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));

  if (!conversation) {
    return null;
  }

  const conversationMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));

  return { ...conversation, messages: conversationMessages as StoredMessage[] };
}

export function groupMessagesByModel(allMessages: StoredMessage[]): GroupedColumn[] {
  const modelIds = Array.from(
    new Set(
      allMessages
        .filter((message) => message.role === 'assistant' && message.modelId)
        .map((message) => message.modelId as string),
    ),
  );

  return modelIds.map((modelId) => ({
    modelId,
    messages: allMessages.filter(
      (message) => message.role === 'user' || message.modelId === modelId,
    ),
  }));
}

export function toUIMessages(storedMessages: StoredMessage[]) {
  return storedMessages.map((message) => ({
    id: crypto.randomUUID(),
    role: message.role,
    parts: [{ type: 'text' as const, text: message.content }],
  }));
}
