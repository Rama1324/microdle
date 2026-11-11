/**
 * Corre antes de cada build (prebuild). Falla si:
 *  - falta el schedule de un juego o no cubre al menos MIN_DAYS días desde hoy,
 *  - un día congelado apunta a un ítem que ya no está en los datos publicados.
 * Avisa (sin fallar) si quedan menos de WARN_DAYS días cubiertos.
 *
 * NO regenera nada: el schedule se genera con `npm run schedule` y se commitea.
 */
import { existsSync, readFileSync } from 'node:fs';
import { entryForDay, type ScheduleFile } from '../src/shared/schedule';
import { MICRO_SALT, microDayIndex } from '../src/micro/game/daily';
import type { RoutesFile } from '../src/micro/types';

const MIN_DAYS = 14;
const WARN_DAYS = 60;
let failed = false;

const fail = (msg: string) => {
  console.error(`✖ ${msg}`);
  failed = true;
};

function checkMicro() {
  const sPath = 'public/micro/schedule.json';
  const rPath = 'public/micro/routes.json';
  if (!existsSync(sPath)) return fail(`Falta ${sPath}. Corre "npm run schedule".`);
  const s: ScheduleFile = JSON.parse(readFileSync(sPath, 'utf8'));
  const routes: RoutesFile = JSON.parse(readFileSync(rPath, 'utf8'));
  const ids = new Set(routes.routes.map((r) => r.id));
  const today = microDayIndex();
  const left = s.days.length - 1 - today;
  if (left < MIN_DAYS) fail(`micro: el schedule solo cubre ${left} días desde hoy (mínimo ${MIN_DAYS}). Corre "npm run schedule".`);
  else if (left < WARN_DAYS) console.warn(`⚠ micro: quedan ${left} días de schedule. Corre "npm run schedule" pronto.`);
  // Todo día congelado debe poder jugarse con los datos publicados
  for (let d = 0; d <= Math.min(s.frozenThrough, s.days.length - 1); d++) {
    for (const id of entryForDay(s, d, MICRO_SALT) ?? []) {
      if (!ids.has(id)) fail(`micro: el día ${d} usa "${id}", que no está en routes.json (¿se perdió un histórico?)`);
    }
  }
  if (!failed) console.log(`✓ micro: schedule OK (${left} días por delante, congelado hasta el día ${s.frozenThrough})`);
}

checkMicro();
if (failed) process.exit(1);
