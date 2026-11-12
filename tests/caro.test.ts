import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  absurdPhrase,
  buildCaroShare,
  buildChain,
  CARO_EPOCH,
  CARO_SALT,
  decodeRef,
  farEnough,
  formatCLP,
  generateCaroDay,
  isCorrect,
  nextInfinite,
  pricedPool,
} from '../src/caro/game';
import { validateCaro } from '../src/caro/validate';
import { entryForDay, extendSchedule, type ScheduleFile } from '../src/shared/schedule';
import { mulberry32 } from '../src/shared/rng';
import { dayIndex } from '../src/shared/time';
import type { CaroItemsFile, PricedRef } from '../src/caro/types';

const items: CaroItemsFile = JSON.parse(readFileSync('public/caro/items.json', 'utf8'));
const schedule: ScheduleFile = JSON.parse(readFileSync('public/caro/schedule.json', 'utf8'));
const pool = pricedPool(items.items);

// ---------- reglas ----------
test('comparación: más caro / más barato y empates', () => {
  assert.equal(isCorrect(1000, 2000, 'higher'), true);
  assert.equal(isCorrect(1000, 2000, 'lower'), false);
  assert.equal(isCorrect(2000, 1000, 'lower'), true);
  assert.equal(isCorrect(1500, 1500, 'higher'), true, 'empate: cualquier respuesta vale');
  assert.equal(isCorrect(1500, 1500, 'lower'), true, 'empate: cualquier respuesta vale');
});

test('diferencia mínima de 10%', () => {
  assert.equal(farEnough(1000, 1100), true);
  assert.equal(farEnough(1000, 1099), false);
  assert.equal(farEnough(2090, 2190), false, 'marraqueta Jumbo vs Santa Isabel: muy parejos');
  assert.equal(farEnough(1500, 1500), false);
});

test('formato chileno de precios', () => {
  assert.equal(formatCLP(1299990), '$1.299.990');
  assert.equal(formatCLP(895), '$895');
  assert.equal(formatCLP(9468300), '$9.468.300');
});

test('comparación absurda', () => {
  assert.equal(
    absurdPhrase({ item: 'PS5', precio: 500000 }, { item: 'Big Mac', precio: 4000 }),
    'Con lo que cuesta PS5 te compras 125 × Big Mac.',
  );
  assert.equal(absurdPhrase({ item: 'A', precio: 1000 }, { item: 'B', precio: 1300 }), 'B cuesta un 30% más que A.');
  assert.match(absurdPhrase({ item: 'A', precio: 1000 }, { item: 'B', precio: 1000 }), /lo mismo/);
});

test('texto para compartir sin spoilers', () => {
  const t = buildCaroShare({ number: 15, results: [true, true, true, false, true, true, true, true, false, true] });
  assert.equal(t, '¿Qué sale más caro? #15 💸 8/10\n🟩🟩🟩🟥🟩🟩🟩🟩🟥🟩\nlaonce.cl/caro');
  for (const it of items.items) assert.ok(!t.includes(it.item), 'no incluye nombres de ítems');
});

// ---------- secuencias ----------
test('cadena diaria: 11 ítems distintos y cada par difiere ≥10%', () => {
  for (let seed = 0; seed < 200; seed++) {
    const c = buildChain(pool, 11, mulberry32(seed))!;
    assert.ok(c, `semilla ${seed}`);
    assert.equal(new Set(c.map((r) => r.id)).size, 11, 'sin repetidos');
    for (let i = 1; i < c.length; i++) assert.ok(farEnough(c[i - 1].precio, c[i].precio), `par ${i} con semilla ${seed}`);
  }
});

test('la dirección no es predecible: alternar ↑/↓ no es una estrategia ganadora', () => {
  let changes = 0;
  let pairs = 0;
  let up = 0;
  let steps = 0;
  for (let seed = 0; seed < 500; seed++) {
    const c = buildChain(pool, 11, mulberry32(seed))!;
    const dirs = c.slice(1).map((r, i) => r.precio > c[i].precio);
    dirs.forEach((d, i) => {
      steps++;
      if (d) up++;
      if (i > 0) {
        pairs++;
        if (d !== dirs[i - 1]) changes++;
      }
    });
  }
  const alterna = changes / pairs;
  const sube = up / steps;
  console.log(`  cambios de dirección: ${(alterna * 100).toFixed(1)}% · subidas: ${(sube * 100).toFixed(1)}%`);
  assert.ok(alterna < 0.62, `alternar acertaría ${(alterna * 100).toFixed(1)}% de las veces`);
  assert.ok(sube > 0.38 && sube < 0.62, `"siempre más caro" acertaría ${(sube * 100).toFixed(1)}%`);
});

test('cadena imposible → null (no inventa)', () => {
  const tiny: PricedRef[] = [
    { id: 'a', precio: 1000 },
    { id: 'b', precio: 1010 },
    { id: 'c', precio: 1020 },
  ];
  assert.equal(buildChain(tiny, 3, mulberry32(1)), null);
});

