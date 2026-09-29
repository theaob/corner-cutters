import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    // three.js alone is ~560 kB minified; don't warn about it.
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
