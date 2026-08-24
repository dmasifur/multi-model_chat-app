# Phase 5 — Chat Streaming Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/api/chat` — a single-model streaming completion endpoint that authenticates the request, validates the requested model against Phase 4's registry, guards message length, calls `streamText`, and returns an AI SDK UI message stream — the endpoint Phase 6's `useChat` columns will call.

**Architecture:** One route handler, `app/api/chat/route.ts`, wired to three things already built: `auth()` (Phase 3) for the session guard, `getModel`/`isModelAvailable` (Phase 4) for model resolution, and a small pure `exceedsMaxLength` helper (this phase) for the message-length guard — extracted the same way Phase 3 extracted `isPublicPath`, so the guard logic is unit-testable without mocking Next's request internals. This phase is intentionally stateless: no conversation is loaded from or written to the database yet (Phase 8 adds persistence) — the client sends the full message history in the request body, matching the standard AI SDK `useChat` contract, and the endpoint streams a reply back. Testing uses the AI SDK's own `ai/test` package (`MockLanguageModelV4` + `simulateReadableStream`) to exercise the real `streamText` → UI-message-stream pipeline without any network call.

**Tech Stack:** Vercel AI SDK (`ai`, already installed — version `7.0.78`, confirmed during Phase 4), Next.js App Router route handlers, Bun, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-multi-model-chat-design.md`

## Global Constraints

- Package manager / runtime: **Bun**. Tests run with **Vitest** via `bun run test`.
- Branch: all Phase 5 work on **`phase-5-chat-api`**, off `phase-4-providers` (reviewed/ready, not yet merged to `main` — same situation as prior phases); merged via PR.
- Commits: **small, meaningful chunks**; **no `Co-Authored-By: Claude` trailer**.
- `/api/chat` guards (from spec, verbatim): **authentication required, model id must exist in the registry, message length capped.**
- Streaming flow (from spec, verbatim): validate session → (load conversation history — deferred to Phase 8, see Architecture) → `streamText({ model: getModel(modelId), messages })` → return the UI message stream response.
- **AI SDK v7 API note:** the design doc's original phrasing (`result.toUIMessageStreamResponse()`) refers to a method **deprecated** in the `ai` package version actually installed in Phase 4 (`7.0.78`). This plan uses the current, non-deprecated stateless helpers instead: `createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) })`. Confirmed against the AI SDK's own docs during planning — this is not a deviation from the spec's intent (still "return the UI message stream"), only from a since-superseded method name.

## File Structure

- `lib/chat/message-length.ts` — **create.** `MAX_MESSAGE_LENGTH` constant + `exceedsMaxLength(message: UIMessage): boolean`, pure and unit-tested.
- `lib/chat/__tests__/message-length.test.ts` — **create.**
- `app/api/chat/route.ts` — **create.** `POST` handler: auth guard → model guard → message-length guard → `streamText` → UI message stream response.
- `app/api/chat/__tests__/route.test.ts` — **create.** Integration test mocking `@/auth` and `@/lib/models`, exercising every guard path plus a real streaming happy path via `MockLanguageModelV4`.

---

### Task 1: Create the Phase 5 branch

**Files:** none (git only)

- [ ] **Step 1: Branch off phase-4-providers**

```bash
git checkout phase-4-providers
git checkout -b phase-5-chat-api
```

- [ ] **Step 2: Verify branch**

Run: `git branch --show-current`
Expected: `phase-5-chat-api`

---

### Task 2: Message-length guard

**Files:**
- Create: `lib/chat/message-length.ts`, `lib/chat/__tests__/message-length.test.ts`

**Interfaces:**
- Produces: `MAX_MESSAGE_LENGTH: number` and `exceedsMaxLength(message: UIMessage): boolean` — named exports from `@/lib/chat/message-length`, consumed by Task 3's route handler.

- [ ] **Step 1: Write the failing test**

`lib/chat/__tests__/message-length.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { UIMessage } from 'ai';
import { MAX_MESSAGE_LENGTH, exceedsMaxLength } from '@/lib/chat/message-length';

function textMessage(text: string): UIMessage {
  return {
    id: 'test-id',
    role: 'user',
    parts: [{ type: 'text', text }],
  };
}

