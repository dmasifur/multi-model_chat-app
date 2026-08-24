# Phase 9 — Error Handling & Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the app's MVP per the spec's error-handling requirements — per-column error/retry, disabled-model UX for missing provider keys (shown in the picker with a tooltip, not silently hidden), and a malformed-request guard on `/api/chat` — plus fix two small gaps parked during earlier phases' reviews.

**Architecture:** Four independent, small changes, each closing a specific gap identified during this project's own review history:
1. `/api/chat` currently throws an unhandled 500 on a malformed JSON body (parked in Phase 5's final review) — wrap the parse in try/catch, return 400.
2. `lib/models.ts` currently only exposes `listAvailableModels()`, which *filters out* unconfigured models entirely — but the spec says missing-key models should be "disabled in the picker with a tooltip," not hidden. A new `listAllModelsWithAvailability()` returns the full registry with an `available` flag, and `ChatPage` is rewritten to render every model, disabling checkboxes (with a tooltip) for unavailable ones.
3. `ChatColumn` gets `useChat`'s `error`/`regenerate` wired to a per-column error message and Retry button — the spec's "per-column provider errors surface only in that column with a retry button; other columns keep streaming."
4. `ChatColumn`'s `onFinish` skips persisting an assistant message when it has no text content (parked in Phase 8's final review — an empty-content POST was silently 400ing and dropping the reply; skipping the POST is honest about what actually happened instead of masking it as a failed save).

**Tech Stack:** No new dependencies — `useChat`'s `error`/`regenerate` are already part of the AI SDK API surface used since Phase 6/7. Bun, Vitest, `@testing-library/react`.

**Spec:** `docs/superpowers/specs/2026-08-25-multi-model-chat-design.md`

## Global Constraints

- Package manager / runtime: **Bun**. Tests via **Vitest** (`bun run test`).
- Branch: all Phase 9 work on **`phase-9-error-handling`**, off `phase-8-persistence` (reviewed/ready, not yet merged — same situation as prior phases); merged via PR.
- Commits: **small, meaningful chunks**; **no `Co-Authored-By: Claude` trailer**.
- Error handling (from spec, verbatim): "Per-column: provider errors (rate limits, timeouts on free tiers) surface only in that column with a retry button — other columns stream on. Missing/invalid API keys → the affected models are disabled in the picker with a tooltip, not a crash. `/api/chat` guards: auth required, model id must exist in registry, message length capped."
- **Every task's dispatch MUST run `bun run format:check` in addition to lint/test/build before committing** — Phase 8 caught a formatting gap only at the controller's final sweep because individual task dispatches omitted this check. That omission is fixed starting this phase.
- Run `bun run build` before committing any task — this project has caught real bugs (Phases 4-8) that `bun run test` alone missed.

## File Structure

- `app/api/chat/route.ts` — **modify.** Wrap `req.json()` in try/catch, return 400 on parse failure.
- `app/api/chat/__tests__/route.test.ts` — **modify.** Add the malformed-body case.
- `lib/models.ts` — **modify.** Add `ModelAvailability` type and `listAllModelsWithAvailability()`.
- `lib/__tests__/models.test.ts` — **modify.** Add cases for the new function.
- `components/chat-page.tsx` — **modify (rewrite).** Prop renamed `availableModels` → `allModels: ModelAvailability[]`; renders every model, disabling+tooltipping unavailable ones; defaults selection to the first *available* model.
- `components/__tests__/chat-page.test.tsx` — **modify (rewrite).** Fixtures gain `available: boolean`; new cases for disabled/tooltip rendering and the all-unavailable state.
- `app/page.tsx`, `app/c/[id]/page.tsx` — **modify.** Call `listAllModelsWithAvailability()` and pass `allModels` instead of `listAvailableModels()`/`availableModels`.
- `components/chat-column.tsx` — **modify.** Wire `error`/`regenerate` from `useChat` to a per-column error+Retry UI; `onFinish` skips the persistence POST when the assistant message has no text content.
- `components/__tests__/chat-column.test.tsx` — **modify.** Add cases for the error UI and the empty-content skip.

