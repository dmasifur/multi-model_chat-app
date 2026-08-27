import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { rateLimitState } from '@/lib/db/schema';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  bucket?: string;
}

export const DEFAULT_CHAT_RATE_LIMIT: RateLimitOptions = {
  windowMs: 60_000,
  max: 20,
  bucket: 'chat',
};

/**
 * Persistence writes are far cheaper than a completion, and one send fans out
 * into several of them (one user message plus one per selected model), so this
 * bucket has to clear the chat limit comfortably or it would deny writes for
 * sends the chat limiter already allowed.
 */
export const DEFAULT_WRITE_RATE_LIMIT: RateLimitOptions = {
  windowMs: 60_000,
  max: 120,
  bucket: 'write',
};

/**
 * Fixed-window rate limit backed by Postgres. `INSERT ... ON CONFLICT` makes
 * the "start a new window" and "increment within the current window" cases
 * a single atomic statement, so concurrent requests from the same user can't
 * race past the cap between a read and a write.
 */
export async function checkRateLimit(
  userId: string,
  { windowMs, max, bucket = 'chat' }: RateLimitOptions = DEFAULT_CHAT_RATE_LIMIT,
): Promise<boolean> {
  const now = new Date();
  const windowStartCutoff = new Date(now.getTime() - windowMs);

  const [row] = await db
    .insert(rateLimitState)
    .values({ userId, bucket, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimitState.userId, rateLimitState.bucket],
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