describe('exceedsMaxLength', () => {
  it('returns false for a short message', () => {
    expect(exceedsMaxLength(textMessage('hello'))).toBe(false);
  });

  it('returns false for a message exactly at the limit', () => {
    expect(exceedsMaxLength(textMessage('a'.repeat(MAX_MESSAGE_LENGTH)))).toBe(false);
  });

  it('returns true for a message over the limit', () => {
    expect(exceedsMaxLength(textMessage('a'.repeat(MAX_MESSAGE_LENGTH + 1)))).toBe(true);
  });

  it('sums text across multiple text parts', () => {
    const message: UIMessage = {
      id: 'test-id',
      role: 'user',
      parts: [
        { type: 'text', text: 'a'.repeat(MAX_MESSAGE_LENGTH) },
        { type: 'text', text: 'a' },
      ],
    };
    expect(exceedsMaxLength(message)).toBe(true);
  });

  it('ignores non-text parts', () => {
    const message: UIMessage = {
      id: 'test-id',
      role: 'user',
      parts: [{ type: 'step-start' }, { type: 'text', text: 'hello' }],
    };
    expect(exceedsMaxLength(message)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test lib/chat/__tests__/message-length.test.ts`
Expected: FAIL — cannot resolve `@/lib/chat/message-length` (file does not exist yet).

- [ ] **Step 3: Write `lib/chat/message-length.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test lib/chat/__tests__/message-length.test.ts`
Expected: PASS — 5/5 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/chat/message-length.ts lib/chat/__tests__/message-length.test.ts
git commit -m "Add message-length guard"
```

---

### Task 3: /api/chat route handler

**Files:**
- Create: `app/api/chat/route.ts`, `app/api/chat/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `auth` from `@/auth` (Phase 3); `getModel`, `isModelAvailable` from `@/lib/models` (Phase 4); `exceedsMaxLength` from `@/lib/chat/message-length` (Task 2).
- Produces: `POST(req: Request): Promise<Response>` — the App Router convention Next.js dispatches `/api/chat` `POST` requests to.

- [ ] **Step 1: Write `app/api/chat/route.ts`**

```ts
import {
  streamText,
  convertToModelMessages,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type UIMessage,
} from 'ai';
import { auth } from '@/auth';
import { getModel, isModelAvailable } from '@/lib/models';
import { exceedsMaxLength } from '@/lib/chat/message-length';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = (await req.json()) as { messages?: UIMessage[]; modelId?: string };
  const { messages, modelId } = body;

  if (!modelId || !isModelAvailable(modelId)) {
    return new Response('Invalid or unavailable model', { status: 400 });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response('Messages are required', { status: 400 });
  }

  const lastMessage = messages[messages.length - 1];
  if (exceedsMaxLength(lastMessage)) {
    return new Response('Message too long', { status: 400 });
  }

  const result = streamText({
    model: getModel(modelId),
    messages: await convertToModelMessages(messages),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
```

- [ ] **Step 2: Write the failing test**

`app/api/chat/__tests__/route.test.ts`:

```ts
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
    vi.mocked(auth).mockResolvedValue(null);

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
                  inputTokens: { total: 3, noCache: 3, cacheRead: undefined, cacheWrite: undefined },
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test app/api/chat/__tests__/route.test.ts`
Expected: FAIL — cannot resolve `@/app/api/chat/route` (if the test is written before Step 1's file exists). If Step 1 is already in place, confirm you observed RED at some point before both files existed together — e.g. by temporarily commenting out the route's guards and checking the corresponding test fails, or by writing the test file first and confirming the import failure, per this project's established RED-before-GREEN discipline.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test app/api/chat/__tests__/route.test.ts`
Expected: PASS — 5/5 tests green.

- [ ] **Step 5: Run the full test suite**

Run: `bun run test`
Expected: all tests pass across every phase so far.

- [ ] **Step 6: Verify the build**

Run: `bun run build`
Expected: succeeds — this is the check that would have caught a `LanguageModel`-shaped type mismatch (as happened in Phase 4); run it here too, not only in Task 4's sweep, since this task introduces the first real `streamText` call in the codebase.

- [ ] **Step 7: Commit**

```bash
git add "app/api/chat/route.ts" "app/api/chat/__tests__/route.test.ts"
git commit -m "Add /api/chat streaming endpoint with auth, model, and length guards"
```

---

### Task 4: Full verification sweep and PR

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
git push -u origin phase-5-chat-api
```

(If no `origin` remote exists — as with prior phases — stop and confirm with the user whether a remote is set up yet before attempting to push.)

```bash
gh pr create --title "Phase 5: Chat streaming endpoint" \
  --base phase-4-providers \
  --body "$(cat <<'EOF'
Adds POST /api/chat: authenticates the session, validates the requested
model against Phase 4's registry, caps message length, calls streamText,
and returns an AI SDK UI message stream. Stateless for now (no DB reads/
writes) — Phase 8 adds conversation persistence on top of this endpoint.

Verification: bun run lint / format:check / test / build all pass.
Integration tests mock auth and the model registry, and exercise a real
streamText -> UI-message-stream pipeline via ai/test's MockLanguageModelV4
(no network calls).

Implements Phase 5 of docs/superpowers/specs/2026-08-25-multi-model-chat-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Report the PR URL to the user for review/merge**

---

## Self-Review

**Spec coverage:** "`/api/chat` guards: authentication required, model id must exist in the registry, message length capped" ✅ (Task 3 — three explicit checks, each independently tested). "`streamText({ model: getModel(modelId), messages })` → return the UI message stream response" ✅ (Task 3, using the current non-deprecated AI SDK v7 helpers — explained in Global Constraints why this isn't a spec deviation). One-branch-per-phase + PR ✅ (Task 1/4). No-co-author ✅. Deferred to later phases (correctly out of scope): loading/saving conversation history (Phase 8), per-column error surfacing and retry UX (Phase 9), the UI itself (Phase 6-7).

**Placeholder scan:** No TBD/TODO. Every code step has concrete, complete content, including the full mocked streaming test using real AI SDK testing utilities (not a hand-rolled fake). The AI SDK API-name discrepancy from the original design doc is explicitly explained with its cause (a version-driven deprecation discovered during Phase 4), not silently changed.

**Type consistency:** `exceedsMaxLength(message: UIMessage): boolean` from Task 2 is imported unchanged by Task 3's route handler. `getModel`/`isModelAvailable` signatures match exactly what Phase 4 exported (`getModel(id: string): LanguageModel`, `isModelAvailable(id: string): boolean`) and are mocked with matching shapes in Task 3's test. `POST(req: Request): Promise<Response>` matches Next.js's App Router route handler convention, consumed by the test via direct function invocation (no HTTP server needed).
