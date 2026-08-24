# Phase 1 — Scaffold & Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a runnable Next.js + TypeScript app (Bun) with linting, formatting, a working Vitest harness, a Docker Compose Postgres, and Drizzle configured — the foundation every later phase builds on.

**Architecture:** A single Next.js (App Router) monolith scaffolded with `create-next-app` under Bun, plus tooling wired in: Vitest for unit tests (run via `bunx vitest`, not Bun's native runner, to match the spec's test framework), Prettier for formatting, a `docker-compose.yml` for local Postgres, and Drizzle Kit configured against that database (schema/migrations come in Phase 2).

**Tech Stack:** Bun 1.3+, Next.js (App Router) + TypeScript, Tailwind CSS, ESLint, Prettier, Vitest, Drizzle ORM + drizzle-kit, PostgreSQL (Docker Compose).

**Spec:** `docs/superpowers/specs/2026-08-25-multi-model-chat-design.md`

## Global Constraints

- Package manager / runtime: **Bun** (`bun`, `bunx`). Do not use npm/pnpm/yarn.
- Tests run with **Vitest** via `bunx vitest run` (Bun's native `bun test` is NOT used).
- Branch: all Phase 1 work on **`phase-1-scaffold`**, off `main`; merged via PR.
- Commits: **small, meaningful chunks**; **no `Co-Authored-By: Claude` trailer**.
- Secrets never committed: `.env` is gitignored; only `.env.example` is tracked.

## File Structure

Created/finalized in this phase:

- `package.json` — scripts and deps (generated, then extended).
- `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `app/` — from `create-next-app`.
- `.prettierrc.json`, `.prettierignore` — formatting config.
- `vitest.config.ts` — Vitest config (jsdom env, path alias).
- `lib/__tests__/smoke.test.ts` — one real test proving the harness runs.
- `docker-compose.yml` — local Postgres service.
- `.env.example` — documented env vars (no secrets).
- `.env` — local secrets (gitignored, created from example).
- `drizzle.config.ts` — Drizzle Kit config pointing at `DATABASE_URL`.
- `lib/db/index.ts` — Drizzle client (connection only; schema in Phase 2).
- `.gitignore` — merged to keep existing rules + Next.js defaults.

---

### Task 1: Create the Phase 1 branch

**Files:** none (git only)

- [ ] **Step 1: Branch off main**

```bash
git checkout -b phase-1-scaffold
```

- [ ] **Step 2: Verify branch**

Run: `git branch --show-current`
Expected: `phase-1-scaffold`

---

### Task 2: Scaffold Next.js app (Bun) into the existing directory

The directory already contains `.git`, `.gitignore`, `.claude/`, and `docs/`.
`create-next-app` refuses a non-empty target, so scaffold into a temp subdir and
move everything up.

**Files:**
- Create (generated): `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, etc.
- Modify: `.gitignore` (merge)

**Interfaces:**
- Produces: a runnable Next.js app with scripts `dev`, `build`, `start`, `lint`; TypeScript path alias `@/*` → project root.

- [ ] **Step 1: Scaffold into a temp directory**

```bash
bunx create-next-app@latest .nextapp \
  --ts --app --tailwind --eslint --no-src-dir \
  --import-alias "@/*" --use-bun --no-turbopack --yes
```

Expected: `.nextapp/` created with a full Next.js project and `bun install` run.

- [ ] **Step 2: Move generated files up into the project root**

```bash
# move regular + dotfiles, but do not clobber .git; handle .gitignore separately
cat .nextapp/.gitignore >> .gitignore
rm .nextapp/.gitignore
shopt -s dotglob
mv .nextapp/* .
shopt -u dotglob
rmdir .nextapp
```

Expected: `package.json`, `app/`, `node_modules/`, etc. now in project root; `.nextapp/` gone.

- [ ] **Step 3: De-duplicate .gitignore**

Open `.gitignore` and ensure `node_modules`, `.next`, `.env`, `.env*.local` each
appear once (the original had a few; Next.js adds its own). Remove exact
duplicate lines. Keep one of each.

- [ ] **Step 4: Verify the app builds and boots**

Run: `bun run build`
Expected: build completes with no errors (a default page compiles).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Scaffold Next.js app with Bun, TypeScript, Tailwind, ESLint"
```

---

### Task 3: Add Prettier

**Files:**
- Create: `.prettierrc.json`, `.prettierignore`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Install Prettier**

```bash
bun add -d prettier
```

- [ ] **Step 2: Write `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 3: Write `.prettierignore`**

```
node_modules
.next
bun.lock
drizzle
```

- [ ] **Step 4: Add format scripts to `package.json`**

Add to the `"scripts"` object:

```json
"format": "prettier --write .",
"format:check": "prettier --check ."
```

- [ ] **Step 5: Format the codebase and verify**

Run: `bun run format`
Then: `bun run format:check`
Expected: `format:check` reports "All matched files use Prettier code style!"

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add Prettier config and format scripts"
```

---

### Task 4: Wire up Vitest with a real smoke test

Bun's native `bun test` is not Vitest-compatible; the spec mandates Vitest. Run it
via `bunx vitest`.

**Files:**
- Create: `vitest.config.ts`, `lib/__tests__/smoke.test.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `bun run test` → `vitest run`; `@/*` alias resolvable in tests.

- [ ] **Step 1: Install Vitest and jsdom**

```bash
bun add -d vitest @vitejs/plugin-react jsdom
```

- [ ] **Step 2: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
});
```

- [ ] **Step 3: Write the failing test**

`lib/__tests__/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { greet } from '@/lib/smoke';

