import { describe, it, expect } from 'vitest';
import { handlers, auth, signIn, signOut } from '@/auth';

describe('auth config', () => {
  it('exports handlers with GET and POST route functions', () => {
    expect(typeof handlers.GET).toBe('function');
    expect(typeof handlers.POST).toBe('function');
  });

  it('exports auth, signIn, and signOut as functions', () => {
    expect(typeof auth).toBe('function');
    expect(typeof signIn).toBe('function');
    expect(typeof signOut).toBe('function');
  });
});
