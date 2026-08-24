# Phase 6 — Single-Column Chat UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Phase 1's placeholder landing page with a working single-model chat UI — a model picker plus one streaming column wired to Phase 5's `/api/chat` via `useChat` — so a signed-in user can actually have a conversation with an open-source model.

**Architecture:** `app/page.tsx` stays a Server Component: it calls Phase 4's `listAvailableModels()` (a plain function call, not a fetch — no new API route needed) and passes the result as a prop into a Client Component, `components/chat-page.tsx`. That component owns the selected model id and the input field as local state, uses `@ai-sdk/react`'s `useChat()` hook (default endpoint `/api/chat`, matching Phase 5's route), and sends the currently-selected `modelId` as a **request-level** body field on each `sendMessage` call — not baked into a shared transport — so switching the picker takes effect on the very next message with no extra wiring. The route "/" is already gated by Phase 3's `proxy.ts` (not in `isPublicPath`), so an unauthenticated visitor is redirected to `/sign-in` automatically; this phase adds no auth code of its own, just a small inline sign-out action for manual testing convenience, mirroring Phase 3's sign-in page pattern.

**Tech Stack:** `@ai-sdk/react` (new dependency — the `useChat` hook), `@testing-library/react` (new dev dependency — the first phase with interactive component logic worth testing beyond build+lint). Bun, Vitest, jsdom (already configured since Phase 1).

**Spec:** `docs/superpowers/specs/2026-08-25-multi-model-chat-design.md`

## Global Constraints

- Package manager / runtime: **Bun**. Tests run with **Vitest** via `bun run test`.
- Branch: all Phase 6 work on **`phase-6-chat-ui`**, off `phase-5-chat-api` (reviewed/ready, not yet merged to `main` — same situation as prior phases); merged via PR.
- Commits: **small, meaningful chunks**; **no `Co-Authored-By: Claude` trailer**.
- Single-column scope (from spec's phase list, verbatim): "model picker, prompt box, one column streaming via `useChat`." Multi-model fan-out (N columns) is explicitly Phase 7 — do not build it here.
- Run `bun run build` before committing any task that touches a Server Component or a `'use server'` action (Task 3) — this project has caught real bugs (Phase 4, Phase 5) that `bun run test` alone missed.

## File Structure

- `components/chat-page.tsx` — **create.** The Client Component: model picker, message list, input form. Owns `modelId` and `input` state.
- `components/__tests__/chat-page.test.tsx` — **create.** Component tests mocking `@ai-sdk/react`'s `useChat`.
- `app/page.tsx` — **modify.** Replace Phase 1's static placeholder with: fetch `listAvailableModels()`, a small inline sign-out form, and `<ChatPage availableModels={...} />`.

---

### Task 1: Create the Phase 6 branch

**Files:** none (git only)

- [ ] **Step 1: Branch off phase-5-chat-api**

```bash
git checkout phase-5-chat-api
git checkout -b phase-6-chat-ui
```

- [ ] **Step 2: Verify branch**

Run: `git branch --show-current`
Expected: `phase-6-chat-ui`

---

### Task 2: Chat page component

**Files:**
- Create: `components/chat-page.tsx`, `components/__tests__/chat-page.test.tsx`

**Interfaces:**
- Consumes: `ModelDefinition` (type) from `@/lib/models` (Phase 4).
- Produces: `ChatPage({ availableModels }: { availableModels: ModelDefinition[] })` — a named export from `@/components/chat-page`, consumed by Task 3's `app/page.tsx`.

- [ ] **Step 1: Install dependencies**

```bash
bun add @ai-sdk/react
bun add -d @testing-library/react
```

- [ ] **Step 2: Write the failing test**

`components/__tests__/chat-page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ModelDefinition } from '@/lib/models';

vi.mock('@ai-sdk/react', () => ({
  useChat: vi.fn(),
}));

import { useChat } from '@ai-sdk/react';
import { ChatPage } from '@/components/chat-page';

const models: ModelDefinition[] = [
  {
    id: 'groq-llama-3.3-70b',
    label: 'Llama 3.3 70B (Groq)',
    provider: 'groq',
    providerModelId: 'llama-3.3-70b-versatile',
    kind: 'hosted',
  },
  {
    id: 'ollama-llama-3.1',
    label: 'Llama 3.1 (Ollama, local)',
    provider: 'ollama',
    providerModelId: 'llama3.1',
    kind: 'local',
  },
];

beforeEach(() => {
  vi.mocked(useChat).mockReset();
});

describe('ChatPage', () => {
  it('shows a message when no models are configured', () => {
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      sendMessage: vi.fn(),
      status: 'ready',
    } as never);

    render(<ChatPage availableModels={[]} />);

    expect(screen.getByText(/no models are configured/i)).toBeTruthy();
  });

  it('renders a model picker defaulting to the first available model', () => {
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      sendMessage: vi.fn(),
      status: 'ready',
    } as never);

    render(<ChatPage availableModels={models} />);

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe(models[0].id);
    expect(screen.getByText(models[0].label)).toBeTruthy();
    expect(screen.getByText(models[1].label)).toBeTruthy();
  });

  it('renders existing messages from useChat', () => {
    vi.mocked(useChat).mockReturnValue({
      messages: [
        { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hi there' }] },
        { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'Hello!' }] },
      ],
      sendMessage: vi.fn(),
      status: 'ready',
    } as never);

    render(<ChatPage availableModels={models} />);

    expect(screen.getByText('Hi there')).toBeTruthy();
    expect(screen.getByText('Hello!')).toBeTruthy();
  });

  it('sends a message with the selected modelId and clears the input', () => {
    const sendMessage = vi.fn();
    vi.mocked(useChat).mockReturnValue({ messages: [], sendMessage, status: 'ready' } as never);

    render(<ChatPage availableModels={models} />);

    const input = screen.getByPlaceholderText(/type a message/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hello world' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(sendMessage).toHaveBeenCalledWith(
      { text: 'hello world' },
      { body: { modelId: models[0].id } },
    );
    expect(input.value).toBe('');
  });

  it('sends the newly selected modelId after switching models', () => {
    const sendMessage = vi.fn();
    vi.mocked(useChat).mockReturnValue({ messages: [], sendMessage, status: 'ready' } as never);

    render(<ChatPage availableModels={models} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: models[1].id } });
    fireEvent.change(screen.getByPlaceholderText(/type a message/i), { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(sendMessage).toHaveBeenCalledWith({ text: 'hi' }, { body: { modelId: models[1].id } });
  });

  it('does not send an empty or whitespace-only message', () => {
    const sendMessage = vi.fn();
    vi.mocked(useChat).mockReturnValue({ messages: [], sendMessage, status: 'ready' } as never);

    render(<ChatPage availableModels={models} />);

    fireEvent.change(screen.getByPlaceholderText(/type a message/i), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test components/__tests__/chat-page.test.tsx`
Expected: FAIL — cannot resolve `@/components/chat-page` (file does not exist yet).

- [ ] **Step 4: Write `components/chat-page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import type { ModelDefinition } from '@/lib/models';

export function ChatPage({ availableModels }: { availableModels: ModelDefinition[] }) {
  const [modelId, setModelId] = useState(availableModels[0]?.id ?? '');
  const [input, setInput] = useState('');
  const { messages, sendMessage, status } = useChat();

  if (availableModels.length === 0) {
    return <p>No models are configured. Set at least one provider API key to start chatting.</p>;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }
    sendMessage({ text: trimmed }, { body: { modelId } });
    setInput('');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-4">
      <select
        value={modelId}
        onChange={(event) => setModelId(event.target.value)}
        aria-label="Model"
        className="rounded border px-3 py-2"
      >
        {availableModels.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label}
          </option>
        ))}
      </select>
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
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Type a message..."
          disabled={status !== 'ready'}
          className="flex-1 rounded border px-3 py-2"
        />
        <button
          type="submit"
          disabled={status !== 'ready'}
          className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test components/__tests__/chat-page.test.tsx`
Expected: PASS — 6/6 tests green.

- [ ] **Step 6: Run the full test suite**

Run: `bun run test`
Expected: all tests pass across every phase so far.

- [ ] **Step 7: Verify the build**

Run: `bun run build`
Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add components/chat-page.tsx components/__tests__/chat-page.test.tsx package.json bun.lock
git commit -m "Add single-column chat UI component"
```

---

### Task 3: Wire the chat page into app/page.tsx

**Files:**
- Modify: `app/page.tsx` (replace Phase 1's placeholder content entirely)

**Interfaces:**
- Consumes: `listAvailableModels` from `@/lib/models` (Phase 4); `signOut` from `@/auth` (Phase 3); `ChatPage` from `@/components/chat-page` (Task 2).

- [ ] **Step 1: Replace `app/page.tsx`**

```tsx
import { listAvailableModels } from '@/lib/models';
import { signOut } from '@/auth';
import { ChatPage } from '@/components/chat-page';

export default function Home() {
  return (
    <div>
      <form
        action={async () => {
          'use server';
          await signOut({ redirectTo: '/sign-in' });
        }}
        className="flex justify-end p-2"
      >
        <button type="submit" className="text-sm text-gray-500 underline">
          Sign out
        </button>
      </form>
      <ChatPage availableModels={listAvailableModels()} />
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds and type-checks**

Run: `bun run build`
Expected: succeeds — Next's compiler validates the inline server action, same pattern as Phase 3's sign-in page (build + lint is the right verification here, not a component test, since this file is thin wiring around already-tested pieces).

Run: `bun run lint`
Expected: clean.

- [ ] **Step 3: Run the full test suite**

Run: `bun run test`
Expected: all tests still pass (this task doesn't add new tests, but confirms nothing broke).

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "Wire chat UI into the home page with sign-out action"
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
git push -u origin phase-6-chat-ui
```

(If no `origin` remote exists — as with prior phases — stop and confirm with the user whether a remote is set up yet before attempting to push.)

```bash
gh pr create --title "Phase 6: Single-column chat UI" \
  --base phase-5-chat-api \
  --body "$(cat <<'EOF'
Replaces the placeholder landing page with a working single-model chat UI:
a model picker (populated from Phase 4's listAvailableModels()) and one
streaming column wired to Phase 5's /api/chat via @ai-sdk/react's
useChat(). The selected modelId is sent as a request-level body field on
each message, so switching models takes effect on the next send with no
extra state plumbing.

Verification: bun run lint / format:check / test / build all pass.
Component tests (via @testing-library/react) mock useChat and cover: empty
model list, picker defaulting/switching, message rendering, and correct
sendMessage calls (including the empty-input no-op case).

Implements Phase 6 of docs/superpowers/specs/2026-08-25-multi-model-chat-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Report the PR URL to the user for review/merge**

---

## Self-Review

**Spec coverage:** "model picker, prompt box, one column streaming via `useChat`" ✅ (Task 2 — `<select>` picker, `<input>` prompt box, single `useChat()` instance rendering messages). Route "/" already protected by Phase 3's proxy ✅ (no new auth code needed, confirmed by re-reading `lib/auth/is-public-path.ts` during planning — `/` is not in `PUBLIC_PATHS`). One-branch-per-phase + PR ✅ (Task 1/4). No-co-author ✅. Deferred to later phases (correctly out of scope): multi-model fan-out / N columns (Phase 7), persistence/history sidebar (Phase 8), per-column error/retry UX (Phase 9).

**Placeholder scan:** No TBD/TODO. Every code step has concrete, complete content, including all 6 test cases with real assertions (not "add tests for the above"). The request-level `sendMessage(message, { body: { modelId } })` pattern was chosen deliberately over a `DefaultChatTransport`-level `body` function specifically because it's directly assertable in tests without needing to inspect transport internals — this reasoning is documented in the Architecture section, not left implicit.

**Type consistency:** `ChatPage({ availableModels }: { availableModels: ModelDefinition[] })` from Task 2 matches exactly how Task 3's `app/page.tsx` calls it (`<ChatPage availableModels={listAvailableModels()} />` — `listAvailableModels()` returns `ModelDefinition[]` per Phase 4). `useChat()`'s `messages`/`sendMessage`/`status` fields used in Task 2 match the AI SDK's documented `useChat` return shape (verified during planning, not guessed). `signOut` usage in Task 3 mirrors the exact `'use server'` inline-action pattern Phase 3's sign-in page already established and had reviewed.