describe('smoke', () => {
  it('greets', () => {
    expect(greet('world')).toBe('hello, world');
  });
});
```

- [ ] **Step 4: Add the test script to `package.json`**

Add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `bun run test`
Expected: FAIL — cannot resolve `@/lib/smoke` (module does not exist yet).

- [ ] **Step 6: Create the minimal module**

`lib/smoke.ts`:

```ts
export function greet(name: string): string {
  return `hello, ${name}`;
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `bun run test`
Expected: PASS — 1 test passed. This proves the Vitest harness + `@/*` alias work.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Configure Vitest harness with passing smoke test"
```

---

### Task 5: Docker Compose Postgres and env template

**Files:**
- Create: `docker-compose.yml`, `.env.example`, `.env` (local, gitignored)

**Interfaces:**
- Produces: `DATABASE_URL` convention consumed by Drizzle in Task 6 and Phase 2.

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: chatapp
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

- [ ] **Step 2: Write `.env.example`**

```
# Postgres (matches docker-compose.yml)
DATABASE_URL=postgresql://app:app@localhost:5432/chatapp

# LLM providers (fill in your own; leave blank to disable a provider)
GROQ_API_KEY=
OPENROUTER_API_KEY=
# Local Ollama (optional; leave blank to hide local models)
OLLAMA_BASE_URL=

# Auth.js (Phase 3)
AUTH_SECRET=
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
```

- [ ] **Step 3: Create local `.env` from the template**

```bash
cp .env.example .env
```

Set `DATABASE_URL` in `.env` to the value above (already correct from copy).
Confirm `.env` is gitignored.

- [ ] **Step 4: Start Postgres and verify it is reachable**

```bash
docker compose up -d
docker compose exec -T db pg_isready -U app -d chatapp
```

Expected: `... accepting connections`.

- [ ] **Step 5: Commit (template only, not `.env`)**

```bash
git add docker-compose.yml .env.example
git status   # confirm .env is NOT staged
git commit -m "Add docker-compose Postgres and env template"
```

---

### Task 6: Configure Drizzle (connection only)

Schema and migrations are Phase 2; here we only install Drizzle and prove the
client connects to the Docker Postgres.

**Files:**
- Create: `drizzle.config.ts`, `lib/db/index.ts`, `lib/db/__tests__/connect.test.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `db` (Drizzle client) exported from `@/lib/db`; `bun run db:generate` / `db:migrate` scripts for Phase 2.

- [ ] **Step 1: Install Drizzle and the Postgres driver**

```bash
bun add drizzle-orm postgres
bun add -d drizzle-kit
```

- [ ] **Step 2: Write `lib/db/index.ts`**

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

export const client = postgres(connectionString);
export const db = drizzle(client);
```

- [ ] **Step 3: Write `drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

(`lib/db/schema.ts` is created in Phase 2; drizzle-kit only reads it when generating.)

- [ ] **Step 4: Add Drizzle scripts to `package.json`**

Add to `"scripts"`:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate"
```

- [ ] **Step 5: Write a connection test**

`lib/db/__tests__/connect.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { client } from '@/lib/db';

describe('db connection', () => {
  it('runs a trivial query against Postgres', async () => {
    const rows = await client`select 1 as one`;
    expect(rows[0].one).toBe(1);
  });
});
```

- [ ] **Step 6: Run the test (Postgres must be up from Task 5)**

Run: `bun run test`
Expected: PASS — the `select 1` query returns `1`, proving the client connects.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Configure Drizzle client and connection test"
```

---

### Task 7: Minimal landing page and final verification

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace `app/page.tsx` with a minimal landing**

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2">
      <h1 className="text-2xl font-semibold">Multi-Model Chat</h1>
      <p className="text-sm text-gray-500">Scaffold ready — chat UI coming soon.</p>
    </main>
  );
}
```

- [ ] **Step 2: Full verification sweep**

Run each and confirm success:

```bash
bun run lint          # no errors
bun run format:check  # all files formatted
bun run test          # all tests pass (smoke + db connection)
bun run build         # production build succeeds
```

Expected: all four succeed.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Add minimal landing page"
```

