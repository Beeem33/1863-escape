import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the production build can be hosted from any sub-path (e.g. GitHub Pages).
  base: './',
  server: {
    host: true,
    port: 8187,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
});
