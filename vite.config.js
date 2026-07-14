import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 4175,
    strictPort: true,
  },
  build: {
    target: 'es2019',
    assetsInlineLimit: 0,
  },
});
