/**
 * Copia las fuentes self-hosted (Fontsource, licencia OFL) a public/fonts/ con
 * nombres estables, para poder precargarlas con <link rel="preload">.
 *
 *   npm run fonts      (después de actualizar @fontsource-variable/*)
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve('public/fonts');
mkdirSync(OUT, { recursive: true });

const FILES: [from: string, to: string][] = [
  ['node_modules/@fontsource-variable/chivo/files/chivo-latin-wght-normal.woff2', 'chivo-latin-wght.woff2'],
  ['node_modules/@fontsource-variable/chivo-mono/files/chivo-mono-latin-wght-normal.woff2', 'chivo-mono-latin-wght.woff2'],
  ['node_modules/@fontsource-variable/chivo/LICENSE', 'OFL-chivo.txt'],
  ['node_modules/@fontsource-variable/chivo-mono/LICENSE', 'OFL-chivo-mono.txt'],
];

for (const [from, to] of FILES) {
  copyFileSync(resolve(from), resolve(OUT, to));
  console.log(`✓ public/fonts/${to}`);
}
