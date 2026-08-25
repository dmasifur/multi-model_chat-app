import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    env: loadEnv('', process.cwd(), ''),
    server: {
      deps: {
        inline: ['next-auth', '@auth/drizzle-adapter', 'next'],
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      'server-only': resolve(__dirname, 'lib/test/server-only-stub.ts'),
    },
  },
});
