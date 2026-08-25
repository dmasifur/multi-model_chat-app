import { describe, it, expect } from 'vitest';
import { proxyHandler } from '@/lib/auth/proxy-handler';

function requestTo(pathname: string, { authed }: { authed: boolean }) {
  return {
    auth: authed ? { user: { id: 'user-1' } } : null,
    nextUrl: new URL(`http://localhost${pathname}`),
  };
}

describe('proxyHandler', () => {
  it('redirects an unauthenticated request to a private path to /sign-in', () => {
    const response = proxyHandler(requestTo('/c/some-id', { authed: false }));
    expect(response?.status).toBe(307);
    expect(response?.headers.get('location')).toBe('http://localhost/sign-in');
  });

  it('does not redirect an authenticated request to a private path', () => {
    const response = proxyHandler(requestTo('/c/some-id', { authed: true }));
    expect(response).toBeUndefined();
  });

  it('does not redirect an unauthenticated request to a public path', () => {
    const response = proxyHandler(requestTo('/sign-in', { authed: false }));
    expect(response).toBeUndefined();
  });

  it('does not redirect an unauthenticated request under /api/auth', () => {
    const response = proxyHandler(requestTo('/api/auth/session', { authed: false }));
    expect(response).toBeUndefined();
  });
});
