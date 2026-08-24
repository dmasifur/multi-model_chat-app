# Phase 4 — Provider Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the model registry and `getModel()` resolver that lets Phase 5's chat API turn a model id into a Vercel AI SDK `LanguageModel`, across three providers (Groq, OpenRouter, Ollama) — the hybrid core the whole app's "free/open-source, hosted or local" requirement rests on.

**Architecture:** A single `lib/models.ts` exports a static `MODEL_REGISTRY` array (one object per selectable model: id, label, provider, provider-specific model id, hosted/local kind) plus three pure functions: `isModelAvailable(id)` (is the model's provider configured via env vars?), `listAvailableModels()` (registry filtered to configured providers — this is what the UI will show), and `getModel(id)` (instantiates the right AI SDK provider client and returns its `LanguageModel`). Provider instantiation happens lazily inside `getModel()`, not at module load, so importing the registry never requires any env var to be set. No network calls happen anywhere in this phase — provider client constructors are pure object construction; only Phase 5's actual `streamText()` call touches the network.

**Tech Stack:** Vercel AI SDK (`ai`), `@ai-sdk/groq`, `@openrouter/ai-sdk-provider`, `ollama-ai-provider-v2` (the current community Ollama provider package — supersedes the older `ollama-ai-provider` name). Bun, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-multi-model-chat-design.md`

## Global Constraints

- Package manager / runtime: **Bun**. Tests run with **Vitest** via `bun run test`.
- Branch: all Phase 4 work on **`phase-4-providers`**, off `phase-3-auth` (reviewed/ready, not yet merged to `main` — same situation as prior phases); merged via PR.
- Commits: **small, meaningful chunks**; **no `Co-Authored-By: Claude` trailer**.
- Provider layer (from spec, verbatim): `lib/models.ts` — registry array of `{ id, label, provider, providerModelId, kind: 'hosted' | 'local' }`. `getModel(id)` returns the AI SDK `LanguageModel`, instantiating the matching provider with server-side env keys: `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `OLLAMA_BASE_URL`. Adding a model is a single array entry. Local (Ollama) models are only shown and enabled when `OLLAMA_BASE_URL` is configured.
- These three env vars already exist as blank placeholders in `.env.example` (Phase 1) — no changes needed there. Local `.env` also already has them blank; this plan's tests do not require real API keys (see Task 3's testing approach).

## File Structure

- `lib/models.ts` — **create.** `ModelDefinition` type, `MODEL_REGISTRY`, `isModelAvailable`, `listAvailableModels`, `getModel`.
- `lib/__tests__/models.test.ts` — **create.** Unit tests for registry shape, availability filtering, and `getModel` resolution/error paths — no real network calls, no real credentials needed.

---

### Task 1: Create the Phase 4 branch

**Files:** none (git only)

- [ ] **Step 1: Branch off phase-3-auth**

```bash
git checkout phase-3-auth
git checkout -b phase-4-providers
```

- [ ] **Step 2: Verify branch**

Run: `git branch --show-current`
Expected: `phase-4-providers`

---

### Task 2: Model registry and availability functions

This task covers everything that doesn't touch a provider SDK: the registry data, and the two pure functions that decide what's shown/usable based on env vars. No AI SDK provider packages are needed yet — that's Task 3.

**Files:**
- Create: `lib/models.ts` (this task writes the type, registry, `isModelAvailable`, `listAvailableModels`; Task 3 appends `getModel`)
- Create: `lib/__tests__/models.test.ts` (this task writes the registry-shape and availability tests; Task 3 appends `getModel` tests)

**Interfaces:**
- Produces: `ModelDefinition` (type), `MODEL_REGISTRY: ModelDefinition[]`, `isModelAvailable(id: string): boolean`, `listAvailableModels(): ModelDefinition[]` — all named exports from `@/lib/models`.

- [ ] **Step 1: Write the failing test**

