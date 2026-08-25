import { describe, it, expect } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { users, accounts, verificationTokens } from '@/lib/db/schema';
import { conversations, messages, rateLimitState, usageLog } from '@/lib/db/schema';

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

  it('verificationTokens table has the expected name and composite primary key', () => {
    const config = getTableConfig(verificationTokens);
    expect(config.name).toBe('verificationToken');
    expect(config.primaryKeys[0]?.columns.map((c) => c.name).sort()).toEqual(
      ['identifier', 'token'].sort(),
    );
  });
});

describe('app tables', () => {
  it('conversations table has the expected name and columns', () => {
    expect(getTableConfig(conversations).name).toBe('conversation');
    expect(Object.keys(getTableColumns(conversations)).sort()).toEqual(
      ['id', 'userId', 'title', 'createdAt'].sort(),
    );
  });

  it('conversations table has an index on userId', () => {
    const indexes = getTableConfig(conversations).indexes;
    expect(indexes.some((idx) => idx.config.columns.some((c) => 'name' in c && c.name === 'userId')))
      .toBe(true);
  });

  it('messages table has the expected name and columns, with modelId nullable', () => {
    expect(getTableConfig(messages).name).toBe('message');
    expect(Object.keys(getTableColumns(messages)).sort()).toEqual(
      ['id', 'conversationId', 'role', 'modelId', 'content', 'createdAt'].sort(),
    );
    expect(getTableColumns(messages).modelId.notNull).toBe(false);
    expect(getTableColumns(messages).content.notNull).toBe(true);
  });

  it('messages table has an index on conversationId', () => {
    const indexes = getTableConfig(messages).indexes;
    expect(
      indexes.some((idx) =>
        idx.config.columns.some((c) => 'name' in c && c.name === 'conversationId'),
      ),
    ).toBe(true);
  });

  it('rateLimitState table has the expected name, columns, and userId primary key', () => {
    expect(getTableConfig(rateLimitState).name).toBe('rate_limit_state');
    expect(Object.keys(getTableColumns(rateLimitState)).sort()).toEqual(
      ['userId', 'windowStart', 'count'].sort(),
    );
    expect(getTableColumns(rateLimitState).userId.primary).toBe(true);
  });

  it('usageLog table has the expected name and columns, with token counts nullable', () => {
    expect(getTableConfig(usageLog).name).toBe('usage_log');
    expect(Object.keys(getTableColumns(usageLog)).sort()).toEqual(
      ['id', 'userId', 'modelId', 'inputTokens', 'outputTokens', 'createdAt'].sort(),
    );
    expect(getTableColumns(usageLog).inputTokens.notNull).toBe(false);
    expect(getTableColumns(usageLog).outputTokens.notNull).toBe(false);
  });

  it('usageLog table has an index on userId', () => {
    const indexes = getTableConfig(usageLog).indexes;
    expect(
      indexes.some((idx) => idx.config.columns.some((c) => 'name' in c && c.name === 'userId')),
    ).toBe(true);
  });
});
