import { describe, it, expect } from 'vitest';
import { client } from '@/lib/db';

describe('db connection', () => {
  it('runs a trivial query against Postgres', async () => {
    const rows = await client`select 1 as one`;
    expect(rows[0].one).toBe(1);
  });
});
