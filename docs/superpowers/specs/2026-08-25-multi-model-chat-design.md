# Multi-Model Chat Webapp — Design Spec

Date: 2026-08-25

## Context

Greenfield project. Build a t3.chat-style web app that takes a user prompt and
streams answers from **free / open-source LLMs**, with a **side-by-side
comparison** UX: one prompt fans out to multiple models that stream into parallel
columns. The problem being solved is comparing open-source model outputs on the
same prompt, in real time, with saved history — using only freely available
models (hosted free tiers or locally-run).

## Locked Decisions

- **Model source:** hybrid — free hosted APIs (Groq, OpenRouter) as default, with
  optional local **Ollama** backend.
- **Multi-model UX:** side-by-side compare (one prompt → N models, parallel streams).
- **Persistence/auth:** accounts + server-saved history.
- **Stack:** Next.js full-stack (App Router + TypeScript).
- **Fan-out:** Option A — one streaming request per model, one stream per column
  (per-column error isolation, easy per-column cancel/retry).
- **Auth:** Auth.js (NextAuth v5) with GitHub + Google (chosen over Clerk to keep
  user identity in our own Postgres for clean `userId` foreign keys).

## Stack

- **Next.js (App Router) + TypeScript** monolith, one deploy target.
- **Vercel AI SDK** (`ai`) for `streamText()` + `useChat`. Provider packages:
  `@ai-sdk/groq`, `@openrouter/ai-sdk-provider`, community `ollama-ai-provider` —
  all plug into the same `streamText()` call, so the hybrid requirement is solved
  by configuration rather than custom per-provider streaming code.
- **Postgres + Drizzle ORM** for accounts/history.
- **Auth.js (NextAuth v5)** + Drizzle adapter, GitHub + Google OAuth.
- **Vitest** for unit/integration tests; Playwright deferred.

## Architecture (three layers)

1. **UI (React Server + Client Components):** chat page with a model-picker, a
   prompt box, and a responsive grid of model columns; sidebar lists saved
   conversations.
2. **API routes:** `/api/chat` (streaming completions, one call per model), auth
   routes, and conversation/message CRUD.
3. **Provider layer:** a `getModel(modelId)` registry mapping a model id to the
   correct AI SDK provider instance.

## Provider layer (hybrid core)

- `lib/models.ts` — a registry array of
  `{ id, label, provider, providerModelId, kind: 'hosted' | 'local' }`.
- `getModel(id)` returns the AI SDK `LanguageModel`, instantiating the matching
  provider with server-side env keys: `GROQ_API_KEY`, `OPENROUTER_API_KEY`,
  `OLLAMA_BASE_URL`.
- Adding a model is a single array entry. Local (Ollama) models are only shown and
  enabled when `OLLAMA_BASE_URL` is configured.

## Streaming & fan-out (Option A)

- User selects 1–N models and sends a prompt.
- The client renders one column per selected model and, per column, uses a
  `useChat` instance pointed at `/api/chat` with that column's `modelId` in the
  request body.
- `/api/chat`: validate session → load conversation history →
  `streamText({ model: getModel(modelId), messages })` →
  return `result.toUIMessageStreamResponse()`.
- N independent streams fill N columns concurrently. Cancel/retry is isolated per
  column.

## Data model (Postgres + Drizzle)

- `users` plus Auth.js `accounts` / `sessions` tables (via the adapter).
- `conversations`: `id`, `userId`, `title`, `createdAt`.
- `messages`: `id`, `conversationId`, `role` (`user` | `assistant`),
  `modelId` (which model produced an assistant message; null for user messages),
  `content`, `createdAt`.
- One user turn is one `user` message plus several `assistant` messages sharing
  the conversation, distinguished by `modelId`. On reload, columns are
  reconstructed by grouping assistant messages by `modelId`.

## Auth

- Auth.js (NextAuth v5) + Drizzle adapter, GitHub + Google OAuth.
- Middleware protects chat routes; unauthenticated users hit a sign-in page.

## Persistence flow

- A new conversation is created lazily on first send; the title is derived from
  the first prompt.
- The user message is saved when the turn is sent.
- When a stream finishes, the client posts the completed assistant message (with
  its `modelId`) to `/api/conversations/[id]/messages`.

## Error handling

- Per-column provider errors (rate limits, timeouts on free tiers) surface only in
  that column with a retry button; other columns keep streaming.
- Missing or invalid API keys disable the affected models in the picker (with a
  tooltip) rather than crashing.
- `/api/chat` guards: authentication required, model id must exist in the registry,
  message length capped.

## Testing

- **Unit (Vitest):** model registry resolution and disabled handling;
  message-grouping logic.
- **Integration:** `/api/chat` and conversation CRUD with a mocked provider
  (asserting streaming shape and persistence) against a test Postgres.
- **E2E (deferred):** Playwright — sign in, prompt two models, see two columns
  stream, reload and see history.

## Deferred (YAGNI for v1)

Streaming-to-DB mid-generation, message editing/branching, file/image
attachments, syntax-highlighting niceties, usage/cost tracking, additional OAuth
providers.

## Workflow conventions

- One branch per phase (e.g. `phase-1-scaffold`), off `main`.
- Each phase is reviewed and merged via a PR before the next phase branches off
  updated `main`.
- Small, meaningful chunk commits within each phase.
- No Claude co-author trailer on commits.

## Phases

1. **Scaffold & tooling** — git, Next.js + TS, ESLint/Prettier, Vitest, env
   config, Drizzle configured, base layout.
2. **Database schema & migrations** — Drizzle schema (`users`, Auth.js
   `accounts`/`sessions`, `conversations`, `messages`); generate + run migrations.
3. **Auth** — Auth.js + Drizzle adapter; GitHub + Google; sign-in page;
   route-protecting middleware.
4. **Provider layer** — registry + `getModel()`; Groq/OpenRouter/Ollama wiring;
   unit tests.
5. **Chat streaming endpoint** — `/api/chat` single model; guards; integration
   test with mocked provider.
6. **Single-column chat UI** — model picker, prompt box, one streaming column.
7. **Multi-model fan-out** — N columns, N independent streams (Option A),
   per-column cancel.
8. **Persistence & history** — CRUD routes, lazy conversation creation, save
   turns, history sidebar, reload reconstruction; grouping unit test.
9. **Error handling & polish** — per-column error/retry, disabled-model UX,
   message-length cap.

## Verification

- `pnpm dev`, sign in, select two models, send a prompt → two columns stream
  concurrently.
- Reload → conversation and both columns' messages restored from DB.
- Remove one provider's API key → that model disabled in the picker; others work.
- Force a provider error → only that column shows retry; others unaffected.
- `pnpm test` green (registry resolution, message grouping, `/api/chat`
  integration).
