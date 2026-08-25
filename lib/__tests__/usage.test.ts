import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { users, usageLog } from '@/lib/db/schema';
import { recordUsage } from '@/lib/usage';

async function makeTestUser() {
  const [user] = await db
    .insert(users)
    .values({ email: `test-${randomUUID()}@example.com` })
    .returning();
  return user;
}

describe('recordUsage (live Postgres)', () => {
  it('persists a usage row with token counts', async () => {
    const user = await makeTestUser();

    await recordUsage({
      userId: user.id,
      modelId: 'groq-llama-3.3-70b',
      inputTokens: 12,
      outputTokens: 34,
    });

    const rows = await db.select().from(usageLog).where(eq(usageLog.userId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: user.id,
      modelId: 'groq-llama-3.3-70b',
      inputTokens: 12,
      outputTokens: 34,
    });
  });

  it('persists null token counts when usage is unavailable', async () => {
    const user = await makeTestUser();

    await recordUsage({
      userId: user.id,
      modelId: 'groq-llama-3.3-70b',
      inputTokens: null,
      outputTokens: null,
    });

    const rows = await db.select().from(usageLog).where(eq(usageLog.userId, user.id));
    expect(rows[0].inputTokens).toBeNull();
    expect(rows[0].outputTokens).toBeNull();
  });
});
