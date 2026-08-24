# Phase 8 — Persistence & History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist every chat turn to Phase 2's `conversations`/`messages` tables, add a conversation history sidebar, and reconstruct a past conversation's columns on reload — turning the app from a stateless demo into one that remembers.

**Architecture:** A new `lib/conversations.ts` holds all DB access (create/list/get conversations, save a message) plus one pure function the spec calls out explicitly for its own test — `groupMessagesByModel`, which turns a flat chronological message list into per-model column data (shared user messages + that model's own assistant replies). Four new API routes expose this to the client, auth-guarded and ownership-checked. Persistence itself is client-driven, not baked into `/api/chat` (which stays exactly as Phase 5 left it — no changes this phase): `ChatPage` creates a conversation lazily on the first send and POSTs the user's message; each `ChatColumn` POSTs its own assistant message via `useChat`'s `onFinish` callback once its stream completes, tagged with its own `modelId` — matching the spec's data model exactly (one user message, several assistant messages sharing a conversation, distinguished by `modelId`). Reload reconstruction is a new dynamic route, `app/c/[id]/page.tsx`, that loads a conversation server-side, groups its messages, and seeds each column's `useChat` via the `messages` initializer. A new `AppShell` Server Component wraps both the home page and the conversation page with a sidebar listing past conversations.

**Tech Stack:** Drizzle ORM (query builder API — `db.select()/.insert()`, not the relational `db.query.*` API, since `lib/db/index.ts`'s `drizzle(client)` call has no schema passed to it). Next.js dynamic routes. Bun, Vitest, `@testing-library/react`.

**Spec:** `docs/superpowers/specs/2026-08-25-multi-model-chat-design.md`

## Global Constraints

- Package manager / runtime: **Bun**. Tests via **Vitest** (`bun run test`).
- Branch: all Phase 8 work on **`phase-8-persistence`**, off `phase-7-fanout` (reviewed/ready, not yet merged — same situation as prior phases); merged via PR.
- Commits: **small, meaningful chunks**; **no `Co-Authored-By: Claude` trailer**.
- Persistence flow (from spec, verbatim): "A new conversation is created lazily on first send; the title is derived from the first prompt. The user message is saved when the turn is sent. When a stream finishes, the client posts the completed assistant message (with its `modelId`) to `/api/conversations/[id]/messages`."
- Data model (from spec, verbatim, already built in Phase 2 — this phase only reads/writes it): `conversations` (`id`, `userId`, `title`, `createdAt`); `messages` (`id`, `conversationId`, `role`, `modelId` nullable, `content`, `createdAt`). "One user turn is one `user` message plus several `assistant` messages sharing the conversation, distinguished by `modelId`. On reload, columns are reconstructed by grouping assistant messages by `modelId`."
- Ownership: every conversation read/write must verify `conversations.userId === session.user.id` — a user must never read or write another user's conversation.
- `/api/chat` (Phase 5) is **not modified** this phase — it stays stateless; persistence happens alongside it via separate endpoints, not inside it.
- Run `bun run build` before committing any task — this project has caught real bugs (Phases 4-7) that `bun run test` alone missed.

## File Structure

- `lib/conversations.ts` — **create.** `createConversation`, `listConversations`, `getConversationWithMessages` (ownership-checked), `saveMessage`, plus the pure `groupMessagesByModel` and `toUIMessages` helpers.
- `lib/conversations.test.ts` — **create.** Live-DB integration tests for the CRUD functions (same pattern as Phase 2's `lib/db/__tests__` — real Postgres via docker compose) plus pure unit tests for `groupMessagesByModel`/`toUIMessages`.
- `app/api/conversations/route.ts` — **create.** `POST` (create) and `GET` (list) for the authed user.
- `app/api/conversations/[id]/route.ts` — **create.** `GET` a single conversation with its grouped messages (ownership-checked).
- `app/api/conversations/[id]/messages/route.ts` — **create.** `POST` a message onto a conversation (ownership-checked).
- `app/api/conversations/__tests__/route.test.ts`, `app/api/conversations/[id]/__tests__/route.test.ts`, `app/api/conversations/[id]/messages/__tests__/route.test.ts` — **create.** Integration tests mocking `@/auth` and `@/lib/conversations` (same pattern as Phase 5's `/api/chat` tests).
- `lib/chat/message-text.ts` — **create.** `getMessageText(message: UIMessage): string`, extracting plain text from a message's parts — shared by the client (building the POST body) and reusable wherever message content needs flattening.
- `components/chat-column.tsx` — **modify.** Add `initialMessages?: UIMessage[]` prop (seeds `useChat`'s `messages` option); add an `onFinish` callback that POSTs the assistant message once a stream completes; change `ChatColumnHandle.sendMessage` to `(text: string, conversationId: string) => void` so the caller passes the resolved conversation id explicitly (avoids any prop-closure staleness with the async `onFinish` callback — the id is captured into a ref at call time).
- `components/__tests__/chat-column.test.tsx` — **modify.** Add cases for the new prop/callback/handle signature.
- `components/chat-page.tsx` — **modify.** Add `conversationId?: string` and `initialColumns?: GroupedColumn[]` props; on first send with no `conversationId`, `POST /api/conversations` then `POST` the user message; pass the resolved id to each column's `sendMessage`.
- `components/__tests__/chat-page.test.tsx` — **modify.** Add cases for conversation creation, message saving, and seeding from `initialColumns`.
- `components/app-shell.tsx` — **create.** Server Component: sign-out action, "New chat" link, conversation list sidebar.
- `app/page.tsx` — **modify.** Wrap `ChatPage` in `AppShell`.
- `app/c/[id]/page.tsx` — **create.** Loads a conversation (ownership-checked, 404 otherwise), groups its messages, renders `ChatPage` seeded from it inside `AppShell`.

---

### Task 1: Create the Phase 8 branch

**Files:** none (git only)

- [ ] **Step 1: Branch off phase-7-fanout**

```bash
git checkout phase-7-fanout
git checkout -b phase-8-persistence
```

- [ ] **Step 2: Verify branch and Postgres**

Run: `git branch --show-current` — expected: `phase-8-persistence`.
Run: `docker compose ps` — expected: `db` service `Up`. If not, `docker compose up -d`.

---

### Task 2: Conversation DB helpers and grouping logic

**Files:**
- Create: `lib/conversations.ts`, `lib/conversations.test.ts`

**Interfaces:**
- Consumes: `db` from `@/lib/db` (Phase 1); `conversations`, `messages`, `messageRoleEnum` from `@/lib/db/schema` (Phase 2).
- Produces: `createConversation(userId, title)`, `listConversations(userId)`, `getConversationWithMessages(userId, conversationId)`, `saveMessage(input)`, `groupMessagesByModel(messages)`, `toUIMessages(messages)` — all named exports from `@/lib/conversations`, consumed by Task 3's API routes and (via those routes) the UI.

- [ ] **Step 1: Write the failing test**

`lib/conversations.test.ts`:

```ts
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

  it('lists a user\'s conversations, newest first', async () => {
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
      conversationId: conversation.id,
      role: 'user',
      modelId: null,
      content: 'Hello',
    });
    await saveMessage({
      conversationId: conversation.id,
      role: 'assistant',
      modelId: 'groq-llama-3.3-70b',
      content: 'Hi from Groq',
    });
    await saveMessage({
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
      groupMessagesByModel([{ role: 'user', modelId: null, content: 'Q1', createdAt: new Date(0) }]),
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test lib/conversations.test.ts`
Expected: FAIL — cannot resolve `@/lib/conversations` (does not exist yet).

- [ ] **Step 3: Write `lib/conversations.ts`**

```ts
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
    messages: allMessages.filter((message) => message.role === 'user' || message.modelId === modelId),
  }));
}

export function toUIMessages(storedMessages: StoredMessage[]) {
  return storedMessages.map((message) => ({
    id: crypto.randomUUID(),
    role: message.role,
    parts: [{ type: 'text' as const, text: message.content }],
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test lib/conversations.test.ts`
Expected: PASS — 8/8 tests green (Postgres must be up).

- [ ] **Step 5: Run the full suite and build**

Run: `bun run test` — expected: all pass.
Run: `bun run build` — expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add lib/conversations.ts lib/conversations.test.ts
git commit -m "Add conversation persistence and grouping helpers"
```

---

### Task 3: Conversation API routes

**Files:**
- Create: `app/api/conversations/route.ts`, `app/api/conversations/__tests__/route.test.ts`
- Create: `app/api/conversations/[id]/route.ts`, `app/api/conversations/[id]/__tests__/route.test.ts`
- Create: `app/api/conversations/[id]/messages/route.ts`, `app/api/conversations/[id]/messages/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `auth` from `@/auth` (Phase 3); `createConversation`, `listConversations`, `getConversationWithMessages`, `saveMessage`, `groupMessagesByModel` from `@/lib/conversations` (Task 2).
- Produces: `POST`/`GET` handlers Next.js's App Router dispatches to for each route.

- [ ] **Step 1: Write `app/api/conversations/route.ts`**

```ts
import { auth } from '@/auth';
import { createConversation, listConversations } from '@/lib/conversations';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { title } = (await req.json()) as { title?: string };
  if (!title || typeof title !== 'string') {
    return new Response('Title is required', { status: 400 });
  }

  const conversation = await createConversation(session.user.id, title.slice(0, 200));
  return Response.json(conversation, { status: 201 });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const list = await listConversations(session.user.id);
  return Response.json(list);
}
```

- [ ] **Step 2: Write `app/api/conversations/__tests__/route.test.ts`**

```ts
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
    vi.mocked(auth).mockResolvedValue(null);
    const res = await POST(new Request('http://localhost/api/conversations', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 without a title', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    const res = await POST(
      new Request('http://localhost/api/conversations', { method: 'POST', body: JSON.stringify({}) }),
    );
    expect(res.status).toBe(400);
  });

  it('creates a conversation for the authed user', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(createConversation).mockResolvedValue({ id: 'c1', userId: 'user-1', title: 'Hi', createdAt: new Date() } as never);

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
    vi.mocked(auth).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('lists the authed user\'s conversations', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(listConversations).mockResolvedValue([{ id: 'c1' } as never]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(listConversations).toHaveBeenCalledWith('user-1');
  });
});
```

- [ ] **Step 3: Write `app/api/conversations/[id]/route.ts`**

```ts
import { auth } from '@/auth';
import { getConversationWithMessages, groupMessagesByModel } from '@/lib/conversations';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;
  const conversation = await getConversationWithMessages(session.user.id, id);
  if (!conversation) {
    return new Response('Not found', { status: 404 });
  }

  return Response.json({
    id: conversation.id,
    title: conversation.title,
    groupedColumns: groupMessagesByModel(conversation.messages),
  });
}
```

- [ ] **Step 4: Write `app/api/conversations/[id]/__tests__/route.test.ts`**

```ts
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
    vi.mocked(auth).mockResolvedValue(null);
    const res = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: 'c1' }) });
    expect(res.status).toBe(401);
  });

  it('returns 404 when the conversation is not found or not owned', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(getConversationWithMessages).mockResolvedValue(null);
    const res = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: 'c1' }) });
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

    const res = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: 'c1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groupedColumns).toEqual([{ modelId: 'a', messages: [] }]);
  });
});
```

- [ ] **Step 5: Write `app/api/conversations/[id]/messages/route.ts`**

```ts
import { auth } from '@/auth';
import { getConversationWithMessages, saveMessage } from '@/lib/conversations';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;
  const conversation = await getConversationWithMessages(session.user.id, id);
  if (!conversation) {
    return new Response('Not found', { status: 404 });
  }

  const body = (await req.json()) as { role?: string; modelId?: string | null; content?: string };
  if (
    (body.role !== 'user' && body.role !== 'assistant') ||
    typeof body.content !== 'string' ||
    body.content.length === 0
  ) {
    return new Response('Invalid message', { status: 400 });
  }

  const message = await saveMessage({
    conversationId: id,
    role: body.role,
    modelId: body.modelId ?? null,
    content: body.content,
  });

  return Response.json(message, { status: 201 });
}
```

- [ ] **Step 6: Write `app/api/conversations/[id]/messages/__tests__/route.test.ts`**

```ts
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
    vi.mocked(auth).mockResolvedValue(null);
    const res = await POST(req({}), { params: Promise.resolve({ id: 'c1' }) });
    expect(res.status).toBe(401);
  });

  it('returns 404 when the conversation is not owned', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(getConversationWithMessages).mockResolvedValue(null);
    const res = await POST(req({ role: 'user', content: 'hi' }), { params: Promise.resolve({ id: 'c1' }) });
    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid role or empty content', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(getConversationWithMessages).mockResolvedValue({ id: 'c1' } as never);
    const res = await POST(req({ role: 'system', content: 'hi' }), { params: Promise.resolve({ id: 'c1' }) });
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
```

- [ ] **Step 7: Run all three test files, then the full suite and build**

Run: `bun run test app/api/conversations` — expected: PASS (12/12 across the three files: 5 + 3 + 4).
Run: `bun run test` — expected: all pass.
Run: `bun run build` — expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add app/api/conversations
git commit -m "Add conversation and message API routes"
```

---

### Task 4: ChatColumn persistence wiring

**Files:**
- Create: `lib/chat/message-text.ts`
- Modify: `components/chat-column.tsx`, `components/__tests__/chat-column.test.tsx`

**Interfaces:**
- Consumes: `getMessageText` (this task, same task defines and uses it).
- Produces: `getMessageText(message: UIMessage): string` from `@/lib/chat/message-text`. `ChatColumnHandle.sendMessage` signature changes to `(text: string, conversationId: string) => void` — Task 5's `ChatPage` must pass the resolved conversation id on every call, not rely on props.

- [ ] **Step 1: Write `lib/chat/message-text.ts`**

```ts
import type { UIMessage } from 'ai';

export function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');
}
```

- [ ] **Step 2: Write the failing test additions to `components/__tests__/chat-column.test.tsx`**

Update the ref-based test and add two new ones (the existing file already has the mock setup, model fixture, and other tests from Phase 7 — keep them, only change the signature call and add these):

```tsx
it('exposes sendMessage via ref that calls the underlying sendMessage with modelId', () => {
  const sendMessage = vi.fn();
  vi.mocked(useChat).mockReturnValue({ messages: [], sendMessage, status: 'ready', stop: vi.fn() } as never);

  const ref = createRef<ChatColumnHandle>();
  render(<ChatColumn model={model} ref={ref} />);

  ref.current?.sendMessage('hello', 'conversation-1');

  expect(sendMessage).toHaveBeenCalledWith({ text: 'hello' }, { body: { modelId: model.id } });
});

it('posts the assistant message to the conversation when a stream finishes', () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);

  let capturedOnFinish: ((args: { message: unknown }) => void) | undefined;
  vi.mocked(useChat).mockImplementation((options?: never) => {
    capturedOnFinish = (options as { onFinish?: typeof capturedOnFinish })?.onFinish;
    return { messages: [], sendMessage: vi.fn(), status: 'ready', stop: vi.fn() } as never;
  });

  const ref = createRef<ChatColumnHandle>();
  render(<ChatColumn model={model} ref={ref} />);
  ref.current?.sendMessage('hello', 'conversation-1');

  capturedOnFinish?.({
    message: { id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'reply text' }] },
  });

  expect(fetchMock).toHaveBeenCalledWith(
    '/api/conversations/conversation-1/messages',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ role: 'assistant', modelId: model.id, content: 'reply text' }),
    }),
  );

  vi.unstubAllGlobals();
});