---

### Task 1: Create the Phase 9 branch

**Files:** none (git only)

- [ ] **Step 1: Branch off phase-8-persistence**

```bash
git checkout phase-8-persistence
git checkout -b phase-9-error-handling
```

- [ ] **Step 2: Verify branch and Postgres**

Run: `git branch --show-current` — expected: `phase-9-error-handling`.
Run: `docker compose ps` — expected: `db` service `Up`. If not, `docker compose up -d`.

---

### Task 2: /api/chat malformed-body guard

**Files:**
- Modify: `app/api/chat/route.ts`, `app/api/chat/__tests__/route.test.ts`

**Interfaces:** No new exports; `POST`'s existing signature and guard order are unchanged — only the body-parsing step gains error handling.

- [ ] **Step 1: Write the failing test**

Append to `app/api/chat/__tests__/route.test.ts` (inside the existing `describe('POST /api/chat', ...)` block, after the existing tests):

```ts
it('returns 400 for a malformed JSON body', async () => {
  vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);

  const response = await POST(
    new Request('http://localhost/api/chat', { method: 'POST', body: 'not valid json' }),
  );

  expect(response.status).toBe(400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test app/api/chat/__tests__/route.test.ts`
Expected: FAIL — the malformed body currently throws an unhandled exception (500-equivalent test failure), not a clean 400.

- [ ] **Step 3: Update `app/api/chat/route.ts`**

Find the line `const body = (await req.json()) as { messages?: UIMessage[]; modelId?: string };` and replace it with:

```ts
let body: { messages?: UIMessage[]; modelId?: string };
try {
  body = (await req.json()) as { messages?: UIMessage[]; modelId?: string };
} catch {
  return new Response('Invalid JSON body', { status: 400 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test app/api/chat/__tests__/route.test.ts`
Expected: PASS — all tests in this file green, including the new one.

- [ ] **Step 5: Run the full sweep**

```bash
bun run lint
bun run format:check
bun run test
bun run build
```

Expected: all four succeed.

- [ ] **Step 6: Commit**

```bash
git add app/api/chat/route.ts app/api/chat/__tests__/route.test.ts
git commit -m "Return 400 for a malformed /api/chat request body"
```

---

### Task 3: Expose full model registry with availability

**Files:**
- Modify: `lib/models.ts`, `lib/__tests__/models.test.ts`

**Interfaces:**
- Produces: `ModelAvailability` (type, extends `ModelDefinition` with `available: boolean`) and `listAllModelsWithAvailability(): ModelAvailability[]` — new named exports from `@/lib/models`, consumed by Task 4.

- [ ] **Step 1: Write the failing test**

Append to `lib/__tests__/models.test.ts`:

```ts
import { listAllModelsWithAvailability } from '@/lib/models';
```

```ts
describe('listAllModelsWithAvailability', () => {
  it('returns every registry entry regardless of configuration', () => {
    vi.stubEnv('GROQ_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('OLLAMA_BASE_URL', '');
    const all = listAllModelsWithAvailability();
    expect(all).toHaveLength(MODEL_REGISTRY.length);
  });

  it('marks each entry available or not per its provider configuration', () => {
    vi.stubEnv('GROQ_API_KEY', 'test-key');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('OLLAMA_BASE_URL', '');
    const all = listAllModelsWithAvailability();
    const groqEntry = all.find((m) => m.provider === 'groq')!;
    const openrouterEntry = all.find((m) => m.provider === 'openrouter')!;
    expect(groqEntry.available).toBe(true);
    expect(openrouterEntry.available).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test lib/__tests__/models.test.ts`
Expected: FAIL — `listAllModelsWithAvailability` is not exported yet.

- [ ] **Step 3: Add to `lib/models.ts`**

Add below `listAvailableModels`:

