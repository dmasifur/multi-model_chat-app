# Phase 2 — Database Schema & Migrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define the full Postgres schema (Auth.js adapter tables plus the app's `conversations`/`messages` tables) in Drizzle, generate the SQL migration, and apply it to the local Docker Postgres — so every later phase (auth, chat API, persistence) has real tables to read and write.

**Architecture:** All tables live in one file, `lib/db/schema.ts`, exported as Drizzle `pgTable` definitions. `drizzle-kit generate` turns that file into a SQL migration under `./drizzle/`; `drizzle-kit migrate` applies it to the database Phase 1's `docker-compose.yml` already provides. No application code reads these tables yet — that starts in Phase 3 (auth) and Phase 5 (chat API).

**Tech Stack:** Drizzle ORM (`drizzle-orm/pg-core`) + drizzle-kit (already installed in Phase 1), PostgreSQL 16 (Docker Compose, already running), Bun, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-multi-model-chat-design.md`

## Global Constraints

- Package manager / runtime: **Bun** (`bun`, `bunx`). Do not use npm/pnpm/yarn.
- Tests run with **Vitest** via `bun run test` (`vitest run`).
- Branch: all Phase 2 work on **`phase-2-db`**, off `main` (which already contains Phase 1's merged... — see note below); merged via PR.
- Commits: **small, meaningful chunks**; **no `Co-Authored-By: Claude` trailer**.
- Secrets never committed: `.env` is gitignored; only `.env.example` is tracked (already true from Phase 1 — no changes needed here).
- Data model (from spec, verbatim):
  - `users` plus Auth.js `accounts` / `sessions` tables (via the adapter).
  - `conversations`: `id`, `userId`, `title`, `createdAt`.
  - `messages`: `id`, `conversationId`, `role` (`user` | `assistant`), `modelId` (assistant only; null for user), `content`, `createdAt`.

**Note on branch base:** Phase 1 (`phase-1-scaffold`) has been reviewed and is ready to merge but is not yet merged into `main` (kept local, no remote yet, per user instruction). Task 1 below branches `phase-2-db` off `phase-1-scaffold` rather than `main`, since that is where the scaffold, Vitest harness, and Drizzle connection actually live. When Phase 1 is eventually merged to `main`, `phase-2-db` rebases onto it in the ordinary way — no action needed now.

## File Structure

- `lib/db/schema.ts` — **create.** All table definitions: `users`, `accounts`, `sessions`, `verificationTokens` (Auth.js adapter contract), `messageRoleEnum`, `conversations`, `messages`.
- `lib/db/__tests__/schema.test.ts` — **create.** Unit tests asserting table names and column shapes (no DB required).
- `drizzle/` — **create (generated).** SQL migration file(s) + `meta/` journal, written by `drizzle-kit generate`. Committed to git — this is the durable migration history.
- `lib/db/__tests__/migrate.test.ts` — **create.** Integration test verifying all six tables exist in the live Postgres after migration.

---

### Task 1: Create the Phase 2 branch

**Files:** none (git only)

- [ ] **Step 1: Branch off phase-1-scaffold**

```bash
git checkout phase-1-scaffold
git checkout -b phase-2-db
```

- [ ] **Step 2: Verify branch and Postgres**

Run: `git branch --show-current`
Expected: `phase-2-db`

Run: `docker compose ps`
Expected: the `db` service is `Up`. If not running, run `docker compose up -d` first.

---

### Task 2: Define Auth.js adapter tables

These four tables are dictated by the Auth.js Drizzle adapter's contract (`@auth/drizzle-adapter`, wired in Phase 3) — table names, column names, and key structure must match exactly or the adapter will fail at runtime in Phase 3. No app code consumes them yet; this task only needs the shape to be correct.

**Files:**
- Create: `lib/db/schema.ts` (this task writes the first four tables; Task 3 appends to the same file)
- Test: `lib/db/__tests__/schema.test.ts` (this task writes the first two `describe` blocks; Task 3 appends)

**Interfaces:**
- Produces: `users`, `accounts`, `sessions`, `verificationTokens` — all named exports from `@/lib/db/schema`, each a Drizzle `pgTable`. `users.id` is a `text` primary key (referenced by `accounts.userId` and `sessions.userId`).

- [ ] **Step 1: Write `lib/db/schema.ts`**

```ts
import { text, timestamp, integer, pgTable, primaryKey } from 'drizzle-orm/pg-core';

