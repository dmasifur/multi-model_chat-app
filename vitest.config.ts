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
  },
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
});