```ts
export interface ModelAvailability extends ModelDefinition {
  available: boolean;
}

export function listAllModelsWithAvailability(): ModelAvailability[] {
  return MODEL_REGISTRY.map((model) => ({
    ...model,
    available: isProviderConfigured(model.provider),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test lib/__tests__/models.test.ts`
Expected: PASS — all tests in this file green.

- [ ] **Step 5: Run the full sweep**

```bash
bun run lint
bun run format:check
bun run test
bun run build
```

Expected: all four succeed.

- [ ] **Step 6: Commit**

```bash
git add lib/models.ts lib/__tests__/models.test.ts
git commit -m "Expose full model registry with per-model availability"
```

---

### Task 4: Disabled-model picker UX

**Files:**
- Modify: `components/chat-page.tsx` (full rewrite of the props/picker logic — the rest of the fan-out/persistence logic is unchanged)
- Modify: `components/__tests__/chat-page.test.tsx` (rewrite fixtures and picker-related cases; keep the fan-out/persistence cases, updated only to use the new prop name)
- Modify: `app/page.tsx`, `app/c/[id]/page.tsx`

**Interfaces:**
- Consumes: `ModelAvailability` (type), `listAllModelsWithAvailability` from `@/lib/models` (Task 3).
- Produces: `ChatPage({ allModels, conversationId, initialColumns }: { allModels: ModelAvailability[]; conversationId?: string; initialColumns?: GroupedColumn[] })` — the prop is renamed from `availableModels`; both call sites (`app/page.tsx`, `app/c/[id]/page.tsx`) must be updated together in this task.

- [ ] **Step 1: Write the failing test**

Replace the model fixtures and add new cases to `components/__tests__/chat-page.test.tsx`. Change the `models` fixture to:

```ts
const models: (import('@/lib/models').ModelAvailability)[] = [
  {
    id: 'groq-llama-3.3-70b',
    label: 'Llama 3.3 70B (Groq)',
    provider: 'groq',
    providerModelId: 'llama-3.3-70b-versatile',
    kind: 'hosted',
    available: true,
  },
  {
    id: 'ollama-llama-3.1',
    label: 'Llama 3.1 (Ollama, local)',
    provider: 'ollama',
    providerModelId: 'llama3.1',
    kind: 'local',
    available: true,
  },
];
```