export const users = pgTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
});

export const accounts = pgTable(
  'account',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => ({
    compoundKey: primaryKey({ columns: [account.provider, account.providerAccountId] }),
  }),
);

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => ({
    compositePk: primaryKey({ columns: [vt.identifier, vt.token] }),
  }),
);
```

Note: `type` on `accounts` is plain `text` here (not typed to Auth.js's `AdapterAccountType`) because `next-auth`/`@auth/core` are not installed until Phase 3. The column shape is identical either way — Phase 3 may narrow the TypeScript type when it wires the adapter, but the database schema does not change.

- [ ] **Step 2: Write the failing test**

`lib/db/__tests__/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getTableConfig, getTableColumns } from 'drizzle-orm/pg-core';
import { users, accounts, sessions, verificationTokens } from '@/lib/db/schema';

describe('auth.js adapter tables', () => {
  it('users table has the expected name and columns', () => {
    expect(getTableConfig(users).name).toBe('user');
    expect(Object.keys(getTableColumns(users)).sort()).toEqual(
      ['id', 'name', 'email', 'emailVerified', 'image'].sort(),
    );
  });

  it('accounts table has the expected name, columns, and composite primary key', () => {
    const config = getTableConfig(accounts);
    expect(config.name).toBe('account');
    expect(Object.keys(getTableColumns(accounts)).sort()).toEqual(
      [
        'userId',
        'type',
        'provider',
        'providerAccountId',
        'refresh_token',
        'access_token',
        'expires_at',
        'token_type',
        'scope',
        'id_token',
        'session_state',
      ].sort(),
    );
    expect(config.primaryKeys[0]?.columns.map((c) => c.name).sort()).toEqual(
      ['provider', 'providerAccountId'].sort(),
    );
  });

  it('sessions table has the expected name and columns', () => {
    expect(getTableConfig(sessions).name).toBe('session');
    expect(Object.keys(getTableColumns(sessions)).sort()).toEqual(
      ['sessionToken', 'userId', 'expires'].sort(),
    );
  });

  it('verificationTokens table has the expected name and composite primary key', () => {
    const config = getTableConfig(verificationTokens);
    expect(config.name).toBe('verificationToken');
    expect(config.primaryKeys[0]?.columns.map((c) => c.name).sort()).toEqual(
      ['identifier', 'token'].sort(),
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test lib/db/__tests__/schema.test.ts`
Expected: FAIL — cannot resolve `@/lib/db/schema` (file does not exist yet). If you wrote `schema.ts` before the test by mistake, undo that and confirm RED first.

- [ ] **Step 4: Confirm it passes**

Since Step 1 already wrote the implementation, run: `bun run test lib/db/__tests__/schema.test.ts`
Expected: PASS — 4/4 tests green.

(This task writes schema and test together because the schema is fixed by an external contract, not discovered through TDD — but RED must still be observed before GREEN, per Step 3.)

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/db/__tests__/schema.test.ts
git commit -m "Define Auth.js adapter tables (users, accounts, sessions, verificationTokens)"
```

---

### Task 3: Define app tables (conversations, messages)

**Files:**
- Modify: `lib/db/schema.ts` (append `messageRoleEnum`, `conversations`, `messages`)
- Modify: `lib/db/__tests__/schema.test.ts` (append a `describe` block)

**Interfaces:**
- Consumes: `users` from Task 2 (`conversations.userId` references `users.id`).
- Produces: `conversations`, `messages`, `messageRoleEnum` — named exports from `@/lib/db/schema`. `messages.role` is `messageRoleEnum` (`'user' | 'assistant'`); `messages.modelId` is nullable `text`.

- [ ] **Step 1: Append to `lib/db/schema.ts`**

Add `pgEnum` to the existing import line, then add the new tables below the Task 2 tables:

```ts
import { text, timestamp, integer, pgTable, primaryKey, pgEnum } from 'drizzle-orm/pg-core';
```

```ts
export const messageRoleEnum = pgEnum('message_role', ['user', 'assistant']);

export const conversations = pgTable('conversation', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
});

export const messages = pgTable('message', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  conversationId: text('conversationId')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: messageRoleEnum('role').notNull(),
  modelId: text('modelId'),
  content: text('content').notNull(),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Write the failing test**

Append to `lib/db/__tests__/schema.test.ts` (add the import, then the new `describe` block):

```ts
import { conversations, messages } from '@/lib/db/schema';
```

```ts
describe('app tables', () => {
  it('conversations table has the expected name and columns', () => {
    expect(getTableConfig(conversations).name).toBe('conversation');
    expect(Object.keys(getTableColumns(conversations)).sort()).toEqual(
      ['id', 'userId', 'title', 'createdAt'].sort(),
    );
  });

  it('messages table has the expected name and columns, with modelId nullable', () => {
    expect(getTableConfig(messages).name).toBe('message');
    expect(Object.keys(getTableColumns(messages)).sort()).toEqual(
      ['id', 'conversationId', 'role', 'modelId', 'content', 'createdAt'].sort(),
    );
    expect(getTableColumns(messages).modelId.notNull).toBe(false);
    expect(getTableColumns(messages).content.notNull).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test lib/db/__tests__/schema.test.ts`
Expected: FAIL — `conversations`/`messages` not exported from `@/lib/db/schema` (if Step 1 hasn't been applied yet). Apply Step 1's schema changes, then proceed.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test lib/db/__tests__/schema.test.ts`
Expected: PASS — 6/6 tests green (4 from Task 2 + 2 new).

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/db/__tests__/schema.test.ts
git commit -m "Define conversations and messages tables"
```

---

### Task 4: Generate the SQL migration

**Files:**
- Create (generated): `drizzle/0000_<generated-name>.sql`, `drizzle/meta/_journal.json`, `drizzle/meta/0000_snapshot.json`

**Interfaces:**
- Consumes: `lib/db/schema.ts` (from Tasks 2–3) via `drizzle.config.ts`'s `schema: './lib/db/schema.ts'` (already configured in Phase 1).
- Produces: a versioned SQL migration file that Task 5 applies.

- [ ] **Step 1: Generate the migration**

Run: `bun run db:generate`
Expected: drizzle-kit reports it created a new migration (e.g. "1 tables... " or similar summary) and writes files under `./drizzle/`. Note the generated filename — it is a random adjective-noun name (e.g. `drizzle/0000_absent_giant.sql`), not fixed.

- [ ] **Step 2: Review the generated SQL**

Open the generated `.sql` file and confirm it contains `CREATE TABLE` statements for all six tables: `user`, `account`, `session`, `verificationToken`, `conversation`, `message`, plus `CREATE TYPE "message_role"` for the enum. If anything is missing or wrong, fix `lib/db/schema.ts`, delete the generated `drizzle/` output, and re-run `bun run db:generate` — do not hand-edit the generated SQL.

- [ ] **Step 3: Commit the migration files**

```bash
git add drizzle/
git commit -m "Generate SQL migration for schema"
```

---

### Task 5: Apply the migration and verify against the live database

**Files:**
- Create: `lib/db/__tests__/migrate.test.ts`

**Interfaces:**
- Consumes: `client` from `@/lib/db` (Phase 1, Task 6); the migration files from Task 4.

- [ ] **Step 1: Write the failing test**

`lib/db/__tests__/migrate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { client } from '@/lib/db';

describe('database migration', () => {
  it('creates all expected tables in Postgres', async () => {
    const rows = await client<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name != '__drizzle_migrations'
    `;
    const tableNames = rows.map((r) => r.table_name).sort();
    expect(tableNames).toEqual(
      ['user', 'account', 'session', 'verificationToken', 'conversation', 'message'].sort(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test lib/db/__tests__/migrate.test.ts`
Expected: FAIL — the query returns an empty array (or fewer tables), since the migration has not been applied yet.

- [ ] **Step 3: Apply the migration**

Run: `bun run db:migrate`
Expected: drizzle-kit reports the migration applied successfully.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test lib/db/__tests__/migrate.test.ts`
Expected: PASS — all six table names present.

- [ ] **Step 5: Run the full test suite**

Run: `bun run test`
Expected: all tests pass — Phase 1's smoke + db-connection tests, Task 2/3's schema tests, and this migration test.

- [ ] **Step 6: Commit**

```bash
git add lib/db/__tests__/migrate.test.ts
git commit -m "Add migration verification test"
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
git push -u origin phase-2-db
```

(If no `origin` remote exists — as was the case for Phase 1 — stop and confirm with the user whether a remote is set up yet before attempting to push.)

```bash
gh pr create --title "Phase 2: Database schema & migrations" \
  --base phase-1-scaffold \
  --body "$(cat <<'EOF'
Defines the full Postgres schema in Drizzle: Auth.js adapter tables (user,
account, session, verificationToken) plus the app's conversation and message
tables. Generates and applies the SQL migration to the local Docker Postgres.

Verification: bun run lint / format:check / test / build all pass; migration
verification test confirms all six tables exist in the live database.

Implements Phase 2 of docs/superpowers/specs/2026-08-25-multi-model-chat-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Note the `--base phase-1-scaffold`: Phase 1 is not yet merged to `main` (see the note under Global Constraints), so this PR targets Phase 1's branch rather than `main`. Once Phase 1 merges, retarget this PR to `main` if it hasn't merged already.

- [ ] **Step 3: Report the PR URL to the user for review/merge**

---

## Self-Review

**Spec coverage:** `users` + Auth.js `accounts`/`sessions` tables ✅ (Task 2, plus `verificationTokens` which the adapter also requires even though the spec doesn't name it explicitly — needed for the adapter contract, not scope creep). `conversations`: `id`, `userId`, `title`, `createdAt` ✅ (Task 3). `messages`: `id`, `conversationId`, `role` (`user`|`assistant`), `modelId` (nullable), `content`, `createdAt` ✅ (Task 3). Migration generated and applied ✅ (Tasks 4–5). One-branch-per-phase + PR ✅ (Task 1/6). No-co-author ✅ (all commits). Deferred to later phases (correctly out of scope): auth wiring/providers (Phase 3), provider registry (Phase 4), chat API (Phase 5), UI (Phases 6–7), conversation/message CRUD routes (Phase 8).

**Placeholder scan:** No TBD/TODO. Every code step has concrete, complete content — full schema, full tests, exact commands. The one forward reference (`type` column not typed to `AdapterAccountType` until Phase 3 installs `next-auth`) is explicitly explained and does not block this phase; the column's runtime shape is already correct.

**Type consistency:** `users`/`accounts`/`sessions`/`verificationTokens` exported from Task 2 are imported unchanged by Task 3's `conversations.userId` reference and by both tasks' shared test file. `conversations`/`messages`/`messageRoleEnum` exported from Task 3 are consumed by Task 4 (via `drizzle.config.ts`, already pointing at `lib/db/schema.ts`) and Task 5's migration test. `client` from `@/lib/db` (Task 5) matches the export Phase 1 already established in `lib/db/index.ts`.
