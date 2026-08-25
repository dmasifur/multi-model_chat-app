import { describe, it, expect } from 'vitest';
import { client } from '@/lib/db';

describe('database migration', () => {
  it('creates all expected tables in Postgres', async () => {
    const rows = await client<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name != '__drizzle_migrations'
    `;
    const tableNames = rows.map((r) => r.table_name).sort();
    expect(tableNames).toEqual(
      [
        'user',
        'account',
        'session',
        'verificationToken',
        'conversation',
        'message',
        'rate_limit_state',
        'usage_log',
      ].sort(),
    );
  });
});