it('does not post when onFinish fires before any sendMessage call set a conversation id', () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  let capturedOnFinish: ((args: { message: unknown }) => void) | undefined;
  vi.mocked(useChat).mockImplementation((options?: never) => {
    capturedOnFinish = (options as { onFinish?: typeof capturedOnFinish })?.onFinish;
    return { messages: [], sendMessage: vi.fn(), status: 'ready', stop: vi.fn() } as never;
  });

  render(<ChatColumn model={model} ref={null} />);
  capturedOnFinish?.({ message: { id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'x' }] } });

  expect(fetchMock).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test components/__tests__/chat-column.test.tsx`
Expected: FAIL — `sendMessage` on the ref only accepts one argument, `onFinish` doesn't exist yet.

- [ ] **Step 4: Update `components/chat-column.tsx`**

```tsx
'use client';

import { useImperativeHandle, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import type { ModelDefinition } from '@/lib/models';
import { getMessageText } from '@/lib/chat/message-text';

export interface ChatColumnHandle {
  sendMessage: (text: string, conversationId: string) => void;
}

export function ChatColumn({
  model,
  initialMessages,
  ref,
}: {
  model: ModelDefinition;
  initialMessages?: UIMessage[];
  ref: React.Ref<ChatColumnHandle>;
}) {
  const conversationIdRef = useRef<string | null>(null);

  const { messages, sendMessage, status, stop } = useChat({
    messages: initialMessages,
    onFinish: ({ message }) => {
      const conversationId = conversationIdRef.current;
      if (!conversationId) {
        return;
      }
      fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'assistant',
          modelId: model.id,
          content: getMessageText(message as UIMessage),
        }),
      });
    },
  });

  useImperativeHandle(ref, () => ({
    sendMessage: (text: string, conversationId: string) => {
      conversationIdRef.current = conversationId;
      sendMessage({ text }, { body: { modelId: model.id } });
    },
  }));

  return (
    <div className="flex min-w-[280px] flex-1 flex-col gap-2 rounded border p-3">
      <h2 className="font-semibold">{model.label}</h2>
      <div className="flex-1 space-y-2 overflow-y-auto">
        {messages.map((message) => (
          <div key={message.id}>
            <strong>{message.role === 'user' ? 'You' : 'AI'}:</strong>{' '}
            {message.parts.map((part, index) =>
              part.type === 'text' ? <span key={index}>{part.text}</span> : null,
            )}
          </div>
        ))}
      </div>
      {(status === 'submitted' || status === 'streaming') && (
        <button
          type="button"
          onClick={() => stop()}
          className="self-start rounded border px-2 py-1 text-sm"
        >
          Stop
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test components/__tests__/chat-column.test.tsx`
Expected: PASS — 7/7 tests green (5 from Phase 7 + 2 new; the ref-call test was updated in place, not added).

- [ ] **Step 6: Run the full suite and build**

Run: `bun run test` — expected: all pass (Task 5 will still be red at this point if you're following tasks strictly in order, since `ChatPage` hasn't been updated to call `sendMessage` with two arguments yet — that's fine, fix it in Task 5).
Run: `bun run build` — expected: may fail here if `ChatPage`'s call site wasn't updated; if so, that's Task 5's job, not this task's — do not touch `chat-page.tsx` in this task. If `bun run build` fails only because of the `chat-page.tsx` call site type mismatch, note it in your report as an expected, temporary cross-task inconsistency that Task 5 resolves; do not attempt to fix it here.

- [ ] **Step 7: Commit**

```bash
git add lib/chat/message-text.ts components/chat-column.tsx components/__tests__/chat-column.test.tsx
git commit -m "Persist assistant messages from ChatColumn on stream finish"
```

---

### Task 5: ChatPage conversation creation and history seeding

**Files:**
- Modify: `components/chat-page.tsx`, `components/__tests__/chat-page.test.tsx`

**Interfaces:**
- Consumes: `ChatColumnHandle` (Task 4's new two-arg `sendMessage` signature); `GroupedColumn` (type) from `@/lib/conversations` (Task 2).
- Produces: `ChatPage({ availableModels, conversationId, initialColumns }: { availableModels: ModelDefinition[]; conversationId?: string; initialColumns?: GroupedColumn[] })` — the `conversationId`/`initialColumns` props are new and optional; existing callers (none exist outside `app/page.tsx`, which Task 6 updates) are unaffected by omitting them.

- [ ] **Step 1: Write the failing test additions to `components/__tests__/chat-page.test.tsx`**

Keep Phase 7's existing test file content (mock setup, model fixtures, existing test cases), updating only what's needed, and add these cases:

```tsx
it('creates a conversation on first send and saves the user message', async () => {
  const sendMessage = vi.fn();
  vi.mocked(useChat).mockReturnValue({ messages: [], sendMessage, status: 'ready', stop: vi.fn() } as never);

  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'conv-1' }), { status: 201 }))
    .mockResolvedValueOnce(new Response(null, { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);

  render(<ChatPage availableModels={models} />);
  fireEvent.change(screen.getByPlaceholderText(/type a message/i), { target: { value: 'hello world' } });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));

  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

  expect(fetchMock).toHaveBeenNthCalledWith(
    1,
    '/api/conversations',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ title: 'hello world' }) }),
  );
  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    '/api/conversations/conv-1/messages',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ role: 'user', modelId: null, content: 'hello world' }),
    }),
  );

  vi.unstubAllGlobals();
});

