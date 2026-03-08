import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: '/kaoshi/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
