# multi-model chat app

Send one prompt to several LLMs at once and compare the replies side by side. Each
model streams into its own column with independent stop and retry; conversations are
persisted per user and reload with every column intact.

Providers: Groq, OpenRouter, and local Ollama. Sign-in via GitHub or Google, gated by
an email allowlist, with a per-user rate limit on chat requests.

## Requirements

- [Bun](https://bun.sh) 1.3.10+ (the lockfile is `bun.lock`)
- Docker, for the local Postgres in `docker-compose.yml`
- At least one provider key: [Groq](https://console.groq.com/keys) or
  [OpenRouter](https://openrouter.ai/keys). Both have free tiers.
- A GitHub or Google OAuth app — the whole app is behind auth, so you need one to sign
  in even locally.

## Setup

```bash
bun install
cp .env.example .env           # then fill it in — see below
docker compose up -d           # Postgres 16 on :5432
bun run db:migrate             # create the schema
bun run dev                    # http://localhost:3000
```

Fill in `.env` before anything else. Two variables throw at import if unset, so the app
will not boot without them: `DATABASE_URL` (`lib/db/index.ts`) and `AUTH_SECRET`
(`auth.ts`).

### Environment

`.env.example` lists every variable. The minimum for a working local app:

```bash
DATABASE_URL=postgresql://app:app@localhost:5432/chatapp   # matches docker-compose.yml
AUTH_SECRET=                 # openssl rand -base64 33
AUTH_GITHUB_ID=              # or the AUTH_GOOGLE_* pair
AUTH_GITHUB_SECRET=
GROQ_API_KEY=                # or OPENROUTER_API_KEY
ALLOWED_EMAILS=you@example.com          # or ALLOWED_EMAIL_DOMAINS=example.com
```

**Set `ALLOWED_EMAILS` or `ALLOWED_EMAIL_DOMAINS`.** If neither is set, `isEmailAllowed`
denies everyone — sign-in fails silently for every account, including yours, with no
error that points at the cause. Both are comma-separated and matched case-insensitively.

The allowlist is re-checked on every request, not just at sign-in, so removing an
address revokes access immediately rather than whenever the JWT would have expired.

Unset provider keys are not an error — the model picker shows every registered model
and disables the ones whose provider is unconfigured, with a tooltip naming it.

For local Ollama, set `OLLAMA_BASE_URL=http://localhost:11434/api` and
`ollama pull llama3.1`. Leave it blank to hide the local model.

### OAuth callback URLs

For local development, register the callback as:

- GitHub — `http://localhost:3000/api/auth/callback/github`
- Google — `http://localhost:3000/api/auth/callback/google`

The path is fixed by Auth.js. A mismatch fails at sign-in with `redirect_uri_mismatch`,
not at startup.

## Scripts

| Command                 | Does                                                 |
| ----------------------- | ---------------------------------------------------- |
| `bun run dev`           | Dev server                                           |
| `bun run build`         | Production build                                     |
| `bun run start`         | Serve the production build                           |
| `bun run lint`          | ESLint                                               |
| `bun run typecheck`     | `tsc --noEmit`                                       |
| `bun run test`          | Vitest, once                                         |
| `bun run test:watch`    | Vitest, watching                                     |
| `bun run test:coverage` | Vitest with a v8 coverage report                     |
| `bun run format`        | Prettier, writing                                    |
| `bun run format:check`  | Prettier, checking                                   |
| `bun run db:generate`   | Generate SQL from `lib/db/schema.ts` into `drizzle/` |
| `bun run db:migrate`    | Apply pending migrations to `DATABASE_URL`           |

CI runs `lint` → `typecheck` → `db:migrate` → `test` → `build` against an ephemeral
Postgres service container, on every pull request and every push to `main`.

## Tests

```bash
bun run test
```

No setup needed. The test scripts load `.env.test`, which is committed on purpose with
placeholder credentials — the suite therefore never runs with your real `.env` secrets
in scope, whatever is on disk.

`lib/db/__tests__/connect.test.ts` and `migrate.test.ts` hit a real Postgres. Both skip
themselves with a warning when it is unreachable, so `bun run test` passes without
Docker running — just with less coverage than CI. Bring the container up to run them.

`.env.test` points `DATABASE_URL` at the same local `chatapp` database as development,
and the migration test asserts the _exact_ set of tables. A database left over from
another branch will fail it. Reset:

```bash
docker compose down -v && docker compose up -d && bun run db:migrate
```

## Schema changes

Edit `lib/db/schema.ts`, then generate and apply. Commit the generated SQL — migrations
are applied from `drizzle/`, never inferred from the schema at runtime.

```bash
bun run db:generate
bun run db:migrate
```