test('infinito: el siguiente siempre difiere ≥10% y no repite mientras haya opciones', () => {
  const rng = mulberry32(7);
  let cur = pool[0];
  const used = new Set([cur.id]);
  for (let i = 0; i < 25; i++) {
    const n = nextInfinite(pool, cur, used, rng)!;
    assert.ok(farEnough(cur.precio, n.precio));
    assert.ok(!used.has(n.id) || used.size >= pool.length - 5);
    used.add(n.id);
    cur = n;
  }
});

// ---------- schedule (datos reales) ----------
test('schedule de Caro: hoy existe y todos los días cumplen las reglas', () => {
  const today = dayIndex(CARO_EPOCH);
  const ids = new Set(items.items.map((i) => i.id));
  for (let d = 0; d <= today + 30; d++) {
    const refs = entryForDay(schedule, d, CARO_SALT)!.map(decodeRef);
    assert.equal(refs.length, 11, `día ${d}`);
    assert.equal(new Set(refs.map((r) => r.id)).size, 11, `día ${d} sin repetidos`);
    for (const r of refs) assert.ok(ids.has(r.id), `día ${d}: ${r.id} publicado`);
    for (let i = 1; i < refs.length; i++) assert.ok(farEnough(refs[i - 1].precio, refs[i].precio), `día ${d} par ${i}`);
  }
});

test('schedule de Caro: agregar 10 ítems o cambiar un precio no altera días congelados', () => {
  const today = dayIndex(CARO_EPOCH);
  const extra: PricedRef[] = Array.from({ length: 10 }, (_, i) => ({ id: `nuevo-${i}`, precio: 5000 * (i + 1) }));
  // además, un ítem cambia de precio
  const changed = pool.map((p, i) => (i === 0 ? { ...p, precio: p.precio * 3 } : p));
  const next = extendSchedule({
    prev: schedule,
    game: 'caro',
    epoch: CARO_EPOCH,
    salt: CARO_SALT,
    today,
    generate: generateCaroDay([...changed, ...extra].sort((a, b) => (a.id < b.id ? -1 : 1))),
    generatedOn: 'test',
  }).file;
  for (let d = 0; d <= schedule.frozenThrough; d++) {
    assert.equal(next.days[d], schedule.days[d], `día ${d} intacto (con su precio congelado)`);
  }
});

test('el precio de cada día queda congelado en el schedule', () => {
  const refs = entryForDay(schedule, 0, CARO_SALT)!.map(decodeRef);
  for (const r of refs) assert.ok(Number.isInteger(r.precio) && r.precio > 0);
});

// ---------- validador ----------
const base = {
  id: 'x',
  item: 'Algo',
  precio: 1000,
  unidad: 'CLP',
  categoria: 'Supermercado',
  fuente: 'Tienda',
  fuenteUrl: 'https://ejemplo.cl/x',
  fechaPrecio: '2026-11-01',
  imagen: '',
  verificado: true,
};

test('validador: un ítem verificado sin precio, fuente, url o fecha hace fallar', () => {
  for (const [campo, valor] of [
    ['precio', null],
    ['precio', 0],
    ['precio', 12.5],
    ['fuente', ''],
    ['fuenteUrl', 'no-es-url'],
    ['fechaPrecio', ''],
    ['fechaPrecio', '2026-02-30'],
  ] as const) {
    const r = validateCaro([{ ...base, [campo]: valor }], '2026-11-11');
    assert.equal(r.errors.length, 1, `${campo}=${valor}`);
    assert.equal(r.published.length, 0);
  }
});

test('validador: los no verificados se excluyen sin error', () => {
  const r = validateCaro([{ ...base, verificado: false, precio: null, fuente: '' }, { ...base, id: 'y' }], '2026-11-11');
  assert.deepEqual(r.errors, []);
  assert.equal(r.excluded, 1);
  assert.deepEqual(
    r.published.map((p) => p.id),
    ['y'],
  );
});

test('validador: avisa (sin fallar) si el precio tiene más de 12 meses', () => {
  const r = validateCaro([{ ...base, fechaPrecio: '2025-10-01' }], '2026-11-11');
  assert.equal(r.errors.length, 0);
  assert.equal(r.warnings.length, 1);
  assert.equal(r.published.length, 1);
});

test('validador: fecha futura e ids duplicados son error', () => {
  assert.equal(validateCaro([{ ...base, fechaPrecio: '2027-01-01' }], '2026-11-11').errors.length, 1);
  assert.equal(validateCaro([base, { ...base }], '2026-11-11').errors.length, 1);
});

test('validador: data/caro.json real pasa y publica exactamente items.json', () => {
  const src = JSON.parse(readFileSync('data/caro.json', 'utf8'));
  const r = validateCaro(src, items.generado);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.published, items.items);
});
