import { describe, it, expect } from 'vitest';
import { GET, POST } from '@/app/api/auth/[...nextauth]/route';

describe('auth route handler', () => {
  it('re-exports GET and POST from the auth handlers', () => {
    expect(typeof GET).toBe('function');
    expect(typeof POST).toBe('function');
  });
});
