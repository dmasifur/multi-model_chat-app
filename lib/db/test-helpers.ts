import { client } from '@/lib/db';

export async function isDatabaseReachable(): Promise<boolean> {
  try {
    await client`select 1`;
    return true;
  } catch {
    return false;
  }
}
