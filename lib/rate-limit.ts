import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { rateLimitState } from '@/lib/db/schema';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

export const DEFAULT_CHAT_RATE_LIMIT: RateLimitOptions = {
  windowMs: 60_000,
  max: 20,
};

/**
 * Fixed-window rate limit backed by Postgres. `INSERT ... ON CONFLICT` makes
 * the "start a new window" and "increment within the current window" cases
 * a single atomic statement, so concurrent requests from the same user can't
 * race past the cap between a read and a write.
 */
export async function checkRateLimit(
  userId: string,
  { windowMs, max }: RateLimitOptions = DEFAULT_CHAT_RATE_LIMIT,
): Promise<boolean> {
  const now = new Date();
  const windowStartCutoff = new Date(now.getTime() - windowMs);

  const [row] = await db
    .insert(rateLimitState)
    .values({ userId, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: rateLimitState.userId,
      set: {
        windowStart: sql`case when ${rateLimitState.windowStart} < ${windowStartCutoff.toISOString()}::timestamp
          then ${now.toISOString()}::timestamp
          else ${rateLimitState.windowStart} end`,
        count: sql`case when ${rateLimitState.windowStart} < ${windowStartCutoff.toISOString()}::timestamp
          then 1
          else ${rateLimitState.count} + 1 end`,
      },
    })
    .returning();

  return row.count <= max;
}
