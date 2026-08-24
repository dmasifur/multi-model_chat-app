import { describe, it, expect } from 'vitest';
import { greet } from '@/lib/smoke';

describe('smoke', () => {
  it('greets', () => {
    expect(greet('world')).toBe('hello, world');
  });
});
