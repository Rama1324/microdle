/**
 * Valida data/caro.json y publica SOLO los ítems verificados en public/caro/items.json.
 * Corre antes de cada build (prebuild). Falla si un ítem verificado está incompleto.
 *
 *   npm run caro         (validar + regenerar schedule de Caro)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { validateCaro } from '../src/caro/validate';
import { santiagoISO } from '../src/shared/time';

const SRC = resolve('data/caro.json');
const OUT = resolve('public/caro/items.json');

let source: unknown;
try {
  source = JSON.parse(readFileSync(SRC, 'utf8'));
} catch (e) {
  console.error(`✖ No se pudo leer ${SRC}: ${(e as Error).message}`);
  process.exit(1);
}

const today = santiagoISO();
const { errors, warnings, published, excluded } = validateCaro(source, today);

for (const w of warnings) console.warn(`⚠ ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`✖ ${e}`);
  console.error(`✖ data/caro.json tiene ${errors.length} error(es). No se publica nada.`);
  process.exit(1);
}

mkdirSync(dirname(OUT), { recursive: true });
const json = JSON.stringify({ generado: today, items: published });
// Solo reescribe si cambió (evita diffs con la fecha cuando los ítems son iguales)
let prev = '';
try {
  prev = readFileSync(OUT, 'utf8');
} catch {
  /* primera vez */
}
const sameItems = prev && JSON.stringify(JSON.parse(prev).items) === JSON.stringify(published);
if (!sameItems) writeFileSync(OUT, json);
console.log(
  `✓ caro: ${published.length} ítems verificados publicados · ${excluded} sin verificar (excluidos)` +
    (warnings.length ? ` · ${warnings.length} aviso(s)` : ''),
);
