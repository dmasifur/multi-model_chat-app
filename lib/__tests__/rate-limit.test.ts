import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { checkRateLimit } from '@/lib/rate-limit';

async function makeTestUser() {
  const [user] = await db
    .insert(users)
    .values({ email: `test-${randomUUID()}@example.com` })
    .returning();
  return user;
}

describe('checkRateLimit (live Postgres)', () => {
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
    const opts = { windowMs: 10, max: 1 };

    expect(await checkRateLimit(user.id, opts)).toBe(true);
    expect(await checkRateLimit(user.id, opts)).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 20));

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
