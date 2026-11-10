import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2020',
    sourcemap: false,
    // MapLibre (~220 KB gzip) se carga bajo demanda solo en tema oscuro
    chunkSizeWarningLimit: 900,
  },
});