Update every existing `render(<ChatPage availableModels={models} ... />)` call in the file to `render(<ChatPage allModels={models} ... />)` (prop rename only — do not change the fixtures' content or the assertions of the existing fan-out/persistence tests).

Add these new cases:

```tsx
it('renders every model, disabling and tooltipping unavailable ones', () => {
  vi.mocked(useChat).mockReturnValue({ messages: [], sendMessage: vi.fn(), status: 'ready', stop: vi.fn(), error: undefined, regenerate: vi.fn() } as never);

  const mixedModels = [
    models[0],
    { ...models[1], available: false },
  ];
  render(<ChatPage allModels={mixedModels} />);

  const unavailableCheckbox = screen.getByRole('checkbox', { name: /llama 3.1/i }) as HTMLInputElement;
  expect(unavailableCheckbox.disabled).toBe(true);

  const availableCheckbox = screen.getByRole('checkbox', { name: /llama 3.3 70b \(groq\)/i }) as HTMLInputElement;
  expect(availableCheckbox.disabled).toBe(false);
});

it('does not toggle a disabled model when clicked', () => {
  vi.mocked(useChat).mockReturnValue({ messages: [], sendMessage: vi.fn(), status: 'ready', stop: vi.fn(), error: undefined, regenerate: vi.fn() } as never);

  const mixedModels = [models[0], { ...models[1], available: false }];
  render(<ChatPage allModels={mixedModels} />);

  const unavailableCheckbox = screen.getByRole('checkbox', { name: /llama 3.1/i }) as HTMLInputElement;
  fireEvent.click(unavailableCheckbox);

  expect(unavailableCheckbox.checked).toBe(false);
});

it('defaults selection to the first available model, skipping unavailable ones', () => {
  vi.mocked(useChat).mockReturnValue({ messages: [], sendMessage: vi.fn(), status: 'ready', stop: vi.fn(), error: undefined, regenerate: vi.fn() } as never);

  const mixedModels = [{ ...models[0], available: false }, models[1]];
  render(<ChatPage allModels={mixedModels} />);

  const secondCheckbox = screen.getByRole('checkbox', { name: /llama 3.1/i }) as HTMLInputElement;
  expect(secondCheckbox.checked).toBe(true);
});

it('disables submit when every model is unavailable', () => {
  vi.mocked(useChat).mockReturnValue({ messages: [], sendMessage: vi.fn(), status: 'ready', stop: vi.fn(), error: undefined, regenerate: vi.fn() } as never);

  const allUnavailable = models.map((m) => ({ ...m, available: false }));
  render(<ChatPage allModels={allUnavailable} />);

  expect(screen.getByRole('button', { name: /send/i })).toHaveProperty('disabled', true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test components/__tests__/chat-page.test.tsx`
Expected: FAIL — `ChatPage` still takes `availableModels`, not `allModels`, and has no disabled/tooltip logic.

- [ ] **Step 3: Rewrite `components/chat-page.tsx`**

Change the props type and the model-list rendering. Keep `handleSubmit`, `columnRefs`, and the persistence logic exactly as Phase 8 left them — only these pieces change:

```tsx
'use client';

import { useRef, useState } from 'react';
import type { ModelAvailability } from '@/lib/models';
import type { GroupedColumn } from '@/lib/conversations';
import { ChatColumn, type ChatColumnHandle } from '@/components/chat-column';

export function ChatPage({
  allModels,
  conversationId: initialConversationId,
  initialColumns,
}: {
  allModels: ModelAvailability[];
  conversationId?: string;
  initialColumns?: GroupedColumn[];
}) {
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>(() => {
    if (initialColumns && initialColumns.length > 0) {
      return initialColumns.map((column) => column.modelId);
    }
    const firstAvailable = allModels.find((model) => model.available);
    return firstAvailable ? [firstAvailable.id] : [];
  });
  const [conversationId, setConversationId] = useState<string | undefined>(initialConversationId);
  const [input, setInput] = useState('');
  const columnRefs = useRef<Record<string, ChatColumnHandle | null>>({});

  if (allModels.length === 0) {
    return <p>No models are configured. Set at least one provider API key to start chatting.</p>;
  }

  function toggleModel(id: string) {
    const model = allModels.find((m) => m.id === id);
    if (!model?.available) {
      return;
    }
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
        {allModels.map((model) => (
          <label
            key={model.id}
            className="flex items-center gap-1"
            title={model.available ? undefined : `${model.provider} is not configured`}
          >
            <input
              type="checkbox"
              checked={selectedModelIds.includes(model.id)}
              disabled={!model.available}
              onChange={() => toggleModel(model.id)}
            />
            {model.label}
            {!model.available && <span className="text-xs text-gray-400"> (unavailable)</span>}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-1 flex-wrap gap-4">
        {selectedModelIds.map((modelId) => {
          const model = allModels.find((m) => m.id === modelId);
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

- [ ] **Step 4: Update `app/page.tsx`**

Change the import and prop:

```tsx
import { listAllModelsWithAvailability } from '@/lib/models';
import { ChatPage } from '@/components/chat-page';
import { AppShell } from '@/components/app-shell';

export default function Home() {
  return (
    <AppShell>
      <ChatPage allModels={listAllModelsWithAvailability()} />
    </AppShell>
  );
}
```

- [ ] **Step 5: Update `app/c/[id]/page.tsx`**

Change only the import and the `ChatPage` prop (everything else — `notFound()` guards, `getConversationWithMessages`, `groupMessagesByModel` — is unchanged):

```tsx
import { listAllModelsWithAvailability } from '@/lib/models';
// ...(keep the other existing imports)

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // ...(keep the existing auth/notFound/getConversationWithMessages logic unchanged)

  return (
    <AppShell>
      <ChatPage
        allModels={listAllModelsWithAvailability()}
        conversationId={conversation.id}
        initialColumns={groupMessagesByModel(conversation.messages)}
      />
    </AppShell>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bun run test components/__tests__/chat-page.test.tsx`
Expected: PASS — all cases green (existing fan-out/persistence cases with the renamed prop, plus the 4 new disabled/tooltip/default/all-unavailable cases).

- [ ] **Step 7: Run the full sweep**

```bash
bun run lint
bun run format:check
bun run test
bun run build
```

Expected: all four succeed — `bun run build` also proves `app/page.tsx` and `app/c/[id]/page.tsx` compile against the renamed prop.

- [ ] **Step 8: Commit**

```bash
git add components/chat-page.tsx components/__tests__/chat-page.test.tsx app/page.tsx "app/c/[id]/page.tsx"
git commit -m "Show all models in the picker, disabling unconfigured ones with a tooltip"
```

---

### Task 5: Per-column error/retry and empty-content persistence skip

**Files:**
- Modify: `components/chat-column.tsx`, `components/__tests__/chat-column.test.tsx`

**Interfaces:** `ChatColumn`'s props and `ChatColumnHandle` are unchanged — this task only adds internal error UI and a persistence guard.

- [ ] **Step 1: Write the failing test**

Append to `components/__tests__/chat-column.test.tsx`. Every existing `vi.mocked(useChat).mockReturnValue({...})` call in the file needs `error: undefined, regenerate: vi.fn()` added to its returned object (do this for all pre-existing test cases too, not just the new ones — `useChat`'s return shape used by the component is growing, and every mock must match it or the tests won't reflect real usage). Then add:

```tsx
it('shows an error message and Retry button when the stream errors', () => {
  const regenerate = vi.fn();
  vi.mocked(useChat).mockReturnValue({
    messages: [],
    sendMessage: vi.fn(),
    status: 'error',
    stop: vi.fn(),
    error: new Error('rate limited'),
    regenerate,
  } as never);

  render(<ChatColumn model={model} ref={null} />);

  expect(screen.getByText(/something went wrong/i)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /retry/i }));
  expect(regenerate).toHaveBeenCalled();
});

