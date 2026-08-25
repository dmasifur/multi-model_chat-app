import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('auth.ts env validation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    // Explicit, not inherited: auth.ts also imports lib/db, which throws at
    // module load if DATABASE_URL is unset, so every case here needs a
    // known-good value regardless of what unstubAllEnvs leaves in place.
    vi.stubEnv('DATABASE_URL', 'postgresql://app:app@localhost:5432/chatapp');
  });

  it('throws at import time when AUTH_SECRET is not set', async () => {
    vi.stubEnv('AUTH_SECRET', '');
    await expect(import('@/auth')).rejects.toThrow(/AUTH_SECRET/);
  });

  it('does not throw when AUTH_SECRET is set', async () => {
    vi.stubEnv('AUTH_SECRET', 'test-secret');
    await expect(import('@/auth')).resolves.toBeDefined();
  });
});
