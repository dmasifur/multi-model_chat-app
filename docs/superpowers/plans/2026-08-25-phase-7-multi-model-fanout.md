# Phase 7 — Multi-Model Fan-Out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Phase 6's single-model chat into the app's actual differentiator — select 1–N models, send one prompt, and watch N independent columns stream simultaneously (Option A: one `useChat` instance per column, one request per model), each cancellable on its own.

**Architecture:** `components/chat-column.tsx` is new — it owns one model's entire conversation via its own `useChat()` instance (matching Phase 5's `/api/chat` contract exactly the way Phase 6's single column did) and exposes an imperative `sendMessage(text)` handle via a React 19 ref-as-prop (no `forwardRef` wrapper needed on this React version) so a parent can trigger it without owning its internal state. `components/chat-page.tsx` is rewritten from Phase 6's single `<select>` into a checkbox group (`selectedModelIds: string[]`) plus one shared prompt input; on submit, it fans the same text out to every selected column's `sendMessage` handle via a ref map — each column's `useChat` instance makes its own independent request to `/api/chat`, so one column erroring or being stopped never touches the others. Per-column cancel comes for free from this architecture: each column's own `stop()` (from its own `useChat()`) only aborts that column's fetch, per the AI SDK's documented default (`resume: false` — client-side cancellation only, no cross-column coupling).

**Tech Stack:** `@ai-sdk/react` (already installed, Phase 6), `@testing-library/react` (already installed, Phase 6). No new dependencies. Bun, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-multi-model-chat-design.md`

## Global Constraints

- Package manager / runtime: **Bun**. Tests run with **Vitest** via `bun run test`.
- Branch: all Phase 7 work on **`phase-7-fanout`**, off `phase-6-chat-ui` (reviewed/ready, not yet merged to `main` — same situation as prior phases); merged via PR.
- Commits: **small, meaningful chunks**; **no `Co-Authored-By: Claude` trailer**.
- Fan-out scope (from spec, verbatim): "N columns, N independent streams (Option A), per-column cancel." This phase does NOT add: cross-column status aggregation (e.g. blocking the shared submit while any one column is still streaming), retry-on-error UI (Phase 9), or persistence (Phase 8) — each is a deliberate, documented deferral below, not an oversight.
- Run `bun run build` before committing any task — this project has caught real bugs (Phases 4, 5) that `bun run test` alone missed.

## Deliberate scope decisions (read before objecting to their absence)

- **The shared submit button is not blocked by per-column streaming status.** Aggregating N independent `useChat` statuses into one "can I submit" boolean is real added complexity (each column would need to report its status up to the parent, e.g. via the same ref handle or a callback prop) for a UX nicety this phase's spec line doesn't ask for. A user can send a new prompt while some columns are still streaming a previous one; each column's own `useChat` instance handles that internally. If manual testing later shows this is confusing, a follow-up phase can add status aggregation.
- **Unmounting a column loses its history.** Unchecking a model's checkbox unmounts its `ChatColumn`, and with it, that column's in-memory `useChat` state. There is no persistence yet (Phase 8), so this is consistent with the rest of the app's current statelessness — not a new gap introduced here.

## File Structure

- `components/chat-column.tsx` — **create.** One streaming column: model label, message list, Stop button while streaming/submitted, `sendMessage` exposed via ref.
- `components/__tests__/chat-column.test.tsx` — **create.**
- `components/chat-page.tsx` — **modify (rewrite).** Replaces Phase 6's single `<select>` + inline message rendering with a checkbox picker (`selectedModelIds: string[]`) and a ref map that fans a shared prompt out to N mounted `ChatColumn`s.
- `components/__tests__/chat-page.test.tsx` — **modify (rewrite).** Phase 6's single-select test cases no longer apply to the new architecture; replaced with multi-select/fan-out cases.

---

### Task 1: Create the Phase 7 branch

**Files:** none (git only)

- [ ] **Step 1: Branch off phase-6-chat-ui**

```bash
git checkout phase-6-chat-ui
git checkout -b phase-7-fanout
```

- [ ] **Step 2: Verify branch**

Run: `git branch --show-current`
Expected: `phase-7-fanout`

---

### Task 2: ChatColumn component

**Files:**
- Create: `components/chat-column.tsx`, `components/__tests__/chat-column.test.tsx`

**Interfaces:**
- Consumes: `ModelDefinition` (type) from `@/lib/models` (Phase 4).
- Produces: `ChatColumn({ model, ref }: { model: ModelDefinition; ref: React.Ref<ChatColumnHandle> })` and the `ChatColumnHandle` interface (`{ sendMessage: (text: string) => void }`) — both named exports from `@/components/chat-column`, consumed by Task 3's `ChatPage`.

- [ ] **Step 1: Write the failing test**

`components/__tests__/chat-column.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ModelDefinition } from '@/lib/models';

