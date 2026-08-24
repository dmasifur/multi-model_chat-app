import { describe, it, expect } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { users, accounts, sessions, verificationTokens } from '@/lib/db/schema';

describe('auth.js adapter tables', () => {
  it('users table has the expected name and columns', () => {
    expect(getTableConfig(users).name).toBe('user');
    expect(Object.keys(getTableColumns(users)).sort()).toEqual(
      ['id', 'name', 'email', 'emailVerified', 'image'].sort(),
    );
  });

  it('accounts table has the expected name, columns, and composite primary key', () => {
    const config = getTableConfig(accounts);
    expect(config.name).toBe('account');
    expect(Object.keys(getTableColumns(accounts)).sort()).toEqual(
      [
        'userId',
        'type',
        'provider',
        'providerAccountId',
        'refresh_token',
        'access_token',
        'expires_at',
        'token_type',
        'scope',
        'id_token',
        'session_state',
      ].sort(),
    );
    expect(config.primaryKeys[0]?.columns.map((c) => c.name).sort()).toEqual(
      ['provider', 'providerAccountId'].sort(),
    );
  });

  it('sessions table has the expected name and columns', () => {
    expect(getTableConfig(sessions).name).toBe('session');
    expect(Object.keys(getTableColumns(sessions)).sort()).toEqual(
      ['sessionToken', 'userId', 'expires'].sort(),
    );
  });

  it('verificationTokens table has the expected name and composite primary key', () => {
    const config = getTableConfig(verificationTokens);
    expect(config.name).toBe('verificationToken');
    expect(config.primaryKeys[0]?.columns.map((c) => c.name).sort()).toEqual(
      ['identifier', 'token'].sort(),
    );
  });
});