`lib/__tests__/models.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { MODEL_REGISTRY, isModelAvailable, listAvailableModels } from '@/lib/models';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('MODEL_REGISTRY', () => {
  it('has one entry per supported provider with unique ids', () => {
    const ids = MODEL_REGISTRY.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(MODEL_REGISTRY.some((m) => m.provider === 'groq')).toBe(true);
    expect(MODEL_REGISTRY.some((m) => m.provider === 'openrouter')).toBe(true);
    expect(MODEL_REGISTRY.some((m) => m.provider === 'ollama')).toBe(true);
  });

  it('marks the ollama entry as kind "local" and the rest as "hosted"', () => {
    const ollamaEntry = MODEL_REGISTRY.find((m) => m.provider === 'ollama');
    expect(ollamaEntry?.kind).toBe('local');
    const hostedEntries = MODEL_REGISTRY.filter((m) => m.provider !== 'ollama');
    expect(hostedEntries.every((m) => m.kind === 'hosted')).toBe(true);
  });
});

describe('isModelAvailable', () => {
  it('returns false for an unknown model id', () => {
    expect(isModelAvailable('does-not-exist')).toBe(false);
  });

  it('returns false for a hosted model when its API key env var is unset', () => {
    vi.stubEnv('GROQ_API_KEY', '');
    const groqEntry = MODEL_REGISTRY.find((m) => m.provider === 'groq')!;
    expect(isModelAvailable(groqEntry.id)).toBe(false);
  });

  it('returns true for a hosted model when its API key env var is set', () => {
    vi.stubEnv('GROQ_API_KEY', 'test-key');
    const groqEntry = MODEL_REGISTRY.find((m) => m.provider === 'groq')!;
    expect(isModelAvailable(groqEntry.id)).toBe(true);
  });

  it('returns false for the local ollama model when OLLAMA_BASE_URL is unset', () => {
    vi.stubEnv('OLLAMA_BASE_URL', '');
    const ollamaEntry = MODEL_REGISTRY.find((m) => m.provider === 'ollama')!;
    expect(isModelAvailable(ollamaEntry.id)).toBe(false);
  });

  it('returns true for the local ollama model when OLLAMA_BASE_URL is set', () => {
    vi.stubEnv('OLLAMA_BASE_URL', 'http://localhost:11434');
    const ollamaEntry = MODEL_REGISTRY.find((m) => m.provider === 'ollama')!;
    expect(isModelAvailable(ollamaEntry.id)).toBe(true);
  });
});

describe('listAvailableModels', () => {
  it('excludes models whose provider is not configured', () => {
    vi.stubEnv('GROQ_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('OLLAMA_BASE_URL', '');
    expect(listAvailableModels()).toEqual([]);
  });

  it('includes only models whose provider is configured', () => {
    vi.stubEnv('GROQ_API_KEY', 'test-key');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('OLLAMA_BASE_URL', '');
    const available = listAvailableModels();
    expect(available.every((m) => m.provider === 'groq')).toBe(true);
    expect(available.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test lib/__tests__/models.test.ts`
Expected: FAIL — cannot resolve `@/lib/models` (file does not exist yet).

- [ ] **Step 3: Write `lib/models.ts`**

```ts
export type ModelKind = 'hosted' | 'local';
export type ModelProviderName = 'groq' | 'openrouter' | 'ollama';

export interface ModelDefinition {
  id: string;
  label: string;
  provider: ModelProviderName;
  providerModelId: string;
  kind: ModelKind;
}

export const MODEL_REGISTRY: ModelDefinition[] = [
  {
    id: 'groq-llama-3.3-70b',
    label: 'Llama 3.3 70B (Groq)',
    provider: 'groq',
    providerModelId: 'llama-3.3-70b-versatile',
    kind: 'hosted',
  },
  {
    id: 'openrouter-llama-3.3-70b-free',
    label: 'Llama 3.3 70B Free (OpenRouter)',
    provider: 'openrouter',
    providerModelId: 'meta-llama/llama-3.3-70b-instruct:free',
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

function isProviderConfigured(provider: ModelProviderName): boolean {
  switch (provider) {
    case 'groq':
      return Boolean(process.env.GROQ_API_KEY);
    case 'openrouter':
      return Boolean(process.env.OPENROUTER_API_KEY);
    case 'ollama':
      return Boolean(process.env.OLLAMA_BASE_URL);
  }
}

export function isModelAvailable(id: string): boolean {
  const definition = MODEL_REGISTRY.find((m) => m.id === id);
  if (!definition) {
    return false;
  }
  return isProviderConfigured(definition.provider);
}

export function listAvailableModels(): ModelDefinition[] {
  return MODEL_REGISTRY.filter((m) => isProviderConfigured(m.provider));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test lib/__tests__/models.test.ts`
