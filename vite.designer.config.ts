// The track designer on its own (designer.html): `npm run designer` serves it, `npm run designer:build`
// builds it into dist-designer/. The game's own build (index.html) never includes it.
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist-designer',
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: 'designer.html' },
  },
});