it('reuses the existing conversation id on subsequent sends instead of creating a new one', async () => {
  const sendMessage = vi.fn();
  vi.mocked(useChat).mockReturnValue({ messages: [], sendMessage, status: 'ready', stop: vi.fn() } as never);

  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);

  render(<ChatPage availableModels={models} conversationId="conv-existing" />);
  fireEvent.change(screen.getByPlaceholderText(/type a message/i), { target: { value: 'second turn' } });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));

  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/conversations/conv-existing/messages',
    expect.objectContaining({ method: 'POST' }),
  );

  vi.unstubAllGlobals();
});

it('seeds selected models and column history from initialColumns', () => {
  vi.mocked(useChat).mockReturnValue({ messages: [], sendMessage: vi.fn(), status: 'ready', stop: vi.fn() } as never);

  render(
    <ChatPage
      availableModels={models}
      conversationId="conv-1"
      initialColumns={[
        { modelId: models[1].id, messages: [{ role: 'user', modelId: null, content: 'Q', createdAt: new Date() }] },
      ]}
    />,
  );

  const first = screen.getByRole('checkbox', { name: models[0].label }) as HTMLInputElement;
  const second = screen.getByRole('checkbox', { name: models[1].label }) as HTMLInputElement;
  expect(first.checked).toBe(false);
  expect(second.checked).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test components/__tests__/chat-page.test.tsx`
Expected: FAIL — `ChatPage` doesn't create conversations, save messages, or accept `conversationId`/`initialColumns` yet.

- [ ] **Step 3: Replace `components/chat-page.tsx`**

```tsx
'use client';

import { useRef, useState } from 'react';
import type { ModelDefinition } from '@/lib/models';
import type { GroupedColumn } from '@/lib/conversations';
import { ChatColumn, type ChatColumnHandle } from '@/components/chat-column';

export function ChatPage({
  availableModels,
  conversationId: initialConversationId,
  initialColumns,
}: {
  availableModels: ModelDefinition[];
  conversationId?: string;
  initialColumns?: GroupedColumn[];
}) {
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>(() => {
    if (initialColumns && initialColumns.length > 0) {
      return initialColumns.map((column) => column.modelId);
    }
    return availableModels[0] ? [availableModels[0].id] : [];
  });
  const [conversationId, setConversationId] = useState<string | undefined>(initialConversationId);
  const [input, setInput] = useState('');
  const columnRefs = useRef<Record<string, ChatColumnHandle | null>>({});

  if (availableModels.length === 0) {
    return <p>No models are configured. Set at least one provider API key to start chatting.</p>;
  }

  function toggleModel(id: string) {
    setSelectedModelIds((current) =>
      current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id],
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || selectedModelIds.length === 0) {
      return;
    }

    let activeConversationId = conversationId;
    if (!activeConversationId) {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      });
      const conversation = (await response.json()) as { id: string };
      activeConversationId = conversation.id;
      setConversationId(activeConversationId);
    }

    await fetch(`/api/conversations/${activeConversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'user', modelId: null, content: trimmed }),
    });

    for (const modelId of selectedModelIds) {
      columnRefs.current[modelId]?.sendMessage(trimmed, activeConversationId);
    }
    setInput('');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4">
      <fieldset className="flex flex-wrap gap-3">
        <legend className="sr-only">Models to compare</legend>
        {availableModels.map((model) => (
          <label key={model.id} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={selectedModelIds.includes(model.id)}
              onChange={() => toggleModel(model.id)}
            />
            {model.label}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-1 flex-wrap gap-4">
        {selectedModelIds.map((modelId) => {
          const model = availableModels.find((m) => m.id === modelId);
          if (!model) {
            return null;
          }
          const initial = initialColumns?.find((column) => column.modelId === modelId);
          return (
            <ChatColumn
              key={model.id}
              model={model}
              initialMessages={
                initial
                  ? initial.messages.map((message) => ({
                      id: crypto.randomUUID(),
                      role: message.role,
                      parts: [{ type: 'text' as const, text: message.content }],
                    }))
                  : undefined
              }
              ref={(handle) => {
                columnRefs.current[model.id] = handle;
              }}
            />
          );
        })}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Type a message..."
          className="flex-1 rounded border px-3 py-2"
        />
        <button
          type="submit"
          disabled={selectedModelIds.length === 0}
          className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test components/__tests__/chat-page.test.tsx`
Expected: PASS — 10/10 tests green (7 from Phase 7 + 3 new).

- [ ] **Step 5: Run the full suite, build, and lint**

Run: `bun run test` — expected: all pass, including Task 4's `chat-column.test.tsx` (now that the call site matches).
Run: `bun run build` — expected: succeeds.
Run: `bun run lint` — expected: clean.

- [ ] **Step 6: Commit**

```bash
git add components/chat-page.tsx components/__tests__/chat-page.test.tsx
git commit -m "Wire ChatPage to create conversations and seed from history"
```

---

### Task 6: History sidebar and conversation route

**Files:**
- Create: `components/app-shell.tsx`, `app/c/[id]/page.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `listConversations`, `getConversationWithMessages`, `groupMessagesByModel` from `@/lib/conversations` (Task 2); `signOut`, `auth` from `@/auth` (Phase 3); `listAvailableModels` from `@/lib/models` (Phase 4); `ChatPage` from `@/components/chat-page` (Task 5).

- [ ] **Step 1: Write `components/app-shell.tsx`**

```tsx
import Link from 'next/link';
import { auth, signOut } from '@/auth';
import { listConversations } from '@/lib/conversations';

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const conversations = session?.user?.id ? await listConversations(session.user.id) : [];

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 shrink-0 border-r p-4">
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/sign-in' });
          }}
        >
          <button type="submit" className="text-sm text-gray-500 underline">
            Sign out
          </button>
        </form>
        <Link href="/" className="mt-4 block font-semibold">
          + New chat
        </Link>
        <ul className="mt-4 space-y-1">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                href={`/c/${conversation.id}`}
                className="block truncate text-sm hover:underline"
              >
                {conversation.title}
              </Link>
            </li>
          ))}
        </ul>
      </aside>
      <div className="flex-1">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `app/page.tsx`**