Expected: PASS — 8/8 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/models.ts lib/__tests__/models.test.ts
git commit -m "Add model registry with availability filtering"
```

---

### Task 3: getModel() resolver

**Files:**
- Modify: `lib/models.ts` (append `getModel`)
- Modify: `lib/__tests__/models.test.ts` (append `getModel` tests)

**Interfaces:**
- Consumes: `MODEL_REGISTRY`, `isModelAvailable` from Task 2 (same file/module).
- Produces: `getModel(id: string): LanguageModel` — named export from `@/lib/models`, consumed by Phase 5's chat API.

- [ ] **Step 1: Install the AI SDK packages**

```bash
bun add ai @ai-sdk/groq @openrouter/ai-sdk-provider ollama-ai-provider-v2
```

- [ ] **Step 2: Write the failing test**

Append to `lib/__tests__/models.test.ts`:

```ts
import { getModel } from '@/lib/models';
```

```ts
describe('getModel', () => {
  it('throws for an unknown model id', () => {
    expect(() => getModel('does-not-exist')).toThrow(/unknown model/i);
  });

  it('throws when the model exists but its provider is not configured', () => {
    vi.stubEnv('GROQ_API_KEY', '');
    const groqEntry = MODEL_REGISTRY.find((m) => m.provider === 'groq')!;
    expect(() => getModel(groqEntry.id)).toThrow(/not (configured|available)/i);
  });

  it('returns a language model instance for a configured groq model', () => {
    vi.stubEnv('GROQ_API_KEY', 'test-key');
    const groqEntry = MODEL_REGISTRY.find((m) => m.provider === 'groq')!;
    const model = getModel(groqEntry.id);
    expect(model.modelId).toBe(groqEntry.providerModelId);
  });

  it('returns a language model instance for a configured openrouter model', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    const openrouterEntry = MODEL_REGISTRY.find((m) => m.provider === 'openrouter')!;
    const model = getModel(openrouterEntry.id);
    expect(model.modelId).toBe(openrouterEntry.providerModelId);
  });

  it('returns a language model instance for a configured ollama model', () => {
    vi.stubEnv('OLLAMA_BASE_URL', 'http://localhost:11434');
    const ollamaEntry = MODEL_REGISTRY.find((m) => m.provider === 'ollama')!;
    const model = getModel(ollamaEntry.id);
    expect(model.modelId).toBe(ollamaEntry.providerModelId);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test lib/__tests__/models.test.ts`
Expected: FAIL — `getModel` is not exported from `@/lib/models` yet.

- [ ] **Step 4: Append `getModel` to `lib/models.ts`**

Add these imports to the top of the file:

```ts
import type { LanguageModel } from 'ai';
import { createGroq } from '@ai-sdk/groq';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOllama } from 'ollama-ai-provider-v2';
```

Add this function below `listAvailableModels`:

```ts
export function getModel(id: string): LanguageModel {
  const definition = MODEL_REGISTRY.find((m) => m.id === id);
  if (!definition) {
    throw new Error(`Unknown model id: ${id}`);
  }
  if (!isModelAvailable(id)) {
    throw new Error(`Model "${id}" is not available: ${definition.provider} is not configured`);
  }

  switch (definition.provider) {
    case 'groq': {
      const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
      return groq(definition.providerModelId);
    }
    case 'openrouter': {
      const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
      return openrouter.chat(definition.providerModelId);
    }
    case 'ollama': {
      const ollama = createOllama({ baseURL: process.env.OLLAMA_BASE_URL });
      return ollama(definition.providerModelId);
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test lib/__tests__/models.test.ts`
Expected: PASS — 13/13 tests green (8 from Task 2 + 5 new).

- [ ] **Step 6: Run the full test suite**

Run: `bun run test`
Expected: all tests pass across every phase so far.

- [ ] **Step 7: Commit**

```bash
git add lib/models.ts lib/__tests__/models.test.ts package.json bun.lock
git commit -m "Add getModel() resolver for Groq, OpenRouter, and Ollama"
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
git push -u origin phase-4-providers
```

(If no `origin` remote exists — as with prior phases — stop and confirm with the user whether a remote is set up yet before attempting to push.)

```bash
gh pr create --title "Phase 4: Provider layer" \
  --base phase-3-auth \
  --body "$(cat <<'EOF'
Adds the model registry (lib/models.ts) and getModel() resolver spanning
three providers: Groq, OpenRouter, and Ollama (local). Availability is
gated per-provider on GROQ_API_KEY / OPENROUTER_API_KEY / OLLAMA_BASE_URL,
so local models only appear once Ollama is configured.

Verification: bun run lint / format:check / test / build all pass. No
network calls in this phase — provider client construction is pure;
getModel() is exercised with stubbed env vars, not real credentials.

Implements Phase 4 of docs/superpowers/specs/2026-08-25-multi-model-chat-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Report the PR URL to the user for review/merge**

---

## Self-Review

**Spec coverage:** "`lib/models.ts` — registry array of `{ id, label, provider, providerModelId, kind }`" ✅ (Task 2). "`getModel(id)` returns the AI SDK `LanguageModel`, instantiating the matching provider with server-side env keys" ✅ (Task 3). "Adding a model is a single array entry" ✅ (registry is a flat array, no per-model boilerplate elsewhere). "Local (Ollama) models are only shown and enabled when `OLLAMA_BASE_URL` is configured" ✅ (`isProviderConfigured`/`isModelAvailable`/`listAvailableModels`, Task 2). One-branch-per-phase + PR ✅ (Task 1/4). No-co-author ✅. Deferred to later phases (correctly out of scope): the actual `/api/chat` endpoint calling `streamText` with `getModel()` (Phase 5), UI model picker consuming `listAvailableModels()` (Phase 6+).

**Placeholder scan:** No TBD/TODO. Every code step has concrete, complete content — the full registry, the full resolver, and every test case with real assertions. `ollama-ai-provider-v2` is used deliberately (not the older `ollama-ai-provider` name mentioned during brainstorming) — verified as the current community package via the AI SDK's own docs during planning, not a placeholder guess.

**Type consistency:** `ModelDefinition`, `MODEL_REGISTRY`, `isModelAvailable` from Task 2 are consumed unchanged by Task 3's `getModel` and its tests. `getModel(id: string): LanguageModel` matches the `LanguageModel` type imported from `ai` in Task 3 — the same type Phase 5's `streamText({ model: getModel(modelId) })` will expect. `modelId` as the property tests assert on `getModel`'s return value is a real, stable field on the AI SDK's `LanguageModel` interface (confirmed present across `LanguageModelV2`/`V3`/`V4` during planning), not a guessed property name.
