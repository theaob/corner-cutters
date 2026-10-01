// The track designer on its own (designer.html): `npm run designer` serves it, `npm run designer:build`
// builds it into dist-designer/, with the game beside it (its DRIVE IT button opens the game on the draft).
// The game's own build (index.html alone) never includes the designer.
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist-designer',
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: { designer: 'designer.html', game: 'index.html' } },
  },
});
