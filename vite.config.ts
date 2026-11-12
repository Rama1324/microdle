import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'node:path';
import { HUB, SITE_URL } from './src/shared/config';
import { THEME_INLINE_SCRIPT } from './src/shared/theme-inline';

/**
 * Inyecta la config central en todos los HTML:
 *   %SITE_NAME% %SITE_DOMAIN% %SITE_DESCRIPTION% %SITE_URL%
 *   <!-- theme-script -->  → script de tema antes de pintar
 */
function hubHtml(): Plugin {
  return {
    name: 'hub-html',
    transformIndexHtml(html) {
      return html
        .replaceAll('%SITE_NAME%', HUB.name)
        .replaceAll('%SITE_DOMAIN%', HUB.domain)
        .replaceAll('%SITE_DESCRIPTION%', HUB.description)
        .replaceAll('%SITE_URL%', SITE_URL)
        .replace('<!-- theme-script -->', `<script>${THEME_INLINE_SCRIPT}</script>`);
    },
  };
}

export default defineConfig({
  plugins: [hubHtml()],
  build: {
    target: 'es2020',
    sourcemap: false,
    // MapLibre (~220 KB gzip) se carga bajo demanda solo en el tema oscuro de Microdle (nunca en / ni /caro)
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        hub: resolve(__dirname, 'index.html'),
        micro: resolve(__dirname, 'micro/index.html'),
        caro: resolve(__dirname, 'caro/index.html'),
      },
    },
  },
});
