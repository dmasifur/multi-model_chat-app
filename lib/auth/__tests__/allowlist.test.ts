import { describe, it, expect, afterEach, vi } from 'vitest';
import { isEmailAllowed } from '@/lib/auth/allowlist';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isEmailAllowed', () => {
  it('denies sign-in when neither allowlist env var is set', () => {
    vi.stubEnv('ALLOWED_EMAILS', '');
    vi.stubEnv('ALLOWED_EMAIL_DOMAINS', '');
    expect(isEmailAllowed('anyone@example.com')).toBe(false);
  });

  it('denies a null or undefined email', () => {
    vi.stubEnv('ALLOWED_EMAILS', 'a@example.com');
    expect(isEmailAllowed(null)).toBe(false);
    expect(isEmailAllowed(undefined)).toBe(false);
  });

  it('allows an email in the ALLOWED_EMAILS list', () => {
    vi.stubEnv('ALLOWED_EMAILS', 'owner@example.com, teammate@example.com');
    expect(isEmailAllowed('owner@example.com')).toBe(true);
    expect(isEmailAllowed('teammate@example.com')).toBe(true);
  });

  it('is case-insensitive when matching ALLOWED_EMAILS', () => {
    vi.stubEnv('ALLOWED_EMAILS', 'Owner@Example.com');
    expect(isEmailAllowed('owner@example.com')).toBe(true);
  });

  it('denies an email not on the ALLOWED_EMAILS list', () => {
    vi.stubEnv('ALLOWED_EMAILS', 'owner@example.com');
    expect(isEmailAllowed('stranger@example.com')).toBe(false);
  });

  it('allows an email whose domain is in ALLOWED_EMAIL_DOMAINS', () => {
    vi.stubEnv('ALLOWED_EMAIL_DOMAINS', 'example.com');
    expect(isEmailAllowed('anyone@example.com')).toBe(true);
  });

  it('denies an email whose domain is not in ALLOWED_EMAIL_DOMAINS', () => {
    vi.stubEnv('ALLOWED_EMAIL_DOMAINS', 'example.com');
    expect(isEmailAllowed('anyone@other.com')).toBe(false);
  });
});
