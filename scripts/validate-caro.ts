/**
 * Valida data/caro.json y publica SOLO los ítems verificados en public/caro/items.json.
 * Corre antes de cada build (prebuild). Falla si un ítem verificado está incompleto.
 *
 *   npm run caro         (validar + regenerar schedule de Caro)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { validateCaro } from '../src/caro/validate';
import { santiagoISO } from '../src/shared/time';

const SRC = resolve('data/caro.json');
const OUT = resolve('public/caro/items.json');
const CREDITS = resolve('data/caro-images.json');

let source: unknown;
try {
  source = JSON.parse(readFileSync(SRC, 'utf8'));
} catch (e) {
  console.error(`✖ No se pudo leer ${SRC}: ${(e as Error).message}`);
  process.exit(1);
}

const today = santiagoISO();
const { errors, warnings, published, excluded } = validateCaro(source, today);

// Fotos de fondo: cada "imagen" debe tener su archivo y su crédito (autor + licencia)
let allCredits: Record<string, { autor: string; licencia: string; url: string }> = {};
try {
  allCredits = JSON.parse(readFileSync(CREDITS, 'utf8'));
} catch {
  /* sin fotos */
}
const creditos: typeof allCredits = {};
for (const it of published) {
  if (!it.imagen) continue;
  const c = allCredits[it.imagen];
  if (!c || !existsSync(resolve(`public/caro/img/${it.imagen}.webp`))) {
    errors.push(`${it.id}: la imagen "${it.imagen}" no tiene archivo en public/caro/img o crédito en data/caro-images.json`);
    continue;
  }
  creditos[it.imagen] = { autor: c.autor, licencia: c.licencia, url: c.url };
}

for (const w of warnings) console.warn(`⚠ ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`✖ ${e}`);
  console.error(`✖ data/caro.json tiene ${errors.length} error(es). No se publica nada.`);
  process.exit(1);
}

mkdirSync(dirname(OUT), { recursive: true });
const json = JSON.stringify({ generado: today, items: published, creditos });
// Solo reescribe si cambió (evita diffs con la fecha cuando los ítems son iguales)
let prev = '';
try {
  prev = readFileSync(OUT, 'utf8');
} catch {
  /* primera vez */
}
const body = (f: { items?: unknown; creditos?: unknown }) => JSON.stringify([f.items, f.creditos ?? {}]);
const sameItems = prev && body(JSON.parse(prev)) === body({ items: published, creditos });
if (!sameItems) writeFileSync(OUT, json);
console.log(
  `✓ caro: ${published.length} ítems verificados publicados · ${excluded} sin verificar (excluidos)` +
    (warnings.length ? ` · ${warnings.length} aviso(s)` : ''),
);
