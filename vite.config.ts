import { defineConfig } from 'vitest/config';
import { version } from './package.json';

export default defineConfig({
  base: './',
  // the build's version, for the play stats: the package's and the commit's (on CI)
  define: { __APP_VERSION__: JSON.stringify(`${version}+${(process.env.GITHUB_SHA ?? 'local').slice(0, 7)}`) },
  build: {
    // three.js alone is ~560 kB minified; don't warn about it.
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // (the tests never reach the real backend, whatever the environment's keys: CI's builds have them)
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  },
});
