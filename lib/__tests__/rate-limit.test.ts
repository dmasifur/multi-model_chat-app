import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, rateLimitState } from '@/lib/db/schema';
import { isDatabaseReachable } from '@/lib/db/test-helpers';
import { checkRateLimit } from '@/lib/rate-limit';

async function makeTestUser() {
  const [user] = await db
    .insert(users)
    .values({ email: `test-${randomUUID()}@example.com` })
    .returning();
  return user;
}

const reachable = await isDatabaseReachable();
if (!reachable) {
  console.warn(
    '[checkRateLimit] Skipping: Postgres is not reachable at DATABASE_URL. Run `docker compose up -d` first.',
  );
}

describe.skipIf(!reachable)('checkRateLimit (live Postgres)', () => {
  it('allows the first request in a new window', async () => {
    const user = await makeTestUser();
    const allowed = await checkRateLimit(user.id, { windowMs: 60_000, max: 3 });
    expect(allowed).toBe(true);
  });

  it('allows requests up to the max, then denies the next one in the same window', async () => {
    const user = await makeTestUser();
    const opts = { windowMs: 60_000, max: 3 };

    expect(await checkRateLimit(user.id, opts)).toBe(true);
    expect(await checkRateLimit(user.id, opts)).toBe(true);
    expect(await checkRateLimit(user.id, opts)).toBe(true);
    expect(await checkRateLimit(user.id, opts)).toBe(false);
  });

  it('resets the count once the window has elapsed', async () => {
    const user = await makeTestUser();
    const opts = { windowMs: 60_000, max: 1 };

    expect(await checkRateLimit(user.id, opts)).toBe(true);
    expect(await checkRateLimit(user.id, opts)).toBe(false);

    // Back-date the stored window instead of sleeping through a real one.
    // A short window raced the clock: two round trips could outlast it, so
    // the second call above would reset the counter and wrongly return true.
    await db
      .update(rateLimitState)
      .set({ windowStart: new Date(Date.now() - 120_000) })
      .where(and(eq(rateLimitState.userId, user.id), eq(rateLimitState.bucket, 'chat')));

    expect(await checkRateLimit(user.id, opts)).toBe(true);
  });

  it('tracks separate users independently', async () => {
    const userA = await makeTestUser();
    const userB = await makeTestUser();
    const opts = { windowMs: 60_000, max: 1 };

    expect(await checkRateLimit(userA.id, opts)).toBe(true);
    expect(await checkRateLimit(userA.id, opts)).toBe(false);
    expect(await checkRateLimit(userB.id, opts)).toBe(true);
  });
});

describe.skipIf(!reachable)('checkRateLimit bucket isolation (live Postgres)', () => {
  it("does not let one bucket consume another bucket's budget", async () => {
    const user = await makeTestUser();
    const chat = { windowMs: 60_000, max: 1, bucket: 'chat' };
    const write = { windowMs: 60_000, max: 1, bucket: 'write' };

    expect(await checkRateLimit(user.id, chat)).toBe(true);
    expect(await checkRateLimit(user.id, chat)).toBe(false);

    // The chat bucket is exhausted; the write bucket must still be untouched.
    expect(await checkRateLimit(user.id, write)).toBe(true);
    expect(await checkRateLimit(user.id, write)).toBe(false);
  });

  it('defaults to the chat bucket when none is given', async () => {
    const user = await makeTestUser();
    expect(await checkRateLimit(user.id, { windowMs: 60_000, max: 1 })).toBe(true);
    expect(await checkRateLimit(user.id, { windowMs: 60_000, max: 1, bucket: 'chat' })).toBe(false);
  });
});