it('shows no error UI when there is no error', () => {
  vi.mocked(useChat).mockReturnValue({
    messages: [],
    sendMessage: vi.fn(),
    status: 'ready',
    stop: vi.fn(),
    error: undefined,
    regenerate: vi.fn(),
  } as never);

  render(<ChatColumn model={model} ref={null} />);

  expect(screen.queryByText(/something went wrong/i)).toBeNull();
});

it('does not persist an assistant message with no text content', () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  let capturedOnFinish: ((args: { message: unknown }) => void) | undefined;
  vi.mocked(useChat).mockImplementation((options?: { onFinish?: typeof capturedOnFinish }) => {
    capturedOnFinish = options?.onFinish;
    return {
      messages: [],
      sendMessage: vi.fn(),
      status: 'ready',
      stop: vi.fn(),
      error: undefined,
      regenerate: vi.fn(),
    } as never;
  });

  const ref = createRef<ChatColumnHandle>();
  render(<ChatColumn model={model} ref={ref} />);
  ref.current?.sendMessage('hello', 'conversation-1');

  capturedOnFinish?.({ message: { id: 'm1', role: 'assistant', parts: [] } });

  expect(fetchMock).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test components/__tests__/chat-column.test.tsx`
Expected: FAIL — no error UI exists yet, and `onFinish` currently POSTs regardless of content.

- [ ] **Step 3: Update `components/chat-column.tsx`**

Change the `useChat` destructure and add the empty-content guard:

```tsx
const { messages, sendMessage, status, stop, error, regenerate } = useChat({
  messages: initialMessages,
  onFinish: ({ message }) => {
    const conversationId = conversationIdRef.current;
    if (!conversationId) {
      return;
    }
    const content = getMessageText(message as UIMessage);
    if (!content) {
      return;
    }
    fetch(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'assistant',
        modelId: model.id,
        content,
      }),
    });
  },
});
```

Add error UI just above the Stop button block:

```tsx
{error && (
  <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
    <p>Something went wrong with this model.</p>
    <button type="button" onClick={() => regenerate()} className="mt-1 underline">
      Retry
    </button>
  </div>
)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test components/__tests__/chat-column.test.tsx`
Expected: PASS — all cases green (Phase 7/8's existing cases with the extended mock shape, plus the 3 new ones).

- [ ] **Step 5: Run the full sweep**

```bash
bun run lint
bun run format:check
bun run test
bun run build
```

Expected: all four succeed.

- [ ] **Step 6: Commit**

```bash
git add components/chat-column.tsx components/__tests__/chat-column.test.tsx
git commit -m "Add per-column error/retry UI and skip persisting empty assistant replies"
```

---

### Task 6: Full verification sweep and PR

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
git push -u origin phase-9-error-handling
```

(If no `origin` remote exists — as with prior phases — stop and confirm with the user whether a remote is set up yet before attempting to push.)

```bash
gh pr create --title "Phase 9: Error handling & polish" \
  --base phase-8-persistence \
  --body "$(cat <<'EOF'
Closes out the MVP's error-handling requirements: /api/chat now returns
400 for a malformed body instead of an unhandled 500; the model picker
shows every registered model, disabling ones whose provider isn't
configured with a tooltip explaining why (instead of silently hiding
them); each ChatColumn surfaces its own stream errors with a Retry
button (other columns keep working); and ChatColumn no longer attempts
to persist an assistant reply with no text content (previously silently
400ing and dropping the message).

Verification: bun run lint / format:check / test / build all pass.

Implements Phase 9 of docs/superpowers/specs/2026-08-25-multi-model-chat-design.md
EOF
)"
```

- [ ] **Step 3: Report the PR URL to the user for review/merge**

---

## Self-Review

**Spec coverage:** "Per-column provider errors surface only in that column with a retry button; other columns stream on" ✅ (Task 5 — `error`/`regenerate` are per-`useChat`-instance, so this is structurally guaranteed the same way per-column cancel was in Phase 7, not something that needs cross-column coordination). "Missing/invalid API keys → the affected models are disabled in the picker with a tooltip, not a crash" ✅ (Task 3/4 — this closes a real gap between the spec's intent and what Phases 6-8 actually built, which silently filtered unavailable models out rather than showing them disabled). "`/api/chat` guards: auth required, model id must exist in registry, message length capped" — auth/model/length were already done in Phase 5; this phase adds the missing malformed-body guard ✅ (Task 2). One-branch-per-phase + PR ✅ (Task 1/6). No-co-author ✅. `format:check` added to every task's own sweep ✅ (Global Constraints, addressing Phase 8's process gap).

**Placeholder scan:** No TBD/TODO. Every code step has concrete, complete content, including all new test cases. The two items carried forward from earlier phases' parked minors (malformed-body 500, empty-content silent drop) are named with their originating phase, not treated as fresh discoveries.

**Type consistency:** `ModelAvailability` (Task 3) extends `ModelDefinition` (Phase 4, unchanged) with `available: boolean` — `ChatColumn`'s `model` prop is still typed `ModelDefinition`, and `ModelAvailability` is structurally assignable to it (extra `available` field is harmless), so Task 4's `ChatPage` passing a `ModelAvailability` into `<ChatColumn model={model} ...>` requires no change to `chat-column.tsx`'s prop type. `listAllModelsWithAvailability()`'s return type matches exactly what Task 4's `app/page.tsx`/`app/c/[id]/page.tsx` pass as `allModels`. `useChat`'s `error`/`regenerate` fields (Task 5) match the AI SDK's documented shape (verified during planning, not guessed) and are added consistently to every pre-existing mock in `chat-column.test.tsx`, not just the new cases — called out explicitly in Task 5's Step 1 so the implementer doesn't leave old mocks with a narrower shape than the component now expects.
