/**
 * Corre después del build (postbuild). Falla si en dist/ quedó algún placeholder
 * de configuración sin reemplazar (%SITE_…%) o el nombre de ejemplo del hub.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { HUB } from '../src/shared/config';

const BAD = [/%SITE_[A-Z_]+%/, /%HUB_[A-Z_]+%/, /HUB_NAME/, /<!-- theme-script -->/];
let failed = false;

const name: string = HUB.name;
if (!name || name === 'HUB_NAME') {
  console.error('✖ config.ts: HUB.name sigue siendo un placeholder');
  failed = true;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

for (const file of walk('dist').filter((f) => /\.(html|js|css|json|webmanifest)$/.test(f))) {
  const txt = readFileSync(file, 'utf8');
  for (const re of BAD) {
    const m = txt.match(re);
    if (m) {
      console.error(`✖ ${file}: placeholder sin reemplazar "${m[0]}"`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log(`✓ dist sin placeholders (${HUB.name} · ${HUB.domain})`);
