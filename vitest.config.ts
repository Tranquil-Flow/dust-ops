import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Root-level vitest config for running tests from the monorepo root.
 * The app's source lives in packages/app/src, so the `@` alias must point there.
 * Run with: node node_modules/vitest/vitest.mjs run --pool=vmForks
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./packages/app/src/__tests__/setup.ts'],
    include: ['packages/app/src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'packages/app/.next'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './packages/app/src'),
    },
  },
});