```tsx
import { listAvailableModels } from '@/lib/models';
import { ChatPage } from '@/components/chat-page';
import { AppShell } from '@/components/app-shell';

export default function Home() {
  return (
    <AppShell>
      <ChatPage availableModels={listAvailableModels()} />
    </AppShell>
  );
}
```

- [ ] **Step 3: Write `app/c/[id]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { listAvailableModels } from '@/lib/models';
import { getConversationWithMessages, groupMessagesByModel } from '@/lib/conversations';
import { ChatPage } from '@/components/chat-page';
import { AppShell } from '@/components/app-shell';

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    notFound();
  }

  const conversation = await getConversationWithMessages(session.user.id, id);
  if (!conversation) {
    notFound();
  }

  return (
    <AppShell>
      <ChatPage
        availableModels={listAvailableModels()}
        conversationId={conversation.id}
        initialColumns={groupMessagesByModel(conversation.messages)}
      />
    </AppShell>
  );
}
```

- [ ] **Step 4: Verify build and lint**

Run: `bun run build` — expected: succeeds. `app/c/[id]` should appear in the route table as a dynamic route.
Run: `bun run lint` — expected: clean.
Run: `bun run test` — expected: all tests still pass (this task adds no new tests — thin Server Component wiring, verified by Next's compiler, same precedent as Phases 3/6).

- [ ] **Step 5: Commit**

```bash
git add components/app-shell.tsx app/page.tsx "app/c/[id]/page.tsx"
git commit -m "Add conversation history sidebar and reload route"
```

---

### Task 7: Full verification sweep and PR

**Files:** none (verification + git only)

- [ ] **Step 1: Run the full verification sweep**

```bash
bun run lint
bun run format:check
bun run test
bun run build
```

Expected: all four succeed.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin phase-8-persistence
```

(If no `origin` remote exists — as with prior phases — stop and confirm with the user whether a remote is set up yet before attempting to push.)

```bash
gh pr create --title "Phase 8: Persistence & history" \
  --base phase-7-fanout \
  --body "$(cat <<'EOF'
Persists every chat turn to Postgres and adds conversation history:
lazy conversation creation on first send, per-column assistant message
saving via onFinish, a history sidebar, and a /c/[id] route that
reconstructs columns from a past conversation via groupMessagesByModel.

Verification: bun run lint / format:check / test / build all pass.
lib/conversations.ts is tested against live Postgres (same pattern as
Phase 2); API routes and UI components are tested with auth/DB mocked.

/api/chat (Phase 5) is unchanged - persistence happens alongside it via
separate endpoints, not inside it.

Implements Phase 8 of docs/superpowers/specs/2026-08-25-multi-model-chat-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Report the PR URL to the user for review/merge**

---

## Self-Review

**Spec coverage:** "New conversation created lazily on first send; title derived from first prompt" ✅ (Task 5). "User message saved when the turn is sent" ✅ (Task 5). "Client posts completed assistant message (with modelId) to /api/conversations/[id]/messages" ✅ (Task 4). "One user turn = one user message + several assistant messages... distinguished by modelId" ✅ (data model unchanged from Phase 2, correctly used by `saveMessage`). "On reload, columns reconstructed by grouping assistant messages by modelId" ✅ (Task 2's `groupMessagesByModel`, consumed by Task 6's `/c/[id]` route and Task 5's `ChatPage`). One-branch-per-phase + PR ✅ (Task 1/7). No-co-author ✅. Ownership checks on every read/write ✅ (Task 2's `getConversationWithMessages` filters by `userId`; Task 3's routes all pass the session's own id, never a client-supplied one). `/api/chat` untouched ✅ (no task modifies it; explicitly called out in Global Constraints and the PR body). Deferred to Phase 9 (correctly out of scope): per-column error/retry UX around persistence failures (a failed `POST /api/conversations/.../messages` currently fails silently — noted as a known gap for Phase 9, not fixed here to avoid scope creep into error-handling territory that phase owns).

**Placeholder scan:** No TBD/TODO. Every code step has concrete, complete content, including all new test cases across five test files. The one deliberately deferred item (silent persistence-failure handling) is explicitly named as a Phase 9 concern, not hand-waved.

**Type consistency:** `StoredMessage`/`GroupedColumn` defined in Task 2 flow unchanged through Task 3's routes (`getConversationWithMessages` return shape, `groupMessagesByModel` input/output), Task 5's `ChatPage` props (`initialColumns?: GroupedColumn[]`), and Task 6's `/c/[id]` route (passes `groupMessagesByModel(conversation.messages)` directly as that prop). `ChatColumnHandle.sendMessage`'s new two-argument signature (Task 4) is consumed correctly by Task 5's `columnRefs.current[modelId]?.sendMessage(trimmed, activeConversationId)` — both defined with the same signature, no drift. `getMessageText(message: UIMessage): string` (Task 4) matches the shape of messages `useChat`'s `onFinish` callback provides (verified against the AI SDK's documented `onFinish: ({ message }) => ...` shape during planning).
