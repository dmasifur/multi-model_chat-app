import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // Env vars come from `bun --env-file=.env.test` (see package.json's test
    // script), not from loading a file here, so the test process never has
    // the real .env's secrets in scope regardless of what's on disk.
    server: {
      deps: {
        inline: ['next-auth', '@auth/drizzle-adapter', 'next'],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['app/**', 'lib/**', 'components/**'],
      exclude: ['**/__tests__/**', '**/*.test.{ts,tsx}', 'lib/test/**'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      'server-only': resolve(__dirname, 'lib/test/server-only-stub.ts'),
    },
  },
});
