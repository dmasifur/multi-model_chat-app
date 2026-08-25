import { db } from '@/lib/db';
import { usageLog } from '@/lib/db/schema';

export interface UsageRecord {
  userId: string;
  modelId: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export async function recordUsage(input: UsageRecord): Promise<void> {
  await db.insert(usageLog).values(input);
}
