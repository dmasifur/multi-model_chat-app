import { describe, it, expect } from 'vitest';
import { client } from '@/lib/db';
import { isDatabaseReachable } from '@/lib/db/test-helpers';

const reachable = await isDatabaseReachable();
if (!reachable) {
  console.warn(
    '[db connection] Skipping: Postgres is not reachable at DATABASE_URL. Run `docker compose up -d` first.',
  );
}

describe.skipIf(!reachable)('db connection', () => {
  it('runs a trivial query against Postgres', async () => {
    const rows = await client`select 1 as one`;
    expect(rows[0].one).toBe(1);
  });
});