---

### Task 8: Open the Phase 1 PR

- [ ] **Step 1: Push the branch**

```bash
git push -u origin phase-1-scaffold
```

(If no `origin` remote exists yet, stop and ask the user how they want the repo
hosted before pushing.)

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "Phase 1: Scaffold & tooling" \
  --body "$(cat <<'EOF'
Scaffolds the Next.js + TypeScript app (Bun) with Tailwind, ESLint, Prettier,
Vitest, a docker-compose Postgres, and Drizzle configured (connection only).

Verification: bun run lint / format:check / test / build all pass; Postgres
reachable via docker compose; Vitest smoke + db-connection tests green.

Implements Phase 1 of docs/superpowers/specs/2026-08-25-multi-model-chat-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Report the PR URL to the user for review/merge**

---

## Self-Review

**Spec coverage (Phase 1 scope):** Scaffold ✓ (Task 2), Bun ✓ (global + Task 2),
ESLint/Prettier ✓ (Task 2/3), Vitest ✓ (Task 4), env config ✓ (Task 5),
docker-compose Postgres ✓ (Task 5), Drizzle configured ✓ (Task 6), base layout ✓
(Task 7), one-branch-per-phase + PR ✓ (Task 1/8), no-co-author ✓ (all commits).
Deferred to later phases (correctly out of Phase 1 scope): DB schema/migrations
(Phase 2), auth, providers, chat API, UI, persistence.

**Placeholder scan:** No TBD/TODO; every code step has concrete content. The one
forward reference — `lib/db/schema.ts` — is explicitly labeled as Phase 2 and does
not block Phase 1 tasks (drizzle-kit only reads it during `db:generate`).

**Type consistency:** `greet(name: string): string` used consistently in Task 4;
`client` / `db` exported from `@/lib/db` in Task 6 and consumed by the same task's
test. `@/*` alias defined in scaffold (Task 2) and mirrored in `vitest.config.ts`
(Task 4).
