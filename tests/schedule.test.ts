import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  decodeEntry,
  encodeEntry,
  entryForDay,
  extendSchedule,
  pickNoRepeat,
  type ScheduleFile,
} from '../src/shared/schedule';
import { MICRO_EPOCH, MICRO_SALT, answerPool, generateMicroDay, microDayIndex } from '../src/micro/game/daily';
import { historicRoutes } from '../src/micro/game/historic';
import type { RouteData, RoutesFile } from '../src/micro/types';

const SALT = 'test-salt';
const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(2, '0')}`);

function gen(pool: string[], today: number, prev: ScheduleFile | null, horizon = 59 - today) {
  return extendSchedule({
    prev,
    game: 'test',
    epoch: '2026-01-01',
    salt: SALT,
    today,
    horizon,
    generate: (_d, ctx) => [pickNoRepeat([...pool].sort(), ctx.history, ctx.rng)],
    generatedOn: 'test',
  }).file;
}

const decodeAll = (f: ScheduleFile) => f.days.map((t, d) => decodeEntry(t, d, SALT)[0]);

// ---------------------------------------------------------------------------
test('días 1 a 60: agregar 10 ítems no cambia los días ya generados hasta hoy', () => {
  const TODAY = 30; // día 31 de 60
  const base = ids('A', 40);
  const v1 = gen(base, TODAY, null);
  assert.equal(v1.days.length, 60, 'se generan los días 1 a 60 (índices 0..59)');
  assert.equal(v1.frozenThrough, TODAY + 1, 'se congela hasta mañana');

  const extra = ids('NEW', 10);
  const v2 = gen([...base, ...extra], TODAY, v1);

  const before = decodeAll(v1);
  const after = decodeAll(v2);
  for (let d = 0; d <= TODAY + 1; d++) {
    assert.equal(v2.days[d], v1.days[d], `token del día ${d} intacto`);
    assert.equal(after[d], before[d], `respuesta del día ${d} intacta`);
  }
  const newInFrozen = after.slice(0, TODAY + 2).filter((x) => extra.includes(x));
  assert.deepEqual(newInFrozen, [], 'ningún ítem nuevo aparece en días congelados');
  const newInFuture = after.slice(TODAY + 2).filter((x) => extra.includes(x));
  assert.ok(newInFuture.length > 0, 'los ítems nuevos sí entran en días futuros');

  console.log(
    `  días congelados 0..${TODAY + 1} idénticos (${TODAY + 2}/${TODAY + 2}); ` +
      `${newInFuture.length} apariciones de ítems nuevos en los ${60 - TODAY - 2} días futuros`,
  );
});

test('quitar ítems tampoco cambia días congelados (aunque apunten a ítems quitados)', () => {
  const TODAY = 30;
  const base = ids('A', 40);
  const v1 = gen(base, TODAY, null);
  const removed = decodeAll(v1).slice(0, TODAY + 2).slice(0, 10);
  const v2 = gen(base.filter((x) => !removed.includes(x)), TODAY, v1);
  for (let d = 0; d <= TODAY + 1; d++) assert.equal(v2.days[d], v1.days[d], `día ${d}`);
  const future = decodeAll(v2).slice(TODAY + 2);
  assert.ok(future.every((x) => !removed.includes(x)), 'los ítems quitados no vuelven en el futuro');
});

test('al avanzar el tiempo, lo congelado se mantiene y se congela un día más', () => {
  const v1 = gen(ids('A', 40), 30, null);
  const v2 = gen([...ids('A', 40), ...ids('NEW', 10)], 31, v1, 28);
  for (let d = 0; d <= 31; d++) assert.equal(v2.days[d], v1.days[d], `día ${d}`);
  assert.equal(v2.frozenThrough, 32);
});

test('si el reloj está atrasado, nunca se descongela un día', () => {
  const v1 = gen(ids('A', 40), 30, null);
  const v2 = gen([...ids('A', 40), ...ids('NEW', 10)], 10, v1, 49);
  assert.equal(v2.frozenThrough, 31);
  for (let d = 0; d <= 31; d++) assert.equal(v2.days[d], v1.days[d], `día ${d}`);
});

test('cambiar el epoch se rechaza (rompería días publicados)', () => {
  const v1 = gen(ids('A', 40), 30, null);
  assert.throws(() =>
    extendSchedule({
      prev: v1,
      game: 'test',
      epoch: '2026-02-01',
      salt: SALT,
      today: 30,
      generate: () => ['x'],
      generatedOn: 'test',
    }),
  );
});

test('no se repite un ítem hasta agotar la lista', () => {
  const pool = ids('A', 25);
  const f = gen(pool, 0, null, 74);
  const all = decodeAll(f);
  for (let c = 0; c < 3; c++) {
    const cycle = all.slice(c * 25, c * 25 + 25);
    assert.equal(new Set(cycle).size, 25, `ciclo ${c + 1} sin repetidos`);
  }
});

test('ofuscación: ida y vuelta, sin ids en texto plano', () => {
  const tok = encodeEntry(['B04', 'X12'], 7, SALT);
  assert.deepEqual(decodeEntry(tok, 7, SALT), ['B04', 'X12']);
  assert.ok(!tok.includes('B04'));
  assert.notEqual(encodeEntry(['B04'], 1, SALT), encodeEntry(['B04'], 2, SALT), 'mismo id, token distinto por día');
});

// ---------------------------------------------------------------------------
// Datos reales de Microdle
const routes: RoutesFile = JSON.parse(readFileSync('public/micro/routes.json', 'utf8'));
const micro: ScheduleFile = JSON.parse(readFileSync('public/micro/schedule.json', 'utf8'));

test('Microdle: días publicados con el algoritmo anterior se conservan', () => {
  const published = ['E10', 'G27', 'B04', 'J20']; // 2026-11-09 … 2026-11-12
  published.forEach((id, d) => assert.equal(entryForDay(micro, d, MICRO_SALT)?.[0], id, `día ${d}`));
});

test('Microdle: agregar 10 recorridos al GTFS no cambia los días congelados', () => {
  const today = microDayIndex();
  const fake: RouteData[] = ids('Z', 10).map((id) => ({ ...routes.routes[0], id, elegible: true }));
  const pool = answerPool([...routes.routes, ...fake]);
  const next = extendSchedule({
    prev: micro,
    game: 'micro',
    epoch: MICRO_EPOCH,
    salt: MICRO_SALT,
    today,
    generate: generateMicroDay(pool),
    generatedOn: 'test',
  }).file;
  for (let d = 0; d <= micro.frozenThrough; d++) {
    assert.equal(next.days[d], micro.days[d], `día ${d} intacto`);
  }
  const frozenIds = Array.from({ length: micro.frozenThrough + 1 }, (_, d) => entryForDay(next, d, MICRO_SALT)![0]);
  assert.ok(frozenIds.every((id) => !id.startsWith('Z')));
});

test('Microdle: primer ciclo sin repetidos (incluye los días migrados)', () => {
  const n = answerPool(routes.routes).length;
  const first = Array.from({ length: n }, (_, d) => entryForDay(micro, d, MICRO_SALT)![0]);
  assert.equal(new Set(first).size, n);
});

test('Microdle: un recorrido que desaparece del GTFS se conserva con su shape histórico', () => {
  const today = microDayIndex();
  const answerToday = entryForDay(micro, today, MICRO_SALT)![0];
  const original = routes.routes.find((r) => r.id === answerToday)!;
  const gtfsNuevo = routes.routes.filter((r) => r.id !== answerToday);
  const kept = historicRoutes(routes.routes, gtfsNuevo, micro, today);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].id, answerToday);
  assert.equal(kept[0].shape, original.shape, 'mismo shape');
  assert.equal(kept[0].historico, true);
  assert.equal(kept[0].elegible, false, 'no vuelve a salir como respuesta futura');
});
