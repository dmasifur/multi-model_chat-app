import { describe, it, expect } from 'vitest';
import { isPublicPath } from '@/lib/auth/is-public-path';

describe('isPublicPath', () => {
  it('treats the sign-in page as public', () => {
    expect(isPublicPath('/sign-in')).toBe(true);
  });

  it('treats all auth API routes as public', () => {
    expect(isPublicPath('/api/auth/callback/github')).toBe(true);
    expect(isPublicPath('/api/auth/signin')).toBe(true);
  });

  it('treats the home page and other app routes as protected', () => {
    expect(isPublicPath('/')).toBe(false);
    expect(isPublicPath('/chat')).toBe(false);
  });

  it('does not treat a route that merely starts with /api/auth as public', () => {
    expect(isPublicPath('/api/authors')).toBe(false);
    expect(isPublicPath('/api/auth-admin')).toBe(false);
  });

  it('still treats the bare /api/auth path as public', () => {
    expect(isPublicPath('/api/auth')).toBe(true);
  });
});
