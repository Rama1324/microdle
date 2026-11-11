/**
 * Los días que producción publicó con el algoritmo anterior al schedule
 * (2026-11-09 → hoy, más mañana por seguridad) deben ser IDÉNTICOS en el
 * schedule nuevo. La lista de recorridos se fija con un snapshot de lo que
 * servía producción (tests/fixtures/legacy-prod-routes.json), así el test sigue
 * siendo válido aunque después se actualice el GTFS.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { entryForDay, type ScheduleFile } from '../src/shared/schedule';
import { legacyAnswerForDay, MICRO_LEGACY_UNTIL } from '../src/micro/game/legacy';
import { MICRO_SALT, microDayIndex } from '../src/micro/game/daily';
import { dateForDay } from '../src/shared/time';
import type { RouteData } from '../src/micro/types';

const fixture = JSON.parse(readFileSync('tests/fixtures/legacy-prod-routes.json', 'utf8')) as {
  routes: Pick<RouteData, 'id' | 'elegible'>[];
};
const schedule: ScheduleFile = JSON.parse(readFileSync('public/micro/schedule.json', 'utf8'));
const prodRoutes = fixture.routes as RouteData[];

test('cada día publicado con el algoritmo viejo es idéntico en el schedule nuevo', () => {
  const rows: string[] = [];
  for (let d = 0; d <= MICRO_LEGACY_UNTIL; d++) {
    const viejo = legacyAnswerForDay(prodRoutes, d);
    const nuevo = entryForDay(schedule, d, MICRO_SALT)?.[0];
    assert.equal(nuevo, viejo, `día ${d} (${dateForDay('2026-11-09', d)})`);
    rows.push(`${dateForDay('2026-11-09', d)} #${d + 1}: ${viejo} = ${nuevo}`);
  }
  console.log('  ' + rows.join('\n  '));
});

test('los días heredados están congelados en el schedule', () => {
  assert.ok(schedule.frozenThrough >= MICRO_LEGACY_UNTIL, `frozenThrough=${schedule.frozenThrough}`);
});

test('el corte heredado cubre al menos hasta hoy', () => {
  // Si este test falla, el despliegue se atrasó: hay que subir MICRO_LEGACY_UNTIL
  // hasta el último día que corrió la versión vieja y regenerar el schedule.
  assert.ok(
    MICRO_LEGACY_UNTIL >= Math.min(microDayIndex(), 3),
    'MICRO_LEGACY_UNTIL no cubre los días ya publicados por la versión anterior',
  );
});