vi.mock('@ai-sdk/react', () => ({
  useChat: vi.fn(),
}));

import { useChat } from '@ai-sdk/react';
import { ChatColumn, type ChatColumnHandle } from '@/components/chat-column';

const model: ModelDefinition = {
  id: 'groq-llama-3.3-70b',
  label: 'Llama 3.3 70B (Groq)',
  provider: 'groq',
  providerModelId: 'llama-3.3-70b-versatile',
  kind: 'hosted',
};

beforeEach(() => {
  vi.mocked(useChat).mockReset();
});

describe('ChatColumn', () => {
  it('renders the model label', () => {
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      sendMessage: vi.fn(),
      status: 'ready',
      stop: vi.fn(),
    } as never);

    render(<ChatColumn model={model} ref={null} />);

    expect(screen.getByText(model.label)).toBeTruthy();
  });

  it('renders existing messages from its own useChat instance', () => {
    vi.mocked(useChat).mockReturnValue({
      messages: [{ id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'Hi from Groq' }] }],
      sendMessage: vi.fn(),
      status: 'ready',
      stop: vi.fn(),
    } as never);

    render(<ChatColumn model={model} ref={null} />);

    expect(screen.getByText('Hi from Groq')).toBeTruthy();
  });

  it('shows no Stop button when status is ready', () => {
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      sendMessage: vi.fn(),
      status: 'ready',
      stop: vi.fn(),
    } as never);

    render(<ChatColumn model={model} ref={null} />);

    expect(screen.queryByRole('button', { name: /stop/i })).toBeNull();
  });

  it('shows a Stop button while streaming and calls stop() on click', () => {
    const stop = vi.fn();
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      sendMessage: vi.fn(),
      status: 'streaming',
      stop,
    } as never);

    render(<ChatColumn model={model} ref={null} />);

    fireEvent.click(screen.getByRole('button', { name: /stop/i }));
    expect(stop).toHaveBeenCalled();
  });

  it('exposes sendMessage via ref that calls the underlying sendMessage with modelId', () => {
    const sendMessage = vi.fn();
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      sendMessage,
      status: 'ready',
      stop: vi.fn(),
    } as never);

    const ref = createRef<ChatColumnHandle>();
    render(<ChatColumn model={model} ref={ref} />);

    ref.current?.sendMessage('hello');

    expect(sendMessage).toHaveBeenCalledWith({ text: 'hello' }, { body: { modelId: model.id } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test components/__tests__/chat-column.test.tsx`
Expected: FAIL — cannot resolve `@/components/chat-column` (file does not exist yet).

- [ ] **Step 3: Write `components/chat-column.tsx`**

```tsx
'use client';

import { useImperativeHandle } from 'react';
import { useChat } from '@ai-sdk/react';
import type { ModelDefinition } from '@/lib/models';

export interface ChatColumnHandle {
  sendMessage: (text: string) => void;
}

export function ChatColumn({
  model,
  ref,
}: {
  model: ModelDefinition;
  ref: React.Ref<ChatColumnHandle>;
}) {
  const { messages, sendMessage, status, stop } = useChat();

  useImperativeHandle(ref, () => ({
    sendMessage: (text: string) => {
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

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test components/__tests__/chat-column.test.tsx`
Expected: PASS — 5/5 tests green.

- [ ] **Step 5: Run the full suite and build**

Run: `bun run test`
Expected: all tests pass.

Run: `bun run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add components/chat-column.tsx components/__tests__/chat-column.test.tsx
git commit -m "Add ChatColumn component with per-column stop"
```

---

### Task 3: Rewrite ChatPage for multi-model fan-out

**Files:**
- Modify: `components/chat-page.tsx` (full rewrite — Phase 6's single-select architecture is replaced, not extended)
- Modify: `components/__tests__/chat-page.test.tsx` (full rewrite — Phase 6's single-select test cases no longer apply)

**Interfaces:**
- Consumes: `ChatColumn`, `ChatColumnHandle` from `@/components/chat-column` (Task 2).
- Produces: `ChatPage({ availableModels }: { availableModels: ModelDefinition[] })` — same public signature as Phase 6, so `app/page.tsx` needs no changes.

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `components/__tests__/chat-page.test.tsx`:

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
  vi.mocked(useChat).mockReturnValue({
    messages: [],
    sendMessage: vi.fn(),
    status: 'ready',
    stop: vi.fn(),
  } as never);
});

describe('ChatPage', () => {
  it('shows a message when no models are configured', () => {
    render(<ChatPage availableModels={[]} />);
    expect(screen.getByText(/no models are configured/i)).toBeTruthy();
  });

  it('renders a checkbox per model, with the first pre-selected', () => {
    render(<ChatPage availableModels={models} />);

    const first = screen.getByRole('checkbox', { name: models[0].label }) as HTMLInputElement;
    const second = screen.getByRole('checkbox', { name: models[1].label }) as HTMLInputElement;
    expect(first.checked).toBe(true);
    expect(second.checked).toBe(false);
  });

  it('mounts a column when a model is checked and unmounts it when unchecked', () => {
    render(<ChatPage availableModels={models} />);

    expect(screen.getAllByText(models[0].label)).toHaveLength(2); // checkbox label + column header
    expect(screen.queryAllByText(models[1].label)).toHaveLength(1); // checkbox label only

    fireEvent.click(screen.getByRole('checkbox', { name: models[1].label }));
    expect(screen.getAllByText(models[1].label)).toHaveLength(2); // now also has a column header

    fireEvent.click(screen.getByRole('checkbox', { name: models[0].label }));
    expect(screen.queryAllByText(models[0].label)).toHaveLength(1); // column header gone
  });

  it('fans a submitted message out to every selected column with its own modelId', () => {
    const sendMessage = vi.fn();
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      sendMessage,
      status: 'ready',
      stop: vi.fn(),
    } as never);

    render(<ChatPage availableModels={models} />);
    fireEvent.click(screen.getByRole('checkbox', { name: models[1].label }));

    fireEvent.change(screen.getByPlaceholderText(/type a message/i), {
      target: { value: 'compare these' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(sendMessage).toHaveBeenCalledWith(
      { text: 'compare these' },
      { body: { modelId: models[0].id } },
    );
    expect(sendMessage).toHaveBeenCalledWith(
      { text: 'compare these' },
      { body: { modelId: models[1].id } },
    );
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('clears the input after a successful fan-out send', () => {
    render(<ChatPage availableModels={models} />);

    const input = screen.getByPlaceholderText(/type a message/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(input.value).toBe('');
  });

  it('does not send when the input is empty or whitespace-only', () => {
    const sendMessage = vi.fn();
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      sendMessage,
      status: 'ready',
      stop: vi.fn(),
    } as never);

    render(<ChatPage availableModels={models} />);
    fireEvent.change(screen.getByPlaceholderText(/type a message/i), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('disables the submit button when no models are selected', () => {
    render(<ChatPage availableModels={models} />);

    fireEvent.click(screen.getByRole('checkbox', { name: models[0].label }));

    expect(screen.getByRole('button', { name: /send/i })).toHaveProperty('disabled', true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test components/__tests__/chat-page.test.tsx`
Expected: FAIL — Phase 6's `ChatPage` renders a `<select>`, not checkboxes, so the new assertions fail against the old implementation.

- [ ] **Step 3: Replace `components/chat-page.tsx`**

```tsx
'use client';

import { useRef, useState } from 'react';
import type { ModelDefinition } from '@/lib/models';
import { ChatColumn, type ChatColumnHandle } from '@/components/chat-column';

export function ChatPage({ availableModels }: { availableModels: ModelDefinition[] }) {
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>(
    availableModels[0] ? [availableModels[0].id] : [],
  );
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

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || selectedModelIds.length === 0) {
      return;
    }
    for (const modelId of selectedModelIds) {
      columnRefs.current[modelId]?.sendMessage(trimmed);
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
          return (
            <ChatColumn
              key={model.id}
              model={model}
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
Expected: PASS — 7/7 tests green.

- [ ] **Step 5: Run the full suite and build**

Run: `bun run test`
Expected: all tests pass.

Run: `bun run build`
Expected: succeeds.

Run: `bun run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add components/chat-page.tsx components/__tests__/chat-page.test.tsx
git commit -m "Rewrite ChatPage for multi-model fan-out"
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
git push -u origin phase-7-fanout
```

(If no `origin` remote exists — as with prior phases — stop and confirm with the user whether a remote is set up yet before attempting to push.)

```bash
gh pr create --title "Phase 7: Multi-model fan-out" \
  --base phase-6-chat-ui \
  --body "$(cat <<'EOF'
Turns the single-model chat into true multi-model comparison: a checkbox
picker selects 1-N models, and one prompt fans out to N independent
ChatColumn components, each with its own useChat instance hitting
/api/chat (Option A). Per-column Stop cancels only that column's request.

Verification: bun run lint / format:check / test / build all pass.
Component tests mock useChat and cover: column mounting/unmounting on
checkbox toggle, per-model fan-out with correct modelId per call, empty-
input no-op, and disabled submit with zero models selected.

Deliberately deferred (see plan's "Deliberate scope decisions"): cross-
column status aggregation, retry-on-error UI (Phase 9), persistence
(Phase 8).

Implements Phase 7 of docs/superpowers/specs/2026-08-25-multi-model-chat-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Report the PR URL to the user for review/merge**

---

## Self-Review

**Spec coverage:** "N columns, N independent streams (Option A)" ✅ (Task 2/3 — each `ChatColumn` owns its own `useChat()` instance, matching the architecture decision made during brainstorming). "per-column cancel" ✅ (Task 2 — each column's own `stop()`, verified during planning to be client-side-only per the AI SDK's default `resume: false`, so no cross-column coupling). One-branch-per-phase + PR ✅ (Task 1/4). No-co-author ✅. Deferred to later phases (correctly out of scope, explicitly documented): persistence/history (Phase 8), per-column error/retry UX (Phase 9), cross-column status aggregation (explicitly noted as a "Deliberate scope decision," not silently dropped).

**Placeholder scan:** No TBD/TODO. Every code step has concrete, complete content, including all 12 test cases (5 for `ChatColumn`, 7 for the rewritten `ChatPage`) with real assertions. The two "deliberate scope decisions" are explained with their reasoning up front, not discovered as gaps during review.

**Type consistency:** `ChatColumnHandle` (`{ sendMessage: (text: string) => void }`) defined in Task 2 is the exact type Task 3's `columnRefs` ref map and `useRef<Record<string, ChatColumnHandle | null>>` are typed against. `ChatColumn({ model, ref }: { model: ModelDefinition; ref: React.Ref<ChatColumnHandle> })`'s prop shape matches how Task 3 renders it (`<ChatColumn key={model.id} model={model} ref={(handle) => {...}} />`). `ChatPage`'s public signature (`{ availableModels: ModelDefinition[] }`) is unchanged from Phase 6, so `app/page.tsx` (Phase 6, Task 3) needs no modification — confirmed by re-reading it during planning.
