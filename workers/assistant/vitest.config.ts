// Standalone config — without this, vitest walks up and picks the repo root's
// vite config (whose setup is scoped to the frontend, not this worker).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'eval/**/*.test.ts'],
    environment: 'node',
  },
});
