import { describe, it, expect, afterEach, vi } from 'vitest';
import { signInCallback, jwtCallback } from '@/lib/auth/callbacks';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('signInCallback', () => {
  it('allows a user whose email is on the allowlist', () => {
    vi.stubEnv('ALLOWED_EMAILS', 'owner@example.com');
    expect(signInCallback({ user: { email: 'owner@example.com' } })).toBe(true);
  });

  it('denies a user whose email is not on the allowlist', () => {
    vi.stubEnv('ALLOWED_EMAILS', 'owner@example.com');
    expect(signInCallback({ user: { email: 'stranger@example.com' } })).toBe(false);
  });
});

describe('jwtCallback', () => {
  it('records the id and email on first sign-in', () => {
    vi.stubEnv('ALLOWED_EMAILS', 'owner@example.com');
    const token = jwtCallback({
      token: {},
      user: { id: 'user-1', email: 'owner@example.com' },
    });
    expect(token).toMatchObject({ id: 'user-1', email: 'owner@example.com' });
  });

  it('keeps an existing token valid while its email is still allowed', () => {
    vi.stubEnv('ALLOWED_EMAILS', 'owner@example.com');
    const token = jwtCallback({ token: { id: 'user-1', email: 'owner@example.com' } });
    expect(token).not.toBeNull();
  });

  it('invalidates an existing token once its email is removed from the allowlist', () => {
    vi.stubEnv('ALLOWED_EMAILS', 'someone-else@example.com');
    const token = jwtCallback({ token: { id: 'user-1', email: 'owner@example.com' } });
    expect(token).toBeNull();
  });

  it('invalidates an existing token when the allowlist is cleared entirely', () => {
    vi.stubEnv('ALLOWED_EMAILS', '');
    vi.stubEnv('ALLOWED_EMAIL_DOMAINS', '');
    const token = jwtCallback({ token: { id: 'user-1', email: 'owner@example.com' } });
    expect(token).toBeNull();
  });

  it('invalidates a token that carries no email at all', () => {
    vi.stubEnv('ALLOWED_EMAILS', 'owner@example.com');
    const token = jwtCallback({ token: { id: 'user-1' } });
    expect(token).toBeNull();
  });
});
